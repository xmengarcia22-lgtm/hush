// Media over HTTP (SPEC.md 7.7): tickets from the socket, raw encrypted pieces over HTTP, write-once pieces,
// the room-key gate checked on every request, the per-chat allowance, the disk guard, expiry, delete and copy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';

import { startServer, signup, makeIdentity, cap, label, wrap, groupDoc, channelDoc, dmDoc, createChat, DMID } from './helpers.js';
import { MEDIA_LIMITS, maxPieces } from '../src/limits.js';
import { log } from '../src/log.js';

const G = 'gMedia0000001', CH = 'cMedia0000001', MID = 'mPhoto0000001';
// diskCheckMs: 0 makes every request look at the (injected) disk afresh, so a test can flip it and see the effect at once.
const SMALL = { pieceBytes: 1024, imageBytes: 4096, gifBytes: 4096, videoBytes: 10240, fileBytes: 10240, voiceBytes: 4096, chatBytes: 8000, diskCheckMs: 0 };
let S, A, B, C, gCaps, chCaps, disk = { free: 50e9, total: 100e9 };

const piece = (n = 100) => randomBytes(12 + n + 16);                 // an iv, then ciphertext and tag
async function http(method, path, { t, body, headers = {}, at = S } = {}) {
  const r = await fetch(at.httpUrl + path, { method, body, headers: { ...(t ? { authorization: 'Hush ' + t } : {}), ...headers } });
  const type = r.headers.get('content-type') || '';
  return { status: r.status, headers: r.headers, body: type.startsWith('application/json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
}
const ticket = async (c, cid) => (await c.ok('media.ticket', { cid })).t;

before(async () => {
  S = await startServer({ authz: 'standard', limits: { media: SMALL }, diskFree: () => disk });
  const [alice, bob, carol] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('carol')]);
  A = await signup(S.url, alice); B = await signup(S.url, bob); C = await signup(S.url, carol);
  ({ caps: gCaps } = await createChat(A, G, groupDoc()));
  ({ caps: chCaps } = await createChat(A, CH, channelDoc()));
  await B.ok('chat.open', { cid: G, cap: gCaps.m });
  await B.ok('chat.open', { cid: CH, cap: chCaps.m });
});
after(async () => { await A.close(); await B.close(); await C.close(); await S.stop(); });

test('the limits live in one place and the page can read them', async () => {
  assert.equal(MEDIA_LIMITS.videoBytes, 500e6);
  assert.equal(MEDIA_LIMITS.fileBytes, 500e6);
  assert.equal(MEDIA_LIMITS.chatBytes, 2e9);
  assert.equal(maxPieces(MEDIA_LIMITS), 477, '500 MB in 1 MiB pieces');
  const r = await http('GET', '/media/limits');
  assert.equal(r.status, 200);
  assert.equal(r.body.limits.videoBytes, 10240, 'this server\'s overrides, merged over the defaults');
  assert.equal(r.body.limits.voiceSeconds, MEDIA_LIMITS.voiceSeconds);
  assert.equal(r.body.limits.videoAutoBytes, 50e6, 'videos up to 50 MB download without a tap');
  assert.equal(r.body.limits.maxPieces, 10);
});

test('a ticket comes only from a connection holding the chat, and only for that chat', async () => {
  assert.equal((await C.call('media.ticket', { cid: G })).e, 'denied', 'carol has no key for the group');
  assert.equal((await http('GET', `/media/${G}/${MID}/0`)).status, 401, 'no ticket');
  assert.equal((await http('GET', `/media/${G}/${MID}/0`, { t: 'x'.repeat(32) })).status, 401, 'made-up ticket');
  const t = await ticket(B, G);
  const r = await http('GET', `/media/${CH}/${MID}/0`, { t });
  assert.equal(r.status, 403);
  assert.equal(r.body.e, 'denied');
});

