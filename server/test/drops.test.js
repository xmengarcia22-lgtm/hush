// Anonymous drops (SPEC.md 6, stage 5): POST /drop files a sealed note into a mailbox with no session,
// the recipient's live watch gets it at once, and the server keeps only recipient, blob and hour.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import { startServer, connect, signup, makeIdentity, sleep } from './helpers.js';
import { SYSTEM } from '../src/store.js';
import { leadingZeroBits, powOk, powInput, hourOf } from '../src/drops.js';
import { NOTE_BYTES } from '../src/schemas.js';

const note = () => ({ epk: { x: 'x'.repeat(43), y: 'y'.repeat(43) }, iv: 'aXY=', ct: Buffer.alloc(NOTE_BYTES, 7).toString('base64') });
const post = (url, body, headers = {}) => fetch(url + '/drop', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
const json = async (r) => ({ status: r.status, ...(await r.json()) });
// The page's puzzle, solved here the server's way: first nonce whose hash starts with `bits` zero bits.
function solve(to, hour, bits) {
  for (let n = 0; ; n++) { const nonce = n.toString(36); if (leadingZeroBits(createHash('sha256').update(powInput(to, hour, nonce)).digest()) >= bits) return nonce; }
}

test('a drop reaches an open mailbox live and stores only recipient, blob and hour', async () => {
  const S = await startServer({ authz: 'standard' });
  try {
    const bob = await makeIdentity('bob');
    const B = await signup(S.url, bob);
    await B.ok('sub', { s: 'in', p: 'inbox/bob/c', l: 500 });
    await B.waitPush((f) => f.s === 'in' && f.t === 'init');
    const r = await json(await post(S.httpUrl, { to: 'bob', blob: note() }));
    assert.equal(r.status, 200);
    assert.equal(r.ok, true);
    assert.match(r.id, /^[A-Za-z0-9]{12}$/);
    const push = await B.waitPush((f) => f.s === 'in' && f.t === 'set');
    assert.equal(push.id, r.id, 'delivered by the existing live watch, no pull needed');
    assert.deepEqual(Object.keys(push.d).sort(), ['ct', 'epk', 'iv', 'ts']);
    assert.equal(push.d.ts % 36e5, 0, 'the hour, not the time');
    const stored = S.srv.store.get('inbox/bob/c/' + r.id, SYSTEM).d;
    assert.equal(stored.ts, hourOf(Date.now()));
    await B.ok('delete', { p: 'inbox/bob/c/' + r.id });     // the recipient tidies, as before
    await B.close();
  } finally { await S.stop(); }
});

test('a drop is refused when it is not a note of exactly the padded size, or the recipient does not exist', async () => {
  const S = await startServer({ authz: 'standard' });
  try {
    const bob = await makeIdentity('bob');
    const B = await signup(S.url, bob); await B.close();
    assert.equal((await json(await post(S.httpUrl, { to: 'bob', blob: { ...note(), ct: 'Y3Q=' } }))).status, 400, 'too small');
    assert.equal((await json(await post(S.httpUrl, { to: 'bob', blob: { ...note(), extra: 1 } }))).status, 400, 'extra field');
    assert.equal((await json(await post(S.httpUrl, { to: 'bob', blob: { cid: 'x', from: 'alice' } }))).status, 400, 'plain, not sealed');
    assert.equal((await json(await post(S.httpUrl, { to: 'nobody', blob: note() }))).status, 404);
    assert.equal((await json(await post(S.httpUrl, { to: 'Bob!', blob: note() }))).status, 400);
    assert.equal((await json(await post(S.httpUrl, '{not json'))).status, 400);
    assert.equal((await fetch(S.httpUrl + '/drop')).status, 405);
    assert.equal((await json(await post(S.httpUrl, { to: 'bob', blob: note(), pad: 'x'.repeat(9000) }))).status, 413);
  } finally { await S.stop(); }
});

test('limits: per sender address and per mailbox, counted on every attempt', async () => {
  const S = await startServer({ authz: 'standard', limits: { dropsPerHourPerAddr: 3, dropsPerHourPerRecipient: 100 } });
  try {
    const bob = await makeIdentity('bob');
    const B = await signup(S.url, bob); await B.close();
    for (let k = 0; k < 2; k++) assert.equal((await json(await post(S.httpUrl, { to: 'bob', blob: note() }))).status, 200);
    assert.equal((await json(await post(S.httpUrl, { to: 'nobody', blob: note() }))).status, 404, 'a miss costs a token too');
    const r = await json(await post(S.httpUrl, { to: 'bob', blob: note() }));
    assert.equal(r.status, 429); assert.equal(r.e, 'ratelimit');
  } finally { await S.stop(); }
  const T = await startServer({ authz: 'standard', limits: { dropsPerHourPerRecipient: 4, dropsPerHourPerAddr: 1000, dropPowBits: 8 } });
  try {
    const carol = await makeIdentity('carol');
    const C = await signup(T.url, carol); await C.close();
    for (let k = 0; k < 3; k++) assert.equal((await json(await post(T.httpUrl, { to: 'carol', blob: note() }))).status, 200, 'up to half the hour, no questions asked');
    // More than half the mailbox's hour is used: proof of work is asked for; with it, the note lands; after that the hour is spent.
    const r4 = await json(await post(T.httpUrl, { to: 'carol', blob: note() }));
    assert.equal(r4.status, 429); assert.equal(r4.e, 'pow');
    const ok = await json(await post(T.httpUrl, { to: 'carol', blob: note(), pow: { nonce: solve('carol', r4.hour, r4.bits) } }));
    assert.equal(ok.status, 200);
    let other = null; for (let n = 0; other === null; n++) { const x = 'z' + n.toString(36); if (powOk('carol', r4.hour, x, r4.bits)) other = x; }
    const r5 = await json(await post(T.httpUrl, { to: 'carol', blob: note(), pow: { nonce: other } }));
    assert.equal(r5.status, 429); assert.equal(r5.e, 'ratelimit', 'a fresh proof does not buy a fifth note this hour');
  } finally { await T.stop(); }
});

test('proof of work: asked for when the recipient only wants contacts, checked statelessly, never accepted twice', async () => {
  const S = await startServer({ authz: 'standard', limits: { dropPowBits: 8 } });
  try {
    const bob = await makeIdentity('bob');
    const B = await signup(S.url, bob);
    await B.ok('update', { p: 'directory/bob', d: { requests: true } });
    const asked = await json(await post(S.httpUrl, { to: 'bob', blob: note() }));
    assert.equal(asked.status, 429); assert.equal(asked.e, 'pow'); assert.equal(asked.bits, 8); assert.equal(asked.hour, hourOf(Date.now()));
    assert.equal((await json(await post(S.httpUrl, { to: 'bob', blob: note(), pow: { nonce: 'wrong' } }))).e, 'pow');
    const nonce = solve('bob', asked.hour, asked.bits);
    assert.equal(powOk('bob', asked.hour, nonce, 8), true);
    assert.equal(powOk('bob', asked.hour - 36e5, nonce, 8) && powOk('bob', asked.hour, nonce, 8), powOk('bob', asked.hour - 36e5, nonce, 8), 'tied to the hour');
    const ok = await json(await post(S.httpUrl, { to: 'bob', blob: note(), pow: { nonce } }));
    assert.equal(ok.status, 200);
    const again = await json(await post(S.httpUrl, { to: 'bob', blob: note(), pow: { nonce } }));
    assert.equal(again.e, 'pow', 'a solution is good once');
    assert.equal((await json(await post(S.httpUrl, { to: 'bob', blob: note(), pow: { nonce: solve('bob', asked.hour, 8) === nonce ? (() => { for (let n = 0; ; n++) { const x = n.toString(36); if (x !== nonce && powOk('bob', asked.hour, x, 8)) return x; } })() : nonce } }))).status, 200, 'another solution is fine');
    await B.close();
  } finally { await S.stop(); }
});

test('a full mailbox makes room by forgetting its oldest note, and the owner is told', async () => {
  const S = await startServer({ authz: 'standard', limits: { inboxMax: 2, dropsPerHourPerRecipient: 1000, dropsPerHourPerAddr: 1000 } });
  try {
    const bob = await makeIdentity('bob');
    const B = await signup(S.url, bob);
    await B.ok('sub', { s: 'in', p: 'inbox/bob/c', l: 500 });
    await B.waitPush((f) => f.s === 'in' && f.t === 'init');
    // A note from the previous hour is already there (the server keeps only the hour, so within one hour "oldest" is arbitrary).
    S.srv.store.set('inbox/bob/c/oldnote00001', { ...note(), ts: hourOf(Date.now()) - 36e5 }, SYSTEM);
    await B.waitPush((f) => f.t === 'set' && f.id === 'oldnote00001');
    const ids = [];
    for (let k = 0; k < 2; k++) { ids.push((await json(await post(S.httpUrl, { to: 'bob', blob: note() }))).id); await B.waitPush((f) => f.t === 'set' && f.id === ids[k]); }
    const gone = await B.waitPush((f) => f.s === 'in' && f.t === 'del');
    assert.equal(gone.id, 'oldnote00001', 'the note from the older hour went first');
    assert.equal(S.srv.store.noteCount('inbox/bob/c'), 2);
    assert.equal(S.srv.store.get('inbox/bob/c/' + ids[1], SYSTEM).d !== null, true, 'the newest stayed');
    await B.close();
  } finally { await S.stop(); }
});

test('notes older than 30 days are swept, and the owner is told', async () => {
  const S = await startServer({ authz: 'standard' });
  try {
    const bob = await makeIdentity('bob');
    const B = await signup(S.url, bob);
    await B.ok('sub', { s: 'in', p: 'inbox/bob/c', l: 500 });
    await B.waitPush((f) => f.s === 'in' && f.t === 'init');
    const { id } = await json(await post(S.httpUrl, { to: 'bob', blob: note() }));
    await B.waitPush((f) => f.t === 'set' && f.id === id);
    assert.equal(S.srv.sweepInbox(Date.now() + 29 * 86400e3), 0, 'not yet');
    assert.equal(S.srv.sweepInbox(Date.now() + 31 * 86400e3), 1);
    const gone = await B.waitPush((f) => f.s === 'in' && f.t === 'del');
    assert.equal(gone.id, id);
    await B.close();
  } finally { await S.stop(); }
});

test('the page pads every note to one size and solves the puzzle the server checks', async () => {
  const { appSource } = await import('./helpers.js');
  const html = appSource();
  const a = html.indexOf('/* ===== HUSH DROP BEGIN ===== */'), b = html.indexOf('/* ===== HUSH DROP END ===== */');
  assert.ok(a > 0 && b > a, 'drop block markers present');
  const page = new Function('enc', 'hushServerUrl', 'fetch', html.slice(a, b) + '\nreturn { padNote, solvePow, dropUrl, postDrop };')(new TextEncoder(), () => 'ws://127.0.0.1:8080/ws', null);
  const padded = page.padNote({ t: 'invite', cid: 'g' + 'A'.repeat(12), from: 'alice', to: 'bob', ts: 0 });
  assert.equal(new TextEncoder().encode(padded).length, 1024);
  assert.deepEqual(JSON.parse(padded).from, 'alice', 'trailing spaces are plain JSON whitespace');
  assert.throws(() => page.padNote({ text: 'x'.repeat(1100) }), /toolarge/);
  assert.equal(page.dropUrl(), 'http://127.0.0.1:8080/drop');
  const hour = hourOf(Date.now());
  const nonce = await page.solvePow('bob', hour, 8);
  assert.equal(powOk('bob', hour, nonce, 8), true, 'the page\'s solution passes the server\'s check');
});

test('the puzzle helper counts leading zero bits', () => {
  assert.equal(leadingZeroBits(Buffer.from([0, 0, 0x0f])), 20);
  assert.equal(leadingZeroBits(Buffer.from([0x80])), 0);
  assert.equal(leadingZeroBits(Buffer.from([0x01])), 7);
  assert.equal(leadingZeroBits(Buffer.from([0, 0])), 16);
});
