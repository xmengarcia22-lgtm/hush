// Guards the app page itself: every file it loads is pinned to its current bytes, the policy allows the local
// server and nothing from Google, no Firebase is left, and the page's script files load in the order their
// shared scope needs with nothing but declarations before the last one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { pinStatus, updatePins } from '../scripts/csp-hash.mjs';
import { appFiles, appSource } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const html = readFileSync(ROOT + 'index.html', 'utf8');
const LOADS = ['app/styles.css', 'vendor/qrcode.min.js', 'app/config.js', 'app/crypto.js', 'app/adapter.js', 'app/ui.js'];

test('every script and stylesheet the page loads is pinned to its current bytes', () => {
  const s = pinStatus(html, ROOT);
  assert.equal(s.current, true, `stale: ${s.stale.join(', ')}; run "npm run csp"`);
  assert.deepEqual(s.pins.map((p) => p.path), LOADS);
  assert.equal(s.inline.length, 0, 'no inline script is left in the page');
});

test('the policy allows the local server and nothing from Google', () => {
  const meta = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)[1];
  assert.ok(!/googleapis|firebaseapp|firebase/.test(meta));
  assert.match(meta, /script-src 'self';/, 'scripts come only from the page\'s own origin, each pinned by its integrity attribute');
  assert.match(meta, /connect-src 'self' data: blob: ws:\/\/127\.0\.0\.1:8080 http:\/\/127\.0\.0\.1:8080 wss:\/\/hushappofficial\.com;/, 'the socket, the same address for POST /drop when the page is opened at another origin, and the production socket named for browsers whose \'self\' does not cover it');
  assert.ok(!/frame-src/.test(meta));
});

test('the Firebase libraries are no longer loaded', () => {
  assert.ok(!/<script[^>]*firebase/.test(html));
  assert.ok(!/firebase\.initializeApp|firebase\.auth\(|firebase\.firestore\(/.test(html + appSource()));
});

// Top-level statements of a script file: lines at column 0 that are not continuations, closings or comments.
function topLevel(src) {
  const out = []; let inComment = false;
  for (const l of src.split('\n')) {
    if (inComment) { if (l.includes('*/')) inComment = false; continue; }
    if (l.startsWith('/*') && !l.includes('*/')) { inComment = true; continue; }
    if (l === '' || /^[\s})\]]|^\/[*/]/.test(l)) continue;
    out.push(l);
  }
  return out;
}
const DECLARATION = [
  /^(async )?function\b/, /^const \w+ ?= ?\{$/,
  /^const \w+=(async)?\s*(\([^)]*\)|\w+)=>/,                                   // an arrow function
  /^const \w+=new (Map|Set)\(\)(,\w+=new (Map|Set)\(\))?;/,                   // empty maps and sets
  /^const \w+=new Set\(\('/, /^const enc=new TextEncoder\(\),dec=new TextDecoder\(\);$/,
  /^const \w+=(\d|null|'|\{|\[|\/)/,                                         // a literal or a regex
  /^let \w+=(null|''|0|false)/,
];

test('the page\'s files load in the order their shared scope needs, and nothing before ui.js runs code at load', () => {
  assert.deepEqual(appFiles(), ['app/config.js', 'app/crypto.js', 'app/adapter.js', 'app/ui.js']);
  const src = (f) => readFileSync(ROOT + f, 'utf8');
  assert.match(src('app/config.js'), /^const HUSH_CONFIG = \{/m);
  assert.match(src('app/crypto.js'), /^async function newIdentity\(/m);
  assert.match(src('app/adapter.js'), /HUSH ADAPTER BEGIN/);
  assert.match(src('app/ui.js'), /HUSH INBOX RULE BEGIN/);
  assert.match(src('app/ui.js'), /^\(async\(\)=>\{$/m, 'the boot stays at the end of ui.js');
  // The split of one script into several keeps behaviour only while the files loaded first merely declare things:
  // a statement that ran code at load time could reach for a name ui.js has not declared yet.
  for (const f of ['app/config.js', 'app/crypto.js', 'app/adapter.js']) {
    const bad = topLevel(src(f)).filter((l) => !DECLARATION.some((re) => re.test(l)));
    assert.deepEqual(bad, [], f + ' runs code at load time');
  }
  // One scope, one declaration per name: the same name twice across files would refuse to load.
  const names = new Map();
  for (const f of appFiles()) for (const l of topLevel(src(f))) {
    const m = /^(?:const|let|(?:async )?function) ([A-Za-z_$][\w$]*)/.exec(l);
    if (!m) continue;
    assert.ok(!names.has(m[1]), `${m[1]} is declared in both ${names.get(m[1])} and ${f}`);
    names.set(m[1], f);
  }
});

test('updatePins rewrites stale or missing pins and leaves a current page alone', () => {
  const s = pinStatus(html, ROOT);
  const stale = html.replace(s.pins[3].found, 'sha256-stalestalestalestalestalestalestalestalest=');
  const r = updatePins(stale, ROOT);
  assert.equal(r.current, false);
  assert.deepEqual(r.stale, [s.pins[3].path]);
  assert.equal(r.html, html);
  assert.equal(updatePins(html, ROOT).html, html);
  const unpinned = html.replace(/ integrity="[^"]*"/g, '');
  assert.equal(pinStatus(unpinned, ROOT).stale.length, LOADS.length);
  assert.equal(updatePins(unpinned, ROOT).html, html, 'pins are added where there were none');
  // An inline script, should one ever return, is hashed into the policy as before.
  const withInline = html.replace('</body>', '<script>console.log(1)</script>\n</body>');
  const r2 = updatePins(withInline, ROOT);
  assert.deepEqual(r2.stale, ['Content-Security-Policy']);
  assert.match(r2.html, /script-src 'self' 'sha256-[A-Za-z0-9+/=]+';/);
  assert.equal(pinStatus(r2.html, ROOT).current, true);
  assert.equal(updatePins(r2.html.replace('<script>console.log(1)</script>\n', ''), ROOT).html, html, 'and dropped again when it goes');
});

// A returning visitor's browser may still hold last release's files. The pins would refuse them next to a new page
// and leave it blank, so every pinned address carries a version made from the file's hash: a new file is a new address.
test('every pinned address carries a version made from its hash, and a missing or stale one is rewritten', () => {
  const s = pinStatus(html, ROOT);
  for (const p of s.pins) {
    assert.match(p.ver, /^[0-9a-f]{12}$/);
    assert.equal(p.url, `${p.path}?v=${p.ver}`, p.path + ' is addressed with its version');
  }
  const unversioned = html.replace(/\?v=[0-9a-f]{12}"/g, '"');
  assert.deepEqual(pinStatus(unversioned, ROOT).stale, LOADS, 'without versions every file counts as stale, even with matching pins');
  assert.equal(updatePins(unversioned, ROOT).html, html, 'the versions are put back');
  const wrong = html.replace(s.pins[0].ver, '000000000000');
  assert.deepEqual(pinStatus(wrong, ROOT).stale, [s.pins[0].path]);
  assert.equal(updatePins(wrong, ROOT).html, html, 'a stale version is rewritten');
  assert.match(readFileSync(ROOT + 'app/ui.js', 'utf8'), /sc\.src='vendor\/jsQR\.js\?v='\+/, 'the one script loaded later is versioned from its own pin too');
});
