// Helpers of the tests of release 104, item 5 (removal-nouse-*.test.js; SPEC.md 14.15): a chat whose owner step fails in a
// device removal is marked "don't use". They sit on the page harness of channel-history-kit.js: the removal runs as written
// (rekeyRun from its chats stage on, then rekeySummary) against a real server, and the page's REAL capsFor decides which keys
// an open offers (realCapsBuild), unless a test says otherwise.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { b64u, mkBuild, pageFor } from './channel-history-kit.js';
import { channelDoc } from './helpers.js';
import WS from 'ws';

export const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
// the level a key gives at the server now: 'owner', 'admin', 'member', null (opens nothing) or 'nochat'
export const level = (w, cid, cap) => { const r = w.T.srv.store.q.chatGet.get(cid), h = sha(cap); return !r ? 'nochat' : h === r.cap_o ? 'owner' : h === r.cap_a ? 'admin' : h === r.cap_m ? 'member' : null; };

export async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}
// A device removal from its rotate stage on, stopped at the vault stage; then as the removal's end leaves the page (S.rekeying false)
export async function removal(X, chats) {
  const rec = { stage: 'rotate', name: 'Old phone', rotated: [], chats: chats.map((x) => ({ type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], name: 'History', unlocked: true, ...x })) }, fails = [];
  const ui = { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} };
  X.S.contactsReady = true; X.S.vaultOk = true;
  await X.rekeyRun(rec, ui);
  assert.deepEqual(fails, ['Removing the device stopped (stop). Close Hush and open it again to finish it.'], 'the rotate stage ran to its end');
  X.S.rekeying = false;
  return rec;
}
// the summary as drawn: every element made for it, the texts, the warning boxes, any button
export const draw = (X, rec) => { X.spy.els.length = 0; const n = X.rekeySummary(rec); const els = [...X.spy.els]; return { n, els, t: els.map((e) => e.textContent).filter(Boolean), btn: els.find((e) => e.tag === 'button') || null, box: els.filter((e) => e.cls === 'warnbox').map((e) => e.textContent) }; };
export const has = (s, re) => s.t.some((x) => re.test(x));
export const MANAGE = /may still be able to manage/, BOX = /^Couldn’t secure these chats: .*\. A device you removed may still have control there\. Don’t use them any more\. Start new chats with the same people\.$/,
  ADMINS = /^Your admins in /, READ = /may still read new messages there/, TAKEN = /^Someone locked you out/, COUNT = /^\d+ chats? (is|are) secured\.$/;
