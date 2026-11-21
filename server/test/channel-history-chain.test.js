// Release 92 (page), private channel history: the key chain (SPEC.md 5.6 "Key chain", "Remove or ban"). The page harness is
// channel-history-kit.js; member cards and self-healing are channel-history-page.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, hkdfSync } from 'node:crypto';

import { pageFor, world, makeChannel, linkOf } from './channel-history-kit.js';

// ---- the key chain (SPEC.md 5.6 "Key chain", release 92 slice 2) ----

const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const rowOf = async (X, cid, e) => { const s = await X.S.db.doc('channels/' + cid + '/chain/' + e).get(); return s.exists ? s.data() : null; };
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const otherCid = (cid, n) => cid.slice(0, -1) + 'xyzw'[n];
// A key change as a page from before the chain made one: no row (the server takes it while the channel has none).
async function oldRotate(A, cid) {
  const c = await A.sync(cid), v = A.metaOf(await A.showMeta(c)), e = A.epochOf(c) + 1, raw = crypto.getRandomValues(new Uint8Array(32));
  await A.loadDir(v.members, true);
  await A.S.db.rotateChat(cid, { epoch: e, keys: await A.wrapAll(raw, v.members, cid, e), cap: await A.memberCapFrom(cid, e, raw), meta: await A.sealMeta(cid, e, raw, v) });
  A.ksPut(cid, e, A.b64(raw)); return e;
}
// A commit sealed under `raw` the page would not follow (mode `m`), with a real `b`.
async function modeRow(A, cid, e, raw, prev, m) {
  const r = await A.chainRow(cid, e, raw, prev), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { b: r.b, c: A.b64(await A.sealRaw(key, Buffer.from('hush-rot-v1|' + cid + '|' + e), Buffer.from(JSON.stringify({ f: 'alice', m, s: 'x' })))) };
}

test('7. a channel key change carries its chain row: b opens under the new key to the key before, c to a full commit signed over exactly hush-rot-v1|cid|e|H|full; going public to private too; once chained, a key change without a row is refused', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob']);
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    const back = A.spy.rotate[0].back, K0 = keyOf(A, cid, 0), K1 = keyOf(A, cid, 1);
    assert.deepEqual(Object.keys(back).sort(), ['b', 'c']);
    assert.equal((A.rolesOf(cid) || {}).ch, 1, 'seen chained: its own row went with it');
    assert.ok(sameKey(await A.openBack(cid, 1, K1, back.b), K0), 'b opens under the new key to the key before');
    assert.equal(await A.openBack(cid, 1, K0, back.b), null, 'and under no other key');
    assert.equal(await A.openBack(otherCid(cid, 0), 1, K1, back.b), null, 'nor as another channel\'s row');
    const o = await A.openCommit(cid, 1, K1, back.c);
    assert.deepEqual([o.f, o.m], ['alice', 'full']);
    assert.equal(await A.openCommit(cid, 1, K0, back.c), null);
    assert.equal(await A.openCommit(cid, 2, K1, back.c), null, 'bound to its epoch');
    const H = Buffer.from(hkdfSync('sha256', K1, 'hush-commit-v1', cid + '|1', 32)).toString('base64url');
    const pub = await crypto.subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: A.id.sig.x, y: A.id.sig.y }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const ok = (s) => crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, Buffer.from(o.s, 'base64'), Buffer.from(s));
    assert.equal(await ok(`hush-rot-v1|${cid}|1|${H}|full`), true, 'signed over exactly hush-rot-v1|cid|e|H|full');
    assert.equal(await ok(`hush-rot-v1|${cid}|1|${H}|fresh`), false);
    assert.deepEqual(await rowOf(A, cid, 1), back, 'the server keeps it as the row of epoch 1');

    // A page from before the chain (no row): refused with conflict once the channel is chained, and the epoch stays.
    const raw = randomBytes(32), v = A.metaOf(await A.shown(cid));
    await assert.rejects(A.S.db.rotateChat(cid, { epoch: 2, keys: await A.wrapAll(raw, v.members, cid, 2), cap: await A.memberCapFrom(cid, 2, raw), meta: await A.sealMeta(cid, 2, raw, v) }), (e) => e.code === 'conflict');
    assert.equal((await A.sync(cid)).epoch, 1);

    // Going private again chains from the public key (the record only: the server isn't asked here).
    const pc = otherCid(cid, 1), K = randomBytes(32), pubRec = { id: pc, type: 'channel', visibility: 'public', epoch: 0, openKeys: { 0: A.b64(K) }, keys: {} };
    let spec = null; const send = A.S.db.rotateChat; A.S.db.rotateChat = async (_c, s) => { spec = s; return { epoch: s.epoch }; };
    try { await A.rotateTo(pubRec, { members: ['alice'], admins: [], banned: [], owner: 'alice' }); } finally { A.S.db.rotateChat = send; }
    assert.ok(sameKey(await A.openBack(pc, 1, keyOf(A, pc, 1), spec.back.b), K), 'the public key is the row\'s key before');
  });
});

