// Channel member privacy, the page half that ships first (SPEC.md 5.3, 5.6): in any channel only the owner and the admins may
// learn who the subscribers are, so the server hands a private channel's sealed member list (`meta`) to no connection below admin
// level (channel-members.test.js: a channel record reaches such a connection without `meta`, on get and mget, in a watch's first
// answer and in every change pushed). The pages here run on the test server with that rule, and where a test says so on the server
// before it (today's server, the kit's oldServer), where everything behaves as before. A subscriber's page counts itself a member
// by the level its current key gives the connection and names the read marks of the owner, the admins and itself alone, whatever
// list its copy carries (under the rule the server hands it no read mark, channel-privacy.test.js), and counts every reaction and
// vote naming nobody's but its own (channel-acts-page.test.js); a link
// joiner's page heals its join card with no list to read; a device removal on a subscriber's page writes the dev card; an admin's
// page never seals a member list from a copy of the record that has none; a page no longer an admin forgets who waits to join and
// whose dev cards it acted on. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { b64u, lift, mkBuild, world, makeChannel, linkOf, oldServer } from './channel-history-kit.js';
import { sleep } from './helpers.js';

// The page's own code beyond the kit's, reached through S: the chat watch (watchInbox, with the note rule, as
// channel-history-removal.test.js lifts it), read marks (markRead, writeSeen, readSide, readCount), whose marks, reactions and
// votes a page names (tagPeople), reactions and votes (openAct, onActs, reactNode, pollNode), the chat menu (convMenu), Channel info
// (openConvInfo), unban, reconcileSvc and rekeyChat. Elements it makes take attributes and styles.
const built = mkBuild([
  lift('const isBlocked=', '\n'), lift('async function noteOk(', '/* Blocking'), lift('function notePointer(', '/* ---------- voice calls'),
  lift('const curConv=', '\n'), lift('const canPost=', '\n'), lift('const lastRead=', 'async function writeSeen('), lift('async function writeSeen(', 'const typeOf='),
  lift('const sideSeq=', '/* The on-screen keyboard'), lift('let msgSeq=0;', 'async function renderConv('),
  lift('const EMOJIS=', 'async function setAct('), lift('function openAct(', 'let actSeq=0;'), lift('let actSeq=0;', 'function refreshNodes('), lift('function refreshNodes(', '\n'),
  lift('function reactNode(', 'function openPollCreate('), lift('function convMenu(', 'function openConv('), lift('function openConvInfo(', 'function pickPhoto('),
  lift('async function unban(', 'const reconciled='), lift('const reconciled=', 'function noteAccepted('),
  "const dmInfo=()=>null,setDmInfo=()=>{},noKeyNotice=()=>{},ownNote=dropPointer,document={hidden:false},updateTitle=()=>{},isRequest=()=>false,isMuted=()=>false,openSearch=()=>{},openMediaGallery=()=>{},html=(t,c)=>el(t,c,''),isOnline=()=>false,userAvatar=()=>({}),lastSeen=()=>'',FEATURES={};",
  "Object.assign(S,{cache:new Map(),agg:new Map(),reads:{},posts:[],unread:new Map(),readWritten:new Map(),watchInbox,ownNote:cid=>ownNote(S.me.handle,{t:'invite',cid,from:S.me.handle,type:'channel'}),isMember,markRead,writeSeen,readSide,readCount,tagPeople,openAct,onActs,reactNode,pollNode,convMenu,openConvInfo,unban,reconcileSvc,rekeyChat});",
].join('\n'));
const build = (env) => built({ ...env, el: (...a) => Object.assign(env.el(...a), { setAttribute() {}, style: {}, insertAdjacentHTML() {} }) });

