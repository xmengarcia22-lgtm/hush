// Release 92 (page), private channel history: the owner's page signs only the admin list its own roles record holds
// (SPEC.md 5.6 "Key chain"; release 92 fix round 2): an older or unsigned copy served again, an owner device the server kept a
// change from, an old tab, a channel from before release 92. The page harness is channel-history-kit.js; an owner device with
// no signed record, a key change during Remove admin and the page's own copy of what it wrote are channel-history-reseal.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { mkBuild, world, makeChannel } from './channel-history-kit.js';

// Helpers shared with channel-history-signed.test.js, copied as the removal tests do.
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; const n = X.spy.posts; await X.leaveChat(cid); assert.equal(X.spy.posts, n, X.handle + ' left with a card, no note'); };
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const sameKey = (a, b) => !!a && !!b && Buffer.from(a).equals(Buffer.from(b));
const badkey = (e) => !!e && e.message === 'badkey';
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

// ---- the owner's page signs only the admin list its own roles record holds (SPEC.md 5.6 "Key chain"; release 92 fix round 2) ----

const nokey = (e) => !!e && e.message === 'nokey';
const wrote = (X) => X.spy.updates.flat().includes('ometa');
// Save pressed in X's Edit sheet (openEditConv) with a new name, the record being X's copy of it: the sheet's error line ('' once saved).
async function editSave(X, cid, name) {
  X.S.convs = [{ ...(await X.showMeta(X.S.chatDocs.get(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); return at((e) => e.cls === 'err').textContent;
}

test('34. an older ometa served again to the owner\'s page (signed, of an older epoch or of the same one with an older rt, or unsigned of an older epoch) changes nobody\'s roles: the page shows the admins its own record holds, marks the copy stale, seals nothing again, and Make admin, Remove admin, removing an admin, Edit and Make public all refuse with nokey; its leave run skips the admin step and still changes the key; the owner\'s own drop is on its record at once, a dropped admin\'s planted key stays refused, and the copy from before a rename (the same admins, the old name) is not sealed again', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), C = await w.page('carol');
    await makeChannel(A, cid, ['alice', 'bob', 'carol'], ['bob', 'carol']);
    const old0 = (await A.sync(cid)).ometa;
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    let c = await A.sync(cid); await A.adoptOMeta(c, await A.showMeta(c));   // sealed again after the key change
    const old1 = (await A.sync(cid)).ometa; assert.equal(old1.e, 1);
    await A.setAdmins(cid, ['carol']); await A.rolesQ.get(cid);
    assert.deepEqual(rolesNow(A, cid), { e: 1, o: 'alice', a: ['carol'], s: 1 }, 'the owner\'s drop is on its own record, with no echo read');
    const rec = await A.sync(cid);
    await C.shown(cid); await C.rolesQ.get(cid); assert.deepEqual(rolesNow(C, cid).a, ['carol']);
    const bare0 = await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob', 'carol'] }, 'hush-ometa-v1|' + cid);   // as a page from before release 92 sealed one
    for (const [old, why] of [[old0, 'signed, an older epoch'], [old1, 'signed, the same epoch with an older rt'], [bare0, 'unsigned, an older epoch']]) {
      const forged = { ...rec, ometa: old }; A.S.chatDocs.set(cid, forged);
      for (const k of ['updates', 'admins', 'ban', 'chain']) A.spy[k].length = 0;
      const sh = await A.showMeta(forged);
      assert.deepEqual([sh.owner, sh.admins, sh._ometa, sh._stale], ['alice', ['carol'], true, true], why + ': the record\'s owner and admins, the copy stale');
      await A.adoptOMeta(forged, sh);
      await assert.rejects(A.setAdmins(cid, ['carol', 'bob']), nokey, why + ': Make admin');
      await assert.rejects(A.setAdmins(cid, []), nokey, why + ': Remove admin');
      await assert.rejects(A.kickMember(cid, 'carol'), nokey, why + ': removing an admin');
      await assert.rejects(A.setVisibility(cid, 'public'), nokey, why + ': Make public');
      assert.match(await editSave(A, cid, 'Renamed'), /^Couldn.t save/, why + ': Edit');
      assert.deepEqual([A.spy.updates, A.spy.admins, A.spy.ban, A.spy.chain], [[], [], [], []], why + ': nothing sealed again, nothing written');
    }
    A.S.chatDocs.set(cid, rec);
    assert.equal((await A.sync(cid)).ometa.iv, rec.ometa.iv, 'the server still holds the owner\'s drop');
    await C.shown(cid); await C.rolesQ.get(cid); assert.deepEqual(rolesNow(C, cid), { e: 1, o: 'alice', a: ['carol'], s: 1 }, 'Carol\'s record still leaves Bob out');
    // Bob, dropped but holding K1 as a subscriber, and the server plant epoch 2 for Carol: refused
    const Kp = randomBytes(32), row = await B.chainRow(cid, 2, Kp, keyOf(A, cid, 1));
    await C.loadDir(['carol'], true);
    const planted = { ...(await C.sync(cid)), epoch: 2, keys: { ...rec.keys, 2: await C.wrapAll(Kp, ['carol'], cid, 2) } }, doc = C.S.db.doc;
    C.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/2' ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
    C.S.chanKeys.clear();
    try { await assert.rejects(C.sealKey(planted, 2), badkey, 'Bob\'s commit for a planted key'); } finally { C.S.db.doc = doc; }
    assert.equal(await editSave(A, cid, 'Renamed'), '', 'a rename saves');
    // Carol (an admin) leaves; the owner's leave run meets the stale copy
    await leave(C, cid);
    const forged = { ...(await A.sync(cid)), ometa: old0 }; A.S.chatDocs.set(cid, forged); A.spy.updates.length = 0; A.spy.admins.length = 0;
    await A.rollRun(await A.showMeta(forged));
    assert.equal(A.epochOf(await A.sync(cid)), 2, 'her leave still changes the key');
    assert.deepEqual([wrote(A), A.spy.admins], [false, []], 'and no admin step ran from the stale copy');
    // after that key change, the copy from before the rename served again: the same admins and the old name, which nothing seals again
    const back = { ...(await A.sync(cid)), ometa: rec.ometa }; A.S.chatDocs.set(cid, back); A.spy.updates.length = 0;
    const sb = await A.showMeta(back);
    assert.deepEqual([sb.name, sb.admins, sb._odd, sb._stale], ['History', ['carol'], false, true], 'the old name, the record\'s admins: stale');
    await A.adoptOMeta(back, sb);
    assert.deepEqual(A.spy.updates, [], 'the old name is not sealed again');
  });
});

