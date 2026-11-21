// Wires the pieces together: an HTTP server (health check, POST /drop, media
// under /media/, and optionally the app's static files for local development), the WebSocket endpoint at /ws,
// the store, the subscription registry, rate-limit state and the background
// timers. Nothing here logs per request.

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { resolve, sep, extname } from 'node:path';
import { WebSocketServer } from 'ws';

import { Store } from './store.js';
import { SubRegistry } from './subs.js';
import { Connection } from './protocol.js';
import { createAuthz } from './authz.js';
import { log } from './log.js';
import { DEFAULT_LIMITS, AddressTagger, BucketMap, clientAddress, withLimits } from './limits.js';
import { Drops, statusOf } from './drops.js';
import { Tickets, createMediaHttp } from './media.js';
import { createDiskWatch } from './disk.js';
import { createApns } from './apns.js';
import { Wakes } from './wake.js';
import { HushError } from './errors.js';

// ---- POST /drop (SPEC.md 6) and POST /wake: one small JSON body, no session, no cookie, no proof ----
function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, over = false;
    req.on('data', (c) => {
      if (over) return;                                   // keep draining so the 413 can still be sent
      size += c.length;
      if (size > maxBytes) { over = true; chunks.length = 0; reject(new HushError('toolarge', 'body too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (over) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HushError('invalid', 'body is not JSON')); } });
    req.on('error', () => reject(new HushError('invalid', 'body not received')));
  });
}

// The page normally posts from the same origin. When it is served from elsewhere (localhost against 127.0.0.1
// in development, or a separate static host, SPEC.md 10.6), the browser asks first; answer for the allowed origins.
function corsHeaders(req, originOk) {
  const o = req.headers.origin;
  if (typeof o !== 'string' || !o || !originOk(req)) return {};
  return { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'origin' };
}

// Which browser origins may use the socket, POST /drop, POST /wake and /media: the ones listed in HUSH_ORIGINS, and always
// a page served from this same host (scheme aside, since Caddy ends TLS in front of Node). HUSH_ORIGINS=* turns the check
// off for tests and non-browser clients. The socket refuses any other Origin, and a missing one. /drop and /wake refuse any
// other Origin with 403, 'null' included, but process a request with none: every current browser sends one on a
// cross-site POST, and anything else can write whatever Origin it likes, so refusing a missing one would protect nothing.
// /media only withholds its CORS headers: all of it but the public limits needs a ticket from a checked socket.
function originChecker(origins) {
  if (origins === 'any') return () => true;
  const listed = Array.isArray(origins) ? origins : [];
  return (req) => {
    const o = req.headers.origin;
    if (typeof o !== 'string' || !o) return false;
    if (listed.includes(o)) return true;
    try { return new URL(o).host === String(req.headers.host || '').trim().toLowerCase(); } catch { return false; }
  };
}

function answer(res, status, body, extra) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...(extra || {}) });
  res.end(JSON.stringify(body));
}

// ---- static files (development convenience; Caddy does this in production) ------
// Only the app itself is served: `/` or `/index.html`, its own script, style and
// image files under `/app/`, and script files under `/vendor/`. Nothing else in the
// folder is reachable, so a project folder that also holds the server's own data
// is safe to point at.
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };

function staticTarget(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p === '/' || p === '/index.html') return 'index.html';
  const m = /^\/(vendor\/[A-Za-z0-9._-]+\.js|app\/[A-Za-z0-9._-]+\.(?:js|css|png))$/.exec(p);
  return m ? m[1] : null;
}

