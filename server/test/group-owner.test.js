// A group's or channel's settings and description are the owner's (SPEC.md 5.3, 5.4). An admin moderates (posts,
// pins, invites, the member and blocked lists in `meta`, rotations) but may not change the name, photo, description,
// reactions, comments, the disappearing timer, the visibility, published keys, or the owner and admin lists, by
// `update` or by `set`, and may not publish a key in `chat.rotate`. The owner's part of the description lives in its
// own sealed field, `ometa`, which only the owner writes and rotations carry unchanged. The page reads the owner part
// from `ometa` (so what an admin seals into `meta` names no owner), and an owner's page gives an older group one.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { startServer, signup, makeIdentity, cap, label, wrap, sealed, CAPS, groupDoc, channelDoc, dmDoc, createChat } from './helpers.js';

const gid = (n) => 'gOwner' + String(n).padStart(7, '0');
const chid = (n) => 'cOwner' + String(n).padStart(7, '0');
const OWNER_ONLY = { reactions: { mode: 'off' }, comments: false, ttl: 3600, visibility: 'public', openKeys: { 0: 'k'.repeat(44) }, ometa: sealed(0) };
const PUBLIC_OWNER_ONLY = { name: 'Renamed', desc: 'new', photo: 'data:x', owner: 'eve', admins: ['bob'] };

let S, alice, bob, eve, A, B, E;
before(async () => {
  S = await startServer({ authz: 'standard' });
  [alice, bob, eve] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('eve')]);
  A = await signup(S.url, alice); B = await signup(S.url, bob); E = await signup(S.url, eve);
});
after(async () => { await A.close(); await B.close(); await E.close(); await S.stop(); });

// Alice owns the chat, Eve holds the admin key, Bob the member key.
async function trio(cid, doc) {
  const { caps } = await createChat(A, cid, doc);
  await E.ok('chat.open', { cid, cap: caps.a });
  await B.ok('chat.open', { cid, cap: caps.m });
  return caps;
}
const upd = (c, cid, d) => c.call('update', { p: 'channels/' + cid, d });
const rec = async (c, cid) => (await c.ok('get', { p: 'channels/' + cid })).d;

test('update: an admin is refused every owner-only field of a group and a channel; the owner is not', async () => {
  for (const cid of [gid(1), chid(1)]) {
    await trio(cid, (cid[0] === 'g' ? groupDoc : channelDoc)());
    for (const [f, v] of Object.entries(OWNER_ONLY)) {
      const r = await upd(E, cid, { [f]: v });
      assert.equal(r.e, 'denied', `${cid}: an admin may not change "${f}"`);
      assert.match(r.m, /owner access/);
      assert.equal((await upd(A, cid, { [f]: v })).ok, true, `${cid}: the owner may change "${f}"`);
      assert.equal((await upd(A, cid, { [f]: f === 'visibility' ? 'private' : null })).ok, true, 'and change it back');
    }
    assert.equal((await upd(E, cid, { pins: [], ttl: 60 })).e, 'denied', 'an admin field does not carry an owner field along');
  }
  // A public channel keeps its description and owner and admin lists in the clear: the owner's too.
  const pub = chid(2);
  await trio(pub, channelDoc({ visibility: 'public', name: 'News', desc: 'd', owner: 'alice', admins: ['eve'], meta: undefined, openKeys: { 0: 'k'.repeat(44) } }));
  for (const [f, v] of Object.entries(PUBLIC_OWNER_ONLY)) {
    assert.equal((await upd(E, pub, { [f]: v })).e, 'denied', `public: an admin may not change "${f}"`);
    assert.equal((await upd(A, pub, { [f]: v })).ok, true, `public: the owner may change "${f}"`);
  }
  assert.equal((await upd(E, pub, { openKeys: { 1: 'k'.repeat(44) } })).e, 'denied', 'nor publish a key');
});

