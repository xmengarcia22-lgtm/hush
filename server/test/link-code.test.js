// The typed form of the new-device QR code (app/crypto.js, HUSH LINKCODE block): a person with no camera on the
// approving device types or pastes it instead. It has to carry the same secret and the same key fingerprint as the QR,
// survive the ways people copy and retype, and refuse anything that was copied wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

const src = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
const a = src.indexOf('/* ===== HUSH LINKCODE BEGIN ===== */'), b = src.indexOf('/* ===== HUSH LINKCODE END ===== */');
assert.ok(a > 0 && b > a, 'link-code markers present in app/crypto.js');
const unb64u = (s) => new Uint8Array(Buffer.from(s, 'base64url'));
const b64u = (u) => Buffer.from(u).toString('base64url');
const { linkCode, parseLinkCode, linkFp, devShort, linkConfirm } = new Function('unb64u', 'enc', 'b64u', src.slice(a, b) + '\nreturn { linkCode, parseLinkCode, linkFp, devShort, linkConfirm };')(unb64u, new TextEncoder(), b64u);

const fresh = () => ({ secret: new Uint8Array(randomBytes(16)), fp: randomBytes(32).toString('base64url') });

test('a code round-trips to the same secret and the first half of the fingerprint', () => {
  for (let n = 0; n < 200; n++) {
    const { secret, fp } = fresh(), code = linkCode(secret, fp), got = parseLinkCode(code);
    assert.ok(got, code);
    assert.deepEqual([...got.secret], [...secret]);
    assert.deepEqual([...got.fp], [...unb64u(fp).slice(0, 16)]);
  }
});

test('it is nine groups of six from an alphabet without look-alikes', () => {
  const code = linkCode(...Object.values(fresh()));
  assert.match(code, /^([0-9A-HJKMNP-TV-Z]{6}-){8}[0-9A-HJKMNP-TV-Z]{6}$/);
});

test('case, spaces, dashes and look-alike letters do not matter', () => {
  let code;
  do code = linkCode(...Object.values(fresh())); while (!/0/.test(code) || !/1/.test(code));   // one with both look-alike digits in it
  const want = parseLinkCode(code);
  const sloppy = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o').replace(/1/g, 'l') + '\n';
  assert.deepEqual(parseLinkCode(sloppy), want);
  assert.deepEqual(parseLinkCode(code.replace(/-/g, '')), want);
});

test('a code copied wrong is refused, not guessed at', () => {
  const code = linkCode(...Object.values(fresh())), plain = code.replace(/-/g, '');
  assert.equal(parseLinkCode(''), null);
  assert.equal(parseLinkCode(plain.slice(0, -1)), null, 'too short');
  assert.equal(parseLinkCode(plain + '0'), null, 'too long');
  assert.equal(parseLinkCode(plain.slice(0, 10) + 'U' + plain.slice(11)), null, 'a letter outside the alphabet');
  for (let i = 0; i < plain.length; i++) {      // every single mistyped symbol is caught by the check symbols
    const c = plain[i], d = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'.replace(c, '')[0];
    assert.equal(parseLinkCode(plain.slice(0, i) + d + plain.slice(i + 1)), null, 'symbol ' + i);
  }
  const swapped = plain.slice(0, 4) + plain[5] + plain[4] + plain.slice(6);
  if (plain[4] !== plain[5]) assert.equal(parseLinkCode(swapped), null, 'two neighbours swapped');
});

test('the QR text is not a typed code, and two requests never share one', () => {
  assert.equal(parseLinkCode('hush-link:2:' + 'A'.repeat(22) + ':' + 'B'.repeat(43)), null);
  const x = fresh(), y = fresh();
  assert.notEqual(linkCode(x.secret, x.fp), linkCode(y.secret, y.fp));
});

// ---- release 9: the code covers the new device's own key as well ----

const PUB = { x: 'p'.repeat(43), y: 'q'.repeat(43) };
const DEVK = { id: 'dev0000001', x: 'a'.repeat(43), y: 'b'.repeat(43), sx: 'c'.repeat(43), sy: 'd'.repeat(43) };

