// The page's first read of the directory (release 109, round 2). refreshDir reads my own record into the page's copy and
// then republishSelf puts my keys back if they are missing, writing a whole new record when there is none. A read that
// failed (no connection yet, a call that went unanswered) leaves the copy empty, and that must never be taken for "no
// record": a whole new record would replace the photo, the bio, findable, requests and the other devices' entries.
//
// loadDir, refreshDir and republishSelf run as written in app/ui.js (keysOf, sameKeys and devEntry as written in
// app/crypto.js). The server is the real store with the real rights check (authz 'standard', a device-key sign-in) in a
// temp folder: what the page sends is what that server accepts or refuses. Every read and write the page makes is noted.
//
// WHAT IT DOES NOT SEE: the socket and its timings (the 8-s offline wait, the 30-s call timeout), publishDev (a stand-in
// notes that it ran), name search (syncSearch, a stand-in), the device notice, the redraws.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../src/store.js';
import { createAuthz } from '../src/authz.js';
import { lift, build, el, html, I, all, find } from './screen-kit.js';

let dir, store;
before(() => { dir = mkdtempSync(join(tmpdir(), 'hush-republish-')); store = new Store({ dataDir: dir }).open(); });
after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });

const CRYPTO = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
const line = (from) => { const a = CRYPTO.indexOf(from); assert.ok(a >= 0, 'app/crypto.js holds ' + from); return CRYPTO.slice(a, CRYPTO.indexOf('\n', a)); };
const CODE = [line('const keysOf='), line('const sameKeys='), line('const devEntry='), lift('const dispOk=', '\n'), lift('const isGone=', '\n'),
  lift('const validHandle=', 'async function lookupHandle('), lift('async function republishSelf(', '\n(async()=>{')].join('\n');

const KEY = { ecdh: { x: 'ex', y: 'ey' }, sig: { x: 'sx', y: 'sy' } };
const DEV = (n) => ({ x: 'ex', y: 'ey', sx: 'sx', sy: 'sy', by: '', s: 's' + n, ts: n });
const AUTHZ = createAuthz('standard');
const actorOf = (h) => ({ handle: h, pub: KEY.sig, viaAccountKey: false });   // signed in with a device key
const signUp = (h) => ({ ...actorOf(h), mayCreate: h, signupProof: true });     // the connection that signed the account up
const record = (h) => store.get('directory/' + h, actorOf(h)).d;
let n = 0;
// my record as the server holds it: name, bio, photo, findable, requests and two devices
function seed(extra = {}) {
  const h = 'self' + (++n) + 'user';
  store.authz = null;
  store.set('directory/' + h, { handle: h, name: 'Alice', disp: h, bio: 'my bio', photo: 'data:image/jpeg;base64,UDA=', ...KEY, findable: true, requests: true, devs: { devaaa1: DEV(1), devbbb2: DEV(2) }, ts: 1, ...extra });
  store.authz = AUTHZ;
  return h;
}
// a page signed in as h on device devaaa1 (actor: the connection, a device-key sign-in unless said); W.down: that many reads
// fail as an unreachable server makes them fail
function page(h, actor = actorOf(h)) {
  const W = { h, sent: [], down: 0 };
  const S = { me: { handle: h, name: 'Alice', disp: h, ...KEY, dev: { id: 'devaaa1', s: 's1', ecdh: KEY.ecdh, sig: KEY.sig } }, dir: {}, dirReady: false, convs: [], previews: new Map(), rekeying: false, chan: null,
    db: { doc: (p) => ({
      get: async () => { if (W.down) { W.down--; W.sent.push(['get ' + p, 'failed']); throw Object.assign(new Error('Not connected to the Hush server'), { code: 'offline' }); }
        const d = store.get(p, actorOf(h)).d; W.sent.push(['get ' + p, d ? 'found' : 'none']); return { exists: !!d, data: () => structuredClone(d) }; },
      set: async (d) => { W.sent.push(['set ' + p, Object.keys(d).sort().join(',')]); store.set(p, structuredClone(d), actor); },
      update: async (v) => { W.sent.push(['update ' + p, Object.keys(v).join(',')]); store.update(p, structuredClone(v), actor); } }) } };
  W.S = S;
  let ran; W.published = new Promise((r) => { ran = r; });
  const env = { S, dmIds: new Map(), dmIdFor: async () => {}, knownIn: () => [], signedOutHere: () => W.sent.push(['signedOutHere']), accountGone: () => W.sent.push(['accountGone']),
    publishDev: async () => { W.sent.push(['publishDev']); ran(); }, syncSearch: () => {}, pinAll: () => {}, renderList: () => {}, renderCalls: () => {},
    curConv: () => null, typeOf: () => 'dm', isSelf: () => false, keyChanged: () => false, dmPeer: () => null, openConv: () => {}, renderConv: () => {}, refreshHeader: () => {},
    goneSeen: new Set(), toastErr: (m) => W.sent.push(['toastErr', m]), ls: { get: (k, d) => d, set: () => {} }, verifiedDevs: async () => [], openDevName: async () => '',
    devShort: async () => '', sheet: () => ({}), el };
  W.P = build(CODE, env, 'refreshDir');
  // one directory read as the page makes it (at its start, then once a minute forced), until publishDev has run after republishSelf
  W.read = async (force) => { W.published = new Promise((r) => { ran = r; }); await W.P.refreshDir(force); await W.published; };
  return W;
}
const writes = (W) => W.sent.filter((x) => /^(set|update) /.test(x[0]));

