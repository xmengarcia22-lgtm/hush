// Release 92 (page), private channel history: the key chain's backfill trusts no key the server feeds it in openKeys or a
// row of its own (SPEC.md 5.6 "Key chain"; a wrap it swaps in is the known gap, SECURITY.md). ensureChain seals a row only
// under the verified head, a key the chain gave or (below every row) one it holds, puts in `b` only a key this device holds
// itself that matches the chain (never the record's openKeys alone), writes a missing row only below every row, replaces a
// present one only when the row below it is signed by the owner or an admin on record (never at first sight; row 0, which
// holds no key, again under the key the chain gave), and stops at a public epoch. A private
// channel's openKeys come last in convKey; setAdmins' re-signed head takes its key before from the store alone. The page
// harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { pageFor, world, makeChannel } from './channel-history-kit.js';

const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const rowOf = async (X, cid, e) => { const s = await X.S.db.doc('channels/' + cid + '/chain/' + e).get(); return s.exists ? s.data() : null; };
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const cidOf = (cid, n) => cid.slice(0, -1) + 'abcdefghij'[n];
const rowsOf = (X, cid, n) => Promise.all(Array.from({ length: n + 1 }, (_, e) => rowOf(X, cid, e)));
// The real keys a server holding only `known` opens from the rows it stores: each row's b under any key it has, again and again.
async function leaked(X, cid, n, known, real) {
  const got = [...known];
  for (let more = true; more;) { more = false;
    for (let e = 1; e <= n; e++) { const r = await rowOf(X, cid, e); if (!r || !r.b) continue;
      for (const k of got) { const p = await X.openBack(cid, e, k, r.b); if (p && !got.some((g) => sameKey(g, p))) { got.push(p); more = true; } } } }
  return real.map((k, e) => (got.some((g) => sameKey(g, k)) && !known.some((g) => sameKey(g, k)) ? e : -1)).filter((e) => e >= 0);
}
// A fully chained channel at epoch n, with Bob subscribed: the owner's key changes write rows 1..n, her backfill row 0. Its keys.
async function chained(A, cid, n) {
  await makeChannel(A, cid, ['alice', 'bob']);
  for (let i = 0; i < n; i++) await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
  assert.equal(await A.ensureChain(await A.sync(cid)), true);
  for (let e = 0; e <= n; e++) assert.ok(await rowOf(A, cid, e), 'row ' + e);
  return Array.from({ length: n + 1 }, (_, e) => keyOf(A, cid, e));
}
// A key change as a page from before the chain made one: no row.
async function oldRotate(A, cid) {
  const c = await A.sync(cid), v = A.metaOf(await A.showMeta(c)), e = A.epochOf(c) + 1, raw = crypto.getRandomValues(new Uint8Array(32));
  await A.loadDir(v.members, true);
  await A.S.db.rotateChat(cid, { epoch: e, keys: await A.wrapAll(raw, v.members, cid, e), cap: await A.memberCapFrom(cid, e, raw), meta: await A.sealMeta(cid, e, raw, v) });
  A.ksPut(cid, e, A.b64(raw)); return e;
}
const hide = (X, e) => { const mg = X.S.db.mgetChat; X.S.db.mgetChat = async (c, ps) => (await mg(c, ps)).map((d, i) => (ps[i].endsWith('/chain/' + e) ? { id: String(e), exists: false, data: () => undefined } : d)); };
const serve = (X, e, row) => { const mg = X.S.db.mgetChat; X.S.db.mgetChat = async (c, ps) => (await mg(c, ps)).map((d, i) => (ps[i].endsWith('/chain/' + e) ? { id: String(e), exists: true, data: () => row } : d)); };
// A row under `raw` whose commit opens and says full, signed by nobody, with a b that opens to nothing.
async function forged(X, cid, e, raw) {
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { b: X.b64(await X.sealRaw(key, Buffer.from('junk'), randomBytes(32))), c: X.b64(await X.sealRaw(key, Buffer.from('hush-rot-v1|' + cid + '|' + e), Buffer.from(JSON.stringify({ f: 'mallory', m: 'full', s: 'x' })))) };
}

