// Message requests and invitations end to end, on the real server (release 108, SPEC.md 5.6 and 6). The kit of the channel
// history tests (the whole of app/crypto.js, the adapter, the server on a port of its own) widened by the page's own
// ensureDmDoc, sendBody, ensureInbox, the note rule and the chat watch, as written; the notes are sealed for real and reach
// the mailbox through POST /drop. What a stub decides in requests-receiver, requests-sender and invite-hold.test.js is decided
// here by the real thing: an honest first message to a person who asks for requests first, with that person's app closed
// (twenty times) and open; an honest sender whose copy of the profile is old; a group add from a stranger and from a friend (both wait for Join).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lift, mkBuild, world, makeChannel } from './channel-history-kit.js';

// The real functions, in a scope of their own so that they replace the kit's stand-ins (awaitingAccept, ensureDmDoc, ensureInbox, isSelf).
const REAL = `
env.dropPointer=dropPointer;
function hushServerUrl(){return S.serverUrl}
${lift('const dmInfo=', 'const reqTo=')}
${lift('const powZeros=', '/* ===== HUSH DROP END ===== */')}
S.real=(()=>{
const hiddenConv=()=>false,adminGone=()=>{},noKeyNotice=()=>{},codeWait=()=>false,codeWaitEnd=()=>{};
${lift('const isSelf=', '\n')}
${lift('const reqTo=', 'async function answerRequest(')}
${lift('async function ensureDmDoc(', 'const liveQ=')}
${lift('async function sendBody(', '\nasync function sendNowScheduled(')}
${lift('async function noteOk(', '/* Blocking, kept in the encrypted vault')}
${lift('const isBlocked=', '\n')}
${lift('async function ensureInbox(', '/* ===== HUSH INBOX RULE BEGIN ===== */')}
${lift('function pointerVerdict(', '\n')}
${lift('const heldKey=', '\n')}
${lift('const joinedPublic=', '\n')}
${lift('function watchInbox(', '/* ---------- voice calls (SPEC.md 16.2)')}
return {dmIdFor,dmInfo,setDmInfo,isRequest,awaitingAccept,sendBody,ensureInbox,watchInbox,dropPointer};
})();`;
// the kit's stand-in for dmPeer answers nobody, and app/crypto.js asks it for a one-on-one chat's key: the page's own line instead
const built = mkBuild(REAL), DMPEER = new Function('S', lift('const dmPeer=', '\n') + '\nreturn dmPeer;');
const build = (env) => { env.dmPeer = DMPEER(env.S); return built(env); };
const LIMITS = { dropsPerHourPerAddr: 1000, dropsPerHourPerRecipient: 1000, queriesPerMin: 100000, framesPerMin: 100000, dropPowBits: 8, signupPowBits: 8 };   // one address leaves forty notes here, and the test asks for the mailbox many times a second; a new account, and a note for a person who asks for requests first, each cost proof of work, kept but cheap (as drops.test.js keeps it), so a busy machine does not run the twenty trials out of time

const until = async (what, fn, ms = 8000) => { for (const t0 = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) assert.fail('waited too long for: ' + what); await new Promise((r) => setTimeout(r, 25)); } };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const watches = [];
const run = (fn) => world({ limits: LIMITS }, async (w) => { try { await fn(w); } finally { for (const st of watches.splice(0)) st.stop(); } });
// A page as the kit makes it, with what the request code reads: the vault's one-on-one entries, the settings read, no chat open.
async function person(w, handle, { requests = false, dms = {} } = {}) {
  const p = await w.page(handle, { build });
  Object.assign(p.S, { serverUrl: w.T.url, prefs: { dms: { ...dms }, blocked: [] }, contactsReady: true, vaultOk: true, posts: [], chan: null });
  if (requests) await p.S.db.doc('directory/' + handle).update({ requests: true });
  return p;
}
// The chat watch, as the page starts it after sign-in; stopped by its own return value (also when a test fails: its timer would keep the file alive).
function watch(p) {
  const st = { list: [], passes: 0 };
  st.stop = p.S.real.watchInbox({ handle: p.handle }, (l) => { st.list = l; p.S.convs = l; st.passes++; });
  watches.push(st); return st;
}
const inbox = async (p) => (await p.S.db.collection('inbox/' + p.handle + '/c').limit(500).get()).docs;
// A first message, as the page sends one: the chat opened from a profile (a preview, not yet in the list), then the composer.
async function firstMessage(a, to, body = 'hello') {
  await a.loadDir([to], true);
  const cid = await a.S.real.dmIdFor(to);
  a.S.previews.set(cid, { id: cid, type: 'dm', members: [a.handle, to], ts: 0, last: null, epoch: 0 });
  await a.S.real.sendBody(cid, body);
  return cid;
}

