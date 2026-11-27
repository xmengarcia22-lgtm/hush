// A stored key does not count as "I am in the chat" (release 108, finding F1; SPEC.md 5.6 and 6). An invitation into a chat I am
// not in waits for my Join. As first built, the chat watch also let an invitation in when this device held a key for the chat.
// But the inviter puts that key into the chat's record, wrapped for me, and the page stores it as soon as it reads the record
// (convKey): opening any link to the chat reads it, an incomplete link too, and one whose Join sheet is closed again, before or
// after the invitation came; Message backup then carries the key to my other devices. So the inviter and one link decided that I
// was "in", a person I blocked as well. invite-hold.test.js could not see it: its harness answers heldKey from a list.
// Here nothing is a stand-in for the key: the real server, the whole of app/crypto.js, the adapter with the page's own capsFor,
// and handleJoin, confirmJoin, joinPrivate, leaveChat, kickMember, addSubs, ensureInbox, the note rule, the chat watch and the
// Message requests sheet (its Join button) as written. Each test that states the rule first proves that the key really was
// stored. K9 starts on a page of release 106 (its chat watch as written at 1ed9955, fixtures/page106-inbox.txt).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { lift, mkBuild, world, makeChannel, linkOf } from './channel-history-kit.js';

const INBOX106 = readFileSync(new URL('./fixtures/page106-inbox.txt', import.meta.url), 'utf8');
// The real functions, in a scope of their own so that they replace the kit's stand-ins (as requests-e2e.test.js does).
const real = (inbox) => `
env.dropPointer=dropPointer;
function hushServerUrl(){return S.serverUrl}
function badBackupNotice(){}
${lift('async function backupStillOn(', '// Once per device')}
${lift('const dmInfo=', 'const reqTo=')}
${lift('const powZeros=', '/* ===== HUSH DROP END ===== */')}
S.real=(()=>{
const hiddenConv=()=>false,adminGone=()=>{},noKeyNotice=()=>{},codeWait=()=>false,codeWaitEnd=()=>{},userAvatar=()=>({}),updateTitle=()=>{};
const ownTried=new Set();
${lift('const isSelf=', '\n')}
${lift('const reqTo=', 'async function answerRequest(')}
${lift('async function noteOk(', '/* Blocking, kept in the encrypted vault')}
${lift('const isBlocked=', '\n')}
${lift('async function ensureInbox(', '/* ===== HUSH INBOX RULE BEGIN ===== */')}
${lift('function pointerVerdict(', '\n')}
${lift('const heldKey=', '\n')}
${lift('const joinedPublic=', '\n')}
${lift('async function capsFor(', 'function noteChatDoc(')}
${inbox || lift('function watchInbox(', '/* ---------- voice calls (SPEC.md 16.2)')}
${lift('const inviteLine=', '\n')}
${lift('function openRequests(', 'function showRequestAlert(')}
return {ensureInbox,watchInbox,dropPointer,capsFor,handleJoin,heldKey,openRequests,syncBackup};
})();`;
const DMPEER = new Function('S', lift('const dmPeer=', '\n') + '\nreturn dmPeer;');
const builder = (inbox) => { const built = mkBuild(real(inbox)); return (env) => { env.dmPeer = DMPEER(env.S); return built(env); }; };
const build = builder(), build106 = builder(INBOX106);
const LIMITS = { dropsPerHourPerAddr: 100000, dropsPerHourPerRecipient: 100000, queriesPerMin: 100000, framesPerMin: 100000, dropPowBits: 8, signupPowBits: 8 };

const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (what, fn, ms = 8000) => { for (const t0 = Date.now(); ;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) assert.fail('waited too long for: ' + what); await pause(25); } };
const watches = [];
// One server per test; `w.clock.skew` moves the server's hour and every page's clock together (a note is stamped with the hour).
const run = (fn) => { const clock = { skew: 0 };
  return world({ limits: LIMITS, now: () => Date.now() + clock.skew }, async (w) => { w.clock = clock; w.G = 'g' + w.cid.slice(1); try { await fn(w); } finally { for (const st of watches.splice(0)) st.stop(); } }); };
