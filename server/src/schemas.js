// Per-collection shape rules (SPEC.md 9.2, 9.3, 5.3, 5.7). These are checks on
// the document itself, independent of who is writing. Authorization (who may
// write where) is a separate layer added in later stages.

import { createHash, timingSafeEqual } from 'node:crypto';
import { fail } from './errors.js';
import { isPlain, mergePatch, changedKeys } from './merge.js';
import { ID } from './paths.js';

const KB = 1024, MB = 1024 * KB;

export const MAX_BYTES = Object.freeze({
  directory: 256 * KB, search: 4 * KB, presence: 1 * KB, phones: 1 * KB, logins: 1 * KB,
  accounts: 2 * MB, linkreqs: 64 * KB, vault: 2 * MB, backup: 2 * MB,
  channels: 2 * MB, posts: 64 * KB, comments: 64 * KB, acts: 64 * KB, reads: 4 * KB, typing: 4 * KB,
  chunks: 256 * KB, inbox: 4 * KB,
});

const DAY = 86_400_000;
export const POST_TS_PAST_MS = 30 * DAY;
export const POST_TS_FUTURE_MS = 400 * DAY;
export const LINKREQ_WAIT_MS = 10 * 60_000;

const HEX64 = /^[0-9a-f]{64}$/i;
const B64 = /^[A-Za-z0-9+/]*={0,2}$/;
export const XY = (v) => isPlain(v) && str(v.x, 1, 128) && str(v.y, 1, 128);

