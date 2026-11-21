// Media over HTTP (SPEC.md 7.7). Encrypted pieces travel as raw bytes, not as base64 inside socket frames.
//
//   GET    /media/limits                      the media limits (limits.js MEDIA_LIMITS), for the page; no ticket
//   PUT    /media/<cid>/<mid>/<i>             store one piece, once (body: 12-byte iv, then ciphertext); X-Hush-Oh: the uploader's token hash
//   GET    /media/<cid>/<mid>/<i>             read one piece
//   DELETE /media/<cid>/<mid>                 remove every piece of a media id; X-Hush-Ot: the media token (an admin needs none)
//   POST   /media/<to>/<mid>/copy             copy the media named in X-Hush-From (<cid>/<mid>) to a new id (a forward); X-Hush-Oh: the forwarder's
//
// An HTTP request carries no chat level of its own. A connection that has opened a chat with its room key asks
// for a short-lived ticket over the socket (`media.ticket`) and sends it as `Authorization: Hush <ticket>`. Each
// request is then checked against that connection's level for the chat *now*: a rotation, a removal or a closed
// socket ends access at once, and room keys never travel over HTTP. Nothing here is logged per request.

import { randomBytes } from 'node:crypto';
import { HushError, fail } from './errors.js';
import { BucketMap, maxPieces, clientAddress } from './limits.js';
import { log } from './log.js';

const TICKETS_PER_CONN = 200;

export class Tickets {
  constructor({ now = Date.now, ttlMs }) { this.now = now; this.ttlMs = ttlMs; this.map = new Map(); }

  issue(conn, cid) {
    const t = randomBytes(24).toString('base64url'), exp = this.now() + this.ttlMs;
    if (!conn.tickets) conn.tickets = new Set();
    if (conn.tickets.size >= TICKETS_PER_CONN) this.drop(conn.tickets.values().next().value);
    this.map.set(t, { conn, cid, exp });
    conn.tickets.add(t);
    return { t, exp };
  }

  // The connection behind a ticket for `cid`, or a refusal.
  resolve(t, cid) {
    const e = typeof t === 'string' ? this.map.get(t) : undefined;
    if (!e || e.exp <= this.now() || e.conn.closed) { if (e) this.drop(t); fail('unauth', 'media ticket missing or expired; ask for a new one'); }
    if (e.cid !== cid) fail('denied', 'this ticket is for another chat');
    return e.conn;
  }

  drop(t) {
    const e = this.map.get(t);
    if (!e) return;
    this.map.delete(t);
    if (e.conn.tickets) e.conn.tickets.delete(t);
  }

  dropConn(conn) {
    for (const t of conn.tickets || []) this.map.delete(t);
    conn.tickets = null;
  }

  prune() { const now = this.now(); for (const [t, e] of this.map) if (e.exp <= now || e.conn.closed) this.drop(t); }
  get size() { return this.map.size; }
}

// What the page needs to know: the per-kind sizes it checks before uploading, and the piece size it cuts files into.
export function clientLimits(M) {
  return {
    pieceBytes: M.pieceBytes, imageBytes: M.imageBytes, gifBytes: M.gifBytes, videoBytes: M.videoBytes, videoAutoBytes: M.videoAutoBytes, fileBytes: M.fileBytes,
    voiceSeconds: M.voiceSeconds, voiceBytes: M.voiceBytes, filesPerMessage: M.filesPerMessage, chatBytes: M.chatBytes, maxPieces: maxPieces(M),
  };
}

