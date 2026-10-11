// Logging a new device in through another one (SPEC.md 14.10): a retry right after backing out, and two devices on one
// network address polling the same request, run with the page's own code against a real server under the standard
// policy. The page that notices it is out of date is tested on its own at the bottom.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { startServer, connect, sleep } from './helpers.js';
import { SYSTEM } from '../src/store.js';
import { page, signUpWith } from './page-auth.js';

const PW = 'blue truck on main street';
const EMAIL = 'jordan.hale@example.com';
const PHONE = '+12125550134';
const ask = (x) => ({ state: 'wait', ts: Date.now(), pub: { x: x.repeat(43), y: 'y'.repeat(43) }, dev: 'Edge on Windows PC' });

// A new device that has confirmed the account's sign-up email and may therefore ask to be let in at the email's address.
async function confirmedNewDevice(T, EMAILCODE = EMAIL) {
  const fresh = page(T.url);
  await fresh.db.ready;
  const c = (await fresh.db.sendCode(EMAILCODE)).demoCode;
  const r = await fresh.db.checkCode(EMAILCODE, c);
  return { fresh, r };
}

test('a retry replaces the earlier waiting request at once; nothing makes the person wait ten minutes', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  const pages = [pg];
  try {
    await pg.db.ready;
    await signUpWith(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    const at = 'linkreqs/' + await pg.auth.loginTag(EMAIL);
    const first = await confirmedNewDevice(T); pages.push(first.fresh);
    assert.equal(first.r.link, true);
    await first.fresh.db.doc(at).set(ask('a'));
    assert.equal(T.srv.store.get(at, SYSTEM).d.pub.x, 'a'.repeat(43));
    // the same person tries again from a second window, with the first request still waiting: the old server said "conflict"
    const second = await confirmedNewDevice(T); pages.push(second.fresh);
    await second.fresh.db.doc(at).set(ask('b'));
    assert.equal(T.srv.store.get(at, SYSTEM).d.pub.x, 'b'.repeat(43), 'the newer request is the one waiting');
    // and an unconfirmed connection still cannot write one at all
    const stranger = page(T.url); pages.push(stranger);
    await stranger.db.ready;
    await assert.rejects(stranger.db.doc(at).set(ask('c')), (e) => e.code === 'denied');
    assert.equal(T.srv.store.get(at, SYSTEM).d.pub.x, 'b'.repeat(43));
  } finally { pages.forEach((p) => p.close()); await T.stop(); }
});

test('link requests are polled on their own allowance: two devices on one address do not starve each other', async () => {
  // This address reads far more than the old shared allowance of 20 a minute, as a new device (every 3 s) and the
  // devices that may let it in (every 3.5 s each) do from one home network. The other blind lookups keep their strict count.
  const T = await startServer({ authz: 'standard', limits: { blindReadsPerMinPerAddr: 3 } });
  const a = await connect(T.url), b = await connect(T.url);
  try {
    await a.hello(); await b.hello();
    const at = 'linkreqs/' + 'Q'.repeat(43);
    for (let n = 0; n < 60; n++) assert.equal((await (n % 2 ? a : b).call('get', { p: at })).ok, true, 'read ' + n);
    assert.equal((await a.call('get', { p: 'logins/' + 'R'.repeat(43) })).ok, true);
    for (let n = 0; n < 2; n++) await a.call('get', { p: 'logins/' + 'R'.repeat(43) });
    assert.equal((await a.call('get', { p: 'logins/' + 'R'.repeat(43) })).e, 'ratelimit', 'the lookups that find out whether a login exists are still counted');
    assert.equal((await a.call('get', { p: at })).ok, true, 'and a link request read is not charged to them');
  } finally { await a.close(); await b.close(); await T.stop(); }
});

test('link-request lookups still have a ceiling per address and per request address', async () => {
  const T = await startServer({ authz: 'standard', limits: { linkReadsPerMinPerAddr: 6, linkReadsPerHourPerPath: 3 } });
  const a = await connect(T.url);
  try {
    await a.hello();
    for (let n = 0; n < 3; n++) assert.equal((await a.call('get', { p: 'linkreqs/' + 'S'.repeat(43) })).ok, true);
    assert.equal((await a.call('get', { p: 'linkreqs/' + 'S'.repeat(43) })).e, 'ratelimit', 'one request address, too often');
    assert.equal((await a.call('get', { p: 'linkreqs/' + 'T'.repeat(43) })).ok, true);
    assert.equal((await a.call('get', { p: 'linkreqs/' + 'U'.repeat(43) })).ok, true);
    assert.equal((await a.call('get', { p: 'linkreqs/' + 'V'.repeat(43) })).e, 'ratelimit', 'one address, too many request addresses');
  } finally { await a.close(); await T.stop(); }
});

// ---- the page that is out of date ----

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const a0 = src.indexOf('/* ===== HUSH UPDATE BEGIN ===== */'), b0 = src.indexOf('/* ===== HUSH UPDATE END ===== */');
assert.ok(a0 > 0 && b0 > a0, 'update markers present in app/ui.js');
// the pure parts only: the file pins and the comparison (the rest needs a browser)
const body = src.slice(a0, b0);
const pure = body.slice(body.indexOf('const PINNED'), body.indexOf('let updateChecking'));
const { pinsOf, outOfDate } = new Function(pure + '\nreturn { pinsOf, outOfDate };')();

