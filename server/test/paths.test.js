import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseDocPath, parseCollectionPath, genId, keyedId, ID } from '../src/paths.js';
import { CID, PID, TAG } from './helpers.js';

test('parses every document path shape', () => {
  assert.equal(parseDocPath('directory/alice').kind, 'directory');
  assert.equal(parseDocPath('presence/alice').backend, 'memory');
  assert.equal(parseDocPath(`channels/${CID}`).kind, 'channels');
  assert.equal(parseDocPath('channels/d' + 'A'.repeat(22)).kind, 'channels');
  assert.equal(parseDocPath(`channels/${CID}/posts/${PID}`).kind, 'posts');
  assert.equal(parseDocPath(`channels/${CID}/acts/${PID}~${TAG}~react`).kind, 'acts');
  assert.equal(parseDocPath(`channels/${CID}/reads/3~${TAG}`).kind, 'reads');
  assert.equal(parseDocPath(`channels/${CID}/typing/0~${TAG}`).backend, 'memory');
  const ch = parseDocPath(`channels/${CID}/media/mABCDEFGHIJKL/chunks/7`);
  assert.equal(ch.kind, 'chunks');
  assert.equal(ch.backend, 'media');
  assert.equal(ch.mid, 'mABCDEFGHIJKL');
  assert.equal(ch.id, '7');
  const v = parseDocPath('vault/v' + 'x'.repeat(32));
  assert.equal(v.keyed, true);
  assert.equal(parseDocPath('accounts/' + 'a'.repeat(43)).keyed, true);
});

test('rejects malformed paths and ids', () => {
  for (const p of ['', 'nope/x', 'directory', 'directory/Alice', 'directory/ab', 'channels/xyz', `channels/${CID}/posts`,
    `channels/${CID}/posts/short`, `channels/${CID}/posts/${PID}/extra`, 'channels/../x', `channels/${CID}/typing/${TAG}`,
    `channels/${CID}/media/notamid/chunks/1`, `channels/${CID}/media/mABCDEFGHIJKL/chunks/100000`, `channels/${CID}/media/mABCDEFGHIJKL/chunks/01`, 'vault/nope', 'directory/' + 'a'.repeat(21)]) {
    assert.throws(() => parseDocPath(p), /bad path|bad id|unknown collection/, p);
  }
  assert.throws(() => parseCollectionPath(`channels/${CID}/media/mABCDEFGHIJKL`), /unknown collection/);
});

test('release 91: marks take epochs of up to 10 digits; key-chain rows are named by their epoch, member cards by a 43-character tag', () => {
  assert.equal(parseDocPath(`channels/${CID}/reads/100~${TAG}`).kind, 'reads');
  assert.equal(parseDocPath(`channels/${CID}/typing/2147483647~${TAG}`).kind, 'typing');
  for (const e of ['0', '2147483647']) {
    const p = parseDocPath(`channels/${CID}/chain/${e}`);
    assert.deepEqual([p.kind, p.backend, p.cid, p.id], ['chain', 'docs', CID, e]);
  }
  const r = parseDocPath(`channels/${CID}/roll/${'r'.repeat(43)}`);
  assert.deepEqual([r.kind, r.backend, r.keyed], ['roll', 'docs', false], 'the store makes the tag; the path is not keyed again');
  assert.equal(parseCollectionPath(`channels/${CID}/roll`).kind, 'roll');
  for (const p of [`reads/12345678901~${TAG}`, 'chain/01', 'chain/-1', 'chain/1.5', 'chain/x', 'chain/12345678901', `roll/${'r'.repeat(42)}`, `roll/${'r'.repeat(44)}`]) {
    assert.throws(() => parseDocPath(`channels/${CID}/${p}`), /bad id/, p);
  }
});

test('generated ids match the client pattern and are random', () => {
  const ids = new Set();
  for (let i = 0; i < 200; i++) {
    const id = genId();
    assert.match(id, ID.ITEM_ID);
    ids.add(id);
  }
  assert.equal(ids.size, 200);
});

test('keyed ids are deterministic per key and never equal the input', () => {
  const k1 = Buffer.alloc(32, 1), k2 = Buffer.alloc(32, 2);
  const loc = 'L'.repeat(43);
  assert.equal(keyedId(k1, 'accounts', loc), keyedId(k1, 'accounts', loc));
  assert.notEqual(keyedId(k1, 'accounts', loc), keyedId(k2, 'accounts', loc));
  assert.notEqual(keyedId(k1, 'accounts', loc), keyedId(k1, 'logins', loc));
  assert.notEqual(keyedId(k1, 'accounts', loc), loc);
});
