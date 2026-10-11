// Sign-up and login with any of an account's logins, run with the page's own code against a real server under the
// standard policy: sign-up takes an email or a phone number, a password, a username and a display name, with no code;
// the account then logs in with the email or number, or the username, and the same password. A password change
// replaces the box behind every login, and the device notes keep every box's address (SPEC.md 14.10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { startServer, sleep } from './helpers.js';
import { SYSTEM } from '../src/store.js';
import { page, logOut, sameKeys, signUpWith } from './page-auth.js';

const PW = 'blue truck on main street';
const EMAIL = 'jordan.hale@example.com';
const PHONE = '+12125550134';
const signUp = signUpWith;
const tag = (s) => `"${s}"`;

test('the one login field tells an email, a phone number and a username apart', async () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    const { normLogin, isHandleLogin, normEmail } = pg.auth;
    assert.equal(normLogin('JordanHale'), 'jordanhale');
    assert.equal(normLogin('@jordan_h'), 'jordan_h');
    assert.equal(normLogin('@123'), '123', 'a username of digits only is written with an @');
    assert.equal(normLogin('Jordan.Hale@Example.com'), EMAIL);
    assert.equal(normLogin('(212) 555-0134'), PHONE);
    assert.equal(normLogin('212-555-0134'), PHONE);
    assert.equal(normLogin('jo'), null);
    assert.ok(isHandleLogin('jordanhale') && !isHandleLogin(EMAIL) && !isHandleLogin(PHONE));
    assert.equal(normEmail(' Jordan.Hale@Example.COM '), EMAIL);
    assert.equal(normEmail('jordanhale'), null);
    assert.equal(pg.auth.pwProblem('blue truck 4567890 street', null, 'jordanhale'), null);
  } finally { pg.close(); }
});

for (const [kind, contact] of [['an email', EMAIL], ['a phone number', PHONE]]) {
  test(`sign up with ${kind}, then log in with it or with the username, the same password each time`, async () => {
    const T = await startServer({ authz: 'standard' });
    const pg = page(T.url);
    try {
      await pg.db.ready;
      const { id, all } = await signUp(pg, contact, PW, 'jordanhale', 'Jordan Hale');
      assert.deepEqual(Object.keys(all).sort(), ['jordanhale', contact].sort());
      assert.notEqual(all.jordanhale, all[contact], 'two boxes the server cannot tie together');
      assert.equal(T.srv.store.get('directory/jordanhale', SYSTEM).d.name, 'Jordan Hale', 'the display name');
      assert.equal(T.srv.store.get('logins/' + await pg.auth.loginTag(contact), SYSTEM).d != null, true, `the ${kind} is reserved`);
      assert.deepEqual(pg.auth.loginsOf('jordanhale').sort(), ['jordanhale', contact].sort());
      await logOut(pg);

      const typed = contact === EMAIL ? 'Jordan.Hale@Example.com' : '(212) 555-0134';
      for (const as of [typed, 'JordanHale', '@jordanhale']) {
        const r = await pg.auth.tryLogin(pg.auth.normLogin(as), PW);
        assert.equal(r.kind, 'in', as);
        assert.ok(sameKeys(r.id, id), 'the very same account, logged in as ' + tag(as));
      }
      assert.equal((await pg.auth.tryLogin(contact, 'not the password at all')).kind, 'wrongpw');
      assert.equal((await pg.auth.tryLogin('jordanhale', 'not the password at all')).kind, 'wrongpw');
      assert.equal((await pg.auth.tryLogin('nobodyhere', PW)).kind, 'new');
      assert.equal((await pg.auth.tryLogin(contact === EMAIL ? 'nobody@example.com' : '+12125550199', PW)).kind, 'new');
    } finally { pg.close(); await T.stop(); }
  });
}

test('an email or number that already has an account cannot be signed up again', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url), other = page(T.url);
  try {
    await Promise.all([pg.db.ready, other.db.ready]);
    await signUp(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    assert.equal((await other.db.doc('logins/' + await other.auth.loginTag(EMAIL)).get()).exists, true, 'the first sign-up screen sees it is taken');
    await assert.rejects(other.auth.reserveLogin(EMAIL, 'olivia'), (e) => e.message === 'taken');
  } finally { pg.close(); other.close(); await T.stop(); }
});

