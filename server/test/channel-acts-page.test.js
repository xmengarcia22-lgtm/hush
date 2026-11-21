// Reactions and votes in a channel, the page's half (SPEC.md 5.4), the real page code (channel-history-kit.js) against a real server.
// A page writes a channel's reaction or vote with chat.act: no tag, no signature, one size, sealed under the chat key at the row's
// epoch with associated data naming the chat, the post and the kind. Everyone who can read the channel counts the same rows the same
// way: no member list, no signature, no level. A page learns which rows are its own from chat.mine, on every device of the account
// and on no other account's page. Rows that do not open or do not validate count for nothing; so do rows from before this change, and
// a row copied to another slot counts once. A group keeps its signed rows under member tags. Page 95 on the new server (its code is
// fixtures/page95-acts.txt, 2fefb45 app/ui.js) is refused with its normal toast and keeps its watches; the new page on a server that
// does not know the ops shows the same toast and goes on. A page draws a channel's counts first, with the ids it already knows as its own,
// and asks chat.mine after that, so a slow answer holds no count back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { lift, mkBuild, world, makeChannel, linkOf } from './channel-history-kit.js';
import { sleep } from './helpers.js';

const LIFTS = [
  lift('const curConv=', '\n'), lift('const tagPeople=', '\n'),
  lift('const EMOJIS=', 'async function setAct('), lift('function openAct(', 'let actSeq=0;'), lift('let actSeq=0;', 'function refreshNodes('), lift('function refreshNodes(', '\n'),
  lift('function reactNode(', 'function openPollCreate('),
  'Object.assign(S,{cache:new Map(),agg:new Map(),isMember,openAct,onActs,reactNode,pollNode});',
];
const wrapEl = (b) => (env) => b({ ...env, el: (...a) => Object.assign(env.el(...a), { setAttribute() {}, style: {}, insertAdjacentHTML() {} }) });
const build = wrapEl(mkBuild(LIFTS.join('\n')));
const build95 = wrapEl(mkBuild([...LIFTS, readFileSync(new URL('./fixtures/page95-acts.txt', import.meta.url), 'utf8')].join('\n')));

const POST = 'pOsT00000001', POLL = 'pOsT00000002', FIRE = '\u{1F525}', HEART = '❤️', UP = '\u{1F44D}', PARTY = '\u{1F389}';
const postDoc = (e = 0) => ({ sl: 1, ts: Date.now(), e, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: 'a'.repeat(64), on: 0 });
const posts = (A, cid, e = 0, list = [POST, POLL]) => Promise.all(list.map((id) => A.S.db.doc(`channels/${cid}/posts/${id}`).set(postDoc(e))));
async function until(fn, what, ms = 6000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(40); } }
const open = async (X, cid) => { const sh = await X.shown(cid); X.S.convs = [{ ...sh, id: cid }]; X.S.chan = cid; return sh; };
const actsOf = async (X, cid) => (await X.S.db.collection(`channels/${cid}/acts`).limit(100).get()).docs.map((d) => ({ _id: d.id, ...d.data() }));
const counted = (P, post = POST, poll = POLL) => { const r = P.S.agg.get(post) || {}, v = P.S.agg.get(poll) || {}; return { r: r.r || {}, myR: r.myR ?? null, v: v.v || {}, voters: v.voters || 0, myV: v.myV ?? null }; };
const seen = async (P, cid) => { await open(P, cid); await P.S.onActs(await actsOf(P, cid)); return counted(P); };
const AD = (cid, post, kind) => Buffer.from(`hush-act-v3|${cid}|${post}|${kind}`);
const rawOf = async (P, c, e) => { const k = await P.convKey(c, e); return k.key; };
// A row sealed as a page seals one (or with `over` where a test wants it wrong): what a modified app could hand the server, or a server hand a page.
async function sealRow(P, c, post, kind, payload, over = {}) {
  const iv = crypto.getRandomValues(new Uint8Array(12)), e = over.e ?? P.epochOf(c), plain = Buffer.alloc(64, 0x20); Buffer.from(JSON.stringify(payload)).copy(plain);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: AD(c.id, over.adPost ?? post, over.adKind ?? kind) }, await rawOf(P, c, e), plain);
  return { post, kind, e, iv: Buffer.from(iv).toString('base64'), ct: Buffer.from(ct).toString('base64'), an: 1 };
}

