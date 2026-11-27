// The page harness of the release-92 channel history tests (channel-history-page, -roll, -chain, -signed, -roles, -reseal, -links, -removal, -revoke, -resend, -trust, -cards, -cards2, -cards3, -admin, -admin2, -admin3, -admin4, -admin5, -admin6, -admin7, -admin8, -admin9, -admin10, -admin11, -leftadmin, -waiting, -golive, -golive2, -golive3, -strict, -edit and -repair.test.js, and epoch-rollback.test.js).
// The page's own code runs here: the whole of app/crypto.js, the adapter, and ui.js lifted by its landmarks (syncWraps,
// rotateTo, resendKeys, showMeta, adoptOMeta, setVisibility, createInvite, linkFor, joinPrivate, kickMember, rotateAdmins and setAdmins,
// leaveChat, the member-card, key-chain and Revoke block, confirmJoin, createChatDoc, openAddSubs, openEditConv, setAct, keyChanged, sendBody, sendErr, and
// rekeyChat, rekeyRun and rekeySummary), one copy per account, each with its own sealed store and connection, against a real
// server. Nothing is sealed by a stub. Kept apart from the tests so that each file of them stays inside the runner's 120 s.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import WebSocket from 'ws';

import { startServer, appSource, channelDoc } from './helpers.js';
import { fail } from '../src/errors.js';

const html = appSource();
function lift(from, to) {
  const a = html.indexOf(from); assert.ok(a > 0, `the page's files contain ${JSON.stringify(from)}`);
  const b = html.indexOf(to, a + from.length); assert.ok(b > a, `the page's files contain ${JSON.stringify(to)}`);
  return html.slice(a, b);
}
const createHushAdapter = new Function(lift('/* ===== HUSH ADAPTER BEGIN ===== */', '/* ===== HUSH ADAPTER END ===== */') + '\nreturn createHushAdapter;')();
const CRYPTO = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
const UI = [
  lift('const NOTE_PLAIN=', '\n'), lift('function padNote(', '\n'),
  lift('const typeOf=', '\n'), lift('const chatRec=', '\nconst dmPeer='), lift('const convTitle=', '\n'), lift('const isMember=', '\n'), lift('const levelHere=', '\n'), lift('const isOwner=', '\n'), lift('const isAdminH=', '\n'), lift('const isAdmin=', 'const canPost='),
  lift('const epochOf=', '\n'), lift('const keyMap=', '\n'), lift('const epochsOf=', '\n'), lift('const metaOf=', '\n'),
  lift('const wrapSynced=', 'async function rotateTo('),
  lift('async function rotateTo(', 'const dmEpochBusy='),
  lift('async function resendKeys(', 'async function allRaws('), lift('async function allRaws(', '\n'),
  lift('async function freshChan(', '\n'), lift('const joinedPublic=', '\n'), lift('async function showMeta(', 'const ownTried='), lift('let countQ=', '\n'), lift('const recount=', '\n'), lift('const oAdopted=', 'async function chatAnd('), lift('async function chatAnd(', '\n'), lift('async function setVisibility(', 'async function createInvite('),
  lift('async function createInvite(', 'const linkFor='), lift('const linkFor=', '\n'),
  lift('function parseJoin(', 'async function joinPublic('),
  lift('async function kickMember(', 'async function rotateAdmins('),
  lift('async function rotateAdmins(', 'async function unban('),
  lift('async function leaveChat(', '/* ---------- member cards'),
  lift('async function writeCard(', '/* ---------- sheets ---------- */'),
  lift('function confirmJoin(', 'function segControl('),
  lift('async function createChatDoc(', 'function openAddSubs('), lift('function openAddSubs(', 'function qrSvg('), lift('function openEditConv(', 'async function openProfile('),
  lift('const pause=', '\n'), lift('const withLock=', '\n'),
  lift('async function setAct(', 'function openAct('), lift('const keyChanged=', '\n'), lift('const sendErr=', '\n\n'),
  lift('const lastOf=', '\n'), lift('const lastUpd=', '\n'), lift('async function sendBody(', '\nasync function sendNowScheduled('),
  lift('const ownerCapOld=', '\n'), lift('const REKEY_BACKOFF=', '\n'), lift('async function rekeyChat(', 'async function finishRekey('),
].join('\n');
const STUBS = ['S', 'ls', 'Date', 'spy', 'dmPeer', 'validHandle', 'loadDir', 'P', 'saveContacts', 'renderBanner', 'openSetupLogin', 'normPhone', 'dispOk',
  'convById', 'noteChatDoc', 'openConv', 'handOver', 'toast', 'toastErr', 'openDm', 'noteTier', 'notOwner', 'climb', 'sheet', 'el', 'convAvatar', 'memberText', 'subsText',
  'I', 'actionRow', 'picker', 'ensureInbox', 'openInvite', 'APP_URL', 'confirmDanger', 'displayName', 'withBadge', 'atOf',
  'awaitingAccept', 'ensureDmDoc', 'ensureDmEpoch', 'fmtWhen', 'openScheduled', 'nudge', 'isSelf', 'dmRenoted', 'recordBase', 'setTyping', 'photoEditor', 'renderList'];
