// Blocked from a group or channel (SPEC.md 5.6): the server keeps a keyed tag per blocked username (`chat.ban`, admin
// level) and refuses that username's member key at `chat.open`, so a stale admin page that writes them back into the
// sealed member list, or wraps the next key for them, can't let them in. The page asks the server first, keeps blocked
// authors and stale join notes out of the member list, and never wraps a new key for someone blocked.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import WebSocket from 'ws';

import { startServer, connect, connectAs, signup, makeIdentity, createChat, groupDoc, channelDoc, dmDoc, CAPS, cap, sleep, signText, directoryDoc, appSource } from './helpers.js';

const G = 'gBanned000001', G2 = 'gBanned000002', CH = 'cBanned000001', DM = 'd' + 'B'.repeat(22);
const ban = (c, cid, h, on = true) => c.call('chat.ban', { cid, h, on });

async function people(T, ...names) {
  const out = {};
  for (const n of names) { const id = await makeIdentity(n); out[n] = Object.assign(await signup(T.url, id), { id }); }
  return out;
}

test('chat.ban needs admin level of a group or channel: members, DMs and unproven connections are refused', async () => {
  const T = await startServer({ authz: 'standard' });
  const { alice: A, bob: B, carol: C } = await people(T, 'alice', 'bob', 'carol');
  try {
    const { caps } = await createChat(A, G, groupDoc());
    await createChat(A, CH, channelDoc());
    const anon = await connect(T.url); await anon.hello();
    assert.equal((await ban(anon, G, 'bob')).e, 'unauth');
    await anon.close();
    assert.equal((await ban(B, G, 'carol')).e, 'denied', 'no level for the chat');
    await B.ok('chat.open', { cid: G, cap: caps.m });
    assert.equal((await ban(B, G, 'carol')).e, 'denied', 'a member may not block');
    await createChat(B, DM, dmDoc(), { m: cap() });
    assert.equal((await ban(B, DM, 'alice')).e, 'denied', 'a DM has no bans');
    for (const [h, on] of [['Bob!', true], ['bob', 'yes'], [['bob'], true], ['bob', null]]) assert.equal((await ban(A, G, h, on)).e, 'invalid', JSON.stringify([h, on]));
    assert.equal((await A.call('chat.ban', { cid: G, h: 'bob' })).e, 'invalid', '"on" is required');
    assert.equal((await ban(A, 'gNoSuchChat01', 'bob')).e, 'notfound');
    await C.ok('chat.open', { cid: G, cap: caps.a });
    await C.ok('chat.ban', { cid: G, h: 'dave', on: true });   // an admin may
    await A.ok('chat.ban', { cid: CH, h: 'dave', on: true });  // and the owner, in a channel too
    assert.equal(T.srv.store.isBanned(G, 'dave'), true);
    assert.equal(T.srv.store.isBanned(G2, 'dave'), false, 'a ban is for one chat');
  } finally { await A.close(); await B.close(); await C.close(); await T.stop(); }
});

test('a blocked member key is refused at chat.open, open connections are evicted, and the wrong-key allowance is untouched', async () => {
  const T = await startServer({ authz: 'standard', limits: { openFailsPerMin: 3 } });
  const { alice: A, bob: B, mallory: M } = await people(T, 'alice', 'bob', 'mallory');
  const M2 = await connectAs(T.url, M.id);                       // a second device of hers
  try {
    const { caps } = await createChat(A, G, groupDoc());
    for (const c of [M, M2, B]) await c.ok('chat.open', { cid: G, cap: caps.m });
    await M.ok('sub', { s: 'p', p: `channels/${G}/posts`, l: 10 });
    await M.waitPush((f) => f.s === 'p' && f.t === 'init');
    await A.ok('chat.ban', { cid: G, h: 'mallory', on: true });
    for (const c of [M, M2]) assert.equal((await c.waitPush((f) => f.t === 'evict')).cid, G, 'each of her open connections loses the chat at once');
    assert.equal((await M.call('query', { p: `channels/${G}/posts`, l: 10 })).e, 'denied');
    await M.ok('ping');                                            // the connection itself stays
    assert.ok(await B.noPush((f) => f.t === 'evict'), 'nobody else is disturbed');
    await B.ok('query', { p: `channels/${G}/posts`, l: 10 });
    for (let i = 0; i < 6; i++) {
      const r = await M.call('chat.open', { cid: G, cap: caps.m });
      assert.deepEqual([r.e, /removed/.test(r.m)], ['denied', true], 'the right key, refused because she was blocked');
    }
    // Six refusals with an allowance of three wrong keys from this address: none of them was counted. Nor are wrong keys
    // from a connection that holds the chat already (Bob): it is not guessing (the page tries an owner key it may hold).
    for (let i = 0; i < 5; i++) assert.equal((await B.call('chat.open', { cid: G, cap: cap() })).e, 'denied');
    for (let i = 0; i < 3; i++) assert.equal((await M.call('chat.open', { cid: G, cap: cap() })).e, 'denied', 'a wrong key from a connection without the chat is still counted');
    assert.equal((await M.call('chat.open', { cid: G, cap: caps.m })).e, 'ratelimit', 'the allowance was whole until the three wrong keys');
  } finally { await A.close(); await B.close(); await M.close(); await M2.close(); await T.stop(); }
});

