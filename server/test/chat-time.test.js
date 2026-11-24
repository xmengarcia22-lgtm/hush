// The two times on a chat record (release 113). A chat's `ts` orders the page's chat list and any member may write it; an honest
// page never writes one more than 3 seconds ahead of its own clock there. It was any finite number: one write of the year 2100 kept a chat first in
// every member's list for good. Now a `set`, an `update` or a new chat leaves no `ts` more than a minute past the server's clock:
// a later one is stored as the server's clock, and nothing is refused for its time (a refused update would fail an honest send
// from a phone whose clock is ahead, after its message was stored). The other time, `last.ts`, is the latest message's own time
// and is under its sender's signature, so it cannot be changed: a write that changes `last` is refused when that time is there
// and is not a number or is further ahead than a message's may be (400 days). What a record held before either rule stays until
// its next such write, and the record takes other writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startServer, signup, makeIdentity, createChat, groupDoc, dmDoc, cap, label, wrap, sealed, throwsCode, CAPS } from './helpers.js';
import { POST_TS_FUTURE_MS, MAX_BYTES } from '../src/schemas.js';
import { Store } from '../src/store.js';
import { byteLength } from '../src/merge.js';

const LIMIT = { timeout: 120_000 };   // a test that hangs fails, and the file still ends
const MIN = 60_000, DAY = 86_400_000, Y2100 = 4_102_444_800_000;
const b64 = (n) => randomBytes(Math.ceil(n * 3 / 4)).toString('base64').slice(0, n);
const cid = (c = 'g') => c + randomBytes(12).toString('hex').slice(0, 12);
const lastOf = (ts) => ({ sl: 1, id: 'm' + '0'.repeat(11) + '1', ts, e: 0, n: b64(16), d: b64(100), exp: 0, edited: 0, from: null, iv: null, ct: null, sig: null });   // ui.js, lastOf
// A frame as written, for a number JSON.stringify cannot say (1e999 parses to Infinity).
const raw = (c, body) => { const i = ++c.i; return new Promise((res) => { c.pending.set(i, res); c.ws.send(`{"i":${i},${body}}`); }); };

// A group, its owner and a plain member, with the real rules for who may write what.
async function world(T, n, doc = groupDoc()) {
  const owner = await signup(T.url, await makeIdentity('timeowner' + n)), g = cid(), p = 'channels/' + g;
  const { caps } = await createChat(owner, g, doc);
  const member = await signup(T.url, await makeIdentity('timemember' + n));
  await member.ok('chat.open', { cid: g, cap: caps.m });
  const db = T.srv.store.db;
  return {
    owner, member, g, p, caps,
    upd: async (d, who = member) => (await who.call('update', { p, d })).e || 'ok',
    rec: async () => (await owner.ok('get', { p })).d,
    row: () => { const r = db.prepare('SELECT d, ts FROM docs WHERE path = ?').get(p); return { d: JSON.parse(r.d), ts: Number(r.ts) }; },
    plant: (over) => { const d = { ...JSON.parse(db.prepare('SELECT d FROM docs WHERE path = ?').get(p).d), ...over }; db.prepare('UPDATE docs SET d = ?, ts = ? WHERE path = ?').run(JSON.stringify(d), d.ts, p); },
    end: async () => { await member.close(); await owner.close(); },
  };
}
// Runs a write and says whether the record's time afterwards is the server's clock at that write (and the stored column with it).
async function stamped(W, write) {
  const t0 = Date.now(), e = await write(), t1 = Date.now(), r = W.row();
  return { e, ts: r.d.ts, col: r.ts, server: r.d.ts >= t0 && r.d.ts <= t1 && r.ts === r.d.ts };
}

