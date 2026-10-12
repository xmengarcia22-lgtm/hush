// Logging out and getting back in, run with the page's own code. The recovery and
// login blocks of app/crypto.js (between the HUSH RECOVERY / HUSH AUTH markers) have no
// DOM dependencies, so, like the adapter, they are lifted out of the page and driven
// against a real server under the standard policy. What is covered:
//   - sign up, log out, log in with the same username and password: the same account comes back
//   - a wrong password and an unknown username are told apart
//   - a lost password box is dropped quietly: nothing asks for the password, no wrong-password try is spent
//   - recovery words bring the account back (first four letters are enough); wrong words do not
//   - signing up with a username that exists is refused by the server
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, sleep } from './helpers.js';
import { SYSTEM } from '../src/store.js';

import { page, logOut, sameKeys } from './page-auth.js';


const PW = 'blue truck on main street';

// The page's sign-up, minus the screens: claim the username, write the profile, lock the keys in the username's box.
async function signUp(pg, handle, pw) {
  const keys = await pg.auth.newIdentity();
  const id = { handle, disp: handle, name: 'Jordan', kv: 1, ...keys };
  await pg.db.prove(await pg.auth.proofFor(id));
  await pg.db.doc('directory/' + handle).set({ handle, disp: handle, name: 'Jordan', ecdh: keys.ecdh, sig: keys.sig, kv: 1, ts: Date.now() });
  const loc = await pg.auth.saveLoginBox(id, handle, pw);
  pg.ls.set('hush:login:' + handle, { login: handle, loc });
  pg.S.ids = [id];
  pg.S.me = id;
  return { id, loc };
}



test('password rules: length, the common list, and nothing of your own in it; the meter agrees', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    const { pwProblem, pwStrength } = pg.auth;
    const phone = '+12125550134', email = 'jordan.hale@example.com';   // boxes for these still exist on accounts from before release 20
    assert.equal(pwProblem('short7!', phone), 'Use at least 8 characters.');
    assert.equal(pwProblem('mydogmax', phone), 'Add a capital letter, a number, a space or a symbol.', 'eight lowercase letters are refused');
    assert.equal(pwProblem('mydogmaxrunsfar', phone), 'Add a capital letter, a number, a space or a symbol.', 'so are fifteen');
    assert.equal(pwProblem('Mydogmax', phone), null, 'eight characters with a capital are enough');
    assert.equal(pwProblem('mydogmax1', phone), null, 'or with a number');
    for (const common of ['password', 'Password1', 'iloveyou', 'qwertyuiop', '12345678', 'letmein123']) assert.equal(pwProblem(common, phone), 'This password is too common.', common);
    assert.equal(pwProblem('abababab', phone), 'This password is too easy to guess.');
    assert.equal(pwProblem('aaaaaaaaaa', phone), 'This password is too easy to guess.');
    const { pwStrongEnough } = pg.auth;
    assert.equal(pwStrongEnough('Mydogmax12!', phone), false, 'a power role asks for 12 or more');
    assert.equal(pwStrongEnough('Mydogmax123!', phone), true);
    assert.equal(pwStrongEnough('password1234'), false, 'nothing on the common list');
    assert.equal(pwStrongEnough('lowercaseonlyletters'), false, 'not all lowercase letters, however long');
    assert.equal(pwStrongEnough('Jordanhale rides at dawn'), true, 'a password already in use counts even if it holds the username: that rule is for choosing one');
    assert.equal(pwStrongEnough('jordan.hale@example.com!'), true, 'or the email');
    assert.match(pwProblem('x2125550134x', phone), /phone number/);
    assert.match(pwProblem('my 555-0134 pw', phone), /phone number/, 'the local part of the number, however it is punctuated');
    assert.match(pwProblem('jordan.hale!', email), /email/);
    assert.match(pwProblem('JORDAN.HALE@EXAMPLE.COM', email), /email/);
    assert.equal(pwProblem('blue truck on main street', email), null);
    assert.match(pwProblem('jordanhale1', null, 'jordanhale'), /username/);
    assert.match(pwProblem('xJordanHalex', null, 'jordanhale'), /username/);
    assert.equal(pwProblem('blue truck on main street', null, 'jordanhale'), null);

    assert.deepEqual(pwStrength('', phone), { level: 0, label: '' });
    assert.equal(pwStrength('short7!', phone).label, 'Weak');
    assert.equal(pwStrength('password', phone).label, 'Weak', 'refused passwords always read as weak');
    assert.equal(pwStrength('mydogmax', phone).label, 'Weak', 'all lowercase, so refused, so weak');
    assert.equal(pwStrength('mydogmax12', phone).label, 'Fair');
    assert.equal(pwStrength('MyDogMax12', phone).label, 'Good');
    assert.equal(pwStrength('blue truck on main street', phone).label, 'Strong');
    assert.equal(pwStrength('correcthorsebatterystaple', phone).label, 'Weak', 'all lowercase letters is refused, however long');
    assert.equal(pwStrength('correct horse battery staple', phone).label, 'Strong', 'the same words with spaces pass');
    assert.equal(pwStrength('P@ssw0rd2024!', phone).label, 'Strong');
    assert.equal(pwStrength('x2125550134x!A', phone).label, 'Weak', 'contains the phone number');
  } finally { pg.close(); await T.stop(); }
});

