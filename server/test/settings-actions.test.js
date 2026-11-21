// The Settings screens that write something: the profile (Save profile), Privacy (who can find me, who can message me) and
// Advanced (Message backup). Written before redesign step B (release 105) takes these writes out of the screens and gives
// them names (saveProfile, setFindable, setRequests, setMessageBackup). Step B changes nothing a person sees or the page
// does, so every test here passes on the page before the split and after it, with this file and its fixture unchanged.
//
// Each screen runs as written in app/ui.js on the made-up page of screen-kit.js. The server (S.db), the device's store (ls),
// saveContacts, syncBackup and the rest are stand-ins that note how they were called, in one list, so a test reads the
// order: what was written, what the page then copied for itself, what it said.
//
// fixtures/settings-screens.json is each screen as text (every element, class, attribute and handler, in order) with the
// lines a person reads, recorded from the page of release 104 (95b82cc). To record again after a change that is meant:
//   HUSH_RECORD=settings-screens node --test test/settings-actions.test.js      and have every changed line read.
//
// WHAT IT DOES NOT SEE: how the screens look; the real saveContacts, syncBackup and backupPath (crypto and vault tests);
// what the server accepts. "Login and devices" has its own tests (the removal engine's files).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { lift, build, el, html, I, dump, rows, sha, all, find, tick } from './screen-kit.js';

const CRYPTO = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
const BACKUP_ON = CRYPTO.match(/^const backupOn=[^\n]*$/m)[0];
const NOT_SAVED = 'That didn’t save. Try again.';

// what every screen is handed: a log, the server's stand-in, the device's store
function world(o = {}) {
  const log = [], store = Object.assign({}, o.store);
  const say = (...a) => { log.push(a); };
  const write = (name) => async (v) => { say(name, ...(v === undefined ? [] : [structuredClone(v)])); if (o.spy) o.spy(name); if (o.fail === name) throw new Error('offline'); };
  const S = { me: { handle: 'alice', name: 'Alice', disp: 'alice' }, dir: { alice: { name: 'Alice A', disp: 'Alice', bio: 'hi', photo: 'P0' }, bob: { disp: 'Bob' } },
    ids: [{ handle: 'bob', name: 'Bob', disp: 'bob' }, { handle: 'alice', name: 'Alice', disp: 'alice' }], prefs: {}, convs: [], dmPeers: {}, profilePage: null, chan: null,
    db: o.offline ? null : { doc: (p) => ({ update: write('update ' + p), delete: write('delete ' + p) }) } };
  const env = { S, el, html, I, toast: (m) => say('toast', m), toastErr: (m) => say('toastErr', m), withBadge: (n) => n, atOf: (h) => '@' + h,
    ls: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { say('ls.set', k, structuredClone(v)); store[k] = v; } } };
  return { S, env, log, say, store };
}
const inputs = (body) => all(body, (e) => e.tag === 'input');