test('a set, an update and a new chat leave no chat time more than a minute past the server\'s clock: a member\'s update to three days ahead or to the year 2100, an admin\'s set and a new chat are all taken, and what is stored is the server\'s clock, which is also what a watcher of the record is sent', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const W = await world(T, 'one');
    await W.owner.ok('sub', { s: 1, p: 'channels', ids: [W.g] });
    await W.owner.waitPush((f) => f.s === 1 && f.t === 'init');
    const three = await stamped(W, () => W.upd({ ts: Date.now() + 3 * DAY }));
    assert.deepEqual([three.e, three.server], ['ok', true], `three days ahead: ${JSON.stringify(three)}`);
    const push = await W.owner.waitPush((f) => f.s === 1 && f.t === 'set' && f.id === W.g);
    assert.equal(push.d.ts, three.ts, 'a watcher is given the time as stored');
    const far = await stamped(W, () => W.upd({ ts: Y2100 }));
    assert.deepEqual([far.e, far.server], ['ok', true], `the year 2100: ${JSON.stringify(far)}`);
    const whole = await W.rec(), set = await stamped(W, async () => (await W.owner.call('set', { p: W.p, d: { ...whole, ts: Y2100 } })).e || 'ok');
    assert.deepEqual([set.e, set.server], ['ok', true], `an admin's set: ${JSON.stringify(set)}`);
    // A new chat: a group and a one-on-one chat made with the year 2100.
    for (const [id, doc, caps] of [[cid(), groupDoc({ ts: Y2100 }), undefined], [cid('d') + 'A'.repeat(10), dmDoc({ ts: Y2100 }), { m: cap() }]]) {
      const t0 = Date.now(); await createChat(W.owner, id, doc, caps); const t1 = Date.now();
      const r = T.srv.store.db.prepare('SELECT d, ts FROM docs WHERE path = ?').get('channels/' + id), ts = JSON.parse(r.d).ts;
      assert.ok(ts >= t0 && ts <= t1 && Number(r.ts) === ts, `a new ${doc.type} made with the year 2100 holds ${ts}`);
    }
    await W.end();
  } finally { await T.stop(); }
});

test('a time a page honestly writes is stored as sent: now, half a minute ahead, a week ago, 5 and 0; a time that is no finite number is refused as before; and a send from a phone three days ahead goes through whole, its message and the record\'s update', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const W = await world(T, 'two');
    for (const ts of [Date.now(), Date.now() + MIN / 2, Date.now() - 7 * DAY, 5, 0]) {
      assert.equal(await W.upd({ ts }), 'ok'); assert.equal(W.row().d.ts, ts, `${ts} is stored as sent`);
    }
    assert.equal((await raw(W.member, `"op":"update","p":"${W.p}","d":{"ts":1e999}`)).e, 'invalid', 'a time past every number');
    assert.equal(await W.upd({ ts: 'soon' }), 'invalid');
    // The page sends both frames at once (ui.js, sendBody): the message, dated by the phone, and the record's time and marker.
    const at = Date.now() + 3 * DAY, post = { sl: 1, ts: at, e: 0, n: b64(16), d: b64(200), oh: 'a'.repeat(64), on: 1 };
    const [put, rec] = await Promise.all([W.member.call('set', { p: W.p + '/posts/pOsT12345678', d: post }), stamped(W, () => W.upd({ ts: at, last: lastOf(at) }))]);
    assert.deepEqual([put.e || 'ok', rec.e, rec.server, W.row().d.last.ts], ['ok', 'ok', true, at], 'the message is stored, the update is taken, the chat\'s time is the server\'s and the marker keeps its message\'s time');
    await W.end();
  } finally { await T.stop(); }
});

test('a record that held the year 2100 from before takes every write and is refused none: a stopped poll, a key wrap, a key change; its time becomes the server\'s clock at its next set or update, whatever that write changes', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const W = await world(T, 'three');
    W.plant({ ts: Y2100 });
    assert.equal((await W.rec()).ts, Y2100, 'planted');
    // A key change carries the record over as it is: taken, and the time is not its to move.
    const r = await W.owner.call('chat.rotate', { cid: W.g, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(1) });
    assert.deepEqual([r.e || 'ok', W.row().d.ts], ['ok', Y2100], 'a key change');
    const poll = await stamped(W, () => W.upd({ closed: { ['m' + '0'.repeat(11) + '7']: true } }, W.owner));
    assert.deepEqual([poll.e, poll.server], ['ok', true], `a stopped poll on a record at 2100: ${JSON.stringify(poll)}`);
    W.plant({ ts: Y2100 });
    const wrapAdd = await stamped(W, () => W.upd({ keys: { 1: { [label()]: wrap() } } }, W.owner));
    assert.deepEqual([wrapAdd.e, wrapAdd.server], ['ok', true], `a key wrap on a record at 2100: ${JSON.stringify(wrapAdd)}`);
    await W.end();
  } finally { await T.stop(); }
});