test('pieces are raw bytes, written once, read back exactly', async () => {
  const tb = await ticket(B, G), ta = await ticket(A, G), p0 = piece(200);
  const put = await http('PUT', `/media/${G}/${MID}/0`, { t: tb, body: p0 });
  assert.equal(put.status, 201);
  const got = await http('GET', `/media/${G}/${MID}/0`, { t: ta });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'application/octet-stream');
  assert.equal(got.headers.get('cache-control'), 'no-store');
  assert.ok(got.body.equals(p0));
  assert.equal((await http('PUT', `/media/${G}/${MID}/0`, { t: tb, body: p0 })).status, 200, 'the same bytes again: a retry, fine');
  const swap = await http('PUT', `/media/${G}/${MID}/0`, { t: ta, body: piece(200) });
  assert.equal(swap.status, 409, 'nobody can replace a stored piece');
  assert.equal((await http('PUT', `/media/${G}/${MID}/1`, { t: tb, body: piece(1025) })).status, 413, 'over the piece size');
  assert.equal((await http('PUT', `/media/${G}/${MID}/10`, { t: tb, body: piece(10) })).status, 400, 'past the most pieces a media id can have');
  assert.equal((await http('PUT', `/media/${G}/${MID}/1`, { t: tb, body: Buffer.alloc(20) })).status, 400, 'too short to be a piece');
  assert.equal((await http('GET', `/media/${G}/${MID}/1`, { t: tb })).status, 404);
  const row = S.srv.store.media.prepare('SELECT * FROM chunks WHERE cid = ? AND mid = ?').get(G, MID);
  assert.deepEqual(Object.keys(row).sort(), ['cid', 'd', 'i', 'iv', 'mid'], 'no type, size hint, name or kind is stored');
});

test('in a channel members may read media but only admins upload it', async () => {
  const ta = await ticket(A, CH), tb = await ticket(B, CH), mid = 'mChannel00001';
  assert.equal((await http('PUT', `/media/${CH}/${mid}/0`, { t: tb, body: piece() })).status, 403);
  assert.equal((await http('PUT', `/media/${CH}/${mid}/0`, { t: ta, body: piece() })).status, 201);
  assert.equal((await http('GET', `/media/${CH}/${mid}/0`, { t: tb })).status, 200);
  assert.equal((await http('DELETE', `/media/${CH}/${mid}`, { t: ta })).status, 200);
});

const hashOf = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
test('deleting media in a group or channel is the uploader\'s (the media token whose hash came with the upload) or an admin\'s; over the socket an admin\'s alone; in a DM either side may', async () => {
  const tb = await ticket(B, G), ta = await ticket(A, G), mid = 'mDelete000001', tokB = 'bob-media-token-1', oh = { 'x-hush-oh': hashOf(tokB) };
  assert.equal((await http('PUT', `/media/${G}/${mid}/0`, { t: tb, body: piece(), headers: oh })).status, 201, 'a member uploads with the hash of their token');
  const d = await http('DELETE', `/media/${G}/${mid}`, { t: tb });
  assert.equal(d.status, 403); assert.equal(d.body.e, 'denied', 'no token: a member may not');
  assert.equal((await http('DELETE', `/media/${G}/${mid}`, { t: tb, headers: { 'x-hush-ot': 'not-the-token' } })).status, 403, 'the wrong token neither');
  assert.equal((await B.call('delete', { p: `channels/${G}/media/${mid}/chunks/0` })).e, 'denied', 'the socket path carries no token: an admin\'s alone');
  assert.equal((await http('GET', `/media/${G}/${mid}/0`, { t: tb })).status, 200, 'still there');
  assert.equal((await http('DELETE', `/media/${G}/${mid}`, { t: tb, headers: { 'x-hush-ot': tokB } })).body.n, 1, 'the uploader removes their own file with the token');
  assert.equal((await http('PUT', `/media/${G}/${mid}/0`, { t: tb, body: piece(), headers: oh })).status, 201);
  assert.equal((await http('DELETE', `/media/${G}/${mid}`, { t: ta })).body.n, 1, 'the owner removes it without any token');
  // another upload's id: a piece under a different hash is refused, so nobody grafts onto someone else's file
  assert.equal((await http('PUT', `/media/${G}/${mid}/0`, { t: tb, body: piece(), headers: oh })).status, 201);
  const graft = await http('PUT', `/media/${G}/${mid}/1`, { t: ta, body: piece(), headers: { 'x-hush-oh': hashOf('alice-token') } });
  assert.equal(graft.status, 403); assert.equal(graft.body.e, 'denied');
  assert.equal((await http('PUT', `/media/${G}/${mid}/1`, { t: tb, body: piece(), headers: oh })).status, 201, 'the same hash adds a piece');
  assert.equal((await http('DELETE', `/media/${G}/${mid}`, { t: tb, headers: { 'x-hush-ot': tokB } })).body.n, 2);
  // media from before release 80 carries no hash: nobody's, so an admin's alone, and never claimed by a later piece
  assert.equal((await http('PUT', `/media/${G}/mLegacy000001/0`, { t: tb, body: piece() })).status, 201, 'no X-Hush-Oh: still accepted');
  assert.equal((await http('PUT', `/media/${G}/mLegacy000001/1`, { t: tb, body: piece(), headers: oh })).status, 201, 'a later piece with a hash does not claim the id');
  assert.equal((await http('DELETE', `/media/${G}/mLegacy000001`, { t: tb, headers: { 'x-hush-ot': tokB } })).status, 403, 'not claimable');
  assert.equal((await http('DELETE', `/media/${G}/mLegacy000001`, { t: ta })).body.n, 2);
  const bad = await http('PUT', `/media/${G}/mBadHash00001/0`, { t: tb, body: piece(), headers: { 'x-hush-oh': 'xyz' } });
  assert.equal(bad.status, 400); assert.equal(bad.body.e, 'invalid');
  assert.equal((await http('DELETE', `/media/${G}/${mid}`, { t: tb, headers: { 'x-hush-ot': 'x'.repeat(129) } })).status, 400, 'an overlong token is refused as invalid');
  const m = cap();
  await createChat(A, DMID, dmDoc(), { m });
  await B.ok('chat.open', { cid: DMID, cap: m });
  const da = await ticket(A, DMID), db = await ticket(B, DMID);
  assert.equal((await http('PUT', `/media/${DMID}/${mid}/0`, { t: da, body: piece() })).status, 201);
  assert.equal((await http('DELETE', `/media/${DMID}/${mid}`, { t: db })).body.n, 1, 'the other side of a DM may');
  assert.equal((await http('PUT', `/media/${DMID}/${mid}/0`, { t: db, body: piece() })).status, 201);
  assert.equal((await http('DELETE', `/media/${DMID}/${mid}`, { t: da })).body.n, 1);
});

