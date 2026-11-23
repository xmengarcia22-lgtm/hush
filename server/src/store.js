// The document store (SPEC.md 8). Three backends behind one path grammar:
//   docs    – SQLite table `docs` in hush.db (everything durable)
//   media   – SQLite tables `chunks` (encrypted media pieces) and `media_ids` (size and expiry per media id) in media.db
//   memory  – presence, typing and call records, never written to disk
// plus the `chats` table: per chat, the hashes of its room keys and its epoch; `bans`: keyed tags of blocked usernames;
// `wraps`: per channel, epoch and keyed account tag, how many key wraps that account added outside chat.rotate;
// and `reports`: the server's own copies of reported public-channel posts, without the reporter (SPEC.md 8.7).
//
// Every successful write emits a `change` event after it is committed; the
// subscription registry turns those into pushes. A key rotation or admin change
// emits `evict` so connections holding the old level lose it.
//
// Authorization runs here, once the path is parsed and the current document is
// known, so every policy decision sees the same facts. Every public method
// takes an `actor` (the connection's identity view); `SYSTEM` bypasses checks
// for the server's own reads.

import { EventEmitter } from 'node:events';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { fail, HushError } from './errors.js';
import { log } from './log.js';
import { validateDoc, mergePatch, byteLength, isPlain } from './merge.js';
import { KINDS, QUERYABLE, ID, genId, keyedId, parseDocPath, parseCollectionPath } from './paths.js';
import { MAX_BYTES, validateForKind, applyPostUpdate, canDeletePost, labelMap, sealedMeta, tokenMatches, slottedAct } from './schemas.js';
import { validateQuery, matches, orderAndLimit, SQL_OP } from './query.js';
import { DEFAULT_LIMITS, withLimits, maxPieces } from './limits.js';
import { isAdminOf, rankOf, levelOf } from './authz.js';

export const SYSTEM = Symbol('system');
const ANON = Object.freeze({ handle: null, viaAccountKey: false, mayCreate: null, pub: null, chats: new Map() });
// One answer's documents (an mget, a query, a watch's first load), each counted as it is read, before the next is: past answerBytes
// the request is refused, so no such request has the server take from its database, build or keep more than that and one document, besides
// the rows SQLite visits to test a query's conditions or sort it (which fields a query may name: query.js). In an mget and a watch by
// ids, a document the reader is shown only part of, or as none whether or not it is there, counts as the largest its kind can be
// (_shown, release 112): it is read whole, and neither a refusal nor what is paid may tell the size of what is not shown, or whether
// it is there. A plain get reads one document and is not counted. An answer leaves room for pushes under sendBufferMaxBytes. The
// store keeps the running count (a request's share is the difference) and a refusal carries its own, which the connection pays before
// it is answered again (protocol.js) (release 110).
const capped = (st) => { let n = 0; return (b) => { st.counted += b; if ((n += b) > st.limits.answerBytes) throw Object.assign(new HushError('toolarge', 'too much to answer at once; ask for less'), { n }); }; };
// A document answered as it is stored is counted by its stored text's length, not by a new stringify of it (_read).
const stored = new WeakMap();
const answered = (d) => stored.get(d) ?? byteLength(d);

const SCHEMA_MAIN = `
CREATE TABLE IF NOT EXISTS docs(
  path   TEXT PRIMARY KEY,
  parent TEXT NOT NULL,
  id     TEXT NOT NULL,
  d      TEXT NOT NULL,
  ts     REAL,
  exp    REAL NOT NULL DEFAULT 0
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS docs_parent_ts ON docs(parent, ts);
CREATE INDEX IF NOT EXISTS docs_parent_id ON docs(parent, id);
CREATE INDEX IF NOT EXISTS docs_exp ON docs(exp) WHERE exp > 0;
CREATE INDEX IF NOT EXISTS docs_channels_vis ON docs(json_extract(d, '$.visibility')) WHERE parent = 'channels';
CREATE INDEX IF NOT EXISTS docs_last_exp ON docs(json_extract(d, '$.last.exp')) WHERE parent = 'channels';
CREATE INDEX IF NOT EXISTS docs_post ON docs(parent, json_extract(d, '$.post')) WHERE json_extract(d, '$.post') IS NOT NULL;
CREATE INDEX IF NOT EXISTS docs_search_h  ON docs(json_extract(d, '$.h'))  WHERE parent = 'search';
CREATE INDEX IF NOT EXISTS docs_search_n  ON docs(json_extract(d, '$.n'))  WHERE parent = 'search';
CREATE INDEX IF NOT EXISTS docs_search_n2 ON docs(json_extract(d, '$.n2')) WHERE parent = 'search';
CREATE TABLE IF NOT EXISTS chats(
  cid   TEXT PRIMARY KEY,
  type  TEXT NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 0,
  cap_m TEXT NOT NULL,
  cap_a TEXT,
  cap_o TEXT,
  cap_b TEXT
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS meta(k TEXT PRIMARY KEY, v TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS gone(k TEXT PRIMARY KEY, ts REAL NOT NULL) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS bans(cid TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(cid, tag)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS wraps(cid TEXT NOT NULL, tag TEXT NOT NULL, e INTEGER NOT NULL, n INTEGER NOT NULL, ts REAL NOT NULL, PRIMARY KEY(cid, tag, e)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY, ts REAL NOT NULL, exp REAL NOT NULL, cid TEXT NOT NULL, pid TEXT NOT NULL,
  reason TEXT NOT NULL, name TEXT, post TEXT NOT NULL, key TEXT, tag TEXT NOT NULL UNIQUE) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS reports_ts ON reports(ts);
CREATE INDEX IF NOT EXISTS reports_exp ON reports(exp);
CREATE TABLE IF NOT EXISTS push(h TEXT NOT NULL, dev TEXT NOT NULL, tok TEXT NOT NULL, env TEXT NOT NULL, ts REAL NOT NULL, PRIMARY KEY(h, dev)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS apush(h TEXT NOT NULL, dev TEXT NOT NULL, tok TEXT NOT NULL, env TEXT NOT NULL, ts REAL NOT NULL, PRIMARY KEY(h, dev)) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS wake(tk TEXT PRIMARY KEY, h TEXT NOT NULL, dev TEXT NOT NULL, ts REAL NOT NULL, k TEXT NOT NULL DEFAULT 'c') WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS wake_dev ON wake(h, dev);
`;

const SCHEMA_MEDIA = `
CREATE TABLE IF NOT EXISTS chunks(
  cid TEXT NOT NULL,
  mid TEXT NOT NULL,
  i   INTEGER NOT NULL,
  iv  TEXT NOT NULL,
  d   BLOB NOT NULL,
  PRIMARY KEY (cid, mid, i)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS media_ids(
  cid   TEXT NOT NULL,
  mid   TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  exp   INTEGER NOT NULL DEFAULT 0,
  oh    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (cid, mid)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS media_ids_exp ON media_ids(exp) WHERE exp > 0;
`;

const PRAGMAS = [
  'PRAGMA journal_mode = WAL',
  'PRAGMA synchronous = NORMAL',
  'PRAGMA secure_delete = ON',
  'PRAGMA foreign_keys = ON',
  'PRAGMA temp_store = MEMORY',
  'PRAGMA busy_timeout = 5000',
];

const SCHEMA_VERSION = '2';
const ADD_KINDS = new Set(['posts', 'comments']);
const EXP_KINDS = new Set(['posts', 'comments']);
const SEALED_KINDS = new Set(['posts', 'comments']);
const EPOCH_KINDS = new Set(['posts', 'comments', 'acts']);
const REPORT_REASONS = new Set(['spam', 'abuse', 'illegal', 'other']);
const REPORT_TTL_MS = 90 * 86400_000;   // a report is kept 90 days, then swept (SPEC.md 8.7)
const TOP_LITERAL = /^[a-z]+$/;   // top-level collection names are safe to inline into SQL
const PREVIEW_FIELDS = ['type', 'visibility', 'epoch', 'keys', 'akeys', 'openKeys'];
const PUBLIC_PREVIEW_FIELDS = ['name', 'desc', 'photo', 'owner', 'admins', 'ts', 'last'];
// In any channel only the owner and the admins may learn who the subscribers are (SPEC.md 5.5): read or watched below admin level
// (authz.js 'member') a channel's record comes without its sealed member and blocked lists, which every subscriber's key opens. A
// group's members see each other.
const forLevel = (mode, d) => { if (mode === 'slotted') return d && d.an === 1 ? d : null; if (mode !== 'member' || !d || d.type !== 'channel' || d.meta === undefined) return d; const t = { ...d }; delete t.meta; return t; };

const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
// Hashes of keys and proofs are compared in constant time, so how far a wrong key matches never shows in the timing.
export const hashEq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
// Sealed metadata is sealed under the chat's current epoch and nothing else (SPEC.md 5.3): a copy from an earlier
// epoch would show a member list from before someone was removed, and clients ignore one.
// Writes that only add wraps stop here, so a rotation (a removal) always has room in a chat record (SPEC.md 5.4).
const keysRoomOk = (d) => byteLength(d) <= MAX_BYTES.channels * 0.75;
// And what members and admins write (wraps, the sealed lists, invite links) leaves room for the owner's own part (ometa).
const ownerRoomOk = (d) => byteLength(d) <= MAX_BYTES.channels - 300 * 1024;
const metaEpochOk = (d) => !isPlain(d.meta) || d.meta.e === (d.epoch === undefined ? 0 : d.epoch);
// The owner's part (`ometa`) is not re-sealed at every rotation: any epoch the chat has had, up to the current one.
const ometaEpochOk = (d) => !isPlain(d.ometa) || d.ometa.e <= (d.epoch === undefined ? 0 : d.epoch);
const metaChanged = (d, prev, f = 'meta') => isPlain(d[f]) && JSON.stringify(d[f]) !== JSON.stringify(prev && prev[f]);
// A public channel publishes its keys (openKeys), so a member list sealed under one of them is anyone's to read: set and update keep
// none (SPEC.md 5.3). One under a key it does not publish stays: going private, chat.rotate seals a fresh list while the record is
// still public, and other writes (an admin's post moves `ts`) may land before the update that makes it private.
const openMeta = (d) => isPlain(d.meta) && isPlain(d.openKeys) && Object.hasOwn(d.openKeys, String(d.meta.e));

// SPEC.md 4.2 (release 21): when an account's keys change (kv rises) the server appends the old signing key and the
// time to `prev`, so every device can still check messages signed before the change. Clients may not write it.
function withKeyHistory(d, prevDoc, now) {
  const base = prevDoc && Array.isArray(prevDoc.prev) ? prevDoc.prev : [];
  const kvOld = prevDoc ? (prevDoc.kv === undefined ? 1 : prevDoc.kv) : 1, kvNew = d.kv === undefined ? 1 : d.kv;
  const changed = prevDoc && prevDoc.sig && !(d.sig && d.sig.x === prevDoc.sig.x && d.sig.y === prevDoc.sig.y);
  const hist = changed && kvNew > kvOld ? [...base.slice(-7), { sig: { x: prevDoc.sig.x, y: prevDoc.sig.y }, until: now }] : base;
  const out = { ...d }; if (hist.length) out.prev = hist; else delete out.prev; return out;
}

function openDb(file, schema) {
  const db = new DatabaseSync(file);
  for (const p of PRAGMAS) db.exec(p);
  db.exec(schema);
  return db;
}

