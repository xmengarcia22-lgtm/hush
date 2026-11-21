// Message timers are the server's business too (SPEC.md 5.7): in a chat with a `ttl` a sealed message must carry an `exp`
// of at most max(ts, server time) + ttl, with a minute's allowance. The page sets ts + ttl for a message and the server's
// time + ttl for its hidden wake tickets, which are dated before the chat's last message so nothing moves; `exp` is under the
// sender's signature, so the server refuses rather than rewrites. Service notes carry no exp; an edit may keep the stored
// time and expiry; a chat without a timer is as before.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { startServer, signup, makeIdentity, groupDoc, createChat } from './helpers.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const post = (over = {}) => ({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha('t0'), on: 0, ...over });
const svc = () => ({ sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' });

let S, A, B;
before(async () => {
  S = await startServer({ authz: 'standard' });
  A = await signup(S.url, await makeIdentity('alice'));
  B = await signup(S.url, await makeIdentity('bob'));
});
after(async () => { await A.close(); await B.close(); await S.stop(); });

test('a chat with a message timer takes no sealed message without an expiry inside the timer; an edit keeps it or obeys it', async () => {
  const cid = 'gTimer0000001', { caps } = await createChat(A, cid, groupDoc({ ttl: 60 }));
  await B.ok('chat.open', { cid, cap: caps.m });
  const P = (id) => `channels/${cid}/posts/${id}`;
  assert.equal((await B.call('set', { p: P('pTimer000001'), d: post() })).e, 'invalid', 'no exp at all');
  assert.equal((await B.call('set', { p: P('pTimer000001'), d: post({ exp: 0 }) })).e, 'invalid', 'exp 0 would mean never');
  const ts = Date.now();
  assert.equal((await B.call('set', { p: P('pTimer000001'), d: post({ ts, exp: ts + 60000 + 61000 }) })).e, 'invalid', 'past the timer and the minute\'s allowance');
  await B.ok('set', { p: P('pTimer000001'), d: post({ ts, exp: ts + 60000 }) });
  await B.ok('set', { p: P('pTimer000002'), d: post({ ts, exp: ts + 1000 }) });   // sooner is fine
  await B.ok('set', { p: P('pTimer000003'), d: svc() });                           // a service note carries no exp
  await B.ok('update', { p: P('pTimer000001'), d: { d: 'bmV3', ot: 't0', on: 1, oh: sha('t1') } });   // an edit keeps ts and exp
  assert.equal((await B.call('update', { p: P('pTimer000001'), d: { exp: 0, ot: 't1', on: 2, oh: sha('t2') } })).e, 'invalid', 'an edit cannot make it stay');
  assert.equal((await B.call('update', { p: P('pTimer000001'), d: { exp: ts + 60000 + 61000, ot: 't1', on: 2, oh: sha('t2') } })).e, 'invalid', 'nor stretch it');
  await B.ok('update', { p: P('pTimer000001'), d: { exp: ts + 30000, ot: 't1', on: 2, oh: sha('t2') } });   // shortening is within the rule
  // A scheduled message sent early: its time moves to now, and the expiry must follow (the page recomputes it).
  const future = Date.now() + 3600e3;
  await B.ok('set', { p: P('pTimer000004'), d: post({ ts: future, exp: future + 60000 }) });
  assert.equal((await B.call('update', { p: P('pTimer000004'), d: { ts: Date.now(), ot: 't0', on: 1, oh: sha('t1') } })).e, 'invalid', 'the old expiry is now past the timer');
  const now = Date.now();
  await B.ok('update', { p: P('pTimer000004'), d: { ts: now, exp: now + 60000, ot: 't0', on: 1, oh: sha('t1') } });
});

test('the bound runs from the server\'s clock when a message is dated earlier: a hidden ticket dated before the last message lives ttl from now', async () => {
  const cid = 'gTimer0000003', { caps } = await createChat(A, cid, groupDoc({ ttl: 60 }));
  await B.ok('chat.open', { cid, cap: caps.m });
  const P = (id) => `channels/${cid}/posts/${id}`;
  const old = Date.now() - 3600e3, now = Date.now();
  await B.ok('set', { p: P('pQuiet000001'), d: post({ ts: old, exp: now + 60000 }) }, 'dated an hour back, expiring ttl from now: the quiet wake post');
  assert.equal((await B.call('set', { p: P('pQuiet000002'), d: post({ ts: old, exp: now + 60000 + 61000 }) })).e, 'invalid', 'a minute past now + ttl');
  await B.ok('set', { p: P('pQuiet000003'), d: post({ ts: old, exp: now - 1000 }) }, 'an expiry already past is within the bound: the sweep takes it');
  await B.ok('set', { p: P('pQuiet000004'), d: post({ ts: old, exp: old + 60000 }) }, 'ts + ttl, as a message dated back would carry');
  // a comment follows the same rule
  const C = (id) => `channels/${cid}/comments/${id}`;
  assert.equal((await B.call('set', { p: C('cQuiet000001'), d: post() })).e, 'invalid', 'a comment without exp');
  await B.ok('set', { p: C('cQuiet000001'), d: post({ ts: now, exp: now + 60000 }) });
});

test('without a timer any expiry stands, and a timer set later binds new messages only', async () => {
  const cid = 'gTimer0000002', { caps } = await createChat(A, cid, groupDoc());
  await B.ok('chat.open', { cid, cap: caps.m });
  const P = (id) => `channels/${cid}/posts/${id}`;
  await B.ok('set', { p: P('pFree0000001'), d: post() });
  await B.ok('set', { p: P('pFree0000002'), d: post({ exp: Date.now() + 365 * 86400e3 }) });
  await A.ok('update', { p: 'channels/' + cid, d: { ttl: 60 } });   // the owner turns a timer on
  assert.equal((await B.call('set', { p: P('pFree0000003'), d: post() })).e, 'invalid');
  await B.ok('update', { p: P('pFree0000001'), d: { d: 'bmV3', ot: 't0', on: 1, oh: sha('t1') } });   // the old message keeps its (absent) expiry
  assert.equal((await B.call('update', { p: P('pFree0000001'), d: { exp: Date.now() + 60000 + 61000, ot: 't1', on: 2, oh: sha('t2') } })).e, 'invalid', 'but a new expiry must obey the timer');
  await A.ok('update', { p: 'channels/' + cid, d: { ttl: 0 } });
  await B.ok('set', { p: P('pFree0000003'), d: post() }, 'timer off again');
});

// ---- release 91: a message that expires or is deleted takes its reactions, votes and comments; an expired `last` copy goes ----
const tag = (s) => s.padEnd(22, 'x');
const act = (pid, t, kind) => [`${pid}~${tag(t)}~${kind}`, { post: pid, kind, e: 0, iv: 'aXY=', ct: 'Y3Q=', ts: Date.now() }];
// A group where B posted `pids` (the first expiring at `exp`), each with a reaction, a vote and a comment by B. Returns paths.
async function sides(cid, pids, exp) {
  const { caps } = await createChat(A, cid, groupDoc());
  await B.ok('chat.open', { cid, cap: caps.m });
  const out = {};
  for (const [i, pid] of pids.entries()) {
    await B.ok('set', { p: `channels/${cid}/posts/${pid}`, d: post(i === 0 && exp ? { exp } : {}) });
    const acts = [act(pid, 'b' + i, 'react'), act(pid, 'b' + i, 'vote')];
    for (const [id, d] of acts) await B.ok('set', { p: `channels/${cid}/acts/${id}`, d });
    const com = 'c' + pid.slice(1);
    await B.ok('set', { p: `channels/${cid}/comments/${com}`, d: post({ post: pid }) });
    out[pid] = { acts: acts.map(([id]) => id), com };
  }
  return out;
}
const ids = async (X, p) => (await X.ok('query', { p, l: 100 })).docs.map((d) => d.id).sort();

test('release 91: the sweep takes an expired message with its reactions, votes and comments, and announces each', async () => {
  const cid = 'gSweepSides01', exp = Date.now() + 60_000;
  const s = await sides(cid, ['pSwept000001', 'pKept0000001'], exp);
  await A.ok('sub', { s: 'a', p: `channels/${cid}/acts`, l: 100 });
  await A.ok('sub', { s: 'c', p: `channels/${cid}/comments`, l: 100 });
  S.srv.sweep(exp - 1);   // what the tests above left to expire
  assert.deepEqual(await ids(A, `channels/${cid}/posts`), ['pKept0000001', 'pSwept000001'], 'nothing before its time');
  assert.equal(S.srv.sweep(exp + 1), 1, 'one expired row: its reactions and comment are not counted');
  assert.deepEqual(await ids(A, `channels/${cid}/posts`), ['pKept0000001']);
  assert.deepEqual(await ids(A, `channels/${cid}/acts`), [...s.pKept0000001.acts].sort(), 'the other message keeps its reaction and vote');
  assert.deepEqual(await ids(A, `channels/${cid}/comments`), [s.pKept0000001.com]);
  for (const id of s.pSwept000001.acts) await A.waitPush((f) => f.s === 'a' && f.t === 'del' && f.id === id);
  await A.waitPush((f) => f.s === 'c' && f.t === 'del' && f.id === s.pSwept000001.com);
});

test('release 91: deleting a message takes its reactions, votes and comments, whoever deletes it', async () => {
  const cid = 'gDeleteSides1', pids = ['pByAuthor001', 'pByAdmin0001', 'pWiped000001'];
  const s = await sides(cid, pids);
  await A.ok('sub', { s: 'a2', p: `channels/${cid}/acts`, l: 100 });
  await B.ok('delete', { p: `channels/${cid}/posts/pByAuthor001`, ot: 't0' });
  await A.ok('delete', { p: `channels/${cid}/posts/pByAdmin0001` });
  await B.ok('update', { p: `channels/${cid}/posts/pWiped000001`, d: { ot: 't0', on: 1, oh: '', d: '', n: '', del: true } });   // "delete for me": the wipe
  assert.equal((await ids(A, `channels/${cid}/acts`)).length, 2, 'a wiped message keeps its reactions until it is deleted');
  await B.ok('delete', { p: `channels/${cid}/posts/pWiped000001` });
  assert.deepEqual(await ids(A, `channels/${cid}/posts`), []);
  assert.deepEqual(await ids(A, `channels/${cid}/acts`), []);
  assert.deepEqual(await ids(A, `channels/${cid}/comments`), []);
  for (const pid of pids) for (const id of s[pid].acts) await A.waitPush((f) => f.s === 'a2' && f.t === 'del' && f.id === id);
});

test('release 91: the sweep clears a `last` copy once its own expiry has passed, also when its message was deleted early', async () => {
  const cid = 'gLastSweep001', cid2 = 'gLastSweep002', exp = Date.now() + 60_000;
  const { caps } = await createChat(A, cid, groupDoc());
  await createChat(A, cid2, groupDoc());
  await B.ok('chat.open', { cid, cap: caps.m });
  const last = (x) => ({ sl: 1, id: 'pLast0000001', ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', exp: x, edited: 0, from: null, iv: null, ct: null, sig: null });
  await B.ok('set', { p: `channels/${cid}/posts/pLast0000001`, d: post({ exp }) });
  await B.ok('update', { p: 'channels/' + cid, d: { last: last(exp) } });
  await B.ok('delete', { p: `channels/${cid}/posts/pLast0000001`, ot: 't0' });   // deleted before its time: the copy stays for now
  await A.ok('update', { p: 'channels/' + cid2, d: { last: last(exp + 3600e3) } });
  S.srv.sweep(exp - 1);
  assert.equal((await A.ok('get', { p: 'channels/' + cid })).d.last.exp, exp, 'the copy stays until its own time');
  await B.ok('sub', { s: 'r', p: 'channels', ids: [cid] });
  assert.equal(S.srv.sweep(exp + 1), 0, 'no expired message left, yet the copy goes');
  assert.equal((await A.ok('get', { p: 'channels/' + cid })).d.last, null);
  const f = await B.waitPush((x) => x.s === 'r' && x.t === 'set' && x.id === cid && x.d.last === null);
  assert.equal(f.d.type, 'group', 'the watcher gets the whole record, without the copy');
  assert.equal((await A.ok('get', { p: 'channels/' + cid2 })).d.last.exp, exp + 3600e3, 'a copy that expires later stays');
});

test('release 91: a message\'s comments are found through an index, not by reading every comment of its chat', () => {
  const plan = S.srv.store.db.prepare('EXPLAIN QUERY PLAN ' + S.srv.store.q.commentsOf.sourceSQL).all('channels/gX/comments', 'pX').map((r) => r.detail);
  assert.match(plan.join(' '), /USING INDEX docs_post \(parent=\? AND <expr>=\?\)/);
});

test('release 91: one sweep removes at most sweepSideMax reactions, votes and comments past its first message; the rest wait', async () => {
  const T = await startServer({ authz: 'standard', limits: { sweepSideMax: 5 } });
  const X = await signup(T.url, await makeIdentity('xena'));
  try {
    const cid = 'gSweepBudget1', exp = Date.now() + 60_000;
    await createChat(X, cid, groupDoc());
    for (const pid of ['pBudget00001', 'pBudget00002', 'pBudget00003']) {
      await X.ok('set', { p: `channels/${cid}/posts/${pid}`, d: post({ exp }) });
      for (const k of ['a', 'b', 'c', 'd']) { const [id, d] = act(pid, k, 'react'); await X.ok('set', { p: `channels/${cid}/acts/${id}`, d }); }
    }
    const left = async () => [(await ids(X, `channels/${cid}/posts`)).length, (await ids(X, `channels/${cid}/acts`)).length];
    assert.equal(T.srv.sweep(exp + 1), 1, 'a message and its 4 reactions fill the budget of 5');
    assert.deepEqual(await left(), [2, 8]);
    assert.equal(T.srv.sweep(exp + 1), 1);
    assert.equal(T.srv.sweep(exp + 1), 1);
    assert.deepEqual(await left(), [0, 0]);
    assert.equal(T.srv.sweep(exp + 1), 0);
  } finally { await X.close(); await T.stop(); }
});
