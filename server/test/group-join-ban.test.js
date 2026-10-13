// A banned person can't come back by link (SPEC.md 5.6): `chat.invite` and `chat.join` refuse a username on the chat's
// ban list with `banned`, before any key history or wrap changes hands, and the refusal is not a wrong link. The page
// can't check this itself (the preview it reads before joining has no sealed `meta`), so it shows the server's answer.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import WebSocket from 'ws';

import { startServer, signup, connectAs, makeIdentity, signText, directoryDoc, label, wrap, groupDoc, channelDoc, createChat, appSource } from './helpers.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const PROOF = 'proof-' + 'x'.repeat(40), PROOF2 = 'proof-' + 'z'.repeat(40), WRONG = 'wrong-' + 'y'.repeat(40);
const invite = (proof) => ({ iv: 'aXY=', ct: 'Y3Q=', ph: sha(proof), ts: Date.now() });
const join = (c, cid, iid, proof, mine = label()) => c.call('chat.join', { cid, iid, proof, wraps: { 0: { [mine]: wrap() } } });
const keysOf = async (c, cid) => (await c.ok('get', { p: `channels/${cid}` })).d.keys;

let S, A, B, C;
before(async () => {
  S = await startServer({ authz: 'standard', limits: { invitesPerMinPerAddr: 1000 } });
  const [alice, bob, carol] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('carol')]);
  A = await signup(S.url, alice); B = await signup(S.url, bob); C = await signup(S.url, carol);
});
after(async () => { await A.close(); await B.close(); await C.close(); await S.stop(); });

test('a banned person with a valid link is refused at chat.invite and chat.join, and no wrap is added; an unban lets the same link work', async () => {
  const G = 'gBanJoin00001';
  const { caps } = await createChat(A, G, groupDoc());
  await A.ok('update', { p: `channels/${G}`, d: { invites: { iNvItE000001: invite(PROOF) } } });
  await A.ok('chat.ban', { cid: G, h: 'bob', on: true });
  const keys = await keysOf(A, G);
  assert.equal((await B.call('chat.invite', { cid: G, iid: 'iNvItE000001' })).e, 'banned', 'no key history for a banned person');
  assert.equal((await join(B, G, 'iNvItE000001', PROOF)).e, 'banned', 'a valid proof does not help');
  assert.equal((await join(B, G, 'iNvItE000001', WRONG)).e, 'denied', 'a wrong proof is still a wrong link');
  assert.equal((await B.call('chat.invite', { cid: G, iid: 'nOpE00000001' })).e, 'banned', 'a link from before the block (gone with its key change) says so too');
  assert.equal((await A.call('chat.invite', { cid: G, iid: 'nOpE00000001' })).e, 'notfound', 'for anyone else a missing invite is still missing');
  await A.ok('update', { p: `channels/${G}`, d: { invites: { iNvItE000002: invite(PROOF2) } } });
  assert.equal((await B.call('chat.invite', { cid: G, iid: 'iNvItE000002' })).e, 'banned', 'a new link does not help either');
  assert.equal((await join(B, G, 'iNvItE000002', PROOF2)).e, 'banned');
  assert.deepEqual(await keysOf(A, G), keys, 'no wrap was added');

  await A.ok('chat.ban', { cid: G, h: 'bob', on: false });
  assert.deepEqual(await B.ok('chat.invite', { cid: G, iid: 'iNvItE000001' }).then((r) => [r.iv, r.ct]), ['aXY=', 'Y3Q=']);
  const mine = label();
  assert.equal((await join(B, G, 'iNvItE000001', PROOF, mine)).ok, true, 'after the unban the same link works');
  assert.ok((await keysOf(A, G))[0][mine]);
  assert.equal((await B.ok('chat.open', { cid: G, cap: caps.m })).level, 'member');
});