test('8. ensureChain backfills a row-less channel head first while it holds both keys, stops at a gap, replaces a row that doesn\'t open or names a wrong key (only when the held key opens the row below), and never writes a chained channel\'s head', async () => {
  await world({}, async (w) => {
    const { cid } = w; let A = await w.page('alice', { owner: true });
    await makeChannel(A, cid, ['alice']);
    for (let i = 0; i < 3; i++) await oldRotate(A, cid);
    const c = await A.sync(cid);
    assert.deepEqual(await Promise.all([0, 1, 2, 3].map((e) => rowOf(A, cid, e))), [null, null, null, null], 'a channel from before the chain');
    assert.equal(await A.ensureChain(c), true);
    assert.deepEqual(A.spy.chain, [3, 2, 1, 0], 'head first, down to epoch 0');
    for (let e = 0; e <= 3; e++) {
      const r = await rowOf(A, cid, e), o = await A.openCommit(cid, e, keyOf(A, cid, e), r.c);
      assert.deepEqual([o.f, o.m], ['alice', 'full'], 'row ' + e);
      if (e) assert.ok(sameKey(await A.openBack(cid, e, keyOf(A, cid, e), r.b), keyOf(A, cid, e - 1)), 'row ' + e + ' opens to the key before');
      else assert.deepEqual(Object.keys(r), ['c']);
    }
    assert.equal((A.rolesOf(cid) || {}).ch, 1, 'seen chained from here on: the rows it wrote');
    assert.equal(await A.ensureChain(c), true); assert.equal(A.spy.chain.length, 4, 'once per load');

    // A row whose commit doesn't open under the trusted key is written again.
    const K = (e) => keyOf(A, cid, e), junk = randomBytes(32);
    const bad1 = await A.chainRow(cid, 1, junk, K(0)); await A.S.db.chain(cid, 1, bad1.b, bad1.c);
    A = await w.reload(A);
    assert.equal(await A.ensureChain(await A.sync(cid)), true);
    assert.deepEqual(A.spy.chain, [1]);
    assert.ok(await A.openCommit(cid, 1, K(1), (await rowOf(A, cid, 1)).c), 'row 1 opens again');
    assert.equal(A.rolesOf(cid).ch, 1, 'seen chained');

    // A row naming a wrong key before it is replaced, since the key held opens the row below.
    const bad2 = await A.chainRow(cid, 2, K(2), junk); await A.S.db.chain(cid, 2, bad2.b, bad2.c);
    A = await w.reload(A);
    assert.equal(await A.ensureChain(await A.sync(cid)), true);
    assert.deepEqual(A.spy.chain, [2]);
    assert.ok(sameKey(await A.openBack(cid, 2, K(2), (await rowOf(A, cid, 2)).b), K(1)));

    // An admin device handed a junk key for epoch 1 leaves row 2 alone: the junk key doesn't open row 1.
    const real1 = A.ksGet(cid, 1); A.ksPut(cid, 1, A.b64(junk));
    A = await w.reload(A);
    assert.equal(await A.ensureChain(await A.sync(cid)), false);
    assert.deepEqual(A.spy.chain, [], 'nothing written');
    assert.ok(sameKey(await A.openBack(cid, 2, K(2), (await rowOf(A, cid, 2)).b), A.unb64(real1)), 'row 2 still names the real key');
    A.ksPut(cid, 1, real1);

    // A chained channel's head is never written: a record at the next epoch with a key K' and no row, then a current row
    // that doesn't open under the key this device was given for it.
    const rec = await A.sync(cid), Kx = randomBytes(32);
    A = await w.reload(A);
    assert.equal(await A.ensureChain({ ...rec, epoch: 4, keys: { ...rec.keys, 4: await A.wrapAll(Kx, ['alice'], cid, 4) } }), false);
    assert.deepEqual(A.spy.chain, []);
    const real3 = A.ksGet(cid, 3); A.ksPut(cid, 3, A.b64(Kx));
    A = await w.reload(A);
    assert.equal(await A.ensureChain(await A.sync(cid)), false);
    assert.deepEqual(A.spy.chain, [], 'its head is written only by a key change');
    A.ksPut(cid, 3, real3);

    // Nor a first backfill when the server answers every row missing to a device that saw them: from K' at the planted
    // epoch it would seal the real key of epoch 3 under K', and every key below under the one above.
    A = await w.reload(A); await A.sync(cid);
    A.S.db.mgetChat = async (_c, ps) => ps.map((p) => ({ id: p.split('/').pop(), exists: false, data: () => undefined }));
    assert.equal(await A.ensureChain({ ...rec, epoch: 4, keys: { ...rec.keys, 4: await A.wrapAll(Kx, ['alice'], cid, 4) } }), false);
    assert.deepEqual(A.spy.chain, [], 'no row written');

    // A gap: on another channel with no rows, this device lacks the key of epoch 1. Row 3 goes; row 2 would need that key,
    // and the key of epoch 0 is out of the chain's reach, so a link would still carry every key (false).
    const g = otherCid(cid, 2);
    await makeChannel(A, g, ['alice']);
    for (let i = 0; i < 3; i++) await oldRotate(A, g);
    const gr = await A.sync(g), gm = A.ls.get('hush:ks:alice', {}); delete gm[g][1]; A.ls.set('hush:ks:alice', gm);
    A = await w.reload(A);
    assert.equal(await A.ensureChain({ ...gr, keys: { ...gr.keys, 1: {} } }), false);
    assert.deepEqual(A.spy.chain, [3], 'only the rows both keys are held for');
    assert.deepEqual([!!(await rowOf(A, g, 3)), await rowOf(A, g, 2)], [true, null]);
  });
});

