// "Send a request first" rests on the receiver's own page (release 108, SPEC.md 5.6 and 6). Until release 108 the sender's page
// decided: a first message was a request only when the note the receiver's page kept was tagged `request`, and a note is
// sealed by whoever leaves it, so a changed page tagged `dm` and went straight into the chat list, callable and with read marks.
// Now, with my own setting on, a one-on-one note someone else left is a request whatever its tag says, unless a note of my own
// (the stored mark `own`, which only my own signed-in connection can set) names the chat, or my vault knows the chat, or I have
// an accepted or self-started chat with that person under another address. The page reads its own profile and its vault before
// it judges; until then the note waits. An unanswered request shows the first text message only, and its alert comes once per
// chat. The harness is requests-kit.js: the page's own functions, lifted as written, with stubs around them.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UI, lift, ME, HOUR, T, cidOf, page, dmRec, note, mkEl, all } from './requests-kit.js';

const M = cidOf('mallory');
const one = async (o, notes) => { const pg = page({ records: { [M]: dmRec() }, ...o }); await pg.snap(notes); return pg; };
const REQ = { vault: { peer: 'mallory', req: 'in' }, shows: true, request: true }, NORMAL = { vault: { peer: 'mallory' }, shows: true, request: false };

test('my setting on: a note tagged `dm` from a person I never chatted with is filed as a request, and the page read its own profile first', async () => {
  const pg = await one({}, [note('aaa', 'dm', 'mallory', M)]);
  assert.deepEqual(pg.state(M), REQ);
  assert.equal(pg.log.profileReads, 1, 'its own profile, read from the server before the first note is judged');
  assert.deepEqual(pg.log.renoted, [], 'an unanswered request stays as it came: no note of my own is written for it');
  // the copy of my profile the page already held said the setting was off (turned on from another device since): the server's copy decides
  assert.deepEqual((await one({ seen: false }, [note('aaa', 'dm', 'mallory', M)])).state(M), REQ);
});

test('that chat cannot be called and gets no ticket, gets no read mark, is not in the chat list and not on the Calls list; it is under Message requests', async () => {
  const pg = await one({}, [note('aaa', 'dm', 'mallory', M)]), c = pg.conv(M);
  assert.equal(pg.api.callable(c), false, 'no call, and so no ticket: mintPass asks callable');
  assert.equal(pg.api.callsChat(c), false, 'not on the Calls list');
  assert.deepEqual(pg.api.pendingRequests().map((x) => x.id), [M], 'under Message requests');
  pg.S.chan = M; pg.S.posts = [{ ts: T + 5 }]; pg.api.markRead();
  assert.deepEqual(pg.log.seen, [], 'opening it writes no read mark');
  // the places that keep it out, as written
  assert.match(lift('async function mintPass(', '\n  const todo='), /S\.convs\.filter\(c=>callable\(c\)&&c\.last&&ok\(c\)/, 'a ticket only for a chat that can be called');
  assert.match(lift('async function renderList(', '\n  const pins='), /base=S\.convs\.filter\(c=>\(c\.last\|\|typeOf\(c\)!=='dm'\)&&!isRequest\(c\)&&!hiddenConv\(c\)\)/, 'the chat list');
  assert.match(lift('function updateTitle(', '\n'), /!\(c&&isRequest\(c\)\)/, 'its unread messages are not in the count');
  assert.match(UI, /convById\(m\.cid\)&&!isRequest\(convById\(m\.cid\)\)\)/, 'search');
  // the same chat, had it been filed as a normal one (the guard of this test: the stubs let a normal chat be called and marked)
  const n = await one({ ownRequests: false }, [note('aaa', 'dm', 'mallory', M)]);
  assert.equal(n.api.callable(n.conv(M)), true); n.S.chan = M; n.S.posts = [{ ts: T + 5 }]; n.api.markRead(); assert.deepEqual(n.log.seen, [M + ':' + (T + 5)]);
});

