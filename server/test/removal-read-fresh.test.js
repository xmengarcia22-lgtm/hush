// A device removal's read stage and a chat this connection does not hold (release 111, with the adapter's review fix 10).
// The read stage puts every chat key this device can still unwrap into its key store before the account's key changes:
// afterwards a wrap made for the old account key cannot be opened (app/ui.js rekeyRun; app/crypto.js unwrapMine tries the
// device key and the account key of now). It read the kept copy of each chat's record. That copy is the record of before
// the last key change whenever the connection holds no level for the chat, because the watch that would have brought the
// new record has ended: an eviction whose re-open waits (release 111's adapter, review fix 6), a re-open the server
// refused, a list still loading. The removal then changed the account's key without the chat's newest key in the store,
// could not open the chat's description afterwards and filed the chat "locked": its key was not changed and the removed
// device read on (found by the whole suite: channel-history-admin3.test.js, test 78). Now the read stage reads a private
// group or channel fresh, once, when the connection holds no level for it. The page's own code against the real server
// (channel-history-kit.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mkBuild, world, makeChannel, b64u } from './channel-history-kit.js';

// What rekeyRun's read stage calls beyond the kit's own lift, as channel-history-people.test.js stands it in.
const build = mkBuild("const openDevName=async()=>'',deviceName=()=>'Old phone',dmInfo=()=>null,setDmInfo=()=>{},start=()=>{};");
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
const leave = async (X, cid) => { X.S.convs = [{ ...(await X.shown(cid)), id: cid }]; X.S.forgetPointers = () => {}; await X.leaveChat(cid); };
async function until(what, cond, ms = 8000) { const t = Date.now(); while (!(await cond())) { if (Date.now() - t > ms) assert.fail('waited ' + ms + ' ms for ' + what); await new Promise((r) => setTimeout(r, 20)); } }
// A device removal on X's page from its start, stopped at the step after its read stage (as channel-history-people.test.js): its record
async function readStage(X) {
  X.S.me.dev = { id: 'dev' + X.handle, nm: '' }; X.S.vaultOk = true;
  const rec = { stage: 'read', devId: 'lost', name: 'Old phone', key: 'KEY', pw: null }, fails = [];
  await X.rekeyRun(rec, { step: (t) => { if (t === 'Checking your account') throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} });
  assert.deepEqual(fails, ['Couldn’t remove the device (stop). Nothing was changed.'], X.handle + '\'s read stage ran to its end, and nothing changed');
  return rec;
}
// The account's new keys and the removal's rotate stage, as channel-history-admin3.test.js runs them.
async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}
async function rotateStage(X, chats) {
  const rec = { stage: 'rotate', name: 'Old phone', rotated: [], chats }, fails = [];
  const ui = { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} };
  X.S.contactsReady = true; X.S.vaultOk = true;
  await X.rekeyRun(rec, ui);
  assert.deepEqual(fails, ['Removing the device stopped (stop). Close Hush and open it again to finish it.'], 'the rotate stage ran to its end');
  X.S.rekeying = false; return rec;
}
// The owner's phone and iPad, an admin and a subscriber in a private channel; every page has read it at key 0.
async function cast(w) {
  const { cid } = w, A = await w.page('alice', { owner: true, build }), A2 = await w.page('alice', { owner: true, id: A.id, build });
  const B = await w.page('bob', { build }), X = await w.page('xena', { build });
  await makeChannel(A, cid, ['alice', 'bob', 'xena'], ['bob']);
  for (const P of [A, A2, B, X]) await read(P, cid);
  return { cid, A, A2, B, X };
}