test('8a. ensureChain writes nothing from a copy one key change behind the record, nor when a key change lands while it reads the rows: the head would be left missing above them; the next open backfills from the record as it is', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), M = await w.page('mona');
    await makeChannel(A, cid, ['alice', 'xena', 'mona'], ['xena']);   // a channel from before the chain: no rows
    await oldRotate(A, cid); await oldRotate(A, cid);
    const stale = await X.sync(cid); await X.shown(cid);              // Xena's page holds the record at epoch 2
    await oldRotate(A, cid);                                          // a release-90 tab's key change: epoch 3, no row, not seen yet
    X.S.chatDocs.set(cid, stale);
    assert.equal(await X.ensureChain(stale), false);
    assert.deepEqual(X.spy.chain, [], 'no row written from the old copy');
    assert.deepEqual(await Promise.all([0, 1, 2, 3].map((e) => rowOf(A, cid, e))), [null, null, null, null], 'the channel is still unchained');
    const f = await M.sync(cid); await M.shown(cid);
    assert.ok(await M.sealKey(f, 3), 'a subscriber still takes the current key');
    // The next open, from the record as it is: head first, down to epoch 0, and the subscriber's check passes on it.
    assert.equal(await X.ensureChain(await X.sync(cid)), true);
    assert.deepEqual(X.spy.chain, [3, 2, 1, 0]);
    const M2 = await w.reload(M), f2 = await M2.sync(cid); await M2.shown(cid);
    assert.ok(await M2.sealKey(f2, 3), 'the head row Xena wrote checks out');

    // A key change that lands after the rows were read, before anything is written.
    const g = otherCid(cid, 1);
    await makeChannel(A, g, ['alice', 'xena', 'mona'], ['xena']); await oldRotate(A, g);
    const cur = await X.sync(g); await X.shown(g); X.spy.chain.length = 0;
    const read = X.S.db.mgetChat; let once = 1;
    X.S.db.mgetChat = async (...a) => { const r = await read(...a); if (once && a[0] === g) { once = 0; await oldRotate(A, g); } return r; };
    assert.equal(await X.ensureChain(cur), false);
    X.S.db.mgetChat = read;
    assert.deepEqual(X.spy.chain, [], 'nothing written');
    assert.deepEqual(await Promise.all([0, 1, 2].map((e) => rowOf(A, g, e))), [null, null, null]);
    assert.equal(await X.ensureChain(await X.sync(g)), true);
    assert.deepEqual(X.spy.chain, [2, 1, 0], 'the next open writes the head first');
  });
});

