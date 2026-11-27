// An invitation into a chat I am not in waits for my Join, whoever sent it (release 108, SPEC.md 5.6 and 6). Until release 108 any
// note tagged `invite` put the chat in my list as soon as its record was readable: a private group whose key someone wrapped for
// me, or any public channel, with no question asked, and an invitation with no signature passed the note rule under any name
// (noteOk is frozen and lets it through). Now, in the chat watch: an invitation that is not my own and has no good signature is
// dropped; one into a chat this page already shows or a public channel I joined goes in as before (a key stored on this device
// does not count: invite-hold-key.test.js); every other one is held, a friend's too: the page does not open or watch the chat, nothing about it reaches the server,
// and it shows under Message requests with Join, Delete and Block. (As first built, an invitation from a person I had an accepted
// or self-started one-on-one chat with went straight in. With "Send a request first" off a stranger became such a person by
// leaving one one-on-one note, so the pass was taken out: the owner's decision of 2026-11-16.) The harness is requests-kit.js: the
// page's own functions with stubs around them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UI, lift, ME, T, cidOf, page, dmRec, note, mkEl, text, all, button } from './requests-kit.js';

const G = 'gAbCdEfGhIjKl', G2 = 'gZZZZZZZZZZZZ', C1 = 'cPUBLICpublic', CAROL = cidOf('carol');
const records = { [G]: { type: 'group', visibility: 'private', epoch: 0, ts: T, last: null }, [G2]: { type: 'group', visibility: 'private', epoch: 0, ts: T, last: null },
  [C1]: { type: 'channel', visibility: 'public', epoch: 0, ts: T, last: null }, [CAROL]: dmRec() };
const signed = (id, from, cid, extra = {}) => note(id, 'invite', from, cid, { sg: 'signed by ' + from, ...extra });
const world = (o = {}) => page({ records, keys: [G], ...o });   // a key for G is wrapped for my device: the group would show at once
const shown = (pg) => pg.list().map((c) => c.id).sort(), held = (pg) => (pg.S.invites || []).map((v) => v.cid + ' from ' + v.from);

test('an invitation that is not my own and carries no signature is dropped: not shown, not held, its chat never asked for', async () => {
  const pg = world(); await pg.snap([note('aaa', 'invite', 'zed99', G), note('bbb', 'invite', 'zed99', C1, { type: 'channel' })]);
  assert.deepEqual([shown(pg), held(pg), pg.log.watched, pg.log.renoted], [[], [], [], []]);
  // from a friend's name too: without a signature nobody can say who left it
  const fr = world({ dms: { [CAROL]: { peer: 'carol' } } }); await fr.snap([note('aaa', 'invite', 'carol', G)]);
  assert.deepEqual([shown(fr), held(fr), fr.log.watched], [[], [], []]);
  // a signature that does not check is no signature (the note rule drops it before the watch sees it)
  const bad = world(); await bad.snap([note('aaa', 'invite', 'zed99', G, { sg: 'signed by someone else' })]);
  assert.deepEqual([shown(bad), held(bad), bad.log.watched], [[], [], []]);
  // a note that only says it is mine, without the stored mark, is a stranger's unsigned note
  const fake = world(); await fake.snap([note('aaa', 'invite', ME, G)]);
  assert.deepEqual([shown(fake), held(fake), fake.log.watched], [[], [], []]);
  // dropped as a forged note is: it goes once it is a week old
  const old = world({ seen: true }); await old.snap([note('aaa', 'invite', 'zed99', G, {}, T - 9 * 864e5)]);
  assert.deepEqual(old.log.deleted, ['aaa']);
});

test('a person I blocked cannot get round the block with an unsigned invitation under another name', async () => {
  const pg = world({ blocked: ['mallory'] });
  await pg.snap([note('aaa', 'invite', 'zed99', G), signed('bbb', 'mallory', G2)]);   // mallory's changed page: a made-up name with no signature, and her own name signed
  assert.deepEqual([shown(pg), held(pg), pg.log.watched], [[], [], []]);
});