export const count = (s) => s.t.find((x) => COUNT.test(x));
// the "don't use" marks of this account on this device
export const marks = (X) => Object.keys(X.ls.get('hush:noUse:' + X.handle, {})).sort();
// the old identity's keys, as the removed device holds them
export const oldOf = async (A, cid) => { const old = await pageFor(null, A.handle, { id: A.id }), sec = A.ksGet(cid, 'a'); return { own: await old.ownerCap(cid), adm: sec ? await A.adminCapFrom(cid, A.unb64(sec)) : null }; };
// a write of the page made to fail: `pick(v)` says which record update, `how` the code ('' for an error without one)
export const failDoc = (A, pick, how, times = Infinity) => { const real = A.S.db.doc; let n = 0; A.S.db.doc = (p) => { const d = real(p), u = d.update; d.update = (v) => (/^channels\/[^/]+$/.test(p) && pick(v) && n++ < times ? Promise.reject(Object.assign(new Error(how || 'nokey'), how ? { code: how } : {})) : u(v)); return d; }; return { undo: () => { A.S.db.doc = real; }, count: () => n }; };
// a call of the adapter made to fail, one entry per call: a code (refused before it is sent), 'lost' (sent, lands, the reply is lost: a time-out), or null (sent as it is)
export const failCall = (A, name, list) => { const real = A.S.db[name]; const calls = []; A.S.db[name] = async (...a) => { calls.push(a[0]); const how = list.shift(); if (how === 'lost') { await real(...a); throw Object.assign(new Error('timeout'), { code: 'timeout' }); } if (how) throw Object.assign(new Error(how), { code: how }); return real(...a); }; return { undo: () => { A.S.db[name] = real; }, calls }; };
// every setOwner call (the level the connection held when it was sent, and how it ended) and every forced fresh open (its answer, the level after it)
export const watchOwn = (A) => { const real = A.S.db.setOwner, rf = A.S.db.refreshChat, seen = [], fresh = []; A.S.db.setOwner = async (cid, cap) => { const lv = A.S.db.chatLevel(cid); try { const r = await real(cid, cap); seen.push([lv, 'ok']); return r; } catch (e) { seen.push([lv, e.code || e.message]); throw e; } }; A.S.db.refreshChat = async (cid) => { const r = await rf(cid); fresh.push([r, A.S.db.chatLevel(cid)]); return r; }; return { seen, fresh }; };
// the page's real capsFor (lifted from the page's code), handed to the adapter through the kit's hook; its "not the owner" mark is read from spy.notOwner (the kit's stand-in always says no)
export const UIJS = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
export const cut = (a, b, src = UIJS) => { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); assert.ok(i > 0 && j > i, a); return src.slice(i, j); };
export const realCapsBuild = (extra = '') => mkBuild('spy.ls=ls;const ownTried=new Set();\n' + cut('async function capsFor(', 'function noteChatDoc(').split('notOwner(cid)').join('(spy.notOwner||(()=>false))(cid)') + '\nspy.capsFor=capsFor;spy.ownTried=ownTried;' + extra);
export const plainBuild = (extra = '') => mkBuild('spy.ls=ls;' + extra);
// a private group from before signed lists (no ometa): the owner is named by the sealed description alone
export async function makeOldGroup(A, cid, members, admins = []) {
  const raw = crypto.getRandomValues(new Uint8Array(32)), secret = crypto.getRandomValues(new Uint8Array(32));
  await A.loadDir(members, true);
  const akeys = {}; for (const h of [A.handle, ...admins]) Object.assign(akeys, await A.wrapKey(secret, h, cid + '#a'));
  const v = { name: 'Old group', owner: A.handle, admins, members, banned: [] };
  const doc = channelDoc({ type: 'group', keys: { 0: await A.wrapAll(raw, members, cid, 0) }, akeys, meta: await A.sealMeta(cid, 0, raw, v) });
  await A.S.db.createChat(cid, doc, { m: await A.memberCapFrom(cid, 0, raw), a: await A.adminCapFrom(cid, secret), o: await A.ownerCap(cid) });
  A.ksPut(cid, 0, A.b64(raw)); A.ksPut(cid, 'a', A.b64(secret));
  return A.sync(cid);
}
// the chat's own notice: openConv's statement as written in the page, run with a chat pane that keeps what is appended
const NOTE = UIJS.split('\n').find((l) => l.startsWith("  if(t!=='dm'&&ls.get('hush:noUse:'"));
export const noteLine = NOTE;
export const chatNote = (X, cid, t = 'channel') => { assert.ok(NOTE, 'the page has the statement'); const out = [], p = { append: (...a) => out.push(...a) }, el = (tag, cls, text) => ({ tag, cls, text });
  new Function('t', 'ls', 'S', 'cid', 'p', 'el', NOTE)(t, X.ls, X.S, cid, p, el); return out; };
export const NOTE_TEXT = 'Couldn’t secure this chat. A device you removed may still have control here. Start a new chat with the same people.';

