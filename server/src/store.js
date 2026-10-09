// The document store (SPEC.md 8). Three backends behind one path grammar:
//   docs    – SQLite table `docs` in hush.db (everything durable)
//   media   – SQLite tables `chunks` (encrypted media pieces) and `media_ids` (size and expiry per media id) in media.db
//   memory  – presence and typing, never written to disk
// plus the `chats` table: per chat, the hashes of its room keys and its epoch.
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
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { fail } from './errors.js';
import { validateDoc, mergePatch, byteLength, isPlain } from './merge.js';
import { KINDS, QUERYABLE, ID, genId, keyedId, parseDocPath, parseCollectionPath } from './paths.js';
import { MAX_BYTES, validateForKind, applyPostUpdate, canDeletePost, labelMap, sealedMeta } from './schemas.js';
import { validateQuery, matches, orderAndLimit, SQL_OP } from './query.js';
import { DEFAULT_LIMITS, withLimits, maxPieces } from './limits.js';
import { isAdminOf, rankOf, levelOf } from './authz.js';

export const SYSTEM = Symbol('system');
const ANON = Object.freeze({ handle: null, viaAccountKey: false, mayCreate: null, pub: null, chats: new Map() });

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
const TOP_LITERAL = /^[a-z]+$/;   // top-level collection names are safe to inline into SQL
const PREVIEW_FIELDS = ['type', 'visibility', 'epoch', 'keys', 'akeys', 'openKeys'];
const PUBLIC_PREVIEW_FIELDS = ['name', 'desc', 'photo', 'owner', 'admins', 'ts', 'last'];

const sha256hex = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
// Hashes of keys and proofs are compared in constant time, so how far a wrong key matches never shows in the timing.
export const hashEq = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
// Sealed metadata is sealed under the chat's current epoch and nothing else (SPEC.md 5.3): a copy from an earlier
// epoch would show a member list from before someone was removed, and clients ignore one.
const metaEpochOk = (d) => !isPlain(d.meta) || d.meta.e === (d.epoch === undefined ? 0 : d.epoch);
const metaChanged = (d, prev) => isPlain(d.meta) && JSON.stringify(d.meta) !== JSON.stringify(prev && prev.meta);

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