test('a signed invitation to a group from a person I never chatted with is held: the page asks the server nothing about the chat and writes no note of its own', async () => {
  const pg = world(); await pg.snap([signed('aaa', 'zed99', G)]);
  assert.deepEqual([shown(pg), held(pg)], [[], [G + ' from zed99']]);
  assert.deepEqual([pg.log.watched, pg.log.renoted, pg.log.deleted, pg.log.healed], [[], [], [], []], 'no watch, no open, no card, no note: the inviter and the server learn nothing');
  await pg.snap([signed('aaa', 'zed99', G)]);   // and it stays held, pass after pass
  assert.deepEqual([shown(pg), held(pg), pg.log.watched], [[], [G + ' from zed99'], []]);
});

test('the same for a public channel, which needs no key at all to show', async () => {
  const pg = world(); await pg.snap([signed('aaa', 'zed99', C1, { type: 'channel' })]);
  assert.deepEqual([shown(pg), held(pg), pg.log.watched, pg.log.renoted], [[], [C1 + ' from zed99'], [], []]);
});

test('held too: from a person whose request I have not answered or have deleted, and while my settings cannot be read nothing is shown or held', async () => {
  for (const req of ['in', 'no']) { const pg = world({ dms: { [cidOf('zed99')]: { peer: 'zed99', req } } }); await pg.snap([signed('aaa', 'zed99', G)]);
    assert.deepEqual([shown(pg), held(pg)], [[], [G + ' from zed99']], `their request is ${req}`); }
  const pg = world({ vault: false }); await pg.snap([signed('aaa', 'zed99', G)]);
  assert.deepEqual([shown(pg), held(pg), pg.log.watched, pg.log.deleted], [[], [], [], []], 'the vault is not read: a person I blocked cannot be told from anyone else, so the note waits');
  pg.S.vaultOk = true; await pg.snap([signed('aaa', 'zed99', G)]);
  assert.deepEqual(held(pg), [G + ' from zed99'], 'and the next pass judges it');
});

test('an invitation that names a one-on-one address is no invitation: dropped', async () => {
  const pg = world(); await pg.snap([signed('aaa', 'zed99', CAROL)]);
  assert.deepEqual([shown(pg), held(pg), pg.log.watched], [[], [], []]);
});

test('from a person I have an accepted or self-started one-on-one chat with: held too, like a stranger\'s', async () => {
  for (const req of [undefined, 'ok', 'out']) {
    const pg = world({ dms: { [CAROL]: { peer: 'carol', ...(req ? { req } : {}) } } }); await pg.snap([signed('aaa', 'carol', G), signed('bbb', 'carol', C1, { type: 'channel' })]);
    assert.deepEqual([shown(pg), held(pg).sort()], [[], [C1 + ' from carol', G + ' from carol'].sort()], `my chat with carol is ${req || 'a normal one'}`);
    assert.deepEqual([pg.log.watched, pg.log.renoted, pg.log.deleted, pg.log.healed], [[], [], [], []], 'no watch, no open, no card, and the page writes no note of its own');
  }
});

test('a stranger\'s one-on-one note with "Send a request first" off does not let their invitation in: it is held, also after a reload', async () => {
  const Z = cidOf('zed99'), recs = { ...records, [Z]: dmRec() };
  const pg = world({ records: recs, ownRequests: false });
  await pg.snap([note('aaa', 'dm', 'zed99', Z)]);
  assert.deepEqual([shown(pg), pg.S.prefs.dms[Z]], [[Z], { peer: 'zed99' }], 'the setting is off: their note makes a normal chat, and the page files them as a person I chat with');
  await pg.snap([note('aaa', 'dm', 'zed99', Z), signed('bbb', 'zed99', G)]);
  assert.deepEqual([shown(pg), held(pg)], [[Z], [G + ' from zed99']], 'their invitation waits for Join');
  assert.deepEqual([pg.log.watched.includes(G), pg.log.renoted.filter((n) => n.includes(G))], [false, []], 'the group is not watched, and no note of mine is written for it');
  // after a reload, or on another device of mine: the vault as it was saved, the chat resting on my own note by now, the invitation still in the mailbox
  const re = world({ records: recs, ownRequests: false, dms: { [Z]: { peer: 'zed99' } } });
  await re.snap([note('own', 'dm', ME, Z, { own: 1, peer: 'zed99' }), signed('bbb', 'zed99', G)]);
  assert.deepEqual([shown(re), held(re), re.log.watched.includes(G)], [[Z], [G + ' from zed99'], false], 'held after the reload too');
});

