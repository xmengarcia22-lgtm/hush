import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The chat list and the chat opening as the iPhone shows them (release 71): the source is checked, since no DOM runs here.
const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app/styles.css', import.meta.url), 'utf8');
const lift = (from, to) => { const a = ui.indexOf(from), b = ui.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} … ${to} in app/ui.js`); return ui.slice(a, b); };

test('chat rows highlight only under a pointer that can hover: every .thread hover rule sits inside @media (hover:hover)', () => {
  const rest = css.replace(/@media \(hover:hover\)\{(?:[^{}]*\{[^{}]*\})+\}/g, '');
  assert.doesNotMatch(rest, /\.thread[^{]*:hover/, 'a tapped row on iOS keeps :hover until the next tap, so the row it opened stays lit after Back');
  assert.match(css, /@media \(hover:hover\)\{\.thread:hover\{background:var\(--panel\)\}\}/);
  assert.match(css, /\}\.thread\.active::before,\.thread\.active\+\.thread::before,\.thread\.swipe-ready::before/, 'the open-chat and swipe rules stay unconditional');
});

test('opening a chat shows an empty box, not the empty-chat notice, until the first snapshot is decrypted', () => {
  assert.match(lift('function openConv(cid){', 'liveQ('), /rendered:null,loaded:!S\.db,stick:true/, 'reset on open; nothing to wait for without a connection');
  assert.match(lift("liveQ(S.db.collection(base+'/posts')", 'drawPinBar()'), /my!==S\.postSeq\)return;[^\n]*\n\s*S\.loaded=true;S\.rawPosts=un;/, 'the first snapshot, from cache or the server, counts');
  assert.match(lift('function renderConv(', 'end-to-end encrypted'), /if\(!posts\.length\)\{if\(!S\.loaded\)\{[^\n}]*\}return\}/, 'no notice before the load; a truly empty chat still gets it');
});

test('a chat that is waiting for the connection says Connecting, and the user coming back or opening a chat hurries the reconnect', () => {
  const adapter = readFileSync(new URL('../../app/adapter.js', import.meta.url), 'utf8');
  assert.match(lift('function renderConv(', 'end-to-end encrypted'), /if\(!posts\.length\)\{if\(!S\.loaded\)\{if\(S\.db&&!S\.db\.online&&\(!S\.db\.error\|\|\/out of date\/\.test\(S\.db\.error\)\)\)\{const n=el\('div','chip',S\.db\.error\?'This copy of Hush is out of date\. Close Hush and open it again\.':'Connecting…'\);n\.setAttribute\('role','status'\);box\.append\(n\)\}return\}/, 'only before the first snapshot and only while there is no connection: Connecting while one is on its way, the out-of-date sentence after the version error; said to a screen reader too');
  assert.match(adapter, /onStatus:on=>\{[^\n]*if\(S\.chan&&!S\.loaded\)renderConv\(\)/, 'the notice comes and goes with the connection while the chat is still opening');
  assert.match(lift('function openConv(cid){', 'Object.assign(S,{chan:cid'), /if\(S\.db\)S\.db\.present\(\)/, 'a chat opened: the user is here');
  assert.match(ui, /addEventListener\('visibilitychange',\(\)=>\{heartbeat\(\);if\(!document\.hidden\)\{markRead\(\);S\.db\.present\(\);S\.db\.probe\(3000\)\}\}\)/, 'back in view: said before the probe, so a close heard during the probe reconnects at once');
  const ping = adapter.slice(adapter.indexOf('function startPing('), adapter.indexOf('function stopPing(')); assert.ok(ping.includes('api.probe='));
  assert.doesNotMatch(ping, /present|eagerAt/, 'the keep-alive and its probe are not the user');
});

// The review of 2026-11-10 (small point 6): after the version error the adapter is closed for good and never online again, so the
// notice stayed for ever under a banner that says to reload. The statement runs as written.
// Release 104 (item 1): on a phone that banner sits in the chat list, which is hidden while a chat is open, so a chat opened after
// the version error showed an empty box with no words. Now the chip says there that this copy is out of date. The page knows the
// version error by the adapter's own fixed words; the adapter's other final error (a browser without WebSocket) shows nothing, as
// before. The two errors are taken from app/adapter.js as written.
test('the Connecting notice shows only while a connection is on its way: not with one; after the version error the chip says the copy is out of date, and after the other final error it says nothing', () => {
  const adapter = readFileSync(new URL('../../app/adapter.js', import.meta.url), 'utf8');
  const version = /if\(e&&e\.code==='version'\)\{fatal='([^']*)';api\.error=fatal;closed=true\}/.exec(adapter), noWs = /if\(!WS\)\{api\.error='([^']*)';fatal=api\.error;closed=true\}/.exec(adapter);
  assert.ok(version && /out of date/.test(version[1]), 'the adapter\'s version error holds the words the page knows it by');
  assert.ok(noWs && !/out of date/.test(noWs[1]), 'its other final error does not hold them');
  assert.equal(adapter.split('api.error=').length, 3, 'and the adapter sets an error in those two places only');
  const stmt = /if\(!posts\.length\)\{if\(!S\.loaded\)\{[^\n]*?\}return\}/.exec(lift('function renderConv(', 'end-to-end encrypted'))[0] + '}';
  const draw = (S) => { const box = { kids: [], append(n) { this.kids.push(n); } }, node = (how) => (tag, cls, text) => ({ how, tag, cls, text, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } });
    new Function('posts', 'S', 'el', 'html', 'box', stmt)([], S, node('el'), node('html'), box); return box.kids; };
  const off = draw({ loaded: false, db: { online: false } });
  assert.equal(off.length, 1); assert.deepEqual([off[0].tag, off[0].cls, off[0].text, off[0].attrs.role], ['div', 'chip', 'Connecting…', 'status'], 'no connection: it says so');
  assert.equal(draw({ loaded: false, db: { online: true } }).length, 0, 'a connection: an empty box until the first snapshot');
  const old = draw({ loaded: false, db: { online: false, error: version[1] } });
  assert.equal(old.length, 1, 'the version error: the chat says so too, since the banner is out of sight on a phone');
  assert.deepEqual([old[0].tag, old[0].cls, old[0].text, old[0].attrs.role], ['div', 'chip', 'This copy of Hush is out of date. Close Hush and open it again.', 'status'], 'the approved sentence, the page\'s own fixed words; nothing of the error\'s text is shown');
  assert.ok(old[0].how === 'el' && off[0].how === 'el' && !('innerHTML' in old[0]) && !/innerHTML|insertAdjacentHTML|html\(/.test(stmt), 'the chip\'s words are set as text, never as markup');
  assert.equal(draw({ loaded: false, db: { online: false, error: noWs[1] } }).length, 0, 'a browser without WebSocket: nothing, as before (the sentence would be untrue there)');
  assert.equal(draw({ loaded: false, db: null }).length, 0, 'no adapter yet');
  assert.equal(draw({ loaded: true, db: { online: false } }).length, 0, 'the chat has loaded: not this notice');
});

test('the chat row of a live call reads "In a call" and is redrawn as the call changes', () => {
  assert.match(lift('function rowModel(', 'function drawRow('), /if\(S\.call&&S\.call\.cid===c\.id&&S\.call\.state==='live'\)sub='In a call';\n\s*else if\(!l\)sub=/);
  assert.match(lift('function callUi(){', 'let bar='), /refreshHeader\(\);renderList\(\);/, 'every call state change redraws the list');
});

// The chat list from the sealed store at start (hush:list:<handle>): the rows as last drawn stand from the first paint
// until the live list is whole; the live path writes the drawn rows back, write-if-changed, at most 90, no text for a
// chat with a timer, nothing during a call.
test('renderList draws the cached rows right after the first screen, before the skeleton, and only until the live list is whole', () => {
  const head = lift('async function renderList(){', 'const arch=S.showArchived');
  assert.match(head, /splashOff\('list'\);[^\n]*\n\s*if\(!S\.convsLoaded&&S\.tab==='chats'&&!S\.query&&!S\.showArchived\)\{const rows=ls\.get\('hush:list:'\+S\.me\.handle,null\);/, 'read from the sealed store, after the first-screen mark');
  assert.match(head, /if\(Array\.isArray\(rows\)&&rows\.length&&\(!S\.convs\.length\|\|performance\.now\(\)<\(S\.boot\.cache\|\|0\)\+5000\)\)\{if\(!S\.boot\.cache\)S\.boot\.cache=performance\.now\(\);box\.replaceChildren\(\.\.\.rows\.map\(m=>drawRow\(m\)\)\);return\}\}/, 'cached rows stand while the live list is partial, for at most 5 s');
  assert.match(head, /\n\s*if\(!S\.convsLoaded&&!S\.convs\.length\)\{box\.replaceChildren\(\.\.\.Array\.from\(\{length:6\}/, 'the skeleton no longer waits for the socket: without a cache the shell shows at once');
  assert.doesNotMatch(head, /S\.db&&/);
});

test('the live path writes the drawn rows back: whole list only, chats tab, no search, no archive view, no call; 90 rows; no text for a timer chat', () => {
  const tail = lift("items.forEach((c,i)=>{const m=rowModel(c,pvs[i],now);", 'if(S.query)searchExtras');
  assert.match(tail, /rows\.push\(c\.ttl\|\|m\.x\?Object\.assign\(\{\},m,\{s:''\}\):m\);box\.append\(drawRow\(m,c\)\)/, 'the screen gets the text, the cache does not, for a chat with a timer or a disappearing last message');
  assert.match(tail, /if\(S\.convsLoaded&&!arch&&!S\.query&&S\.tab==='chats'&&!S\.call\)\{if\(!S\.boot\.live\)S\.boot\.live=performance\.now\(\);/);
  assert.match(tail, /const j=JSON\.stringify\(rows\.slice\(0,90\)\);if\(lastList\.h!==S\.me\.handle\|\|lastList\.j!==j\)\{lastList=\{h:S\.me\.handle,j\};ls\.set\('hush:list:'\+S\.me\.handle,JSON\.parse\(j\)\)\}/, 'write-if-changed: a presence tick or a typing dot re-seals nothing');
  assert.match(ui, /\nlet listSeq=0,lastList=\{h:'',j:''\};\n/);
  const body = lift('async function renderList(){', '\n/* ---------- one search box');
  assert.match(body, /const reqs=arch\?\[\]:pendingRequests\(\),invs=arch\?\[\]:S\.invites\|\|\[\],rows=\[\];/);   // release 108: the row and its count take the held invitations in (invite-hold.test.js)
  assert.match(body, /\{k:'req',n:'Message requests',s:[^\n]*u:reqs\.length\+invs\.length\};rows\.push\(m\);const r=drawRow\(m\);r\.onclick=openRequests;/, 'the requests row goes through drawRow and into the cache');
  assert.match(body, /\{k:'arch',n:'Archived chats',s:[^\n]*\};rows\.push\(m\);const r=drawRow\(m\);r\.onclick=\(\)=>\{S\.showArchived=true;/, 'the archived row too');
  assert.match(body, /if\(!items\.length&&!S\.query&&!reqs\.length&&!invs\.length\)\{const e=el\('div','empty'\);[\s\S]*?box\.append\(e\)\}\n\s*const now=Date\.now\(\);/, 'an empty list falls through to the write, so a cache of deleted chats is cleared');
});

// rowModel and drawRow run against a stand-in DOM: a model holds strings and numbers only, and a row drawn from the
// cache shows the same texts as the live one.
class E {
  constructor(tag, cls, text) { this.tag = tag; this.className = cls || ''; this.text = text == null ? '' : String(text); this.kids = []; this.markup = ''; this.style = {}; }
  append(...k) { this.kids.push(...k); }
  insertAdjacentHTML(pos, h) { this.markup += h; }
  get textContent() { return this.text + this.kids.map((k) => typeof k === 'string' ? k : k.textContent).join(''); }
  all(cls) { return [...(this.className.split(' ').includes(cls) ? [this] : []), ...this.kids.flatMap((k) => typeof k === 'string' ? [] : k.all(cls))]; }
  one(cls) { return this.all(cls)[0]; }
}
const rows = () => {
  const code = lift('function rowModel(', '\nlet listSeq=0');
  const S = { me: { handle: 'alice' }, chan: null, call: null, showArchived: false, unread: new Map([['gX', 2], ['gM', 150]]), mentions: new Map([['gX', 1]]), badges: { bob: 'verified' } };
  const calls = [], drafts = {};
  const fn = new Function('S', 'typeOf', 'isSelf', 'dmPeer', 'keyChanged', 'hiddenPost', 'isBlocked', 'noKeyNotice', 'previewText', 'displayName', 'convTitle', 'memberText', 'subsText',
    'isMuted', 'isPinned', 'badgeOf', 'el', 'html', 'I', 'withBadge', 'fmtListTime', 'ls', 'draftKey', 'plainText', 'convAvatar', 'avatar', 'isOnline', 'openConv', 'addLongPress', 'chatMenu', code + '\nreturn { rowModel, drawRow };');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const api = fn(S, (c) => c.type || 'channel', (c) => c.type === 'dm' && c.members.every((h) => h === 'alice'), (c) => c.members.find((h) => h !== 'alice') || 'alice',
    () => false, (p, o) => !!(o && o.wake), (h) => h === 'mallory', () => calls.push('nokey'), (pv) => pv && pv.text != null ? pv.text : 'Encrypted message', cap,
    (c) => c.type === 'dm' ? (c.members.every((h) => h === 'alice') ? 'Saved Messages' : cap(c.members.find((h) => h !== 'alice'))) : c.name,
    (c) => c.members.length + ' members', (c) => c.members.length + ' subscribers', (id) => id === 'gM', (id) => id === 'gP', (h) => S.badges[h] || null,
    (t, c, x) => new E(t, c, x), (t, c, h) => { const e = new E(t, c); e.markup = h; return e; }, { megaSm: '<mega>', groupSm: '<group>', mutedSm: '<muted>', pinSm: '<pin>', archive: '<arch>', bookmark: '<book>' },
    (node, h, b) => { if (b[h]) node.append(new E('span', 'ubadge ubadge-' + b[h])); return node; }, (ts) => 't' + ts, { get: (k, d) => k in drafts ? drafts[k] : d }, (cid) => 'hush:draft:alice:' + cid, (t) => t,
    (c) => new E('div', 'avatar live'), (key, name) => new E('div', 'avatar letter', (name || key).charAt(0)), (h) => h === 'bob', (cid) => calls.push('open:' + cid), (b, f) => { b.hold = f; }, () => calls.push('menu'));
  return { ...api, S, calls, drafts };
};
const texts = (b) => ({ cls: b.className, name: b.one('t-name').textContent, time: b.one('t-time').textContent, sub: b.one('t-sub').textContent, counts: b.all('unread').map((u) => u.className + ':' + u.textContent), pin: b.one('t-row') && b.kids[b.kids.length - 1].kids[1].markup, av: b.one('avatar').className, dot: !!b.one('on-dot'), badge: !!b.one('ubadge-verified'), name_markup: b.one('t-name').markup });

test('a row model is strings and numbers only, and the row drawn from it matches the live row', () => {
  const r = rows();
  const c = { id: 'gX', type: 'dm', members: ['alice', 'bob'], last: { ts: 1000, from: 'bob' } };
  const m = r.rowModel(c, { text: 'see you at 8' }, 5000);
  assert.deepEqual(m, { id: 'gX', k: 'dm', n: 'Bob', h: 'bob', ts: 1000, s: 'see you at 8', u: 2, m: false, p: false, at: true, b: 'verified', x: 0 });
  assert.ok(Object.values(m).every((v) => ['string', 'number', 'boolean'].includes(typeof v)), 'no record, no key, nothing that needs a server');
  const live = texts(r.drawRow(m, c)), cached = texts(r.drawRow(JSON.parse(JSON.stringify(m))));
  assert.deepEqual(live, { cls: 'thread', name: 'Bob', time: 't1000', sub: 'see you at 8', counts: ['unread at:@', 'unread:2'], pin: '', av: 'avatar live', dot: true, badge: true, name_markup: '' });
  assert.deepEqual(cached, { ...live, av: 'avatar letter', dot: false }, 'the cached row: a letter avatar in the same colour key, no presence dot, every text the same');
  const lb = r.drawRow(m, c), cb = r.drawRow(m); lb.onclick(); lb.hold(); cb.onclick();
  assert.deepEqual(r.calls, ['open:gX', 'menu'], 'the live tap opens and the live hold shows the menu; the cached tap only asks');
  assert.equal(r.S.wantOpen, 'gX');
  assert.equal(cb.hold, undefined, 'no menu on a cached row: it needs the record');
  assert.equal(r.drawRow(m).kids[0].text, 'B', 'the letter from the title, as userAvatar does');
});

test('the second line: You:, group sender, channel text, members, security code, blocked, hidden, saved messages, and the missing-key notice', () => {
  const r = rows();
  const sub = (c, pv) => r.rowModel(c, pv, 5000).s;
  assert.equal(sub({ id: 'gX', type: 'dm', members: ['alice', 'bob'], last: { ts: 1, from: 'alice' } }, { text: 'ok' }), 'You: ok');
  assert.equal(sub({ id: 'gX', type: 'dm', members: ['alice', 'bob'], last: { ts: 1, from: 'alice' } }, { text: 'Outgoing call', call: true }), 'Outgoing call', 'a call line names itself');
  assert.equal(sub({ id: 'gG', type: 'group', name: 'Trip', members: ['alice', 'bob', 'carol'], last: { ts: 1, from: 'carol' } }, { text: 'maps' }), 'Carol: maps');
  assert.equal(sub({ id: 'gG', type: 'group', name: 'Trip', members: ['alice', 'bob', 'carol'] }, null), '3 members');
  assert.equal(sub({ id: 'gC', name: 'News', members: ['alice', 'bob'], last: { ts: 1, from: 'bob' } }, { text: 'headline' }), 'headline');
  assert.equal(sub({ id: 'gC', name: 'News', members: ['alice', 'bob'] }, null), '2 subscribers');
  assert.equal(sub({ id: 'gS', type: 'dm', members: ['alice', 'alice'], last: { ts: 1, from: 'alice' } }, { text: 'note' }), 'note', 'saved messages: no You:');
  assert.equal(r.rowModel({ id: 'gS', type: 'dm', members: ['alice', 'alice'], last: { ts: 1, from: 'alice' } }, { text: 'note' }, 5000).k, 'self');
  assert.equal(sub({ id: 'gX', type: 'dm', members: ['alice', 'mallory'], last: { ts: 1, from: 'mallory' } }, { text: 'hey' }), 'Message from someone you blocked');
  assert.equal(sub({ id: 'gX', type: 'dm', members: ['alice', 'bob'], last: { ts: 1, from: 'bob' } }, { wake: true }), 'New message');
  assert.equal(sub({ id: 'gX', type: 'dm', members: ['alice', 'bob'], last: { ts: 1, from: 'bob', exp: 4000 } }, { text: 'gone' }), 'Message disappeared');
  assert.equal(sub({ id: 'gX', type: 'dm', members: ['alice', 'bob'], last: { ts: 1, from: 'bob' } }, null), 'Encrypted message');
  r.rowModel({ id: 'gX', type: 'dm', members: ['alice', 'bob'], last: { ts: 1, from: 'bob', e: 2 } }, { nokey: true, text: null }, 5000);
  assert.deepEqual(r.calls, ['nokey'], 'the missing-key notice runs from the model, as before');
  assert.equal(r.rowModel({ id: 'gX', type: 'dm', members: ['alice', 'bob'], last: { ts: 1, from: 'bob', exp: 9000 } }, { text: 'soon gone' }, 5000).x, 9000, 'the expiry rides along, so a cached row can go quiet on its own');
});

test('a cached row of a timer chat has no text and shows nothing, then "Message disappeared" once the expiry passes; a draft shows on a cached row too', () => {
  const r = rows();
  const soon = { id: 'gX', k: 'dm', n: 'Bob', h: 'bob', ts: 1, s: '', u: 0, m: false, p: false, at: false, b: null, x: Date.now() + 60e3 };
  assert.equal(texts(r.drawRow(soon)).sub, '');
  assert.equal(texts(r.drawRow({ ...soon, x: Date.now() - 1 })).sub, 'Message disappeared');
  assert.equal(texts(r.drawRow({ ...soon, x: 0 })).sub, '', 'no expiry, no text: an empty line, never a false "disappeared"');
  r.drafts['hush:draft:alice:gX'] = 'half a thought';
  const b = r.drawRow(soon).one('t-sub');
  assert.deepEqual([b.kids[0].className, b.kids[0].text, b.kids[1]], ['draft', 'Draft: ', 'half a thought'], 'the draft is read live from the sealed store, not cached twice');
});

test('muted, pinned, open and over-99 rows; the requests and archived rows draw through drawRow and are inert when cached', () => {
  const r = rows();
  const base = { id: 'gM', k: 'group', n: 'Trip', h: '', ts: 7, s: 'x', u: 150, m: true, p: true, at: false, b: null, x: 0 };
  let t = texts(r.drawRow(base));
  assert.deepEqual([t.counts, t.name_markup, t.pin], [['unread muted:99+'], '<group><muted>', ''], 'a count hides the pin');
  t = texts(r.drawRow({ ...base, u: 0 }));
  assert.deepEqual([t.counts, t.pin], [[], '<pin>'], 'no count: the pin shows');
  r.S.chan = 'gM'; t = texts(r.drawRow({ ...base, at: true }));
  assert.deepEqual([t.cls, t.counts, t.pin], ['thread active', [], '<pin>'], 'the open chat: no count, no @, pinned');
  r.S.chan = null;
  const req = r.drawRow({ k: 'req', n: 'Message requests', s: 'Bob wants to message you', u: 1 });
  t = texts(req); assert.deepEqual([t.cls, t.name, t.sub, t.counts, t.av, t.time], ['thread req-row', 'Message requests', 'Bob wants to message you', ['unread:1'], 'avatar req-av', '']);
  assert.equal(req.onclick, undefined, 'cached: inert (the live path sets openRequests)');
  const arch = r.drawRow({ k: 'arch', n: 'Archived chats', s: 'News, Trip', u: 3 });
  t = texts(arch); assert.deepEqual([t.cls, t.counts, t.av], ['thread arch-row', ['unread muted:3'], 'avatar arch-av']);
  assert.equal(arch.onclick, undefined);
  assert.equal(texts(r.drawRow({ k: 'arch', n: 'Archived chats', s: 'News', u: 0 })).counts.length, 0);
  assert.equal(texts(r.drawRow({ id: 'gS', k: 'self', n: 'Saved Messages', h: '', ts: 1, s: 'note', u: 0, m: false, p: false, at: false, b: null, x: 0 })).av, 'avatar saved');
});

test('the boot draws the cached list for the active account before the socket, and start() takes over; the pinned lock stretch is untouched', () => {
  assert.match(lift("S.ids=ls.get('hush:ids',[]);", 'S.db=await '), /^S\.ids=ls\.get\('hush:ids',\[\]\);\n\s*const active=ls\.get\('hush:active',null\),id=S\.ids\.find\(x=>x\.handle===active\)\|\|S\.ids\[0\];\n\s*if\(id&&!S\.pushCall\)\{S\.me=id;renderList\(\)\}[^\n]*\n\s*renderBanner\(\);\n\s*$/, 'the account lookup moved up; a page woken for a call spends nothing on the list before the socket');
  assert.equal(ui.split("const active=ls.get('hush:active',null),id=").length, 2, 'one lookup');
  assert.match(lift('S.db=await ', 'addEventListener(\'hashchange\''), /if\(id\)\{start\(id\);if\(hj\)setTimeout\(\(\)=>handleJoin\(hj\),400\)\}else\{S\.pendingJoin=hj;showOnboard\(false\)\}/, 'the same id starts the account');
  assert.doesNotMatch(lift('const plan=lockPlan(lockCfg(),!!S.pushCall);', 'S.ids=ls.get'), /renderList|hush:list/, 'nothing is drawn before the lock gate and the store');
  assert.match(ui, /function updateStatus\(\)\{const st=\$\('#netStatus'\);if\(st\)st\.textContent=S\.me&&!S\.convsLoaded\?'Connecting\\u2026':!S\.db\?'Offline':''\}/, '"Connecting…" over cached rows, not "Offline"');
});

test('a cached row tapped before its record came opens the moment it lands, and a tap on a chat that never comes is forgotten once the list is whole', () => {
  const line = lift('const onConvs=(list,fromCache)=>{', '\n  };').match(/\n\s*(if\(S\.wantOpen&&convById[^\n]*?S\.wantOpen=null;) \/\//);
  assert.ok(line, 'after renderList();renderCalls();computeUnread();syncCallWatch();mintWake();');
  assert.match(lift('const onConvs=(list,fromCache)=>{', '\n  };'), /renderList\(\);renderCalls\(\);computeUnread\(\);syncCallWatch\(\);mintWake\(\);\n\s*if\(S\.wantOpen&&convById\(S\.wantOpen\)\)/);
  const run = (S, known) => { const opened = []; new Function('S', 'convById', 'openConv', line[1])(S, (id) => known.includes(id) ? { id } : null, (id) => opened.push(id)); return { opened, want: S.wantOpen }; };
  assert.deepEqual(run({ wantOpen: 'gX', convsLoaded: false }, ['gX']), { opened: ['gX'], want: null }, 'opened as soon as the record is in, before the whole list');
  assert.deepEqual(run({ wantOpen: 'gX', convsLoaded: false }, []), { opened: [], want: 'gX' }, 'still waiting while the list is partial');
  assert.deepEqual(run({ wantOpen: 'gX', convsLoaded: true }, []), { opened: [], want: null }, 'the chat is gone: forgotten');
  assert.deepEqual(run({ wantOpen: null, convsLoaded: true }, ['gX']), { opened: [], want: null });
  assert.doesNotMatch(lift('function start(id){', 'closeConv();setListTitle()'), /wantOpen/, 'a tap in the moment before start() runs is kept, not reset');
});

test('the inventories name the cached list and its timer rule', () => {
  assert.match(lift('/* ===== HUSH STORE BEGIN ===== */', 'const PLAIN_KEYS='), /the chat list as last drawn\n\s*\(titles, last-line text, times, counts; no text from a chat with a timer\)/);
  const spec = readFileSync(new URL('../../SPEC.md', import.meta.url), 'utf8');
  assert.match(spec, /the chat list as last drawn \(`hush:list:<handle>`: titles, last-line text, times and counts, at most 90 rows, [^\n]*a chat with a message timer, or whose last message disappears, caches no text, and nothing is written during a call\)/);
});

test('the missing-key line names the device for a DM, and the person or the device for a group or channel, unless the channel\'s key history is broken', () => {
  assert.match(lift('else if(o.text==null){if(o.nokey)noKeyNotice', '\n'),
    /typeOf\(c\)==='dm'\?'Sent before this device was added, so it can\\u2019t be shown here\.':walkBad\.has\(c\.id\)\?'This channel\\u2019s history doesn\\u2019t check out, so this post can\\u2019t be opened\.':'Sent before you joined on this device, so it can\\u2019t be shown here\.'/);
});