const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
async function until(fn, what, ms = 6000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(40); } }
// X's page with the channel open: its list copy (watchInbox's shown) where convById and curConv find it.
const open = async (X, cid) => { const sh = await X.shown(cid); X.S.convs = [{ ...sh, id: cid }]; X.S.chan = cid; return sh; };
const actsOf = async (X, cid) => (await X.S.db.collection('channels/' + cid + '/acts').limit(100).get()).docs.map((d) => ({ _id: d.id, ...d.data() }));
const readsOf = async (X, cid) => (await X.S.db.collection('channels/' + cid + '/reads').limit(100).get()).docs;
const label = (it) => (typeof it.label === 'function' ? it.label() : it.label);
// What onChatEvicted keeps until the watch brings the whole record: the fields a connection with no level gets (SPEC.md 5.5).
const previewOf = (cid, d) => { const t = { id: cid }; for (const f of ['type', 'visibility', 'epoch', 'keys', 'akeys', 'openKeys']) if (d[f] !== undefined) t[f] = d[f]; return t; };
// X's chat watch over a note of its own for each chat, as a start runs it; resolves once every chat shows.
const watchWorld = (fn) => world({}, async (w) => { w.stops = []; try { await fn(w); } finally { for (const s of w.stops) s(); } });
async function watching(w, X, cids) {
  X.S.contactsReady = true; X.S.vaultOk = true; X.S.prefs = X.S.prefs || {};
  for (const cid of cids) await X.S.ownNote(cid);
  const lists = []; w.stops.push(X.S.watchInbox(X.S.me, (l) => lists.push(l.map((c) => c.id))));
  await until(() => cids.every((cid) => (lists.at(-1) || []).includes(cid)), X.handle + '\'s chats to show');
  return lists;
}
// As channel-history-links.test.js: a second device of X's account, trusted, and one of X's page's own.
const dirOf = (X) => ({ handle: X.handle, ecdh: X.id.ecdh, sig: X.id.sig, kv: 1 });
async function twoDevices(X) {
  X.S.ids = []; const other = await X.ensureDev({ ...X.id, handle: X.handle });
  X.S.ids = []; await X.ensureDev(X.S.me); X.S.me.trust = [other.id];
  X.S.dir[X.handle] = { ...dirOf(X), devs: { [other.id]: X.devEntry(other) } };
  return other;
}
// As channel-history-removal.test.js: the account's new keys as a removal's keys, write and mirror stages leave them.
async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}

const POST = 'pOsT00000001', POLL = 'pOsT00000002', FIRE = '\u{1F525}', HEART = '\u2764\uFE0F', UP = '\u{1F44D}';
const putPosts = (A, cid) => Promise.all([POST, POLL].map((id) => A.S.db.doc('channels/' + cid + '/posts/' + id).set({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: 'a'.repeat(64), on: 0 })));