// ---- the profile -----------------------------------------------------------------------------------------------------
const PROFILE = [lift('const dispOk=', '\n'), lift('function dispOf(', '\n'), lift('const isSettingsPage=', '\n'), lift('function buildSettings(', 'const SET_PAGES=')].join('\n');
function profile(o = {}) {
  const W = world(o), editor = {};
  if (o.change) o.change(W.S);
  const P = build(PROFILE, Object.assign(W.env, { buildSettingsPage: () => W.say('buildSettingsPage'), setTab: (t) => W.say('setTab', t), openSaved: () => W.say('openSaved'),
    photoEditor: (host, key, getName, photo, onChange) => { Object.assign(editor, { key, getName, photo, onChange }); return () => W.say('redraw'); } }), 'buildSettings');
  const body = el('div', 'body'); P.buildSettings(body);
  if (o.page) return Object.assign(W, { body });
  const [name, username, bio] = inputs(body);
  return Object.assign(W, { body, editor, name, username, bio, save: find(body, 'Save profile'), err: all(body, (e) => e.className === 'err')[0] });
}
test('Save profile: one write of name, username capitals, bio and photo; then the page\'s own copies, the device\'s list of accounts, and "Profile saved"', async () => {
  const seen = []; const X = profile({ spy: () => seen.push([X.S.me.name, X.S.me.disp, X.save.disabled]) });
  assert.deepEqual([X.name.value, X.username.value, X.bio.value, X.editor.photo, X.editor.key], ['Alice A', 'alice', 'hi', 'P0', 'alice'], 'the fields start from the directory, the capitals from the copy this device keeps');
  X.name.value = '  Alice B '; X.username.value = 'ALICE'; X.bio.value = ' new bio ';
  await X.save.onclick();
  const ids = [{ handle: 'bob', name: 'Bob', disp: 'bob' }, { handle: 'alice', name: 'Alice B', disp: 'ALICE' }];
  assert.deepEqual(X.log, [['update directory/alice', { name: 'Alice B', disp: 'ALICE', bio: 'new bio', photo: 'P0' }], ['ls.set', 'hush:ids', ids], ['toast', 'Profile saved']]);
  assert.deepEqual(seen, [['Alice', 'alice', true]], 'while the server is asked nothing is copied yet, and the button is off');
  assert.deepEqual([X.S.me.name, X.S.me.disp, X.S.ids, X.S.dir.alice], ['Alice B', 'ALICE', ids, { name: 'Alice B', disp: 'ALICE', bio: 'new bio', photo: 'P0' }], 'the other account is untouched; the directory copy takes what was written (release 109: it took the capitals only)');
  assert.equal(X.store['hush:ids'], X.S.ids);
  assert.deepEqual([X.save.disabled, X.err.textContent], [false, '']);
});
test('Save profile: the photo is the one the photo editor last gave, and no photo is written as null', async () => {
  // since release 109 the editor's photo is first written alone (profile-photo-page.test.js); that write is cleared here, so the log starts at Save profile
  const X = profile(); await X.editor.onChange('P9'); X.log.length = 0; await X.save.onclick();
  assert.equal(X.log[0][1].photo, 'P9');
  const N = profile(); await N.editor.onChange(''); N.log.length = 0; await N.save.onclick();
  assert.equal(N.log[0][1].photo, null);
  const G = profile(); assert.equal(G.editor.getName(), 'Alice A'); G.name.value = ''; assert.equal(G.editor.getName(), 'Alice', 'the photo editor draws the initial of the name being typed');
});
test('Save profile with no line for this account in the device\'s list: the write, the store and the toast all the same; with none in the directory copy either, nothing is written (release 109b: a screen built without my record would write an empty bio and no photo over it)', async () => {
  const X = profile({ change: (S) => { S.ids = [{ handle: 'bob', name: 'Bob', disp: 'bob' }]; } });
  X.name.value = 'Al'; await X.save.onclick();
  assert.deepEqual(X.log, [['update directory/alice', { name: 'Al', disp: X.username.value, bio: 'hi', photo: 'P0' }], ['ls.set', 'hush:ids', [{ handle: 'bob', name: 'Bob', disp: 'bob' }]], ['toast', 'Profile saved']]);
  assert.equal(X.S.me.name, 'Al');
  const Y = profile({ change: (S) => { S.ids = [{ handle: 'bob', name: 'Bob', disp: 'bob' }]; delete S.dir.alice; } });
  assert.deepEqual([Y.name.value, Y.username.value, Y.bio.value, Y.editor.photo], ['Alice', 'alice', '', null]);
  Y.name.value = 'Al'; await Y.save.onclick();
  assert.deepEqual([Y.log, Y.err.textContent, Y.S.me.name, Y.S.dir.alice, !!Y.save.disabled], [[], 'Profiles can’t be saved right now. Check your connection.', 'Alice', undefined, false]);
});
test('Save profile that fails: the sentence under the button; nothing copied, nothing stored, no toast; the button works again', async () => {
  const X = profile({ fail: 'update directory/alice' }); X.name.value = 'Alice B'; X.username.value = 'ALICE';
  await X.save.onclick();
  assert.deepEqual(X.log, [['update directory/alice', { name: 'Alice B', disp: 'ALICE', bio: 'hi', photo: 'P0' }]]);
  assert.equal(X.err.textContent, 'Couldn’t save. The photo may be too large, or check your connection.');
  assert.deepEqual([X.S.me.name, X.S.me.disp, X.S.ids[1], X.S.dir.alice.disp, X.save.disabled], ['Alice', 'alice', { handle: 'alice', name: 'Alice', disp: 'alice' }, 'Alice', false]);
});
test('Save profile is refused before any write: no name, a username with other letters, no connection', async () => {
  const A = profile(); A.name.value = '   '; await A.save.onclick();
  assert.deepEqual([A.err.textContent, A.log], ['Enter your name.', []]);
  const B = profile(); B.username.value = 'alicia'; await B.save.onclick();
  assert.deepEqual([B.err.textContent, B.log, B.username.value], ['Your username has to keep the same letters (alice). You can only change which ones are capitals.', [], 'alice']);
  const C = profile({ offline: true }); await C.save.onclick();
  assert.deepEqual([C.err.textContent, C.log, C.save.disabled], ['Profiles can’t be saved right now. Check your connection.', [], undefined]);
  A.err.textContent = 'old'; A.name.value = 'Ok'; await A.save.onclick(); assert.equal(A.err.textContent, '', 'a good save clears the sentence');
});
test('the profile screen: the username box keeps letters, digits and _ only; the two rows open Settings and Saved Messages; a Settings page is drawn by buildSettingsPage', () => {
  const X = profile();
  X.username.value = 'Al-i c.e_1'; X.username.oninput(); assert.equal(X.username.value, 'Alice_1');
  X.name.oninput(); assert.deepEqual(X.log, [['redraw']]);
  X.log.length = 0; all(X.body, (e) => e.innerHTML === '<svg gear/><span>More settings</span>')[0].onclick();
  assert.deepEqual([X.S.profilePage, X.log], ['settings', [['setTab', 'profile']]]);
  X.log.length = 0; all(X.body, (e) => e.innerHTML === '<svg bookmark/><span>Saved Messages</span>')[0].onclick(); assert.deepEqual(X.log, [['openSaved']]);
  const Pg = profile({ change: (S) => { S.profilePage = 'settings:privacy'; }, page: true });
  assert.deepEqual([Pg.log, Pg.body.kids], [[['buildSettingsPage']], []]);
});

