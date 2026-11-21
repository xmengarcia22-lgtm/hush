// Release 104, item 5 (SPEC.md 14.15): the mark "don't use" itself.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// Where the mark lives, what it survives and what takes it away (M1 to M4, M7), the chat's own notice (M1, M2), the summary's
// lines on every kind of record (M5), and the way back: release 103's own summary reading a record of release 104 (M6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { world, makeChannel, linkOf, pageFor, mkBuild } from './channel-history-kit.js';
import { HANDLE } from '../src/identity.js';
import { level, newKeys, removal, draw, has, count, marks, MANAGE, BOX, READ, TAKEN, ADMINS, failCall, realCapsBuild, chatNote, NOTE_TEXT, UIJS, cut } from './removal-kit.js';

// release 103's own summary function, as a fixture (fixtures/page103-summary.txt: `git show 08e231e:app/ui.js`, from "function rekeySummary(" up to
// "async function finishRekey("; that page's sha256 starts 1361ecb3a3886670 and it has no "hush:noUse" and no "nouse" in it)
const SUM103 = readFileSync(new URL('./fixtures/page103-summary.txt', import.meta.url), 'utf8');
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 16);
// the mark's key as the page under test reads it in a chat (openConv's statement); looked up when a test asks, so that a page without it fails that test and no other
const pageKey = () => { const m = UIJS.match(/ls\.get\('(hush:\w+:)'\+S\.me\.handle,\{\}\)\[cid\]/); assert.ok(m, 'the page reads the mark in a chat'); return m[1]; };
const chan = (cid) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'] });

test('M1 the mark is written with the record, is read back by a page started afresh over the same store, and the chat shows the notice; another chat and a one-on-one chat show nothing', async () => {
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid);
    await newKeys(A); failCall(A, 'setOwner', ['timeout']);
    const rec = await removal(A, [chan(cid)]);
    assert.equal(rec.rotated[0].own, 'error'); assert.deepEqual(marks(A), [cid]);
    assert.deepEqual(JSON.parse(A.store.get('hush:noUse:alice')), { [cid]: 1 }, 'one entry per chat: its id and a 1');
    const again = await pageFor(null, 'alice', { store: A.store, id: A.S.me });   // a reload: a new page over the same store
    assert.deepEqual(marks(again), [cid]);
    assert.deepEqual(chatNote(again, cid, 'channel'), [{ tag: 'div', cls: 'reqnote', text: NOTE_TEXT }]);
    assert.deepEqual(chatNote(again, cid, 'group'), [{ tag: 'div', cls: 'reqnote', text: NOTE_TEXT }]);
    assert.deepEqual(chatNote(again, cid, 'dm'), []);
    assert.deepEqual(chatNote(again, 'cHsomeother1', 'channel'), []);
    const other = await pageFor(null, 'carol', { store: A.store });   // another account on the same device
    assert.deepEqual(chatNote(other, cid, 'channel'), [], 'the mark is this account\'s alone');
  });
});

test('M2 a removal that had already dealt with a chat before the page was updated (its record names the chat) writes no mark for it: the summary still names the chat, the chat itself gets no notice', async () => {
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await newKeys(A);
    const rec = { stage: 'rotate', name: 'Old phone', rotated: [{ cid, ok: true, own: 'error' }], chats: [{ type: 'channel', vis: 'private', name: 'History', unlocked: true, ...chan(cid) }] };
    const ui = { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: () => {}, done: () => {} };
    A.S.contactsReady = true; A.S.vaultOk = true; await A.rekeyRun(rec, ui); A.S.rekeying = false;
    assert.deepEqual(marks(A), []); const s = draw(A, rec); assert.equal(s.box.filter((x) => BOX.test(x)).length, 1); assert.deepEqual(chatNote(A, cid), []);
  });
});

