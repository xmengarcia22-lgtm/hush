import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { Store } from '../src/store.js';
import { CID, CID2, PID, TAG, throwsCode } from './helpers.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const now = () => Date.now();

let dir, store, events;
before(() => {
  dir = mkdtempSync(join(tmpdir(), 'hush-store-'));
  store = new Store({ dataDir: dir, limits: { typingTtlMs: 50 } }).open();
  events = [];
  store.on('change', (e) => events.push(e));
});
after(() => { store.close(); rmSync(dir, { recursive: true, force: true }); });

const post = (over = {}) => ({ sl: 1, ts: now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha('token-0'), on: 0, ...over });

test('set, get, update (merge), delete', () => {
  const p = 'directory/alice';
  const doc = { handle: 'alice', ecdh: { x: 'x1', y: 'y1' }, sig: { x: 'x2', y: 'y2' }, name: 'Alice', devs: { dev1aaaa: { x: 'a', y: 'b', sx: 'c', sy: 'd', s: 'e', ts: 1 } } };
  store.set(p, doc);
  assert.deepEqual(store.get(p).d, doc);
  store.update(p, { name: 'Alicia', bio: 'hi', devs: { dev1aaaa: null, dev2bbbb: { x: 'a', y: 'b', sx: 'c', sy: 'd', s: 'e' } } });
  const got = store.get(p).d;
  assert.equal(got.name, 'Alicia');
  assert.equal(got.bio, 'hi');
  assert.deepEqual(Object.keys(got.devs), ['dev2bbbb'], 'null removes a nested key');
  assert.equal(got.ecdh.x, 'x1', 'untouched fields survive a merge');
  assert.equal(store.delete(p), true);
  assert.equal(store.get(p).d, null);
  assert.equal(store.delete(p), false, 'deleting twice is harmless');
  throwsCode(() => store.update(p, { name: 'x' }), 'notfound');
});

