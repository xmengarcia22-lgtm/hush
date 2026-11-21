// Release 109b (page): a profile read that fails while the chat watch judges new notes never deletes a note (H3-F1 of the
// release 111 review). For a one-on-one note, and a signed invitation, the note rule (noteOk) needs the person's keys; with
// none held it reads the person's profile (senderKeys, loadDir), and loadDir keeps no error: a dropped connection, a call
// that went unanswered or a refusal looked like "no such person", and the watch deleted the note once it was a week old.
//
// watchInbox, noteOk, notePointer, isBlocked, the request helpers, validHandle and loadDir run as written in app/ui.js;
// dirMiss, senderKeys and peerKeys as written in app/crypto.js. Around them, as in requests-kit.js: a note is a made-up
// plaintext handed over as if openPointer had opened it, a one-on-one address is cidOf(person) (a stand-in for the address
// both sides work out from the two keys), a signature is "signed by <person>" and holds only with that person's keys
// held, the chat records are made up, and the mailbox is handed over ordered by id. The directory answers from a made-up
// list and can be down (every read refused as offline) or cut (reads held, then all refused at once, as a lost link).
//
// WHAT IT DOES NOT SEE: the socket, its reconnect and the watch it sends again (a second snapshot stands for it), the real
// sealing and the real address of a one-on-one chat, the server's 30-day sweep, the 15-second look again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lift, ME, T, cidOf, tick, dmRec } from './requests-kit.js';

const CRYPTO = readFileSync(new URL('../../app/crypto.js', import.meta.url), 'utf8');
const clift = (from, to) => { const a = CRYPTO.indexOf(from); assert.ok(a >= 0, 'app/crypto.js holds ' + from); return CRYPTO.slice(a, CRYPTO.indexOf(to, a)); };
const CODE = [
  lift('const typeOf=', '\n'), lift('const chatRec=', '\nconst dmPeer='), lift('const dmPeer=', '\n'), lift('const isSelf=', '\n'), lift('const epochOf=', '\n'),
  lift('const dmInfo=', 'async function answerRequest('),
  lift('async function noteOk(', '/* Blocking, kept in the encrypted vault'),
  lift('const isBlocked=', '\n'), lift('const joinedPublic=', '\n'),
  lift('function notePointer(', '/* ===== HUSH INBOX RULE BEGIN ===== */'),
  lift('function pointerVerdict(', '\n'),
  lift('function watchInbox(', '/* ---------- voice calls (SPEC.md 16.2)'),
  lift('const validHandle=', '\nfunction relevantHandles('), lift('async function loadDir(', '\nlet dirBusy='),
  clift('const dirMiss=', 'async function sideOk('), clift('function peerKeys(', '\n'),
  'const sideOk=async(h,sg)=>!!(await senderKeys(h))&&sg===\'signed by \'+h;',   // as verifyBy: no keys for h, no signature holds
].join('\n');
const STUBS = ['S', 'ls', 'P', 'saveContacts', 'hiddenConv', 'openPointer', 'dmIdFor', 'dmIds', 'ksMap', 'showMeta', 'adoptOMeta', 'adminGone', 'noteChatDoc', 'convKey', 'healCard',
  'unsealPost', 'recordBase', 'dropPointer', 'noKeyNotice', 'toastErr', 'heldKey', 'codeWait', 'codeWaitEnd', 'setInterval', 'clearInterval', 'Date'];
const mk = new Function('env', `const {${STUBS.join(',')}}=env;\n${CODE}\nreturn {watchInbox,dirMiss};`);

const DAY = 864e5, OLD = T - 8 * DAY, offline = () => Object.assign(new Error('Not connected to the Hush server'), { code: 'offline' });
const keysOf = (h) => ({ handle: h, name: h, ecdh: { x: 'e' + h, y: 'e' }, sig: { x: 's' + h, y: 's' }, kv: 1 });