test('a page writes a channel\'s reaction or vote with chat.act: the post, the kind, the epoch and a sealed choice of one size that names nobody, whatever was picked, a retraction included; the row opens under the chat key at its epoch with associated data naming the chat, the post and the kind, not the slot; no read mark or profile is touched', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), real = B.S.db.act; const sent = [];
    await makeChannel(A, cid, ['alice', 'bob']); await posts(A, cid);
    B.S.db.act = (...a) => { sent.push(a); return real(...a); };
    const c = await open(B, cid);
    for (const [post, kind, pick] of [[POST, 'r', { emoji: UP }], [POST, 'r', { emoji: HEART }], [POST, 'r', null], [POLL, 'v', { opts: [0] }], [POLL, 'v', { opts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] }], [POLL, 'v', null]]) {
      await B.setAct(c, post, kind, pick);
      const row = (await actsOf(A, cid)).find((x) => x.post === post && x.kind === kind);
      assert.deepEqual(Object.keys(row).sort(), ['_id', 'an', 'ct', 'e', 'iv', 'kind', 'post'], 'only these fields');
      assert.equal(Buffer.from(row.ct, 'base64').length, 80, 'one size, whatever was picked');
      const plain = Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(row.iv, 'base64'), additionalData: AD(cid, post, kind) }, await rawOf(A, await A.sync(cid), 0), Buffer.from(row.ct, 'base64'))).toString();
      assert.deepEqual(JSON.parse(plain), pick, 'the choice and nothing else: no name, no signature');
      assert.doesNotMatch(plain, /bob|alice|sg|hush-act/);
    }
    assert.deepEqual(sent.map((a) => [a[0], a[1], a[2], a[3]]), [[cid, POST, 'r', 0], [cid, POST, 'r', 0], [cid, POST, 'r', 0], [cid, POLL, 'v', 0], [cid, POLL, 'v', 0], [cid, POLL, 'v', 0]], 'each through chat.act');
    assert.equal((await actsOf(A, cid)).length, 2, 'one row per account, post and kind');
  });
});

test('the owner, an admin and two subscribers count the same reactions and votes by emoji and by option, with no member list and no profile loaded for it, as they arrive on a live watch; each sees only its own choice as its own', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), X = await w.page('xena', { build }), B = await w.page('bob', { build }), C = await w.page('carol', { build }), ALL = [A, X, B, C];
    await makeChannel(A, cid, ['alice', 'xena', 'bob', 'carol'], ['xena']); await posts(A, cid);
    const emoji = { alice: HEART, xena: PARTY, bob: FIRE, carol: FIRE }, vote = { alice: [0], xena: [1], bob: [0], carol: [1] };
    const stops = [], dirs = new Map();
    for (const P of ALL) {
      await open(P, cid); dirs.set(P, Object.keys(P.S.dir).sort());
      stops.push(P.S.db.collection(`channels/${cid}/acts`).limit(1000).onSnapshot((s) => P.S.onActs(s.docs.map((d) => ({ _id: d.id, ...d.data() }))), () => assert.fail('the watch was refused')));
    }
    try {
      for (const P of ALL) { const v = await open(P, cid); await P.setAct(v, POST, 'r', { emoji: emoji[P.handle] }); await P.setAct(v, POLL, 'v', { opts: vote[P.handle] }); }
      const total = { r: { [HEART]: 1, [PARTY]: 1, [FIRE]: 2 }, v: { 0: 2, 1: 2 }, voters: 4 };
      for (const P of ALL) {
        await until(() => { const n = counted(P); return n.voters === 4 && n.r[FIRE] === 2 && n.myV; }, P.handle + '\'s counts');
        assert.deepEqual(counted(P), { ...total, myR: emoji[P.handle], myV: vote[P.handle] }, P.handle + ': the same counts, its own choice its own');
        assert.deepEqual(Object.keys(P.S.dir).sort(), dirs.get(P), 'no profile loaded to count');
      }
      const dn = (P) => { const n = P.S.reactNode({ _id: POST }); P.spy.els.length = 0; n._refresh(); return Object.fromEntries(P.spy.els.filter((e) => e.tag === 'button').map((e) => [e.textContent, /\bme\b/.test(e.cls)])); };
      assert.deepEqual(dn(B), { [FIRE + ' 2']: true, [HEART + ' 1']: false, [PARTY + ' 1']: false }, 'the counts on his page, his marked');
      assert.deepEqual(dn(A), { [FIRE + ' 2']: false, [HEART + ' 1']: true, [PARTY + ' 1']: false }, 'on the owner\'s, hers');
    } finally { for (const s of stops) s(); }
  });
});

test('your own choice shows on every device of the account, after a reload and on a second device, and on no other account\'s page; a press takes it back or changes it, and the one row follows; a poll\'s Retract too', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }); let B = await w.page('bob', { build }); const C = await w.page('carol', { build }), st = w.T.srv.store;
    await makeChannel(A, cid, ['alice', 'bob', 'carol']); await posts(A, cid);
    await B.setAct(await open(B, cid), POST, 'r', { emoji: FIRE }); await B.setAct(await open(B, cid), POLL, 'v', { opts: [1] });
    const B2 = await w.page('bob', { id: B.id, build });
    const was = await seen(B, cid);
    assert.deepEqual([was.myR, was.myV], [FIRE, [1]], 'on the device that chose');
    assert.deepEqual([(await seen(B2, cid)).myR, counted(B2).myV], [FIRE, [1]], 'on his second device, with no copy of its own');
    B = await w.reload(B);
    assert.deepEqual([(await seen(B, cid)).myR, counted(B).myV], [FIRE, [1]], 'after a reload');
    for (const P of [A, C]) assert.deepEqual([(await seen(P, cid)).myR, counted(P).myV, counted(P).r, counted(P).voters], [null, null, { [FIRE]: 1 }, 1], 'never on another account\'s page, which still counts it');

    await B2.setAct(await open(B2, cid), POST, 'r', { emoji: HEART });   // changed from the second device
    assert.deepEqual([(await seen(B, cid)).r, counted(B).myR], [{ [HEART]: 1 }, HEART], 'the change shows on the first device; the count moved');
    const n = B.S.reactNode({ _id: POST }); B.spy.els.length = 0; n._refresh();
    await B.spy.els.find((e) => e.tag === 'button').onclick({ stopPropagation() {} });   // pressed again: taken back
    assert.deepEqual([(await seen(B, cid)).r, counted(B).myR, (await seen(B2, cid)).r, counted(B2).myR, (await seen(A, cid)).r], [{}, null, {}, null, {}], 'taken back everywhere; no one counts it');
    await B.setAct(await open(B, cid), POST, 'r', { emoji: UP });
    assert.deepEqual([(await seen(B2, cid)).r, counted(B2).myR], [{ [UP]: 1 }, UP], 'and reacted again');

    await seen(B, cid); const pn = B.S.pollNode({ _id: POLL }, { q: 'Lunch?', opts: ['Soup', 'Salad'], multi: false }); B.spy.els.length = 0; pn._refresh();
    B.spy.els.find((e) => e.textContent === 'Retract vote').onclick();
    await until(async () => (await seen(B2, cid)).voters === 0, 'the retraction');
    assert.equal(counted(B2).myV, null);
    assert.equal(Number(st.db.prepare('SELECT COUNT(*) AS n FROM docs WHERE parent = ?').get(`channels/${cid}/acts`).n), 2, 'through all that: one reaction row and one vote row');
  });
});