// ---- helpers for the refused sign-in, the "out of date" error and the one read ----
export const KEY = 'hush:noUse:';
export const until = async (f, ms = 15000) => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timed out waiting'); await new Promise((r) => setTimeout(r, 50)); } };
export const within = (p, ms = 8000) => { let t; return Promise.race([p, new Promise((_, j) => { t = setTimeout(() => j(Object.assign(new Error('testwait'), { code: 'testwait' })), ms); })]).finally(() => clearTimeout(t)); };
export const chatsOf = (chats) => chats.map((x) => ({ type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], name: 'History', unlocked: true, ...x }));
// A device removal from its rotate stage on, with its record in the store first (as the real run has it from its 'write' stage on),
// so the run's own catch sees a kept record. Returns how the run ended: the sheet's last words (fails), the progress lines (steps),
// the record in hand and the record as the store holds it. Stops at the vault stage when it gets that far ('stop').
// `closed`: how often the run closed its sheet without a tap (the fix round of 2026-11-13, F3). `ui0`: a sheet to run on instead
// of the kit's own (the page's real rekeySheet, sheetBuild below); the kit's lists then stay empty
export async function run(X, chats, rec0, ui0) {
  const rec = rec0 || { stage: 'rotate', name: 'Old phone', rotated: [], chats: chatsOf(chats) }, fails = [], steps = [], asks = []; let closed = 0;
  const ui = ui0 || { step: (t) => { steps.push(t); if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { asks.push(t); throw new Error(t); }, fail: (t) => fails.push(t), close: () => { closed++; }, done: () => {} };
  X.S.contactsReady = true; X.S.vaultOk = true; X.ls.set('hush:rekey:' + X.handle, rec);
  await X.rekeyRun(rec, ui);
  return { rec, fails, steps, asks, closed, stored: X.ls.get('hush:rekey:' + X.handle, null), through: fails.length === 1 && fails[0] === STOPPED('stop') };
}
export const STOPPED = (why) => 'Removing the device stopped (' + why + '). Close Hush and open it again to finish it.';
export const OUT_OF_DATE = 'This copy of Hush is out of date for the server. Reload the page.';   // the adapter's own error (its banner)
// the reason the stop sentence gives while that error stands (the owner's decision of 2026-11-13, F6 of the fix round)
export const OUT_DATED = 'this copy of Hush is out of date';
// this account's connections closed by the server, as a phone's sleep or a network change drops them
export const drop = (w, handle) => { let n = 0; for (const cn of [...w.T.srv.conns]) if (cn.proven === handle) { cn.close('test drop'); n++; } return n; };
// the address's failed sign-ins forgotten (in real life: one comes back each minute)
export const refill = (w) => { for (const cn of [...w.T.srv.conns]) { cn.ctx.proveFails.map.clear(); return true; } return false; };
// one failed sign-in from this address, by another account's page (a signature by a key that is not the account's)
export async function failSignIn(Z) {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const bad = { h: Z.handle, pub: Z.S.me.sig, dev: '', signDev: null, signAcct: async (m) => Buffer.from(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k.privateKey, Buffer.from(m))).toString('base64url') };
  await Z.S.db.prove(null); return within(Z.S.db.prove(bad)).then(() => 'ok', (e) => e.code);
}
// The "out of date" error, by the real server's own answer: while the gate is on, every hello a page sends names a protocol
// version the server does not speak, so the server refuses it with `version` (protocol.js, hello) and the page's adapter closes
// for good. The kit hands the adapter the 'ws' package's class, so the gate sits in that class's send (the server's own sockets
// never send a hello). Turn `on` when the next reconnect is to be refused; undo() puts the class back.
export function versionGate() {
  const proto = WS.prototype, real = proto.send, gate = { on: false, refused: 0 };
  proto.send = function (d, ...a) { if (gate.on && typeof d === 'string' && /"op":"hello"/.test(d)) { d = d.replace('"v":1', '"v":99'); gate.refused++; } return real.call(this, d, ...a); };
  gate.undo = () => { proto.send = real; };
  return gate;
}
// A reload: a fresh page over the same store, on a connection the server accepts. The kit's pages carry no device key, so a fresh
// kit page cannot unwrap the copy of an admin secret that was made for the account key of before. A real device unwraps the copy
// made for its own device key, which a removal does not replace (rekeyIdentity). So the fresh page is handed that one secret,
// from the store, for each chat named; everything else it reads and works out by itself.
export const reloadBuild = () => realCapsBuild('spy.adminCache=adminCache;');
export async function reload(w, A, cids, people = ['alice', 'bob']) {
  const P = await w.page(A.handle, { store: A.store, id: A.S.me, owner: true, build: reloadBuild() }); await P.loadDir(people, true);
  for (const cid of cids) { const s = await P.S.db.preview(cid), raw = P.ksGet(cid, 'a'); if (s.exists && raw) P.spy.adminCache.set(A.handle + '::' + cid + ':' + JSON.stringify(s.data().akeys), Promise.resolve(P.unb64(raw))); }
  return P;
}

// ---- the sign-out (the owner's answer B, 2026-11-12): a sign-in refused for good in the chats stage signs this device out ----
// The page's own keysMovedOn, signedOutHere, forgetAccountData and rekeyPending run as written (lifted from the page's code).
// What they stand on is not part of the kit's page; each stand-in does the least and notes what was asked of it in spy.out:
// the blob on disk is the kit's store (handed in as spy.store by device(), below), so peekSealed reads it and forgetEntries
// deletes from it; a reload of the tab, the start of another account, the onboarding screen, the wipe of the unsealed memory
// and the wipe of the device's own keys (the last account) are only noted. The toast is the kit's own (spy.toasts).
export const SECURED = 'Another device secured your account while this was running. This device can’t make changes any more.';
export const OUT_LAST = 'Your account was set up fresh on another device, so it was logged out here.';
export const OUT_OTHER = (h) => '@' + h + ' was moved to a new device and logged out here.';
export const outBuild = (extra = '') => realCapsBuild('spy.out=[];const peekSealed=async k=>ls.get(k,null),natOk=()=>false,secSave=Promise.resolve(),pushMark=()=>{},callOff=()=>{};\n'
  + 'const forgetEntries=pred=>{let n=0;for(const k of [...spy.store.keys()])if(pred(k,JSON.parse(spy.store.get(k)))){spy.store.delete(k);n++}return n};\n'
  + 'const forgetDevice=async()=>{spy.out.push("forgetDevice")},unlockStore=async()=>{spy.out.push("unlockStore")},dropUnsealed=()=>{spy.out.push("dropUnsealed")};\n'
  + 'const start=id=>{spy.out.push("start:"+id.handle)},showOnboard=(adding,notice)=>{spy.out.push("onboard:"+notice)},location={reload:()=>{spy.out.push("reload")}};\n'
  + cut('const rekeyPending=', '\n') + '\n' + cut('let movedOnBusy=false;', '/* The account was deleted') + cut('const ownedBy=', 'function dropUnsealed(')
  + '\nspy.keysMovedOn=keysMovedOn;spy.rekeyPending=rekeyPending;' + extra);
