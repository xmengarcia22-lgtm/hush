// Runs the browser adapter from the page (app/adapter.js), as written, against a real server.
// The adapter block is pure JavaScript with no DOM dependencies, so it can be
// lifted out of the page and evaluated here with the `ws` client standing in
// for the browser's WebSocket.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import WebSocket from 'ws';

import { startServer, sleep, makeIdentity, makeDevice, signText, directoryDoc, CAPS, cap, label, wrap, sealed, groupDoc, CID, PID, appSource } from './helpers.js';

const BEGIN = '/* ===== HUSH ADAPTER BEGIN ===== */';
const END = '/* ===== HUSH ADAPTER END ===== */';
const html = appSource();
const a = html.indexOf(BEGIN), b = html.indexOf(END);
assert.ok(a > 0 && b > a, 'adapter markers present in the page\'s files');
const createHushAdapter = new Function(html.slice(a + BEGIN.length, b) + '\nreturn createHushAdapter;')();

const sha = (s) => createHash('sha256').update(s).digest('hex');
const post = (over = {}) => ({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha('t0'), on: 0, ...over });
const alice = { handle: 'alice', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' }, name: 'Alice' };
const bob = { handle: 'bob', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' } };

function openAdapter(url, extra = {}) {
  const statuses = [];
  const db = createHushAdapter(url, { WebSocket, onStatus: (on) => statuses.push(on), ...extra });
  db.statuses = statuses;
  return db;
}

test('documents: set, get, update, delete, add, and the Firestore-shaped snapshots', async () => {
  const S = await startServer();
  const db = openAdapter(S.url);
  try {
    await db.ready;
    assert.equal(db.online, true);
    assert.equal(db.flat, true);
    const ref = db.doc('directory/alice');
    await ref.set(alice);
    let s = await ref.get();
    assert.equal(s.exists, true);
    assert.equal(s.id, 'alice');
    assert.deepEqual(s.data(), alice);
    assert.notEqual(s.data(), s.data(), 'each data() call hands out a fresh copy');
    assert.deepEqual(s.metadata, { hasPendingWrites: false, fromCache: false });
    await ref.update({ name: null, bio: 'hi', devs: { d1aaaaaa: { x: 'a', y: 'b', sx: 'c', sy: 'd', s: 'e' } } });
    s = await ref.get();
    assert.equal(s.data().name, undefined);
    assert.equal(s.data().bio, 'hi');
    await ref.delete();
    s = await ref.get();
    assert.equal(s.exists, false);
    assert.equal(s.data(), null);
    const added = await db.collection(`channels/${CID}/posts`).add({ sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' });
    assert.match(added.id, /^[A-Za-z0-9]{12}$/);
    assert.equal((await db.doc(`channels/${CID}/posts/${added.id}`).get()).data().sv, 1);
    await assert.rejects(db.doc('directory/bob').update({ bio: 'x' }), (e) => e.code === 'notfound');
    await assert.rejects(db.doc('directory/bob').set({ handle: 'bob' }), (e) => e.code === 'invalid');
  } finally { db.close(); await S.stop(); }
});

test('queries: where, orderBy, limit, and snapshot size', async () => {
  const S = await startServer();
  const db = openAdapter(S.url);
  try {
    await db.ready;
    const base = Date.now();
    const col = db.collection(`channels/${CID}/posts`);
    for (let k = 0; k < 4; k++) await col.doc('qPost000000' + k).set(post({ ts: base + k * 1000 }));
    const newest = await col.orderBy('ts', 'desc').limit(2).get();
    assert.equal(newest.size, 2);
    assert.deepEqual(newest.docs.map((d) => d.data().ts), [base + 3000, base + 2000]);
    const older = await col.where('ts', '<', base + 2000).orderBy('ts', 'desc').limit(200).get();
    assert.deepEqual(older.docs.map((d) => d.id), ['qPost0000001', 'qPost0000000']);
    const pub = await db.collection('channels').where('visibility', '==', 'public').limit(100).get();
    assert.equal(pub.empty, true);
  } finally { db.close(); await S.stop(); }
});

test('watching one document: exists flips as it is created and deleted', async () => {
  const S = await startServer();
  const db = openAdapter(S.url);
  const other = openAdapter(S.url);
  try {
    await Promise.all([db.ready, other.ready]);
    const seen = [];
    const un = db.doc(`channels/${CID}`).onSnapshot((snap) => seen.push([snap.exists, snap.exists ? snap.data().ts : null]));
    await sleep(100);
    assert.deepEqual(seen, [[false, null]]);
    await other.doc(`channels/${CID}`).set({ type: 'group', visibility: 'private', epoch: 0, ts: 1 });
    await sleep(100);
    await other.doc(`channels/${CID}`).update({ ts: 2 });
    await sleep(100);
    await other.doc(`channels/${CID}`).delete();
    await sleep(100);
    assert.deepEqual(seen, [[false, null], [true, 1], [true, 2], [false, null]]);
    un();
    await other.doc(`channels/${CID}`).set({ type: 'group', ts: 3 });
    await sleep(100);
    assert.equal(seen.length, 4, 'no callbacks after unsubscribe');
  } finally { db.close(); other.close(); await S.stop(); }
});

test('live query: pending writes show immediately, then settle; other clients see pushes', async () => {
  const S = await startServer();
  const db = openAdapter(S.url);
  const other = openAdapter(S.url);
  try {
    await Promise.all([db.ready, other.ready]);
    const snaps = [];
    db.collection(`channels/${CID}/posts`).orderBy('ts', 'desc').limit(300).onSnapshotMeta((s) => snaps.push(s.docs.map((d) => [d.id, d.metadata.hasPendingWrites])));
    await sleep(100);
    assert.deepEqual(snaps, [[]]);
    const p = db.doc(`channels/${CID}/posts/${PID}`).set(post());
    await Promise.resolve();   // callbacks are delivered on a microtask, never inside the write call
    assert.deepEqual(snaps[1], [[PID, true]], 'the local write appears before the server answers');
    await p;
    await sleep(50);
    assert.deepEqual(snaps[snaps.length - 1], [[PID, false]], 'and settles once confirmed');
    const theirs = [];
    other.collection(`channels/${CID}/posts`).orderBy('ts', 'desc').limit(300).onSnapshot((s) => theirs.push(s.docs.map((d) => d.id)));
    await sleep(100);
    assert.deepEqual(theirs, [[PID]]);
    await db.doc(`channels/${CID}/posts/${PID}`).update({ d: 'edited', ot: 't0', oh: sha('t1'), on: 1 });
    await assert.rejects(db.doc(`channels/${CID}/posts/${PID}`).delete(), (e) => e.code === 'denied', 'a sealed post cannot be deleted without its token');
    // the app wipes with the token first, then deletes; the server allows the delete once the post is wiped
    await db.doc(`channels/${CID}/posts/${PID}`).update({ del: true, n: '', d: '', oh: '', on: 2, ot: 't1' });
    await db.doc(`channels/${CID}/posts/${PID}`).delete();
    await db.collection(`channels/${CID}/posts`).add({ sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' });
    await sleep(150);
    assert.equal(theirs[theirs.length - 1].length, 1, 'the other client ends with just the service note');
    assert.ok(theirs.some((ids) => ids.length === 0), 'and saw the delete in between');
  } finally { db.close(); other.close(); await S.stop(); }
});

test('directory and presence reads issued together travel as one mget', async () => {
  const S = await startServer();
  const ops = {};
  class CountingWS extends WebSocket {
    send(data) { const op = JSON.parse(data).op; ops[op] = (ops[op] || 0) + 1; return super.send(data); }
  }
  const db = createHushAdapter(S.url, { WebSocket: CountingWS });
  try {
    await db.ready;
    await db.doc('directory/alice').set(alice);
    await db.doc('directory/bob').set(bob);
    const [x, y, z] = await Promise.all([db.doc('directory/alice').get(), db.doc('directory/bob').get(), db.doc('presence/carol').get()]);
    assert.equal(x.data().name, 'Alice');
    assert.equal(y.exists, true);
    assert.equal(z.exists, false);
    assert.equal(ops.mget, 1);
    assert.equal(ops.get, undefined);
  } finally { db.close(); await S.stop(); }
});

test('when the server is unreachable, calls fail with "offline" and subscriptions wait', async () => {
  const dead = 'ws://127.0.0.1:1/ws';
  const db = openAdapter(dead, { offlineWaitMs: 300 });
  try {
    await assert.rejects(db.doc('directory/alice').get(), (e) => e.code === 'offline');
    let fired = 0;
    db.doc('directory/alice').onSnapshot(() => { fired++; }, () => { fired = -100; });
    await sleep(400);
    assert.equal(fired, 0, 'no error callback for a connection problem');
    assert.equal(db.online, false);
  } finally { db.close(); }
});

// What the page hands the adapter: the handle, the account public key, and signers for the device and account keys.
const proofFor = (id, dev = null) => ({
  h: id.handle, pub: id.sig, dev: dev ? dev.id : '',
  signDev: dev ? (m) => signText(dev.sigKey, m) : null,
  signAcct: (m) => signText(id.sigKey, m),
});

test('identity: the adapter proves on request, prefers the device key, survives restarts, and switches accounts cleanly', async () => {
  const S1 = await startServer({ authz: 'standard' });
  const port = Number(new URL(S1.url).port);
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  const myCaps = CAPS();
  const db = openAdapter(S1.url, { offlineWaitMs: 5000, caps: async () => myCaps.o });
  let S2 = null;
  try {
    await db.ready;
    await assert.rejects(db.doc('directory/alice').set(directoryDoc(alice)), (e) => e.code === 'unauth', 'nothing is proven yet');
    await db.prove(proofFor(alice));                              // sign-up: no profile yet, so the account key with pub is used
    assert.equal(db.proven, 'alice');
    await db.doc('directory/alice').set(directoryDoc(alice));
    await db.doc('presence/alice').set({ ts: Date.now() });
    const dev = await makeDevice(alice);
    await db.doc('directory/alice').update({ devs: { [dev.id]: dev.entry } });
    await db.prove(proofFor(alice, dev));                         // same account: nothing happens
    assert.equal(db.proven, 'alice');
    await S1.stop();                                               // restart: a new server, empty data
    S2 = await startServer({ authz: 'standard', port });
    // On reconnect the adapter proves again on its own. The device key is refused (no profile there yet),
    // so it falls back to the account key, which claims the username afresh on the empty server.
    await db.doc('directory/alice').set(directoryDoc(alice));
    assert.equal(db.proven, 'alice');
    assert.equal(db.identityError, null);
    await db.doc('directory/alice').update({ devs: { [dev.id]: dev.entry } });
    await db.createChat(CID, groupDoc(), myCaps);
    const seen = [];
    db.doc(`channels/${CID}`).onSnapshot((s) => seen.push(s.exists));
    await sleep(150);
    assert.deepEqual(seen, [true]);
    await db.prove(proofFor(bob));                                // switching accounts
    assert.equal(db.proven, 'bob');
    await db.doc('directory/bob').set(directoryDoc(bob));
    await assert.rejects(db.doc('directory/alice').update({ bio: 'x' }), (e) => e.code === 'denied');
    await db.doc(`channels/${CID}`).update({ ts: 2 });            // bob still holds the owner key in this test, so this goes through
    await sleep(100);
    assert.deepEqual(seen, [true], 'subscriptions of the previous account were dropped silently');
    await db.prove(null);                                          // signed out
    await sleep(100);
    assert.equal(db.proven, null);
    await assert.rejects(db.doc('presence/bob').set({ ts: 1 }), (e) => e.code === 'unauth');
    const db2 = openAdapter(S2.url);                               // a fresh page load uses the device key
    await db2.ready;
    await db2.prove(proofFor(alice, dev));
    assert.equal(db2.proven, 'alice');
    await db2.doc('presence/alice').set({ ts: Date.now() });
    db2.close();
  } finally { db.close(); await S1.stop(); if (S2) await S2.stop(); }
});

test('room keys: the adapter opens chats with the key the app provides, and recovers from an eviction', async () => {
  const S = await startServer({ authz: 'standard' });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  const caps = CAPS();
  let bobKey = caps.m;                                            // what bob's "app" can derive right now
  const owner = openAdapter(S.url, { caps: async () => caps.o });
  const evicted = [];
  const member = openAdapter(S.url, { caps: async () => bobKey, onEvict: async (cid) => { evicted.push(cid); } });
  try {
    await Promise.all([owner.ready, member.ready]);
    await owner.prove(proofFor(alice)); await owner.doc('directory/alice').set(directoryDoc(alice));
    await member.prove(proofFor(bob)); await member.doc('directory/bob').set(directoryDoc(bob));
    await owner.createChat(CID, groupDoc(), caps);
    assert.equal(owner.chatLevel(CID), 'owner');
    const seen = [];
    member.collection(`channels/${CID}/posts`).orderBy('ts', 'desc').limit(50).onSnapshot((s) => seen.push(s.docs.length), () => seen.push('err'));
    await sleep(150);
    assert.deepEqual(seen, [0], 'the member opened the chat with the member key before subscribing');
    assert.equal(member.chatLevel(CID), 'member');
    await owner.doc(`channels/${CID}/posts/${PID}`).set({ sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' });
    await sleep(100);
    assert.deepEqual(seen, [0, 1]);
    const next = cap();
    bobKey = null;                                                 // bob was removed: his app can no longer derive a key
    await owner.rotateChat(CID, { epoch: 1, keys: { [label()]: wrap() }, cap: next, meta: sealed(1) });
    await sleep(200);
    assert.deepEqual(evicted, [CID]);
    assert.equal(seen[seen.length - 1], 'err', 'the live view ends with "no longer in this chat"');
    assert.equal(member.chatLevel(CID), null);
    bobKey = next;                                                 // a member who was re-added derives the new key and gets back in
    const again = [];
    member.collection(`channels/${CID}/posts`).orderBy('ts', 'desc').limit(50).onSnapshot((s) => again.push(s.docs.length));
    await sleep(150);
    assert.deepEqual(again, [1]);
    assert.equal(member.chatLevel(CID), 'member');
    const peek = await member.preview(CID);
    assert.equal(peek.exists, true);
    // A live view of a chat that does not exist yet shows as empty, then comes alive when the chat is created.
    const DM = 'd' + 'Q'.repeat(22);
    const dmCaps = { m: cap() };
    let dmKey = null;
    const waiter = openAdapter(S.url, { caps: async () => dmKey });
    await waiter.ready;
    await waiter.prove(proofFor(bob));
    const early = [];
    waiter.collection(`channels/${DM}/posts`).orderBy('ts', 'desc').limit(50).onSnapshot((s) => early.push(s.docs.length), () => early.push('err'));
    await sleep(150);
    assert.deepEqual(early, [0], 'empty, and no error');
    dmKey = dmCaps.m;
    await waiter.createChat(DM, { type: 'dm', epoch: 0, ts: Date.now(), last: null }, dmCaps);
    await waiter.doc(`channels/${DM}/posts/dMpOsT000001`).set({ sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' });
    await sleep(150);
    assert.deepEqual(early.slice(-1), [1], 'the parked subscription went live on creation');
    waiter.close();
  } finally { owner.close(); member.close(); await S.stop(); }
});

test('reconnects after the server restarts and re-establishes subscriptions', async () => {
  const S1 = await startServer();
  const port = Number(new URL(S1.url).port);
  const db = openAdapter(S1.url, { offlineWaitMs: 5000, offlineNoticeMs: 0 });   // report the outage at once (the page waits 1.5 s to avoid flicker)
  let S2 = null;
  try {
    await db.ready;
    await db.doc('directory/alice').set(alice);
    const seen = [];
    db.doc('directory/alice').onSnapshot((s) => seen.push(s.exists));
    await sleep(100);
    assert.deepEqual(seen, [true]);
    await S1.stop();                                   // data folder is gone with it
    await sleep(100);
    assert.equal(db.online, false);
    S2 = await startServer({ port });
    const again = await db.doc('directory/alice').get();   // waits for the reconnect
    assert.equal(again.exists, false, 'fresh server, fresh data');
    assert.equal(db.online, true);
    await sleep(100);
    assert.deepEqual(seen, [true, false], 'the subscription was re-sent and reported the new state');
    assert.deepEqual(db.statuses, [true, false, true]);
  } finally { db.close(); if (S2) await S2.stop(); }
});