test('update: admins keep meta, invites and pins; members still may not', async () => {
  const cid = gid(2);
  await trio(cid, groupDoc());
  const inv = { iNvItE000001: { iv: 'aXY=', ct: 'Y3Q=', ph: 'a'.repeat(64), ts: Date.now() } };
  for (const d of [{ meta: { ...sealed(0), iv: 'bmV3' } }, { invites: inv }, { pins: [] }]) {
    assert.equal((await upd(B, cid, d)).e, 'denied', 'a member: ' + Object.keys(d)[0]);
    assert.equal((await upd(E, cid, d)).ok, true, 'an admin: ' + Object.keys(d)[0]);
  }
  assert.equal((await upd(B, cid, { ts: 7, last: { ts: 7, sl: 1 } })).ok, true, 'activity stays a member matter');
});

test('set: an admin may write the whole record back but not change an owner-only field in it, or drop ometa', async () => {
  const cid = gid(3);
  await trio(cid, groupDoc({ ometa: sealed(0), reactions: { mode: 'all' } }));
  const cur = await rec(E, cid);
  assert.equal((await E.call('set', { p: 'channels/' + cid, d: { ...cur, pins: [], meta: sealed(0) } })).ok, true, 'admin fields may change');
  const now = await rec(E, cid);
  for (const [f, v] of Object.entries(OWNER_ONLY)) {
    const r = await E.call('set', { p: 'channels/' + cid, d: { ...now, [f]: f === 'ometa' ? { ...sealed(0), iv: 'b3RoZXI=' } : v } });
    assert.equal(r.e, 'denied', `an admin's set may not change "${f}"`);
  }
  const { ometa, ...without } = now;
  assert.ok(ometa);
  assert.equal((await E.call('set', { p: 'channels/' + cid, d: without })).e, 'denied', 'leaving ometa out removes it');
  assert.equal((await A.call('set', { p: 'channels/' + cid, d: { ...now, reactions: { mode: 'off' }, ttl: 60 } })).ok, true, 'the owner may');
  assert.deepEqual((await rec(B, cid)).reactions, { mode: 'off' });
});

test('DMs are unchanged: no owner, pins and the timer stay member matters, and there is no ometa to write', async () => {
  const dm = 'd' + 'O'.repeat(22), m = cap();
  await createChat(A, dm, dmDoc(), { m });
  await B.ok('chat.open', { cid: dm, cap: m });
  assert.equal((await upd(B, dm, { ttl: 3600, pins: [] })).ok, true);
  assert.equal((await upd(B, dm, { reactions: { mode: 'off' } })).e, 'denied');
  assert.equal((await upd(B, dm, { ometa: sealed(0) })).e, 'denied');
  assert.equal((await B.call('chat.rotate', { cid: dm, epoch: 1, keys: { [label()]: wrap() }, cap: cap() })).ok, true);
});

test('ometa: shaped like meta, sealed under an epoch the chat has reached, any one up to the current', async () => {
  assert.equal((await A.call('chat.create', { cid: gid(4), d: groupDoc({ ometa: sealed(1) }), caps: CAPS() })).e, 'invalid', 'created at epoch 0 with ometa from epoch 1');
  assert.equal((await A.call('chat.create', { cid: gid(4), d: groupDoc({ ometa: { e: 0, iv: 'aXY=' } }), caps: CAPS() })).e, 'invalid', 'no ciphertext');
  assert.equal((await A.call('chat.create', { cid: gid(4), d: groupDoc({ ometa: 'x' }), caps: CAPS() })).e, 'invalid');
  await trio(gid(4), groupDoc({ ometa: sealed(0) }));
  for (const e of [1, 2]) await A.ok('chat.rotate', { cid: gid(4), epoch: e, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(e) });
  assert.equal((await upd(A, gid(4), { ometa: sealed(3) })).e, 'invalid', 'an epoch the chat has not reached');
  assert.equal((await upd(A, gid(4), { ometa: { ...sealed(1), e: 32 } })).e, 'invalid');
  for (const e of [1, 0, 2]) assert.equal((await upd(A, gid(4), { ometa: sealed(e) })).ok, true, 'epoch ' + e);
  assert.equal((await upd(A, gid(4), { ts: 9 })).ok, true, 'other edits leave an older ometa alone');
});