// the device as a sign-out finds it: the accounts on it (this page's first, then `more`), on disk too, and the kit's store handed
// to the stand-ins. Returns every write, from here on, of this account's removal record (its stage and how many chats it files,
// or 'done') and of its marks
export const device = (A, more = []) => { A.spy.store = A.store; A.S.ids = [A.S.me, ...more]; A.ls.set('hush:ids', A.S.ids); const set = A.ls.set, seen = { rec: [], marks: [] };
  A.ls.set = (k, v) => { if (k === 'hush:rekey:' + A.handle) seen.rec.push(v && v.stage ? v.stage + ':' + (v.rotated || []).length : v && v.done ? 'done' : String(v)); if (k === KEY + A.handle) seen.marks.push(Object.keys(v || {})); return set(k, v); };
  return seen; };
// what the store still holds under this username (ownedBy's rule, as forgetAccountData reads it)
export const ownedIn = (A, h = A.handle) => [...A.store.keys()].filter((k) => k === 'hush:ks:' + h || k.endsWith(':' + h) || k.includes(':' + h + ':')).sort();
// A REAL refusal, made by the server: the first time A's page asks its adapter for `name`, a second client holding the account's
// new keys replaces them once more (kv + 1). The server closes A's connection (4401) and refuses the reconnect's sign-in; then
// the call goes on, and meets "sign in first". `log`: what happened, in order
export const replaceAt = (w, A, name, log = []) => { const real = A.S.db[name]; let done = false;
  A.S.db[name] = async (...a) => {
    if (!done) { done = true; const id = { ...A.S.me }; delete id.handle; delete id.prev;
      const A2 = await w.page(A.handle, { id, owner: true }); await newKeys(A2); log.push('kv now ' + A2.S.me.kv);
      await until(() => A.S.db.online && A.S.db.identityError, 20000);
      log.push('page came back: ' + (A.S.db.identityError || {}).code + ' / ' + (A.S.db.identityError || {}).message + ', signed in: ' + !!A.S.db.proven); }
    try { const r = await real(...a); log.push(name + ':ok'); return r; } catch (e) { log.push(name + ':' + e.code); throw e; } };
  return log; };
// every sign-in the page asks its adapter for (not the sign-out before it), and how it ended
export const proofsOf = (A) => { const pv = A.S.db.prove, proofs = []; A.S.db.prove = (idn) => (idn ? pv(idn).then((x) => { proofs.push('ok'); return x; }, (e) => { proofs.push(e.code + ':' + e.message); throw e; }) : pv(idn)); return proofs; };

