// Group info and Channel info (openConvInfo): who is offered which row and which button, and what each button does.
// Written before redesign step B (release 105) takes the rules and the actions out of the sheet and gives them names
// (infoCan, memberCan, toggleAdmin, deleteOrLeave). Step B changes nothing a person sees or the page does, so every
// test here passes on the page before the split and after it, with this file and its fixture unchanged.
//
// The sheet runs as written in app/ui.js, with the page's own role decisions (isMember, levelHere, isOwner, isAdmin,
// knownIn, canPost, isBlocked), on the made-up page of screen-kit.js. The actions that have a name already (setAdmins,
// kickMember, resendKeys, unban, leaveChat, setVisibility) are stand-ins that note how they were called: each has tests
// of its own against a real server. Here it is the sheet's part that counts: which one, with what, and in which order.
//
// fixtures/info-rows.json is the sheet for 48 cases, recorded from the page of release 104 (95b82cc): three kinds of
// chat, this account listed as owner, admin, member or not at all, and the level the server gave its key (none, member,
// admin, owner). For each: the rows as a person reads them, where "Invite" leads, and a hash of the whole sheet as text
// (every element, class, attribute and handler, in order). To record again after a change that is meant:
//   HUSH_RECORD=info-rows node --test test/info-rows.test.js      and have every changed line of the fixture read.
//
// WHAT IT DOES NOT SEE: how the sheet looks, and what the server allows. The page's rows are a courtesy: the server
// refuses what a role may not do (group-owner.test.js, group-bans.test.js, channel-members.test.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { lift, build, el, html, I, dump, rows, texts, sha, all, tick } from './screen-kit.js';

const CODE = ['const typeOf=', 'const convById=', 'const isMember=', 'const levelHere=', 'const isOwner=', 'const isAdminH=', 'const isAdmin=', 'const knownIn=', 'const canPost=', 'const isBlocked=']
  .map((from) => lift(from, '\n')).concat(lift('function openConvInfo(', 'function pickPhoto(')).join('\n');
