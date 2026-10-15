// Reports (SPEC.md 8.7): a post in a public group or channel can be reported; the server keeps its own copy of the post,
// that epoch's published key and the reason, never the reporter; only the operator's HUSH_OWNERS read them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { parseOwners, loadConfig } from '../src/config.js';
import { startServer, connect, connectAs, signup, makeIdentity, cap, channelDoc, groupDoc, dmDoc, createChat } from './helpers.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');
const post = (over = {}) => ({ sl: 1, ts: Date.now(), e: 0, n: 'bm9uY2U=', d: 'Y2lwaGVy', oh: sha('t0'), on: 0, ...over });
const svc = () => ({ sv: 1, ts: Date.now(), e: 0, n: 'n', d: 'd' });
const OPEN_KEY = 'k'.repeat(44);
const pubChannel = (over = {}) => channelDoc({ visibility: 'public', name: 'News', desc: 'd', owner: 'alice', admins: [], meta: undefined, openKeys: { 0: OPEN_KEY }, ...over });
const PUB = 'cRepPublic001', PID = 'rEpPost00001';
const DAY = 86400_000;

let S, skew = 0, alice, bob, olivia, A, B, O;
before(async () => {
  S = await startServer({ authz: 'standard', owners: ['olivia'], now: () => Date.now() + skew, limits: { reportsPerMin: 1000 } });
  [alice, bob, olivia] = await Promise.all([makeIdentity('alice'), makeIdentity('bob'), makeIdentity('olivia')]);
  A = await signup(S.url, alice);
  B = await signup(S.url, bob);
  O = await signup(S.url, olivia);
  await createChat(A, PUB, pubChannel());
  await A.ok('set', { p: `channels/${PUB}/posts/${PID}`, d: post() });
});
after(async () => { await A.close(); await B.close(); await O.close(); await S.stop(); });

const rows = () => S.srv.store.db.prepare('SELECT * FROM reports').all();

test('a post in a public channel can be reported; the owner reads the server\'s own copy, never the reporter', async () => {
  // The reporter never opened the channel: anyone may read a public one.
  const res = await B.ok('report.send', { cid: PUB, pid: PID, reason: 'spam', post: { forged: 1 }, key: 'x', name: 'Fake' });
  assert.deepEqual(Object.keys(res).sort(), ['i', 'ok']);
  await B.ok('report.send', { cid: PUB, pid: PID, reason: 'abuse' });   // the same person, the same post: still one row
  assert.equal(rows().length, 1);
  const stored = JSON.parse(S.srv.store.db.prepare('SELECT d FROM docs WHERE path = ?').get(`channels/${PUB}/posts/${PID}`).d);
  const { reports } = await O.ok('report.list', {});
  assert.equal(reports.length, 1);
  const r = reports[0];
  assert.deepEqual(Object.keys(r).sort(), ['cid', 'id', 'key', 'name', 'pid', 'post', 'reason', 'ts']);
  assert.equal(r.cid, PUB); assert.equal(r.pid, PID); assert.equal(r.reason, 'spam'); assert.equal(r.name, 'News');
  assert.deepEqual(r.post, stored, 'the server\'s copy, not what the client sent');
  assert.equal(r.key, OPEN_KEY, 'the published key of the post\'s epoch');
  const json = JSON.stringify(reports);
  assert.ok(!json.includes('bob'), 'no reporter handle anywhere');
  assert.ok(!json.includes(rows()[0].tag), 'and never the tag');
  assert.ok(!JSON.stringify(rows()).includes('bob'), 'nor in the table');
  await A.ok('report.send', { cid: PUB, pid: PID, reason: 'other' });   // someone else: a second row
  assert.equal(rows().length, 2);
  assert.equal((await O.ok('report.list', { limit: 1 })).reports.length, 1);
  const all = (await O.ok('report.list', {})).reports;
  assert.ok(all[0].ts >= all[1].ts, 'newest first');
  assert.deepEqual((await O.ok('report.list', { before: all[0].ts })).reports.map((x) => x.id), all.filter((x) => x.ts < all[0].ts).map((x) => x.id));
  assert.equal((await O.call('report.list', { limit: 0 })).e, 'invalid');
  assert.equal((await O.call('report.list', { before: 'x' })).e, 'invalid');
  assert.equal((await O.ok('report.list', { limit: 5000 })).reports.length, 2, 'a big limit is capped, not refused');
});

test('DMs and private chats can never be reported, whatever the client claims', async () => {
  const DM = 'd' + 'R'.repeat(22), G = 'gRepPrivate01', C = 'cRepPrivate01', GP = 'gRepPubGrp001', CP = 'cRepWasPub001';
  await createChat(A, DM, dmDoc({ visibility: 'public' }), { m: cap() });   // a crafted DM that says it is public
  await createChat(A, G, groupDoc());
  await createChat(A, C, channelDoc());
  await createChat(A, CP, pubChannel());
  for (const cid of [DM, G, C, CP]) await A.ok('set', { p: `channels/${cid}/posts/${PID}`, d: post() });
  for (const cid of [DM, G, C]) assert.equal((await B.call('report.send', { cid, pid: PID, reason: 'spam' })).e, 'denied', cid);
  assert.equal((await B.call('report.send', { cid: DM, pid: 'nOpE00000001', reason: 'spam' })).e, 'denied', 'a missing post in a DM says nothing more');
  // A channel made private after it was public is judged by what it is now.
  await B.ok('report.send', { cid: CP, pid: PID, reason: 'spam' });
  await A.ok('update', { p: `channels/${CP}`, d: { visibility: 'private', name: null, desc: null, owner: null, admins: null } });
  assert.equal((await A.call('report.send', { cid: CP, pid: PID, reason: 'spam' })).e, 'denied');
  // A public group is a public chat like a public channel.
  await createChat(A, GP, groupDoc({ visibility: 'public', name: 'Club', owner: 'alice', admins: [], meta: undefined, openKeys: { 0: OPEN_KEY } }));
  await A.ok('set', { p: `channels/${GP}/posts/${PID}`, d: post() });
  await B.ok('report.send', { cid: GP, pid: PID, reason: 'illegal' });
});

