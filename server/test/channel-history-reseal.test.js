// Release 92 (page), private channel history: what the owner's page seals again after a key change (SPEC.md 5.6 "Key chain";
// release 92 fix round 2): an owner device with no signed roles record, a key change while Remove admin runs, and the page's
// own copy of the ometa it writes, one write at a time. The page harness is channel-history-kit.js; older copies served again
// and old tabs are channel-history-roles.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { world, makeChannel } from './channel-history-kit.js';

// Shared with channel-history-roles.test.js, copied as the removal tests do.
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const rolesNow = (X, cid) => { const r = X.rolesOf(cid) || {}; return { e: r.e, o: r.o, a: r.a, s: r.s }; };
// JSON `x` sealed under `raw` with the additional data `ad`, shaped like sealed meta: an ometa as a page from before release
// 92 sealed it (no rs), or meta v2, which release 92 reads and 93 writes.
async function bareMeta(e, raw, x, ad) {
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
// The plaintext of a channel's ometa, opened with the key X holds for its epoch.
async function plainOf(X, cid, m) {
  const key = await crypto.subtle.importKey('raw', keyOf(X, cid, m.e), 'AES-GCM', false, ['decrypt']);
  return JSON.parse(Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(m.iv, 'base64'), additionalData: Buffer.from('hush-ometa-v1|' + cid) }, key, Buffer.from(m.ct, 'base64'))).toString());
}

const wrote = (X) => X.spy.updates.flat().includes('ometa');
// Save pressed in X's Edit sheet (openEditConv) with a new name, the record being X's copy of it: the sheet's error line ('' once saved).
async function editSave(X, cid, name) {
  X.S.convs = [{ ...(await X.showMeta(X.S.chatDocs.get(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); return at((e) => e.cls === 'err').textContent;
}


// Bob (holding the current key) and the server plant the next epoch for X: X's check of it (sealKey), 'badkey' or 'taken'.
async function plantedBy(B, X, cid) {
  const cur = await X.sync(cid), e = X.epochOf(cur) + 1, Kp = randomBytes(32), row = await B.chainRow(cid, e, Kp, (await B.convKey(await B.sync(cid), e - 1)).raw);
  await X.loadDir([X.handle], true);
  const planted = { ...cur, epoch: e, keys: { ...cur.keys, [e]: await X.wrapAll(Kp, [X.handle], cid, e) } }, doc = X.S.db.doc;
  X.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/' + e ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
  X.S.chanKeys.clear();
  try { const k = await X.sealKey(planted, e); return k && sameKey(k.raw, Kp) ? 'taken' : 'other'; } catch (x) { return x.message; } finally { X.S.db.doc = doc; }
}

for (const how of ['an unsigned ometa sealed by Bob', 'no ometa, and a meta sealed by Bob']) test('37. an owner device with no signed roles record (a new device, a fresh browser) seals nothing again (owner decision D1): what it is served after the owner dropped Bob (' + how + ', naming him admin, the record carrying an rt and _ marks of the server\'s own) is kept unsigned there, changes nothing on the devices that saw the drop, and his planted key stays refused', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carol'), M = await w.page('mona');
    await makeChannel(A, cid, ['alice', 'bob', 'carol', 'mona'], ['bob', 'carol']);
    for (const X of [A, B, C, M]) { await X.shown(cid); await X.rolesQ.get(cid); }
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    const c = await A.sync(cid); await A.adoptOMeta(c, await A.showMeta(c));
    await A.sync(cid); await A.setAdmins(cid, ['carol']);
    for (const X of [C, M]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid), { e: 1, o: 'alice', a: ['carol'], s: 1 }, X.handle + ' saw the drop'); }
    // Bob still holds K1 as a subscriber
    const K1 = (await B.convKey(await B.sync(cid), 1)).raw, lie = { name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob', 'carol'] };
    const forged = { ...(await A.sync(cid)), rt: 9e15, _rt: 9e15, _odd: true, _stale: true };
    if (how.startsWith('an unsigned')) forged.ometa = await bareMeta(1, K1, lie, 'hush-ometa-v1|' + cid);
    else { delete forged.ometa; forged.meta = await B.sealMeta(cid, 1, K1, { ...lie, members: ['alice', 'bob', 'carol', 'mona'], banned: [] }); }
    const A3 = await w.page('alice', { owner: true, id: A.id });   // the owner signs in on a new device: a store of its own, no roles record
    await A3.sync(cid); A3.S.chatDocs.set(cid, forged);
    const sh = await A3.showMeta(forged);
    const unsigned = how.startsWith('an unsigned');   // with no ometa there is no roles record at all
    assert.deepEqual([sh.admins, sh._rt, !!sh._odd, !!sh._stale, unsigned ? rolesNow(A3, cid) : A3.rolesOf(cid)], [['bob', 'carol'], unsigned ? 0 : undefined, false, false, unsigned ? { e: 1, o: 'alice', a: ['bob', 'carol'], s: 0 } : null], 'it shows what it is served, unsigned; the record\'s _ marks are not the page\'s');
    const m0 = (await A.sync(cid)).ometa; A3.spy.updates.length = 0; await A3.adoptOMeta(forged, sh);
    const p = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([wrote(A3), (await A.sync(cid)).ometa.iv, p.admins], [false, m0.iv, ['carol']], 'it seals nothing again: the server\'s copy is still her drop');
    for (const X of [C, M]) { const s = await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual([rolesNow(X, cid), s.admins], [{ e: 1, o: 'alice', a: ['carol'], s: 1 }, ['carol']], X.handle + ': Bob stays out'); }
    assert.equal(await plantedBy(B, M, cid), 'badkey', 'Bob\'s planted key: refused');
    // the _ marks a page sets are never taken from the server's record: a record with no meta or ometa names none of them
    const bare = await A.showMeta({ ...(await A.sync(cid)), meta: null, ometa: null, _unlocked: true, _ometa: true, _unlisted: true, _rt: 9e15 });
    assert.deepEqual([bare._unlocked, bare._ometa, bare._unlisted, bare._rt], [undefined, undefined, undefined, A.rolesOf(cid).t]);
  });
});