for (const rule of [false, true]) test(`M5 ${rule ? '(meta withheld below admin)' : '(today\'s server, meta to every member)'}: a subscriber's page counts itself a member and shows Mute and Leave, writes its read mark and ${rule ? 'reads none back (the server\'s rule)' : 'names the owner\'s and its own of every mark today\'s server hands it'}, counts every reaction and vote and names only its own, reacts and takes it back, votes, wraps the key for its other device, and writes no meta; no list is invented; the owner's page counts everyone`, async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), C = await w.page('carol', { build });
    await makeChannel(A, cid, ['alice', 'bob', 'carol']); await putPosts(A, cid);
    if (!rule) oldServer(w.T);
    const rec = await B.sync(cid), sh = await open(B, cid);
    assert.equal(!!rec.meta, !rule, rule ? 'Bob\'s copy has no meta' : 'Bob\'s copy has meta');
    assert.deepEqual([sh.name, sh.owner, sh.members, !!sh._unlocked, B.S.db.chatLevel(cid)], ['History', 'alice', rule ? [] : ['alice', 'bob', 'carol'], !rule, 'member'], 'name and owner from ometa; the members as the record gives them, none invented');
    assert.equal(B.S.isMember(sh), true, 'a member');
    assert.ok(B.S.convMenu(sh).some((it) => label(it) === 'Mute'), 'Mute in the chat menu');
    B.spy.els.length = 0; B.S.openConvInfo(cid);
    assert.ok(B.spy.els.some((e) => e.tag === 'button' && e.textContent === 'Leave channel'), 'Leave in Channel info');

    // read marks: Bob's page marks the post read as scrolling to the bottom does; the owner and Carol mark it too. Under the rule only the
    // owner and the admins read them back: the server answers his page as if there were none. Today's server hands him every mark
    B.S.posts = [{ _id: POST, from: 'alice', ts: Date.now() - 60e3 }]; const t0 = B.S.posts[0].ts;
    B.S.markRead();
    const am = await until(async () => { const d = await readsOf(A, cid); return d.length === 1 && d; }, 'Bob\'s read mark');
    const tags = await A.tagMap({ ...(await A.sync(cid)), members: (await A.meta(cid)).members }, 0);
    assert.equal(tags[am[0].id.split('~')[1]], 'bob', 'filed under his tag');
    await A.S.writeSeen(await A.shown(cid), t0 + 1); await C.S.writeSeen(await C.shown(cid), t0 + 2);
    assert.equal((await readsOf(A, cid)).length, 3, 'the owner reads all three');
    let seen; await B.S.readSide(cid, await readsOf(B, cid), 'hush-seen-v1', (r) => { seen = r; });
    assert.deepEqual(Object.keys(seen || {}).sort(), rule ? [] : ['alice', 'bob'], rule ? 'his page names no one\'s, his own included' : 'his page names the owner\'s and his own, never Carol\'s');
    B.S.reads = seen;
    assert.equal(B.S.readCount(B.S.posts[0]), rule ? 0 : 1, rule ? 'so it draws no eye' : 'the eye counts his own view alone (the owner wrote the post)');

    // reactions: the owner's, Carol's and his own
    await A.setAct(await A.sync(cid), POST, 'r', { emoji: HEART }); await C.setAct(await C.sync(cid), POST, 'r', { emoji: UP }); await B.setAct(rec, POST, 'r', { emoji: FIRE });
    await B.S.onActs(await actsOf(B, cid));
    let a = B.S.agg.get(POST) || { r: {} };
    assert.deepEqual([a.r, a.myR], [{ [HEART]: 1, [UP]: 1, [FIRE]: 1 }, FIRE], 'every reaction counts, and only his own is his');
    A.S.convs = [{ ...(await A.shown(cid)), id: cid }]; A.S.chan = cid; await A.S.onActs(await actsOf(A, cid));
    assert.deepEqual((A.S.agg.get(POST) || {}).r, { [HEART]: 1, [UP]: 1, [FIRE]: 1 }, 'the owner\'s page counts everyone\'s');
    const rn = B.S.reactNode({ _id: POST }); B.spy.els.length = 0; rn._refresh();
    const mine = B.spy.els.find((e) => e.tag === 'button' && e.textContent === FIRE + ' 1');
    assert.ok(mine && !mine.disabled && /\bme\b/.test(mine.cls), 'his reaction shows as his, and can be pressed');
    await mine.onclick({ stopPropagation() {} });
    await B.S.onActs(await actsOf(B, cid));
    a = B.S.agg.get(POST) || { r: {} };
    assert.deepEqual([a.myR, a.r[FIRE]], [null, undefined], 'pressed again: taken back');

    // a poll: he votes, sees his vote, and may take it back
    const pn = B.S.pollNode({ _id: POLL }, { q: 'Lunch?', opts: ['Soup', 'Salad'], multi: false });
    B.spy.els.length = 0; pn._refresh();
    const opts = B.spy.els.filter((e) => e.tag === 'button' && e.cls === 'po');
    assert.deepEqual([opts.length, B.spy.els.some((e) => e.textContent === 'Join to vote')], [2, false], 'he can vote');
    opts[1].onclick();
    await until(async () => (await actsOf(B, cid)).some((x) => x.post === POLL), 'Bob\'s vote');
    await B.S.onActs(await actsOf(B, cid));
    assert.deepEqual((B.S.agg.get(POLL) || {}).myV, [1], 'his vote, as his');
    B.spy.els.length = 0; pn._refresh();
    assert.ok(B.spy.els.some((e) => e.textContent === 'Retract vote'));

    // his other device: the current key, wrapped for it (syncWraps, as opening the chat runs it)
    await twoDevices(B); const n0 = Object.keys((await A.sync(cid)).keys[0]).length;
    B.spy.updates.length = 0; await B.syncWraps(await B.shown(cid));
    assert.deepEqual([B.spy.updates, Object.keys((await A.sync(cid)).keys[0]).length], [[['keys']], n0 + 1], 'one more wrap of the current key');
    assert.deepEqual(B.spy.updates.flat().filter((k) => k === 'meta'), [], 'never meta');
  });
});