test('my setting on: the two notes of an honest first message, read at once, are a request in either order of their ids and with one stored hour between them', async () => {
  // an honest page of release 106 leaves two notes: `request` (ensureDmDoc) and, a moment later, a plain `dm` one (sendBody)
  assert.deepEqual((await one({}, [note('aaa', 'request', 'mallory', M), note('bbb', 'dm', 'mallory', M)])).state(M), REQ, 'the request note has the smaller id');
  assert.deepEqual((await one({}, [note('bbb', 'request', 'mallory', M), note('aaa', 'dm', 'mallory', M)])).state(M), REQ, 'the plain note has the smaller id');
  assert.deepEqual((await one({}, [note('aaa', 'request', 'mallory', M, {}, T), note('bbb', 'dm', 'mallory', M, {}, T + HOUR)])).state(M), REQ, 'the plain note is one stored hour later, so it is the one kept');
  // and one after the other, the page open: the request first, then both; and the plain one first, then both
  const pg = await one({}, [note('bbb', 'request', 'mallory', M)]); await pg.snap([note('bbb', 'request', 'mallory', M), note('aaa', 'dm', 'mallory', M)]); assert.deepEqual(pg.state(M), REQ);
  const p2 = await one({}, [note('aaa', 'dm', 'mallory', M)]); await p2.snap([note('aaa', 'dm', 'mallory', M), note('bbb', 'request', 'mallory', M)]); assert.deepEqual(p2.state(M), REQ);
});

test('a note that names me as its sender but does not carry the stored mark of my own notes is not taken for mine', async () => {
  // what my own page writes for a chat I started: from me, the other person as `peer`. Anyone can seal the same words; only my
  // own connection can store the mark.
  const pg = await one({}, [note('aaa', 'dm', ME, M, { peer: 'mallory' })]);
  assert.deepEqual(pg.state(M), REQ);
});

test('guard: a note of my own for the chat is there: a normal chat, alone or beside the other person\'s note, whichever comes first in the list', async () => {
  assert.deepEqual((await one({}, [note('aaa', 'dm', ME, M, { peer: 'mallory', own: 1 })])).state(M), NORMAL, 'a chat I started');
  // a chat I started on another device: its note of my own and the other person's note, the vault of this device not yet knowing the chat
  assert.deepEqual((await one({}, [note('aaa', 'dm', 'mallory', M), note('bbb', 'dm', ME, M, { peer: 'mallory', own: 1 })])).state(M), NORMAL, 'the other person\'s note first');
  assert.deepEqual((await one({}, [note('bbb', 'dm', 'mallory', M), note('aaa', 'dm', ME, M, { peer: 'mallory', own: 1 })])).state(M), NORMAL, 'my own first');
});

test('guard: a chat my vault knows stays what the vault says: normal, accepted, my own request, an open request, a deleted one', async () => {
  for (const req of [undefined, 'ok', 'out', 'in', 'no']) {
    const i = { peer: 'mallory', ...(req ? { req } : {}) }, pg = await one({ dms: { [M]: i } }, [note('aaa', 'dm', 'mallory', M)]);
    assert.deepEqual(pg.api.dmInfo(M), i, `vault entry ${req || 'with no request mark'}`);
    assert.equal(pg.log.profileReads, 0, 'nothing to judge: the profile is not read');
  }
});

test('guard: a person I have an accepted or self-started chat with, at another address (after a change of keys): a normal chat', async () => {
  const OLD = cidOf('mallory-before');
  for (const req of [undefined, 'ok', 'out']) {
    const pg = await one({ dms: { [OLD]: { peer: 'mallory', ...(req ? { req } : {}) } }, known: { mallory: M } }, [note('aaa', 'dm', 'mallory', M)]);
    assert.deepEqual(pg.state(M), NORMAL, `the chat at the older address is ${req || 'a normal one'}`);
  }
});

test('a person whose request I have not answered, or deleted, is not a person I chat with: their note at another address is a request too', async () => {
  const OLD = cidOf('mallory-before');
  for (const req of ['in', 'no']) {
    const pg = await one({ dms: { [OLD]: { peer: 'mallory', req } }, known: { mallory: M } }, [note('aaa', 'dm', 'mallory', M)]);
    assert.deepEqual(pg.state(M), REQ, `the chat at the older address is ${req}`);
  }
});

test('guard: the name in a one-on-one note is not taken on trust: a note that names a person I chat with, at an address that is not ours, never reaches the rule (noteOk)', async () => {
  const CAROL = cidOf('carol'), pg = await one({ dms: { [CAROL]: { peer: 'carol' } } }, [note('aaa', 'dm', 'carol', M)]);
  assert.deepEqual(pg.state(M), { vault: null, shows: false, request: null }, 'the stranger\'s record under carol\'s name: dropped');
  assert.deepEqual(pg.api.dmInfo(CAROL), { peer: 'carol' });
});

