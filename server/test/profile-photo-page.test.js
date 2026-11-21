// The photo release (release 109), the page side. Save profile keeps the page's own copy of my directory record in step
// with the server, and Set photo and Remove in the profile screen save the photo by themselves (the photo alone).
//
// buildSettings, saveProfile, photoEditor and openEditConv run as written in app/ui.js on the made-up page of
// screen-kit.js. The server is the real store (server/src/store.js) in a temp folder, so its merge (a null removes the
// field) and its directory rules decide what it keeps; each write the page makes is also noted in one list, with what
// the page said, so a test reads the order.
//
// WHAT IT DOES NOT SEE: the real picker (pickPhoto: a stand-in gives the photo), how the screen looks, the socket and the
// rights check (authz.js: a directory record is written by its owner only), the once-a-minute read of the directory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { lift, build, el, html, I, all, find } from './screen-kit.js';

let dir, store;
before(() => { dir = mkdtempSync(join(tmpdir(), 'hush-photo109-')); store = new Store({ dataDir: dir }).open(); });
after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });

const P0 = 'data:image/jpeg;base64,UDA=', P1 = 'data:image/jpeg;base64,UDE=';
const SAVE_FAILED = 'Couldn’t save. The photo may be too large, or check your connection.';
const NO_DB = 'Profiles can’t be saved right now. Check your connection.';
const record = (h) => store.get('directory/' + h).d;

// ---- the profile screen ----------------------------------------------------------------------------------------------
const PROFILE = [lift('const dispOk=', '\n'), lift('function dispOf(', '\n'), lift('const isSettingsPage=', '\n'),
  lift('function photoEditor(', 'function openEditConv('), lift('function buildSettings(', 'const SET_PAGES=')].join('\n');
let n = 0;
// a new account: its record on the server, and the page's copy of it as the last read of the directory left it
function account(o = {}) {
  const h = 'alice' + (++n), log = [], store_ = {};
  const rec = { handle: h, ecdh: { x: 'x1', y: 'y1' }, sig: { x: 'x2', y: 'y2' }, name: 'Alice A', disp: 'Alice' + n, bio: 'hi' };
  if (o.photo !== null) rec.photo = P0;
  store.set('directory/' + h, rec);
  const W = { h, log, next: P1, fail: false };
  const say = (...a) => { log.push(a); };
  W.S = { me: { handle: h, name: 'Alice', disp: h }, dir: o.unread ? {} : { [h]: structuredClone(record(h)) }, /* unread: the first read of the directory failed, the copy is empty */ ids: [{ handle: h, name: 'Alice', disp: h }], profilePage: null,
    db: o.offline ? null : { doc: (p) => ({ update: async (v) => { say('update ' + p, structuredClone(v)); const fail = W.fail, hold = W.hold; if (hold) await hold;
      if (fail) throw new Error('offline'); store.update(p, structuredClone(v)); } }) } };
  W.env = { S: W.S, el, html, I, toast: (m) => say('toast', m), toastErr: (m) => say('toastErr', m), withBadge: (x) => x, atOf: (x) => '@' + x,
    ls: { get: (k, d) => (k in store_ ? store_[k] : d), set: (k, v) => { store_[k] = v; } },
    buildSettingsPage: () => say('buildSettingsPage'), setTab: (t) => say('setTab', t), openSaved: () => say('openSaved'), renderConv: () => say('renderConv', W.S.rendered),
    pickPhoto: async () => W.next, avatar: (key, name, cls, photo) => el('div', 'avatar ' + cls, photo ? 'photo ' + photo : 'letter ' + String(name)[0]) };
  return W;
}
// the screen as Settings builds it, each time it is opened (Chats and back builds it again)
function screen(W) {
  const P = build(PROFILE, W.env, 'buildSettings');
  const body = el('div', 'body'); P.buildSettings(body);
  const [name, username, bio] = all(body, (e) => e.tag === 'input');
  const shown = () => all(body, (e) => /^avatar/.test(e.className))[0].textContent;
  return { body, name, username, bio, shown, set: find(body, 'Set photo'), rm: find(body, 'Remove'), save: find(body, 'Save profile') };
}

