// Release 95 (page): the subscriber count in Channel info (SPEC.md 5.3). The channel privacy rule keeps who the subscribers are from
// everyone below admin level; a page counted them by the member list it held, which a subscriber's page will no longer be handed
// (the server half). Now Channel info, and nothing else (the chat header, the chat list row, the join sheet and New message still say
// only "Private channel" or "Public channel": channel-history-info.test.js), tells a subscriber, a link holder and a visitor how many
// subscribers a channel has, a number only, never a name: for a private channel the length of the member list when the page holds one
// (today's server hands every subscriber the list), else the record's `n`, a whole number of 0 or more (the server half takes it from
// admin level and hands it on below); with neither, "Private channel". A public channel shows no number below admin level, whatever `n` its record
// or a preview carries (no server stores one on a public channel; its count waits for Phase 3, SPEC.md 5.3; release 93b, before which such an `n` was shown).
// The owner's and the admins' pages count from their own list, as before, and keep the record's `n` right: after each write of a private
// channel's member list (Add, a joiner folded in, a removal and its key change, a removal with no key change, a note's join) and when
// they open the channel with a record that differs, they write `n` alone, a separate best-effort update whose error is ignored (today's
// server refuses the field), and the list's own write never carries it. The page harness is channel-history-kit.js; the server's
// planned change (accepting `n` at admin level and handing it on below, not part of this release) is stood in for by countsOf.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { lift, mkBuild, world, makeChannel, linkOf, oldServer } from './channel-history-kit.js';
import { sleep } from './helpers.js';

// The page's own code beyond the kit's, reached through spy.fns: Channel info (openConvInfo, with the real count texts, which the kit
// stubs: memberText and subsText are named ...Real here and the stubs call them), reconcileSvc, and what openConv does for an admin
// when it opens a channel (open: the statements of openConv's own admin branch, with the cards it runs stood in for by nothing).
const built = mkBuild([
  lift('const canPost=', '\n'), lift('const isBlocked=', '\n'), lift('const contactFor=', '\n'),
  lift('const memberText=', '\n').replace('const memberText=', 'const memberTextReal='), lift('const subsText=', '\n').replace('const subsText=', 'const subsTextReal='),
  lift('const reconciled=', 'function noteAccepted('), lift('function openConvInfo(', 'function pickPhoto('),
  "const $=()=>null,html=(t,c,h)=>el(t,c,h),userAvatar=()=>({}),isOnline=()=>false,lastSeen=()=>'',FEATURES={},reactCfg=()=>({mode:'all',allowed:[]}),openMediaGallery=()=>{},openPollCreate=()=>{},openReactSettings=()=>{};",
  'spy.fns={subsText:subsTextReal,memberText:memberTextReal,openConvInfo,reconcileSvc};',
  'spy.fns.open=(cid,c)=>{const ensureChain=()=>Promise.resolve(false),rollRun=()=>{};' + lift('const cc=convById(cid)||c;if(isAdmin(cc)){', '}return ch})') + '}};',
].join('\n'));
const node = (e) => Object.assign(e, { kids: [], append(...k) { this.kids.push(...k); }, replaceChildren(...k) { this.kids = k; }, setAttribute() {}, style: {}, insertAdjacentHTML() {}, classList: { add() {}, remove() {} }, value: '' });
const build = (env) => {
  env.spy.sheets = [];
  return built({ ...env, I: new Proxy({}, { get: () => '' }), subsText: (...a) => env.spy.fns.subsText(...a), memberText: (...a) => env.spy.fns.memberText(...a), el: (...a) => node(env.el(...a)),
    sheet: (title) => { const body = node({ tag: 'sheet', cls: 'body', textContent: '' }); env.spy.sheets.push({ title, body }); return { body, sh: node({}), close() {} }; } });
};