const EXPORTS = ['newIdentity', 'sealMeta', 'sealOMeta', 'wrapAll', 'wrapKey', 'ksPut', 'ksGet', 'b64', 'unb64', 'memberCapFrom', 'memberCap', 'adminCapFrom', 'adminSecret', 'ownerCap',
  'convKey', 'readMeta', 'readOMeta', 'tagMap', 'epochOf', 'metaOf', 'sealCard', 'openCard', 'cardSigOk', 'rotateTo', 'showMeta', 'chatAnd', 'freshChan', 'createInvite', 'joinPrivate',
  'kickMember', 'rotateAdmins', 'setAdmins', 'repairKey', 'openRepair', 'setVisibility', 'leaveChat', 'writeCard', 'healCard', 'resendCards', 'readRoll', 'rollRun', 'leaveWait', 'rolesOf',
  'sealRaw', 'chainRow', 'openCommit', 'openBack', 'walkBad', 'walkWait', 'ensureChain', 'createChatDoc',
  'sealKey', 'keyMade', 'noteRoles', 'noteChained', 'noteOwnAh', 'rolesQ', 'rekeyIdentity', 'sealPost', 'sealSvc', 'sealMetaFor', 'sealOMetaFor', 'adoptOMeta', 'setAct', 'sendErr', 'wrapTo', 'wrapSalt',
  'inviteRaws', 'inviteKey', 'handRaws', 'resendKeys', 'syncWraps', 'confirmJoin', 'openAddSubs', 'ensureDev', 'devEntry',
  'sealAs', 'openAs', 'adminId', 'verifiedAdmin', 'signAdminId', 'carryLinks', 'keptLink', 'linkFor', 'revokeInvite', 'ownerCapOld', 'rekeyRun', 'rekeySummary', 'openRevoke', 'revokeRekey', 'sendBody', 'freshEpoch', 'unsealPost', 'openEditConv',
  'goLive', 'waitList', 'noteWait', 'openWaiting', 'addSubs', 'rolesLater', 'rolesHeld', 'chatRec'];
// wrapAll is watched (a leave batch that waits must not wrap anything); the inbox note a joiner leaves itself goes nowhere.
// `old`: code from an earlier release, appended so its functions replace this release's (a tab left open since then).
const mkBuild = (old = '') => new Function('env', `const {${STUBS.join(',')}}=env;\n${CRYPTO}\n${UI}\n${old}\n{const w=wrapAll;wrapAll=async(...a)=>{spy.wrapAll.push(a[1]);return w(...a)}}dropPointer=env.dropPointer;\nreturn {${EXPORTS.join(',')}};`);
const build = mkBuild();

const HANDLE = /^[a-z0-9_]{3,20}$/;
const b64u = (b) => Buffer.from(b).toString('base64url');
const offline = () => Object.assign(new Error('offline'), { code: 'offline' });