test('35. after a key change the owner\'s page seals the ometa again under the new key with its rt unchanged, and every device takes it; an owner device the server kept a later change from (the phone dropped Bob) seals the list it last saw again, and that changes nothing on the devices that saw the drop: a copy of a later epoch with an older rt is not taken, and the phone marks it stale', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), M = await w.page('mona'), C = await w.page('carol'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob', 'carol', 'mona'], ['bob', 'carol']);
    const A2 = await w.page('alice', { owner: true, id: A.id });   // the owner's desktop, with a store of its own
    for (const X of [A, A2, M]) { await X.shown(cid); await X.rolesQ.get(cid); }
    const t0 = A.rolesOf(cid).t; assert.ok(Number.isFinite(t0));
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    let c = await A.sync(cid); A.spy.updates.length = 0; await A.adoptOMeta(c, await A.showMeta(c));
    assert.deepEqual(A.spy.updates, [['ometa']], 'sealed again after the key change');
    const m1 = (await A.sync(cid)).ometa, p1 = await plainOf(A, cid, m1);
    assert.deepEqual([m1.e, p1.rt, p1.admins], [1, t0, ['bob', 'carol']], 'under the new key, its rt unchanged');
    for (const X of [M, A2]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid), { e: 1, o: 'alice', a: ['bob', 'carol'], s: 1 }, X.handle + ' takes it'); }
    // the phone drops Bob, and the server keeps the desktop from seeing it
    await A.setAdmins(cid, ['carol']);
    for (const X of [M, C]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid).a, ['carol'], X.handle + ' sees the drop'); }
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));   // a key change no owner page seals the ometa again after
    const forged = { ...(await A2.sync(cid)), ometa: m1 }; A2.S.chatDocs.set(cid, forged); A2.spy.updates.length = 0;
    const sh = await A2.showMeta(forged);
    assert.deepEqual([sh.admins, !!sh._stale], [['bob', 'carol'], false], 'the desktop shows the list it last saw');
    await A2.adoptOMeta(forged, sh);
    assert.deepEqual(A2.spy.updates, [['ometa']], 'and seals it again under the new key');
    const m2 = (await A.sync(cid)).ometa, p2 = await plainOf(A, cid, m2);
    assert.deepEqual([m2.e, p2.rt, p2.admins], [2, t0, ['bob', 'carol']], 'with the rt of that list');
    for (const X of [M, C]) { const s = await X.shown(cid); await X.rolesQ.get(cid);
      assert.deepEqual([rolesNow(X, cid), s.admins], [{ e: 1, o: 'alice', a: ['carol'], s: 1 }, ['carol']], X.handle + ' saw the drop: Bob stays out'); }
    c = await A.sync(cid); const shA = await A.showMeta(c); A.spy.updates.length = 0; await A.adoptOMeta(c, shA);
    assert.deepEqual([shA.admins, shA._stale, A.spy.updates], [['carol'], true, []], 'the phone: its own list, the copy stale, nothing sealed from it');
  });
});

