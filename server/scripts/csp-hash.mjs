// Pins what the page loads (SPEC.md 10.6). Every <script src> and <link rel="stylesheet"> in index.html that names
// a local file gets an integrity attribute holding the SHA-256 of that file's current bytes: the browser refuses a
// file that was changed on the way, and the hash of index.html alone still pins the whole app. The same file's
// address gets a version, ?v=<the first twelve hex characters of that hash>, so a browser that cached the old file
// fetches the new one instead of pairing a new page with a stale file the pin would refuse and leaving a blank
// screen. Caddy marks index.html for revalidation on every visit and the versioned files as immutable
// (scripts/Caddyfile.example). An inline <script>, should one ever return, gets its hash in the
// Content-Security-Policy as before. Run it after every edit under app/ or vendor/ (`npm run csp`); `npm test`
// fails while anything is stale.
//
//   node scripts/csp-hash.mjs ../index.html            rewrite what is stale
//   node scripts/csp-hash.mjs ../index.html --check    exit 1 if anything is stale, change nothing

import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const TAG = /<(script|link)\b[^>]*>/g;
const INLINE_SCRIPT = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
const SCRIPT_SRC = /(script-src)([^;"]*)/;
const HASH_SOURCE = /\s*'sha(?:256|384|512)-[^']*'/g;
const sha = (data) => 'sha256-' + createHash('sha256').update(data).digest('base64');
const version = (data) => createHash('sha256').update(data).digest('hex').slice(0, 12);
const attr = (tag, name) => { const m = new RegExp(`\\b${name}="([^"]*)"`).exec(tag); return m ? m[1] : null; };

// What index.html loads from local files: each with the pin it carries and the pin its file deserves, the version in
// its address and the one it deserves, plus the state of the policy's inline-script hashes. `root` is the folder
// index.html lives in. `path` is the file; `url` is the address as written, version included.
export function pinStatus(html, root) {
  const pins = [];
  for (const m of html.matchAll(TAG)) {
    const tag = m[0];
    const url = m[1] === 'script' ? attr(tag, 'src') : /\brel="stylesheet"/.test(tag) ? attr(tag, 'href') : null;
    if (!url || /^[a-z]+:|^\/\//i.test(url)) continue;                      // not a local file
    const q = url.indexOf('?'), path = q < 0 ? url : url.slice(0, q), query = q < 0 ? '' : url.slice(q + 1);
    let bytes;
    try { bytes = readFileSync(resolve(root, path)); } catch { throw new Error(`index.html loads ${path}, which is not there`); }
    const v = /(?:^|&)v=([^&]*)/.exec(query);
    pins.push({ tag, path, url, found: attr(tag, 'integrity'), expected: sha(bytes), foundVer: v ? v[1] : null, ver: version(bytes) });
  }
  const inline = [...html.matchAll(INLINE_SCRIPT)].map((m) => `'${sha(Buffer.from(m[1], 'utf8'))}'`);
  const src = SCRIPT_SRC.exec(html);
  if (!src) throw new Error('no script-src in the Content-Security-Policy meta tag');
  const have = (src[2].match(HASH_SOURCE) || []).map((s) => s.trim());
  const cspCurrent = have.length === inline.length && have.every((h, i) => h === inline[i]);
  const stale = pins.filter((p) => p.found !== p.expected || p.foundVer !== p.ver).map((p) => p.path);
  if (!cspCurrent) stale.push('Content-Security-Policy');
  return { pins, inline, cspCurrent, stale, current: stale.length === 0 };
}

export function updatePins(html, root) {
  const s = pinStatus(html, root);
  let out = html;
  for (const p of s.pins) {
    let tag = p.tag;
    if (p.found !== p.expected) tag = p.found === null ? tag.replace(/\s*\/?>$/, (end) => ` integrity="${p.expected}"${end}`) : tag.replace(`integrity="${p.found}"`, `integrity="${p.expected}"`);
    if (p.foundVer !== p.ver) tag = tag.replace(`="${p.url}"`, `="${p.path}?v=${p.ver}"`);
    if (tag !== p.tag) out = out.replace(p.tag, () => tag);
  }
  if (!s.cspCurrent) out = out.replace(SCRIPT_SRC, (_, k, rest) => k + rest.replace(HASH_SOURCE, '') + s.inline.map((h) => ' ' + h).join(''));
  return { ...s, html: out };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, flag] = process.argv.slice(2);
  if (!file) { process.stderr.write('usage: csp-hash.mjs <index.html> [--check]\n'); process.exit(2); }
  const html = readFileSync(file, 'utf8');
  const r = updatePins(html, dirname(resolve(file)));
  const what = `${r.pins.length} file${r.pins.length === 1 ? '' : 's'}${r.inline.length ? ` and ${r.inline.length} inline script${r.inline.length === 1 ? '' : 's'}` : ''}`;
  if (r.current) { process.stdout.write(`Pins are current (${what})\n`); process.exit(0); }
  if (flag === '--check') { process.stderr.write(`Stale pins: ${r.stale.join(', ')}; run "npm run csp"\n`); process.exit(1); }
  writeFileSync(file, r.html);
  process.stdout.write(`Pinned ${r.stale.join(', ')} (${what})\n`);
}
