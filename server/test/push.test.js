// Ringing when the app is closed, the server's part: one push address per iPhone device (push.set / push.clear),
// random wake tickets pointing at it (wake.mint / wake.revoke), the lookup POST /wake uses, and the rows dying with
// logout, device removal and account deletion. The server never learns who holds which ticket. Release 65 adds the
// alert token (push.set kind alert, the apush table) and message tickets (wake.mint k m) for the "New message" nudge.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { startServer, connect, connectAs, signup, makeIdentity, makeDevice } from './helpers.js';
import { log } from '../src/log.js';

let S;
const APNS = { enabled: true, sent: [], close() {}, send(x) { APNS.sent.push(x); return Promise.resolve({ status: 200, reason: '' }); } };   // Apple, standing in
before(async () => { S = await startServer({ authz: 'standard', apns: APNS, limits: { ticketsPerDevice: 3, proveFailsPer10Min: 100 } }); });
after(async () => { await S.stop(); });

const TOKEN = 'ab'.repeat(32), TOKEN2 = 'ef'.repeat(32), ALERT = 'cd'.repeat(32), ALERT2 = '12'.repeat(32), TICKET = /^[A-Za-z0-9_-]{22}$/;
const rows = (t, h) => S.srv.store.db.prepare(`SELECT dev, tok, env FROM ${t} WHERE h = ? ORDER BY dev`).all(h).map((r) => ({ ...r }));   // plain objects: sqlite rows have no prototype
const pushRows = (h) => rows('push', h), apushRows = (h) => rows('apush', h);
const wakeRows = (h, dev) => S.srv.store.db.prepare('SELECT tk FROM wake WHERE h = ? AND dev = ?').all(h, dev).map((r) => r.tk);
// An account with two devices listed, and a connection for each: the account key (signed up) and device 1.
async function withDevices(name) {
  const id = await makeIdentity(name), A = await signup(S.url, id);
  const d1 = { ...await makeDevice(id), tok: TOKEN, atok: ALERT }, d2 = { ...await makeDevice(id), tok: TOKEN2, atok: ALERT2 };   // a phone's tokens are its own
  await A.ok('update', { p: 'directory/' + name, d: { devs: { [d1.id]: d1.entry, [d2.id]: d2.entry } } });
  return { id, A, d1, d2, D1: await connectAs(S.url, id, { dev: d1 }) };
}

test('push.set: from the account key or the device itself; not for an unlisted device, nor for another device from a device', async () => {
  const { A, d1, d2, D1 } = await withDevices('alice');
  await A.ok('push.set', { dev: d1.id, tok: TOKEN.toUpperCase(), env: 'prod' });
  assert.deepEqual(pushRows('alice'), [{ dev: d1.id, tok: TOKEN, env: 'prod' }], 'stored lower-case');
  await D1.ok('push.set', { dev: d1.id, tok: TOKEN, env: 'sandbox' });
  assert.deepEqual(pushRows('alice'), [{ dev: d1.id, tok: TOKEN, env: 'sandbox' }], 'one row per device, replaced');
  assert.equal((await D1.call('push.set', { dev: d2.id, tok: TOKEN, env: 'prod' })).e, 'denied', 'a device speaks for itself only');
  assert.equal((await A.call('push.set', { dev: 'devNotListed', tok: TOKEN, env: 'prod' })).e, 'denied');
  assert.equal((await A.call('push.set', { dev: d1.id, tok: 'zz'.repeat(32), env: 'prod' })).e, 'invalid', 'a token is 64 hex characters');
  assert.equal((await A.call('push.set', { dev: d1.id, tok: TOKEN, env: 'dev' })).e, 'invalid');
  assert.equal((await A.call('push.set', { dev: 'no', tok: TOKEN, env: 'prod' })).e, 'invalid');
  assert.equal((await D1.call('wake.mint', { dev: d2.id })).e, 'denied');
  await A.close(); await D1.close();
});