test('after a key change older rows are still counted, by those who held the older key and by a reader who joined later and walks the key chain back; an account writing again moves its one row to the new key; a key the channel moved past is refused with the usual toast path', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), C = await w.page('carol', { build }), D = await w.page('dave', { build });
    await makeChannel(A, cid, ['alice', 'bob', 'carol']); await posts(A, cid);
    await B.setAct(await open(B, cid), POST, 'r', { emoji: FIRE }); await C.setAct(await open(C, cid), POST, 'r', { emoji: UP });
    const stale = await open(C, cid);
    await A.rotateTo(await A.sync(cid), A.metaOf(await A.shown(cid)));
    await D.joinPrivate(cid, await linkOf(A, cid));
    const both = { [FIRE]: 1, [UP]: 1 };
    for (const P of [A, B, C, D]) assert.deepEqual((await seen(P, cid)).r, both, P.handle + ' counts rows of the older key');
    await assert.rejects(C.setAct(stale, POST, 'r', { emoji: HEART }), (e) => e.code === 'conflict', 'a page one key behind hears conflict');
    await C.setAct(await open(C, cid), POST, 'r', { emoji: HEART });
    const rows = await actsOf(A, cid);
    assert.deepEqual(rows.map((r) => r.e).sort(), [0, 1], 'hers moved to the new key; his stayed');
    for (const P of [A, B, C, D]) assert.deepEqual((await seen(P, cid)).r, { [FIRE]: 1, [HEART]: 1 }, P.handle + ' counts both');
    assert.equal(counted(C).myR, HEART);
    assert.equal((await seen(B, cid)).myR, FIRE);
    assert.equal((await seen(D, cid)).myR, null);
  });
});

test('a public channel: visitors and the owner count the same rows, the ones from while it was private too; each visitor reacts once and sees only its own as its own', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), V = await w.page('vera', { build }), Z = await w.page('zack', { build });
    await makeChannel(A, cid, ['alice', 'bob']); await posts(A, cid);
    await B.setAct(await open(B, cid), POST, 'r', { emoji: FIRE });   // while private
    await A.shown(cid); await A.setVisibility(cid, 'public'); await A.sync(cid);
    await V.setAct(await open(V, cid), POST, 'r', { emoji: UP });
    await Z.setAct(await open(Z, cid), POST, 'r', { emoji: UP }); await Z.setAct(await open(Z, cid), POST, 'r', { emoji: UP });
    const want = { [FIRE]: 1, [UP]: 2 };
    for (const P of [A, B, V, Z]) assert.deepEqual((await seen(P, cid)).r, want, P.handle);
    assert.deepEqual([counted(A).myR, (await seen(V, cid)).myR, (await seen(B, cid)).myR], [null, UP, FIRE]);
  });
});

