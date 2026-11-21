// The Apple push sender (apns.js): a provider token signed with the operator's key and refreshed on time, Apple's
// headers on every push (VoIP, or alert for a "New message" nudge), Apple's answer read back, and one HTTP/2 session
// opened at start, pinged, kept across sends and remade when it dies, with one retry for a push the dying session
// swallowed, and a log line only for a push that was cold, slow or refused. Apple itself is a stand-in: a fake http2
// session that records each request and answers as programmed.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { generateKeyPairSync, verify } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createApns, tokenDead } from '../src/apns.js';
import { parseApns } from '../src/config.js';

const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const dir = mkdtempSync(join(tmpdir(), 'hush-apns-'));
const keyFile = join(dir, 'AuthKey_ABCDEF1234.p8');
writeFileSync(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
after(() => rmSync(dir, { recursive: true, force: true }));

const TOK = 'ab'.repeat(32);
const OPTS = { keyFile, keyId: 'ABCDEF1234', teamId: 'TEAM123456', topic: 'com.example.voip', host: 'apns.test' };
const decode = (s) => JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
const FROZEN = { now: () => 1_700_000_000_000 };   // a clock that does not move, so a logged `ms` is 0

// A stand-in for an http2 client session. `reply` is { status, body }, { error: true } (the stream fails) or { close: true }
// (the stream closes without a word), or a function of the request. Pings are counted and answered unless `ack` is off.
function fakeSession(reply) {
  const s = new EventEmitter();
  s.destroyed = false; s.closed = false; s.requests = []; s.pings = 0; s.ack = true;
  s.close = () => { s.closed = true; s.emit('close'); };
  s.destroy = () => { s.destroyed = true; s.emit('close'); };
  s.ping = (cb) => { s.pings++; if (s.ack) cb(null, 1); return true; };
  s.request = (headers) => {
    const st = new EventEmitter();
    const r = { headers, body: '' };
    s.requests.push(r);
    st.close = () => {};
    st.end = (b) => {
      r.body = String(b || '');
      const a = typeof reply === 'function' ? reply(r) : reply;
      if (!a) return;   // never answers: the sender's timeout must step in
      queueMicrotask(() => {
        if (a.error) { st.emit('error', new Error('socket hang up')); return; }
        if (a.close) { st.emit('close'); return; }
        st.emit('response', { ':status': a.status });
        if (a.body) st.emit('data', Buffer.from(a.body));
        st.emit('end');
      });
    };
    return st;
  };
  return s;
}
// createApns options with a fake connect that remembers every session it made, and a log that keeps the info lines.
function fake(reply, over = {}) {
  const sessions = [], infos = [];
  const connect = (url) => { const s = fakeSession(reply); s.url = url; sessions.push(s); return s; };
  return { sessions, infos, opts: { ...OPTS, connect, log: { info: (e, f) => infos.push({ e, ...f }), warn() {}, error() {} }, ...over } };
}

test('a push carries Apple\'s headers and a provider token that verifies with the key; one session serves them all', async () => {
  let t = 1_700_000_000_000;
  const { sessions, infos, opts } = fake({ status: 200 }, { now: () => t });
  const a = createApns(opts);
  assert.equal(a.enabled, true);
  assert.equal(sessions.length, 1, 'the session is opened at start, not at the first push');
  assert.deepEqual(await a.send({ tok: TOK, payload: { w: 'x' } }), { status: 200, reason: '' });
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].url, 'https://apns.test:443');
  assert.deepEqual(infos, [], 'a warm, fast, accepted push leaves the log quiet: no per-request logging');
  const { headers, body } = sessions[0].requests[0];
  assert.equal(headers[':method'], 'POST');
  assert.equal(headers[':path'], '/3/device/' + TOK);
  assert.equal(headers['apns-topic'], 'com.example.voip');
  assert.equal(headers['apns-push-type'], 'voip');
  assert.equal(headers['apns-priority'], '10');
  assert.equal(headers['apns-expiration'], '0');
  assert.equal(headers['content-type'], 'application/json');
  assert.equal(body, '{"w":"x"}');
  const jwt = headers.authorization.replace(/^bearer /, '');
  const [h, c, sig] = jwt.split('.');
  assert.deepEqual(decode(h), { alg: 'ES256', kid: 'ABCDEF1234' });
  assert.deepEqual(decode(c), { iss: 'TEAM123456', iat: Math.floor(t / 1000) });
  assert.equal(verify('sha256', Buffer.from(h + '.' + c), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')), true);
  // The token is reused for 50 minutes and then made anew.
  t += 49 * 60_000;
  await a.send({ tok: TOK, payload: { w: 'y' } });
  assert.equal(sessions[0].requests[1].headers.authorization, headers.authorization, 'still fresh at 49 minutes');
  t += 2 * 60_000;
  await a.send({ tok: TOK, payload: { w: 'z' } });
  const renewed = sessions[0].requests[2].headers.authorization;
  assert.notEqual(renewed, headers.authorization, 'renewed after 50 minutes');
  assert.equal(decode(renewed.split('.')[1]).iat, Math.floor(t / 1000));
  assert.equal(sessions.length, 1, 'the session is kept across sends');
  assert.equal(infos.length, 0);
  a.close();
  assert.equal(sessions[0].closed, true);
});

test('a session that dies under a request is dropped and the push tried once more on a fresh one; a refusal is final', async () => {
  const replies = [{ error: true }, { status: 200 }, { close: true }, { status: 200 }];
  const { sessions, infos, opts } = fake(() => replies.shift(), FROZEN);
  const a = createApns(opts);
  assert.deepEqual(await a.send({ tok: TOK, payload: {} }), { status: 200, reason: '' }, 'the stream failed, the retry went through');
  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].destroyed, true);
  assert.equal(sessions[1].requests[0].body, '{}', 'the same push again');
  assert.deepEqual(infos, [{ e: 'apns.sent', ms: 0, cold: true, status: 200, kind: 'voip' }], 'one line for the send, marked cold');
  assert.deepEqual(await a.send({ tok: TOK, payload: {} }), { status: 200, reason: '' }, 'a stream that closed without a word is the same case');
  assert.equal(sessions.length, 3);
  a.close();
  // Both attempts failing: {0, error} after exactly two sessions, not a loop.
  const twice = fake({ error: true }, FROZEN);
  assert.deepEqual(await createApns(twice.opts).send({ tok: TOK, payload: {} }), { status: 0, reason: 'error' });
  assert.equal(twice.sessions.length, 2);
  assert.deepEqual(twice.infos, [{ e: 'apns.sent', ms: 0, cold: true, status: 0, kind: 'voip' }]);
  // Apple's refusal came over a live session: no retry, the session is kept.
  const no = fake({ status: 400, body: '{"reason":"BadDeviceToken"}' }, FROZEN);
  assert.deepEqual(await createApns(no.opts).send({ tok: TOK, payload: {} }), { status: 400, reason: 'BadDeviceToken' });
  assert.equal(no.sessions.length, 1);
  assert.equal(no.sessions[0].requests.length, 1);
  assert.equal(no.sessions[0].destroyed, false);
  assert.deepEqual(no.infos, [{ e: 'apns.sent', ms: 0, cold: false, status: 400, kind: 'voip' }], 'a refusal is worth a line');
});

