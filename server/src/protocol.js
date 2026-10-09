// One WebSocket connection (SPEC.md 7). Parses frames, enforces the hello
// handshake, the sign-in proof, per-connection rate limits and the idle
// timeout, dispatches ops to the store, and sends acknowledgements. Pushes for
// live subscriptions are sent by the subscription registry while a write is
// being applied, so a writer who also subscribes sees the push before the
// acknowledgement.

import { randomBytes, createHash } from 'node:crypto';
import { HushError, fail } from './errors.js';
import { log } from './log.js';
import { TokenBucket } from './limits.js';
import { SYSTEM } from './store.js';
import { verifyProof, HANDLE } from './identity.js';
import { ID } from './paths.js';
import { rankOf } from './authz.js';
import { clientLimits } from './media.js';
import { leadingZeroBits } from './drops.js';

const NONCE = /^[A-Za-z0-9_-]{1,64}$/;

export const PROTOCOL_VERSION = 1;
const OPEN = 1;
const MAX_BAD_FRAMES = 5;

// Not part of the protocol: notes are watched through `sub` on inbox/<h>/c and written through
// POST /drop (SPEC.md 6), so the pull-and-ack ops once planned were never needed.
const NOT_YET = ['mail.pull', 'mail.ack'];

function takeQuery(c) {
  if (!c.queries.take()) fail('ratelimit', 'too many queries, slow down');
}

// The per-path limits of SPEC.md 9.4. Blind addresses (account boxes, login reservations, link requests, phone
// entries) are guessable by whoever knows the login or number, so lookups are counted per address tag and per
// path; profile reads are counted per connection, every path of an mget included, so the directory cannot be
// walked; posts and the side rows have their own per-connection rates.
const BLIND = /^(?:accounts|logins|linkreqs|phones)\//;
const DIRECTORY = /^directory\//;
const CHAT_WRITE = /^channels\/[^/]+\/(posts|comments|acts|reads|typing)(?:\/|$)/;
function takeRead(c, p) {
  if (typeof p !== 'string') return;
  if (BLIND.test(p)) {
    if (!c.ctx.blindReads.take(c.addrTag)) fail('ratelimit', 'too many lookups from here; slow down');
    if (!c.ctx.blindPaths.take(p)) fail('ratelimit', 'that address is being looked up too often; try again later');
  } else if (DIRECTORY.test(p) && !c.dirReads.take()) fail('ratelimit', 'too many profile lookups; slow down');
}
function takeWrite(c, p) {
  const m = CHAT_WRITE.exec(typeof p === 'string' ? p : '');
  if (!m) return;
  if (m[1] === 'posts' || m[1] === 'comments') { if (!c.posts.take()) fail('ratelimit', 'too many messages; slow down'); }
  else if (!c.sides.take()) fail('ratelimit', 'too many marks; slow down');
}
// A `set` that would create a profile is a sign-up. It brings proof of work (SPEC.md 9.4): a nonce such that
// sha256("hush-signup-v1|<this connection's salt>|<nonce>") starts with `signupPowBits` zero bits. The policy refuses
// the create without it (answering `pow` with the salt and bits, so the page can solve and try again); a solution is
// good for one account. The per-address daily count is only a backstop behind it.
const isSignup = (c, p) => !!c.mayCreate && p === 'directory/' + c.mayCreate && !c.ctx.store.get(p, SYSTEM).d;