// adeb006 (release 90) setAdmins, rotateAdmins, sealMeta and sealMetaFor, verbatim: what a tab left open since then runs.
const OLD90 = `async function rotateAdmins(cid,admins){
  const [c,shown]=await chatAnd(cid);const secret=crypto.getRandomValues(new Uint8Array(32)),who=[...new Set([shown.owner||S.me.handle,...admins])];
  await loadDir(who,true);const akeys={};for(const h of who)if(h===S.me.handle||S.dir[h])Object.assign(akeys,await wrapKey(secret,h,cid+'#a'));
  await S.db.setAdmins(cid,akeys,await adminCapFrom(cid,secret));ksPut(cid,'a',b64(secret));
  for(const x of [S.chatDocs.get(cid),convById(cid)])if(x)x.akeys=akeys;
}
async function setAdmins(cid,admins){
  const [c,shown]=await chatAnd(cid);
  if(c.visibility==='public')await S.db.doc('channels/'+cid).update({admins});
  else{if(c.ometa&&!shown._ometa)throw new Error('nokey');await handOver(c,shown);await S.db.doc('channels/'+cid).update({ometa:await sealOMetaFor(c,Object.assign(metaOf(shown),{admins}))})}
  await rotateAdmins(cid,admins);
}
async function sealMeta(cid,e,raw,v,o){
  const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const x={name:String(v.name||''),desc:String(v.desc||''),photo:v.photo||null,owner:v.owner||'',admins:handleList(v.admins)};
  if(!o)Object.assign(x,{members:handleList(v.members),banned:handleList(v.banned)});
  return {e,iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:metaAD(cid,o)},key,enc.encode(JSON.stringify(x))))};
}
async function sealMetaFor(c,v,o){const e=epochOf(c),k=await convKey(c,e);if(!k||!k.raw)throw new Error('nokey');return sealMeta(c.id,e,k.raw,v,o)}`;
const build90 = mkBuild(OLD90);

test('36. an admin made from a tab still on release 90 (an unsigned ometa naming Bob, the admin secret wrapped to him) is not adopted: every release-92 page shows and keeps the signed list, the owner\'s page seals nothing again and its Edit writes the signed list; Bob\'s page refuses to change the key (badkey), so the channel stays usable for everyone; Make admin from a release-92 page then works, and Bob\'s key change with it', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), M = await w.page('mona'), Z = await w.page('zed');
    await makeChannel(A, cid, ['alice', 'bob', 'mona', 'zed']);
    for (const X of [A, B, M]) { await X.shown(cid); await X.rolesQ.get(cid); }
    const A90 = await w.page('alice', { owner: true, id: A.id, build: build90 });
    await A90.shown(cid); await A90.setAdmins(cid, ['bob']);
    for (const X of [A, B, M]) { const sh = await X.shown(cid); await X.rolesQ.get(cid);
      assert.deepEqual([sh.admins, rolesNow(X, cid)], [[], { e: 0, o: 'alice', a: [], s: 1 }], X.handle + ': the signed list, shown and kept'); }
    let c = await A.sync(cid); A.spy.updates.length = 0; await A.adoptOMeta(c, await A.showMeta(c));
    assert.equal(wrote(A), false, 'the owner\'s page doesn\'t seal the old tab\'s copy again');
    assert.equal(await editSave(A, cid, 'Renamed'), '', 'an Edit from release 92 saves');
    const sm = await M.shown(cid); await M.rolesQ.get(cid);
    assert.deepEqual([sm.name, sm.admins, rolesNow(M, cid).a, (await plainOf(A, cid, (await A.sync(cid)).ometa)).admins], ['Renamed', [], [], []], 'and writes the signed list, not the old tab\'s');
    await leave(Z, cid);
    B.spy.rotate.length = 0; await B.run(cid);
    assert.deepEqual([B.epochOf(await B.sync(cid)), B.spy.rotate.length], [0, 0], 'Bob\'s leave run changes no key, and sends none');
    await assert.rejects(B.rotateTo(await B.sync(cid), B.metaOf(await B.shown(cid))), badkey, 'nor does a key change of his own');
    for (const X of [A, M]) assert.ok(await X.sealKey(await X.sync(cid), 0), X.handle + ': the key still checks out');
    await A.sealPost(await A.sync(cid), 'hello');
    // the owner makes Bob an admin again, from a release-92 page
    await A.setAdmins(cid, ['bob']);
    for (const X of [B, M]) { const sh = await X.shown(cid); assert.deepEqual([sh.admins, rolesNow(X, cid).a], [['bob'], ['bob']], X.handle + ': Bob is an admin now, shown as soon as the copy is read'); }
    await B.run(cid);
    c = await M.sync(cid); assert.equal(M.epochOf(c), 1, 'Bob\'s page acts on Zed\'s leave');
    await M.shown(cid); assert.ok(await M.sealKey(c, 1), 'and Mona takes his key');
  });
});