test('wake.mint and wake.revoke: n distinct tickets up to ticketsPerDevice; only the owner revokes; lookup joins the push row', async () => {
  const { A, d1, D1 } = await withDevices('bob');
  await D1.ok('push.set', { dev: d1.id, tok: TOKEN, env: 'prod' });
  const { tickets } = await D1.ok('wake.mint', { dev: d1.id, n: 2 });
  assert.equal(tickets.length, 2);
  assert.notEqual(tickets[0], tickets[1]);
  for (const tk of tickets) assert.match(tk, TICKET);
  assert.equal((await A.ok('wake.mint', { dev: d1.id })).tickets.length, 1, 'n defaults to 1');
  assert.equal((await A.call('wake.mint', { dev: d1.id })).e, 'ratelimit', 'the fourth is one too many here');
  assert.equal((await A.call('wake.mint', { dev: d1.id, n: 0 })).e, 'invalid');
  assert.equal((await A.call('wake.mint', { dev: d1.id, n: 21 })).e, 'invalid');
  assert.deepEqual(S.srv.store.wakeLookup(tickets[0]), { h: 'bob', dev: d1.id, k: 'c', tok: TOKEN, env: 'prod' });
  assert.equal(S.srv.store.wakeLookup('A'.repeat(22)), null);
  const other = await signup(S.url, await makeIdentity('mallory'));
  assert.deepEqual(await other.call('wake.revoke', { tk: tickets[0] }).then((r) => r.ok), true, 'the same answer whether or not it was theirs');
  assert.ok(S.srv.store.wakeLookup(tickets[0]), 'someone else cannot revoke it');
  assert.equal((await A.call('wake.revoke', { tk: 'short' })).e, 'invalid');
  await A.ok('wake.revoke', { tk: tickets[0] });
  assert.equal(S.srv.store.wakeLookup(tickets[0]), null);
  assert.equal(wakeRows('bob', d1.id).length, 2);
  await A.ok('wake.mint', { dev: d1.id });   // room again
  // Apple reported the address dead: the tickets stay, do nothing, and work again once the device registers.
  S.srv.store.pushDrop({ h: 'bob', dev: d1.id });
  assert.equal(S.srv.store.wakeLookup(tickets[1]), null);
  assert.equal(wakeRows('bob', d1.id).length, 3);
  await D1.ok('push.set', { dev: d1.id, tok: TOKEN, env: 'prod' });
  assert.equal(S.srv.store.wakeLookup(tickets[1]).tok, TOKEN);
  await A.close(); await D1.close(); await other.close();
});

test('push.clear: removes the address and the device’s tickets; another device’s rows survive; a removed device may still clear', async () => {
  const { A, d1, d2, D1 } = await withDevices('carol');
  for (const d of [d1, d2]) { await A.ok('push.set', { dev: d.id, tok: d.tok, env: 'prod' }); await A.ok('push.set', { dev: d.id, tok: d.atok, env: 'prod', kind: 'alert' }); await A.ok('wake.mint', { dev: d.id, n: 2 }); }
  const [t1] = wakeRows('carol', d1.id), [t2] = wakeRows('carol', d2.id);
  await D1.ok('push.clear', { dev: d1.id });
  assert.deepEqual(pushRows('carol'), [{ dev: d2.id, tok: TOKEN2, env: 'prod' }]);
  assert.deepEqual(apushRows('carol'), [{ dev: d2.id, tok: ALERT2, env: 'prod' }], 'the alert row goes with the VoIP one');
  assert.deepEqual(wakeRows('carol', d1.id), []);
  assert.equal(S.srv.store.wakeLookup(t1), null);
  assert.equal(S.srv.store.wakeLookup(t2).dev, d2.id);
  assert.equal((await D1.call('push.clear', { dev: d2.id })).e, 'denied');
  // Taken off the account: its rows went with the directory write, and clearing again is still allowed and harmless.
  await A.ok('update', { p: 'directory/carol', d: { devs: { [d2.id]: null } } });
  assert.deepEqual(pushRows('carol'), []);
  assert.deepEqual(apushRows('carol'), []);
  assert.equal(S.srv.store.wakeLookup(t2), null);
  assert.deepEqual(wakeRows('carol', d2.id), []);
  await A.ok('push.clear', { dev: d2.id });
  assert.equal((await A.call('push.set', { dev: d2.id, tok: TOKEN, env: 'prod' })).e, 'denied', 'but not registering again');
  await A.close(); await D1.close();
});