test('the level is checked on every request: a rotation ends access at once, a closed socket ends its tickets', async () => {
  const mid = 'mRotate000001', ta = await ticket(A, G), tb = await ticket(B, G);
  await http('PUT', `/media/${G}/${mid}/0`, { t: ta, body: piece() });
  assert.equal((await http('GET', `/media/${G}/${mid}/0`, { t: tb })).status, 200);
  const next = cap();
  await A.ok('chat.rotate', { cid: G, epoch: 1, keys: { [label()]: wrap() }, cap: next });
  await B.waitPush((f) => f.t === 'evict' && f.cid === G);
  assert.equal((await http('GET', `/media/${G}/${mid}/0`, { t: tb })).status, 403, 'bob was removed: his ticket opens nothing');
  await B.ok('chat.open', { cid: G, cap: next });
  assert.equal((await http('GET', `/media/${G}/${mid}/0`, { t: tb })).status, 200, 'back in with the new key');
  gCaps.m = next;
  const D = await signup(S.url, await makeIdentity('dave'));
  await D.ok('chat.open', { cid: G, cap: next });
  const td = await ticket(D, G);
  await D.close();
  assert.equal((await http('GET', `/media/${G}/${mid}/0`, { t: td })).status, 401, 'tickets die with their connection');
});

test('a chat\'s media allowance and the disk guard refuse uploads with "full"', async () => {
  const cid = 'gQuota0000001';
  await createChat(A, cid, groupDoc());
  const t = await ticket(A, cid);
  for (let i = 0; i < 7; i++) assert.equal((await http('PUT', `/media/${cid}/mQuota0000001/${i}`, { t, body: piece(1000) })).status, 201);
  const over = await http('PUT', `/media/${cid}/mQuota0000001/7`, { t, body: piece(1000) });
  assert.equal(over.status, 507);
  assert.equal(over.body.e, 'full');
  assert.equal(over.body.scope, 'chat', 'the chat\'s own allowance: deleting something here helps');
  assert.equal((await http('DELETE', `/media/${cid}/mQuota0000001`, { t })).body.n, 7);
  assert.equal(S.srv.store.mediaBytes(cid), 0, 'deleting gives the allowance back');
  try {
    disk = { free: 20e9, total: 240e9 };
    assert.equal((await http('PUT', `/media/${cid}/mQuota0000002/0`, { t, body: piece() })).status, 201, 'under 10 % but 20 GB free: still fine');
    disk = { free: 3e9, total: 40e9 };
    const d = await http('PUT', `/media/${cid}/mQuota0000001/0`, { t, body: piece() });
    assert.equal(d.status, 507, 'under 10 % and under 5 GB free: no new media');
    assert.equal(d.body.scope, 'server', 'the server\'s disk: nothing the page deletes will help soon');
  } finally { disk = { free: 50e9, total: 100e9 }; }
  assert.equal((await http('PUT', `/media/${cid}/mQuota0000001/0`, { t, body: piece() })).status, 201);
});

