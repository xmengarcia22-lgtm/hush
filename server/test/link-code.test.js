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
const { linkCode, parseLinkCode, linkFp, devShort, linkConfirm, linkQr5, parseLinkQr5 } = new Function('unb64u', 'enc', 'b64u', src.slice(a, b) + '\nreturn { linkCode, parseLinkCode, linkFp, devShort, linkConfirm, linkQr5, parseLinkQr5 };')(unb64u, new TextEncoder(), b64u);

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

// ---- release 58: the code the NEW device shows (version 5), a QR only ----

test('the version 5 QR carries the secret and the first half of the fingerprint, and reads back to exactly them', async () => {
  for (let n = 0; n < 100; n++) {
    const { secret, fp } = fresh(), qr = linkQr5(secret, fp), got = parseLinkQr5(qr);
    assert.match(qr, /^hush-link:5:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]{22}$/);
    assert.ok(got, qr);
    assert.deepEqual([...got.secret], [...secret]);
    assert.deepEqual([...got.fp], [...unb64u(fp).slice(0, 16)]);
  }
  const fp = await linkFp(PUB, DEVK), qr = linkQr5(new Uint8Array(16), fp);
  assert.deepEqual([...parseLinkQr5(qr).fp], [...unb64u(fp).slice(0, 16)], 'the real fingerprint, cut the same way the scanning side cuts it');
});

test('a version 5 QR of the wrong shape is refused, and the other codes stay what they were', () => {
  const { secret, fp } = fresh(), qr = linkQr5(secret, fp), [, , s, f] = qr.split(':');
  assert.ok(parseLinkQr5(' ' + qr + '\n'), 'surrounding whitespace is fine');
  assert.equal(parseLinkQr5('hush-link:5:' + s.slice(1) + ':' + f), null, 'a short secret');
  assert.equal(parseLinkQr5('hush-link:5:' + s + 'A:' + f), null, 'a long secret');
  assert.equal(parseLinkQr5('hush-link:5:' + s + ':' + f.slice(1)), null, 'a short fingerprint');
  assert.equal(parseLinkQr5('hush-link:5:' + s + ':' + f + ':' + f), null, 'a third part');
  assert.equal(parseLinkQr5('hush-link:5:' + s), null, 'no fingerprint');
  assert.equal(parseLinkQr5('hush-link:4:' + s), null, 'the code a signed-in device shows is not one');
  assert.equal(parseLinkQr5('hush-link:5:' + s.replace(/./, '+') + ':' + f), null, 'not base64url');
  assert.equal(parseLinkQr5(''), null); assert.equal(parseLinkQr5(undefined), null);
  assert.equal(parseLinkCode(qr, 4), null, 'nor is the QR a typed code');
  const v4 = linkCode(secret, null, 4);
  assert.deepEqual([...parseLinkCode(v4, 4).secret], [...secret], 'version 4 still reads');
  assert.deepEqual([...parseLinkCode(linkCode(secret, fp)).secret], [...secret], 'and version 3');
});