test('a chat this device holds a key for is held like any other, from a friend too; my own note (Join) lets it in', async () => {
  const dms = { [CAROL]: { peer: 'carol' } };
  const key = world({ dms, held: [G] }); await key.snap([signed('aaa', 'carol', G)]);
  assert.deepEqual([shown(key), held(key), key.log.watched, key.log.renoted], [[], [G + ' from carol'], [], []], 'a stored key does not count (she adds me again after a key change): held, the chat not watched, no note written');
  await key.snap([signed('aaa', 'carol', G), note('bbb', 'invite', ME, G, { own: 1 })]);   // Join: my own note
  assert.deepEqual([shown(key), held(key), key.log.deleted], [[G], [], ['aaa']], 'and Join lets it in');
  const own = world({ dms }); await own.snap([signed('aaa', 'carol', G), note('bbb', 'invite', ME, G, { own: 1 })]);
  assert.deepEqual([shown(own), held(own), own.log.deleted], [[G], [], ['aaa']], 'my own note beside hers: in, and hers goes');
});

test('into a chat I hold or held a key for (an admin adds me again, a key change): held, from anyone, and Join lets it in', async () => {
  const pg = world({ held: [G] }); await pg.snap([signed('aaa', 'zed99', G)]);
  assert.deepEqual([shown(pg), held(pg), pg.log.watched], [[], [G + ' from zed99'], []]);
  await pg.snap([signed('aaa', 'zed99', G), note('bbb', 'invite', ME, G, { own: 1 })]);   // Join: my own note
  assert.deepEqual([shown(pg), held(pg)], [[G], []]);
  // a person I blocked gets nothing from the stored key: dropped, not held (noteOk lets the note through where a key is stored)
  const bl = world({ held: [G], blocked: ['mallory'] }); await bl.snap([signed('aaa', 'mallory', G)]);
  assert.deepEqual([shown(bl), held(bl), bl.log.watched], [[], [], []]);
});

test('guard: a note of my own (a join by link, a chat I made, a public channel I joined): straight in, signed or not, alone or beside a stranger\'s', async () => {
  const pg = world(); await pg.snap([note('aaa', 'invite', ME, G, { own: 1 }), note('bbb', 'invite', ME, C1, { type: 'channel', own: 1, sg: 'signed by ' + ME })]);
  assert.deepEqual([shown(pg), held(pg)], [[C1, G].sort(), []]);
  const two = world(); await two.snap([signed('aaa', 'zed99', G), note('bbb', 'invite', ME, G, { own: 1 })]);
  assert.deepEqual([shown(two), held(two)], [[G], []]);
});

test('guard: a chat this page already shows stays, whoever\'s note is the one left for it', async () => {
  const pg = world();
  await pg.snap([note('aaa', 'invite', ME, C1, { type: 'channel', own: 1 })]); assert.deepEqual(shown(pg), [C1]);
  await pg.snap([signed('bbb', 'zed99', C1, { type: 'channel' })]);   // my own note went, a stranger's is the one there now
  assert.deepEqual([shown(pg), held(pg)], [[C1], []]);
});

test('a stranger\'s newer invitation beside my own note never takes my note\'s place: mine is written again, and theirs goes once mine is not the older one', async () => {
  // until release 108 the newest note stayed, so a stranger's later note deleted mine; in the next session the chat would have
  // rested on the stranger's note alone, and a public channel I joined (no key to hold) would have turned into a held invitation.
  // Theirs is not deleted while mine is the older one: a page of release 106 open beside this one deletes mine at that moment,
  // and no note would be left (mixed-pages.test.js)
  const pg = world(), mine = note('aaa', 'invite', ME, C1, { type: 'channel', own: 1 }, T - 36e5), theirs = signed('zzz', 'zed99', C1, { type: 'channel' });
  await pg.snap([mine, theirs]);
  assert.deepEqual([shown(pg), held(pg), pg.log.deleted, pg.log.renoted], [[C1], [], [], ['invite:' + C1]], 'not shown in its place, not held, not deleted yet; my own note is written again');
  await pg.snap([mine, theirs, note('new', 'invite', ME, C1, { type: 'channel', own: 1 })]);   // the note written again is in the mailbox, in their hour
  assert.deepEqual([shown(pg), held(pg), pg.log.deleted.slice().sort(), pg.log.renoted.length], [[C1], [], ['aaa', 'zzz'], 1], 'now theirs goes, and the older note of mine with it');
});

