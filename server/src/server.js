// Wires the pieces together: an HTTP server (health check, POST /drop, media
// under /media/, and optionally the app's static files for local development), the WebSocket endpoint at /ws,
// the store, the subscription registry, rate-limit state and the background
// timers. Nothing here logs per request.

import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { createReadStream, statSync } from 'node:fs';
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
import { HushError } from './errors.js';

// ---- POST /drop (SPEC.md 6): one sealed note into one mailbox, no session, no cookie, no proof ----
function readJson(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, over = false;
    req.on('data', (c) => {
      if (over) return;                                   // keep draining so the 413 can still be sent
      size += c.length;
      if (size > maxBytes) { over = true; chunks.length = 0; reject(new HushError('toolarge', 'drop: body too large')); return; }
      chunks.push(c);
    });
    req.on('end', () => { if (over) return; try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new HushError('invalid', 'drop: body is not JSON')); } });
    req.on('error', () => reject(new HushError('invalid', 'drop: body not received')));
  });
}

// The page normally posts from the same origin. When it is served from elsewhere (localhost against 127.0.0.1
// in development, or a separate static host, SPEC.md 10.6), the browser asks first; answer for the allowed origins.
function corsHeaders(req, originOk) {
  const o = req.headers.origin;
  if (typeof o !== 'string' || !o || !originOk(req)) return {};
  return { 'access-control-allow-origin': o, 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600', vary: 'origin' };
}

// Which browser origins may use the socket, POST /drop and /media: the ones listed in HUSH_ORIGINS, and always a page
// served from this same host (scheme aside, since Caddy ends TLS in front of Node). HUSH_ORIGINS=* turns the check off
// for tests and non-browser clients. A request with no Origin is not a page's: refused unless the check is off.
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
// Only the app itself is served: `/` or `/index.html`, its own script and style
// files under `/app/`, and script files under `/vendor/`. Nothing else in the
// folder is reachable, so a project folder that also holds the server's own data
// is safe to point at.
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function staticTarget(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0]); } catch { return null; }
  if (p === '/' || p === '/index.html') return 'index.html';
  const m = /^\/(vendor\/[A-Za-z0-9._-]+\.js|app\/[A-Za-z0-9._-]+\.(?:js|css))$/.exec(p);
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
  res.writeHead(200, {
    'content-type': STATIC_TYPES[extname(file)] || 'application/octet-stream',
    'content-length': st.size,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') { res.end(); return true; }
  createReadStream(file).pipe(res);
  return true;
}

export function createServer(cfg) {
  const limits = withLimits(DEFAULT_LIMITS, cfg.limits);
  const now = cfg.now || Date.now;
  const authz = createAuthz(cfg.authz);
  const store = new Store({ dataDir: cfg.dataDir, limits, addrKeyFile: cfg.addrKeyFile, now, authz }).open();
  const subs = new SubRegistry(limits);
  const conns = new Set();
  store.on('change', (evt) => subs.dispatch(evt));
  // A rotation, admin change or deletion: everyone else loses their level and their live views of that chat.
  store.on('evict', ({ cid, keep }) => { for (const c of conns) if (c !== keep) c.evict(cid); });
  const tagger = new AddressTagger();
  const helloBuckets = new BucketMap(limits.helloPerMinPerAddr, limits.helloPerMinPerAddr / 60);
  const proveFails = new BucketMap(limits.proveFailsPer10Min, limits.proveFailsPer10Min / 600);
  const openFails = new BucketMap(limits.openFailsPerMin, limits.openFailsPerMin / 60);
  // The address-keyed limits of SPEC.md 9.4: blind-address lookups, sign-ups (under the daily tag) and invite lookups.
  const blindReads = new BucketMap(limits.blindReadsPerMinPerAddr, limits.blindReadsPerMinPerAddr / 60);
  const blindPaths = new BucketMap(limits.blindReadsPerHourPerPath, limits.blindReadsPerHourPerPath / 3600, 3600_000);
  const signups = new BucketMap(limits.signupsPerDayPerAddr, limits.signupsPerDayPerAddr / 86400, 86400_000);
  const invites = new BucketMap(limits.invitesPerMinPerAddr, limits.invitesPerMinPerAddr / 60);
  const originOk = originChecker(cfg.origins);
  const trustProxy = cfg.trustProxy === true;          // off unless said so: a client reaching Node directly could forge the header
  const staticRoot = cfg.staticDir ? resolve(cfg.staticDir) : null;
  const drops = new Drops({ store, limits, now });
  const tickets = new Tickets({ now, ttlMs: limits.media.ticketTtlMs });
  const media = createMediaHttp({ store, limits, tickets, tagger, trustProxy, originOk, now, diskFree: cfg.diskFree || null, dataDir: cfg.dataDir });

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
    const addrTag = tagger.tag(address), dayTag = tagger.tagDay(address);   // the address itself goes no further
    wss.handleUpgrade(req, socket, head, (ws) => {
      const conn = new Connection(ws, { store, subs, limits, helloBuckets, proveFails, openFails, blindReads, blindPaths, signups, invites, tickets, addrTag, dayTag, now, badges: cfg.badges || {}, onClose: (c) => { conns.delete(c); tickets.dropConn(c); } });
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
  every(limits.sweepIntervalMs, () => { store.sweep(); store.sweepMedia(); tickets.prune(); }, 'sweep');   // a disappearing message's media goes with it (SPEC.md 8.6)
  every(Math.max(250, Math.min(5000, limits.typingTtlMs)), () => store.prune(), 'prune');
  every(limits.saltRotateMs, () => { tagger.rotate(); helloBuckets.prune(); proveFails.prune(); openFails.prune(); blindReads.prune(); blindPaths.prune(); invites.prune(); drops.prune(); }, 'rotate');
  every(86400_000, () => { tagger.rotateDay(); signups.prune(); }, 'rotateDay');
  every(3600_000, () => store.sweepInbox(), 'inboxSweep');   // notes older than 30 days (SPEC.md 8.6)

  return {
    store, subs, conns, limits, tagger, authz, staticRoot, drops, tickets,
    sweepInbox: (t) => store.sweepInbox(t),
    sweepMedia: (t) => store.sweepMedia(t),
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
      store.close();
    },
    sweep: (t) => store.sweep(t),
    prune: (t) => store.prune(t),
  };
}