for (const rule of [false, true]) test(`M5 ${rule ? '(meta withheld below admin)' : '(today\'s server, meta to every member)'}: in a channel it neither owns nor runs, a page names the read marks of the owner, the admin and itself, and no other subscriber's, ${rule ? 'as on today\'s server (here no read mark at all: the server hands it none),' : 'though its copy carries the whole list,'} counts every reaction and vote the same as the owner's and the admin's pages, naming only its own, and loads no profile of theirs; the owner's and the admin's pages name everyone's read marks; a group's members and a one-on-one chat's person are named as before`, async () => {
  await world({}, async (w) => {
    const { cid } = w, gid = 'g' + cid.slice(1), t0 = Date.now() - 60e3, PARTY = '\u{1F389}';
    const A = await w.page('alice', { owner: true, build }), X = await w.page('xena', { build }), B = await w.page('bob', { build }), C = await w.page('carol', { build });
    await makeChannel(A, cid, ['alice', 'xena', 'bob', 'carol'], ['xena']); await makeChannel(A, gid, ['alice', 'bob', 'carol'], [], 'group'); await putPosts(A, cid);
    if (!rule) oldServer(w.T);
    const sh = await open(B, cid);
    assert.deepEqual([B.S.db.chatLevel(cid), sh.owner, sh.admins, sh.members], ['member', 'alice', ['xena'], rule ? [] : ['alice', 'xena', 'bob', 'carol']], 'Bob subscribes; his copy names the owner, the admin and ' + (rule ? 'no list' : 'the whole list, as today\'s server hands it'));
    // in the channel and in the group each of them reads the owner's post (writeSeen, as markRead runs it), reacts to it and votes in a poll
    const emoji = { alice: HEART, xena: PARTY, bob: FIRE, carol: UP }, vote = { alice: [0], xena: [1], bob: [0], carol: [1] };
    for (const [id, Ps] of [[cid, [A, X, B, C]], [gid, [A, B, C]]]) {
      for (const [i, P] of Ps.entries()) { const v = await open(P, id); await P.S.writeSeen(v, t0 + 1 + i); await P.setAct(v, POST, 'r', { emoji: emoji[P.handle] }); await P.setAct(v, POLL, 'v', { opts: vote[P.handle] }); }
    }
    // what a page with the chat open names: whose read marks (readSide, as the read-mark watch runs it) and the eye of the owner's
    // post (readCount), the reactions and votes it counts (onActs, as the acts watch runs it); and whether it holds Carol's profile
    const names = async (P, id) => {
      await open(P, id); let seen = {}; await P.S.readSide(id, await readsOf(P, id), 'hush-seen-v1', (r) => { seen = r; }); P.S.reads = seen;
      await P.S.onActs(await actsOf(P, id)); const r = P.S.agg.get(POST) || {}, v = P.S.agg.get(POLL) || {};
      return { read: Object.keys(seen).sort(), eye: P.S.readCount({ from: 'alice', ts: t0 }), r: r.r, myR: r.myR, v: v.v, voters: v.voters, myV: v.myV, carol: !!P.S.dir.carol };
    };
    assert.deepEqual([!!B.S.dir.carol, await names(B, cid)], [false, { read: rule ? [] : ['alice', 'bob', 'xena'], eye: rule ? 0 : 2, r: { [HEART]: 1, [PARTY]: 1, [FIRE]: 1, [UP]: 1 }, myR: FIRE, v: { 0: 2, 1: 2 }, voters: 4, myV: [0], carol: false }],
      'Bob\'s page counts everyone\'s reactions and votes, names ' + (rule ? 'no read mark' : 'the owner\'s, the admin\'s and his own read marks and never Carol\'s') + ', so it checks no signature of hers and holds no profile of hers for a search box to find');
    const every = { read: ['alice', 'bob', 'carol', 'xena'], eye: 3, r: { [HEART]: 1, [PARTY]: 1, [FIRE]: 1, [UP]: 1 }, v: { 0: 2, 1: 2 }, voters: 4, carol: true };
    assert.deepEqual([!!X.S.dir.carol, await names(X, cid)], [false, { ...every, myR: PARTY, myV: [1] }], 'the admin\'s page names everyone\'s read marks, loading Carol\'s profile to check hers, and counts the same');
    assert.deepEqual(await names(A, cid), { ...every, myR: HEART, myV: [0] }, 'so does the owner\'s');
    assert.deepEqual(await names(B, gid), { read: ['alice', 'bob', 'carol'], eye: 2, r: { [HEART]: 1, [FIRE]: 1, [UP]: 1 }, myR: FIRE, v: { 0: 2, 1: 1 }, voters: 3, myV: [0], carol: true }, 'in the group Bob\'s page names every member\'s, Carol\'s too, as before');
    assert.deepEqual(B.S.tagPeople({ id: 'dBobDana0000', type: 'dm', members: ['bob', 'dana'] }), ['bob', 'dana'], 'a one-on-one chat: the person and himself, as before');
  });
});