test('the first read of my record fails: nothing is written and my record stays whole; the next read that works finds it and writes nothing', async () => {
  const h = seed(), was = record(h), W = page(h);
  W.down = 2;   // the page's read and republishSelf's own read both fail, as with a server not reachable yet
  await W.read();
  assert.deepEqual(writes(W), [], 'no whole new record after a read that failed');
  assert.deepEqual(record(h), was, 'photo, bio, findable, requests and both devices still on the server');
  assert.equal(W.S.dirReady, true, 'the directory counts as read, as before: the forced read once a minute tries again');
  await W.read(true);   // the forced read a minute later, the server reachable
  assert.deepEqual(writes(W), [], 'the record found: nothing to put back');
  assert.deepEqual(record(h), was);
  assert.deepEqual(W.S.dir[h], was, 'the page\'s copy is my whole record');
});

test('the page\'s read fails but republishSelf\'s own read works (the connection came back in between): the record is there, nothing is written', async () => {
  const h = seed(), was = record(h), W = page(h);
  W.down = 1;
  await W.read();
  assert.deepEqual(writes(W), []);
  assert.deepEqual(record(h), was);
});

test('guard: a read that works and finds no record (a new account) still writes the whole record, as before', async () => {
  const h = 'self' + (++n) + 'user', W = page(h, signUp(h));
  await W.read();
  assert.deepEqual(writes(W), [['set directory/' + h, 'devs,disp,ecdh,handle,name,sig,ts']]);
  assert.deepEqual([record(h).name, record(h).disp, Object.keys(record(h).devs)], ['Alice', h, ['devaaa1']]);
});

test('guard: a read that works and finds my record behaves as before: nothing written when keys and capitals agree, the capitals alone when they differ, the warning when the keys differ', async () => {
  let h = seed(), was = record(h), W = page(h);
  await W.read();
  assert.deepEqual(writes(W), []);
  assert.deepEqual(record(h), was);
  h = seed(); W = page(h); W.S.me.disp = h.toUpperCase();
  await W.read();
  assert.deepEqual(writes(W), [['update directory/' + h, 'disp']]);
  assert.equal(record(h).disp, h.toUpperCase());
  assert.deepEqual([record(h).photo, record(h).bio, record(h).findable, Object.keys(record(h).devs)], [was.photo, was.bio, true, ['devaaa1', 'devbbb2']]);
  h = seed({ ecdh: { x: 'other', y: 'ey' } }); W = page(h);
  await W.read();
  assert.deepEqual([writes(W), W.sent.filter((x) => x[0] === 'toastErr').length], [[], 1], 'the tamper warning, nothing written');
  assert.ok(W.sent.some((x) => x[0] === 'publishDev'), 'publishDev runs after it, as before');
});

// ---- release 109b, round 3 ----------------------------------------------------------------------------------------
// The security reviewer's sec-s3-stub shape: the key replacement's mirror stage leaves a stub copy after a failed read;
// the next forced read fails too, and republishSelf puts the capitals into the server's record and into the copy. A
// Settings screen built on that copy must not write: its Bio and photo are not mine.
const PROFILE = [lift('const dispOk=', '\n'), lift('function dispOf(', '\n'), lift('const isSettingsPage=', '\n'),
  lift('function photoEditor(', 'function openEditConv('), lift('function buildSettings(', 'const SET_PAGES=')].join('\n');
test('the rekey stub copy, then a forced read that fails and republishSelf adding the capitals to it: Save profile on Settings built from it writes nothing, and the server keeps bio and photo', async () => {
  const h = seed(), was = record(h), W = page(h);
  W.S.dir[h] = { handle: h, ...KEY, kv: 1, devs: { devaaa1: DEV(1) } };   // the mirror stage after its read failed
  W.S.dirReady = true; W.S.ids = [{ handle: h, name: 'Alice', disp: h }]; W.S.profilePage = null;
  W.down = 1; await W.read(true);
  assert.deepEqual([writes(W), 'disp' in W.S.dir[h]], [[['update directory/' + h, 'disp']], true], 'republishSelf put the capitals in the server\'s record and the copy');
  const env = { S: W.S, el, html, I, toast: (m) => W.sent.push(['toast', m]), toastErr: (m) => W.sent.push(['toastErr', m]),
    withBadge: (x) => x, atOf: (x) => '@' + x, ls: { get: (k, d) => d, set: () => {} }, buildSettingsPage: () => {}, setTab: () => {}, openSaved: () => {}, renderConv: () => {},
    pickPhoto: async () => null, avatar: (key, name, cls, photo) => el('div', 'avatar ' + cls, photo ? 'photo' : 'letter') };
  const body = el('div', 'body'); build(PROFILE, env, 'buildSettings').buildSettings(body);
  const [name] = all(body, (e) => e.tag === 'input');
  name.value = 'Alice B';
  await find(body, 'Save profile').onclick();
  assert.deepEqual(writes(W), [['update directory/' + h, 'disp']], 'no Save profile write');
  assert.deepEqual([record(h).bio, record(h).photo, record(h).name], [was.bio, was.photo, was.name]);
});