const ME = 'me';
const KINDS = { 'group': ['group', 'private'], 'private channel': ['channel', 'private'], 'public channel': ['channel', 'public'] };
// Olga owns it, Adam is an admin, Mia and Bea are in it (this account has blocked Bea), Zed is blocked from it.
function chat(kind, listed) {
  const [type, visibility] = KINDS[kind];
  const c = { id: 'c1', type, visibility, name: 'Team', desc: 'About the team', owner: 'olga', admins: ['adam'], members: ['olga', 'adam', 'mia', 'bea'], banned: ['zed'] };
  if (listed === 'owner') { c.owner = ME; c.members[0] = ME; }
  if (listed === 'admin') { c.admins.push(ME); c.members.push(ME); }
  if (listed === 'member') c.members.push(ME);
  return c;
}
// o: level (what the server gave this connection's key), no (every question is answered no), fail (the name of the action that
// fails) and error (with what), stopped (setAdmins' answer), kick (kickMember's answer), spy (called at each action)
function page(c, o = {}) {
  const log = [], sheets = [], taps = [];
  const say = (...a) => { log.push(a); };
  const act = (name, answer) => async (...a) => { say(name, ...a); if (o.spy) o.spy(name); if (o.fail === name) throw (o.error || new Error('offline')); return answer ? answer() : undefined; };
  const S = { me: { handle: ME }, convs: [c], previews: new Map([[c.id, { last: 'hello' }]]), chatDocs: new Map(), chan: c.id, prefs: { blocked: ['bea'] },
    db: { chatLevel: () => o.level || null, doc: (p) => ({ delete: act('doc.delete ' + p), update: act('doc.update ' + p) }) } };
  const env = { S, el, html, I, FEATURES: { channelComments: false }, setTimeout: () => say('later'),
    sheet: (title) => { const s = { title, body: el('div', 'sheet-body'), open: true }; sheets.push(s); say('sheet', title); return { body: s.body, close: () => { s.open = false; say('close'); } }; },
    confirm: (m) => { say('confirm', m); return !o.no; }, confirmDanger: (m) => { say('confirmDanger', m); return !o.no; },
    toast: (msg, label, fn, ms) => { say('toast', msg, ...(label === undefined ? [] : [label, ms])); if (fn) taps.push(fn); }, toastErr: (msg) => say('toastErr', msg),
    convAvatar: () => el('div', 'avatar'), userAvatar: (h, size) => el('div', 'avatar ' + size), memberText: () => '5 members', subsText: (x, lead) => lead + '5 subscribers',
    displayName: (h) => h[0].toUpperCase() + h.slice(1), atOf: (h) => '@' + h, withBadge: (n) => n, isOnline: (h) => h === 'mia', lastSeen: () => 'last seen recently',
    reactCfg: () => ({ mode: 'some', allowed: ['a', 'b'] }), rolesOf: () => null, epochOf: () => 3, sealKey: async () => { throw new Error('badkey'); },   // no signed admin list, and a key this device refuses: the hint and "Fix channel" show wherever the sheet offers them
    dmPeer: () => 'bob', openProfile: (h) => say('openProfile', h), openMediaGallery: () => say('openMediaGallery'), openEditConv: (id) => say('openEditConv', id), openInvite: (id, opt) => say('openInvite', id, opt),
    openAddSubs: (id) => say('openAddSubs', id), openReactSettings: (id) => say('openReactSettings', id), openPollCreate: (id) => say('openPollCreate', id), openRepair: (id) => say('openRepair', id),
    openConv: (id) => say('openConv', id), closeConv: () => say('closeConv'),
    setVisibility: act('setVisibility'), setAdmins: act('setAdmins', () => !!o.stopped), resendKeys: act('resendKeys'), kickMember: act('kickMember', () => o.kick), unban: act('unban'), leaveChat: act('leaveChat'),
    unblockPeer: (h) => say('unblockPeer', h), confirmBlockPerson: (h) => { say('confirmBlockPerson', h); return !o.no; } };
  const P = build(CODE, env, 'openConvInfo');
  const X = { S, c, log, sheets, taps, body: null, call: () => P.openConvInfo(c.id),
    async open() { P.openConvInfo(c.id); await tick(); X.body = sheets.at(-1).body; log.length = 0; return X; },
    row: (text) => { const hits = X.body.kids.filter((k) => k.kids && texts(k).includes(text)); assert.equal(hits.length, 1, 'one row shows ' + JSON.stringify(text)); return hits[0]; },
    // press a row of the sheet, or (with `who`) the button of that name on a person's line
    async press(text, who) {
      if (!who) return X.row(text).onclick();
      const k = all(X.row(who), (e) => e.className.startsWith('kick') && e.textContent === text); assert.equal(k.length, 1, who + ' has the button ' + text);
      assert.equal(k[0].attrs.role, 'button'); assert.equal(k[0].tabIndex, 0);
      let stopped = 0; await k[0].onclick({ stopPropagation() { stopped++; } }); assert.equal(stopped, 1, 'the press does not also open the profile');
    } };
  return X;
}
const opened = async (kind, listed, o) => page(chat(kind, listed), o).open();

// ---- the 48 sheets ---------------------------------------------------------------------------------------------------
const FIXTURE = new URL('./fixtures/info-rows.json', import.meta.url);
const CASES = Object.keys(KINDS).flatMap((kind) => ['owner', 'admin', 'member', 'none'].flatMap((listed) => [null, 'member', 'admin', 'owner'].map((level) => ({ kind, listed, level, name: `${kind}, listed as ${listed}, level ${level || 'none'}` }))));
async function screen(k) {
  const X = await opened(k.kind, k.listed, { level: k.level });
  let invite = 'no row';
  if (X.body.kids.some((e) => e.kids && /^Invite/.test(texts(e)[0]))) { await X.row(k.kind === 'group' ? 'Invite via link' : 'Invite link and QR code').onclick(); invite = JSON.stringify(X.log.at(-1)); }
  return { rows: rows(X.body), invite, sha: sha(X.sheets[0].title + '\n' + dump(X.body)) };
}