test('8b. a key change from a page before the chain (a release-90 tab\'s, no row) landing after the first backfill read the record again, before its first row: the server refuses that row with conflict, so no row sits below a missing head, the channel stays unchained and a subscriber still takes the current key; the next open backfills from the head', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), M = await w.page('mona');
    await makeChannel(A, cid, ['alice', 'bob', 'mona'], ['bob']);   // a channel from before the chain: no rows
    const send = A.S.db.chain; let got = 'written';
    A.S.db.chain = async (...a) => { A.S.db.chain = send; await oldRotate(B, cid); await A.S.db.refreshChat(cid);   // Bob's tab, then Alice's page opens the chat again, as on the eviction
      return send(...a).catch((e) => { got = e.code; throw e; }); };
    const ok = await A.ensureChain(await A.sync(cid)), seal = await M.sealKey(await M.sync(cid), 1).then(Boolean, (e) => e.message);
    assert.deepEqual({ ok, got, rows: [!!(await rowOf(A, cid, 0)), !!(await rowOf(A, cid, 1))], seal }, { ok: false, got: 'conflict', rows: [false, false], seal: true }, 'the row of epoch 0 refused: no row below the missing head of epoch 1, and Mona seals under it');
    A.spy.chain.length = 0;
    assert.equal(await A.ensureChain(await A.sync(cid)), true, 'the next open, from the record as it is');
    assert.deepEqual(A.spy.chain, [1, 0], 'head first');
    const M2 = await w.reload(M), f = await M2.sync(cid); await M2.shown(cid);
    assert.ok(await M2.sealKey(f, 1), 'the head row Alice wrote checks out');
  });
});