const by = (kids, cls) => kids.filter((k) => k && k.cls === cls), one = (kids, cls) => by(kids, cls)[0];
// A Channel info sheet as drawn: its top line, its headings and the name on each row
function info(X, cid) {
  X.spy.sheets.length = 0; X.spy.fns.openConvInfo(cid);
  const { body } = X.spy.sheets.at(-1);
  return { line: one(one(body.kids, 'info-top').kids, 't-sub').textContent, labels: by(body.kids, 'menu-label flush').map((k) => k.textContent),
    names: by(body.kids, 'thread').map((r) => one(one(r.kids, 't-main').kids, 't-name').textContent) };
}
async function until(fn, what, ms = 8000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out waiting for ' + what); await sleep(40); } }
const errors = (P) => P.spy.toasts.filter((t) => t[0] === 'error');
// A server that knows the record's `n`, as the server half will: every get answers a channel record with its n (the store only ever withholds `meta` below admin level, so a
// subscriber is handed it too). It is kept beside the record, not in it: today's validation does not know the field and would refuse every later write to a record that carried it.
// Returns the setter a test uses to put a count on a record (undefined takes it off). `take`: the planned change of accepting an update of `n` alone (from any page here, since
// only an admin's page tries); without it that update reaches the store as it is, and today's server refuses it.
function countsOf(T, take) {
  const st = T.srv.store, get = st.get.bind(st), update = st.update.bind(st), side = new Map(), cid = (path) => (/^channels\/([^/]+)$/.exec(path) || [])[1];
  st.get = (path, actor) => { const r = get(path, actor), id = cid(path); return id && r.d && side.has(id) ? { ...r, d: { ...r.d, n: side.get(id) } } : r; };
  if (take) st.update = (path, patch, actor) => { const id = cid(path); if (!id || Object.keys(patch).join() !== 'n') return update(path, patch, actor); side.set(id, patch.n); return { id }; };
  return (id, n) => (n === undefined ? side.delete(id) : side.set(id, n));
}
// Add subscribers as its sheet runs it (openAddSubs): `hs` picked, Add pressed; the error line, empty when they were added.
const addSubs = async (X, cid, hs) => { X.S.pick = hs; X.S.convs = [await X.sync(cid)]; X.spy.els.length = 0; X.openAddSubs(cid);
  const go = X.spy.els.find((e) => e.tag === 'button'), err = X.spy.els.find((e) => e.cls === 'err'); await go.onclick(); return err.textContent; };
// A page's copy of a channel as its chat list holds it (the chat watch's, read afresh)
const view = async (P, id) => ({ ...(await P.shown(id)), id });
// Opening the channel as an admin (openConv's admin branch) with the copy the chat list holds now (`mix`: fields that copy has gone out of date in); how many times the page read the record for it
async function open(P, cid, mix) { const sh = { ...(await view(P, cid)), ...mix }; P.S.convs = P.S.convs.filter((c) => c.id !== cid).concat(sh); const g = P.spy.gets; P.spy.fns.open(cid, sh); await sleep(300); return P.spy.gets - g; }

// Alice owns a private channel where Xena is an admin and Bob and Carol subscribe (four people), and, if asked, a public channel where Xena is an admin, which Bob has
// joined; Dave is in none of it. `rule`: the server withholds meta below admin level, as it does; else it is today's server (the kit's oldServer).
async function cast(w, rule, pub, take) {
  const { cid } = w, pid = 'c' + randomBytes(6).toString('hex'), put = countsOf(w.T, take);
  const A = await w.page('alice', { owner: true, build }), X = await w.page('xena', { build }), B = await w.page('bob', { build }), D = await w.page('dave', { build });
  await w.page('carol', { build });
  await makeChannel(A, cid, ['alice', 'xena', 'bob', 'carol'], ['xena']);
  if (pub) { await makeChannel(A, pid, ['alice', 'xena'], ['xena']); await A.shown(pid); await A.setVisibility(pid, 'public'); await A.sync(pid); }
  if (!rule) oldServer(w.T);
  B.S.prefs = { pub: pub ? [pid] : [], blocked: [] };
  for (const P of [A, X, B, D]) Object.assign(P.S, { contacts: [], contactsReady: true, pins: {}, warned: new Set(), presence: {}, unread: new Map(), mentions: new Map(), showArchived: false, call: null, typing: {} });
  A.S.convs = [await view(A, cid)]; X.S.convs = [await view(X, cid)]; B.S.convs = [await view(B, cid)];
  if (pub) { A.S.convs.push(await view(A, pid)); X.S.convs.push(await view(X, pid)); B.S.convs.push(await view(B, pid)); D.S.previews.set(pid, await D.showMeta(await D.freshChan(pid))); }
  assert.deepEqual([A, X, B].map((P) => P.S.db.chatLevel(cid)), ['owner', 'admin', 'member'], 'the levels the pages hold');
  assert.deepEqual(B.S.convs[0].members, rule ? [] : ['alice', 'xena', 'bob', 'carol'], rule ? 'Bob\'s copy holds no list' : 'Bob\'s copy holds the whole list, as today\'s server hands it');
  return { A, X, B, D, cid, pid, put };
}
const OWNER = { line: 'Private channel, 4 subscribers', labels: ['Subscribers'], names: ['alice (you)', 'xena', 'bob', 'carol'] }, ADMIN = { line: 'Private channel, 4 subscribers', labels: ['Subscribers'], names: ['alice', 'xena (you)', 'bob', 'carol'] };

test('Channel info on today\'s server (every subscriber gets the list): a subscriber\'s page shows the number of subscribers and no name but the owner\'s and the admins\'; the owner\'s and an admin\'s pages count from their own list, whatever the record\'s n says; a public channel shows no number; no count is written for a public channel, nor by a subscriber\'s page', async () => {
  await world({}, async (w) => {
    const { A, X, B, D, cid, pid, put } = await cast(w, false, true);
    const b = info(B, cid);
    assert.deepEqual(b, { line: 'Private channel, 4 subscribers', labels: ['Owner and admins'], names: ['alice', 'xena'] }, 'a subscriber\'s page: the count from the list it holds, the owner and the admin from the record');
    assert.ok(!/carol/.test(JSON.stringify(b)), 'no other subscriber is named');
    // the owner's and an admin's pages, as before; a record that carries an n nobody wrote (99) changes nothing for them, nor for a page that holds the list
    put(cid, 99);
    for (const P of [A, X, B]) P.S.convs[0] = await view(P, cid);
    assert.equal(A.S.convs[0].n, 99, 'the record carries it');
    assert.deepEqual([info(A, cid), info(X, cid)], [OWNER, ADMIN], 'the owner\'s and the admin\'s Channel info, as before');
    assert.equal(info(B, cid).line, 'Private channel, 4 subscribers', 'the list is the count, not n');
    // a public channel: Bob has joined it, Dave has only its preview; no record carries an n today
    assert.deepEqual([info(B, pid).line, info(D, pid).line], ['Public channel', 'Public channel'], 'a public channel: no number');
    assert.deepEqual([info(A, pid).line, info(X, pid).line], ['Public channel, 2 subscribers', 'Public channel, 2 subscribers'], 'the owner\'s and the admin\'s, as before');
    // opening a public channel as its owner or an admin: there is no list to count, so nothing is read or written
    assert.deepEqual([await open(A, pid), await open(X, pid), A.spy.counts, X.spy.counts], [0, 0, [], []], 'a public channel: no count kept');
    // a subscriber whose copy of the channel still names him an admin (it is out of date): his page reads the record, finds he is none, and writes nothing
    assert.deepEqual([await open(B, cid, { admins: ['xena', 'bob'] }), B.spy.counts], [1, []], 'a subscriber, whatever his copy says: nothing written');
  });
});

test('Channel info once the member list is no longer sent below admin level: a subscriber\'s page shows the number the record carries (n), a whole number of 0 or more, and "Private channel" with none; a public channel shows no number, whatever n its record or a preview carries', async () => {
  await world({}, async (w) => {
    const { A, X, B, D, cid, pid, put } = await cast(w, true, true);
    assert.equal(info(B, cid).line, 'Private channel', 'no list and no n: the kind of channel');
    put(cid, 4);
    for (const P of [A, X, B]) P.S.convs[0] = await view(P, cid);
    assert.deepEqual(B.S.convs[0].members, [], 'his copy still holds no list');
    const b = info(B, cid);
    assert.deepEqual(b, { line: 'Private channel, 4 subscribers', labels: ['Owner and admins'], names: ['alice', 'xena'] }, 'the count from the record: a number, and the owner and the admin as before');
    assert.ok(!/carol/.test(JSON.stringify(b)), 'no name');
    assert.deepEqual([info(A, cid), info(X, cid)], [OWNER, ADMIN], 'the owner\'s and the admin\'s pages still hold the list and count it');
    put(cid, 99); A.S.convs[0] = await view(A, cid);
    assert.equal(info(A, cid).line, 'Private channel, 4 subscribers', 'the owner\'s own list again, not the record\'s n');
    // the numbers a record can carry, on Bob's copy of it: only a whole number of 0 or more counts; the list, when the copy holds one, comes first
    const rec = B.S.convs[0], line = (c) => { B.S.convs[0] = c; return info(B, cid).line; };
    assert.deepEqual([0, 1, 2, 4096, 123456789].map((n) => line({ ...rec, n })), ['Private channel, 0 subscribers', 'Private channel, 1 subscriber', 'Private channel, 2 subscribers', 'Private channel, 4096 subscribers', 'Private channel, 123456789 subscribers']);
    assert.deepEqual([-1, 2.5, '4', null, true, [4], {}, NaN, Infinity, undefined].map((n) => line({ ...rec, n })), Array(10).fill('Private channel'), 'any other n is no number');
    const three = ['alice', 'xena', 'bob'];
    assert.deepEqual([line({ ...rec, members: three, n: 99 }), line({ ...rec, members: three, n: undefined }), line({ ...rec, members: [], n: 3 })], Array(3).fill('Private channel, 3 subscribers'), 'the list when the copy holds one, else n');
    // a public channel: no number below admin level, whatever n its record carries (no server stores one there; its count waits for Phase 3), and its shown people, the owner, the admins and the account, are no count; a visitor's preview too
    const pr = B.S.convs[1], pline = (c) => { B.S.convs[1] = c; return info(B, pid).line; };
    assert.deepEqual([undefined, -1, 0, 1, 7].map((n) => pline({ ...pr, n })), Array(5).fill('Public channel'), 'a subscriber of a public channel: the kind of channel, whatever n the copy carries');
    D.S.previews.set(pid, { ...D.S.previews.get(pid), n: 12 });
    assert.equal(info(D, pid).line, 'Public channel', 'a visitor\'s preview that carries an n: no number');
  });
});

test('an admin\'s page after Add on today\'s server (which refuses n) still saves the list and shows no error: the count is written once, apart from the list\'s own write, its refusal is ignored and never retried, and so it is on each open', async () => {
  await world({}, async (w) => {
    const { A, X, cid } = await cast(w, false, false);
    assert.equal(await addSubs(X, cid, ['dave']), '', 'Add shows no error');
    await until(() => X.spy.counts.length, 'the admin\'s page to try the count');
    await sleep(400);
    assert.deepEqual(X.spy.counts, [5], 'one try, with the list\'s length (Dave is the fifth)');
    assert.deepEqual(X.spy.updates, [['keys', 'meta']], 'the list was written once, with the key wrap, and never with n');
    await until(() => X.spy.refused.length, 'the server\'s refusal');
    assert.match(X.spy.refused[0], /^(invalid|denied)$/, 'the server refused the field');
    assert.deepEqual([X.spy.toasts, (await A.meta(cid)).members, (await A.sync(cid)).n], [[['Subscriber added']], ['alice', 'xena', 'bob', 'carol', 'dave'], undefined], 'only the success message; the list is saved; the record has no n');
    // opening the channel: the record's n (none) differs from the list's length, so one more try each time, and nothing else
    for (let i = 1; i <= 2; i++) {
      assert.equal(await open(X, cid), 1, 'the record is read afresh for it');
      await until(() => X.spy.counts.length === 1 + i, 'the try on open ' + i);
      await sleep(300);
      assert.equal(X.spy.counts.length, 1 + i, 'one try per open, no loop');
    }
    await until(() => X.spy.refused.length === 3, 'the refusals');
    assert.deepEqual([X.spy.counts, errors(X), X.spy.updates], [[5, 5, 5], [], [['keys', 'meta']]], 'every try refused and ignored, no error message, no other write');
  });
});

test('after the server half: every write of the member list is followed by the count (Add, a joiner folded in by the roll, a removal and its key change, a removal with no key change, a note\'s join) and so is opening a channel whose n is wrong; opening one that is right writes nothing, and one whose copy shows the right n reads nothing; nothing is read or written while the page re-keys; the counts land in the order they were meant; a subscriber\'s page, holding no list, reads the right count each time; the list\'s writes never carry n', async () => {
  await world({}, async (w) => {
    const { A, X, B, cid, put } = await cast(w, true, false, true), E = await w.page('erin', { build }); await w.page('fay', { build });
    const seen = async () => { B.S.convs = [await view(B, cid)]; assert.deepEqual(B.S.convs[0].members, [], 'Bob\'s copy holds no list'); return [B.S.convs[0].n, info(B, cid).line]; };
    const counted = async (P, n, what) => { await until(() => P.spy.counts.length === n.length, what); await sleep(300); assert.deepEqual(P.spy.counts, n, what); };
    assert.deepEqual(await seen(), [undefined, 'Private channel'], 'a channel made before this page wrote a count: the kind of channel');

    assert.equal(await open(A, cid), 1, 'the record is read afresh for it');
    await counted(A, [4], 'opening a channel whose n is missing writes the list\'s length');
    assert.deepEqual(await seen(), [4, 'Private channel, 4 subscribers'], 'Bob\'s page reads it');
    assert.equal(await open(A, cid), 0, 'opening it again, its copy showing the right n: the record is not even read');
    assert.deepEqual(A.spy.counts, [4], 'and nothing is written');

    assert.equal(await addSubs(X, cid, ['dave']), '');
    await counted(X, [5], 'Add');
    assert.deepEqual(await seen(), [5, 'Private channel, 5 subscribers']);

    await E.joinPrivate(cid, await linkOf(A, cid));
    await A.run(cid);   // the roll folds the joiner into the list
    await counted(A, [4, 6], 'a joiner folded in by the roll');
    assert.deepEqual(await seen(), [6, 'Private channel, 6 subscribers']);

    await A.sync(cid); await A.kickMember(cid, 'carol');
    await counted(A, [4, 6, 5], 'a removal with its key change');
    assert.deepEqual(await seen(), [5, 'Private channel, 5 subscribers']);

    A.spy.failRotate.push('toolarge'); await A.sync(cid); await A.kickMember(cid, 'erin');
    await counted(A, [4, 6, 5, 4], 'a removal with no key change (the list alone)');
    assert.deepEqual(await seen(), [4, 'Private channel, 4 subscribers']);

    const note = { _id: 'pJoIn0000001', svc: 'join', from: 'zed', e: (await A.sync(cid)).epoch };
    await A.spy.fns.reconcileSvc({ ...(await A.shown(cid)), id: cid }, [note]);
    await counted(A, [4, 6, 5, 4, 5], 'a joined note listing its author');
    assert.deepEqual(await seen(), [5, 'Private channel, 5 subscribers']);

    assert.equal(await open(A, cid, { n: 3 }), 1, 'a copy that shows a wrong n: the record is read afresh');
    assert.deepEqual(A.spy.counts, [4, 6, 5, 4, 5], 'and its n is right: nothing written');

    put(cid, 99);   // a wrong count on the record (another page's, say): the next open puts it right
    A.S.rekeying = true;
    assert.deepEqual([await open(A, cid), A.spy.counts.length, (await seen())[0]], [0, 5, 99], 'while a device removal re-keys the page, nothing is read or written');
    A.S.rekeying = false;
    await open(A, cid);
    await counted(A, [4, 6, 5, 4, 5, 5], 'opening a channel whose n differs');
    assert.deepEqual(await seen(), [5, 'Private channel, 5 subscribers']);

    // one count at a time: the open's, read first and sent a second late, must not land after the count of the Add that follows it
    put(cid, 1);
    const doc = A.S.db.doc, n0 = A.spy.counts.length; let slow = true;
    A.S.db.doc = (p) => { const d = doc(p), u = d.update; d.update = (v) => (slow && Object.keys(v).join() === 'n' ? (slow = false, sleep(1000).then(() => u(v))) : u(v)); return d; };
    const sh = { ...(await view(A, cid)) }; A.S.convs = [sh]; A.spy.fns.open(cid, sh);
    assert.equal(await addSubs(A, cid, ['fay']), '');
    await until(() => A.spy.counts.length === n0 + 2, 'both counts');
    await sleep(300);
    assert.deepEqual([A.spy.counts.at(-1), (await A.meta(cid)).members.length, ...(await seen())], [6, 6, 6, 'Private channel, 6 subscribers'], 'the later count lands last');

    for (const P of [A, X]) assert.ok(P.spy.updates.every((k) => !k.includes('n')) && P.spy.rotate.every((s) => !('n' in s)), P.handle + '\'s list and key writes never carry n');
    assert.deepEqual([A.spy.refused, X.spy.refused, errors(A), errors(X)], [[], [], [], []], 'nothing refused, no error message');
  });
});