test('M5 (meta withheld below admin): a subscriber\'s page that counts itself a member still invents no list: a removal from it is refused before anything is wrapped (rotateTo\'s notmember)', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), C = await w.page('carol', { build }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    const sh = await open(C, cid);
    assert.deepEqual([C.S.isMember(sh), sh.members], [true, []]);
    await assert.rejects(C.kickMember(cid, 'bob', { ban: false }), (e) => e.message === 'notmember');
    assert.deepEqual([C.spy.wrapAll, C.spy.rotate, C.spy.updates], [[], [], []], 'nothing wrapped or written');
  });
});

test('M6 (meta withheld below admin): healCard with no list to read writes again only a join card this device noted at the current epoch, at most once a week: a listed subscriber with nothing noted writes none, a link joiner whose card is gone writes his, none once a key change included him, none over a pending dev card; a copy with no list and nothing noted uses up no attempt of the load', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), C = await w.page('carol', { build });
    let B = await w.page('bob', { build }); const D = await w.page('dave', { build });
    await makeChannel(A, cid, ['alice', 'carol']);
    const sc = await C.shown(cid);
    assert.deepEqual([sc.members, !!sc._unlocked, await C.holds(cid, 0)], [[], false, true], 'Carol: no list to read, the key held');
    await C.healCard(sc);
    assert.deepEqual(C.spy.card, [], 'a listed subscriber with nothing noted writes no card');

    await B.joinPrivate(cid, await linkOf(A, cid));
    assert.deepEqual([B.ls.get('hush:cardsOut:bob', {})[cid].k, B.ls.get('hush:cardsOut:bob', {})[cid].e], ['join', 0], 'his join, noted');
    for (const d of (await A.S.db.collection('channels/' + cid + '/roll').limit(10).get()).docs) await A.S.db.doc('channels/' + cid + '/roll/' + d.id).delete();   // gone from the server (30 days, say)
    const weekOld = () => B.ls.set('hush:cardsOut:bob', { [cid]: { ...B.ls.get('hush:cardsOut:bob', {})[cid], sent: Date.now() - 8 * 864e5 } });
    weekOld(); B = await w.reload(B);
    await B.healCard(await B.shown(cid)); await B.healCard(await B.shown(cid));
    assert.equal(B.spy.card.length, 1, 'his card again, once');
    assert.deepEqual(await A.cards(cid), ['bob:join']);
    B = await w.reload(B); await B.healCard(await B.shown(cid));
    assert.equal(B.spy.card.length, 0, 'a join sent this week stands');

    await A.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'carol', 'bob'], 'the owner\'s page lists him through his link');
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    weekOld(); B = await w.reload(B);
    const s1 = await B.shown(cid);
    assert.deepEqual([B.epochOf(s1), await B.holds(cid, 1)], [1, true]);
    await B.healCard(s1);
    assert.equal(B.spy.card.length, 0, 'after a key change that included him: none, however old his noted join');

    await D.joinPrivate(cid, await linkOf(A, cid)); await D.writeCard(await D.sync(cid), 'dev');
    const D2 = await w.reload(D); await D2.healCard(await D2.shown(cid));
    assert.deepEqual([D2.spy.card, (await A.cards(cid)).includes('dave:dev')], [[], true], 'never over a pending dev card');

    // a copy with no list and nothing noted uses up no attempt: with the list back (the rule rolled back), the same load heals a joiner it leaves out
    const E = await w.page('erin', { build }); await E.joinPrivate(cid, await linkOf(A, cid)); E.ls.set('hush:cardsOut:erin', null);   // a joiner from release 91: nothing noted
    const n = E.spy.card.length; await E.healCard(await E.shown(cid));
    assert.equal(E.spy.card.length, n, 'no list, nothing noted: none');
    oldServer(w.T); const se = await E.shown(cid);
    assert.deepEqual([!!se._unlocked, !!se._unlisted], [true, true]);
    await E.healCard(se);
    assert.equal(E.spy.card.length, n + 1, 'left out of the list he reads: his card again, in the same load');
  });
});

