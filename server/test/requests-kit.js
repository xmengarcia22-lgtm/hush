// The page harness of the release-108 tests for message requests and invitations (requests-receiver, requests-sender and
// invite-hold.test.js). The page's own functions run here as written, lifted out of app/ui.js by their landmarks: the note rule
// (noteOk), notePointer, the chat watch (watchInbox), the request helpers (dmInfo ... awaitingAccept), callable, callsChat and
// markRead for the receiver; ensureDmDoc, sendBody and ensureInbox for the sender; and, each with a small stand-in for the screen,
// renderConv, showRequestAlert, openRequests and updateTitle. Everything around them is a stub: a note is a made-up plaintext
// handed over as if openPointer had opened it, a chat record is made up, and a snapshot of the mailbox is ordered by id, as
// app/adapter.js orders a query that has no orderBy. So these tests prove what the functions decide; requests-e2e.test.js runs
// them against the real server and the real sealing, and the two-browser proof runs the whole page.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const UI = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
function lift(from, to, src = UI) {
  const a = src.indexOf(from); assert.ok(a >= 0, `app/ui.js contains ${JSON.stringify(from)}`);
  const b = src.indexOf(to, a + from.length); assert.ok(b > a, `app/ui.js contains ${JSON.stringify(to)}`);
  return src.slice(a, b);
}
// The chat watch of release 106, as written at 1ed9955 (a page left open since then, on one of the receiver's devices).
const INBOX106 = readFileSync(new URL('./fixtures/page106-inbox.txt', import.meta.url), 'utf8');

const ME = 'bob', HOUR = 36e5, T = Math.floor(Date.now() / HOUR) * HOUR;
const cidOf = (peer) => 'd' + (peer + 'XXXXXXXXXXXXXXXXXXXXXXXX').slice(0, 22);   // a stand-in for the address both sides compute
const tick = (ms = 15) => new Promise((r) => setTimeout(r, ms));
const HANDLE = /^[a-z0-9_]{3,20}$/;

// ---- the receiver's page ---------------------------------------------------------------------------------------------------
const RECV = (inbox) => [
  lift('const typeOf=', '\n'), lift('const chatRec=', '\nconst dmPeer='), lift('const dmPeer=', '\n'), lift('const isSelf=', '\n'), lift('const epochOf=', '\n'),
  lift('const dmInfo=', 'async function answerRequest('),            // dmInfo, setDmInfo, reqTo, isRequest, isDeclined, pendingRequests, awaitingAccept
  lift('async function noteOk(', '/* Blocking, kept in the encrypted vault'),
  lift('const isBlocked=', '\n'), lift('const joinedPublic=', '\n'),
  lift('function notePointer(', '/* ===== HUSH INBOX RULE BEGIN ===== */'),
  lift('function pointerVerdict(', '\n'),
  inbox || lift('function watchInbox(', '/* ---------- voice calls (SPEC.md 16.2)'),
  lift('const callable=', '\n'), lift('const callsChat=', '\n'), lift('const lastRead=', '\n'), lift('const paceAt=', '\nfunction markRead('), lift('function markRead(', '\nasync function writeSeen('),
].join('\n');
const RSTUBS = ['S', 'ls', 'P', 'saveContacts', 'hiddenConv', 'openPointer', 'validHandle', 'senderKeys', 'dmIdFor', 'dmIds', 'ksMap', 'sideOk', 'showMeta', 'adoptOMeta', 'adminGone',
  'noteChatDoc', 'convKey', 'healCard', 'unsealPost', 'recordBase', 'dropPointer', 'noKeyNotice', 'toastErr', 'heldKey', 'codeWait', 'codeWaitEnd', 'setInterval', 'clearInterval', 'loadDir',
  'window', 'isMember', 'isChatBlocked', 'callPeerOk', 'curConv', 'document', 'updateTitle', 'writeSeen'];