test('owner and admin keys still open for a blocked username, also held at member level; unblocking restores the member key', async () => {
  const T = await startServer({ authz: 'standard' });
  const { alice: A, carol: C } = await people(T, 'alice', 'carol');
  try {
    const { caps } = await createChat(A, G, groupDoc());
    await A.ok('chat.ban', { cid: G, h: 'carol', on: true });
    await A.ok('chat.ban', { cid: G, h: 'carol', on: true });   // on twice is fine
    assert.equal((await C.ok('chat.open', { cid: G, cap: caps.a })).level, 'admin', 'an admin key is never refused by a ban');
    assert.equal((await C.call('chat.open', { cid: G, cap: caps.m })).e, 'denied');
    await A.ok('chat.ban', { cid: G, h: 'alice', on: true });
    assert.equal((await A.ok('chat.open', { cid: G, cap: caps.o })).level, 'owner', 'nor an owner key');
    T.srv.limits.powerNeedsSecure = true;                        // carol's account is not secured: her admin key opens at member level
    const r = await C.ok('chat.open', { cid: G, cap: caps.a });
    assert.deepEqual([r.level, r.held], ['member', 'admin'], 'the ban looks at the level the key gave, not the one held');
    T.srv.limits.powerNeedsSecure = false;
    await A.ok('chat.ban', { cid: G, h: 'carol', on: false });
    await A.ok('chat.ban', { cid: G, h: 'carol', on: false });  // off twice is fine
    assert.equal((await C.ok('chat.open', { cid: G, cap: caps.m })).level, 'member', 'unblocked: the member key opens again');
  } finally { await A.close(); await C.close(); await T.stop(); }
});

test('admins may block at most bansPerChat usernames, the owner as many again; a blocked admin may not unblock themselves', async () => {
  const T = await startServer({ authz: 'standard', limits: { bansPerChat: 2 } });
  const { alice: A, eve: E } = await people(T, 'alice', 'eve');
  try {
    const { caps } = await createChat(A, G, groupDoc()); await createChat(A, G2, groupDoc());
    await E.ok('chat.open', { cid: G, cap: caps.a });
    await E.ok('chat.ban', { cid: G, h: 'u_one', on: true });
    await E.ok('chat.ban', { cid: G, h: 'u_two', on: true });
    assert.equal((await ban(E, G, 'u_three')).e, 'toolarge', 'an admin fills the list only so far');
    await E.ok('chat.ban', { cid: G, h: 'u_one', on: true });   // already blocked: nothing new to keep
    await A.ok('chat.ban', { cid: G, h: 'u_three', on: true }); // junk an admin added can't stop the owner
    await A.ok('chat.ban', { cid: G, h: 'u_four', on: true });
    assert.equal((await ban(A, G, 'u_five')).e, 'toolarge', 'nor can the owner go on for ever');
    await A.ok('chat.ban', { cid: G2, h: 'u_five', on: true }); // each chat has its own allowance
    await A.ok('chat.ban', { cid: G, h: 'u_one', on: false });
    assert.equal(T.srv.store.isBanned(G, 'u_one'), false);
    assert.equal(T.srv.store.isBanned(G, 'u_three'), true);
    // Eve is blocked while she still holds the admin key: it opens, but it does not lift her own block.
    await A.ok('chat.ban', { cid: G, h: 'eve', on: true });
    assert.equal((await E.ok('chat.open', { cid: G, cap: caps.a })).level, 'admin');
    assert.equal((await E.call('chat.ban', { cid: G, h: 'eve', on: false })).e, 'denied');
    assert.equal((await E.call('chat.ban', { cid: G, h: 'u_four', on: false })).e, 'denied', 'nor anyone else\'s');
    assert.equal(T.srv.store.isBanned(G, 'eve'), true);
  } finally { await A.close(); await E.close(); await T.stop(); }
});