test('cascade: a device dropped from devs by a whole-document write loses its rows too; the other device keeps them', async () => {
  const { A, d1, d2, D1 } = await withDevices('dave');
  for (const d of [d1, d2]) { await A.ok('push.set', { dev: d.id, tok: d.tok, env: 'prod' }); await A.ok('push.set', { dev: d.id, tok: d.atok, env: 'prod', kind: 'alert' }); await A.ok('wake.mint', { dev: d.id }); }
  const dir = (await A.ok('get', { p: 'directory/dave' })).d;
  await A.ok('set', { p: 'directory/dave', d: { ...dir, devs: { [d2.id]: d2.entry } } });
  assert.deepEqual(pushRows('dave'), [{ dev: d2.id, tok: TOKEN2, env: 'prod' }]);
  assert.deepEqual(apushRows('dave'), [{ dev: d2.id, tok: ALERT2, env: 'prod' }]);
  assert.deepEqual(wakeRows('dave', d1.id), []);
  assert.equal(wakeRows('dave', d2.id).length, 1);
  await A.ok('set', { p: 'directory/dave', d: { ...dir, devs: undefined } });   // no devs map at all: every device is gone
  assert.deepEqual(pushRows('dave'), []);
  assert.deepEqual(apushRows('dave'), []);
  assert.deepEqual(wakeRows('dave', d2.id), []);
  await A.close(); await D1.close();
});

test('account.delete: every push and wake row of the account goes', async () => {
  const { id, A, d1, d2, D1 } = await withDevices('erin');
  for (const d of [d1, d2]) { await A.ok('push.set', { dev: d.id, tok: d.tok, env: 'prod' }); await A.ok('push.set', { dev: d.id, tok: d.atok, env: 'prod', kind: 'alert' }); await A.ok('wake.mint', { dev: d.id, n: 2 }); }
  const [tk] = wakeRows('erin', d1.id);
  const E = await connectAs(S.url, id);   // the account key itself, not the sign-up proof
  await E.ok('account.delete', {});
  assert.deepEqual(pushRows('erin'), []);
  assert.deepEqual(apushRows('erin'), []);
  assert.equal(Number(S.srv.store.db.prepare('SELECT COUNT(*) AS n FROM wake WHERE h = ?').get('erin').n), 0);
  assert.equal(S.srv.store.wakeLookup(tk), null);
  await A.closed; await D1.closed; await E.close();
});

test('push.set kind alert: the alert token in a table of its own beside the VoIP one; a token registered again by another account or device moves there; a bad kind is invalid', async () => {
  const { A, d1, d2, D1 } = await withDevices('fay');
  await D1.ok('push.set', { dev: d1.id, tok: TOKEN, env: 'prod' });
  await D1.ok('push.set', { dev: d1.id, tok: ALERT.toUpperCase(), env: 'prod', kind: 'alert' });
  const [tk] = (await D1.ok('wake.mint', { dev: d1.id })).tickets;
  assert.deepEqual(pushRows('fay'), [{ dev: d1.id, tok: TOKEN, env: 'prod' }], 'the VoIP row is not touched');
  assert.deepEqual(apushRows('fay'), [{ dev: d1.id, tok: ALERT, env: 'prod' }], 'stored lower-case, like the other');
  await D1.ok('push.set', { dev: d1.id, tok: ALERT, env: 'sandbox', kind: 'alert' });
  assert.deepEqual(apushRows('fay'), [{ dev: d1.id, tok: ALERT, env: 'sandbox' }], 'one row per device, replaced');
  await A.ok('push.set', { dev: d1.id, tok: TOKEN, env: 'prod', kind: 'voip' });
  assert.deepEqual(pushRows('fay'), [{ dev: d1.id, tok: TOKEN, env: 'prod' }], 'voip is the default, said or not');
  for (const kind of ['sms', '', 7, null]) assert.equal((await A.call('push.set', { dev: d1.id, tok: ALERT, env: 'prod', kind })).e, 'invalid');
  assert.equal((await A.call('push.clear', { dev: d1.id, kind: 'voice' })).e, 'invalid');
  assert.equal((await A.call('push.set', { dev: d1.id, tok: 'zz'.repeat(32), env: 'prod', kind: 'alert' })).e, 'invalid', 'the same token check');
  assert.equal((await D1.call('push.set', { dev: d2.id, tok: ALERT, env: 'prod', kind: 'alert' })).e, 'denied', 'the same device rules');
  // The same phone registered under a second account, the one in use now: a token has one home, the latest, per table.
  const G = await withDevices('gus');
  await G.D1.ok('push.set', { dev: G.d1.id, tok: ALERT, env: 'sandbox', kind: 'alert' });
  assert.deepEqual(apushRows('fay'), []);
  assert.deepEqual(apushRows('gus'), [{ dev: G.d1.id, tok: ALERT, env: 'sandbox' }]);
  assert.deepEqual(pushRows('fay'), [{ dev: d1.id, tok: TOKEN, env: 'prod' }], 'the VoIP table keeps its own count');
  await G.D1.ok('push.set', { dev: G.d1.id, tok: TOKEN, env: 'prod' });
  assert.deepEqual(pushRows('fay'), []);
  assert.deepEqual(pushRows('gus'), [{ dev: G.d1.id, tok: TOKEN, env: 'prod' }]);
  assert.equal(S.srv.store.wakeLookup(tk), null, 'fay\'s tickets stay and do nothing...');
  assert.equal(wakeRows('fay', d1.id).length, 1);
  await D1.ok('push.set', { dev: d1.id, tok: TOKEN, env: 'prod' });
  assert.equal(S.srv.store.wakeLookup(tk).tok, TOKEN, '...until fay registers again, and then gus\'s row is the one gone');
  assert.deepEqual(pushRows('gus'), []);
  await A.ok('push.set', { dev: d2.id, tok: TOKEN, env: 'prod' });
  assert.deepEqual(pushRows('fay'), [{ dev: d2.id, tok: TOKEN, env: 'prod' }], 'the same under one account: the token moved to the other device');
  await A.close(); await D1.close(); await G.A.close(); await G.D1.close();
});