// A page with what the chat watch reads: the settings read, the vault's entries, and the adapter asking the page's own capsFor
// (app/ui.js: caps:cid=>capsFor(cid)), which is the door a record's key comes in by.
async function person(w, handle, o = {}) {
  const p = await w.page(handle, { build: o.old ? build106 : build, clock: w.clock, ...(o.id ? { id: o.id } : {}), ...(o.store ? { store: o.store } : {}) });
  Object.assign(p.S, { serverUrl: w.T.url, prefs: o.prefs || { dms: {}, blocked: [] }, contactsReady: true, vaultOk: true, posts: [], chan: null });
  p.spy.capsFor = p.S.real.capsFor;
  return p;
}
const device = (w, p) => person(w, p.handle, { id: p.id, prefs: JSON.parse(JSON.stringify(p.S.prefs)) });   // another device of the same account: its own sealed store
function watch(p) {
  const st = { list: [], passes: 0, p };
  st.stop = p.S.real.watchInbox({ handle: p.handle }, (l) => { st.list = l; p.S.convs = l; st.passes++; });
  watches.push(st); return st;
}
const REST = 700;   // long enough for a chat that is let in to show and for the page to write its own note (a few local round trips)
// The page is closed and opened again: the same account, the same sealed store (the stored keys with it), a fresh chat watch.
async function reload(w, st, o = {}) {
  st.stop(); st.p.close();
  const p = await person(w, st.p.handle, { id: st.p.id, store: st.p.store, prefs: st.p.S.prefs, ...o }), s2 = watch(p);
  await until('the first pass after the reload', () => s2.passes > 0); await pause(REST);
  return [p, s2];
}
const inbox = async (p) => (await p.S.db.collection('inbox/' + p.handle + '/c').limit(500).get()).docs;
// what the page made of it: the chat list, Message requests, and the notes in the mailbox as [all, my own]
const see = async (st) => { const ds = await inbox(st.p); return { list: st.list.map((x) => x.id), held: (st.p.S.invites || []).map((v) => v.cid + ' from ' + v.from), notes: [ds.length, ds.filter((d) => d.data().own === 1).length] }; };
const waits = (G, from) => ({ list: [], held: [G + ' from ' + from], notes: [1, 0] });   // a second note of the inviter for the same chat is tidied away: one stays
const isIn = (G) => ({ list: [G], held: [], notes: [1, 1] });
// a private group as Add leaves it: a key wrapped for every member in the record; and the note Add leaves (ensureInbox, sent afresh)
const group = (owner, G, members) => makeChannel(owner, G, [owner.handle, ...members], [], 'group');
const invite = (from, c, to) => from.S.real.ensureInbox(Object.assign({}, c, { members: [from.handle, ...to] }), to, true);
// one more note for the same chat: the next mailbox pass on every open page of the recipient
const again = async (sts, from, c, to) => { const before = sts.map((s) => s.passes); await invite(from, c, to); await until('the next mailbox pass', () => sts.every((s, i) => s.passes > before[i])); await pause(REST); };
const link = (G, l) => '#join=' + G + (l ? '.' + l.iid + '.' + l.secret : '');
const joinButtons = (p) => p.spy.els.filter((e) => e.tag === 'button' && /^Join (group|channel)$/.test(e.textContent));
// The Join button of Message requests, as written (openRequests): one row, pressed.
async function tapJoin(p) {
  p.spy.els.length = 0; p.S.real.openRequests();
  const b = p.spy.els.filter((e) => e.tag === 'button' && e.textContent === 'Join');
  assert.equal(b.length, 1, 'one invitation with a Join button under Message requests');
  await b[0].onclick();
}
// zed adds bob to a private group and leaves him the invitation; bob's page is open and holds it
async function heldInvitation(w, o = {}) {
  const zed = await person(w, 'zed99'), bob = await person(w, 'bob', o), G = w.G;
  const c = await group(zed, G, ['bob']); await invite(zed, c, ['bob']);
  const st = watch(bob); await until('the invitation held', () => (bob.S.invites || []).length === 1); await pause(200);
  assert.deepEqual(await see(st), waits(G, 'zed99'), 'the invitation waits');
  return { zed, bob, G, c, st };
}

