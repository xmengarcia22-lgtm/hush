// Release 104, item 5 (SPEC.md 14.15): the one read after a lost reply, R1 to R5.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// A call that got no answer may have landed. ONE READ of the chat's record tells a lost reply at the admin secret from a real
// failure. It is a check, not a retry: it sends no write again. The page keeps this device's own copy of the admin secret from
// the record only if its fingerprint is the one this step noted before its write. That fingerprint is noted for a private
// channel only (rotateAdmins), so the read is for a private channel whose list is signed; a group, a public channel and a
// channel whose list was never signed are marked. R6 is in removal-nouse-read-b.test.js, R7 and R8 in removal-nouse-read-c.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, draw, has, count, marks, newKeys, BOX, READ, MANAGE, oldOf, failCall, realCapsBuild, plainBuild, run, within } from './removal-kit.js';

const build = realCapsBuild('spy.adminCache=adminCache;');
const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const setup = async (w) => { const { cid } = w; const A = await w.page('alice', { owner: true, build }); const B = await w.page('bob'); await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); return { A, B, cid, old: await oldOf(A, cid) }; };
const timeout = () => Object.assign(new Error('timeout'), { code: 'timeout' });
// the admin-secret write lands and its reply is lost (the call ends as a time-out); `then` runs right after it landed
const lose = (A, then) => { const real = A.S.db.setAdmins, st = { calls: 0, lost: false }; A.S.db.setAdmins = async (...a) => { if (st.calls++) return real(...a); await real(...a); st.lost = true; if (then) await then(); throw timeout(); }; return st; };
// every owner-key call the page asks the adapter for
const owners = (A) => { const real = A.S.db.setOwner, n = { calls: 0 }; A.S.db.setOwner = (...a) => { n.calls++; return real(...a); }; return n; };
// every read of the chat's record from the moment the reply was lost, one entry of `list` per read: a code (the read fails with
// it), 'gone' (the record is not there), a function (what the read returns instead of the record), or nothing (the read as it is)
const reads = (A, cid, st, list = []) => { const real = A.S.db.doc, seen = []; A.S.db.doc = (p) => { const d = real(p); if (p !== 'channels/' + cid) return d; const g = d.get;
  d.get = async () => { if (!st.lost || st.over) return g(); const how = list.shift(); seen.push(typeof how === 'function' ? 'changed' : how || 'read');
    if (how === 'gone') return { exists: false, data: () => null }; if (typeof how === 'string') throw Object.assign(new Error(how), { code: how });
    const s = await g(); return typeof how === 'function' ? { exists: true, id: s.id, data: () => how(s.data()) } : s; }; return d; }; return seen; };
const go = async (A, st, chats) => { const r = await within(run(A, chats), 100000); st.over = true; A.S.rekeying = false; return r; };
const isMarked = (A, r, cid) => { assert.equal(r.rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]); const s = draw(A, r.rec); assert.equal(s.box.filter((x) => BOX.test(x)).length, 1); assert.equal(count(s), '0 chats are secured.'); return s; };
const notMarked = (A, r, cid) => { assert.ok(r.through, 'the removal went on'); assert.deepEqual(r.rec.rotated, [{ cid, ok: true }]); assert.deepEqual(marks(A), []); const s = draw(A, r.rec); assert.ok(!s.box.some((x) => BOX.test(x)) && !has(s, MANAGE) && !has(s, READ)); assert.equal(count(s), '1 chat is secured.'); return s; };
const held = async (A, cid) => A.adminCapFrom(cid, A.unb64(A.ksGet(cid, 'a')));

test('R1 (K15, a private channel whose list is signed) the admin secret lands and its reply is lost: one read of the record finds this device\'s own copy with the fingerprint this step noted. Not marked, counted as secured; one owner-key call and one admin-secret call were sent, never a second; what the removed device held opens nothing; no link is open; this device holds the secret the server holds. The owner\'s next open then signs the list, and the admin\'s page works', async () => {
  await world({}, async (w) => {
    const { A, B, cid, old } = await setup(w); await newKeys(A);
    const st = lose(A), own = owners(A), seen = reads(A, cid, st);
    const r = await go(A, st, [chan(cid)]);
    const sec = A.ksGet(cid, 'a'), c = await A.sync(cid);
    notMarked(A, r, cid); assert.equal(own.calls, 1); assert.equal(st.calls, 1, 'no write was sent again'); assert.deepEqual(seen, ['read'], 'one read');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm), level(w, cid, await A.ownerCap(cid))], [null, null, 'owner']);
    assert.equal(level(w, cid, await held(A, cid)), 'admin', 'this device holds the admin secret the server holds now'); assert.equal(await A.adminId(cid, A.unb64(sec)), A.rolesOf(cid).p, 'and it is the one this step made');
    assert.equal(Object.keys(c.invites || {}).length, 0, 'no link is open');
    // afterwards: the owner's next open signs the list (signAdminId makes one more secret, signed under the new account key); the admin's page then holds it
    const signed = await A.signAdminId(cid); await B.loadDir(['alice'], true); const cb = await B.sync(cid), bs = await B.verifiedAdmin(cb);
    assert.equal(signed, true); assert.ok(bs); assert.equal(level(w, cid, await B.adminCapFrom(cid, bs)), 'admin'); assert.equal(B.S.db.chatLevel(cid), 'admin'); assert.equal(level(w, cid, old.adm), null);
  });
});