test('M6 (meta withheld below admin): the chat watch heals a link joiner whose card is gone, with no list to read, and the owner\'s page then lists him', async () => {
  await watchWorld(async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true });
    let B = await w.page('bob', { build });
    await makeChannel(A, cid, ['alice']);
    await B.joinPrivate(cid, await linkOf(A, cid));
    for (const d of (await A.S.db.collection('channels/' + cid + '/roll').limit(10).get()).docs) await A.S.db.doc('channels/' + cid + '/roll/' + d.id).delete();
    B.ls.set('hush:cardsOut:bob', { [cid]: { ...B.ls.get('hush:cardsOut:bob', {})[cid], sent: Date.now() - 8 * 864e5 } });
    B = await w.reload(B);
    await watching(w, B, [cid]);
    await until(() => B.spy.card.length === 1, 'Bob\'s page to write his join card again');
    assert.deepEqual(await A.cards(cid), ['bob:join']);
    await A.run(cid);
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob']);
  });
});

test('M6 (meta withheld below admin): a device removal on a subscriber\'s page writes the dev card, never a join card, with no list to read: a listed subscriber\'s gets the key changed at the owner\'s next open; an unlisted link joiner\'s acts on nothing, and he waits for an Add (already so: this pins it)', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), C = await w.page('carol', { build }), D = await w.page('dave', { build });
    await makeChannel(A, cid, ['alice', 'carol']);
    await D.joinPrivate(cid, await linkOf(A, cid));   // no admin's page has read his card yet: not listed
    const x = { cid, type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], name: 'History', unlocked: true };
    for (const X of [C, D]) assert.equal(await X.holds(cid, 0), true, X.handle + ' holds the key, in his key store');
    for (const X of [C, D]) {
      await newKeys(X);
      assert.deepEqual(await X.S.rekeyChat(x, X.handle, async () => {}, await X.sync(cid)), { cid, card: 'dev' }, X.handle + ': the dev card');
      assert.equal(X.ls.get('hush:cardsOut:' + X.handle, {})[cid].k, 'dev');
    }
    assert.deepEqual((await A.cards(cid)).sort(), ['carol:dev', 'dave:dev']);
    await A.run(cid);
    assert.deepEqual([(await A.sync(cid)).epoch, (await A.meta(cid)).members, await C.holds(cid, 1), await D.holds(cid, 1)], [1, ['alice', 'carol'], true, false]);
  });
});

test('M4 (today\'s server): Add and Unblock started from the eviction preview, a copy with no meta, read the record again and keep every subscriber', async () => {
  await world({}, async (w) => {
    oldServer(w.T);
    const { cid } = w, A = await w.page('alice', { owner: true, build });
    for (const h of ['bob', 'carol', 'dave', 'zoe']) await w.page(h);
    await makeChannel(A, cid, ['alice', 'bob', 'carol', 'dave']);
    await read(A, cid); await A.kickMember(cid, 'dave');
    assert.deepEqual([(await A.meta(cid)).members, (await A.meta(cid)).banned], [['alice', 'bob', 'carol'], ['dave']], 'Dave removed and blocked');
    A.S.chatDocs.set(cid, previewOf(cid, await A.sync(cid)));
    await A.addSubs(cid, new Set(['zoe']));
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'carol', 'zoe'], 'Add: everyone kept, Zoe added');
    A.S.chatDocs.set(cid, previewOf(cid, await A.sync(cid)));
    await A.S.unban(cid, 'dave');
    const m = await A.meta(cid);
    assert.deepEqual([m.members, m.banned], [['alice', 'bob', 'carol', 'zoe'], []], 'Unblock: everyone kept, the block lifted');
  });
});

