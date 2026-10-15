// Delete my account (release 31), the page side, lifted out of app/ui.js, app/adapter.js and app/crypto.js.
// Settings > Advanced ends with a red Delete account row. The password (or recovery words) is checked on the device and
// must open this account as it is now. The run deletes owned groups and channels before the account itself, and wipes
// this device's copy only once the server has deleted it. Other devices hear of it by close code 4410 or a sign-in
// refused as 'gone'. A deleted account shows as "Deleted account", and nothing is encrypted to it any more.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { appSource } from './helpers.js';

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const crypto_ = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
const line = (re, s = src) => { const m = s.match(re); assert.ok(m, String(re)); return m[0]; };
const between = (from, to, s = src) => { const a = s.indexOf(from), b = s.indexOf(to, a); assert.ok(a > 0 && b > a, from); return s.slice(a, b); };

// ---- the row ----
test('Settings > Advanced ends with the red Delete account row', () => {
  const el = (tag, cls, text) => ({ tag, cls, text, kids: [], append(...k) { this.kids.push(...k); } });
  const html = (tag, cls, inner) => Object.assign(el(tag, cls), { inner });
  const openDeleteAccount = () => {};
  const run = new Function('el', 'html', 'I', 'hasRecovery', 'recOld', 'backupOn', 'lsPw', 'lockCfg', 'ls', 'openDeleteAccount', 'openHow', 'openBackup', 'openRestore', 'openAppLock',
    between('function settingsAdvanced(body,me){', 'function openHow(') + '\nreturn settingsAdvanced;')(
    el, html, new Proxy({}, { get: () => '<svg/>' }), () => true, () => false, () => true, () => null, () => null, { get: () => false }, openDeleteAccount, () => {}, () => {}, () => {}, () => {});
  const body = el('div');
  run(body, { handle: 'alice' });
  const last = body.kids.at(-1);
  assert.equal(last.cls, 'menu-item danger flush');
  assert.match(last.inner, /<span>Delete account<\/span>$/);
  assert.equal(last.onclick, openDeleteAccount);
});

// ---- the confirm step and the run ----
const BEGIN = '/* ===== HUSH DELETE ACCOUNT BEGIN ===== */', END = '/* ===== HUSH DELETE ACCOUNT END ===== */';
const DEPS = ['S', 'ls', 'loginInfo', 'openLoginBox', 'readWords', 'openRecovery', 'lastRecLoc', 'normLogin', 'chatsOf', 'pause', 'leaveChat', 'loginsOf',
  'loginSecrets', 'dropLoginBox', 'recLocal', 'backupPath', 'phoneHash', 'vaultPath', 'proofFor', 'start', 'accountGone', 'setTimeout'];
