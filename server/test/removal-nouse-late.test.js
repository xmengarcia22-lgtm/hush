// Release 104, item 5 (SPEC.md 14.15): the one failure of the owner step that is NOT marked.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// The exception: the owner key, the admin secret and the link stop landed and a later write failed. That counts as done (the
// owner's decision of 2026-11-12), because what the removed device held opens nothing then. The check that says so must never
// say it while something the removed device holds still opens the chat: H1 to H4 try to make it, L2 to L4 are its plain cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, removal, draw, has, count, marks, MANAGE, BOX, READ, oldOf, failCall, failDoc, realCapsBuild } from './removal-kit.js';

const build = realCapsBuild('spy.adminCache=adminCache;');
const setup = async (w, link = true) => {
  const { cid } = w;
  const A = await w.page('alice', { owner: true, build }); await w.page('bob');
  await makeChannel(A, cid, ['alice', 'bob'], ['bob']); if (link) await linkOf(A, cid); else { await A.shown(cid); await A.rolesQ.get(cid); }
  return { A, cid, old: await oldOf(A, cid), chat: { cid, owner: true, admins: ['bob'], members: ['alice', 'bob'] } };
};
// this device as one that has not kept the channel's current admin secret: another secret (or none) in its store, nothing unwrapped in this page's life
const forget = (A, cid, how) => { A.ksPut(cid, 'a', how === 'none' ? null : A.b64(crypto.getRandomValues(new Uint8Array(32)))); A.spy.adminCache.clear(); };
const isMarked = (A, rec, cid) => { assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]); const s = draw(A, rec); assert.equal(s.box.filter((x) => BOX.test(x)).length, 1); assert.ok(!has(s, MANAGE) && !has(s, READ)); return s; };

for (const how of ['stale', 'none']) {
  test('H1 (' + how + '): the store holds ' + (how === 'none' ? 'no' : 'an older') + ' admin secret; the write of the new one fails: marked, never "done"', async () => {
    await world({}, async (w) => {
      const { A, cid, old, chat } = await setup(w);
      forget(A, cid, how); await newKeys(A);
      failCall(A, 'setAdmins', ['timeout']);
      const rec = await removal(A, [chat]);
      assert.equal(level(w, cid, old.adm), 'admin', 'the removed device\'s admin secret still opens the channel at admin level'); isMarked(A, rec, cid);
    });
  });
}

test('H2: the same, and while the step runs the page reads the channel\'s signed admin secret once (as any open of the chat does): marked', async () => {
  await world({}, async (w) => {
    const { A, cid, old, chat } = await setup(w);
    forget(A, cid, 'stale'); await newKeys(A);
    const real = A.S.db.setAdmins; let calls = 0;
    A.S.db.setAdmins = async (...a) => { if (calls++) return real(...a); const c = await A.sync(cid); await A.verifiedAdmin(c).catch(() => null); throw Object.assign(new Error('timeout'), { code: 'timeout' }); };
    const rec = await removal(A, [chat]);
    assert.equal(level(w, cid, old.adm), 'admin'); isMarked(A, rec, cid);
  });
});

test('H3: a read puts the channel\'s OLD signed admin secret into the store while the step runs, and the write of the new secret fails: marked (the loose check would say "done" here)', async () => {
  await world({}, async (w) => {
    const { A, cid, old, chat } = await setup(w);
    const cur = A.ksGet(cid, 'a'); forget(A, cid, 'stale'); await newKeys(A);
    const real = A.S.db.setAdmins; let calls = 0;
    A.S.db.setAdmins = async (...a) => { if (calls++) return real(...a); A.ksPut(cid, 'a', cur); throw Object.assign(new Error('timeout'), { code: 'timeout' }); };
    const rec = await removal(A, [chat]);
    assert.equal(level(w, cid, old.adm), 'admin'); isMarked(A, rec, cid);
  });
});

test('H4: two attempts inside one removal. The first lands a fresh admin secret and then meets "offline" (waited out); the second fails at the admin secret: marked, although what the removed device held opens nothing (the safe side)', async () => {
  await world({}, async (w) => {
    const { A, cid, old, chat } = await setup(w);
    await newKeys(A);
    failDoc(A, (v) => v && 'ometa' in v, 'offline', 1);
    failCall(A, 'setAdmins', [null, 'timeout']);
    const rec = await removal(A, [chat]);
    isMarked(A, rec, cid); assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]);
  });
});

test('L2: this device\'s copy of the signed list is behind the record, so the list cannot be written after the three writes: counts as done, no mark; what the removed device held opens nothing', async () => {
  await world({}, async (w) => {
    const { A, cid, old, chat } = await setup(w);
    await newKeys(A);
    const r = A.rolesOf(cid); A.ls.set('hush:roles:alice', { ...A.ls.get('hush:roles:alice', {}), [cid]: { ...r, t: (r.t || Date.now()) + 3600e3 } });
    const rec = await removal(A, [chat]);
    assert.ok(!rec.rotated[0].own); assert.deepEqual(marks(A), []); const s = draw(A, rec); assert.ok(!s.box.some((x) => BOX.test(x)));
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm), level(w, cid, await A.ownerCap(cid))], [null, null, 'owner']);
    assert.equal(Object.keys((await A.sync(cid)).invites || {}).length, 0);
  });
});

test('L3: the key change failed, the owner key and admin secret land, the link stop fails every time: NOT done (a link is open): marked, named once, in the box', async () => {
  await world({}, async (w) => {
    const { A, cid, old, chat } = await setup(w);
    await newKeys(A);
    A.spy.failRotate = ['toolarge'];
    const f = failDoc(A, (v) => v && v.invites === null, 'timeout');
    const rec = await removal(A, [chat]); f.undo();
    assert.ok(f.count() >= 2); const s = isMarked(A, rec, cid); assert.equal(count(s), '0 chats are secured.'); assert.equal(s.t.filter((x) => /History/.test(x)).length, 1);
    assert.ok(Object.keys((await A.sync(cid)).invites || {}).length >= 1, 'a link is still open');
  });
});

test('L4: the key change failed and nothing else: the owner step goes through whole during the removal (the signed list too). The chat is on the grey "may still read" line as today, not in the box, no mark', async () => {
  await world({}, async (w) => {
    const { A, cid, old, chat } = await setup(w);
    await newKeys(A);
    A.spy.failRotate = ['toolarge'];
    const rec = await removal(A, [chat]);
    const s = draw(A, rec);
    assert.equal(rec.rotated[0].skip, 'error'); assert.ok(!rec.rotated[0].own); assert.deepEqual(marks(A), []);
    assert.ok(has(s, READ) && !s.box.some((x) => BOX.test(x))); assert.equal(count(s), '0 chats are secured.');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]);
  });
});