test('9. a newcomer holding only the current key walks the chain back to epoch 0, 300 rows a read; a key held for another epoch, one that disagrees, a missing row, a row not marked full, a connection without the chat (or one that loses it) and a refused read each stop it', async () => {
  const A = await pageFor(null, 'alice'), cid = 'cWalkTest0001', N = 310;
  const keys = Array.from({ length: N + 1 }, () => randomBytes(32)), rows = {};
  for (let e = 0; e <= N; e++) rows[e] = await A.chainRow(cid, e, keys[e], e ? keys[e - 1] : null);
  // The reader's page: its own store, the current key only, and a connection that serves the rows (or holds no level).
  const reader = async (rs, held = {}, level = 'member') => {
    const P = await pageFor(null, 'nick'), calls = [];
    P.S.db = { chatLevel: () => level, mgetChat: async (_c, ps) => { calls.push(ps.length); return ps.map((p) => { const e = Number(p.split('/').pop()), d = rs[e]; return { id: String(e), exists: !!d, data: () => d }; }); } };
    for (const [e, k] of Object.entries({ [N]: keys[N], ...held })) P.ksPut(cid, e, P.b64(k));
    return { P, calls };
  };
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']), j = await crypto.subtle.exportKey('jwk', eph.publicKey);
  const c = { id: cid, type: 'channel', visibility: 'private', epoch: N, keys: { 0: { L1: { epk: { x: j.x, y: j.y }, iv: randomBytes(12).toString('base64'), ct: randomBytes(48).toString('base64') } } } };
  let { P, calls } = await reader(rows);
  const k0 = await P.convKey(c, 0);   // epoch 0 has wraps, none of them this reader's
  assert.ok(k0 && sameKey(k0.raw, keys[0]), 'epoch 0 reached');
  assert.deepEqual(calls, [300, 11], 'one read per 300 rows');
  for (const e of [1, 150, 309]) assert.equal(P.ksGet(cid, e), P.b64(keys[e]), 'every key on the way is kept');
  assert.equal(P.rolesOf(cid).ch, 1, 'seen chained');
  assert.ok(sameKey((await P.convKey(c, 77)).raw, keys[77]));
  assert.deepEqual(calls, [300, 11], 'nothing read again');

  // Row 250 opens, but to a key this reader holds for epoch 0 (a replay): broken, nothing more is kept, no walk again.
  ({ P, calls } = await reader({ ...rows, 250: await A.chainRow(cid, 250, keys[250], keys[0]) }, { 0: keys[0] }));
  const c2 = { ...c, keys: {} };
  assert.equal(await P.convKey(c2, 100), null);
  assert.ok(P.walkBad.has(cid));
  assert.deepEqual([P.ksGet(cid, 250), P.ksGet(cid, 249)], [P.b64(keys[250]), null], 'the keys above it stay, none from it');
  assert.equal(await P.convKey(c2, 120), null); assert.equal(calls.length, 1, 'no walk once broken');

  // Row 100's key before differs from the key this reader holds for epoch 99.
  ({ P, calls } = await reader(rows, { 99: randomBytes(32) }));
  assert.ok(await P.convKey(c2, 100), 'epoch 100 itself is reached');
  assert.ok(P.walkBad.has(cid), 'and the disagreement below it is caught');

  // A missing row ends the walk there; the posts below don't read the rows again for a while.
  const gap = { ...rows }; delete gap[100];
  ({ P, calls } = await reader(gap));
  assert.equal(await P.convKey(c2, 0), null);
  assert.deepEqual([P.ksGet(cid, 100), P.ksGet(cid, 99)], [P.b64(keys[100]), null]);
  assert.ok(!P.walkBad.has(cid), 'a gap is not a broken history');
  assert.ok(P.walkWait.get(cid) > Date.now());
  assert.equal(await P.convKey(c2, 50), null); assert.equal(calls.length, 2, 'no second read inside the wait');

  // A row not marked full (a later release's mode) is not followed.
  ({ P, calls } = await reader({ ...rows, 200: await modeRow(A, cid, 200, keys[200], keys[199], 'fresh') }));
  assert.equal(await P.convKey(c2, 0), null);
  assert.deepEqual([P.ksGet(cid, 200), P.ksGet(cid, 199)], [P.b64(keys[200]), null]);

  // The chat lost while a walk runs (an eviction, a dropped connection): it reads nothing more, since a read would open
  // the chat again, maybe from inside opening it, and wait on itself.
  ({ P, calls } = await reader(rows));
  let level = 'member'; const read = P.S.db.mgetChat; P.S.db.chatLevel = () => level;
  P.S.db.mgetChat = async (x, ps) => { const r = await read(x, ps); level = null; return r; };
  assert.equal(await P.convKey(c2, 0), null);
  assert.deepEqual(calls, [300], 'no second read');
  // Nor does a caller queued behind a walk walk on once the chat is gone.
  ({ P, calls } = await reader(rows));
  let lvl = 'member', go; const gate = new Promise((r) => { go = r; }), read2 = P.S.db.mgetChat; P.S.db.chatLevel = () => lvl;
  P.S.db.mgetChat = async (x, ps) => { await gate; return read2(x, ps); };
  const first = P.convKey(c2, 305), queued = P.convKey(c2, 100);
  lvl = null; go();
  assert.ok(await first, 'the walk in flight ends as before');
  assert.equal(await queued, null);
  assert.deepEqual(calls, [6], 'the queued caller reads nothing');
  // A refused read (denied) stops the walk for a while too.
  ({ P, calls } = await reader(rows));
  let deny = 1; const read3 = P.S.db.mgetChat;
  P.S.db.mgetChat = async (x, ps) => { if (deny-- > 0) { calls.push('denied'); throw Object.assign(new Error('denied'), { code: 'denied' }); } return read3(x, ps); };
  assert.equal(await P.convKey(c2, 0), null);
  assert.ok(P.walkWait.get(cid) > Date.now());
  assert.equal(await P.convKey(c2, 5), null); assert.deepEqual(calls, ['denied'], 'no read again inside the wait');

  // No walk before the connection holds the chat, nor in a public channel.
  ({ P, calls } = await reader(rows, {}, null));
  assert.equal(await P.convKey(c2, 0), null);
  assert.equal(await P.convKey({ ...c2, visibility: 'public' }, 0), null);
  assert.deepEqual(calls, []);
});

