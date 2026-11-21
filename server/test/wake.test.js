// Call wake-ups (wake.js, POST /wake): a known ticket sends one VoIP push carrying a random mark and a per-push tag
// made from the ticket and the mark, every other ticket is silence, the caller is refused out loud only for a malformed
// request or a busy address, and Apple's "dead token" drops the address. A message ticket (kind m, release 65) sends one
// "New message" alert instead, through buckets of its own. From release 93 a phone also has a ring ceiling of its own,
// whichever call tickets ring it (red-team 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';

import { Wakes } from '../src/wake.js';
import { startServer, throwsCode, sleep } from './helpers.js';

const LIMITS = { wakePerMinPerTicket: 3, wakePerHourPerTicket: 20, wakePerMinPerDevice: 4, wakePerHourPerDevice: 30, wakePerHourPerAddr: 60, wakeBodyBytes: 256, msgPerMinPerTicket: 6, msgPerHourPerTicket: 60 };
const TK = 'tIcKeT0123456789abcdef';   // 22 base64url characters, like a minted ticket
const TK2 = 'uIcKeT0123456789abcdef';
const TKM = 'mIcKeT0123456789abcdef';  // a message ticket
const ROW = { h: 'bob', dev: 'devbobphone', k: 'c', tok: 'ab'.repeat(32), env: 'prod' };
const MROW = { h: 'bob', dev: 'devbobphone', k: 'm', tok: 'cd'.repeat(32), env: 'prod' };

// An APNs sender that records each push and answers as told.
function fakeApns(reply = { status: 200, reason: '' }) {
  const a = { enabled: true, sent: [], close() {}, send(x) { a.sent.push(x); return typeof reply === 'function' ? reply(x) : Promise.resolve(reply); } };
  return a;
}
// The store's two calls for POST /wake, over a fixed table of tickets.
function stubStore(tickets = { [TK]: ROW, [TKM]: MROW }) {
  const s = { dropped: [], wakeLookup: (tk) => tickets[tk] || null, pushDrop: (x) => s.dropped.push(x) };
  return s;
}
const wakes = (over = {}) => new Wakes({ store: stubStore(), apns: fakeApns(), limits: LIMITS, ...over });

// The tag the phone computes from its own copy of the ticket and the mark it was pushed (CONTRACT.md revision 2).
const tagOf = (tk, w) => createHmac('sha256', createHash('sha256').update('hush-wake-name').update(tk).digest()).update(w).digest('base64url').slice(0, 22);

test('a known ticket sends one push to its device, carrying a random mark and a tag made from the ticket and the mark, never the ticket', () => {
  const apns = fakeApns();
  const w = wakes({ apns });
  assert.equal(w.accept({ tk: TK, addrTag: 'a1' }), undefined, 'the caller learns nothing');
  assert.equal(apns.sent.length, 1);
  assert.equal(apns.sent[0].tok, ROW.tok);
  assert.equal(apns.sent[0].kind, 'voip');
  assert.deepEqual(Object.keys(apns.sent[0].payload), ['w', 't']);
  assert.match(apns.sent[0].payload.w, /^[A-Za-z0-9_-]{16}$/);
  assert.equal(apns.sent[0].payload.t, tagOf(TK, apns.sent[0].payload.w));
  assert.match(apns.sent[0].payload.t, /^[A-Za-z0-9_-]{22}$/);
  assert.ok(!JSON.stringify(apns.sent[0]).includes(TK), 'the ticket itself is a bearer token and stays here');
  w.accept({ tk: TK, addrTag: 'a1' });
  assert.notEqual(apns.sent[1].payload.w, apns.sent[0].payload.w, 'a fresh mark every time');
  assert.notEqual(apns.sent[1].payload.t, apns.sent[0].payload.t, 'and a fresh tag: nothing stable for Apple to see');
  assert.equal(apns.sent[1].payload.t, tagOf(TK, apns.sent[1].payload.w), 'yet the phone can still match it');
});

