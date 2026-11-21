// The device-removed summary and a public channel the person only follows (release 104, item 8).
// For such a channel the removal answers "member" (rekeyChat), the same answer as for a group the person is a plain member of,
// and the summary put both into "The removed device can still read new messages in these groups: ..." with the steps block,
// unblock and add again. Those steps are not offered on a public channel, and a public channel is no group: its keys are
// published, following is a note to oneself, and a follower cannot post. So the summary leaves out a chat that the removal's own
// list knows as a channel AND as public, both together. It is named nowhere, and "N chats are secured" never counted it.
//
// The removal runs as written (rekeyRun's rotate stage with rekeyChat, then rekeySummary) on the page harness of
// channel-history-kit.js, against a real server on which the chats exist. The last test hands rekeySummary two records the page
// cannot make (a group noted as public; a private channel with the answer "member"), to pin that the rule needs both words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { b64u, world, makeChannel } from './channel-history-kit.js';

// Helpers shared with channel-history-removal.test.js and shut-out-steps.test.js, copied as those files do.
// A device removal on X's page from its rotate stage on, stopped at the next stage (the vault); `rec.rotated` is what each chat came to.
async function removal(X, chats) {
  const rec = { stage: 'rotate', name: 'Old phone', rotated: [], chats: chats.map((x) => ({ type: 'channel', vis: 'private', owner: false, admin: false, admins: [], members: [], name: 'History', unlocked: true, ...x })) }, fails = [];
  const ui = { step: (t) => { if (/^Moving/.test(t)) throw new Error('stop'); }, retry: async (t) => { throw new Error(t); }, fail: (t) => fails.push(t), done: () => {} };
  X.S.contactsReady = true; X.S.vaultOk = true;
  await X.rekeyRun(rec, ui);
  assert.deepEqual(fails, ['Removing the device stopped (stop). Close Hush and open it again to finish it.'], 'the rotate stage ran to its end');
  assert.equal(X.S.rekeying, true); X.S.rekeying = false;
  return rec;
}
// The account's new keys as the removal's keys, write and mirror stages leave them.
async function newKeys(X) {
  await X.rekeyIdentity(X.S.me); X.S.keys.clear(); X.S.chanKeys.clear();
  await X.S.db.doc('directory/' + X.handle).update({ ecdh: X.S.me.ecdh, sig: X.S.me.sig, kv: X.S.me.kv, ts: Date.now() });
  const sk = await crypto.subtle.importKey('jwk', X.S.me.sigPriv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  await X.S.db.prove(null);
  await X.S.db.prove({ h: X.handle, pub: X.S.me.sig, dev: '', signDev: null, signAcct: async (m) => b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, sk, Buffer.from(m))) });
  await X.loadDir([X.handle], true);
}
const summary = (X, rec) => { X.spy.els.length = 0; X.rekeySummary(rec); return X.spy.els.map((e) => e.textContent).filter(Boolean); };
const newCid = (p) => p + randomBytes(6).toString('hex');

const GROUPS = (names) => 'The removed device can still read new messages in these groups: ' + names + '. Ask an admin there to accept your new security code, then block you, unblock you and add you again. That shuts it out.';
const IN_GROUPS = /The removed device can still read new messages in these groups/;
// Alice's public channel "News", as the app makes one (createChatDoc); Bob only follows it: no key of his is in it, and he is no admin.
const publicChannel = (A, cid) => A.createChatDoc(cid, 'channel', 'public', { name: 'News', desc: '', photo: null, owner: 'alice', admins: [], members: ['alice'], banned: [] });

test('a group the person is a plain member of and a public channel they follow: the removal answers "member" for both, and the "these groups" sentence names the group only; the public channel is named nowhere', async () => {
  await world({}, async (w) => {
    const g = newCid('g'), p = newCid('c');
    const A = await w.page('alice', { owner: true }), B = await w.page('bob');
    await makeChannel(A, g, ['alice', 'bob'], [], 'group'); await publicChannel(A, p);
    await newKeys(B);
    const rec = await removal(B, [{ cid: g, type: 'group', name: 'Team', members: ['alice', 'bob'] }, { cid: p, vis: 'public', name: 'News' }]);
    assert.deepEqual(rec.rotated, [{ cid: g, skip: 'member' }, { cid: p, skip: 'member' }], 'the engine\'s answer is the same for both, as before');
    const lines = summary(B, rec);
    assert.deepEqual(lines.filter((t) => IN_GROUPS.test(t)), [GROUPS('Team')], 'the group, with its steps; not the public channel');
    assert.ok(!lines.some((t) => /News/.test(t)), 'the public channel is named in no line: ' + JSON.stringify(lines.filter((t) => /News/.test(t))));
    assert.ok(lines.includes('0 chats are secured.'), 'and neither is counted as secured, as before');
  });
});

test('only a public channel the person follows: the "these groups" sentence does not show, and "0 chats are secured." stands as before', async () => {
  await world({}, async (w) => {
    const p = newCid('c');
    const A = await w.page('alice', { owner: true }), B = await w.page('bob');
    await publicChannel(A, p);
    await newKeys(B);
    const rec = await removal(B, [{ cid: p, vis: 'public', name: 'News' }]);
    assert.deepEqual(rec.rotated, [{ cid: p, skip: 'member' }]);
    const lines = summary(B, rec);
    assert.deepEqual(lines.filter((t) => IN_GROUPS.test(t)), [], 'no sentence about groups: there is none');
    assert.ok(!lines.some((t) => /News/.test(t)), 'the public channel is named in no line');
    assert.deepEqual(lines.slice(0, 2), ['Old phone can no longer use your account.', '0 chats are secured.']);
  });
});

test('the rule needs both words, channel and public: a group that a record notes as public, and a private channel that a record gives the answer "member", are still named (the page makes neither record)', async () => {
  await world({}, async (w) => {
    const B = await w.page('bob');
    const rec = (chat) => ({ name: 'Old phone', chats: [{ cid: 'x1', owner: false, admin: false, name: 'Odd one', ...chat }], rotated: [{ cid: 'x1', skip: 'member' }] });
    assert.deepEqual(summary(B, rec({ type: 'group', vis: 'public' })).filter((t) => IN_GROUPS.test(t)), [GROUPS('Odd one')], 'public alone does not take a chat out');
    assert.deepEqual(summary(B, rec({ type: 'channel', vis: 'private' })).filter((t) => IN_GROUPS.test(t)), [GROUPS('Odd one')], 'nor does channel alone');
    assert.deepEqual(summary(B, rec({ type: 'group', vis: 'private' })).filter((t) => IN_GROUPS.test(t)), [GROUPS('Odd one')], 'and a group stays, as before');
  });
});
