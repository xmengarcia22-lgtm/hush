// Release 93b (page), the epoch-rollback guard, private channels only (owner decision D7; the red team's RT2; SPEC.md 5.6 "Key
// chain"). A device keeps, per private channel, the highest epoch whose key change it has checked (headOk, with the owner on
// record) or made or taken from a link (keyMade), as `hi` in its roles record, and seals nothing and changes no key from a record
// below it: a server serving an older record (a rollback, or a database restored from before that key change) would otherwise
// have it seal under a key a member removed since still holds, and have the owner's next key change wrap for them again at an
// epoch already used. The refusal is the error 'rollback' (code conflict, so the paths that redo a key change from a fresh record
// do that first); sendBody reads the record again once before it. Groups and one-on-one chats are unchanged (D2: a malicious
// server can plant a key there anyway). Tests 152 to 154. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { world, makeChannel } from './channel-history-kit.js';

const copy = (c) => JSON.parse(JSON.stringify(c));
const rollback = (e) => !!e && e.message === 'rollback' && e.code === 'conflict';
const hi = (X, cid) => (X.rolesOf(cid) || {}).hi;
const all = { name: 'History', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice', 'bob', 'eve'], banned: [] };
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
const postsOf = async (X, cid) => (await X.S.db.collection('channels/' + cid + '/posts').limit(50).get()).docs.map((d) => d.data().e);

test('152. a private channel record served from below the mark is refused for sealing and for a key change (rollback, before anything is wrapped or sent); the current record still seals; a key this page made and a key change it checked raise the mark; a planted epoch it refused raises nothing; a reload keeps it', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob'), E = await w.page('eve'), Z = await w.page('zed');
    await makeChannel(A, cid, all.members);
    for (const P of [A, B, E]) await read(P, cid);
    assert.equal(hi(B, cid), undefined, 'no key change checked yet: no mark');
    assert.equal(await A.rotateTo(await A.sync(cid), all), 1);
    assert.equal(hi(A, cid), 1, 'a key this page made raises its mark');
    const old = copy(await B.sync(cid)), oldA = copy(await A.sync(cid));
    assert.ok(await B.sealKey(old, 1)); assert.equal(hi(B, cid), 1, 'a checked key change raises the mark');
    assert.ok(await E.convKey(old, 1), 'eve holds the epoch-1 key');
    assert.equal(await A.rotateTo(await A.sync(cid), { ...all, members: ['alice', 'bob'] }), 2, 'eve removed');
    const cur = await B.sync(cid);
    assert.equal((await B.sealPost(cur, 'now')).e, 2); assert.equal(hi(B, cid), 2, 'the mark follows the checked key change');
    // the server serves the epoch-1 record again
    await assert.rejects(B.sealPost(old, 'rolled back'), rollback, 'refused: nothing eve could read');
    const n = A.spy.rotate.length;
    await assert.rejects(A.rotateTo(oldA, { ...all, members: ['alice', 'eve'] }), rollback, 'a key change from it is refused');
    assert.equal(A.spy.rotate.length, n, 'before anything was wrapped or sent');
    assert.equal((await B.sealPost(await B.sync(cid), 'still')).e, 2, 'the current record still seals');
    // a planted epoch 3 (the server's key wrapped to bob, no row): refused as before (badkey), and it raises no mark
    const Kx = crypto.getRandomValues(new Uint8Array(32)); await Z.loadDir(['bob'], true);
    const planted = { ...copy(cur), epoch: 3, keys: { ...cur.keys, 3: await Z.wrapAll(Kx, ['bob'], cid, 3) } };
    await assert.rejects(B.sealKey(planted, 3), (e) => !!e && e.message === 'badkey');
    assert.equal(hi(B, cid), 2, 'a refused key raises nothing'); assert.equal((await B.sealPost(await B.sync(cid), 'after the plant')).e, 2, 'so the real record still seals');
    // a reload keeps the mark
    const B2 = await w.reload(B);
    assert.equal(hi(B2, cid), 2, 'kept across a reload');
    await assert.rejects(B2.sealPost(old, 'rolled back'), rollback, 'still refused');
    assert.equal((await B2.sealPost(await B2.sync(cid), 'current')).e, 2);
  });
});