test('kind alert: the headers of a "New message" banner (the app\'s topic without .voip, type alert, no collapse id, an hour to live) and the body as given; voip and no kind stay the VoIP push', async () => {
  const { sessions, infos, opts } = fake({ status: 200 }, FROZEN);
  const a = createApns(opts);
  const payload = { aps: { alert: 'New message', sound: 'default' } };
  assert.deepEqual(await a.send({ tok: TOK, payload, kind: 'alert' }), { status: 200, reason: '' });
  const { headers, body } = sessions[0].requests[0];
  assert.equal(headers[':path'], '/3/device/' + TOK);
  assert.equal(headers['apns-topic'], 'com.example');
  assert.equal(headers['apns-push-type'], 'alert');
  assert.equal(headers['apns-priority'], '10');
  assert.equal('apns-collapse-id' in headers, false, 'each message its own banner: a replaced one may not alert again');
  assert.equal(headers['apns-expiration'], String(1_700_000_000 + 3600));
  assert.equal(headers['content-type'], 'application/json');
  assert.equal(body, '{"aps":{"alert":"New message","sound":"default"}}');
  await a.send({ tok: TOK, payload: { w: 'x' }, kind: 'voip' });
  await a.send({ tok: TOK, payload: { w: 'x' } });
  for (const r of sessions[0].requests.slice(1)) {
    assert.equal(r.headers['apns-topic'], 'com.example.voip');
    assert.equal(r.headers['apns-push-type'], 'voip');
    assert.equal(r.headers['apns-expiration'], '0');
    assert.equal('apns-collapse-id' in r.headers, false);
  }
  assert.deepEqual(infos, [], 'warm and accepted: no line');
  a.close();
  // A refused alert is logged with its kind, so a topic or entitlement problem names the push it concerns.
  const no = fake({ status: 400, body: '{"reason":"TopicDisallowed"}' }, FROZEN);
  assert.deepEqual(await createApns(no.opts).send({ tok: TOK, payload, kind: 'alert' }), { status: 400, reason: 'TopicDisallowed' });
  assert.deepEqual(no.infos, [{ e: 'apns.sent', ms: 0, cold: false, status: 400, kind: 'alert' }]);
});