test('Save profile: once the write went through, the page\'s own copy of my record holds the new name, capitals, bio and photo, as the server does; a removed photo leaves no photo field there, as on the server', async () => {
  const W = account(), X = screen(W);
  X.name.value = 'Alice B'; X.username.value = W.h.toUpperCase(); X.bio.value = 'new bio';
  W.next = P1; await X.set.onclick(); await X.save.onclick();
  assert.deepEqual(W.log.at(-1), ['toast', 'Profile saved']);
  const d = W.S.dir[W.h];
  assert.deepEqual([d.name, d.disp, d.bio, d.photo], ['Alice B', W.h.toUpperCase(), 'new bio', P1], 'the copy every screen draws from has what was written');
  assert.deepEqual(d, record(W.h), 'the copy is the server\'s record');
  await X.rm.onclick(); await X.save.onclick();
  assert.equal('photo' in W.S.dir[W.h], false, 'no photo field, not a null one');
  assert.equal('photo' in record(W.h), false);
  assert.deepEqual(W.S.dir[W.h], record(W.h));
});

test('Save profile twice, with the screen built again in between (Chats and back): the second save keeps the photo, the name and the bio on the server', async () => {
  const W = account({ photo: null }); let X = screen(W);
  W.next = P1; await X.set.onclick(); X.name.value = 'Alice B'; X.bio.value = 'new bio'; await X.save.onclick();
  assert.equal(record(W.h).photo, P1);
  X = screen(W);
  await X.save.onclick();
  assert.deepEqual(W.log.at(-1), ['toast', 'Profile saved']);
  assert.deepEqual([record(W.h).photo, record(W.h).name, record(W.h).bio], [P1, 'Alice B', 'new bio'], 'nothing written once is taken back by the next save');
  assert.deepEqual([X.shown(), X.name.value, X.bio.value], ['photo ' + P1, 'Alice B', 'new bio'], 'the screen built again shows what was saved');
});

test('Set photo saves by itself: one write of the photo alone, then the page\'s copy; the Name and Bio fields stay as typed, unsent', async () => {
  const W = account(), X = screen(W);
  X.name.value = 'Typed, not saved'; X.bio.value = 'typed bio';
  W.next = P1; await X.set.onclick();
  assert.deepEqual(W.log, [['update directory/' + W.h, { photo: P1 }]], 'the photo alone; nothing said when it went through');
  assert.deepEqual([X.shown(), X.rm.hidden, X.name.value, X.bio.value], ['photo ' + P1, false, 'Typed, not saved', 'typed bio']);
  assert.deepEqual([W.S.dir[W.h].photo, W.S.dir[W.h].name, W.S.dir[W.h].bio], [P1, 'Alice A', 'hi'], 'the copy takes the photo, and only the photo');
  assert.deepEqual([record(W.h).photo, record(W.h).name, record(W.h).bio], [P1, 'Alice A', 'hi']);
  assert.equal(screen(W).shown(), 'photo ' + P1, 'Chats and back: the photo stays');
  W.next = null; W.log.length = 0; await X.set.onclick();
  assert.deepEqual([W.log, X.shown()], [[], 'photo ' + P1], 'the picker closed with no choice: nothing written, nothing changed');
});

test('Remove saves by itself: one write that removes the photo alone; the copy is left with no photo field, as on the server', async () => {
  const W = account(), X = screen(W);
  X.name.value = 'Typed, not saved';
  await X.rm.onclick();
  assert.deepEqual(W.log, [['update directory/' + W.h, { photo: null }]]);
  assert.deepEqual([X.shown(), X.rm.hidden, X.name.value], ['letter T', true, 'Typed, not saved']);
  assert.deepEqual(['photo' in W.S.dir[W.h], 'photo' in record(W.h), W.S.dir[W.h].name, record(W.h).name], [false, false, 'Alice A', 'Alice A']);
  assert.equal(screen(W).shown(), 'letter A', 'Chats and back: still no photo');
});

