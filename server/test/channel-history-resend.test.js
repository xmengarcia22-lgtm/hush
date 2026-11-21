// Release 92 (page), private channel history: a channel post a key change overtook (the release-91 "Not sent" case, SPEC.md
// 5.7: the server answers conflict for a post sealed under an older key) is sealed once more under the new key, with the same
// id, after the record is read again, its ometa first. The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { world, makeChannel } from './channel-history-kit.js';

const conflict = (e) => !!e && e.code === 'conflict';
// The chat as the chat watch last showed it on X's page (convById), which sendBody seals for.
const view = async (X, cid) => { X.S.convs = [...X.S.convs.filter((x) => x.id !== cid), { ...(await X.shown(cid)), id: cid }]; };
// Every post X's page stores from here on: [id, epoch, 'ok' or the refusal's code]. `before`: one entry per post from here on,
// run just before it goes (null for none); one that throws stands for the server's refusal.
function watchPosts(X) {
  const log = [], before = [], doc = X.S.db.doc;
  X.S.db.doc = (p) => { const d = doc(p), m = /\/posts\/([^/]+)$/.exec(p); if (!m) return d; const set = d.set;
    d.set = async (v, o) => { try { const f = before.shift(); if (f) await f(); await set(v, o); log.push([m[1], v.e, 'ok']); } catch (e) { log.push([m[1], v.e, e && e.code]); throw e; } };
    return d; };
  return { log, before };
}
const refuse = () => { throw Object.assign(new Error('conflict'), { code: 'conflict' }); };
// X's next read of the record finds a meta this page can't open (none), and the new key is not in X's key store (here the
// connection opening the chat again had put it there): only the record's keys, copied onto the chat's copy, give it.
const noMeta = (X, cid) => { const doc = X.S.db.doc; X.S.db.doc = (p) => { const d = doc(p); if (p !== 'channels/' + cid) return d; const g = d.get;
  d.get = async () => { X.S.db.doc = doc; const v = { ...(await g()).data() }; delete v.meta; delete X.S.ks[cid][X.epochOf(v)]; return { exists: true, data: () => v }; }; return d; }; };
// What X's page reads of a stored post: the text, opened under the key of its own epoch.
async function textOf(X, cid, pid) {
  const rec = await X.sync(cid), d = (await X.S.db.doc('channels/' + cid + '/posts/' + pid).get()).data(), u = await X.unsealPost(rec, { ...d, _id: pid }), ck = await X.convKey(rec, d.e);
  return [d.e, Buffer.from(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(u.iv, 'base64') }, ck.key, Buffer.from(u.ct, 'base64'))).toString()];
}

test('15a. a post refused (conflict) after a newly added admin changed the key goes out under the new key: the record\'s ometa is read first, so the new admin\'s commit checks out', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), N = await w.page('nina');
    await makeChannel(A, cid, ['alice', 'xena', 'nina'], ['xena']);
    await view(X, cid); await X.rolesQ.get(cid);
    assert.deepEqual(X.rolesOf(cid).a, ['xena'], 'Xena\'s page: Xena alone is an admin');
    await A.sync(cid); await A.setAdmins(cid, ['xena', 'nina']);                  // Nina made an admin in the owner's signed ometa,
    await N.rotateTo(await N.sync(cid), N.metaOf(await N.shown(cid)));           // and her page changes the key at once (her commit)
    assert.equal((await N.openCommit(cid, 1, N.unb64(N.ksGet(cid, 1)), (await N.S.db.doc('channels/' + cid + '/chain/1').get()).data().c)).f, 'nina');
    assert.deepEqual([X.S.convs[0].epoch, X.rolesOf(cid).a], [0, ['xena']], 'Xena\'s page has seen neither');
    const { log } = watchPosts(X);
    await X.sendBody(cid, 'after nina');
    assert.deepEqual(log.map((x) => x.slice(1)), [[0, 'conflict'], [1, 'ok']], 'refused, then sealed again under the new key');
    assert.equal(log[0][0], log[1][0], 'with the same id');
    assert.deepEqual(X.rolesOf(cid).a, ['xena', 'nina'], 'the new ometa was read before the new commit was checked');
    assert.deepEqual(await textOf(A, cid, log[1][0]), [1, 'after nina']);
  });
});