const HTML = (v) => `<script src="app/config.js?v=${v.c}" integrity="x"></script><script src="app/crypto.js?v=${v.k}" integrity="x"></script>`
  + `<script src="app/ui.js?v=${v.u}" integrity="x"></script><link rel="stylesheet" href="app/styles.css?v=${v.s}" integrity="x">`
  + `<script src="vendor/qrcode.min.js?v=164fc2c1c9ea"></script>`;
const V = { c: 'a099cab4098e', k: 'c8110017a8ac', u: '824b206a6141', s: 'c966031c4f20' };

test('a page finds the files it loaded among the versions the served index.html names', () => {
  const m = pinsOf(HTML(V));
  assert.deepEqual(m, { 'app/config.js': V.c, 'app/crypto.js': V.k, 'app/ui.js': V.u, 'app/styles.css': V.s });
  assert.equal(outOfDate(m, pinsOf(HTML(V))), false, 'same release');
  for (const k of ['c', 'k', 'u', 's']) assert.equal(outOfDate(m, pinsOf(HTML({ ...V, [k]: 'ffffffffffff' }))), true, 'any one file changed: ' + k);
});

test('a reply that is not the app never makes a page reload', () => {
  const m = pinsOf(HTML(V));
  assert.equal(outOfDate(m, pinsOf('')), false, 'empty');
  assert.equal(outOfDate(m, pinsOf('<html><body>Sign in to the café Wi-Fi</body></html>')), false, 'a captive portal');
  assert.equal(outOfDate(m, pinsOf(null)), false);
});

// ---- the resend wait, as the page reads it from the server's refusal ----

test('the page reads the seconds out of the server’s "wait N seconds" refusal', () => {
  const line = src.split('\n').find((l) => l.startsWith('const cooldownSecs='));
  assert.ok(line, 'cooldownSecs present in app/ui.js');
  const cooldownSecs = new Function(line + '\nreturn cooldownSecs;')();
  const refusal = (m, code = 'ratelimit') => Object.assign(new Error(m), { code });
  assert.equal(cooldownSecs(refusal('wait 56 seconds before asking for another code')), 56);
  assert.equal(cooldownSecs(refusal('wait 1 second before asking for another code')), 1);
  assert.equal(cooldownSecs(refusal('too many codes asked for from here; wait a while')), 0, 'the hourly limit is not a countdown');
  assert.equal(cooldownSecs(refusal('wait 56 seconds before asking for another code', 'denied')), 0);
  assert.equal(cooldownSecs(null), 0);
});

test('the refusal the server really sends is the one the page understands', async () => {
  const T = await startServer({ authz: 'standard', limits: { codeCooldownMs: 60_000 } });
  const c = await connect(T.url);
  try {
    await c.hello();
    await c.ok('code.send', { to: EMAIL });
    const r = await c.call('code.send', { to: EMAIL });
    const line = src.split('\n').find((l) => l.startsWith('const cooldownSecs='));
    const secs = new Function(line + '\nreturn cooldownSecs;')()(Object.assign(new Error(r.m), { code: r.e }));
    assert.ok(secs >= 55 && secs <= 60, 'seconds read from: ' + r.m);
  } finally { await c.close(); await T.stop(); }
});

// ---- finding 4: only the new device or the account's own devices may answer or remove a waiting request ----

test('a waiting request can be refused or removed only by the new device or a device of the account', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url), other = page(T.url);
  const pages = [pg, other];
  try {
    await Promise.all([pg.db.ready, other.db.ready]);
    const { all } = await signUpWith(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    await signUpWith(other, 'olivia.lane@example.com', PW, 'olivia', 'Olivia Lane');
    const etag = await pg.auth.loginTag(EMAIL), at = 'linkreqs/' + etag;
    const dev = await confirmedNewDevice(T); pages.push(dev.fresh);
    await dev.fresh.db.doc(at).set(ask('a'));
    // An outsider who only knows the email: no refusing, no deleting, no faking an approval.
    const outsider = await connect(T.url); await outsider.hello();
    for (const [op, d] of [['update', { state: 'no' }], ['update', { state: 'ok', iv: 'aXY=', ct: 'Y3Q=' }], ['delete', undefined]]) {
      assert.equal((await outsider.call(op, { p: at, ...(d ? { d } : {}) })).e, 'denied', op + ' ' + JSON.stringify(d || ''));
    }
    await outsider.close();
    assert.equal((await other.db.doc(at).update({ state: 'no' }).catch((e) => e)).code, 'denied', 'another signed-in account can’t either');
    assert.equal(T.srv.store.get(at, SYSTEM).d.state, 'wait');
    // The account's device: proving it holds the email login's password box lets it answer.
    assert.equal((await pg.db.doc(at).update({ state: 'no' }).catch((e) => e)).code, 'denied', 'not before it proves it holds the login');
    await pg.db.loginGate(etag, all[EMAIL]);
    await pg.db.doc(at).update({ state: 'no' });
    assert.equal(T.srv.store.get(at, SYSTEM).d.state, 'no');
    // At the username's own tag the proven username is proof enough.
    const htag = 'linkreqs/' + await pg.auth.loginTag('jordanhale');
    T.srv.store.set(htag, ask('b'), SYSTEM);
    assert.equal((await other.db.doc(htag).delete().catch((e) => e)).code, 'denied');
    await pg.db.doc(htag).update({ state: 'no' });
    await pg.db.doc(htag).delete();
    assert.equal(T.srv.store.get(htag, SYSTEM).d, null);
  } finally { pages.forEach((p) => p.close()); await T.stop(); }
});

