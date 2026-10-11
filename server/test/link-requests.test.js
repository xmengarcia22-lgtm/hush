// Link-request reads (SPEC.md 9.4): two devices on one network address polling, and the ceilings that stay; the page
// that notices it is out of date is tested on its own at the bottom. Since release 16 nobody writes a request at a
// login's tag (the emailed-code road): link-offers.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { startServer, connect } from './helpers.js';

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
