import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TokenBucket, BucketMap, AddressTagger, clientAddress } from '../src/limits.js';
import { log } from '../src/log.js';

test('token bucket allows a burst then refills over time', () => {
  const b = new TokenBucket(3, 1); // 3 burst, 1 per second
  const t0 = 1_000_000;
  assert.equal(b.take(1, t0), true);
  assert.equal(b.take(1, t0), true);
  assert.equal(b.take(1, t0), true);
  assert.equal(b.take(1, t0), false);
  assert.equal(b.take(1, t0 + 500), false);
  assert.equal(b.take(1, t0 + 1000), true);
});

test('bucket map keeps separate buckets and forgets idle ones', () => {
  const m = new BucketMap(1, 1, 1000);
  const t0 = 5_000_000;
  assert.equal(m.take('a', 1, t0), true);
  assert.equal(m.take('a', 1, t0), false);
  assert.equal(m.take('b', 1, t0), true);
  assert.equal(m.size, 2);
  m.prune(t0 + 2000);
  assert.equal(m.size, 0);
});

test('address tags never contain the address and change when the salt rotates', () => {
  const t = new AddressTagger();
  const addr = '203.0.113.42';
  const tag1 = t.tag(addr);
  assert.match(tag1, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(!tag1.includes('203') || !tag1.includes('113'));
  assert.equal(t.tag(addr), tag1, 'stable within an hour');
  assert.notEqual(t.tag('203.0.113.43'), tag1);
  t.rotate();
  assert.notEqual(t.tag(addr), tag1, 'unlinkable across rotations');
});

test('client address comes from the proxy header only when trusted', () => {
  const req = { headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientAddress(req, true), '198.51.100.7');
  assert.equal(clientAddress(req, false), '127.0.0.1');
  assert.equal(clientAddress({ headers: {}, socket: {} }, true), '');
});

test('the logger drops free-form strings and error messages', () => {
  const lines = [];
  log.setSink((l) => lines.push(l));
  log.setEnabled(true);
  log.info('server.start', { port: 8080, mode: 'open', handle: 'alice', address: '203.0.113.9' });
  const err = new Error('Unexpected token at 203.0.113.9 in directory/alice');
  err.code = 'E_SOMETHING';
  log.error('frame.failed', err);
  log.setEnabled(false);
  const all = lines.join('\n');
  assert.ok(all.includes('"port":8080'));
  assert.ok(all.includes('"mode":"open"'));
  assert.ok(!all.includes('alice'), 'free-form strings are dropped');
  assert.ok(!all.includes('203.0.113.9'), 'error messages are dropped, only stack frames remain');
  assert.ok(all.includes('E_SOMETHING'));
});
