// Release 104, item 5 (SPEC.md 14.15): the one read after a lost reply, R7 and R8: what the read returns.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// A call that got no answer may have landed, so one read of the chat's record says (removal-nouse-read-a.test.js). Here the
// record read is not the one this step wrote: an older record, one with no copy for this device, one whose copy does not
// unwrap (R7), and a second tab that changed the admins in between (R8, two tests, one per kind of store).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, draw, has, count, marks, newKeys, BOX, READ, MANAGE, oldOf, realCapsBuild, run, within } from './removal-kit.js';

const build = realCapsBuild('spy.adminCache=adminCache;');
const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const setup = async (w) => { const { cid } = w; const A = await w.page('alice', { owner: true, build }); const B = await w.page('bob'); await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); return { A, B, cid, old: await oldOf(A, cid) }; };
const timeout = () => Object.assign(new Error('timeout'), { code: 'timeout' });
// the admin-secret write lands and its reply is lost (the call ends as a time-out); `then` runs right after it landed
const lose = (A, then) => { const real = A.S.db.setAdmins, st = { calls: 0, lost: false }; A.S.db.setAdmins = async (...a) => { if (st.calls++) return real(...a); await real(...a); st.lost = true; if (then) await then(); throw timeout(); }; return st; };
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

test('R7 what the read returns. An older record (the copies from before the write), a record with no copy for this device, and a record whose copy does not unwrap: each time nothing is kept and the chat is MARKED (the careful side: the write had landed)', async () => {
  for (const [name, how] of [['an older record', (old) => (d) => ({ ...d, akeys: old })], ['no copy for this device', () => (d) => ({ ...d, akeys: {} })],
    ['a copy that does not unwrap', () => (d) => ({ ...d, akeys: Object.fromEntries(Object.entries(d.akeys).map(([k, v]) => [k, { ...v, ct: Buffer.from(randomBytes(48)).toString('base64') }])) })]]) await world({}, async (w) => {
    const { A, cid, old } = await setup(w); const a0 = (await A.sync(cid)).akeys; await newKeys(A); const before = A.ksGet(cid, 'a');
    const st = lose(A), seen = reads(A, cid, st, [how(a0)]);
    const r = await go(A, st, [chan(cid)]);
    isMarked(A, r, cid); assert.deepEqual(seen, ['changed']); assert.equal(st.calls, 1); assert.equal(A.ksGet(cid, 'a'), before, 'nothing was kept');
  });
});

// R8: a second tab of the account that still runs on the keys of before (it has not heard of the removal yet) tries to replace the
// admin secret right after this tab's write landed. `shared`: the second tab is on the SAME store, as two real tabs are, or on a
// store of its own. One test per kind of store, each with its one fixed end. `same` says whether the fingerprint this step noted
// before its write still stood in this tab's store after the second tab's attempt.
const twoTabs = async (w, shared) => {
  const { A, cid, old } = await setup(w); const T2 = await w.page('alice', { id: A.id, store: shared ? A.store : new Map(A.store), owner: true, build }); await T2.loadDir(['alice', 'bob'], true); await T2.sync(cid); await T2.sync(cid);
  await newKeys(A); let tried = null, p1 = null, p2 = null;
  const st = lose(A, async () => { p1 = A.rolesOf(cid).p; tried = await within(T2.rotateAdmins(cid, ['bob'], {}), 40000).then(() => 'ok', (e) => e.code || e.message); p2 = A.rolesOf(cid).p; }), seen = reads(A, cid, st);
  const r = await go(A, st, [chan(cid)]);
  assert.notEqual(tried, 'ok', 'the second tab\'s write was refused'); assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null], 'what the removed device held opens nothing');
  return { A, cid, r, seen, same: p1 === p2 };
};

test('R8a two tabs, the second on a store of its own: a second tab of the account that still runs on the keys of before (it has not heard of the removal yet) tries to replace the admin secret right after this tab\'s write landed. The server refuses it and the record keeps this tab\'s copies. The fingerprint this step noted stands, the one read finds this tab\'s copy: not marked', async () => {
  await world({}, async (w) => {
    const { A, cid, r, seen, same } = await twoTabs(w, false);
    assert.equal(same, true, 'the fingerprint this step noted stands'); assert.deepEqual(seen, ['read'], 'one read');
    notMarked(A, r, cid); assert.equal(level(w, cid, await held(A, cid)), 'admin');
  });
});

test('R8b two tabs on the SAME store (as two real tabs are): the second tab notes a fingerprint of its own over this tab\'s before its write is refused, so the one read finds no copy with the noted fingerprint: MARKED, although the server refused the second tab and what the removed device held opens nothing (the careful side; a known gap)', async () => {
  await world({}, async (w) => {
    const { A, cid, r, seen, same } = await twoTabs(w, true);
    assert.equal(same, false, 'the second tab\'s attempt replaced the fingerprint this tab had noted'); assert.deepEqual(seen, ['read'], 'one read');
    isMarked(A, r, cid);
  });
});
