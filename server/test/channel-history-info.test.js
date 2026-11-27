// Channel member privacy, Channel info and the count (SPEC.md 5.3): in any channel only the owner and the admins may learn who the
// subscribers are, and so how many there are. A page drew the number of subscribers (subsText) in the chat header, on the chat list's
// row of a channel with no post yet (which the sealed list cache keeps), on the join sheet, in the public channels the chat list's
// search finds (New message listed them until release 111, part G; the rows and this file's test of them moved with them) and on
// Channel info's top line, and Channel info listed every subscriber, each with a Block person action. Now a page whose account is
// neither the owner nor an admin of the channel reads only "Private channel" or "Public channel" there, even when the record carries the
// count `n` (the cases under the rule put one on the records, release 93b; Channel info's top line alone adds a number of subscribers,
// never a name, from release 95, and for a private channel only: channel-history-count.test.js), and its Channel info lists
// the owner and the admins alone, taken from the record's owner and admins (never from the list), under "Owner and admins", with no
// action on anyone. The owner's and the admins' pages draw all of it as before, and so does a group's page (its members see each
// other). Run under the server's rule that hands the list to admins alone (no meta below admin level: channel-members.test.js), where
// a subscriber's page holds no list, and against today's server, which hands every subscriber the list (the kit's oldServer). The page
// harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { lift, mkBuild, world, makeChannel, oldServer } from './channel-history-kit.js';
import { sleep } from './helpers.js';

// The page's own code beyond the kit's, reached through spy.fns: Channel info (openConvInfo), the chat header (refreshHeader), the chat
// list's row model (rowModel, whose strings the sealed list cache keeps), the chat list's search (searchExtras, with the public
// channels it asks the server for; pubChans, right under it, is lifted with it), and the two count texts (the kit stands stubs in for them: memberText, subsText, so the real ones are named
// ...Real here and the stubs call them). Elements are kept with what they hold, a sheet's body as its elements, so a test reads what
// was drawn; the icons are empty strings.
const built = mkBuild([
  lift('const curConv=', '\n'), lift('const canPost=', '\n'), lift('const isBlocked=', '\n'), lift('const contactFor=', '\n'), lift('const knownHandle=', '\n'),
  lift('const memberText=', '\n').replace('const memberText=', 'const memberTextReal='), lift('const subsText=', '\n').replace('const subsText=', 'const subsTextReal='),
  lift('function rowModel(', 'function drawRow('), lift('function refreshHeader(', 'const sideSeq='), lift('function openConvInfo(', 'function pickPhoto('),
  lift('function emptyPeople(', 'function picker('), lift('function searchExtras(', 'function updateStatus('),
  "const $=(s)=>s==='#convSub'?spy.sub:null,html=(t,c,h)=>el(t,c,h),userAvatar=()=>({}),isOnline=()=>false,lastSeen=()=>'',FEATURES={},reactCfg=()=>({mode:'all',allowed:[]}),openMediaGallery=()=>{},openPollCreate=()=>{},openReactSettings=()=>{},isMuted=()=>false,isPinned=()=>false,badgeOf=()=>null,hiddenPost=()=>false,previewText=()=>'',noKeyNotice=()=>{},liveSearch=()=>()=>{},peopleLook=()=>{},isRequest=()=>false;",
  'spy.fns={subsText:subsTextReal,memberText:memberTextReal,rowModel,refreshHeader,openConvInfo,searchExtras};',
].join('\n'));
const node = (e) => Object.assign(e, { kids: [], append(...k) { this.kids.push(...k); }, replaceChildren(...k) { this.kids = k; }, setAttribute() {}, style: {}, insertAdjacentHTML() {}, classList: { add() {}, remove() {} }, value: '' });
const build = (env) => {
  env.spy.sheets = [];
  return built({ ...env, I: new Proxy({}, { get: () => '' }), subsText: (...a) => env.spy.fns.subsText(...a), memberText: (...a) => env.spy.fns.memberText(...a), el: (...a) => node(env.el(...a)),
    renderList: () => { if (env.spy.renderList) env.spy.renderList(); },   // the chat list drawn again: the search's listing arrived (publicRows)
    sheet: (title) => { const body = node({ tag: 'sheet', cls: 'body', textContent: '' }); env.spy.sheets.push({ title, body }); return { body, sh: node({}), close() {} }; } });
};