// Bob (holding the current key, or naming `before` as the key before) and the server plant the next epoch for X: X's check of it (sealKey), 'badkey' or 'taken'.
async function plantedBy(B, X, cid, before) {
  const cur = await X.sync(cid), e = X.epochOf(cur) + 1, Kp = randomBytes(32), row = await B.chainRow(cid, e, Kp, before || (await B.convKey(await B.sync(cid), e - 1)).raw);
  await X.loadDir([X.handle], true);
  const planted = { ...cur, epoch: e, keys: { ...cur.keys, [e]: await X.wrapAll(Kp, [X.handle], cid, e) } }, doc = X.S.db.doc;
  X.S.db.doc = (p) => (p === 'channels/' + cid + '/chain/' + e ? { get: async () => ({ exists: true, data: () => row }) } : doc(p));
  X.S.chanKeys.clear();
  try { const k = await X.sealKey(planted, e); return k && sameKey(k.raw, Kp) ? 'taken' : 'other'; } catch (x) { return x.message; } finally { X.S.db.doc = doc; }
}

test('38. a channel from before release 92 (an unsigned ometa): the owner\'s page with no signed record seals nothing again, whatever rt or _rt the server puts in the record, and every device keeps it unsigned (owner decision D1); her Edit then Save signs the list at a fresh rt and every device takes it; a new owner device served an unsigned list naming someone else under a later key seals nothing either; the owner\'s drop of Bob from another device then counts everywhere, and his planted key is refused', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), M = await w.page('mona');
    await makeChannel(A, cid, ['alice', 'bob', 'mona'], ['bob']);
    await A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob'] }, 'hush-ometa-v1|' + cid) });   // as a page from before release 92 sealed it
    const m0 = (await A.sync(cid)).ometa, A2 = await w.page('alice', { owner: true, id: A.id });   // the owner's other device
    for (const X of [A, A2, M]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid), { e: 0, o: 'alice', a: ['bob'], s: 0 }, X.handle + ': unsigned'); }
    const forged = { ...(await A.sync(cid)), rt: 9e15, _rt: 9e15 }; A.S.chatDocs.set(cid, forged);   // fields of the server's own in the record
    const sh = await A.showMeta(forged); assert.equal(sh._rt, 0, 'the page\'s _rt (an unsigned record\'s), not the server\'s');
    A.spy.updates.length = 0; await A.adoptOMeta(forged, sh);
    assert.deepEqual([wrote(A), (await A.sync(cid)).ometa.iv], [false, m0.iv], 'nothing sealed again');
    for (const X of [M, A2]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid), { e: 0, o: 'alice', a: ['bob'], s: 0 }, X.handle + ': still unsigned'); }
    A.S.chatDocs.set(cid, await A.sync(cid));
    assert.equal(await editSave(A, cid, 'History'), '', 'the owner saves the list by hand (Edit, then Save)');
    const p = await plainOf(A, cid, (await A.sync(cid)).ometa);
    assert.deepEqual([wrote(A), p.rt > 1, p.admins, typeof p.rs], [true, true, ['bob'], 'string'], 'signed at a fresh rt');
    for (const X of [M, A2]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid), { e: 0, o: 'alice', a: ['bob'], s: 1 }, X.handle + ' takes it'); }
    // a key change; a new device of the owner's is served an unsigned list naming Zed too, under the new key: kept unsigned there, nothing sealed again
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    const A3 = await w.page('alice', { owner: true, id: A.id }), lie = { ...(await A3.sync(cid)), ometa: await bareMeta(1, keyOf(A, cid, 1), { name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob', 'zed'] }, 'hush-ometa-v1|' + cid) };
    A3.S.chatDocs.set(cid, lie); A3.spy.updates.length = 0; await A3.adoptOMeta(lie, await A3.showMeta(lie));
    const c3 = await A.sync(cid), p3 = await plainOf(A, c3.id, c3.ometa);
    assert.deepEqual([wrote(A3), rolesNow(A3, cid), c3.ometa.e, p3.rt, p3.admins], [false, { e: 1, o: 'alice', a: ['bob', 'zed'], s: 0 }, 0, p.rt, ['bob']], 'nothing sealed again: the server\'s copy is still her save, and the new device holds the lie unsigned');
    for (const X of [M, A2]) { const s = await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual([rolesNow(X, cid), s.admins], [{ e: 0, o: 'alice', a: ['bob'], s: 1 }, ['bob']], X.handle + ': unchanged'); }
    // the owner drops Bob from the other device: from its record's list, at a fresh rt
    await A2.setAdmins(cid, []);
    assert.deepEqual((await plainOf(A, cid, (await A.sync(cid)).ometa)).admins, [], 'Zed is not signed in either');
    for (const X of [M, A]) { await X.shown(cid); await X.rolesQ.get(cid); assert.deepEqual(rolesNow(X, cid).a, [], X.handle + ' takes the drop'); }
    assert.equal(await plantedBy(B, M, cid), 'badkey', 'Bob\'s planted key: refused');
  });
});