// ---- the real sealed store of the page (the HUSH STORE block, as page-store.test.js runs it) ----
const sa = UIJS.indexOf('/* ===== HUSH STORE BEGIN ===== */'), sb = UIJS.indexOf('/* ===== HUSH STORE END ===== */');
const storeBuild = new Function('localStorage', 'indexedDB', 'addEventListener', 'enc', 'dec', 'b64u', 'unb64u', UIJS.slice(sa, sb) + '\nreturn { ls, lsSecret, PLAIN_KEYS, unlockStore, forgetEntries, mergeSealed, secSave: () => secSave, SECM: () => SECM };');
class FakeStorage { constructor() { this.m = new Map(); } get length() { return this.m.size; } key(i) { return [...this.m.keys()][i] ?? null; } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }
const b64u = (u) => Buffer.from(u).toString('base64url'), unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const tab = (st, on) => storeBuild(st, undefined, on ? (t, f) => { on[t] = f; } : undefined, new TextEncoder(), new TextDecoder(), b64u, unb64u);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('M3 in the page\'s real store the mark is sealed (nothing of it in the clear), comes back after a reload, and a log-out of that account takes it away and leaves another account\'s', async () => {
  const st = new FakeStorage(), p = tab(st); await p.unlockStore();
  assert.equal(p.lsSecret('hush:noUse:alice'), true); assert.ok(!p.PLAIN_KEYS.has('hush:noUse:alice'));
  p.ls.set('hush:ids', [{ handle: 'alice', kv: 2 }, { handle: 'bob', kv: 1 }]); p.ls.set('hush:noUse:alice', { cHaaaaaaaaaaa: 1 }); p.ls.set('hush:noUse:bob', { cHbbbbbbbbbbb: 1 }); await p.secSave();
  assert.deepEqual([...st.m.keys()].sort(), ['hush:devkey', 'hush:sealed']); assert.ok(!/nouse/i.test(st.getItem('hush:sealed')) && !st.getItem('hush:sealed').includes('cHaaaaaaaaaaa'));
  const q = tab(st); await q.unlockStore(); assert.deepEqual(q.ls.get('hush:noUse:alice', null), { cHaaaaaaaaaaa: 1 });
  const ownedLine = UIJS.match(/^const ownedBy=.*$/m)[0], forgetLine = UIJS.match(/^  forgetEntries\(\(k,v\)=>ownedBy\(k,h\).*$/m)[0];   // forgetAccountData's own statement
  const ownedBy = new Function(ownedLine + '\nreturn ownedBy;')();
  assert.equal(ownedBy('hush:noUse:alice', 'alice'), true); assert.equal(ownedBy('hush:noUse:alice', 'al'), false); assert.equal(ownedBy('hush:noUse:alice', 'bob'), false);
  new Function('forgetEntries', 'ownedBy', 'h', forgetLine)(q.forgetEntries, ownedBy, 'alice'); await q.secSave();
  const r = tab(st); await r.unlockStore();
  assert.equal(r.ls.get('hush:noUse:alice', null), null, 'gone with the log-out'); assert.deepEqual(r.ls.get('hush:noUse:bob', null), { cHbbbbbbbbbbb: 1 }, 'the other account\'s stays');
});

test('M3b the key\'s middle word is no valid username, by the page\'s rule and by the server\'s, so no account\'s log-out can match another account\'s mark. Run with an account named "nouse" (a valid username: the middle word in small letters): its log-out takes its own mark and leaves the other account\'s', async () => {
  const PAGEKEY = pageKey(), mid = PAGEKEY.split(':')[1], validHandle =new Function(UIJS.match(/^const validHandle=.*$/m)[0] + '\nreturn validHandle;')();
  assert.equal(validHandle('nouse'), true); assert.equal(HANDLE.test('nouse'), true); assert.equal(validHandle(mid), false, 'the page lets nobody choose this name'); assert.equal(HANDLE.test(mid), false, 'nor does the server');
  const st = new FakeStorage(), p = tab(st); await p.unlockStore();
  p.ls.set('hush:ids', [{ handle: 'nouse', kv: 1 }, { handle: 'bob', kv: 1 }]); p.ls.set(PAGEKEY + 'nouse', { cHnnnnnnnnnnn: 1 }); p.ls.set(PAGEKEY + 'bob', { cHbbbbbbbbbbb: 1 }); await p.secSave();
  const ownedBy = new Function(UIJS.match(/^const ownedBy=.*$/m)[0] + '\nreturn ownedBy;')(), forgetLine = UIJS.match(/^  forgetEntries\(\(k,v\)=>ownedBy\(k,h\).*$/m)[0];
  assert.equal(ownedBy(PAGEKEY + 'bob', 'nouse'), false, 'the log-out of "nouse" does not match bob\'s mark'); assert.equal(ownedBy(PAGEKEY + 'nouse', 'nouse'), true);
  new Function('forgetEntries', 'ownedBy', 'h', forgetLine)(p.forgetEntries, ownedBy, 'nouse'); await p.secSave();
  const q = tab(st); await q.unlockStore();
  assert.equal(q.ls.get(PAGEKEY + 'nouse', null), null, 'its own mark is gone'); assert.deepEqual(q.ls.get(PAGEKEY + 'bob', null), { cHbbbbbbbbbbb: 1 }, 'the other account\'s mark stays');
});

test('M4 two tabs of one browser: a tab that heard the other tab\'s write keeps the mark; a tab that writes in the very moment before it heard it writes the store back WITHOUT the mark (the store carries only account keys, chat keys and the removal record across such a race, as today)', async () => {
  globalThis.S = { me: null };
  try {
    const ids = [{ handle: 'alice', kv: 2 }, { handle: 'bob', kv: 1 }];
    {
      const st = new FakeStorage(), on = {}, A = tab(st); await A.unlockStore(); A.ls.set('hush:ids', ids); await A.secSave();
      const B = tab(st, on); await B.unlockStore();
      A.ls.set('hush:noUse:alice', { cHx: 1 }); A.ls.set('hush:rekey:alice', { stage: 'rotate', at: 5, rotated: [{ cid: 'cHx', ok: true, own: 'error' }] }); await A.secSave();
      on.storage({ key: 'hush:sealed', newValue: st.getItem('hush:sealed') }); await sleep(50);
      B.ls.set('hush:draft:bob:gY', 'hello'); await B.secSave();
      const C = tab(st); await C.unlockStore();
      assert.deepEqual(C.ls.get('hush:noUse:alice', null), { cHx: 1 }, 'heard first: kept'); assert.equal(C.ls.get('hush:draft:bob:gY'), 'hello');
    }
    {
      const st = new FakeStorage(), A = tab(st); await A.unlockStore(); A.ls.set('hush:ids', ids); await A.secSave();
      const B = tab(st, {}); await B.unlockStore();
      A.ls.set('hush:noUse:alice', { cHx: 1 }); A.ls.set('hush:rekey:alice', { stage: 'rotate', at: 5, rotated: [{ cid: 'cHx', ok: true, own: 'error' }] }); await A.secSave();
      B.ls.set('hush:draft:bob:gY', 'hello'); await B.secSave();   // B writes before it heard A's write
      const C = tab(st); await C.unlockStore();
      assert.equal(C.ls.get('hush:noUse:alice', null), null, 'the mark is lost in this race');
      assert.deepEqual(C.ls.get('hush:rekey:alice', null).rotated, [{ cid: 'cHx', ok: true, own: 'error' }], 'the removal record, which the summary is drawn from, is carried over');
    }
  } finally { delete globalThis.S; }
});

// ---- the summary on every kind of record ----
const KINDS = [
  ['c1', 'Through', { ok: true }, { owner: true }],
  ['c2', 'Failed', { ok: true, own: 'error' }, { owner: true }],
  ['c3', 'Bothfailed', { skip: 'error', msg: 'x', own: 'error' }, { owner: true }],
  ['c4', 'Lockedmine', { skip: 'taken', own: 'error' }, { owner: true }],
  ['c5', 'Lockedother', { skip: 'taken' }, {}],
  ['c6', 'Keyfailed', { skip: 'error', msg: 'x' }, {}],
  ['c7', 'Unsigned', { ok: true, own: 'unsigned' }, { owner: true }],
  ['c8', 'Fullgroup', { skip: 'epochcap', own: 'error' }, { owner: true, type: 'group' }],
  ['c9', 'Late', { ok: true }, { owner: true }],
  ['c10', 'Publicfailed', { ok: true, own: 'error' }, { owner: true, vis: 'public' }],
];
const record = () => ({ name: 'Old phone', chats: KINDS.map(([cid, name, , x]) => ({ cid, name, type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], ...x })), rotated: KINDS.map(([cid, , r]) => ({ cid, ...r })) });
const linesOf = (s, name) => s.t.filter((x) => new RegExp('\\b' + name + '\\b').test(x));

test('M5 the summary, one record with every kind in it: each chat is named in one line at most, a marked chat is in the new box and not counted, a locked-out one is in the "Someone locked you out" box only, a failed key change alone stays on the grey line', async () => {
  const P = await pageFor(null, 'alice'), s = draw(P, record());
  assert.equal(count(s), '3 chats are secured.', 'Through, Unsigned and Late; none of the marked ones');
  assert.deepEqual(s.box.filter((x) => BOX.test(x)), ['Couldn’t secure these chats: Failed, Bothfailed, Fullgroup, Publicfailed. A device you removed may still have control there. Don’t use them any more. Start new chats with the same people.']);
  assert.deepEqual(s.box.filter((x) => TAKEN.test(x)), ['Someone locked you out of these chats first, most likely with the removed device: Lockedmine, Lockedother. Don’t use them any more. Start new chats with the same people.']);
  assert.deepEqual(s.t.filter((x) => READ.test(x)), ['Couldn’t secure these chats: Keyfailed. The removed device may still read new messages there. Don’t write anything private in them; start new chats if you need to.']);
  assert.ok(!has(s, MANAGE) && !s.btn, 'the "may still be able to manage" line is gone, and there is no button');
  for (const [, name] of KINDS) assert.ok(linesOf(s, name).length <= 1, name + ' is named once at most');
  for (const name of ['Through', 'Late']) assert.equal(linesOf(s, name).length, 0);
  assert.equal(s.t.filter((x) => ADMINS.test(x)).length, 1);
  const i = (re) => s.t.findIndex((x) => re.test(x)); assert.ok(i(BOX) > 0 && i(BOX) + 1 === i(TAKEN) && i(TAKEN) < i(READ), 'the new box stands right above the "Someone locked you out" box, both above the grey line');
});

test('M6 the way back: release 103\'s own summary reads a record that release 104 wrote (same fields, same values), and release 103\'s page never reads or writes the mark', async () => {
  assert.equal(sha(SUM103), 'f7f778f034660fb6', 'the fixture is release 103\'s text');
  const P = await pageFor(null, 'alice', { build: mkBuild(SUM103) }), s = draw(P, record());
  assert.equal(count(s), '5 chats are secured.', 'as release 103 counts today: every chat whose key change went through, the two failed ones among them');
  assert.deepEqual(s.t.filter((x) => MANAGE.test(x)), ['The removed device may still be able to manage Failed, Bothfailed, Lockedmine, Fullgroup, Publicfailed: securing didn’t finish there.']);
  assert.ok(!s.box.some((x) => BOX.test(x)));
  // the store block and the log-out's matching line are release 103's text, unchanged (pinned from 08e231e), so 103 keeps the entry in the sealed blob and drops it at log-out as M3 shows
  assert.equal(sha(UIJS.slice(UIJS.indexOf('/* ===== HUSH STORE BEGIN ===== */'), UIJS.indexOf('/* ===== HUSH STORE END ===== */'))), '4fbf94b593979e9f');
  assert.equal(UIJS.match(/^const ownedBy=.*$/m)[0], "const ownedBy=(k,h)=>k==='hush:ks:'+h||String(k).endsWith(':'+h)||String(k).includes(':'+h+':');");
});

// ---- a device linked after the removal (and this device after a log-out and a new sign-in): what a link, the 12 words and the password copy hand over ----
const CRY = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
const bundle = new Function('dispOk', 'validHandle', CRY.match(/^const OWN_RE=.*$/m)[0] + '\n' + CRY.match(/^function bundleOf\(id\)\{.*$/m)[0] + '\n' + cut('function idFromBundle(', 'async function linkKey(', CRY) + '\nreturn { bundleOf, idFromBundle };')(() => true, () => true);

test('M7 a device linked after the removal gets the account\'s current keys and nothing of the keys before: it cannot work out the owner key of the keys before, so in a chat whose owner key was never replaced no key of its own is the chat\'s owner key; it holds no mark and shows no notice', async () => {
  await world({}, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid);
    await newKeys(A); failCall(A, 'setOwner', ['timeout']);
    await removal(A, [chan(cid)]); assert.deepEqual(marks(A), [cid]);
    assert.ok(A.S.me.prev && A.S.me.prev.own, 'this device keeps the keys before');
    assert.equal(level(w, cid, await A.ownerCapOld(cid)), 'owner', 'and with them the chat\'s owner key');
    const wire = JSON.parse(JSON.stringify(bundle.bundleOf(A.S.me)));   // what a link, the 12 words and the password copy carry
    assert.ok(!('prev' in wire)); const id = bundle.idFromBundle(wire); assert.ok(!('prev' in id)); assert.equal(id.own, A.S.me.own);
    const L = await pageFor(null, 'alice', { id });
    assert.equal(await L.ownerCapOld(cid), null, 'no owner key of the keys before'); assert.equal(level(w, cid, await L.ownerCap(cid)), null, 'its own owner key for this chat is not the chat\'s');
    assert.deepEqual(marks(L), []); assert.deepEqual(chatNote(L, cid), []);
  });
});