// ---- Privacy ---------------------------------------------------------------------------------------------------------
const PRIVACY = [lift('function segControl(', 'function openCreateChannel('), lift('function settingsPrivacy(', 'function settingsLogin(')].join('\n');
async function privacy(o = {}) {
  const W = world(o);
  if (o.change) o.change(W.S);
  const P = build(PRIVACY, Object.assign(W.env, { syncSearch: () => W.say('syncSearch', (W.S.dir.alice || {}).findable), heartbeat: (now) => W.say('heartbeat', now), appOnly: () => false, devWord: () => 'iPhone', syncNames: () => W.say('syncNames'),
    phoneHash: async (n) => 'hash-of-' + n, userAvatar: (h, size) => el('div', 'avatar ' + size, h), convAvatar: (c, size) => el('div', 'avatar ' + size, c.id), avatar: (id, title, size) => el('div', 'avatar ' + size, id),
    displayName: (h) => h[0].toUpperCase() + h.slice(1), unblockPeer: (h) => W.say('unblockPeer', h), unblockChat: (id) => W.say('unblockChat', id), convById: (id) => W.S.convs.find((c) => c.id === id), convTitle: (c) => c.name || 'Chat',
    typeOf: (c) => c.type || 'channel', isSelf: () => false, dmPeer: (c) => c.members.find((h) => h !== 'alice'), isAdmin: (c) => c.owner === 'alice', showMeta: async (c) => ({ name: c.name, banned: c.banned }),
    unban: async (id, h) => W.say('unban', id, h), setTab: (t) => W.say('setTab', t) }), 'settingsPrivacy');
  const body = el('div', 'body'); P.settingsPrivacy(body, W.S.me); await tick();
  const segs = all(body, (e) => e.className === 'seg');
  const choice = (i, label) => segs[i].kids.find((b) => b.textContent === label);
  const pressed = (i) => segs[i].kids.filter((b) => b.attrs['aria-pressed'] === 'true').map((b) => b.textContent);
  return Object.assign(W, { body, pressed, press: async (i, label) => { await choice(i, label).onclick(); } });
}
test('Who can find me in search: one write of `findable` alone, then the page\'s copy, then the search list is brought in line, then the toast', async () => {
  const X = await privacy();
  assert.deepEqual([X.pressed(0), X.pressed(1)], [['Exact username only'], ['Message me directly']], 'both are off until the person turns them on');
  await X.press(0, 'Anyone');
  assert.deepEqual(X.log, [['update directory/alice', { findable: true }], ['syncSearch', true], ['toast', 'People can find you by your name or part of your username']]);
  assert.deepEqual([X.S.dir.alice.findable, X.pressed(0)], [true, ['Anyone']]);
  X.log.length = 0; await X.press(0, 'Exact username only');
  assert.deepEqual(X.log, [['update directory/alice', { findable: false }], ['syncSearch', false], ['toast', 'You’re out of name search. Anyone who types your exact username can still find you']]);
  assert.equal(X.S.dir.alice.findable, false);
  assert.equal('requests' in X.S.dir.alice, false, 'the other choice is not touched');
});
test('Who can find me in search that fails: the sentence; the page\'s copy and the search list stay as they were', async () => {
  const seen = []; const X = await privacy({ fail: 'update directory/alice', spy: () => seen.push(X.S.dir.alice.findable) });
  await X.press(0, 'Anyone');
  assert.deepEqual(X.log, [['update directory/alice', { findable: true }], ['toastErr', NOT_SAVED]]);
  assert.deepEqual([X.S.dir.alice.findable, seen], [undefined, [undefined]], 'not copied before the server answered, nor after it refused');
});
test('New people can: one write of `requests` alone, then the page\'s copy and the toast; the search list is not touched', async () => {
  const X = await privacy({ change: (S) => { S.dir.alice.findable = true; S.dir.alice.requests = true; } });
  assert.deepEqual([X.pressed(0), X.pressed(1)], [['Anyone'], ['Send a request first']]);
  await X.press(1, 'Message me directly');
  assert.deepEqual(X.log, [['update directory/alice', { requests: false }], ['toast', 'Anyone can message you']]);
  assert.deepEqual([X.S.dir.alice.requests, X.S.dir.alice.findable], [false, true]);
  X.log.length = 0; await X.press(1, 'Send a request first');
  assert.deepEqual(X.log, [['update directory/alice', { requests: true }], ['toast', 'New people are asked to send a request first']]);
  assert.equal(X.S.dir.alice.requests, true);
  const F = await privacy({ fail: 'update directory/alice' });
  await F.press(1, 'Send a request first');
  assert.deepEqual([F.log, F.S.dir.alice.requests], [[['update directory/alice', { requests: true }], ['toastErr', NOT_SAVED]], undefined]);
});
test('both Privacy choices with no directory copy of this account on the page: the write and the toast all the same, and no copy is made up', async () => {
  const X = await privacy({ change: (S) => { delete S.dir.alice; } });
  await X.press(0, 'Anyone'); await X.press(1, 'Send a request first');
  assert.deepEqual(X.log, [['update directory/alice', { findable: true }], ['syncSearch', undefined], ['toast', 'People can find you by your name or part of your username'],
    ['update directory/alice', { requests: true }], ['toast', 'New people are asked to send a request first']]);
  assert.equal(X.S.dir.alice, undefined);
});
test('both Privacy choices with no connection: the sentence, and nothing else', async () => {
  const X = await privacy({ offline: true });
  await X.press(0, 'Anyone'); await X.press(1, 'Send a request first');
  assert.deepEqual(X.log, [['toastErr', NOT_SAVED], ['toastErr', NOT_SAVED]]);
  assert.deepEqual([X.S.dir.alice.findable, X.S.dir.alice.requests], [undefined, undefined]);
});