test('the Info sheet of every case reads as recorded: rows, buttons, where Invite leads, and the whole sheet as text', async () => {
  const got = {}; for (const k of CASES) got[k.name] = await screen(k);
  if (process.env.HUSH_RECORD === 'info-rows') writeFileSync(FIXTURE, JSON.stringify({ about: 'Group info and Channel info as the page draws them, for server/test/info-rows.test.js (its head says how this is recorded). Never edit by hand.', screens: got }, null, 1) + '\n');
  const want = JSON.parse(readFileSync(FIXTURE, 'utf8')).screens;
  assert.deepEqual(Object.keys(got), Object.keys(want), 'the same 48 cases');
  assert.equal(CASES.length, 48);
  for (const k of CASES) { assert.deepEqual(got[k.name].rows, want[k.name].rows, k.name); assert.equal(got[k.name].invite, want[k.name].invite, k.name + ': Invite'); assert.equal(got[k.name].sha, want[k.name].sha, k.name + ': the sheet as text'); }
});

// The recorded list is long. These lines say by hand what its most important cases must hold, so that a wrong recording is seen too.
const buttons = (X, who) => all(X.row(who), (e) => e.className.startsWith('kick')).map((e) => e.textContent);
const labels = (X) => X.body.kids.filter((e) => e.kids && /^(button\.menu-item|div\.menu-label)/.test(rows({ kids: [e] })[0])).map((e) => texts(e)[0]);
test('by hand: the owner of a group', async () => {
  const X = await opened('group', 'owner');
  assert.deepEqual(labels(X), ['Shared media', 'Edit name, description and photo', 'Invite via link', 'Add members', 'Reactions', 'New poll', 'Members', 'Blocked from this group', 'Delete group']);
  assert.deepEqual(buttons(X, 'Me (you)'), [], 'nothing on her own line');
  assert.deepEqual(buttons(X, 'Adam'), ['Remove admin', 'Send access again', 'Block from this group', 'Block person']);
  assert.deepEqual(buttons(X, 'Mia'), ['Make admin', 'Send access again', 'Block from this group', 'Block person']);
  assert.deepEqual(buttons(X, 'Bea'), ['Make admin', 'Send access again', 'Block from this group', 'Unblock person'], 'Bea is blocked by this account');
  assert.deepEqual(buttons(X, 'Zed'), ['Unblock'], 'the person blocked from the group');
});
test('by hand: an admin of a group cannot change admins, and cannot block the owner or another admin from it', async () => {
  const X = await opened('group', 'admin');
  assert.deepEqual(labels(X), ['Shared media', 'Invite via link', 'Add members', 'New poll', 'Members', 'Blocked from this group', 'Leave group']);
  assert.deepEqual(buttons(X, 'Olga'), ['Send access again', 'Block person'], 'the owner');
  assert.deepEqual(buttons(X, 'Adam'), ['Send access again', 'Block person'], 'another admin');
  assert.deepEqual(buttons(X, 'Me (you)'), []);
  assert.deepEqual(buttons(X, 'Mia'), ['Send access again', 'Block from this group', 'Block person']);
});
test('by hand: a member of a group only blocks people for herself, and leaves', async () => {
  const X = await opened('group', 'member');
  assert.deepEqual(labels(X), ['Shared media', 'New poll', 'Members', 'Leave group']);
  for (const who of ['Olga', 'Adam', 'Mia']) assert.deepEqual(buttons(X, who), ['Block person'], who);
  assert.deepEqual(buttons(X, 'Bea'), ['Unblock person']);
  assert.deepEqual(buttons(X, 'Me (you)'), []);
});
test('by hand: a subscriber of a private channel sees its owner and admins only, with no button on them; its owner sees everyone', async () => {
  const sub = await opened('private channel', 'none', { level: 'member' });
  assert.deepEqual(labels(sub), ['Shared media', 'Owner and admins', 'Leave channel']);
  assert.deepEqual(sub.body.kids.filter((e) => e.className === 'thread').map((e) => texts(e)[0]), ['Olga', 'Adam'], 'no subscriber is named');
  assert.deepEqual([buttons(sub, 'Olga'), buttons(sub, 'Adam')], [[], []]);
  const own = await opened('private channel', 'owner');
  assert.deepEqual(labels(own), ['Shared media', 'Edit name, description and photo', 'Invite link and QR code', 'Add subscribers', 'Make public', 'Reactions', 'New poll', 'Fix channel', 'Subscribers', 'Blocked from this channel', 'Delete channel']);
  assert.deepEqual(buttons(own, 'Mia'), ['Make admin', 'Send access again', 'Block from this channel', 'Block person']);
});
test('by hand: a public channel has no "Send access again" and no "Block from this channel"; someone who only reads it gets no Leave row', async () => {
  const own = await opened('public channel', 'owner');
  assert.deepEqual(labels(own), ['Shared media', 'Edit name, description and photo', 'Invite link and QR code', 'Add subscribers', 'Make private', 'Reactions', 'New poll', 'Subscribers', 'Blocked from this channel', 'Delete channel']);
  assert.deepEqual(buttons(own, 'Adam'), ['Remove admin', 'Block person']);
  const reader = await opened('public channel', 'none');
  assert.deepEqual(labels(reader), ['Shared media', 'Owner and admins']);
  const member = await opened('public channel', 'member');
  assert.deepEqual(labels(member), ['Shared media', 'Invite link and QR code', 'Owner and admins', 'Leave channel']);
});