test('27. a record that plants a key of its own at an older epoch (openKeys) of a chained channel the owner\'s page has seen, with the row above it hidden, or a row of its own at that epoch, makes that page write nothing: no row is overwritten and the server opens no real key from its own', async () => {
  await world({}, async (w) => {
    let A = await w.page('alice', { owner: true }); await w.page('bob');
    const cases = [['row above hidden', 2, 'hide'], ['a row of its own', 2, 'fake'], ['under the head', 4, 'hide'], ['two below', 3, 'hide'], ['near the bottom', 1, 'hide']];
    for (const [i, [name, x, how]] of cases.entries()) {
      const cid = cidOf(w.cid, i), real = await chained(A, cid, 5), before = await rowsOf(A, cid, 5);
      A = await w.reload(A); assert.equal((A.rolesOf(cid) || {}).ch, 1, name + ': seen chained');
      const rec = await A.sync(cid), J = randomBytes(32);
      if (how === 'hide') hide(A, x + 1); else serve(A, x, await forged(A, cid, x, J));
      assert.equal(await A.ensureChain({ ...rec, openKeys: { [x]: A.b64(J) } }), false, name);
      assert.deepEqual(A.spy.chain, [], name + ': nothing written');
      assert.deepEqual(await rowsOf(A, cid, 5), before, name + ': every row as it was');
      assert.deepEqual(await leaked(A, cid, 5, [J], real), [], name + ': no real key opens from J');
      A = await w.reload(A);   // a connection that serves every row again
    }
  });
});

test('28. a forged row is never replaced into: a key this device was handed for an older epoch (a planted wrap, say), with a row under it whose commit opens and says full but is signed by nobody, or by a subscriber (also on a device with no owner on record yet, where first sight lets that commit pass the head\'s check), leaves the good row above alone, writes nothing, and the server opens no real key; nor is a row not marked full replaced, nor the head', async () => {
  await world({}, async (w) => {
    let A = await w.page('alice', { owner: true }); const B = await w.page('bob');
    for (const [i, who] of ['nobody', 'a subscriber', 'no owner on record', 'not full', 'the head'].entries()) {
      const cid = cidOf(w.cid, i), real = await chained(A, cid, 5), junk = randomBytes(32);
      if (who === 'nobody' || who === 'a subscriber' || who === 'no owner on record') {
        const row = who === 'nobody' ? await forged(A, cid, 2, junk) : await B.chainRow(cid, 2, junk, randomBytes(32));
        assert.equal((await A.openCommit(cid, 2, junk, row.c)).f, who === 'nobody' ? 'mallory' : 'bob', who + ': Bob is no admin');
        await A.S.db.chain(cid, 2, row.b, row.c); A.ksPut(cid, 2, A.b64(junk));
      } else if (who === 'not full') {   // a later release's row under the real key; the row below opens under the key held and is the owner's
        const r = await A.chainRow(cid, 2, real[2], real[1]), key = await crypto.subtle.importKey('raw', real[2], 'AES-GCM', false, ['encrypt']);
        await A.S.db.chain(cid, 2, r.b, A.b64(await A.sealRaw(key, Buffer.from('hush-rot-v1|' + cid + '|2'), Buffer.from(JSON.stringify({ f: 'alice', m: 'fresh', s: 'x' })))));
      } else { const r = await A.chainRow(cid, 5, real[5], junk); await A.S.db.chain(cid, 5, r.b, r.c); }   // the owner's own head, naming a wrong key before
      const before = await rowsOf(A, cid, 5);
      A = await w.reload(A);
      const rec = await A.sync(cid);
      if (who === 'no owner on record') {   // an owner's or admin's device that never read the ometa (a new one, or its read failed): its record of the roles holds only `ch`
        const m = A.ls.get('hush:roles:alice', {}); m[cid] = { ch: 1 }; A.ls.set('hush:roles:alice', m);
        assert.ok(await A.sealKey({ ...rec, epoch: 2 }, 2), 'first sight: Bob\'s commit passes the check a head gets (as when epoch 2 was current), and that pass is kept');
      }
      assert.equal(await A.ensureChain(rec), false, who);
      assert.deepEqual(A.spy.chain, [], who + ': nothing written');
      assert.deepEqual(await rowsOf(A, cid, 5), before, who + ': every row as it was');
      assert.deepEqual(await leaked(A, cid, 5, [junk], real), [], who + ': no real key opens from the planted one');
    }
  });
});