test('an unknown ticket sends nothing and does not throw; a malformed one is refused as invalid', () => {
  const apns = fakeApns();
  const w = wakes({ apns });
  w.accept({ tk: TK2, addrTag: 'a1' });
  assert.equal(apns.sent.length, 0);
  for (const bad of [undefined, null, 7, '', 'short', TK.slice(1), TK + 'x', TK.slice(0, 21) + '!', { tk: TK }]) throwsCode(() => w.accept({ tk: bad, addrTag: 'a1' }), 'invalid');
  assert.equal(apns.sent.length, 0);
});

test('limits: the per-ticket minute and hour allowances end in silence, the address allowance out loud', () => {
  let t = 1_700_000_000_000;
  const apns = fakeApns();
  const w = wakes({ apns, now: () => t });
  for (let k = 0; k < 3; k++) w.accept({ tk: TK, addrTag: 'a' + k });
  w.accept({ tk: TK, addrTag: 'a9' });
  assert.equal(apns.sent.length, 3, 'the fourth ring in a minute goes nowhere, and nobody is told');
  t += 61_000;
  w.accept({ tk: TK, addrTag: 'a9' });
  assert.equal(apns.sent.length, 4, 'a minute later it rings again');
  // The hour: 20 for one ticket, whoever asks and however spread over the hour's minutes.
  const hourly = fakeApns();
  const h = new Wakes({ store: stubStore(), apns: hourly, limits: { ...LIMITS, wakePerMinPerTicket: 100, wakePerMinPerDevice: 100 }, now: () => t });   // the phone's minute raised too; its hour (30) is above the ticket's
  for (let k = 0; k < 25; k++) h.accept({ tk: TK, addrTag: 'b' + k });
  assert.equal(hourly.sent.length, 20);
  // The address: refused with ratelimit, and an unknown ticket costs the address a token like a known one.
  const addr = fakeApns();
  const a = new Wakes({ store: stubStore(), apns: addr, limits: { ...LIMITS, wakePerHourPerAddr: 3 }, now: () => t });
  a.accept({ tk: TK, addrTag: 'c' });
  a.accept({ tk: TK2, addrTag: 'c' });
  a.accept({ tk: TK, addrTag: 'c' });
  throwsCode(() => a.accept({ tk: TK, addrTag: 'c' }), 'ratelimit');
  assert.equal(addr.sent.length, 2);
  a.accept({ tk: TK, addrTag: 'd' });
  assert.equal(addr.sent.length, 3, 'another address is not affected');
  throwsCode(() => a.accept({ tk: 'bad', addrTag: 'd' }), 'invalid');
  assert.equal(a.addr.tokensLeft('d', t), 2, 'a malformed request is refused before it costs a token');
  // The hourly sweep forgets idle buckets.
  a.prune(t + 2 * 3600_000);
  assert.equal(a.addr.size + a.minute.size + a.hour.size, 0);
});

test('Apple saying the device token is dead drops the push address once; other answers and failures change nothing', async () => {
  const dead = stubStore();
  wakes({ store: dead, apns: fakeApns({ status: 410, reason: 'Unregistered' }) }).accept({ tk: TK, addrTag: 'a' });
  await sleep(0);
  assert.deepEqual(dead.dropped, [{ h: ROW.h, dev: ROW.dev, k: 'c' }]);
  const bad = stubStore();
  wakes({ store: bad, apns: fakeApns({ status: 400, reason: 'BadDeviceToken' }) }).accept({ tk: TK, addrTag: 'a' });
  await sleep(0);
  assert.equal(bad.dropped.length, 1);
  const fine = stubStore();
  const w = wakes({ store: fine, apns: fakeApns(() => Promise.resolve({ status: 200, reason: '' })) });
  w.accept({ tk: TK, addrTag: 'a' });
  wakes({ store: fine, apns: fakeApns({ status: 0, reason: 'error' }) }).accept({ tk: TK, addrTag: 'a' });
  wakes({ store: fine, apns: fakeApns({ status: 0, reason: 'disabled' }) }).accept({ tk: TK, addrTag: 'a' });
  // A sender that rejects, or a store that throws on the drop: swallowed, the request path never sees it.
  const quiet = { error() {}, warn() {} };
  wakes({ store: fine, apns: fakeApns(() => Promise.reject(new Error('boom'))), log: quiet }).accept({ tk: TK, addrTag: 'a' });
  const throwing = { ...stubStore(), pushDrop() { throw new Error('locked'); } };
  wakes({ store: throwing, apns: fakeApns({ status: 410, reason: 'Unregistered' }), log: quiet }).accept({ tk: TK, addrTag: 'a' });
  await sleep(10);
  assert.equal(fine.dropped.length, 0);
});