// ---- the fix round of 2026-11-13 ----
// The write stage's own `lost` branch of rekeyRun, reached in the kit. What that branch stands on and the kit's page lacks:
// saveSecrets (the kit's store is written at once) and rekeyCaches (the page's caches; the kit clears the two it has).
// signWith is the page's own line. signedOutHere is handed out too, so a test can call it as written.
export const lostBuild = (extra = '') => outBuild('const saveSecrets=async()=>{},rekeyCaches=()=>{S.keys.clear();S.chanKeys.clear()};\n' + cut('const signWith=', '\n') + '\nspy.signedOutHere=signedOutHere;' + extra);
// A removal that made its new keys on this device and was cut before its profile write (stage 'write', the record kept), and a
// second holder of the OLD keys that replaces the account's keys meanwhile. The server then knows neither this device's new
// keys nor its old ones: the write stage's `lost`, by the server's own answers. Call device() first. Returns the record to go on from
export async function lostAtWrite(w, A) {
  const id = { ...A.S.me }; delete id.handle;
  const A2 = await w.page(A.handle, { id, owner: true });
  if (!A.S.me.dev) A.S.me.dev = {};   // the kit's pages carry no device key; the branch puts the fields of the device's entry back
  const rec = { stage: 'write', name: 'Old phone', myName: 'This phone', trust: [], dev: {}, rotated: [], chats: [] };
  await A.rekeyIdentity(A.S.me); A.ls.set('hush:ids', A.S.ids);   // as the keys stage leaves them: on this device, on disk, not at the server
  await newKeys(A2);
  await until(() => A.S.db.online && A.S.db.identityError, 20000);
  return rec;
}
// F1: a sign-in refused for good in the chats stage that is NO key change this device can see. The run stops like any other
// whose record has a stage: the stop sentence with the refusal's own words in the brackets, the record as it was (its stage,
// no chat filed, never ended), the page still in its removal, no sign-out, no reload, the account still on the device, and
// the next start goes on with the removal. `seen` is device()'s
export async function kept(A, r, seen, why) {
  assert.deepEqual(r.fails, [STOPPED(why)], 'the stop sentence, with the refusal\'s own words in the brackets'); assert.ok(!A.S.db.error, 'and no adapter error stands (with the out-of-date error the brackets say that instead: F6)');
  assert.equal(r.stored.stage, 'rotate', 'the record is kept, with its stage'); assert.deepEqual(r.stored.rotated, []); assert.deepEqual(seen.rec.filter((x) => x !== 'rotate:0'), [], 'and was never ended');
  assert.deepEqual(seen.marks, [], 'no mark'); assert.equal(A.S.rekeying, true, 'as after any run that stopped: the page is still in its removal');
  await new Promise((res) => setTimeout(res, 400));
  assert.deepEqual(A.spy.out, [], 'no sign-out and no reload'); assert.deepEqual(A.spy.toasts, []);
  assert.equal(A.S.me.handle, A.handle); assert.deepEqual(A.S.ids.map((x) => x.handle), [A.handle], 'the account is still on the device'); assert.deepEqual(A.ls.get('hush:ids', []).map((x) => x.handle), [A.handle]);
  assert.equal(A.spy.rekeyPending(A.ls.get('hush:rekey:' + A.handle, null)), true, 'the next start goes on with the removal');
}
// F3: the removal's sheet as the page makes it. The page's own el, html, sheet and rekeySheet run as written (lifted from the
// page's code) over a stand-in for the document, fakeDoc(): nodes that keep their children, text, style and click handler. A
// node is in the page while it hangs under the body; a sheet is one child of the body. Hand the document to the page as
// spy.doc, then spy.sheetOf(title) is the page's rekeySheet(title). The page's back-button stack (NAV) and its icons are left out
export const SHEET = 'spy.sheetOf=title=>{const document=spy.doc,NAV={open(){},closed(){}},I={x:""};\n' + cut('function el(', '\n') + '\n' + cut('function html(', '\n') + '\n'
  + cut('function sheet(title,opt={}){', 'function emptyPeople(') + cut('function rekeySheet(', 'function rekeyPassword(') + 'return rekeySheet(title)};';
export const fakeDoc = () => {
  const node = (tag) => { const n = { tag, className: '', textContent: '', hidden: false, style: {}, children: [], parent: null,
    append(...a) { for (const c of a) { c.parent = n; n.children.push(c); } }, replaceChildren(...a) { for (const c of n.children) c.parent = null; n.children = []; n.append(...a); },
    remove() { if (n.parent) { n.parent.children = n.parent.children.filter((c) => c !== n); n.parent = null; } }, setAttribute() {},
    get isConnected() { let p = n; while (p.parent) p = p.parent; return p === doc.body; } }; return n; };
  const doc = { createElement: node, addEventListener() {}, removeEventListener() {} }; doc.body = node('body'); return doc; };
// what the page shows: how many sheets hang under the body, every text in them, and the buttons that can be tapped
export const shown = (doc) => { const out = { sheets: doc.body.children.length, text: [], buttons: [] };
  const walk = (n) => { if (n.textContent) out.text.push(n.textContent); if (n.tag === 'button' && n.onclick) out.buttons.push(n); n.children.forEach(walk); }; walk(doc.body); return out; };
// A server put back from an older backup, for one profile: the row as the server's own store holds it now; back() writes it
// back as it was (and says how many rows it wrote)
export const profileRow = (w, h) => { const db = w.T.srv.store.db, p = 'directory/' + h, d = db.prepare('SELECT d FROM docs WHERE path = ?').get(p).d; return { back: () => Number(db.prepare('UPDATE docs SET d = ? WHERE path = ?').run(d, p).changes) }; };