test('29. a channel from before the chain (no rows) still backfills from the keys held, head first; a record that plants openKeys there, at an epoch this device holds a key for or one it lacks, gets no row sealed under its key and its key in no row', async () => {
  await world({}, async (w) => {
    const pre = async (A, cid) => { await makeChannel(A, cid, ['alice']); for (let i = 0; i < 3; i++) await oldRotate(A, cid); return A.sync(cid); };
    let A = await w.page('alice', { owner: true });
    const c0 = cidOf(w.cid, 0), r0 = await pre(A, c0), real0 = [0, 1, 2, 3].map((e) => keyOf(A, c0, e));
    assert.equal(await A.ensureChain(r0), true);
    assert.deepEqual(A.spy.chain, [3, 2, 1, 0], 'head first, down to epoch 0');
    for (let e = 1; e <= 3; e++) assert.ok(sameKey(await A.openBack(c0, e, real0[e], (await rowOf(A, c0, e)).b), real0[e - 1]), 'row ' + e);

    // openKeys at epoch 1, a key this device holds: rows 3 and 2 from the keys held, then the backfill stops at the planted epoch.
    const c1 = cidOf(w.cid, 1), r1 = await pre(A, c1), real1 = [0, 1, 2, 3].map((e) => keyOf(A, c1, e)), J = randomBytes(32);
    A.spy.chain.length = 0;
    assert.equal(await A.ensureChain({ ...r1, openKeys: { 1: A.b64(J) } }), false);
    assert.deepEqual(A.spy.chain, [3, 2]);
    assert.ok(sameKey(await A.openBack(c1, 2, real1[2], (await rowOf(A, c1, 2)).b), real1[1]), 'row 2 names the key held, not the planted one');
    assert.deepEqual([await rowOf(A, c1, 1), await rowOf(A, c1, 0)], [null, null]);
    assert.deepEqual(await leaked(A, c1, 3, [J], real1), []);

    // openKeys at epoch 1, a key this device lacks (none stored, no wrap of its own): row 3 alone; J goes in no row.
    const c2 = cidOf(w.cid, 2), r2 = await pre(A, c2), real2 = [0, 1, 2, 3].map((e) => keyOf(A, c2, e));
    const m = A.ls.get('hush:ks:alice', {}); delete m[c2][1]; A.ls.set('hush:ks:alice', m);
    A = await w.reload(A); await A.sync(c2);
    assert.equal(await A.ensureChain({ ...r2, keys: { ...r2.keys, 1: {} }, openKeys: { 1: A.b64(J) } }), false);
    assert.deepEqual(A.spy.chain, [3], 'only the row both keys are held for');
    assert.equal(await A.openBack(c2, 3, real2[3], (await rowOf(A, c2, 3)).b).then((k) => sameKey(k, real2[2])), true);
    assert.deepEqual(await leaked(A, c2, 3, [J], real2), []);
  });
});

test('30. a channel made public, then private again: the backfill stops at the public epochs and writes no row under a published key, also where a key below them was never published; the private rows above stay as they are', async () => {
  await world({}, async (w) => {
    let A = await w.page('alice', { owner: true });
    for (const [i, part] of ['every key published', 'epoch 0\'s key never published'].entries()) {
      const cid = cidOf(w.cid, i); await makeChannel(A, cid, ['alice']); await oldRotate(A, cid);   // epochs 0 and 1, from before the chain
      const real = [0, 1].map((e) => keyOf(A, cid, e));
      await A.sync(cid); await A.setVisibility(cid, 'public');
      if (i) await A.S.db.doc('channels/' + cid).update({ openKeys: { 0: null } });   // a device that lacked it published the rest
      const pub = await A.sync(cid); assert.deepEqual(Object.keys(pub.openKeys).sort(), i ? ['1'] : ['0', '1'], part);
      await A.setVisibility(cid, 'private');                                          // epoch 2, its row naming the public key of epoch 1
      await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));             // epoch 3
      const before = await rowsOf(A, cid, 3);
      assert.deepEqual(before.map(Boolean), [false, false, true, true], part + ': rows 2 and 3 only');
      A = await w.reload(A);
      assert.equal(await A.ensureChain(await A.sync(cid)), false, part);
      assert.deepEqual(A.spy.chain, [], part + ': nothing written');
      assert.deepEqual(await rowsOf(A, cid, 3), before, part);
      assert.deepEqual(await leaked(A, cid, 3, Object.values(pub.openKeys).map((k) => A.unb64(k)), real), [], part + ': the server opens no key it wasn\'t given');
    }
  });
});

test('31. in a private channel a key this device holds, stored or in a wrap of its own, wins over the record\'s openKeys; openKeys only for an epoch it holds none for; a public channel\'s openKeys still come first', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob']);
    for (let i = 0; i < 2; i++) await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    const rec = await A.sync(cid), real = keyOf(A, cid, 1), J = randomBytes(32), planted = { ...rec, openKeys: { 1: A.b64(J) } };
    assert.ok(sameKey((await A.convKey(planted, 1)).raw, real), 'stored');
    assert.ok(sameKey((await A.convKey({ ...planted, keys: {} }, 1)).raw, real), 'stored, with no wrap in the record');
    assert.equal(B.ksGet(cid, 1), null);
    assert.ok(sameKey((await B.convKey(planted, 1)).raw, real), 'a wrap of Bob\'s own, opened for the first time');
    const N = await pageFor(null, 'nina');   // wraps at epoch 1, none of them hers
    assert.ok(sameKey((await N.convKey(planted, 1)).raw, J), 'a key held by nobody here: openKeys');
    assert.ok(sameKey((await N.convKey({ ...planted, keys: {} }, 1)).raw, J), 'no wraps at all: openKeys');
    assert.ok(sameKey((await A.convKey({ ...planted, visibility: 'public' }, 1)).raw, J), 'a public channel: openKeys first');
  });
});