test('apns.sent is written for a cold, slow or refused push only: time, whether a session was opened, and the status', async () => {
  let t = 1_700_000_000_000, slow = false;
  const { infos, opts } = fake(() => { if (slow) t += 2500; return { status: 200 }; }, { now: () => t });
  const a = createApns(opts);
  await a.send({ tok: TOK, payload: {} });
  assert.deepEqual(infos, [], 'warm, at once, accepted: nothing');
  slow = true;
  await a.send({ tok: TOK, payload: {} });
  assert.deepEqual(infos, [{ e: 'apns.sent', ms: 2500, cold: false, status: 200, kind: 'voip' }], 'over two seconds is worth a line');
  slow = false;
  await a.send({ tok: TOK, payload: {} });
  assert.equal(infos.length, 1);
  a.close();
});

test('a send that times out destroys its session, so the next send opens a fresh one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let answer = null;
  const { sessions, infos, opts } = fake(() => answer);
  const a = createApns(opts);
  const stuck = a.send({ tok: TOK, payload: {} });
  t.mock.timers.tick(10_000);
  assert.deepEqual(await stuck, { status: 0, reason: 'error' });
  assert.equal(sessions[0].destroyed, true);
  assert.equal(sessions.length, 1, 'a timeout is not retried: by now the call is old');
  answer = { status: 200 };
  assert.deepEqual(await a.send({ tok: TOK, payload: {} }), { status: 200, reason: '' });
  assert.equal(sessions.length, 2);
  assert.deepEqual(infos.map((i) => [i.cold, i.status]), [[false, 0], [true, 200]]);
  a.close();
});

test('the idle session is pinged every five minutes, and one that does not answer the ping is dropped', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  const { sessions, opts } = fake({ status: 200 });
  const a = createApns(opts);
  t.mock.timers.tick(5 * 60_000);
  assert.equal(sessions[0].pings, 1);
  assert.equal(sessions[0].destroyed, false, 'answered in time');
  sessions[0].ack = false;
  t.mock.timers.tick(5 * 60_000);
  assert.equal(sessions[0].pings, 2);
  t.mock.timers.tick(10_000);
  assert.equal(sessions[0].destroyed, true, 'no answer in ten seconds');
  assert.deepEqual(await a.send({ tok: TOK, payload: {} }), { status: 200, reason: '' });
  assert.equal(sessions.length, 2, 'the next send got a fresh session');
  a.close();
  t.mock.timers.tick(10 * 60_000);
  assert.equal(sessions[1].pings, 0, 'close stops the pinging');
});

test('Apple\'s answer comes back as status and reason, and tokenDead names the ones that end a push address', async () => {
  const replies = [{ status: 410, body: '{"reason":"Unregistered"}' }, { status: 400, body: '{"reason":"BadDeviceToken"}' }, { status: 403, body: '{"reason":"ExpiredProviderToken"}' }, { status: 500, body: 'not json' }];
  const { opts } = fake(() => replies.shift());
  const a = createApns(opts);
  const gone = await a.send({ tok: TOK, payload: {} });
  assert.deepEqual(gone, { status: 410, reason: 'Unregistered' });
  assert.equal(tokenDead(gone.status, gone.reason), true);
  const bad = await a.send({ tok: TOK, payload: {} });
  assert.deepEqual(bad, { status: 400, reason: 'BadDeviceToken' });
  assert.equal(tokenDead(bad.status, bad.reason), true);
  const ours = await a.send({ tok: TOK, payload: {} });
  assert.deepEqual(ours, { status: 403, reason: 'ExpiredProviderToken' });
  assert.equal(tokenDead(ours.status, ours.reason), false, 'our token\'s fault, not the device\'s');
  assert.deepEqual(await a.send({ tok: TOK, payload: {} }), { status: 500, reason: '' }, 'a body that is not JSON gives no reason');
  assert.equal(tokenDead(200, ''), false);
  assert.equal(tokenDead(400, 'ExpiredToken'), true);
  assert.equal(tokenDead(0, 'error'), false);
});

