// Link offers (SPEC.md 14.14): a signed-in account opens one at the address its code names; the new device that scanned
// the code claims it with its keys; only the account that opened it answers it or takes it down, and the new device may
// clear it once answered. Protocol level, under the standard policy.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, connect, makeIdentity, signup } from './helpers.js';
import { SYSTEM } from '../src/store.js';
import { loginTag, offerTag } from '../src/codes.js';

const n43 = (ch) => ch.repeat(43);
const offerFor = (h, n) => ({ state: 'offer', ts: Date.now(), h, n });
const claim = (x) => ({ state: 'wait', ts: Date.now(), pub: { x: x.repeat(43), y: 'y'.repeat(43) }, dev: 'Edge on Windows PC',
  devk: { id: 'dev0000001', x: 'a'.repeat(43), y: 'b'.repeat(43), sx: 'c'.repeat(43), sy: 'd'.repeat(43) }, cf: n43('C') });
const answer = { state: 'ok', epub: { x: 'e'.repeat(43), y: 'f'.repeat(43) }, iv: 'aXY=', ct: 'Y3Q=' };

async function setup() {
  const T = await startServer({ authz: 'standard' });
  const A = await signup(T.url, await makeIdentity('alice')), B = await signup(T.url, await makeIdentity('bob'));
  const N1 = await connect(T.url), N2 = await connect(T.url);
  await N1.hello(); await N2.hello();
  return { T, A, B, N1, N2, done: async () => { for (const c of [A, B, N1, N2]) await c.close(); await T.stop(); } };
}

test('only a signed-in account opens an offer, naming itself, at the address its name makes and never at a login’s tag', async () => {
  const { T, A, B, N1, done } = await setup();
  try {
    const n = n43('N'), at = 'linkreqs/' + offerTag(n);
    assert.equal((await N1.call('set', { p: at, d: offerFor('alice', n) })).e, 'denied', 'not signed in');
    assert.equal((await B.call('set', { p: at, d: offerFor('alice', n) })).e, 'denied', 'naming another account');
    assert.equal((await A.call('set', { p: 'linkreqs/' + offerTag(n43('M')), d: offerFor('alice', n) })).e, 'denied', 'at an address its name does not make');
    assert.equal((await A.call('set', { p: 'linkreqs/' + loginTag('alice@example.com'), d: offerFor('alice', n) })).e, 'denied', 'at a login’s tag');
    assert.equal((await A.call('set', { p: at, d: { state: 'offer', ts: Date.now(), h: 'alice' } })).e, 'denied', 'without its name');
    await A.ok('set', { p: at, d: offerFor('alice', n) });
    assert.equal(T.srv.store.get(at, SYSTEM).d.state, 'offer');
  } finally { await done(); }
});

test('the device that scanned the code claims the offer once; only the account that opened it answers; then it is cleared', async () => {
  const { T, A, B, N1, N2, done } = await setup();
  try {
    const n = n43('N'), at = 'linkreqs/' + offerTag(n);
    await A.ok('set', { p: at, d: offerFor('alice', n) });
    assert.equal((await N1.call('update', { p: at, d: { ...claim('a'), h: 'bob' } })).e, 'denied', 'a claim keeps the offer’s account');
    assert.equal((await N1.call('update', { p: at, d: { ...claim('a'), n: n43('Z') } })).e, 'denied', 'and its name');
    assert.equal((await N1.call('set', { p: at, d: { ...claim('a'), h: 'alice', n } })).e, 'denied', 'a claim adds to the offer, never replaces it');
    await N1.ok('update', { p: at, d: claim('a') });
    assert.equal(T.srv.store.get(at, SYSTEM).d.state, 'wait');
    assert.equal((await N2.call('update', { p: at, d: claim('b') })).e, 'denied', 'claimed once: a second device is refused');
    assert.equal(T.srv.store.get(at, SYSTEM).d.pub.x, 'a'.repeat(43), 'and the first claim stands');
    assert.equal((await N1.call('update', { p: at, d: answer })).e, 'denied', 'the new device cannot answer itself');
    assert.equal((await B.call('update', { p: at, d: answer })).e, 'denied', 'nor can another account');
    assert.equal((await N1.call('delete', { p: at })).e, 'denied', 'nor can it take the request down while it waits');
    await A.ok('update', { p: at, d: answer });
    assert.equal(T.srv.store.get(at, SYSTEM).d.state, 'ok');
    assert.equal(T.srv.store.get(at, SYSTEM).d.h, 'alice');
    await N1.ok('delete', { p: at });
    assert.equal(T.srv.store.get(at, SYSTEM).d, null, 'the new device clears it once read');
  } finally { await done(); }
});