test('media of a disappearing message is swept when its time is up', async () => {
  const t = await ticket(A, G), mid = 'mExpire000001', exp = Date.now() + 60_000;
  await http('PUT', `/media/${G}/${mid}/0`, { t, body: piece(), headers: { 'x-hush-exp': String(exp) } });
  await http('PUT', `/media/${G}/${mid}/1`, { t, body: piece(), headers: { 'x-hush-exp': String(exp + 5000) } });
  assert.equal(S.srv.sweepMedia(exp + 1000), 0, 'not before the latest piece\'s time');
  assert.equal(S.srv.sweepMedia(exp + 6000), 1);
  assert.equal((await http('GET', `/media/${G}/${mid}/0`, { t })).status, 404);
  assert.equal((await http('PUT', `/media/${G}/mExpire000002/0`, { t, body: piece(), headers: { 'x-hush-exp': 'soon' } })).status, 400);
});

test('a forward copies media to a new id without re-uploading, with access to both chats', async () => {
  const mid = 'mForward00001', to = 'mForwardCopy1', tg = await ticket(A, G), tc = await ticket(A, CH), p0 = piece(300);
  const from = { 'x-hush-from': `${G}/${mid}`, 'x-hush-from-ticket': tg };
  await http('PUT', `/media/${G}/${mid}/0`, { t: tg, body: p0 });
  assert.equal((await http('POST', `/media/${CH}/${to}/copy`, { t: tc, headers: { 'x-hush-from': `${G}/${mid}` } })).status, 401, 'needs a ticket for the source too');
  const tbG = await ticket(B, G), tbC = await ticket(B, CH);
  assert.equal((await http('POST', `/media/${CH}/${to}/copy`, { t: tbC, headers: { 'x-hush-from': `${G}/${mid}`, 'x-hush-from-ticket': tbG } })).status, 403, 'bob may not post in the channel');
  assert.equal((await http('POST', `/media/${CH}/${to}/copy`, { t: tc, headers: from })).status, 201);
  assert.ok((await http('GET', `/media/${CH}/${to}/0`, { t: tbC })).body.equals(p0), 'channel members read the same bytes');
  assert.equal((await http('POST', `/media/${CH}/${to}/copy`, { t: tc, headers: from })).status, 200, 'again: nothing to do');
  assert.equal((await http('POST', `/media/${G}/mForwardCopy2/copy`, { t: tg, headers: from })).status, 201, 'a forward within the same chat');
  // a copy is the forwarder's: their token hash goes with it, not the source's
  const tokA = 'alice-forward-token', tokB = 'bob-forward-token';
  assert.equal((await http('POST', `/media/${G}/mForwardOwn01/copy`, { t: tg, headers: { ...from, 'x-hush-oh': hashOf(tokA) } })).status, 201);
  assert.equal((await http('DELETE', `/media/${G}/mForwardOwn01`, { t: tbG, headers: { 'x-hush-ot': tokB } })).status, 403, 'another member\'s token opens nothing');
  assert.equal((await http('DELETE', `/media/${G}/mForwardOwn01`, { t: tbG, headers: { 'x-hush-ot': tokA } })).body.n, 1, 'the forwarder\'s token does (whoever holds it)');
  assert.equal((await http('POST', `/media/${G}/mForwardOwn02/copy`, { t: tbG, headers: { 'x-hush-from': `${G}/${mid}`, 'x-hush-from-ticket': tbG, 'x-hush-oh': hashOf(tokB) } })).status, 201, 'bob forwards alice\'s file within the group');
  assert.equal((await http('DELETE', `/media/${G}/mForwardOwn02`, { t: tbG, headers: { 'x-hush-ot': tokB } })).body.n, 1, 'and owns the copy, not the uploader');
  await http('DELETE', `/media/${G}/${mid}`, { t: tg });
  assert.equal((await http('GET', `/media/${G}/mForwardCopy2/0`, { t: tg })).status, 200, 'each copy lives on its own');
  assert.equal((await http('POST', `/media/${CH}/mMissing00001/copy`, { t: tc, headers: from })).status, 404, 'the source is gone');
  assert.equal((await http('POST', `/media/${CH}/mMissing00002/copy`, { t: tc, headers: { ...from, 'x-hush-from': G } })).status, 400);
});