test('a token moving to another account is logged as a count and nothing else: no handle, device or token (release 78)', async () => {
  const lines = [], TOKEN3 = '34'.repeat(32);
  log.setSink((l) => lines.push(l)); log.setEnabled(true);
  try {
    const X = await withDevices('uma'), Y = await withDevices('vic');
    await X.D1.ok('push.set', { dev: X.d1.id, tok: TOKEN3, env: 'prod' });
    await X.D1.ok('push.set', { dev: X.d1.id, tok: TOKEN3, env: 'prod' });   // the same row again: nothing moved
    await Y.D1.ok('push.set', { dev: Y.d1.id, tok: TOKEN3, env: 'prod' });   // the phone now signed in as jon
    assert.deepEqual(pushRows('uma'), []); assert.deepEqual(pushRows('vic'), [{ dev: Y.d1.id, tok: TOKEN3, env: 'prod' }]);
    const ev = lines.filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)).filter((e) => e.event === 'push.moved');
    assert.deepEqual(ev.map((e) => [e.level, e.n]), [['info', 1]], 'once, with the count');
    assert.deepEqual(Object.keys(ev[0]).sort(), ['event', 'level', 'n', 't'], 'time, level, event, count: no other field');
    assert.ok(!lines.some((l) => /uma|vic|3434|dev/.test(l)), 'nothing identifying in any line');
    await X.A.close(); await X.D1.close(); await Y.A.close(); await Y.D1.close();
  } finally { log.setEnabled(false); }
});