test('Set photo or Remove that fails puts the picture back as it was and says so; a Save profile after it writes the picture shown', async () => {
  for (const act of ['set', 'rm']) {
    const W = account(), X = screen(W); W.fail = true;
    await X[act].onclick();
    assert.deepEqual(W.log, [['update directory/' + W.h, { photo: act === 'set' ? P1 : null }], ['toastErr', SAVE_FAILED]], act);
    assert.deepEqual([X.shown(), X.rm.hidden, W.S.dir[W.h].photo, record(W.h).photo], ['photo ' + P0, false, P0, P0], act + ': back as it was, on the screen, in the copy, on the server');
    W.fail = false; W.log.length = 0; await X.save.onclick();
    assert.equal(W.log[0][1].photo, P0, act + ': Save profile sends the photo the screen shows');
  }
  const W = account({ offline: true }), X = screen(W);
  W.next = P1; await X.set.onclick();
  assert.deepEqual([W.log, X.shown()], [[['toastErr', NO_DB]], 'photo ' + P0], 'no connection: nothing written, the picture back, the sentence');
  await X.rm.onclick();
  assert.deepEqual([W.log.length, X.shown(), X.rm.hidden], [2, 'photo ' + P0, false]);
});

test('a failed write that ends after a newer pick does not put the older picture back over it', async () => {
  const W = account(), X = screen(W); let go; const P2 = 'data:image/jpeg;base64,UDI=';
  W.fail = true; W.hold = new Promise((r) => { go = r; }); W.next = P1; const first = X.set.onclick();
  await new Promise((r) => setImmediate(r));
  W.fail = false; W.hold = null; W.next = P2; await X.set.onclick();
  go(); await first;
  assert.deepEqual(W.log, [['update directory/' + W.h, { photo: P1 }], ['update directory/' + W.h, { photo: P2 }], ['toastErr', SAVE_FAILED]]);
  assert.deepEqual([X.shown(), W.S.dir[W.h].photo, record(W.h).photo], ['photo ' + P2, P2, P2], 'the newer photo stays, on the screen, in the copy, on the server');
  W.log.length = 0; await X.save.onclick();
  assert.equal(W.log[0][1].photo, P2, 'Save profile sends the photo the screen shows');
});

// ---- round 2 ---------------------------------------------------------------------------------------------------------
test('Save profile with a chat open beside Settings (two columns, 760 px and wider): the chat is drawn again in full, so a reply quote of my own name shows the new name at once', async () => {
  const W = account(), X = screen(W);
  W.S.chan = 'c1'; W.S.rendered = { key: 'c1' };
  X.name.value = 'Alice B'; await X.save.onclick();
  assert.deepEqual(W.log.slice(-2), [['toast', 'Profile saved'], ['renderConv', null]], 'what was drawn is dropped, then the chat is drawn from the copy that has the new name');
  assert.equal(W.S.dir[W.h].name, 'Alice B');
  W.S.chan = null; W.log.length = 0; await X.save.onclick();
  assert.deepEqual(W.log.at(-1), ['toast', 'Profile saved'], 'no chat open: nothing drawn');
  W.S.chan = 'c1'; W.S.rendered = { key: 'c1' }; W.fail = true; W.log.length = 0; await X.save.onclick();
  assert.deepEqual([W.log.some((x) => x[0] === 'renderConv'), W.S.rendered], [false, { key: 'c1' }], 'a save that failed draws nothing again');
});

const tick = () => new Promise((r) => setImmediate(r));
test('Set photo or Remove, then Settings built again before the write answered (Chats and back): the new screen shows the photo being written and its Save profile sends it', async () => {
  for (const act of ['set', 'rm']) {
    const W = account(), X = screen(W); let go; W.hold = new Promise((r) => { go = r; }); W.next = P1;
    const a = X[act].onclick(); await tick();
    X.name.isConnected = false; const Y = screen(W);   // the new screen replaces the old one
    const want = act === 'set' ? 'photo ' + P1 : 'letter A';
    assert.deepEqual([Y.shown(), Y.rm.hidden], [want, act !== 'set'], act + ': the photo being written, not the old one');
    W.hold = null; go(); await a;
    assert.deepEqual([Y.shown(), W.S.dir[W.h].photo, record(W.h).photo], [want, act === 'set' ? P1 : undefined, act === 'set' ? P1 : undefined], act + ': written, in the copy, on the screen');
    W.log.length = 0; await Y.save.onclick();
    assert.equal(W.log[0][1].photo, act === 'set' ? P1 : null, act + ': Save profile on the new screen sends the photo it shows');
    assert.equal(record(W.h).photo, act === 'set' ? P1 : undefined, act + ': and the server keeps it');
  }
});