test('a message ticket (kind m) sends one "New message" alert to its device, the same every time, with nothing about who wrote or what', () => {
  const apns = fakeApns();
  const w = wakes({ apns });
  assert.equal(w.accept({ tk: TKM, addrTag: 'a1' }), undefined);
  assert.deepEqual(apns.sent, [{ tok: MROW.tok, payload: { aps: { alert: 'New message', sound: 'default' } }, kind: 'alert' }]);
  assert.equal(JSON.stringify(apns.sent[0].payload), '{"aps":{"alert":"New message","sound":"default"}}', 'the body Apple gets, byte for byte');
  assert.ok(!JSON.stringify(apns.sent[0]).includes(TKM), 'the ticket stays here');
  w.accept({ tk: TKM, addrTag: 'a1' });
  assert.deepEqual(apns.sent[1], apns.sent[0], 'nothing tells one message from the next');
  // A device without an alert token: the store finds no row (wakeLookup is null) and the nudge is silence, like an unknown ticket.
  const none = fakeApns();
  wakes({ store: stubStore({ [TK]: ROW }), apns: none }).accept({ tk: TKM, addrTag: 'a1' });
  assert.equal(none.sent.length, 0);
});

test('message tickets have per-ticket allowances of their own (6 a minute and 60 an hour), so a chatty contact never silences calls; the address bucket is one for every kind', () => {
  let t = 1_700_000_000_000;
  const apns = fakeApns();
  const w = wakes({ apns, now: () => t });
  for (let k = 0; k < 7; k++) w.accept({ tk: TKM, addrTag: 'a' });
  assert.equal(apns.sent.length, 6, 'the seventh nudge in a minute goes nowhere');
  w.accept({ tk: TK, addrTag: 'a' });
  assert.equal(apns.sent.length, 7, 'and the call ticket still rings: its minute bucket is untouched');
  assert.equal(w.addr.tokensLeft('a', t), LIMITS.wakePerHourPerAddr - 8, 'every request, nudge or ring, spends the one address allowance');
  t += 61_000;
  w.accept({ tk: TKM, addrTag: 'a' });
  assert.equal(apns.sent.length, 8, 'a minute later it nudges again');
  // The hour: 60 for one message ticket, whoever asks.
  const hourly = fakeApns();
  const h = new Wakes({ store: stubStore(), apns: hourly, limits: { ...LIMITS, msgPerMinPerTicket: 100 }, now: () => t });
  for (let k = 0; k < 65; k++) h.accept({ tk: TKM, addrTag: 'b' + k });
  assert.equal(hourly.sent.length, 60);
  // The address: one bucket for every kind, spent before the ticket is read, so the refusal said out loud tells nothing
  // about a ticket: a live message ticket, a call ticket and an unknown one are refused alike once it is empty.
  const addr = fakeApns();
  const a = new Wakes({ store: stubStore(), apns: addr, limits: { ...LIMITS, wakePerHourPerAddr: 3, msgPerMinPerTicket: 100 }, now: () => t });
  a.accept({ tk: TKM, addrTag: 'c' }); a.accept({ tk: TKM, addrTag: 'c' }); a.accept({ tk: TK, addrTag: 'c' });
  assert.equal(addr.sent.length, 3);
  throwsCode(() => a.accept({ tk: TKM, addrTag: 'c' }), 'ratelimit');
  throwsCode(() => a.accept({ tk: TK2, addrTag: 'c' }), 'ratelimit');
  // An unknown ticket spends the call buckets, as every ticket did before this kind existed.
  a.accept({ tk: TK2, addrTag: 'd' });
  assert.equal(a.addr.tokensLeft('d', t), 3 - 1);
  assert.equal(a.minute.tokensLeft(TK2, t), LIMITS.wakePerMinPerTicket - 1);
  a.prune(t + 2 * 3600_000);
  assert.equal(a.msgMinute.size + a.msgHour.size, 0, 'the hourly sweep forgets these too');
});

