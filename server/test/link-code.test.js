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
const { linkCode, parseLinkCode } = new Function('unb64u', src.slice(a, b) + '\nreturn { linkCode, parseLinkCode };')(unb64u);

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