test('the same, and the write then fails: the copy goes back to what the server holds and the Settings screen showing is drawn again from it', async () => {
  for (const act of ['set', 'rm']) {
    const W = account(), X = screen(W); let go; W.S.tab = 'profile'; W.fail = true; W.hold = new Promise((r) => { go = r; }); W.next = P1;
    const a = X[act].onclick(); await tick();
    X.name.isConnected = false; screen(W);   // the new screen, built while the write is out
    W.fail = false; W.hold = null; go(); await a;
    assert.deepEqual(W.log.slice(1), [['setTab', 'profile'], ['toastErr', SAVE_FAILED]], act + ': the screen showing is built again, and the page says so');
    assert.deepEqual([W.S.dir[W.h].photo, record(W.h).photo], [P0, P0], act + ': the copy holds what the server holds');
    const Z = screen(W);   // as setTab('profile') builds it
    assert.equal(Z.shown(), 'photo ' + P0);
    W.log.length = 0; await Z.save.onclick();
    assert.deepEqual([W.log[0][1].photo, record(W.h).photo], [P0, P0], act + ': Save profile there sends what the server holds');
  }
  const W = account(), X = screen(W); W.S.tab = 'profile'; W.fail = true; X.name.value = 'Typed, not saved';
  await X.set.onclick();
  assert.deepEqual([W.log.slice(1), X.shown(), X.name.value], [[['toastErr', SAVE_FAILED]], 'photo ' + P0, 'Typed, not saved'], 'the screen of the pick still showing: it puts its picture back itself and is not built again');
});

test('a Settings screen built during the writes shows the newest pick: not the older one whose write answered first, nor the old record a minute read put back meanwhile', async () => {
  const W = account(), X = screen(W); const P2 = 'data:image/jpeg;base64,UDI='; let go1, go2;
  W.hold = new Promise((r) => { go1 = r; }); W.next = P1; const a = X.set.onclick(); await tick();
  W.hold = new Promise((r) => { go2 = r; }); W.next = P2; const b = X.set.onclick(); await tick();
  W.hold = null; go1(); await a;
  assert.equal(screen(W).shown(), 'photo ' + P2, 'the first write answered: the copy keeps the newer pick');
  W.S.dir[W.h] = structuredClone(record(W.h));   // a minute read that left before the second write lands now, with the record as it was then
  go2(); await b;
  assert.deepEqual([screen(W).shown(), W.S.dir[W.h].photo, record(W.h).photo], ['photo ' + P2, P2, P2], 'the second write answered: the copy has it again');
});

// ---- release 109b ------------------------------------------------------------------------------------------------
test('the first read of the directory failed, so the page\'s copy of my record is empty: Settings built from it, Save profile writes nothing and says so, and the server keeps my name, bio and photo; the same once the record is read while that screen is still open', async () => {
  const W = account({ unread: true }), was = structuredClone(record(W.h)), X = screen(W);
  assert.deepEqual([X.shown(), X.bio.value], ['letter A', ''], 'the screen has no photo and an empty Bio: it never got my record');
  X.name.value = 'Alice B'; await X.save.onclick();
  assert.deepEqual(W.log.filter((x) => /^update /.test(x[0])), [], 'nothing sent');
  assert.equal(X.body.kids.find((k) => k.className === 'err').textContent, NO_DB, 'the sentence under the button');
  assert.deepEqual(record(W.h), was, 'name, bio and photo as they were on the server');
  W.S.dir[W.h] = structuredClone(record(W.h));   // the next read worked; the screen built before it is still open
  await X.save.onclick();
  assert.deepEqual([W.log.filter((x) => /^update /.test(x[0])), record(W.h)], [[], was], 'still nothing from the screen that never got my record');
});

test('guard: Settings built once my record is in the copy (Chats and back after a read that worked) saves as before; a normal Save profile writes name, capitals, bio and photo as today', async () => {
  const W = account({ unread: true });
  W.S.dir[W.h] = structuredClone(record(W.h));
  const X = screen(W);
  assert.deepEqual([X.shown(), X.bio.value], ['photo ' + P0, 'hi']);
  X.name.value = 'Alice B'; await X.save.onclick();
  assert.deepEqual(W.log, [['update directory/' + W.h, { name: 'Alice B', disp: W.h, bio: 'hi', photo: P0 }], ['toast', 'Profile saved']]);
  assert.deepEqual([record(W.h).name, record(W.h).bio, record(W.h).photo], ['Alice B', 'hi', P0]);
});