// ---- what the buttons do ---------------------------------------------------------------------------------------------
const NO = 'That didn’t go through. Try again.';
test('Make admin: the question, then the new list to setAdmins, and only after it the page\'s own copy; the sheet closes, says so and opens again', async () => {
  const seen = []; const X = await opened('group', 'owner', { spy: () => seen.push([...X.c.admins]) });
  await X.press('Make admin', 'Mia');
  assert.deepEqual(X.log, [['confirm', 'Make Mia an admin? They’ll be able to post, pin, delete messages and remove members.'], ['setAdmins', 'c1', ['adam', 'mia']], ['close'], ['toast', 'Mia is now an admin'], ['sheet', 'Group info']]);
  assert.deepEqual(seen, [['adam']], 'the page\'s copy is still the old one while the server is asked');
  assert.deepEqual(X.c.admins, ['adam', 'mia']);
  assert.deepEqual(buttons(Object.assign(X, { body: X.sheets.at(-1).body }), 'Mia'), ['Remove admin', 'Send access again', 'Block from this group', 'Block person'], 'the sheet drawn again knows her as an admin');
});
test('Make admin answered no: nothing is asked of the server and nothing changes', async () => {
  const X = await opened('group', 'owner', { no: true });
  await X.press('Make admin', 'Mia');
  assert.deepEqual(X.log.map((l) => l[0]), ['confirm']);
  assert.deepEqual(X.c.admins, ['adam']);
});
test('Remove admin: no question; the list without that person', async () => {
  const X = await opened('private channel', 'owner');
  await X.press('Remove admin', 'Adam');
  assert.deepEqual(X.log, [['setAdmins', 'c1', []], ['close'], ['toast', 'Adam is no longer an admin'], ['sheet', 'Channel info']]);
  assert.deepEqual(X.c.admins, []);
});
test('Remove admin that stopped open invite links: the toast says so and its "New link" opens the invite sheet', async () => {
  const X = await opened('private channel', 'owner', { stopped: true });
  await X.press('Remove admin', 'Adam');
  assert.deepEqual(X.log.slice(0, 3), [['setAdmins', 'c1', []], ['close'], ['toast', 'Adam is no longer an admin. Open invite links stopped working.', 'New link', 8000]]);
  X.log.length = 0; X.taps[0]();
  assert.deepEqual(X.log, [['openInvite', 'c1', { auto: true }]]);
});
test('Make admin that fails: the sentence, the page\'s copy as it was, the sheet left open', async () => {
  const X = await opened('group', 'owner', { fail: 'setAdmins' });
  await X.press('Make admin', 'Mia');
  assert.deepEqual(X.log, [['confirm', 'Make Mia an admin? They’ll be able to post, pin, delete messages and remove members.'], ['setAdmins', 'c1', ['adam', 'mia']], ['toastErr', NO]]);
  assert.deepEqual(X.c.admins, ['adam']); assert.equal(X.sheets[0].open, true);
});

test('Send access again: resendKeys for that person', async () => {
  const X = await opened('group', 'admin');
  await X.press('Send access again', 'Mia');
  assert.deepEqual(X.log, [['resendKeys', 'c1', 'mia'], ['toast', 'Access sent again to Mia’s devices']]);
  const F = await opened('group', 'admin', { fail: 'resendKeys' });
  await F.press('Send access again', 'Mia');
  assert.deepEqual(F.log, [['resendKeys', 'c1', 'mia'], ['toastErr', NO]]);
});

