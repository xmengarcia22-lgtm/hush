// The optional recovery email (SPEC.md 14.10), run with the page's own code against a real server under the standard
// policy: a recovery email is saved only after its emailed code is confirmed, nobody else can change it, and
// forgot-password lets a new device ask to be let in only for an email confirmed by code that belongs to the account.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, sleep } from './helpers.js';
import { SYSTEM } from '../src/store.js';
import { page, signUpWith } from './page-auth.js';

const PW = 'blue truck on main street';
const EMAIL = 'jordan.hale@example.com';
const PHONE = '+12125550134';
const signUp = signUpWith;

test('a recovery email is saved only after its code is confirmed, holds no email, and can be removed', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  try {
    await pg.db.ready;
    await signUp(pg, PHONE, PW, 'jordanhale', 'Jordan Hale');
    const rtag = await pg.auth.recoveryTag('jordanhale', EMAIL);
    await assert.rejects(pg.auth.saveRecoveryEmail('jordanhale', EMAIL), (e) => e.code === 'denied', 'no code confirmed yet');
    const { demoCode } = await pg.db.sendCode(EMAIL);
    assert.deepEqual(await pg.db.checkCode(EMAIL, demoCode), { link: false }, 'confirming in Settings is not a forgot-password');
    await pg.auth.saveRecoveryEmail('jordanhale', EMAIL);
    const rec = T.srv.store.get('recovery/' + rtag, SYSTEM).d;
    assert.equal(rec.h, 'jordanhale');
    assert.ok(!JSON.stringify(rec).includes('jordan.hale') && !JSON.stringify(rec).includes('example'), 'the email itself is not stored');
    assert.equal(pg.auth.recEmailOf('jordanhale'), EMAIL);
    await assert.rejects(pg.db.doc('recovery/' + rtag).get(), (e) => e.code === 'denied', 'never read back, not even by its owner');
    await pg.auth.removeRecoveryEmail('jordanhale');
    assert.equal(T.srv.store.get('recovery/' + rtag, SYSTEM).d, null);
    assert.equal(pg.auth.recEmailOf('jordanhale'), null);
  } finally { pg.close(); await T.stop(); }
});

test('nobody else can write or remove an account’s recovery record', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url), other = page(T.url), anon = page(T.url);
  try {
    await Promise.all([pg.db.ready, other.db.ready, anon.db.ready]);
    await signUp(pg, PHONE, PW, 'jordanhale', 'Jordan Hale');
    await signUp(other, '+12125550177', PW, 'olivia', 'Olivia Lane');
    const rtag = await pg.auth.recoveryTag('jordanhale', EMAIL);
    let c = (await pg.db.sendCode(EMAIL)).demoCode;
    await pg.db.checkCode(EMAIL, c);
    await pg.auth.saveRecoveryEmail('jordanhale', EMAIL);
    // olivia confirms the same email on her own connection: that unlocks her own record, not jordanhale's
    c = (await other.db.sendCode(EMAIL)).demoCode;
    await other.db.checkCode(EMAIL, c);
    await assert.rejects(other.db.doc('recovery/' + rtag).set({ h: 'olivia', ts: 1 }), (e) => e.code === 'denied');
    await assert.rejects(other.db.doc('recovery/' + rtag).delete(), (e) => e.code === 'denied');
    await assert.rejects(anon.db.doc('recovery/' + rtag).delete(), (e) => e.code === 'unauth');
    assert.equal(T.srv.store.get('recovery/' + rtag, SYSTEM).d.h, 'jordanhale');
  } finally { pg.close(); other.close(); anon.close(); await T.stop(); }
});

const ASK = () => ({ state: 'wait', ts: Date.now(), pub: { x: 'x'.repeat(43), y: 'y'.repeat(43) } });

test('forgot password with a recovery email: a new device may ask the username to let it in, only after the code', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url), fresh = page(T.url);
  try {
    await Promise.all([pg.db.ready, fresh.db.ready]);
    await signUp(pg, PHONE, PW, 'jordanhale', 'Jordan Hale');
    const linkAt = 'linkreqs/' + await fresh.auth.loginTag('jordanhale');
    // No recovery email yet: the code still works (it proves the email), but it unlocks nothing.
    let c = (await fresh.db.sendCode(EMAIL)).demoCode;
    assert.deepEqual(await fresh.db.checkCode(EMAIL, c, 'jordanhale'), { link: false });
    await assert.rejects(fresh.db.doc(linkAt).set(ASK()), (e) => e.code === 'denied');

    c = (await pg.db.sendCode(EMAIL)).demoCode;
    await pg.db.checkCode(EMAIL, c);
    await pg.auth.saveRecoveryEmail('jordanhale', EMAIL);
    // A different email, even confirmed, is not this account's.
    c = (await fresh.db.sendCode('someone.else@example.com')).demoCode;
    assert.deepEqual(await fresh.db.checkCode('someone.else@example.com', c, 'jordanhale'), { link: false });
    await assert.rejects(fresh.db.doc(linkAt).set(ASK()), (e) => e.code === 'denied');
    // The recovery email, confirmed: the new device may now ask jordanhale's devices to let it in.
    c = (await fresh.db.sendCode(EMAIL)).demoCode;
    assert.deepEqual(await fresh.db.checkCode(EMAIL, c, 'jordanhale'), { link: true, via: 'username' });
    await fresh.db.doc(linkAt).set(ASK());
    assert.equal(T.srv.store.get(linkAt, SYSTEM).d.state, 'wait');
  } finally { pg.close(); fresh.close(); await T.stop(); }
});

test('forgot password with the email given at sign-up: the request goes to that email, which the account watches', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url), fresh = page(T.url);
  try {
    await Promise.all([pg.db.ready, fresh.db.ready]);
    await signUp(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    const atEmail = 'linkreqs/' + await fresh.auth.loginTag(EMAIL), atName = 'linkreqs/' + await fresh.auth.loginTag('jordanhale');
    await assert.rejects(fresh.db.doc(atEmail).set(ASK()), (e) => e.code === 'denied', 'not before the code');
    // Typed the username on the login screen, then the sign-up email: the server points the request at the email.
    const c = (await fresh.db.sendCode(EMAIL)).demoCode;
    assert.deepEqual(await fresh.db.checkCode(EMAIL, c, 'jordanhale'), { link: true, via: 'email' });
    await assert.rejects(fresh.db.doc(atName).set(ASK()), (e) => e.code === 'denied', 'the email proves the email, not the username');
    await fresh.db.doc(atEmail).set(ASK());
    assert.ok(pg.auth.loginsOf('jordanhale').includes(EMAIL), 'and the logged-in device watches its email');
  } finally { pg.close(); fresh.close(); await T.stop(); }
});