test('a page counts nothing from a row that does not open or does not validate, a row without the mark (from before this change, as an older server still hands out), a row moved to another post or kind, or a pick with no meaning; a row copied to another slot counts once; an emoji string outside the app\'s list is never drawn, and a poll takes only option numbers', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build });
    await makeChannel(A, cid, ['alice', 'bob']); await posts(A, cid);
    const c = await open(B, cid), good = await sealRow(B, c, POST, 'r', { emoji: UP }), slot = (s) => s.padEnd(22, 'x'), id = (p, s, k = 'r') => `${p}~${slot(s)}~${k}`;
    const noMark = { ...(await sealRow(B, c, POST, 'r', { emoji: UP })) }; delete noMark.an;
    const rows = [
      { _id: id(POST, 'good'), ...good },
      { _id: id(POST, 'copy'), ...good },                                                         // the same sealed row at another slot
      { _id: id(POST, 'nomark'), ...noMark },                                                     // sealed well, no mark
      { _id: id(POST, 'junk'), ...good, ct: Buffer.alloc(80, 1).toString('base64') },             // does not open
      { _id: id(POST, 'noiv'), ...good, iv: '!!!' },
      { _id: id(POST, 'moved'), ...(await sealRow(B, c, POST, 'r', { emoji: FIRE }, { adPost: POLL })) },   // sealed for another post
      { _id: id(POST, 'kind'), ...(await sealRow(B, c, POST, 'r', { emoji: FIRE }, { adKind: 'v' })) },     // sealed for another kind
      { _id: id(POST, 'nokey'), ...(await sealRow(B, c, POST, 'r', { emoji: FIRE })), e: 9 },     // a key nobody holds
      { _id: id(POST, 'num'), ...(await sealRow(B, c, POST, 'r', { emoji: 5 })) },
      { _id: id(POST, 'long'), ...(await sealRow(B, c, POST, 'r', { emoji: 'x'.repeat(17) })) },
      { _id: id(POST, 'null'), ...(await sealRow(B, c, POST, 'r', null)) },
      { _id: id(POST, 'html'), ...(await sealRow(B, c, POST, 'r', { emoji: '<img src=x>' })) },   // opens, and is never drawn
      { _id: id(POLL, 'none', 'v'), ...(await sealRow(B, c, POLL, 'v', { opts: [] })) },
      { _id: id(POLL, 'str', 'v'), ...(await sealRow(B, c, POLL, 'v', { opts: 'x' })) },
      { _id: id(POLL, 'mix', 'v'), ...(await sealRow(B, c, POLL, 'v', { opts: [0, 'x', 99, 1.5, -1, 1, 1] })) },
      { _id: id(POST, 'kindx', 'x'), ...(await sealRow(B, c, POST, 'x', { emoji: UP })) },
    ];
    await B.S.onActs(rows);
    const n = counted(B);
    assert.deepEqual(n.r, { [UP]: 1, '<img src=x>': 1 }, 'one for the good row and its copy; none for the rest; the odd string only as a key here');
    assert.deepEqual([n.v, n.voters], [{ 0: 1, 1: 1 }, 1], 'one voter, two numbers kept of all that');
    const rn = B.S.reactNode({ _id: POST }); B.spy.els.length = 0; rn._refresh();
    assert.deepEqual(B.spy.els.filter((e) => e.tag === 'button').map((e) => e.textContent), [UP + ' 1'], 'only an emoji of the app\'s list is drawn, as text');
    assert.ok(!B.spy.els.some((e) => /img/.test(e.textContent)));
  });
});

test('a copy of your row at another slot (a server\'s, or another person\'s, who can read your sealed choice and write it as theirs) counts once and costs you nothing: your own still shows as your own; a row beside it that does not open asks the server about nothing', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build });
    await makeChannel(A, cid, ['alice', 'bob']); await posts(A, cid);
    await B.setAct(await open(B, cid), POST, 'r', { emoji: UP }); await B.setAct(await open(B, cid), POLL, 'v', { opts: [1] });
    const rows = await actsOf(B, cid), r = rows.find((x) => x.kind === 'r'), v = rows.find((x) => x.kind === 'v');
    const copy = (x) => ({ ...x, _id: x.post + '~' + '0'.repeat(22) + '~' + x.kind });   // it sorts first
    const junk = { ...r, _id: POST + '~' + '1'.repeat(22) + '~r', ct: Buffer.alloc(80, 1).toString('base64') };
    await open(B, cid); await B.S.onActs([copy(r), junk, r, copy(v), v]);
    assert.deepEqual(counted(B), { r: { [UP]: 1 }, myR: UP, v: { 1: 1 }, voters: 1, myV: [1] });
  });
});

test('own rows are asked for once per post and kept (chat.mine), so another person\'s reaction on a post it already knows asks nothing; a refusal is not kept: the counts still show, and the next change asks again', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), C = await w.page('carol', { build }), asked = [], real = C.S.db.mine; let fail = 'ratelimit';
    await makeChannel(A, cid, ['alice', 'bob', 'carol']); await posts(A, cid);
    C.S.db.mine = async (cid_, list) => { asked.push(list); if (fail) throw Object.assign(new Error('no'), { code: fail }); return real(cid_, list); };
    await C.setAct(await open(C, cid), POST, 'r', { emoji: FIRE }); await B.setAct(await open(B, cid), POST, 'r', { emoji: FIRE });
    const r = await seen(C, cid);
    assert.deepEqual([r.r, r.myR, asked], [{ [FIRE]: 2 }, null, [[POST]]], 'refused: the counts still show, nothing its own');
    fail = null;
    assert.equal((await seen(C, cid)).myR, FIRE, 'asked again at the next change, and found');
    assert.deepEqual(asked, [[POST], [POST]]);
    await A.setAct(await open(A, cid), POST, 'r', { emoji: UP });
    assert.deepEqual([(await seen(C, cid)).r[UP], asked.length], [1, 2], 'another person\'s row on that post: nothing asked');
    await A.setAct(await open(A, cid), POLL, 'v', { opts: [0] });
    await seen(C, cid);
    assert.deepEqual(asked.at(-1), [POLL], 'a new post with rows: only that one');
  });
});

