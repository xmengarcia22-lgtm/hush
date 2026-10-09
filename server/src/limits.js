// Rate limiting without addresses on disk (SPEC.md 9.4).
//
// Token buckets live in memory. Pre-authentication limits are keyed by an
// "address tag": HMAC-SHA-256 of the remote address under a random salt that
// rotates every hour and is never written anywhere. The address itself is used
// for the HMAC and dropped.

import { createHmac, randomBytes } from 'node:crypto';

// ---- Media (SPEC.md 7.7, 8.2, 9.2) -------------------------------------------------------------------------
// Every media limit lives here, and the page reads them from GET /media/limits, so raising one for a bigger
// server is a change to this block (or to HUSH_LIMITS='{"media":{...}}'), nothing else.
export const MEDIA_LIMITS = Object.freeze({
  pieceBytes: 1 << 20,          // plaintext per encrypted piece (1 MiB); a stored piece adds a 12-byte iv and a 16-byte tag
  imageBytes: 25e6,             // photos (the page resizes anything larger than 4096 px)
  gifBytes: 15e6,
  videoBytes: 500e6,            // sent at original quality, never re-encoded
  videoAutoBytes: 50e6,         // videos up to this size download by themselves when on screen; larger ones on tap
  fileBytes: 500e6,             // any other file
  voiceSeconds: 900,            // 15 minutes
  voiceBytes: 15e6,
  filesPerMessage: 10,
  chatBytes: 2e9,               // all media in one chat
  pieceWritesPerMinPerChat: 600,
  pieceReadsPerMinPerAddr: 3000,
  minFreeDisk: 0.10,            // uploads are refused when less than this share of the disk is free...
  minFreeBytes: 5e9,            // ...and less than this many bytes, so a big disk with room to spare keeps working
  ticketTtlMs: 10 * 60_000,     // a media ticket's life (it also dies with its connection)
});
// The most pieces one media id can have: enough for the largest file any kind allows.
export const maxPieces = (m) => Math.ceil(Math.max(m.imageBytes, m.gifBytes, m.videoBytes, m.fileBytes, m.voiceBytes) / m.pieceBytes);
// The limits with a partial override applied (the media block merges one level deeper).
export function withLimits(base, over) {
  const o = over || {};
  return { ...base, ...o, media: { ...MEDIA_LIMITS, ...(base.media || {}), ...(o.media || {}) } };
}

export const DEFAULT_LIMITS = Object.freeze({
  media: MEDIA_LIMITS,
  maxFrameBytes: 1 << 20,       // 1 MB per frame
  framesPerMin: 300,            // per connection
  bytesPerMin: 50 << 20,        // per connection
  helloPerMinPerAddr: 30,       // per address tag
  proveFailsPer10Min: 10,       // failed sign-in proofs per address tag before a pause
  openFailsPerMin: 20,          // wrong room keys or invite proofs per address tag
  dropsPerHour: 100,            // notes a connection may leave in its own mailbox
  dropsPerHourPerAddr: 30,      // POST /drop, per address tag (SPEC.md 9.4)
  dropsPerHourPerRecipient: 100,// POST /drop, per mailbox
  dropPowBits: 16,              // proof-of-work difficulty when a drop needs one (about a second in a browser)
  dropBodyBytes: 8192,          // largest POST /drop body read
  inboxMax: 500,                // notes kept per mailbox; the oldest give way
  inboxTtlMs: 30 * 86400_000,   // notes older than this are swept (SPEC.md 6)
  queriesPerMin: 120,           // query + mget, per connection
  blindReadsPerMinPerAddr: 20,  // reads of accounts, logins, linkreqs and phones per address tag (SPEC.md 9.4)
  blindReadsPerHourPerPath: 60, // and per blind address, whoever asks
  directoryReadsPerMin: 600,    // profile reads per connection, every path of an mget counted (SPEC.md 9.4 asks for 60;
                                // the page refreshes every contact's profile once a minute, so that would cut off anyone
                                // with more than 60 contacts)
  signupPowBits: 16,            // a new account brings proof of work with this many leading zero bits: about a second of hashing,
                                // which the page does out of sight while the person is still typing (SPEC.md 9.4)
  signupsPerDayPerAddr: 100,    // and, as a backstop only, so many new accounts per address under a salt that turns daily
  chatCreatesPerDay: 200,       // per connection
  searchPerMin: 30,             // per connection
  postsPerMin: 60,              // posts and comments per connection (SPEC.md 9.4 counts per chat; a connection is one person)
  sideWritesPerMin: 120,        // reactions, read marks and typing marks per connection
  invitesPerMinPerAddr: 20,     // chat.invite lookups per address tag (SPEC.md 5.5)
  subsPerConn: 600,
  docsPerSub: 1000,
  queryLimitMax: 1000,
  searchLimitMax: 10,
  mgetMax: 300,
  helloDeadlineMs: 10_000,
  idleMs: 90_000,
  nonceTtlMs: 120_000,
  presenceTtlMs: 24 * 3600_000,
  typingTtlMs: 15_000,
  sweepIntervalMs: 60_000,
  saltRotateMs: 3600_000,
});