test('guard: my setting off: as before release 108, the tag decides', async () => {
  assert.deepEqual((await one({ ownRequests: false }, [note('aaa', 'dm', 'mallory', M)])).state(M), NORMAL);
  assert.deepEqual((await one({ ownRequests: false }, [note('aaa', 'request', 'mallory', M)])).state(M), REQ);
  assert.deepEqual((await one({ ownRequests: false, vault: false }, [note('aaa', 'dm', 'mallory', M)])).state(M), NORMAL, 'and it does not wait for the vault');
});

test('until the page has read its own profile and its vault the note waits: nothing is filed, shown, watched or deleted, and the next pass judges it', async () => {
  const WAITS = { vault: null, shows: false, request: null };
  // its own profile could not be read
  const a = page({ records: { [M]: dmRec() }, profile: false }); await a.snap([note('aaa', 'dm', 'mallory', M)]);
  assert.deepEqual([a.state(M), a.log.watched, a.log.deleted], [WAITS, [], []], 'profile not read');
  a.server.readable = true; await a.snap([note('aaa', 'dm', 'mallory', M)]);   // the next pass reads it
  assert.deepEqual(a.state(M), REQ, 'the next pass files it');
  // the vault could not be read (S.vaultOk false): with the setting on nobody can be told from a stranger
  const b = page({ records: { [M]: dmRec() }, vault: false }); await b.snap([note('aaa', 'dm', 'mallory', M)]);
  assert.deepEqual([b.state(M), b.log.watched, b.log.deleted], [WAITS, [], []], 'vault not read');
  b.S.vaultOk = true; await b.snap([note('aaa', 'dm', 'mallory', M)]);
  assert.deepEqual(b.state(M), REQ);
  // an old note that waits is not thrown away as an unreadable one is after a week
  const c = page({ records: { [M]: dmRec() }, vault: false }); await c.snap([note('aaa', 'dm', 'mallory', M, {}, T - 9 * 24 * HOUR)]);
  assert.deepEqual(c.log.deleted, []);
});

// ---- rule 5: an unanswered request shows the first text message only -------------------------------------------------------
const CONV = (UI.includes('const reqText=') ? lift('const reqText=', '\n') : '') + '\nlet msgSeq=0;\n' + lift('async function renderConv(', '\nfunction msgNode(');
function chat({ request }) {
  const box = mkEl('div', 'msgs'), drawn = [], opened = [];
  const S = { me: { handle: ME }, posts: [], loaded: true, allLoaded: true, rendered: null, stick: false, serverView: false, db: { online: true } };
  const c = { id: M, type: 'dm', members: [ME, 'mallory'] };
  const env = { S, $: () => box, curConv: () => c, typeOf: () => 'dm', isRequest: () => request,
    openPost: async (_c, p) => { opened.push(p._id); return p.svc ? { svc: true, text: null, media: [] } : { text: p.o.text || '', media: p.o.media || [], poll: p.o.poll || null, fwd: p.o.fwd || null, call: null, wake: null, verified: true }; },
    noteCalls: () => {}, el: mkEl, html: mkEl, loadOlder: () => {}, knownIn: () => [], keyChanged: () => false, openProfile: () => {}, ttlLabel: String, ttlChip: () => null, I: {}, isSelf: () => false,
    convTitle: () => 'mallory', isAdmin: () => false, displayName: (h) => h, fmtDay: () => 'Today', hiddenPost: () => false, refreshNodes: () => {},
    msgNode: (_c, p) => { drawn.push(p._id); const n = mkEl('div', 'msg', p.o.text || '[' + Object.keys(p.o).join() + ']'); n._sig = p.sig; return n; } };
  const renderConv = new Function('env', `const {${Object.keys(env).join(',')}}=env;\n${CONV}\nreturn renderConv;`)(env);
  return { S, box, drawn, opened, renderConv, chips: () => all(box, (x) => /\bchip svc\b/.test(x.className)).map((x) => x.textContent) };
}
const post = (id, n, o, from = 'mallory') => ({ _id: id, ts: T + n, from, sig: 's' + id, o });