test('round 2 (security S3): after a key replacement whose read of my record failed, the copy is only a stub (handle, keys, kv, devs: ui.js, the rekey\'s mirror stage); Settings built from it writes nothing on Save profile and says so, and the server keeps name, bio and photo', async () => {
  const W = account({ unread: true }), was = structuredClone(record(W.h));
  W.S.dir[W.h] = { handle: W.h, ecdh: { x: 'n1', y: 'n1' }, sig: { x: 'n2', y: 'n2' }, kv: 2, devs: { d1: {} } };   // as the mirror stage leaves it after a failed loadDir
  const X = screen(W);
  X.name.value = 'Alice B'; await X.save.onclick();
  assert.deepEqual(W.log.filter((x) => /^update /.test(x[0])), [], 'nothing sent');
  assert.equal(X.body.kids.find((k) => k.className === 'err').textContent, NO_DB);
  assert.deepEqual(record(W.h), was);
  // guard: a record that was read and has no bio and no photo (a new account as signup writes it) still saves
  const N = account({ photo: null }); delete N.S.dir[N.h].bio;
  const Y = screen(N); Y.name.value = 'Nia'; await Y.save.onclick();
  assert.deepEqual(N.log, [['update directory/' + N.h, { name: 'Nia', disp: N.h, bio: '', photo: null }], ['toast', 'Profile saved']]);
});

// ---- the group and channel editor (guard: the same before and after this release) --------------------------------
const EDIT = [lift('function photoEditor(', 'function openEditConv('), lift('function openEditConv(', 'async function openProfile(')].join('\n');
test('guard: the group and channel editor (openEditConv) shares the photo editor and still writes only on its own Save', async () => {
  for (const c of [{ id: 'c1', type: 'channel', visibility: 'public', name: 'News', desc: 'd', photo: P0, admins: [] },
    { id: 'g1', type: 'group', visibility: 'private', name: 'Team', desc: '', photo: null, admins: [] }]) {
    const log = [], say = (...a) => log.push(a); let picked = P1;
    const sh = el('div', 'sheet'), body = el('div', 'body');
    const P = build(EDIT, { S: { chan: null, db: { doc: (p) => ({ update: async (v) => say('update ' + p, structuredClone(v)) }) } }, el, html,
      convById: () => c, typeOf: (x) => x.type, sheet: (t) => { say('sheet', t); return { body, sh, close: () => say('close') }; },
      chatAnd: async () => [c, c], handOver: async () => say('handOver'), metaOf: (x) => ({ name: x.name }), putOMeta: async (x, m) => say('putOMeta', structuredClone(m)),
      toast: (m) => say('toast', m), displayName: (x) => x, openConv: () => say('openConv'), setTimeout,
      pickPhoto: async () => picked, avatar: (key, name, cls, photo) => el('div', 'avatar ' + cls, photo ? 'photo ' + photo : 'letter ' + String(name)[0]) }, 'openEditConv');
    P.openEditConv(c.id); log.length = 0;
    const shown = () => all(body, (e) => /^avatar/.test(e.className))[0].textContent;
    await find(body, 'Set photo').onclick();
    assert.deepEqual([log, shown()], [[], 'photo ' + P1], c.type + ': Set photo writes nothing, it shows the photo');
    if (c.type === 'channel') { await find(body, 'Remove').onclick(); assert.deepEqual([log, shown()], [[], 'letter N'], 'Remove writes nothing'); }
    picked = null; await find(body, 'Set photo').onclick(); assert.deepEqual(log, []);
    await find(sh, 'Save').onclick();
    assert.deepEqual(log, c.type === 'channel'
      ? [['update channels/c1', { name: 'News', desc: 'd', photo: null }], ['close'], ['toast', 'Saved']]
      : [['handOver'], ['putOMeta', { name: 'Team', desc: '', photo: P1 }], ['close'], ['toast', 'Saved']], c.type + ': one write, on Save');
    assert.equal(c.photo, c.type === 'channel' ? null : P1, 'the page\'s own copy of the chat, once saved');
  }
});