test('guard: a public channel my settings say I joined is never held, even with no note of my own left for it', async () => {
  const pg = world(); pg.S.prefs.pub = [C1]; await pg.snap([signed('aaa', 'zed99', C1, { type: 'channel' })]);
  assert.deepEqual([shown(pg), held(pg)], [[C1], []]);
});

// ---- the Message requests sheet --------------------------------------------------------------------------------------------
const SHEET = [UI.includes('const inviteLine=') ? lift('const inviteLine=', '\n') : '', UI.includes('const reqText=') ? lift('const reqText=', '\n') : '', lift('function openRequests(', 'function showRequestAlert(')].join('\n');
function sheetOn(pg, { confirm = true, fail = false } = {}) {
  const body = mkEl('div', 'sheet-body'), log = { toasts: [], confirms: [], blocked: [], drops: [], closed: 0, opened: [] };
  const env = { S: pg.S, sheet: () => ({ body, close: () => { log.closed++; } }), el: mkEl, pendingRequests: pg.api.pendingRequests, openPost: async (_c, p) => (p && p.o) || { text: 'hello', media: [] }, unsealAll: async (_c, ps) => ps,
    titleNode: (t, cls, c) => mkEl(t, cls, 'the name of ' + c.id), convAvatar: () => mkEl('div', 'avatar'), userAvatar: (h) => mkEl('div', 'avatar', '(' + h + ')'), previewText: (pv) => pv.text, atOf: (h) => '@' + h, displayName: (h) => 'Display ' + h,
    confirm: (q) => { log.confirms.push(q); return confirm; }, blockPeer: (h) => { log.blocked.push(h); pg.S.prefs.blocked.push(h); }, toast: (m) => log.toasts.push(m), toastErr: (m) => log.toasts.push('error: ' + m),
    dropPointer: async (to, p) => { if (fail) throw new Error('offline'); log.drops.push({ to, p }); }, renderList: () => {}, updateTitle: () => {}, openConv: (id) => log.opened.push(id) };
  new Function('env', `const {${Object.keys(env).join(',')}}=env;\n${SHEET}\nopenRequests();`)(env);
  return { body, log };
}
const settle = () => new Promise((r) => setTimeout(r, 20));

test('the Message requests sheet lists a held invitation by the inviter\'s username and the kind of chat, never by a name the inviter chose, with Join, Delete and Block', async () => {
  const pg = world({ records: { ...records, [cidOf('mallory')]: dmRec() } });
  await pg.snap([signed('aaa', 'zed99', G), signed('bbb', 'abcdefghijklmnopqrst', C1, { type: 'channel', name: 'FREE PRIZES' }), note('ccc', 'dm', 'mallory', cidOf('mallory'))]);
  const sh = sheetOn(pg); await settle();
  const t = text(sh.body);
  assert.ok(t.includes('@zed99 invited you to a group'), t);
  assert.ok(t.includes('@abcdefghijklmnopqrst invited you to a channel'), t);
  assert.ok(!/PRIZES|Private group|Channel\b/.test(t), 'no name of the group or channel before Join');
  assert.deepEqual([button(sh.body, 'Join').length, button(sh.body, 'Delete').length, button(sh.body, 'Block').length], [2, 2, 2]);
  assert.deepEqual(button(sh.body, 'Join').map((b) => b.className), ['primary', 'primary'], 'the request bar\'s buttons');
  assert.deepEqual(button(sh.body, 'Delete').map((b) => b.className), ['secondary', 'secondary']);
  assert.ok(all(sh.body, (x) => x.className === 'reqbtns').length === 2 && all(sh.body, (x) => x.className === 'thread static').length === 2, 'the request bar\'s row of buttons under a row that is not itself a button');
  assert.ok(t.includes('the name of ' + cidOf('mallory')), 'the request is listed too');
});