test('Apple saying a token is dead drops the row of that kind alone: the alert address for a message ticket, the VoIP address for a call ticket', async () => {
  const dead = stubStore();
  const w = wakes({ store: dead, apns: fakeApns({ status: 410, reason: 'Unregistered' }) });
  w.accept({ tk: TKM, addrTag: 'a' });
  w.accept({ tk: TK, addrTag: 'a' });
  await sleep(0);
  assert.deepEqual(dead.dropped, [{ h: 'bob', dev: 'devbobphone', k: 'm' }, { h: 'bob', dev: 'devbobphone', k: 'c' }]);
});

test('a phone rings at most 4 times a minute and 30 an hour, whichever call tickets ring it: ten tickets for one phone, rung from ten addresses, ring it 4 times in the first minute, not 30, and at most 60 times in the first hour, not 390; each refusal is silence, like the per-ticket ones', () => {
  let t = 1_700_000_000_000;
  const tks = Array.from({ length: 10 }, (_, i) => 'p' + i + 'IcKeT0123456789abcde'), apns = fakeApns();
  const w = wakes({ store: stubStore(Object.fromEntries(tks.map((tk) => [tk, ROW]))), apns, now: () => t });
  // Ten tickets for bob's phone in one hand (from several accounts he accepted, say): each rung five times in the first
  // minute, then once a minute, each from an address of its own.
  for (let r = 0; r < 5; r++) tks.forEach((tk, i) => assert.equal(w.accept({ tk, addrTag: 'a' + i }), undefined, 'the caller learns nothing'));
  const first = apns.sent.length;
  for (let m = 1; m < 60; m++) { t += 60_000; tks.forEach((tk, i) => assert.equal(w.accept({ tk, addrTag: 'a' + i }), undefined)); }
  assert.ok(first === 4 && apns.sent.length <= 60, `4 rings in the first minute and at most 60 in the first hour (the phone's 30 and the hour's refill), where each ticket alone allows 3 and 39: ${first} and ${apns.sent.length}`);
  assert.ok(apns.sent.every((x) => x.tok === ROW.tok && x.kind === 'voip'));
  assert.equal(w.devMinute.size + w.devHour.size, 2, 'one phone, one bucket of each');
  w.prune(t + 2 * 3600_000);
  assert.equal(w.devMinute.size + w.devHour.size, 0, 'the hourly sweep forgets them with the rest');
});