const BLOCK_Q = (noun, what, tail) => `Block Mia from “Team”?\n\nThey’re removed and can’t rejoin, even with an invite link. They can’t read new ${what}. This only applies to this ${noun}.${tail}`;
test('Block from this group: the question, then kickMember with the block; the sheet closes, says so and opens again', async () => {
  const X = await opened('group', 'owner');
  await X.press('Block from this group', 'Mia');
  assert.deepEqual(X.log, [['confirmDanger', BLOCK_Q('group', 'messages', '')], ['kickMember', 'c1', 'mia', { ban: true }], ['close'], ['toast', 'Mia was blocked from this group'], ['sheet', 'Group info']]);
  const N = await opened('group', 'owner', { no: true });
  await N.press('Block from this group', 'Mia');
  assert.deepEqual(N.log.map((l) => l[0]), ['confirmDanger'], 'answered no: nothing happens');
});
test('Block from this channel: the question names the stopped links; with open links the toast offers a new one; a full block list is said', async () => {
  const X = await opened('private channel', 'owner');
  X.S.chatDocs.set('c1', { invites: { i1: {} } });
  await X.press('Block from this channel', 'Mia');
  assert.deepEqual(X.log.slice(0, 4), [['confirmDanger', BLOCK_Q('channel', 'posts', ' Open invite links stop working. You can make a new one.')], ['kickMember', 'c1', 'mia', { ban: true }], ['close'], ['toast', 'Mia was blocked from this channel', 'New link', 8000]]);
  X.log.length = 0; X.taps[0](); assert.deepEqual(X.log, [['openInvite', 'c1', { auto: true }]]);
  const F = await opened('private channel', 'admin', { kick: 'full' });
  await F.press('Block from this channel', 'Mia');
  assert.deepEqual(F.log[3], ['toast', 'Mia was removed, but this channel’s block list is full, so a link could bring them back. Ask the owner to block them.']);
});
test('Block from this channel that fails: three sentences, by what went wrong; the sheet stays', async () => {
  const say = async (error) => { const X = await opened('private channel', 'owner', { fail: 'kickMember', error }); await X.press('Block from this channel', 'Mia'); assert.equal(X.sheets[0].open, true); assert.equal(X.log.length, 3); return X.log[2]; };
  assert.deepEqual(await say(Object.assign(new Error('badkey'), { noBan: true })), ['toastErr', 'Hush couldn’t check this channel, so nothing was changed and they are not blocked. Reload Hush. If the owner’s security code changed, accept the new code.']);
  assert.deepEqual(await say(new Error('badkey')), ['toastErr', 'They were blocked and can’t open the channel again, but securing the channel didn’t finish. Reload Hush. If the owner’s security code changed, accept the new code. If it keeps happening, ask the channel’s owner.']);
  assert.deepEqual(await say(new Error('offline')), ['toastErr', 'Couldn’t block them. Check your connection and try again.']);
});

test('Unblock, in "Blocked from this group": unban for that person', async () => {
  const X = await opened('group', 'admin');
  await X.press('Unblock', 'Zed');
  assert.deepEqual(X.log, [['unban', 'c1', 'zed'], ['close'], ['toast', 'Zed can join again']]);
  const F = await opened('group', 'admin', { fail: 'unban' });
  await F.press('Unblock', 'Zed');
  assert.deepEqual(F.log, [['unban', 'c1', 'zed'], ['toastErr', NO]]);
});
test('Block person and Unblock person: the page\'s own two actions, then the sheet again', async () => {
  const X = await opened('group', 'member');
  await X.press('Block person', 'Mia');
  assert.deepEqual(X.log, [['confirmBlockPerson', 'mia'], ['close'], ['sheet', 'Group info']]);
  const N = await opened('group', 'member', { no: true });
  await N.press('Block person', 'Mia');
  assert.deepEqual(N.log, [['confirmBlockPerson', 'mia']]);
  const U = await opened('group', 'member');
  await U.press('Unblock person', 'Bea');
  assert.deepEqual(U.log, [['unblockPeer', 'bea'], ['toast', 'Bea unblocked'], ['close'], ['sheet', 'Group info']]);
});