// chat.mine held back: each call waits for its go(), the real answer, or its refuse(); list is the posts it asks about.
const hold = (P) => { const real = P.S.db.mine, calls = []; P.S.db.mine = (cid, list) => new Promise((ok, no) => calls.push({ list, go: () => real(cid, list).then(ok, no), refuse: () => no(Object.assign(new Error('no'), { code: 'ratelimit' })) })); return calls; };
// What each draw put on the screen: a reaction row and a poll as refreshNodes refreshes them, one entry per draw.
function drawn(P, post = POST, poll = POLL) {
  const rn = P.S.reactNode({ _id: post }), pn = P.S.pollNode({ _id: poll }, { q: 'Lunch?', opts: ['Soup', 'Salad'], multi: false }), draws = [], made = (n) => { P.spy.els.length = 0; n._refresh(); return [...P.spy.els]; };
  P.S.rendered = { nodes: new Map([[post, { _refresh() {
    const chips = Object.fromEntries(made(rn).filter((e) => e.tag === 'button').map((e) => [e.textContent, /\bme\b/.test(e.cls)])), els = made(pn);
    draws.push({ chips, buttons: els.filter((e) => e.tag === 'button' && /^po\b/.test(e.cls)).length, results: els.filter((e) => /\bres\b/.test(e.cls)).length, mine: els.filter((e) => /\bmine\b/.test(e.cls)).length, pct: els.filter((e) => e.cls === 'po-pct').map((e) => e.textContent), foot: els.find((e) => / votes?$/.test(e.textContent))?.textContent });
  } }]]) };
  return draws;
}
const channelWithChoices = async (w, ...more) => {
  const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), C = await w.page('carol', { build }), Others = [];
  for (const h of more) Others.push(await w.page(h, { build }));
  await makeChannel(A, cid, ['alice', 'bob', 'carol', ...more]); await posts(A, cid);
  for (const [P, e, v] of [[A, UP, 0], [B, FIRE, 0], [C, FIRE, 1]]) { const c = await open(P, cid); await P.setAct(c, POST, 'r', { emoji: e }); await P.setAct(c, POLL, 'v', { opts: [v] }); }
  return { cid, A, B, C, Others };
};
const COUNTS = { r: { [UP]: 1, [FIRE]: 2 }, v: { 0: 2, 1: 1 }, voters: 3 };
const UNMARKED = { chips: { [FIRE + ' 2']: false, [UP + ' 1']: false }, buttons: 2, results: 0, mine: 0, pct: [], foot: '3 votes' };   // carol's own vote not known yet: the buttons and the true total, no percentages
const MARKED = { chips: { [FIRE + ' 2']: true, [UP + ' 1']: false }, buttons: 0, results: 2, mine: 1, pct: ['67%', '33%'], foot: '3 votes' };

test('a channel\'s counts reach S.agg and the drawn nodes while chat.mine is unanswered, nothing marked and no poll results; when it answers your own reaction and vote are marked, no count changed or doubled, with one more draw', async () => {
  await world({}, async (w) => {
    const { cid, C } = await channelWithChoices(w), calls = hold(C), draws = drawn(C);
    await open(C, cid);
    const done = C.S.onActs(await actsOf(C, cid));
    await until(() => draws.length, 'the counts, with chat.mine unanswered', 2000);
    assert.deepEqual(counted(C), { ...COUNTS, myR: null, myV: null }, 'the counts at once');
    assert.deepEqual(draws, [UNMARKED], 'on the screen too');
    assert.deepEqual(calls.map((x) => x.list), [[POST, POLL]], 'asked once');
    await calls[0].go(); await done;
    assert.deepEqual(counted(C), { ...COUNTS, myR: FIRE, myV: [1] }, 'marked; no count changed or doubled');
    assert.deepEqual(draws, [UNMARKED, MARKED], 'one more draw');
  });
});

test('a later change while your own rows are known keeps your own mark on at every draw, because the first draw uses the ids known for this chat: another person\'s row on a known post and your own new choice on one ask nothing and draw once; a row on a new post asks about that post alone, its answer draws again only if a row of yours is there', async () => {
  await world({}, async (w) => {
    const { cid, A, C } = await channelWithChoices(w), POST3 = 'pOsT00000003', POST4 = 'pOsT00000004', C2 = await w.page('carol', { id: C.id, build });
    await posts(A, cid, 0, [POST3, POST4]);
    await seen(C, cid);
    const calls = hold(C), draws = drawn(C), change = async () => { await open(C, cid); return C.S.onActs(await actsOf(C, cid)); };
    await A.setAct(await open(A, cid), POST, 'r', { emoji: HEART });
    await change();
    assert.deepEqual([calls, draws], [[], [{ ...MARKED, chips: { [FIRE + ' 2']: true, [HEART + ' 1']: false } }]], 'another person\'s row: nothing asked, one draw, her mark on');
    await C.setAct(await open(C, cid), POST, 'r', { emoji: UP });
    await change();
    assert.deepEqual([calls, draws.length, draws[1].chips], [[], 2, { [FIRE + ' 1']: false, [HEART + ' 1']: false, [UP + ' 1']: true }], 'her own new choice: nothing asked, one draw, marked at once');

    await A.setAct(await open(A, cid), POST3, 'r', { emoji: PARTY });
    let done = change();
    await until(() => calls.length === 1, 'a new post to be asked about');
    assert.deepEqual(calls[0].list, [POST3], 'that post alone');
    assert.equal(draws.length, 3);
    assert.deepEqual([draws[2].chips[UP + ' 1'], draws[2].mine, C.S.agg.get(POST3).r], [true, 1, { [PARTY]: 1 }], 'drawn while it waits: the new count, her marks still on');
    await calls[0].go(); await done;
    assert.equal(draws.length, 3, 'no row of hers there: no second draw');

    await C2.setAct(await open(C2, cid), POST4, 'r', { emoji: PARTY });   // from her other device: this one does not know that row yet
    done = change();
    await until(() => calls.length === 2, 'the next new post');
    assert.deepEqual([calls[1].list, draws.length, C.S.agg.get(POST4).r, C.S.agg.get(POST4).myR, draws[3].mine], [[POST4], 4, { [PARTY]: 1 }, null, 1]);
    await calls[1].go(); await done;
    assert.deepEqual([draws.length, C.S.agg.get(POST4).myR, draws[4].chips[UP + ' 1'], draws[4].mine], [5, PARTY, true, 1], 'a row of hers there: a second draw that marks it');
  });
});

