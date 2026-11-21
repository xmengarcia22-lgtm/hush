// Authorization policies.
//
//   open      every structurally valid frame is allowed (tests only)
//   standard  SPEC.md 4.2, 4.3 and 5.4: a connection may change only records
//             that belong to the username it proved; blind-address collections
//             follow their fixed op rules; everything under a chat is gated by
//             the room-key level the connection opened the chat with.
//
// check(actor, op, path, ctx) throws HushError to refuse. It may return
// 'preview' for a chat record read without a level, which makes the store trim
// the record (SPEC.md 5.5); 'member' for a chat record read or watched below admin
// level, which makes the store leave out a channel's sealed member and blocked lists
// (SPEC.md 5.5); 'blind' for a channel's read marks read below admin
// level, which the store answers as if there were none (SPEC.md 5.4); or 'slotted' for a channel's reactions and votes, of which the
// store hands out only those chat.act filed (SPEC.md 5.4). `actor` describes the connection:
// { handle, viaAccountKey, mayCreate, pub, chats: Map<cid, {level, epoch, type, held?}> }.
// `op` is one of get, query, sub, watch, set, update, delete, and put (a media piece
// written over HTTP, SPEC.md 7.7). `ctx` carries `d`
// (the document as it would be stored) and `prev` (what is stored now).

import { HushError, fail } from './errors.js';
import { changedKeys } from './merge.js';
import { offerTag } from './codes.js';

const RANK = Object.freeze({ member: 1, admin: 2, owner: 3 });
const sameXY = (a, b) => !!a && !!b && a.x === b.x && a.y === b.y;
const needProven = (a) => { if (!a || !a.handle) fail('unauth', 'sign in first'); };
const own = (a, h) => { needProven(a); if (a.handle !== h) fail('denied', 'that record belongs to another account'); };
const noList = () => fail('denied', 'this collection cannot be listed');

export function levelOf(actor, cid) {
  const e = actor && actor.chats && actor.chats.get(cid);
  return e ? e.level : null;
}
export const rankOf = (actor, cid) => RANK[levelOf(actor, cid)] || 0;
export const chatTypeOf = (actor, cid) => { const e = actor && actor.chats && actor.chats.get(cid); return e ? e.type : null; };
export const isAdminOf = (actor, cid) => rankOf(actor, cid) >= RANK.admin;
// Who reads a channel's member and blocked lists goes by the level the key proved: an owner or admin whose account isn't secured
// holds the chat at member level, its tools waiting (protocol.js, `held`), and still reads what its key opens.
const listsOf = (a, cid) => { const e = a && a.chats && a.chats.get(cid); return !!e && RANK[e.held || e.level] >= RANK.admin; };

function needLevel(a, cid, level) {
  needProven(a);
  if (rankOf(a, cid) < RANK[level]) {
    if (!rankOf(a, cid)) fail('denied', 'open this chat with its key first');
    fail('denied', `this needs ${level} access to the chat`);
  }
}

// Wrap entries may be added under existing epochs, never changed or removed; new
// epochs come from chat.rotate (SPEC.md 5.4).
function keysOnlyAdded(prev, d) {
  const pk = prev.keys || {}, dk = d.keys || {};
  for (const e of Object.keys(pk)) {
    if (!dk[e]) fail('denied', 'key wraps cannot be removed');
    for (const l of Object.keys(pk[e])) if (JSON.stringify(pk[e][l]) !== JSON.stringify(dk[e][l])) fail('denied', 'existing key wraps cannot change');
  }
  for (const e of Object.keys(dk)) if (!pk[e]) fail('denied', 'new epochs come from chat.rotate');
}

const MEMBER_FIELDS = new Set(['ts', 'last', 'closed', 'keys']);
const DM_MEMBER_FIELDS = new Set([...MEMBER_FIELDS, 'pins', 'ttl']);
// A group's or channel's settings and description are the owner's (SPEC.md 5.4); admins keep `meta`, `invites`, `pins` and a private
// channel's subscriber count `n` (SPEC.md 5.3).
const OWNER_FIELDS = new Set(['reactions', 'comments', 'ttl', 'visibility', 'openKeys', 'name', 'desc', 'photo', 'owner', 'admins', 'ometa']);
const ADMIN_FIELDS = new Set([...DM_MEMBER_FIELDS, ...OWNER_FIELDS, 'meta', 'invites', 'n']);
const FROZEN_FIELDS = new Set(['type', 'epoch', 'akeys']);

