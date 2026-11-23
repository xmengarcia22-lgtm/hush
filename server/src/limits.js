// Rate limiting without addresses on disk (SPEC.md 9.4).
//
// Token buckets live in memory. Pre-authentication limits are keyed by an
// "address tag": HMAC-SHA-256 of the remote address under a random salt that
// rotates every hour and is never written anywhere. The address itself is used
// for the HMAC and dropped.

import { createHmac, randomBytes } from 'node:crypto';
import { isIPv6 } from 'node:net';

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
  maxMediaBytes: 8e9,           // all media on the server (the disk below is shared with hush.db and the system)
  uploadBytesPerDayPerAcct: 4e9,// uploaded (put or copied) per account a day...
  uploadBytesPerDayPerAddr: 8e9,// ...and per address under the daily salt, whichever accounts it holds
  pieceWritesPerMinPerChat: 600,
  pieceReadsPerMinPerAddr: 3000,
  minFreeDisk: 0.10,            // uploads are refused when less than this share of the disk is free...
  minFreeBytes: 5e9,            // ...and less than this many bytes, so a big disk with room to spare keeps working
  diskCheckMs: 5000,            // the disk is looked at again after this long, or...
  diskCheckBytes: 256 << 20,    // ...once this much was admitted since the last look, so a burst can't overshoot the floor
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
  linkreqTtlMs: 10 * 60_000,    // link requests untouched this long are swept (SPEC.md 8.6); the page gives one 5 minutes
  queriesPerMin: 120,           // query + mget, per connection
  blindReadsPerMinPerAddr: 20,  // reads of accounts, logins, linkreqs and phones per address tag (SPEC.md 9.4)
  blindReadsPerHourPerPath: 60, // and per blind address, whoever asks
  linkReadsPerMinPerAddr: 120,  // link requests have their own allowance: a new device and the devices that may let it in poll them
                                // every few seconds, and several of them can share one network address (SPEC.md 9.4)
  linkReadsPerHourPerPath: 2000,// and per link-request address, whoever asks: a device left open all day polls about 500 an hour
  linkAsksPerHourPerAddr: 30,   // link asks (the code a new device shows, written before it signs in, SPEC.md 14.14) per address tag
  directoryReadsPerMin: 600,    // profile reads per connection, every path of an mget counted (SPEC.md 9.4 asks for 60;
                                // the page refreshes every contact's profile once a minute, so that would cut off anyone
                                // with more than 60 contacts)
  signupPowBits: 16,            // a new account brings proof of work with this many leading zero bits: about a second of hashing,
                                // which the page does out of sight while the person is still typing (SPEC.md 9.4)
  signupsPerDayPerAddr: 10,     // and, as a backstop only, so many new accounts per address under a salt that turns daily
  anonBoxesPerDayPerAddr: 50,   // account boxes, vaults, backups and login reservations made before signing in, per address under
  anonBoxBytesPerDayPerAddr: 20e6,// the daily salt: so many rows and so many bytes...
  boxesPerDayPerAcct: 50,       // ...and the same made by a signed-in account, per account, whatever its sockets: the rows
  boxBytesPerDayPerAcct: 20e6,  // name no owner, so nothing else could ever clear them
  socketsPerAddr: 40,           // WebSocket connections open at once per address (a fixed tag): a phone on a flaky network keeps
                                // dead sockets counted until idleMs, and carrier NAT puts several people behind one IPv4
  frameMsPerMinPerAddr: 3000,   // server time the frames of one address may take a minute, and at once, over all its connections
                                // (release 112): an honest minute measured 0.2 to 0.7 s for one or two pages starting with 250 chats
  unsentBytesPerAddr: 64 << 20, // unsent to one address over all its connections past this, its frames wait, and a push to one of them
                                // that holds more than sendBufferBytes closes it (release 112)
  chatCreatesPerDay: 200,       // per account
  bansPerChat: 1000,            // usernames blocked from one group or channel (chat.ban, SPEC.md 5.6)
  searchPerMin: 30,             // per connection
  postsPerMin: 60,              // posts and comments per connection (SPEC.md 9.4 counts per chat; a connection is one person)
  sideWritesPerMin: 120,        // reactions, read marks and typing marks per connection
  callSignalsPerMin: 20,        // call records (offer, answer, end; SPEC.md 16.2) per connection
  relaysPerMinPerAddr: 10,      // call.relay per address tag: one per call on each side
  relaysPerMinPerAcct: 6,       // and per account, whatever its address, so one account can't mint relay credentials in bulk
  relaysPerHourPerAcct: 60,
  pushOpsPerMin: 30,            // push.set, push.clear, wake.mint and wake.revoke per connection
  ticketsPerDevice: 200,        // wake tickets one device may have out at once
  wakePerMinPerTicket: 3,       // POST /wake per ticket: a ring is one request, a retry a second
  wakePerHourPerTicket: 20,
  wakePerMinPerDevice: 4,       // and call rings per phone, whichever tickets ring it (release 93): above one ticket's, so one contact alone never uses it up
  wakePerHourPerDevice: 30,
  wakePerHourPerAddr: 300,      // and per address tag, whichever tickets it holds: one bucket for calls and message nudges alike, charged before the ticket is read, so a refusal says nothing about a ticket (60 before release 65)
  msgPerMinPerTicket: 6,        // POST /wake with a message ticket (kind m): per-ticket buckets of its own, so a chatty contact can never silence calls
  msgPerHourPerTicket: 60,
  wakeBodyBytes: 256,           // largest POST /wake body read
  reportsPerMin: 5,           // report.send per connection (SPEC.md 8.7)
  invitesPerMinPerAddr: 20,     // chat.invite lookups per address tag (SPEC.md 5.5)
  leaveRotateMaxEpoch: 23,      // in a group, the highest epoch a rotation for someone leaving may reach; 24 to 31 stay for removals (SPEC.md 5.6)
  leaveRotateGapMs: 15 * 60_000,// in a channel, a rotation for people leaving comes at least this long after the last one...
  leaveRotatesPerDay: 8,        // ...and at most this many in 24 hours, by the server's clock (SPEC.md 5.6, release 91)
  wrapsPerAcctEpoch: 8,         // key wraps an account below admin adds to a channel per epoch outside chat.rotate, or the square
  wrapsMaxPerAcctEpoch: 32,     // of its listed devices if more (each of its devices wraps for every other), up to this (SPEC.md 5.4),
  wrapsWindowMs: 30 * 86400_000,// counted from the first of them for 30 days, then afresh, so phone changes can't shut a member out
  cardsPerChat: 10000,          // member cards one channel holds (chat.card, chat.ask)...
  cardTtlMs: 30 * 86400_000,    // ...each for 30 days from when it was written (SPEC.md 5.6)
  sweepSideMax: 5000,           // reactions, votes and comments one expiry sweep removes with their messages; the rest wait a minute
  powerNeedsSecure: true,       // owners and admins of groups and channels need a secured account (SPEC.md 4.6); always on in production
  boxGoneMs: 30 * 86400_000,   // a deleted password box's address is remembered this long: asking about it is not a wrong password (SPEC.md 4.5)
  pwMissesPerLogin: 10,         // wrong passwords per login (SPEC.md 4.5), whoever tries them; they come back at this many an hour
  sendBufferBytes: 1 << 20,     // unsent to a connection past this, its frames wait until it drains (release 110): a slow reader is slowed
  sendBufferMaxBytes: 32 << 20, // past this unsent, a push (a frame the client did not ask for) closes the connection; replies and first loads are
                                // never checked against it: they go out with at most sendBufferBytes unsent and hold at most answerBytes, so pushes have room
  answerBytes: 24 << 20,        // one answer's documents (an mget, a query, a watch's first load): past this, toolarge
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
  callTtlMs: 60_000,            // a call record's life in memory: call setup is over well within it
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
  // Takes n whatever is left, below zero if need be: for what is only known once it is spent (bytes counted, time taken). Never below
  // minus the capacity, so whoever took from it is at most one capacity's refill from being served again, however much they took: a
  // flood that goes on being refused would otherwise keep its address out long after it ends.
  spend(key, n, now = Date.now()) {
    this.take(key, 0, now);
    const b = this.map.get(key);
    b.tokens = Math.max(b.tokens - n, -this.capacity);
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

// The address as it is counted: an IPv6 address by its /64, since one home or phone holds that many addresses and a
// count per address would be no count at all; an IPv4 address (mapped into IPv6 or not) as itself.
export function netOf(address) {
  let a = typeof address === 'string' ? address.split('%')[0] : '';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(a);
  if (mapped) return mapped[1];
  if (!isIPv6(a)) return a;
  if (a.includes('.')) a = a.slice(0, a.lastIndexOf(':') + 1) + '0:0';   // an embedded IPv4 sits past the first 64 bits
  const [l, r = ''] = a.split('::'), left = l ? l.split(':') : [], right = r ? r.split(':') : [];
  return [...left, ...Array(8 - left.length - right.length).fill('0'), ...right].slice(0, 4).map((h) => parseInt(h, 16).toString(16)).join(':') + '::/64';
}

export class AddressTagger {
  constructor() { this.salt = randomBytes(32); this.daySalt = randomBytes(32); this.fixedSalt = randomBytes(32); }
  rotate() { this.salt = randomBytes(32); }
  rotateDay() { this.daySalt = randomBytes(32); }
  tag(address) { return createHmac('sha256', this.salt).update(netOf(address)).digest('base64url').slice(0, 22); }
  // A tag under a salt made once and never turned, for a count of what is open right now (sockets): a count keyed by a
  // turning tag would start over at every turn while the old sockets kept their old key. Since release 112 it also keys the address's
  // server time and refusal allowance, which outlast its sockets by up to a little over an hour (server.js). Still never written anywhere.
  tagFixed(address) { return createHmac('sha256', this.fixedSalt).update(netOf(address)).digest('base64url').slice(0, 22); }
  // A second tag under a salt that turns once a day, for the limits that must hold across the hour (sign-ups, anonymous
  // boxes, upload budgets). Like the hourly tag it is never written anywhere and cannot be turned back into the address.
  tagDay(address) { return createHmac('sha256', this.daySalt).update(netOf(address)).digest('base64url').slice(0, 22); }
  // A short name under the same daily salt (call.relay's relay username): stable for a day, unlinkable after it.
  dayName(s) { return createHmac('sha256', this.daySalt).update(String(s)).digest('hex').slice(0, 16); }
}

// Reads the client address for tagging only. Behind Caddy the LAST value of X-Forwarded-For is the client: Caddy appends
// the peer it saw (and, with trusted_proxies set, drops whatever a client sent itself), while the first value is whatever
// the client wrote. Without a proxy, or when the last field is empty, the socket's remote address. The header counts only from
// a peer on this machine, where the proxy is (release 112): anyone else reaching Node could write any address into it, and
// every per-address limit is keyed on what this returns.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
export function clientAddress(req, trustProxy) {
  const peer = (req.socket && req.socket.remoteAddress) || '';
  if (trustProxy && LOOPBACK.has(peer)) {
    const h = req.headers && req.headers['x-forwarded-for'];
    if (typeof h === 'string') { const last = h.split(',').pop().trim(); if (last) return last; }
  }
  return peer;
}