// In-memory backend for presence and typing.
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
  constructor({ dataDir, limits = DEFAULT_LIMITS, addrKeyFile, now = Date.now, authz = null } = {}) {
    super();
    if (!dataDir) fail('internal', 'dataDir is required');
    this.dataDir = dataDir;
    this.limits = withLimits(DEFAULT_LIMITS, limits);
    this.addrKeyFile = addrKeyFile || join(dataDir, 'addr.key');
    this.now = now;
    this.authz = authz;
    this.mem = new MemoryBackend();
    this.db = null;
    this.media = null;
  }

  open() {
    mkdirSync(this.dataDir, { recursive: true });
    this.addrKey = loadOrCreateKey(this.addrKeyFile);
    this.db = openDb(join(this.dataDir, 'hush.db'), SCHEMA_MAIN);
    ensureColumn(this.db, 'chats', 'cap_b', 'TEXT');   // a DM's base key (SPEC.md 5.1), added in stage 5
    this.media = openDb(join(this.dataDir, 'media.db'), SCHEMA_MEDIA);
    this.db.prepare('INSERT OR REPLACE INTO meta(k, v) VALUES (?, ?)').run('schema', SCHEMA_VERSION);
    this.q = {
      get: this.db.prepare('SELECT d FROM docs WHERE path = ?'),
      put: this.db.prepare('INSERT INTO docs(path, parent, id, d, ts, exp) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(path) DO UPDATE SET d = excluded.d, ts = excluded.ts, exp = excluded.exp'),
      del: this.db.prepare('DELETE FROM docs WHERE path = ?'),
      delUnder: this.db.prepare("DELETE FROM docs WHERE parent = ? OR parent LIKE ? ESCAPE '\\'"),
      expired: this.db.prepare('SELECT path, parent, id FROM docs WHERE exp > 0 AND exp < ? LIMIT 500'),
      count: this.db.prepare('SELECT COUNT(*) AS n FROM docs'),
      countUnder: this.db.prepare('SELECT COUNT(*) AS n FROM docs WHERE parent = ?'),
      oldestUnder: this.db.prepare('SELECT id FROM docs WHERE parent = ? ORDER BY ts ASC, id ASC LIMIT ?'),
      staleNotes: this.db.prepare("SELECT path, parent, id FROM docs WHERE parent LIKE 'inbox/%/c' AND ts IS NOT NULL AND ts < ? LIMIT 500"),
      chatGet: this.db.prepare('SELECT type, epoch, cap_m, cap_a, cap_o, cap_b FROM chats WHERE cid = ?'),
      chatPut: this.db.prepare('INSERT INTO chats(cid, type, epoch, cap_m, cap_a, cap_o, cap_b) VALUES (?, ?, ?, ?, ?, ?, ?)'),
      chatBase: this.db.prepare('UPDATE chats SET cap_b = ? WHERE cid = ? AND cap_b IS NULL'),
      chatRotate: this.db.prepare('UPDATE chats SET epoch = ?, cap_m = ? WHERE cid = ?'),
      chatAdmins: this.db.prepare('UPDATE chats SET cap_a = ? WHERE cid = ?'),
      chatDel: this.db.prepare('DELETE FROM chats WHERE cid = ?'),
      chunkGet: this.media.prepare('SELECT i, iv, d FROM chunks WHERE cid = ? AND mid = ? AND i = ?'),
      chunkPut: this.media.prepare('INSERT INTO chunks(cid, mid, i, iv, d) VALUES (?, ?, ?, ?, ?) ON CONFLICT(cid, mid, i) DO UPDATE SET iv = excluded.iv, d = excluded.d'),
      chunkDel: this.media.prepare('DELETE FROM chunks WHERE cid = ? AND mid = ? AND i = ?'),
      chunkDelChat: this.media.prepare('DELETE FROM chunks WHERE cid = ?'),
      chunkList: this.media.prepare('SELECT i, iv, d FROM chunks WHERE cid = ? AND mid = ? ORDER BY i'),
      chunkSize: this.media.prepare('SELECT length(d) AS n FROM chunks WHERE cid = ? AND mid = ? AND i = ?'),
      chunkInsert: this.media.prepare('INSERT INTO chunks(cid, mid, i, iv, d) VALUES (?, ?, ?, ?, ?)'),
      chunkDelMedia: this.media.prepare('DELETE FROM chunks WHERE cid = ? AND mid = ?'),
      chunkCopy: this.media.prepare('INSERT INTO chunks(cid, mid, i, iv, d) SELECT ?, ?, i, iv, d FROM chunks WHERE cid = ? AND mid = ?'),
      midGet: this.media.prepare('SELECT bytes, exp FROM media_ids WHERE cid = ? AND mid = ?'),
      midPut: this.media.prepare('INSERT INTO media_ids(cid, mid, bytes, exp) VALUES (?, ?, ?, ?) ON CONFLICT(cid, mid) DO UPDATE SET bytes = excluded.bytes, exp = excluded.exp'),
      midDel: this.media.prepare('DELETE FROM media_ids WHERE cid = ? AND mid = ?'),
      midDelChat: this.media.prepare('DELETE FROM media_ids WHERE cid = ?'),
      midChatBytes: this.media.prepare('SELECT COALESCE(SUM(bytes), 0) AS n FROM media_ids WHERE cid = ?'),
      midExpired: this.media.prepare('SELECT cid, mid FROM media_ids WHERE exp > 0 AND exp < ? LIMIT 200'),
    };
    // Media stored before stage 6 had no per-media record: count it once, so it is part of each chat's allowance.
    if (!this.media.prepare('SELECT 1 FROM media_ids LIMIT 1').get() && this.media.prepare('SELECT 1 FROM chunks LIMIT 1').get()) {
      this.media.exec('INSERT INTO media_ids(cid, mid, bytes, exp) SELECT cid, mid, SUM(length(d)), 0 FROM chunks GROUP BY cid, mid');
    }
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
        return r ? JSON.parse(r.d) : null;
      }
    }
  }

  _write(p, d, now) {
    switch (p.backend) {
      case 'memory': {
        const ttl = p.kind === 'typing' ? this.limits.typingTtlMs : this.limits.presenceTtlMs;
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
        const ts = typeof d.ts === 'number' ? d.ts : null;
        const exp = EXP_KINDS.has(p.kind) && typeof d.exp === 'number' && d.exp > 0 ? d.exp : 0;
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

  _emit(p, d, type) {
    this.emit('change', { kind: p.kind, parent: p.parent, id: p.id, d: type === 'set' ? d : null, type });
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

  // ---- documents ----------------------------------------------------------------
  // All methods take string paths exactly as the client sends them, plus the actor.

  get(path, actor) {
    const p = parseDocPath(path);
    const mode = this._check(actor, 'get', p);
    let d = this._read(p, this.now());
    if (d && mode === 'preview') {
      const fields = d.visibility === 'public' ? [...PREVIEW_FIELDS, ...PUBLIC_PREVIEW_FIELDS] : PREVIEW_FIELDS;
      const t = {};
      for (const f of fields) if (d[f] !== undefined) t[f] = d[f];
      d = t;
    }
    return { id: p.id, d };
  }

  mget(paths, actor) {
    if (!Array.isArray(paths) || paths.length === 0 || paths.length > this.limits.mgetMax) fail('invalid', 'mget: bad path list');
    return paths.map((path) => this.get(path, actor));
  }

  set(path, d, actor) {
    const p = parseDocPath(path);
    validateDoc(d);
    this._checkSize(p.kind, d);
    const now = this.now();
    const prev = this._read(p, now);
    this._check(actor, 'set', p, { d, prev });
    if (prev && SEALED_KINDS.has(p.kind)) fail('exists', 'a message with this id already exists');
    if (p.kind === 'channels' && metaChanged(d, prev) && !metaEpochOk(d)) fail('invalid', 'chat: sealed meta must be sealed under the current epoch');
    validateForKind(p.kind, { ...p, now, op: 'set', prev }, d);
    this._write(p, d, now);
    this._emit(p, d, 'set');
    return { id: p.id };
  }

  update(path, patch, actor) {
    const p = parseDocPath(path);
    validateDoc(patch, 'patch');
    const now = this.now();
    const prev = this._read(p, now);
    if (!prev) fail('notfound', 'no document to update');
    const merged = SEALED_KINDS.has(p.kind) ? applyPostUpdate(prev, patch) : mergePatch(prev, patch);
    validateDoc(merged);
    this._checkSize(p.kind, merged);
    this._check(actor, 'update', p, { d: merged, prev, patch });
    if (p.kind === 'channels' && metaChanged(merged, prev) && !metaEpochOk(merged)) fail('invalid', 'chat: sealed meta must be sealed under the current epoch');
    validateForKind(p.kind, { ...p, now, op: 'update', prev }, merged);
    this._write(p, merged, now);
    this._emit(p, merged, 'set');
    return { id: p.id, d: merged };
  }

  delete(path, { ot } = {}, actor) {
    const p = parseDocPath(path);
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
        this.q.chunkDelChat.run(p.id);
        this.q.midDelChat.run(p.id);
      });
      this._emit(p, null, 'del');
      this.emit('evict', { cid: p.id, keep: null });
      return true;
    }
    this._remove(p);
    this._emit(p, null, 'del');
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
    this._check(actor, 'query', col, { w });
    if (col.kind === 'channels' && !w.some(([f, op, v]) => f === 'visibility' && op === '==' && v === 'public')) {
      fail('denied', 'only public channels can be listed');
    }
    const now = this.now();
    const backend = KINDS[col.kind].backend;
    if (backend === 'memory') return orderAndLimit(this.mem.list(col.parent, now).filter((r) => matches(r.d, w)), o, l);
    if (backend === 'media') {
      const rows = this.q.chunkList.all(col.cid, col.mid).map((r) => ({ id: String(r.i), d: { i: Number(r.i), iv: r.iv, d: Buffer.from(r.d).toString('base64') } }));
      return orderAndLimit(rows.filter((r) => matches(r.d, w)), o, l);
    }
    const params = [];
    let sql = 'SELECT id, d FROM docs WHERE ';
    if (TOP_LITERAL.test(col.parent)) sql += `parent = '${col.parent}'`;
    else { sql += 'parent = ?'; params.push(col.parent); }
    for (const [f, op, v] of w) {
      if (f === 'ts') { sql += ` AND ts ${SQL_OP[op]} ?`; params.push(v); }
      else { sql += ` AND json_extract(d, ?) ${SQL_OP[op]} ?`; params.push('$.' + f, v); }
    }
    if (o) {
      if (o[0] === 'ts') sql += ` ORDER BY ts ${o[1] === 'desc' ? 'DESC' : 'ASC'}, id ASC`;
      else { sql += ` ORDER BY json_extract(d, ?) ${o[1] === 'desc' ? 'DESC' : 'ASC'}, id ASC`; params.push('$.' + o[0]); }
    } else sql += ' ORDER BY id ASC';
    sql += ' LIMIT ?';
    params.push(l);
    return this.db.prepare(sql).all(...params).map((r) => ({ id: r.id, d: JSON.parse(r.d) }));
  }

  // Validates a `sub` frame and computes its first result. Returns { spec, init }.
  prepareSub({ p, ids, w, o, l }, actor) {
    const col = parseCollectionPath(p);
    if (ids !== undefined) {
      if (!Array.isArray(ids) || ids.length === 0 || ids.length > this.limits.docsPerSub) fail('invalid', 'sub: bad "ids"');
      if (col.keyed) fail('denied', 'this collection cannot be watched');
      const pat = KINDS[col.kind].id;
      for (const id of ids) if (typeof id !== 'string' || !pat.test(id)) fail('invalid', 'sub: bad id');
      const init = [];
      for (const id of ids) {
        const pd = parseDocPath(col.parent + '/' + id);
        this._check(actor, 'watch', pd);
        const d = this._read(pd, this.now());
        if (d !== null) init.push({ id, d });
      }
      return { spec: { kind: col.kind, parent: col.parent, ids }, init };
    }
    const init = this.query(p, { w, o, l }, actor);
    return { spec: { kind: col.kind, parent: col.parent, w: w || [], o, l }, init };
  }

  // ---- chats and room keys (SPEC.md 5) ----------------------------------------------

  // Returns { level, epoch, type } for the creator's connection.
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
    validateForKind('channels', { ...p, now, op: 'set', prev: null }, d);
    if (!metaEpochOk(d)) fail('invalid', 'chat.create: sealed meta must be sealed under the chat\'s epoch');
    const existing = this._read(p, now);
    if (existing) {
      const row = this.q.chatGet.get(p.id), h = sha256hex(caps.m);
      if (dm && existing.type === 'dm' && row && (hashEq(row.cap_m, h) || hashEq(row.cap_b, h))) {
        if (!row.cap_b && Number(row.epoch) === 0) this.q.chatBase.run(sha256hex(caps.m), p.id);   // a DM from before base keys were kept
        return { level: 'member', epoch: Number(row.epoch), type: 'dm', existed: true };
      }
      fail('exists', 'a chat with this id already exists');
    }
    const epoch = d.epoch === undefined ? 0 : d.epoch;
    // A DM keeps the hash of its epoch-0 member key for good as a base key (SPEC.md 5.1): both people can always
    // derive it from their account keys, so a device that lost the chat keys can still open the DM and heal it.
    this._tx(() => {
      this._write(p, d, now);
      this.q.chatPut.run(p.id, d.type, epoch, sha256hex(caps.m), dm ? null : sha256hex(caps.a), dm ? null : sha256hex(caps.o), dm && epoch === 0 ? sha256hex(caps.m) : null);
    });
    this._emit(p, d, 'set');
    return { level: dm ? 'member' : 'owner', epoch, type: d.type };
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

  // Which level does this key grant? Returns { level, epoch, type } or throws.
  openChat({ cid, cap }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid))) fail('invalid', 'chat.open: bad chat id');
    if (!ID.CAP.test(cap || '')) fail('invalid', 'chat.open: bad key');
    const row = this.q.chatGet.get(cid);
    if (!row) fail('notfound', 'no such chat');
    const h = sha256hex(cap);
    const level = hashEq(h, row.cap_o) ? 'owner' : hashEq(h, row.cap_a) ? 'admin' : hashEq(h, row.cap_m) || hashEq(h, row.cap_b) ? 'member' : null;
    if (!level) fail('denied', 'that key does not open this chat');
    return { level, epoch: Number(row.epoch), type: row.type };
  }

  // One invite's sealed key history, for a link holder about to join (SPEC.md 5.5).
  inviteOf({ cid, iid }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || !ID.ITEM_ID.test(String(iid))) fail('invalid', 'chat.invite: bad id');
    const { doc } = this._chatDoc(cid);
    const inv = doc && isPlain(doc.invites) ? doc.invites[iid] : null;
    if (!inv) fail('notfound', 'no such invite');
    return { iv: inv.iv, ct: inv.ct };
  }

  // Joining by link: prove the link, add your own wraps (SPEC.md 5.6).
  joinChat({ cid, iid, proof, wraps }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid)) || !ID.ITEM_ID.test(String(iid))) fail('invalid', 'chat.join: bad id');
    if (typeof proof !== 'string' || proof.length < 20 || proof.length > 128) fail('invalid', 'chat.join: bad proof');
    const { p, doc } = this._chatDoc(cid);
    if (!doc) fail('notfound', 'no such chat');
    const inv = isPlain(doc.invites) ? doc.invites[iid] : null;
    if (!inv || typeof inv.ph !== 'string' || !hashEq(sha256hex(proof), inv.ph.toLowerCase())) fail('denied', 'this invite link is not valid');
    if (!isPlain(wraps) || !Object.keys(wraps).length) fail('invalid', 'chat.join: wraps are required');
    const keys = { ...(doc.keys || {}) };
    for (const [e, m] of Object.entries(wraps)) {
      if (!keys[e]) fail('invalid', 'chat.join: unknown epoch');
      labelMap(m, 'chat.join');
      for (const label of Object.keys(m)) if (keys[e][label]) fail('conflict', 'chat.join: label already used');
      keys[e] = { ...keys[e], ...m };
    }
    const next = { ...doc, keys };
    this._checkSize('channels', next);
    validateForKind('channels', { ...p, now: this.now(), op: 'update', prev: doc }, next);
    this._write(p, next, this.now());
    this._emit(p, next, 'set');
    return { epoch: doc.epoch === undefined ? 0 : doc.epoch };
  }

  // A new epoch: new wraps, new member key, optionally new sealed meta (kick, leave, heal, go private).
  rotateChat({ cid, epoch, keys, cap, meta, openKeys }, actor) {
    if (!actor || actor === SYSTEM || !actor.handle) fail('unauth', 'sign in first');
    if (!ID.CID.test(String(cid))) fail('invalid', 'chat.rotate: bad chat id');
    const { p, doc, row } = this._chatDoc(cid);
    if (!doc || !row) fail('notfound', 'no such chat');
    const need = doc.type === 'dm' ? 1 : 2;
    if (rankOf(actor, cid) < need) fail('denied', doc.type === 'dm' ? 'open this chat with its key first' : 'this needs admin access to the chat');
    const cur = doc.epoch === undefined ? 0 : doc.epoch;
    if (epoch !== cur + 1 || epoch > 31) fail('conflict', `chat.rotate: the next epoch is ${cur + 1}`);
    if (!ID.CAP.test(cap || '')) fail('invalid', 'chat.rotate: bad member key');
    labelMap(keys || {}, 'chat.rotate');
    if (meta !== undefined) { sealedMeta(meta, 'chat.rotate'); if (meta.e !== epoch) fail('invalid', 'chat.rotate: sealed meta must be sealed under the new epoch'); }
    if (openKeys !== undefined) {
      if (!isPlain(openKeys)) fail('invalid', 'chat.rotate: bad openKeys');
      for (const [e, v] of Object.entries(openKeys)) if (Number(e) !== epoch || typeof v !== 'string') fail('invalid', 'chat.rotate: openKeys must be for the new epoch');
    }
    const next = { ...doc, epoch, keys: { ...(doc.keys || {}), [epoch]: keys || {} }, invites: {} };
    if (meta !== undefined) next.meta = meta;
    if (openKeys !== undefined) next.openKeys = { ...(doc.openKeys || {}), ...openKeys };
    this._checkSize('channels', next);
    validateForKind('channels', { ...p, now: this.now(), op: 'update', prev: doc }, next);
    this._tx(() => {
      this._write(p, next, this.now());
      this.q.chatRotate.run(epoch, sha256hex(cap), cid);
    });
    this._emit(p, next, 'set');
    this.emit('evict', { cid, keep: actor.conn || null });
    return { epoch };
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
    this._checkSize('channels', next);
    this._tx(() => {
      this._write(p, next, this.now());
      this.q.chatAdmins.run(sha256hex(cap), cid);
    });
    this._emit(p, next, 'set');
    this.emit('evict', { cid, keep: actor.conn || null });
    return {};
  }

  // ---- media over HTTP (SPEC.md 7.7) ---------------------------------------------------
  // A piece travels as raw bytes: a 12-byte iv, then the AES-GCM ciphertext. It is stored as before, iv apart.
  // `media_ids` keeps per media id only its stored size (for the chat's allowance) and, for a disappearing
  // message, when it may be swept. Nothing says what kind of file it is.

  _mtx(fn) {
    this.media.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.media.exec('COMMIT'); return r; }
    catch (e) { this.media.exec('ROLLBACK'); throw e; }
  }

  // Adds `delta` bytes to a media id's record. An expiry only ever moves later, and once any piece came without
  // one the media is kept: a piece is never swept before the message that shows it.
  _midAdd(cid, mid, delta, exp) {
    const row = this.q.midGet.get(cid, mid);
    const bytes = Math.max(0, (row ? Number(row.bytes) : 0) + delta);
    if (row && delta < 0 && bytes === 0) { this.q.midDel.run(cid, mid); return; }
    let e = row ? Number(row.exp) : 0;
    if (exp !== undefined) e = !row ? exp : (e === 0 || exp === 0) ? 0 : Math.max(e, exp);
    this.q.midPut.run(cid, mid, bytes, e);
  }

  _piecePath(cid, mid, i) {
    if (!ID.CID.test(String(cid)) || !ID.MID.test(String(mid)) || !ID.CHUNK_I.test(String(i))) fail('invalid', 'media: bad address');
    return parseDocPath(`channels/${cid}/media/${mid}/chunks/${i}`);
  }

  // Bytes of media stored for one chat.
  mediaBytes(cid) {
    return Number(this.q.midChatBytes.get(cid).n);
  }

  // Stores one piece, once. The same bytes again (a retry) are fine; different bytes are refused, so nobody can
  // swap a piece of someone else's file. `exp` (ms, 0 = none) lets the sweep remove a disappearing message's media.
  // Returns { created }.
  mediaPut({ cid, mid, i, body, exp = 0 }, actor) {
    const p = this._piecePath(cid, mid, i);
    this._check(actor, 'put', p);
    const M = this.limits.media, n = Number(p.id);
    if (n >= maxPieces(M)) fail('invalid', 'media: piece index out of range');
    if (!Buffer.isBuffer(body) || body.length < 28) fail('invalid', 'media: a piece is a 12-byte iv and its ciphertext');
    if (body.length > M.pieceBytes + 28) fail('toolarge', 'media: piece too large');
    if (!Number.isSafeInteger(exp) || exp < 0) fail('invalid', 'media: bad expiry');
    const iv = body.subarray(0, 12).toString('base64'), d = Buffer.from(body.subarray(12));
    return this._mtx(() => {
      const cur = this.q.chunkGet.get(p.cid, p.mid, n);
      if (cur) {
        if (cur.iv === iv && Buffer.from(cur.d).equals(d)) return { created: false };
        fail('conflict', 'media: this piece is already stored');
      }
      if (this.mediaBytes(p.cid) + d.length > M.chatBytes) fail('full', 'this chat has used its media allowance');
      this.q.chunkInsert.run(p.cid, p.mid, n, iv, d);
      this._midAdd(p.cid, p.mid, d.length, exp);
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

  // Removes every piece of one media id. Returns how many pieces went.
  mediaDelete({ cid, mid }, actor) {
    const p = this._piecePath(cid, mid, 0);
    this._check(actor, 'delete', p);
    return this._mtx(() => {
      const n = Number(this.q.chunkDelMedia.run(p.cid, p.mid).changes);
      this.q.midDel.run(p.cid, p.mid);
      return n;
    });
  }

  // Copies media `fromMid` of chat `from` to media `mid` of chat `to`, for a forward: the sealed descriptor (and its
  // per-file key) is reused with the new id, so nothing is downloaded or uploaded again, and each copy can be
  // deleted or expire on its own. Needs read access to `from` and write access to `to`.
  mediaCopy({ from, fromMid, to, mid, exp = 0 }, actorFrom, actorTo) {
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
      this.q.midPut.run(to, mid, Number(s.bytes), exp);
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

  // Deletes documents whose `exp` has passed. Returns how many were removed.
  sweep(now = this.now()) {
    const rows = this.q.expired.all(now);
    if (!rows.length) return 0;
    this._tx(() => { for (const r of rows) this.q.del.run(r.path); });
    for (const r of rows) {
      const kind = r.parent.endsWith('/comments') ? 'comments' : 'posts';
      this.emit('change', { kind, parent: r.parent, id: r.id, d: null, type: 'del' });
    }
    return rows.length;
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

  // Forgets expired presence and typing rows. Returns how many were removed.
  prune(now = this.now()) {
    const gone = this.mem.prune(now);
    for (const g of gone) {
      const kind = g.parent === 'presence' ? 'presence' : 'typing';
      this.emit('change', { kind, parent: g.parent, id: g.id, d: null, type: 'del' });
    }
    return gone.length;
  }

  stats() {
    return { docs: Number(this.q.count.get().n), memoryParents: this.mem.parents.size };
  }
}