test('K1: a waiting invitation still waits after I opened an incomplete link to its chat, also after a reload', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { bob, G, st } = await heldInvitation(w);
    assert.equal(await bob.S.real.handleJoin(link(G)), false, 'the link is refused');
    assert.deepEqual(bob.spy.toasts.at(-1), ['error', 'This invite link is incomplete. Ask for a new one.']);
    assert.equal(bob.S.real.heldKey(G), true, 'reading the record stored the key the inviter wrapped for me');
    await pause(REST); assert.deepEqual(await see(st), waits(G, 'zed99'), 'on the same page');
    const [b2, s2] = await reload(w, st);
    assert.equal(b2.S.real.heldKey(G), true, 'the key is still stored after the reload');
    assert.deepEqual(await see(s2), waits(G, 'zed99'), 'after the reload: not listed, no note of my own written, still under Message requests');
  });
});

test('K2: the incomplete link first, then the invitation: it waits', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const zed = await person(w, 'zed99'), bob = await person(w, 'bob'), G = w.G, c = await group(zed, G, ['bob']);
    const st = watch(bob); await until('the first pass', () => st.passes > 0);
    assert.equal(await bob.S.real.handleJoin(link(G)), false); assert.equal(bob.S.real.heldKey(G), true, 'the key is stored before any invitation exists');
    await again([st], zed, c, ['bob']);
    assert.deepEqual(await see(st), waits(G, 'zed99'));
  });
});

test('K3: the complete link, the Join sheet shown and Join not pressed, in both orders: the invitation waits', { timeout: 60000 }, async () => {
  await run(async (w) => {   // the invitation first
    const { zed, bob, G, c, st } = await heldInvitation(w), l = await linkOf(zed, G);
    assert.equal(await bob.S.real.handleJoin(link(G, l)), true); assert.equal(joinButtons(bob).length, 1, 'the Join sheet is up; nobody presses Join');
    assert.equal(bob.S.real.heldKey(G), true);
    await again([st], zed, c, ['bob']);
    assert.deepEqual(await see(st), waits(G, 'zed99'), 'after the next mailbox pass');
  });
  await run(async (w) => {   // the link first
    const zed = await person(w, 'zed99'), bob = await person(w, 'bob'), G = w.G, c = await group(zed, G, ['bob']), l = await linkOf(zed, G);
    const st = watch(bob); await until('the first pass', () => st.passes > 0);
    assert.equal(await bob.S.real.handleJoin(link(G, l)), true); assert.equal(joinButtons(bob).length, 1); assert.equal(bob.S.real.heldKey(G), true);
    await again([st], zed, c, ['bob']);
    assert.deepEqual(await see(st), waits(G, 'zed99'), 'the link first');
  });
});

test('K4: the invitation of a person I blocked stays dropped after I opened a link to the chat', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const zed = await person(w, 'zed99'), bob = await person(w, 'bob', { prefs: { dms: {}, blocked: ['zed99'] } }), G = w.G;
    const c = await group(zed, G, ['bob']); await invite(zed, c, ['bob']);
    await until('the note in the mailbox', async () => (await inbox(bob)).length === 1);
    const st = watch(bob); await until('the first pass', () => st.passes > 0); await pause(200);
    assert.deepEqual(await see(st), { list: [], held: [], notes: [1, 0] }, 'a blocked person\'s invitation is not shown at all');
    assert.equal(await bob.S.real.handleJoin(link(G)), false); assert.equal(bob.S.real.heldKey(G), true);
    const [, s2] = await reload(w, st);
    assert.deepEqual(await see(s2), { list: [], held: [], notes: [1, 0] }, 'after the reload: the block holds, the chat is not in my list');
  });
});

test('K5: two devices: the link opened on device A leaves the invitation waiting on both, also after device B reloads', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { zed, bob: A, G, c, st: sa } = await heldInvitation(w), B = await device(w, A), sb = watch(B);
    await until('held on device B', () => (B.S.invites || []).length === 1);
    assert.equal(await A.S.real.handleJoin(link(G)), false); assert.deepEqual([A.S.real.heldKey(G), B.S.real.heldKey(G)], [true, false]);
    await again([sa, sb], zed, c, ['bob']);
    assert.deepEqual([await see(sa), await see(sb)], [waits(G, 'zed99'), waits(G, 'zed99')], 'neither device lets it in, no note of my own is written');
    const [, s2] = await reload(w, sb);
    assert.deepEqual(await see(s2), waits(G, 'zed99'), 'device B after its reload');
  });
});

