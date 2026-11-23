import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TokenBucket, BucketMap, AddressTagger, clientAddress, netOf, DEFAULT_LIMITS, MEDIA_LIMITS } from '../src/limits.js';
import { createDiskWatch } from '../src/disk.js';

test('a bucket spent below zero stops at minus its capacity, so whoever took from it is at most one capacity\'s refill from being answered again, however much they took (release 112)', () => {
  const m = new BucketMap(3000, 50), t0 = 1_000_000;
  m.spend('a', 500, t0);
  assert.equal(m.tokensLeft('a', t0), 2500);
  m.spend('a', 1e9, t0);
  assert.equal(m.tokensLeft('a', t0), -3000);
  assert.deepEqual([m.peek('a', t0 + 59_000), m.peek('a', t0 + 60_100)], [false, true]);
});
import { log } from '../src/log.js';

test('the limits of release 91 have their defaults', () => {
  const L = DEFAULT_LIMITS;
  assert.deepEqual([L.leaveRotateGapMs, L.leaveRotatesPerDay, L.wrapsPerAcctEpoch, L.wrapsMaxPerAcctEpoch, L.wrapsWindowMs, L.cardsPerChat, L.cardTtlMs, L.sweepSideMax],
    [15 * 60_000, 8, 8, 32, 30 * 86400_000, 10000, 30 * 86400_000, 5000]);
  assert.equal(L.leaveRotateMaxEpoch, 23, 'groups keep their leave budget');
});

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