test('an unclaimed offer is taken down only by its account, which cannot hand it to another', async () => {
  const { T, A, B, N1, done } = await setup();
  try {
    const n = n43('N'), at = 'linkreqs/' + offerTag(n);
    await A.ok('set', { p: at, d: offerFor('alice', n) });
    assert.equal((await B.call('delete', { p: at })).e, 'denied');
    assert.equal((await N1.call('delete', { p: at })).e, 'denied');
    assert.equal((await A.call('update', { p: at, d: { h: 'bob' } })).e, 'denied', 'not handed to another account');
    assert.equal((await B.call('set', { p: at, d: offerFor('bob', n) })).e, 'denied', 'nor taken over by one');
    await A.ok('delete', { p: at });
    assert.equal(T.srv.store.get(at, SYSTEM).d, null);
  } finally { await done(); }
});

test('records at a login’s tag are closed: nobody writes, answers or removes one, a connection that found a box there included', async () => {
  const { T, A, N1, done } = await setup();
  try {
    const t = loginTag('alice@example.com'), at = 'linkreqs/' + t;
    assert.equal((await N1.call('set', { p: at, d: claim('a') })).e, 'denied');
    // A box found at the gate used to open this: anyone may store one, so it proved nothing.
    const x = n43('X'), { loc } = await N1.ok('login.gate', { t, x });
    await N1.ok('set', { p: 'accounts/' + loc, d: { iv: 'aXY=', ct: 'Y3Q=' } });
    await N1.ok('login.gate', { t, x });
    assert.equal((await N1.call('set', { p: at, d: claim('a') })).e, 'denied', 'not after storing a box and finding it');
    T.srv.store.set(at, claim('a'), SYSTEM);
    for (const [c, op, d] of [[N1, 'update', { cf: n43('D') }], [N1, 'update', { state: 'no' }], [N1, 'delete'], [A, 'update', { state: 'no' }], [A, 'delete']]) {
      assert.equal((await c.call(op, { p: at, ...(d ? { d } : {}) })).e, 'denied', op + ' ' + JSON.stringify(d || ''));
    }
    assert.equal(T.srv.store.get(at, SYSTEM).d.state, 'wait');
    assert.equal((await A.call('set', { p: 'linkreqs/' + loginTag('alice'), d: claim('b') })).e, 'denied', 'nor the account at its own username’s tag');
    assert.equal((await N1.call('link.resume', { t, sig: 'x' })).e, 'invalid', 'and no request is continued');
  } finally { await done(); }
});

// ---- release 58: the new device shows the code, so it asks first (SPEC.md 14.14) ----
// A link ask is the one record written before signing in: the asking device's keys and name at the address its code
// names, naming no account. Whoever scans the code answers from their own session, so any signed-in account may; the
// asker takes its ask down, and anyone may once it is answered. The forward flow above is untouched.
const askFor = (n, x = 'a') => ({ state: 'ask', ts: Date.now(), n, pub: { x: x.repeat(43), y: 'y'.repeat(43) }, dev: 'Safari on iPhone',
  devk: { id: 'dev0000002', x: 'a'.repeat(43), y: 'b'.repeat(43), sx: 'c'.repeat(43), sy: 'd'.repeat(43) } });