test('reconcileLoginHint keeps the local note and the vault copy in step', () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    const { reconcileLoginHint } = pg.auth;
    assert.deepEqual(reconcileLoginHint({ login: 'jordan' }, undefined), { toVault: { login: 'jordan' } }, 'local only -> copy up to the vault');
    assert.deepEqual(reconcileLoginHint({ login: 'jordan', loc: 'L' }, { login: 'jordan' }), { toVault: { login: 'jordan', loc: 'L' } }, 'vault missing the loc -> refresh it');
    assert.deepEqual(reconcileLoginHint(null, { login: 'jordan', loc: 'L' }), { toLocal: { login: 'jordan', loc: 'L' } }, 'local lost -> restore from the vault (the bug)');
    assert.deepEqual(reconcileLoginHint({ login: 'jordan', loc: 'L' }, { login: 'jordan', loc: 'L' }), {}, 'already in step -> nothing to do');
    assert.deepEqual(reconcileLoginHint(null, null), {}, 'nothing either place');
    const moved = { login: 'jordan', loc: 'NEW', all: { jordan: 'NEW' } };
    assert.deepEqual(reconcileLoginHint({ login: 'jordan', loc: 'OLD', all: { jordan: 'OLD' } }, { login: 'jordan', loc: 'NEW', all: { jordan: 'NEW' } }), { toLocal: moved },
      'password changed on another device -> the settings’ address wins for this device’s own login too');
  } finally { pg.close(); }
});

test('a saved login survives a cleared local note, because the vault keeps a copy', () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    pg.S.me = { handle: 'jordan' }; pg.S.contactsReady = true; pg.S.prefs = {};
    pg.auth.rememberLogin('jordan', { login: 'jordan' });
    assert.deepEqual(pg.auth.loginInfo('jordan'), { login: 'jordan' }, 'the fast local note');
    assert.deepEqual(pg.S.prefs.login, { login: 'jordan' }, 'and the vault-backed copy, like recovery words');
    // The browser loses the local note (quota, a private window, site data cleared on close).
    pg.ls.set('hush:login:jordan', null);
    assert.equal(pg.auth.loginInfo('jordan'), null, 'without a vault copy this is where it used to vanish for good');
    // On the next load the reconcile restores it from the vault.
    const r = pg.auth.reconcileLoginHint(pg.auth.loginInfo('jordan'), pg.S.prefs.login);
    assert.deepEqual(r, { toLocal: { login: 'jordan' } });
    pg.ls.set('hush:login:jordan', r.toLocal);
    assert.deepEqual(pg.auth.loginInfo('jordan'), { login: 'jordan' }, 'back again');
  } finally { pg.close(); }
});

