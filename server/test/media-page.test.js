// The page's side of stage 6: the media encryption block (lifted from app/crypto.js) and the adapter's HTTP media
// calls against a real server, ticket renewal included.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

import { startServer, makeIdentity, signText, directoryDoc, groupDoc, CAPS, appSource } from './helpers.js';

const html = appSource();
const lift = (name, ret) => {
  const a = html.indexOf(`/* ===== HUSH ${name} BEGIN ===== */`), b = html.indexOf(`/* ===== HUSH ${name} END ===== */`);
  assert.ok(a > 0 && b > a, name + ' block found');
  return new Function(html.slice(a, b) + `\nreturn ${ret};`)();
};
const M = lift('MEDIA', '{newMediaKey,mediaKeyOf,sealPiece,openPiece,pieceHash,mediaRoot}');
const createHushAdapter = lift('ADAPTER', 'createHushAdapter');
const proofOf = (id) => ({ h: id.handle, pub: id.sig, dev: '', signDev: null, signAcct: (m) => signText(id.sigKey, m) });
const bytes = (n, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 31 + seed) & 255);

test('each file has its own key; a piece opens only at its own place in its own file', async () => {
  const { k, key } = await M.newMediaKey();
  assert.equal(Buffer.from(k, 'base64').length, 32);
  const plain = bytes(5000), body = await M.sealPiece(key, 1, 3, plain);
  assert.equal(body.length, 12 + 5000 + 16, 'iv, ciphertext, tag');
  const reader = await M.mediaKeyOf(k);
  assert.deepEqual(await M.openPiece(reader, 1, 3, body), plain);
  await assert.rejects(M.openPiece(reader, 0, 3, body), 'moved to another place');
  await assert.rejects(M.openPiece(reader, 1, 2, body), 'the file cut short');
  const other = await M.mediaKeyOf((await M.newMediaKey()).k);
  await assert.rejects(M.openPiece(other, 1, 3, body), 'another file\'s key');
  const bad = body.slice(); bad[40] ^= 1;
  await assert.rejects(M.openPiece(reader, 1, 3, bad), 'changed in transit');
  await assert.rejects(M.mediaKeyOf('c2hvcnQ='), 'a key must be 32 bytes');
});

test('the file hash is over the pieces in order', async () => {
  const h = await Promise.all([bytes(10, 1), bytes(10, 2)].map(M.pieceHash));
  const a = await M.mediaRoot(h), b = await M.mediaRoot([h[1], h[0]]);
  assert.match(a, /^[A-Za-z0-9+/]{43}=$/);
  assert.notEqual(a, b);
  assert.equal(a, await M.mediaRoot(h));
});

test('the adapter uploads, reads, copies and deletes media over HTTP, renewing its ticket when needed', async () => {
  const S = await startServer({ authz: 'standard' });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  const caps = CAPS(), G = 'gPageMedia001', H = 'gPageMedia002', capsH = CAPS();
  const A = createHushAdapter(S.url, { WebSocket, onStatus: () => {}, caps: (cid) => (cid === G ? caps.o : capsH.o) });
  const B = createHushAdapter(S.url, { WebSocket, onStatus: () => {}, caps: (cid) => (cid === G ? caps.m : null) });
  try {
    await A.ready; await B.ready;
    await A.prove(proofOf(alice)); await A.doc('directory/alice').set(directoryDoc(alice));
    await B.prove(proofOf(bob)); await B.doc('directory/bob').set(directoryDoc(bob));
    await A.createChat(G, groupDoc(), caps);
    await A.createChat(H, groupDoc(), capsH);
    const lim = await B.mediaLimits();
    assert.equal(lim.videoBytes, 500e6);
    const { key } = await M.newMediaKey();
    const p0 = await M.sealPiece(key, 0, 2, bytes(2000)), p1 = await M.sealPiece(key, 1, 2, bytes(10));
    assert.equal(await A.putPiece(G, 'mPageMedia001', 0, p0), true);
    assert.equal(await A.putPiece(G, 'mPageMedia001', 1, p1, Date.now() + 3600e3), true);
    assert.equal(await A.putPiece(G, 'mPageMedia001', 0, p0), false, 'a retry of the same piece');
    assert.deepEqual(await B.getPiece(G, 'mPageMedia001', 0), p0, 'bob reads with his member key');
    await assert.rejects(B.putPiece(G, 'mPageMedia001', 1, p0), (e) => e.code === 'conflict');
    S.srv.tickets.map.clear();                                    // every ticket gone (as after ten minutes)
    assert.deepEqual(await B.getPiece(G, 'mPageMedia001', 1), p1, 'a fresh ticket is fetched by itself');
    await assert.rejects(B.getPiece(H, 'mPageMedia001', 0), (e) => e.code === 'denied', 'no key for that chat, no media');
    assert.equal(await A.copyMedia(G, 'mPageMedia001', H, 'mPageMedia002'), true);
    assert.deepEqual(await A.getPiece(H, 'mPageMedia002', 0), p0);
    assert.equal(await A.deleteMedia(G, 'mPageMedia001'), 2);
    await assert.rejects(B.getPiece(G, 'mPageMedia001', 0), (e) => e.code === 'notfound');
    assert.equal(B.limits.voiceSeconds, 900, 'the ticket reply carries the limits too');
  } finally { A.close(); B.close(); await S.stop(); }
});