const by = (kids, cls) => kids.filter((k) => k && k.cls === cls), one = (kids, cls) => by(kids, cls)[0];
// A Channel info or Group info sheet as drawn: its top line, its headings, and its people, each with the tags and actions on the row; the danger button at its foot
function info(X, cid) {
  X.spy.sheets.length = 0; X.spy.fns.openConvInfo(cid);
  const { body } = X.spy.sheets.at(-1);
  return { line: one(one(body.kids, 'info-top').kids, 't-sub').textContent, labels: by(body.kids, 'menu-label flush').map((k) => k.textContent),
    rows: by(body.kids, 'thread').map((r) => ({ name: one(one(r.kids, 't-main').kids, 't-name').textContent, tags: by(r.kids, 'role').map((k) => k.textContent), acts: r.kids.filter((k) => k && /^kick/.test(k.cls)).map((k) => k.textContent) })),
    foot: by(body.kids, 'menu-item danger flush').map((k) => k.textContent) };
}
// What the chat header says under the chat's name (refreshHeader), with c open
function header(X, c) { X.S.chan = c.id; X.spy.sub = node({ tag: 'div', cls: 't-sub', textContent: '' }); X.spy.fns.refreshHeader(); return X.spy.sub.kids.map((k) => k.textContent); }
// The chat list's row for a chat with no post yet: the model the row is drawn from and the sealed list cache keeps
const listRow = (X, c) => X.spy.fns.rowModel(c, null, Date.now());
// The join sheet's line under the channel's name
function joinLine(X, c) { X.spy.sheets.length = 0; X.confirmJoin(c, {}); return one(one(X.spy.sheets.at(-1).body.kids, 'info-top').kids, 't-sub').textContent; }
// What the chat list's search says under each public channel it finds for the text q: the search is drawn, the listing it asks the
// server for is waited for (the page draws its list again when it arrives: renderList, counted here), and the search is drawn again
async function publicRows(X, q) {
  const box = node({ tag: 'div', cls: 'threads', textContent: '' }), draw = () => { box.kids = []; Object.assign(X.S, { tab: 'chats', query: q }); X.spy.fns.searchExtras(box, []); };
  let drew = 0; X.spy.renderList = () => { drew++; };
  draw();
  if (!X.spy.listed) { for (let t0 = Date.now(); !drew; await sleep(40)) if (Date.now() - t0 > 6000) throw new Error('timed out waiting for the public listing on ' + X.handle + '\'s search'); X.spy.listed = true; draw(); }
  const at = box.kids.findIndex((k) => k.cls === 'menu-label' && k.textContent === 'Public channels');
  return at < 0 ? [] : box.kids.slice(at + 1).filter((k) => k.cls === 'thread').map((r) => one(one(r.kids, 't-main').kids, 't-sub').textContent);
}