const str = (v, min = 0, max = Infinity) => typeof v === 'string' && v.length >= min && v.length <= max;
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const int = (v, min = -Infinity, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
const bool = (v) => typeof v === 'boolean';

function only(doc, allowed, what) {
  for (const k of Object.keys(doc)) if (!allowed.has(k)) fail('invalid', `${what}: field "${k}" is not allowed`);
}
function need(doc, keys, what) {
  for (const k of keys) if (doc[k] === undefined) fail('invalid', `${what}: field "${k}" is required`);
}
const bad = (what, field) => fail('invalid', `${what}: bad "${field}"`);

// ---- identity-plane collections -------------------------------------------

const DIRECTORY_KEYS = new Set(['handle', 'name', 'disp', 'bio', 'photo', 'ecdh', 'sig', 'devs', 'findable', 'requests', 'kv', 'ts']);
function directory(ctx, d) {
  const w = 'directory';
  only(d, DIRECTORY_KEYS, w); need(d, ['handle', 'ecdh', 'sig'], w);
  if (d.handle !== ctx.id) bad(w, 'handle');
  if (!XY(d.ecdh)) bad(w, 'ecdh');
  if (!XY(d.sig)) bad(w, 'sig');
  if (d.name !== undefined && !str(d.name, 0, 60)) bad(w, 'name');
  if (d.disp !== undefined && !(str(d.disp, 3, 20) && d.disp.toLowerCase() === ctx.id)) bad(w, 'disp');
  if (d.bio !== undefined && !str(d.bio, 0, 200)) bad(w, 'bio');
  if (d.photo !== undefined && !str(d.photo, 0, 200 * KB)) bad(w, 'photo');
  if (d.findable !== undefined && !bool(d.findable)) bad(w, 'findable');
  if (d.requests !== undefined && !bool(d.requests)) bad(w, 'requests');
  if (d.kv !== undefined && !int(d.kv, 1, 1e6)) bad(w, 'kv');
  if (d.ts !== undefined && !num(d.ts)) bad(w, 'ts');
  if (d.devs !== undefined) {
    if (!isPlain(d.devs)) bad(w, 'devs');
    for (const [id, e] of Object.entries(d.devs)) {
      if (!/^[a-zA-Z0-9]{6,20}$/.test(id) || !isPlain(e)) bad(w, 'devs');
      for (const f of ['x', 'y', 'sx', 'sy', 's']) if (!str(e[f], 1, 256)) bad(w, 'devs');
      if (e.by !== undefined && !str(e.by, 0, 20)) bad(w, 'devs');
      if (e.ts !== undefined && !num(e.ts)) bad(w, 'devs');
    }
  }
}

function search(ctx, d) {
  const w = 'search';
  only(d, new Set(['h', 'n', 'n2']), w); need(d, ['h', 'n', 'n2'], w);
  if (d.h !== ctx.id) bad(w, 'h');
  for (const f of ['n', 'n2']) if (!str(d[f], 0, 60) || d[f] !== d[f].toLowerCase()) bad(w, f);
}

function presence(ctx, d) {
  const w = 'presence';
  only(d, new Set(['ts', 'hidden']), w);
  if (d.hidden !== undefined && d.hidden !== true) bad(w, 'hidden');
  if (d.ts !== undefined && !num(d.ts)) bad(w, 'ts');
  if (d.ts === undefined && d.hidden === undefined) bad(w, 'ts');
}

function phones(ctx, d) {
  only(d, new Set(['handle']), 'phones'); need(d, ['handle'], 'phones');
  if (!ID.HANDLE.test(d.handle)) bad('phones', 'handle');
}

function logins(ctx, d) {
  only(d, new Set(['ts']), 'logins'); need(d, ['ts'], 'logins');
  if (!num(d.ts)) bad('logins', 'ts');
}

function box(what) {
  return (ctx, d) => {
    only(d, new Set(['iv', 'ct', 'ts']), what); need(d, ['iv', 'ct'], what);
    if (!str(d.iv, 1, 64)) bad(what, 'iv');
    if (!str(d.ct, 1)) bad(what, 'ct');
    if (d.ts !== undefined && !num(d.ts)) bad(what, 'ts');
  };
}

function linkreqs(ctx, d) {
  const w = 'linkreqs';
  only(d, new Set(['state', 'pub', 'ts', 'dev', 'devk', 'epub', 'iv', 'ct']), w); need(d, ['state'], w);
  if (!['wait', 'ok', 'no'].includes(d.state)) bad(w, 'state');
  if (d.ts !== undefined && !num(d.ts)) bad(w, 'ts');
  if (d.dev !== undefined && !str(d.dev, 0, 80)) bad(w, 'dev');
  if (d.pub !== undefined && !XY(d.pub)) bad(w, 'pub');
  if (d.epub !== undefined && !XY(d.epub)) bad(w, 'epub');
  if (d.devk !== undefined && !isPlain(d.devk)) bad(w, 'devk');
  if (d.iv !== undefined && !str(d.iv, 1, 64)) bad(w, 'iv');
  if (d.ct !== undefined && !str(d.ct, 1)) bad(w, 'ct');
  // A waiting request may not be replaced by another waiting request until it has aged out.
  const prev = ctx.prev;
  if (prev && prev.state === 'wait' && d.state === 'wait' && num(prev.ts) && ctx.now - prev.ts < LINKREQ_WAIT_MS) {
    fail('conflict', 'linkreqs: a login request is already waiting');
  }
}

// ---- chats --------------------------------------------------------------------

const CHANNEL_KEYS = new Set(['type', 'visibility', 'epoch', 'keys', 'akeys', 'openKeys', 'meta', 'invites', 'ts', 'last',
  'pins', 'ttl', 'closed', 'reactions', 'comments', 'name', 'desc', 'photo', 'owner', 'admins']);
const NAMES_NEVER = ['members', 'banned', 'from', 'by', 'to', 'req'];
const NAMES_PUBLIC_ONLY = ['owner', 'admins', 'name', 'desc', 'photo'];

// One wrapped key: an ECDH wrap to one device (or account) key, under a random label.
const WRAP = (w) => isPlain(w) && XY(w.epk) && str(w.iv, 1, 64) && str(w.ct, 1, 512);
export function labelMap(v, what) {   // { [label]: wrap }
  if (!isPlain(v)) bad(what, 'wraps');
  for (const [label, wrap] of Object.entries(v)) if (!ID.LABEL.test(label) || !WRAP(wrap)) bad(what, 'wraps');
}
function wrapMap(v, what, nested) {
  if (!isPlain(v)) bad(what, nested ? 'keys' : 'akeys');
  if (!nested) { labelMap(v, what); return; }
  for (const [k, x] of Object.entries(v)) {
    if (!int(Number(k), 0, 31)) bad(what, 'keys');
    labelMap(x, what);
  }
}
export function sealedMeta(m, what) {
  if (!isPlain(m) || !int(m.e, 0, 31) || !str(m.iv, 1, 64) || !str(m.ct, 1)) bad(what, 'meta');
}

function channels(ctx, d) {
  const w = 'chat';
  for (const k of NAMES_NEVER) if (k in d) fail('invalid', `${w}: field "${k}" would put a name on the server`);
  only(d, CHANNEL_KEYS, w); need(d, ['type'], w);
  if (!['dm', 'group', 'channel'].includes(d.type)) bad(w, 'type');
  const pub = d.visibility === 'public';
  if (d.visibility !== undefined && !['private', 'public'].includes(d.visibility)) bad(w, 'visibility');
  if (!pub) for (const k of NAMES_PUBLIC_ONLY) if (k in d) fail('invalid', `${w}: "${k}" belongs in sealed meta for private chats`);
  if (d.epoch !== undefined && !int(d.epoch, 0, 31)) bad(w, 'epoch');
  if (d.ts !== undefined && !num(d.ts)) bad(w, 'ts');
  if (d.last !== undefined && d.last !== null) {
    if (!isPlain(d.last)) bad(w, 'last');
    if (d.last.from !== undefined && d.last.from !== null) fail('invalid', `${w}: "last.from" would put a name on the server`);
  }
  if (d.keys !== undefined) wrapMap(d.keys, w, true);
  if (d.akeys !== undefined) wrapMap(d.akeys, w, false);
  if (d.openKeys !== undefined) {
    if (!isPlain(d.openKeys)) bad(w, 'openKeys');
    for (const [k, v] of Object.entries(d.openKeys)) if (!int(Number(k), 0, 31) || !str(v, 40, 48)) bad(w, 'openKeys');
  }
  if (d.meta !== undefined) sealedMeta(d.meta, w);
  if (d.invites !== undefined) {
    if (!isPlain(d.invites)) bad(w, 'invites');
    for (const [iid, inv] of Object.entries(d.invites)) {
      if (!ID.ITEM_ID.test(iid) || !isPlain(inv) || !str(inv.iv, 1, 64) || !str(inv.ct, 1) || !HEX64.test(inv.ph || '') || !num(inv.ts)) bad(w, 'invites');
    }
  }
  if (d.pins !== undefined && !(Array.isArray(d.pins) && d.pins.length <= 20 && d.pins.every((p) => ID.ITEM_ID.test(p)))) bad(w, 'pins');
  if (d.ttl !== undefined && !int(d.ttl, 0, 365 * 86400)) bad(w, 'ttl');
  if (d.closed !== undefined && !isPlain(d.closed)) bad(w, 'closed');
  if (d.comments !== undefined && !bool(d.comments)) bad(w, 'comments');
  if (d.reactions !== undefined) {
    if (!isPlain(d.reactions) || !['all', 'some', 'off'].includes(d.reactions.mode)) bad(w, 'reactions');
    if (d.reactions.allowed !== undefined && !(Array.isArray(d.reactions.allowed) && d.reactions.allowed.every((e) => str(e, 1, 16)))) bad(w, 'reactions');
  }
  if (pub) {
    if (d.owner !== undefined && !ID.HANDLE.test(d.owner)) bad(w, 'owner');
    if (d.admins !== undefined && !(Array.isArray(d.admins) && d.admins.every((h) => ID.HANDLE.test(h)))) bad(w, 'admins');
    if (d.name !== undefined && !str(d.name, 0, 60)) bad(w, 'name');
    if (d.desc !== undefined && !str(d.desc, 0, 200)) bad(w, 'desc');
    if (d.photo !== undefined && !str(d.photo, 0, 200 * KB)) bad(w, 'photo');
  }
}

// ---- posts, comments, side rows --------------------------------------------------

const SEALED_KEYS = new Set(['sl', 'ts', 'e', 'n', 'd', 'exp', 'oh', 'on', 'edited', 'del']);
const SVC_KEYS = new Set(['sv', 'ts', 'e', 'n', 'd']);

function sealedPost(ctx, d, what, extra = new Set()) {
  if (d.sv !== 1 && d.sl !== 1) fail('invalid', `${what}: only sealed messages (sl:1) or service notes (sv:1) are accepted`);
  const allowed = new Set([...(d.sv === 1 ? SVC_KEYS : SEALED_KEYS), ...extra]);
  only(d, allowed, what);
  if (d.sv === 1) {
    need(d, ['sv', 'ts', 'e', 'n', 'd'], what);
  } else {
    need(d, ['ts', 'e', 'n', 'd', 'oh', 'on'], what);
    if (!int(d.on, 0, 1e9)) bad(what, 'on');
    const wiped = d.del === true;
    if (!(HEX64.test(d.oh) || (wiped && d.oh === ''))) bad(what, 'oh');
    if (d.exp !== undefined && !(num(d.exp) && d.exp >= 0)) bad(what, 'exp');
    if (d.edited !== undefined && !(num(d.edited) || bool(d.edited))) bad(what, 'edited');
    if (d.del !== undefined && !bool(d.del)) bad(what, 'del');
  }
  if (!num(d.ts)) bad(what, 'ts');
  if (!int(d.e, 0, 31)) bad(what, 'e');
  if (!str(d.n, 0, 64)) bad(what, 'n');
  if (!str(d.d, 0)) bad(what, 'd');
  if (ctx.op !== 'update') {
    if (d.ts < ctx.now - POST_TS_PAST_MS || d.ts > ctx.now + POST_TS_FUTURE_MS) bad(what, 'ts');
  }
}

const posts = (ctx, d) => sealedPost(ctx, d, 'post');
function comments(ctx, d) {
  sealedPost(ctx, d, 'comment', new Set(['post']));
  if (d.post !== undefined && !ID.ITEM_ID.test(d.post)) bad('comment', 'post');
}

function acts(ctx, d) {
  const w = 'act';
  only(d, new Set(['post', 'kind', 'e', 'iv', 'ct', 'ts', 'sg']), w); need(d, ['post', 'kind', 'iv', 'ct', 'ts', 'sg'], w);
  const [post, , kind] = ctx.id.split('~');
  if (d.post !== post) bad(w, 'post');
  if (d.kind !== kind) bad(w, 'kind');
  if (d.e !== undefined && !int(d.e, 0, 31)) bad(w, 'e');
  if (!str(d.iv, 1, 64) || !str(d.ct, 1) || !str(d.sg, 1, 256) || !num(d.ts)) bad(w, 'fields');
}

function sideRow(what) {
  return (ctx, d) => {
    only(d, new Set(['ts', 'sg']), what); need(d, ['ts', 'sg'], what);
    if (!num(d.ts) || !str(d.sg, 1, 256)) bad(what, 'fields');
  };
}

function chunks(ctx, d) {
  const w = 'chunk';
  only(d, new Set(['i', 'iv', 'd']), w); need(d, ['i', 'iv', 'd'], w);
  if (d.i !== Number(ctx.id)) bad(w, 'i');
  if (!str(d.iv, 1, 64) || !B64.test(d.iv)) bad(w, 'iv');
  if (!str(d.d, 1) || !B64.test(d.d)) bad(w, 'd');
}

// A sealed pointer: an ECDH wrap to the recipient's account key, plus a coarse time.
// A mailbox note: the plaintext is padded to NOTE_PLAIN bytes before sealing, so every note on the
// server is the same size and its length says nothing about what it is (SPEC.md 6).
export const NOTE_PLAIN = 1024;
export const NOTE_BYTES = NOTE_PLAIN + 16;   // plus the AES-GCM tag
function inbox(ctx, d) {
  const w = 'note';
  only(d, new Set(['epk', 'iv', 'ct', 'ts']), w); need(d, ['epk', 'iv', 'ct', 'ts'], w);
  if (!XY(d.epk) || !str(d.iv, 1, 64) || !str(d.ct, 1, 2 * NOTE_BYTES) || !num(d.ts)) bad(w, 'fields');
  if (Buffer.from(d.ct, 'base64').length !== NOTE_BYTES) bad(w, 'size');
}

const VALIDATORS = {
  directory, search, presence, phones, logins, linkreqs, channels, posts, comments, acts, chunks, inbox,
  accounts: box('account box'), vault: box('vault'), backup: box('backup'),
  reads: sideRow('read mark'), typing: sideRow('typing mark'),
};

// Validates a complete document of `kind`. ctx: { id, cid?, mid?, now, op: 'set'|'add'|'update', prev }.
export function validateForKind(kind, ctx, doc) {
  const v = VALIDATORS[kind];
  if (!v) fail('invalid', 'unknown collection');
  v(ctx, doc);
}

// ---- sealed-post ownership (SPEC.md 5.7) -------------------------------------------

const UPDATABLE = new Set(['ts', 'e', 'n', 'd', 'exp', 'oh', 'on', 'edited', 'del']);
const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

export function tokenMatches(prev, ot) {
  if (!(typeof ot === 'string' && ot.length > 0 && ot.length <= 128 && typeof prev.oh === 'string' && prev.oh.length === 64)) return false;
  return timingSafeEqual(Buffer.from(sha256hex(ot)), Buffer.from(prev.oh.toLowerCase()));   // constant time, like every hash check
}

// Applies an update to a sealed post. The author proves ownership with the
// one-time token `ot` whose SHA-256 is the stored `oh`; the token itself is
// never stored. Returns the merged document.
export function applyPostUpdate(prev, patch) {
  if (prev.sv === 1) fail('denied', 'service notes cannot be edited');
  if (!tokenMatches(prev, patch.ot)) fail('denied', 'not the author of this message');
  const { ot, ...rest } = patch;
  const merged = mergePatch(prev, rest);
  for (const k of changedKeys(prev, merged)) if (!UPDATABLE.has(k)) fail('invalid', `post: "${k}" cannot change`);
  if (!int(merged.on) || merged.on <= prev.on) fail('invalid', 'post: "on" must increase');
  return merged;
}

export function canDeletePost(prev, ot, now) {
  if (prev.sv === 1) return false;
  if (prev.del === true) return true;
  if (num(prev.exp) && prev.exp > 0 && prev.exp < now) return true;
  return tokenMatches(prev, ot);
}