const HANDLERS = {
  hello(c, f) {
    if (c.helloed) fail('conflict', 'already said hello');
    if (f.v !== PROTOCOL_VERSION) fail('version', 'unsupported protocol version');
    if (!c.ctx.helloBuckets.take(c.addrTag)) fail('ratelimit', 'too many connections from here, try again shortly');
    c.helloed = true;
    clearTimeout(c.helloTimer);
    c.nonce = randomBytes(32).toString('base64url');
    c.nonceAt = c.ctx.now();
    const L = c.limits;
    return {
      nonce: c.nonce,
      now: c.nonceAt,
      v: PROTOCOL_VERSION,
      limits: { maxFrameBytes: L.maxFrameBytes, mgetMax: L.mgetMax, queryLimitMax: L.queryLimitMax, subsPerConn: L.subsPerConn, docsPerSub: L.docsPerSub, idleMs: L.idleMs },
      badges: c.ctx.badges || {},   // who carries a badge next to their name: the operator's list (SPEC.md 12.3), never a profile field
    };
  },

  // SPEC.md 4.1. One username per connection; a different account means a new connection.
  async prove(c, f) {
    if (c.proven) fail('conflict', 'this connection already acts for an account; open a new connection to switch');
    if (c.proving) fail('conflict', 'a proof is already in progress');
    if (!c.nonce || c.ctx.now() - c.nonceAt > c.limits.nonceTtlMs) fail('unauth', 'the sign-in challenge expired; reconnect');
    if (!c.ctx.proveFails.peek(c.addrTag)) fail('ratelimit', 'too many failed sign-ins from here; wait a few minutes');
    c.proving = true;
    try {
      const dir = typeof f.h === 'string' && HANDLE.test(f.h) ? c.ctx.store.get('directory/' + f.h, SYSTEM).d : null;
      let r;
      try {
        r = await verifyProof({ dir, h: f.h, dev: f.dev, pub: f.pub, sig: f.sig, nonce: c.nonce });
      } catch (e) {
        if (e instanceof HushError && e.code === 'denied') c.ctx.proveFails.take(c.addrTag);
        throw e;
      }
      c.proven = f.h;
      c.provedWith = r.via;
      c.pub = r.pub;
      c.mayCreate = r.via === 'signup' ? f.h : null;
      c.nonce = null;                                   // single use
      return { h: f.h, via: r.via };
    } finally {
      c.proving = false;
    }
  },

  ping(c) { return { now: c.ctx.now() }; },

  get(c, f) { takeRead(c, f.p); return c.ctx.store.get(f.p, c.actor()); },

  mget(c, f) {
    takeQuery(c);
    if (!Array.isArray(f.ps)) fail('invalid', 'mget: "ps" must be a list of paths');
    for (const p of f.ps) takeRead(c, p);
    return { docs: c.ctx.store.mget(f.ps, c.actor()) };
  },

  set(c, f) {
    if (typeof f.p === 'string' && f.p.startsWith('inbox/') && !c.drops.take()) fail('ratelimit', 'too many pointers dropped; slow down');
    takeWrite(c, f.p);
    const actor = c.actor(), creating = isSignup(c, f.p);
    if (creating) {
      actor.signupProof = c.signupProofOk(f.pow);
      if (actor.signupProof && !c.ctx.signups.take(c.dayTag)) fail('ratelimit', 'too many new accounts from here today');   // the backstop
      actor.signupPow = c.signupChallenge();
    }
    c.ctx.store.set(f.p, f.d, actor);
    if (creating) c.signupPow = null;
    return {};
  },

  // The sign-up puzzle, for a page to solve while the person is still filling in the form.
  'signup.pow'(c) { return c.signupChallenge(); },
  update(c, f) { takeWrite(c, f.p); c.ctx.store.update(f.p, f.d, c.actor()); return {}; },
  delete(c, f) { c.ctx.store.delete(f.p, { ot: f.ot }, c.actor()); return {}; },
  add(c, f) { takeWrite(c, f.p); return c.ctx.store.add(f.p, f.d, c.actor()); },

  query(c, f) {
    takeQuery(c);
    if (f.p === 'search' && !c.search.take()) fail('ratelimit', 'too many searches; slow down');
    return { docs: c.ctx.store.query(f.p, { w: f.w, o: f.o, l: f.l }, c.actor()) };
  },

  sub(c, f) {
    const s = f.s;
    if (!(Number.isInteger(s) || (typeof s === 'string' && s.length > 0 && s.length <= 32))) fail('invalid', 'sub: bad "s"');
    const { spec, init } = c.ctx.store.prepareSub({ p: f.p, ids: f.ids, w: f.w, o: f.o, l: f.l }, c.actor());
    c.ctx.subs.add(c, { s, ...spec });
    return { __after: () => c.send({ s, t: 'init', docs: init }) };
  },

  unsub(c, f) {
    c.ctx.subs.remove(c, f.s);
    return {};
  },

  // ---- room keys (SPEC.md 5) ----
  'chat.create'(c, f) {
    if (!c.creates.take()) fail('ratelimit', 'too many new chats today');
    const r = c.ctx.store.createChat({ cid: f.cid, d: f.d, caps: f.caps }, c.actor());
    c.chats.set(f.cid, { level: r.level, epoch: r.epoch, type: r.type });
    return { level: r.level, epoch: r.epoch };
  },
  'chat.open'(c, f) {
    if (!c.ctx.openFails.peek(c.addrTag)) fail('ratelimit', 'too many wrong chat keys from here; wait a minute');
    let r;
    try { r = c.ctx.store.openChat({ cid: f.cid, cap: f.cap }, c.actor()); }
    catch (e) { if (e instanceof HushError && e.code === 'denied') c.ctx.openFails.take(c.addrTag); throw e; }
    c.chats.set(f.cid, r);
    return { level: r.level, epoch: r.epoch };
  },
  'chat.invite'(c, f) {
    takeQuery(c);
    if (!c.ctx.invites.take(c.addrTag)) fail('ratelimit', 'too many invite lookups from here; wait a minute');
    return c.ctx.store.inviteOf({ cid: f.cid, iid: f.iid }, c.actor());
  },
  'chat.join'(c, f) {
    if (!c.ctx.openFails.peek(c.addrTag)) fail('ratelimit', 'too many wrong invite links from here; wait a minute');
    try { return c.ctx.store.joinChat({ cid: f.cid, iid: f.iid, proof: f.proof, wraps: f.wraps }, c.actor()); }
    catch (e) { if (e instanceof HushError && e.code === 'denied') c.ctx.openFails.take(c.addrTag); throw e; }
  },
  'chat.rotate'(c, f) {
    const r = c.ctx.store.rotateChat({ cid: f.cid, epoch: f.epoch, keys: f.keys, cap: f.cap, meta: f.meta, openKeys: f.openKeys }, c.actor());
    const e = c.chats.get(f.cid);
    if (e) c.chats.set(f.cid, { ...e, epoch: r.epoch });
    return r;
  },
  'chat.base'(c, f) {
    return c.ctx.store.setBase({ cid: f.cid, cap: f.cap }, c.actor());
  },
  'chat.admins'(c, f) {
    return c.ctx.store.setAdmins({ cid: f.cid, akeys: f.akeys, cap: f.cap }, c.actor());
  },

  // ---- media over HTTP (SPEC.md 7.7): a short-lived ticket that lets HTTP requests act with this connection's
  // level for one chat. The level is checked again on every request, so the ticket grants nothing by itself.
  'media.ticket'(c, f) {
    if (!c.proven) fail('unauth', 'sign in first');
    if (typeof f.cid !== 'string' || !ID.CID.test(f.cid)) fail('invalid', 'media.ticket: bad chat id');
    const st = c.ctx.store;
    if (st.authz && st.authz.mode === 'standard' && !rankOf(c.actor(), f.cid)) fail('denied', 'open this chat with its key first');
    if (!c.ctx.tickets) fail('invalid', 'media is not served here');
    return { ...c.ctx.tickets.issue(c, f.cid), limits: clientLimits(c.limits.media) };
  },
};
for (const op of NOT_YET) HANDLERS[op] = () => fail('invalid', `"${op}" is not part of the protocol; watch inbox/<h>/c and use POST /drop`);