// One account's page: its own S, sealed store (kept across reloads by passing `store` and `id` again) and connection.
// `kv`: account key versions to show in the directory as loaded (a dev card counts once the author's key changed).
async function pageFor(T, handle, o = {}) {
  const store = o.store || new Map(), clock = o.clock || { skew: 0 }, kv = o.kv || {};
  const spy = { wrapAll: [], rotate: [], card: [], ban: [], admins: [], updates: [], counts: [], refused: [], gets: 0, chain: [], mget: [], failRotate: [], posts: 0, failCard: 0, failAdmins: 0, denyGet: false, els: [], toasts: [], confirms: [], nudge: [], inbox: [] };
  const ls = { get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d), set: (k, v) => { if (v == null) store.delete(k); else store.set(k, JSON.stringify(v)); } };
  const S = { me: null, keys: new Map(), chanKeys: new Map(), prefs: null, dir: {}, pins: o.pins || null, ks: null, ksFor: null, dmPeers: {}, chatDocs: new Map(), previews: new Map(), convs: [], db: null };
  const noop = () => {};
  const env = { S, ls, spy, Date: { now: () => Date.now() + clock.skew }, dmPeer: () => null, validHandle: (h) => HANDLE.test(h), P: () => S.prefs || (S.prefs = {}), saveContacts: noop, renderBanner: noop,
    openSetupLogin: noop, normPhone: (s) => s, dispOk: (d, h) => d === h, convById: (cid) => S.convs.find((x) => x.id === cid) || S.previews.get(cid) || null, noteChatDoc: (c) => S.chatDocs.set(c.id, c), dropPointer: async () => {}, openConv: noop,
    handOver: async () => {}, toast: (...a) => spy.toasts.push(a), toastErr: (...a) => spy.toasts.push(['error', ...a]), confirmDanger: (m) => { spy.confirms.push(m); return true; }, displayName: (h) => h, withBadge: (n) => n, atOf: (h) => '@' + h, openDm: noop, noteTier: noop, notOwner: () => false, climb: async () => {},
    // the join, Add and Revoke sheets (confirmJoin, openAddSubs, openRevoke): their elements are kept, so a test can press Join,
    // Add or Change the key, tick a box and read the error line; the people picked for Add are S.pick; toasts and confirms are kept too, and so are the notes Add sends (ensureInbox: spy.inbox, with `true` when sent afresh)
    sheet: () => ({ body: { append: noop }, sh: { append: noop }, close: noop }), I: {}, actionRow: () => ({}), picker: () => new Set(S.pick || []), ensureInbox: async (c, only, fresh) => { spy.inbox.push(fresh ? [c.id, only || null, true] : [c.id, only || null]); }, openInvite: noop, el: (tag, cls, text) => { const e = { tag, cls, textContent: text || '', disabled: false, style: {}, append: noop, replaceChildren: noop }; spy.els.push(e); return e; },   // style: what the script itself sets on the element (the removal summary's node and its red box)
    convAvatar: () => ({}), memberText: () => '', subsText: () => '', APP_URL: 'https://hush.test/',
    // sendBody's surroundings: no message request, no DM to set up; a nudge is kept
    awaitingAccept: () => false, ensureDmDoc: async () => {}, ensureDmEpoch: async () => {}, fmtWhen: String, openScheduled: noop, nudge: (c, b) => spy.nudge.push(b), isSelf: () => false, dmRenoted: new Set(), recordBase: noop, setTyping: noop,
    photoEditor: noop,   // the Edit sheet (openEditConv): its name field, Save button and error line are kept in spy.els
    renderList: noop,   // the chat list's notice (noteWait) redraws nothing here
    loadDir: async (hs, force) => { if (!S.db) return false; for (const h of new Set(hs || [])) { if (!force && S.dir[h]) continue;
      try { const s = await S.db.doc('directory/' + h).get(); if (s.exists) S.dir[h] = { ...s.data(), ...(kv[h] ? { kv: kv[h] } : {}) }; } catch {} } return true; } };
  const P = (o.build || build)(env);
  const id = o.id || await P.newIdentity();
  S.me = { handle, ...id };
  Object.assign(P, { S, ls, store, spy, id, handle, clock, kv, loadDir: env.loadDir, close: () => S.db && S.db.close() });
  if (!T) return P;
  const db = createHushAdapter(T.url, { WebSocket, onStatus: noop, evictNow: () => !!S.rekeying, onPower: (cid, held) => { (S.paused || (S.paused = new Set())).add(cid); (spy.power = spy.power || []).push([cid, held]); }, caps: async (cid) => { if (spy.capsFor) return spy.capsFor(cid);
    const s = await db.preview(cid); if (!s.exists) return null;
    const c = P.chatRec(cid, s.data()), a = await P.adminSecret(c).catch(() => null);   // the record through the page's own door, as capsFor reads it (release 108)
    const own = o.owner ? [await P.ownerCap(cid), await P.ownerCapOld(cid)] : []; if (S.rekeying) own.reverse();   // as capsFor: the server knows the old owner key until a device removal replaces it
    return [...own, a ? await P.adminCapFrom(cid, a) : null, await P.memberCap(c, P.epochOf(c)).catch(() => null)].filter(Boolean);
  } });
  const real = { rotateChat: db.rotateChat, card: db.card, banChat: db.banChat, setAdmins: db.setAdmins, doc: db.doc, collection: db.collection, chain: db.chain, mgetChat: db.mgetChat };
  // failRotate: one entry per key change from here on, a code to refuse it with before it reaches the server (or { e, m }, the code and the message, as the frame budget's ratelimit 'slow down'), or null to send it
  db.rotateChat = async (cid, spec) => { spy.rotate.push(spec); const f = spy.failRotate.shift(); if (f) throw Object.assign(new Error(f.m || f), { code: f.e || f }); return real.rotateChat(cid, spec); };
  db.chain = async (...a) => { spy.chain.push(a[1]); return real.chain(...a); };
  db.mgetChat = async (cid, ps) => { spy.mget.push(ps.length); return real.mgetChat(cid, ps); };
  db.card = async (...a) => { spy.card.push(a[0]); if (spy.failCard > 0) { spy.failCard--; throw offline(); } return real.card(...a); };
  db.banChat = async (cid, h, on) => { spy.ban.push([h, !!on]); return real.banChat(cid, h, on); };
  db.setAdmins = async (...a) => { spy.admins.push(a[0]); if (spy.failAdmins > 0) { spy.failAdmins--; throw offline(); } return real.setAdmins(...a); };
  // every post this page tries, refused or not (the server refuses a subscriber's post in a channel, so its count alone proves nothing)
  db.collection = (p) => { const q = real.collection(p); if (/\/posts$/.test(p)) { const add = q.add; q.add = (v) => { spy.posts++; return add(v); }; } return q; };
  db.doc = (p) => { const d = real.doc(p), u = d.update, g = d.get, rec = /^channels\/[^/]+$/.test(p);
    // a record update of `n` alone is the subscriber count (release 95), a separate best-effort write: its values are kept in spy.counts and the codes it was refused with in spy.refused, never in spy.updates (the list and key writes)
    d.update = (v) => { const n = rec && Object.keys(v).join() === 'n'; if (rec) (n ? spy.counts.push(v.n) : spy.updates.push(Object.keys(v))); return n ? u(v).catch((e) => { spy.refused.push(e.code); throw e; }) : u(v); };
    d.get = () => { if (rec) spy.gets++; return rec && spy.denyGet ? Promise.reject(Object.assign(new Error('denied'), { code: 'denied' })) : g(); };   // spy.gets: the record's reads
    return d; };
  S.db = db;
  await db.ready;
  const sk = await crypto.subtle.importKey('jwk', id.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await db.prove({ h: handle, pub: id.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  if (!o.id) await db.doc('directory/' + handle).set({ handle, name: handle, ecdh: id.ecdh, sig: id.sig, kv: 1 });
  // the record as the chat watch would have delivered it (noteChatDoc), and the readable copy of it; opened again first, as
  // an eviction does, so a key change another page just made never races this page's next call
  P.sync = async (cid) => { await db.refreshChat(cid).catch(() => {}); const c = await P.freshChan(cid); S.chatDocs.set(cid, c); return c; };
  P.shown = async (cid) => P.showMeta(await P.sync(cid));
  P.run = async (cid) => P.rollRun(await P.shown(cid));
  P.meta = async (cid) => P.readMeta(await P.sync(cid));
  P.holds = async (cid, e) => !!(await P.convKey(await P.sync(cid), e));
  P.cards = async (cid) => { const c = await P.sync(cid), rows = (await db.collection('channels/' + cid + '/roll').limit(1000).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
    return (await Promise.all(rows.map((r) => P.openCard(c, r)))).filter(Boolean).map((x) => x.f + ':' + x.k).sort(); };
  P.reload = () => pageFor(T, handle, { ...o, id, store, clock, kv });
  return P;
}

// A server of its own, and the pages made on it closed at the end. Leaves may rotate back to back unless a test says otherwise.
async function world(opts, fn) {
  const T = await startServer({ authz: 'standard', ...(opts.now ? { now: opts.now } : {}), limits: { postsPerMin: 1000, invitesPerMinPerAddr: 1000, leaveRotateGapMs: 0, leaveRotatesPerDay: 100, ...(opts.limits || {}) } });
  const pages = [];
  const w = { T, cid: 'cH' + randomBytes(8).toString('hex').replace(/[^a-z0-9]/g, '').slice(0, 11),
    page: async (h, o) => { const p = await pageFor(T, h, o); pages.push(p); return p; },
    reload: async (p) => { const q = await p.reload(); pages.push(q); p.close(); return q; } };
  try { await fn(w); } finally { for (const p of pages) p.close(); await T.stop(); }
}

// The owner's page makes a private channel the way the app seals one: wraps for every member, meta and ometa under epoch 0 (a channel's ometa naming the admin secret's fingerprint),
// the admin secret wrapped to the owner and the admins, and the member key worked out from the chat key.
async function makeChannel(A, cid, members, admins = [], type = 'channel') {
  const raw = crypto.getRandomValues(new Uint8Array(32)), secret = crypto.getRandomValues(new Uint8Array(32));
  await A.loadDir(members, true);
  const akeys = {}; for (const h of [A.handle, ...admins]) Object.assign(akeys, await A.wrapKey(secret, h, cid + '#a'));
  const v = { name: 'History', owner: A.handle, admins, members, banned: [] };
  const doc = channelDoc({ type, keys: { 0: await A.wrapAll(raw, members, cid, 0) }, akeys, meta: await A.sealMeta(cid, 0, raw, v), ometa: await A.sealOMeta(cid, 0, raw, type === 'channel' ? { ...v, _ah: await A.adminId(cid, secret) } : v) });
  await A.S.db.createChat(cid, doc, { m: await A.memberCapFrom(cid, 0, raw), a: await A.adminCapFrom(cid, secret), o: await A.ownerCap(cid) });
  A.ksPut(cid, 0, A.b64(raw)); A.ksPut(cid, 'a', A.b64(secret));
  return A.sync(cid);
}
const linkOf = async (A, cid) => { A.S.chatDocs.delete(cid); const inv = await A.createInvite(cid); return { cid, iid: inv.iid, secret: inv.secret }; };

// The server as it was before a channel's member and blocked lists and its read marks were kept from everyone below admin level
// (release 93a): every connection holding a chat reads its record whole (authz.js 'member' read as the whole record), and below admin
// level reads, updates and deletes a channel's read marks as before ('blind' read as no rule). The page goes out first, so its flows
// must still work there; off() is that server release, and calling this again mid-test its rollback. It knows no subscriber count (n)
// either: an update that changes n is refused, as release 93a refuses it.
function oldServer(T) {
  const st = T.srv.store, a = st.authz;
  st.authz = Object.freeze({ ...a, check: (...x) => {
    const [, op, p, ctx] = x;
    if (op === 'update' && p.kind === 'channels' && ctx.d.n !== ctx.prev.n) fail('denied', '"n" cannot change');
    const m = a.check(...x); return m === 'member' || m === 'blind' ? undefined : m;
  } });
  return { off: () => { st.authz = a; } };
}

export { lift, mkBuild, build, b64u, offline, pageFor, world, makeChannel, linkOf, oldServer };