test('a page on another origin is answered for CORS', async () => {
  const r = await fetch(S.httpUrl + `/media/${G}/${MID}/0`, { method: 'OPTIONS', headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PUT' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.match(r.headers.get('access-control-allow-headers'), /authorization/);
  assert.match(r.headers.get('access-control-allow-headers'), /x-hush-oh, x-hush-ot/, 'the media token headers may cross origins');
  assert.match(r.headers.get('access-control-allow-methods'), /PUT/);
});

// ---- release 62: the server-wide guard, the daily budgets, and a database that is really full ----
const post = () => ({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: 'a'.repeat(64), on: 0 });
const events = (lines) => lines.filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));

test('all media together has a cap: 507 full for the server, and a delete makes room again', async () => {
  const T = await startServer({ authz: 'standard', limits: { media: { ...SMALL, maxMediaBytes: 3000 } }, diskFree: () => disk });
  try {
    const A = await signup(T.url, await makeIdentity('alice')), cid = 'gTotal0000001', at = T;
    await createChat(A, cid, groupDoc());
    const t = await ticket(A, cid), from = { 'x-hush-from': `${cid}/mTotal0000001`, 'x-hush-from-ticket': t };
    assert.equal((await http('PUT', `/media/${cid}/mTotal0000001/0`, { t, body: piece(1000), at })).status, 201);
    assert.equal((await http('PUT', `/media/${cid}/mTotal0000002/0`, { t, body: piece(1000), at })).status, 201);
    const over = await http('PUT', `/media/${cid}/mTotal0000003/0`, { t, body: piece(1000), at });
    assert.equal(over.status, 507); assert.equal(over.body.e, 'full'); assert.equal(over.body.scope, 'server');
    assert.equal((await http('POST', `/media/${cid}/mTotal0000004/copy`, { t, headers: from, at })).status, 507, 'a forward counts the same');
    assert.equal((await http('DELETE', `/media/${cid}/mTotal0000001`, { t, at })).body.n, 1);
    assert.equal((await http('PUT', `/media/${cid}/mTotal0000003/0`, { t, body: piece(1000), at })).status, 201, 'room again');
    assert.deepEqual(T.srv.store.mediaStats(), { bytes: 2032, ids: 2 }, 'what the daily media.stats line reports');
    await A.close();
  } finally { await T.stop(); }
});

test('the disk is looked at again once enough was admitted, even inside the cache, and a flip is logged once', async () => {
  let d = { free: 50e9, total: 100e9 }, calls = 0; const lines = [];
  const T = await startServer({ authz: 'standard', limits: { media: { ...SMALL, diskCheckMs: 1e9, diskCheckBytes: 3000 } }, diskFree: () => { calls++; return d; } });
  log.setSink((l) => lines.push(l)); log.setEnabled(true);
  try {
    const A = await signup(T.url, await makeIdentity('alice')), cid = 'gLook00000001', at = T;
    await createChat(A, cid, groupDoc());
    const t = await ticket(A, cid), put = (i) => http('PUT', `/media/${cid}/mLook00000001/${i}`, { t, body: piece(1000), at });
    assert.equal((await put(0)).status, 201); assert.equal(calls, 1);
    d = { free: 1e9, total: 100e9 };
    assert.equal((await put(1)).status, 201, 'the last answer stands'); assert.equal(calls, 1);
    assert.equal((await put(2)).status, 201); assert.equal(calls, 1);
    const r = await put(3);   // 3084 bytes admitted since the look: asked again before this one
    assert.equal(r.status, 507); assert.equal(r.body.scope, 'server'); assert.equal(calls, 2);
    assert.equal((await put(3)).status, 507, 'and cached again'); assert.equal(calls, 2);
    assert.deepEqual(events(lines).map((e) => [e.event, e.level, e.ok, e.freePct]), [['media.disk', 'warn', false, 1]], 'the flip is logged once, numbers only');
    await A.close();
  } finally { log.setEnabled(false); await T.stop(); }
});

