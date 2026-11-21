// One WebSocket connection (SPEC.md 7). Parses frames, enforces the hello
// handshake, the sign-in proof, per-connection rate limits and the idle
// timeout, dispatches ops to the store, and sends acknowledgements. Pushes for
// live subscriptions are sent by the subscription registry while a write is
// being applied, so a writer who also subscribes sees the push before the
// acknowledgement.

import { randomBytes, createHash, createHmac } from 'node:crypto';
import { HushError, fail } from './errors.js';
import { log } from './log.js';
import { TokenBucket } from './limits.js';
import { SYSTEM } from './store.js';
import { verifyProof, HANDLE } from './identity.js';
import { ID } from './paths.js';
import { rankOf, chatTypeOf } from './authz.js';
import { clientLimits } from './media.js';
import { leadingZeroBits } from './drops.js';
import { DEV_ID } from './schemas.js';
import { byteLength } from './merge.js';

const NONCE = /^[A-Za-z0-9_-]{1,64}$/;

export const PROTOCOL_VERSION = 1;
const OPEN = 1;
const MAX_BAD_FRAMES = 5;
const HEAD_I = /"i"\s*:\s*(-?\d{1,15})(?![\d.eE])/;   // a frame's i, read from its first bytes: the adapter sends it first
const PING = /^\{"i":(0|[1-9]\d{0,14}),"op":"ping"\}$/;   // the adapter's keep-alive, byte for byte (no leading zero: that is not JSON): the one frame answered over the frame allowance

// Not part of the protocol: notes are watched through `sub` on inbox/<h>/c and written through
// POST /drop (SPEC.md 6), so the pull-and-ack ops once planned were never needed.
const NOT_YET = ['mail.pull', 'mail.ack'];

function takeQuery(c, n = 1) {
  if (!c.queries.take(n)) fail('ratelimit', 'too many queries, slow down');
}
// An answer refused for its size was read up to the cap and is paid for (replyError): until it is paid off, the connection's mget, query
// and sub are refused before anything is read, so refusals can't keep the single thread busy; its other frames go on (release 110).
function answerOk(c) {
  if (!c.refusals.peek()) fail('ratelimit', 'slow down');
}