test('26. a channel post a key change overtook (conflict) is sealed once more under the new key, with the same id, and becomes the latest message (a scheduled one too, one whose chat copy the chat watch replaced meanwhile, and one whose record read again has a meta this page can\'t open); a second conflict fails with "The channel was just updated. Try again."; a quiet post, a refusal with no newer key, and a group\'s post are never sent again', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), X = await w.page('xena'), B = await w.page('bob');
    await makeChannel(A, cid, ['alice', 'xena', 'bob'], ['xena']);
    const turn = async () => { await X.rotateTo(await X.sync(cid), X.metaOf(await X.shown(cid))); };   // another admin's key change
    const { log, before } = watchPosts(A);

    // Another admin changed the key while Alice's page still shows the chat under the old one.
    await view(A, cid); await turn();
    await A.sendBody(cid, 'one');
    assert.deepEqual(log.map((x) => x.slice(1)), [[0, 'conflict'], [1, 'ok']], 'refused, then once more under the new key');
    const pid = log[0][0];
    assert.equal(log[1][0], pid, 'with the same id');
    assert.deepEqual([A.S.convs[0].epoch, A.S.chatDocs.get(cid).epoch, A.spy.nudge.length], [1, 1, 1], 'the chat\'s copy and the record this page keeps have the new key');
    assert.deepEqual(await textOf(B, cid, pid), [1, 'one'], 'a subscriber reads it under the new key');
    const rec = await A.sync(cid);
    assert.deepEqual([rec.last.id, rec.last.e], [pid, 1], 'the latest-message marker names it');

    // Refused for something else (here, no connection): not sent again.
    await turn(); log.length = 0; before.push(() => { throw Object.assign(new Error('offline'), { code: 'offline' }); });
    await assert.rejects(A.sendBody(cid, 'not now'), (e) => !!e && e.code === 'offline');
    assert.deepEqual([log.map((x) => x.slice(1)), A.S.convs[0].epoch], [[[1, 'offline']], 1]);

    // A scheduled post the same way (the key changed meanwhile, above).
    log.length = 0;
    await A.sendBody(cid, 'later', Date.now() + 3600e3);
    assert.deepEqual(log.map((x) => x.slice(1)), [[1, 'conflict'], [2, 'ok']]);
    assert.equal(log[0][0], log[1][0]);
    assert.match(A.spy.toasts[A.spy.toasts.length - 1][0], /^Scheduled for /);

    // The chat watch heard of the next key change while the post was on its way, and put a new copy of the chat in place.
    await turn(); log.length = 0; before.push(() => view(A, cid));
    await A.sendBody(cid, 'meanwhile');
    assert.deepEqual(log.map((x) => x.slice(1)), [[2, 'conflict'], [3, 'ok']], 'sealed again for the copy the chat has now');

    // Refused again: another key change came while the post went out the second time. No third try.
    await turn(); log.length = 0; before.push(null, turn);
    await assert.rejects(A.sendBody(cid, 'two'), (e) => conflict(e) && A.sendErr(e, 'channel') === 'The channel was just updated. Try again.');
    assert.deepEqual(log.map((x) => x.slice(1)), [[3, 'conflict'], [4, 'conflict']]);
    assert.equal(log[0][0], log[1][0]);
    assert.equal(A.sendErr(Object.assign(new Error('conflict'), { code: 'conflict' }), 'dm'), 'Not sent. Check your connection and try again.', 'never the channel words elsewhere (a media piece stored twice is conflict too)');

    // A quiet post (a wake ticket) is not sent again, and the chat's copy stays as it was.
    log.length = 0;
    await assert.rejects(A.sendBody(cid, 'tick', Date.now() - 1000, true), conflict);
    assert.deepEqual([log.map((x) => x.slice(1)), A.S.convs[0].epoch], [[[4, 'conflict']], 4]);

    // A refusal when the record has no newer key: not sent again.
    await view(A, cid); log.length = 0; before.push(refuse);
    await assert.rejects(A.sendBody(cid, 'three'), conflict);
    assert.deepEqual(log.map((x) => x.slice(1)), [[5, 'conflict']]);

    // The record read again has a meta this page can't open: the new key still comes from its keys, copied onto the chat's copy.
    await turn(); log.length = 0; before.push(() => noMeta(A, cid));
    await A.sendBody(cid, 'no meta');
    assert.deepEqual(log.map((x) => x.slice(1)), [[5, 'conflict'], [6, 'ok']]);
    assert.deepEqual(await textOf(B, cid, log[1][0]), [6, 'no meta']);

    // A group's post, even with a newer key on the record: never sent again (the server checks no epoch there).
    const gid = 'g' + cid.slice(1);
    await makeChannel(A, gid, ['alice', 'xena', 'bob'], ['xena'], 'group'); await view(A, gid);
    await X.rotateTo(await X.sync(gid), X.metaOf(await X.shown(gid))); log.length = 0; before.push(refuse);
    await assert.rejects(A.sendBody(gid, 'in a group'), (e) => conflict(e) && A.sendErr(e, 'group') === 'Not sent. Check your connection and try again.');
    assert.deepEqual(log.map((x) => x.slice(1)), [[0, 'conflict']]);
    await A.sendBody(gid, 'in a group');
    assert.deepEqual(log.map((x) => x.slice(1)), [[0, 'conflict'], [0, 'ok']], 'sent once more by hand, under the key the page shows');
  });
});