// bob's page, its vault read, his own profile read; no one else's keys held (`pins`: people whose keys the vault holds).
// `people`: the directory's records (a person not in it does not exist). `blocked`: people bob blocked. `how`: per person,
// 'down' (refused at once) or a number of ms the read is held before it is refused (a slow link, a timeout).
// `contacts`: false, the vault not read yet. `mine`: false, my own profile not read yet. The page's clock is the test's plus `clock.skew`.
function page({ people = [], pins = [], blocked = [], how = {}, contacts = true, mine = true } = {}) {
  const log = { deleted: [], reads: [] }, dir = Object.fromEntries(people.map((h) => [h, keysOf(h)])), net = { mode: 'up', held: [] }, clock = { skew: 0 };
  const S = { me: { handle: ME, kv: 1, ecdh: { x: 'eb' }, sig: { x: 'sb' } }, prefs: { blocked: [...blocked], dms: {} }, pins: Object.fromEntries(pins.map((h) => [h, keysOf(h)])), dmPeers: {},
    dir: mine ? { [ME]: { handle: ME, requests: false, kv: 1 } } : {}, contactsReady: contacts, vaultOk: true, rekeying: false, convs: [], invites: [], db: null };
  let inboxCb = null;
  S.db = {
    collection: () => ({ limit: () => ({ onSnapshot: (cb) => { inboxCb = cb; return () => {}; } }) }),
    doc: (path) => ({
      delete: async () => { log.deleted.push(path.split('/').pop()); },
      get: async () => { const h = path.split('/')[1]; log.reads.push(h);   // a directory read (loadDir, and the watch's own)
        if (net.mode === 'busy') throw Object.assign(new Error('slow down'), { code: 'ratelimit' });   // the link up, the read refused by the server's allowance
        if (net.mode === 'down' || how[h] === 'down') throw offline();
        if (typeof how[h] === 'number') { await tick(how[h]); throw offline(); }
        // cut: held; the link's end refuses what was out (no), a new link answers what waited for it (ok), as the adapter's call does
        if (net.mode === 'cut') await new Promise((ok, no) => net.held.push({ ok, no: () => no(offline()) }));
        return { exists: !!dir[h], data: () => structuredClone(dir[h]) }; },
      onSnapshot: (cb) => { const cid = path.split('/')[1]; Promise.resolve().then(() => cb({ exists: true, data: () => (cid[0] === 'd' ? dmRec() : { type: 'group', epoch: 0, ts: T }) })); return () => {}; },
    }),
    chatLevel: () => 'member',
    get online() { return net.mode !== 'down' && net.mode !== 'cut'; },   // as the adapter's: down or cut, no link
  };
  const env = { S, ls: { get: (_k, d) => d, set: () => {} }, P: () => S.prefs, saveContacts: () => {}, hiddenConv: () => false,
    openPointer: async (d) => { if (!d._p) throw new Error('unreadable'); return d._p; }, dmIdFor: async (peer) => cidOf(peer), dmIds: new Map(), ksMap: () => ({}),
    showMeta: async (c) => (c.type === 'dm' ? { ...c, members: [ME, S.dmPeers[c.id]].filter(Boolean) } : c), adoptOMeta: () => {}, adminGone: () => {}, noteChatDoc: () => {},
    convKey: async () => 'a key', healCard: () => {}, unsealPost: async (_c, l) => l, recordBase: () => {}, dropPointer: async () => {}, noKeyNotice: () => {}, toastErr: () => {},
    heldKey: () => false, codeWait: () => false, codeWaitEnd: () => {}, setInterval: () => 0, clearInterval: () => {}, Date: { now: () => Date.now() + clock.skew } };
  const api = mk(env);
  let list = [];
  api.watchInbox({ handle: ME }, (l) => { list = l; });
  // the mailbox as the server hands it over (first at the start, again when the watch is sent again after a reconnect)
  const snap = async (notes) => { const docs = notes.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).map((n) => ({ id: n.id, data: () => ({ ts: n.ts, own: n.own, _p: n.p }) }));
    await inboxCb({ docs }); await tick(); };
  const cut = () => { for (const r of net.held.splice(0)) r.no(); };
  const reconnect = () => { net.mode = 'up'; for (const r of net.held.splice(0)) r.ok(); };
  return { S, api, log, net, snap, cut, reconnect, clock, list: () => list.map((c) => c.id).sort(), dir };
}
// my own note for a one-on-one chat with `peer` (the stored mark own: 1), and someone else's notes
const own = (id, peer, ts = OLD) => ({ id, ts, own: 1, p: { t: 'dm', cid: cidOf(peer), from: ME, to: ME, ts, type: 'dm', peer } });
const theirs = (id, from, cid, ts = OLD) => ({ id, ts, p: { t: 'dm', cid, from, to: ME, ts, type: 'dm' } });
const invite = (id, from, cid, ts = OLD) => ({ id, ts, p: { t: 'invite', cid, from, to: ME, ts, type: 'group', sg: 'signed by ' + from } });
const PEERS = Array.from({ length: 8 }, (_, i) => 'peer' + i);
const OWN8 = PEERS.map((h, i) => own('n' + i, h));