test('an unanswered request shows the first text message only: a photo before it, a second message, a poll and a forward are counted and never drawn', async () => {
  const pg = chat({ request: true });
  pg.S.posts = [post('p1', 1, { media: [{ id: 'm1', kind: 'image' }] }), post('p2', 2, { text: 'hello, this is mallory' }), post('p3', 3, { text: 'and again' }),
    post('p4', 4, { poll: { q: 'free?', opts: ['a', 'b'] } })];
  await pg.renderConv();
  assert.deepEqual(pg.drawn, ['p2'], 'only the first text is drawn; a photo is fetched when its message is drawn (albumNode), so none is fetched');
  assert.deepEqual(pg.chips(), ['3 more messages wait until you accept.']);
  // one more arrives: the count follows, nothing new is drawn
  pg.S.posts = [...pg.S.posts, post('p5', 5, { text: 'fwd', fwd: { name: 'someone' } })]; await pg.renderConv();
  assert.deepEqual([pg.drawn, pg.chips()], [['p2'], ['4 more messages wait until you accept.']]);
  // a forward, a caption on a photo and a poll are not "a text message"; with no text at all nothing is drawn, and the count says so
  const q = chat({ request: true }); q.S.posts = [post('p1', 1, { text: 'see this', media: [{ id: 'm1', kind: 'image' }] }), post('p2', 2, { text: 'look', fwd: { name: 'x' } })]; await q.renderConv();
  assert.deepEqual([q.drawn, q.chips()], [[], ['2 more messages wait until you accept.']]);
  // exactly one message besides the first text
  const r = chat({ request: true }); r.S.posts = [post('p1', 1, { text: 'hello' }), post('p2', 2, { text: 'more' })]; await r.renderConv();
  assert.deepEqual([r.drawn, r.chips()], [['p1'], ['1 more message waits until you accept.']]);
  // an honest request, one text: as before, and no line about more
  const h = chat({ request: true }); h.S.posts = [post('p1', 1, { text: 'hello' })]; await h.renderConv();
  assert.deepEqual([h.drawn, h.chips()], [['p1'], []]);
});

test('guard: once accepted (or in any chat that is not a request) every message is drawn and nothing is counted', async () => {
  const pg = chat({ request: false });
  pg.S.posts = [post('p1', 1, { media: [{ id: 'm1', kind: 'image' }] }), post('p2', 2, { text: 'hello' }), post('p3', 3, { text: 'and again' })];
  await pg.renderConv();
  assert.deepEqual([pg.drawn, pg.chips()], [['p1', 'p2', 'p3'], []]);
});

test('the pinned-message bar stays away in an unanswered request (the sender can pin any of the messages that wait), and no message is fetched for it', async () => {
  const bar = (request) => { const pb = mkEl('div', 'pinbar'); pb.hidden = true; const fetched = [], c = { id: M, type: 'dm', members: [ME, 'mallory'], pins: ['p9'] };
    const env = { S: { me: { handle: ME }, pinIdx: 0, pinCache: new Map(), rendered: null, allLoaded: true, db: { doc: (path) => ({ get: async () => { fetched.push(path); return { exists: false }; } }) } },
      $: () => pb, curConv: () => c, isRequest: () => request, allPosts: () => [], unsealPost: async (_c, p) => p, isBlocked: () => false, openPost: async () => null, I: { pin: '' }, el: mkEl, html: mkEl,
      snippet: () => '', canPin: () => false, toastErr: () => {}, loadOlder: () => {}, jumpTo: () => {} };
    pb.replaceChildren = () => { pb.children.length = 0; }; pb.insertAdjacentHTML = () => {};
    const draw = new Function('env', `const {${Object.keys(env).join(',')}}=env;\n${lift('async function drawPinBar(', '\nasync function togglePinMsg(')}\nreturn drawPinBar;`)(env);
    return draw().then(() => ({ hidden: pb.hidden, fetched })); };
  assert.deepEqual(await bar(true), { hidden: true, fetched: [] });
  assert.deepEqual(await bar(false), { hidden: false, fetched: ['channels/' + M + '/posts/p9'] }, 'guard: in any other chat the bar shows, as before');
});