test('the phone\'s ceiling counts call rings alone, after each ticket\'s own allowance: its fifth ring in a minute is silence, yet one contact\'s ticket, rung as hard as it may be, still gets its full 3 a minute and 39 in its first hour and never silences the phone\'s other tickets; another phone, message nudges and unknown tickets cost it nothing', () => {
  let t = 1_700_000_000_000;
  const TK3 = 'vIcKeT0123456789abcdef', TKI = 'iIcKeT0123456789abcdef', IPAD = { ...ROW, dev: 'devbobipad1', tok: 'ef'.repeat(32) };
  const apns = fakeApns(), rings = (tok = ROW.tok) => apns.sent.filter((x) => x.tok === tok).length;
  const w = wakes({ store: stubStore({ [TK]: ROW, [TK2]: ROW, [TK3]: ROW, [TKI]: IPAD, [TKM]: MROW }), apns, now: () => t });
  for (let k = 0; k < 3; k++) w.accept({ tk: TK, addrTag: 'a' + k });
  w.accept({ tk: TK2, addrTag: 'b' });
  assert.equal(rings(), 4, 'one contact\'s ticket rings its 3, and another ticket of the phone still rings after it');
  w.accept({ tk: TK3, addrTag: 'c' });
  assert.equal(rings(), 4, 'the phone\'s fifth ring in the minute goes nowhere, and nobody is told');
  w.accept({ tk: TKI, addrTag: 'c' });
  assert.equal(rings(IPAD.tok), 1, 'bob\'s iPad is a phone of its own');
  for (let k = 0; k < 6; k++) w.accept({ tk: TKM, addrTag: 'd' });
  assert.equal(rings(MROW.tok), 6, 'message nudges keep their own allowance, whatever the phone\'s calls');
  for (let k = 0; k < 10; k++) w.accept({ tk: 'x' + k + 'IcKeT0123456789abcde', addrTag: 'e' + k });
  assert.equal(apns.sent.length, 4 + 1 + 6, 'an unknown ticket wakes nobody');
  assert.deepEqual([w.devMinute.tokensLeft('bob|devbobphone', t), w.devHour.tokensLeft('bob|devbobphone', t)], [0, 30 - 4],
    'the four rings spent the phone\'s minute and 4 of its hour; the refused fifth, the nudges and the unknown tickets nothing');
  // An hour of one contact's ticket rung ten times a minute, as a modified app may: its own allowance gets through, as
  // before, and another ticket of the phone rings every ten minutes in between.
  const a2 = fakeApns(), w2 = wakes({ store: stubStore({ [TK]: ROW, [TK2]: ROW }), apns: a2, now: () => t });
  for (let m = 0; m < 60; m++) {
    for (let k = 0; k < 10; k++) w2.accept({ tk: TK, addrTag: 'h' + k });
    if (m % 10 === 0) { const n = a2.sent.length; w2.accept({ tk: TK2, addrTag: 'f' + m }); assert.equal(a2.sent.length, n + 1, 'another ticket of the phone rings, minute ' + m); }
    t += 60_000;
  }
  assert.equal(a2.sent.filter((x) => x.payload.t === tagOf(TK, x.payload.w)).length, 39, 'the contact\'s own ticket: 3 a minute and 20 an hour, 39 in the first hour, as before');
});

test('POST /wake: 204 and no body for any well-formed ticket, 400 for a bad one, 413 when too long, CORS preflight, POST only', async () => {
  const apns = fakeApns();
  const S = await startServer({ apns });
  const post = (body, headers = {}) => fetch(S.httpUrl + '/wake', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body });
  try {
    const r = await post(JSON.stringify({ tk: TK }), { origin: 'https://app.example' });
    assert.equal(r.status, 204);
    assert.equal(await r.text(), '');
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://app.example');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(apns.sent.length, 0, 'an unknown ticket wakes nobody, and the answer is the same');
    assert.equal((await post(JSON.stringify({ tk: 'short' }))).status, 400);
    assert.equal((await post(JSON.stringify({ tk: 42 }))).status, 400);
    assert.equal((await post('{not json')).status, 400);
    assert.equal((await post('null')).status, 400);
    const big = await post(JSON.stringify({ tk: TK, pad: 'x'.repeat(300) }));
    assert.equal(big.status, 413);
    assert.equal((await big.json()).e, 'toolarge');
    const o = await fetch(S.httpUrl + '/wake', { method: 'OPTIONS', headers: { origin: 'https://app.example', 'access-control-request-method': 'POST' } });
    assert.equal(o.status, 204);
    assert.equal(o.headers.get('access-control-allow-origin'), 'https://app.example');
    assert.equal(o.headers.get('access-control-allow-methods'), 'POST');
    const g = await fetch(S.httpUrl + '/wake');
    assert.equal(g.status, 405);
    assert.equal((await g.json()).m, 'POST only');
  } finally { await S.stop(); }
});
