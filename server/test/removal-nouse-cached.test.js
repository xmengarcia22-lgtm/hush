// Release 104, item 5 (SPEC.md 14.15): the page's cached copy of the record after the step ended "done after the read".
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// When the reply of the admin-secret call is lost and the one read finds the step's own secret, rotateAdmins' later notes did
// not run: among them the cached copies of the record's admin-secret copies (S.chatDocs). What the page's own copy of the
// record holds then, and what the page's checked reader does with it, against the end where rotateAdmins ran through.
// (From the fifth review of the plan, which only printed these; here each is asserted.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, marks, oldOf, realCapsBuild, run, within } from './removal-kit.js';

const build = realCapsBuild('spy.adminCache=adminCache;');
const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const timeout = () => Object.assign(new Error('timeout'), { code: 'timeout' });

const setup = async (w, lost) => {
  const { cid } = w; const A = await w.page('alice', { owner: true, build }); await w.page('bob');
  await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid), oldSec = A.ksGet(cid, 'a');
  await newKeys(A);
  if (lost) { const real = A.S.db.setAdmins; let n = 0; A.S.db.setAdmins = async (...a) => { if (n++) return real(...a); await real(...a); throw timeout(); }; }
  const r = await within(run(A, [chan(cid)]), 100000); A.S.rekeying = false;
  assert.deepEqual(r.rec.rotated, [{ cid, ok: true }]); assert.deepEqual(marks(A), []);
  const newSec = A.ksGet(cid, 'a'); assert.notEqual(newSec, oldSec, 'this device keeps the new admin secret'); assert.equal(A.rolesOf(cid).p, await A.adminId(cid, A.unb64(newSec)), 'and its fingerprint is the noted one');
  assert.equal(level(w, cid, old.adm), null, 'the admin secret the removed device held opens nothing');
  return { A, cid, newSec, srv: (await A.S.db.preview(cid)).data(), cached: A.S.chatDocs.get(cid) };
};

test('X4a the reply of the admin-secret call lost, the step done after the one read: the page\'s own copy of the record still holds the copies from before the write and no admin count was noted (rotateAdmins\' later notes did not run). The page\'s checked reader gets nothing out of that copy, and the kept secret stays the new one', async () => {
  await world({}, async (w) => {
    const { A, cid, newSec, srv, cached } = await setup(w, true);
    assert.ok(cached && cached.akeys, 'the page has a copy of the record'); assert.notDeepEqual(cached.akeys, srv.akeys, 'with the copies from before the write');
    assert.equal(A.rolesOf(cid).ak || null, null, 'no admin count noted');
    assert.equal(await A.verifiedAdmin(cached), null, 'the checked reader refuses the old copies'); assert.equal(A.ksGet(cid, 'a'), newSec, 'and the kept secret is still the new one');
  });
});

test('X4b no reply lost (the control): the page\'s own copy of the record holds the copies the step wrote, the admin count is noted and the checked reader gets the new secret out of it', async () => {
  await world({}, async (w) => {
    const { A, cid, newSec, srv, cached } = await setup(w, false);
    assert.ok(cached && cached.akeys, 'the page has a copy of the record'); assert.deepEqual(cached.akeys, srv.akeys, 'with the copies the step wrote');
    assert.deepEqual(A.rolesOf(cid).ak, { bob: 1 }, 'the admin count is noted');
    const got = await A.verifiedAdmin(cached); assert.ok(got); assert.equal(A.b64(got), newSec, 'the checked reader gets the new secret'); assert.equal(A.ksGet(cid, 'a'), newSec);
  });
});