test('10. a removal in a channel: a second conflict, or one at the same epoch from a device without the key before, fails and lifts the block, with no lists-only write; toolarge keeps the block and writes the lists only, stopping every open link in the same write', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), Y = await w.page('yuri'); await w.page('dave');
    await makeChannel(A, cid, ['alice', 'yuri', 'dave'], ['yuri']);
    await A.sync(cid);                                          // A's page holds the record at epoch 0
    await Y.sync(cid); await Y.rotateTo(Y.S.chatDocs.get(cid), Y.metaOf(await Y.shown(cid)));   // another admin's key change, Dave still listed
    A.spy.failRotate = [null, 'conflict'];                      // A's first try loses that race for real; its try from the fresh record is refused too
    await assert.rejects(A.kickMember(cid, 'dave'), (e) => e.code === 'conflict');
    assert.equal(A.spy.rotate.length, 2, 'tried from the fresh record once');
    assert.deepEqual(A.spy.ban, [['dave', true], ['dave', false]], 'the block is lifted: the server and the lists agree');
    assert.deepEqual(A.spy.updates, [], 'no lists-only write');
    let m = await A.meta(cid);
    assert.deepEqual([m.members, m.banned, (await A.sync(cid)).epoch], [['alice', 'yuri', 'dave'], [], 1]);

    // A first conflict that leaves the epoch where it was (a chained channel refusing a key change that came with no row,
    // from a device without the key before): no lists-only way for it in a channel either, so the removal fails and the
    // block is lifted.
    A.spy.rotate.length = 0; A.spy.ban.length = 0; A.spy.failRotate = ['conflict'];
    await assert.rejects(A.kickMember(cid, 'dave'), (e) => e.code === 'conflict');
    assert.equal(A.spy.rotate.length, 1, 'none again at the same epoch');
    assert.deepEqual(A.spy.ban, [['dave', true], ['dave', false]], 'the block is lifted');
    assert.deepEqual(A.spy.updates, [], 'no lists-only write');
    assert.equal((await A.sync(cid)).epoch, 1);

    // No room for a key change: the block stays, the lists leave Dave out (choice 29), and every open link stops in the same
    // write, as the key change would have stopped it (the block's confirm and toast say so).
    const E = await w.page('eve'), l = await linkOf(A, cid);
    assert.equal(Object.keys((await A.sync(cid)).invites || {}).length, 1, 'a link is open');
    assert.equal(A.ls.get('hush:inv:' + cid, null).iid, l.iid, 'and this page shows it');
    assert.equal(Object.keys(await E.inviteRaws(cid, l)).length, 1, 'its holder reads the current key through it');
    A.spy.failRotate = ['toolarge']; A.spy.ban.length = 0; A.spy.updates.length = 0;
    assert.equal(await A.kickMember(cid, 'dave'), undefined);
    assert.deepEqual(A.spy.ban, [['dave', true]], 'the block stays');
    assert.deepEqual(A.spy.updates, [['meta', 'invites']], 'the lists and the links, in one write, no key');
    m = await A.meta(cid);
    assert.deepEqual([m.members, m.banned, (await A.sync(cid)).epoch], [['alice', 'yuri'], ['dave'], 1]);
    assert.deepEqual(Object.keys((await A.sync(cid)).invites || {}), [], 'no open link left');
    assert.equal(A.ls.get('hush:inv:' + cid, null), null, 'nor one this page shows');
    await assert.rejects(E.inviteRaws(cid, l), (e) => e.code === 'notfound', 'the link holder reads no key');
  });
});

test('11. a new channel has its key-chain row 0 right after it is made, and its first key change chains on', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    await A.createChatDoc(cid, 'channel', 'private', { name: 'New', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice'], banned: [] });
    assert.deepEqual(A.spy.chain, [0]);
    assert.equal((A.rolesOf(cid) || {}).ch, 1, 'seen chained from birth');
    const r = await rowOf(A, cid, 0);
    assert.deepEqual(Object.keys(r), ['c']);
    const o = await A.openCommit(cid, 0, keyOf(A, cid, 0), r.c);
    assert.deepEqual([o.f, o.m], ['alice', 'full']);
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    assert.ok(sameKey(await A.openBack(cid, 1, keyOf(A, cid, 1), (await rowOf(A, cid, 1)).b), keyOf(A, cid, 0)));
  });
});