test('a poll shows no results to a subscriber who has not voted: the buttons and the true total while chat.mine waits and after it answers, with nothing drawn a second time, since nothing changed', async () => {
  await world({}, async (w) => {
    const { cid, Others: [D] } = await channelWithChoices(w, 'dave'), calls = hold(D), draws = drawn(D);
    await open(D, cid);
    const done = D.S.onActs(await actsOf(D, cid));
    await until(() => draws.length, 'the counts, with chat.mine unanswered', 2000);
    assert.deepEqual(draws, [UNMARKED]);
    await calls[0].go(); await done;
    assert.deepEqual([draws, counted(D).myR, counted(D).myV], [[UNMARKED], null, null], 'nothing changed: no second draw');
  });
});

test('a chat.mine answer for an older snapshot draws nothing over a newer one, whichever comes back first; the newer answer marks your own on the newer counts', async () => {
  await world({}, async (w) => {
    const { cid, A, B, C } = await channelWithChoices(w);
    for (const [P, emoji, olderFirst] of [[C, HEART, true], [B, PARTY, false]]) {
      const calls = hold(P), draws = drawn(P), answer = async (n, s) => { await calls[n].go(); await s; };
      await open(P, cid);
      const s1 = P.S.onActs(await actsOf(P, cid));
      await until(() => draws.length === 1, 'the draw of the older snapshot', 2000);
      await A.setAct(await open(A, cid), POST, 'r', { emoji });
      const s2 = P.S.onActs(await actsOf(P, cid)), want = { [emoji]: 1, [FIRE]: 2 };
      await until(() => draws.length === 2 && calls.length === 2, 'the draw of the newer snapshot', 2000);
      assert.deepEqual(counted(P).r, want, 'the newer counts');
      if (olderFirst) {
        const agg = P.S.agg;
        await answer(0, s1);
        assert.deepEqual([draws.length, P.S.agg === agg], [2, true], 'the older answer draws nothing');
        await answer(1, s2);
      } else {
        await answer(1, s2);
        const agg = P.S.agg;
        await answer(0, s1);
        assert.deepEqual([draws.length, P.S.agg === agg], [3, true], 'the older answer, later, draws nothing');
      }
      assert.deepEqual([draws.length, counted(P).r, counted(P).myR], [3, want, FIRE], 'the newer answer marks your own on the newer counts');
    }
  });
});

test('two snapshots at once: the older stops once its rows are open, and only the newer is drawn', async () => {
  await world({}, async (w) => {
    const { cid, A, C } = await channelWithChoices(w);
    await seen(C, cid);
    const draws = drawn(C), older = await actsOf(C, cid);
    await A.setAct(await open(A, cid), POST, 'r', { emoji: HEART });
    const newer = await actsOf(C, cid);
    await open(C, cid);
    await Promise.all([C.S.onActs(older), C.S.onActs(newer)]);
    assert.deepEqual([draws.length, counted(C).r], [1, { [HEART]: 1, [FIRE]: 2 }]);
  });
});

test('a refused chat.mine stays as it was: the counts show, nothing marked and nothing more drawn, a person who voted sees the buttons again (voting again only rewrites the one row); the next change asks again, and its answer marks', async () => {
  await world({}, async (w) => {
    const { cid, C } = await channelWithChoices(w), calls = hold(C), draws = drawn(C);
    await open(C, cid);
    let done = C.S.onActs(await actsOf(C, cid));
    await until(() => calls.length === 1, 'chat.mine to be asked');
    calls[0].refuse(); await done;
    assert.deepEqual([draws, counted(C).myR, counted(C).myV, counted(C).r], [[UNMARKED], null, null, COUNTS.r], 'one draw, nothing marked');
    done = C.S.onActs(await actsOf(C, cid));
    await until(() => calls.length === 2, 'asked again at the next change');
    assert.deepEqual([calls[1].list, draws], [[POST, POLL], [UNMARKED, UNMARKED]]);
    await calls[1].go(); await done;
    assert.deepEqual(draws, [UNMARKED, UNMARKED, MARKED], 'and marked once it answers');
  });
});