for (const who of ['carol', 'bob']) test('39. a key change by ' + (who === 'bob' ? 'the admin being dropped' : 'another admin') + ' while the owner\'s Remove admin runs, after which the owner\'s chat watch seals the old list again under the new key: the drop, sealed under the key before, still counts on every device and in the owner\'s own record; the owner\'s page builds on it, removes another admin, and a planted key of the dropped admin\'s is refused', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carol'), M = await w.page('mona');
    await makeChannel(A, cid, ['alice', 'bob', 'carol', 'mona'], ['bob', 'carol']);
    await A.ensureChain(await A.sync(cid));
    for (const X of [A, B, C, M]) { await X.shown(cid); await X.rolesQ.get(cid); }
    const R = who === 'bob' ? B : C, real = A.S.db.setAdmins; let once = true;
    A.S.db.setAdmins = async (...a) => { if (once) { once = false;
        await R.rotateTo(await R.sync(cid), R.metaOf(await R.shown(cid)));   // the key change lands now
        const c1 = await A.sync(cid); A.spy.updates.length = 0; await A.adoptOMeta(c1, await A.showMeta(c1));   // and the owner's chat watch meets it
        assert.equal(wrote(A), true, 'the old list sealed again under the new key');
        await M.shown(cid); await M.rolesQ.get(cid); assert.deepEqual(rolesNow(M, cid), { e: 1, o: 'alice', a: ['bob', 'carol'], s: 1 }); }
      return real(...a); };
    try { await A.setAdmins(cid, ['carol']); } finally { A.S.db.setAdmins = real; }
    assert.equal((await A.sync(cid)).ometa.e, 0, 'the drop is sealed under the key the page started from');
    for (const X of [M, C]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid).a, ['carol'], X.handle + ' takes the drop'); }
    await A.rolesQ.get(cid); assert.deepEqual(rolesNow(A, cid).a, ['carol'], 'so does the owner\'s own record');
    const sh = await A.shown(cid); assert.deepEqual([sh.admins, sh._stale, sh._odd], [['carol'], false, false], 'the owner\'s page shows it, from a copy it builds on');
    await A.setAdmins(cid, []);
    for (const X of [M, C]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid).a, [], X.handle + ': Carol removed too'); }
    assert.equal(await plantedBy(B, M, cid), 'badkey', 'Bob\'s planted key: refused');
  });
});

test('40. the owner\'s page puts the ometa it writes into its copy of the channel at once, so its next owner write builds on it with no echo read; a list sealed again from a copy read before a later owner write seals nothing (the record moved on); and one sealed again, still on its way, lands before a later write from the same page, never after it', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }); await w.page('bob'); await w.page('carol');
    await makeChannel(A, cid, ['alice', 'bob', 'carol'], ['bob', 'carol']);
    await A.shown(cid); await A.rolesQ.get(cid);
    await A.setAdmins(cid, ['carol']);   // no echo read from here on: the copy is the page's own
    assert.equal(await editSave(A, cid, 'Renamed'), '', 'Edit right after Remove admin');
    await A.setAdmins(cid, []); await A.rolesQ.get(cid);
    assert.deepEqual([(await plainOf(A, cid, (await A.sync(cid)).ometa)).name, rolesNow(A, cid).a], ['Renamed', []], 'and Remove admin right after Edit');
    // a key change; the chat watch reads the copy, then (before it seals it again) the owner makes Carol an admin
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    const c1 = await A.sync(cid), sh1 = await A.showMeta(c1), ev = { ...c1 };
    await A.setAdmins(cid, ['carol']); const made = (await A.sync(cid)).ometa;
    A.spy.updates.length = 0; await A.adoptOMeta(ev, sh1);
    assert.deepEqual([wrote(A), (await A.sync(cid)).ometa.iv], [false, made.iv], 'the list from before Make admin is not sealed again');
    // another key change: the list sealed again is held on its way to the server while the owner renames the channel
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    const c2 = await A.sync(cid), sh2 = await A.showMeta(c2), doc = A.S.db.doc;
    let hit, release; const atServer = new Promise((r) => { hit = r; }), go = new Promise((r) => { release = r; });
    A.S.db.doc = (p) => { const d = doc(p); if (p !== 'channels/' + cid) return d; const u = d.update;
      d.update = async (v) => { if (!v.ometa) return u(v); if (hit) { hit(); hit = null; await Promise.race([go, new Promise((r) => setTimeout(r, 1500))]); } else release(); return u(v); };
      return d; };
    let name;
    try { const kept = A.adoptOMeta({ ...c2 }, sh2); await atServer; const later = editSave(A, cid, 'Later'); await kept; assert.equal(await later, '', 'the rename saves');
      name = (await plainOf(A, cid, (await A.sync(cid)).ometa)).name; } finally { A.S.db.doc = doc; }
    assert.equal(name, 'Later', 'the server holds the later write');
    const sh = await A.shown(cid); assert.deepEqual([sh.name, sh.admins, sh._stale], ['Later', ['carol'], false], 'and the owner\'s page is left with a copy it builds on');
  });
});
