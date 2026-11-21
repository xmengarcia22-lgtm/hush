// Release 104, item 5 (SPEC.md 14.15): the one read after a lost reply, with a REAL device key.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// The account's profile lists this device (as on a real phone), so wrapKey wraps the step's new admin secret to the device key
// alone and the read must unwrap it with the device key (unwrapMine tries it first). The lost reply at the admin secret is
// R1's (removal-nouse-read-a.test.js); the second test is the same step with no reply lost.
// (From the fifth review of the plan, which ran it on the same page statements.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, marks, oldOf, realCapsBuild, run, within } from './removal-kit.js';

const build = realCapsBuild('spy.adminCache=adminCache;spy.verifiedDevs=verifiedDevs;');
const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const timeout = () => Object.assign(new Error('timeout'), { code: 'timeout' });

for (const lost of [true, false]) test(lost ? 'X2a a real device key, the reply of the admin-secret call lost: the one read unwraps this device\'s copy with the device key (the account key alone opens no copy), the step counts as done, no mark' : 'X2b a real device key, no reply lost (the control): the step goes through, and the account key alone opens no copy', async () => {
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    A.S.ids = [A.S.me]; const d = await A.ensureDev(A.S.me);                                                    // this device, signed by the new account key
    await A.S.db.doc('directory/alice').update({ devs: { [d.id]: A.devEntry(d) } }); await A.loadDir(['alice'], true);
    const devs = await A.spy.verifiedDevs('alice');
    let wraps = null; const real = A.S.db.setAdmins; let n = 0;
    A.S.db.setAdmins = async (...a) => { wraps = Object.values(a[1]).length; if (n++ || !lost) return real(...a); await real(...a); throw timeout(); };
    const r = await within(run(A, [chan(cid)]), 100000); A.S.rekeying = false;
    const sec = A.ksGet(cid, 'a'), srv = (await A.S.db.preview(cid)).data();
    // which key opens the record's copies: the device key only, or the account key too?
    const byAcct = await (async () => { const keep = A.S.me.dev; A.S.me.dev = null; try { return !!(await A.verifiedAdmin({ id: cid, ...srv }, true, A.rolesOf(cid).p)); } finally { A.S.me.dev = keep; } })();
    assert.equal(devs.length, 1, 'the profile lists this device'); assert.equal(wraps, 2, 'two copies of the admin secret were sent: this device\'s and the other admin\'s');
    assert.ok(r.through); assert.deepEqual(r.rec.rotated, [{ cid, ok: true }]); assert.deepEqual(marks(A), []);
    assert.equal(level(w, cid, await A.adminCapFrom(cid, A.unb64(sec))), 'admin', 'the secret this device keeps is the chat\'s'); assert.equal(await A.adminId(cid, A.unb64(sec)), A.rolesOf(cid).p, 'and its fingerprint is the noted one');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null], 'what the removed device held opens nothing');
    assert.equal(byAcct, false, 'the copy is for the device key alone, so the read did unwrap with the device key');
  });
});
