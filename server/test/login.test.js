// Logging out and getting back in, run with the page's own code. The recovery and
// login blocks of app/crypto.js (between the HUSH RECOVERY / HUSH AUTH markers) have no
// DOM dependencies, so, like the adapter, they are lifted out of the page and driven
// against a real server under the standard policy. What is covered:
//   - sign up, log out, log in with the same phone and password: the same account comes back
//   - a wrong password and an unknown phone are told apart
//   - the login still opens when the server lost its reservation, and healLogin puts it back
//   - recovery words bring the account back (first four letters are enough); wrong words do not
//   - signing up with a username that exists is refused by the server
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

import { startServer, sleep, appSource } from './helpers.js';
import { SYSTEM } from '../src/store.js';

const html = appSource();

// The page's source between two landmarks (the second one excluded).
function lift(from, to) {
  const a = html.indexOf(from);
  assert.ok(a > 0, `the page's files contain ${JSON.stringify(from)}`);
  const b = html.indexOf(to, a + from.length);
  assert.ok(b > a, `the page's files contain ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
  return html.slice(a, b);
}
const line = (from) => lift(from, '\n');

const SRC = [
  line('const b64=buf=>'), line('const unb64=s=>'), line('const b64u=a=>'), line('const unb64u=s=>'),
  line('const dispOk='), line('const validHandle='),
  line('const EC={name:'),
  lift('async function newIdentity(){', 'const jwk=xy=>'),
  lift('function normPhone(s){', 'async function phoneHash('),
  lift('function bundleOf(id){', 'async function linkKey('),
  lift('async function proofFor(id){', 'async function bindDevice(id){'),
  lift('/* ===== HUSH RECOVERY BEGIN ===== */', '/* ===== HUSH RECOVERY END ===== */'),
  lift('/* ===== HUSH AUTH BEGIN ===== */', '/* ===== HUSH AUTH END ===== */'),
].join('\n');
const EXPORTS = 'RWORDS,newIdentity,proofFor,bundleOf,idFromBundle,normLogin,pwProblem,pwStrength,loginSecrets,loginTag,saveLoginBox,openLoginBox,tryLogin,reserveLogin,reserveLoginConfirmed,rememberLogin,reconcileLoginHint,loginInfo,healLogin,newRecoveryWords,readWords,recSecrets,saveRecovery,confirmRecovery,openRecovery,hasRecovery';
const build = new Function('S', 'ls', 'enc', 'dec', 'saveContacts', 'renderBanner', 'P', 'openSetupLogin', `${SRC}\nreturn {${EXPORTS}};`);

const BEGIN = '/* ===== HUSH ADAPTER BEGIN ===== */';
const END = '/* ===== HUSH ADAPTER END ===== */';
const createHushAdapter = new Function(lift(BEGIN, END) + '\nreturn createHushAdapter;')();

// One page's worth of state: the adapter, a localStorage stand-in, and the page's auth code bound to them.
function page(url) {
  const m = new Map();
  const ls = {
    get: (k, d) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : d),
    set: (k, v) => { if (v === null || v === undefined) m.delete(k); else m.set(k, JSON.parse(JSON.stringify(v))); },
    clear: () => m.clear(),
  };
  const db = createHushAdapter(url, { WebSocket, onStatus: () => {} });
  const S = { db, me: null, prefs: null, contactsReady: false, ids: [] };
  const calls = { setup: [] };
  const auth = build(S, ls, new TextEncoder(), new TextDecoder(), () => {}, () => {}, () => S.prefs || (S.prefs = {}), (mode) => calls.setup.push(mode));
  return { db, ls, S, auth, calls, close: () => db.close() };
}

const PHONE = '(212) 555-0134';
const PW = 'blue truck on main street';

// The page's sign-up, minus the screens: claim the username, write the profile, reserve the phone, lock the keys.
async function signUp(pg, handle, login, pw) {
  const keys = await pg.auth.newIdentity();
  const id = { handle, disp: handle, name: 'Jordan', kv: 1, ...keys };
  await pg.db.prove(await pg.auth.proofFor(id));
  await pg.db.doc('directory/' + handle).set({ handle, disp: handle, name: 'Jordan', ecdh: keys.ecdh, sig: keys.sig, kv: 1, ts: Date.now() });
  await pg.auth.reserveLogin(login, handle);
  const loc = await pg.auth.saveLoginBox(id, login, pw);
  pg.ls.set('hush:login:' + handle, { login, loc });
  pg.S.ids = [id];
  pg.S.me = id;
  return { id, loc };
}

// The page's log-out: the device forgets everything about the account and the connection signs out.
async function logOut(pg) {
  pg.ls.clear();
  pg.S.ids = [];
  pg.S.me = null;
  await pg.db.prove(null);
}

const sameKeys = (a, b) => a.sig.x === b.sig.x && a.sig.y === b.sig.y && a.ecdh.x === b.ecdh.x && a.ecdh.y === b.ecdh.y && a.sigPriv.d === b.sigPriv.d && a.ecdhPriv.d === b.ecdhPriv.d;

test('password rules: length, the common list, and nothing of your own in it; the meter agrees', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    const { pwProblem, pwStrength } = pg.auth;
    const phone = '+12125550134', email = 'jordan.hale@example.com';
    assert.equal(pwProblem('short7!', phone), 'Use at least 8 characters.');
    assert.equal(pwProblem('mydogmax', phone), null, 'eight characters is enough');
    for (const common of ['password', 'Password1', 'iloveyou', 'qwertyuiop', '12345678', 'letmein123']) assert.equal(pwProblem(common, phone), 'This password is too common.', common);
    assert.equal(pwProblem('abababab', phone), 'This password is too easy to guess.');
    assert.equal(pwProblem('aaaaaaaaaa', phone), 'This password is too easy to guess.');
    assert.match(pwProblem('x2125550134x', phone), /phone number/);
    assert.match(pwProblem('my 555-0134 pw', phone), /phone number/, 'the local part of the number, however it is punctuated');
    assert.match(pwProblem('jordan.hale!', email), /email/);
    assert.match(pwProblem('JORDAN.HALE@EXAMPLE.COM', email), /email/);
    assert.equal(pwProblem('blue truck on main street', email), null);
    assert.match(pwProblem('jordanhale1', phone, 'jordanhale'), /username/);
    assert.match(pwProblem('xJordanHalex', phone, 'jordanhale'), /username/);
    assert.equal(pwProblem('blue truck on main street', phone, 'jordanhale'), null);

    assert.deepEqual(pwStrength('', phone), { level: 0, label: '' });
    assert.equal(pwStrength('short7!', phone).label, 'Weak');
    assert.equal(pwStrength('password', phone).label, 'Weak', 'refused passwords always read as weak');
    assert.equal(pwStrength('mydogmax', phone).label, 'Weak', 'eight lowercase letters pass but are weak');
    assert.equal(pwStrength('mydogmax12', phone).label, 'Fair');
    assert.equal(pwStrength('MyDogMax12', phone).label, 'Good');
    assert.equal(pwStrength('blue truck on main street', phone).label, 'Strong');
    assert.equal(pwStrength('correcthorsebatterystaple', phone).label, 'Good', 'long but one kind of character');
    assert.equal(pwStrength('P@ssw0rd2024!', phone).label, 'Strong');
    assert.equal(pwStrength('x2125550134x!A', phone).label, 'Weak', 'contains the phone number');
  } finally { pg.close(); await T.stop(); }
});

test('reconcileLoginHint keeps the local note and the vault copy in step', () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    const { reconcileLoginHint } = pg.auth;
    assert.deepEqual(reconcileLoginHint({ login: '+1' }, undefined), { toVault: { login: '+1' } }, 'local only -> copy up to the vault');
    assert.deepEqual(reconcileLoginHint({ login: '+1', loc: 'L' }, { login: '+1' }), { toVault: { login: '+1', loc: 'L' } }, 'vault missing the loc -> refresh it');
    assert.deepEqual(reconcileLoginHint(null, { login: '+1', loc: 'L' }), { toLocal: { login: '+1', loc: 'L' } }, 'local lost -> restore from the vault (the bug)');
    assert.deepEqual(reconcileLoginHint({ login: '+1', loc: 'L' }, { login: '+1', loc: 'L' }), {}, 'already in step -> nothing to do');
    assert.deepEqual(reconcileLoginHint(null, null), {}, 'nothing either place');
  } finally { pg.close(); }
});

test('reserveLoginConfirmed never reports a dropped write as saved', async () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    const { reserveLoginConfirmed } = pg.auth;
    // A server that accepts the write but does not actually store it: this is the user's symptom at the wire.
    pg.S.db = { doc: () => ({ get: async () => ({ exists: false }), set: async () => {} }) };
    await assert.rejects(reserveLoginConfirmed('+12125550100'), (e) => e.message === 'net', 'read-back fails, so it is not called a success');
    // A server that stores it: the read-back sees it and the call resolves.
    let stored = false;
    pg.S.db = { doc: () => ({ get: async () => ({ exists: stored }), set: async () => { stored = true; } }) };
    await reserveLoginConfirmed('+12125550100');
    assert.equal(stored, true);
  } finally { pg.close(); }
});

test('a saved login survives a cleared local note, because the vault keeps a copy', () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    pg.S.me = { handle: 'jordan' }; pg.S.contactsReady = true; pg.S.prefs = {};
    pg.auth.rememberLogin('jordan', { login: '+12125550134' });
    assert.deepEqual(pg.auth.loginInfo('jordan'), { login: '+12125550134' }, 'the fast local note');
    assert.deepEqual(pg.S.prefs.login, { login: '+12125550134' }, 'and the vault-backed copy, like recovery words');
    // The browser loses the local note (quota, a private window, site data cleared on close).
    pg.ls.set('hush:login:jordan', null);
    assert.equal(pg.auth.loginInfo('jordan'), null, 'without a vault copy this is where it used to vanish for good');
    // On the next load the reconcile restores it from the vault.
    const r = pg.auth.reconcileLoginHint(pg.auth.loginInfo('jordan'), pg.S.prefs.login);
    assert.deepEqual(r, { toLocal: { login: '+12125550134' } });
    pg.ls.set('hush:login:jordan', r.toLocal);
    assert.deepEqual(pg.auth.loginInfo('jordan'), { login: '+12125550134' }, 'back again');
  } finally { pg.close(); }
});

test('add a login in Settings: the reservation lands on the server and reads back', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const login = pg.auth.normLogin('(212) 555-0177');
    // Sign in first (the add-login sheet runs for a signed-in account), via a fresh signup.
    await signUp(pg, 'jordan', pg.auth.normLogin(PHONE), PW);
    await pg.auth.reserveLoginConfirmed(login);
    assert.equal((await pg.db.doc('logins/' + await pg.auth.loginTag(login)).get()).exists, true, 'confirmed present on the server');
    // A second attempt on the same login is refused as "taken", not silently re-saved.
    await assert.rejects(pg.auth.reserveLoginConfirmed(login), (e) => e.message === 'taken');
  } finally { pg.close(); await T.stop(); }
});

test('log out, then log in with the same phone and password: the same account comes back', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const login = pg.auth.normLogin(PHONE);
    assert.equal(login, '+12125550134');
    const { id, loc } = await signUp(pg, 'jordan', login, PW);
    assert.equal(pg.db.proven, 'jordan');
    await logOut(pg);
    assert.equal(pg.auth.loginInfo('jordan'), null, 'the device keeps nothing about the account');

    const r = await pg.auth.tryLogin(pg.auth.normLogin('212-555-0134'), PW);
    assert.equal(r.kind, 'in');
    assert.equal(r.id.handle, 'jordan');
    assert.equal(r.id.name, 'Jordan');
    assert.equal(r.loc, loc);
    assert.ok(sameKeys(r.id, id), 'the very same account keys come out of the box');
    await pg.db.prove(await pg.auth.proofFor(r.id));
    assert.equal(pg.db.proven, 'jordan', 'the recovered keys prove the username to the server');
    const dir = (await pg.db.doc('directory/jordan').get()).data();
    assert.equal(dir.sig.x, id.sig.x, 'the profile is untouched: no new keys, no second account');
  } finally { pg.close(); await T.stop(); }
});

test('a wrong password and an unknown phone are told apart', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const login = pg.auth.normLogin(PHONE);
    await signUp(pg, 'jordan', login, PW);
    await logOut(pg);
    assert.equal((await pg.auth.tryLogin(login, 'not the password at all')).kind, 'wrongpw');
    assert.equal((await pg.auth.tryLogin('+12125550199', PW)).kind, 'new');
  } finally { pg.close(); await T.stop(); }
});

test('the login still opens when the server lost its reservation, and healLogin puts it back', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const login = pg.auth.normLogin(PHONE);
    const { id, loc } = await signUp(pg, 'jordan', login, PW);
    const tag = await pg.auth.loginTag(login);
    assert.equal(T.srv.store.delete('logins/' + tag, {}, SYSTEM), true, 'the reservation is gone, as after a data reset');
    await logOut(pg);

    const r = await pg.auth.tryLogin(login, PW);
    assert.equal(r.kind, 'in', 'the box is the real test, not the reservation');
    assert.ok(sameKeys(r.id, id));
    await pg.db.prove(await pg.auth.proofFor(r.id));
    pg.S.me = r.id;
    pg.ls.set('hush:login:jordan', { login, loc });
    await pg.auth.healLogin(r.id);
    assert.equal((await pg.db.doc('logins/' + tag).get()).exists, true, 'the reservation is back');
    await sleep(900);
    assert.deepEqual(pg.calls.setup, [], 'the password box is there, so nothing is asked');
    assert.equal(pg.auth.loginInfo('jordan').loc, loc);

    // The box is gone as well: the reservation comes back and the password is asked for once more.
    const pg2 = page(T.url);
    try {
      await pg2.db.ready;
      T.srv.store.delete('logins/' + tag, {}, SYSTEM);
      assert.equal(T.srv.store.delete('accounts/' + loc, {}, SYSTEM), true);
      await pg2.db.prove(await pg2.auth.proofFor(r.id));
      pg2.S.me = r.id;
      pg2.ls.set('hush:login:jordan', { login, loc });
      await pg2.auth.healLogin(r.id);
      assert.equal((await pg2.db.doc('logins/' + tag).get()).exists, true);
      await sleep(900);
      assert.deepEqual(pg2.calls.setup, ['again']);
      assert.equal(pg2.auth.loginInfo('jordan').loc, undefined, 'the stale box address is dropped');
      await pg2.auth.healLogin(r.id);
      await sleep(900);
      assert.deepEqual(pg2.calls.setup, ['again'], 'asked once per page load, not on every start');
    } finally { pg2.close(); }
  } finally { pg.close(); await T.stop(); }
});

test('recovery words bring the account back; the first four letters are enough; wrong words do not', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const login = pg.auth.normLogin(PHONE);
    const { id } = await signUp(pg, 'jordan', login, PW);
    const words = pg.auth.newRecoveryWords();
    assert.equal(words.length, 6);
    await pg.auth.saveRecovery(id, words);
    pg.auth.confirmRecovery(id);
    assert.equal(pg.auth.hasRecovery('jordan'), true);
    await logOut(pg);
    assert.equal(pg.auth.hasRecovery('jordan'), false, 'the device forgot the words were set up; the server still has the box');

    const typed = words.map((w, k) => (k % 2 ? w.toUpperCase() : w)).join(',  ');
    const back = await pg.auth.openRecovery(pg.auth.readWords(typed));
    assert.equal(back.handle, 'jordan');
    assert.ok(sameKeys(back, id));
    await pg.db.prove(await pg.auth.proofFor(back));
    assert.equal(pg.db.proven, 'jordan');

    // Words whose first four letters pick out exactly one list entry can be typed as just those letters.
    const { RWORDS } = pg.auth;
    const unique = RWORDS.filter((w) => w.length > 4 && RWORDS.filter((x) => x.startsWith(w.slice(0, 4))).length === 1).slice(0, 6);
    assert.deepEqual(pg.auth.readWords(unique.map((w) => w.slice(0, 4)).join(' ')), unique);
    assert.throws(() => pg.auth.readWords(words.slice(0, 5).join(' ')), (e) => e.message === 'count' && e.n === 5);
    assert.throws(() => pg.auth.readWords(words.join(' ') + ' zzzz'), (e) => e.message === 'count' || e.message === 'word');

    const other = pg.auth.newRecoveryWords();
    await assert.rejects(pg.auth.openRecovery(other), (e) => e.message === 'nomatch');
  } finally { pg.close(); await T.stop(); }
});

test('signing up with a username that exists is refused by the server', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  const stranger = page(T.url);
  try {
    await pg.db.ready;
    await stranger.db.ready;
    const login = pg.auth.normLogin(PHONE);
    const { id } = await signUp(pg, 'jordan', login, PW);
    await logOut(pg);

    const keys = await stranger.auth.newIdentity();
    const fresh = { handle: 'jordan', disp: 'jordan', name: 'Not Jordan', kv: 1, ...keys };
    await assert.rejects(stranger.db.prove(await stranger.auth.proofFor(fresh)), (e) => e.code === 'denied', 'a new key cannot claim a username that has a profile');
    await assert.rejects(stranger.db.doc('directory/jordan').set({ handle: 'jordan', name: 'Not Jordan', ecdh: keys.ecdh, sig: keys.sig, kv: 1, ts: Date.now() }), (e) => e.code === 'unauth' || e.code === 'denied');
    const dir = (await stranger.db.doc('directory/jordan').get()).data();
    assert.equal(dir.sig.x, id.sig.x, 'the real profile is untouched');
    assert.equal(dir.name, 'Jordan');
    await assert.rejects(stranger.auth.reserveLogin(login, 'jordan'), (e) => e.message === 'taken', 'nor can the phone be reserved twice');
  } finally { pg.close(); stranger.close(); await T.stop(); }
});