test('32. dropping an admin re-signs the head with the key before from this device\'s store alone: never from the record\'s openKeys, and without a stored key the row keeps its own b', async () => {
  await world({}, async (w) => {
    let A = await w.page('alice', { owner: true }); const X = await w.page('xena');
    for (const [i, held] of [true, false].entries()) {
      const cid = cidOf(w.cid, i);
      await makeChannel(A, cid, ['alice', 'xena'], ['xena']);
      await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
      await X.rotateTo(await X.sync(cid), X.metaOf(await X.shown(cid)));   // epoch 2, Xena's commit at the head
      const was = await rowOf(A, cid, 2), K1 = keyOf(X, cid, 1), J = randomBytes(32);
      { const st = w.T.srv.store, { p, doc } = st._chatDoc(cid); st._write(p, { ...doc, openKeys: { 1: A.b64(J) } }, st.now()); }   // the record names a key of the server's for epoch 1: written straight into the store, since no page gets one into a private channel's record any more (release 107)
      if (!held) { const m = A.ls.get('hush:ks:alice', {}); delete m[cid][1]; A.ls.set('hush:ks:alice', m); A = await w.reload(A); }
      await A.sync(cid); await A.shown(cid); await A.setAdmins(cid, []);
      const row = await rowOf(A, cid, 2), K2 = keyOf(X, cid, 2);
      assert.equal((await A.openCommit(cid, 2, K2, row.c)).f, 'alice', 'the owner signed the head');
      assert.ok(sameKey(await A.openBack(cid, 2, K2, row.b), K1), held ? 'the key before from the store' : 'the real key before');
      if (!held) assert.equal(row.b, was.b, 'the row\'s own b, untouched');
    }
  });
});

test('33. a row 0 that won\'t open, below rows that check out, is written again under the key the chain gave (it holds no key) and the backfill finishes; a row 0 that opens but isn\'t marked full, or one below a row 1 that names another key before, is left alone', async () => {
  await world({}, async (w) => {
    let A = await w.page('alice', { owner: true });
    for (const [i, how] of ['junk', 'not full', 'row 1 names another key'].entries()) {
      const cid = cidOf(w.cid, i), real = await chained(A, cid, 2), junk = randomBytes(32);
      const k0 = await crypto.subtle.importKey('raw', how === 'not full' ? real[0] : junk, 'AES-GCM', false, ['encrypt']);   // row 0 under a junk key, or under the real one but not marked full
      await A.S.db.chain(cid, 0, undefined, A.b64(await A.sealRaw(k0, Buffer.from('hush-rot-v1|' + cid + '|0'), Buffer.from(JSON.stringify({ f: 'alice', m: how === 'not full' ? 'fresh' : 'full', s: 'x' })))));
      if (how === 'row 1 names another key') { const r = await A.chainRow(cid, 1, real[1], junk); await A.S.db.chain(cid, 1, r.b, r.c); }   // the owner's own row 1, naming a wrong key before
      const before = await rowsOf(A, cid, 2);
      A = await w.reload(A);
      assert.equal(await A.ensureChain(await A.sync(cid)), how === 'junk', how);
      if (how === 'junk') {
        assert.deepEqual(A.spy.chain, [0], how + ': row 0 alone');
        const r0 = await rowOf(A, cid, 0), o = await A.openCommit(cid, 0, real[0], r0.c);
        assert.deepEqual([Object.keys(r0), o && o.f, o && o.m], [['c'], 'alice', 'full'], how + ': the owner\'s commit under the real key, and no b');
        assert.deepEqual((await rowsOf(A, cid, 2)).slice(1), before.slice(1), how + ': rows 1 and 2 as they were');
      } else {
        assert.deepEqual(A.spy.chain, [], how + ': nothing written');
        assert.deepEqual(await rowsOf(A, cid, 2), before, how + ': every row as it was');
      }
      assert.deepEqual(await leaked(A, cid, 2, [junk], real), [], how + ': no real key opens from the junk one');
    }
  });
});