// Owner decision D1 (release 93a, the server half): a channel whose current key every page refuses (here its head's commit is
// replaced by one signed by someone neither owner nor admin; a stale admin secret's junk key change ends the same way) is repaired
// by the owner with a fresh key wrapped to the list she confirms, its row her signed commit alone, no `b`, so the refused key is
// chained to nothing. The page's Repair action is release 93b; here the release-92 code meets such a row.
test('140. the owner\'s repair of a channel every page refuses: her key change whose row holds only her signed commit, no "b", is taken from her owner-level connection; a member\'s release-92 page seals at the repaired epoch and his older keys still open; her backfill and a newcomer\'s walk stop at the repair row without calling the history broken, a link still carries every key she holds, and the next key change chains on from it', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), Z = await w.page('zed'), O = await w.page('olga');
    await makeChannel(A, cid, ['alice', 'bob']);
    await A.shown(cid); await A.rolesQ.get(cid); await B.shown(cid); await B.rolesQ.get(cid);
    const all = { name: 'History', owner: 'alice', admins: [], members: ['alice', 'bob'], banned: [] };
    await A.rotateTo(await A.sync(cid), all);   // epoch 1, row 1
    assert.equal(await A.ensureChain(await A.sync(cid)), true, 'row 0 backfilled: chained');
    await A.rotateTo(await A.sync(cid), all);   // epoch 2, row 2
    const bad = await Z.chainRow(cid, 2, keyOf(A, cid, 2), keyOf(A, cid, 1));
    await A.S.db.chain(cid, 2, bad.b, bad.c);   // the planted head (written here by her connection, standing in for whoever planted it)
    await assert.rejects(B.sealKey(await B.sync(cid), 2), /badkey/, 'frozen on Bob\'s page');
    const A2 = await w.reload(A); await A2.shown(cid); await A2.rolesQ.get(cid);
    await assert.rejects(A2.sealKey(await A2.sync(cid), 2), /badkey/, 'and on her own page, reloaded');
    // the repair: a fresh key for the list she confirms, its row her signed commit alone
    await A2.loadDir(all.members, true);
    const raw = crypto.getRandomValues(new Uint8Array(32)), back = await A2.chainRow(cid, 3, raw, null);
    assert.deepEqual(Object.keys(back), ['c']);
    const got = await A2.S.db.rotateChat(cid, { epoch: 3, keys: await A2.wrapAll(raw, all.members, cid, 3), cap: await A2.memberCapFrom(cid, 3, raw), meta: await A2.sealMeta(cid, 3, raw, all), back })
      .then(() => 'taken', (e) => e.code + ': ' + e.message);
    assert.equal(got, 'taken', 'the server takes her repair row from her owner-level connection');
    A2.ksPut(cid, 3, A2.b64(raw)); A2.keyMade(cid, 3, raw);
    assert.deepEqual(await rowOf(A2, cid, 3), back);
    // Bob's release-92 page, unchanged: the repaired head checks out, he posts under it, and his older keys still open
    const c3 = await B.sync(cid);
    assert.equal(B.epochOf(c3), 3);
    assert.ok(await B.sealKey(c3, 3), 'the repaired head passes the release-92 check');
    assert.equal((await B.sealPost(c3, 'after the repair')).e, 3);
    for (const e of [0, 1, 2]) assert.ok(await B.convKey(c3, e), 'his key of epoch ' + e + ' still opens');
    assert.equal(c3.meta, undefined, 'his copy holds no member list: the owner\'s and the admins\' alone (channel-members.test.js)');
    assert.ok((await A2.meta(cid)).members.includes('bob'), 'the list she sealed at the repair names him');
    // her backfill stops at the repair row and writes nothing; so her link hands on every key she holds
    A2.spy.chain.length = 0;
    assert.equal(await A2.ensureChain(await A2.sync(cid)), false);
    assert.deepEqual([A2.spy.chain, A2.walkBad.has(cid)], [[], false], 'nothing written, the history not called broken');
    const raws = await (await w.page('nina')).inviteRaws(cid, await linkOf(A2, cid));
    assert.deepEqual(Object.keys(raws).sort(), ['0', '1', '2', '3'], 'a link\'s joiner gets the keys from before the repair too');
    // the next ordinary key change chains on from the repair row; a newcomer wrapped only there walks back to it and stops there
    await A2.rotateTo(await A2.sync(cid), { ...all, members: [...all.members, 'olga'] });
    const c4 = await B.sync(cid);
    assert.equal(B.epochOf(c4), 4);
    assert.ok(await B.sealKey(c4, 4), 'Bob takes the next key too');
    const o4 = await O.sync(cid);
    const k3 = await O.convKey(o4, 3);
    assert.ok(k3 && sameKey(k3.raw, raw), 'row 4 gives Olga the repaired key');
    assert.equal(await O.convKey(o4, 2), null, 'the repair row gives no key before it');
    assert.equal(O.walkBad.has(cid), false, 'and her page does not call the history broken');
  });
});