test('the sheet shows a request by its first text message, as the open request does: never by a later message, never by a photo', async () => {
  const MAL = cidOf('mallory'), pg = world({ records: { ...records, [MAL]: dmRec() } });
  await pg.snap([note('ccc', 'dm', 'mallory', MAL)]);
  const posts = [{ _id: 'p1', o: { text: '', media: [{ id: 'm1' }] } }, { _id: 'p2', o: { text: 'first words', media: [] } }, { _id: 'p3', o: { text: 'LATER WORDS', media: [] } }], asked = [], coll = pg.S.db.collection;
  pg.S.db.collection = (path) => (path === 'channels/' + MAL + '/posts' ? { orderBy: (f, dir) => ({ limit: (n) => ({ get: async () => { asked.push([f, dir, n]); return { docs: posts.map((p) => ({ id: p._id, data: () => ({ o: p.o }) })) }; } }) }) } : coll(path));
  const sh = sheetOn(pg); await settle();
  const t = text(sh.body);
  assert.ok(t.includes('first words') && !t.includes('LATER WORDS') && !t.includes('hello'), t);
  assert.deepEqual(asked, [['ts', 'asc', 20]], 'the oldest messages, asked for once');
});

test('Join writes my own note for the chat, as a join does, and the chat then shows; nothing else is sent', async () => {
  const pg = world(); await pg.snap([signed('aaa', 'zed99', G)]);
  const sh = sheetOn(pg); await settle();
  button(sh.body, 'Join')[0].onclick(); await settle();
  assert.deepEqual(sh.log.drops, [{ to: ME, p: { t: 'invite', cid: G, from: ME, type: 'group' } }], 'one note, to myself');
  assert.deepEqual(held(pg), [], 'the row goes at once');
  assert.ok(!text(sh.body).includes('invited you'));
  await pg.snap([signed('aaa', 'zed99', G), note('bbb', 'invite', ME, G, { own: 1 })]);   // my note arrived in the mailbox
  assert.deepEqual([shown(pg), held(pg)], [[G], []]);
  // a public channel: type channel
  const ch = world(); await ch.snap([signed('aaa', 'zed99', C1, { type: 'channel' })]); const s2 = sheetOn(ch); await settle();
  button(s2.body, 'Join')[0].onclick(); await settle();
  assert.deepEqual(s2.log.drops, [{ to: ME, p: { t: 'invite', cid: C1, from: ME, type: 'channel' } }]);
  // the note could not be written: the invitation stays, and the page says so
  const off = world(); await off.snap([signed('aaa', 'zed99', G)]); const s3 = sheetOn(off, { fail: true }); await settle();
  button(s3.body, 'Join')[0].onclick(); await settle();
  assert.deepEqual([held(off), s3.log.toasts], [[G + ' from zed99'], ['error: That didn’t go through. Try again.']]);
});

test('a friend\'s add waits under Message requests until I tap Join, then the chat goes in', async () => {
  const pg = world({ dms: { [CAROL]: { peer: 'carol' } }, records: { ...records, [CAROL]: dmRec() } });
  const mail = [note('own', 'dm', ME, CAROL, { own: 1, peer: 'carol' }), signed('aaa', 'carol', G)];   // my chat with carol, resting on my own note, and her add
  await pg.snap(mail);
  assert.deepEqual([shown(pg), held(pg)], [[CAROL], [G + ' from carol']], 'the chat with carol shows; the group she added me to waits');
  const sh = sheetOn(pg); await settle();
  assert.ok(text(sh.body).includes('@carol invited you to a group'), text(sh.body));
  assert.deepEqual([button(sh.body, 'Join').length, pg.log.watched.includes(G)], [1, false], 'one row with Join; the group is not opened or watched before it');
  await pg.snap(mail);   // pass after pass, and it still waits
  assert.deepEqual([shown(pg), held(pg)], [[CAROL], [G + ' from carol']]);
  button(sh.body, 'Join')[0].onclick(); await settle();
  assert.deepEqual(sh.log.drops, [{ to: ME, p: { t: 'invite', cid: G, from: ME, type: 'group' } }], 'Join writes my own note');
  await pg.snap([...mail, note('bbb', 'invite', ME, G, { own: 1 })]);   // my note arrived in the mailbox
  assert.deepEqual([shown(pg), held(pg)], [[CAROL, G].sort(), []], 'and the group is in my list');
});