test('unknown chats and posts, service notes and deleted posts are not found; bad input is invalid', async () => {
  await A.ok('set', { p: `channels/${PUB}/posts/sVcNote00001`, d: svc() });
  await A.ok('set', { p: `channels/${PUB}/posts/dElPost00001`, d: post({ del: true }) });
  assert.equal((await B.call('report.send', { cid: 'cNoSuchChat01', pid: PID, reason: 'spam' })).e, 'notfound');
  for (const pid of ['nOpE00000001', 'sVcNote00001', 'dElPost00001']) assert.equal((await B.call('report.send', { cid: PUB, pid, reason: 'spam' })).e, 'notfound', pid);
  for (const f of [{ reason: 'rude' }, { reason: undefined }, { reason: ['spam'] }, { pid: '../x' }, { pid: [PID] }, { cid: 'channels' }, { cid: { a: 1 } }]) {
    const r = await B.call('report.send', { cid: PUB, pid: PID, reason: 'spam', ...f });
    assert.equal(r.e, 'invalid', JSON.stringify(f));
    assert.ok(!r.m.includes('rude') && !r.m.includes('../x'), 'the message never echoes the input');
  }
});

test('signing in is needed to report; reading reports needs an operator username, signed in with an existing account', async () => {
  const anon = await connect(S.url);
  await anon.hello();
  assert.equal((await anon.call('report.send', { cid: PUB, pid: PID, reason: 'spam' })).e, 'unauth');
  assert.equal((await anon.call('report.list', {})).e, 'denied');
  await anon.close();
  assert.equal((await B.call('report.list', {})).e, 'denied');
  assert.equal((await A.call('report.list', {})).e, 'denied', 'not even the channel\'s owner');
  // A sign-up proof alone (no account yet, no puzzle paid) neither reports nor reads.
  const nobody = await connectAs(S.url, await makeIdentity('nobody'), { pub: true });
  assert.equal((await nobody.call('report.send', { cid: PUB, pid: PID, reason: 'spam' })).e, 'unauth');
  await nobody.close();
  const T = await startServer({ authz: 'standard', owners: ['ghost'] });
  try {
    const ghost = await connectAs(T.url, await makeIdentity('ghost'), { pub: true });   // an operator name nobody registered
    assert.equal((await ghost.call('report.list', {})).e, 'denied');
    await ghost.close();
  } finally { await T.stop(); }
});

test('report.list is closed to everyone else with HUSH_AUTHZ=open too', async () => {
  const T = await startServer({ authz: 'open', owners: ['olivia'] });
  try {
    const mallory = await signup(T.url, await makeIdentity('mallory'));
    assert.equal((await mallory.call('report.list', {})).e, 'denied');
    await mallory.close();
    const anon = await connect(T.url);
    await anon.hello();
    assert.equal((await anon.call('report.list', {})).e, 'denied');
    await anon.close();
    const o = await signup(T.url, await makeIdentity('olivia'));
    assert.deepEqual((await o.ok('report.list', {})).reports, []);
    await o.close();
  } finally { await T.stop(); }
});

test('reports expire after 90 days: never listed past that, and swept', async () => {
  const before = rows().length;
  assert.ok(before > 0);
  skew = 91 * DAY;
  try {
    assert.deepEqual((await O.ok('report.list', {})).reports, []);
    assert.equal(S.srv.sweepReports(), before);
    assert.equal(rows().length, 0);
  } finally { skew = 0; }
  await B.ok('report.send', { cid: PUB, pid: PID, reason: 'spam' });   // the tag went with the row: a new report counts
  const r = rows()[0];
  assert.equal(r.exp - r.ts, 90 * DAY);
  assert.equal(S.srv.sweepReports(), 0, 'a fresh one stays');
});

test('report.send is rate limited per connection', async () => {
  const T = await startServer({ authz: 'standard', limits: { reportsPerMin: 2 } });
  try {
    const a = await signup(T.url, await makeIdentity('alice'));
    await createChat(a, PUB, pubChannel());
    await a.ok('set', { p: `channels/${PUB}/posts/${PID}`, d: post() });
    await a.ok('report.send', { cid: PUB, pid: PID, reason: 'spam' });
    await a.ok('report.send', { cid: PUB, pid: PID, reason: 'spam' });
    assert.equal((await a.call('report.send', { cid: PUB, pid: PID, reason: 'spam' })).e, 'ratelimit');
    await a.close();
  } finally { await T.stop(); }
});

test('HUSH_OWNERS is a comma-separated list of usernames; anything else is refused', () => {
  assert.deepEqual(parseOwners(undefined), []);
  assert.deepEqual(parseOwners('  '), []);
  assert.deepEqual(parseOwners('olivia, @Ann_1,,olivia'), ['olivia', 'ann_1']);
  assert.deepEqual(loadConfig({ HUSH_OWNERS: 'olivia' }).owners, ['olivia']);
  assert.deepEqual(loadConfig({}).owners, []);
  assert.throws(() => parseOwners('olivia,no spaces'), /HUSH_OWNERS: "no spaces" is not a username/);
  assert.throws(() => parseOwners('ab'), /not a username/);
  assert.throws(() => parseOwners('["olivia"]'), /not a username/);
});