// ---- release 11: a waiting request may carry the new device's proof, and only a well-formed one ----

test('a waiting request takes a 43-character proof from the new device, nothing else', async () => {
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  const pages = [pg];
  try {
    await pg.db.ready;
    await signUpWith(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    const at = 'linkreqs/' + await pg.auth.loginTag(EMAIL);
    const dev = await confirmedNewDevice(T); pages.push(dev.fresh);
    await dev.fresh.db.doc(at).set(ask('a'));
    for (const bad of ['short', 'x'.repeat(44), 'not base64url !'.padEnd(43, '?'), 7]) {
      assert.equal((await dev.fresh.db.doc(at).update({ cf: bad }).catch((e) => e)).code, 'invalid', JSON.stringify(bad));
    }
    await dev.fresh.db.doc(at).update({ cf: 'P'.repeat(43) });
    assert.equal(T.srv.store.get(at, SYSTEM).d.cf, 'P'.repeat(43));
    const outsider = await connect(T.url); await outsider.hello();
    assert.equal((await outsider.call('update', { p: at, d: { cf: 'Q'.repeat(43) } })).e, 'denied', 'an outsider can’t write one');
    await outsider.close();
  } finally { pages.forEach((p) => p.close()); await T.stop(); }
});

// ---- release 13: a new device continues its own request after a reload or a reconnect, and nothing else can ----

test('continuing a request needs the device key inside it, only while it waits and is young', async () => {
  const { makeIdentity, makeDevice, signText } = await import('./helpers.js');
  const T = await startServer({ authz: 'standard' });
  const pg = page(T.url);
  const pages = [pg];
  const conns = [];
  try {
    await pg.db.ready;
    await signUpWith(pg, EMAIL, PW, 'jordanhale', 'Jordan Hale');
    const tag = await pg.auth.loginTag(EMAIL), at = 'linkreqs/' + tag;
    const d = await makeDevice(await makeIdentity('jordanhale')), other = await makeDevice(await makeIdentity('jordanhale'));
    const devk = { id: d.id, x: d.entry.x, y: d.entry.y, sx: d.entry.sx, sy: d.entry.sy };
    const dev = await confirmedNewDevice(T); pages.push(dev.fresh);
    const ts = Date.now();
    await dev.fresh.db.doc(at).set({ ...ask('a'), ts, devk });
    // a reload: a new connection that never typed the code
    const again = await connect(T.url); conns.push(again);
    const { nonce } = await again.hello();
    const msg = (n, t = tag, s = ts) => 'hush-link-resume-v1|' + n + '|' + t + '|' + s;
    assert.equal((await again.call('update', { p: at, d: { cf: 'C'.repeat(43) } })).e, 'denied', 'a new connection starts without the confirmation');
    assert.equal((await again.call('link.resume', { t: tag, sig: await signText(other.sigKey, msg(nonce)) })).e, 'denied', 'another device’s key is refused');
    assert.equal((await again.call('link.resume', { t: tag, sig: await signText(d.sigKey, msg('stale-nonce')) })).e, 'denied', 'a signature over another challenge is refused');
    await again.ok('link.resume', { t: tag, sig: await signText(d.sigKey, msg(nonce)) });
    await again.ok('update', { p: at, d: { cf: 'C'.repeat(43) } });
    // once the request has ended, it can't be continued
    T.srv.store.update(at, { state: 'no' }, SYSTEM);
    const third = await connect(T.url); conns.push(third);
    const n3 = (await third.hello()).nonce;
    assert.equal((await third.call('link.resume', { t: tag, sig: await signText(d.sigKey, msg(n3)) })).e, 'notfound', 'a refused request is over');
    T.srv.store.set(at, { ...ask('a'), ts: Date.now() - 11 * 60_000, devk }, SYSTEM);
    assert.equal((await third.call('link.resume', { t: tag, sig: await signText(d.sigKey, msg(n3, tag, Date.now() - 11 * 60_000)) })).e, 'notfound', 'and so is one older than ten minutes');
    T.srv.store.delete(at, {}, SYSTEM);
    assert.equal((await third.call('link.resume', { t: tag, sig: await signText(d.sigKey, msg(n3)) })).e, 'notfound', 'and one that is gone');
  } finally { for (const c of conns) await c.close(); pages.forEach((p) => p.close()); await T.stop(); }
});