test('153. sendBody: a chat-list copy that is merely behind (this account checked the newer key already) is read again and the post goes out under the current key; a server that keeps serving the older record is refused with the rollback text, and nothing is sent', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob');
    await makeChannel(A, cid, all.members, ['bob']);
    for (const P of [A, B]) await read(P, cid);
    assert.equal(await A.rotateTo(await A.sync(cid), { ...all, admins: ['bob'] }), 1);
    const old = copy(await B.sync(cid)); assert.ok(await B.sealKey(old, 1));
    assert.equal(await A.rotateTo(await A.sync(cid), { ...all, admins: ['bob'], members: ['alice', 'bob'] }), 2, 'eve removed');
    assert.ok(await B.sealKey(await B.sync(cid), 2)); assert.equal(hi(B, cid), 2);
    B.S.convs = [copy(old)];                                   // the chat list's copy still says epoch 1 (another tab of his checked epoch 2)
    await B.sendBody(cid, 'after the change');
    assert.equal(B.S.convs[0].epoch, 2, 'read again first');
    assert.deepEqual(await postsOf(B, cid), [2], 'sent under epoch 2, once');
    // a server that keeps answering with the epoch-1 record: the read gives epoch 1 again, and the send is refused
    const real = B.S.db.doc; B.S.db.doc = (p) => (p === 'channels/' + cid ? { ...real(p), get: async () => ({ exists: true, id: cid, data: () => copy(old) }) } : real(p));
    B.S.convs = [copy(old)];
    let err = null; try { await B.sendBody(cid, 'rolled back'); } catch (e) { err = e; }
    B.S.db.doc = real;
    assert.ok(rollback(err), 'refused: ' + (err && err.message));
    assert.deepEqual(await postsOf(B, cid), [2], 'nothing sent');
    assert.match(B.sendErr(err, 'channel'), /this channel looks out of date/);
  });
});

test('154. owner decision D7: a private group and a one-on-one chat keep no mark, so a record from before a removal still seals there and a key change from it still reaches the server (a malicious server can plant a key there anyway, D2: the guard would only cost an honest restore)', async () => {
  await world({}, async (w) => {
    const A = await w.page('alice', { owner: true }), B = await w.page('bob'), Z = await w.page('zed'), g = 'g' + randomBytes(12).toString('hex').slice(0, 12);
    await makeChannel(A, g, all.members, [], 'group');
    const old = copy(await B.sync(g)), oldA = copy(await A.sync(g));
    assert.equal(await A.rotateTo(await A.sync(g), { ...all, members: ['alice', 'bob'] }), 1, 'eve removed');
    assert.equal((await B.sealPost(await B.sync(g), 'now')).e, 1);
    assert.equal((await B.sealPost(old, 'from the old record')).e, 0, 'a group: sealed under the old key, as before');
    assert.equal(hi(B, g), undefined, 'no mark');
    const n = A.spy.rotate.length;
    await assert.rejects(A.rotateTo(oldA, { ...all, members: ['alice', 'eve'] }), (e) => !!e && e.code === 'conflict' && e.message !== 'rollback', 'the server\'s own conflict (epoch 1 exists), not the page\'s refusal');
    assert.equal(A.spy.rotate.length, n + 1, 'the page sent it');
    // a one-on-one chat: a record one epoch behind a key this device holds still seals
    await Z.loadDir(['bob'], true);
    const dm = 'd' + randomBytes(16).toString('base64url').slice(0, 22), K1 = crypto.getRandomValues(new Uint8Array(32)), K2 = crypto.getRandomValues(new Uint8Array(32));
    const r1 = { id: dm, type: 'dm', epoch: 1, keys: { 1: await Z.wrapAll(K1, ['bob'], dm, 1) }, ts: Date.now(), last: null }, r2 = { ...r1, epoch: 2, keys: { ...r1.keys, 2: await Z.wrapAll(K2, ['bob'], dm, 2) } };
    assert.equal((await B.sealPost(r2, 'at 2')).e, 2);
    assert.equal((await B.sealPost(r1, 'back at 1')).e, 1, 'a one-on-one chat: sealed, as before');
    assert.equal(hi(B, dm), undefined, 'no mark');
  });
});

test('155. first sight raises no mark: a key change checked before the owner is on this device\'s record (no roles record yet) passes as before, by its signature alone, and leaves no mark, so a key planted then can\'t lock the channel afterwards; once the owner is on record the same check raises it', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob');
    await makeChannel(A, cid, all.members);
    await read(A, cid);
    assert.equal(await A.rotateTo(await A.sync(cid), all), 1);
    assert.equal(B.rolesOf(cid), null, 'Bob\'s page has not read the owner\'s part yet');
    assert.ok(await B.sealKey(await B.sync(cid), 1), 'first sight: the commit checks out by its signature alone');
    assert.equal(hi(B, cid), undefined, 'and raises no mark');
    await read(B, cid);
    assert.ok(await B.sealKey(await B.sync(cid), 1));
    assert.equal(hi(B, cid), 1, 'with the owner on record the check raises it');
  });
});
