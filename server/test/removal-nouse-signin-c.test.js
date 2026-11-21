// Release 104, item 5 (SPEC.md 14.15): "sign in first" met by the key-change loop, U3.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// The key-change loop comes first for every chat. From the owner's answer C (2026-11-12) it waits "sign in first" out as the
// owner step does: it signs in again and goes round, so the key change goes through and no chat is filed as failed for it.
// (A sign-in refused for good there signs the device out: X6 in removal-nouse-refused-c.test.js.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, draw, count, marks, READ, oldOf, realCapsBuild, run, until, drop, refill, failSignIn } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
// every sign-in the page asks the adapter for, and how it ended; `before(n)` runs right before the n-th one
const watchProve = (A, before = () => {}) => { const pv = A.S.db.prove, log = []; let n = 0; A.S.db.prove = (idn) => { if (!idn) return pv(idn); before(++n); return pv(idn).then((r) => { log.push('ok'); return r; }, (e) => { log.push(e.code); throw e; }); }; return log; };

test('U3 the same unproven connection met by the key-change loop (it comes first for every chat): what each chat gets. Two chats: one where the account is an admin, then one it owns. The key-change loop signs in again, once, and goes round: both key changes go through, no chat is on the grey line, nothing is marked, and the summary counts both chats as secured', async () => {
  await world({ limits: { proveFailsPer10Min: 1 } }, async (w) => {
    const { cid } = w, c1 = 'cH' + randomBytes(8).toString('hex').slice(0, 11);
    const A = await w.page('alice', { owner: true, build: realCapsBuild() }); const B = await w.page('bob', { owner: true }); const Z = await w.page('zed');
    await makeChannel(B, c1, ['bob', 'alice'], ['alice']); await A.sync(c1); await A.shown(c1);
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    const zed = await failSignIn(Z); drop(w, 'alice'); await until(() => !A.S.db.online); await until(() => A.S.db.online, 20000);
    assert.equal(zed, 'denied'); assert.equal((A.S.db.identityError || {}).code, 'ratelimit'); assert.ok(!A.S.db.proven, 'online, not signed in');
    const proofs = watchProve(A, (n) => { if (n === 1) refill(w); });
    const r = await run(A, [{ cid: c1, owner: false, admin: true, admins: ['alice'], members: ['bob', 'alice'], name: 'Bobs' }, chan(cid, { name: 'Mine' })]), s = draw(A, r.rec);
    assert.deepEqual(proofs, ['ok'], 'the key-change loop signed in again, once; the owner step had no need to');
    assert.ok(r.through); assert.deepEqual(marks(A), [], 'never a mark for the sign-in alone'); assert.ok(!r.rec.rotated[1].own);
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null], 'the owned chat\'s owner key and admin secret were replaced');
    assert.deepEqual(r.rec.rotated.map((d) => [d.cid, d.skip || null]), [[c1, null], [cid, null]], 'both key changes went through: neither chat is filed as failed');
    assert.deepEqual(s.t.filter((x) => READ.test(x)), [], 'no grey "may still read" line'); assert.equal(count(s), '2 chats are secured.');
  });
});