test('a group and a one-on-one chat draw as before: no chat.mine, one draw, your own marked in it', async () => {
  await world({}, async (w) => {
    const { cid } = w, gid = 'g' + cid.slice(1), did = 'd' + 'Q'.repeat(22), A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), used = [], raw = crypto.getRandomValues(new Uint8Array(32));
    await makeChannel(A, gid, ['alice', 'bob'], [], 'group');
    await A.loadDir(['alice', 'bob'], true); await B.loadDir(['alice', 'bob'], true);
    await A.S.db.createChat(did, { type: 'dm', epoch: 1, ts: Date.now(), last: null, keys: { 1: await A.wrapAll(raw, ['alice', 'bob'], did, 1) } }, { m: await A.memberCapFrom(did, 1, raw) });
    A.ksPut(did, 1, A.b64(raw));
    B.S.db.mine = A.S.db.mine = async () => { used.push('mine'); return []; };
    const views = { [gid]: async (P) => { const c = await P.shown(gid); return { ...c, id: gid }; }, [did]: async (P) => { await P.S.db.refreshChat(did).catch(() => {}); return { id: did, type: 'dm', epoch: 1, members: ['alice', 'bob'], ...(await P.freshChan(did)) }; } };
    for (const id of [gid, did]) {
      const at = async (P) => { const c = await views[id](P); P.S.convs = [c]; P.S.chan = id; return c; };
      await A.setAct(await at(A), POST, 'r', { emoji: UP }); await A.setAct(await at(A), POLL, 'v', { opts: [0] });
      await B.setAct(await at(B), POST, 'r', { emoji: FIRE });
      for (const [P, chips, results] of [[A, { [UP + ' 1']: true, [FIRE + ' 1']: false }, 2], [B, { [UP + ' 1']: false, [FIRE + ' 1']: true }, 0]]) {
        await at(P);
        const draws = drawn(P);
        await P.S.onActs(await actsOf(P, id));
        assert.deepEqual([draws.length, draws[0].chips, draws[0].results, draws[0].foot], [1, chips, results, '1 vote'], P.handle + ' in ' + id[0]);
      }
    }
    assert.deepEqual(used, [], 'never chat.mine');
  });
});

test('a group stays as it was: rows under member tags written whole with their time and a signature inside, counted by member, no chat.act, no chat.mine; a channel\'s rows are not mistaken for its rows', async () => {
  await world({}, async (w) => {
    const { cid } = w, gid = 'g' + cid.slice(1), A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), C = await w.page('carol', { build }), used = [];
    await makeChannel(A, gid, ['alice', 'bob', 'carol'], [], 'group');
    for (const P of [A, B, C]) { P.S.db.act = async () => used.push('act'); P.S.db.mine = async () => { used.push('mine'); return []; }; }
    const emoji = { alice: HEART, bob: FIRE, carol: UP };
    for (const P of [A, B, C]) { const v = await open(P, gid); await P.setAct(v, POST, 'r', { emoji: emoji[P.handle] }); await P.setAct(v, POLL, 'v', { opts: [P === B ? 1 : 0] }); }
    const rows = await actsOf(A, gid), cTags = await A.tagMap({ ...(await A.sync(gid)), members: ['alice', 'bob', 'carol'] }, 0);
    assert.equal(rows.length, 6);
    for (const r of rows) {
      assert.deepEqual(Object.keys(r).sort(), ['_id', 'ct', 'e', 'iv', 'kind', 'post', 'ts'], 'its fields as before');
      assert.ok(cTags[r._id.split('~')[1]], 'under a member tag');
    }
    for (const P of [A, B, C]) {
      const n = await seen(P, gid);
      assert.deepEqual(n, { r: { [HEART]: 1, [FIRE]: 1, [UP]: 1 }, myR: emoji[P.handle], v: { 0: 2, 1: 1 }, voters: 3, myV: [P === B ? 1 : 0] }, P.handle);
    }
    // a member who writes again after a key change has two rows under two tags: counted once by name, as before
    await A.rotateTo(await A.sync(gid), A.metaOf(await A.shown(gid)));
    await B.setAct(await open(B, gid), POST, 'r', { emoji: PARTY });
    assert.equal((await actsOf(A, gid)).length, 7);
    const cr = (await seen(C, gid)).r, br = await seen(B, gid);
    assert.deepEqual([Object.values(cr), cr[HEART], cr[UP], !!cr[FIRE] !== !!cr[PARTY]], [[1, 1, 1], 1, 1, true], 'two rows, one reaction: whichever comes first');
    assert.equal(br.r[br.myR], 1, 'and on his own page that same one is his');
    assert.deepEqual(used, [], 'never the channel ops');
    // what a member's page keeps for a row: it names the writer, as before
    const one = rows.find((r) => r.kind === 'r' && cTags[r._id.split('~')[1]] === 'bob'), opened = await C.S.openAct(await open(C, gid), one);
    assert.deepEqual([opened.by, opened.emoji], ['bob', FIRE]);
  });
});

