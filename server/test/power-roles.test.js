// Power roles need a secured account (SPEC.md 4.6): an owner or admin of a group or channel holds keys to other
// people's chats, so the server lets an account create one, or use an owner's or admin's key, only once the account
// carries the secured mark (set by the page after it saw a strong password). Every way into a power role is covered:
// creating, being promoted, holding a role from before the rule, and a new device of the account. Ownership can't be
// handed over in this version (SPEC.md 5), so there is no take-over path; if one is added it goes through chat.open too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { startServer, signup, connectAs, makeIdentity, createChat, groupDoc, channelDoc, dmDoc, CAPS, label, wrap } from './helpers.js';

const RULE = { powerNeedsSecure: true };
const secure = (c, h) => c.ok('set', { p: 'secure/' + h, d: { ts: Date.now() } });
const cid = (k, n) => k + ('Power' + n).padEnd(12, '0');

test('creating a group or channel needs a secured account; a DM does not', async () => {
  const T = await startServer({ authz: 'standard', limits: RULE });
  const alice = await makeIdentity('alice'), A = await signup(T.url, alice);
  try {
    for (const [k, doc] of [['g', groupDoc()], ['c', channelDoc()]]) {
      const r = await A.call('chat.create', { cid: cid(k, 1), d: doc, caps: CAPS() });
      assert.equal(r.e, 'secure', 'refused until the account is secured: ' + k);
    }
    await A.ok('chat.create', { cid: 'd' + 'P'.repeat(22), d: dmDoc(), caps: { m: CAPS().m } });
    await secure(A, 'alice');
    const { level } = await createChat(A, cid('g', 2), groupDoc());
    assert.equal(level, 'owner', 'once secured, the creator holds the owner level');
    assert.equal((await createChat(A, cid('c', 2), channelDoc())).level, 'owner');
  } finally { await A.close(); await T.stop(); }
});

test('promoted to admin: the admin key opens at member level until the new admin secures the account', async () => {
  const T = await startServer({ authz: 'standard', limits: RULE });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  const A = await signup(T.url, alice), B = await signup(T.url, bob);
  try {
    await secure(A, 'alice');
    const id = cid('g', 3), { caps } = await createChat(A, id, groupDoc());
    // Alice makes Bob an admin: the admin secret is now wrapped to him, so his device can make the admin key.
    await A.ok('chat.admins', { cid: id, akeys: { [label()]: wrap() }, cap: caps.a });
    let r = await B.ok('chat.open', { cid: id, cap: caps.a });
    assert.deepEqual([r.level, r.held], ['member', 'admin'], 'his admin tools wait, and the reply says why');
    assert.equal((await B.call('chat.rotate', { cid: id, epoch: 1, keys: {}, cap: CAPS().m })).e, 'denied', 'an admin action is refused meanwhile');
    await secure(B, 'bob');
    r = await B.ok('chat.open', { cid: id, cap: caps.a });
    assert.deepEqual([r.level, r.held], ['admin', undefined], 'secured: the same key now opens as admin');
  } finally { await A.close(); await B.close(); await T.stop(); }
});

test('a role held from before the rule: the owner key opens at member level until the owner secures the account', async () => {
  const T = await startServer({ authz: 'standard' });          // the rule off, as before release 9
  const alice = await makeIdentity('alice'), A = await signup(T.url, alice);
  try {
    const id = cid('c', 4), { caps } = await createChat(A, id, channelDoc());
    T.srv.limits.powerNeedsSecure = true;                       // release 9 arrives
    let r = await A.ok('chat.open', { cid: id, cap: caps.o });
    assert.deepEqual([r.level, r.held], ['member', 'owner']);
    assert.equal((await A.call('chat.admins', { cid: id, akeys: {}, cap: CAPS().a })).e, 'denied', 'an owner action is refused meanwhile');
    await secure(A, 'alice');
    r = await A.ok('chat.open', { cid: id, cap: caps.o });
    assert.equal(r.level, 'owner');
    await A.ok('chat.admins', { cid: id, akeys: {}, cap: CAPS().a });
  } finally { await A.close(); await T.stop(); }
});