test('the reviewer\'s shape: eight week-old one-on-one notes of mine, the people\'s keys not held, the link down (every profile read refused offline): none is deleted; when the link is back (the watch sent again, inside the minute) all eight are listed at once (round 3: a read that failed for want of a link is read again once there is one); with the link up and the reads refused by the server (ratelimit) a pass inside the minute reads no one again and the first pass after it lists all eight', async () => {
  const W = page({ people: PEERS });
  W.net.mode = 'down';
  await W.snap(OWN8);
  assert.deepEqual(W.log.deleted, [], 'no note deleted for a read that failed');
  assert.deepEqual([W.list(), W.log.reads.length], [[], 16], 'not listed; two reads a person (noteOk\'s, the watch\'s)');
  await W.snap(OWN8);
  assert.deepEqual([W.log.deleted, W.log.reads.length], [[], 16], 'a pass with the link still down reads no one again');
  W.net.mode = 'up';
  await W.snap(OWN8);
  assert.deepEqual([W.log.deleted, W.list(), W.log.reads.length], [[], PEERS.map(cidOf).sort(), 24], 'the link back: all eight listed at once, one read each (the watch\'s; noteOk\'s waits for dirMiss)');
  const R = page({ people: PEERS });
  R.net.mode = 'busy';
  await R.snap(OWN8);
  R.net.mode = 'up';
  await R.snap(OWN8);
  assert.deepEqual([R.log.deleted, R.list(), R.log.reads.length], [[], [], 16], 'refused by the server: a pass inside the minute reads no one again');
  R.clock.skew = 61e3;
  await R.snap(OWN8);
  assert.deepEqual([R.log.deleted, R.list()], [[], PEERS.map(cidOf).sort()], 'all eight listed at the first pass after the minute');
});

test('the same with the link cut while the reads are on the way (noteOk\'s held, then refused at once by the cut; the watch\'s own, sent after it, wait for the next link, as the adapter\'s call does), and a held invitation from someone I share no listed chat with: nothing deleted; all listed and the invitation held once the link is back, and still after the watch is sent again', async () => {
  const W = page({ people: [...PEERS, 'zed'] }), notes = [...OWN8, invite('z1', 'zed', 'g' + 'x'.repeat(12))];
  W.net.mode = 'cut';
  const pass = W.snap(notes); await tick(); await tick();
  assert.equal(W.log.reads.length, 9, 'the profile reads went out');
  W.cut(); await tick(); await tick();
  assert.equal(W.log.reads.length, 18, 'the watch\'s own reads went out after the cut, and wait');
  assert.deepEqual(W.log.deleted, [], 'no note deleted');
  W.reconnect(); await pass;
  assert.deepEqual(W.log.deleted, []);
  assert.deepEqual(W.list(), PEERS.map(cidOf).sort(), 'all eight listed');
  assert.deepEqual(W.S.invites, [{ cid: 'g' + 'x'.repeat(12), from: 'zed' }], 'the invitation waits for my Join, as before');
  await W.snap(notes);
  assert.deepEqual([W.log.deleted, W.list()], [[], PEERS.map(cidOf).sort()]);
});

test('guard: a week-old note a read that worked shows to be bad is deleted as before: one under the name of someone whose keys give another address (keys held, or read now), one naming a person who does not exist, an unreadable one, and, with every read refused, a blocked person\'s', async () => {
  const W = page({ people: ['alice', 'carl'], pins: ['alice'], blocked: ['mallory'] });
  const bad = [theirs('a1', 'alice', cidOf('someone')), theirs('c1', 'carl', cidOf('someone')), own('g1', 'ghost'), { id: 'u1', ts: OLD }];
  await W.snap(bad);
  assert.deepEqual(W.log.deleted.sort(), ['a1', 'c1', 'g1', 'u1'], 'each one deleted once');
  assert.deepEqual(W.list(), []);
  const B = page({ people: ['mallory'], blocked: ['mallory'] });
  B.net.mode = 'down';
  await B.snap([theirs('m1', 'mallory', cidOf('mallory'))]);
  assert.deepEqual(B.log.deleted, ['m1'], 'a blocked person\'s note goes whatever the reads do');
});

test('guard: under a week old nothing of this is deleted, read or no read (another device of mine may still open a fresh note); with reads working my notes are listed as before, and read once each', async () => {
  const W = page({ people: PEERS }), young = PEERS.map((h, i) => own('y' + i, h, T - DAY));
  W.net.mode = 'down';
  await W.snap([...young, own('g1', 'ghost', T - DAY)]);
  assert.deepEqual(W.log.deleted, []);
  assert.equal(W.log.reads.length, 9, 'one read for each person, noteOk\'s own: a note under a week old is not read again');
  const V = page({ people: PEERS });
  await V.snap(OWN8);
  assert.deepEqual([V.log.deleted, V.list()], [[], PEERS.map(cidOf).sort()]);
  assert.deepEqual(V.log.reads.sort(), [...PEERS].sort(), 'one profile read for each person');
});

