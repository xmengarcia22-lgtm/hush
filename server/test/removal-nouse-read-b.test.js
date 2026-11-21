// Release 104, item 5 (SPEC.md 14.15): the one read after a lost reply, R6: the read itself fails.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// A call that got no answer may have landed, so one read of the chat's record says (removal-nouse-read-a.test.js). Here that
// read fails: "offline", "too fast" and "sign in first" are waited out and the read is made again, never a write; a read that
// got no answer marks the chat; a record that is gone is not marked. The waits make this the slowest of the three files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, draw, has, count, marks, newKeys, BOX, READ, MANAGE, oldOf, realCapsBuild, run, within } from './removal-kit.js';

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

test('R6 the read itself fails. "offline", "too fast" and "sign in first" are waited out and the read is made again (never a write): not marked. A read that got no answer (a time-out): the page cannot know, so MARKED. The record is not there any more: not marked, as for any chat that is gone', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); const st = lose(A), own = owners(A), seen = reads(A, cid, st, ['offline', 'ratelimit', 'unauth']);
    const r = await go(A, st, [chan(cid)]);
    notMarked(A, r, cid); assert.deepEqual(seen, ['offline', 'ratelimit', 'unauth', 'read']); assert.equal(own.calls, 1); assert.equal(st.calls, 1); assert.equal(r.asks.length, 0);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]); assert.equal(level(w, cid, await held(A, cid)), 'admin');
  });
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); const st = lose(A), seen = reads(A, cid, st, ['timeout']);
    const r = await go(A, st, [chan(cid)]);
    isMarked(A, r, cid); assert.deepEqual(seen, ['timeout'], 'one read, not a second'); assert.equal(st.calls, 1); assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]);
  });
  await world({}, async (w) => {
    const { A, cid } = await setup(w); await newKeys(A); const st = lose(A), seen = reads(A, cid, st, ['gone']);
    const r = await go(A, st, [chan(cid)]), s = draw(A, r.rec);
    assert.ok(!r.rec.rotated[0].own); assert.deepEqual(marks(A), []); assert.ok(!s.box.some((x) => BOX.test(x))); assert.deepEqual(seen, ['gone']);
  });
});