export class TokenBucket {
  constructor(capacity, perSecond) {
    this.capacity = capacity;
    this.perSecond = perSecond;
    this.tokens = capacity;
    this.at = Date.now();
  }
  refill(now) {
    const dt = Math.max(0, now - this.at) / 1000;
    this.at = now;
    this.tokens = Math.min(this.capacity, this.tokens + dt * this.perSecond);
  }
  take(n = 1, now = Date.now()) {
    this.refill(now);
    if (this.tokens >= n) { this.tokens -= n; return true; }
    return false;
  }
  peek(now = Date.now()) {
    this.refill(now);
    return this.tokens >= 1;
  }
}

// Many buckets keyed by string; idle buckets are forgotten.
export class BucketMap {
  constructor(capacity, perSecond, idleMs = 10 * 60_000) {
    this.capacity = capacity;
    this.perSecond = perSecond;
    this.idleMs = idleMs;
    this.map = new Map();
  }
  take(key, n = 1, now = Date.now()) {
    let b = this.map.get(key);
    if (!b) { b = new TokenBucket(this.capacity, this.perSecond); this.map.set(key, b); }
    return b.take(n, now);
  }
  peek(key, now = Date.now()) {
    const b = this.map.get(key);
    return b ? b.peek(now) : true;
  }
  tokensLeft(key, now = Date.now()) {
    const b = this.map.get(key);
    if (!b) return this.capacity;
    b.refill(now);
    return b.tokens;
  }
  prune(now = Date.now()) {
    for (const [k, b] of this.map) if (now - b.at > this.idleMs) this.map.delete(k);
  }
  get size() { return this.map.size; }
}

// perMinute → bucket that allows `perMinute` in a burst and refills at that rate.
export const perMinute = (n) => [n, n / 60];

export class AddressTagger {
  constructor() { this.salt = randomBytes(32); this.daySalt = randomBytes(32); }
  rotate() { this.salt = randomBytes(32); }
  rotateDay() { this.daySalt = randomBytes(32); }
  tag(address) {
    const a = typeof address === 'string' ? address : '';
    return createHmac('sha256', this.salt).update(a).digest('base64url').slice(0, 22);
  }
  // A second tag under a salt that turns once a day, for the one limit that must hold across the hour (sign-ups).
  // Like the hourly tag it is never written anywhere and cannot be turned back into the address.
  tagDay(address) {
    const a = typeof address === 'string' ? address : '';
    return createHmac('sha256', this.daySalt).update(a).digest('base64url').slice(0, 22);
  }
}

// Reads the client address for tagging only. Behind Caddy the first value of
// X-Forwarded-For is the client; otherwise the socket's remote address.
export function clientAddress(req, trustProxy) {
  if (trustProxy) {
    const h = req.headers && req.headers['x-forwarded-for'];
    if (typeof h === 'string' && h.length) return h.split(',')[0].trim();
  }
  return (req.socket && req.socket.remoteAddress) || '';
}