const mkRecv = (inbox) => new Function('env', `const {${RSTUBS.join(',')}}=env;\n${RECV(inbox)}\nreturn {watchInbox,notePointer,noteOk,isRequest,isDeclined,dmInfo,setDmInfo,pendingRequests,awaitingAccept,pointerVerdict,callable,callsChat,markRead,isBlocked};`);
const recvNow = mkRecv(), recv106 = mkRecv(INBOX106);

// One page for bob. `records`: what the server would answer for channels/<cid>. `keys`: chats this device can open now.
// `held`: chats it holds or held a key for. `dms`: the vault's one-on-one entries. `ownRequests`: "Send a request first" as
// the server holds it; `seen`: the copy of bob's own profile the page already has (undefined: none yet). `vault`: false, the
// settings could not be read; `profile`: false, the read of his own profile fails. `old`: the chat watch of release 106.
function page({ blocked = [], dms = {}, records = {}, keys = [], held = [], ownRequests = true, seen, vault = true, profile = true, old = false, known = {} } = {}) {
  const log = { deleted: [], renoted: [], wrote: [], healed: [], watched: [], sideOk: 0, profileReads: 0, saved: 0, seen: [], fail: 0 };   // renoted: the tag and chat of each note the page wrote for itself; wrote: the same notes whole, as dropPointer was handed them; fail: how many of the next writes fail, as offline
  const S = { me: { handle: ME, kv: 1 }, prefs: { blocked: [...blocked], dms: JSON.parse(JSON.stringify(dms)) }, dmPeers: {}, dir: {}, contactsReady: true, vaultOk: vault ? true : false,
    rekeying: false, convs: [], db: null, posts: [], unread: new Map(), readWritten: new Map(), chan: null };
  if (seen !== undefined) S.dir[ME] = { handle: ME, requests: seen, kv: 1 };
  const server = { requests: ownRequests, readable: profile };
  let inboxCb = null;
  S.db = {
    collection: () => ({ limit: () => ({ onSnapshot: (cb) => { inboxCb = cb; return () => {}; } }) }),
    doc: (path) => ({
      delete: async () => { log.deleted.push(path.split('/').pop()); },
      onSnapshot: (cb) => { const cid = path.split('/')[1], d = records[cid]; log.watched.push(cid); Promise.resolve().then(() => cb({ exists: !!d, data: () => d })); return () => {}; },
    }),
    chatLevel: () => 'member',
  };
  const env = {
    S, ls: { get: (_k, d) => d, set: () => {} }, P: () => S.prefs, saveContacts: () => { log.saved++; }, hiddenConv: () => false,
    openPointer: async (d) => d._p, validHandle: (h) => HANDLE.test(h), senderKeys: async () => true,
    // as app/crypto.js dmIdFor: an address this page was told (dmIds), the vault's entry for the person, or the address worked out from the two keys
    dmIdFor: async (peer) => known[peer] || (Object.entries(S.prefs.dms).find(([, i]) => i.peer === peer) || [])[0] || cidOf(peer), dmIds: new Map(), ksMap: () => ({}),
    sideOk: async (from, sg) => { log.sideOk++; return sg === 'signed by ' + from; },
    showMeta: async (c) => (c.type === 'dm' ? { ...c, members: [ME, S.dmPeers[c.id]].filter(Boolean) } : c), adoptOMeta: () => {}, adminGone: () => {}, noteChatDoc: () => {},
    convKey: async (c) => (keys.includes(c.id) ? 'a key' : null), healCard: (c) => log.healed.push(c.id), unsealPost: async (_c, l) => l,
    recordBase: () => {}, dropPointer: async (to, p) => { if (log.fail > 0) { log.fail--; throw new Error('offline'); } log.renoted.push(p.t + ':' + p.cid); log.wrote.push({ to, p }); }, noKeyNotice: () => {}, toastErr: () => {},
    heldKey: (cid) => held.includes(cid), codeWait: () => false, codeWaitEnd: () => {}, setInterval: () => 0, clearInterval: () => {},
    // the page's own profile, read again from the server (ui.js loadDir, forced): it fails without a word, as loadDir does
    loadDir: async (hs, force) => { if (hs.includes(ME) && force) { log.profileReads++; if (server.readable) S.dir[ME] = { handle: ME, requests: server.requests, kv: 1 }; } return true; },
    window: { RTCPeerConnection: function () {} }, isMember: () => true, isChatBlocked: () => false, callPeerOk: () => true,
    curConv: () => S.convs.find((c) => c.id === S.chan) || null, document: { hidden: false }, updateTitle: () => {}, writeSeen: (c, ts) => { log.seen.push(c.id + ':' + ts); },
  };
  const api = (old ? recv106 : recvNow)(env);
  let list = [];
  const stop = api.watchInbox({ handle: ME }, (l) => { list = l; S.convs = l; });   // stop: the chat watch ended, as a change of account or a device removal ends it
  // A snapshot of the mailbox: the notes ordered by id, as the adapter orders them.
  const snap = async (notes) => {
    const docs = notes.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((n) => ({ id: n.id, data: () => ({ ts: n.ts, own: n.own, _p: n.p }) }));
    await inboxCb({ docs }); await tick();
  };
  const conv = (cid) => list.find((c) => c.id === cid) || null;
  // what bob's page made of one chat: its vault entry, whether it shows, and whether it is a request
  const state = (cid) => ({ vault: api.dmInfo(cid), shows: !!conv(cid), request: conv(cid) ? api.isRequest(conv(cid)) : null });
  return { S, api, log, snap, stop, list: () => list, conv, state, server, env };
}
const dmRec = (over = {}) => ({ type: 'dm', epoch: 1, ts: T, last: { sl: 1, id: 'p1', ts: T, from: null }, ...over });
// a note as the mailbox holds it: `id` (the server's random id), the stored hour, the stored mark `own`, and what opens out of it
const note = (id, t, from, cid, extra = {}, ts = T) => { const { own, ...p } = extra; return { id, ts, own, p: { t, cid, from, to: ME, ts: T, type: t === 'invite' ? p.type || 'group' : 'dm', ...p } }; };