test('a new device of a secured account opens as owner at once; the mark belongs to the account', async () => {
  const T = await startServer({ authz: 'standard', limits: RULE });
  const alice = await makeIdentity('alice'), A = await signup(T.url, alice);
  try {
    await secure(A, 'alice');
    const id = cid('g', 5), { caps } = await createChat(A, id, groupDoc());
    const A2 = await connectAs(T.url, alice);
    const r = await A2.ok('chat.open', { cid: id, cap: caps.o });
    assert.deepEqual([r.level, r.held], ['owner', undefined]);
    await A2.close();
  } finally { await A.close(); await T.stop(); }
});

test('the secured mark: only the account sets it, once, and nobody can read it, not even the account', async () => {
  const T = await startServer({ authz: 'standard', limits: RULE });
  const alice = await makeIdentity('alice'), bob = await makeIdentity('bob');
  const A = await signup(T.url, alice), B = await signup(T.url, bob);
  try {
    assert.equal((await B.call('set', { p: 'secure/alice', d: { ts: 1 } })).e, 'denied', 'nobody marks someone else');
    await secure(A, 'alice');
    for (const [c, who] of [[A, 'alice'], [B, 'bob']]) assert.equal((await c.call('get', { p: 'secure/alice' })).e, 'denied', 'unreadable by ' + who);
    assert.equal((await A.call('update', { p: 'secure/alice', d: { ts: 2 } })).e, 'denied');
    assert.equal((await A.call('delete', { p: 'secure/alice' })).e, 'denied', 'kept for good');
    assert.equal((await A.call('set', { p: 'secure/alice', d: { ts: 3, weak: false } })).e, 'invalid', 'it carries nothing but a time');
  } finally { await A.close(); await B.close(); await T.stop(); }
});

test('in production the off-switch is ignored: the rule is always on', async () => {
  const was = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const T = await startServer({ authz: 'standard', limits: { powerNeedsSecure: false } });
  const alice = await makeIdentity('alice'), A = await signup(T.url, alice);
  try {
    assert.equal((await A.call('chat.create', { cid: cid('g', 6), d: groupDoc(), caps: CAPS() })).e, 'secure', 'creating still needs a secured account');
    await secure(A, 'alice');
    assert.equal((await createChat(A, cid('g', 7), groupDoc())).level, 'owner');
  } finally {
    await A.close(); await T.stop();
    if (was === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = was;
  }
});

// ---- the highest tier so far, kept in the encrypted vault (SPEC.md 4.6) ----

const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const tierSrc = ui.slice(ui.indexOf('const TIERS='), ui.indexOf('async function capsFor('));
function tierPage(prefs) {
  const fired = [], S = { me: { handle: 'alice' }, contactsReady: true };
  let saves = 0;
  const win = { dispatchEvent: (e) => fired.push(e.detail.tier) };
  const m = new Function('S', 'P', 'saveContacts', 'window', 'CustomEvent', tierSrc + '\nreturn { noteTier, flush: () => tierQueued };')(S, () => prefs, () => saves++, win, CustomEvent);
  return { ...m, S, fired, prefs, saves: () => saves };
}

test('the tier hook fires only when someone climbs past their best tier so far', () => {
  const t = tierPage({ tier: '' });                            // a new account: no tier yet
  t.noteTier('admin'); t.noteTier('admin'); t.noteTier('owner'); t.noteTier('admin'); t.noteTier('owner');
  assert.deepEqual(t.fired, ['admin', 'owner'], 'none → admin → owner, each once');
  assert.equal(t.prefs.tier, 'owner', 'kept in the vault prefs, which the server can only see encrypted');
});

test('an account from before the hook records its tier silently the first time, then fires only on a climb', () => {
  const t = tierPage({});
  t.noteTier('admin');
  assert.deepEqual(t.fired, [], 'no card for a role held before anyone was counting');
  assert.equal(t.prefs.tier, 'admin');
  t.noteTier('owner');
  assert.deepEqual(t.fired, ['owner']);
});

test('a tier seen before the vault is open waits for it', () => {
  const t = tierPage({ tier: '' });
  t.S.contactsReady = false;
  t.noteTier('admin'); t.noteTier('owner'); t.noteTier('admin');
  assert.deepEqual(t.fired, []);
  assert.deepEqual(t.flush(), { h: 'alice', t: 'owner' }, 'the highest one is kept for when the vault opens');
});