export class Connection {
  // ctx: { store, subs, limits, helloBuckets, proveFails, openFails, blindReads, blindPaths, signups, invites, tickets, addrTag, dayTag, now, badges, onClose }
  constructor(ws, ctx) {
    this.ws = ws;
    this.ctx = ctx;
    this.limits = ctx.limits;
    this.addrTag = ctx.addrTag;
    this.dayTag = ctx.dayTag;
    this.helloed = false;
    this.nonce = null;
    this.nonceAt = 0;
    this.proven = null;        // handle this connection acts for
    this.provedWith = null;    // 'account' | 'device' | 'signup'
    this.pub = null;           // the account public key behind the proof
    this.mayCreate = null;     // handle this connection may create (sign-up)
    this.signupPow = null;     // { salt, bits }: the puzzle a sign-up on this connection solves, once
    this.proving = false;
    this.chats = new Map();    // cid → { level, epoch, type }
    this.closed = false;
    this.cleaned = false;
    this.badCount = 0;
    const L = this.limits;
    this.frames = new TokenBucket(L.framesPerMin, L.framesPerMin / 60);
    this.bytes = new TokenBucket(L.bytesPerMin, L.bytesPerMin / 60);
    this.queries = new TokenBucket(L.queriesPerMin, L.queriesPerMin / 60);
    this.drops = new TokenBucket(L.dropsPerHour, L.dropsPerHour / 3600);
    this.dirReads = new TokenBucket(L.directoryReadsPerMin, L.directoryReadsPerMin / 60);
    this.search = new TokenBucket(L.searchPerMin, L.searchPerMin / 60);
    this.posts = new TokenBucket(L.postsPerMin, L.postsPerMin / 60);
    this.sides = new TokenBucket(L.sideWritesPerMin, L.sideWritesPerMin / 60);
    this.creates = new TokenBucket(L.chatCreatesPerDay, L.chatCreatesPerDay / 86400);
    this.helloTimer = setTimeout(() => this.close('hello timeout'), L.helloDeadlineMs);
    this.idleTimer = null;
    this.touch();
    ws.on('message', (data, isBinary) => this.onMessage(data, isBinary));
    ws.on('close', () => this.cleanup());
    ws.on('error', () => { /* socket errors are not logged: they can carry addresses */ });
  }