// Alice owns a private channel where Xena and Erin are admins and Bob and Carol subscribe, and a public channel where Xena is an admin,
// which Bob has joined, and a group with Bob and Gina; Dave is in none of it. Each page holds its chats as its chat list does (the chat
// watch's copies); Dave holds the previews a link and a search leave. `rule`: the server withholds meta below admin level, as it does; else it is today's server.
async function cast(w, rule) {
  const { cid } = w, pid = 'c' + randomBytes(6).toString('hex'), gid = 'g' + randomBytes(6).toString('hex');
  const A = await w.page('alice', { owner: true, build }), X = await w.page('xena', { build }), B = await w.page('bob', { build }), D = await w.page('dave', { build });
  for (const h of ['erin', 'carol', 'gina']) await w.page(h, { build });
  await makeChannel(A, cid, ['alice', 'xena', 'erin', 'bob', 'carol'], ['xena', 'erin']);
  await makeChannel(A, pid, ['alice', 'xena'], ['xena']);
  await A.shown(pid); await A.setVisibility(pid, 'public'); await A.sync(pid);
  await makeChannel(A, gid, ['alice', 'bob', 'gina'], [], 'group');
  if (!rule) oldServer(w.T);
  else await A.S.db.doc('channels/' + cid).update({ n: 5 });   // the count the owner's page keeps on a private channel's record (recount), which the server hands below admin level since release 96
  B.S.prefs = { pub: [pid], blocked: [] };   // Bob's joining a public channel is a note to himself
  const view = async (P, id) => ({ ...(await P.shown(id)), id });
  const ch = { alice: await view(A, cid), xena: await view(X, cid), bob: await view(B, cid) }, pub = { alice: await view(A, pid), xena: await view(X, pid), bob: await view(B, pid) }, gr = await view(B, gid);
  const pre = { id: cid, ...(await D.S.db.preview(cid)).data() };
  D.S.previews.set(pid, await D.showMeta(await D.freshChan(pid)));
  if (rule) { assert.equal(ch.bob.n, 5, 'Bob\'s copy carries the record\'s count'); pre.n = 5; pub.bob.n = D.S.previews.get(pid).n = 2; }   // a preview and a public channel's record never carry n (the server drops it), so under the rule the copies get one here: a subscriber's page shows none even if one did
  for (const P of [A, X, B, D]) Object.assign(P.S, { contacts: [], contactsReady: true, pins: {}, warned: new Set(), presence: {}, unread: new Map(), mentions: new Map(), showArchived: false, call: null, typing: {} });
  A.S.convs = [ch.alice, pub.alice]; X.S.convs = [ch.xena, pub.xena]; B.S.convs = [ch.bob, pub.bob, gr];
  assert.deepEqual([A, X, B].map((P) => P.S.db.chatLevel(cid)), ['owner', 'admin', 'member'], 'the levels the pages hold');
  assert.deepEqual(ch.bob.members, rule ? [] : ['alice', 'xena', 'erin', 'bob', 'carol'], rule ? 'Bob\'s copy holds no list' : 'Bob\'s copy holds the whole list, as today\'s server hands it');
  assert.deepEqual([ch.bob.owner, ch.bob.admins, pub.bob.owner, pub.bob.admins], ['alice', ['xena', 'erin'], 'alice', ['xena']], 'the owner and the admins from the owner\'s part, as the record names them');
  return { A, X, B, D, cid, pid, gid, ch, pub, gr, pre };
}

const OWNER_ACTS = ['Remove admin', 'Send access again', 'Block from this channel', 'Block person'], SUB_ACTS = ['Make admin', 'Send access again', 'Block from this channel', 'Block person'];

for (const rule of [false, true]) test(`Channel info of a private channel, ${rule ? 'under the rule (no meta below admin level)' : 'on today\'s server (every subscriber gets the list)'}: the owner's and an admin's pages list every subscriber and count them, as before; a subscriber's page lists the channel's owner and admins alone, under "Owner and admins", with no action on any row, and counts the subscribers with a number only if it holds the list`, async () => {
  await world({}, async (w) => {
    const { A, X, B, cid } = await cast(w, rule);
    assert.deepEqual(info(A, cid), { line: 'Private channel, 5 subscribers', labels: ['Subscribers'], rows: [
      { name: 'alice (you)', tags: ['owner'], acts: [] }, { name: 'erin', tags: ['admin'], acts: OWNER_ACTS }, { name: 'xena', tags: ['admin'], acts: OWNER_ACTS },
      { name: 'bob', tags: [], acts: SUB_ACTS }, { name: 'carol', tags: [], acts: SUB_ACTS }], foot: ['Delete channel'] }, 'the owner\'s page, as before');
    assert.deepEqual(info(X, cid), { line: 'Private channel, 5 subscribers', labels: ['Subscribers'], rows: [
      { name: 'alice', tags: ['owner'], acts: ['Send access again', 'Block person'] }, { name: 'erin', tags: ['admin'], acts: ['Send access again', 'Block person'] }, { name: 'xena (you)', tags: ['admin'], acts: [] },
      { name: 'bob', tags: [], acts: ['Send access again', 'Block from this channel', 'Block person'] }, { name: 'carol', tags: [], acts: ['Send access again', 'Block from this channel', 'Block person'] }], foot: ['Leave channel'] }, 'an admin\'s page, as before');
    assert.deepEqual(info(B, cid), { line: 'Private channel, 5 subscribers', labels: ['Owner and admins'], rows: [
      { name: 'alice', tags: ['owner'], acts: [] }, { name: 'erin', tags: ['admin'], acts: [] }, { name: 'xena', tags: ['admin'], acts: [] }], foot: ['Leave channel'] },
    'a subscriber\'s page: a number of subscribers and no name (release 95), from the list it holds (today\'s server) or else the record\'s n (the rule; channel-history-count.test.js has the rest), no Subscribers heading, the owner and the admins from the record with no action on anyone, and Leave');
    B.S.prefs.blocked = ['erin'];
    assert.deepEqual(info(B, cid).rows.map((r) => r.acts), [[], [], []], 'not even Unblock person on an admin Bob blocked (her profile, one tap away, and Settings still unblock her)');
  });
});