test('a transport failure or a stuck request resolves {0, error}, never rejects', async (t) => {
  const { opts } = fake({ error: true });
  assert.deepEqual(await createApns(opts).send({ tok: TOK, payload: {} }), { status: 0, reason: 'error' });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stuck = createApns(fake(null).opts).send({ tok: TOK, payload: {} });
  t.mock.timers.tick(10_000);
  assert.deepEqual(await stuck, { status: 0, reason: 'error' });
});

test('without a key the sender is disabled: it answers "disabled" and never opens a connection, nor pings one', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  let connects = 0;
  const a = createApns({ connect: () => { connects++; }, log: { warn() {}, error() {} } });
  assert.equal(a.enabled, false);
  assert.deepEqual(await a.send({ tok: TOK, payload: { w: 'x' } }), { status: 0, reason: 'disabled' });
  t.mock.timers.tick(10 * 60_000);
  a.close();
  assert.equal(connects, 0);
  assert.equal(createApns().enabled, false);
});

test('a session that closes, errors or is told to go away is replaced on the next send', async () => {
  const { sessions, opts } = fake({ status: 200 });
  const a = createApns(opts);
  await a.send({ tok: TOK, payload: {} });
  sessions[0].emit('close');
  await a.send({ tok: TOK, payload: {} });
  assert.equal(sessions.length, 2, 'a new session after close');
  sessions[1].emit('error', new Error('ECONNRESET'));   // heard, so it does not bring the process down
  await a.send({ tok: TOK, payload: {} });
  assert.equal(sessions.length, 3, 'a new session after error');
  sessions[2].emit('goaway');
  await a.send({ tok: TOK, payload: {} });
  assert.equal(sessions.length, 4, 'a new session after goaway');
  await a.send({ tok: TOK, payload: {} });
  assert.equal(sessions.length, 4, 'and kept while it lives');
  a.close();
});

test('config: the three Apple settings go together, the key is read and parsed at start, the host and topic have defaults', () => {
  assert.deepEqual(parseApns({}), {});
  const o = parseApns({ HUSH_APNS_KEY: keyFile, HUSH_APNS_KEY_ID: 'ABCDEF1234', HUSH_APNS_TEAM_ID: 'TEAM123456' });
  assert.deepEqual(o, { keyFile, keyId: 'ABCDEF1234', teamId: 'TEAM123456', topic: 'com.hushappofficial.hush.voip', host: 'api.push.apple.com' });
  assert.equal(parseApns({ HUSH_APNS_KEY: keyFile, HUSH_APNS_KEY_ID: 'ABCDEF1234', HUSH_APNS_TEAM_ID: 'TEAM123456', HUSH_APNS_HOST: 'api.sandbox.push.apple.com', HUSH_APNS_TOPIC: 'com.example.voip' }).host, 'api.sandbox.push.apple.com');
  assert.throws(() => parseApns({ HUSH_APNS_KEY: keyFile }), /together/);
  assert.throws(() => parseApns({ HUSH_APNS_KEY_ID: 'ABCDEF1234', HUSH_APNS_TEAM_ID: 'TEAM123456' }), /together/);
  assert.throws(() => parseApns({ HUSH_APNS_KEY: keyFile, HUSH_APNS_KEY_ID: 'short', HUSH_APNS_TEAM_ID: 'TEAM123456' }), /HUSH_APNS_KEY_ID/);
  assert.throws(() => parseApns({ HUSH_APNS_KEY: join(dir, 'missing.p8'), HUSH_APNS_KEY_ID: 'ABCDEF1234', HUSH_APNS_TEAM_ID: 'TEAM123456' }), /cannot read/);
  const notKey = join(dir, 'notes.txt');
  writeFileSync(notKey, 'not a key');
  assert.throws(() => parseApns({ HUSH_APNS_KEY: notKey, HUSH_APNS_KEY_ID: 'ABCDEF1234', HUSH_APNS_TEAM_ID: 'TEAM123456' }), /not a private key/);
  const rsa = join(dir, 'rsa.pem');
  writeFileSync(rsa, generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ type: 'pkcs8', format: 'pem' }));
  assert.throws(() => parseApns({ HUSH_APNS_KEY: rsa, HUSH_APNS_KEY_ID: 'ABCDEF1234', HUSH_APNS_TEAM_ID: 'TEAM123456' }), /EC key/);
});