  signupChallenge() {
    if (!this.signupPow) this.signupPow = { salt: randomBytes(16).toString('base64url'), bits: this.limits.signupPowBits };
    return this.signupPow;
  }
  signupProofOk(nonce) {
    const sp = this.signupPow;
    if (!sp || typeof nonce !== 'string' || !NONCE.test(nonce)) return false;
    return leadingZeroBits(createHash('sha256').update(`hush-signup-v1|${sp.salt}|${nonce}`, 'utf8').digest()) >= sp.bits;
  }

  // The identity view handed to the store's authorization checks.
  actor() {
    return { handle: this.proven, viaAccountKey: this.provedWith === 'account' || this.provedWith === 'signup', mayCreate: this.mayCreate, pub: this.pub, chats: this.chats, conn: this };
  }

  // Called by the server when a rotation or deletion revokes this connection's level.
  evict(cid) {
    if (!this.chats.delete(cid)) return false;
    this.ctx.subs.removeWhere(this, (sub) => sub.parent.startsWith('channels/' + cid + '/') || (sub.parent === 'channels' && sub.ids && sub.ids.has(cid)));
    this.send({ t: 'evict', cid });
    return true;
  }

  touch() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.close('idle'), this.limits.idleMs);
  }

  send(obj) {
    if (this.ws.readyState === OPEN) this.ws.send(JSON.stringify(obj));
  }

  close(reason) {
    if (this.closed) return;
    this.closed = true;
    this.send({ t: 'bye', reason });
    try { this.ws.close(1000, reason); } catch { /* already closing */ }
    const t = setTimeout(() => { try { this.ws.terminate(); } catch { /* gone */ } }, 500);
    if (t.unref) t.unref();
    this.cleanup();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    this.closed = true;
    clearTimeout(this.helloTimer);
    clearTimeout(this.idleTimer);
    this.ctx.subs.removeConn(this);
    if (this.ctx.onClose) this.ctx.onClose(this);
  }

  rejectFrame(frame) {
    this.send(frame);
    if (++this.badCount >= MAX_BAD_FRAMES) this.close('too many bad frames');
  }

  finish(i, result) {
    const { __after, ...rest } = result || {};
    this.send({ i, ok: true, ...rest });
    if (__after) __after();
  }

  replyError(i, e) {
    if (e instanceof HushError) {
      const out = { i, ok: false, e: e.code, m: e.message };
      if (e.code === 'pow') { out.bits = e.bits; out.salt = e.salt; }   // the puzzle to solve, then try again
      return this.send(out);
    }
    log.error('frame.failed', e);
    this.send({ i, ok: false, e: 'internal', m: 'internal error' });
  }

  onMessage(data, isBinary) {
    try {
      this.handleFrame(data, isBinary);
    } catch (e) {
      // Nothing in handleFrame should throw past its own guards; if it does,
      // close rather than leave the socket in an undefined state.
      log.error('connection.failed', e);
      this.close('internal error');
    }
  }

  handleFrame(data, isBinary) {
    if (this.closed) return;
    this.touch();
    const size = data.length;
    let f;
    try { f = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)); }
    catch { return this.rejectFrame({ ok: false, e: 'invalid', m: 'frame is not JSON' }); }
    if (isBinary || !f || typeof f !== 'object' || Array.isArray(f)) return this.rejectFrame({ ok: false, e: 'invalid', m: 'frame must be a JSON object' });
    if (!Number.isInteger(f.i) || typeof f.op !== 'string') return this.rejectFrame({ ok: false, e: 'invalid', m: 'frame needs an integer "i" and a string "op"' });
    const i = f.i;
    if (!this.frames.take() || !this.bytes.take(size)) return this.send({ i, ok: false, e: 'ratelimit', m: 'slow down' });
    let result;
    try {
      if (!this.helloed && f.op !== 'hello') fail('unauth', 'say hello first');
      const h = Object.prototype.hasOwnProperty.call(HANDLERS, f.op) ? HANDLERS[f.op] : null;
      if (!h) fail('invalid', 'unknown op');
      result = h(this, f);
    } catch (e) {
      return this.replyError(i, e);
    }
    if (result && typeof result.then === 'function') {
      result.then((r) => this.finish(i, r), (e) => this.replyError(i, e));
      return;
    }
    this.finish(i, result);
  }
}