// The per-path limits of SPEC.md 9.4. Blind addresses (account boxes, login reservations, link requests, phone
// entries) are guessable by whoever knows the login or number, so lookups are counted per address tag and per
// path; profile reads are counted per connection, every path of an mget included, so the directory cannot be
// walked; posts and the side rows have their own per-connection rates.
const BLIND = /^(?:accounts|logins|phones|recovery)\//;
const BOX = /^(?:accounts|vault|backup|logins)\//;   // the rows anyone may make before signing in, up to 2 MB each
const LINKREQ = /^linkreqs\//;
const DIRECTORY = /^directory\//;
const CHAT_WRITE = /^channels\/[^/]+\/(posts|comments|acts|reads|typing|call)(?:\/|$)/;
function takeRead(c, p) {
  if (typeof p !== 'string') return;
  if (LINKREQ.test(p)) {   // polled every few seconds by the devices on both ends, so counted apart from the other blind lookups
    if (!c.ctx.linkReads.take(c.addrTag)) fail('ratelimit', 'too many login-request lookups from here; slow down');
    if (!c.ctx.linkPaths.take(p)) fail('ratelimit', 'that login request is being looked up too often; try again later');
  } else if (BLIND.test(p)) {
    if (!c.ctx.blindReads.take(c.addrTag)) fail('ratelimit', 'too many lookups from here; slow down');
    if (!c.ctx.blindPaths.take(p)) fail('ratelimit', 'that address is being looked up too often; try again later');
  } else if (DIRECTORY.test(p) && !c.dirReads.take()) fail('ratelimit', 'too many profile lookups; slow down');
}
function takeWrite(c, p) {
  const m = CHAT_WRITE.exec(typeof p === 'string' ? p : '');
  if (!m) return;
  if (m[1] === 'posts' || m[1] === 'comments') { if (!c.posts.take()) fail('ratelimit', 'too many messages; slow down'); }
  else if (m[1] === 'call') { if (!c.calls.take()) fail('ratelimit', 'too many call signals; slow down'); }
  else if (!c.sides.take()) fail('ratelimit', 'too many marks; slow down');
}
// A `set` that would create a profile is a sign-up. It brings proof of work (SPEC.md 9.4): a nonce such that
// sha256("hush-signup-v1|<this connection's salt>|<nonce>") starts with `signupPowBits` zero bits. The policy refuses
// the create without it (answering `pow` with the salt and bits, so the page can solve and try again); a solution is
// good for one account. The per-address daily count is only a backstop behind it.
// A power role (owner or admin of a group or channel) needs a secured account (SPEC.md 4.6). The server can't see a
// password, so it checks the mark the account sets once its password was checked as strong.
// powerNeedsSecure: false switches the rule off for development and tests only; production ignores it.
const secured = (c) => (!c.limits.powerNeedsSecure && process.env.NODE_ENV !== 'production') || !c.proven || !(c.ctx.store.authz && c.ctx.store.authz.mode === 'standard') || !!c.ctx.store.get('secure/' + c.proven, SYSTEM).d;
const isSignup = (c, p) => !!c.mayCreate && p === 'directory/' + c.mayCreate && !c.ctx.store.get(p, SYSTEM).d;
const hasAccount = (c) => { const d = !!c.proven && c.ctx.store.get('directory/' + c.proven, SYSTEM).d; return !!d && d.gone === undefined; };   // a tombstone is no account (4.7)
// The push ops (push.set, push.clear, wake.mint, wake.revoke) need an account that exists and share one bucket.
const PUSH_TOKEN = /^[0-9a-f]{64}$/i;
function takePush(c) {
  if (!hasAccount(c)) fail('unauth', 'sign in first');
  if (!c.pushOps.take()) fail('ratelimit', 'too many push changes; slow down');
}
const devOf = (f, op) => { if (typeof f.dev !== 'string' || !DEV_ID.test(f.dev)) fail('invalid', `${op}: bad device id`); return f.dev; };
const kindOf = (f, op) => { if (f.kind !== undefined && f.kind !== 'voip' && f.kind !== 'alert') fail('invalid', `${op}: bad kind`); return f.kind === undefined ? 'voip' : f.kind; };

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
      limits: { maxFrameBytes: L.maxFrameBytes, mgetMax: L.mgetMax, queryLimitMax: L.queryLimitMax, subsPerConn: L.subsPerConn, docsPerSub: L.docsPerSub, idleMs: L.idleMs, framesPerMin: L.framesPerMin },
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
      // A deleted account (4.7) keeps its public keys for old messages, never for signing in; nor is the name free again.
      if (dir && dir.gone !== undefined) fail('gone', 'this account was deleted');
      let r;
      try {
        r = await verifyProof({ dir, h: f.h, dev: f.dev, pub: f.pub, sig: f.sig, nonce: c.nonce });
      } catch (e) {
        if (e instanceof HushError && e.code === 'denied') c.ctx.proveFails.take(c.addrTag);
        throw e;
      }
      // The keys may have changed while the signature was checked (a device removal, release 21): a proof read against
      // the old ones is refused, and the connection remembers which key version it was proven for (server.js closes
      // it when that version is left behind).
      const dir2 = c.ctx.store.get('directory/' + f.h, SYSTEM).d;
      if (dir2 && dir2.gone !== undefined) fail('gone', 'this account was deleted');
      if (!dir && dir2) fail('denied', 'that username was just taken; reconnect');
      if (dir && (!dir2 || dir2.kv !== dir.kv || !dir2.sig || dir2.sig.x !== dir.sig.x || dir2.sig.y !== dir.sig.y)) fail('denied', 'the account keys changed while signing in; reconnect');
      c.kv = dir2 ? (dir2.kv === undefined ? 1 : dir2.kv) : 1;
      c.proven = f.h;
      c.provedWith = r.via;
      c.dev = r.via === 'device' ? f.dev : null;
      c.pub = r.pub;
      c.mayCreate = r.via === 'signup' ? f.h : null;
      c.nonce = null;                                   // single use
      return { h: f.h, via: r.via, kv: c.kv };
    } finally {
      c.proving = false;
    }
  },

  ping(c) { return { now: c.ctx.now() }; },

  get(c, f) { takeRead(c, f.p); return c.ctx.store.get(f.p, c.actor()); },

  mget(c, f) {
    answerOk(c);
    takeQuery(c);
    if (!Array.isArray(f.ps)) fail('invalid', 'mget: "ps" must be a list of paths');
    for (const p of f.ps) takeRead(c, p);
    return { docs: c.ctx.store.mget(f.ps, c.actor()) };
  },

  set(c, f) {
    // A note to yourself (own: 1) is bounded by inboxMax, not the bucket: the page rewrites its whole chat list after a key change (release 21).
    if (typeof f.p === 'string' && f.p.startsWith('inbox/') && !(f.d && f.d.own === 1) && !c.drops.take()) fail('ratelimit', 'too many pointers dropped; slow down');
    takeWrite(c, f.p);
    // A link ask (SPEC.md 14.14) is the one record a connection writes before signing in: counted per address, so no one place fills the table.
    if (typeof f.p === 'string' && LINKREQ.test(f.p) && f.d && f.d.state === 'ask' && !c.ctx.linkAsks.take(c.addrTag)) fail('ratelimit', 'too many link codes shown from here; wait a while');
    // A new box (SPEC.md 4.3) needs no proof and no puzzle, so it is the one way to fill hush.db with rows nobody can tie
    // to anyone: none is made on a nearly full disk, a connection that hasn't signed in makes so many a day, so many bytes,
    // per address under the daily salt, and a signed-in one so many per account, whatever its sockets. A replaced box
    // grows a row that is already there and is not counted.
    if (typeof f.p === 'string' && BOX.test(f.p) && !c.ctx.store.get(f.p, SYSTEM).d) {
      if (!c.ctx.disk.ok()) fail('full', 'the server is out of space right now');
      const n = byteLength(f.d ?? null), B = c.ctx.boxes;
      if (c.proven ? !B.acct.take(c.proven) || !B.acctBytes.take(c.proven, n) : !B.anon.take(c.dayTag) || !B.anonBytes.take(c.dayTag, n)) fail('ratelimit', c.proven ? 'too many new boxes today' : 'too many new boxes from here today');
    }
    const actor = c.actor(), creating = isSignup(c, f.p);
    if (f.was !== undefined) actor.was = f.was;   // the version a write was merged from (backups); checked, never stored
    if (creating) {
      actor.signupProof = c.signupProofOk(f.pow);
      if (actor.signupProof && !c.ctx.signups.take(c.dayTag)) fail('ratelimit', 'too many new accounts from here today');   // the backstop
      actor.signupPow = c.signupChallenge();
    }
    c.ctx.store.set(f.p, f.d, actor);
    if (creating) c.signupPow = null;
    return {};
  },

  // ---- password boxes (SPEC.md 4.5) ----
  // A box lives at HMAC(server secret, login tag | stretched password). The page sends the tag and the stretched password
  // (never the password); only this server can turn them into an address, so guesses have to come through here, and a
  // guess that finds no box is counted against that login, whoever makes it. While a login is out of tries every answer
  // waits, the right password included, so the wait tells nothing about which guess was right.
  'login.gate'(c, f) {
    if (typeof f.t !== 'string' || !ID.ADDR43.test(f.t) || typeof f.x !== 'string' || !ID.ADDR43.test(f.x)) fail('invalid', 'login.gate: "t" and "x" must be 43-character addresses');
    const { pwMisses, blindReads, store } = c.ctx;
    if (!blindReads.take(c.addrTag)) fail('ratelimit', 'too many lookups from here; slow down');
    if (!pwMisses.peek(f.t)) {
      const mins = Math.max(1, Math.ceil((1 - pwMisses.tokensLeft(f.t)) / (c.limits.pwMissesPerLogin / 3600) / 60));
      fail('ratelimit', 'too many wrong passwords for this login; wait ' + mins + ' minute' + (mins === 1 ? '' : 's'));
    }
    const loc = createHmac('sha256', store.addrKey).update('hush-login-gate-v1|' + f.t + '|' + f.x).digest('base64url');
    // No box: a wrong guess, counted. Two asks are not new guesses and are not counted: an address whose box this login
    // had until a password change (a device still holding it), and the same address asked again within the hour. The
    // answer is the same either way. A box found proves nothing about who asks: anyone may store one (4.3).
    if (!store.get('accounts/' + loc, SYSTEM).d && !store.boxWasHere(loc) && c.ctx.pwRepeats.take(f.t + '|' + loc)) pwMisses.take(f.t);
    return { loc };
  },

  // The sign-up puzzle, for a page to solve while the person is still filling in the form.
  'signup.pow'(c) { return c.signupChallenge(); },

  update(c, f) { takeWrite(c, f.p); c.ctx.store.update(f.p, f.d, c.actor()); return {}; },
  delete(c, f) { c.ctx.store.delete(f.p, { ot: f.ot }, c.actor()); return {}; },
  add(c, f) { takeWrite(c, f.p); return c.ctx.store.add(f.p, f.d, c.actor()); },

  query(c, f) {
    answerOk(c);
    takeQuery(c);
    if (f.p === 'search' && !c.search.take()) fail('ratelimit', 'too many searches; slow down');
    return { docs: c.ctx.store.query(f.p, { w: f.w, o: f.o, l: f.l }, c.actor()) };
  },

  sub(c, f) {
    const s = f.s;
    if (!(Number.isInteger(s) || (typeof s === 'string' && s.length > 0 && s.length <= 32))) fail('invalid', 'sub: bad "s"');
    answerOk(c);
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
    if (f.d && f.d.type !== 'dm' && !secured(c)) fail('secure', 'owning a group or channel needs a stronger password; secure your account first');
    if (!c.proven) fail('unauth', 'sign in first');
    if (!c.ctx.creates.take(c.proven)) fail('ratelimit', 'too many new chats today');   // per account, whatever the socket
    const r = c.ctx.store.createChat({ cid: f.cid, d: f.d, caps: f.caps }, c.actor());
    c.chats.set(f.cid, { level: r.level, epoch: r.epoch, type: r.type, h: r.h });
    return { level: r.level, epoch: r.epoch };
  },
  'chat.open'(c, f) {
    if (!c.ctx.openFails.peek(c.addrTag)) fail('ratelimit', 'too many wrong chat keys from here; wait a minute');
    let r;
    try { r = c.ctx.store.openChat({ cid: f.cid, cap: f.cap }, c.actor()); }
    // A connection that already holds the chat is not guessing: the page may try a better key it may hold (an owner key).
    catch (e) { if (e instanceof HushError && e.code === 'denied' && !c.chats.has(f.cid)) c.ctx.openFails.take(c.addrTag); throw e; }
    // A blocked username's member key is the right key, so this is not counted as a wrong one (SPEC.md 5.6). It goes by the
    // level the key gave: an owner or admin key is never refused, not even one held at member level below.
    if (r.level === 'member' && c.ctx.store.isBanned(f.cid, c.proven)) fail('denied', 'you were removed from this chat');
    // An owner or admin whose account isn't secured opens at member level: their tools wait, and `held` says why. The connection
    // keeps it, so a channel's member and blocked lists still reach it (authz.js).
    if (r.type !== 'dm' && (r.level === 'owner' || r.level === 'admin') && !secured(c)) {
      const held = r.level;
      r = { ...r, level: 'member', held };
      c.chats.set(f.cid, r);
      return { level: r.level, epoch: r.epoch, held };
    }
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
  // Counted with the messages: a channel's key changes have no cap now (release 91), and each one evicts every other connection.
  'chat.rotate'(c, f) {
    if (!c.posts.take()) fail('ratelimit', 'too many key changes; slow down');
    const r = c.ctx.store.rotateChat({ cid: f.cid, epoch: f.epoch, keys: f.keys, cap: f.cap, meta: f.meta, openKeys: f.openKeys, why: f.why, back: f.back, invites: f.invites, prune: f.prune }, c.actor());
    const e = c.chats.get(f.cid);
    if (e) c.chats.set(f.cid, { ...e, epoch: r.epoch, h: r.h });
    return { epoch: r.epoch };
  },
  'chat.base'(c, f) {
    return c.ctx.store.setBase({ cid: f.cid, cap: f.cap }, c.actor());
  },
  'chat.admins'(c, f) {
    return c.ctx.store.setAdmins({ cid: f.cid, akeys: f.akeys, cap: f.cap }, c.actor());
  },
  // After an account key change (release 21): a DM's base key and a group's owner key are replaced.
  'chat.rebase'(c, f) {
    return c.ctx.store.rebaseChat({ cid: f.cid, cap: f.cap }, c.actor());
  },
  'chat.owner'(c, f) {
    return c.ctx.store.setOwner({ cid: f.cid, cap: f.cap }, c.actor());
  },
  // An admin blocks a username from a group or channel, or lets it back in (SPEC.md 5.6).
  'chat.ban'(c, f) {
    return c.ctx.store.setBan({ cid: f.cid, h: f.h, on: f.on }, c.actor());
  },
  // Member cards and join requests (SPEC.md 5.6, release 91): counted with the marks; a wrong link proof as a wrong invite link.
  'chat.card'(c, f) {
    if (!c.sides.take()) fail('ratelimit', 'too many marks; slow down');
    return c.ctx.store.card({ cid: f.cid, e: f.e, iv: f.iv, ct: f.ct }, c.actor());
  },
  'chat.ask'(c, f) {
    if (!c.ctx.openFails.peek(c.addrTag)) fail('ratelimit', 'too many wrong invite links from here; wait a minute');
    if (!c.sides.take()) fail('ratelimit', 'too many marks; slow down');
    try { return c.ctx.store.ask({ cid: f.cid, iid: f.iid, proof: f.proof, iv: f.iv, ct: f.ct }, c.actor()); }
    catch (e) { if (e instanceof HushError && e.code === 'denied') c.ctx.openFails.take(c.addrTag); throw e; }
  },
  // A channel's reactions and votes (SPEC.md 5.4), counted with the marks as today; and which of them are this account's own, counted with query and mget.
  'chat.act'(c, f) {
    if (!c.sides.take()) fail('ratelimit', 'too many marks; slow down');
    return c.ctx.store.act({ cid: f.cid, post: f.post, kind: f.kind, e: f.e, iv: f.iv, ct: f.ct }, c.actor());
  },
  'chat.mine'(c, f) {
    takeQuery(c);
    return c.ctx.store.mine({ cid: f.cid, posts: f.posts }, c.actor());
  },
  // Which tag each author's card sits under (SPEC.md 5.6, release 93): counted with query and mget, as the reads of the cards are: a token for every
  // mgetMax (300) names, at least one, so 10,000 cost 34, as reading 10,000 paths by mget would; an hs that is not a list costs one (and is invalid).
  'chat.slots'(c, f) {
    takeQuery(c, Math.max(1, Math.ceil((Array.isArray(f.hs) ? f.hs.length : 0) / c.limits.mgetMax)));
    return c.ctx.store.slots({ cid: f.cid, cap: f.cap, hs: f.hs }, c.actor());
  },
  // The key chain (SPEC.md 5.6, release 91): one row per epoch, replaced in place, so a page's backfill is not counted beyond its frames.
  'chat.chain'(c, f) {
    return c.ctx.store.chain({ cid: f.cid, e: f.e, b: f.b, c: f.c }, c.actor());
  },

  // ---- deleting the account (SPEC.md 4.7) ----
  // The page's last step, after it erased what only it can find. Only from a connection proven with the account key
  // itself: never a device key or a sign-up proof. The reply goes out first, then every connection of the account closes.
  'account.delete'(c, f) {
    if (!c.proven) fail('unauth', 'sign in first');
    if (c.provedWith !== 'account') fail('denied', 'deleting an account needs a sign-in with the account key');
    const h = c.proven;
    c.ctx.store.deleteAccount({ vault: f.vault }, c.actor());
    return { __after: () => { if (c.ctx.onAccountGone) c.ctx.onAccountGone(h); } };
  },

  // ---- reports (SPEC.md 8.7) ----
  // Needs an account that exists: a sign-up proof alone costs no puzzle, and each new name would be a fresh tag.
  'report.send'(c, f) {
    if (!hasAccount(c)) fail('unauth', 'sign in first');
    if (!c.reports.take()) fail('ratelimit', 'too many reports; slow down');
    return c.ctx.store.report({ cid: f.cid, pid: f.pid, reason: f.reason }, c.actor());
  },
  // Only for the operator's own accounts (HUSH_OWNERS), whatever HUSH_AUTHZ says.
  'report.list'(c, f) {
    if (!hasAccount(c) || !(c.ctx.owners || []).includes(c.proven)) fail('denied', 'not allowed');
    const before = f.before === undefined ? Number.MAX_SAFE_INTEGER : f.before, limit = f.limit === undefined ? 50 : f.limit;
    if (!Number.isFinite(before) || !Number.isInteger(limit) || limit < 1) fail('invalid', 'report.list: bad before or limit');
    return { reports: c.ctx.store.reports({ before, limit: Math.min(limit, 200) }) };
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

  // ---- calls (SPEC.md 16.2): a credential for the operator's relay (TURN), for a one-on-one chat this connection holds at
  // member level, the same check as writing a call record. The TURN REST scheme: username "<expiry, unix seconds>:<name>",
  // password base64(HMAC-SHA1(secret, username)). The name is the account's name for today (server.js, turnName): the relay
  // can count one account's allocations (user-quota) but learns no username, and tomorrow's name doesn't link to today's.
  'call.relay'(c, f) {
    if (!c.proven) fail('unauth', 'sign in first');
    if (typeof f.cid !== 'string' || !ID.CID.test(f.cid)) fail('invalid', 'call.relay: bad chat id');
    const a = c.actor();
    if (!rankOf(a, f.cid) || chatTypeOf(a, f.cid) !== 'dm') fail('denied', 'open this one-on-one chat with its key first');
    const t = c.ctx.turn;
    if (!t) fail('unavailable', 'calls are not available on this server');
    const r = c.ctx.relays, m = c.ctx.acctRelays.min, h = c.ctx.acctRelays.hour;
    if (!r.peek(c.addrTag)) fail('ratelimit', 'too many calls from here; wait a minute');
    if (!m.peek(c.proven) || !h.peek(c.proven)) fail('ratelimit', 'too many calls from this account; wait a while');
    r.take(c.addrTag); m.take(c.proven); h.take(c.proven);   // all or none: a refusal by one doesn't spend the others
    const username = Math.floor(c.ctx.now() / 1000 + t.ttl) + ':' + c.ctx.turnName(c.proven);
    return { iceServers: [{ urls: [...t.urls], username, credential: createHmac('sha1', t.secret).update(username).digest('base64') }], ttl: t.ttl };
  },

  // ---- ringing, and a "New message" nudge, when the app is closed: a push address per iPhone device (`kind` voip for
  // calls, alert for the nudge), and random wake tickets pointing at it (`k` c or m) that the device hands to its
  // contacts; a caller rings or nudges through POST /wake (server.js). The store checks the device is the account's own
  // (and, for a device-proven connection, the one that signed in).
  'push.set'(c, f) {
    takePush(c);
    const dev = devOf(f, 'push.set'), kind = kindOf(f, 'push.set');
    if (typeof f.tok !== 'string' || !PUSH_TOKEN.test(f.tok) || !['prod', 'sandbox'].includes(f.env)) fail('invalid', 'push.set: bad token or environment');
    return c.ctx.store.pushSet({ dev, tok: f.tok.toLowerCase(), env: f.env, kind }, c.actor());
  },
  'push.clear'(c, f) {
    takePush(c);
    return c.ctx.store.pushClear({ dev: devOf(f, 'push.clear'), kind: kindOf(f, 'push.clear') }, c.actor());
  },
  'wake.mint'(c, f) {
    takePush(c);
    if (f.k !== undefined && f.k !== 'c' && f.k !== 'm') fail('invalid', 'wake.mint: bad kind');
    return c.ctx.store.wakeMint({ dev: devOf(f, 'wake.mint'), n: f.n === undefined ? 1 : f.n, k: f.k === undefined ? 'c' : f.k }, c.actor());
  },
  'wake.revoke'(c, f) {
    takePush(c);
    if (typeof f.tk !== 'string' || !ID.LABEL.test(f.tk)) fail('invalid', 'wake.revoke: bad ticket');
    return c.ctx.store.wakeRevoke({ tk: f.tk }, c.actor());
  },
};
for (const op of NOT_YET) HANDLERS[op] = () => fail('invalid', `"${op}" is not part of the protocol; watch inbox/<h>/c and use POST /drop`);

export class Connection {
  // ctx: { store, subs, limits, disk, helloBuckets, proveFails, openFails, blindReads, blindPaths, linkReads, linkPaths, linkAsks, pwMisses, pwRepeats, signups, boxes, creates, invites, relays, acctRelays, turnName, tickets, addrTag, dayTag, now, badges, owners, turn, onClose, onAccountGone }
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
    this.dev = null;           // the device id a device proof named
    this.pub = null;           // the account public key behind the proof
    this.kv = 1;               // the account's key version this connection was proven against
    this.mayCreate = null;     // handle this connection may create (sign-up)
    this.signupPow = null;     // { salt, bits }: the puzzle a sign-up on this connection solves, once
    this.proving = false;
    this.chats = new Map();    // cid → { level, epoch, type, h: hash of the key it opened with, held?: the owner or admin level its key gave, unsecured }
    this.closed = false;
    this.cleaned = false;
    this.badCount = 0;
    this.held = false;         // past sendBufferBytes unsent: frames wait in `later` (hold)
    this.later = [];
    const L = this.limits;
    this.frames = new TokenBucket(L.framesPerMin, L.framesPerMin / 60);
    this.bytes = new TokenBucket(L.bytesPerMin, L.bytesPerMin / 60);
    this.refusals = new TokenBucket(L.bytesPerMin, L.bytesPerMin / 60);   // what answers refused for their size read (answerOk)
    this.queries = new TokenBucket(L.queriesPerMin, L.queriesPerMin / 60);
    this.drops = new TokenBucket(L.dropsPerHour, L.dropsPerHour / 3600);
    this.dirReads = new TokenBucket(L.directoryReadsPerMin, L.directoryReadsPerMin / 60);
    this.search = new TokenBucket(L.searchPerMin, L.searchPerMin / 60);
    this.posts = new TokenBucket(L.postsPerMin, L.postsPerMin / 60);
    this.sides = new TokenBucket(L.sideWritesPerMin, L.sideWritesPerMin / 60);
    this.calls = new TokenBucket(L.callSignalsPerMin, L.callSignalsPerMin / 60);
    this.reports = new TokenBucket(L.reportsPerMin, L.reportsPerMin / 60);
    this.pushOps = new TokenBucket(L.pushOpsPerMin, L.pushOpsPerMin / 60);
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
    return { handle: this.proven, viaAccountKey: this.provedWith === 'account' || this.provedWith === 'signup', dev: this.dev, mayCreate: this.mayCreate, pub: this.pub, chats: this.chats, conn: this };
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
    if (this.ws.readyState !== OPEN) return;
    // What a client asked for (a reply, a watch's first load) only makes its next frames wait (hold); what it did not (a watch's
    // pushes) is not held back by that, so past the hard limit a client that does not read is closed.
    if (obj.i === undefined && obj.t !== 'init' && this.ws.bufferedAmount > this.limits.sendBufferMaxBytes) return this.close('not reading');
    this.ws.send(JSON.stringify(obj));
    if (this.ws.bufferedAmount > this.limits.sendBufferBytes) this.hold();
  }

  // Past the soft limit the client's frames wait, read or not, until what it has not taken drains below it: a slow reader is only
  // slowed. ws has no drain event, so it is looked at every 50 ms. Draining counts as not idle (its keep-alive waits unread too); a
  // client that never drains ends at idleMs as before.
  hold() {
    if (this.held || this.closed) return;
    this.held = true;
    this.ws.pause();
    let last = this.ws.bufferedAmount;
    const t = setInterval(() => {
      if (this.closed) return clearInterval(t);
      const now = this.ws.bufferedAmount;
      if (now < last) this.touch();
      last = now;
      if (now > this.limits.sendBufferBytes) return;
      clearInterval(t);
      this.held = false;
      while (!this.held && !this.closed && this.later.length) this.take(...this.later.shift());
      this.readAgain();
    }, 50);
    if (t.unref) t.unref();
  }

  readAgain() {
    if (!this.waiting && !this.held && !this.closed) this.ws.resume();
  }

  close(reason, code = 1000) {
    if (this.closed) return;
    this.closed = true;
    this.send({ t: 'bye', reason });
    try { this.ws.close(code, reason); } catch { /* already closing */ }
    const t = setTimeout(() => { try { this.ws.terminate(); } catch { /* gone */ } }, 500);
    if (t.unref) t.unref();
    this.cleanup();
  }

  cleanup() {
    if (this.cleaned) return;
    this.cleaned = true;
    this.closed = true;
    this.chats.clear();   // a closed connection holds no level: a media write still arriving over its ticket is refused
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
      // An answer refused for its size was read up to the cap: it is paid for, below zero if need be, from an allowance of its own
      // (refilled when answerOk let the request in), so an honest page's refused watch never refuses its other frames (release 110).
      if (e.n) this.refusals.tokens -= e.n;
      const out = { i, ok: false, e: e.code, m: e.message };
      if (e.code === 'pow') { out.bits = e.bits; out.salt = e.salt; }   // the puzzle to solve, then try again
      return this.send(out);
    }
    log.error('frame.failed', e);
    this.send({ i, ok: false, e: 'internal', m: 'internal error' });
  }

  onMessage(data, isBinary) {
    if (this.held) return void this.later.push([data, isBinary]);   // already read off the socket when it paused: kept, in order
    this.take(data, isBinary);
  }

  take(data, isBinary) {
    try {
      this.handleFrame(data, isBinary);
    } catch (e) {
      // Nothing in handleFrame should throw past its own guards; if it does,
      // close rather than leave the socket in an undefined state.
      log.error('connection.failed', e);
      this.close('internal error');
    }
  }

  // Over its allowance a socket is not read for a moment, one frame's refill (300 a minute): most of a flood's cost is in reading, unmasking and
  // checking each frame before it gets here, so the sender waits on its own socket instead. Its refusals are only that much later.
  waitToRead() {
    if (this.waiting) return;
    this.waiting = true;
    this.ws.pause();
    const t = setTimeout(() => { this.waiting = false; this.readAgain(); }, 200);
    if (t.unref) t.unref();
  }

  handleFrame(data, isBinary) {
    if (this.closed) return;
    this.touch();
    const size = data.length;
    // The allowances come before parsing, so large junk frames can't keep the single thread busy, whatever each op charges. Over them only
    // the first bytes are read, for the i a page relies on hearing back; a frame with none there is a bad frame.
    const framed = this.frames.take();
    if (!framed || !this.bytes.take(size)) {
      this.waitToRead();
      const head = isBinary ? '' : Buffer.isBuffer(data) ? data.toString('latin1', 0, 64) : String(data).slice(0, 64);
      // A page's keep-alive is answered all the same (release 100): a page that had spent its frames on a long chat list took the
      // refusal for a dead socket and reconnected, which loaded the list again. Only that exact frame, only when it was the frame
      // allowance that refused it, only after hello; no token is given and the socket still waits, so it is no way around the allowance.
      // (The pattern's longest match is 33 characters, so the 64-character head never cuts a longer frame down to one.)
      const ping = !framed && this.helloed && PING.exec(head);
      if (ping) return this.send({ i: Number(ping[1]), ok: true, now: this.ctx.now() });
      const m = HEAD_I.exec(head), L = this.limits;
      // retry: the milliseconds before asking again is any use, one frame's refill or this frame's bytes'
      return m ? this.send({ i: Number(m[1]), ok: false, e: 'ratelimit', m: 'slow down', retry: Math.ceil(framed ? size * 60000 / L.bytesPerMin : 60000 / L.framesPerMin) })
        : this.rejectFrame({ ok: false, e: 'invalid', m: 'frame needs an integer "i" and a string "op"' });
    }
    let f;
    try { f = JSON.parse(Buffer.isBuffer(data) ? data.toString('utf8') : String(data)); }
    catch { return this.rejectFrame({ ok: false, e: 'invalid', m: 'frame is not JSON' }); }
    if (isBinary || !f || typeof f !== 'object' || Array.isArray(f)) return this.rejectFrame({ ok: false, e: 'invalid', m: 'frame must be a JSON object' });
    if (!Number.isInteger(f.i) || typeof f.op !== 'string') return this.rejectFrame({ ok: false, e: 'invalid', m: 'frame needs an integer "i" and a string "op"' });
    const i = f.i;
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