test('52. a channel from before release 92 (an unsigned ometa naming Bob admin), read so on every device: after the owner blocks Xavier, her page is served an unsigned copy he sealed under the key before, which he still holds, naming himself admin too; it shows the list on its record and marks the copy odd, seals nothing again, and every record stays unsigned with Bob alone; its Edit from that copy signs the record\'s list, and Xavier\'s planted key is refused', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), M = await w.page('mona'), X = await w.page('xavier'); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob', 'mona', 'xavier'], ['bob']);
    await A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob'] }, 'hush-ometa-v1|' + cid) });   // as a page from before release 92 sealed it
    const A2 = await w.page('alice', { owner: true, id: A.id }), all = [A, A2, M];   // the owner's other device
    for (const P of all) { await P.shown(cid); await P.rolesQ.get(cid); assert.deepEqual(rolesNow(P, cid), { e: 0, o: 'alice', a: ['bob'], s: 0 }, P.handle + ': unsigned'); }
    assert.equal(await X.holds(cid, 0), true, 'Xavier holds the first key');
    await A.kickMember(cid, 'xavier', { ban: true });
    const rec = await A.sync(cid); assert.equal(A.epochOf(rec), 1);
    const forged = { ...rec, ometa: await bareMeta(0, keyOf(X, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins: ['bob', 'xavier'] }, 'hush-ometa-v1|' + cid) };
    A.S.chatDocs.set(cid, forged);
    const sh = await A.showMeta(forged);
    assert.deepEqual([sh.admins, sh._odd, sh._stale], [['bob'], true, false], 'the record\'s list, the copy marked odd');
    A.spy.updates.length = 0; await A.adoptOMeta(forged, sh);
    assert.equal(wrote(A), false, 'nothing sealed again');
    for (const P of all) { await P.shown(cid); await P.rolesQ.get(cid); assert.deepEqual(rolesNow(P, cid), { e: 0, o: 'alice', a: ['bob'], s: 0 }, P.handle + ': Bob alone, unsigned'); }
    A.S.chatDocs.set(cid, forged);
    assert.equal(await editSave(A, cid, 'Renamed'), '', 'an Edit from that copy saves');
    assert.deepEqual((await plainOf(A, cid, (await A.sync(cid)).ometa)).admins, ['bob'], 'and signs the record\'s list');
    for (const P of all) { await P.shown(cid); await P.rolesQ.get(cid); assert.deepEqual(rolesNow(P, cid), { e: 1, o: 'alice', a: ['bob'], s: 1 }, P.handle + ' takes it'); }
    assert.equal(await plantedBy(X, M, cid, randomBytes(32)), 'badkey', 'Xavier\'s planted key: refused');
  });
});