test('page 95 on the new server: its reaction and vote are refused with its normal error toast, its watches are not refused, nothing is evicted, and its counts read as none until it reloads; the rows it reads do it no harm, and once reloaded the same account counts them all', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), N = await w.page('nina', { build }); let O = await w.page('oscar', { build: build95 });
    await makeChannel(A, cid, ['alice', 'nina', 'oscar']); await posts(A, cid);
    await N.setAct(await open(N, cid), POST, 'r', { emoji: FIRE });
    const c = await open(O, cid), errs = [], fires = []; let stoppedPosts = 0;
    const acts = O.S.db.collection(`channels/${cid}/acts`).limit(1000).onSnapshot((s) => { fires.push(s.docs.length); O.S.onActs(s.docs.map((d) => ({ _id: d.id, ...d.data() }))); }, (e) => errs.push(e));
    const psts = O.S.db.collection(`channels/${cid}/posts`).limit(100).onSnapshot((s) => { stoppedPosts = s.docs.length; }, (e) => errs.push(e));
    await until(() => fires.length && stoppedPosts === 2, 'its watches to start');
    await assert.rejects(O.setAct(c, POST, 'r', { emoji: UP }), (e) => e.code === 'denied', 'its reaction is refused');
    const pn = O.S.pollNode({ _id: POLL }, { q: 'Lunch?', opts: ['Soup', 'Salad'], multi: false }); O.spy.els.length = 0; pn._refresh();
    O.spy.els.filter((e) => e.tag === 'button' && e.cls === 'po')[0].onclick();
    await until(() => O.spy.toasts.some((t) => t[0] === 'error' && t[1] === 'Vote not saved. Check your connection and try again.'), 'its toast');
    await N.setAct(await open(N, cid), POLL, 'v', { opts: [1] });   // a row it hears live
    await A.S.db.doc(`channels/${cid}/posts/pOsT00000003`).set(postDoc());   // and a post
    await until(() => stoppedPosts === 3 && fires.at(-1) === 2, 'its watches to go on');
    assert.deepEqual([errs, O.S.db.chatLevel(cid)], [[], 'member'], 'not refused; still holding the channel');
    await sleep(50);
    assert.equal(O.S.agg.size, 0, 'its counts read as none');
    assert.equal((await actsOf(A, cid)).length, 2, 'it wrote no row');
    acts(); psts();
    O = await w.page('oscar', { id: O.id, build });
    assert.deepEqual((await seen(O, cid)).r, { [FIRE]: 1 }, 'once reloaded it counts them');
  });
});

test('the new page on a server that does not know the ops (a gap during deploy, or a rollback): its reaction and vote show the same toast, it asks no more than once per change, and it goes on counting what it can read', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), B = await w.page('bob', { build }), unknown = () => Promise.reject(Object.assign(new Error('unknown op'), { code: 'invalid' }));
    await makeChannel(A, cid, ['alice', 'bob']); await posts(A, cid);
    await A.setAct(await open(A, cid), POST, 'r', { emoji: FIRE });
    B.S.db.act = unknown; B.S.db.mine = unknown;
    const c = await open(B, cid);
    await assert.rejects(B.setAct(c, POST, 'r', { emoji: UP }), (e) => e.code === 'invalid');
    const pn = B.S.pollNode({ _id: POLL }, { q: 'Lunch?', opts: ['Soup', 'Salad'], multi: false }); B.spy.els.length = 0; pn._refresh();
    B.spy.els.filter((e) => e.tag === 'button' && e.cls === 'po')[0].onclick();
    await until(() => B.spy.toasts.some((t) => t[0] === 'error' && t[1] === 'Vote not saved. Check your connection and try again.'), 'the toast');
    const n = await seen(B, cid);
    assert.deepEqual([n.r, n.myR], [{ [FIRE]: 1 }, null], 'the rows it can read still count');
  });
});

test('a one-on-one chat stays as it was: setAct writes a whole signed row under a member tag, never chat.act', async () => {
  const sets = [];
  const page = wrapEl(mkBuild([...LIFTS, 'async function convKey(){return {key:await crypto.subtle.generateKey({name:"AES-GCM",length:256},false,["encrypt","decrypt"])}}async function memTag(){return "t".repeat(22)}async function myKey(){return (await crypto.subtle.generateKey({name:"ECDSA",namedCurve:"P-256"},false,["sign"])).privateKey}'].join('\n')));
  const S = { me: { handle: 'alice' } }, noop = () => {}, P = page({ S, ls: { get: () => null, set: noop }, spy: {}, Date, dmPeer: () => null, validHandle: () => true, loadDir: noop, P: () => ({}), saveContacts: noop, renderBanner: noop, openSetupLogin: noop, normPhone: (s) => s, dispOk: () => true, convById: () => null, noteChatDoc: noop, openConv: noop, handOver: noop, toast: noop, toastErr: noop, openDm: noop, noteTier: noop, notOwner: noop, climb: noop, sheet: noop, el: () => ({}), convAvatar: noop, memberText: noop, subsText: noop, I: {}, actionRow: noop, picker: noop, ensureInbox: noop, openInvite: noop, APP_URL: '', confirmDanger: noop, displayName: noop, withBadge: noop, atOf: noop, awaitingAccept: noop, ensureDmDoc: noop, ensureDmEpoch: noop, fmtWhen: noop, openScheduled: noop, nudge: noop, isSelf: noop, dmRenoted: new Set(), recordBase: noop, setTyping: noop, photoEditor: noop, renderList: noop });
  S.db = { act: async () => assert.fail('never chat.act'), doc: (p) => ({ set: async (v) => { sets.push([p, v]); }, delete: async () => { sets.push([p, null]); } }) };
  await P.setAct({ id: 'dBobDana0000', type: 'dm', epoch: 0 }, POST, 'r', { emoji: UP });
  assert.equal(sets[0][0], `channels/dBobDana0000/acts/${POST}~${'t'.repeat(22)}~r`);
  assert.deepEqual(Object.keys(sets[0][1]).sort(), ['ct', 'e', 'iv', 'kind', 'post', 'ts']);
});