test('a public channel has no blocks: none can be made, and going public drops those of the private channel', async () => {
  const T = await startServer({ authz: 'standard' });
  const { alice: A, bob: B } = await people(T, 'alice', 'bob');
  try {
    const CH = 'cBans00000009';
    const { caps } = await createChat(A, CH, channelDoc());
    await A.ok('chat.ban', { cid: CH, h: 'bob', on: true });
    assert.equal((await B.call('chat.open', { cid: CH, cap: caps.m })).e, 'denied', 'blocked while private');
    await A.ok('update', { p: 'channels/' + CH, d: { visibility: 'public', meta: null, openKeys: { 0: 'k'.repeat(44) } } });
    assert.equal(T.srv.store.isBanned(CH, 'bob'), false, 'gone with the change to public');
    assert.equal((await B.ok('chat.open', { cid: CH, cap: caps.m })).level, 'member');
    assert.equal((await ban(A, CH, 'bob')).e, 'denied', 'and none can be made while it is public');
    await A.ok('chat.ban', { cid: CH, h: 'bob', on: false });  // lifting one is always fine
  } finally { await A.close(); await B.close(); await T.stop(); }
});

test('a block takes the member level away; an owner or admin connection of the same name keeps its level', async () => {
  const T = await startServer({ authz: 'standard' });
  const { alice: A, carol: C } = await people(T, 'alice', 'carol');
  const C2 = await connectAs(T.url, C.id);
  try {
    const { caps } = await createChat(A, G, groupDoc());
    await C.ok('chat.open', { cid: G, cap: caps.a }); await C2.ok('chat.open', { cid: G, cap: caps.m });
    await A.ok('chat.ban', { cid: G, h: 'carol', on: true });
    assert.equal((await C2.waitPush((f) => f.t === 'evict')).cid, G, 'her member-level connection loses the chat');
    assert.ok(await C.noPush((f) => f.t === 'evict'), 'her admin connection is left alone');
    await C.ok('query', { p: `channels/${G}/posts`, l: 10 });
  } finally { await A.close(); await C.close(); await C2.close(); await T.stop(); }
});

test('the database keeps no username for a ban, only a tag under the server key; the tags go with the chat', async () => {
  const T = await startServer({ authz: 'standard' });
  const { alice: A } = await people(T, 'alice');
  const h = 'zed_never_signed';                                   // no account, so the name can only come from the ban
  try {
    await createChat(A, G, groupDoc()); await createChat(A, G2, groupDoc());
    await A.ok('chat.ban', { cid: G, h, on: true });
    await A.ok('chat.ban', { cid: G2, h, on: true });
    const rows = T.srv.store.db.prepare('SELECT cid, tag FROM bans ORDER BY cid').all();
    assert.deepEqual(rows.map((r) => r.cid), [G, G2]);
    const key = readFileSync(join(T.dataDir, 'addr.key'));
    assert.equal(rows[0].tag, createHmac('sha256', key).update('ban:' + G + '|' + h).digest('base64url'), 'keyed by the server key, which is not in the database');
    assert.notEqual(rows[0].tag, rows[1].tag, 'the same person has a different tag in each chat');
    for (const f of ['hush.db', 'hush.db-wal']) {
      const p = join(T.dataDir, f);
      if (existsSync(p)) assert.equal(readFileSync(p).includes(h), false, f + ' holds no username');
    }
    await A.ok('delete', { p: 'channels/' + G });
    assert.deepEqual(T.srv.store.db.prepare('SELECT cid FROM bans').all().map((r) => r.cid), [G2], 'the deleted chat’s bans went with it');
  } finally { await A.close(); await T.stop(); }
});

// ---- the page's adapter, against a real server ----