test('IPv6 addresses are counted by their /64; IPv4 ones, mapped or not, as themselves', () => {
  assert.equal(netOf('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(netOf('2001:0DB8:0:0:ffff:1:2:3'), '2001:db8:0:0::/64', 'leading zeros and case make no difference');
  assert.equal(netOf('2001:db8:0:1::1'), '2001:db8:0:1::/64');
  assert.equal(netOf('fe80::1%eth0'), 'fe80:0:0:0::/64', 'the zone is dropped');
  assert.equal(netOf('64:ff9b::1.2.3.4'), '64:ff9b:0:0::/64', 'an embedded IPv4 sits past the prefix');
  assert.equal(netOf('::ffff:203.0.113.9'), '203.0.113.9', 'a mapped IPv4 is that IPv4, not the /64 every mapped address shares');
  assert.equal(netOf('203.0.113.9'), '203.0.113.9');
  assert.equal(netOf(undefined), '');
  const t = new AddressTagger();
  assert.equal(t.tag('2001:db8::1'), t.tag('2001:db8:0:0:ffff::2'), 'one /64 is one tag');
  assert.notEqual(t.tag('2001:db8::1'), t.tag('2001:db8:0:1::1'), 'another /64 is another');
  assert.equal(t.tagDay('::ffff:1.2.3.4'), t.tagDay('1.2.3.4'));
  assert.notEqual(t.tag('1.2.3.4'), t.tag('1.2.3.5'));
  const fixed = t.tagFixed('2001:db8::1');
  assert.equal(fixed, t.tagFixed('2001:db8::7'), 'the fixed tag groups the same way');
  assert.notEqual(fixed, t.tag('2001:db8::1'), 'under its own salt');
  t.rotate(); t.rotateDay();
  assert.equal(t.tagFixed('2001:db8::1'), fixed, 'and never turns: a count of open sockets keeps its key');
  assert.notEqual(new AddressTagger().tagFixed('2001:db8::1'), fixed, 'but is this process\'s alone');
});

test('the disk guard looks again after 5 s or 256 MiB admitted, caps all media together, allows when statfs fails, and logs flips and a blind statfs once', () => {
  let t = 1_000_000, calls = 0, free = { free: 50e9, total: 100e9 }, bytes = 0;
  const lines = []; log.setSink((l) => lines.push(l)); log.setEnabled(true);
  const limits = { ...DEFAULT_LIMITS, media: { ...MEDIA_LIMITS, maxMediaBytes: 1000 << 20 } };
  const disk = createDiskWatch({ store: { mediaStats: () => ({ bytes, ids: 0 }) }, limits, now: () => t, diskFree: () => { calls++; return free; } });
  assert.equal(disk.ok(), true); assert.equal(calls, 1);
  t += 4999; free = { free: 1e9, total: 100e9 };
  assert.equal(disk.ok(), true, 'within 5 s the last answer stands'); assert.equal(calls, 1);
  t += 1;
  assert.equal(disk.ok(), false, 'after 5 s the disk is asked again'); assert.equal(calls, 2);
  free = { free: 50e9, total: 100e9 };
  assert.equal(disk.admit(100 << 20), false, 'still the stale answer'); assert.equal(calls, 2);
  t += 5000;
  assert.equal(disk.admit(100 << 20), true); assert.equal(calls, 3);
  assert.equal(disk.admit(156 << 20), true); assert.equal(calls, 3, '256 MiB admitted: the next request asks again');
  assert.equal(disk.admit(1 << 20), true); assert.equal(calls, 4, 'whatever the clock says');
  bytes = 999 << 20; t += 5000;                  // what is stored, as the next look reads it
  assert.equal(disk.admit(1 << 20), true, 'up to the cap'); assert.equal(calls, 5);
  assert.equal(disk.admit(1), false, 'all media together may not pass maxMediaBytes');
  bytes = 10 << 20; t += 5000;
  assert.equal(disk.admit(1), true, 'the next look reads what is really stored (a delete made room)');
  free = null;
  t += 5000;
  assert.equal(disk.ok(), true, 'statfs failing: unknown, allow');
  t += 5000;
  assert.equal(disk.admit(1), true);
  log.setEnabled(false);
  assert.deepEqual(lines.map((l) => JSON.parse(l)).map((e) => [e.event, e.level, e.ok, e.freePct]),
    [['media.disk', 'warn', false, 1], ['media.disk', 'warn', true, 50], ['media.disk', 'warn', true, -1]],
    'each flip once, and a statfs that cannot be read once (freePct -1), not at every look');
});

test('the limits of release 62 have their defaults', () => {
  assert.equal(DEFAULT_LIMITS.signupsPerDayPerAddr, 10);
  assert.equal(DEFAULT_LIMITS.anonBoxesPerDayPerAddr, 50);
  assert.equal(DEFAULT_LIMITS.anonBoxBytesPerDayPerAddr, 20e6);
  assert.equal(DEFAULT_LIMITS.boxesPerDayPerAcct, 50);
  assert.equal(DEFAULT_LIMITS.boxBytesPerDayPerAcct, 20e6);
  assert.equal(DEFAULT_LIMITS.socketsPerAddr, 40);
  assert.equal(DEFAULT_LIMITS.chatCreatesPerDay, 200);
  assert.equal(MEDIA_LIMITS.maxMediaBytes, 8e9);
  assert.equal(MEDIA_LIMITS.uploadBytesPerDayPerAcct, 4e9);
  assert.equal(MEDIA_LIMITS.uploadBytesPerDayPerAddr, 8e9);
  assert.equal(MEDIA_LIMITS.diskCheckMs, 5000);
  assert.equal(MEDIA_LIMITS.diskCheckBytes, 256 << 20);
});

test('the message nudge limits of release 65 have their defaults', () => {
  assert.equal(DEFAULT_LIMITS.msgPerMinPerTicket, 6);
  assert.equal(DEFAULT_LIMITS.msgPerHourPerTicket, 60);
  assert.equal(DEFAULT_LIMITS.wakePerHourPerAddr, 300, 'one address bucket for every kind, 60 before release 65');
});

test('the ring ceiling per phone of release 93 has its defaults, above one ticket\'s own so one contact alone never uses it up', () => {
  const L = DEFAULT_LIMITS;
  assert.deepEqual([L.wakePerMinPerDevice, L.wakePerHourPerDevice], [4, 30]);
  assert.ok(L.wakePerMinPerDevice > L.wakePerMinPerTicket && L.wakePerHourPerDevice > L.wakePerHourPerTicket, 'above 3 a minute and 20 an hour');
});

test('client address is the last X-Forwarded-For hop, the one the proxy appended, and only when trusted', () => {
  const req = { headers: { 'x-forwarded-for': '198.51.100.7, 10.0.0.1' }, socket: { remoteAddress: '127.0.0.1' } };
  assert.equal(clientAddress(req, true), '10.0.0.1', 'the last hop: the first value is whatever the client wrote');
  assert.equal(clientAddress(req, false), '127.0.0.1');
  assert.equal(clientAddress({ headers: {}, socket: {} }, true), '');
});

test('X-Forwarded-For counts only from the proxy on this machine: from any other peer the socket\'s own address is the client, whatever the header says (release 112)', () => {
  const at = (peer) => clientAddress({ headers: { 'x-forwarded-for': '203.0.113.9' }, socket: { remoteAddress: peer } }, true);
  for (const peer of ['127.0.0.1', '::1', '::ffff:127.0.0.1']) assert.equal(at(peer), '203.0.113.9', peer);
  for (const peer of ['198.51.100.7', '::ffff:198.51.100.7', '2001:db8::1', '']) assert.equal(at(peer), peer, peer || 'no peer address');
});

test('a faked leftmost X-Forwarded-For value is ignored: the proxy-appended hop keys the address buckets', () => {
  const socket = { remoteAddress: '127.0.0.1' }, at = (xff) => clientAddress({ headers: { 'x-forwarded-for': xff }, socket }, true);
  assert.equal(at('203.0.113.9, 198.51.100.7'), '198.51.100.7', 'the client wrote 203.0.113.9; Caddy appended the peer it saw');
  assert.equal(at('1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.7'), '198.51.100.7', 'however many values the client wrote');
  assert.equal(at('198.51.100.7'), '198.51.100.7', 'one hop: the proxy saw the client directly');
  assert.equal(at('203.0.113.9, '), '127.0.0.1', 'an empty last field is not a hop: the socket address, never the client\'s value');
  assert.equal(at(''), '127.0.0.1');
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