test('Channel info of a public channel: the owner\'s and an admin\'s pages list the owner and the admins and count them, as before; a subscriber\'s page, and a visitor\'s who has not joined, count no one and list the owner and the admins alone, with no action on any row', async () => {
  await world({}, async (w) => {
    const { A, X, B, D, pid } = await cast(w, false);
    assert.deepEqual(info(A, pid), { line: 'Public channel, 2 subscribers', labels: ['Subscribers'], rows: [
      { name: 'alice (you)', tags: ['owner'], acts: [] }, { name: 'xena', tags: ['admin'], acts: ['Remove admin', 'Block person'] }], foot: ['Delete channel'] }, 'the owner\'s page, as before');
    assert.deepEqual(info(X, pid), { line: 'Public channel, 2 subscribers', labels: ['Subscribers'], rows: [
      { name: 'alice', tags: ['owner'], acts: ['Block person'] }, { name: 'xena (you)', tags: ['admin'], acts: [] }], foot: ['Leave channel'] }, 'an admin\'s page, as before');
    const rows = [{ name: 'alice', tags: ['owner'], acts: [] }, { name: 'xena', tags: ['admin'], acts: [] }];
    assert.deepEqual([info(B, pid), info(D, pid)], [{ line: 'Public channel', labels: ['Owner and admins'], rows, foot: ['Leave channel'] }, { line: 'Public channel', labels: ['Owner and admins'], rows, foot: [] }],
      'a subscriber who joined, and a visitor who has not: no number, the owner and the admins alone (not Bob), no action on anyone');
  });
});

for (const rule of [false, true]) test(`the count of subscribers, ${rule ? 'under the rule (no meta below admin level, the records carrying n)' : 'on today\'s server (every subscriber gets the list)'}: the chat header, the chat list's row of a channel with no post yet (and so the row the sealed list cache keeps) and the join sheet show it to the owner and the admins; a subscriber's page and a link holder's show only "Private channel" or "Public channel"`, async () => {
  await world({}, async (w) => {
    const { A, X, B, D, ch, pub, pre } = await cast(w, rule);
    // the owner's and an admin's pages count the people of the list they hold: five in the private channel, the owner and the admin in the public one
    assert.deepEqual({
      subsText: [A.spy.fns.subsText(ch.alice), X.spy.fns.subsText(ch.xena)],
      header: [header(A, ch.alice), header(X, ch.xena), header(A, pub.alice), header(X, pub.xena)],
      row: [listRow(A, ch.alice).s, listRow(X, ch.xena).s, listRow(A, pub.alice).s, listRow(X, pub.xena).s],
      join: joinLine(A, ch.alice),
    }, {
      subsText: ['5 subscribers', '5 subscribers'],
      header: [['5 subscribers'], ['5 subscribers'], ['Public, 2 subscribers'], ['Public, 2 subscribers']],
      row: ['5 subscribers', '5 subscribers', '2 subscribers', '2 subscribers'],
      join: '5 subscribers',
    }, 'the owner\'s and an admin\'s pages, as before');
    // a subscriber's page, whether it holds the list (today) or none but the record's n (the rule), and a link holder's, which holds the preview: the kind of channel, never the number
    const m = listRow(B, ch.bob);
    assert.deepEqual({
      n: [ch.bob.n, pub.bob.n, pre.n, D.S.previews.get(pub.bob.id).n],
      subsText: B.spy.fns.subsText(ch.bob),
      header: [header(B, ch.bob), header(B, pub.bob), header(D, D.S.previews.get(pub.bob.id))],
      row: [m.s, listRow(B, pub.bob).s],
      cached: /subscriber/.test(JSON.stringify(m)),
      join: [joinLine(D, await D.showMeta(pre)), joinLine(B, ch.bob)],
    }, {
      n: rule ? [5, 2, 5, 2] : [undefined, undefined, undefined, undefined],
      subsText: 'Private channel',
      header: [['Private channel'], ['Public channel'], ['Public channel']],
      row: ['Private channel', 'Public channel'],
      cached: false,
      join: ['Private channel', 'Private channel'],
    }, 'a subscriber\'s page (the header, the chat list\'s row, and so the row the sealed list cache keeps, and the join sheet handed its record) and a link holder\'s (the join sheet from the preview): the kind of channel, no number, whatever n the copies carry');
  });
});