// ---- round 2 -------------------------------------------------------------------------------------------------------
test('the week boundary (security S1, code review 1): a note 300 ms short of a week whose read is refused, beside a note whose read is held 800 ms, is not deleted when it turns a week old while the pass waits; the control without the slow note keeps it too', async () => {
  const W = page({ people: ['amy', 'ben'], how: { amy: 'down', ben: 800 } }), now = Date.now();
  await W.snap([own('edge', 'amy', now - 7 * DAY + 300), own('slow', 'ben', now - 8 * DAY)]);
  await tick(400);
  assert.deepEqual(W.log.deleted, [], 'a note whose only read failed is never deleted');
  const C = page({ people: ['amy'], how: { amy: 'down' } }), now2 = Date.now();
  await C.snap([own('edge', 'amy', now2 - 7 * DAY + 300)]);
  await tick(400);
  assert.deepEqual(C.log.deleted, []);
});

test('a stranger\'s pile (security S2, code review 2): 300 week-old notes naming people who do not exist beside my eight, reads refused by the server: two reads a person in the first pass, none in the next passes inside the minute, nothing deleted; with my vault not read the watch reads no one itself; once reads work after the minute the pile goes and my eight are listed', async () => {
  const JUNK = Array.from({ length: 300 }, (_, i) => theirs('j' + String(i).padStart(3, '0'), 'junk' + i, cidOf('junk' + i)));
  const W = page({ people: PEERS });
  W.net.mode = 'busy';   // the link up, the pile over the server's allowance: the flood's own case
  const per = [];
  for (let i = 0; i < 3; i++) { const n = W.log.reads.length; await W.snap([...OWN8, ...JUNK]); per.push(W.log.reads.length - n); }
  assert.deepEqual([per, W.log.deleted], [[616, 0, 0], []], 'reads per pass; nothing deleted');
  const V = page({ people: PEERS, contacts: false });
  V.net.mode = 'down';
  await V.snap([...OWN8, ...JUNK]); await V.snap([...OWN8, ...JUNK]);
  assert.deepEqual([V.log.reads.length, V.log.deleted], [308, []], 'vault not read (the delete line cannot delete): noteOk\'s reads only, none of the watch\'s');
  W.net.mode = 'up'; W.clock.skew = 61e3;
  await W.snap([...OWN8, ...JUNK]);
  assert.deepEqual([W.log.deleted.length, W.log.deleted.every((id) => id[0] === 'j'), W.list()], [300, true, PEERS.map(cidOf).sort()], 'the pile deleted, my eight listed');
});

test('guard (round 2): a note recheck did not read because the delete line was closed (my own profile not read yet) waits, even when that profile is read later in the same pass (a stranger\'s note asks for my setting) and the delete line opens', async () => {
  const W = page({ people: [...PEERS, ME, 'asker'], how: Object.fromEntries(PEERS.map((h) => [h, 'down'])), mine: false });
  await W.snap([...OWN8, theirs('a1', 'asker', cidOf('asker'))]);
  assert.ok(W.S.dir[ME], 'my profile was read in the pass');
  assert.deepEqual(W.log.deleted, [], 'none of my eight deleted');
  assert.equal(W.log.reads.filter((h) => PEERS.includes(h)).length, 8, 'noteOk\'s reads only: the watch read no one while the delete line was closed');
});

test('round 3: the same pile with the link down: passes while it is down read no one again; the pass when the link is back reads each person once more (the watch\'s read only), deletes the pile and lists my eight; a pass after that inside the minute reads no one', async () => {
  const JUNK = Array.from({ length: 300 }, (_, i) => theirs('j' + String(i).padStart(3, '0'), 'junk' + i, cidOf('junk' + i)));
  const W = page({ people: PEERS }), all = [...OWN8, ...JUNK], per = [];
  const pass = async () => { const n = W.log.reads.length; await W.snap(all); per.push(W.log.reads.length - n); };
  W.net.mode = 'down'; await pass(); await pass();
  assert.deepEqual(W.log.deleted, [], 'nothing deleted while the link is down');
  W.net.mode = 'up'; await pass();
  assert.deepEqual([W.log.deleted.length, W.log.deleted.every((id) => id[0] === 'j'), W.list()], [300, true, PEERS.map(cidOf).sort()], 'the pile deleted, my eight listed');
  await pass();
  assert.deepEqual(per, [616, 0, 308, 0], 'reads per pass');
});