function chatRecord(a, op, p, ctx) {
  const cid = p.id;
  switch (op) {
    // In any channel only the owner and the admins may learn who the subscribers are (SPEC.md 5.5): below admin level the record
    // comes without its sealed lists, and is never refused for it: a page takes `denied` as an eviction (as the read marks, below).
    case 'get':
      needProven(a);
      return !rankOf(a, cid) ? 'preview' : listsOf(a, cid) ? undefined : 'member';
    case 'query':                       // the public-channel listing; the store insists on visibility == public
      needProven(a);
      return;
    case 'sub':
      noList();
      return;
    case 'watch':
      needLevel(a, cid, 'member');
      return listsOf(a, cid) ? undefined : 'member';
    case 'delete':
      needLevel(a, cid, 'owner');
      return;
    case 'set': {
      if (!ctx.prev) fail('denied', 'chats are created with chat.create');
      needLevel(a, cid, 'admin');
      const d = ctx.d, prev = ctx.prev;
      for (const f of FROZEN_FIELDS) if (JSON.stringify(d[f]) !== JSON.stringify(prev[f])) fail('denied', `"${f}" cannot change this way`);
      keysOnlyAdded(prev, d);
      if (changedKeys(prev, d).some((f) => OWNER_FIELDS.has(f))) needLevel(a, cid, 'owner');
      return;
    }
    case 'update': {
      const d = ctx.d, prev = ctx.prev;
      const changed = changedKeys(prev, d);
      for (const f of changed) if (FROZEN_FIELDS.has(f)) fail('denied', `"${f}" cannot change this way`);
      const memberOk = prev.type === 'dm' ? DM_MEMBER_FIELDS : MEMBER_FIELDS;
      for (const f of changed) if (!ADMIN_FIELDS.has(f)) fail('denied', `"${f}" cannot change`);
      needLevel(a, cid, changed.every((f) => memberOk.has(f)) ? 'member' : prev.type !== 'dm' && changed.some((f) => OWNER_FIELDS.has(f)) ? 'owner' : 'admin');
      if (changed.includes('keys')) keysOnlyAdded(prev, d);
      return;
    }
    default:
      fail('denied', 'not allowed');
  }
}

function chatContent(a, op, p, ctx) {
  const cid = p.cid;
  // Media pieces are written over HTTP only (SPEC.md 7.7), where they are write-once and counted against the
  // chat's allowance. `put` is that HTTP write; the socket may still read pieces. Deleting them in a group or channel is
  // the uploader's (`ctx.own`: the store matched the media token against the hash kept with the id, so the server never
  // learns who that is) or an admin's; the server keeps no link from a media id to who uploaded it, so another member's
  // file is not a member's to remove, and over the socket, with no token, an admin's alone (SPEC.md 5.4).
  if (p.kind === 'chunks' && (op === 'set' || op === 'update')) fail('denied', 'media is uploaded with PUT /media');
  const write = op === 'set' || op === 'update' || op === 'put';
  needLevel(a, cid, 'member');
  if (p.kind === 'chunks' && op === 'delete' && chatTypeOf(a, cid) !== 'dm' && !(ctx && ctx.own)) needLevel(a, cid, 'admin');
  if (p.kind === 'call' && chatTypeOf(a, cid) !== 'dm') fail('denied', 'calls are for one-on-one chats');   // SPEC.md 16.2
  if (write && (p.kind === 'posts' || p.kind === 'comments' || p.kind === 'chunks') && chatTypeOf(a, cid) === 'channel' && op !== 'update') {
    needLevel(a, cid, 'admin');   // only owners and admins post in channels; comments ride on posts
  }
  // Who read a channel is for its owner and admins to know: each mark sits under a tag anyone holding the chat key works out from a
  // username. Below admin level they read as none, never `denied`, which a page takes as an eviction: it opens the chat again and
  // loses its other watches of it. Everyone writes their own as before, so the owner's and admins' view counts stay (SPEC.md 5.4).
  if (p.kind === 'reads' && (op === 'get' || op === 'query' || op === 'sub' || op === 'watch') && chatTypeOf(a, cid) === 'channel' && !isAdminOf(a, cid)) return 'blind';
  // Who reacted or voted in a channel is for nobody to know, the owner and the admins included (SPEC.md 5.4). Rows come only through
  // chat.act, under a slot only the server works out. A row from before that sits under a tag anyone holding the chat key works out from
  // a username: it reads as none ('slotted'), never `denied`, which a page takes as an eviction. Nobody writes or deletes either kind.
  if (p.kind === 'acts' && chatTypeOf(a, cid) === 'channel') {
    if (op === 'get' || op === 'query' || op === 'sub' || op === 'watch') return 'slotted';
    fail('denied', 'reactions and votes in a channel are written with chat.act');
  }
}