test('chat.rotate: an admin rotates, but publishing a key (openKeys) needs the owner', async () => {
  const cid = chid(3);
  await trio(cid, channelDoc());
  const r = await E.call('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(1), openKeys: { 1: 'k'.repeat(44) } });
  assert.equal(r.e, 'denied', 'an admin may not publish a key');
  assert.equal((await rec(A, cid)).epoch, 0, 'and nothing changed');
  assert.equal((await E.call('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(1) })).ok, true, 'a plain rotation is still an admin\'s');
});

test('chat.rotate: the owner may publish a key', async () => {
  const cid = chid(4);
  await trio(cid, channelDoc());
  assert.equal((await A.call('chat.rotate', { cid, epoch: 1, keys: {}, cap: cap(), openKeys: { 1: 'k'.repeat(44) } })).ok, true);
  assert.deepEqual((await rec(A, cid)).openKeys, { 1: 'k'.repeat(44) });
});

test('chat.rotate: a public channel gets a new key only from the owner (its new posts would stop being public)', async () => {
  const cid = chid(5);
  await trio(cid, channelDoc({ visibility: 'public', name: 'News', desc: 'd', owner: 'alice', admins: ['eve'], meta: undefined, openKeys: { 0: 'k'.repeat(44) } }));
  assert.equal((await E.call('chat.rotate', { cid, epoch: 1, keys: {}, cap: cap() })).e, 'denied', 'an admin may not');
  assert.equal((await rec(A, cid)).epoch, 0, 'and nothing changed');
  assert.equal((await A.call('chat.rotate', { cid, epoch: 1, keys: {}, cap: cap() })).ok, true, 'the owner may (making it private starts so)');
});

test('going public drops ometa on the server, also from a page that sends one along', async () => {
  const cid = chid(6);
  await trio(cid, channelDoc({ ometa: sealed(0) }));
  await A.ok('update', { p: 'channels/' + cid, d: { visibility: 'public', meta: null, openKeys: { 0: 'k'.repeat(44) }, name: 'News', owner: 'alice', admins: [] } });
  assert.equal((await rec(A, cid)).ometa, undefined, 'a public channel\'s description is plain');
  const cid2 = chid(7);
  await trio(cid2, channelDoc({ ometa: sealed(0) }));
  const { meta: _m, ...was } = await rec(A, cid2), whole = { ...was, visibility: 'public', openKeys: { 0: 'k'.repeat(44) } };
  await A.ok('set', { p: 'channels/' + cid2, d: whole });
  assert.equal((await rec(A, cid2)).ometa, undefined, 'by set as well');
});

test('no padding a record: sealed lists and invite links have a size, and invite links a number', async () => {
  const cid = gid(8);
  await trio(cid, groupDoc());
  const inv = (ct) => ({ iv: 'aXY=', ct, ph: 'a'.repeat(64), ts: Date.now() });
  assert.equal((await upd(E, cid, { invites: { iNvItE00000A: inv('Y'.repeat(8193)) } })).e, 'invalid', 'an invite blob of over 8 KB');
  assert.equal((await upd(E, cid, { meta: { e: 0, iv: 'aXY=', ct: 'Y'.repeat(262145) } })).e, 'invalid', 'a sealed list of over 256 KB');
  const many = Object.fromEntries(Array.from({ length: 50 }, (_, i) => ['iNv' + String(i).padStart(9, '0'), inv('Y3Q=')]));
  await E.ok('update', { p: 'channels/' + cid, d: { invites: many } });
  assert.equal((await upd(E, cid, { invites: { iNvExtra0001: inv('Y3Q=') } })).e, 'toolarge', 'a 51st link');
  await E.ok('update', { p: 'channels/' + cid, d: { invites: { iNv000000000: null } } });   // revoking one is always fine
  await E.ok('update', { p: 'channels/' + cid, d: { invites: { iNvExtra0001: inv('Y3Q=') } } });
});

test('ometa rides through rotations unchanged and is not in the preview', async () => {
  const cid = gid(5), om = { ...sealed(0), ct: 'b3duZXI=' };
  await trio(cid, groupDoc({ ometa: om }));
  await E.ok('chat.rotate', { cid, epoch: 1, keys: { [label()]: wrap() }, cap: cap(), meta: sealed(1) });
  const after = await rec(E, cid);
  assert.equal(after.epoch, 1);
  assert.deepEqual(after.ometa, om, 'carried as it was');
  const C = await signup(S.url, await makeIdentity('carol'));
  try {
    const pv = (await C.ok('get', { p: 'channels/' + cid })).d;
    assert.equal(pv.ometa, undefined, 'a preview has no ometa');
    assert.equal(pv.meta, undefined);
  } finally { await C.close(); }
});

// ---- the page --------------------------------------------------------------------------------------------------
// app/crypto.js runs whole with stubs for the page names it reaches for at call time (as in review.test.js);
// showMeta and adoptOMeta are lifted out of app/ui.js and bound to it.
function page() {
  const src = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
  const build = new Function('S', 'ls', 'typeOf', 'epochOf', 'keyMap', 'dmPeer', 'validHandle', 'loadDir', 'P', 'saveContacts', 'renderBanner', 'openSetupLogin', 'normPhone', 'dispOk', 'scheduleBackup',
    src + '\nreturn { newIdentity, readMeta, readOMeta, convKey, sealMeta, sealOMeta, sealOMetaFor, ksPut, b64 };');
  const m = new Map();
  const ls = { get: (k, d) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : d), set: (k, v) => { if (v == null) m.delete(k); else m.set(k, JSON.parse(JSON.stringify(v))); } };
  const S = { me: null, keys: new Map(), chanKeys: new Map(), prefs: null, dir: {}, pins: null, ks: null, ksFor: null, dmPeers: {}, rekeying: false };
  const typeOf = (c) => (c && c.type) || 'channel', epochOf = (c) => (c.epoch == null ? 0 : c.epoch);
  const pg = build(S, ls, typeOf, epochOf, (c, e) => (c.keys && c.keys[e]) || null, () => null, (h) => /^[a-z0-9_]{3,20}$/.test(h), async () => false,
    () => S.prefs || (S.prefs = {}), () => {}, () => {}, () => {}, (s) => s, (d, h) => d === h, () => {});
  const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  const a = ui.indexOf('async function showMeta('), b = ui.indexOf('async function chatAnd(');
  assert.ok(a > 0 && b > a, 'app/ui.js has showMeta, then chatAnd');
  const lifted = new Function('S', 'ls', 'typeOf', 'epochOf', 'joinedPublic', 'readMeta', 'readOMeta', 'convKey', 'sealOMetaFor', 'adminSecret', ui.slice(a, b) + '\nreturn { showMeta, adoptOMeta };')(
    S, ls, typeOf, epochOf, () => false, pg.readMeta, pg.readOMeta, pg.convKey, pg.sealOMetaFor, async () => (S.noAdminSecret ? null : new Uint8Array(32)));
  return Object.assign(pg, lifted, { S });
}
async function as(pg, handle) { pg.S.me = { handle, ...(await pg.newIdentity()) }; pg.S.ksFor = null; }
const RAW = [randomBytes(32), randomBytes(32), randomBytes(32)];
async function holdKeys(pg, cid) { for (let e = 0; e < RAW.length; e++) pg.ksPut(cid, e, pg.b64(RAW[e])); }
const OWNER_PART = { name: 'Club', desc: 'The club', photo: null, owner: 'alice', admins: ['eve'] };

test('page: the owner part comes from ometa; what an admin seals into meta can rename nobody and crown nobody', async () => {
  const pg = page(); const cid = gid(20);
  await as(pg, 'bob'); await holdKeys(pg, cid);
  const c = { id: cid, type: 'group', epoch: 2, keys: { 0: {}, 1: {}, 2: {} },
    ometa: await pg.sealOMeta(cid, 0, RAW[0], { ...OWNER_PART, members: ['ignored'] }),
    // Eve (an admin) re-sealed meta at the current epoch, naming herself owner and renaming the group.
    meta: await pg.sealMeta(cid, 2, RAW[2], { name: 'Eve’s', owner: 'eve', admins: ['eve'], members: ['bob', 'eve'], banned: ['alice'] }) };
  const shown = await pg.showMeta(c);
  assert.deepEqual([shown.name, shown.desc, shown.owner, shown.admins], ['Club', 'The club', 'alice', ['eve']], 'ometa sealed at epoch 0 still opens at epoch 2');
  assert.deepEqual([shown.members, shown.banned], [['bob', 'eve'], ['alice']], 'the member and blocked lists stay the admins\' (meta)');
  assert.deepEqual(Object.keys(await pg.readOMeta(c)).sort(), ['admins', 'desc', 'name', 'owner', 'photo'], 'ometa holds the owner part only');

  // Without ometa (a group made before it) the owner part comes from meta, as before.
  const old = await pg.showMeta({ ...c, ometa: undefined });
  assert.deepEqual([old.name, old.owner], ['Eve’s', 'eve']);

  // A meta blob passed off as ometa, an ometa blob passed off as meta, or ometa from an epoch not reached: none opens,
  // and an unreadable ometa still hides meta's owner part.
  const swapped = await pg.showMeta({ ...c, epoch: 0, ometa: await pg.sealMeta(cid, 0, RAW[0], { ...OWNER_PART, owner: 'eve' }) });
  assert.deepEqual([swapped.owner, swapped.admins, swapped.name], ['', [], 'Private group']);
  // An ometa this device can't open (it holds only later keys: added since, with Message backup off) leaves meta's name
  // on show, but names no owner or admins.
  const later = { ...c, ometa: await pg.sealOMeta(cid, 0, randomBytes(32), OWNER_PART) };
  const lv = await pg.showMeta(later);
  assert.deepEqual([lv.name, lv.owner, lv.admins, !!lv._ometa], ['Eve’s', '', [], false]);
  assert.equal((await pg.showMeta(c))._ometa, true, 'an ometa that opens says so');
  assert.equal(await pg.readMeta({ ...c, epoch: 0, meta: c.ometa }), null, 'ometa never reads as meta');
  assert.equal(await pg.readOMeta({ ...c, epoch: 1, ometa: await pg.sealOMeta(cid, 2, RAW[2], OWNER_PART) }), null, 'sealed under epoch 2 while the chat is at 1');
});

test('page: after a preview the chat is opened again only where that can climb: the record names me owner, or nothing only the owner writes says and this device holds the admin secret', async () => {
  const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  const a = ui.indexOf('function noteChatDoc('), b = ui.indexOf('async function onChatEvicted(');
  assert.ok(a > 0 && b > a, 'app/ui.js has noteChatDoc, then onChatEvicted');
  const S = { me: { handle: 'alice' }, chatDocs: new Map(), db: null }, opened = [], climbed = [];
  let held = true, refused = false;
  S.db = { refreshChat: async (cid) => { opened.push(cid); } };
  const showMeta = async (c) => ({ owner: c.namesMe ? 'alice' : c.namesOther ? 'eve' : '', _ometa: !!c.readable });
  const noteChatDoc = new Function('S', 'adminSecret', 'showMeta', 'notOwner', 'climb', ui.slice(a, b) + '\nreturn noteChatDoc;')(
    S, async () => (held ? new Uint8Array(32) : null), showMeta, () => refused, async (c) => { climbed.push(c.id); });
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const preview = { id: 'g1', type: 'group', visibility: 'private', epoch: 2, keys: {}, akeys: { x: 1 } }, whole = { ...preview, meta: sealed(2), ometa: sealed(0) };
  const after = async (rec) => { S.chatDocs.set(rec.id, { ...preview, id: rec.id }); noteChatDoc(rec); await tick(); };
  held = false; await after(whole);
  assert.deepEqual(climbed, [], 'a member (no admin secret, not named owner) has nothing better to open with');
  await after({ ...whole, id: 'g2', namesMe: true, readable: true });
  assert.deepEqual(climbed, ['g2'], 'named owner by what only the owner writes: open again with the owner key, admin secret or not');
  held = true; await after({ ...whole, id: 'g3' });
  assert.deepEqual(climbed, ['g2', 'g3'], 'nothing only the owner writes says who owns it, and this device holds the admin secret: open again (owner key tried)');
  await after({ ...whole, id: 'g4', readable: true, namesOther: true });
  assert.deepEqual(climbed, ['g2', 'g3'], 'an admin named by a readable ometa already opened with the admin key: no second open');
  refused = true; await after({ ...whole, id: 'g5' });
  assert.deepEqual(climbed, ['g2', 'g3'], 'an owner key this device was refused before is not tried again');
  noteChatDoc({ ...whole, id: 'g3' }); await tick(); assert.deepEqual(climbed, ['g2', 'g3'], 'the same record again: nothing');
  S.chatDocs.set('d1', { id: 'd1', type: 'dm', epoch: 1 }); noteChatDoc({ id: 'd1', type: 'dm', epoch: 1, ts: 5 }); await tick();
  assert.deepEqual([climbed, opened], [['g2', 'g3'], []], 'a DM has no description: nothing');
  noteChatDoc({ ...whole, id: 'g3', epoch: 3 }); assert.deepEqual(opened, ['g3'], 'a new epoch still opens again');
});

test('page: a group from before ometa: pages holding the admin secret hand over its blocks, and the page the owner key opens for gives it an ometa naming itself', async () => {
  const pg = page(); const cid = gid(21);
  const writes = [], bans = [], log = [];
  let level = 'member', failBan = false;
  pg.S.db = { refreshChat: async (id) => { log.push('open ' + id); return true; }, chatLevel: () => level,
    doc: (p) => ({ update: async (d) => { log.push('ometa'); writes.push({ p, d }); } }),
    banChat: async (id, h, on) => { if (failBan) throw Object.assign(new Error('offline'), { code: 'offline' }); log.push('ban ' + h); bans.push([id, h, on]); } };
  // Eve (an admin) rewrote meta before the owner's page first loaded it after the update: it names her as the owner.
  const forged = { ...OWNER_PART, owner: 'eve', admins: ['eve'], members: ['alice', 'bob', 'eve'], banned: ['mallory'] };
  const mk = async (id) => ({ id, type: 'group', visibility: 'private', epoch: 1, keys: { 0: {}, 1: {} }, meta: await pg.sealMeta(id, 1, RAW[1], forged) });

  const c = await mk(cid);
  await as(pg, 'bob'); await holdKeys(pg, cid); pg.S.noAdminSecret = true;
  await pg.adoptOMeta(c, await pg.showMeta(c));
  assert.deepEqual(log, [], 'a member holds no admin secret: not even an extra open');

  const c1 = await mk(gid(24)); pg.S.noAdminSecret = false; level = 'admin';
  await as(pg, 'eve'); await holdKeys(pg, c1.id);
  await pg.adoptOMeta(c1, await pg.showMeta(c1));
  assert.deepEqual(log.splice(0), ['open ' + c1.id, 'ban mallory'], 'an admin\'s page hands over the old blocks, and writes no ometa (meta names Eve: no matter)');

  const c2 = await mk(gid(25)); level = 'owner';
  await as(pg, 'alice'); await holdKeys(pg, c2.id);
  await pg.adoptOMeta(c2, await pg.showMeta(c2));
  assert.deepEqual(log.splice(0), ['open ' + c2.id, 'ban mallory', 'ometa'], 'the page the owner key opens for: blocks first, then ometa');
  const om = writes.at(-1).d.ometa;
  assert.equal(om.e, 1, 'sealed under the current epoch');
  const back = await pg.readOMeta({ ...c2, ometa: om });
  assert.equal(back.owner, 'alice', 'the owner is whoever the owner key opens for, not who meta names');
  assert.equal(back.name, OWNER_PART.name);
  await pg.adoptOMeta(c2, await pg.showMeta(c2));
  assert.deepEqual(log, [], 'once per chat per page load');

  for (const x of [{ ...(await mk(gid(26))), ometa: sealed(0) }, { ...(await mk(gid(27))), visibility: 'public' }, { ...(await mk(gid(28))), meta: undefined }]) {
    await holdKeys(pg, x.id); await pg.adoptOMeta(x, await pg.showMeta(x));
  }
  assert.deepEqual(log, [], 'one that has ometa, a public channel, or no meta: nothing');

  const c3 = await mk(gid(29)); failBan = true;
  await holdKeys(pg, c3.id); await pg.adoptOMeta(c3, await pg.showMeta(c3));
  assert.deepEqual(log.splice(0), ['open ' + c3.id], 'a block that could not be handed over: no ometa, so the next load tries again');

  level = 'member';   // held at member level (the account is not secured)
  const c4 = await mk(gid(30)); await holdKeys(pg, c4.id); failBan = false;
  await pg.adoptOMeta(c4, await pg.showMeta(c4));
  assert.deepEqual(log.splice(0), ['open ' + c4.id], 'not opened at owner or admin level: nothing handed over, nothing written');

  // An ometa sealed under an older epoch: the owner's page seals it again under the current one (a device added since
  // holds only the later keys), keeping what it says; an admin's page leaves it.
  const c5 = { id: gid(31), type: 'group', visibility: 'private', epoch: 1, keys: { 0: {}, 1: {} }, meta: await pg.sealMeta(gid(31), 1, RAW[1], forged), ometa: await pg.sealOMeta(gid(31), 0, RAW[0], OWNER_PART) };
  await holdKeys(pg, c5.id); level = 'admin';
  await pg.adoptOMeta(c5, await pg.showMeta(c5));
  assert.deepEqual(log.splice(0), [], 'an admin leaves it');
  level = 'owner';
  await pg.adoptOMeta({ ...c5, epoch: 1, id: c5.id }, await pg.showMeta(c5));
  assert.deepEqual(log, [], 'once per chat and epoch per page load');
  const c6 = { ...c5, id: gid(32), meta: await pg.sealMeta(gid(32), 1, RAW[1], forged), ometa: await pg.sealOMeta(gid(32), 0, RAW[0], OWNER_PART) };
  await holdKeys(pg, c6.id);
  await pg.adoptOMeta(c6, await pg.showMeta(c6));
  assert.deepEqual(log.splice(0), ['ometa'], 'the owner\'s page seals it again, with no extra open');
  const again = await pg.readOMeta({ ...c6, ometa: writes.at(-1).d.ometa });
  assert.deepEqual([writes.at(-1).d.ometa.e, again.owner, again.admins, again.name], [1, 'alice', ['eve'], 'Club'], 'under epoch 1, saying what it said');
  await pg.adoptOMeta({ ...c6, ometa: writes.at(-1).d.ometa }, await pg.showMeta({ ...c6, ometa: writes.at(-1).d.ometa }));
  assert.deepEqual(log, [], 'up to date: nothing');
});

test('what members and admins write leaves room for the owner\'s own part', async () => {
  const cid = gid(9);
  await trio(cid, groupDoc());
  const junk = (n) => Object.fromEntries(Array.from({ length: n }, () => [label(), wrap()]));
  let refused = null;
  for (let i = 0; i < 40 && !refused; i++) { const r = await upd(B, cid, { keys: { 0: junk(500) } }); if (!r.ok) refused = r.e; }
  assert.equal(refused, 'toolarge', 'wraps stop at three quarters');
  const inv = (i) => ({ iv: 'aXY=', ct: 'Y'.repeat(8000), ph: 'a'.repeat(64), ts: Date.now() });
  let last = null;
  for (let i = 0; i < 50 && last !== 'toolarge'; i++) { const r = await upd(E, cid, { invites: { ['iNv' + String(i).padStart(9, '0')]: inv(i) } }); last = r.ok ? 'ok' : r.e; }
  let metaBig = await upd(E, cid, { meta: { e: 0, iv: 'aXY=', ct: 'Y'.repeat(250000) } });
  assert.ok(last === 'toolarge' || metaBig.e === 'toolarge', 'invite links and sealed lists stop short of the owner\'s room');
  assert.equal((await upd(A, cid, { ometa: { e: 0, iv: 'aXY=', ct: 'Y'.repeat(200000) } })).ok, true, 'the owner\'s ometa still fits');
});