test('M4 (today\'s server): reconcileSvc on a private group\'s copy with no list read (the eviction preview) writes nothing; from the whole record it lists the joiner as before', async () => {
  await world({}, async (w) => {
    oldServer(w.T);
    const g = 'g' + w.cid.slice(1), A = await w.page('alice', { owner: true, build }); await w.page('bob'); await w.page('zoe');
    await makeChannel(A, g, ['alice', 'bob'], [], 'group');
    const note = { _id: 'pJoIn0000001', svc: 'join', from: 'zoe', e: 0 }, prev = previewOf(g, await A.sync(g));
    A.S.chatDocs.set(g, prev);
    await A.S.reconcileSvc({ ...(await A.showMeta(prev)), id: g }, [note]);
    assert.deepEqual([(await A.meta(g)).members, A.spy.updates], [['alice', 'bob'], []], 'no list read: nothing written');
    await A.S.reconcileSvc({ ...(await A.shown(g)), id: g }, [{ ...note, _id: 'pJoIn0000002' }]);
    assert.deepEqual((await A.meta(g)).members, ['alice', 'bob', 'zoe'], 'from the list read: the joiner listed');
  });
});

test('M4 (meta withheld below admin): a subscriber just made admin adds from the copy he read as a subscriber and keeps every subscriber; a page at member level refuses Add and Unblock (nokey) before writing anything', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob', { build }), C = await w.page('carol', { build });
    await w.page('zoe'); await w.page('zed');
    await makeChannel(A, cid, ['alice', 'bob', 'carol']);
    await read(A, cid); await read(B, cid);
    assert.equal(B.S.chatDocs.get(cid).meta, undefined, 'Bob\'s page keeps the copy it read as a subscriber');
    await A.setAdmins(cid, ['bob']);
    await B.S.db.refreshChat(cid);   // his page opens the channel again with the admin key (capsFor)
    const { meta, ...pushed } = await B.freshChan(cid);   // the copy the chat watch brought while he was still a subscriber: the owner's list naming him, no meta
    B.S.chatDocs.set(cid, pushed); await B.showMeta(pushed); await B.rolesQ.get(cid);   // as the watch shows it (noteChatDoc, showMeta)
    assert.deepEqual([B.S.db.chatLevel(cid), !!meta, B.S.chatDocs.get(cid).meta, B.rolesOf(cid).a], ['admin', true, undefined, ['bob']], 'an admin now, his page holding a copy with no meta');
    await B.addSubs(cid, new Set(['zoe']));
    assert.deepEqual((await A.meta(cid)).members, ['alice', 'bob', 'carol', 'zoe'], 'everyone kept, Zoe added');

    await C.sync(cid);
    await assert.rejects(C.addSubs(cid, new Set(['zed'])), (e) => e.message === 'nokey', 'Add: no list to read, even afresh');
    await assert.rejects(C.S.unban(cid, 'zed'), (e) => e.message === 'nokey', 'Unblock too');
    assert.deepEqual([C.spy.ban, C.spy.updates], [[], []], 'no block lifted, nothing written');
  });
});

test('M10: a page no longer an admin of a private channel drops who waits to join (hush:wait) and whose dev cards it acted on (roles dk) once its chat watch sees the owner\'s list without it; while it is an admin it keeps both', async () => {
  await watchWorld(async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), E = await w.page('erin', { build }); await w.page('bob');
    await makeChannel(A, cid, ['alice', 'erin', 'bob'], ['erin']);
    await read(A, cid); await read(E, cid);
    assert.equal(E.S.db.chatLevel(cid), 'admin');
    E.noteWait(cid, 'History', ['zed']);   // as rollRun notes who waits to join
    const m = E.ls.get('hush:roles:erin', {}); m[cid] = { ...m[cid], dk: { bob: 2 } }; E.ls.set('hush:roles:erin', m);   // as rotateTo notes a dev card it acted on
    const kept = () => [!!E.ls.get('hush:wait:erin', {})[cid], (E.rolesOf(cid) || {}).dk];
    await watching(w, E, [cid]);
    assert.deepEqual(kept(), [true, { bob: 2 }], 'an admin keeps both');
    await A.setAdmins(cid, []);
    await until(() => { const [wt, dk] = kept(); return !wt && !dk; }, 'Erin\'s page to drop the waiting list and dk');
    const r = E.rolesOf(cid);
    assert.deepEqual([r.o, r.a, r.s, E.S.db.chatLevel(cid)], ['alice', [], 1, 'member'], 'the rest of her roles record stays, as of the owner\'s list');
  });
});