const lift = new Function(...DEPS, between(BEGIN, END) + '\nreturn {deleteProof,deleteAccountRun};');
const ME = { handle: 'alice', sig: { x: 'X1', y: 'Y1' } };
const normLogin = new Function(line(/^function normLogin\(s\)\{[^\n]*\n[^\n]*\n/m, crypto_) + 'return normLogin;')();

function page(o = {}) {
  const log = [], store = new Map();
  const S = { me: ME, previews: new Map(), prefs: { rec: { loc: 'RECV' } },
    db: { doc: (p) => ({ delete: async () => { log.push('delete ' + p); if (o.failChat && p === 'channels/g1') throw Object.assign(new Error('x'), { code: 'offline' }); },
        get: async () => ({ exists: true, data: () => (o.dirGone ? { gone: 1 } : {}) }) }),
      preview: async (cid) => ({ exists: !!o.chatStays }),
      prove: async (p) => { log.push(p ? 'prove ' + (p.dev === '' && p.signDev === null ? 'account' : 'device') : 'prove null'); },
      deleteAccount: async (a) => { log.push('account.delete ' + JSON.stringify(a)); if (o.deleteErr) throw o.deleteErr; } } };
  const ls = { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => { store.set(k, v); log.push('ls ' + k); } };
  const fns = lift(S, ls,
    () => ({ login: 'alice', loc: 'L1', all: { alice: 'L1', 'a@x.io': 'L2' } }),
    async (login, pw) => { if (o.ratelimit) throw Object.assign(new Error('too many wrong passwords'), { code: 'ratelimit' });
      if (pw !== 'right') throw new Error('nomatch'); return { id: o.boxId || ME, loc: 'L1' }; },
    (v) => v.split(' '), async () => o.recId || ME, 'RECLOC', normLogin,
    async () => [{ cid: 'g1', name: 'Mine', own: true }, { cid: 'g2', name: 'Theirs', own: false }],
    async () => {}, async (cid) => { log.push('leave ' + cid); }, () => ['alice', 'a@x.io'],
    async (l, pw) => ({ loc: 'PW:' + l }), async (l, x) => { log.push('drop ' + l + '|' + x); }, () => ({ loc: 'RECL', old: ['RECO'] }),
    async () => 'backup/bB', async () => 'PH', async () => 'vault/vVAULT', async (id) => ({ h: id.handle, dev: 'd1', signDev: () => {} }),
    () => { log.push('start'); }, async (h, sure) => { log.push('gone ' + h + ' ' + !!sure); }, () => 0);
  return { S, log, store, ...fns };
}

test('the confirm step refuses a wrong password, and a box that opens other keys than this account\'s', async () => {
  await assert.rejects(page().deleteProof('alice', 'pw', 'wrong'), (e) => e.message === 'nomatch');
  await assert.rejects(page({ boxId: { handle: 'alice', sig: { x: 'OLD', y: 'Y1' } } }).deleteProof('alice', 'pw', 'right'), (e) => e.message === 'stale');
  await assert.rejects(page({ boxId: { handle: 'bob', sig: ME.sig } }).deleteProof('alice', 'pw', 'right'), (e) => e.message === 'stale');
  await assert.rejects(page({ ratelimit: true }).deleteProof('alice', 'pw', 'right'), (e) => e.code === 'ratelimit' && /wrong passwords/.test(e.message));
  assert.deepEqual(await page().deleteProof('alice', 'pw', 'right'), { pw: 'right' });
  // recovery words: the same rule, and the box they opened is erased with the rest
  await assert.rejects(page({ recId: { handle: 'alice', sig: { x: 'OLD', y: 'Y1' } } }).deleteProof('alice', 'words', 'a b c'), (e) => e.message === 'stale');
  assert.deepEqual(await page().deleteProof('alice', 'words', 'a b c'), { recLoc: 'RECLOC' });
  // neither set up: the username, typed
  assert.deepEqual(await page().deleteProof('alice', 'name', ' @Alice '), {});
  await assert.rejects(page().deleteProof('alice', 'name', 'alicia'), (e) => e.message === 'nomatch');
});

test('the run deletes owned chats first, then the account with the account key, and wipes this device only after', async () => {
  const p = page();
  await p.deleteAccountRun('alice', { pw: 'right' }, () => {});
  const at = (s) => { const i = p.log.indexOf(s); assert.ok(i >= 0, s + ' in ' + p.log.join(', ')); return i; };
  assert.ok(at('leave g2') < at('ls hush:delacct:alice') && at('ls hush:delacct:alice') < at('drop alice|L1'), 'marked only just before the password boxes go: a run that fails earlier still asks for the password');
  assert.ok(at('delete channels/g1') < at('leave g2'));
  assert.ok(!p.log.includes('delete channels/g2'), 'a chat someone else owns is only left');
  for (const b of ['drop alice|L1', 'drop a@x.io|L2', 'drop alice|PW:alice', 'drop a@x.io|PW:a@x.io', 'delete accounts/RECL', 'delete accounts/RECO', 'delete accounts/RECV',
    'delete backup/bB', 'delete search/alice']) assert.ok(at(b) < at('account.delete {"vault":"vVAULT"}'), b);
  assert.ok(at('prove null') < at('prove account') && at('prove account') < at('account.delete {"vault":"vVAULT"}'), 'a fresh sign-in with the account key right before');
  assert.equal(at('gone alice true'), p.log.length - 1, 'this device forgets the account last');
  assert.equal(p.S.deleting, 'alice');
});

test('a must-step that fails stops the run with nothing on this device wiped', async () => {
  let p = page({ failChat: true, chatStays: true });
  await assert.rejects(p.deleteAccountRun('alice', {}, () => {}), (e) => e.chat === 'Mine');
  assert.ok(!p.log.some((s) => s.startsWith('account.delete') || s.startsWith('gone') || s.startsWith('leave')));
  p = page({ failChat: true, chatStays: false });
  await p.deleteAccountRun('alice', {}, () => {});
  assert.ok(p.log.includes('gone alice true'), 'an owned chat already gone (an earlier try) is skipped');
  p = page({ deleteErr: Object.assign(new Error('no'), { code: 'denied' }) });
  await assert.rejects(p.deleteAccountRun('alice', {}, () => {}), (e) => e.code === 'denied');
  assert.ok(!p.log.some((s) => s.startsWith('gone')));
  assert.equal(p.log.at(-1), 'start', 'signed in again with this device, its live views back');
  assert.equal(p.S.deleting, null);
  // the answer lost after the delete went through: 'gone', or the profile says so
  for (const o of [{ deleteErr: Object.assign(new Error('gone'), { code: 'gone' }) }, { deleteErr: Object.assign(new Error('x'), { code: 'offline' }), dirGone: true }]) {
    p = page(o);
    await p.deleteAccountRun('alice', {}, () => {});
    assert.equal(p.log.at(-1), 'gone alice true', JSON.stringify(o));
  }
});

// ---- other devices ----
test('accountGone wipes the account only once its profile says it is gone, and only once', async () => {
  const make = new Function('S', 'ls', 'closeConv', 'dropUnsealed', 'renderList', 'forgetAccountData', 'start', 'toast', 'updateTitle', 'showOnboard',
    between('const goneSeen=new Set();', '/* ---------- log out') + '\nreturn {accountGone,goneSeen};');
  const run = async (gone, sure) => {
    const log = [], S = { me: { handle: 'alice' }, ids: [{ handle: 'alice' }], db: { doc: () => ({ get: async () => ({ exists: true, data: () => (gone ? { handle: 'alice', gone: 1 } : { handle: 'alice' }) }) }), prove: (x) => log.push('prove ' + x) } };
    const ls = { get: () => null, set: () => {} };
    const f = make(S, ls, () => {}, () => log.push('drop'), () => {}, async (h) => log.push('forget ' + h), () => {}, () => {}, () => {}, (a, m) => log.push('onboard ' + m));
    await f.accountGone('alice', sure); await f.accountGone('alice', sure);
    return { log, S };
  };
  assert.deepEqual((await run(false)).log, [], 'a close code alone wipes nothing');
  const r = await run(true);
  assert.deepEqual(r.log, ['prove null', 'drop', 'forget alice', 'onboard This account was deleted.']);
  assert.equal(r.S.me, null);
  assert.deepEqual(r.S.ids, []);
  assert.deepEqual((await run(false, true)).log.at(-1), 'onboard Your account was deleted.');
});

test('the adapter hands close code 4410 (with who was signed in) and a sign-in refused as gone to the page, which calls accountGone', async () => {
  const B = '/* ===== HUSH ADAPTER BEGIN ===== */', E = '/* ===== HUSH ADAPTER END ===== */';
  const all = appSource(), a = all.indexOf(B), b = all.indexOf(E);
  const createHushAdapter = new Function(all.slice(a + B.length, b) + '\nreturn createHushAdapter;')();
  const sent = [];let sock = null, proveAnswer = { ok: true };
  class FakeWS {
    constructor() { sock = this; this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen(); }); }
    send(s) { const f = JSON.parse(s); sent.push(f);
      const r = f.op === 'hello' ? { ok: true, nonce: 'n', now: Date.now() } : f.op === 'prove' ? proveAnswer : { ok: true };
      setTimeout(() => this.onmessage({ data: JSON.stringify({ i: f.i, ...r }) })); }
    close() { this.readyState = 3; }
  }
  const events = [];
  const db = createHushAdapter('ws://x/ws', { WebSocket: FakeWS, caps: true, onClosed: (code, why, was) => events.push(['closed', code, was]), onGone: (h) => events.push(['gone', h]) });
  const idn = { h: 'alice', pub: { x: 'x', y: 'y' }, dev: '', signDev: null, signAcct: async () => 'sig' };
  try {
    await db.ready; await db.prove(idn);
    assert.deepEqual(await db.deleteAccount({ vault: 'vVAULT' }), { i: sent.at(-1).i, ok: true });
    const f = sent.at(-1);
    assert.equal(f.op, 'account.delete');
    assert.deepEqual(Object.keys(f).sort(), ['i', 'op', 'vault']);
    assert.equal(f.vault, 'vVAULT');
    proveAnswer = { ok: false, e: 'gone', m: 'this account was deleted' };
    sock.onclose({ code: 4410, reason: 'deleted' });
    assert.deepEqual(events[0], ['closed', 4410, 'alice']);
    for (let i = 0; i < 200 && !events.some((x) => x[0] === 'gone'); i++) await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(events.find((x) => x[0] === 'gone'), ['gone', 'alice']);
  } finally { db.close(); }
  const ad = readFileSync(new URL('../../app/adapter.js', import.meta.url), 'utf8');
  assert.match(ad, /onClosed:\(code,why,was\)=>\{if\(code===4401\)keysMovedOn\(\);if\(code===4410&&was\)accountGone\(was\)\}/);
  assert.match(ad, /onGone:h=>accountGone\(h\)/);
});