test('an account and an address each have a daily upload budget; a forward is charged like an upload', async () => {
  const T = await startServer({ authz: 'standard', limits: { media: { ...SMALL, uploadBytesPerDayPerAcct: 2500, uploadBytesPerDayPerAddr: 4000 } }, diskFree: () => disk });
  try {
    const [alice, bob, carol] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('carol')]);
    const A = await signup(T.url, alice), B = await signup(T.url, bob), C = await signup(T.url, carol), cid = 'gBudget000001', at = T;
    const { caps } = await createChat(A, cid, groupDoc());
    await B.ok('chat.open', { cid, cap: caps.m }); await C.ok('chat.open', { cid, cap: caps.m });
    const ta = await ticket(A, cid), tb = await ticket(B, cid), tc = await ticket(C, cid), far = { 'x-forwarded-for': '203.0.113.9' };
    const put = (t, mid, i, headers) => http('PUT', `/media/${cid}/${mid}/${i}`, { t, body: piece(1000), at, headers });
    assert.equal((await put(ta, 'mBudgetA00001', 0)).status, 201);
    assert.equal((await put(ta, 'mBudgetA00001', 1)).status, 201);
    const r = await put(ta, 'mBudgetA00001', 2);
    assert.equal(r.status, 429); assert.equal(r.body.e, 'ratelimit'); assert.match(r.body.m, /today/);
    assert.equal((await put(tb, 'mBudgetB00001', 0)).status, 201, 'bob has his own account budget...');
    assert.equal((await put(tb, 'mBudgetB00001', 1)).status, 429, '...but shares alice\'s address, whose day is used up');
    assert.equal((await put(tc, 'mBudgetC00001', 0, far)).status, 201, 'carol, from elsewhere');
    const copy = (mid) => http('POST', `/media/${cid}/${mid}/copy`, { t: tc, headers: { 'x-hush-from': `${cid}/mBudgetC00001`, 'x-hush-from-ticket': tc, ...far }, at });
    assert.equal((await copy('mBudgetC00002')).status, 201);
    assert.equal((await copy('mBudgetC00003')).status, 429, '1028 + 1016 + 1016 would pass her 2500');
    await A.close(); await B.close(); await C.close();
  } finally { await T.stop(); }
});

test('a full media.db: the put answers 500, nothing is half stored, the socket and hush.db go on, a delete makes room, one media.failed line', async () => {
  const lines = [];
  const T = await startServer({ authz: 'standard', limits: { media: { ...SMALL, pieceBytes: 4096, fileBytes: 50e6, chatBytes: 1e9 } }, diskFree: () => disk, mediaMaxPages: 24 });
  log.setSink((l) => lines.push(l)); log.setEnabled(true);
  try {
    const A = await signup(T.url, await makeIdentity('alice')), cid = 'gFull00000001', mid = 'mFull00000001', at = T;
    await createChat(A, cid, groupDoc());
    const t = await ticket(A, cid);
    let created = 0, failed = null;
    for (let i = 0; i < 100 && !failed; i++) {
      const r = await http('PUT', `/media/${cid}/${mid}/${i}`, { t, body: piece(3000), at });
      if (r.status === 201) created++; else failed = r;
    }
    assert.ok(created > 0 && failed, 'some pieces fit, then the database is full');
    assert.equal(failed.status, 500);
    assert.deepEqual(failed.body, { ok: false, e: 'internal', m: 'internal error' });
    const db = T.srv.store.media;
    assert.equal(Number(db.prepare('SELECT COUNT(*) AS n FROM chunks WHERE cid = ? AND mid = ?').get(cid, mid).n), created, 'no half-stored piece');
    assert.equal(T.srv.store.mediaIdBytes(cid, mid), created * 3016, 'the size record agrees with the pieces');
    assert.equal((await A.call('set', { p: `channels/${cid}/posts/pFull0000001`, d: post() })).ok, true, 'hush.db still writes');
    assert.equal(typeof (await A.ok('ping')).now, 'number', 'the socket is open');
    assert.equal((await http('DELETE', `/media/${cid}/${mid}`, { t, at })).body.n, created);
    assert.equal((await http('PUT', `/media/${cid}/mFull00000002/0`, { t, body: piece(3000), at })).status, 201, 'room again');
    assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.deepEqual(events(lines).map((e) => [e.event, e.level]), [['media.failed', 'error']], 'one line for the failed put, nothing else');
    await A.close();
  } finally { log.setEnabled(false); await T.stop(); }
});
