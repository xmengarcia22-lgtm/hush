// Sign-up and login with the username, run with the page's own code against a real server under the standard policy.
// Release 20 made the username the only login (until then an account could also log in with the email address or phone
// number given at sign-up, SPEC.md 14.10). A password change replaces the box behind the login, and the device notes
// keep its address.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer } from './helpers.js';
import { SYSTEM } from '../src/store.js';
import { page, logOut, sameKeys, signUpWith } from './page-auth.js';

const PW = 'blue truck on main street';
const signUp = signUpWith;

test('the login field takes a username, with or without its @, and nothing else', async () => {
  const pg = page('ws://127.0.0.1:1');
  try {
    const { normLogin, isHandleLogin } = pg.auth;
    assert.equal(normLogin('JordanHale'), 'jordanhale');
    assert.equal(normLogin('@jordan_h'), 'jordan_h');
    assert.equal(normLogin(' jordan '), 'jordan');
    assert.equal(normLogin('jo'), null, 'too short');
    assert.equal(normLogin('123'), null, 'a username needs a letter');
    assert.equal(normLogin('a'.repeat(21)), null, 'too long');
    assert.equal(normLogin('Jordan.Hale@Example.com'), null, 'an email address is not a login any more');
    assert.equal(normLogin('(212) 555-0134'), null, 'nor is a phone number');
    assert.ok(isHandleLogin('jordanhale'));
    assert.equal(pg.auth.pwProblem('blue truck 4567890 street', null, 'jordanhale'), null);
  } finally { pg.close(); }
});

test('sign up with a username, display name and password; log in with the username, written any way', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id, all } = await signUp(pg, PW, 'jordanhale', 'Jordan Hale');
    assert.deepEqual(Object.keys(all), ['jordanhale'], 'one password box, for the username');
    assert.equal(T.srv.store.get('directory/jordanhale', SYSTEM).d.name, 'Jordan Hale', 'the display name');
    assert.equal(T.srv.store.get('logins/' + await pg.auth.loginTag('jordanhale'), SYSTEM).d, null, 'nothing is reserved: the profile itself holds the name');
    assert.deepEqual(pg.auth.loginsOf('jordanhale'), ['jordanhale']);
    await logOut(pg);
    for (const as of ['jordanhale', 'JordanHale', '@jordanhale', ' jordanhale ']) {
      const r = await pg.auth.tryLogin(pg.auth.normLogin(as), PW);
      assert.equal(r.kind, 'in', as);
      assert.ok(sameKeys(r.id, id), 'the very same account, logged in as ' + JSON.stringify(as));
    }
    assert.equal((await pg.auth.tryLogin('jordanhale', 'not the password at all')).kind, 'wrongpw');
    assert.equal((await pg.auth.tryLogin('nobodyhere', PW)).kind, 'new');
  } finally { pg.close(); await T.stop(); }
});

test('a new password replaces the box behind the login, and the old one no longer opens it', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    const { id, all: before } = await signUp(pg, PW, 'jordanhale', 'Jordan Hale');
    // The vault opens after sign-up; the page then copies the login note into it (loadContacts).
    pg.S.contactsReady = true; pg.S.prefs = {};
    pg.S.prefs.login = pg.auth.reconcileLoginHint(pg.auth.loginInfo('jordanhale'), pg.S.prefs.login).toVault;
    assert.deepEqual(pg.S.prefs.login.all, before, 'the vault copy keeps the box address');
    // What the Change password sheet does.
    const NEW = 'green ferry past the old mill';
    const after = await pg.auth.saveLoginBoxes(id, pg.auth.loginsOf('jordanhale'), NEW);
    for (const [l, loc] of Object.entries(before)) if (after[l] !== loc) await pg.auth.dropLoginBox(l, loc);
    pg.auth.rememberLogin('jordanhale', { login: 'jordanhale', loc: after.jordanhale, all: after }, true);
    assert.deepEqual(pg.auth.loginInfo('jordanhale').all, after);
    assert.deepEqual(pg.S.prefs.login.all, after);
    await logOut(pg);
    assert.equal((await pg.auth.tryLogin('jordanhale', NEW)).kind, 'in');
    assert.equal((await pg.auth.tryLogin('jordanhale', PW)).kind, 'wrongpw', 'the old password no longer opens the box');
  } finally { pg.close(); await T.stop(); }
});
