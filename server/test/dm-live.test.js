// A new DM reaches the other person's open window (requests off). The sender's first message moves the DM to a
// fresh key (epoch 1) at once; the recipient's page still opens it with the base key both sides derive from their
// account keys. Before the fix the server forgot that base key on rotation, refused the recipient's watch, and the
// page deleted the note: the chat never appeared in the list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

import { startServer, sleep, makeIdentity, signText, directoryDoc, cap, label, wrap, DMID, appSource } from './helpers.js';

const html = appSource();
const a = html.indexOf('/* ===== HUSH ADAPTER BEGIN ===== */'), b = html.indexOf('/* ===== HUSH ADAPTER END ===== */');
const createHushAdapter = new Function(html.slice(a, b) + '\nreturn createHushAdapter;')();
const proofOf = (id) => ({ h: id.handle, pub: id.sig, dev: '', signDev: null, signAcct: (m) => signText(id.sigKey, m) });
async function until(fn, what, ms = 3000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); } throw new Error('timed out waiting for ' + what); }

test('a DM from before base keys were kept: a member records it once, and then the other side can open it', async () => {
  const S = await startServer({ authz: 'standard' });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  const base = cap(), next = cap();
  let aliceCap = base;
  const A = createHushAdapter(S.url, { WebSocket, onStatus: () => {}, caps: () => aliceCap });
  const B = createHushAdapter(S.url, { WebSocket, onStatus: () => {}, caps: () => base });
  try {
    await A.ready; await B.ready;
    await A.prove(proofOf(alice)); await A.doc('directory/alice').set(directoryDoc(alice));
    await B.prove(proofOf(bob)); await B.doc('directory/bob').set(directoryDoc(bob));
    await A.createChat(DMID, { type: 'dm', epoch: 0, ts: Date.now(), last: null }, { m: base });
    await A.rotateChat(DMID, { epoch: 1, keys: { [label()]: wrap() }, cap: next });
    S.srv.store.db.prepare('UPDATE chats SET cap_b = NULL WHERE cid = ?').run(DMID);   // as servers before the fix left it
    aliceCap = next;
    assert.equal(await B.refreshChat(DMID), false, 'before: Bob\'s base key is refused');
    await assert.rejects(A.createChat(DMID, { type: 'dm', epoch: 0, ts: Date.now(), last: null }, { m: base }), (e) => e.code === 'exists', 'recreating it is refused: this was the "Not sent"');
    await assert.rejects(B.setBase(DMID, base), (e) => e.code === 'denied', 'someone who cannot open the DM may not record a base key');
    assert.deepEqual(await A.setBase(DMID, base).then((r) => r.recorded), true, 'Alice, who holds the current key, records it');
    assert.equal(await B.refreshChat(DMID), true, 'after: Bob opens it with the base key');
    assert.equal(B.chatLevel(DMID), 'member');
    assert.deepEqual(await A.setBase(DMID, base).then((r) => r.recorded), false, 'recording again is a no-op');
    await assert.rejects(A.setBase(DMID, cap()), (e) => e.code === 'conflict', 'and a recorded base key can never be replaced');
  } finally { A.close(); B.close(); await S.stop(); }
});

test('a DM moved to a fresh key still opens with its base key, so the recipient\'s live watch sees it', async () => {
  const S = await startServer({ authz: 'standard' });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  const base = cap(), next = cap();
  const A = createHushAdapter(S.url, { WebSocket, onStatus: () => {}, caps: () => base });
  const B = createHushAdapter(S.url, { WebSocket, onStatus: () => {}, caps: () => base });   // Bob's page knows only the base key yet
  try {
    await A.ready; await B.ready;
    await A.prove(proofOf(alice)); await A.doc('directory/alice').set(directoryDoc(alice));
    await B.prove(proofOf(bob)); await B.doc('directory/bob').set(directoryDoc(bob));
    // Alice's first message: create the DM with the base key, then rotate it to epoch 1, as ensureDmEpoch does.
    await A.createChat(DMID, { type: 'dm', epoch: 0, ts: Date.now(), last: null }, { m: base });
    await A.rotateChat(DMID, { epoch: 1, keys: { [label()]: wrap() }, cap: next });
    // Bob's inbox watcher now watches the record. It must be served in full, not refused.
    const seen = [], errs = [];
    B.doc('channels/' + DMID).onSnapshot((s) => seen.push({ exists: s.exists, epoch: s.data() && s.data().epoch }), (e) => errs.push(e.code));
    await until(() => seen.length || errs.length, 'Bob\'s first view of the DM');
    assert.deepEqual(errs, [], 'the watch was not refused');
    assert.deepEqual(seen[0], { exists: true, epoch: 1 });
    assert.equal(B.chatLevel(DMID), 'member', 'the base key opened it');
    // The base key never opens a group, and a wrong key still opens nothing.
    const C = createHushAdapter(S.url, { WebSocket, onStatus: () => {}, caps: () => cap() });
    try { await C.ready; await C.prove(proofOf(await makeIdentity('carol')));
      assert.equal(await C.refreshChat(DMID), false, 'a key that is neither the member key nor the base key opens nothing');
      assert.equal(C.chatLevel(DMID), null);
    } finally { C.close(); }
  } finally { A.close(); B.close(); await S.stop(); }
});