test('K6: two devices: a key that reached device B by Message backup lets nothing in', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { bob: A, G, st: sa } = await heldInvitation(w, { prefs: { dms: {}, blocked: [], backup: true } }), B = await device(w, A), sb = watch(B);
    await until('held on device B', () => (B.S.invites || []).length === 1);
    sa.stop();   // device A reads the link and has no mailbox pass afterwards: only the backup carries the key
    assert.equal(await A.S.real.handleJoin(link(G)), false);
    await A.S.real.syncBackup(); assert.equal(await B.S.real.syncBackup(), 1, 'device B gained one key from the backup (syncBackup as written)');
    assert.equal(B.S.real.heldKey(G), true);
    const [, s2] = await reload(w, sb);
    assert.deepEqual(await see(s2), waits(G, 'zed99'), 'device B after its reload: the key it never asked for says nothing about a Join');
  });
});

// bob is in zed's group: a key wrapped for him, and the note of his own that his join wrote
async function member(w, o = {}) {
  const zed = await person(w, 'zed99'), amy = await person(w, 'amy'), bob = await person(w, 'bob', o), G = w.G;
  const c = await group(zed, G, ['bob', 'amy']);
  await bob.S.real.dropPointer('bob', { t: 'invite', cid: G, from: 'bob', type: 'group' });
  const st = watch(bob); await until('the group in the list', () => st.list.some((x) => x.id === G)); await pause(200);
  assert.deepEqual(await see(st), isIn(G), 'bob is in the group');
  return { zed, amy, bob, G, c, st };
}

test('K7: after I left a group, an admin\'s add waits for Join; Join brings the chat back', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { zed, bob, G, c, st } = await member(w);
    await bob.leaveChat(G);
    await until('the group gone from the list and the mailbox', async () => !st.list.length && !(await inbox(bob)).length);
    assert.equal(bob.S.real.heldKey(G), true, 'the key from before is still stored');
    await again([st], zed, c, ['bob']);
    assert.deepEqual(await see(st), waits(G, 'zed99'), 'nobody is pulled back into a group they left');
    await tapJoin(bob);
    await until('the group back in the list', () => st.list.some((x) => x.id === G)); await until('one note left', async () => (await inbox(bob)).length === 1);
    assert.deepEqual(await see(st), isIn(G), 'back, resting on my own note; the admin\'s note is gone');
  });
});

test('K8: after I was removed (a new key without me), an add and its note wait for Join; Join brings the chat back', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { zed, bob, G, st } = await member(w);
    await zed.kickMember(G, 'bob');
    await until('the group gone from the list', () => !st.list.length);
    bob.S.recheckChats();   // the page's look-again (every 15 s by the clock), at once: since release 111 a refused watch deletes no note by itself, the fresh record's verdict does
    await until('the group gone from the mailbox, once the page has looked at it again', async () => !(await inbox(bob)).length);
    assert.equal(bob.S.real.heldKey(G), true);
    const before = st.passes;
    await zed.addSubs(G, new Set(['bob']));
    await zed.S.real.ensureInbox({ id: G, type: 'group', members: ['zed99', 'amy', 'bob'] }, ['bob'], true);   // the note Add leaves
    await until('the next mailbox pass', () => st.passes > before); await pause(REST);
    assert.deepEqual(await see(st), waits(G, 'zed99'));
    await tapJoin(bob);
    await until('the group back in the list', () => st.list.some((x) => x.id === G)); await until('one note left', async () => (await inbox(bob)).length === 1);
    assert.deepEqual(await see(st), isIn(G));
  });
});