test('once gone is seen, nothing republishes the profile', () => {
  assert.match(between('async function refreshDir(force){', 'async function lookupHandle('), /if\(isGone\(S\.me\.handle\)\)\{accountGone\(S\.me\.handle\);return\}[^\n]*\n  const first=!S\.dirReady;/);
  assert.match(between('async function republishSelf(){', '(async()=>{'), /goneSeen\.has\(S\.me\.handle\)\)return;const m=S\.me,d=S\.dir\[m\.handle\];if\(d&&\(d\.gone\|\|/);
});

// ---- how a deleted account looks to others ----
test('a deleted account is "Deleted account" everywhere, even under a contact name; others keep their names', () => {
  const displayName = new Function('S', line(/^const isGone=.*$/m) + '\n' + line(/^const displayName=.*;$/m) + '\nreturn displayName;');
  const S = { cnames: new Map([['bob', 'Bobby'], ['dave', 'Dave (work)']]), dir: { bob: { handle: 'bob', name: 'Bob', gone: 1, ecdh: {}, sig: {} }, carol: { handle: 'carol', name: 'Carol' }, dave: { handle: 'dave', name: 'D' } } };
  const dn = displayName(S);
  assert.equal(dn('bob'), 'Deleted account');
  assert.equal(dn('carol'), 'Carol');
  assert.equal(dn('dave'), 'Dave (work)');
  assert.equal(dn('erin'), 'erin');
});

test('no new chat, search result or composer for a deleted account; its old DM opens read-only', () => {
  assert.match(line(/^function peopleIn\(q,exclude\).*$/m), /filter\(d=>!d\.gone&&/);
  assert.match(between('async function openDm(peer){', 'function openCreateGroup('), /if\(isGone\(peer\)&&!\(id&&convById\(id\)\)\)\{toastErr\('This account was deleted\.'\);return\}/);
  assert.match(between('function openConv(cid){', 'if(!S.db)return;'), /else if\(t==='dm'&&!isSelf\(c\)&&isGone\(dmPeer\(c\)\)\)p\.append\(el\('div','composer readonly'/);
  assert.match(between('async function openProfile(h){', 'const d=S.dir[h];'), /if\(isGone\(h\)\)\{[^\n]*\n[^\n]*This account was deleted\.[^\n]*return\}/);
});

test('chat keys are never wrapped to a deleted account', async () => {
  const make = new Function('S', 'keyChanged', 'peerKeys', 'verifiedDevs', 'wrapTo', 'rid22',
    line(/^const wrapSalt=.*;$/m, crypto_) + '\n' + between('async function wrapKey(', '\nasync function wrapAll', crypto_) + '\n' + line(/^async function wrapAll\(.*$/m, crypto_) + '\nreturn wrapAll;');
  let n = 0;
  const S = { me: { handle: 'alice' }, dir: { alice: {}, bob: {}, dead: { gone: 1 } } };
  const wrapAll = make(S, () => false, () => ({ ecdh: {} }), async () => [], async (raw, k, salt) => salt, () => 'w' + n++);
  const out = await wrapAll(new Uint8Array(32), ['alice', 'bob', 'dead'], 'g1', 0);
  const to = Object.values(out).map((s) => s.split('|')[3]).sort();
  assert.deepEqual(to, ['alice', 'bob']);
});
