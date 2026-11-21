// Release 104, item 5 (SPEC.md 14.15): how the owner step of a device removal can end, K9 to K15.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// Locked out, held back by the server, gone, the signed list failing after the three writes, a list never signed, a group and
// a public channel, and the admin secret's reply lost. Each test asserts what the record, the server, the mark and the summary say.
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, removal, draw, has, count, marks, MANAGE, BOX, ADMINS, READ, TAKEN, oldOf, failDoc, failCall, watchOwn, realCapsBuild, plainBuild } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
const setup = async (w, build = realCapsBuild()) => { const { cid } = w; const A = await w.page('alice', { owner: true, build }); await w.page('bob'); await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); return { A, cid, old: await oldOf(A, cid) }; };
const marked = (A, rec, cid, why) => { const s = draw(A, rec); assert.equal(rec.rotated[0].own, 'error', why); assert.deepEqual(marks(A), [cid], 'the mark is set');
  assert.deepEqual(s.box.filter((x) => BOX.test(x)), ['Couldn’t secure these chats: ' + (rec.chats[0].name) + '. A device you removed may still have control there. Don’t use them any more. Start new chats with the same people.']);
  assert.ok(!has(s, MANAGE) && !has(s, READ) && !s.btn, 'no "may still be able to manage" line, not on the grey line, no button'); assert.equal(count(s), '0 chats are secured.'); return s; };
const clean = (A, rec, cid) => { const s = draw(A, rec); assert.deepEqual(marks(A), [], 'no mark'); assert.ok(!s.box.some((x) => BOX.test(x)) && !has(s, MANAGE) && !s.btn, 'no box, no line, no button'); return s; };

test('K9 locked out of a group (no key this account holds opens it): the mark is set, and the summary names the chat once, in the "Someone locked you out" box only', async () => {
  await world({ limits: { openFailsPerMin: 1000 } }, async (w) => {
    const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob'); await A.loadDir(['alice', 'bob'], true);
    const cid = 'gA' + w.cid.slice(2); await A.createChatDoc(cid, 'group', 'private', { name: 'Team', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob'], banned: [] });
    await newKeys(A); await A.sync(cid);
    const real = A.spy.capsFor; A.spy.capsFor = async (c) => (c !== cid ? real(c) : ['x'.repeat(43), 'y'.repeat(43)]);
    await A.S.db.refreshChat(cid).catch(() => {});
    const rec = await removal(A, [{ cid, type: 'group', vis: 'private', name: 'Team', owner: true, admins: [], members: ['alice', 'bob'] }]);
    assert.equal(rec.rotated[0].skip, 'taken'); assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]);
    const s = draw(A, rec);
    assert.equal(s.box.length, 1); assert.ok(TAKEN.test(s.box[0]) && !s.box.some((x) => BOX.test(x)) && !has(s, MANAGE) && !has(s, READ)); assert.equal(count(s), '0 chats are secured.');
  });
});

test('K9b locked out of a private channel: filed as "locked out" or as a failed key change, whichever call meets it first (as today); either way marked, and named once, in one warning box', async () => {
  await world({ limits: { openFailsPerMin: 1000 } }, async (w) => {
    const { A, cid } = await setup(w); await newKeys(A); await A.sync(cid);
    const real = A.spy.capsFor; A.spy.capsFor = async (c) => (c !== cid ? real(c) : ['x'.repeat(43), 'y'.repeat(43)]);
    await A.S.db.refreshChat(cid).catch(() => {});
    const rec = await removal(A, [chan(cid)]);
    assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]); const s = draw(A, rec);
    assert.equal(s.box.filter((x) => BOX.test(x) || TAKEN.test(x)).length, 1); assert.ok(!has(s, MANAGE) && !has(s, READ)); assert.equal(s.t.filter((x) => /History/.test(x)).length, 1, 'named once'); assert.equal(count(s), '0 chats are secured.');
  });
});

test('K10 held: the account is not secured, so the server gives it member level and holds the owner right back: refused, the fresh open answers at member level: marked', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w, plainBuild()); w.T.srv.limits.powerNeedsSecure = true;
    await newKeys(A); const o = watchOwn(A);
    const rec = await removal(A, [chan(cid)]);
    assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]); const s = draw(A, rec); assert.ok(s.box.some((x) => BOX.test(x)) && !has(s, MANAGE) && !has(s, READ));
    assert.deepEqual(o.seen, [['member', 'denied']], 'the owner key was sent once, at member level, and refused'); assert.ok(o.fresh.length && o.fresh.every((x) => x[0] === true && x[1] === 'member'), 'every fresh open was answered, at member level');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], ['owner', 'admin'], 'the old keys are still the server\'s');
  });
});

test('K11 gone: the chat was deleted before its turn. Not marked, not in the box; it stays on the grey line as today', async () => {
  await world({}, async (w) => {
    const { A, cid } = await setup(w); await newKeys(A); await A.S.db.doc('channels/' + cid).delete();
    const rec = await removal(A, [chan(cid)]);
    assert.ok(!rec.rotated[0].own, 'no failed owner step is recorded'); const s = clean(A, rec, cid); assert.equal(s.t.filter((x) => READ.test(x)).length, 1, 'on the grey line');
  });
});