test('rejects documents that break the collection rules', () => {
  assert.throws(() => store.set('directory/bob', { handle: 'alice', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' } }), /handle/);
  assert.throws(() => store.set('directory/bob', { handle: 'bob', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' }, _uid: 'u' }), /bad field name/);
  assert.throws(() => store.set('directory/bob', { handle: 'bob', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' }, disp: 'Bobby' }), /disp/);
  assert.throws(() => store.set(`channels/${CID}`, { type: 'group', members: ['alice'] }), /name on the server/);
  assert.throws(() => store.set(`channels/${CID}`, { type: 'group', name: 'Secret club' }), /sealed meta/);
  assert.throws(() => store.set(`channels/${CID}`, { type: 'party' }), /type/);
  assert.throws(() => store.set('logins/' + 'a'.repeat(43), { ts: 1, extra: true }), /not allowed/);
  assert.throws(() => store.set(`channels/${CID}/posts/${PID}`, { from: 'alice', iv: 'x', ct: 'y', ts: now(), e: 0 }), /sealed/);
  assert.throws(() => store.set(`channels/${CID}/posts/${PID}`, post({ ts: now() - 40 * 86400000 })), /ts/);
  throwsCode(() => store.set('vault/v' + 'a'.repeat(32), { iv: 'x', ct: 'y'.repeat(3 * 1024 * 1024) }), 'toolarge');
});

test('public channels may carry owner and name; private ones may not; listing needs the public filter', () => {
  store.set(`channels/${CID2}`, { type: 'channel', visibility: 'public', owner: 'alice', admins: ['bob'], name: 'News', epoch: 0, openKeys: { 0: 'k'.repeat(44) }, ts: now() });
  store.set(`channels/${CID}`, { type: 'group', visibility: 'private', epoch: 0, keys: { 0: { [TAG]: { epk: { x: 'a', y: 'b' }, iv: 'i', ct: 'c' } } }, ts: now() });
  throwsCode(() => store.query('channels', { l: 10 }), 'denied', /public/);
  const pub = store.query('channels', { w: [['visibility', '==', 'public']], l: 10 });
  assert.deepEqual(pub.map((r) => r.id), [CID2]);
});

test('sealed posts: create, edit with the one-time token, delete rules', () => {
  const p = `channels/${CID}/posts/${PID}`;
  store.set(p, post());
  throwsCode(() => store.set(p, post()), 'exists');
  throwsCode(() => store.update(p, { d: 'new' }), 'denied', /author/);
  throwsCode(() => store.update(p, { d: 'new', ot: 'wrong', oh: sha('token-1'), on: 1 }), 'denied', /author/);
  throwsCode(() => store.update(p, { d: 'new', ot: 'token-0', oh: sha('token-1'), on: 0 }), 'invalid', /must increase/);
  throwsCode(() => store.update(p, { sl: 2, ot: 'token-0', oh: sha('token-1'), on: 1 }), 'invalid', /cannot change|sealed/);
  store.update(p, { d: 'new', edited: now(), ot: 'token-0', oh: sha('token-1'), on: 1 });
  const got = store.get(p).d;
  assert.equal(got.d, 'new');
  assert.equal(got.ot, undefined, 'the token is never stored');
  assert.equal(got.oh, sha('token-1'));
  throwsCode(() => store.delete(p), 'denied');
  throwsCode(() => store.delete(p, { ot: 'token-0' }), 'denied');   // a used token is worthless
  assert.equal(store.delete(p, { ot: 'token-1' }), true);
});

test('wiped or expired posts may be removed by anyone; service notes are immutable', () => {
  const p = `channels/${CID}/posts/${PID}`;
  store.set(p, post());
  store.update(p, { del: true, n: '', d: '', oh: '', on: 1, ot: 'token-0' });
  assert.equal(store.delete(p), true, 'a post its author wiped can be cleared without a token');
  store.set(p, post({ exp: now() - 1000 }));
  assert.equal(store.delete(p), true, 'an expired post can be cleared without a token');
  const svc = `channels/${CID}/posts/sVcNote12345`;
  store.set(svc, { sv: 1, ts: now(), e: 0, n: 'n', d: 'd' });
  throwsCode(() => store.update(svc, { d: 'x', ot: 'whatever' }), 'denied', /service notes/);
  throwsCode(() => store.delete(svc), 'denied');
});

test('add generates ids only where allowed', () => {
  const { id } = store.add(`channels/${CID}/posts`, { sv: 1, ts: now(), e: 0, n: 'n', d: 'd' });
  assert.match(id, /^[A-Za-z0-9]{12}$/);
  assert.equal(store.get(`channels/${CID}/posts/${id}`).d.sv, 1);
  assert.throws(() => store.add('directory', { handle: 'x' }), /generated ids/);
});

test('queries on posts: range on ts, order, limit', () => {
  const base = now();
  for (let k = 0; k < 5; k++) store.set(`channels/${CID2}/posts/qPost000000${k}`, post({ ts: base + k * 1000 }));
  const newest = store.query(`channels/${CID2}/posts`, { o: ['ts', 'desc'], l: 3 });
  assert.deepEqual(newest.map((r) => r.d.ts), [base + 4000, base + 3000, base + 2000]);
  const older = store.query(`channels/${CID2}/posts`, { w: [['ts', '<', base + 2000]], o: ['ts', 'desc'], l: 200 });
  assert.deepEqual(older.map((r) => r.d.ts), [base + 1000, base]);
  throwsCode(() => store.query(`channels/${CID2}/posts`, { l: 5000 }), 'invalid', /limit/);
  throwsCode(() => store.query(`channels/${CID2}/posts`, {}), 'invalid', /limit/);
  throwsCode(() => store.query('directory', { l: 1 }), 'denied', /cannot be queried/);
});

test('search: prefix queries with the client\'s range trick, limit 10', () => {
  store.set('search/alice', { h: 'alice', n: 'alice smith', n2: 'smith' });
  store.set('search/alfred', { h: 'alfred', n: 'alfred b', n2: 'b' });
  store.set('search/bob', { h: 'bob', n: 'bob', n2: '' });
  const r = store.query('search', { w: [['h', '>=', 'al'], ['h', '<=', 'al']], l: 10 });
  assert.deepEqual(r.map((x) => x.id).sort(), ['alfred', 'alice']);
  const r2 = store.query('search', { w: [['n2', '>=', 'smi'], ['n2', '<=', 'smi']], l: 10 });
  assert.deepEqual(r2.map((x) => x.id), ['alice']);
  assert.throws(() => store.query('search', { l: 11 }), /limit above 10/);
  assert.throws(() => store.set('search/alice', { h: 'alice', n: 'Alice', n2: '' }), /n/);
});

test('blind addresses are keyed before they touch the disk', () => {
  const loc = 'L0c'.padEnd(43, 'x');
  store.set('accounts/' + loc, { iv: 'aXY=', ct: 'Y3Q=' });
  assert.deepEqual(store.get('accounts/' + loc).d, { iv: 'aXY=', ct: 'Y3Q=' });
  const db = new DatabaseSync(join(dir, 'hush.db'), { readOnly: true });
  const rows = db.prepare('SELECT path, id FROM docs WHERE parent = ?').all('accounts');
  db.close();
  assert.equal(rows.length, 1);
  assert.ok(!rows[0].path.includes(loc) && rows[0].id !== loc, 'the raw address is not stored');
});

test('link requests: a waiting request is not replaced until it ages out', () => {
  const tag = 'T4g'.padEnd(43, 'y');
  store.set('linkreqs/' + tag, { state: 'wait', ts: now(), pub: { x: 'a', y: 'b' }, dev: 'Pixel' });
  throwsCode(() => store.set('linkreqs/' + tag, { state: 'wait', ts: now(), pub: { x: 'c', y: 'd' } }), 'conflict');
  store.update('linkreqs/' + tag, { state: 'no' });
  store.set('linkreqs/' + tag, { state: 'wait', ts: now(), pub: { x: 'c', y: 'd' } });
});

test('presence and typing live in memory only and expire', async () => {
  store.set('presence/alice', { ts: now() });
  assert.equal(typeof store.get('presence/alice').d.ts, 'number');
  const tp = `channels/${CID}/typing/0~${TAG}`;
  store.set(tp, { ts: now(), sg: 'sig' });
  assert.equal(store.get(tp).d.sg, 'sig');
  const db = new DatabaseSync(join(dir, 'hush.db'), { readOnly: true });
  const n = db.prepare("SELECT COUNT(*) AS n FROM docs WHERE parent = 'presence' OR parent LIKE '%/typing'").get().n;
  db.close();
  assert.equal(Number(n), 0, 'nothing on disk');
  await new Promise((r) => setTimeout(r, 80));
  events.length = 0;
  assert.equal(store.prune(), 1, 'typing row expired');
  assert.equal(store.get(tp).d, null);
  assert.deepEqual(events.map((e) => [e.kind, e.type]), [['typing', 'del']]);
  throwsCode(() => store.query('presence', { l: 1 }), 'denied', /cannot be queried/);
});

test('media chunks go to media.db and come back intact', () => {
  const bytes = Buffer.from('hello media world');
  const base = `channels/${CID}/media/mMEDIA1234567/chunks`;
  store.set(base + '/1', { i: 1, iv: 'aXY=', d: bytes.toString('base64') });
  store.set(base + '/0', { i: 0, iv: 'aXY=', d: bytes.toString('base64') });
  assert.throws(() => store.set(base + '/2', { i: 3, iv: 'aXY=', d: 'AA==' }), /"i"/);
  const got = store.get(base + '/1').d;
  assert.equal(Buffer.from(got.d, 'base64').toString(), 'hello media world');
  const all = store.query(base, { o: ['i', 'asc'], l: 1000 });
  assert.deepEqual(all.map((r) => r.d.i), [0, 1]);
  const mdb = new DatabaseSync(join(dir, 'media.db'), { readOnly: true });
  assert.equal(Number(mdb.prepare('SELECT COUNT(*) AS n FROM chunks').get().n), 2);
  mdb.close();
  assert.equal(store.delete(base + '/0'), true);
});

test('the expiry sweep removes dead posts and announces them', () => {
  const p1 = `channels/${CID2}/posts/eXpired00001`;
  const p2 = `channels/${CID2}/posts/aLive0000001`;
  store.set(p1, post({ exp: now() - 10 }));
  store.set(p2, post({ exp: now() + 60000 }));
  events.length = 0;
  assert.equal(store.sweep(), 1);
  assert.equal(store.get(p1).d, null);
  assert.ok(store.get(p2).d);
  assert.deepEqual(events.map((e) => [e.type, e.id]), [['del', 'eXpired00001']]);
});

test('data survives a close and reopen', () => {
  store.set('directory/carol', { handle: 'carol', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' } });
  store.close();
  store = new Store({ dataDir: dir, limits: { typingTtlMs: 50 } }).open();
  assert.equal(store.get('directory/carol').d.handle, 'carol');
  const loc = 'L0c'.padEnd(43, 'x');
  assert.ok(store.get('accounts/' + loc).d, 'keyed addresses still resolve with the same addr.key');
});