test('Delete removes the note and nothing else; Block asks, blocks the person and removes the note', async () => {
  const pg = world(); await pg.snap([signed('aaa', 'zed99', G), signed('bbb', 'zed99', C1, { type: 'channel' })]);
  const sh = sheetOn(pg); await settle();
  button(sh.body, 'Delete')[0].onclick(); await settle();
  assert.equal(pg.log.deleted.length, 1); assert.deepEqual([sh.log.blocked, sh.log.drops, pg.log.watched], [[], [], []], 'the note goes; nobody is told, nothing is asked');
  assert.equal(held(pg).length, 1, 'the row goes at once');
  // Block, answered No: nothing happens
  const no = world(); await no.snap([signed('aaa', 'zed99', G)]); const s2 = sheetOn(no, { confirm: false }); await settle();
  button(s2.body, 'Block')[0].onclick(); await settle();
  assert.deepEqual([s2.log.blocked, no.log.deleted, held(no)], [[], [], [G + ' from zed99']]);
  assert.deepEqual(s2.log.confirms, ['Block Display zed99?\n\nTheir requests and invitations will be dropped quietly. You can unblock them in Settings → Privacy.'], 'the request bar\'s own question');
  // Block, answered Yes
  const yes = world(); await yes.snap([signed('aaa', 'zed99', G), signed('bbb', 'zed99', C1, { type: 'channel' })]); const s3 = sheetOn(yes); await settle();
  button(s3.body, 'Block')[0].onclick(); await settle();
  assert.deepEqual([s3.log.blocked, s3.log.toasts], [['zed99'], ['Display zed99 blocked']]);
  assert.equal(yes.log.deleted.length, 1, 'the note of the invitation that was blocked');
  await yes.snap([signed('bbb', 'zed99', C1, { type: 'channel' })].filter((n) => !yes.log.deleted.includes(n.id)).concat(yes.log.deleted.includes('bbb') ? [signed('aaa', 'zed99', G)] : []));   // the mailbox as it is now
  assert.deepEqual([shown(yes), held(yes)], [[], []], 'the blocked person\'s other invitation goes with the next pass');
});

test('the count on the tab and in the page title takes the held invitations in', async () => {
  const pg = world({ records: { ...records, [cidOf('mallory')]: dmRec() } });
  await pg.snap([signed('aaa', 'zed99', G), signed('bbb', 'zed99', C1, { type: 'channel' }), note('ccc', 'dm', 'mallory', cidOf('mallory'))]);
  const tab = mkEl('span'), document = { title: '' };
  const env = { S: pg.S, convById: () => null, isMuted: () => false, isArchived: () => false, isRequest: pg.api.isRequest, hiddenConv: () => false, pendingRequests: pg.api.pendingRequests, $: () => tab, document };
  new Function('env', `const {${Object.keys(env).join(',')}}=env;\n${lift('function updateTitle(', '\n/* ---------- chat organization')}\nupdateTitle();`)(env);
  assert.deepEqual([document.title, tab.textContent, tab.hidden], ['(3) Hush', '3', false], 'one request and two invitations');
});

