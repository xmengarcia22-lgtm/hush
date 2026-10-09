// Shared test helpers: start a server on a random port with a temp data folder,
// and a tiny WebSocket client that pairs replies with requests and collects pushes.

import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

import { createServer } from '../src/server.js';
import { log } from '../src/log.js';
import { leadingZeroBits } from '../src/drops.js';
import { createHash } from 'node:crypto';

// ---- the page's own code ------------------------------------------------------------------------
// index.html loads its script files from app/ in a fixed order; they share one global scope. Joined in that order
// they are the single script the page used to be, and the tests lift blocks out of that text by their markers.
const PAGE_ROOT = new URL('../../', import.meta.url);
export function appFiles() {
  const html = readFileSync(new URL('index.html', PAGE_ROOT), 'utf8');
  return [...html.matchAll(/<script src="(app\/[^"]+)"/g)].map((m) => m[1].split('?')[0]);   // the address carries a version; the file does not
}
export function appSource() {
  return appFiles().map((f) => `/* ---- ${f} ---- */\n` + readFileSync(new URL(f, PAGE_ROOT), 'utf8')).join('\n');
}

export async function startServer(overrides = {}) {
  const dataDir = mkdtempSync(join(tmpdir(), 'hush-test-'));
  // Test clients are not browser pages (no Origin header), so the origin check is off unless a test turns it on;
  // every test account comes from 127.0.0.1, so the daily sign-up backstop is lifted unless a test sets it on purpose.
  const cfg = { host: '127.0.0.1', port: 0, dataDir, authz: 'open', origins: 'any', trustProxy: true, ...overrides };
  cfg.limits = { signupsPerDayPerAddr: 1000, ...(overrides.limits || {}) };
  log.setEnabled(false);
  const srv = createServer(cfg);
  const { port } = await srv.listen();
  let stopped = false;
  return {
    srv,
    dataDir,
    url: `ws://127.0.0.1:${port}/ws`,
    httpUrl: `http://127.0.0.1:${port}`,
    async stop() {            // safe to call twice, so a failing test's cleanup never hangs the file
      if (stopped) return;
      stopped = true;
      await srv.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

export class Client {
  constructor(url, opts = {}) {
    this.ws = new WebSocket(url, opts);
    this.pending = new Map();
    this.pushes = [];
    this.waiters = [];
    this.i = 0;
    this.closed = new Promise((res) => this.ws.on('close', (code, reason) => {
      for (const r of this.pending.values()) r({ ok: false, e: 'closed', m: `socket closed (${code})` });
      this.pending.clear();
      res({ code, reason: String(reason) });
    }));
    this.ws.on('message', (m) => this.onMessage(JSON.parse(String(m))));
  }

  ready() {
    return new Promise((res, rej) => {
      this.ws.once('open', res);
      this.ws.once('error', rej);
      this.ws.once('unexpected-response', (_req, r) => rej(new Error('http ' + r.statusCode)));
    });
  }

  onMessage(f) {
    if (Number.isInteger(f.i) && this.pending.has(f.i)) {
      const res = this.pending.get(f.i);
      this.pending.delete(f.i);
      res(f);
      return;
    }
    this.pushes.push(f);
    this.waiters = this.waiters.filter((w) => !w(f));
  }

  call(op, fields = {}) {
    const i = ++this.i;
    return new Promise((res) => {
      this.pending.set(i, res);
      this.ws.send(JSON.stringify({ i, op, ...fields }));
    });
  }

  async ok(op, fields = {}) {
    const r = await this.call(op, fields);
    if (!r.ok) throw new Error(`${op} failed: ${r.e} (${r.m})`);
    return r;
  }

  async hello() {
    return this.ok('hello', { v: 1 });
  }

  // Resolves with the first push matching `pred` (already received or future).
  waitPush(pred, timeoutMs = 2000) {
    const idx = this.pushes.findIndex(pred);
    if (idx >= 0) return Promise.resolve(this.pushes.splice(idx, 1)[0]);
    return new Promise((res, rej) => {
      const t = setTimeout(() => rej(new Error('timed out waiting for push')), timeoutMs);
      this.waiters.push((f) => {
        if (!pred(f)) return false;
        clearTimeout(t);
        const j = this.pushes.indexOf(f);
        if (j >= 0) this.pushes.splice(j, 1);
        res(f);
        return true;
      });
    });
  }

  // Resolves true if no push matching `pred` arrives within `ms`.
  async noPush(pred, ms = 150) {
    try { await this.waitPush(pred, ms); return false; } catch { return true; }
  }

  close() {
    this.ws.close();
    return this.closed;
  }
}

export async function connect(url, opts) {
  const c = new Client(url, opts);
  await c.ready();
  return c;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- identities for the sign-in proof (SPEC.md 4.1) ----------------------------------
const subtle = globalThis.crypto.subtle;
const jwkXY = async (k) => { const j = await subtle.exportKey('jwk', k); return { x: j.x, y: j.y }; };

export async function makeIdentity(handle) {
  const s = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const e = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  return { handle, sigKey: s.privateKey, sig: await jwkXY(s.publicKey), ecdh: await jwkXY(e.publicKey), name: handle[0].toUpperCase() + handle.slice(1) };
}

export const signText = async (key, msg) => Buffer.from(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, Buffer.from(msg, 'utf8'))).toString('base64url');

export const sessionMsg = (nonce, h, dev = '') => `hush-session-v1|${nonce}|${h}|${dev}`;
export const directoryDoc = (id) => ({ handle: id.handle, name: id.name, ecdh: id.ecdh, sig: id.sig, kv: 1 });

// A device entry for `id`, vouched for by the account key (or by `parent`, another device).
export async function makeDevice(id, parent = null) {
  const s = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const e = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const devId = 'dev' + Math.random().toString(36).slice(2, 11);
  const sig = await jwkXY(s.publicKey), ecdh = await jwkXY(e.publicKey);
  const by = parent ? parent.id : '';
  const msg = ['hush-dev-v1', id.handle, devId, ecdh.x, ecdh.y, sig.x, sig.y, by].join('|');
  const s_ = await signText(parent ? parent.sigKey : id.sigKey, msg);
  return { id: devId, sigKey: s.privateKey, sig, ecdh, by, entry: { x: ecdh.x, y: ecdh.y, sx: sig.x, sy: sig.y, by, s: s_, ts: Date.now() } };
}

// Connects, says hello, proves the identity (account key unless `dev` is given) and returns the client.
export async function connectAs(url, id, { dev = null, pub = false } = {}) {
  const c = await connect(url);
  const h = await c.hello();
  const sig = dev ? await signText(dev.sigKey, sessionMsg(h.nonce, id.handle, dev.id)) : await signText(id.sigKey, sessionMsg(h.nonce, id.handle));
  const r = await c.call('prove', { h: id.handle, sig, ...(dev ? { dev: dev.id } : {}), ...(pub ? { pub: id.sig } : {}) });
  if (!r.ok) { await c.close(); throw new Error(`prove failed: ${r.e} (${r.m})`); }
  c.via = r.via;
  return c;
}

// The sign-up puzzle (SPEC.md 9.4), solved the way the page does it, synchronously here.
export function solveSignup(salt, bits) {
  for (let n = 0; ; n++) {
    const nonce = n.toString(36);
    if (leadingZeroBits(createHash('sha256').update(`hush-signup-v1|${salt}|${nonce}`, 'utf8').digest()) >= bits) return nonce;
  }
}

// Signs up a brand-new identity: proof with the fresh key, the puzzle, then the directory entry.
export async function signup(url, id) {
  const c = await connectAs(url, id, { pub: true });
  const { salt, bits } = await c.ok('signup.pow');
  await c.ok('set', { p: 'directory/' + id.handle, d: directoryDoc(id), pow: solveSignup(salt, bits) });
  return c;
}

// ---- room keys (SPEC.md 5) ---------------------------------------------------------------
import { randomBytes } from 'node:crypto';
export const cap = () => randomBytes(32).toString('base64url');              // a 43-character room key
export const label = () => randomBytes(16).toString('base64url');            // a 22-character wrap label
export const wrap = () => ({ epk: { x: 'x'.repeat(43), y: 'y'.repeat(43) }, iv: 'aXY=', ct: 'Y3Q=' });
export const sealed = (e = 0) => ({ e, iv: 'aXY=', ct: 'bWV0YQ==' });
export const CAPS = () => ({ m: cap(), a: cap(), o: cap() });
export const groupDoc = (over = {}) => ({ type: 'group', visibility: 'private', epoch: 0, keys: { 0: { [label()]: wrap() } }, akeys: { [label()]: wrap() }, meta: sealed(0), invites: {}, ts: Date.now(), last: null, ...over });
export const channelDoc = (over = {}) => ({ type: 'channel', visibility: 'private', epoch: 0, keys: { 0: { [label()]: wrap() } }, akeys: { [label()]: wrap() }, meta: sealed(0), invites: {}, ts: Date.now(), last: null, ...over });
export const dmDoc = (over = {}) => ({ type: 'dm', epoch: 0, ts: Date.now(), last: null, ...over });
export const DMID = 'd' + 'A'.repeat(22);

// Creates a chat as `c` (proven) and returns its caps; the creator's connection holds the owner level.
export async function createChat(c, cid, doc, caps = CAPS()) {
  const r = await c.ok('chat.create', { cid, d: doc, caps });
  return { caps, level: r.level };
}

// Asserts that `fn` throws a HushError with the given code (and, optionally, a message matching `re`).
export function throwsCode(fn, code, re) {
  let threw = false;
  try { fn(); } catch (e) {
    threw = true;
    if (e.code !== code) throw new Error(`expected error code "${code}", got "${e.code}" (${e.message})`);
    if (re && !re.test(e.message)) throw new Error(`error message "${e.message}" does not match ${re}`);
  }
  if (!threw) throw new Error(`expected an error with code "${code}", nothing was thrown`);
}

export const CID = 'gAbCdEfGhIjKl';            // a valid group id: g + 12 alphanumerics
export const CID2 = 'cZyXwVuTsRqPo';           // a valid channel id
export const PID = 'pOsT12345678';              // 12 alphanumerics
export const TAG = 'tAgTAGtagTAG0123456789';    // 22 base64url characters