function standardCheck(a, op, p, ctx) {
  const read = op === 'get', list = op === 'query' || op === 'sub' || op === 'watch', write = op === 'set' || op === 'update', del = op === 'delete';
  switch (p.kind) {
    case 'directory': {
      if (read) return;                                   // profiles are public; reads are rate-limited
      if (list) noList();
      // A deleted account's tombstone (SPEC.md 4.7) is the server's alone: nobody writes over it, nor makes one.
      if (ctx.prev && ctx.prev.gone !== undefined) fail('denied', 'this account was deleted');
      if (del) fail('denied', 'profiles are never deleted; account.delete leaves a tombstone');
      own(a, p.id);
      const d = ctx.d || {}, prev = ctx.prev;
      if (d.gone !== undefined) fail('denied', 'only the server marks an account deleted');
      if (!prev && d.prev !== undefined) fail('denied', 'the key history is kept by the server');
      if (!prev) {
        if (a.mayCreate !== p.id || !a.pub) fail('denied', 'sign up first');
        if (!sameXY(d.sig, a.pub)) fail('denied', 'the account key must be the one you signed in with');
        if (!a.signupProof) throw Object.assign(new HushError('pow', 'a new account brings a little proof of work'), a.signupPow || {});   // SPEC.md 9.4
        return;
      }
      // The key history `prev` (release 21) is the server's: a patch may not name it; a whole-document write may only
      // echo the stored one or leave it out (the store carries it forward).
      const hist = Array.isArray(prev.prev) ? prev.prev : null;
      if (ctx.patch ? ctx.patch.prev !== undefined : (d.prev !== undefined && JSON.stringify(d.prev) !== JSON.stringify(hist))) fail('denied', 'the key history is kept by the server');
      const kvNew = d.kv === undefined ? 1 : d.kv, kvOld = prev.kv === undefined ? 1 : prev.kv;
      if (!sameXY(d.ecdh, prev.ecdh) || !sameXY(d.sig, prev.sig) || kvNew !== kvOld) {
        if (!a.viaAccountKey) fail('denied', 'changing account keys needs the account key, not a device key');
        // The key this connection signed in with must be the one on record: a sign-up proof for a name someone else then
        // took, or a connection from before an earlier change, may not replace the keys (release 21).
        if (!sameXY(prev.sig, a.pub)) fail('denied', 'the account keys changed since this connection signed in; reconnect');
        if (kvNew !== kvOld + 1 || sameXY(d.sig, prev.sig)) fail('denied', 'a key change raises kv by one and brings a new signing key');
      }
      return;
    }
    case 'search':
      if (read) fail('denied', 'search entries are found by query');
      if (list) { needProven(a); return; }
      own(a, p.id);
      if (write && ctx.d && ctx.d.h !== p.id) fail('denied', 'a search entry must name its owner');
      return;
    case 'presence':
      if (list) noList();
      if (read) { needProven(a); return; }
      own(a, p.id);
      return;
    case 'phones':
      // Matching by phone number is off until numbers can be confirmed by text message (SPEC.md 12.4): an unconfirmed
      // number let anyone claim yours and be matched to your friends under your name. Entries can't be read or made;
      // an owner can still take theirs down.
      if (list) noList();
      needProven(a);
      if (read) fail('denied', 'phone numbers are not matched until they can be confirmed by text message');
      if (del) { if (ctx.prev && ctx.prev.handle !== a.handle) fail('denied', 'that number is linked to another account'); return; }
      fail('denied', 'phone numbers can not be saved until they can be confirmed by text message');
    case 'accounts':
      if (list) noList();
      if (op === 'set' && ctx.prev) fail('exists', 'an account box already exists at this address');
      if (op === 'update') fail('denied', 'account boxes are replaced, never edited');
      return;
    case 'logins':
      if (list) noList();
      if (op === 'set' && ctx.prev) fail('exists', 'that login is already taken');
      if (op === 'update' || del) fail('denied', 'login reservations never change');
      return;
    case 'secure':
      // Read by the server only, so nobody learns whose password is weak; set by the account itself, once (SPEC.md 4.6).
      if (list) noList();
      if (read) fail('denied', 'this mark is read by the server only');
      own(a, p.id);
      if (op === 'update' || del) fail('denied', 'the mark is set once and kept');
      return;
    case 'recovery':
      // Email recovery (SPEC.md 14.10), retired in release 16: no record is written any more. Never read back; its own
      // account may still remove one left from before.
      if (list) noList();
      if (read) fail('denied', 'recovery records cannot be read');
      needProven(a);
      if (ctx.prev && ctx.prev.h !== a.handle) fail('denied', 'that record belongs to another account');
      if (del) return;
      fail('denied', 'recovery emails are retired');
    case 'linkreqs':
      // A link ask (SPEC.md 14.14, release 58): the new device, not signed in, opens one at the address its code names,
      // with its keys and no account named; whoever scans its code answers from their own session, so any signed-in
      // account may answer, naming itself. The asker takes it down, and so may anyone once it is answered.
      if (op === 'set' && !ctx.prev && ctx.d && ctx.d.state === 'ask') {
        if (ctx.d.h !== undefined) fail('denied', 'a link ask names no account');
        if (offerTag(ctx.d.n) !== p.id) fail('denied', 'a link ask lives only at the address its code names');
        return;
      }
      if ((write || del) && ctx.prev && ctx.prev.state === 'ask') {
        const prev = ctx.prev, d = ctx.d || {};
        if (op === 'update' && a.handle && (d.state === 'ok' || d.state === 'no') && d.n === prev.n && d.h === a.handle) return;
        if (del) return;
        fail('denied', 'only a signed-in account answers a link ask');
      }
      // A link offer (SPEC.md 14.14): a signed-in account opens it at the address its code names, the new device that
      // scanned the code claims it with its keys, and only the account that opened it answers it or takes it down; the
      // new device may clear it once answered. No login's tag, email or password is involved.
      if ((write || del) && op === 'set' && !ctx.prev && ctx.d && ctx.d.state === 'offer') {
        if (!a.handle || ctx.d.h !== a.handle) fail('denied', 'only a signed-in account can offer to link a device');
        if (offerTag(ctx.d.n) !== p.id) fail('denied', 'a link offer lives only at the address its code names');
        return;
      }
      if ((write || del) && ctx.prev && ctx.prev.n) {
        const prev = ctx.prev, d = ctx.d || {};
        if (a.handle && prev.h === a.handle && (del || (d.h === prev.h && d.n === prev.n))) return;
        if (op === 'update' && prev.state === 'offer' && d.state === 'wait' && d.h === prev.h && d.n === prev.n) return;   // the claim
        if (del && (prev.state === 'ok' || prev.state === 'no')) return;
        fail('denied', 'only the account that offered can answer');
      }
      // Anything else is a request at a login's tag, the road of the emailed codes (SPEC.md 14.10), closed in release
      // 16: still readable, so pages from before it find nothing new, but nobody writes, answers or removes one.
      if (list) noList();
      if (write || del) fail('denied', 'link a new device with the code one of your devices shows');
      return;
    case 'vault':
      if (list) noList();
      if (del) fail('denied', 'vaults are never deleted');   // except by account.delete, the account's last act (SPEC.md 4.7)
      return;
    case 'backup':
      if (list) noList();
      // A backup is merged by the page, never written blind: a write names the version it merged (`was`: the stored
      // `ts`, 0 for none) and is refused if another device wrote in between, so no device's keys are lost (release 19).
      if (op === 'set' || op === 'update') {
        if (typeof a.was !== 'number' || !Number.isFinite(a.was)) fail('invalid', 'a backup write names the version it merged');
        if (((ctx.prev && ctx.prev.ts) || 0) !== a.was) fail('conflict', 'the backup changed since it was read; merge again');
      }
      return;
    case 'inbox':
      // Your own notes are yours to read, tidy, and (a note to yourself) write. A note to anyone else
      // arrives only through POST /drop, so no connection ever links a sender to a recipient (SPEC.md 6).
      if (read || list || del) { own(a, p.owner); return; }
      needProven(a);
      if (op === 'update') fail('denied', 'notes are never edited');
      if (a.handle !== p.owner) fail('denied', 'notes to other people go through POST /drop');
      if (ctx.prev) fail('exists', 'a note with this id already exists');
      return;
    case 'channels':
      return chatRecord(a, op, p, ctx);
    case 'posts': case 'comments': case 'acts': case 'reads': case 'typing': case 'call': case 'chunks':
      return chatContent(a, op, p, ctx);
    case 'chain':
      // Key-chain rows (SPEC.md 5.6, release 91): every member reads them; only chat.rotate and chat.chain write them.
      needLevel(a, p.cid, 'member');
      if (!read && op !== 'watch') fail('denied', 'key-chain rows come from chat.rotate and chat.chain');
      return;
    case 'roll':
      // Member cards (SPEC.md 5.6, release 91): written by chat.card and chat.ask only; admins read, watch and clear them.
      needLevel(a, p.cid, 'admin');
      if (write) fail('denied', 'cards are written with chat.card or chat.ask');
      return;
    default:
      fail('denied', 'not allowed');
  }
}

export function createAuthz(mode) {
  if (mode === 'open') return Object.freeze({ mode, check() { /* allow everything */ } });
  if (mode === 'standard' || mode === 'identity') return Object.freeze({ mode: 'standard', check: standardCheck });
  throw new HushError('internal', 'no such authorization policy');
}