test('an honest first message to a person who asks for requests first, that person\'s app closed until both notes are in the mailbox: a request, twenty times', { timeout: 110000 }, async () => {
  await run(async (w) => {
    const bob = await person(w, 'bob', { requests: true });
    for (let i = 0; i < 20; i++) {
      const a = await person(w, 'sender' + i);
      const before = (await inbox(bob)).length;
      const cid = await firstMessage(a, 'bob');
      assert.deepEqual(a.S.real.dmInfo(cid), { peer: 'bob', req: 'out' }, 'the sender waits for the answer');
      await until('both notes in the mailbox', async () => (await inbox(bob)).length >= before + 2);
      const st = watch(bob);   // the app is opened now
      const c = await until('the chat in the list', () => st.list.find((x) => x.id === cid));
      await pause(60);
      assert.deepEqual([bob.S.real.dmInfo(cid), bob.S.real.isRequest(c)], [{ peer: 'sender' + i, req: 'in' }, true], 'trial ' + (i + 1));
      st.stop(); a.close();
    }
  });
});

test('the same with the app open while the notes arrive, and from a sender whose copy of the profile is old (both notes say dm): a request', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const bob = await person(w, 'bob', { requests: true }), st = watch(bob);
    await until('the first pass', () => st.passes > 0);
    const a = await person(w, 'alice');
    const cid = await firstMessage(a, 'bob');
    const c = await until('the chat in the list', () => st.list.find((x) => x.id === cid));
    await until('both notes read', async () => (await inbox(bob)).length >= 1 && st.passes >= 3);
    assert.deepEqual([bob.S.real.dmInfo(cid), bob.S.real.isRequest(c)], [{ peer: 'alice', req: 'in' }, true]);
    st.stop();
    // carol read bob's profile before he turned the setting on, so her page tags nothing as a request
    const carol = await person(w, 'carol'); await carol.loadDir(['bob'], true); carol.S.dir.bob = { ...carol.S.dir.bob, requests: false };
    const cid2 = await carol.S.real.dmIdFor('bob');
    carol.S.previews.set(cid2, { id: cid2, type: 'dm', members: ['carol', 'bob'], ts: 0, last: null, epoch: 0 });
    await carol.S.real.sendBody(cid2, 'hi bob');
    assert.deepEqual(carol.S.real.dmInfo(cid2), { peer: 'bob' }, 'her page thinks it is a normal chat');
    await until('carol\'s notes in the mailbox', async () => (await inbox(bob)).length >= 3);
    const st2 = watch(bob);
    const c2 = await until('carol\'s chat in the list', () => st2.list.find((x) => x.id === cid2));
    assert.deepEqual([bob.S.real.dmInfo(cid2), bob.S.real.isRequest(c2)], [{ peer: 'carol', req: 'in' }, true], 'bob\'s own page decides');
    st2.stop();
  });
});

test('guard: with the setting off a first message is a normal chat, as before', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const bob = await person(w, 'bob'), a = await person(w, 'alice');
    const cid = await firstMessage(a, 'bob');
    await until('both notes in the mailbox', async () => (await inbox(bob)).length >= 2);
    const st = watch(bob);
    const c = await until('the chat in the list', () => st.list.find((x) => x.id === cid));
    await pause(60);
    assert.deepEqual([bob.S.real.dmInfo(cid), bob.S.real.isRequest(c)], [{ peer: 'alice' }, false]);
    st.stop();
  });
});

test('a group add from a person I never chatted with is held until my own note says Join, and so is one from a friend', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const G1 = 'g' + w.cid.slice(1), G2 = 'g' + w.cid.slice(2) + 'x';
    const zed = await person(w, 'zed99'), carol = await person(w, 'carol');
    const bob = await person(w, 'bob');
    await bob.loadDir(['carol'], true); bob.S.prefs.dms[await bob.S.real.dmIdFor('carol')] = { peer: 'carol' };   // an accepted chat with carol, as the vault holds it
    // each makes a private group with bob in it (a key wrapped for him) and leaves him the invitation, as Add does
    for (const [p, cid] of [[zed, G1], [carol, G2]]) { const c = await makeChannel(p, cid, [p.handle, 'bob'], [], 'group'); await p.S.real.ensureInbox(Object.assign({}, c, { members: [p.handle, 'bob'] }), ['bob'], true); }
    await until('both invitations in the mailbox', async () => (await inbox(bob)).length >= 2);
    const st = watch(bob);
    const held = () => (bob.S.invites || []).map((v) => v.cid + ' ' + v.from).sort();
    await until('both invitations held', () => held().length === 2);
    await pause(150);
    assert.deepEqual(st.list.map((x) => x.id), [], 'neither group is in the list, the friend\'s as little as the stranger\'s');
    assert.deepEqual(held(), [G1 + ' zed99', G2 + ' carol'].sort(), 'both are held, each under its inviter\'s proven name');
    // Join: my own note for the chat, written over my own connection; one after the other
    await bob.S.real.dropPointer('bob', { t: 'invite', cid: G2, from: 'bob', type: 'group' });
    await until('the friend\'s group in the list', () => st.list.find((x) => x.id === G2));
    assert.deepEqual([st.list.map((x) => x.id), held()], [[G2], [G1 + ' zed99']], 'the other one still waits');
    await bob.S.real.dropPointer('bob', { t: 'invite', cid: G1, from: 'bob', type: 'group' });
    await until('the stranger\'s group in the list', () => st.list.find((x) => x.id === G1));
    assert.deepEqual(held(), []);
    st.stop();
  });
});