// ---- the sender's page -----------------------------------------------------------------------------------------------------
const SEND = [
  lift('const typeOf=', '\n'), lift('const chatRec=', '\nconst dmPeer='), lift('const dmPeer=', '\n'), lift('const isSelf=', '\n'), lift('const convById=', '\n'), lift('const epochOf=', '\n'),
  lift('const dmInfo=', 'async function answerRequest('),
  lift('async function ensureDmDoc(', 'const liveQ='),
  lift('const lastOf=', '\n'), lift('const lastUpd=', '\n'),
  lift('async function sendBody(', '\nasync function sendNowScheduled('),
  lift('const dmRenoted=', '\n'),
  lift('async function ensureInbox(', 'function notePointer('),
  lift('function noteAccepted(', '\nasync function leaveChat('),
].join('\n');
const SSTUBS = ['S', 'ls', 'P', 'saveContacts', 'hiddenConv', 'dmSecret', 'dmIdFor', 'dmIds', 'ksMap', 'memberCapFrom', 'loadDir', 'dropPointer', 'ensureDmEpoch', 'hiOf', 'freshEpoch', 'rid', 'sealPost', 'wrapPost',
  'toast', 'fmtWhen', 'openScheduled', 'nudge', 'recordBase', 'setTyping', 'openConv', 'setTimeout'];
const mkSend = (patch = (s) => s) => new Function('env', `const {${SSTUBS.join(',')}}=env;\n${patch(SEND)}\nreturn {sendBody,awaitingAccept,dmInfo,setDmInfo,noteAccepted,ensureInbox};`);
const sendNow = mkSend();