const GONE = 'That didn’t go through. Check your connection and try again.';
test('the last row for the owner: Delete. The question, the chat\'s record deleted, its line in the chat list forgotten; never leaveChat', async () => {
  const X = await opened('group', 'owner');
  await X.press('Delete group');
  assert.deepEqual(X.log, [['confirmDanger', 'Delete “Team” for everyone?'], ['doc.delete channels/c1'], ['close'], ['closeConv'], ['toast', 'Group deleted']]);
  assert.equal(X.S.previews.has('c1'), false);
  const C = await opened('private channel', 'none', { level: 'owner' });   // the owner by the server's word alone
  await C.press('Delete channel');
  assert.deepEqual(C.log, [['confirmDanger', 'Delete “Team” for everyone?'], ['doc.delete channels/c1'], ['close'], ['closeConv'], ['toast', 'Channel deleted']]);
});
test('the last row for anyone else: Leave. The question, leaveChat, the line forgotten; the record is never deleted', async () => {
  for (const [kind, listed, level, label, said] of [['group', 'member', null, 'Leave group', 'You left the group'], ['group', 'admin', null, 'Leave group', 'You left the group'], ['private channel', 'none', 'member', 'Leave channel', 'You left the channel'], ['public channel', 'member', null, 'Leave channel', 'You left the channel']]) {
    const X = await opened(kind, listed, { level });
    await X.press(label);
    assert.deepEqual(X.log, [['confirmDanger', 'Leave “Team”?'], ['leaveChat', 'c1'], ['close'], ['closeConv'], ['toast', said]], kind + ', ' + listed);
    assert.equal(X.S.previews.has('c1'), false);
  }
});
test('Delete and Leave answered no, or failing: nothing is forgotten and the sheet stays', async () => {
  const N = await opened('group', 'owner', { no: true });
  await N.press('Delete group');
  assert.deepEqual(N.log.map((l) => l[0]), ['confirmDanger']);
  const D = await opened('group', 'owner', { fail: 'doc.delete channels/c1' });
  await D.press('Delete group');
  assert.deepEqual(D.log, [['confirmDanger', 'Delete “Team” for everyone?'], ['doc.delete channels/c1'], ['toastErr', GONE]]);
  const L = await opened('group', 'member', { fail: 'leaveChat' });
  await L.press('Leave group');
  assert.deepEqual(L.log, [['confirmDanger', 'Leave “Team”?'], ['leaveChat', 'c1'], ['toastErr', GONE]]);
  for (const X of [N, D, L]) { assert.equal(X.S.previews.has('c1'), true); assert.equal(X.sheets[0].open, true); }
});

test('the rows that open another screen close the sheet first; Make public and Make private ask, then setVisibility', async () => {
  const X = await opened('private channel', 'owner');
  for (const [label, went] of [['Shared media', ['openMediaGallery']], ['Edit name, description and photo', ['openEditConv', 'c1']], ['Add subscribers', ['openAddSubs', 'c1']], ['Reactions', ['openReactSettings', 'c1']], ['New poll', ['openPollCreate', 'c1']], ['Fix channel', ['openRepair', 'c1']]]) {
    X.log.length = 0; await X.press(label); assert.deepEqual(X.log, [['close'], went], label);
  }
  X.log.length = 0; await X.press('Make public');
  assert.deepEqual(X.log, [['confirm', 'Make “Team” public?\n\nAnyone will be able to find it, join, and read every post, including past ones. Private invite links stop working.'], ['setVisibility', 'c1', 'public'], ['close'], ['toast', 'Channel is now public'], ['later']]);
  const P = await opened('public channel', 'owner');
  await P.press('Make private');
  assert.deepEqual(P.log.slice(1), [['setVisibility', 'c1', 'private'], ['close'], ['toast', 'Channel is now private'], ['later']]);
  const N = await opened('public channel', 'owner', { no: true });
  await N.press('Make private'); assert.deepEqual(N.log.map((l) => l[0]), ['confirm']);
  const F = await opened('public channel', 'owner', { fail: 'setVisibility' });
  await F.press('Make private'); assert.deepEqual(F.log.at(-1), ['toastErr', GONE]);
});

test('a one-to-one chat opens the person\'s profile instead, and a chat this page does not know opens nothing', () => {
  const D = page({ id: 'd1', type: 'dm', members: [ME, 'bob'] });
  D.call();
  assert.deepEqual([D.sheets, D.log], [[], [['openProfile', 'bob']]]);
  const Q = page(chat('group', 'member')); Q.S.convs = []; Q.S.previews.clear();
  Q.call();
  assert.deepEqual([Q.sheets, Q.log], [[], []]);
});
