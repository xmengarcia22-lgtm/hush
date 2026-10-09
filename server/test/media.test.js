// Media over HTTP (SPEC.md 7.7): tickets from the socket, raw encrypted pieces over HTTP, write-once pieces,
// the room-key gate checked on every request, the per-chat allowance, the disk guard, expiry, delete and copy.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { startServer, signup, makeIdentity, cap, label, wrap, groupDoc, channelDoc, createChat } from './helpers.js';
import { MEDIA_LIMITS, maxPieces } from '../src/limits.js';

const G = 'gMedia0000001', CH = 'cMedia0000001', MID = 'mPhoto0000001';
const SMALL = { pieceBytes: 1024, imageBytes: 4096, gifBytes: 4096, videoBytes: 10240, fileBytes: 10240, voiceBytes: 4096, chatBytes: 8000 };
let S, A, B, C, gCaps, chCaps, disk = { free: 50e9, total: 100e9 };

const piece = (n = 100) => randomBytes(12 + n + 16);                 // an iv, then ciphertext and tag
async function http(method, path, { t, body, headers = {} } = {}) {
  const r = await fetch(S.httpUrl + path, { method, body, headers: { ...(t ? { authorization: 'Hush ' + t } : {}), ...headers } });
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
  assert.equal((await http('DELETE', `/media/${cid}/mQuota0000001`, { t })).body.n, 7);
  assert.equal(S.srv.store.mediaBytes(cid), 0, 'deleting gives the allowance back');
  try {
    disk = { free: 20e9, total: 240e9 };
    assert.equal((await http('PUT', `/media/${cid}/mQuota0000002/0`, { t, body: piece() })).status, 201, 'under 10 % but 20 GB free: still fine');
    disk = { free: 3e9, total: 40e9 };
    const d = await http('PUT', `/media/${cid}/mQuota0000001/0`, { t, body: piece() });
    assert.equal(d.status, 507, 'under 10 % and under 5 GB free: no new media');
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
  assert.match(r.headers.get('access-control-allow-methods'), /PUT/);
});