// Columns added after a table first shipped; `CREATE TABLE IF NOT EXISTS` leaves an older table as it was.
function ensureColumn(db, table, column, decl) {
  const have = db.prepare(`PRAGMA table_info(${table})`).all().some((r) => r.name === column);
  if (!have) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

function loadOrCreateKey(file) {
  if (existsSync(file)) {
    const k = readFileSync(file);
    if (k.length < 32) fail('internal', 'address key file is too short');
    return k;
  }
  const k = randomBytes(32);
  writeFileSync(file, k, { mode: 0o600, flag: 'wx' });
  try { chmodSync(file, 0o600); } catch { /* best effort on Windows */ }
  return k;
}

// In-memory backend for presence, typing and call records.
class MemoryBackend {
  constructor() { this.parents = new Map(); }
  _col(parent, create) {
    let m = this.parents.get(parent);
    if (!m && create) { m = new Map(); this.parents.set(parent, m); }
    return m;
  }
  get(parent, id, now) {
    const m = this._col(parent, false);
    const e = m && m.get(id);
    if (!e) return null;
    if (e.exp <= now) { m.delete(id); return null; }
    return e.d;
  }
  set(parent, id, d, exp) { this._col(parent, true).set(id, { d, exp }); }
  delete(parent, id) {
    const m = this._col(parent, false);
    if (!m) return false;
    const had = m.delete(id);
    if (m.size === 0) this.parents.delete(parent);
    return had;
  }
  list(parent, now) {
    const m = this._col(parent, false);
    if (!m) return [];
    const out = [];
    for (const [id, e] of m) { if (e.exp > now) out.push({ id, d: e.d }); else m.delete(id); }
    return out;
  }
  prune(now) {
    const gone = [];
    for (const [parent, m] of this.parents) {
      for (const [id, e] of m) if (e.exp <= now) { m.delete(id); gone.push({ parent, id }); }
      if (m.size === 0) this.parents.delete(parent);
    }
    return gone;
  }
}

export class Store extends EventEmitter {
  constructor({ dataDir, limits = DEFAULT_LIMITS, addrKeyFile, now = Date.now, authz = null, mediaMaxPages = 0 } = {}) {
    super();
    if (!dataDir) fail('internal', 'dataDir is required');
    this.dataDir = dataDir;
    this.mediaMaxPages = mediaMaxPages;   // tests only: caps media.db at so many pages, so a full disk can be rehearsed on one that isn't
    this.limits = withLimits(DEFAULT_LIMITS, limits);
    this.addrKeyFile = addrKeyFile || join(dataDir, 'addr.key');
    this.now = now;
    this.authz = authz;
    this.mem = new MemoryBackend();
    this.counted = 0;      // every byte the answers have counted (capped), ever: a request's share is the difference (protocol.js)
    this.unanswered = 0;   // of those, what an mget counted and did not answer (a preview, a row answered as none)
    this.pubs = [];        // the ids of the public channels, in no order, and where each is in it: the listing picks among them (_listing)
    this.pubAt = new Map();
    this.db = null;
    this.media = null;
  }

  open() {
    mkdirSync(this.dataDir, { recursive: true });
    this.addrKey = loadOrCreateKey(this.addrKeyFile);
    this.db = openDb(join(this.dataDir, 'hush.db'), SCHEMA_MAIN);
    ensureColumn(this.db, 'chats', 'cap_b', 'TEXT');   // a DM's base key (SPEC.md 5.1), added in stage 5
    ensureColumn(this.db, 'wake', 'k', "TEXT NOT NULL DEFAULT 'c'");   // the ticket's kind: c rings (every ticket before release 65), m nudges "New message"
    ensureColumn(this.db, 'chats', 'lv', 'TEXT');   // a channel's leave rotations of the last day (release 91): a JSON list of the server's times
    this.media = openDb(join(this.dataDir, 'media.db'), SCHEMA_MEDIA);
    ensureColumn(this.media, 'media_ids', 'oh', "TEXT NOT NULL DEFAULT ''");   // the hash of the uploader's media token (SPEC.md 7.7), added in release 80; '' for older media
    if (this.mediaMaxPages > 0) this.media.exec('PRAGMA max_page_count = ' + Math.floor(this.mediaMaxPages));
    this.db.prepare('INSERT OR REPLACE INTO meta(k, v) VALUES (?, ?)').run('schema', SCHEMA_VERSION);
    this.q = {
      get: this.db.prepare('SELECT d FROM docs WHERE path = ?'),
      has: this.db.prepare('SELECT 1 FROM docs WHERE path = ?'),
      put: this.db.prepare('INSERT INTO docs(path, parent, id, d, ts, exp) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET d = excluded.d, ts = excluded.ts, exp = excluded.exp'),
      del: this.db.prepare('DELETE FROM docs WHERE path = ?'),
      goneAdd: this.db.prepare('INSERT OR REPLACE INTO gone(k, ts) VALUES (?, ?)'),
      goneGet: this.db.prepare('SELECT ts FROM gone WHERE k = ?'),
      goneSweep: this.db.prepare('DELETE FROM gone WHERE ts < ?'),
      delUnder: this.db.prepare("DELETE FROM docs WHERE parent = ? OR parent LIKE ? ESCAPE '\\'"),
      expired: this.db.prepare('SELECT path, parent, id FROM docs WHERE exp > 0 AND exp < ? LIMIT 500'),
      count: this.db.prepare('SELECT COUNT(*) AS n FROM docs'),
      countUnder: this.db.prepare('SELECT COUNT(*) AS n FROM docs WHERE parent = ?'),
      // A full mailbox gives way with other people's notes first; the owner's own notes (their chat list) go last and
      // are never swept.
      oldestUnder: this.db.prepare("SELECT id FROM docs WHERE parent = ? ORDER BY json_extract(d, '$.own') IS NOT NULL, ts ASC, id ASC LIMIT ?"),
      staleLinkreqs: this.db.prepare("DELETE FROM docs WHERE parent = 'linkreqs' AND (ts IS NULL OR ts < ?)"),
      staleNotes: this.db.prepare("SELECT path, parent, id FROM docs WHERE parent LIKE 'inbox/%/c' AND ts IS NOT NULL AND ts < ? AND json_extract(d, '$.own') IS NULL LIMIT 500"),
      chatGet: this.db.prepare('SELECT type, epoch, cap_m, cap_a, cap_o, cap_b, lv FROM chats WHERE cid = ?'),
      chatPut: this.db.prepare('INSERT INTO chats(cid, type, epoch, cap_m, cap_a, cap_o, cap_b) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      chatBase: this.db.prepare('UPDATE chats SET cap_b = ? WHERE cid = ? AND cap_b IS NULL'),
      chatRotate: this.db.prepare('UPDATE chats SET epoch = ?, cap_m = ? WHERE cid = ?'),
      chatAdmins: this.db.prepare('UPDATE chats SET cap_a = ? WHERE cid = ?'),
      chatRebase: this.db.prepare('UPDATE chats SET cap_b = ? WHERE cid = ?'),
      chatOwner: this.db.prepare('UPDATE chats SET cap_o = ? WHERE cid = ?'),
      chatLeaves: this.db.prepare('UPDATE chats SET lv = ? WHERE cid = ?'),
      chatDel: this.db.prepare('DELETE FROM chats WHERE cid = ?'),
      chatVis: this.db.prepare("SELECT json_extract(d, '$.visibility') AS v FROM docs WHERE path = ?"),
      wrapGet: this.db.prepare('SELECT n, ts FROM wraps WHERE cid = ? AND tag = ? AND e = ?'),
      wrapPut: this.db.prepare('INSERT OR REPLACE INTO wraps(cid, tag, e, n, ts) VALUES (?, ?, ?, ?, ?)'),
      wrapsBelow: this.db.prepare('DELETE FROM wraps WHERE cid = ? AND e < ?'),
      wrapsDelChat: this.db.prepare('DELETE FROM wraps WHERE cid = ?'),
      wrapsDelTag: this.db.prepare('DELETE FROM wraps WHERE cid = ? AND tag = ?'),
      // A full roll gives way with the oldest join request, or card from before the last key change but one: no admin page acts on those.
      rollStale: this.db.prepare("SELECT id FROM docs WHERE parent = ? AND (json_extract(d, '$.iid') IS NOT NULL OR json_extract(d, '$.e') < ?) ORDER BY ts ASC LIMIT 1"),
      actsOf: this.db.prepare("SELECT id, json_extract(d, '$.an') AS an FROM docs WHERE parent = ? AND id >= ? AND id < ?"),
      // Named, as lastExpired: without it each deleted or expired message reads every comment of its chat (70 ms at 50,000).
      commentsOf: this.db.prepare("SELECT id FROM docs INDEXED BY docs_post WHERE parent = ? AND json_extract(d, '$.post') = ?"),
      // Named: without statistics the planner reads every chat record (docs_parent_id) instead, once a minute.
      lastExpired: this.db.prepare("SELECT path FROM docs INDEXED BY docs_last_exp WHERE parent = 'channels' AND json_extract(d, '$.last.exp') > 0 AND json_extract(d, '$.last.exp') < ? LIMIT 100"),
      banGet: this.db.prepare('SELECT 1 FROM bans WHERE cid = ? AND tag = ?'),
      banPut: this.db.prepare('INSERT OR IGNORE INTO bans(cid, tag) VALUES (?, ?)'),
      banDel: this.db.prepare('DELETE FROM bans WHERE cid = ? AND tag = ?'),
      banCount: this.db.prepare('SELECT COUNT(*) AS n FROM bans WHERE cid = ?'),
      banDelChat: this.db.prepare('DELETE FROM bans WHERE cid = ?'),
      reportPut: this.db.prepare('INSERT OR IGNORE INTO reports(id, ts, exp, cid, pid, reason, name, post, key, tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'),
      reportList: this.db.prepare('SELECT id, ts, cid, pid, reason, name, post, key FROM reports WHERE ts < ? AND exp >= ? ORDER BY ts DESC, id DESC LIMIT ?'),
      reportSweep: this.db.prepare('DELETE FROM reports WHERE exp < ?'),
      pushPut: this.db.prepare('INSERT INTO push(h, dev, tok, env, ts) VALUES (?, ?, ?, ?, ?) ON CONFLICT(h, dev) DO UPDATE SET tok = excluded.tok, env = excluded.env, ts = excluded.ts'),
      pushGet: this.db.prepare('SELECT tok, env FROM push WHERE h = ? AND dev = ?'),
      pushSame: this.db.prepare('DELETE FROM push WHERE tok = ? AND NOT (h = ? AND dev = ?)'),
      pushDel: this.db.prepare('DELETE FROM push WHERE h = ? AND dev = ?'),
      pushDelAcct: this.db.prepare('DELETE FROM push WHERE h = ?'),
      apushPut: this.db.prepare('INSERT INTO apush(h, dev, tok, env, ts) VALUES (?, ?, ?, ?, ?) ON CONFLICT(h, dev) DO UPDATE SET tok = excluded.tok, env = excluded.env, ts = excluded.ts'),
      apushGet: this.db.prepare('SELECT tok, env FROM apush WHERE h = ? AND dev = ?'),
      apushSame: this.db.prepare('DELETE FROM apush WHERE tok = ? AND NOT (h = ? AND dev = ?)'),
      apushDel: this.db.prepare('DELETE FROM apush WHERE h = ? AND dev = ?'),
      apushDelAcct: this.db.prepare('DELETE FROM apush WHERE h = ?'),
      wakePut: this.db.prepare('INSERT INTO wake(tk, h, dev, ts, k) VALUES (?, ?, ?, ?, ?)'),
      wakeGet: this.db.prepare('SELECT h, dev, k FROM wake WHERE tk = ?'),
      wakeCount: this.db.prepare('SELECT COUNT(*) AS n FROM wake WHERE h = ? AND dev = ?'),
      wakeDel: this.db.prepare('DELETE FROM wake WHERE tk = ? AND h = ?'),
      wakeDelDev: this.db.prepare('DELETE FROM wake WHERE h = ? AND dev = ?'),
      wakeDelAcct: this.db.prepare('DELETE FROM wake WHERE h = ?'),
      chunkGet: this.media.prepare('SELECT i, iv, d FROM chunks WHERE cid = ? AND mid = ? AND i = ?'),
      chunkPut: this.media.prepare('INSERT INTO chunks(cid, mid, i, iv, d) VALUES (?, ?, ?, ?, ?) ON CONFLICT(cid, mid, i) DO UPDATE SET iv = excluded.iv, d = excluded.d'),
      chunkDel: this.media.prepare('DELETE FROM chunks WHERE cid = ? AND mid = ? AND i = ?'),
      chunkDelChat: this.media.prepare('DELETE FROM chunks WHERE cid = ?'),
      chunkList: this.media.prepare('SELECT i, iv, d FROM chunks WHERE cid = ? AND mid = ? ORDER BY i'),
      chunkSize: this.media.prepare('SELECT length(d) AS n FROM chunks WHERE cid = ? AND mid = ? AND i = ?'),
      chunkInsert: this.media.prepare('INSERT INTO chunks(cid, mid, i, iv, d) VALUES (?, ?, ?, ?, ?)'),
      chunkDelMedia: this.media.prepare('DELETE FROM chunks WHERE cid = ? AND mid = ?'),
      chunkCopy: this.media.prepare('INSERT INTO chunks(cid, mid, i, iv, d) SELECT ?, ?, i, iv, d FROM chunks WHERE cid = ? AND mid = ?'),
      midGet: this.media.prepare('SELECT bytes, exp, oh FROM media_ids WHERE cid = ? AND mid = ?'),
      midPut: this.media.prepare('INSERT INTO media_ids(cid, mid, bytes, exp, oh) VALUES (?, ?, ?, ?, ?) ON CONFLICT(cid, mid) DO UPDATE SET bytes = excluded.bytes, exp = excluded.exp'),   // oh is set when the row is born, never rewritten
      midDel: this.media.prepare('DELETE FROM media_ids WHERE cid = ? AND mid = ?'),
      midDelChat: this.media.prepare('DELETE FROM media_ids WHERE cid = ?'),
      midChatBytes: this.media.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM media_ids WHERE cid = ?'),
      midTotal: this.media.prepare('SELECT COALESCE(SUM(bytes), 0) AS bytes, COUNT(*) AS ids FROM media_ids'),
      midExpired: this.media.prepare('SELECT cid, mid FROM media_ids WHERE exp > 0 AND exp < ? LIMIT 200'),
      chatTtl: this.db.prepare("SELECT json_extract(d, '$.ttl') AS ttl FROM docs WHERE path = ?"),   // one indexed read per sealed message, no parse of the chat record
    };
    // Media stored before stage 6 had no per-media record: count it once, so it is part of each chat's allowance.
    if (!this.media.prepare('SELECT 1 FROM media_ids LIMIT 1').get() && this.media.prepare('SELECT 1 FROM chunks LIMIT 1').get()) {
      this.media.exec('INSERT INTO media_ids(cid, mid, bytes, exp) SELECT cid, mid, SUM(length(d)), 0 FROM chunks GROUP BY cid, mid');
    }
    // The public channels, read once (through their index; a start reads each of their records for it) and then kept in step (_emit).
    // shortcut: a record made public behind the store's back (a hand edit) is not listed until the store writes it or starts again.
    for (const r of this.db.prepare("SELECT path FROM docs INDEXED BY docs_channels_vis WHERE parent = 'channels' AND json_extract(d, '$.visibility') = 'public'").iterate()) this._pub(r.path.slice('channels/'.length), true);
    // Search is opt-in (SPEC.md 7.6): an entry whose owner never turned it on, as with every account before release 24, comes off.
    this.db.exec("DELETE FROM docs WHERE parent = 'search' AND NOT EXISTS (SELECT 1 FROM docs u WHERE u.path = 'directory/' || docs.id AND json_extract(u.d, '$.findable') = 1)");
    return this;
  }

  close() {
    if (this.db) { this.db.close(); this.db = null; }
    if (this.media) { this.media.close(); this.media = null; }
  }

  // ---- helpers ----------------------------------------------------------------

  _check(actor, op, p, ctx) {
    if (!this.authz || actor === SYSTEM) return undefined;
    return this.authz.check(actor || ANON, op, p, ctx || {});
  }

  // Update and delete answer by what is stored, so under a chat and for the secured mark they first check that this connection may
  // read the path: one that may not learns nothing of what is there. Below admin level a channel's read marks read as none ('blind'); a
  // channel's reactions and votes are chat.act's alone at every level. A set, update or delete reads a chat record (up to 2 MB) only for a
  // connection that holds the chat, as each of them needs; a delete that finds no `chats` row reads it first, as before 110, and an
  // update of a chat that is gone (no row and no record) answers notfound, as before 110 (release 110; the update since release 112).
  _readOk(actor, p) {
    if (p.kind === 'acts') { this._check(actor, 'set', p); return; }
    if (p.kind === 'channels') { this._check(actor, 'watch', p); return; }
    if (((p.cid && p.kind !== 'channels') || p.kind === 'secure') && this._check(actor, 'get', p) === 'blind') fail('denied', 'read marks are written whole');
  }

  _tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; }
    catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }

  _storagePath(p) {
    const id = p.keyed ? keyedId(this.addrKey, p.kind, p.id) : p.id;
    return { id, path: p.parent + '/' + id };
  }

  _read(p, now) {
    switch (p.backend) {
      case 'memory': return this.mem.get(p.parent, p.id, now);
      case 'media': {
        const r = this.q.chunkGet.get(p.cid, p.mid, Number(p.id));
        return r ? { i: Number(r.i), iv: r.iv, d: Buffer.from(r.d).toString('base64') } : null;
      }
      default: {
        const r = this.q.get.get(this._storagePath(p).path);
        if (!r) return null;
        const d = JSON.parse(r.d);
        if (d !== null && typeof d === 'object') stored.set(d, Buffer.byteLength(r.d));   // a row written by hand may hold null, text or a number: answered as it is
        return d;
      }
    }
  }

  _write(p, d, now) {
    switch (p.backend) {
      case 'memory': {
        const ttl = p.kind === 'typing' ? this.limits.typingTtlMs : p.kind === 'call' ? this.limits.callTtlMs : this.limits.presenceTtlMs;
        this.mem.set(p.parent, p.id, d, now + ttl);
        return;
      }
      case 'media': {
        const old = this.q.chunkSize.get(p.cid, p.mid, Number(p.id));
        const buf = Buffer.from(d.d, 'base64');
        this.q.chunkPut.run(p.cid, p.mid, Number(p.id), d.iv, buf);
        this._midAdd(p.cid, p.mid, buf.length - (old ? Number(old.n) : 0));
        return;
      }
      default: {
        const sp = this._storagePath(p);
        const ts = p.kind === 'linkreqs' ? now : typeof d.ts === 'number' ? d.ts : null;   // the server's clock, not the client's: the sweep ages link requests by it
        const exp = p.kind === 'roll' ? now + this.limits.cardTtlMs : EXP_KINDS.has(p.kind) && typeof d.exp === 'number' && d.exp > 0 ? d.exp : 0;   // a card goes 30 days after it was written
        this.q.put.run(sp.path, p.parent, sp.id, JSON.stringify(d), ts, exp);
      }
    }
  }

  _remove(p) {
    switch (p.backend) {
      case 'memory': return this.mem.delete(p.parent, p.id);
      case 'media': {
        const old = this.q.chunkSize.get(p.cid, p.mid, Number(p.id));
        if (!old) return false;
        this.q.chunkDel.run(p.cid, p.mid, Number(p.id));
        this._midAdd(p.cid, p.mid, -Number(old.n));
        return true;
      }
      default: return Number(this.q.del.run(this._storagePath(p).path).changes) > 0;
    }
  }

  _emit(p, d, type, actor) {   // `by`: the writer's connection, for the server's own listeners; subs.js never sends it
    if (p.kind === 'channels') this._pub(p.id, type === 'set' && d.visibility === 'public');   // every write and delete of a chat record comes here
    this.emit('change', { kind: p.kind, parent: p.parent, id: p.id, d: type === 'set' ? d : null, type, by: actor && actor.conn ? actor.conn : null });
  }

  _checkSize(kind, d) {
    const max = MAX_BYTES[kind];
    if (!max) fail('invalid', 'unknown collection');
    if (byteLength(d) > max) fail('toolarge', 'document too large for this collection');
  }

  _chatDoc(cid) {
    const p = parseDocPath('channels/' + cid);
    return { p, doc: this._read(p, this.now()), row: this.q.chatGet.get(cid) || null };
  }

  // SPEC.md 5.7: in a chat with a message timer every sealed message disappears: `exp` is required and at most
  // max(ts, now) + ttl, with a minute's allowance for clocks. The page sets ts + ttl for a message and the server's time + ttl
  // for its hidden wake tickets (dated before the chat's last message so nothing moves). `exp` is under the sender's
  // signature, so a bad one is refused, never rewritten. An edit that keeps the stored time and expiry passes; a service note
  // has no exp.
  _timerOk(p, d, prev) {
    if (!SEALED_KINDS.has(p.kind) || d.sl !== 1) return;
    if (prev && d.exp === prev.exp && d.ts === prev.ts) return;
    const r = this.q.chatTtl.get('channels/' + p.cid), ttl = r ? Number(r.ttl) : 0;
    if (!(ttl > 0)) return;
    const lim = Math.max(d.ts, this.now()) + ttl * 1000 + 60_000;
    if (!(typeof d.exp === 'number' && d.exp > 0 && d.exp <= lim)) fail('invalid', `${p.kind === 'comments' ? 'comment' : 'post'}: this chat has a message timer; "exp" must be at most ts + ttl`);
  }

  // SPEC.md 5.7 (release 91): in a channel a new post, comment, reaction or vote is sealed under the current epoch, so nobody the
  // last key change left out can read it; an edit may keep its own epoch. A page that raced a key change hears `conflict`.
  _epochOk(p, d, prev) {
    if (!EPOCH_KINDS.has(p.kind)) return;
    const row = this.q.chatGet.get(p.cid);
    if (!row || row.type !== 'channel' || d.e === Number(row.epoch)) return;
    if (prev && p.kind !== 'acts' && d.e === prev.e) return;
    fail('conflict', `${p.kind === 'acts' ? 'reaction' : p.kind === 'comments' ? 'comment' : 'post'}: sealed under an older key; the channel has a newer one`);
  }

  // ---- documents ----------------------------------------------------------------
  // All methods take string paths exactly as the client sends them, plus the actor.

  get(path, actor) {
    const p = parseDocPath(path);
    return { id: p.id, d: this._shown(p, this._check(actor, 'get', p)).d };
  }

  // A document as its reader may see it. `most` is set when the reader is shown only part of it, or as none whether or not it is there
  // (a chat record's preview, the copy of a channel a member gets, a channel's reactions and votes): the largest its kind can be,
  // which is what it counts as in an mget or a watch by ids (capped).
  _shown(p, mode) {
    if (mode === 'blind') return { d: null, most: 0 };   // as if there were none (authz.js): not read
    const all = this._read(p, this.now());
    let d = all;
    if (d && mode === 'preview') {
      const fields = d.visibility === 'public' ? [...PREVIEW_FIELDS, ...PUBLIC_PREVIEW_FIELDS] : PREVIEW_FIELDS;
      d = {};
      for (const f of fields) if (all[f] !== undefined) d[f] = all[f];
    }
    d = forLevel(mode, d);
    return { d, most: mode === 'slotted' || d !== all ? MAX_BYTES[p.kind] : 0 };
  }

  mget(paths, actor) {
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > this.limits.mgetMax) fail('invalid', 'mget: bad path list');
    const ok = capped(this), got = new Map();   // a path named again is read once and counted again: the answer has it again
    return paths.map((path) => {
      let g = got.get(path);
      if (g) ok(g[1]);
      else {   // a first read: one shown in part counts as the most it can be, and what is not answered of that is the connection's to pay
        const p = parseDocPath(path), { d, most } = this._shown(p, this._check(actor, 'get', p)), n = answered(d);
        got.set(path, g = [{ id: p.id, d }, n]);
        if (most) this.unanswered += most - n;
        ok(most || n);
      }
      return g[0];
    });
  }

  set(path, d, actor) {
    const p = parseDocPath(path);
    validateDoc(d);
    this._checkSize(p.kind, d);
    if (p.kind === 'acts' || p.kind === 'channels') this._readOk(actor, p);   // a channel's acts, a chat record the connection does not hold: refused before anything stored is read
    const now = this.now();
    const prev = this._read(p, now);
    this._check(actor, 'set', p, { d, prev });
    if (p.kind === 'channels' && d.visibility === 'public') { d = { ...d }; delete d.ometa; delete d.n; if (openMeta(d)) delete d.meta; }   // a public channel's description is plain, its keys published, its count none (until Phase 3)
    if (p.kind === 'directory') { d = withKeyHistory(d, prev, now); this._checkSize(p.kind, d); }
    if (prev && SEALED_KINDS.has(p.kind)) fail('exists', 'a message with this id already exists');
    if (p.kind === 'channels' && metaChanged(d, prev) && !metaEpochOk(d)) fail('invalid', 'chat: sealed meta must be sealed under the current epoch');
    if (p.kind === 'channels' && metaChanged(d, prev, 'ometa') && !ometaEpochOk(d)) fail('invalid', 'chat: ometa must be sealed under an epoch the chat has reached');
    validateForKind(p.kind, { ...p, now, op: 'set', prev }, d);
    this._timerOk(p, d, prev);
    this._epochOk(p, d, prev);
    if (p.kind === 'inbox' && !prev) this.makeRoom(p.parent, this.limits.inboxMax - 1);   // the owner's own notes count too, so they can't pile up
    this._write(p, d, now);
    if (p.kind === 'channels' && d.visibility === 'public' && prev && prev.visibility !== 'public') this.q.banDelChat.run(p.id);   // a public channel has no blocks
    if (p.kind === 'directory') this._pushCascade(p.id, prev, d);
    this._emit(p, d, 'set', actor);
    return { id: p.id };
  }

  update(path, patch, actor) {
    const p = parseDocPath(path);
    // A chat that is gone (its small row goes with it) answers notfound, as before 110; a record with no row is refused like any other.
    if (p.kind === 'channels' && !this.q.chatGet.get(p.id) && !this.q.has.get('channels/' + p.id)) fail('notfound', 'no document to update');
    this._readOk(actor, p);
    validateDoc(patch, 'patch');
    const now = this.now();
    const prev = this._read(p, now);
    if (!prev) fail('notfound', 'no document to update');
    let merged = SEALED_KINDS.has(p.kind) ? applyPostUpdate(prev, patch) : mergePatch(prev, patch);
    // A chat's latest-message marker is replaced whole, not merged into the one before (release 112): the page writes every field of
    // it each time, and what sat under any other key stayed for good, in the way of every later marker once `last` has a size (schemas.js).
    if (p.kind === 'channels' && isPlain(patch.last)) merged.last = mergePatch({}, patch.last);
    validateDoc(merged);
    this._checkSize(p.kind, merged);
    this._check(actor, 'update', p, { d: merged, prev, patch });
    if (p.kind === 'channels' && merged.visibility === 'public') { delete merged.ometa; delete merged.n; if (openMeta(merged)) delete merged.meta; }   // a public channel's description is plain, its keys published, its count none (until Phase 3)
    if (p.kind === 'channels' && JSON.stringify(merged.keys) !== JSON.stringify(prev.keys) && !keysRoomOk(merged)) fail('toolarge', 'this chat has no room for more keys');
    if (p.kind === 'channels' && ['keys', 'meta', 'invites'].some((f) => JSON.stringify(merged[f]) !== JSON.stringify(prev[f])) && byteLength(merged) > byteLength(prev) && !ownerRoomOk(merged)) fail('toolarge', 'this chat has no room for that; a removal clears space');
    const nInv = (d) => (isPlain(d.invites) ? Object.keys(d.invites).length : 0);
    if (p.kind === 'channels' && nInv(merged) > 50 && nInv(merged) > nInv(prev)) fail('toolarge', 'too many invite links: revoke some first');
    if (p.kind === 'directory') { merged = withKeyHistory(merged, prev, now); this._checkSize(p.kind, merged); }
    if (p.kind === 'channels' && metaChanged(merged, prev) && !metaEpochOk(merged)) fail('invalid', 'chat: sealed meta must be sealed under the current epoch');
    if (p.kind === 'channels' && metaChanged(merged, prev, 'ometa') && !ometaEpochOk(merged)) fail('invalid', 'chat: ometa must be sealed under an epoch the chat has reached');
    validateForKind(p.kind, { ...p, now, op: 'update', prev }, merged);
    this._timerOk(p, merged, prev);
    this._epochOk(p, merged, prev);
    const w = p.kind === 'channels' && JSON.stringify(merged.keys) !== JSON.stringify(prev.keys) ? this._wrapsAdded(p.id, prev.keys, merged.keys, actor) : null;
    if (w) this._tx(() => { this._write(p, merged, now); this._wrapsAdd(p.id, w); }); else this._write(p, merged, now);
    if (p.kind === 'channels' && merged.visibility === 'public' && prev.visibility !== 'public') this.q.banDelChat.run(p.id);   // a public channel has no blocks (ometa: dropped above)
    if (p.kind === 'directory') this._pushCascade(p.id, prev, merged);
    this._emit(p, merged, 'set', actor);
    return { id: p.id, d: merged };
  }

  delete(path, { ot } = {}, actor) {
    const p = parseDocPath(path);
    if (p.kind !== 'channels' || this.q.chatGet.get(p.id)) this._readOk(actor, p);   // a chat that is gone (its small row goes with it): ok, as before 110
    const now = this.now();
    const prev = this._read(p, now);
    if (!prev) return false;
    this._check(actor, 'delete', p, { prev });
    if (SEALED_KINDS.has(p.kind) && !canDeletePost(prev, ot, now) && !(actor && actor !== SYSTEM && isAdminOf(actor, p.cid))) {
      fail('denied', 'not allowed to delete this message');
    }
    if (p.kind === 'channels') {
      this._tx(() => {
        this._remove(p);
        this.q.delUnder.run('channels/' + p.id, 'channels/' + p.id.replace(/[%_\\]/g, '\\$&') + '/%');
        this.q.chatDel.run(p.id);
        this.q.banDelChat.run(p.id);
        this.q.wrapsDelChat.run(p.id);
        this.q.chunkDelChat.run(p.id);
        this.q.midDelChat.run(p.id);
      });
      this._emit(p, null, 'del', actor);
      this.emit('evict', { cid: p.id, keep: null });
      return true;
    }
    if (p.kind === 'posts') {
      const gone = this._tx(() => { this._remove(p); return this._postSides(p.cid, p.id); });
      this._emit(p, null, 'del', actor);
      this._gone(gone);
      return true;
    }
    if (p.kind === 'accounts') this.q.goneAdd.run(keyedId(this.addrKey, 'gone', p.id), now);   // see boxWasHere
    this._remove(p);
    this._emit(p, null, 'del', actor);
    return true;
  }

  add(collectionPath, d, actor) {
    const col = parseCollectionPath(collectionPath);
    if (!ADD_KINDS.has(col.kind)) fail('invalid', 'this collection does not accept generated ids');
    for (let tries = 0; tries < 5; tries++) {
      const id = genId();
      const p = { ...col, id, keyed: false, backend: KINDS[col.kind].backend };
      if (this._read(p, this.now())) continue;
      this.set(col.parent + '/' + id, d, actor);
      return { id };
    }
    fail('internal', 'could not allocate an id');
  }

  query(collectionPath, q, actor) {
    const col = parseCollectionPath(collectionPath);
    if (!QUERYABLE.has(col.kind)) fail('denied', 'this collection cannot be queried');
    const { w, o, l } = validateQuery(q || {}, col.kind, this.limits);
    const mode = this._check(actor, 'query', col, { w });
    if (mode === 'blind') return [];   // as if there were none (authz.js)
    if (col.kind === 'channels' && (o || JSON.stringify(w) !== '[["visibility","==","public"]]')) {   // the page's listing only (_listing)
      fail('denied', 'only public channels can be listed, by id, with no other condition');
    }
    const now = this.now(), ok = capped(this), rows = [];
    if (col.kind === 'channels') return this._listing(l, ok);
    const backend = KINDS[col.kind].backend;
    if (backend === 'memory') return orderAndLimit(this.mem.list(col.parent, now).filter((r) => matches(r.d, w)), o, l).map((r) => { ok(byteLength(r.d)); return r; });
    if (backend === 'media') {   // every piece is counted, in base64, as it is read, before l picks from them (the page reads pieces over HTTP)
      for (const r of this.q.chunkList.iterate(col.cid, col.mid)) { ok(r.d.length * 4 / 3); rows.push({ id: String(r.i), d: { i: Number(r.i), iv: r.iv, d: Buffer.from(r.d).toString('base64') } }); }
      return orderAndLimit(rows.filter((r) => matches(r.d, w)), o, l);
    }
    const params = [];
    let sql = 'SELECT id, d FROM docs WHERE ';
    if (TOP_LITERAL.test(col.parent)) sql += `parent = '${col.parent}'`;
    else { sql += 'parent = ?'; params.push(col.parent); }
    if (mode === 'slotted') sql += " AND json_extract(d, '$.an') = 1";   // in SQL, so no other row uses up the limit or answers a filter
    for (const [f, op, v] of w) {
      if (f === 'ts') { sql += ` AND ts ${SQL_OP[op]} ?`; params.push(v); }
      else { sql += ` AND json_extract(d, ?) ${SQL_OP[op]} ?`; params.push('$.' + f, v); }
    }
    sql += o ? ` ORDER BY ts ${o[1] === 'desc' ? 'DESC' : 'ASC'}, id ASC` : ' ORDER BY id ASC';   // o is by ts alone (query.js)
    sql += ' LIMIT ?';
    params.push(l);
    for (const r of this.db.prepare(sql).iterate(...params)) {
      ok(Buffer.byteLength(r.d));
      rows.push({ id: r.id, d: JSON.parse(r.d) });
    }
    return rows;
  }

  // The public listing. Which channels it shows is not their creators' to choose (release 112; it was the first l by id, and a
  // creator picks the id, so 100 channels at the lowest ids hid every other): each request is answered l of all the public channels,
  // picked at random. Their ids are kept in memory (open, _emit), since to walk ids in the table SQLite reads every large record on
  // the way. It answers the records that fit, so records made large don't have it refused to everyone (release 110), in id order,
  // and only a record that is public as it is read. It carries no sealed lists, not even those a channel going private keeps
  // under its new key until it is private (set, update): it is anyone's to read.
  _listing(l, ok) {
    const n = Math.min(l, this.pubs.length), rows = [];
    for (let k = 0; k < n; k++) this._pubSwap(k, k + randomInt(this.pubs.length - k));   // the first n are now a random n of them all
    for (const id of this.pubs.slice(0, n)) {
      const r = this.q.get.get('channels/' + id), size = r ? Buffer.byteLength(r.d) : 0;
      try { ok(size); } catch { break; }
      const d = r ? JSON.parse(r.d) : null;
      if (d && d.visibility === 'public') rows.push({ id, d: forLevel('member', d) });
      else this._pub(id, false);   // changed behind the store's back: off the list
    }
    return rows.sort((a, b) => (a.id < b.id ? -1 : 1));
  }
  // The list of public channels, kept in step with one chat record: on it or off it.
  _pub(id, isPublic) {
    const at = this.pubAt.get(id);
    if (isPublic === (at !== undefined)) return;
    if (isPublic) { this.pubAt.set(id, this.pubs.length); this.pubs.push(id); return; }
    this._pubSwap(at, this.pubs.length - 1);
    this.pubs.pop();
    this.pubAt.delete(id);
  }
  _pubSwap(i, j) {
    const a = this.pubs[i], b = this.pubs[j];
    this.pubs[i] = b; this.pubs[j] = a;
    this.pubAt.set(b, i); this.pubAt.set(a, j);
  }

  // Validates a `sub` frame and computes its first result. Returns { spec, init }. A view read as none (authz.js 'blind') starts
  // empty and is kept under a parent no change is ever sent to, so it never fires, and an eviction still ends it (protocol.js).
  prepareSub({ p, ids, w, o, l }, actor) {
    const col = parseCollectionPath(p), at = (mode) => (mode === 'blind' ? col.parent + '#blind' : col.parent);
    if (ids !== undefined) {
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > this.limits.docsPerSub) fail('invalid', 'sub: bad "ids"');
      if (col.keyed) fail('denied', 'this collection cannot be watched');
      const pat = KINDS[col.kind].id;
      for (const id of ids) if (typeof id !== 'string' || !pat.test(id)) fail('invalid', 'sub: bad id');
      const init = [], ok = capped(this);
      let mode;   // blind or not: one collection, so the same for every id
      for (const id of ids) {
        const pd = parseDocPath(col.parent + '/' + id);
        mode = this._check(actor, 'watch', pd);
        const { d, most } = this._shown(pd, mode);
        ok(most || (d === null ? 0 : answered(d)));   // one shown in part counts as the most it can be (_shown)
        if (d !== null) init.push({ id, d });
      }
      return { spec: { kind: col.kind, parent: at(mode), ids }, init };
    }
    const mode = this._check(actor, 'sub', col, { w });   // as the query's own check, except that a listing is refused (the channels collection)
    const init = this.query(p, { w, o, l }, actor);
    return { spec: { kind: col.kind, parent: at(mode), w: w || [], o, l }, init };
  }

  // A change as one watcher's connection may see it, by the level that connection holds as the change goes out, not as it subscribed:
  // a key opened since, higher or lower, counts (authz.js 'member'). The registry asks for every watcher (server.js). One whose check
  // fails gets no lists either; never an error, which would fail the write that made the change.
  seenBy(evt, actor) {
    if (evt.kind !== 'channels' || !evt.d || evt.d.meta === undefined) return evt.d;
    let mode;
    try { mode = this._check(actor, 'watch', parseDocPath('channels/' + evt.id)); } catch { mode = 'member'; }
    return forLevel(mode, evt.d);
  }

  // ---- chats and room keys (SPEC.md 5) ----------------------------------------------

  // Returns { level, epoch, type, h } for the creator's connection; `h` is the hash of the member key it opened with.
  createChat({ cid, d, caps }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    const p = parseDocPath('channels/' + String(cid));
    validateDoc(d);
    this._checkSize('channels', d);
    if (!isPlain(caps) || !ID.CAP.test(caps.m || '')) fail('invalid', 'chat.create: a member key is required');
    const dm = d.type === 'dm';
    if (dm) { if (caps.a !== undefined || caps.o !== undefined) fail('invalid', 'chat.create: a DM has only a member key'); }
    else if (!ID.CAP.test(caps.a || '') || !ID.CAP.test(caps.o || '')) fail('invalid', 'chat.create: groups and channels need admin and owner keys');
    const now = this.now();
    if (d.visibility === 'public') { d = { ...d }; delete d.n; }   // as set: no count on a public channel
    validateForKind('channels', { ...p, now, op: 'set', prev: null }, d);
    if (!metaEpochOk(d) || !ometaEpochOk(d)) fail('invalid', 'chat.create: sealed meta must be sealed under the chat\'s epoch');
    const existing = this._read(p, now);
    if (existing) {
      const row = this.q.chatGet.get(p.id), h = sha256hex(caps.m);
      if (dm && existing.type === 'dm' && row && (hashEq(row.cap_m, h) || hashEq(row.cap_b, h))) {
        if (!row.cap_b && Number(row.epoch) === 0) this.q.chatBase.run(sha256hex(caps.m), p.id);   // a DM from before base keys were kept
        return { level: 'member', epoch: Number(row.epoch), type: 'dm', existed: true, h };
      }
      fail('exists', 'a chat with this id already exists');
    }
    const epoch = d.epoch === undefined ? 0 : d.epoch;
    if (d.type !== 'channel' && epoch > 31) fail('invalid', 'chat.create: a group or one-on-one chat has epochs 0 to 31');   // only a channel's go on (release 91)
    // A DM keeps the hash of its epoch-0 member key for good as a base key (SPEC.md 5.1): both people can always
    // derive it from their account keys, so a device that lost the chat keys can still open the DM and heal it.
    this._tx(() => {
      this._write(p, d, now);
      this.q.chatPut.run(p.id, d.type, epoch, sha256hex(caps.m), dm ? null : sha256hex(caps.a), dm ? null : sha256hex(caps.o), dm && epoch === 0 ? sha256hex(caps.m) : null);
    });
    this._emit(p, d, 'set', actor);
    return { level: dm ? 'member' : 'owner', epoch, type: d.type, h: sha256hex(caps.m) };
  }

  // Records a DM's base key (SPEC.md 5.1) for a DM created before base keys were kept. Only a connection that
  // already holds member level for the DM may do it, and only while none is recorded, so it can never replace one.
  setBase({ cid, cap }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || !ID.CAP.test(cap || '')) fail('invalid', 'chat.base: bad id or key');
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    if (row.type !== 'dm') fail('denied', 'only a one-on-one chat has a base key');
    if (rankOf(actor, cid) < 1) fail('denied', 'open this chat with its key first');
    const h = sha256hex(cap);
    if (row.cap_b) { if (!hashEq(row.cap_b, h)) fail('conflict', 'this chat already has a different base key'); return { recorded: false }; }
    this.q.chatBase.run(h, cid);
    return { recorded: true };
  }

  // After an account key change a DM's base key (SPEC.md 5.1) is replaced by the one the new keys give, so a device
  // still holding the old account keys can't open the DM with it. Only a connection that opened the DM with its
  // current member key may do it, and only once the DM has a key of its own (epoch 1 or later).
  rebaseChat({ cid, cap }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || !ID.CAP.test(cap || '')) fail('invalid', 'chat.rebase: bad id or key');
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    if (row.type !== 'dm') fail('denied', 'only a one-on-one chat has a base key');
    const e = actor.chats.get(cid);
    if (!e || rankOf(actor, cid) < 1 || Number(row.epoch) < 1 || !e.h || !hashEq(e.h, row.cap_m)) fail('denied', 'open this chat with its current key first');
    this.q.chatRebase.run(sha256hex(cap), cid);
    this.emit('evict', { cid, keep: actor.conn || null });
    return {};
  }

  // Which level does this key grant? Returns { level, epoch, type, h } (`h`: the hash of the key) or throws.
  openChat({ cid, cap }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid))) fail('invalid', 'chat.open: bad chat id');
    if (!ID.CAP.test(cap || '')) fail('invalid', 'chat.open: bad key');
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    const h = sha256hex(cap);
    const level = hashEq(h, row.cap_o) ? 'owner' : hashEq(h, row.cap_a) ? 'admin' : hashEq(h, row.cap_m) || hashEq(h, row.cap_b) ? 'member' : null;
    if (!level) fail('denied', 'that key does not open this chat');
    return { level, epoch: Number(row.epoch), type: row.type, h };
  }

  // One invite's sealed key history, for a link holder about to join (SPEC.md 5.5). A banned person gets none.
  inviteOf({ cid, iid }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || !ID.ITEM_ID.test(String(iid))) fail('invalid', 'chat.invite: bad id');
    if (!this._read(parseDocPath('directory/' + actor.handle), this.now())) fail('unauth', 'create your account first');
    if (this.isBanned(cid, actor.handle)) fail('banned', 'you were removed from this chat');
    const { doc } = this._chatDoc(cid);
    const inv = doc && isPlain(doc.invites) ? doc.invites[iid] : null;
    if (!inv) fail('notfound', 'no such invite');
    return { iv: inv.iv, ct: inv.ct };
  }

  // Outside chat.rotate an account below admin level adds at most wrapsPerAcctEpoch wraps per epoch to a channel (release 91), so
  // nobody fills `keys` until joins answer toolarge. Today's page wraps a join to each of the account's devices and then each device
  // wraps for every other one (syncWraps): n² for n devices, so the square of the devices its profile lists counts if more, up to
  // wrapsMaxPerAcctEpoch (anyone may list devices). Admins wrap for others and are not counted. Returns what to count once the write
  // is made, or null.
  _wrapTag(cid, h) { return keyedId(this.addrKey, 'wrap', cid + '|' + h); }
  _wrapsAdded(cid, before, after, actor) {
    if (!actor || actor === SYSTEM || !actor.handle || rankOf(actor, cid) >= 2) return null;
    const row = this.q.chatGet.get(cid);
    if (!row || row.type !== 'channel') return null;
    const now = this.now(), dir = this._read(parseDocPath('directory/' + actor.handle), now), tag = this._wrapTag(cid, actor.handle);
    if (!dir) fail('unauth', 'create your account first');   // a sign-up proof is free: each unused name would bring 8 more
    const devs = isPlain(dir.devs) ? Object.keys(dir.devs).length : 0, inc = [];
    const lim = Math.max(this.limits.wrapsPerAcctEpoch, Math.min(devs * devs, this.limits.wrapsMaxPerAcctEpoch));
    for (const [e, m] of Object.entries(after || {})) {
      const old = before && isPlain(before[e]) ? before[e] : {}, n = Object.keys(m).filter((l) => !Object.hasOwn(old, l)).length;
      if (!n) continue;
      // A count runs wrapsWindowMs from its first wrap, then starts again: a page that wraps afresh after phone changes isn't shut out for good.
      const had = this.q.wrapGet.get(cid, tag, Number(e)), live = had && now - Number(had.ts) < this.limits.wrapsWindowMs, sum = (live ? Number(had.n) : 0) + n;
      if (sum > lim) fail('toolarge', 'you have added as many key copies to this channel as you may');
      inc.push([Number(e), sum, live ? Number(had.ts) : now]);
    }
    return inc.length ? { tag, inc } : null;
  }
  _wrapsAdd(cid, w) { if (w) for (const [e, n, ts] of w.inc) this.q.wrapPut.run(cid, w.tag, e, n, ts); }

  // Joining by link: prove the link, add your own wraps (SPEC.md 5.6).
  joinChat({ cid, iid, proof, wraps }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || !ID.ITEM_ID.test(String(iid))) fail('invalid', 'chat.join: bad id');
    if (typeof proof !== 'string' || proof.length < 20 || proof.length > 128) fail('invalid', 'chat.join: bad proof');
    if (!this._read(parseDocPath('directory/' + actor.handle), this.now())) fail('unauth', 'create your account first');   // see inviteOf
    const { p, doc } = this._chatDoc(cid);
    if (!doc) fail('notfound', 'no such chat');
    const inv = isPlain(doc.invites) ? doc.invites[iid] : null;
    if (!inv || typeof inv.ph !== 'string' || !hashEq(sha256hex(proof), inv.ph.toLowerCase())) fail('denied', 'this invite link is not valid');
    if (this.isBanned(cid, actor.handle)) fail('banned', 'you were removed from this chat');   // after the proof, so only a valid link hears it; not `denied`, so not a wrong link
    if (!isPlain(wraps) || !Object.keys(wraps).length) fail('invalid', 'chat.join: wraps are required');
    const keys = { ...(doc.keys || {}) };
    for (const [e, m] of Object.entries(wraps)) {
      if (!Object.hasOwn(keys, e)) fail('invalid', 'chat.join: unknown epoch');   // own property: a "__proto__" epoch is truthy and would write nothing
      labelMap(m, 'chat.join');
      for (const label of Object.keys(m)) if (keys[e][label]) fail('conflict', 'chat.join: label already used');
      keys[e] = { ...keys[e], ...m };
    }
    const next = { ...doc, keys };
    this._checkSize('channels', next);
    if (!keysRoomOk(next)) fail('toolarge', 'this chat has no room for more keys');
    validateDoc(next);   // the record an `update` would have to pass: nothing joins that a later write could not carry
    validateForKind('channels', { ...p, now: this.now(), op: 'update', prev: doc }, next);
    const w = this._wrapsAdded(cid, doc.keys, keys, actor);
    this._tx(() => { this._write(p, next, this.now()); this._wrapsAdd(cid, w); });
    this._emit(p, next, 'set', actor);
    return { epoch: doc.epoch === undefined ? 0 : doc.epoch };
  }

  // A new epoch: new wraps, new member key, optionally new sealed meta (kick, leave, heal, go private). A channel's also brings
  // its key-chain row (`back`), may carry links over (`invites`) and may drop the older wrap tables (`prune`), SPEC.md 5.6.
  rotateChat({ cid, epoch, keys, cap, meta, openKeys, why, back, invites, prune }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid))) fail('invalid', 'chat.rotate: bad chat id');
    const { p, doc, row } = this._chatDoc(cid), now = this.now();
    if (!doc || !row) fail('notfound', 'no such chat');
    const need = doc.type === 'dm' ? 1 : 2, chan = doc.type === 'channel';
    if (rankOf(actor, cid) < need) fail('denied', doc.type === 'dm' ? 'open this chat with its key first' : 'this needs admin access to the chat');
    // A blocked admin still holds the admin key until the owner replaces it; it makes them no new key (as chat.ban).
    if (doc.type !== 'dm' && levelOf(actor, cid) !== 'owner' && this.isBanned(cid, actor.handle)) fail('denied', 'you were removed from this chat');
    // Publishing a key, or re-keying a public channel (its new posts would no longer be public), is the owner's call.
    if ((openKeys !== undefined || doc.visibility === 'public') && doc.type !== 'dm' && levelOf(actor, cid) !== 'owner') fail('denied', 'publishing a key, or a new key for a public channel, needs owner access to the chat');
    const cur = doc.epoch === undefined ? 0 : doc.epoch;
    if (epoch !== cur + 1 || (!chan && epoch > 31)) fail('conflict', `chat.rotate: the next epoch is ${cur + 1}`);
    if (why !== undefined && (why !== 'leave' || doc.type === 'dm')) fail('invalid', 'chat.rotate: "why" may only be "leave", in a group or channel');
    // Any member can make admin pages rotate (leave, get back in, leave again), so a group's leaves get only part of its 32 epochs.
    if (why === 'leave' && !chan && epoch > this.limits.leaveRotateMaxEpoch) fail('conflict', 'chat.rotate: the key changes kept for people leaving are used up; the rest are for removing someone');
    // A channel has no epochs to save, so a rotation any member can cause (a leave, a lost device's card) comes at most once
    // every 15 minutes and 8 times a day by this server's clock (SPEC.md 5.6). Not `conflict`: the page then waits and tries again.
    const day = why === 'leave' && chan ? JSON.parse(row.lv || '[]').filter((t) => now - t < 86400_000) : null;
    if (day && (day.length >= this.limits.leaveRotatesPerDay || day.some((t) => now - t < this.limits.leaveRotateGapMs))) fail('ratelimit', 'chat.rotate: a channel changes its key for people leaving at most once every 15 minutes and 8 times a day; try again later');
    if (!ID.CAP.test(cap || '')) fail('invalid', 'chat.rotate: bad member key');
    labelMap(keys || {}, 'chat.rotate');
    if (meta !== undefined) { sealedMeta(meta, 'chat.rotate'); if (meta.e !== epoch) fail('invalid', 'chat.rotate: sealed meta must be sealed under the new epoch'); }
    if (openKeys !== undefined) {
      if (!isPlain(openKeys)) fail('invalid', 'chat.rotate: bad openKeys');
      for (const [e, v] of Object.entries(openKeys)) if (Number(e) !== epoch || typeof v !== 'string') fail('invalid', 'chat.rotate: openKeys must be for the new epoch');
    }
    if (!chan && (back !== undefined || invites !== undefined || prune !== undefined)) fail('invalid', 'chat.rotate: "back", "invites" and "prune" are for channels');
    const cp = chan ? parseDocPath(`channels/${cid}/chain/${epoch}`) : null;
    // Once a channel keeps a key chain every new key brings its row, so a page from before it can't leave a gap. `conflict`, as at
    // a group's epoch 31: that page then removes someone from the lists and keeps the block, and never lifts it (SPEC.md 5.6).
    if (chan && back === undefined && this.noteCount(cp.parent)) fail('conflict', 'chat.rotate: this channel keeps a key chain, so a new key needs its row ("back"); reload Hush');
    if (back !== undefined) { validateDoc(back); this._checkSize('chain', back); validateForKind('chain', { ...cp, now, op: 'set', level: levelOf(actor, cid) }, back); }
    // Older wrap tables go only once the chain reaches every key they hold, epoch 0's commit included. shortcut: rows are counted, not
    // their `b`, so this would also prune below an owner's repair row (no `b`), which the chain doesn't cross; no page prunes yet.
    if (prune !== undefined && (prune !== true || back === undefined || this.noteCount(cp.parent) !== cur + 1)) fail('invalid', 'chat.rotate: "prune" needs the new row and a key-chain row for every epoch before it');
    if (invites !== undefined) {
      if (!isPlain(invites)) fail('invalid', 'chat.rotate: bad invites');
      const had = isPlain(doc.invites) ? doc.invites : {};
      // Carried over, never made here: each is a link the channel has, under its id with its proof; the page re-sealed iv, ct and as.
      for (const [iid, inv] of Object.entries(invites)) if (!Object.hasOwn(had, iid) || !isPlain(inv) || typeof inv.ph !== 'string' || typeof had[iid].ph !== 'string' || inv.ph.toLowerCase() !== had[iid].ph.toLowerCase()) fail('invalid', 'chat.rotate: "invites" carries over links the channel has, each with its own proof');
    }
    const next = { ...doc, epoch, keys: { ...(prune ? {} : doc.keys || {}), [epoch]: keys || {} }, invites: invites || {} };
    if (meta !== undefined) next.meta = meta;
    if (openKeys !== undefined) next.openKeys = { ...(doc.openKeys || {}), ...openKeys };
    this._checkSize('channels', next);
    validateDoc(next);
    validateForKind('channels', { ...p, now, op: 'update', prev: doc }, next);
    this._tx(() => {
      this._write(p, next, now);
      this.q.chatRotate.run(epoch, sha256hex(cap), cid);
      if (day) this.q.chatLeaves.run(JSON.stringify([...day, now]), cid);
      if (back !== undefined) this._write(cp, back, now);
      if (prune) this.q.wrapsBelow.run(cid, epoch);
    });
    this._emit(p, next, 'set', actor);
    if (back !== undefined) this._emit(cp, back, 'set', actor);
    this.emit('evict', { cid, keep: actor.conn || null });
    return { epoch, h: sha256hex(cap) };
  }

  // The owner replaces the admin secret: new wraps for the admins, new admin key.
  setAdmins({ cid, akeys, cap }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid))) fail('invalid', 'chat.admins: bad chat id');
    const { p, doc, row } = this._chatDoc(cid);
    if (!doc || !row) fail('notfound', 'no such chat');
    if (doc.type === 'dm') fail('denied', 'a DM has no admins');
    if (levelOf(actor, cid) !== 'owner') fail('denied', 'only the owner changes the admins');
    if (!ID.CAP.test(cap || '')) fail('invalid', 'chat.admins: bad admin key');
    labelMap(akeys || {}, 'chat.admins');
    const next = { ...doc, akeys: akeys || {} };
    validateDoc(next);
    this._checkSize('channels', next);
    this._tx(() => {
      this._write(p, next, this.now());
      this.q.chatAdmins.run(sha256hex(cap), cid);
    });
    this._emit(p, next, 'set', actor);
    this.emit('evict', { cid, keep: actor.conn || null });
    return {};
  }

  // The owner replaces the owner key. It comes from the owner's account secret, which a device removal replaces
  // (release 21), so the old one must stop opening the chat.
  setOwner({ cid, cap }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || !ID.CAP.test(cap || '')) fail('invalid', 'chat.owner: bad id or key');
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    if (row.type === 'dm') fail('denied', 'a DM has no owner');
    if (levelOf(actor, cid) !== 'owner') fail('denied', 'only the owner changes the owner key');
    this.q.chatOwner.run(sha256hex(cap), cid);
    this.emit('evict', { cid, keep: actor.conn || null });
    return {};
  }

  // Blocked usernames (SPEC.md 5.6) are kept as tags keyed like the blind addresses (8.3): no names in a copy of the database.
  _banTag(cid, h) { return keyedId(this.addrKey, 'ban', cid + '|' + h); }
  isBanned(cid, h) { return typeof h === 'string' && !!this.q.banGet.get(cid, this._banTag(cid, h)); }

  // An admin blocks a username from a group or channel, or lets it back in. A blocked username's member key no longer
  // opens the chat (chat.open), and that person's connections lose their level at once.
  setBan({ cid, h, on }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || typeof h !== 'string' || !ID.HANDLE.test(h) || typeof on !== 'boolean') fail('invalid', 'chat.ban: bad chat id, username or on');
    const { doc, row } = this._chatDoc(cid);
    if (!row) fail('notfound', 'no such chat');
    if (row.type === 'dm') fail('denied', 'a DM has no bans');
    if (rankOf(actor, cid) < 2) fail('denied', 'this needs admin access to the chat');
    const owner = levelOf(actor, cid) === 'owner';
    // A blocked admin still holds the admin key until the owner replaces it; it does not lift their own block.
    if (!owner && this.isBanned(cid, actor.handle)) fail('denied', 'you were removed from this chat');
    const tag = this._banTag(cid, h);
    if (!on) { this.q.banDel.run(cid, tag); return {}; }
    if (doc && doc.visibility === 'public') fail('denied', 'a public channel has no blocks: anyone may read it');
    if (this.q.banGet.get(cid, tag)) return {};
    // The tags can't be listed, so junk an admin added can't be found: the owner may block as many again.
    if (Number(this.q.banCount.get(cid).n) >= this.limits.bansPerChat * (owner ? 2 : 1)) fail('toolarge', 'this chat has blocked as many people as it can');
    // Their member card goes too (release 91): a join card written just before the block must not let them back in later.
    const rp = parseDocPath(`channels/${cid}/roll/${this._rollTag(cid, h)}`);
    if (this._tx(() => { this.q.banPut.run(cid, tag); return this._remove(rp); })) this._emit(rp, null, 'del', actor);
    this.emit('evict', { cid, keep: actor.conn || null, h });
    return {};
  }

  // The key chain (SPEC.md 5.6, release 91): an admin backfills the row of an epoch the channel had before the chain, or replaces a
  // bad one. Admins can delete posts already, so this is no new power; pages check every row's signed commit.
  chain({ cid, e, b, c }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid))) fail('invalid', 'chat.chain: bad chat id');
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    if (rankOf(actor, cid) < 2) fail('denied', 'this needs admin access to the chat');
    if (row.type !== 'channel') fail('denied', 'only a channel keeps a key chain');
    if (levelOf(actor, cid) !== 'owner' && this.isBanned(cid, actor.handle)) fail('denied', 'you were removed from this chat');
    if (!Number.isInteger(e) || e < 0 || e > Number(row.epoch)) fail('invalid', 'chat.chain: "e" must be an epoch the channel has reached');
    const p = parseDocPath(`channels/${cid}/chain/${e}`), now = this.now(), d = b === undefined ? { c } : { b, c };
    validateDoc(d); this._checkSize('chain', d); validateForKind('chain', { ...p, now, op: 'set', level: levelOf(actor, cid) }, d);
    // A chain starts at its head (release 93): a first row below it, a backfill that lost a race with a key change made with no row,
    // would leave the head missing, which every page refuses. chat.rotate writes every head after it.
    if (e !== Number(row.epoch) && !this.noteCount(p.parent)) fail('conflict', 'chat.chain: a key chain starts with the current epoch\'s row');
    this._write(p, d, now);
    this._emit(p, d, 'set', actor);
    return {};
  }

  // Member cards (SPEC.md 5.6, release 91): one per account per channel, at a tag keyed like the blocks, so a newer card replaces the
  // older one and a copy of the database names nobody. The time is the server's: the sweep takes a card 30 days on.
  _rollTag(cid, h) { return keyedId(this.addrKey, 'roll', cid + '|' + h); }
  _putCard(cid, h, body, epoch, actor) {
    const p = parseDocPath(`channels/${cid}/roll/${this._rollTag(cid, h)}`), now = this.now(), d = { ...body, ts: now };
    validateDoc(d); this._checkSize('roll', d); validateForKind('roll', { ...p, now, op: 'set' }, d);
    let out = null;
    if (!this._read(p, now) && this.noteCount(p.parent) >= this.limits.cardsPerChat) {
      const r = this.q.rollStale.get(p.parent, epoch - 1);   // a flood of join requests or old cards can't keep a member's card out
      if (!r) fail('toolarge', 'this channel holds as many cards as it can until an admin\'s page clears some');
      out = r.id;
    }
    this._tx(() => { if (out) this.q.del.run(p.parent + '/' + out); this._write(p, d, now); });
    if (out) this._gone([{ kind: 'roll', parent: p.parent, id: out }]);
    this._emit(p, d, 'set', actor);
    return {};
  }
  card({ cid, e, iv, ct }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid))) fail('invalid', 'chat.card: bad chat id');
    if (!this._read(parseDocPath('directory/' + actor.handle), this.now())) fail('unauth', 'create your account first');   // a sign-up proof is free: every unused name would be a card
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    if (rankOf(actor, cid) < 1) fail('denied', 'open this chat with its key first');
    const vis = this.q.chatVis.get('channels/' + cid);
    if (row.type !== 'channel' || (vis && vis.v === 'public')) fail('denied', 'only a private channel keeps member cards');
    if (levelOf(actor, cid) !== 'owner' && this.isBanned(cid, actor.handle)) fail('denied', 'you were removed from this chat');   // a blocked admin, still holding the admin key
    if (!Number.isInteger(e) || e < 0 || e > Number(row.epoch)) fail('invalid', 'chat.card: "e" must be an epoch the channel has reached');
    return this._putCard(cid, actor.handle, { e, iv, ct }, Number(row.epoch), actor);
  }
  // Which tag each author's card sits under (release 93): an owner's or admin's page counts a card only in its own author's slot, so a card
  // written again from another account's slot counts for nothing. Nothing moves: every card already sits under its writer's tag. Admin level
  // on a private channel, not an admin who is blocked, and the current member key: any other key is `conflict`, so a page that raced a key
  // change reads again, and a stale admin secret alone (a lost admin device, cut off by the removal's key change) learns no username's tag.
  slots({ cid, cap, hs }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (typeof cid !== 'string' || !ID.CID.test(cid) || typeof cap !== 'string' || !ID.CAP.test(cap)) fail('invalid', 'chat.slots: bad chat id or member key');
    if (!Array.isArray(hs) || hs.length > this.limits.cardsPerChat || !hs.every((h) => typeof h === 'string' && ID.HANDLE.test(h))) fail('invalid', `chat.slots: "hs" must be a list of at most ${this.limits.cardsPerChat} usernames`);
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    if (rankOf(actor, cid) < 2) fail('denied', 'this needs admin access to the chat');
    const vis = this.q.chatVis.get('channels/' + cid);
    if (row.type !== 'channel' || (vis && vis.v === 'public')) fail('denied', 'only a private channel keeps member cards');
    if (levelOf(actor, cid) !== 'owner' && this.isBanned(cid, actor.handle)) fail('denied', 'you were removed from this chat');
    if (!hashEq(sha256hex(cap), row.cap_m)) fail('conflict', 'chat.slots: not the current member key; read the channel again');
    return { tags: hs.map((h) => this._rollTag(cid, h)) };
  }
  // A reaction or vote in a channel (SPEC.md 5.4): one per account, post and kind, at a slot keyed like the cards, so a newer one replaces
  // the older and nothing stored or sent ties a row to anyone, at any level. Keyed by post too, so one account's slots look unrelated.
  _actSlot(cid, post, kind, h) { return keyedId(this.addrKey, 'act', cid + '|' + post + '|' + kind + '|' + h).slice(0, 22); }
  _actOk(cid, actor, op) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (typeof cid !== 'string' || !ID.CID.test(cid)) fail('invalid', op + ': bad chat id');
    if (!this._read(parseDocPath('directory/' + actor.handle), this.now())) fail('unauth', 'create your account first');   // a sign-up proof is free: every unused name would be a row, and a slot learned for a name nobody has yet would name whoever takes it
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    if (rankOf(actor, cid) < 1) fail('denied', 'open this chat with its key first');
    if (row.type !== 'channel') fail('denied', 'reactions and votes are written with chat.act in channels only');
    if (levelOf(actor, cid) !== 'owner' && this.isBanned(cid, actor.handle)) fail('denied', 'you were removed from this chat');   // a blocked admin, still holding the admin key
  }
  act({ cid, post, kind, e, iv, ct }, actor) {
    this._actOk(cid, actor, 'chat.act');
    const d = { post, kind, e, iv, ct, an: 1 };
    slottedAct(d);
    const p = parseDocPath(`channels/${cid}/acts/${post}~${this._actSlot(cid, post, kind, actor.handle)}~${kind}`);   // the id's shape checks the post's
    this._epochOk(p, d);
    if (!this.q.get.get(`channels/${cid}/posts/${post}`)) fail('notfound', 'no such message');   // so every row goes when its post goes
    this._write(p, d, this.now());
    this._emit(p, d, 'set', actor);
    return {};
  }
  // Which rows are this account's own on these posts: the ids its reaction and vote sit under, there or not, for the connection that asks
  // alone. Nothing stored is read and nothing on a row says whose it is, so every other connection gets the very same rows.
  mine({ cid, posts }, actor) {
    this._actOk(cid, actor, 'chat.mine');
    if (!Array.isArray(posts) || posts.length > this.limits.mgetMax || !posts.every((p) => typeof p === 'string' && ID.ITEM_ID.test(p))) fail('invalid', 'chat.mine: bad "posts"');
    return { ids: posts.flatMap((p) => ['r', 'v'].map((k) => `${p}~${this._actSlot(cid, p, k, actor.handle)}~${k}`)) };
  }
  // A join request by an approval link: the link's proof as chat.join takes it, then the block list (after the proof, as there).
  ask({ cid, iid, proof, iv, ct }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || !ID.ITEM_ID.test(String(iid))) fail('invalid', 'chat.ask: bad id');
    if (typeof proof !== 'string' || proof.length < 20 || proof.length > 128) fail('invalid', 'chat.ask: bad proof');
    if (!this._read(parseDocPath('directory/' + actor.handle), this.now())) fail('unauth', 'create your account first');   // see inviteOf
    const { doc, row } = this._chatDoc(cid);
    if (!doc || !row) fail('notfound', 'no such chat');
    if (row.type !== 'channel' || doc.visibility === 'public') fail('invalid', 'only a private channel takes join requests');   // not `denied`: that counts as a wrong link (the preview shows the type anyway)
    const inv = isPlain(doc.invites) && Object.hasOwn(doc.invites, iid) ? doc.invites[iid] : null;
    if (!inv || typeof inv.ph !== 'string' || !hashEq(sha256hex(proof), inv.ph.toLowerCase())) fail('denied', 'this invite link is not valid');
    if (this.isBanned(cid, actor.handle)) fail('banned', 'you were removed from this chat');
    return this._putCard(cid, actor.handle, { iid, iv, ct }, Number(row.epoch), actor);
  }

  // ---- reports (SPEC.md 8.7) ----------------------------------------------------------
  // Only a post in a public group or channel can be reported, judged from the server's own record (a crafted client can
  // make a DM or group "public"). What is kept is the server's own copy of the post and that epoch's published key,
  // never anything the reporter sent; the reporter is only a keyed tag (like bans), so the same report twice is one row.
  report({ cid, pid, reason }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (typeof cid !== 'string' || !ID.CID.test(cid) || typeof pid !== 'string' || !ID.ITEM_ID.test(pid) || !REPORT_REASONS.has(reason)) fail('invalid', 'report.send: bad chat id, message id or reason');
    const { doc, row } = this._chatDoc(cid), now = this.now();
    if (!doc || !row) fail('notfound', 'no such chat');
    if (row.type === 'dm' || doc.visibility !== 'public') fail('denied', 'only posts in public channels can be reported');
    const r = this.q.get.get(`channels/${cid}/posts/${pid}`), post = r ? JSON.parse(r.d) : null;
    if (!post || post.sv === 1 || post.del === true || (post.exp > 0 && post.exp < now)) fail('notfound', 'no such message');
    const key = isPlain(doc.openKeys) && typeof doc.openKeys[post.e] === 'string' ? doc.openKeys[post.e] : null;
    const tag = keyedId(this.addrKey, 'report', actor.handle + '|' + cid + '|' + pid);
    this.q.reportPut.run(genId(), now, now + REPORT_TTL_MS, cid, pid, reason, typeof doc.name === 'string' ? doc.name : null, r.d, key, tag);
    return {};
  }

  // Newest first, up to `limit` older than `before` (ms). Whoever may call this is decided in protocol.js; tags never leave.
  reports({ before, limit }, now = this.now()) {
    return this.q.reportList.all(before, now, limit).map((x) => ({ id: x.id, ts: x.ts, cid: x.cid, pid: x.pid, reason: x.reason, name: x.name, post: JSON.parse(x.post), key: x.key }));
  }
  // Reports older than 90 days. Returns how many went.
  sweepReports(now = this.now()) { return Number(this.q.reportSweep.run(now).changes); }

  // ---- deleting an account (SPEC.md 4.7) -------------------------------------------------
  // In one transaction: the vault the page names, the mailbox, the secured mark, the search entry, and every row whose
  // body or keyed tag names the account (phone entries, retired recovery records, link offers, blocks, member cards, wrap
  // counts, reports it sent);
  // then the profile becomes a tombstone that keeps only the public keys, so old messages still check out and the name
  // is never taken again. Who may ask is decided in protocol.js (the account key itself); the key must still be current.
  deleteAccount({ vault }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (vault !== undefined && !(typeof vault === 'string' && ID.VAULT.test(vault))) fail('invalid', 'account.delete: bad vault id');
    const h = actor.handle, now = this.now(), dp = parseDocPath('directory/' + h), dir = this._read(dp, now);
    if (!dir || dir.gone !== undefined) fail('denied', 'there is no account to delete');
    if (!actor.pub || !dir.sig || actor.pub.x !== dir.sig.x || actor.pub.y !== dir.sig.y) fail('denied', 'the account keys changed since this connection signed in; reconnect');
    const tomb = { handle: h, gone: now, ecdh: dir.ecdh, sig: dir.sig, kv: dir.kv === undefined ? 1 : dir.kv };
    if (Array.isArray(dir.prev)) tomb.prev = dir.prev;
    validateForKind('directory', { ...dp, now, op: 'set', prev: dir }, tomb);
    const sp = parseDocPath('search/' + h), hadSearch = !!this._read(sp, now), run = (sql, ...a) => this.db.prepare(sql).run(...a);
    this._tx(() => {
      if (vault !== undefined) this._remove(parseDocPath('vault/' + vault));
      run('DELETE FROM docs WHERE parent = ?', 'inbox/' + h + '/c');
      run('DELETE FROM docs WHERE path IN (?, ?)', 'secure/' + h, 'search/' + h);
      run("DELETE FROM docs WHERE parent = 'phones' AND json_extract(d, '$.handle') = ?", h);
      run("DELETE FROM docs WHERE parent IN ('recovery', 'linkreqs') AND json_extract(d, '$.h') = ?", h);
      for (const { cid } of this.db.prepare('SELECT DISTINCT cid FROM bans').all()) this.q.banDel.run(cid, this._banTag(cid, h));
      for (const { cid } of this.db.prepare("SELECT cid FROM chats WHERE type = 'channel'").all()) this.q.del.run(`channels/${cid}/roll/${this._rollTag(cid, h)}`);
      for (const { cid } of this.db.prepare('SELECT DISTINCT cid FROM wraps').all()) this.q.wrapsDelTag.run(cid, this._wrapTag(cid, h));
      for (const r of this.db.prepare('SELECT id, cid, pid, tag FROM reports').all()) {
        if (r.tag === keyedId(this.addrKey, 'report', h + '|' + r.cid + '|' + r.pid)) run('DELETE FROM reports WHERE id = ?', r.id);
      }
      this.q.pushDelAcct.run(h); this.q.apushDelAcct.run(h); this.q.wakeDelAcct.run(h);
      this._write(dp, tomb, now);
    });
    const pp = parseDocPath('presence/' + h);
    if (this._remove(pp)) this._emit(pp, null, 'del', actor);
    if (hadSearch) this._emit(sp, null, 'del', actor);
    this._emit(dp, tomb, 'set', actor);   // server.js leaves the 4401 path alone for a tombstone; protocol.js closes with 4410
    return {};
  }

  // ---- ringing, and a "New message" nudge, when the app is closed -------------------------------------------
  // One push address per iPhone device (`push` the VoIP token, `apush` the alert token, release 65), and random wake
  // tickets that point at it: kind c rings, kind m nudges. The server never learns which contact holds which ticket,
  // nor whose block list or chat a ticket came from; a device's rows die with its logout (push.clear), its removal from
  // `devs` and the account's deletion. A token belongs to one account, the one that registered it last, so a phone
  // that switches accounts takes its pushes along. The protocol layer validates the fields.

  // A device-proven connection may only touch the device it signed in as; the account key may touch any.
  _ownDevice(dev, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!actor.viaAccountKey && actor.dev !== dev) fail('denied', 'a device may only change its own push address');
    return actor.handle;
  }
  _devListed(h, dev) {
    const dir = this._read(parseDocPath('directory/' + h), this.now());
    return !!(dir && isPlain(dir.devs) && isPlain(dir.devs[dev]));
  }
  _pushDrop(h, dev) { this.q.pushDel.run(h, dev); this.q.apushDel.run(h, dev); this.q.wakeDelDev.run(h, dev); }
  // Devices that left the directory's `devs` map take their push address and tickets with them.
  _pushCascade(h, prev, d) {
    if (!prev || !isPlain(prev.devs)) return;
    const after = isPlain(d.devs) ? d.devs : {};
    for (const dev of Object.keys(prev.devs)) if (!(dev in after)) this._pushDrop(h, dev);
  }

  pushSet({ dev, tok, env, kind = 'voip' }, actor) {
    const h = this._ownDevice(dev, actor), alert = kind === 'alert';
    if (!this._devListed(h, dev)) fail('denied', 'this device is not listed on the account');
    (alert ? this.q.apushPut : this.q.pushPut).run(h, dev, tok, env, this.now());
    const moved = Number((alert ? this.q.apushSame : this.q.pushSame).run(tok, h, dev).changes);   // the same token under another account or device: that one moved here
    if (moved) log.info('push.moved', { n: moved });   // a count and nothing else: a phone switching accounts does this on every launch; anyone else doing it holds a token only the phone, Apple and this server know
    return {};
  }
  pushClear({ dev, kind = 'voip' }, actor) {   // a device already taken off the account may still clear what it left
    const h = this._ownDevice(dev, actor);
    if (kind === 'alert') this.q.apushDel.run(h, dev); else this._pushDrop(h, dev);
    return {};
  }
  wakeMint({ dev, n, k = 'c' }, actor) {
    const h = this._ownDevice(dev, actor);
    if (!Number.isInteger(n) || n < 1 || n > 20) fail('invalid', 'wake.mint: n must be 1 to 20');
    if (!this._devListed(h, dev)) fail('denied', 'this device is not listed on the account');
    if (Number(this.q.wakeCount.get(h, dev).n) + n > this.limits.ticketsPerDevice) fail('ratelimit', 'too many wake tickets for this device');
    const now = this.now(), tickets = [];
    this._tx(() => { for (let i = 0; i < n; i++) { const tk = randomBytes(16).toString('base64url'); this.q.wakePut.run(tk, h, dev, now, k); tickets.push(tk); } });
    return { tickets };
  }
  wakeRevoke({ tk }, actor) {   // {} whether or not the ticket existed: a guess learns nothing
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    this.q.wakeDel.run(tk, actor.handle);
    return {};
  }
  // The server's own reads and writes for POST /wake: no actor. A ticket whose device has no token of its kind is as
  // good as none.
  wakeLookup(tk) {
    const w = this.q.wakeGet.get(tk), p = w && (w.k === 'm' ? this.q.apushGet : this.q.pushGet).get(w.h, w.dev);
    return p ? { h: w.h, dev: w.dev, k: w.k, tok: p.tok, env: p.env } : null;
  }
  pushDrop({ h, dev, k }) { (k === 'm' ? this.q.apushDel : this.q.pushDel).run(h, dev); }   // Apple says the address is dead; the tickets stay and do nothing until the device registers again

  // ---- media over HTTP (SPEC.md 7.7) ---------------------------------------------------
  // A piece travels as raw bytes: a 12-byte iv, then the AES-GCM ciphertext. It is stored as before, iv apart.
  // `media_ids` keeps per media id only its stored size (for the chat's allowance), for a disappearing message when it
  // may be swept, and the hash of the uploader's media token (`oh`, set when the id is born and never rewritten; '' for
  // media from before release 80), so the uploader can remove their own file without the server learning who that is.
  // Nothing says what kind of file it is.

  _mtx(fn) {
    this.media.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.media.exec('COMMIT'); return r; }
    catch (e) { this.media.exec('ROLLBACK'); throw e; }
  }

  // Adds `delta` bytes to a media id's record. An expiry only ever moves later, and once any piece came without
  // one the media is kept: a piece is never swept before the message that shows it.
  _midAdd(cid, mid, delta, exp, oh = '') {
    const row = this.q.midGet.get(cid, mid);
    const bytes = Math.max(0, (row ? Number(row.bytes) : 0) + delta);
    if (row && delta < 0 && bytes === 0) { this.q.midDel.run(cid, mid); return; }
    let e = row ? Number(row.exp) : 0;
    if (exp !== undefined) e = !row ? exp : (e === 0 || exp === 0) ? 0 : Math.max(e, exp);
    this.q.midPut.run(cid, mid, bytes, e, oh);   // oh lands only with a new row (ON CONFLICT leaves it)
  }

  _piecePath(cid, mid, i) {
    if (!ID.CID.test(String(cid)) || !ID.MID.test(String(mid)) || !ID.CHUNK_I.test(String(i))) fail('invalid', 'media: bad address');
    return parseDocPath(`channels/${cid}/media/${mid}/chunks/${i}`);
  }

  // Bytes of media stored for one chat.
  mediaBytes(cid) {
    return Number(this.q.midChatBytes.get(cid).n);
  }
  // Bytes stored under one media id (0 for none): what a copy of it will add.
  mediaIdBytes(cid, mid) { const r = this.q.midGet.get(cid, mid); return r ? Number(r.bytes) : 0; }
  // All media on the server: stored bytes and media ids (the disk guard's cap, and the daily media.stats line).
  mediaStats() {
    const r = this.q.midTotal.get();
    return { bytes: Number(r.bytes), ids: Number(r.ids) };
  }

  // Stores one piece, once. The same bytes again (a retry) are fine; different bytes are refused, so nobody can
  // swap a piece of someone else's file. `exp` (ms, 0 = none) lets the sweep remove a disappearing message's media.
  // `oh` is the sha-256 of the uploader's media token (SPEC.md 7.7): kept with the id so its holder may delete the file,
  // and a later piece under the same id must carry the same hash. shortcut: '' (no X-Hush-Oh) is still accepted in
  // release 80 so a page from before it uploads; require it once that page release is out. Returns { created }.
  mediaPut({ cid, mid, i, body, exp = 0, oh = '' }, actor) {
    const p = this._piecePath(cid, mid, i);
    this._check(actor, 'put', p);
    const M = this.limits.media, n = Number(p.id);
    if (n >= maxPieces(M)) fail('invalid', 'media: piece index out of range');
    if (!Buffer.isBuffer(body) || body.length < 28) fail('invalid', 'media: a piece is a 12-byte iv and its ciphertext');
    if (body.length > M.pieceBytes + 28) fail('toolarge', 'media: piece too large');
    if (!Number.isSafeInteger(exp) || exp < 0) fail('invalid', 'media: bad expiry');
    const iv = body.subarray(0, 12).toString('base64'), d = Buffer.from(body.subarray(12));
    return this._mtx(() => {
      const row = this.q.midGet.get(p.cid, p.mid);
      if (row && row.oh && row.oh !== oh) fail('denied', 'media: that id is another upload\'s');   // no grafting onto someone else's file; an id without a hash is never claimed
      const cur = this.q.chunkGet.get(p.cid, p.mid, n);
      if (cur) {
        if (cur.iv === iv && Buffer.from(cur.d).equals(d)) return { created: false };
        fail('conflict', 'media: this piece is already stored');
      }
      if (this.mediaBytes(p.cid) + d.length > M.chatBytes) fail('full', 'this chat has used its media allowance');
      this.q.chunkInsert.run(p.cid, p.mid, n, iv, d);
      this._midAdd(p.cid, p.mid, d.length, exp, oh);
      return { created: true };
    });
  }

  // One piece as raw bytes (iv then ciphertext), or null.
  mediaGet({ cid, mid, i }, actor) {
    const p = this._piecePath(cid, mid, i);
    this._check(actor, 'get', p);
    const r = this.q.chunkGet.get(p.cid, p.mid, Number(p.id));
    return r ? Buffer.concat([Buffer.from(r.iv, 'base64'), Buffer.from(r.d)]) : null;
  }

  // Removes every piece of one media id: the holder of the media token (`ot`, whose hash was kept with the id), an
  // admin, or either side of a DM. Returns how many pieces went.
  mediaDelete({ cid, mid, ot }, actor) {
    const p = this._piecePath(cid, mid, 0);
    const row = this.q.midGet.get(p.cid, p.mid);
    const own = !!(row && row.oh) && tokenMatches({ oh: row.oh }, ot);   // constant time; an id without a hash is nobody's, never `own`
    this._check(actor, 'delete', p, { own });
    return this._mtx(() => {
      const n = Number(this.q.chunkDelMedia.run(p.cid, p.mid).changes);
      this.q.midDel.run(p.cid, p.mid);
      return n;
    });
  }

  // Copies media `fromMid` of chat `from` to media `mid` of chat `to`, for a forward: the sealed descriptor (and its
  // per-file key) is reused with the new id, so nothing is downloaded or uploaded again, and each copy can be
  // deleted or expire on its own. Needs read access to `from` and write access to `to`. The copy is the forwarder's: their
  // token hash `oh` goes with it, not the source's.
  mediaCopy({ from, fromMid, to, mid, exp = 0, oh = '' }, actorFrom, actorTo) {
    const src = this._piecePath(from, fromMid, 0), dst = this._piecePath(to, mid, 0);
    this._check(actorFrom, 'get', src);
    this._check(actorTo, 'put', dst);
    if (!Number.isSafeInteger(exp) || exp < 0) fail('invalid', 'media: bad expiry');
    if (from === to && fromMid === mid) fail('invalid', 'media: a copy needs a new id');
    return this._mtx(() => {
      const s = this.q.midGet.get(from, fromMid);
      if (!s || !Number(s.bytes)) fail('notfound', 'no such media');
      const t = this.q.midGet.get(to, mid);
      if (t) { if (Number(t.bytes) === Number(s.bytes)) return { copied: false }; fail('exists', 'media: that id is already used in this chat'); }
      if (this.mediaBytes(to) + Number(s.bytes) > this.limits.media.chatBytes) fail('full', 'this chat has used its media allowance');
      this.q.chunkCopy.run(to, mid, from, fromMid);
      this.q.midPut.run(to, mid, Number(s.bytes), exp, oh);
      return { copied: true };
    });
  }

  // Removes media whose expiry has passed (a disappearing message's files). Returns how many media ids went.
  sweepMedia(now = this.now()) {
    const rows = this.q.midExpired.all(now);
    if (!rows.length) return 0;
    this._mtx(() => { for (const r of rows) { this.q.chunkDelMedia.run(r.cid, r.mid); this.q.midDel.run(r.cid, r.mid); } });
    return rows.length;
  }

  // ---- housekeeping -------------------------------------------------------------------

  // Whether a password box stood at this address until it was deleted, within boxGoneMs (SPEC.md 4.5). A password change
  // deletes a login's old boxes; a device still holding an old address that asks the gate about it is not guessing.
  // Kept under the address key, like the boxes themselves.
  boxWasHere(loc, now = this.now()) {
    const r = this.q.goneGet.get(keyedId(this.addrKey, 'gone', loc));
    return !!r && now - r.ts < this.limits.boxGoneMs;
  }
  sweepGone(now = this.now()) { return Number(this.q.goneSweep.run(now - this.limits.boxGoneMs).changes); }
  // Link requests last written over linkreqTtlMs ago (SPEC.md 8.6). Nothing to announce: keyed rows cannot be watched.
  sweepLinkreqs(now = this.now()) { return Number(this.q.staleLinkreqs.run(now - this.limits.linkreqTtlMs).changes); }

  // A message's reactions and votes (acts/<pid>~…) and its comments go with it (release 91). Returns the rows removed, to announce: never
  // a channel's row from before chat.act, whose tag anyone holding the chat key can test against a username (authz.js 'slotted').
  _postSides(cid, pid) {
    const acts = `channels/${cid}/acts`, comments = `channels/${cid}/comments`, row = this.q.chatGet.get(cid), chan = !!row && row.type === 'channel';
    const gone = [...this.q.actsOf.all(acts, pid + '~', pid + '\u007f').map((r) => ({ kind: 'acts', parent: acts, id: r.id, an: r.an })),
      ...this.q.commentsOf.all(comments, pid).map((r) => ({ kind: 'comments', parent: comments, id: r.id }))];
    for (const g of gone) this.q.del.run(g.parent + '/' + g.id);
    return gone.filter((g) => !chan || g.kind !== 'acts' || g.an === 1);
  }
  _gone(rows) { for (const g of rows) this.emit('change', { kind: g.kind, parent: g.parent, id: g.id, d: null, type: 'del' }); }

  // Deletes documents whose `exp` has passed: messages, each with its reactions, votes and comments (at most sweepSideMax of
  // those a run, past its first message: the rest wait a minute), and member cards. A chat's `last` is a copy of its latest
  // message, sealed body and all (SPEC.md 5.3): once the copy's own `exp` has passed it goes from the record too, whatever
  // happened to the message. Returns how many expired rows went.
  sweep(now = this.now()) {
    const rows = this.q.expired.all(now), lasts = this.q.lastExpired.all(now);
    if (!rows.length && !lasts.length) return 0;
    const gone = [], chats = [];
    let n = 0;
    this._tx(() => {
      for (const r of rows) {
        if (gone.length >= this.limits.sweepSideMax) break;
        const kind = r.parent.slice(r.parent.lastIndexOf('/') + 1);   // posts, comments or roll
        if (!Number(this.q.del.run(r.path).changes)) continue;   // a comment its message took a moment ago
        gone.push({ kind, parent: r.parent, id: r.id }); n++;
        if (kind === 'posts') gone.push(...this._postSides(r.parent.split('/')[1], r.id));
      }
      for (const { path } of lasts) {
        const p = parseDocPath(path), d = { ...JSON.parse(this.q.get.get(path).d), last: null };
        this._write(p, d, now); chats.push({ p, d });
      }
    });
    this._gone(gone);
    for (const x of chats) this._emit(x.p, x.d, 'set', null);
    return n;
  }

  // ---- mailboxes (SPEC.md 6) ----

  // How many notes a mailbox holds.
  noteCount(parent) {
    return Number(this.q.countUnder.get(parent).n);
  }

  // Keeps a mailbox at or under `max` notes by forgetting the oldest; announces each one. Returns how many went.
  makeRoom(parent, max) {
    const over = this.noteCount(parent) - max;
    if (over <= 0) return 0;
    const rows = this.q.oldestUnder.all(parent, over);
    this._tx(() => { for (const r of rows) this.q.del.run(parent + '/' + r.id); });
    for (const r of rows) this.emit('change', { kind: 'inbox', parent, id: r.id, d: null, type: 'del' });
    return rows.length;
  }

  // Forgets notes older than `ttlMs` (30 days by default). Returns how many were removed.
  sweepInbox(now = this.now(), ttlMs = this.limits.inboxTtlMs) {
    const rows = this.q.staleNotes.all(now - ttlMs);
    if (!rows.length) return 0;
    this._tx(() => { for (const r of rows) this.q.del.run(r.path); });
    for (const r of rows) this.emit('change', { kind: 'inbox', parent: r.parent, id: r.id, d: null, type: 'del' });
    return rows.length;
  }

  // Forgets expired presence, typing and call rows. Returns how many were removed.
  prune(now = this.now()) {
    const gone = this.mem.prune(now);
    for (const g of gone) {
      const kind = g.parent === 'presence' ? 'presence' : g.parent.slice(g.parent.lastIndexOf('/') + 1);   // typing or call
      this.emit('change', { kind, parent: g.parent, id: g.id, d: null, type: 'del' });
    }
    return gone.length;
  }

  stats() {
    return { docs: Number(this.q.count.get().n), memoryParents: this.mem.parents.size };
  }
}
