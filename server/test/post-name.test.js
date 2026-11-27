// Release 111, part I (the owner's decision D10 = b): no channel name on top of a channel post.
// Until this release every post of a channel began with the channel's name (msgNode, app/ui.js), so a photo never reached the
// top of its post. The name is in the chat's header; now no channel post carries it, photo or not, and a photo that comes
// first fills its post up to the top edge by the style rules that were already there. Nothing else of a message changes:
// in a group someone else's first message of a run still carries the sender's name; a one-on-one message never had one;
// the caption is still under the photos inside the same post; several photos are still one tiled block (albumNode).
// msgNode and albumNode are cut out of app/ui.js and run as written, on elements that only remember what was done to them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI, lift, build } from './screen-kit.js';

const line = (start) => { const a = UI.indexOf('\n' + start); assert.ok(a > 0, 'app/ui.js holds a line that starts ' + JSON.stringify(start)); return UI.slice(a + 1, UI.indexOf('\n', a + 1)); };
const MSG = () => lift('function msgNode(c,p,o,cont){', '\nfunction jumpTo(id){');
const ALBUM = () => line('const ALBUM_ROWS=') + '\n' + lift('function albumNode(c,items,e){', '\nfunction stopOtherAudio(');

// an element that remembers its class, its children in order and what was set on it
function el(tag, cls, text) {
  const e = { tag, className: cls || '', textContent: text == null ? '' : String(text), kids: [], dataset: {}, style: { setProperty(k, v) { this[k] = v; } },
    classList: { add: (c) => { e.className += ' ' + c; } }, get lastChild() { return e.kids.at(-1); },
    append(...k) { e.kids.push(...k); }, replaceChildren(...k) { e.kids = k; }, insertAdjacentHTML(_w, h) { e.kids.push({ tag: 'markup', className: '', markup: h, kids: [] }); } };
  return e;
}
const html = (tag, cls, h) => { const e = el(tag, cls); e.innerHTML = h; if (/<span><\/span>$/.test(h)) e.kids.push(el('span')); return e; };
const has = (e, cls) => (' ' + e.className + ' ').includes(' ' + cls + ' ');

function page(me = 'me') {
  const S = { me: { handle: me }, serverView: false, ccount: new Map() };
  const env = { S, el, html, I: new Proxy({}, { get: () => '' }), FEATURES: {}, walkBad: new Set(), window: {},
    hiddenPost: () => false, validHandle: () => true, loadDir: async () => false, renderConv: () => {},
    typeOf: (c) => c.type, isSelf: () => false, mediaFitWidth: () => 420, mentionsMe: () => false, displayName: (h) => 'Name of ' + h,
    withBadge: (n) => n, isAdminH: (c, h) => c.owner === h || (c.admins || []).includes(h), noKeyNotice: () => {}, callMissed: () => false, callText: () => 'call', jumpTo: () => {},
    mediaNode: (_c, m) => { const t = el('div', 'media'); t.item = m; return t; }, viewer: () => {},
    voiceNode: () => el('div', 'voice'), fileNode: () => el('div', 'file'), pollNode: () => Object.assign(el('div', 'poll'), { _refresh() {} }), richText: (t) => t,
    reactNode: () => Object.assign(el('div', 'reacts'), { _refresh() {} }), openComments: () => {}, curConv: () => null, lifeMark: () => '', readCount: () => 0, fmtTime: () => '12:00',
    msgMenu: () => {}, addLongPress: () => {}, addSwipe: () => {}, canPost: () => true, setReply: () => {} };
  const { msgNode, albumNode } = build(ALBUM() + '\n' + MSG(), env, 'msgNode,albumNode');
  // the post's box (the bubble) of a message drawn in chat c
  const box = (c, o, from = 'olga', cont = false) => msgNode(c, { _id: 'p1', from, ts: 1, sig: 's' }, Object.assign({ text: '', known: true, verified: true }, o), cont).kids[0];
  return { S, msgNode, albumNode, box };
}
const photo = (w = 800, h = 600) => ({ kind: 'image', w, h }), video = () => ({ kind: 'video', w: 1280, h: 720 });
const CHANNEL = { id: 'cNEWS', type: 'channel', name: 'Daily News', owner: 'olga', admins: [] };
const GROUP = { id: 'gTEAM', type: 'group', name: 'Team', owner: 'olga', admins: ['adam'] };
const DM = { id: 'dPAIR', type: 'dm', members: ['me', 'olga'] };
const classes = (b) => b.kids.map((k) => (typeof k === 'string' ? 'text' : k.className.split(' ')[0] || k.tag));
const names = (b) => b.kids.filter((k) => k && has(k, 'post-from'));
// the post below any name line, and one part of it by its class: what the two tests that only pin today's order read, so they
// say the same before and after this release
const under = (b) => classes(b).filter((x) => x !== 'post-from'), part = (b, cls) => b.kids.find((k) => has(k, cls));