const STATUS = { invalid: 400, unauth: 401, denied: 403, notfound: 404, exists: 409, conflict: 409, toolarge: 413, ratelimit: 429, full: 507 };
const statusOf = (e) => (e instanceof HushError ? STATUS[e.code] || 500 : 500);
const ROUTE = /^\/media\/([A-Za-z0-9_-]{13,23})\/(m[A-Za-z0-9]{12})(?:\/(0|[1-9][0-9]{0,4}|copy))?$/;

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const parts = []; let size = 0, over = false;
    req.on('data', (c) => {
      if (over) return;                                    // keep draining so the 413 can still be sent
      size += c.length;
      if (size > maxBytes) { over = true; parts.length = 0; reject(new HushError('toolarge', 'media: piece too large')); return; }
      parts.push(c);
    });
    req.on('end', () => { if (!over) resolve(Buffer.concat(parts)); });
    req.on('error', () => reject(new HushError('invalid', 'media: body not received')));
  });
}

// `disk` is the server-wide storage guard (disk.js): the free-disk floor and the cap on all media together.
export function createMediaHttp({ store, limits, tickets, tagger, disk, trustProxy = false, originOk = () => true }) {
  const M = limits.media;
  const writes = new BucketMap(M.pieceWritesPerMinPerChat, M.pieceWritesPerMinPerChat / 60);
  const reads = new BucketMap(M.pieceReadsPerMinPerAddr, M.pieceReadsPerMinPerAddr / 60);
  const acctBytes = new BucketMap(M.uploadBytesPerDayPerAcct, M.uploadBytesPerDayPerAcct / 86400, 86400_000);
  const addrBytes = new BucketMap(M.uploadBytesPerDayPerAddr, M.uploadBytesPerDayPerAddr / 86400, 86400_000);
  // `full` with scope `server` is the disk or the server's media cap, which no delete of the page's own will cure soon;
  // the store's own `full` (the chat's allowance) reaches the page with scope `chat`.
  const full = () => { throw Object.assign(new HushError('full', 'the server is out of space for media right now'), { scope: 'server' }); };
  // Room for `n` more bytes: on the server, then in the account's and the address's daily budgets (SPEC.md 9.4).
  function admit(n, handle, req) {
    if (!disk.admit(n)) full();
    if (!acctBytes.take(handle, n)) fail('ratelimit', 'you have sent a lot of files today; more tomorrow');
    if (!addrBytes.take(tagger.tagDay(clientAddress(req, trustProxy)), n)) fail('ratelimit', 'a lot of files were sent from here today; more tomorrow');
  }

  function cors(req) {
    const o = req.headers.origin;
    if (typeof o !== 'string' || !o || !originOk(req)) return {};
    return {
      'access-control-allow-origin': o, 'access-control-allow-methods': 'GET, PUT, POST, DELETE',
      'access-control-allow-headers': 'authorization, content-type, x-hush-exp, x-hush-from, x-hush-from-ticket, x-hush-oh, x-hush-ot',
      'access-control-max-age': '600', vary: 'origin',
    };
  }
  const json = (res, status, body, extra) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
    res.end(JSON.stringify(body));
  };
  const ticketOf = (v) => (typeof v === 'string' && v.startsWith('Hush ') ? v.slice(5).trim() : null);
  const expOf = (v) => {
    if (v === undefined || v === '') return 0;
    if (typeof v !== 'string' || !/^[0-9]{1,16}$/.test(v)) fail('invalid', 'media: bad X-Hush-Exp');
    return Number(v);
  };
  // The uploader's media token hash (SPEC.md 7.7): 64 hex, kept with the media id so its holder may delete the file.
  // shortcut: optional in release 80 so a page from before it still uploads; require it once that page release is out.
  const ohOf = (v) => {
    if (v === undefined || v === '') return '';
    if (typeof v !== 'string' || !/^[0-9a-fA-F]{64}$/.test(v)) fail('invalid', 'media: bad X-Hush-Oh');
    return v.toLowerCase();
  };
  const otOf = (v) => {
    if (v === undefined || v === '') return undefined;
    if (typeof v !== 'string' || v.length > 128) fail('invalid', 'media: bad X-Hush-Ot');
    return v;
  };

  async function serve(req, res, m, extra) {
    const [, cid, mid, last] = m;
    const conn = tickets.resolve(ticketOf(req.headers.authorization), cid);
    const actor = conn.actor();
    if (req.method === 'GET' && last !== undefined && last !== 'copy') {
      if (!reads.take(tagger.tag(clientAddress(req, trustProxy)))) fail('ratelimit', 'too many media reads; slow down');
      const body = store.mediaGet({ cid, mid, i: last }, actor);
      if (!body) fail('notfound', 'no such piece');
      res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': body.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
      res.end(body);
      return;
    }
    if (req.method === 'PUT' && last !== undefined && last !== 'copy') {
      const exp = expOf(req.headers['x-hush-exp']), oh = ohOf(req.headers['x-hush-oh']);
      if (!writes.take(cid)) fail('ratelimit', 'too many media writes in this chat; slow down');
      if (!disk.ok()) full();                              // before the body is read: nothing to do with it
      const body = await readBody(req, M.pieceBytes + 28);
      if (conn.closed) fail('unauth', 'the connection behind this ticket closed');   // its level was revoked while the body arrived
      admit(body.length, actor.handle, req);
      const r = store.mediaPut({ cid, mid, i: last, body, exp, oh }, actor);
      json(res, r.created ? 201 : 200, { ok: true, created: r.created }, extra);
      return;
    }
    if (req.method === 'DELETE' && last === undefined) {
      json(res, 200, { ok: true, n: store.mediaDelete({ cid, mid, ot: otOf(req.headers['x-hush-ot']) }, actor) }, extra);
      return;
    }
    if (req.method === 'POST' && last === 'copy') {
      const fm = /^([A-Za-z0-9_-]{13,23})\/(m[A-Za-z0-9]{12})$/.exec(String(req.headers['x-hush-from'] || ''));
      if (!fm) fail('invalid', 'media: X-Hush-From must be <cid>/<mid>');
      const src = tickets.resolve(req.headers['x-hush-from-ticket'], fm[1]);
      const exp = expOf(req.headers['x-hush-exp']), oh = ohOf(req.headers['x-hush-oh']);
      admit(store.mediaIdBytes(fm[1], fm[2]), actor.handle, req);   // 0 for a missing source, which the copy then refuses
      const r = store.mediaCopy({ from: fm[1], fromMid: fm[2], to: cid, mid, exp, oh }, src.actor(), actor);
      json(res, r.copied ? 201 : 200, { ok: true, copied: r.copied }, extra);
      return;
    }
    fail('invalid', 'media: unsupported method');
  }

  // Returns true when the request was a media request (answered or being answered).
  function handle(req, res) {
    const url = (req.url || '').split('?')[0];
    if (url !== '/media/limits' && !url.startsWith('/media/')) return false;
    const extra = cors(req);
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...extra, 'cache-control': 'no-store' }); res.end(); return true; }
    if (url === '/media/limits') {
      if (req.method !== 'GET') json(res, 405, { ok: false, e: 'invalid', m: 'GET only' }, extra);
      else json(res, 200, { ok: true, limits: clientLimits(M) }, extra);
      return true;
    }
    const m = ROUTE.exec(url);
    const fault = (e) => {
      if (!(e instanceof HushError)) log.error('media.failed', e);
      const out = { ok: false, e: e instanceof HushError ? e.code : 'internal', m: e instanceof HushError ? e.message : 'internal error' };
      if (out.e === 'full') out.scope = e.scope || 'chat';
      if (!res.headersSent) json(res, statusOf(e), out, extra);
      if (req.readableEnded === false) req.resume();       // drain an unread body so the reply goes out
    };
    if (!m) { fault(new HushError('notfound', 'no such media address')); return true; }
    serve(req, res, m, extra).catch(fault);
    return true;
  }
  handle.prune = () => { writes.prune(); reads.prune(); acctBytes.prune(); addrBytes.prune(); };
  return handle;
}