test('the lines themselves, as written', () => {
  const pass = lift("const un=S.db.collection('inbox/'+h+'/c')", '\n  // Watch one chat a pointer names.');
  assert.match(pass, /for\(const d of s\.docs\)\{const p=note\(d\);if\(!p\|\|isDm\(p\)\|\|d\.data\(\)\.own===1\)continue;/, 'every invitation that is not my own, at every pass');
  assert.match(pass, /if\(own\.has\(p\.cid\)\)\{const mine=s\.docs\.filter\(m=>m\.data\(\)\.own===1&&\(note\(m\)\|\|\{\}\)\.cid===p\.cid\),q=note\(mine\[0\]\);\n\s*if\(mine\.some\(m=>\(m\.data\(\)\.ts\|\|0\)>=\(d\.data\(\)\.ts\|\|0\)\)\)\{ptrs\.set\(d\.id,null\);delNote\(d\.id,p\.cid\)\}\n\s*else\{beside\.add\(d\.id\);if\(!dead&&!\(answered\.get\(p\.cid\)>=\(d\.data\(\)\.ts\|\|0\)\)\)\{const t=Math\.max\(\.\.\.s\.docs\.filter\(o=>o\.data\(\)\.own!==1&&\(note\(o\)\|\|\{\}\)\.cid===p\.cid\)\.map\(o=>o\.data\(\)\.ts\|\|0\)\);answered\.set\(p\.cid,t\);dropPointer\(h,\{t:q\.t,cid:q\.cid,from:h,type:q\.type,peer:q\.peer\}\)\.catch\(\(\)=>answered\.delete\(p\.cid\)\)\}\}\n\s*continue\}/, 'beside my own note theirs never goes on to the lines below: it is deleted once a note of mine carries its hour or a later one; while mine is older, mine is written again as it was, once per chat for the newest hour of theirs (a pile in one hour gets one note of mine), and never by a watch that has ended');
  assert.match(pass, /\n\s*if\(!p\|\|beside\.has\(d\.id\)\)continue;/, 'and a note left beside mine is passed over where the newest note for a chat is chosen');
  assert.ok(!/heldKey\(p\.cid\)/.test(pass.slice(pass.indexOf('const hold='), pass.indexOf('for(const d of s.docs){let p=ptrs.get(d.id);'))), 'a stored key plays no part in what is held: any read of the record stores the inviter\'s wrap');
  assert.match(pass, /const inn=subs\.has\(p\.cid\)\|\|joinedPublic\(p\.cid\);[^\n]*\n\s*if\(!p\.sg\|\|!\/\^\[gc\]\/\.test\(p\.cid\)\|\|\(!inn&&\(!vault\|\|isBlocked\(p\.from\)\)\)\)\{ptrs\.delete\(d\.id\);opened\.set\(d\.id,null\)\}/, 'unsigned: dropped, whatever else is true');
  assert.match(pass, /\n\s*else if\(inn\)hold\.set\(p\.cid,false\);else if\(!hold\.has\(p\.cid\)\)hold\.set\(p\.cid,true\)\}/, 'a chat I am in goes in as before; every other invitation is held, with no pass for a person I chat with');
  assert.match(pass, /kept\.set\(p\.cid,\{id:d\.id,x,p\}\);if\(!hold\.get\(p\.cid\)\)seen\.set\(p\.cid,p\)\}/, 'a held chat is never started: only what is seen is watched');
  assert.match(pass, /S\.invites=\[\.\.\.kept\.values\(\)\]\.filter\(k=>hold\.get\(k\.p\.cid\)\)\.map\(k=>\(\{cid:k\.p\.cid,from:k\.p\.from\}\)\);[^\n]*\n\s*ready=true;emit\(\);/, 'what the screen lists: the chat\'s address and the inviter, nothing the inviter wrote');
  assert.match(UI, /const inviteLine=v=>atOf\(v\.from\)\+' invited you to a '\+\(v\.cid\[0\]==='g'\?'group':'channel'\);/, 'the username as the app shows usernames, the kind from the address letter');
  const list = lift('async function renderList(', '\nfunction updateStatus(');
  assert.match(list, /const reqs=arch\?\[\]:pendingRequests\(\),invs=arch\?\[\]:S\.invites\|\|\[\],rows=\[\];/);
  assert.match(list, /if\(\(reqs\.length\|\|invs\.length\)&&!S\.query\)\{const m=\{k:'req',n:'Message requests',s:reqs\.length\?[^\n]*' to message you':invs\.length===1\?'1 invitation':invs\.length\+' invitations',u:reqs\.length\+invs\.length\};rows\.push\(m\);const r=drawRow\(m\);r\.onclick=openRequests;/, 'the row and its count take the held invitations in; with invitations only its one line is short words, since the chat list preview is one line and a username of twenty letters would end in dots');
  assert.match(list, /if\(!items\.length&&!S\.query&&!reqs\.length&&!invs\.length\)\{const e=el\('div','empty'\);/, 'and a list that holds only an invitation is not called empty');
  assert.match(UI, /\n  return\(\)=>\{dead=true;S\.invites=\[\];clearInterval\(retryT\);un\(\);/, 'an account that leaves takes its held invitations with it');
});