test('R2 (K15, a group and a public channel) the same lost reply: no read is made, because the page notes no fingerprint for them and so has nothing to tell its own secret from another by. Marked, although nothing the removed device held opens the chat (the careful side)', async () => {
  for (const [type, vis, id] of [['group', 'private', 'gA'], ['channel', 'public', 'cP']]) await world({}, async (w) => {
    const A = await w.page('alice', { owner: true, build }); await w.page('bob'); await A.loadDir(['alice', 'bob'], true);
    const g = id + w.cid.slice(2); await A.createChatDoc(g, type, vis, { name: 'Team', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob'], banned: [] });
    const og = await oldOf(A, g); await newKeys(A); const st = lose(A), own = owners(A), seen = reads(A, g, st);
    const r = await go(A, st, [{ cid: g, type, vis, name: 'Team', owner: true, admins: [], members: ['alice', 'bob'] }]);
    isMarked(A, r, g); assert.deepEqual(seen, [], 'no read'); assert.equal(st.calls, 1); assert.deepEqual([level(w, g, og.own), level(w, g, og.adm)], [null, null]);
  });
});

test('R3 a private channel whose list was never signed, and the same lost reply: no read (a "done" end would record nothing: no mark, and not the line "Your admins in X can’t post or manage there right now." either): marked', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build: plainBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']);
    { const raw = A.unb64(A.ksGet(cid, 0)), iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
      await A.S.db.doc('channels/' + cid).update({ ometa: { e: 0, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(JSON.stringify({ name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob'] })))).toString('base64') } });
      await A.shown(cid); await A.rolesQ.get(cid); assert.equal(A.rolesOf(cid).s, 0, 'unsigned'); }
    const old = await oldOf(A, cid); await newKeys(A); const st = lose(A), seen = reads(A, cid, st);
    const r = await go(A, st, [chan(cid)]);
    isMarked(A, r, cid); assert.deepEqual(seen, []); assert.equal(st.calls, 1); assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]);
  });
});

test('R4 (try to fool it) the holder of the removed device, with the old owner key, puts an admin secret OF ITS OWN into the record before the step, wrapped for the owner\'s account; the owner\'s own write then never reaches the server (a time-out). The read finds a copy this device can unwrap, but its fingerprint is not the one this step noted: not kept, MARKED. The mark is true: the holder\'s secret gives admin level', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A);
    const M = await w.page('mallory'); M.spy.capsFor = async () => [old.own]; await M.S.db.refreshChat(cid); assert.equal(M.S.db.chatLevel(cid), 'owner', 'the old owner key still gives owner level before the step');
    await M.loadDir(['alice'], true); const X = crypto.getRandomValues(new Uint8Array(32)), capX = await M.adminCapFrom(cid, X);
    await M.S.db.setAdmins(cid, await M.wrapKey(X, 'alice', cid + '#a'), capX); assert.equal(level(w, cid, capX), 'admin');
    const fa = failCall(A, 'setAdmins', ['timeout']), st = { lost: true }, seen = reads(A, cid, st), before = A.ksGet(cid, 'a');
    st.lost = false; const so = A.S.db.setOwner; A.S.db.setOwner = async (...a) => { const x = await so(...a); st.lost = true; return x; };   // the reads are counted from the owner key on
    const r = await go(A, st, [chan(cid)]);
    isMarked(A, r, cid); assert.equal(level(w, cid, capX), 'admin', 'the holder still has admin level: the mark is true');
    assert.notEqual(A.ksGet(cid, 'a'), A.b64(X), 'the holder\'s secret was not kept'); assert.equal(level(w, cid, old.own), null); assert.equal(fa.calls.length, 1);
  });
});

test('R5 (the server\'s rules, as the page meets them) only the owner-level admin-secret call changes the record\'s copies of the admin secret (akeys): a plain update of them is refused at admin level and at owner level, the call itself is refused at admin level, and a key change leaves them as they were', async () => {
  await world({}, async (w) => {
    const { A, B, cid, old } = await setup(w); const code = (p) => p.then(() => 'ok', (e) => e.code || e.message);
    const a0 = JSON.stringify((await A.sync(cid)).akeys), less = { akeys: { [Object.keys(JSON.parse(a0))[0]]: null } }; await B.sync(cid); await B.sync(cid);   // `less`: one copy taken out (the server merges a patch, so an empty map would change nothing)
    const out = { adminLevel: B.S.db.chatLevel(cid), adminUpdate: await code(B.S.db.doc('channels/' + cid).update(less)), adminCall: await code(B.S.db.setAdmins(cid, {}, 'm'.repeat(43))),
      ownerLevel: A.S.db.chatLevel(cid), ownerUpdate: await code(A.S.db.doc('channels/' + cid).update(less)) };
    await newKeys(A); const f = failCall(A, 'setOwner', ['timeout']); await within(run(A, [chan(cid)]), 100000); f.undo(); A.S.rekeying = false;
    const c1 = await A.sync(cid); out.epochAfterKeyChange = A.epochOf(c1); out.akeysSame = JSON.stringify(c1.akeys) === a0;
    const M = await w.page('mallory'); M.spy.capsFor = async () => [old.adm]; await M.S.db.refreshChat(cid);
    Object.assign(out, { holderLevel: M.S.db.chatLevel(cid), holderUpdate: await code(M.S.db.doc('channels/' + cid).update(less)), holderCall: await code(M.S.db.setAdmins(cid, {}, 'm'.repeat(43))) });
    assert.deepEqual(out, { adminLevel: 'admin', adminUpdate: 'denied', adminCall: 'denied', ownerLevel: 'owner', ownerUpdate: 'denied', epochAfterKeyChange: 1, akeysSame: true, holderLevel: 'admin', holderUpdate: 'denied', holderCall: 'denied' });
    assert.equal(JSON.stringify((await A.sync(cid)).akeys), a0, 'nothing changed them');
  });
});