function serveStatic(root, req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const rel = staticTarget(req.url || '/');
  if (!rel) return false;
  const file = resolve(root, rel);
  if (!file.startsWith(resolve(root) + sep)) return false;
  let st;
  try { st = statSync(file); } catch { return false; }
  if (!st.isFile()) return false;
  // The page's policy names only its own origin for connections; opened from this server at a loopback address, the
  // page's socket and POST /drop may still go to another loopback spelling, so the development server lets them in.
  // Production index.html is served by Caddy as it is.
  const page = rel === 'index.html' ? Buffer.from(readFileSync(file, 'utf8').replace("connect-src 'self'", "connect-src 'self' ws://127.0.0.1:8080 http://127.0.0.1:8080 ws://localhost:* http://localhost:*")) : null;
  res.writeHead(200, {
    'content-type': STATIC_TYPES[extname(file)] || 'application/octet-stream',
    'content-length': page ? page.length : st.size,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  if (page) { res.end(page); return true; }
  createReadStream(file).pipe(res);
  return true;
}

export function createServer(cfg) {
  const limits = withLimits(DEFAULT_LIMITS, cfg.limits);
  const now = cfg.now || Date.now;
  const authz = createAuthz(cfg.authz);
  const store = new Store({ dataDir: cfg.dataDir, limits, addrKeyFile: cfg.addrKeyFile, now, authz, mediaMaxPages: cfg.mediaMaxPages }).open();
  const subs = new SubRegistry(limits, (conn, evt) => store.seenBy(evt, conn.actor()));   // each watcher by the level it holds now
  const conns = new Set();
  store.on('change', (evt) => subs.dispatch(evt));
  // A rotation, admin change or deletion: everyone else loses their level and their live views of that chat. A ban names
  // the blocked username (`h`): only that person's connections at member level lose it.
  store.on('evict', ({ cid, keep, h }) => { for (const c of conns) if (c !== keep && (!h || (c.proven === h && (c.chats.get(cid) || {}).level === 'member'))) c.evict(cid); });
  // New account keys (release 21): every other connection proven for that account holds the old ones. It is closed
  // with 4401 so the page signs out at once; the writer's own connection is marked up to date.
  store.on('change', (e) => {
    if (e.kind !== 'directory' || !e.d || e.d.gone !== undefined) return;   // a deleted account's connections close with 4410 (onAccountGone)
    const kv = e.d.kv === undefined ? 1 : e.d.kv;
    for (const c of conns) {
      if (c.proven !== e.id) continue;
      if (c === e.by) { c.kv = kv; if (e.d.sig) c.pub = { x: e.d.sig.x, y: e.d.sig.y }; continue; }   // the writer goes on with the keys it just published
      if ((c.kv === undefined ? 1 : c.kv) < kv) { c.close('keys changed', 4401); continue; }
      // A sign-up proof for a name that someone else then created is void: that connection was never this account.
      if (c.provedWith === 'signup' && !(c.pub && e.d.sig && c.pub.x === e.d.sig.x && c.pub.y === e.d.sig.y)) c.close('username taken', 4401);
    }
  });
  const tagger = new AddressTagger();
  const helloBuckets = new BucketMap(limits.helloPerMinPerAddr, limits.helloPerMinPerAddr / 60);
  const proveFails = new BucketMap(limits.proveFailsPer10Min, limits.proveFailsPer10Min / 600);
  const openFails = new BucketMap(limits.openFailsPerMin, limits.openFailsPerMin / 60);
  // The address-keyed limits of SPEC.md 9.4: blind-address lookups, sign-ups (under the daily tag) and invite lookups.
  const blindReads = new BucketMap(limits.blindReadsPerMinPerAddr, limits.blindReadsPerMinPerAddr / 60);
  const blindPaths = new BucketMap(limits.blindReadsPerHourPerPath, limits.blindReadsPerHourPerPath / 3600, 3600_000);
  const linkReads = new BucketMap(limits.linkReadsPerMinPerAddr, limits.linkReadsPerMinPerAddr / 60);
  const linkPaths = new BucketMap(limits.linkReadsPerHourPerPath, limits.linkReadsPerHourPerPath / 3600, 3600_000);
  const linkAsks = new BucketMap(limits.linkAsksPerHourPerAddr, limits.linkAsksPerHourPerAddr / 3600, 3600_000);   // a new device's link ask, written before it signs in (SPEC.md 14.14)
  const pwMisses = new BucketMap(limits.pwMissesPerLogin, limits.pwMissesPerLogin / 3600, 3600_000);   // per login tag, SPEC.md 4.5
  const pwRepeats = new BucketMap(1, 1 / 3600, 3600_000);   // login tag | box address of a counted miss: the same one again within the hour is not counted
  const signups = new BucketMap(limits.signupsPerDayPerAddr, limits.signupsPerDayPerAddr / 86400, 86400_000);
  // New boxes (protocol.js, set): so many rows and bytes a day, per address under the daily salt before signing in, per
  // account after.
  const daily = (n) => new BucketMap(n, n / 86400, 86400_000);
  const boxes = { anon: daily(limits.anonBoxesPerDayPerAddr), anonBytes: daily(limits.anonBoxBytesPerDayPerAddr), acct: daily(limits.boxesPerDayPerAcct), acctBytes: daily(limits.boxBytesPerDayPerAcct) };
  const creates = daily(limits.chatCreatesPerDay);   // chat.create per account: a new socket is not a new allowance
  const sockets = new Map();   // fixed address tag → open WebSocket connections, capped at socketsPerAddr
  const invites = new BucketMap(limits.invitesPerMinPerAddr, limits.invitesPerMinPerAddr / 60);
  const relays = new BucketMap(limits.relaysPerMinPerAddr, limits.relaysPerMinPerAddr / 60);   // call.relay (SPEC.md 16.2)
  const acctRelays = { min: new BucketMap(limits.relaysPerMinPerAcct, limits.relaysPerMinPerAcct / 60), hour: new BucketMap(limits.relaysPerHourPerAcct, limits.relaysPerHourPerAcct / 3600, 3600_000) };
  // The relay username's account part: one name per account per UTC day (and per salt), so coturn's user-quota caps how
  // many allocations one account holds at once. Neither the relay nor anyone reading its traffic can turn it into a username.
  const turnName = (h) => tagger.dayName('turn|' + new Date(now()).toISOString().slice(0, 10) + '|' + h);
  const originOk = originChecker(cfg.origins);
  const trustProxy = cfg.trustProxy === true;          // off unless said so: a client reaching Node directly could forge the header
  const staticRoot = cfg.staticDir ? resolve(cfg.staticDir) : null;
  const drops = new Drops({ store, limits, now });
  const apns = cfg.apns || createApns(cfg.apnsOpts || {});   // tests hand in a stand-in; without a key it is the 'disabled' stub
  const wakes = new Wakes({ store, apns, limits, now, log });
  const tickets = new Tickets({ now, ttlMs: limits.media.ticketTtlMs });
  const disk = createDiskWatch({ dataDir: cfg.dataDir, store, limits, now, diskFree: cfg.diskFree || null });
  const media = createMediaHttp({ store, limits, tickets, tagger, disk, trustProxy, originOk });
  // An account was deleted (SPEC.md 4.7): its mailbox's drop allowance is forgotten and every connection proven for it,
  // the one that asked included, is closed with 4410 once the reply is out.
  const onAccountGone = (h) => { drops.forget(h); for (const c of [...conns]) if (c.proven === h) c.close('account deleted', 4410); };

  const onRequest = (req, res) => {
    const url = (req.url || '').split('?')[0];
    if (media(req, res)) return;
    // Development over the local network: the certificate, for a phone to install and trust (iPhone).
    if (cfg.tls && cfg.tls.der && req.method === 'GET' && url === '/hush-dev.crt') {
      res.writeHead(200, { 'content-type': 'application/x-x509-ca-cert', 'content-disposition': 'attachment; filename="hush-dev.crt"', 'cache-control': 'no-store' });
      res.end(cfg.tls.der);
      return;
    }
    if (req.method === 'GET' && url === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' });
      res.end('ok');
      return;
    }
    if (url === '/drop') {
      const cors = corsHeaders(req, originOk);
      if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'cache-control': 'no-store' }); res.end(); return; }
      if (req.method !== 'POST') { answer(res, 405, { ok: false, e: 'invalid', m: 'POST only' }, cors); return; }
      if (req.headers.origin !== undefined && !originOk(req)) { answer(res, 403, { ok: false, e: 'denied', m: 'drop: origin not allowed' }); return; }   // another site's page, before anything is counted
      const addrTag = tagger.tag(clientAddress(req, trustProxy));   // used for the salted bucket, then dropped
      readJson(req, limits.dropBodyBytes)
        .then((body) => {
          if (!body || typeof body !== 'object') throw new HushError('invalid', 'drop: body must be an object');
          const r = drops.accept({ to: body.to, blob: body.blob, pow: body.pow, addrTag });
          answer(res, 200, { ok: true, id: r.id }, cors);
        })
        .catch((e) => {
          if (!(e instanceof HushError)) { log.error('drop.failed', e); answer(res, 500, { ok: false, e: 'internal', m: 'internal error' }, cors); return; }
          const out = { ok: false, e: e.code, m: e.message };
          if (e.code === 'pow') { out.bits = e.bits; out.hour = e.hour; }
          answer(res, statusOf(e), out, cors);
        });
      return;
    }
    // A wake-up for a closed iPhone (wake.js): 204 and nothing else whatever the ticket's state.
    if (url === '/wake') {
      const cors = corsHeaders(req, originOk);
      if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'cache-control': 'no-store' }); res.end(); return; }
      if (req.method !== 'POST') { answer(res, 405, { ok: false, e: 'invalid', m: 'POST only' }, cors); return; }
      if (req.headers.origin !== undefined && !originOk(req)) { answer(res, 403, { ok: false, e: 'denied', m: 'wake: origin not allowed' }); return; }
      const addrTag = tagger.tag(clientAddress(req, trustProxy));
      readJson(req, limits.wakeBodyBytes)
        .then((body) => {
          if (!body || typeof body !== 'object') throw new HushError('invalid', 'wake: body must be an object');
          wakes.accept({ tk: body.tk, addrTag });
          res.writeHead(204, { ...cors, 'cache-control': 'no-store' });
          res.end();
        })
        .catch((e) => {
          if (!(e instanceof HushError)) { log.error('wake.failed', e); answer(res, 500, { ok: false, e: 'internal', m: 'internal error' }, cors); return; }
          answer(res, statusOf(e), { ok: false, e: e.code, m: e.message }, cors);
        });
      return;
    }
    if (staticRoot && serveStatic(staticRoot, req, res)) return;
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  };

  const wss = new WebSocketServer({ noServer: true, maxPayload: limits.maxFrameBytes, perMessageDeflate: false });

  const onUpgrade = (req, socket, head) => {
    const url = (req.url || '').split('?')[0];
    if (url !== '/ws') { socket.destroy(); return; }
    if (!originOk(req)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    const address = clientAddress(req, trustProxy);
    const addrTag = tagger.tag(address), dayTag = tagger.tagDay(address), fixedTag = tagger.tagFixed(address);   // the address itself goes no further
    if ((sockets.get(fixedTag) || 0) >= limits.socketsPerAddr) {
      socket.write('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.set(fixedTag, (sockets.get(fixedTag) || 0) + 1);
      const conn = new Connection(ws, { store, subs, limits, disk, helloBuckets, proveFails, openFails, blindReads, blindPaths, linkReads, linkPaths, linkAsks, pwMisses, pwRepeats, signups, boxes, creates, invites, relays, acctRelays, turnName, tickets, addrTag, dayTag, now, badges: cfg.badges || {}, owners: cfg.owners || [], turn: cfg.turn || null, onAccountGone, onClose: (c) => { conns.delete(c); tickets.dropConn(c); const n = (sockets.get(fixedTag) || 1) - 1; if (n > 0) sockets.set(fixedTag, n); else sockets.delete(fixedTag); } });
      conns.add(conn);
    });
  };

  // The main listener, plus (development over the local network, `npm run dev:lan`) a second, HTTPS one serving
  // exactly the same thing: phones allow WebCrypto, the camera and the microphone only on HTTPS.
  const http = createHttpServer(onRequest);
  http.on('upgrade', onUpgrade);
  const https = cfg.tls ? createHttpsServer({ key: cfg.tls.key, cert: cfg.tls.cert }, onRequest) : null;
  if (https) https.on('upgrade', onUpgrade);
  const servers = https ? [http, https] : [http];

  const timers = [];
  const every = (ms, fn, name) => {
    const t = setInterval(() => { try { fn(); } catch (e) { log.error(name + '.failed', e); } }, ms);
    if (t.unref) t.unref();
    timers.push(t);
  };
  every(limits.sweepIntervalMs, () => { store.sweep(); store.sweepMedia(); store.sweepLinkreqs(); tickets.prune(); }, 'sweep');   // a disappearing message's media goes with it (SPEC.md 8.6)
  every(Math.max(250, Math.min(5000, limits.typingTtlMs)), () => store.prune(), 'prune');
  every(limits.saltRotateMs, () => { tagger.rotate(); helloBuckets.prune(); proveFails.prune(); openFails.prune(); blindReads.prune(); blindPaths.prune(); linkReads.prune(); linkPaths.prune(); linkAsks.prune(); pwMisses.prune(); pwRepeats.prune(); invites.prune(); relays.prune(); acctRelays.min.prune(); acctRelays.hour.prune(); drops.prune(); wakes.prune(); media.prune(); }, 'rotate');
  every(86400_000, () => { tagger.rotateDay(); signups.prune(); for (const b of Object.values(boxes)) b.prune(); creates.prune(); }, 'rotateDay');
  // Notes older than 30 days, reports older than 90 (SPEC.md 8.6); once a day (the tick that falls in UTC hour 0) how much
  // media the server holds (SPEC.md 11.1: two numbers).
  every(3600_000, () => { store.sweepInbox(); store.sweepGone(); store.sweepReports(); if (new Date(now()).getUTCHours() === 0) log.info('media.stats', store.mediaStats()); }, 'inboxSweep');

  return {
    store, subs, conns, limits, tagger, authz, staticRoot, drops, wakes, tickets, disk,
    sweepInbox: (t) => store.sweepInbox(t),
    sweepMedia: (t) => store.sweepMedia(t),
    sweepLinkreqs: (t) => store.sweepLinkreqs(t),
    sweepReports: (t) => store.sweepReports(t),
    tlsPort: () => (https && https.listening ? https.address().port : null),
    async listen() {
      const one = (s, port, host) => new Promise((resolve, reject) => {
        s.once('error', reject);
        s.listen(port, host, () => { s.off('error', reject); const a = s.address(); resolve({ host: a.address, port: a.port }); });
      });
      const main = await one(http, cfg.port, cfg.host);
      if (https) {
        try { const t = await one(https, cfg.tls.port, cfg.tls.host); main.tls = t; }
        catch (e) { await new Promise((r) => http.close(() => r())); throw e; }
      }
      return main;
    },
    async close() {
      for (const t of timers) clearInterval(t);
      // Say goodbye, give the frames a moment to flush, then cut whatever is left.
      const gone = [...wss.clients].map((ws) => new Promise((r) => { if (ws.readyState >= 2) r(); else ws.once('close', r); }));
      for (const c of [...conns]) c.close('shutdown');
      await Promise.race([Promise.all(gone), new Promise((r) => setTimeout(r, 300))]);
      for (const ws of wss.clients) { try { ws.terminate(); } catch { /* already gone */ } }
      await new Promise((r) => wss.close(() => r()));
      for (const s of servers) {
        if (s.closeAllConnections) s.closeAllConnections();
        await new Promise((r) => (s.listening ? s.close(() => r()) : r()));
      }
      apns.close();
      store.close();
    },
    sweep: (t) => store.sweep(t),
    prune: (t) => store.prune(t),
  };
}