test('someone who is not banned joins as before; a ban is per chat; channels refuse a banned person too', async () => {
  const CH = 'cBanJoin00001', G2 = 'gBanJoin00002';
  await createChat(A, CH, channelDoc());
  await createChat(A, G2, groupDoc());
  for (const cid of [CH, G2]) await A.ok('update', { p: `channels/${cid}`, d: { invites: { iNvItE000001: invite(PROOF) } } });
  await A.ok('chat.ban', { cid: CH, h: 'bob', on: true });
  assert.equal((await B.call('chat.invite', { cid: CH, iid: 'iNvItE000001' })).e, 'banned');
  assert.equal((await join(B, CH, 'iNvItE000001', PROOF)).e, 'banned');
  await C.ok('chat.invite', { cid: CH, iid: 'iNvItE000001' });
  assert.equal((await join(C, CH, 'iNvItE000001', PROOF)).ok, true, 'carol is not banned');
  await B.ok('chat.invite', { cid: G2, iid: 'iNvItE000001' });
  assert.equal((await join(B, G2, 'iNvItE000001', PROOF)).ok, true, 'a ban in one chat says nothing about another');
});

test('banned refusals do not use up the wrong-link allowance', async () => {
  const S2 = await startServer({ authz: 'standard', limits: { openFailsPerMin: 2, invitesPerMinPerAddr: 1000 } });
  const [alice, bob] = await Promise.all([makeIdentity('alice'), makeIdentity('bob')]);
  const A2 = await signup(S2.url, alice), B2 = await signup(S2.url, bob);
  try {
    const G = 'gBanJoin00003';
    await createChat(A2, G, groupDoc());
    await A2.ok('update', { p: `channels/${G}`, d: { invites: { iNvItE000001: invite(PROOF) } } });
    await A2.ok('chat.ban', { cid: G, h: 'bob', on: true });
    for (let i = 0; i < 5; i++) {
      assert.equal((await B2.call('chat.invite', { cid: G, iid: 'iNvItE000001' })).e, 'banned');
      assert.equal((await join(B2, G, 'iNvItE000001', PROOF)).e, 'banned');
    }
    assert.equal((await join(B2, G, 'iNvItE000001', WRONG)).e, 'denied', 'the allowance is untouched');
    assert.equal((await join(B2, G, 'iNvItE000001', WRONG)).e, 'denied');
    assert.equal((await join(B2, G, 'iNvItE000001', WRONG)).e, 'ratelimit', 'two wrong links do use it up');
  } finally { await A2.close(); await B2.close(); await S2.stop(); }
});

// ---- the page: handleJoin and the join sheet, lifted from the app and run with the page's adapter ----
const html = appSource();
function lift(from, to) {
  const a = html.indexOf(from); assert.ok(a > 0, `the page's files contain ${JSON.stringify(from)}`);
  const b = html.indexOf(to, a + from.length); assert.ok(b > a, `the page's files contain ${JSON.stringify(to)}`);
  return html.slice(a, b);
}
const createHushAdapter = new Function(lift('/* ===== HUSH ADAPTER BEGIN ===== */', '/* ===== HUSH ADAPTER END ===== */') + '\nreturn createHushAdapter;')();
const JOIN_CODE = [
  lift('const typeOf=', '\n'),
  lift('async function freshChan(cid){', '\n'),
  lift('function parseJoin(s){', 'async function joinPublic('),   // parseJoin, inviteRaws, handleJoin, joinPrivate
  lift('function confirmJoin(c,j){', 'function segControl('),
].join('\n');
const STUBS = ['S', 'toast', 'toastErr', 'convById', 'showMeta', 'openConv', 'openDm', 'sheet', 'el', 'convAvatar', 'memberText', 'subsText'];
const page = (env) => new Function('env', `const {${STUBS.join(',')}}=env;\n${JOIN_CODE}\nreturn {handleJoin,confirmJoin};`)(env);