test('log out, then log in with the same username and password: the same account comes back', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id, loc } = await signUp(pg, 'jordan', PW);
    assert.equal(pg.db.proven, 'jordan');
    await logOut(pg);
    assert.equal(pg.auth.loginInfo('jordan'), null, 'the device keeps nothing about the account');

    const r = await pg.auth.tryLogin(pg.auth.normLogin('@Jordan'), PW);
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

test('a wrong password and an unknown username are told apart', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    await signUp(pg, 'jordan', PW);
    await logOut(pg);
    assert.equal((await pg.auth.tryLogin('jordan', 'not the password at all')).kind, 'wrongpw');
    assert.equal((await pg.auth.tryLogin('nobodyhere', PW)).kind, 'new');
  } finally { pg.close(); await T.stop(); }
});

test('a lost password box is dropped quietly: nothing asks for the password, no wrong-password try is spent', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id, loc } = await signUp(pg, 'jordan', PW);
    await logOut(pg);
    const r = await pg.auth.tryLogin('jordan', PW);
    assert.equal(r.kind, 'in', 'the box is the test; a username needs no reservation');
    assert.ok(sameKeys(r.id, id));
    const tag = await pg.auth.loginTag('jordan');
    assert.equal(T.srv.store.get('logins/' + tag, SYSTEM).d, null, 'nothing was reserved: the profile itself holds the name');

    // The box is gone (a data reset): the saved address is left alone and nothing asks for the password.
    const pg2 = page(T.url);
    try {
      await pg2.db.ready;
      assert.equal(T.srv.store.delete('accounts/' + await pg.auth.boxLoc('jordan', loc), {}, SYSTEM), true, 'the box, at its address behind the gate');
      await pg2.db.prove(await pg2.auth.proofFor(r.id));
      pg2.S.me = r.id;
      pg2.ls.set('hush:login:jordan', { login: 'jordan', loc });
      const left = () => [...T.srv.conns][0].ctx.pwMisses.tokensLeft(tag), before = left();
      await pg2.auth.healLogin(r.id);
      assert.ok(left() >= before - 0.01, 'no wrong-password try is spent on a saved address that has no box');
      assert.equal(T.srv.store.get('logins/' + tag, SYSTEM).d, null, 'and still nothing is reserved for a username');
      await sleep(900);
      assert.deepEqual(pg2.calls.setup, [], 'nothing asks for the password');
      assert.equal(pg2.auth.loginInfo('jordan').loc, loc, 'not looked up at the gate, so no wrong-password try is spent on it');
      await pg2.auth.healLogin(r.id);
      await sleep(900);
      assert.deepEqual(pg2.calls.setup, [], 'not on a later start either');
    } finally { pg2.close(); }
  } finally { pg.close(); await T.stop(); }
});

test('recovery words bring the account back; the first four letters are enough; wrong words do not', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id } = await signUp(pg, 'jordan', PW);
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
    const { id } = await signUp(pg, 'jordan', PW);
    await logOut(pg);

    const keys = await stranger.auth.newIdentity();
    const fresh = { handle: 'jordan', disp: 'jordan', name: 'Not Jordan', kv: 1, ...keys };
    await assert.rejects(stranger.db.prove(await stranger.auth.proofFor(fresh)), (e) => e.code === 'denied', 'a new key cannot claim a username that has a profile');
    await assert.rejects(stranger.db.doc('directory/jordan').set({ handle: 'jordan', name: 'Not Jordan', ecdh: keys.ecdh, sig: keys.sig, kv: 1, ts: Date.now() }), (e) => e.code === 'unauth' || e.code === 'denied');
    const dir = (await stranger.db.doc('directory/jordan').get()).data();
    assert.equal(dir.sig.x, id.sig.x, 'the real profile is untouched');
    assert.equal(dir.name, 'Jordan');
  } finally { pg.close(); stranger.close(); await T.stop(); }
});
