// Release 104, item 5 (SPEC.md 14.15): the one read after a lost reply, R9. R1 to R5 are in removal-nouse-read-a.test.js,
// R6 in removal-nouse-read-b.test.js, R7 and R8 in removal-nouse-read-c.test.js.
//
// The owner step of a device removal takes one of two ways in a private channel. Where this device never saw a list signed
// by the owner, the never-signed branch makes a fresh admin secret and signs nothing; the summary then says "Your admins in X
// can’t post or manage there right now." Where it saw one, rotateAdmins replaces the secret and signs the list again. The one
// read after a lost reply is for the second way only (R3: no read in a channel whose list was never signed).
//
// "This device saw a signed list" is the roles record's `s`, and the step asked for it twice: once to choose the way, once in
// the read's guard. The two answers can differ when the first signed copy is noted between them. The step then took the
// never-signed way AND the read: it ended "done" with nothing recorded, no mark and no line about the admins, although the
// list it left names no admin secret. From the owner's answer D (2026-11-12) the guard asks the step itself: a flag set when
// the never-signed branch is entered. R9 is that case.
//
// What R9 needs, said plainly. No path of the app signs a list while a removal's chats stage runs (the other devices are logged
// out, another tab waits, this page signs nothing in that branch), so the signed copy comes from a second holder of the
// account's new keys: a page over a copy of this device's store, as the refused sign-in's test has one (X1). Its clock is 5
// minutes and 4 seconds fast, so this device does not note its copy at first sight (the date limit, crypto.js noteRoles) but
// by a timer, about five seconds later. This device reads the record afresh in the chats stage, as after Hush was opened again
// (a run never interrupted keeps the copy of before). And the reply of the branch's write stays lost until the timer has
// noted the copy; a real time-out takes longer than that. Nothing in this device's page is forced: its own timer and its own
// check of the signature move the record.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { world, makeChannel } from './channel-history-kit.js';
import { level, draw, count, marks, newKeys, BOX, oldOf, plainBuild, run, within, until } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const timeout = () => Object.assign(new Error('timeout'), { code: 'timeout' });
// the admin-secret write lands and its reply is lost (the call ends as a time-out); `then` runs right after it landed.
// `signed`: what the roles record said at each admin-secret call, when the call was made
const lose = (A, cid, then) => { const real = A.S.db.setAdmins, st = { calls: 0, lost: false, signed: [] }; A.S.db.setAdmins = async (...a) => { st.signed.push((A.rolesOf(cid) || {}).s); if (st.calls++) return real(...a); await real(...a); st.lost = true; if (then) await then(); throw timeout(); }; return st; };
// every read of the chat's record from the moment the reply was lost
const reads = (A, cid, st) => { const real = A.S.db.doc, seen = []; A.S.db.doc = (p) => { const d = real(p); if (p !== 'channels/' + cid) return d; const g = d.get; d.get = async () => { if (st.lost && !st.over) seen.push('read'); return g(); }; return d; }; return seen; };
// Save pressed in X's Edit sheet (openEditConv): the owner's own way to sign her list; the sheet's error line ('' once saved)
async function editSave(X, cid, name) {
  X.S.convs = [{ ...(await X.showMeta(X.S.chatDocs.get(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); return at((e) => e.cls === 'err').textContent;
}

test('R9 (the flag) a private channel whose list was never signed as this device holds it; a signed copy is noted for the first time while the reply of the never-signed branch\'s write is lost. The step took the never-signed way, so it takes no read: MARKED, as R3 ends. Before the flag it took the read and ended "done": not marked, counted as secured, and no line about the admins', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build: plainBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']);
    { const raw = A.unb64(A.ksGet(cid, 0)), iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
      await A.S.db.doc('channels/' + cid).update({ ometa: { e: 0, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(JSON.stringify({ name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob'] })))).toString('base64') } });
      await A.shown(cid); await A.rolesQ.get(cid); assert.equal(A.rolesOf(cid).s, 0, 'unsigned'); }
    const old = await oldOf(A, cid); await newKeys(A);
    // the second holder of the new keys, its clock 5 min 4 s fast, signs the list by hand (Edit, then Save)
    const id = { ...A.S.me }; delete id.handle;
    const A2 = await w.page('alice', { id, owner: true, store: new Map(A.store), clock: { skew: 5 * 60e3 + 4000 } }); await A2.loadDir(['alice', 'bob'], true); await A2.sync(cid);
    assert.equal(await editSave(A2, cid, 'History'), '', 'saved'); assert.equal(typeof (await A2.meta(cid) && (await A2.readOMeta(await A2.sync(cid))).rs), 'string', 'the list at the server is signed now');
    A.S.chatDocs.delete(cid);   // this device holds no copy of the record in memory, as after Hush was opened again
    const st = lose(A, cid, () => until(() => A.rolesOf(cid).s === 1, 20000)), seen = reads(A, cid, st);
    const r = await within(run(A, [chan(cid)]), 100000); st.over = true; A.S.rekeying = false;
    assert.deepEqual(st.signed, [0], 'one admin-secret call, made by the never-signed branch: the record named no signed list then');
    assert.equal(A.rolesOf(cid).s, 1, 'and the signed copy was noted while the reply was lost');
    assert.equal(r.rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]);
    const s = draw(A, r.rec); assert.equal(s.box.filter((x) => BOX.test(x)).length, 1); assert.equal(count(s), '0 chats are secured.');
    assert.deepEqual(seen, [], 'no read'); assert.equal(st.calls, 1); assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]);
  });
});