test('a channel photo post: no name line, and the photo block is the first thing in the post', () => {
  const p = page();
  const b = p.box(CHANNEL, { media: [photo()] });
  assert.equal(names(b).length, 0, 'no channel name in the post');
  assert.deepEqual(classes(b), ['album', 'meta'], 'the photos, then the time line; nothing above the photos');
  assert.ok(has(b, 'has-album') && has(b, 'album-only'), 'a post with photos and nothing else: the time goes over the picture\'s corner');
});

test('D10 = b: no channel post carries the channel\'s name: text, photo with a caption, album, video, voice note, file, poll', () => {
  const p = page();
  const posts = { text: { text: 'hello' }, caption: { text: 'look', media: [photo()] }, album: { text: 'four', media: [photo(), photo(), photo(), photo()] }, video: { media: [video()] },
    voice: { media: [{ kind: 'voice' }] }, file: { media: [{ kind: 'file' }] }, poll: { poll: { q: 'yes?' } } };
  for (const [what, o] of Object.entries(posts)) {
    const b = p.box(CHANNEL, o);
    assert.equal(names(b).length, 0, what + ': no name line');
    assert.ok(!JSON.stringify(b.kids.map((k) => k.textContent)).includes('Daily News'), what + ': the channel\'s name is nowhere in the post');
  }
  assert.deepEqual(classes(p.box(CHANNEL, posts.text)), ['txt', 'meta']);
  assert.deepEqual(classes(p.box(CHANNEL, { text: 'mine' }, 'me')), ['txt', 'meta'], 'the owner\'s own page: the same');
});

test('kept: in a group someone else\'s first message of a run carries the sender\'s name, with the role; mine and a continued one do not; a one-on-one message never does', () => {
  const p = page();
  const b = p.box(GROUP, { text: 'hi' }, 'bob');
  assert.deepEqual(classes(b), ['post-from', 'txt', 'meta'], 'the name is the first thing in the box');
  assert.equal(names(b)[0].textContent, 'Name of bob');
  assert.deepEqual(names(b)[0].kids.map((k) => k.textContent), [], 'a member: no role');
  assert.deepEqual(names(p.box(GROUP, { text: 'hi' }, 'adam'))[0].kids.map((k) => [k.className, k.textContent]), [['role-sm', 'admin']]);
  assert.deepEqual(names(p.box(GROUP, { text: 'hi' }, 'olga'))[0].kids.map((k) => [k.className, k.textContent]), [['role-sm', 'owner']]);
  assert.deepEqual(classes(p.box(GROUP, { media: [photo()] }, 'bob')), ['post-from', 'album', 'meta'], 'a group photo from someone else keeps the name above it, as before');
  assert.equal(names(p.box(GROUP, { text: 'hi' }, 'bob', true)).length, 0, 'the next message of the same run: no name');
  assert.equal(names(p.box(GROUP, { text: 'hi' }, 'me')).length, 0, 'my own: no name');
  assert.equal(names(p.box(DM, { text: 'hi' }, 'olga')).length, 0, 'one-on-one, theirs: no name');
  assert.equal(names(p.box(DM, { media: [photo()] }, 'me')).length, 0, 'one-on-one, mine: no name');
  assert.deepEqual(classes(p.box(DM, { media: [photo()] }, 'olga')), ['album', 'meta'], 'a one-on-one photo fills its post, as before');
});

