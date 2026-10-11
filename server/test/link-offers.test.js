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