test('the fingerprint covers the device key: swapping any part of it, or the one-time key, changes it', async () => {
  const base = await linkFp(PUB, DEVK);
  assert.equal(await linkFp(PUB, { ...DEVK }), base, 'the same keys give the same fingerprint');
  for (const f of ['id', 'x', 'y', 'sx', 'sy']) assert.notEqual(await linkFp(PUB, { ...DEVK, [f]: DEVK[f].replace(/.$/, 'Z') }), base, 'device key field ' + f);
  assert.notEqual(await linkFp({ ...PUB, x: 'r'.repeat(43) }, DEVK), base, 'the one-time key');
  assert.notEqual(await linkFp(PUB, undefined), base, 'a request whose device key was stripped');
  assert.match(base, /^[A-Za-z0-9_-]{43}$/);
});

test('codes from before the device key was covered are told apart and refused as version 3', () => {
  const secret = new Uint8Array(16).map((_, i) => i * 7 + 3), fp = Buffer.alloc(32, 0x5a).toString('base64url');
  const v3 = linkCode(secret, fp), v2 = linkCode(secret, fp, 2);
  assert.notEqual(v3, v2, 'only the check symbols differ');
  assert.equal(v3.slice(0, 55), v2.slice(0, 55), 'the secret and fingerprint symbols are the same');
  assert.ok(parseLinkCode(v3), 'a current code reads');
  assert.equal(parseLinkCode(v2), null, 'an old code does not read as current');
  assert.ok(parseLinkCode(v2, 2), 'but is recognised as an old one, so the page can say so');
  assert.equal(parseLinkCode(v3, 2), null);
});

test('the device key is shown as sixteen symbols (80 bits), the same on both devices, different for another key', async () => {
  const k = await devShort(DEVK);
  assert.match(k, /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  // the first eight symbols are what release 23 showed for the same key: the 40-bit prefix of the same hash
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('hush-dev-short-v1|' + [DEVK.id, DEVK.x, DEVK.y, DEVK.sx, DEVK.sy].join('|'))));
  const bits = [...h.slice(0, 10)].map(b => b.toString(2).padStart(8, '0')).join('');
  assert.equal(k.replace(/-/g, ''), bits.match(/.{5}/g).map(x => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[parseInt(x, 2)]).join(''));
  assert.equal(await devShort({ ...DEVK }), k);
  assert.notEqual(await devShort({ ...DEVK, sx: 'e'.repeat(43) }), k);
});

// ---- release 11: the new device's proof for a code shown by the other device ----

test('the proof is bound to the request, its fingerprint and what it is for', async () => {
  const { createHmac } = await import('node:crypto');
  const secret = new Uint8Array(16).map((_, i) => 200 - i), tag = 'T'.repeat(43), ts = 1791600000000, fp = Buffer.alloc(32, 7).toString('base64url');
  const cf = await linkConfirm(secret, tag, ts, fp);
  assert.match(cf, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await linkConfirm(secret, tag, ts, fp), cf, 'the same request gives the same proof');
  assert.notEqual(await linkConfirm(secret, 'U'.repeat(43), ts, fp), cf, 'another request address');
  assert.notEqual(await linkConfirm(secret, tag, ts + 1, fp), cf, 'a newer request at the same address');
  assert.notEqual(await linkConfirm(secret, tag, ts, Buffer.alloc(32, 8).toString('base64url')), cf, 'other keys');
  assert.notEqual(await linkConfirm(new Uint8Array(16), tag, ts, fp), cf, 'another secret');
  const unlabelled = createHmac('sha256', Buffer.from(secret)).update(tag + '|' + ts + '|' + fp).digest('base64url');
  assert.notEqual(unlabelled, cf, 'the label is part of it, so the same HMAC can’t stand for anything else');
  assert.equal(createHmac('sha256', Buffer.from(secret)).update('hush-link-confirm-v3|' + tag + '|' + ts + '|' + fp).digest('base64url'), cf, 'it is exactly the labelled HMAC');
});
