// Path grammar (SPEC.md 7.1, 9.1). The client addresses everything by the same
// paths it used with Firestore. The first segment picks a collection kind; each
// kind has an id pattern, a storage backend and an authorization class.

import { createHmac, randomBytes } from 'node:crypto';
import { fail } from './errors.js';

const HANDLE = /^[a-z0-9_]{3,20}$/;
const CID = /^(?:[gc][A-Za-z0-9]{12}|d[A-Za-z0-9_-]{22})$/;
const ITEM_ID = /^m?[A-Za-z0-9]{12}$/;                                // posts, comments, invites, media, pointers
const MID = /^m[A-Za-z0-9]{12}$/;
const ACT_ID = /^[A-Za-z0-9]{12}~[A-Za-z0-9_-]{22}~[A-Za-z0-9_-]{1,24}$/; // post~tag~kind
const SIDE_ID = /^[0-9]{1,2}~[A-Za-z0-9_-]{22}$/;                     // epoch~tag
const CHUNK_I = /^(?:0|[1-9][0-9]{0,4})$/;                            // 0..99999; the real bound is maxPieces (limits.js)
const ADDR43 = /^[A-Za-z0-9_-]{43}$/;                                 // base64url of 32 bytes
const VAULT = /^v[A-Za-z0-9_-]{32}$/;
const BACKUP = /^b[A-Za-z0-9_-]{32}$/;
const LABEL = /^[A-Za-z0-9_-]{22}$/;                                  // random wrap labels and member tags
const CAP = /^[A-Za-z0-9_-]{43}$/;                                    // room keys (32 bytes, base64url)

export const ID = Object.freeze({ HANDLE, CID, ITEM_ID, MID, ACT_ID, SIDE_ID, CHUNK_I, ADDR43, VAULT, BACKUP, LABEL, CAP });

// kind → { top: first segment, depth: number of segments in a doc path, id: pattern, backend }
const KINDS = Object.freeze({
  directory: { top: 'directory', depth: 2, id: HANDLE, backend: 'docs' },
  search:    { top: 'search',    depth: 2, id: HANDLE, backend: 'docs' },
  presence:  { top: 'presence',  depth: 2, id: HANDLE, backend: 'memory' },
  phones:    { top: 'phones',    depth: 2, id: ADDR43, backend: 'docs', keyed: true },
  logins:    { top: 'logins',    depth: 2, id: ADDR43, backend: 'docs', keyed: true },
  accounts:  { top: 'accounts',  depth: 2, id: ADDR43, backend: 'docs', keyed: true },
  linkreqs:  { top: 'linkreqs',  depth: 2, id: ADDR43, backend: 'docs', keyed: true },
  vault:     { top: 'vault',     depth: 2, id: VAULT,  backend: 'docs', keyed: true },
  backup:    { top: 'backup',    depth: 2, id: BACKUP, backend: 'docs', keyed: true },
  channels:  { top: 'channels',  depth: 2, id: CID,    backend: 'docs' },
  posts:     { top: 'channels',  depth: 4, sub: 'posts',    id: ITEM_ID, backend: 'docs' },
  comments:  { top: 'channels',  depth: 4, sub: 'comments', id: ITEM_ID, backend: 'docs' },
  acts:      { top: 'channels',  depth: 4, sub: 'acts',     id: ACT_ID,  backend: 'docs' },
  reads:     { top: 'channels',  depth: 4, sub: 'reads',    id: SIDE_ID, backend: 'docs' },
  typing:    { top: 'channels',  depth: 4, sub: 'typing',   id: SIDE_ID, backend: 'memory' },
  chunks:    { top: 'channels',  depth: 6, sub: 'media',    id: CHUNK_I, backend: 'media' },
  // Sealed pointers that tell a person which chats they are in (SPEC.md 6; the
  // mailbox of stage 5 delivered over the authenticated connection for now).
  inbox:     { top: 'inbox',     depth: 4, sub: 'c',        id: ITEM_ID, backend: 'docs' },
});
export { KINDS };

// Collections that accept `query` and `sub` with filters (SPEC.md 7.4).
export const QUERYABLE = new Set(['channels', 'posts', 'acts', 'reads', 'typing', 'comments', 'chunks', 'search', 'inbox']);

const SUBS_BY_NAME = new Map(Object.entries(KINDS).filter(([, k]) => k.sub && k.top === 'channels').map(([name, k]) => [k.sub, name]));

function split(p) {
  if (typeof p !== 'string' || p.length === 0 || p.length > 200) fail('invalid', 'bad path');
  const segs = p.split('/');
  for (const s of segs) if (!s || s === '.' || s === '..') fail('invalid', 'bad path');
  return segs;
}

// Parses a collection path such as `channels/<cid>/posts`.
// Returns { kind, parent, cid?, mid?, owner?, keyed, top, segs } where `parent` is the normalized path.
export function parseCollectionPath(p) {
  const segs = split(p);
  const top = segs[0];
  if (segs.length === 1) {
    const kind = Object.keys(KINDS).find((n) => KINDS[n].top === top && KINDS[n].depth === 2);
    if (!kind) fail('invalid', 'unknown collection');
    return { kind, parent: top, keyed: !!KINDS[kind].keyed, top, segs };
  }
  if (segs.length === 3 && top === 'inbox' && HANDLE.test(segs[1]) && segs[2] === 'c') {
    return { kind: 'inbox', parent: segs.join('/'), owner: segs[1], keyed: false, top, segs };
  }
  if (top !== 'channels' || !CID.test(segs[1])) fail('invalid', 'unknown collection');
  if (segs.length === 3) {
    const kind = SUBS_BY_NAME.get(segs[2]);
    if (!kind || kind === 'chunks') fail('invalid', 'unknown collection');
    return { kind, parent: segs.join('/'), cid: segs[1], keyed: false, top, segs };
  }
  if (segs.length === 5 && segs[2] === 'media' && MID.test(segs[3]) && segs[4] === 'chunks') {
    return { kind: 'chunks', parent: segs.join('/'), cid: segs[1], mid: segs[3], keyed: false, top, segs };
  }
  fail('invalid', 'unknown collection');
}

// Parses a document path. Returns { kind, parent, id, cid?, mid?, owner?, keyed, backend, top, segs }.
export function parseDocPath(p) {
  const segs = split(p);
  if (segs.length < 2) fail('invalid', 'bad path');
  const id = segs[segs.length - 1];
  const col = parseCollectionPath(segs.slice(0, -1).join('/'));
  const def = KINDS[col.kind];
  if (!def.id.test(id)) fail('invalid', 'bad id');
  const out = { ...col, segs, id, keyed: !!def.keyed, backend: def.backend };
  if (col.kind === 'channels') out.cid = id;
  return out;
}

// Server-generated ids for `add`: 12 alphanumerics, like the client's rid().
const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function genId() {
  const b = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += ALNUM[b[i] % ALNUM.length];
  return s;
}

// Keyed blind addresses (SPEC.md 8.3): the stored id is HMAC(addr.key, id).
export function keyedId(key, kind, id) {
  return createHmac('sha256', key).update(kind + ':' + id).digest('base64url');
}