test('the latest-message marker\'s time is a message\'s time: a write that changes the marker is refused when that time is the year 2100, past the 400 days a message may be ahead, or no number; up to 400 days ahead, in the past or left out it is taken, by update, set and a new chat alike', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const W = await world(T, 'four'), now = Date.now();
    const got = [
      ['the year 2100', await W.upd({ last: lastOf(Y2100) }), 'invalid'],
      ['a minute past 400 days', await W.upd({ last: lastOf(now + POST_TS_FUTURE_MS + MIN) }), 'invalid'],
      ['a string', await W.upd({ last: lastOf(String(Y2100)) }), 'invalid'],
      ['a list', await W.upd({ last: lastOf([Y2100]) }), 'invalid'],
      ['an object', await W.upd({ last: lastOf({ t: 1 }) }), 'invalid'],
      ['true', await W.upd({ last: lastOf(true) }), 'invalid'],
      ['past every number', (await raw(W.member, `"op":"update","p":"${W.p}","d":{"last":{"sl":1,"ts":1e999}}`)).e || 'ok', 'invalid'],
      ['now', await W.upd({ ts: now, last: lastOf(now) }), 'ok'],
      ['a message scheduled 300 days ahead (what Delete for everyone leaves as the newest)', await W.upd({ last: lastOf(now + 300 * DAY) }), 'ok'],
      ['a minute short of 400 days', await W.upd({ last: lastOf(now + POST_TS_FUTURE_MS - MIN) }), 'ok'],
      ['a year ago', await W.upd({ last: lastOf(now - 365 * DAY) }), 'ok'],
      ['no time at all', await W.upd({ last: { sl: 1, d: b64(50) } }), 'ok'],
      ['no marker', await W.upd({ last: null }), 'ok'],
    ];
    assert.deepEqual(got.filter(([, e, want]) => e !== want).map(([what, e, want]) => `${what}: ${e}, not ${want}`), []);
    const whole = await W.rec(), set = (d) => W.owner.call('set', { p: W.p, d }).then((r) => r.e || 'ok');
    assert.deepEqual([await set({ ...whole, last: lastOf(Y2100) }), await set({ ...whole, last: lastOf(now) })], ['invalid', 'ok'], 'an admin\'s set');
    const made = async (last) => (await W.owner.call('chat.create', { cid: cid(), d: groupDoc({ last }), caps: { m: cap(), a: cap(), o: cap() } })).e || 'ok';
    assert.deepEqual([await made(lastOf(Y2100)), await made(lastOf(now))], ['invalid', 'ok'], 'a new chat');
    await W.end();
  } finally { await T.stop(); }
});

test('a record that held a marker dated 2100 from before goes on taking writes: a stopped poll, the chat\'s time, a key change, that same marker once more as the server stored it; a new marker takes its place, and only another one dated too far ahead is refused', LIMIT, async () => {
  const T = await startServer({ authz: 'standard' });
  try {
    const W = await world(T, 'five'), old = lastOf(Y2100), now = Date.now();
    W.plant({ last: Object.fromEntries(Object.entries(old).filter(([, v]) => v !== null)) });   // as an update stores it: the fields the page sends as null are left out
    const r = await W.owner.call('chat.rotate', { cid: W.g, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(1) });
    assert.equal(r.e || 'ok', 'ok', 'a key change');
    assert.deepEqual([
      await W.upd({ closed: { ['m' + '0'.repeat(11) + '7']: true } }, W.owner), await W.upd({ ts: now }, W.owner), await W.upd({ last: old }, W.owner),
      await W.upd({ last: lastOf(Y2100 + 1) }, W.owner), await W.upd({ ts: now, last: lastOf(now) }, W.owner), await W.upd({ last: old }, W.owner),
    ], ['ok', 'ok', 'ok', 'invalid', 'ok', 'invalid'], 'a stopped poll, the time, the same marker, another dated 2100, an honest one, the old one put back');
    await W.end();
  } finally { await T.stop(); }
});