test('1. the iPad\'s connection lost the channel at a key change and holds no level for it, so its kept copy is the record of before: the removal\'s read stage reads the channel fresh, the current key is in the key store before the account\'s key changes, and the rotate stage changes the channel\'s key (it filed the channel "locked")', async () => {
  await world({}, async (w) => {
    const { cid, A, A2, X } = await cast(w);
    assert.deepEqual([A2.epochOf(A2.S.chatDocs.get(cid)), !!A2.ksGet(cid, 0), A2.S.db.chatLevel(cid)], [0, true, 'owner'], 'the iPad before: the record at key 0, that key stored, the channel held');
    A2.spy.capsFor = async () => null;   // the iPad is not let back in for now: no key to offer, as while a re-open waits (nothing of the new record reaches it)
    await leave(X, cid); await A.run(cid);
    assert.equal(A.epochOf(await A.sync(cid)), 1, 'the phone changed the key when Xena left');
    await until('the iPad to lose the channel', () => !A2.S.db.chatLevel(cid));
    await new Promise((r) => setTimeout(r, 300));   // the second eviction of the pair (about 30 ms after the first) is in too
    A2.spy.capsFor = null;
    assert.deepEqual([A2.S.db.chatLevel(cid), A2.epochOf(A2.S.chatDocs.get(cid)), !!A2.ksGet(cid, 1)], [null, 0, false], 'the iPad as the removal begins: no level, the kept copy at key 0, key 1 never derived');
    const pv = A2.S.db.preview, had = []; A2.S.db.preview = (c) => { had.push(A2.S.chatDocs.has(c)); return pv(c); };   // the page's key work for the open reads a preview when it keeps no copy (capsFor)
    const rec = await readStage(A2), x = rec.chats.find((y) => y.cid === cid);
    A2.S.db.preview = pv;
    assert.deepEqual(had, [false], 'one open, and the kept copy was out of the way when its keys were worked out (an old member key is not offered)');
    assert.deepEqual([!!A2.ksGet(cid, 1), A2.epochOf(A2.S.chatDocs.get(cid)), x && x.unlocked, x && x.owner, x && [...x.members].sort()], [true, 1, true, true, ['alice', 'bob']],
      'after the read stage: key 1 in the key store, the kept copy the record of now, and the removal\'s record from it (Xena gone)');
    await newKeys(A2);
    assert.deepEqual((await rotateStage(A2, [x])).rotated, [{ cid, ok: true }], 'the rotate stage, under the new account key: the channel\'s key changed, not "locked"');
    assert.equal(A2.epochOf(await A2.sync(cid)), 2, 'the channel is at key 2');
  });
});

test('2. a channel the connection holds is taken from the kept copy as before: the read stage reads no record', async () => {
  await world({}, async (w) => {
    const { cid, A2 } = await cast(w);
    assert.equal(A2.S.db.chatLevel(cid), 'owner');
    const kept = A2.S.chatDocs.get(cid), gets = A2.spy.gets;
    const rec = await readStage(A2);
    assert.deepEqual([A2.spy.gets - gets, A2.S.chatDocs.get(cid) === kept, rec.chats.some((y) => y.cid === cid && y.unlocked)], [0, true, true], 'no read of the record, the kept copy is the one it was, the channel in the removal\'s record');
  });
});

test('3. the fresh read fails or brings only the trimmed copy (the server refuses the open): the kept copy stays and the read stage goes on from it, as before', async () => {
  await world({}, async (w) => {
    const { cid, A, A2, X } = await cast(w);
    A2.spy.capsFor = async () => null;
    await leave(X, cid); await A.run(cid);
    await until('the iPad to lose the channel', () => !A2.S.db.chatLevel(cid));
    await new Promise((r) => setTimeout(r, 300));
    const kept = A2.S.chatDocs.get(cid);   // still not let in: the read brings the copy anyone signed in may read, with no description
    const rec = await readStage(A2), x = rec.chats.find((y) => y.cid === cid);
    assert.deepEqual([A2.S.chatDocs.get(cid) === kept, x && x.unlocked, x && x.owner, x && [...x.members].sort()], [true, true, true, ['alice', 'bob', 'xena']], 'the kept copy is back, and the removal\'s record is made from it');
    A2.spy.capsFor = null;
  });
});

test('4. a one-on-one chat and a public channel the connection holds no level for are taken as before: the read stage reads no record for them (their keys are not put in the store from the wraps of the record of now)', async () => {
  await world({}, async (w) => {
    const { cid, A2 } = await cast(w);
    const did = 'd' + 'x'.repeat(22), pid = 'c' + 'f'.repeat(12);
    A2.S.convs = [{ id: did, type: 'dm', members: ['alice', 'bob'], epoch: 0 }, { id: pid, type: 'channel', visibility: 'public', owner: 'bob', admins: [], members: [], name: 'News' }];
    assert.deepEqual([A2.S.db.chatLevel(did), A2.S.db.chatLevel(pid)], [null, null]);
    const gets = A2.spy.gets, t = Date.now();
    const rec = await readStage(A2);
    assert.deepEqual([A2.spy.gets - gets, rec.chats.some((y) => y.cid === cid)], [0, true], 'no record read; the held private channel is in the record of the removal');
    assert.ok(Date.now() - t < 700, 'and no wait for a read');
  });
});