test('K12 the three writes landed, then the signed list fails (a time-out): counts as done (the owner\'s decision of 2026-11-12). No mark; what the removed device held opens nothing; no open link', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); const f = failDoc(A, (v) => v && 'ometa' in v, 'timeout');
    const rec = await removal(A, [chan(cid)]);
    assert.ok(f.count() >= 1); assert.deepEqual(rec.rotated, [{ cid, ok: true }]); const s = clean(A, rec, cid); assert.equal(count(s), '1 chat is secured.');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm), level(w, cid, await A.ownerCap(cid))], [null, null, 'owner']);
    f.undo(); assert.deepEqual(Object.keys((await A.sync(cid)).invites || {}), []);
  });
});

test('K13 unsigned: a private channel whose list was never signed. As today: its own line, no mark, counted as secured', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build: plainBuild() }); await w.page('bob');   // the kit's own keys-to-offer here: the real capsFor reads the signed copy it kept first, and a signed record is never replaced by an unsigned one
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']);   // then its signed list as a page from before release 92 sealed it: no signature (channel-history-strict.test.js, pre92)
    { const raw = A.unb64(A.ksGet(cid, 0)), iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
      await A.S.db.doc('channels/' + cid).update({ ometa: { e: 0, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(JSON.stringify({ name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob'] })))).toString('base64') } });
      await A.shown(cid); await A.rolesQ.get(cid); assert.equal(A.rolesOf(cid).s, 0, 'unsigned'); }
    const old = await oldOf(A, cid);
    await newKeys(A);
    const rec = await removal(A, [chan(cid)]);
    assert.equal(rec.rotated[0].own, 'unsigned'); const s = clean(A, rec, cid); assert.ok(has(s, ADMINS)); assert.equal(count(s), '1 chat is secured.');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]);
  });
});

test('K14 a group of today and a public channel: through; and a failure there (the admin secret) is marked the same way', async () => {
  await world({}, async (w) => {
    const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob'); await A.loadDir(['alice', 'bob'], true);
    const g = 'gA' + w.cid.slice(2), p = 'cP' + w.cid.slice(2), v = (name) => ({ name, desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob'], banned: [] });
    await A.createChatDoc(g, 'group', 'private', v('Team')); await A.createChatDoc(p, 'channel', 'public', v('News'));
    const og = await oldOf(A, g), op = await oldOf(A, p);
    await newKeys(A);
    const rec = await removal(A, [{ cid: g, type: 'group', vis: 'private', name: 'Team', owner: true, admins: [], members: ['alice', 'bob'] }, { cid: p, type: 'channel', vis: 'public', name: 'News', owner: true, admins: [], members: ['alice'] }]);
    assert.ok(rec.rotated.every((d) => !d.own)); assert.deepEqual(marks(A), []);
    assert.deepEqual([level(w, g, og.own), level(w, g, og.adm), level(w, p, op.own), level(w, p, op.adm)], [null, null, null, null]);
  });
  await world({}, async (w) => {
    const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob'); await A.loadDir(['alice', 'bob'], true);
    const p = 'cP' + w.cid.slice(2); await A.createChatDoc(p, 'channel', 'public', { name: 'News', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob'], banned: [] });
    const op = await oldOf(A, p); await newKeys(A); failCall(A, 'setAdmins', ['timeout']);
    const rec = await removal(A, [{ cid: p, type: 'channel', vis: 'public', name: 'News', owner: true, admins: [], members: ['alice'] }]);
    assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [p]); assert.ok(draw(A, rec).box.some((x) => BOX.test(x)));
    assert.deepEqual([level(w, p, op.own), level(w, p, op.adm)], [null, 'admin']);
  });
});

test('K15 the admin secret lands and its reply is lost. A private channel whose list is signed: one read of the record finds this device\'s own copy of the secret this step made, so the step goes on and counts as done; no mark (removal-nouse-read-a.test.js has its cases). A group: the page noted no fingerprint to compare with, so no read: marked, although nothing the removed device held opens the chat any more (the careful side)', async () => {
  await world({}, async (w) => {
    const { A, cid, old } = await setup(w); await newKeys(A); const f = failCall(A, 'setAdmins', ['lost']);
    const rec = await removal(A, [chan(cid)]);
    assert.deepEqual(rec.rotated, [{ cid, ok: true }]); const s = clean(A, rec, cid); assert.equal(count(s), '1 chat is secured.'); assert.equal(f.calls.length, 1, 'the write was not sent again');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null]); assert.equal(Object.keys((await A.sync(cid)).invites || {}).length, 0);
  });
  await world({}, async (w) => {
    const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob'); await A.loadDir(['alice', 'bob'], true);
    const g = 'gA' + w.cid.slice(2); await A.createChatDoc(g, 'group', 'private', { name: 'Team', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob'], banned: [] });
    const og = await oldOf(A, g); await newKeys(A); failCall(A, 'setAdmins', ['lost']);
    const rec = await removal(A, [{ cid: g, type: 'group', vis: 'private', name: 'Team', owner: true, admins: [], members: ['alice', 'bob'] }]);
    assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [g]); assert.deepEqual([level(w, g, og.own), level(w, g, og.adm)], [null, null]);
  });
});