test('a device not signed in opens an ask at the address its code names, with its keys and no account, once', async () => {
  const { T, A, N1, N2, done } = await setup();
  try {
    const n = n43('K'), at = 'linkreqs/' + offerTag(n);
    assert.equal((await N1.call('set', { p: 'linkreqs/' + offerTag(n43('M')), d: askFor(n) })).e, 'denied', 'at an address its name does not make');
    assert.equal((await N1.call('set', { p: 'linkreqs/' + loginTag('alice'), d: askFor(n) })).e, 'denied', 'at a login’s tag');
    assert.equal((await N1.call('set', { p: at, d: { ...askFor(n), h: 'alice' } })).e, 'denied', 'naming an account');
    assert.equal((await N1.call('set', { p: at, d: { ...askFor(n), ct: 'Y3Q=' } })).e, 'invalid', 'with a field that is not an ask’s');
    assert.equal((await N1.call('set', { p: at, d: { ...askFor(n), devk: { id: 'dev0000002', x: 'a' } } })).e, 'invalid', 'with half a device key');
    assert.equal((await N1.call('set', { p: at, d: { ...askFor(n), devk: { ...askFor(n).devk, nm: 'x' } } })).e, 'invalid', 'with more than a device key');
    assert.equal((await N1.call('set', { p: at, d: (({ devk, ...rest }) => rest)(askFor(n)) })).e, 'invalid', 'without its device key');
    await N1.ok('set', { p: at, d: askFor(n) });
    assert.equal(T.srv.store.get(at, SYSTEM).d.state, 'ask');
    assert.equal((await N2.call('set', { p: at, d: askFor(n, 'b') })).e, 'denied', 'an ask is created, never replaced');
    assert.equal((await A.call('set', { p: at, d: askFor(n, 'b') })).e, 'denied', 'by an account either');
    assert.equal((await N1.call('update', { p: at, d: { pub: { x: 'z'.repeat(43), y: 'y'.repeat(43) } } })).e, 'denied', 'nor are its keys changed');
    assert.equal((await A.call('update', { p: at, d: { ...claim('b'), h: 'alice' } })).e, 'denied', 'nor is it claimed like an offer');
    assert.equal(T.srv.store.get(at, SYSTEM).d.pub.x, 'a'.repeat(43), 'the ask stands as written');
    await N1.ok('delete', { p: at });
    assert.equal(T.srv.store.get(at, SYSTEM).d, null, 'the asker gives up');
  } finally { await done(); }
});

test('any signed-in account answers an ask, naming itself; nobody else does; then anyone clears it', async () => {
  const { T, A, B, N1, N2, done } = await setup();
  try {
    const n = n43('K'), at = 'linkreqs/' + offerTag(n);
    await N1.ok('set', { p: at, d: askFor(n) });
    assert.equal((await N2.call('update', { p: at, d: { ...answer, h: 'alice' } })).e, 'denied', 'not signed in');
    assert.equal((await A.call('update', { p: at, d: answer })).e, 'denied', 'an answer names the account that gave it');
    assert.equal((await A.call('update', { p: at, d: { ...answer, h: 'bob' } })).e, 'denied', 'and not another');
    assert.equal((await A.call('update', { p: at, d: { ...answer, h: 'alice', n: n43('Z') } })).e, 'denied', 'and keeps the ask’s name');
    assert.equal((await A.call('set', { p: at, d: { ...answer, h: 'alice', n } })).e, 'denied', 'an answer adds to the ask, never replaces it');
    assert.equal((await A.call('update', { p: at, d: { state: 'wait', h: 'alice' } })).e, 'denied', 'ok or no, nothing else');
    await B.ok('update', { p: at, d: { ...answer, h: 'bob' } });   // the code was on bob's screen: whoever scans it is the account that opens
    const d = T.srv.store.get(at, SYSTEM).d;
    assert.equal(d.state, 'ok'); assert.equal(d.h, 'bob'); assert.equal(d.pub.x, 'a'.repeat(43), 'the asker’s key is kept for the asker to read its answer');
    assert.equal((await A.call('update', { p: at, d: { ...answer, h: 'alice' } })).e, 'denied', 'answered once');
    await N1.ok('delete', { p: at });
    assert.equal(T.srv.store.get(at, SYSTEM).d, null, 'the asker clears it once read');
    await N2.ok('set', { p: at, d: askFor(n) });
    await A.ok('update', { p: at, d: { state: 'no', h: 'alice' } });
    await N2.ok('delete', { p: at });
  } finally { await done(); }
});

test('asks are counted per address: the table cannot be filled from one place', async () => {
  const T = await startServer({ authz: 'standard', limits: { linkAsksPerHourPerAddr: 3 } });
  const N = await connect(T.url);
  try {
    await N.hello();
    for (let i = 0; i < 3; i++) { const n = n43(String(i)); await N.ok('set', { p: 'linkreqs/' + offerTag(n), d: askFor(n) }); }
    const n = n43('X');
    assert.equal((await N.call('set', { p: 'linkreqs/' + offerTag(n), d: askFor(n) })).e, 'ratelimit');
    assert.equal(T.srv.store.get('linkreqs/' + offerTag(n), SYSTEM).d, null);
  } finally { await N.close(); await T.stop(); }
});