test('wake.mint k: a message ticket (m) looks up the alert token, a call ticket (c, the default) the VoIP one, neither without its row; both kinds share ticketsPerDevice; a dead token drops one table; POST /wake with an m ticket sends the alert', async () => {
  const { A, d1, D1 } = await withDevices('hal');
  assert.equal((await A.call('wake.mint', { dev: d1.id, k: 'x' })).e, 'invalid');
  assert.equal((await A.call('wake.mint', { dev: d1.id, k: 1 })).e, 'invalid');
  const [m] = (await D1.ok('wake.mint', { dev: d1.id, k: 'm' })).tickets, [c] = (await D1.ok('wake.mint', { dev: d1.id })).tickets;
  assert.deepEqual(S.srv.store.db.prepare('SELECT tk, k FROM wake WHERE h = ? ORDER BY k').all('hal').map((r) => [r.tk, r.k]), [[c, 'c'], [m, 'm']]);
  assert.equal(S.srv.store.wakeLookup(m), null, 'no alert token yet: the ticket is as good as none');
  assert.equal(S.srv.store.wakeLookup(c), null);
  await D1.ok('push.set', { dev: d1.id, tok: TOKEN, env: 'prod' });
  assert.equal(S.srv.store.wakeLookup(m), null, 'a VoIP token does not serve a message ticket');
  assert.deepEqual(S.srv.store.wakeLookup(c), { h: 'hal', dev: d1.id, k: 'c', tok: TOKEN, env: 'prod' });
  await D1.ok('push.set', { dev: d1.id, tok: ALERT, env: 'sandbox', kind: 'alert' });
  assert.deepEqual(S.srv.store.wakeLookup(m), { h: 'hal', dev: d1.id, k: 'm', tok: ALERT, env: 'sandbox' });
  await A.ok('wake.mint', { dev: d1.id, k: 'c' });
  assert.equal((await A.call('wake.mint', { dev: d1.id, k: 'm' })).e, 'ratelimit', 'three of either kind fill the device');
  S.srv.store.pushDrop({ h: 'hal', dev: d1.id, k: 'm' });
  assert.deepEqual(apushRows('hal'), []);
  assert.deepEqual(pushRows('hal'), [{ dev: d1.id, tok: TOKEN, env: 'prod' }]);
  assert.equal(S.srv.store.wakeLookup(m), null);
  assert.equal(S.srv.store.wakeLookup(c).tok, TOKEN);
  S.srv.store.pushDrop({ h: 'hal', dev: d1.id, k: 'c' });
  assert.deepEqual(pushRows('hal'), []);
  assert.equal(wakeRows('hal', d1.id).length, 3, 'the tickets outlive both');
  await D1.ok('push.set', { dev: d1.id, tok: ALERT, env: 'prod', kind: 'alert' });
  APNS.sent.length = 0;
  const post = (tk) => fetch(S.httpUrl + '/wake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tk }) });
  assert.equal((await post(m)).status, 204);
  assert.deepEqual(APNS.sent, [{ tok: ALERT, payload: { aps: { alert: 'New message', sound: 'default' } }, kind: 'alert' }]);
  assert.equal((await post(c)).status, 204);
  assert.equal(APNS.sent.length, 1, 'the call ticket has no VoIP token now: silence');
  await A.close(); await D1.close();
});

test('push.clear kinds: alert takes the alert row alone and leaves the tickets; the default takes the VoIP row, the alert row and every ticket of the device', async () => {
  const { A, d1, d2, D1 } = await withDevices('ivy');
  for (const d of [d1, d2]) {
    await A.ok('push.set', { dev: d.id, tok: d.tok, env: 'prod' }); await A.ok('push.set', { dev: d.id, tok: d.atok, env: 'prod', kind: 'alert' });
    await A.ok('wake.mint', { dev: d.id }); await A.ok('wake.mint', { dev: d.id, k: 'm' });
  }
  await D1.ok('push.clear', { dev: d1.id, kind: 'alert' });
  assert.deepEqual(apushRows('ivy'), [{ dev: d2.id, tok: ALERT2, env: 'prod' }]);
  assert.deepEqual(pushRows('ivy').map((r) => r.dev).sort(), [d1.id, d2.id].sort(), 'the VoIP row stays');
  assert.equal(wakeRows('ivy', d1.id).length, 2, 'and so do both tickets');
  assert.equal((await D1.call('push.clear', { dev: d2.id, kind: 'alert' })).e, 'denied');
  await D1.ok('push.clear', { dev: d1.id });
  assert.deepEqual(pushRows('ivy'), [{ dev: d2.id, tok: TOKEN2, env: 'prod' }]);
  assert.deepEqual(wakeRows('ivy', d1.id), []);
  await A.ok('push.clear', { dev: d2.id });
  assert.deepEqual(apushRows('ivy'), []);
  assert.deepEqual(pushRows('ivy'), []);
  assert.deepEqual(wakeRows('ivy', d2.id), []);
  await A.close(); await D1.close();
});

test('unauth: a connection that has not signed in, or signed up without creating the account, gets unauth', async () => {
  const c = await connect(S.url);
  await c.hello();
  for (const op of ['push.set', 'push.clear', 'wake.mint', 'wake.revoke']) assert.equal((await c.call(op, { dev: 'devNoOne1', tok: TOKEN, env: 'prod', tk: 'A'.repeat(22) })).e, 'unauth');
  const reserved = await connectAs(S.url, await makeIdentity('nobody'), { pub: true });
  assert.equal((await reserved.call('push.set', { dev: 'devNoOne1', tok: TOKEN, env: 'prod' })).e, 'unauth');
  await c.close(); await reserved.close();
});