// ---- Advanced: Message backup ----------------------------------------------------------------------------------------
const ADVANCED = [BACKUP_ON, lift('const P=', '\n'), lift('function settingsAdvanced(', '\nfunction openHow(')].join('\n');
const OFF_Q = ['Turn off Message backup?', 'This deletes your Message backup from the server.', { danger: true, yes: 'Turn off and delete', no: 'Keep it on',
  note: 'After that, a device that logs in with your password or recovery words won’t be able to open older messages. Linking a new device from one you’re logged in on still brings them over, and your devices keep what they have. You can turn it back on at any time.' }];
// o: on (the setting at the start), yes (the answer to the question), sync (what syncBackup answers), fail (saveContacts | syncBackup | backupPath | delete backups/alice-box)
function advanced(o = {}) {
  const W = world(o); let saves = 0, cb = null;
  W.S.prefs = { pinned: [], backup: !!o.on };
  const step = (name, answer) => async (...a) => { W.say(name, ...a); if (o.fail === name) throw new Error('offline'); return answer; };
  const P = build(ADVANCED, Object.assign(W.env, { hasRecovery: () => true, recOld: () => false, openBackup: () => W.say('openBackup'), openRestore: () => W.say('openRestore'),
    confirmSheet: async (...a) => { W.say('confirmSheet', ...a); return !!o.yes; },
    saveContacts: () => { W.say('saveContacts', 'backup=' + W.S.prefs.backup, 'switch off=' + cb.disabled); if (o.seen) o.seen.push(cb.checked); if (o.fail === 'saveContacts breaks') throw new Error('broken');
      return o.fail === 'saveContacts' && !saves++ ? Promise.reject(new Error('offline')) : Promise.resolve(); },
    syncBackup: step('syncBackup', !!o.sync), keysArrived: () => W.say('keysArrived'), backupPath: step('backupPath', 'backups/alice-box'),
    lsPw: () => null, lockCfg: () => null, openAppLock: () => {}, localStorage: { getItem: () => null }, unsealBlob: async () => null, SECK: null, renderConv: () => {}, openHow: () => {}, appOnly: () => false, openDeleteAccount: () => {} }), 'settingsAdvanced');
  const body = el('div', 'body'); P.settingsAdvanced(body, W.S.me);
  cb = inputs(body)[0];
  assert.deepEqual([cb.type, cb.parent.className, cb.parent.kids[1].textContent], ['checkbox', 'toggle', 'Message backup']);
  return Object.assign(W, { body, cb, flip: async () => { cb.checked = !cb.checked; await cb.onchange(); } });
}
test('Message backup turned on: the setting is saved first, then the backup is brought up to date, then the toast; no question', async () => {
  const X = advanced({ on: false, sync: true }); assert.equal(X.cb.checked, false);
  await X.flip();
  assert.deepEqual(X.log, [['saveContacts', 'backup=true', 'switch off=true'], ['syncBackup'], ['keysArrived'], ['toast', 'Message backup is on']]);
  assert.deepEqual([X.S.prefs.backup, X.cb.checked, X.cb.disabled], [true, true, false]);
  const N = advanced({ on: false, sync: false }); await N.flip();
  assert.deepEqual(N.log, [['saveContacts', 'backup=true', 'switch off=true'], ['syncBackup'], ['toast', 'Message backup is on']], 'nothing new arrived: the chats are not drawn again');
});
test('Message backup turned off: the question, word for word; "Keep it on" changes nothing and leaves the switch on', async () => {
  const X = advanced({ on: true, yes: false }); assert.equal(X.cb.checked, true);
  await X.flip();
  assert.deepEqual(X.log, [['confirmSheet', ...OFF_Q]]);
  assert.deepEqual([X.S.prefs.backup, X.cb.checked, X.cb.disabled], [true, true, undefined]);
});
test('Message backup turned off and confirmed: the setting is saved as off first, and only then is the backup deleted from the server, at this account\'s own path; then the toast', async () => {
  const X = advanced({ on: true, yes: true });
  await X.flip();
  assert.deepEqual(X.log, [['confirmSheet', ...OFF_Q], ['saveContacts', 'backup=false', 'switch off=true'], ['backupPath', X.S.me], ['delete backups/alice-box'], ['toast', 'Message backup is off']]);
  assert.deepEqual([X.S.prefs.backup, X.cb.checked, X.cb.disabled], [false, false, false]);
});
test('Message backup that fails at any step is put back as it was: the setting, the switch, a second save, and the sentence; it never says "off" while the backup is still there', async () => {
  const back = ['saveContacts', 'backup=true', 'switch off=true'];
  for (const [fail, steps] of [['saveContacts', []], ['backupPath', [['backupPath']]], ['delete backups/alice-box', [['backupPath'], ['delete backups/alice-box']]]]) {
    const X = advanced({ on: true, yes: true, fail }); await X.flip();
    assert.deepEqual(X.log.map((l) => (l[0] === 'backupPath' ? ['backupPath'] : l)), [['confirmSheet', ...OFF_Q], ['saveContacts', 'backup=false', 'switch off=true'], ...steps, back, ['toastErr', NOT_SAVED]], 'off, failing at ' + fail);
    assert.deepEqual([X.S.prefs.backup, X.cb.checked, X.cb.disabled], [true, true, false], 'off, failing at ' + fail);
  }
  const off = ['saveContacts', 'backup=false', 'switch off=true'];
  for (const [fail, steps] of [['saveContacts', []], ['syncBackup', [['syncBackup']]]]) {
    const X = advanced({ on: false, sync: true, fail }); await X.flip();
    assert.deepEqual(X.log, [['saveContacts', 'backup=true', 'switch off=true'], ...steps, off, ['toastErr', NOT_SAVED]], 'on, failing at ' + fail);
    assert.deepEqual([X.S.prefs.backup, X.cb.checked, X.cb.disabled], [false, false, false], 'on, failing at ' + fail);
  }
});
test('Message backup that fails: the switch is back before the setting is saved again, so a save that breaks outright still leaves the switch where it was (the review of release 105, small point 1)', async () => {
  for (const on of [true, false]) {
    const seen = [], X = advanced({ on, yes: true, sync: true, fail: 'saveContacts', seen }); await X.flip();
    assert.deepEqual(seen, [!on, on], 'the first save sees the choice, the second the switch put back; the setting was ' + on);
    const B = advanced({ on, yes: true, sync: true, fail: 'saveContacts breaks' });
    await assert.rejects(B.flip(), /broken/, 'a save that breaks both times is not swallowed, as before');
    assert.deepEqual([B.S.prefs.backup, B.cb.checked, B.log.filter((l) => /^toast/.test(l[0])).length], [on, on, 0], 'the setting and the switch are back, and nothing is said; the setting was ' + on);
  }
});
test('Message backup with no connection: the switch goes back, the sentence, and nothing is saved or asked', async () => {
  for (const on of [true, false]) {
    const X = advanced({ on, offline: true, yes: true }); await X.flip();
    assert.deepEqual(X.log, [['toastErr', 'You need to be online for this.']]);
    assert.deepEqual([X.S.prefs.backup, X.cb.checked, X.cb.disabled], [on, on, undefined]);
  }
});
test('Message backup makes the settings of an account that has none yet, as the page does everywhere (P)', async () => {
  const X = advanced({ on: false, sync: false }); X.S.prefs = null; await X.flip();
  assert.deepEqual(X.S.prefs, { pinned: [], muted: {}, archived: [], backup: true });
});