const html = appSource();
const lift = (from, to) => { const a = html.indexOf(from), b = html.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, from); return html.slice(a, b); };
const createHushAdapter = new Function(lift('/* ===== HUSH ADAPTER BEGIN ===== */', '/* ===== HUSH ADAPTER END ===== */') + '\nreturn createHushAdapter;')();
const proofOf = (id) => ({ h: id.handle, pub: id.sig, dev: '', signDev: null, signAcct: (m) => signText(id.sigKey, m) });
async function signUp(db, id) { await db.prove(proofOf(id)); await db.doc('directory/' + id.handle).set(directoryDoc(id)); }
async function until(fn, what, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (fn()) return; await sleep(25); }
  throw new Error('timed out waiting for ' + what);
}

test('the page adapter: banChat blocks and unblocks, and a blocked member’s page can no longer open the chat', async () => {
  const T = await startServer({ authz: 'standard' });
  const alice = await makeIdentity('alice'), mallory = await makeIdentity('mallory'), caps = CAPS();
  const A = createHushAdapter(T.url, { WebSocket, onStatus: () => {} });
  const M = createHushAdapter(T.url, { WebSocket, onStatus: () => {}, caps: () => caps.m });
  try {
    await A.ready; await M.ready;
    await signUp(A, alice); await signUp(M, mallory);
    await A.createChat(G, groupDoc(), caps);
    assert.equal(await M.refreshChat(G), true);
    await assert.rejects(M.banChat(G, 'alice', true), (e) => e.code === 'denied', 'a member may not block');
    await A.banChat(G, 'mallory', true);
    await until(() => M.chatLevel(G) === null, 'Mallory to lose the chat');
    assert.equal(await M.refreshChat(G), false, 'her member key no longer opens it');
    await A.banChat(G, 'mallory', false);
    assert.equal(await M.refreshChat(G), true, 'unblocked');
  } finally { A.close(); M.close(); await T.stop(); }
});

// ---- the page's own rules, lifted from app/ui.js with stubs ----

const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const cut = (from, to) => { const a = ui.indexOf(from), b = ui.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a, from); return ui.slice(a, b); };
const epochSrc = cut('const epochOf=', '\n'), metaOfSrc = cut('const metaOf=', '\n');
const reconcileSrc = cut('const reconciled=new Set();', 'function noteAccepted(');
const rotateSrc = cut('async function rotateTo(', 'const dmEpochBusy=');
const kickSrc = cut('async function kickMember(', 'async function rotateAdmins(');
const unbanSrc = cut('async function unban(', 'const reconciled=');

test('an admin page keeps a blocked author and a join note from before the last key change out of the member list', async () => {
  const metas = [], conv = { id: G, type: 'group', visibility: 'private', epoch: 3, owner: 'alice', admins: [], members: ['alice', 'bob'], banned: ['mallory'] };
  const S = { me: { handle: 'alice' }, db: { doc: () => ({ update: async (d) => { metas.push(d.meta); } }) } };
  const reconcileSvc = new Function('S', 'typeOf', 'isAdmin', 'chatAnd', 'sealMetaFor', 'kickMember', [epochSrc, metaOfSrc, reconcileSrc, 'return reconcileSvc;'].join('\n'))(
    S, (c) => c.type, () => true, async () => [conv, conv], async (_c, v) => v, async () => { throw new Error('nobody left'); });
  const join = (_id, from, e) => ({ _id, svc: 'join', from, e });
  await reconcileSvc(conv, [join('p1', 'mallory', 3), join('p2', 'carol', 2), join('p3', 'dave', 3)]);
  assert.deepEqual(metas.map((m) => m.members), [['alice', 'bob', 'dave']], 'only the fresh joiner is written in');
  assert.deepEqual(metas[0].banned, ['mallory'], 'and the blocked list stays as it was');
  const fresh = { ...conv, id: G2, epoch: 0, members: ['alice'], banned: [] };
  await reconcileSvc(fresh, [{ _id: 'p4', svc: 'join', from: 'erin' }]);   // a note without an epoch is from epoch 0
  assert.deepEqual(metas[1].members, ['alice', 'erin']);
});