test('pinned as it is today: the caption comes after the photo block, inside the same post, and a forward or a reply line stays above the photos', () => {
  const p = page();
  for (const c of [CHANNEL, GROUP, DM]) {
    const b = p.box(c, { text: 'a caption', media: [photo(), photo()] }, 'me');
    assert.deepEqual(under(b), ['album', 'txt', 'meta'], c.type + ': photos, caption, time, in one box');
    assert.equal(part(b, 'txt').className, 'txt cap', c.type + ': the caption\'s class');
    assert.ok(has(b, 'has-album') && !has(b, 'album-only'), c.type + ': with a caption the time is under it, not over the picture');
    assert.equal(part(b, 'album').kids.length, 1, c.type + ': two photos are one row of one block');
  }
  assert.deepEqual(under(p.box(CHANNEL, { media: [photo()], fwd: { name: 'Elsewhere' } })), ['fwd', 'album', 'meta'], 'a forwarded photo: the forward line is above it, as in chats');
  assert.deepEqual(under(p.box(CHANNEL, { media: [photo()], reply: { from: 'olga', snip: 's', id: 'p0' } })), ['quote', 'album', 'meta']);
  assert.equal(part(p.box(CHANNEL, { text: 'plain' }), 'txt').className, 'txt', 'text with no photo is not a caption');
  assert.ok(!has(p.box(CHANNEL, { media: [photo(), { kind: 'voice' }] }), 'album-only'), 'photos with a voice note: not photos alone');
});

test('pinned as it is today: several photos and videos of one message are one tiled block, rows by how many there are', () => {
  const p = page();
  const rows = (n) => { const al = p.albumNode(CHANNEL, Array.from({ length: n }, () => photo()), 0); return has(al, 'one') ? [1] : al.kids.map((r) => { assert.equal(r.className, 'arow'); return r.kids.length; }); };
  assert.deepEqual(Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => [n, rows(n)])),
    { 1: [1], 2: [2], 3: [1, 2], 4: [2, 2], 5: [2, 3], 6: [3, 3], 7: [2, 2, 3], 8: [2, 3, 3], 9: [3, 3, 3], 10: [3, 3, 4] });
  assert.deepEqual([rows(11), rows(13), rows(14)], [[3, 3, 4, 1], [3, 3, 4, 3], [3, 3, 4, 3, 1]], 'past ten: three more a row');
  assert.equal(p.albumNode(CHANNEL, [photo()], 0).className, 'album one'); assert.equal(p.albumNode(CHANNEL, [photo(), video()], 0).className, 'album multi');
  const b = p.box(CHANNEL, { text: 'ten', media: Array.from({ length: 10 }, () => photo()) });
  assert.deepEqual(under(b), ['album', 'txt', 'meta'], 'ten photos and their caption: one message, one block, one box');
  assert.equal(part(b, 'album').kids.reduce((n, r) => n + r.kids.length, 0), 10, 'every picture is shown; no "+N" tile');
});

test('the lines as written: the channel\'s line is gone, the group\'s stands alone', () => {
  const fn = MSG();
  assert.ok(!fn.includes("el('div','post-from',c.name)"), 'no name line made from the channel\'s name');
  assert.ok(fn.includes("\n  if(t==='group'&&!mine&&!cont){const n=el('div','post-from',displayName(p.from));withBadge(n,p.from);if(isAdminH(c,p.from))n.append(el('span','role-sm',p.from===c.owner?'owner':'admin'));b.append(n)}\n"), 'the group sender\'s name, as it was, now an `if` of its own');
  assert.equal(fn.split("'post-from'").length - 1, 1, 'one name line in msgNode');
});