// ---- the screens as text ---------------------------------------------------------------------------------------------
const FIXTURE = new URL('./fixtures/settings-screens.json', import.meta.url);
const full = (S) => { S.dir.alice.findable = true; S.dir.alice.requests = true; S.prefs = { blocked: ['bea'], blockedChats: ['c9', 'd7'] }; S.dmPeers = { d7: 'dan' };
  S.convs = [{ id: 'c9', type: 'dm', members: ['alice', 'carl'] }, { id: 'g1', type: 'group', name: 'Team', owner: 'alice', banned: ['zed'] }, { id: 'g2', type: 'group', name: 'Other', owner: 'olga', banned: ['yan'] }]; };
test('the profile, Privacy and Advanced read as recorded: every line a person reads, and each whole screen as text', async () => {
  const shot = (body) => ({ rows: rows(body), sha: sha(dump(body)) });
  const got = { 'profile': shot(profile().body), 'profile, an account with nothing in the directory': shot(profile({ change: (S) => { delete S.dir.alice; } }).body),
    'privacy, a new account': shot((await privacy()).body), 'privacy, both choices on, a saved number and every kind of block': shot((await privacy({ change: full, store: { 'hush:phone:alice': '+15550100', 'hush:hideSeen:alice': true } })).body),
    'advanced, Message backup on': shot(advanced({ on: true }).body), 'advanced, Message backup off': shot(advanced({ on: false }).body) };
  if (process.env.HUSH_RECORD === 'settings-screens') writeFileSync(FIXTURE, JSON.stringify({ about: 'The profile, Privacy and Advanced as the page draws them, for server/test/settings-actions.test.js (its head says how this is recorded). Never edit by hand.', screens: got }, null, 1) + '\n');
  assert.deepEqual(got, JSON.parse(readFileSync(FIXTURE, 'utf8')).screens);
});
