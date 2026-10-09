// A newly added member's live session receives the group. Run with the page's own adapter against a real
// server under the standard policy: A creates a chat and leaves B a sealed pointer; B's open inbox watch gets
// it at once, without a reload; and B's watch on the chat record tells "no key for this device yet" apart from
// "this chat is gone", so the pointer is kept until the key arrives. Also pins down the page's rule for what
// to do with a pointer (the HUSH INBOX RULE block), which is the piece that used to delete the invitation.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

import { startServer, sleep, makeIdentity, signText, directoryDoc, groupDoc, CAPS, CID, appSource } from './helpers.js';

const html = appSource();
function lift(from, to) {
  const a = html.indexOf(from); assert.ok(a > 0, `the page's files contain ${JSON.stringify(from)}`);
  const b = html.indexOf(to, a + from.length); assert.ok(b > a, `the page's files contain ${JSON.stringify(to)}`);
  return html.slice(a, b);
}
const createHushAdapter = new Function(lift('/* ===== HUSH ADAPTER BEGIN ===== */', '/* ===== HUSH ADAPTER END ===== */') + '\nreturn createHushAdapter;')();
const pointerVerdict = new Function(lift('/* ===== HUSH INBOX RULE BEGIN ===== */', '/* ===== HUSH INBOX RULE END ===== */') + '\nreturn pointerVerdict;')();

const proofOf = (id) => ({ h: id.handle, pub: id.sig, dev: '', signDev: null, signAcct: (m) => signText(id.sigKey, m) });
async function signUp(db, id) { await db.prove(proofOf(id)); await db.doc('directory/' + id.handle).set(directoryDoc(id)); }
// A note as the page sends one: an ECDH wrap of a plaintext padded to the fixed size. The server checks only the shape.
const note = () => ({ epk: { x: 'x'.repeat(43), y: 'y'.repeat(43) }, iv: 'aXY=', ct: Buffer.alloc(1040).toString('base64') });
// Stage 5: a note to someone else is an anonymous POST /drop, never a write over the sender's own connection.
async function drop(httpUrl, to) {
  const r = await fetch(httpUrl + '/drop', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ to, blob: note() }) });
  const o = await r.json(); assert.equal(o.ok, true, 'drop accepted'); return o.id;
}
async function until(fn, what, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(50); }
  throw new Error('timed out waiting for ' + what);
}

test('the rule for a pointer: keep it while no key has arrived yet, drop it only when the chat is gone or we were removed', () => {
  assert.equal(pointerVerdict({ exists: true, mine: true, held: false }), 'show', 'readable: show it');
  assert.equal(pointerVerdict({ exists: true, mine: true, held: true }), 'show');
  assert.equal(pointerVerdict({ exists: true, mine: false, held: false }), 'wait', 'exists but this device could never open it: the wrap may still be coming');
  assert.equal(pointerVerdict({ exists: true, mine: false, held: true }), 'forget', 'we had a key once and now do not: removed');
  assert.equal(pointerVerdict({ exists: false, mine: false, held: false }), 'forget', 'the chat is gone');
  assert.equal(pointerVerdict({ exists: false, mine: false, held: true }), 'forget');
  assert.equal(pointerVerdict({ exists: false, mine: false, held: false, fresh: true }), 'wait', 'a note can overtake the record it names: give the sender a moment');
  assert.equal(pointerVerdict({ exists: false, mine: false, held: true, fresh: true }), 'wait');
});

test('a member who is online when added receives the group live, and keeps it until this device can open it', async () => {
  const S = await startServer({ authz: 'standard' });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  let bobCap = null; // what Bob's page would hand the adapter: nothing until a wrap for this device can be opened
  const A = createHushAdapter(S.url, { WebSocket, onStatus: () => {} });
  const B = createHushAdapter(S.url, { WebSocket, onStatus: () => {}, caps: () => bobCap });
  try {
    await A.ready; await B.ready;
    await signUp(A, alice); await signUp(B, bob);
    assert.equal(B.proven, 'bob');

    // Bob's inbox is being watched, as it is for the whole time the page is open.
    const inbox = [];
    const unInbox = B.collection('inbox/bob/c').limit(500).onSnapshot((s) => inbox.push(s.docs.map((d) => d.id)));
    await until(() => inbox.length >= 1, 'inbox init');
    assert.deepEqual(inbox[0], [], 'nothing yet');

    // Alice creates the group and drops Bob a note, exactly what the New group sheet does.
    const caps = CAPS();
    await A.createChat(CID, groupDoc(), caps);
    await assert.rejects(A.doc('inbox/bob/c/pointer00001').set({ ...note(), ts: 0 }), (e) => e.code === 'denied', 'over her own connection she may not: that would tie her to Bob');
    const noteId = await drop(S.httpUrl, 'bob');
    await until(() => inbox.some((ids) => ids.includes(noteId)), 'the note to reach Bob live');
    assert.ok(!inbox[0].includes(noteId), 'it arrived by push after the initial view, no reload involved');

    // Bob's page now watches the chat record. His device holds no wrap yet: the watch must still say the chat exists.
    const seen = [];
    const unChat = B.doc('channels/' + CID).onSnapshot((s) => seen.push({ exists: s.exists, full: !!(s.data() && s.data().meta) }));
    await until(() => seen.length >= 1, 'first view of the chat');
    assert.deepEqual(seen[0], { exists: true, full: false }, 'the trimmed record anyone signed in may read: exists, but no sealed contents');
    assert.equal(pointerVerdict({ exists: seen[0].exists, mine: false, held: false }), 'wait', 'so the page keeps the pointer');

    // The wrap for this device arrives (here: Bob simply obtains the member key). The retry opens the chat and the watch goes live.
    bobCap = caps.m;
    assert.equal(await B.refreshChat(CID), true);
    await until(() => seen.some((v) => v.full), 'the full record once the chat is open');
    assert.equal(B.chatLevel(CID), 'member');
    assert.equal(pointerVerdict({ exists: true, mine: true, held: true }), 'show');

    // A chat that really is gone is reported as such, so the pointer can be tidied away.
    const gone = [];
    B.doc('channels/' + 'g' + 'Z'.repeat(12)).onSnapshot((s) => gone.push(s.exists));
    await until(() => gone.length >= 1, 'view of a missing chat');
    assert.equal(gone[0], false);
    assert.equal(pointerVerdict({ exists: false, mine: false, held: false }), 'forget');
    unInbox(); unChat();
  } finally { A.close(); B.close(); await S.stop(); }
});