test('the minute and the 400 days are to the millisecond and by the server\'s clock, not the writer\'s (here the server\'s is three days behind): a time a minute past it is stored as sent and a millisecond more as the server\'s clock, as is the real now; a marker dated 400 days past it is taken and a millisecond more refused', LIMIT, async () => {
  const T0 = Date.now() - 3 * DAY;
  const T = await startServer({ authz: 'standard', now: () => T0 });
  try {
    const W = await world(T, 'six'), at = async (ts) => { assert.equal(await W.upd({ ts }), 'ok'); return W.row().d.ts; };
    assert.equal(W.row().d.ts, T0, 'the group, made with the real now, holds the server\'s clock');
    assert.deepEqual([await at(T0 + MIN), await at(T0 + MIN + 1), await at(Date.now()), await at(T0 - 1)], [T0 + MIN, T0, T0, T0 - 1]);
    assert.deepEqual([await W.upd({ last: lastOf(T0 + POST_TS_FUTURE_MS) }), await W.upd({ last: lastOf(T0 + POST_TS_FUTURE_MS + 1) })], ['ok', 'invalid']);
    await W.end();
  } finally { await T.stop(); }
});

test('the server\'s clock can be longer as text than the time it takes the place of (1e21 is five characters, the clock thirteen): a record that the change would put past its 2 MB is refused toolarge by update, set and a new chat alike, and stays as it was or is not made; one that stays within is taken', LIMIT, () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-chat-time-')), store = new Store({ dataDir: dir }).open();
  try {
    const p = 'channels/' + cid(), MAX = MAX_BYTES.channels, get = () => JSON.parse(store.db.prepare('SELECT d FROM docs WHERE path = ?').get(p).d);
    store.set(p, groupDoc({ ts: 5 }));
    // Filled by hand to a chosen size, through a field whose size is looked at only when a write changes it (closed, release 112).
    const fill = (ts, size) => {
      const base = { ...get(), ts }, pad = (n) => ({ ...base, closed: { x: 'A'.repeat(n) } }), d = pad(size - byteLength(pad(0)));
      store.db.prepare('UPDATE docs SET d = ?, ts = ? WHERE path = ?').run(JSON.stringify(d), ts, p);
      return byteLength(get());
    };
    assert.equal(fill(5, MAX - 6), MAX - 6);
    throwsCode(() => store.update(p, { ts: 1e21 }), 'toolarge');   // 4 bytes more as sent (within), 12 more as the clock (6 past)
    throwsCode(() => store.set(p, { ...get(), ts: 1e21 }), 'toolarge');
    assert.deepEqual([get().ts, byteLength(get())], [5, MAX - 6], 'the record is as it was');
    const q = cid(), made = (n) => groupDoc({ ts: 1e21, closed: { x: 'A'.repeat(n) } }), d = made(MAX - 2 - byteLength(made(0)));   // 2 short as sent, 6 past as the clock
    assert.equal(byteLength(d), MAX - 2);
    throwsCode(() => store.createChat({ cid: q, d, caps: CAPS() }, { handle: 'someone' }), 'toolarge');
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM docs WHERE path = ?').get('channels/' + q).n, 0, 'no chat was made');
    store.update(p, { ts: 6 });
    assert.equal(get().ts, 6, 'a write that keeps it within is taken');
    const now = Date.now(); assert.equal(fill(now, MAX), MAX);
    store.update(p, { ts: now + 3 * DAY });   // thirteen characters for thirteen: a record at its very limit takes an honest phone's time
    assert.ok(get().ts >= now && get().ts <= Date.now() && byteLength(get()) === MAX, 'stored as the server\'s clock, the same size');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