test('K9: a chat whose own note a page of release 106 let go waits once after the update; Join brings it back with one note of my own', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { amy, bob, G, st } = await member(w, { old: true });   // bob's page is the release 106 one
    w.clock.skew += 61 * 60e3;   // an hour later a member writes there for the first time from a device: sendBody's note to every member
    await amy.S.real.ensureInbox({ id: G, type: 'group', members: ['zed99', 'bob', 'amy'] }, null, false);
    await until('the 106 page kept the newer note and deleted mine', async () => { const ds = await inbox(bob); return ds.length === 1 && ds[0].data().own !== 1; });
    assert.deepEqual(st.list.map((x) => x.id), [G], 'still listed on the 106 page');
    const [b2, s2] = await reload(w, st, { old: false });   // the update: this release's page, the same sealed store
    assert.equal(b2.S.real.heldKey(G), true, 'the key is stored: bob read this group for as long as he was in it');
    assert.deepEqual(await see(s2), waits(G, 'amy'), 'the member\'s note is all the mailbox has: the chat waits under Message requests');
    await tapJoin(b2);
    await until('the group back in the list', () => s2.list.some((x) => x.id === G)); await until('one note left', async () => (await inbox(b2)).length === 1);
    assert.deepEqual(await see(s2), isIn(G), 'one tap and it is back, with exactly one note of my own');
  });
});

test('G1 guard: with no link the invitation waits over a second note and a reload', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { zed, bob, G, c, st } = await heldInvitation(w);
    await again([st], zed, c, ['bob']);
    assert.equal(bob.S.real.heldKey(G), false); assert.deepEqual(await see(st), waits(G, 'zed99'));
    const [, s2] = await reload(w, st);
    assert.deepEqual(await see(s2), waits(G, 'zed99'));
  });
});

test('G2 guard: a record with no key wrapped for me: the link stores no key, and the invitation waits', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const zed = await person(w, 'zed99'), bob = await person(w, 'bob'), G = w.G, c = await group(zed, G, []);
    const st = watch(bob); await until('the first pass', () => st.passes > 0);
    assert.equal(await bob.S.real.handleJoin(link(G)), false); assert.equal(bob.S.real.heldKey(G), false, 'nothing to store');
    await again([st], zed, c, ['bob']);
    assert.deepEqual(await see(st), waits(G, 'zed99'));
  });
});

test('G3 guard: a join by a complete link and the Join button: listed, one note of my own, also after a reload', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const zed = await person(w, 'zed99'), bob = await person(w, 'bob'), G = w.G; await group(zed, G, []);
    const l = await linkOf(zed, G), st = watch(bob); await until('the first pass', () => st.passes > 0);
    assert.equal(await bob.S.real.handleJoin(link(G, l)), true);
    const b = joinButtons(bob); assert.equal(b.length, 1); await b[0].onclick();
    assert.equal(bob.spy.els.filter((e) => e.cls === 'err').at(-1).textContent, '', 'the join went through');
    await until('the group in the list', () => st.list.some((x) => x.id === G)); await pause(200);
    assert.deepEqual(await see(st), isIn(G));
    const [, s2] = await reload(w, st);
    assert.deepEqual(await see(s2), isIn(G), 'after the reload');
  });
});

test('G4 guard: Join pressed on device A: the chat is listed on A and on B, also after both reload', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { bob: A, G, st: sa } = await heldInvitation(w), B = await device(w, A), sb = watch(B);
    await until('held on device B', () => (B.S.invites || []).length === 1);
    await tapJoin(A);
    await until('listed on both', () => [sa, sb].every((s) => s.list.some((x) => x.id === G))); await until('one note left', async () => (await inbox(A)).length === 1);
    assert.deepEqual([await see(sa), await see(sb)], [isIn(G), isIn(G)], 'my own note reaches every device; the inviter\'s note is gone');
    const [, a2] = await reload(w, sa), [, b2] = await reload(w, sb);
    assert.deepEqual([await see(a2), await see(b2)], [isIn(G), isIn(G)], 'after the reloads');
  });
});

test('G5 guard: a member\'s note for a chat I am in (my own note names it): the chat stays listed and the other note goes', { timeout: 60000 }, async () => {
  await run(async (w) => {
    const { amy, bob, G, st } = await member(w), before = st.passes;
    await amy.S.real.ensureInbox({ id: G, type: 'group', members: ['zed99', 'bob', 'amy'] }, null, false);
    await until('the next mailbox pass', () => st.passes > before);
    await until('the member\'s note gone', async () => { const ds = await inbox(bob); return ds.length === 1 && ds[0].data().own === 1; });
    assert.deepEqual(await see(st), isIn(G));
  });
});