// ---- rule 6: the alert comes once per chat ---------------------------------------------------------------------------------
function alerts() {
  const store = new Map(), body = mkEl('body'), log = { buzz: 0, opened: [] };
  const c = { id: M, type: 'dm', last: { ts: T } };
  const env = { S: { me: { handle: ME } }, ls: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) }, pendingRequests: () => [c], dmPeer: () => 'mallory', displayName: (h) => h,
    document: { body, querySelectorAll: () => all(body, (x) => x.className === 'reqalert'), querySelector: () => all(body, (x) => x.className === 'reqalert')[0] || null },
    el: mkEl, html: mkEl, I: {}, haptic: () => { log.buzz++; }, openConv: (id) => log.opened.push(id), openRequests: () => log.opened.push('sheet') };
  const show = new Function('env', `const {${Object.keys(env).join(',')}}=env;\n${lift('function showRequestAlert(', '/* ---------- onboarding ---------- */')}\nreturn showRequestAlert;`)(env);
  return { c, body, log, show, shown: () => all(body, (x) => x.className === 'reqalert').length, store };
}

test('the alert comes once per chat, whatever the latest-message mark does: not again after it was dismissed, and no second buzz while it stands', () => {
  const a = alerts(); a.show();
  assert.deepEqual([a.shown(), a.log.buzz], [1, 1], 'a new request: the alert, with its buzz');
  // anyone in the chat can move the chat's latest-message mark without sending anything (SPEC.md 5.5)
  a.c.last = { ts: T + 1000 }; a.show();
  assert.deepEqual([a.shown(), a.log.buzz], [1, 1], 'the mark moved while the alert stands: the same alert, no second buzz');
  all(a.body, (x) => x.className === 'icon-btn')[0].onclick();   // Dismiss
  assert.equal(a.shown(), 0);
  a.c.last = { ts: T + 2000 }; a.show();
  assert.deepEqual([a.shown(), a.log.buzz], [0, 1], 'dismissed: the mark moves, nothing comes again');
  assert.deepEqual([...a.store.keys()], [`hush:reqseen:${ME}:${M}`], 'kept per chat');
});

test('the lines themselves, as written', () => {
  const pass = lift("const un=S.db.collection('inbox/'+h+'/c')", '\n  // Watch one chat a pointer names.');
  assert.match(pass, /own=new Set\(s\.docs\.filter\(d=>d\.data\(\)\.own===1&&note\(d\)\)\.map\(d=>note\(d\)\.cid\)\)/, 'mine is the stored mark, never a name inside a note');
  assert.match(pass, /knows=who=>Object\.values\(\(S\.prefs\|\|\{\}\)\.dms\|\|\{\}\)\.some\(i=>i\.peer===who&&i\.req!=='in'&&i\.req!=='no'\)/, 'a person I have an accepted or self-started chat with');
  assert.match(pass, /asks=\[\.\.\.opened\]\.filter\(\(\[,p\]\)=>p&&isDm\(p\)&&!own\.has\(p\.cid\)&&!\(vault&&\(dmInfo\(p\.cid\)\|\|knows\(p\.peer\|\|p\.from\)\)\)\);\n\s*if\(asks\.length\)await \(selfRead\|\|\(selfRead=loadDir\(\[h\],true\)\.finally\(\(\)=>\{selfRead=null\}\)\)\);/, 'what is judged, and my own profile read first (release 111: one read at a time)');
  assert.match(pass, /if\(!S\.dir\[h\]\|\|\(S\.dir\[h\]\.requests===true&&!vault\)\)opened\.set\(id,null\);[^\n]*\n\s*else if\(S\.dir\[h\]\.requests===true\)setDmInfo\(p\.cid,\{peer:p\.peer\|\|p\.from,req:'in'\}\)\}/, 'it waits, or it is a request; with the setting off nothing is done here');
  assert.ok(pass.indexOf('loadDir([h],true)') > 0 && pass.indexOf('loadDir([h],true)') < pass.indexOf('if(run!==runs)return;') && pass.indexOf('if(run!==runs)return;') < pass.indexOf("req:'in'})"), 'the read comes before the staleness check, every write after it');
  assert.match(lift('async function renderConv(', '\nfunction msgNode('), /if\(isRequest\(c\)\)\{const i=posts\.findIndex\(\(p,j\)=>!p\.svc&&reqText\(opened\[j\]\)\),n=posts\.filter\(p=>!p\.svc\)\.length-\(i<0\?0:1\);/, 'the first text, and the count of the rest');
  assert.match(lift('function showRequestAlert(', '/* ---------- onboarding'), /const key=c=>`hush:reqseen:\$\{S\.me\.handle\}:\$\{c\.id\}`,/, 'the alert\'s key names the chat and nothing that a member can move');
  assert.doesNotMatch(lift('function showRequestAlert(', '/* ---------- onboarding'), /last\.ts/);
});