test('the scanning side lets the new device in only after the ask is fresh, unanswered and carries the keys the code fingerprints', () => {
  const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  const a = ui.indexOf('async function approveAsk('), b = ui.indexOf('function linkedDev(', a);
  assert.ok(a > 0 && b > a, 'approveAsk in app/ui.js');
  const fn = ui.slice(a, b), at = (s) => { const i = fn.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at("d.state!=='ask'") < at('approveLink('), 'the state is checked first');
  assert.ok(at('S.db.now()-d.ts<5*60e3') < at('approveLink('), 'and the age, by the server clock both sides stamp');
  assert.ok(at('linkFp(d.pub,d.devk)') < at('approveLink(') && at("throw new Error('swapped')") < at('approveLink('), 'and the fingerprint over both keys');
  assert.ok(!/update\(|\.set\(/.test(fn.slice(0, fn.indexOf('approveLink('))), 'nothing is written before the checks pass');
  const o = ui.indexOf('function openLinkScanner('), oe = ui.indexOf('async function approveAsk(', o);
  assert.ok(!/Let it in|yes\.onclick/.test(ui.slice(o, oe)), 'no question is asked after the scan: the scan is the approval');
});

// ---- release 58: the new device takes the answer only from the account it asked for ----
// Whoever photographs the new device's code can answer it first from an account of their own. awaitLink (app/ui.js) runs
// with real keys here, against a stand-in row: an answer from another account is refused before any of it is kept.
test('awaitLink refuses an answer from another account before anything of it is kept, and takes the account asked for', async () => {
  const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  const lift = (s, from, to) => { const a = s.indexOf(from), b = s.indexOf(to, a); assert.ok(a > 0 && b > a, from); return s.slice(a, b); };
  const kept = [], ls = { get: (k, d) => d, set: (k) => kept.push(k) }, idFromBundle = (o) => ({ handle: o.handle, name: o.name });
  const { awaitLink, linkKey } = new Function('unb64u', 'b64u', 'enc', 'dec', 'ls', 'S', 'idFromBundle', 'scheduleBackup',
    lift(src, 'async function linkKey(', 'const ephemeral=') + lift(ui, 'function awaitLink(', '/* ---------- device removal') + 'return { awaitLink, linkKey };')(unb64u, b64u, new TextEncoder(), new TextDecoder(), ls, {}, idFromBundle, () => {});
  const ecdh = { name: 'ECDH', namedCurve: 'P-256' }, secret = new Uint8Array(randomBytes(16));
  const e = await crypto.subtle.generateKey(ecdh, true, ['deriveBits']), a = await crypto.subtle.generateKey(ecdh, true, ['deriveBits']);
  const jwk = async (k) => { const j = await crypto.subtle.exportKey('jwk', k.publicKey); return { kty: j.kty, crv: j.crv, x: j.x, y: j.y }; };
  const answer = async (handle) => {   // what approveLink writes: the account bundle sealed to the ask's one-time key and the secret
    const key = await linkKey(a.privateKey, await jwk(e), secret), iv = new Uint8Array(randomBytes(12)), enc = new TextEncoder();
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('hush-link-v2') }, key,
      enc.encode(JSON.stringify({ v: 2, b: { handle, name: handle.toUpperCase() }, d: { by: 'dev0000009', s: 'sig' }, ks: { c000000000001: { 0: 'k' } }, trust: ['dev0000009'] }))));
    let gone = 0; const row = { state: 'ok', h: handle, epub: await jwk(a), iv: b64u(iv), ct: b64u(ct) };
    return { ref: { get: async () => ({ exists: true, data: () => row }), delete: async () => { gone++; } }, gone: () => gone };
  };
  const dv = { id: 'dev0000001' }, wrong = await answer('mallory');
  await assert.rejects(awaitLink(wrong.ref, e, secret, dv, async (id) => id.handle === 'alice').done, (err) => err.message === 'other' && err.handle === 'mallory');
  assert.equal(wrong.gone(), 1, 'the row is cleared');
  assert.deepEqual(kept, [], 'nothing of the other account was kept');
  assert.deepEqual(dv, { id: 'dev0000001' }, 'the device key was not signed over to it');
  const right = await answer('alice'), id = await awaitLink(right.ref, e, secret, dv, async (x) => x.handle === 'alice').done;
  assert.equal(id.handle, 'alice'); assert.equal(id.dev, dv); assert.equal(dv.by, 'dev0000009'); assert.deepEqual(id.trust, ['dev0000009']);
  assert.deepEqual(kept, ['hush:ks:alice'], 'its chat keys are kept, under its name');
  const asked = [], bob = await answer('bob');
  assert.equal((await awaitLink(bob.ref, e, secret, { id: 'dev0000002' }, async (x) => { asked.push(x.handle); return true; }).done).handle, 'bob', 'with no username typed the device asks, and a yes opens');
  assert.deepEqual(asked, ['bob']);
  assert.equal((await awaitLink(bob.ref, e, secret, { id: 'dev0000003' }).done).handle, 'bob', 'the forward flow passes no check and is as before');
});