test('the page says "You were removed" for a banned answer, in handleJoin and in the join sheet, and "revoked" for a missing invite', async () => {
  const S3 = await startServer({ authz: 'standard', limits: { invitesPerMinPerAddr: 1000 } });
  const [alice, bob] = await Promise.all([makeIdentity('alice'), makeIdentity('bob')]);
  const A3 = await signup(S3.url, alice);
  const db = createHushAdapter(S3.url, { WebSocket, onStatus: () => {} });
  try {
    await db.ready;
    await db.prove({ h: 'bob', pub: bob.sig, dev: '', signDev: null, signAcct: (m) => signText(bob.sigKey, m) });
    await db.doc('directory/bob').set(directoryDoc(bob));
    const G = 'gBanJoin00004', CH = 'cBanJoin00004';
    await createChat(A3, G, groupDoc()); await createChat(A3, CH, channelDoc());
    for (const cid of [G, CH]) {
      await A3.ok('update', { p: `channels/${cid}`, d: { invites: { iNvItE000001: invite(PROOF) } } });
      await A3.ok('chat.ban', { cid, h: 'bob', on: true });
    }
    const toasts = [], els = [];
    let sheets = 0;
    const env = {
      S: { db, me: { handle: 'bob' }, dir: {}, previews: new Map(), convs: [] },
      toast: (m) => toasts.push(m), toastErr: (m) => toasts.push(m), convById: () => null, showMeta: async (c) => c,
      openConv: () => assert.fail('nothing opens'), openDm: () => assert.fail('not a contact link'),
      sheet: () => { sheets++; return { body: { append() {} }, close() {} }; },
      el: (tag, cls, text) => { const e = { tag, cls, textContent: text || '', disabled: false, append() {} }; els.push(e); return e; },
      convAvatar: () => ({}), memberText: () => '', subsText: () => '',
    };
    const { handleJoin, confirmJoin } = page(env);
    const link = (cid, iid = 'iNvItE000001') => `#join=${cid}.${iid}.${'s'.repeat(22)}`;   // location.hash, as the page passes it

    assert.equal(await handleJoin(link(G)), false);
    assert.deepEqual(toasts.splice(0), ['You were removed from this group.']);
    assert.equal(await handleJoin(link(CH)), false);
    assert.deepEqual(toasts.splice(0), ['You were removed from this channel.']);
    assert.equal(sheets, 0, 'no join sheet for a banned person');

    // The join sheet (open while the ban landed): its Join button shows the server's answer.
    const press = async (shown, j) => {
      els.length = 0; confirmJoin(shown, j);
      const go = els.find((e) => e.tag === 'button'), err = els.find((e) => e.cls === 'err');
      await go.onclick();
      assert.equal(go.disabled, false, 'the button comes back');
      return err.textContent;
    };
    const j = (cid, iid = 'iNvItE000001') => ({ cid, iid, secret: 's'.repeat(22) });
    assert.equal(await press({ id: G, type: 'group', name: 'G' }, j(G)), 'You were removed from this group.');
    assert.equal(await press({ id: CH, type: 'channel', name: 'C' }, j(CH)), 'You were removed from this channel.');
    await A3.ok('chat.ban', { cid: G, h: 'bob', on: false });
    assert.equal(await press({ id: G, type: 'group', name: 'G' }, j(G, 'nOpE00000001')), 'This invite link was revoked. Ask for a new one.');
    assert.deepEqual(toasts, []);
  } finally { db.close(); await A3.close(); await S3.stop(); }
});

test('a link is for an account that exists: a sign-up proof for an unused name gets no key history and cannot join', async () => {
  const G = 'gBanJoin00009';
  await createChat(A, G, groupDoc());
  await A.ok('update', { p: `channels/${G}`, d: { invites: { iNvItE000001: invite(PROOF) } } });
  const ghost = await connectAs(S.url, await makeIdentity('ghost_user'), { pub: true });   // proved as a free name, no account made
  try {
    assert.equal((await ghost.call('chat.invite', { cid: G, iid: 'iNvItE000001' })).e, 'unauth', 'no key history');
    assert.equal((await join(ghost, G, 'iNvItE000001', PROOF)).e, 'unauth', 'no wraps: a throwaway name would get round any block');
    assert.equal((await C.ok('chat.invite', { cid: G, iid: 'iNvItE000001' })).ct, 'Y3Q=', 'an account that exists still may');
  } finally { await ghost.close(); }
});