test('the chat list\'s search lists a public channel with the number of subscribers for its owner and admins, and with "Public channel" for everyone else, even when the listing\'s record carries an n (the rows New message drew until release 111)', async () => {
  await world({}, async (w) => {
    const { A, X, B, D, pid } = await cast(w, false);
    const st = w.T.srv.store, q = st.query.bind(st); st.query = (...a) => q(...a).map((r) => (r.id === pid ? { ...r, d: { ...r.d, n: 2 } } : r));   // no server puts n on a public channel's record or in the listing; this one does, so the rows below pin that a subscriber's page shows none even then
    assert.deepEqual((await B.S.db.collection('channels').where('visibility', '==', 'public').limit(100).get()).docs.map((d) => d.data().n), [2], 'the listing hands Bob the count');
    // the channel is among Alice's, Xena's and Bob's chats: their search does not list it a second time. Dave has not joined: he finds it
    assert.deepEqual([await publicRows(A, 'history'), await publicRows(X, 'history'), await publicRows(B, 'history'), await publicRows(D, 'history')], [[], [], [], ['Public channel']], 'a channel of mine is not found as one to join; a visitor\'s page: the kind of channel');
    assert.deepEqual([await publicRows(D, 'h'), await publicRows(D, 'no such name')], [[], []], 'one character, and a text the name does not hold: no row');
    // a page whose chat list is not in yet (a device just signed in) lists it: with a number only for the owner and an admin
    for (const P of [A, X, B]) P.S.convs = [];
    const [a, x] = [await publicRows(A, 'history'), await publicRows(X, 'history')];
    assert.ok(a.length === 1 && /subscribers$/.test(a[0]) && x.length === 1 && /subscribers$/.test(x[0]), 'the owner\'s and an admin\'s pages: a number, as before (the public listing holds no list, so it counts 0): ' + JSON.stringify([a, x]));
    assert.deepEqual([await publicRows(B, 'history'), await publicRows(D, 'history')], [['Public channel'], ['Public channel']], 'a subscriber\'s page and a visitor\'s: the kind of channel');
  });
});

test('a group is as before: Group info lists every member with Block person on each other row and counts them, and so do the group\'s header and chat list row, for a member who is no admin (members see each other by design)', async () => {
  await world({}, async (w) => {
    const { B, gid, gr } = await cast(w, false);
    assert.deepEqual(info(B, gid), { line: '3 members', labels: ['Members'], rows: [
      { name: 'alice', tags: ['owner'], acts: ['Block person'] }, { name: 'bob (you)', tags: [], acts: [] }, { name: 'gina', tags: [], acts: ['Block person'] }], foot: ['Leave group'] });
    assert.deepEqual([header(B, gr), listRow(B, gr).s], [['3 members'], '3 members']);
  });
});
