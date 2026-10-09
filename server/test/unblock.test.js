// Unblocking a person brings our DM back. Blocking used to tidy away my note for the DM, and their notes are dropped
// while they are blocked, so after unblocking the DM was gone from the list for good. The page's restoreDm (lifted
// from the page's app/ui.js) sends me a fresh note whenever the server still has the chat and my list doesn't.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { appSource } from './helpers.js';

const html = appSource();
const a = html.indexOf('/* ===== HUSH UNBLOCK BEGIN ===== */'), b = html.indexOf('/* ===== HUSH UNBLOCK END ===== */');
const load = new Function('S', 'dmIdFor', 'isBlocked', 'dmInfo', 'setDmInfo', 'ensureInbox', html.slice(a, b) + '\nreturn restoreDm;');

function page({ listed = false, exists = true, blocked = [] } = {}) {
  const sent = [], info = {};
  const S = { me: { handle: 'alice' }, convs: listed ? [{ id: 'dBOB' }] : [], dmPeers: {},
    db: { preview: async (cid) => ({ exists: exists && cid === 'dBOB' }) } };
  const restoreDm = load(S, async (h) => (h === 'bob' ? 'dBOB' : null), (h) => blocked.includes(h),
    (cid) => info[cid], (cid, v) => { info[cid] = v; }, async (c, only, fresh) => { sent.push({ c, only, fresh }); });
  return { S, sent, info, restoreDm };
}

test('unblocking re-sends my note for a DM the server still has, so it is listed again', async () => {
  const p = page();
  assert.equal(await p.restoreDm('bob'), true);
  assert.equal(p.sent.length, 1);
  assert.deepEqual(p.sent[0].only, ['alice'], 'only my own note: theirs was never touched by my block');
  assert.equal(p.sent[0].fresh, true, 'sent again even though this device once sent one');
  assert.deepEqual(p.sent[0].c, { id: 'dBOB', type: 'dm', members: ['alice', 'bob'] });
  assert.equal(p.S.dmPeers.dBOB, 'bob');
  assert.deepEqual(p.info.dBOB, { peer: 'bob' });
});

test('nothing is sent when the DM is already listed, never existed, or the person is blocked again', async () => {
  for (const opts of [{ listed: true }, { exists: false }, { blocked: ['bob'] }]) {
    const p = page(opts);
    assert.equal(await p.restoreDm('bob'), false, JSON.stringify(opts));
    assert.equal(p.sent.length, 0, JSON.stringify(opts));
  }
  const p = page();
  assert.equal(await p.restoreDm('alice'), false, 'no DM with myself to restore');
});