function kickPage(chat, shown, o = {}) {
  const calls = [];
  const S = { me: { handle: 'alice' }, chatDocs: new Map(), db: {
    banChat: async (cid, h, on) => { calls.push(['ban', h, on]); if (on && o.listFull) throw Object.assign(new Error('x'), { code: 'toolarge' }); },
    rotateChat: async (cid, spec) => { calls.push(['rotate', spec.epoch]); if (o.rotateFails) throw Object.assign(new Error('x'), { code: o.rotateFails }); },
    doc: () => ({ update: async (d) => { calls.push(['update', Object.keys(d)]); } }),
  } };
  const f = new Function('S', 'typeOf', 'chatAnd', 'loadDir', 'wrapAll', 'sealMeta', 'sealMetaFor', 'memberCapFrom', 'ksPut', 'ls', 'convById', 'b64', 'rotateAdmins', 'isOwner', 'freshChan', 'showMeta',
    [epochSrc, metaOfSrc, rotateSrc, kickSrc, unbanSrc, 'return { rotateTo, kickMember, unban };'].join('\n'))(
    S, (c) => c.type, async () => [chat, shown], async () => {}, async (_raw, members) => { calls.push(['wrap', members]); return {}; },
    async (_cid, e, _raw, v) => { calls.push(['seal', v.members, v.banned]); return { e }; }, async () => ({}), async () => 'cap', () => {}, { set() {} }, () => null, () => '',
    async () => { calls.push(['admins']); }, () => true,
    async () => { if (o.freshFails) throw Object.assign(new Error('x'), { code: 'offline' }); return o.fresh || chat; }, async (x) => (x === chat ? shown : o.freshShown || shown));
  return { ...f, calls };
}

test('blocking asks the server before the key changes, unblocking lets them back, and a new key is never wrapped for someone blocked', async () => {
  const chat = { id: G, type: 'group', visibility: 'private', epoch: 1 };
  const shown = { ...chat, owner: 'alice', admins: [], members: ['alice', 'bob', 'mallory'], banned: [] };
  let p = kickPage(chat, shown);
  await p.kickMember(G, 'mallory');
  assert.deepEqual(p.calls, [['ban', 'mallory', true], ['wrap', ['alice', 'bob']], ['seal', ['alice', 'bob'], ['mallory']], ['rotate', 2]]);
  p = kickPage(chat, shown);
  await p.kickMember(G, 'bob', { ban: false });
  assert.deepEqual(p.calls.filter((c) => c[0] === 'ban'), [], 'removing (someone who left) is not blocking');
  p = kickPage(chat, shown);
  await p.rotateTo(chat, { members: ['alice', 'bob', 'mallory'], banned: ['mallory'] });
  assert.deepEqual(p.calls.slice(0, 2), [['wrap', ['alice', 'bob']], ['seal', ['alice', 'bob'], ['mallory']]], 'a stale member list that still names her gets no wrap for her');
  p = kickPage(chat, { ...shown, banned: ['mallory'] });
  await p.unban(G, 'mallory');
  assert.deepEqual(p.calls, [['update', ['meta']], ['ban', 'mallory', false]], 'the sealed list first: a failure leaves them blocked everywhere');
  p = kickPage(chat, shown, { rotateFails: 'offline' });
  await assert.rejects(p.kickMember(G, 'mallory'));
  assert.deepEqual(p.calls.filter((c) => c[0] === 'ban'), [['ban', 'mallory', true], ['ban', 'mallory', false]], 'a removal whose key change failed takes its block back: the server and the lists agree');
  p = kickPage(chat, shown, { rotateFails: 'offline', fresh: { ...chat, epoch: 2 } });
  await assert.rejects(p.kickMember(G, 'mallory'));
  assert.deepEqual(p.calls.filter((c) => c[0] === 'ban'), [['ban', 'mallory', true]], 'the reply was lost but the key change happened: the block stays');
  p = kickPage({ ...chat, epoch: 1 }, shown, { listFull: true });
  assert.equal(await p.kickMember(G, 'mallory'), 'full', 'the server\'s list is full (junk a rogue admin added): the page says so');
  assert.deepEqual(p.calls.filter((c) => c[0] === 'rotate'), [['rotate', 2]], 'and still takes the key away from her');
  p = kickPage(chat, shown, { rotateFails: 'offline', freshFails: true });
  await assert.rejects(p.kickMember(G, 'mallory'));
  assert.deepEqual(p.calls.filter((c) => c[0] === 'ban'), [['ban', 'mallory', true]], 'unsure what happened: the block stays');
  const pub = { id: CH, type: 'channel', visibility: 'public', epoch: 0 };
  p = kickPage(pub, { ...pub, owner: 'alice', admins: [], members: ['alice'], banned: [] });
  await p.kickMember(CH, 'bob');
  assert.deepEqual(p.calls, [], 'a public channel has no member key to refuse');
});