// alice's page, about to write to bob. `bobProfile`: her copy of his profile. Every note she leaves is kept in `notes`, as
// { to, own, p } with p the plaintext dropPointer would seal (her own note goes over her connection and carries `own`).
function sender({ bobProfile = { handle: ME, requests: true }, dms = {}, build = sendNow } = {}) {
  const CID = cidOf('alice~bob'), notes = [], log = [], store = new Map();
  const S = { me: { handle: 'alice' }, prefs: { dms: JSON.parse(JSON.stringify(dms)) }, dmPeers: {}, dir: { bob: bobProfile }, contactsReady: true, convs: [], previews: new Map(), chatDocs: new Map(), posts: [], db: null, chan: null };
  S.db = { preview: async () => ({ exists: false }), createChat: async (cid) => { log.push('create ' + cid); },
    doc: (p) => ({ set: async () => { log.push('post'); }, update: async () => { log.push('mark'); } }), now: () => Date.now() };
  const env = { S, ls: { get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d), set: (k, v) => store.set(k, JSON.stringify(v)) }, P: () => S.prefs, saveContacts: () => {}, hiddenConv: () => false,
    dmSecret: async () => new Uint8Array(32), dmIdFor: async () => CID, dmIds: new Map(), ksMap: () => ({}), memberCapFrom: async () => 'cap', loadDir: async () => true,
    dropPointer: async (to, p) => { notes.push({ to, own: to === 'alice' ? 1 : undefined, p: { ...p, to, ts: T } }); },
    ensureDmEpoch: async () => {}, hiOf: () => 0, freshEpoch: async () => 0, rid: () => 'pOsT12345678',
    sealPost: async (_c, body) => ({ ts: Date.now(), e: 0, n: 'n', d: body }), wrapPost: async (_c, p) => Object.assign({ sl: 1 }, p),
    toast: () => {}, fmtWhen: () => '', openScheduled: () => {}, nudge: () => {}, recordBase: () => {}, setTyping: () => {}, openConv: () => {}, setTimeout: () => 0 };
  const api = build(env);
  S.previews.set(CID, { id: CID, type: 'dm', members: ['alice', ME], ts: 0, last: null, epoch: 0 });   // openDm's preview, as the page makes it when the chat is opened for the first time
  // one message, sent as the composer sends it; the chat is in her list afterwards (her own note brought it), her post its latest
  const send = async (body) => { await api.sendBody(CID, body); await tick(20);
    S.posts = [{ from: 'alice' }]; if (!S.convs.length) S.convs = [{ id: CID, type: 'dm', members: ['alice', ME], epoch: 0, last: { from: 'alice', ts: Date.now() } }]; };
  return { S, api, notes, log, send, CID, to: (h) => notes.filter((n) => n.to === h) };
}

// ---- a stand-in for the screen ---------------------------------------------------------------------------------------------
// An element keeps its tag, class, text, children and handlers; text() reads it as a person would, top to bottom.
function mkEl(tag, cls, text) {
  const e = { tag, className: cls || '', textContent: text == null ? '' : String(text), children: [], attrs: {}, hidden: false, style: {}, parent: null, innerHTML: '',
    append(...xs) { for (const x of xs) { if (x == null) continue; const n = typeof x === 'string' ? mkEl('#text', '', x) : x; if (n.parent) n.remove(); n.parent = e; e.children.push(n); } },
    replaceChildren(...xs) { for (const c of e.children) c.parent = null; e.children = []; e.append(...xs); },
    remove() { if (e.parent) { e.parent.children = e.parent.children.filter((c) => c !== e); e.parent = null; } },
    setAttribute(k, v) { e.attrs[k] = v; }, insertAdjacentHTML() {}, querySelector: () => null,
    classList: { add: (c) => { e.className += ' ' + c; }, remove: () => {} },
    get isConnected() { return !!e.parent; },
  };
  return e;
}
const text = (e) => [e.textContent, ...e.children.map(text)].filter(Boolean).join(' | ');
const all = (e, f, out = []) => { if (f(e)) out.push(e); for (const c of e.children) all(c, f, out); return out; };
const button = (e, label) => all(e, (x) => x.tag === 'button' && x.textContent === label);

export { UI, INBOX106, lift, ME, HOUR, T, HANDLE, cidOf, tick, page, dmRec, note, sender, mkSend, SEND, mkEl, text, all, button };