test('a new password replaces the box behind every login, and the old one opens none of them', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id, all: before } = await signUp(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    // The vault opens after sign-up; the page then copies the login note into it (loadContacts).
    pg.S.contactsReady = true; pg.S.prefs = {};
    pg.S.prefs.login = pg.auth.reconcileLoginHint(pg.auth.loginInfo('jordanhale'), pg.S.prefs.login).toVault;
    assert.deepEqual(pg.S.prefs.login.all, before, 'the vault copy keeps every box address');
    // What the Change password sheet does.
    const NEW = 'green ferry past the old mill';
    const after = await pg.auth.saveLoginBoxes(id, pg.auth.loginsOf('jordanhale'), NEW);
    for (const [l, loc] of Object.entries(before)) if (after[l] !== loc) await pg.auth.dropLoginBox(l, loc);
    pg.auth.rememberLogin('jordanhale', { login: 'jordanhale', loc: after.jordanhale, all: after }, true);
    assert.deepEqual(pg.auth.loginInfo('jordanhale').all, after);
    assert.deepEqual(pg.S.prefs.login.all, after);
    await logOut(pg);
    for (const l of ['jordanhale', EMAIL]) {
      assert.equal((await pg.auth.tryLogin(l, NEW)).kind, 'in', l);
      assert.equal((await pg.auth.tryLogin(l, PW)).kind, 'wrongpw', 'the old password no longer opens ' + l);
    }
  } finally { pg.close(); await T.stop(); }
});

test('the login note keeps every box: a device that logged in by email learns the others from the vault', () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    const { reconcileLoginHint } = pg.auth;
    const vault = { login: 'jordanhale', loc: 'H', all: { jordanhale: 'H', [EMAIL]: 'E' } };
    const local = { login: EMAIL, loc: 'E', all: { [EMAIL]: 'E' } };
    assert.deepEqual(reconcileLoginHint(local, vault), { toVault: { login: EMAIL, loc: 'E', all: vault.all }, toLocal: { login: EMAIL, loc: 'E', all: vault.all } });
    assert.deepEqual(reconcileLoginHint({ login: EMAIL, loc: 'E', all: { [EMAIL]: 'OLD' } }, { login: EMAIL, loc: 'E', all: { [EMAIL]: 'E' } }).toLocal.all, { [EMAIL]: 'E' }, 'for box addresses the shared vault wins');
    assert.deepEqual(reconcileLoginHint(null, vault), { toLocal: vault });
  } finally { pg.close(); }
});

test('healLogin puts back every reservation, and asks for the password again when the box is gone', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id, all } = await signUp(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    const etag = await pg.auth.loginTag(EMAIL);
    T.srv.store.delete('logins/' + etag, {}, SYSTEM);
    await pg.auth.healLogin(id);
    assert.ok(T.srv.store.get('logins/' + etag, SYSTEM).d, 'the email reservation is back');
    assert.equal(T.srv.store.get('logins/' + await pg.auth.loginTag('jordanhale'), SYSTEM).d, null, 'a username needs none');
    await sleep(900);
    assert.deepEqual(pg.calls.setup, []);
    const pg2 = page(T.url);
    try {
      await pg2.db.ready;
      assert.equal(T.srv.store.delete('accounts/' + await pg.auth.boxLoc('jordanhale', all.jordanhale), {}, SYSTEM), true);
      await pg2.db.prove(await pg2.auth.proofFor(id));
      pg2.S.me = id;
      pg2.ls.set('hush:login:jordanhale', { login: 'jordanhale', loc: all.jordanhale, all });
      await pg2.auth.healLogin(id);
      await sleep(900);
      assert.deepEqual(pg2.calls.setup, [], 'a lost box is dropped quietly; nothing asks for the password');
    } finally { pg2.close(); }
  } finally { pg.close(); await T.stop(); }
});


// ---- release 11: reading the vault back keeps every login of the account ----

test('a device that logged in by username keeps the account\u2019s other logins when the vault is read back', () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
    const line = ui.split('\n').find((l) => l.startsWith('const loginPref='));
    assert.ok(line, 'loginPref present in app/ui.js');
    const loginPref = new Function('normLogin', line + '\nreturn loginPref;')(pg.auth.normLogin);
    const H = 'H'.repeat(43), E = 'E'.repeat(43);
    const stored = { login: 'jordanhale', loc: H, all: { jordanhale: H, [EMAIL]: E } };
    assert.deepEqual(loginPref(stored), stored, 'the email login survives the read');
    assert.deepEqual(loginPref({ ...stored, all: { jordanhale: H, [EMAIL]: E, 'Not A Login!': E, '+12125550134': 'short', [EMAIL.toUpperCase()]: E } }).all, { jordanhale: H, [EMAIL]: E }, 'only well-formed entries are kept');
    assert.equal(loginPref(null), undefined);
    // This device logged in by username, so its own note knows only that; the vault knows both.
    const local = { login: 'jordanhale', loc: H, all: { jordanhale: H } };
    const out = pg.auth.reconcileLoginHint(local, loginPref(stored));
    assert.equal(out.toVault, undefined, 'the vault\u2019s list is not written back shorter');
    assert.deepEqual(out.toLocal.all, { jordanhale: H, [EMAIL]: E }, 'and this device learns the email login');
  } finally { pg.close(); }
});
