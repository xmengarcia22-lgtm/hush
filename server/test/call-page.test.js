// Voice calls, the page side (SPEC.md 16.2), lifted out of app/ui.js: the relay-only filter on session descriptions, and
// call setup signed with the account key and sealed under the chat key, with every check a received record must pass.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CALL_CT_MAX, MAX_BYTES } from '../src/schemas.js';

const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const lift = (from, to) => { const a = ui.indexOf(from), b = ui.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} … ${to} in app/ui.js`); return ui.slice(a, b); };
const SDP = lift('/* ===== HUSH CALL SDP BEGIN', '/* ===== HUSH CALL SDP END');
const { relaySdp, relayIps, relayOk, relayHost, relayPick } = new Function(SDP + 'return { relaySdp, relayIps, relayOk, relayHost, relayPick };')();

const subtle = globalThis.crypto.subtle;
const ECDSA = { name: 'ECDSA', namedCurve: 'P-256' }, SIGN = { name: 'ECDSA', hash: 'SHA-256' };
const b64 = (buf) => Buffer.from(buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

// fps: how many identical a=fingerprint lines (a bundled description writes one per m= section), or the values themselves.
const sdp = (cands, fps = 1) => ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0',
  ...(Array.isArray(fps) ? fps : Array.from({ length: fps }, () => 'sha-256 AA:BB')).map((f) => 'a=fingerprint:' + f), ...cands, 'a=rtpmap:111 opus/48000/2', ''].join('\r\n');
const RELAY = 'a=candidate:1 1 udp 41885439 203.0.113.5 50000 typ relay raddr 198.51.100.7 rport 61000 generation 0';
const HOST = 'a=candidate:2 1 udp 2122260223 192.168.1.20 50001 typ host generation 0';
const SRFLX = 'a=candidate:3 1 udp 1686052607 198.51.100.7 61000 typ srflx raddr 192.168.1.20 rport 50001 generation 0';

test('relaySdp keeps relay candidates only, blanks where this side really is, and wants one DTLS identity', () => {
  const out = relaySdp(sdp([HOST, SRFLX, RELAY]));
  assert.ok(out.includes('typ relay raddr 0.0.0.0 rport 0 generation 0'));
  assert.ok(!out.includes('198.51.100.7') && !out.includes('192.168.1.20') && !/typ (host|srflx|prflx)/.test(out));
  assert.equal(relaySdp(sdp([HOST, SRFLX])), null, 'no relay candidate: no call');
  assert.equal(relaySdp(sdp([RELAY], 0)), null, 'no fingerprint');
  assert.ok(relaySdp(sdp([RELAY], 2)), 'two identical fingerprint lines (one per bundled m= section) are one identity');
  assert.equal(relaySdp(sdp([RELAY], 2)).split('\r\n').filter((l) => l.startsWith('a=fingerprint:')).length, 2, 'and both lines stay for the browser');
  assert.ok(relaySdp(sdp([RELAY], ['sha-256 AA:BB', 'SHA-256 aa:bb'])), 'case does not make a second identity');
  assert.equal(relaySdp(sdp([RELAY], ['sha-256 AA:BB', 'sha-256 AA:BC'])), null, 'two different fingerprints: two identities in one description');
  assert.equal(relaySdp(sdp([RELAY], ['sha-256 AA:BB', 'sha-1 AA:BB'])), null, 'the same hash under another algorithm is another fingerprint');
  assert.equal(relaySdp(sdp([RELAY], ['sha-256 AA:BB', 'sha-256 AA:BB', 'sha-256 CC:DD'])), null, 'a third line with another value refuses the whole description');
  assert.equal(relaySdp(sdp([HOST + ' typ relay', RELAY])).includes('192.168.1.20'), false, 'a "typ relay" tacked on the end of a host candidate is still a host candidate');
  const lf = relaySdp(sdp([HOST, RELAY]).replace(/\r\n/g, '\n'));
  assert.ok(lf && !lf.includes('192.168.1.20') && lf.includes('\r\n'), 'bare line feeds are split too, and the result is CRLF');
  assert.equal(relaySdp(sdp([RELAY]).replace('\r\n' + HOST, '') + '\r' + HOST), null, 'a lone carriage return is refused, not trusted to separate lines');
  const base = sdp([RELAY]);
  assert.ok(relaySdp(base + 'a=x:' + 'y'.repeat(10000 - base.length - 4)), 'exactly 10000 characters pass: a full browser audio+video description is about 6000');
  assert.equal(relaySdp(base + 'a=x:' + 'y'.repeat(10001 - base.length - 4)), null, 'too long');
  assert.equal(relaySdp(undefined), null);
});

const R = (addr, tr = 'udp') => `a=candidate:1 1 ${tr} 41885439 ${addr} 50000 typ relay raddr 198.51.100.7 rport 61000 generation 0`;
test('relaySdp keeps a relay candidate only at an IP literal over udp or tcp: a name would be looked up by the browser', () => {
  for (const bad of ['relay.example.com', 'abc.local', '1.2.3.4.nip.io', '[2001:db8::1]', '2001:db8::1%eth0', ':::1', '203.0.113.256', '203.0.113', '0x7f.0.0.1', '01.2.3.4', '2130706433'])
    assert.equal(relaySdp(sdp([R(bad)])), null, bad);
  for (const tr of ['sctp', 'tls', 'udp6']) assert.equal(relaySdp(sdp([R('203.0.113.5', tr)])), null, tr);
  for (const ok of ['203.0.113.5', '2001:db8::1', '::ffff:203.0.113.5']) assert.ok(relaySdp(sdp([R(ok)])), ok);
  for (const tr of ['UDP', 'tcp']) assert.ok(relaySdp(sdp([R('203.0.113.5', tr)])), tr);
  const mixed = relaySdp(sdp([R('relay.example.com'), RELAY, 'a=remote-candidates:1 relay.example.com 50000']));
  assert.ok(mixed && !mixed.includes('example.com') && mixed.includes('203.0.113.5 50000 typ relay'), 'the named one and a=remote-candidates go, the literal stays');
});

// A bundled audio+video description as browsers and libwebrtc write it: one a=group:BUNDLE, the fingerprint (and ice-ufrag,
// ice-pwd, setup) repeated under each m= section, the relay candidates under the audio section (max-bundle) or under both (balanced).
const AV = (vfp = 'sha-256 AA:BB', acands = [RELAY], vcands = []) => ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0 1', 'a=msid-semantic: WMS',
  'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0', 'a=mid:0', 'a=ice-ufrag:u1', 'a=ice-pwd:p1', 'a=fingerprint:sha-256 AA:BB', 'a=setup:actpass', ...acands, 'a=sendrecv', 'a=rtpmap:111 opus/48000/2',
  'm=video 9 UDP/TLS/RTP/SAVPF 96 97', 'c=IN IP4 0.0.0.0', 'a=mid:1', 'a=ice-ufrag:u1', 'a=ice-pwd:p1', 'a=fingerprint:' + vfp, 'a=setup:actpass', ...vcands, 'a=sendrecv',
  'a=rtpmap:96 H264/90000', 'a=fmtp:96 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f', 'a=rtpmap:97 VP8/90000', ''].join('\r\n');
test('relaySdp passes a bundled audio+video description: the fingerprint repeated under each m= section is one identity, a different one under the video section is not', () => {
  const out = relaySdp(AV());
  assert.equal(typeof out, 'string');
  assert.deepEqual(out.split('\r\n').filter((l) => l.startsWith('m=')), ['m=audio 9 UDP/TLS/RTP/SAVPF 111', 'm=video 9 UDP/TLS/RTP/SAVPF 96 97'], 'both m-lines kept');
  assert.ok(out.includes('a=group:BUNDLE 0 1\r\n') && out.includes('a=rtpmap:96 H264/90000\r\n'), 'the bundle group and the video codecs kept');
  assert.equal(out.split('\r\n').filter((l) => l.startsWith('a=fingerprint:')).length, 2, 'both fingerprint lines stay for the browser');
  assert.equal(out, AV().replace(' raddr 198.51.100.7 rport 61000', ' raddr 0.0.0.0 rport 0'), 'nothing else is touched');
  const balanced = relaySdp(AV('sha-256 AA:BB', [HOST, SRFLX, RELAY], [HOST, R('203.0.113.5', 'tcp')]));
  assert.ok(balanced && !balanced.includes('192.168.1.20') && !balanced.includes('198.51.100.7') && !/typ (host|srflx)/.test(balanced), 'a video section with its own candidates (balanced bundle policy) is filtered like the audio one');
  assert.deepEqual(relayIps(balanced), ['203.0.113.5']);
  assert.equal(balanced.split('\r\n').filter((l) => l.startsWith('a=candidate:')).length, 2, 'one relay candidate per section left');
  assert.equal(relaySdp(AV('sha-256 CC:DD')), null, 'a video section under another certificate: refused');
  assert.equal(relaySdp(AV('sha-256 AA:BB', [HOST, SRFLX])), null, 'still no call without a relay candidate');
  assert.equal(relaySdp(AV('sha-256 AA:BB', [RELAY], [RELAY + '\r\na=remote-candidates:1 198.51.100.7 61000'])).includes('remote-candidates'), false, 'a=remote-candidates goes from a video section too');
});

test('relayIps and relayOk: every relay address the other side gives was offered to this device, and one of them is the relay it used', () => {
  assert.deepEqual(relayIps(relaySdp(sdp([RELAY, R('203.0.113.5', 'tcp'), R('2001:DB8::1')]))), ['203.0.113.5', '2001:db8::1']);
  const O = ['203.0.113.5', '198.51.100.9']; // the two hosts the server listed
  assert.equal(relayOk(relaySdp(sdp([RELAY])), ['203.0.113.5'], O), true, 'the same relay');
  assert.equal(relayOk(relaySdp(sdp([RELAY, R('198.51.100.9')])), ['203.0.113.5'], O), true, 'an older page that gathered on both offered relays');
  assert.equal(relayOk(relaySdp(sdp([R('198.51.100.9')])), ['203.0.113.5'], O), false, 'the other offered relay alone: not the one this device used');
  assert.equal(relayOk(relaySdp(sdp([RELAY, R('192.0.2.7')])), ['203.0.113.5'], O), false, 'a foreign address beside ours');
  assert.equal(relayOk(relaySdp(sdp([R('192.0.2.7')])), ['203.0.113.5'], ['203.0.113.5']), false, 'one host: another relay');
  assert.equal(relayOk(relaySdp(sdp([RELAY])), [], O), false, 'and ours must be known');
  assert.equal(relayOk(relaySdp(sdp([RELAY])), ['203.0.113.5'], ['relay.example.com']), true, 'a host written as a name: the address this device used stands for it');
});

test('two relays on the list (SPEC.md 16.2): hosts in list order, the caller picks by its time zone, the callee follows the offer', () => {
  assert.equal(relayHost('turn:203.0.113.5:3478?transport=udp'), '203.0.113.5'); assert.equal(relayHost('turns:[2001:DB8::1]:5349'), '2001:db8::1');
  assert.equal(relayHost('turn:relay.example.com'), 'relay.example.com'); assert.equal(relayHost('stun:1.2.3.4'), '');
  const u = (h) => [`turn:${h}:3478?transport=udp`, `turn:${h}:3478?transport=tcp`], urls = (s) => s.flatMap((x) => x.urls);
  const one = [{ urls: u('203.0.113.5'), username: 'u', credential: 'p' }], two = [{ urls: [...u('203.0.113.5'), ...u('198.51.100.9')], username: 'u', credential: 'p' }];
  for (const tz of ['Europe/Helsinki', 'America/New_York']) assert.deepEqual(relayPick(one, tz), one, 'one host: the list as it came, ' + tz);
  assert.deepEqual(relayPick(one, 'America/New_York', ['198.51.100.9']), one, 'one host, an offer elsewhere: the own relay (and relayOk refuses)');
  for (const tz of ['Europe/Helsinki', 'Asia/Tokyo', 'Atlantic/Bermuda', undefined]) assert.deepEqual(urls(relayPick(two, tz)), u('203.0.113.5'), String(tz));
  for (const tz of ['America/New_York', 'America/Argentina/Buenos_Aires', 'Pacific/Honolulu']) assert.deepEqual(urls(relayPick(two, tz)), u('198.51.100.9'), tz);
  assert.deepEqual(relayPick(two, 'America/New_York').map((s) => [s.username, s.credential]), [['u', 'p']], 'the credential travels with the picked URLs');
  assert.deepEqual(urls(relayPick(two, 'America/New_York', ['203.0.113.5'])), u('203.0.113.5'), 'the callee follows the offer, not its zone');
  assert.deepEqual(urls(relayPick(two, 'Europe/Helsinki', ['198.51.100.9'])), u('198.51.100.9'));
  assert.deepEqual(urls(relayPick(two, 'America/New_York', ['203.0.113.5', '198.51.100.9'])), u('198.51.100.9'), 'an older caller on both: the own zone decides');
  assert.deepEqual(urls(relayPick(two, 'Europe/Helsinki', ['192.0.2.7'])), u('203.0.113.5'), 'a relay the server never offered: the own pick, and relayOk refuses the call');
});

test('the call flow checks the other side\'s relay before it is used: the caller before setRemoteDescription, the callee once it has its own', () => {
  const answer = lift('async function gotAnswer(', 'async function callMedia(');
  assert.ok(answer.indexOf('relayOk(sdp,k.ips||[],k.offered)') < answer.indexOf('setRemoteDescription'));
  const accept = lift('async function acceptCall(', 'async function gotAnswer(');
  assert.ok(accept.indexOf('relayOk(k.offer,relayIps(sdp),k.offered)') > accept.indexOf('callGather(k)') && accept.indexOf('relayOk(') < accept.indexOf("sendSignal(c,'answer'"));
  assert.match(lift('async function startCall(', 'function ringIn('), /callGather\(k\);if\(S\.call!==k\)return;k\.ips=relayIps\(sdp\)/);
  assert.match(lift('function ringIn(', 'async function acceptCall('), /^function ringIn\(c,p\)\{const sdp=relaySdp\(p\.sdp\);/, 'the offer is filtered before anything else');
});

// ---- signals: sendSignal and openSignal with the page's names they reach for stubbed ----
const CID = 'd' + 'A'.repeat(22);
async function world() {
  const ids = {};
  for (const h of ['alice', 'bob', 'mallory']) ids[h] = await subtle.generateKey(ECDSA, false, ['sign', 'verify']);
  const chatKeys = {};
  for (const e of [1, 2]) { const raw = globalThis.crypto.getRandomValues(new Uint8Array(32)); chatKeys[e] = { raw, key: await subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']) }; }
  const env = {
    S: { me: { handle: 'alice' }, db: { now: () => env.now, doc: (p) => ({ set: async (d) => { env.written.push({ p, d }); } }) } },
    now: Date.now(), written: [], blocked: new Set(), gone: new Set(), changed: new Set(), prev: false, peerOf: {},
    epochOf: (c) => c.epoch, convKey: async (c, e) => chatKeys[e] || null,
    myKey: async () => ids[env.signAs || env.S.me.handle].privateKey,
    // the page's verifyBy: true by the person's current key; 'prev' stands for a key they have since replaced
    verifyBy: async (h, sg, data) => (await subtle.verify(SIGN, ids[h].publicKey, unb64(sg), data)) ? (env.prev ? 'prev' : true) : false,
    dmPeer: (c) => c.members.find((h) => h !== env.S.me.handle),
    isBlocked: (h) => env.blocked.has(h), isGone: (h) => env.gone.has(h), keyChanged: (h) => env.changed.has(h),
  };
  const names = ['S', 'enc', 'dec', 'b64', 'unb64', 'rid22', 'hexOf', 'epochOf', 'convKey', 'myKey', 'verifyBy', 'dmPeer', 'isBlocked', 'isGone', 'keyChanged', 'typeOf', 'isSelf', 'isMember', 'isRequest', 'awaitingAccept', 'isChatBlocked', 'window'];
  const body = lift('const callNow=', 'const callRecs=') + 'return { sendSignal, openSignal };';
  const f = new Function(...names, body);
  const api = f(env.S, new TextEncoder(), new TextDecoder(), b64, unb64, () => Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
    (b) => Buffer.from(b).toString('hex'), env.epochOf, env.convKey, env.myKey, env.verifyBy, env.dmPeer, env.isBlocked, env.isGone, env.keyChanged,
    () => 'dm', () => false, () => true, () => false, () => false, () => false, {});
  return { env, ...api };
}
const chat = (epoch = 1) => ({ id: CID, type: 'dm', epoch, members: ['alice', 'bob'] });
const call = { id: 'ab'.repeat(16), peer: 'bob' };
async function sent(w, kind = 'offer', extra = { sdp: sdp([RELAY]) }, from = 'alice', c = chat(), k = call) {
  w.env.S.me.handle = from; w.env.written.length = 0;
  await w.sendSignal(c, kind, k, extra);
  const { p, d } = w.env.written[0];
  w.env.S.me.handle = 'bob';
  return { rec: p.split('/').pop(), d, p };
}

test('a signal is a memory record of ts, iv and ct, and opens for the person it is to', async () => {
  const w = await world();
  const { rec, d, p } = await sent(w);
  assert.match(p, new RegExp(`^channels/${CID}/call/[A-Za-z0-9_-]{22}$`));
  assert.deepEqual(Object.keys(d).sort(), ['ct', 'iv', 'ts']);
  assert.ok(!Buffer.from(d.ct, 'base64').toString('latin1').includes('alice'), 'nothing readable in it');
  const got = await w.openSignal(chat(), rec, d, false);
  assert.deepEqual({ ...got, sdp: undefined }, { v: 1, callId: call.id, kind: 'offer', from: 'alice', to: 'bob', ts: got.ts, exp: got.ts + 30e3, sdp: undefined });
  assert.equal(got.sdp, sdp([RELAY]));
  assert.ok(d.ct.length < CALL_CT_MAX, 'well inside the server\'s limit');
});

test('the longest description the page passes (10000 characters) seals under the server\'s record cap and its 16 KB document cap', async () => {
  const w = await world();
  // The costly part of sealing is the lines: each CRLF is 6 characters once the SDP is a JSON string inside JSON, so the fixture
  // has a browser's shape (about 35 characters a line, R0: 5855 characters in 172 lines) rather than one long line.
  const filler = ['a=extmap:14 urn:ietf:params:rtp-hdrext:toffset', 'a=rtpmap:96 H264/90000', 'a=rtcp-fb:96 goog-remb', 'a=fmtp:96 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f', 'a=rtpmap:97 rtx/90000', 'a=fmtp:97 apt=96'];
  let big = sdp([RELAY]);
  for (let i = 0; big.length < 10000 - 90; i++) big += filler[i % filler.length] + '\r\n';
  big += 'a=x:' + 'y'.repeat(10000 - big.length - 4);
  assert.equal(big.length, 10000);
  const passed = relaySdp(big);
  assert.ok(passed, 'the page lets it through');
  const { d } = await sent(w, 'offer', { sdp: passed });
  assert.ok(d.ct.length <= CALL_CT_MAX, `ct of ${d.ct.length} characters fits CALL_CT_MAX ${CALL_CT_MAX}`);
  assert.ok(Buffer.byteLength(JSON.stringify(d)) <= MAX_BYTES.call, `${Buffer.byteLength(JSON.stringify(d))} bytes fit the ${MAX_BYTES.call}-byte call document`);
  assert.ok(d.ct.length > 14000, `and the two caps are paired, not far apart: ${d.ct.length}`);
});

test('every check on a received signal fails closed', async () => {
  const w = await world();
  const { rec, d } = await sent(w);
  const open = (over = {}) => w.openSignal(over.c || chat(), over.rec || rec, over.d || d, !!over.mine);
  assert.ok(await open());
  assert.equal(await open({ rec: 'X'.repeat(22) }), null, 'sealed to its record id: moved, it does not open');
  const ct = Buffer.from(d.ct, 'base64'); ct[5] ^= 1;
  assert.equal(await open({ d: { ...d, ct: ct.toString('base64') } }), null, 'tampered');
  assert.equal(await open({ c: chat(2) }), null, 'the chat moved to a new epoch: only the current key counts');
  assert.equal(await open({ c: { ...chat(), id: 'd' + 'B'.repeat(22) } }), null, 'another chat');
  w.env.now += 31e3; assert.equal(await open(), null, 'stale'); w.env.now -= 92e3; assert.equal(await open(), null, 'from the future'); w.env.now += 61e3;
  w.env.prev = true; assert.equal(await open(), null, 'signed by a key the caller has since replaced'); w.env.prev = false;
  for (const set of ['blocked', 'gone', 'changed']) { w.env[set].add('alice'); assert.equal(await open(), null, set); w.env[set].delete('alice'); }
  assert.equal(await open({ mine: true }), null, 'not mine');
  w.env.S.me.handle = 'alice';
  assert.equal(await open(), null, 'my own signal is not a call to me');
  assert.ok(await open({ mine: true }), 'but my other device may read it (to stop ringing)');
  w.env.S.me.handle = 'bob';
});

test('a signal must name the right people and be signed by the one it claims', async () => {
  const w = await world();
  // Mallory holds the chat key (say she stole it) and writes Alice's name, but can only sign with her own key
  w.env.signAs = 'mallory';
  const forged = await sent(w);
  w.env.signAs = null;
  assert.equal(await w.openSignal(chat(), forged.rec, forged.d, false), null, 'Mallory\'s signature is not Alice\'s');
  const asHerself = await sent(w, 'offer', { sdp: sdp([RELAY]) }, 'mallory');
  assert.equal(await w.openSignal(chat(), asHerself.rec, asHerself.d, false), null, 'and in her own name she is not the person this chat is with');
  // a signal Alice addressed to someone else
  w.env.S.me.handle = 'alice'; w.env.written.length = 0;
  await w.sendSignal(chat(), 'offer', { id: call.id, peer: 'carol' }, { sdp: sdp([RELAY]) });
  const x = w.env.written[0]; w.env.S.me.handle = 'bob';
  assert.equal(await w.openSignal(chat(), x.p.split('/').pop(), x.d, false), null, 'not to me');
  // an offer or answer without a description, and an unknown kind
  const bare = await sent(w, 'answer', {});
  assert.equal(await w.openSignal(chat(), bare.rec, bare.d, false), null, 'no description');
  const odd = await sent(w, 'ring', {});
  assert.equal(await w.openSignal(chat(), odd.rec, odd.d, false), null, 'unknown kind');
  const end = await sent(w, 'end', { reason: 'busy' });
  assert.equal((await w.openSignal(chat(), end.rec, end.d, false)).reason, 'busy');
});

test('a signal must also be within 10 minutes of this device\'s own clock, whatever the server\'s says', async () => {
  const w = await world();
  w.env.now = Date.now() - 11 * 60e3;   // the server's clock, set back to when an old offer was made: fresh by it
  const old = await sent(w);
  assert.equal(await w.openSignal(chat(), old.rec, old.d, false), null);
  w.env.now = Date.now() + 5 * 60e3;
  const skewed = await sent(w);
  assert.ok(await w.openSignal(chat(), skewed.rec, skewed.d, false), 'a device clock a few minutes off still takes calls');
});

test('the video fields: a mark says whether a camera is on (0 or 1; why only "net"), an offer or answer whether its side can do video, cam whether the caller starts with it on', async () => {
  const w = await world();
  const open = async (kind, extra) => { const s = await sent(w, kind, extra); return w.openSignal(chat(), s.rec, s.d, false); };
  assert.equal((await open('mark', { video: 1 })).video, 1, 'a mark needs no description');
  assert.equal((await open('mark', { video: 0, why: 'net' })).why, 'net');
  assert.equal(await open('mark', {}), null, 'a mark says on or off');
  assert.equal(await open('mark', { video: 2 }), null);
  assert.equal(await open('mark', { video: 0, why: 'bored' }), null);
  assert.equal((await open('offer', { sdp: sdp([RELAY]), video: 1, cam: 1 })).cam, 1);
  assert.equal(await open('offer', { sdp: sdp([RELAY]), cam: 3 }), null);
  assert.equal(await open('answer', { sdp: sdp([RELAY]), video: 'yes' }), null);
  assert.equal(await open('offer', { video: 1 }), null, 'an offer still needs its description');
  assert.equal(await open('ring', {}), null, 'no other kind');
});

// ---- receiving: what onSignal does with an offer, lifted with the page around it stubbed ----
function receiver(store = new Map(), me = 'bob', callable = () => true) {
  const log = [], marks = [], S = { me: { handle: me }, call: null };
  const ls = { get: (k, d) => (store.has(k) ? JSON.parse(store.get(k)) : d), set: (k, v) => store.set(k, JSON.stringify(v)) };
  const f = new Function('S', 'ls', 'callable', 'sendSignal', 'ringIn', 'gotAnswer', 'endCall', 'displayName', 'nat', 'pushCallOff', 'natOld',
    lift('const callRecs=', 'const callErr=') + 'return { onSignal };');
  const { onSignal } = f(S, ls, callable, async (c, kind, k, extra) => { log.push([kind, k.peer, extra && extra.reason]); },
    (c, p) => { log.push(['ring', p.callId]); S.call = { id: p.callId }; }, () => {}, () => {}, (h) => h,
    (m, o) => { if (m === 'mark') marks.push(o.k); else log.push(['nat', m, o]); return Promise.resolve({}); }, () => { log.push(['pushCallOff']); S.pushCall = null; }, () => false);
  const sig = (kind) => (n, from = 'alice') => onSignal({ id: CID }, { kind, callId: String(n).padStart(32, '0'), from });
  return { S, log, marks, store, offer: sig('offer'), end: sig('end') };
}

test('booted for a push, the page rings the offer in the push\'s chat although this device stored its id (the page that stored it was replaced mid-ring), and says where it got to on the diag line', () => {
  const id = (n) => String(n).padStart(32, '0'), store = new Map();
  let r = receiver(store); r.offer(1); assert.deepEqual(r.log, [['ring', id(1)]]); assert.deepEqual(r.marks, [], 'no push: a browser never calls the plugin');
  r = receiver(store); r.S.pushCall = { id: 'push-1', cid: CID, at: Date.now() }; r.offer(1);
  assert.deepEqual(r.log, [['ring', id(1)]], 'the same offer rings again on the reloaded page'); assert.deepEqual(r.marks, ['offer', 'seen']);
  assert.ok(JSON.parse(store.get('hush:callSeen:bob')).some((x) => x[0] === id(1)), 'the id stays recorded');
  r = receiver(store); r.S.pushCall = { id: 'push-2', cid: 'c_other', at: Date.now() }; r.offer(1);
  assert.deepEqual(r.log, [], 'a push for another chat changes nothing: the stored offer is refused as before'); assert.deepEqual(r.marks, []);
  r = receiver(new Map(), 'bob', () => false); r.S.pushCall = { id: 'push-3', cid: CID, at: Date.now() }; r.offer(2);
  assert.deepEqual(r.log, []); assert.deepEqual(r.marks, ['offer', 'drop:callable'], 'a chat that cannot be called yet: named, not rung');
});

test('pushMark speaks only with a push or a pushed call, and never throws', async () => {
  const calls = [], mk = (S, nat) => new Function('S', 'nat', lift('const pushMark=', '\n') + '\nreturn pushMark;')(S, nat);
  mk({}, () => { throw new Error('no plugin'); })('x'); mk({ call: {} }, () => { throw new Error('no plugin'); })('x');
  mk({ pushCall: {} }, (m, o) => { calls.push([m, o]); return Promise.resolve(); })('offer'); mk({ call: { pushId: 'p' } }, (m, o) => { calls.push([m, o]); return Promise.reject(new Error('older build')); })('sent');
  assert.deepEqual(calls, [['mark', { k: 'offer' }], ['mark', { k: 'sent' }]]); await new Promise((r) => setTimeout(r, 0));
  const accept = lift('async function acceptCall(', 'async function gotAnswer(');
  assert.match(accept, /await sendSignal\(c,'answer',k,Object\.assign\(\{sdp,tag:k\.tag\},k\.vok\?\{video:1\}:\{\}\)\);k\.answerSent=true;sendMark\(k\);if\(k\.vok&&k\.ocam\)\{[^}]*\}if\(k\.pushId\)pushMark\('sent'\);callTimer\(k,20e3,'connecting',callFail\)/, 'sent: the answer write was acknowledged');
  assert.match(accept, /catch\(e\)\{if\(k\.pushId\)pushMark\('fail:'/, 'fail:<code>: why the answer never went');
  assert.match(lift('async function signedOutHere(', '\n}'), /return;pushMark\('out'\);callOff\(false\);/, 'out: a sign-out during the push window');
  assert.match(readFileSync(new URL('../../app/adapter.js', import.meta.url), 'utf8'), /renderBanner\(\);if\(on\)\{pushMark\('online'\);checkForUpdate\(\)\}\}/, 'online: the connection came (back) during the push window');
  assert.match(lift('function reloadIfIdle(){', '\n}'), /if\(!S\.stale\|\|!S\.me\|\|S\.pushCall\)return;/, 'no self-reload while the page is up for a pushed call');
});

test('the answer of a device woken by a push lives a minute like the offer; an ordinary answer 30 s', async () => {
  const w = await world(), asAlice = async (x) => { w.env.S.me.handle = 'alice'; const p = await w.openSignal(chat(), x.rec, x.d, false); w.env.S.me.handle = 'bob'; return p; };
  const pushed = await asAlice(await sent(w, 'answer', { sdp: sdp([RELAY]), tag: 'ab'.repeat(8) }, 'bob', chat(), { id: call.id, peer: 'alice', pushId: 'push-1' }));
  assert.equal(pushed.exp, pushed.ts + 60e3);
  const plain = await asAlice(await sent(w, 'answer', { sdp: sdp([RELAY]) }, 'bob', chat(), { id: call.id, peer: 'alice' }));
  assert.equal(plain.exp, plain.ts + 30e3);
});

test('a key version ahead of this device\'s is read from the profile before anything is concluded, and a profile that still names this device\'s key only moves the number', () => {
  const ad = readFileSync(new URL('../../app/adapter.js', import.meta.url), 'utf8');
  assert.match(ad, /onKv:kv=>\{if\(S\.me&&!S\.rekeying&&typeof kv==='number'&&kv>\(S\.me\.kv\|\|1\)\)keysMovedOn\(\)\}/, 'the proof reply alone never signs out');
  assert.match(lift('async function signedOutHere(', '\n}'), /const d=S\.dir\[h\];if\(d&&d\.sig&&S\.me&&S\.me\.sig&&d\.sig\.x===S\.me\.sig\.x&&d\.sig\.y===S\.me\.sig\.y&&\(d\.kv\|\|1\)>\(S\.me\.kv\|\|1\)\)\{S\.me\.kv=d\.kv;ls\.set\('hush:ids',S\.ids\);return\}/);
  const boot = lift("const plan=lockPlan(lockCfg(),!!S.pushCall);", 'S.ids=ls.get');
  assert.match(boot, /try\{await unlockStore\(\)\}catch\{return storeRetry\(\)\}/, 'a store none of the keys opens stops the boot at a retry screen, not at the sign-up');
  assert.match(lift('function storeRetry(){', '\n}'), /location\.reload\(\)/);
});

test('the settings copy names the device the app runs on: iPad (its own user agent, or a Mac user agent with touch), otherwise iPhone as before', () => {
  const dw = (navigator) => new Function('navigator', lift('const devWord=', '\n') + '\nreturn devWord();')(navigator);
  assert.equal(dw({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X)', maxTouchPoints: 5 }), 'iPhone');
  assert.equal(dw({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 5 }), 'iPad');
  assert.equal(dw({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', maxTouchPoints: 0 }), 'iPhone', 'a Mac without touch (the harness, a desktop) keeps the word the copy always had');
  assert.equal(dw({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0 }), 'iPhone');
  assert.equal(dw({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X)', maxTouchPoints: 5 }), 'iPad');
  const st = lift('function settingsAdvanced(', '\nfunction openHow(');
  assert.match(st, /'Message notifications on this '\+devWord\(\)/); assert.match(ui, /'Show names on the '\+devWord\(\)\+' call screen'/); assert.match(ui, /'Notifications are off for Hush in '\+devWord\(\)\+' Settings'/);
  assert.match(lift('const msgPushOn=', '\n'), /ls\.get\('hush:msgPush:'\+id\.handle,ls\.get\('hush:msgPushDev',false\)\)/, 'an account with no setting yet takes the device\'s last choice');
  assert.match(lift('async function setMsgPush(', '\n}'), /ls\.set\('hush:msgPush:'\+me\.handle,on\);ls\.set\('hush:msgPushDev',on\);/);
});

test('an offer rings once per device, a reload included, for a day, and the memory is per account and capped', () => {
  const store = new Map();
  let r = receiver(store);
  r.offer(1); r.S.call = null; r.offer(1);
  assert.deepEqual(r.log, [['ring', '0'.repeat(31) + '1']]);
  r = receiver(store);   // the page reloaded: the server hands the same offer back
  r.offer(1);
  assert.deepEqual(r.log, [], 'not rung again');
  const c = receiver(store, 'carol'); c.offer(1);
  assert.equal(c.log.length, 1, 'another account on this device keeps its own memory');
  store.set('hush:callSeen:bob', JSON.stringify([['0'.repeat(31) + '2', Date.now() - 864e5 - 1000]]));
  r = receiver(store); r.offer(2);
  assert.equal(r.log.length, 1, 'a day on, forgotten');
  for (let i = 10; i < 220; i++) { r.S.call = null; r.offer(i); }
  assert.equal(JSON.parse(store.get('hush:callSeen:bob')).length, 200, 'the last 200');
  store.set('hush:callSeen:bob', '"junk"');
  r = receiver(store); r.offer(3);
  assert.equal(r.log.length, 1, 'a damaged record is a fresh one');
});

test('on another call: one automatic busy per person a minute, and an offer with no usable relay gets no reply at all', () => {
  const r = receiver();
  r.offer(1);
  r.offer(2); r.offer(3); r.offer(4, 'dave'); r.offer(5, 'dave');
  assert.deepEqual(r.log.slice(1), [['end', 'alice', 'busy'], ['end', 'dave', 'busy']]);
  const sent_ = [], S = {};
  const ringIn = new Function('relaySdp', 'sendSignal', 'S', lift('function ringIn(', 'async function acceptCall(') + 'return ringIn;')(() => null, () => sent_.push(1), S);
  ringIn({ id: CID }, { callId: 'ab'.repeat(16), from: 'alice', sdp: 'v=0' });
  assert.equal(sent_.length, 0); assert.equal(S.call, undefined);
});

test('every place the account leaves the page ends a live call first', () => {
  const marks = [...ui.matchAll(/S\.me=null/g)].map((m) => m.index);
  assert.ok(marks.length >= 4);
  for (const at of marks) {
    const before = ui.slice(0, at), off = before.lastIndexOf('callOff(');
    assert.ok(off > 0 && !/\n(?:async )?function |\nconst \w+=/.test(before.slice(off)), 'callOff before S.me=null at ' + ui.slice(0, at).split('\n').length);
  }
  assert.match(lift('async function logOutAccount(', '\n}'), /const current=S\.me&&S\.me\.handle===h;if\(current\)callOff\(true\);/, 'a log-out says so to the other side, while it still can sign');
  assert.equal(lift('function callOff(', '\n'), "function callOff(sign){const k=S.call;if(!k)return;k.quiet=true;if(sign)hangUp('');else endCall('')}");
});

// ---- the entry a call leaves in the chat: what the caller's page writes, and how a page reads and shows it ----
const log = new Function('displayName', lift('const fmtDur=', '\n') + lift('function buildBody(', '\nfunction ') + lift('/* ===== HUSH CALL LOG BEGIN', '/* ===== HUSH CALL LOG END')
  + 'return { buildBody, callOutcome, callOf, callText, callMissed };')((h) => h[0].toUpperCase() + h.slice(1));

test('callOutcome turns how a placed call ended into one entry', () => {
  const at = (o) => log.callOutcome(Object.assign({ t0: 0, why: '', was: 'calling' }, o));
  const t0 = Date.now() - 125400;
  assert.deepEqual(at({ t0, was: 'live' }), { kind: 'ended', secs: 125 }, 'answered: its length in whole seconds');
  assert.deepEqual(at({ t0, was: 'live', why: 'failed' }), { kind: 'ended', secs: 125 }, 'a call that dropped after it was live was still answered');
  assert.deepEqual(at({ t0: Date.now() - 200e6, was: 'live' }), { kind: 'ended', secs: 86400 }, 'at most a day');
  assert.deepEqual(at({ was: 'connecting' }), { kind: 'ended', secs: 0 }, 'hung up after the answer, before the sound started');
  assert.deepEqual(at({ why: 'declined' }), { kind: 'declined', secs: 0 });
  assert.deepEqual(at({ why: 'no answer' }), { kind: 'missed', secs: 0 });
  assert.deepEqual(at({}), { kind: 'cancelled', secs: 0 }, 'the caller hung up while it rang');
  assert.deepEqual(at({ why: 'busy' }), { kind: 'busy', secs: 0 });
  assert.deepEqual(at({ why: 'failed' }), { kind: 'failed', secs: 0 });
  assert.deepEqual(at({ was: 'connecting', why: 'failed' }), { kind: 'failed', secs: 0 });
  assert.deepEqual(at({ why: { x: 1 } }), { kind: 'failed', secs: 0 }, 'a reason of no known kind');
  const body = log.buildBody({ call: { kind: 'ended', secs: 125 } });
  assert.equal(body, '\u0001{"text":"","call":{"kind":"ended","secs":125}}', 'an ordinary rich body: no text, just the entry');
});

test('callOf takes only the defined shape, in a one-on-one chat by one of its two people', () => {
  assert.deepEqual(log.callOf({ kind: 'ended', secs: 125 }, true, true, 'bob'), { kind: 'ended', secs: 125, out: true, peer: 'bob', video: 0 });
  assert.deepEqual(log.callOf({ kind: 'missed', secs: 9 }, true, false, 'bob'), { kind: 'missed', secs: 0, out: false, peer: 'bob', video: 0 }, 'a length only on an answered call');
  for (const bad of [{ kind: 'ended', secs: 86401 }, { kind: 'ended', secs: -1 }, { kind: 'ended', secs: 1.5 }, { kind: 'ended', secs: '5' }, { kind: 'ended' },
    { kind: 'ring', secs: 0 }, { kind: '<img src=x onerror=alert(1)>', secs: 0 }, 'ended', ['ended', 1], 1])
    assert.equal(log.callOf(bad, true, false, 'bob').kind, '', 'refused: ' + JSON.stringify(bad));
  assert.equal(log.callOf({ kind: 'ended', secs: 5 }, false, false, 'bob').kind, '', 'not in a one-on-one chat, or not by one of its two people');
  assert.equal(log.callText(log.callOf({ kind: 'ring', secs: 0 }, true, false, 'bob')), 'Voice call', 'anything else shows as a plain call');
});

test('callText says it the way the person looking at it would', () => {
  const t = (kind, out, secs = 0) => log.callText({ kind, secs, out, peer: 'bob' });
  assert.equal(t('ended', true, 125), 'Outgoing call · 2:05'); assert.equal(t('ended', false, 125), 'Incoming call · 2:05');
  assert.equal(t('ended', true, 0), 'Outgoing call', 'no length when it never got going');
  assert.equal(t('declined', true), 'Call declined'); assert.equal(t('declined', false), 'Declined call');
  assert.equal(t('missed', true), 'No answer'); assert.equal(t('cancelled', true), 'Cancelled call'); assert.equal(t('busy', true), 'Bob was busy');
  for (const k of ['missed', 'cancelled', 'busy']) { assert.equal(t(k, false), 'Missed call'); assert.equal(log.callMissed({ kind: k, out: false }), true); }
  assert.equal(t('failed', true), 'Call failed'); assert.equal(t('failed', false), 'Call failed');
  for (const k of ['ended', 'declined', 'failed']) assert.equal(log.callMissed({ kind: k, out: false }), false);
  for (const k of ['missed', 'cancelled', 'busy']) assert.equal(log.callMissed({ kind: k, out: true }), false, 'the caller missed nothing');
});

test('a call muted while dialling opens the microphone muted', async () => {
  const media = new Function('S', 'navigator', 'RTCPeerConnection', 'findEar', 'natOk', 'natMedia', SDP + lift('async function callMedia', 'function callGather') + 'return callMedia;');
  const run = async (muted) => {
    const track = { kind: 'audio', enabled: true, stop() {} }, stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    const k = { muted, stream: null, pc: null, timers: [] }, added = [];
    class PC { constructor(cfg) { this.cfg = cfg; } addTrack(t) { added.push(t); } }
    await media({ call: k }, { mediaDevices: { getUserMedia: async () => stream } }, PC, () => {}, () => false)(k, { iceServers: [{ urls: ['turn:203.0.113.5:3478'] }] });
    assert.equal(k.pc.cfg.iceTransportPolicy, 'relay'); assert.deepEqual(added, [track]); assert.equal(k.stream, stream);
    return track.enabled;
  };
  assert.equal(await run(true), false, 'muted before the microphone opened: it opens muted');
  assert.equal(await run(false), true, 'not muted: the microphone is live');
  // two relays on the list: the connection (or the app's start) gets the picked host's URLs alone, and the call remembers both for the check and the diagnostics
  const two = { iceServers: [{ urls: ['turn:203.0.113.5:3478', 'turn:198.51.100.9:3478'], username: 'u', credential: 'p' }] }, nav = { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) } };
  class PC { constructor(cfg) { this.cfg = cfg; } }
  const callee = { muted: false, offer: relaySdp(sdp([R('198.51.100.9')])), timers: [] };
  await media({ call: callee }, nav, PC, () => {}, () => false)(callee, two);
  assert.deepEqual(callee.pc.cfg.iceServers, [{ urls: ['turn:198.51.100.9:3478'], username: 'u', credential: 'p' }], 'the callee allocates where the offer is'); assert.deepEqual([callee.offered, callee.relay], [['203.0.113.5', '198.51.100.9'], '198.51.100.9']);
  let started = null; const caller = { muted: false, timers: [] };
  await media({ call: caller }, nav, PC, () => {}, () => true, async (k, ice) => { started = ice; return { pc: {}, stream: { getTracks: () => [] } }; })(caller, two);
  assert.deepEqual(started.flatMap((s) => s.urls), [/^America\//.test(Intl.DateTimeFormat().resolvedOptions().timeZone) ? 'turn:198.51.100.9:3478' : 'turn:203.0.113.5:3478'], 'the app\'s start gets one host, by this machine\'s zone');
});

test('in an app build with its own call audio, the call uses it: no WebKit microphone or connection, and the page drives it', async () => {
  const calls = [], removed = [], state = {};
  const C = { isNativePlatform: () => true, isPluginAvailable: (n) => n === 'CallAudio',
    nativePromise: async (pl, m, o) => { calls.push([pl, m, o]); if (m === 'start' && state.deny) throw Object.assign(new Error('Microphone access was blocked'), { code: 'NotAllowedError' });
      return m === 'createOffer' ? { type: 'offer', sdp: 'v=0 offer' } : m === 'setSpeaker' ? { speaker: o.on } : {}; },
    addListener: (pl, ev, cb) => { state.cb = cb; state.ev = [pl, ev]; return { remove: () => removed.push(1) }; } };
  const S = { call: null }, renders = [], store = {}, hung = [];
  const ls = { get: (key, d) => (key in store ? store[key] : d) };
  const f = new Function('window', 'S', 'callUi', 'ls', 'displayName', 'hangUp', lift('const appOnly=', 'const newCall=') + 'return { natOk, natMedia };')({ Capacitor: C }, S, () => renders.push(1), ls, (h) => 'Name of ' + h, (m) => hung.push(m));
  assert.equal(f.natOk(), true);
  assert.equal(new Function('window', lift('const appOnly=', 'const newCall=') + 'return natOk;')({ Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => false } })(), false, 'an app build without it');
  const k = { muted: true, speaker: false, peer: 'bob', dir: 'out' }; S.call = k;
  const servers = [{ urls: ['turn:203.0.113.5:3478'], username: 'u', credential: 'p' }];
  const m = await f.natMedia(k, servers);
  assert.deepEqual(calls[0], ['CallAudio', 'start', { iceServers: servers, name: 'Name of bob', incoming: false }], 'the iPhone call screen shows the name'); assert.deepEqual(state.ev, ['CallAudio', 'state']);
  assert.equal(k.nat, true); assert.ok(renders.length >= 1, 'the Speaker key appears once the app holds the call');
  assert.deepEqual(await m.pc.createOffer(), { type: 'offer', sdp: 'v=0 offer' });
  await m.pc.setLocalDescription({ type: 'offer', sdp: 'v=0 offer', extra: 1 });
  assert.deepEqual(calls.at(-1), ['CallAudio', 'setLocalDescription', { type: 'offer', sdp: 'v=0 offer' }]);
  let gathered = 0, ice = 0; m.pc.addEventListener('icegatheringstatechange', () => gathered++); m.pc.oniceconnectionstatechange = () => ice++;
  state.cb({ gathering: 'complete', ice: 'checking', conn: 'connecting', sdp: 'v=0 full', speaker: false });
  assert.equal(m.pc.iceGatheringState, 'complete'); assert.equal(m.pc.localDescription.sdp, 'v=0 full'); assert.equal(gathered, 1); assert.equal(ice, 1);
  state.cb({ gathering: 'complete', ice: 'connected', conn: 'connected', sdp: 'v=0 full', speaker: false });
  assert.equal(gathered, 1, 'no change, no event'); assert.equal(ice, 2); assert.equal(m.pc.iceConnectionState, 'connected');
  state.cb({ gathering: 'complete', ice: 'connected', conn: 'connected', sdp: 'v=0 full', speaker: true });
  assert.equal(k.speaker, true, 'the key follows the route the phone reports');
  state.cb({ gathering: 'complete', ice: 'connected', conn: 'connected', sdp: 'v=0 full', speaker: true, muted: false, callkit: false });
  assert.equal(k.muted, true, 'before the iPhone holds the call, its mute state never overrides a mute from dialling');
  state.cb({ gathering: 'complete', ice: 'connected', conn: 'connected', sdp: 'v=0 full', speaker: true, muted: false, callkit: true });
  assert.equal(k.muted, false, 'unmuted from the iPhone call controls: the Mute key follows');
  k.muted = true;
  const [t] = m.stream.getAudioTracks(); assert.equal(t.enabled, false, 'muted while dialling');
  t.enabled = true; assert.deepEqual(calls.at(-1), ['CallAudio', 'setMuted', { on: false }]);
  let closedSeen = 0; m.pc.onconnectionstatechange = () => closedSeen++;
  state.cb({ gathering: 'complete', ice: 'closed', conn: 'closed', sdp: '', speaker: false, muted: true, ended: 'user' });
  assert.deepEqual(hung, [''], 'ended from the lock screen: the page hangs up, so the other side is told');
  assert.equal(closedSeen, 0, 'and it is not also treated as a dropped connection');
  m.pc.close(); assert.deepEqual(calls.at(-1), ['CallAudio', 'stop', { user: false }], 'any other end is reported to iOS as the far side ending'); assert.equal(removed.length, 0, 'still listening for the final report');
  await new Promise((r) => setTimeout(r, 0)); assert.equal(removed.length, 1, 'then the listener goes');
  store['hush:hideCallName'] = true; const k4 = { muted: false, speaker: false, peer: 'bob', dir: 'in', pushId: 'push-1' }; S.call = k4; const m4 = await f.natMedia(k4, servers);
  const s4 = calls.filter((c) => c[1] === 'start').at(-1)[2]; assert.equal(s4.name, 'Hush call', 'the setting hides the name'); assert.equal(s4.pushed, true, 'the call the iPhone was woken for: CallKit shows it already (an ordinary start has no pushed key: calls[0] above)');
  assert.equal(s4.incoming, true, 'the person answering reports an incoming call');
  k4.byUser = true; m4.pc.close(); assert.deepEqual(calls.at(-1), ['CallAudio', 'stop', { user: true }], 'End from this side: iOS is asked to end its own call');
  const hu = new Function('S', 'convById', 'sendSignal', 'endCall', lift('function hangUp(', 'function endCall(') + 'return hangUp;');
  const kb = { cid: 1 }; hu({ call: kb }, () => null, async () => {}, () => {})(''); assert.equal(kb.byUser, true, 'End marks the call as ended on purpose from this side');
  const kf = { cid: 1 }; hu({ call: kf }, () => null, async () => {}, () => {})('x', 'failed'); assert.equal(kf.byUser, undefined, 'a failure does not');
  state.deny = true; const k2 = { muted: false, speaker: false, peer: 'bob' }; S.call = k2;
  await assert.rejects(f.natMedia(k2, servers), (e) => e.name === 'NotAllowedError', 'a refused microphone reads as one');
  assert.equal(removed.length, 3); assert.equal(k2.nat, undefined);
  // callMedia takes the app's path and never touches WebKit's microphone or connection
  const media = new Function('S', 'navigator', 'RTCPeerConnection', 'findEar', 'natOk', 'natMedia', SDP + lift('async function callMedia', 'function callGather') + 'return callMedia;');
  const used = [], tk = { kind: 'audio', enabled: true, stop() {} }, npc = { close() {} }, k3 = { muted: true, timers: [] };
  await media({ call: k3 }, { mediaDevices: { getUserMedia: async () => used.push('gum') } }, class { constructor() { used.push('pc'); } }, () => used.push('findEar'), () => true,
    async () => ({ pc: npc, stream: { getTracks: () => [tk], getAudioTracks: () => [tk] } }))(k3, { iceServers: servers });
  assert.deepEqual(used, [], 'no getUserMedia, no RTCPeerConnection, no findEar'); assert.equal(k3.pc, npc); assert.equal(tk.enabled, false);
});

test('a drag down on the call screen minimizes it only when it is clearly downward', () => {
  const minimizeSwipe = new Function(lift('const minimizeSwipe=', ';') + ';return minimizeSwipe;')();
  assert.equal(minimizeSwipe(10, 120), true, 'a straight drag down');
  assert.equal(minimizeSwipe(0, 80), false, 'too short to mean it');
  assert.equal(minimizeSwipe(90, 100), false, 'mostly sideways: that is the swipe navigation');
  assert.equal(minimizeSwipe(-20, -120), false, 'upwards does nothing');
});

// ---- ringing when the app is closed: wake tickets travel as unseen messages, a pushed offer lives a minute ----
const TK = 'tIcKeT0123456789abcdef', TK2 = 'uIcKeT0123456789abcdef', TK3 = 'mIcKeT0123456789abcdef';
const flush = () => new Promise((r) => setTimeout(r, 0));

test('a pushed offer lives a minute and a plain one 30 s; the callee reads a 45-s-old offer only if its exp allows, and never twice', async () => {
  const w = await world();
  const plain = await sent(w);
  const pushed = await sent(w, 'offer', { sdp: sdp([RELAY]) }, 'alice', chat(), { ...call, pushed: true });
  const open = (x) => w.openSignal(chat(), x.rec, x.d, false);
  const a = await open(plain), b = await open(pushed);
  assert.equal(a.exp - a.ts, 30e3); assert.equal(b.exp - b.ts, 60e3);
  w.env.now += 45e3;
  assert.equal(await open(plain), null, 'a plain offer is dead at 30 s');
  assert.ok(await open(pushed), 'a pushed one still rings at 45 s: the app may have just been woken for it');
  w.env.now += 16e3; assert.equal(await open(pushed), null, 'and not past the minute');
  const r = receiver(); r.offer(1); r.S.call = null; r.offer(1);
  assert.equal(r.log.length, 1, 'the same offer handed back is not rung again');
});

function dialler(held) {
  const log = [], S = { call: null, db: { callRelay: async () => ({ iceServers: [] }), wake: (tk) => { log.push(['wake', tk]); return Promise.resolve(); } } };
  const startCall = new Function('S', 'callable', 'newCall', 'hexOf', 'dmPeer', 'ring', 'callUi', 'heldWake', 'callMedia', 'callGather', 'relayIps', 'sendSignal', 'logCall', 'callTimer', 'hangUp', 'callErr', 'natOld', 'toastErr',
    lift('async function startCall(', 'function ringIn(') + 'return startCall;')(
    S, () => true, (o) => Object.assign({ timers: [] }, o), (b) => Buffer.from(b).toString('hex'), () => 'bob', () => {}, () => {}, () => held,
    async (k) => { k.pc = { setLocalDescription: async () => {}, createOffer: async () => ({}) }; }, async () => 'v=0', () => [],
    async (c, kind, k) => { log.push([kind, k.pushed]); }, () => {}, (k, ms) => log.push(['timer', ms]), (m) => log.push(['hangUp', m]), (e) => String(e), () => false, () => {});
  return { S, log, startCall };
}

test('dialling wakes every closed iPhone the callee gave us a ticket for in the tap itself, before the offer is built, and waits a minute for them', async () => {
  const d = dialler([TK, TK2]);
  await d.startCall({ id: CID });
  assert.deepEqual(d.log, [['wake', TK], ['wake', TK2], ['offer', true], ['timer', 60e3]], 'the wake goes out first, so the phone rings while the offer is still being built; k.pushed is set before the offer, so sendSignal gives it a minute');
  const n = dialler([]);
  await n.startCall({ id: CID });
  assert.deepEqual(n.log, [['offer', false], ['timer', 45e3]], 'no ticket: the 30-s offer and 45-s ring of today');
});

test('hanging up before the offer is written still sends the end when their iPhone was woken in the tap; a plain call has nobody to tell yet', () => {
  const log = [], hu = new Function('S', 'convById', 'sendSignal', 'endCall', lift('function hangUp(', 'function endCall(') + 'return hangUp;');
  const run = (k, reason) => hu({ call: k }, () => ({ id: CID }), async (c, kind, kk, extra) => { log.push([kind, extra]); }, () => {})('', reason);
  run({ cid: CID, dir: 'out', pushed: true }); assert.deepEqual(log, [['end', {}]], 'their phone is ringing already: told to stop');
  log.length = 0; run({ cid: CID, dir: 'out', pushed: true }, 'failed'); assert.deepEqual(log, [['end', { reason: 'failed' }]], 'a failure before the offer too');
  log.length = 0; run({ cid: CID, dir: 'out' }); assert.deepEqual(log, [], 'no ticket and no offer yet: nothing to end, as in a browser today');
  log.length = 0; run({ cid: CID, dir: 'out', sent: true }); assert.deepEqual(log, [['end', {}]], 'after the offer, as before');
});

test('booted for a pushed call, an end in that chat for a call this device never rang stops the system ring after a moment: the caller gave up before the offer; once per end, not from another chat, not when an offer follows at once, not for a call it rang or without a push', () => {
  const id = (n) => String(n).padStart(32, '0');
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = receiver(); r.S.pushCall = { id: 'push-1', cid: CID, at: Date.now() };
    r.end(7); assert.deepEqual(r.log, [], 'not at once: an offer may be right behind it');
    mock.timers.tick(1500); assert.deepEqual(r.log, [['nat', 'stop', { push: 'push-1' }], ['pushCallOff']], 'the plugin ends that push\x27s system call and call mode is over');
    r.log.length = 0; r.S.pushCall = { id: 'push-2', cid: CID, at: Date.now() }; r.end(7); mock.timers.tick(1500); assert.deepEqual(r.log, [], 'the same end handed back after a reload is remembered, like an offer');
    r.log.length = 0; r.S.pushCall = { id: 'push-3', cid: 'c_other', at: Date.now() }; r.end(10); mock.timers.tick(1500); assert.deepEqual(r.log, [], 'an end in another chat is not about this push: one contact cannot stop another\x27s ring');
    r.log.length = 0; r.S.pushCall = { id: 'push-4', at: Date.now() }; r.end(13); mock.timers.tick(1500); assert.deepEqual(r.log, [], 'a push without the chat (an older app build): no early stop, the system screen keeps its own timer');
    r.log.length = 0; r.S.pushCall = { id: 'push-5', cid: CID, at: Date.now() }; r.end(11); r.offer(12); mock.timers.tick(1500); assert.deepEqual(r.log, [['ring', id(12)]], 'an offer right behind the end (a redial after a missed call) rings and the stop is dropped');
    r.log.length = 0; r.S.call = null; r.offer(8); r.S.call = null; r.S.pushCall = { id: 'push-6', cid: CID, at: Date.now() }; r.end(8); mock.timers.tick(1500);
    assert.deepEqual(r.log, [['ring', id(8)]], 'an end for a call this device rang is nothing new: the ring was its own');
    r.log.length = 0; r.S.pushCall = null; r.end(9); mock.timers.tick(1500); assert.deepEqual(r.log, [], 'no push, no system ring to stop: a browser is untouched');
  } finally { mock.timers.reset(); }
});

// The wake block with the page around it stubbed: P() is the settings document, S.db the adapter, nat the app's plugin.
function wakePage({ nat = false, plugin = null } = {}) {
  const S = { prefs: { pinned: [], muted: {}, archived: [] }, me: { handle: 'alice', dev: { id: 'devAlice1' } }, db: {}, contactsReady: true, convsLoaded: true, convs: [] };
  const log = [], store = {}, ctx = { failSend: false, online: [] };
  for (const op of ['wakeMint', 'wakeRevoke', 'pushSet', 'pushClear', 'wake']) S.db[op] = async (o) => { log.push([op, o]); return op === 'wakeMint' ? { tickets: Array.from({ length: o.n }, (_, i) => 'tk' + String(i).padStart(20, '0')) } : {}; };
  const f = new Function('P', 'S', 'validHandle', 'typeOf', 'isSelf', 'dmPeer', 'saveContacts', 'natOk', 'callable', 'sendBody', 'nat', 'ls', 'isOnline', 'isMuted',
    lift('/* ===== HUSH WAKE BEGIN', '/* ===== HUSH WAKE END') + lift('function buildBody(', '\nfunction ') + 'return { wakeP, heldWake, wakeOf, noteWake, revokeWake, muteWake, nudge, mintWake, registerPush, setMsgPush, buildBody };');
  const api = f(() => S.prefs, S, (h) => /^[a-z0-9_]{3,20}$/.test(h), (c) => c.type, () => false, (c) => c.members.find((h) => h !== S.me.handle), () => log.push(['save']),
    () => nat, (c) => !!c.callable, async (cid, body, at, quiet) => { log.push(['send', cid, body, at, quiet]); if (ctx.failSend) throw new Error('offline'); },
    (m) => { log.push(['nat', m]); return plugin ? plugin(m) : Promise.reject(new Error('not implemented')); },
    { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { if (v == null) delete store[k]; else store[k] = v; } }, (h) => ctx.online.includes(h), (cid) => !!S.prefs.muted[cid]);
  return { S, log, store, ctx, ...api };
}
const DM = (peer, last = { ts: 1000 }) => ({ id: 'd' + peer.padEnd(22, 'x'), type: 'dm', members: ['alice', peer], last, callable: true });

test('a wake ticket in a message is kept under the person and their device; the newest word wins; only the chat\'s other person is heard; null takes it back', () => {
  const w = wakePage(), c = DM('bob');
  w.noteWake(c, { from: 'bob', ts: 10 }, { d: 'devBob1', t: TK });
  assert.deepEqual(w.S.prefs.wake.held, { bob: { devBob1: { t: TK, ts: 10 } } });
  assert.deepEqual(w.heldWake('bob'), [TK]); assert.deepEqual(w.heldWake('carol'), []);
  w.noteWake(c, { from: 'bob', ts: 5 }, { d: 'devBob1', t: TK2 });
  assert.equal(w.S.prefs.wake.held.bob.devBob1.t, TK, 'an older message cannot replace a newer ticket: history opens in any order');
  w.noteWake(c, { from: 'mallory', ts: 20 }, { d: 'devMal01', t: TK });                    // someone else's name in our chat
  w.noteWake(c, { from: 'alice', ts: 20 }, { d: 'devAlice1', t: TK });                     // my own ticket coming back
  w.noteWake({ ...c, type: 'group' }, { from: 'bob', ts: 20 }, { d: 'devBob2', t: TK });   // not a one-on-one chat
  w.noteWake(c, { from: 'bob', ts: 20 }, { d: 'bad id!', t: TK }); w.noteWake(c, { from: 'bob', ts: 20 }, { d: 'devBob3', t: 'short' });
  assert.deepEqual(w.S.prefs.wake.held, { bob: { devBob1: { t: TK, ts: 10 } } }, 'none of those is kept');
  w.noteWake(c, { from: 'bob', ts: 30 }, { d: 'devBob1', t: null });
  assert.deepEqual(w.S.prefs.wake.held, {}, 'null takes it back, and a person with nothing left goes');
  assert.equal(w.log.filter((x) => x[0] === 'save').length, 2, 'saved only when something changed');
  for (let i = 0; i < 6; i++) w.noteWake(c, { from: 'bob', ts: 100 + i }, { d: 'devBob' + i, t: TK });
  assert.deepEqual(Object.keys(w.S.prefs.wake.held.bob), ['devBob2', 'devBob3', 'devBob4', 'devBob5'], 'their four newest devices at most');
  assert.match(lift('function openPost(', '\nasync function freshChan('), /if\(wake&&verified&&kind!=='comment'\)noteWake\(c,p,wake\);/, 'reached from openPost, live or from history, for a verified message only');
});

test('the vault\'s wake record is read back field by field, like the other settings', () => {
  const w = wakePage();
  assert.deepEqual(w.wakeOf({ issued: { bob: { devAlice1: TK, 'bad id': TK, devX: 'short' }, 'Bad Name': { devAlice1: TK }, carol: {} }, issuedM: { bob: { devAlice1: TK2, devX: 'short' }, carol: 7 },
    held: { bob: { devBob1: { t: TK, ts: 5 }, devBob2: { t: TK }, devBob3: { m: TK2, ts: 6 }, devBob4: { t: TK, m: TK2, ts: 7 }, devBob5: { t: TK, m: 'short', ts: 8 }, devBob6: { ts: 9 } }, dave: 'x' } }),
    { issued: { bob: { devAlice1: TK } }, issuedM: { bob: { devAlice1: TK2 } }, issuedAt: {}, issuedAtM: {}, held: { bob: { devBob1: { t: TK, ts: 5 }, devBob3: { m: TK2, ts: 6 }, devBob4: { t: TK, m: TK2, ts: 7 } } } }, 'a held device carries a call ticket, a message ticket or both, each checked');
  assert.deepEqual(w.wakeOf(undefined), { issued: {}, issuedM: {}, issuedAt: {}, issuedAtM: {}, held: {} });
  assert.deepEqual(w.wakeOf({ issuedAt: { bob: { devAlice1: 1700000000000, devX: 'nope', devY: Infinity, 'bad id': 5 }, 'Bad Name': { devAlice1: 1 }, carol: {} }, issuedAtM: { bob: { devAlice1: 1700000000001, devX: null } } }),
    { issued: {}, issuedM: {}, issuedAt: { bob: { devAlice1: 1700000000000 } }, issuedAtM: { bob: { devAlice1: 1700000000001 } }, held: {} }, 'when a message carrying each kind of ticket was last sent, per person and device: finite numbers only');
  assert.match(lift('function applyVault(', '\nasync function loadContacts('), /wake:wakeOf\(pr\.wake\)/);
});

test('a wake ticket is invisible: no preview, hidden, not a message in the unread count, left out of the chat view', async () => {
  const pv = { text: '', wake: { d: 'devBob1', t: TK }, verified: true };
  const previewText = new Function('callText', 'mediaLabel', 'plainText', lift('function previewText(', '\n') + '\nreturn previewText;')(() => 'call', () => '', (t) => t);
  assert.equal(previewText(pv), ''); assert.equal(previewText({ text: 'hi', media: [] }), 'hi');
  const hiddenPost = new Function(lift('const hiddenPost=', '\n') + '\nreturn hiddenPost;')();
  assert.equal(hiddenPost({ sl: 1 }, pv), true, 'so there is no banner for it'); assert.equal(hiddenPost({ sl: 1 }, { text: 'hi', verified: true }), false);
  const S = { me: { handle: 'alice' }, chan: null, convs: [{ id: CID, last: { ts: 50, from: 'bob' } }], unread: new Map(), mentions: new Map(), unreadKey: new Map(),
    db: { collection: () => ({ where: () => ({ limit: () => ({ get: async () => ({ docs: [{ id: 'p1', data: () => ({ from: 'bob', ts: 40 }) }, { id: 'p2', data: () => ({ from: 'bob', ts: 49 }) }] }) }) }) }) } };
  const computeUnread = new Function('S', 'lastRead', 'unsealAll', 'isBlocked', 'openPost', 'typeOf', 'mentionsMe', 'renderList', 'updateTitle',
    lift('async function computeUnread(', '\nasync function notifyNew(') + 'return computeUnread;')(S, () => 0, async (c, a) => a, () => false, async (c, d) => (d._id === 'p1' ? pv : { text: 'hi' }), () => 'dm', () => false, () => {}, () => {});
  await computeUnread();
  assert.equal(S.unread.get(CID), 1, 'two unread posts, one a ticket: one message');
  assert.match(lift('async function renderConv(', '\nfunction msgNode('), /posts=posts\.filter\(\(p,i\)=>!opened\[i\]\.wake\)/, 'the chat view drops it before drawing');
  const buildBody = wakePage().buildBody;
  assert.equal(buildBody({ wake: { d: 'devAlice1', t: TK } }), '\u0001{"text":"","wake":{"d":"devAlice1","t":"' + TK + '"}}', 'an ordinary rich body, like a call entry');
  assert.match(lift('async function sendBody(', '\nasync function sendNowScheduled('), /if\(quiet\)return put;/, 'sent quietly: the chat\'s latest-message marker is never moved to it');
});

test('an iPhone build mints one ticket per callable contact without one from this device, once a load, and sends each unseen with the device id', async () => {
  const w = wakePage({ nat: true });
  w.S.convs = [DM('bob'), DM('carol'), { ...DM('dave'), callable: false }, DM('erin', null), DM('frank')];
  w.S.prefs.wake = { issued: { frank: { devAlice1: TK } }, held: {} };
  await w.mintWake(); await w.mintWake();
  const mints = w.log.filter((x) => x[0] === 'wakeMint'), sends = w.log.filter((x) => x[0] === 'send');
  assert.deepEqual(mints, [['wakeMint', { dev: 'devAlice1', n: 2, k: 'c' }]], 'bob and carol: not the uncallable, not the chat with no message yet, not frank who has one; and one pass only; no message tickets while the setting is off');
  assert.deepEqual(sends.map((x) => [x[1], x[3], x[4]]), [[DM('bob').id, 999, true], [DM('carol').id, 999, true]], 'dated just before the latest message, quietly');
  assert.deepEqual(JSON.parse(sends[0][2].slice(1)), { text: '', wake: { d: 'devAlice1', t: 'tk' + '0'.repeat(20) } });
  assert.deepEqual(w.S.prefs.wake.issued, { frank: { devAlice1: TK }, bob: { devAlice1: 'tk' + '0'.repeat(20) }, carol: { devAlice1: 'tk' + '0'.repeat(19) + '1' } });
  assert.ok(w.log.some((x) => x[0] === 'save'));
  const f = wakePage({ nat: true }); f.S.convs = [DM('bob')]; f.ctx.failSend = true;
  await f.mintWake();
  assert.deepEqual(f.log.filter((x) => x[0] === 'wakeRevoke'), [['wakeRevoke', { tk: 'tk' + '0'.repeat(20) }]], 'a ticket that could not be delivered is taken back');
  assert.deepEqual(f.S.prefs.wake.issued, {});
  const d = wakePage({ nat: true }); d.S.me.dev = null; d.S.convs = [DM('bob')];
  await d.mintWake(); assert.deepEqual(d.log, [], 'no device key, no ticket');
  const g = wakePage({ nat: true }); g.S.convs = [DM('bob'), DM('carol')];
  const first = g.mintWake(), second = g.mintWake(); await first; await second;
  assert.deepEqual(g.log.filter((x) => x[0] === 'wakeMint'), [['wakeMint', { dev: 'devAlice1', n: 2, k: 'c' }]], 'asked for twice at once: one pass, then a second that finds nothing left to mint');
  assert.deepEqual(Object.keys(g.S.prefs.wake.issued).sort(), ['bob', 'carol']);
  assert.match(lift('function start(id){', '\nasync function republishSelf('), /computeUnread\(\);syncCallWatch\(\);mintWake\(\);/, 'runs once the settings and the chat list are in');
});

test('in a chat with a message timer the ticket\'s message expires with the timer, so the same ticket is sent again once it has, at most once a load, never minted twice', async () => {
  assert.match(lift('async function sendBody(', '\nasync function sendNowScheduled('), /const p=await sealPost\(c,body,at,quiet\?\(c\.ttl\?S\.db\.now\(\)\+c\.ttl\*1000:0\):undefined\);/, 'a quiet post in a timed chat lives ttl from the server\'s clock; elsewhere it never expires');
  const old = Date.now() - 2 * 3600e3, w = wakePage({ nat: true });
  w.S.convs = [{ ...DM('bob'), ttl: 3600 }, { ...DM('carol'), ttl: 3600 }, DM('dave'), { ...DM('erin'), ttl: 3600 }];
  w.S.prefs.wake = { issued: { bob: { devAlice1: TK }, carol: { devAlice1: TK2 }, dave: { devAlice1: TK3 } }, issuedM: {}, held: {}, issuedAt: { bob: { devAlice1: old }, carol: { devAlice1: Date.now() - 60e3 }, dave: { devAlice1: old } } };
  await w.mintWake();
  assert.deepEqual(w.log.filter((x) => x[0] === 'wakeMint'), [['wakeMint', { dev: 'devAlice1', n: 1, k: 'c' }]], 'erin alone lacks a ticket: one minted; bob\'s expired message earns no new ticket');
  const sends = w.log.filter((x) => x[0] === 'send');
  assert.deepEqual(sends.map((x) => [x[1], x[3], x[4], JSON.parse(x[2].slice(1)).wake.t]), [[DM('bob').id, 999, true, TK], [DM('erin').id, 999, true, 'tk' + '0'.repeat(20)]], 'bob gets the same ticket again, quietly, dated before the latest message; carol\'s message is a minute old and dave has no timer: nothing for them');
  assert.deepEqual(w.S.prefs.wake.issued, { bob: { devAlice1: TK }, carol: { devAlice1: TK2 }, dave: { devAlice1: TK3 }, erin: { devAlice1: 'tk' + '0'.repeat(20) } });
  assert.ok(w.S.prefs.wake.issuedAt.bob.devAlice1 > Date.now() - 5000 && w.S.prefs.wake.issuedAt.erin.devAlice1 > Date.now() - 5000, 'the send time is kept for both');
  assert.equal(w.S.prefs.wake.issuedAt.dave.devAlice1, old, 'an untimed chat is never sent again');
  assert.deepEqual(w.log.filter((x) => x[0] === 'wakeRevoke'), [], 'nothing taken back');
  const f = wakePage({ nat: true }); f.S.convs = [{ ...DM('bob'), ttl: 3600 }]; f.S.prefs.wake = { issued: { bob: { devAlice1: TK } }, issuedM: {}, held: {}, issuedAt: { bob: { devAlice1: old } } }; f.ctx.failSend = true;
  await f.mintWake();
  assert.deepEqual(f.log.filter((x) => x[0] === 'wakeMint' || x[0] === 'wakeRevoke'), [], 'a failed re-send keeps the ticket: nothing minted, nothing taken back');
  assert.deepEqual(f.S.prefs.wake, { issued: { bob: { devAlice1: TK } }, issuedM: {}, held: {}, issuedAt: { bob: { devAlice1: old } }, issuedAtM: {} }, 'and its time stays, so the next load tries again');
  const g = wakePage({ nat: true }); g.S.convs = [{ ...DM('bob'), ttl: 3600 }]; g.S.prefs.wake = { issued: { bob: { devAlice1: TK } }, issuedM: {}, held: {} };
  await g.mintWake();
  assert.equal(g.log.filter((x) => x[0] === 'send').length, 1, 'a vault saved by an older page has no send times: the ticket goes once more, then is dated');
  assert.ok(g.S.prefs.wake.issuedAt.bob.devAlice1 > Date.now() - 5000);
  const k = wakePage({ nat: true }); k.store['hush:msgPush:alice'] = true; k.S.convs = [{ ...DM('bob'), ttl: 3600 }];
  k.S.prefs.wake = { issued: { bob: { devAlice1: TK } }, issuedM: { bob: { devAlice1: TK2 } }, held: {}, issuedAt: { bob: { devAlice1: Date.now() - 60e3 } }, issuedAtM: { bob: { devAlice1: old } } };
  await k.mintWake();
  const ks = k.log.filter((x) => x[0] === 'send');
  assert.deepEqual(ks.map((x) => JSON.parse(x[2].slice(1)).wake), [{ d: 'devAlice1', m: TK2 }], 'each kind keeps its own time: the call ticket went a minute ago, only the message ticket is sent again');
  assert.deepEqual(k.log.filter((x) => x[0] === 'wakeMint'), []);
  assert.ok(k.S.prefs.wake.issuedAtM.bob.devAlice1 > Date.now() - 5000 && k.S.prefs.wake.issuedAt.bob.devAlice1 < Date.now() - 50e3, 'the m time moves, the t time stays');
  assert.match(lift('const wakeP=', '\nconst heldWake='), /issuedAt:\{\},issuedAtM:\{\}/, 'the vault record carries the send times, one map per kind');
});

test('pushToken registers this device\'s address and remembers it; logging out clears it while the connection is still the account\'s', async () => {
  const w = wakePage({ nat: true, plugin: async () => ({ tok: 'AB'.repeat(32), env: 'sandbox' }) });
  w.registerPush(w.S.me); await flush();
  assert.deepEqual(w.log, [['nat', 'pushToken'], ['pushSet', { dev: 'devAlice1', tok: 'ab'.repeat(32), env: 'sandbox', kind: 'voip' }]]);
  assert.equal(w.store['hush:pushDev:alice'], 'devAlice1');
  const bad = wakePage({ nat: true, plugin: async () => ({ tok: 'nope', env: 'prod' }) }); bad.registerPush(bad.S.me); await flush();
  assert.deepEqual(bad.log, [['nat', 'pushToken']], 'a token that is not 64 hex characters is not sent');
  const out = lift('async function logOutAccount(', '\n}');
  assert.ok(out.indexOf("ls.get('hush:pushDev:'+h,null)") > 0 && out.indexOf('S.db.pushClear({dev:pd})') < out.indexOf('S.me=null'));
  assert.match(out, /ls\.set\('hush:pushDev:'\+h,null\)/);
  assert.match(lift('function start(id){', '\nasync function republishSelf('), /healLogin\(id\);registerPush\(id\)\}\)/, 'after the device is bound, with the inbox');
});

test('blocking or deleting the one-on-one chat revokes every ticket given to them and keeps theirs', () => {
  const w = wakePage();
  w.S.prefs.wake = { issued: { bob: { devAlice1: TK, devAlice2: TK2 }, carol: { devAlice1: TK } }, issuedM: { bob: { devAlice1: TK3 }, carol: { devAlice1: TK3 } }, held: { bob: { devBob1: { t: TK, m: TK3, ts: 1 } }, carol: { devCarol1: { t: TK, ts: 1 } } } };
  w.revokeWake('bob');
  assert.deepEqual(w.log, [['wakeRevoke', { tk: TK }], ['wakeRevoke', { tk: TK2 }], ['wakeRevoke', { tk: TK3 }]], 'each ticket this account issued, of both kinds, from any of its devices');
  assert.deepEqual(w.S.prefs.wake, { issued: { carol: { devAlice1: TK } }, issuedM: { carol: { devAlice1: TK3 } }, held: { bob: { devBob1: { t: TK, m: TK3, ts: 1 } }, carol: { devCarol1: { t: TK, ts: 1 } } } }, 'their tickets stay: they can still be called once things are back to normal');
  w.revokeWake(undefined); w.revokeWake('nobody'); assert.equal(w.log.length, 3);
  assert.match(lift('function blockPeer(', '\n'), /revokeWake\(h\);saveContacts\(\)/);
  assert.match(lift('function clearForMe(', '\nfunction prefsOk('), /if\(typeOf\(c\)==='dm'&&!isSelf\(c\)\)revokeWake\(dmPeer\(c\)\);saveContacts\(\)/);
  assert.match(lift('function chatDeletes(', '\n}'), /\[\['Delete for me',\(\)=>clearForMe\(c\)\],\['Delete for everyone',async\(\)=>\{[\s\S]*?wipeChat\(c\);clearForMe\(c\)/, 'both ways of deleting a one-on-one chat pass through clearForMe');
});

test('a browser, or today\'s app without pushToken, makes no plugin, push or ticket call', async () => {
  const w = wakePage({ nat: false }); w.S.convs = [DM('bob')];
  await w.mintWake(); w.registerPush(w.S.me); await flush();
  assert.deepEqual(w.log, []);
  const t = wakePage({ nat: true }); t.S.convs = []; t.registerPush(t.S.me); await flush();
  assert.deepEqual(t.log, [['nat', 'pushToken']], 'today\'s plugin refuses pushToken: nothing else happens, and nothing is shown');
  assert.equal(t.store['hush:pushDev:alice'], undefined);
});

// ---- message push, stage 1: a "New message" banner through a second ticket kind (m) in the same hidden message ----
test('a message ticket rides the same hidden message, beside the call ticket or alone; each kind is its own word, newest wins, null takes one back', () => {
  const w = wakePage(), c = DM('bob');
  w.noteWake(c, { from: 'bob', ts: 10 }, { d: 'devBob1', t: TK });
  w.noteWake(c, { from: 'bob', ts: 20 }, { d: 'devBob1', m: TK3 });
  assert.deepEqual(w.S.prefs.wake.held, { bob: { devBob1: { t: TK, m: TK3, ts: 20 } } }, 'the m word is added beside the t');
  assert.deepEqual([w.heldWake('bob'), w.heldWake('bob', 'm')], [[TK], [TK3]]);
  w.noteWake(c, { from: 'bob', ts: 5 }, { d: 'devBob2', m: TK });   // a second device: its m word first
  w.noteWake(c, { from: 'bob', ts: 3 }, { d: 'devBob2', t: TK2 });  // its older t word, opened later from history: nothing newer was said about t
  w.noteWake(c, { from: 'bob', ts: 4 }, { d: 'devBob2', m: TK2 });  // an older m word loses to the one held
  assert.deepEqual(w.S.prefs.wake.held.bob.devBob2, { m: TK, t: TK2, ts: 5 });
  w.noteWake(c, { from: 'bob', ts: 30 }, { d: 'devBob1', m: null });
  assert.deepEqual(w.S.prefs.wake.held.bob.devBob1, { t: TK, ts: 30 }, 'null takes back one kind and the other stays');
  w.noteWake(c, { from: 'bob', ts: 40 }, { d: 'devBob1', t: null });
  assert.equal(w.S.prefs.wake.held.bob.devBob1, undefined, 'nothing left: the device goes');
  const n = w.log.length; w.noteWake(c, { from: 'bob', ts: 50 }, { d: 'devBob3' }); w.noteWake(c, { from: 'bob', ts: 50 }, { d: 'devBob3', m: 'short' }); w.noteWake(c, { from: 'bob', ts: 50 }, { d: 'devBob3', t: TK, m: 'short' });
  assert.equal(w.S.prefs.wake.held.bob.devBob3, undefined); assert.equal(w.log.length, n, 'no word, or a bad one, is nothing');
  assert.match(lift('function openPost(', '\nasync function freshChan('), /wake=\{d:String\(o\.wake\.d\|\|''\),t:tk\(o\.wake\.t\),m:tk\(o\.wake\.m\)\}/, 'a kind left out of the message stays undefined: unchanged');
});

test('a message nudges the person\'s closed iPhones through the m tickets they gave us, online or not; a call entry, a ticket or a group sends none; mute takes this account\'s m tickets back and unmute hands out a new one', async () => {
  const w = wakePage({ nat: true }), c = DM('bob');
  w.S.prefs.wake = { issued: { bob: { devAlice1: TK } }, issuedM: { bob: { devAlice1: TK, devAlice2: TK2 } }, held: { bob: { devBob1: { t: TK, m: TK3, ts: 1 }, devBob2: { t: TK, ts: 2 } } } };
  w.nudge(c, 'hi'); w.nudge(c, w.buildBody({ media: [{ id: 'x', kind: 'image' }] })); w.nudge(c, w.buildBody({ poll: { q: 'q', opts: ['a', 'b'] } }));
  assert.deepEqual(w.log, [['wake', TK3], ['wake', TK3], ['wake', TK3]], 'text, media or a poll: the m ticket of each device that gave one, through the same POST /wake as a call');
  w.log.length = 0; w.nudge(c, w.buildBody({ call: { kind: 'missed' } })); w.nudge(c, w.buildBody({ wake: { d: 'devAlice1', t: TK } })); w.nudge({ ...c, type: 'group' }, 'hi');
  assert.deepEqual(w.log, [], 'nothing to tell');
  w.ctx.online.push('bob'); w.nudge(c, 'hi'); assert.deepEqual(w.log, [['wake', TK3]], 'online too: presence lags a closed app by up to 75 s, and iOS shows no banner while the app is in front'); w.log.length = 0;
  assert.match(lift('async function sendBody(', '\nasync function sendNowScheduled('), /if\(quiet\)return put;[\s\S]*else\{await Promise\.all\(\[put,S\.db\.doc\('channels\/'\+cid\)\.update\(lastUpd\(c,\{ts:p\.ts,last:lastOf\(stored\)\}\)\)\]\);nudge\(c,body\)\}/, 'after the post is stored, for a message sent now, never for a quiet one');
  w.S.prefs.muted[c.id] = true; w.muteWake(c, true);
  assert.deepEqual(w.log, [['wakeRevoke', { tk: TK }], ['wakeRevoke', { tk: TK2 }]], 'muted: every m ticket this account gave them is taken back');
  assert.deepEqual(w.S.prefs.wake.issuedM, {}); assert.deepEqual(w.S.prefs.wake.held.bob.devBob1, { t: TK, m: TK3, ts: 1 }, 'theirs stay');
  w.log.length = 0; w.store['hush:msgPush:alice'] = true; w.S.convs = [c]; delete w.S.prefs.muted[c.id]; w.muteWake(c, false); await flush();
  assert.deepEqual(w.log.filter((x) => x[0] === 'wakeMint'), [['wakeMint', { dev: 'devAlice1', n: 1, k: 'm' }]], 'unmuted: a fresh m ticket goes out, even though this load minted already');
  w.log.length = 0; w.muteWake({ ...c, type: 'group' }, true); w.muteWake(undefined, true); assert.deepEqual(w.log, []);
  assert.match(lift('function toggleMute(', '\n'), /muteWake\(convById\(id\),!!p\.muted\[id\]\);saveContacts\(\)/);
});

test('the setting: on registers the alert address and hands out m tickets to everyone not muted; off clears it; denied turns it back off; registerPush re-registers the address for the account in use', async () => {
  const plugin = async (m) => (m === 'alertToken' ? { tok: 'CD'.repeat(32), env: 'prod' } : { tok: 'AB'.repeat(32), env: 'sandbox' });
  const w = wakePage({ nat: true, plugin }); w.S.convs = [DM('bob'), DM('carol'), DM('dave'), { ...DM('erin'), callable: false }]; w.S.prefs.muted[DM('carol').id] = true;
  w.S.prefs.wake = { issued: { bob: { devAlice1: TK }, carol: { devAlice1: TK }, dave: { devAlice1: TK }, erin: { devAlice1: TK } }, held: {}, issuedM: { dave: { devAlice1: TK2 } } };
  await w.setMsgPush(true); await flush();
  assert.deepEqual(w.log.slice(0, 2), [['nat', 'alertToken'], ['pushSet', { dev: 'devAlice1', tok: 'cd'.repeat(32), env: 'prod', kind: 'alert' }]]);
  assert.equal(w.store['hush:msgPush:alice'], true);
  assert.deepEqual(w.log.filter((x) => x[0] === 'wakeMint'), [['wakeMint', { dev: 'devAlice1', n: 1, k: 'm' }]], 'bob only: carol is muted, dave has one, erin cannot be reached');
  const sends = w.log.filter((x) => x[0] === 'send');
  assert.deepEqual(sends.map((x) => [x[1], x[3], x[4]]), [[DM('bob').id, 999, true]], 'quietly, dated just before the latest message, like a call ticket');
  assert.deepEqual(JSON.parse(sends[0][2].slice(1)), { text: '', wake: { d: 'devAlice1', m: 'tk' + '0'.repeat(20) } });
  assert.deepEqual(w.S.prefs.wake.issuedM, { dave: { devAlice1: TK2 }, bob: { devAlice1: 'tk' + '0'.repeat(20) } });
  w.log.length = 0; w.registerPush(w.S.me); await flush();
  assert.deepEqual(w.log.filter((x) => x[0] === 'nat'), [['nat', 'pushToken'], ['nat', 'alertToken']]);
  assert.deepEqual(w.log.filter((x) => x[0] === 'pushSet').map((x) => x[1].kind).sort(), ['alert', 'voip'], 'both addresses, so the alert token moves to the account now active');
  assert.equal(w.store['hush:pushDev:alice'], 'devAlice1');
  w.log.length = 0; await w.setMsgPush(false);
  assert.deepEqual(w.log, [['pushClear', { dev: 'devAlice1', kind: 'alert' }]]); assert.equal(w.store['hush:msgPush:alice'], false);
  w.log.length = 0; w.registerPush(w.S.me); await flush(); assert.deepEqual(w.log.filter((x) => x[0] === 'nat'), [['nat', 'pushToken']], 'off: the alert address is not asked for');
  const d = wakePage({ nat: true, plugin: async () => { throw Object.assign(new Error('Notifications are off for Hush in Settings'), { code: 'denied' }); } });
  await assert.rejects(d.setMsgPush(true), (e) => e.code === 'denied');
  assert.equal(d.store['hush:msgPush:alice'], undefined, 'not turned on'); assert.deepEqual(d.log, [['nat', 'alertToken']], 'no address, no mint');
  const st = lift('function settingsAdvanced(', '\nfunction openHow(');
  assert.match(st, /if\(appOnly\(\)&&natHas\('alertToken'\)\)\{/, 'the toggle shows only in an app build with the method: a browser or an older build sees nothing');
  assert.match(st, /mpc\.onchange=\(\)=>setMsgPush\(mpc\.checked\)\.catch\(e=>\{mpc\.checked=msgPushOn\(me\);toastErr\(e&&e\.code==='denied'\?'Notifications are off for Hush in '\+devWord\(\)\+' Settings':/, 'denied: the toast, and the toggle goes back to what is stored');
  assert.match(st, /'Message notifications on this '\+devWord\(\)/); assert.match(st, /'A banner says only “New message”: no name, no text\. Muted chats and blocked people never send one\.'/);
  assert.match(st, /Hide message text in banners[\s\S]*Message notifications on this '\+devWord\(\)/, 'under the banner text toggle');
  const ad = readFileSync(new URL('../../app/adapter.js', import.meta.url), 'utf8');
  assert.match(ad, /api\.pushSet=o=>call\('push\.set',\{dev:o\.dev,tok:o\.tok,env:o\.env,kind:o\.kind\}\);api\.pushClear=o=>call\('push\.clear',\{dev:o\.dev,kind:o\.kind\}\)/);
  assert.match(ad, /api\.wakeMint=o=>call\('wake\.mint',\{dev:o\.dev,n:o\.n,k:o\.k\}\)/);
});

// ---- booted for a pushed call (call mode): the lock gate, the offer the iPhone was woken for, the system screen's Answer and Decline ----
test('lockPlan: a password lock is always answered first; a PIN lock waits only when the page was not booted for a pushed call', () => {
  const lockPlan = new Function(lift('const lockPlan=', '\n') + '\nreturn lockPlan;')();
  const pin = { salt: 's', hash: 'h' }, pw = { kind: 'pw', salt: 's' };
  assert.deepEqual([null, pin, pw].map((c) => [lockPlan(c, false), lockPlan(c, true)]), [['none', 'none'], ['await', 'show'], ['await', 'await']]);
  assert.match(lift('(async()=>{\n', 'try{await unlockStore()}'), /const plan=lockPlan\(lockCfg\(\),!!S\.pushCall\);if\(plan==='await'\)await showLock\(\);else if\(plan==='show'\)showLock\(\);/, 'the boot uses it: a shown PIN lock is not waited for');
  assert.match(readFileSync(new URL('../../app/styles.css', import.meta.url), 'utf8'), /html\.call-mode \.lock\{z-index:19\}/, 'only in call mode do the call screen (20) and the bar (30) rise above the lock');
});

test('a push heard while the boot waits at a PIN gate lets it through in call mode, and the boot waits up to 5 s for the pending question', () => {
  assert.match(lift('const pushLive=', '\n'), /classList\.add\('call-mode'\);if\(lockGate\)\{lockGate\(\);lockGate=null\}/, 'pushLive: call mode on, the waiting PIN gate let through (the lock stays shown)');
  assert.match(lift('function showLock(){', 'forgot.onclick'), /return new Promise\(done=>\{lockGate=done;lockShown=true;/, 'the PIN gate keeps its resolver for a pushed call');
  assert.doesNotMatch(lift('function showPwLock(){', 'function showLock(){'), /lockGate/, 'a password gate keeps none: it is always answered first, the store is sealed under it');
  assert.match(lift('(async()=>{\n', 'try{await unlockStore()}'), /Promise\.race\(\[nat\('pending'\),new Promise\(r=>setTimeout\(r,5e3,null\)\)\]\)/, 'a slow cold start no longer loses the pending question after 2 s');
});

test('ringIn for the offer the iPhone was woken for: no page ringtone, the system screen gets the name, a minute to answer; an ordinary offer rings as before', async () => {
  const log = [], store = {}, S = {};
  const ls = { get: (k, d) => (k in store ? store[k] : d) }, displayName = (h) => 'Name of ' + h;
  const sysName = new Function('ls', 'displayName', lift('const sysName=', '\n') + '\nreturn sysName;')(ls, displayName); // the line ends in a comment
  let ringing = true; const nat = (m, o) => { log.push([m, o]); return Promise.resolve({ ringing }); }, ringFn = (on) => log.push(['ring', on]);
  const pushRing = new Function('nat', 'sysName', 'S', 'ring', lift('const pushRing=', '\n') + '\nreturn pushRing;')(nat, sysName, S, ringFn);
  const ringIn = new Function('relaySdp', 'S', 'newCall', 'ring', 'callUi', 'callTimer', 'endCall', 'pushRing', lift('function ringIn(', 'async function acceptCall(') + 'return ringIn;')(
    (x) => x, S, (o) => o, ringFn, () => log.push(['ui']), (k, ms, st) => log.push(['timer', ms, st]), () => {}, pushRing);
  const offer = { callId: 'ab'.repeat(16), from: 'bob', sdp: 'v=0' }, c = { id: 'chat1' };
  ringIn(c, offer);
  assert.deepEqual(log, [['ring', true], ['ui'], ['timer', 45e3, 'ringing']], 'an ordinary offer: the ringtone, the screen, 45 s'); assert.equal(S.call.pushId, undefined); assert.equal(S.call.state, 'ringing');
  log.length = 0; S.pushCall = { id: 'push-1', at: Date.now() - 20e3 };
  ringIn(c, offer);
  assert.deepEqual(log, [['update', { id: 'push-1', name: 'Name of bob' }], ['ui'], ['timer', 60e3, 'ringing']], 'the pushed one: the caller named on the system screen (that push\'s call, by id), no second ringtone, a minute');
  assert.equal(S.call.pushId, 'push-1'); assert.equal(S.pushCall, null, 'used once');
  log.length = 0; store['hush:hideCallName'] = true; S.pushCall = { id: 'push-2', at: Date.now() };
  ringIn(c, offer); assert.deepEqual(log[0], ['update', { id: 'push-2', name: 'Hush call' }], 'the setting hides the name there too');
  log.length = 0; S.pushCall = { id: 'push-3', at: Date.now() - 61e3 };
  ringIn(c, offer); assert.deepEqual(log, [['ring', true], ['ui'], ['timer', 45e3, 'ringing']], 'a push older than the minute an offer can live is not this call'); assert.equal(S.call.pushId, undefined);
  await new Promise((r) => setTimeout(r, 0)); log.length = 0; ringing = false; S.pushCall = { id: 'push-4', at: Date.now() };
  ringIn(c, offer); await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(log.at(-1), ['ring', true], 'the system call is gone already (ended at 20 s, or replaced): the page rings it itself, not a silent screen');
  assert.match(lift('function endCall(', '\n'), /ring\(false\);pushCallOff\(\);/, 'the end of any call leaves call mode');
});

test('a pushed call that only rang stops on the system screen when it ends in the page; one with a connection ends through it as before', () => {
  const log = [], S = {};
  const endCall = new Function('S', 'ring', 'pushCallOff', 'logCall', 'callUi', 'toast', 'nat', 'vDrop', lift('function endCall(', 'function logCall(') + 'return endCall;')(
    S, () => {}, () => {}, () => {}, () => {}, () => {}, (m, o) => { log.push([m, o]); return Promise.resolve({}); }, () => {});
  S.call = { pushId: 'push-1', timers: [], state: 'ringing' }; endCall('Missed call from bob');
  assert.deepEqual(log, [['stop', { push: 'push-1' }]], 'missed, cancelled or declined in the page: the plugin ends that push\'s system call, and only that one');
  log.length = 0; S.call = { timers: [], state: 'ringing' }; endCall(''); assert.deepEqual(log, [], 'an ordinary ringing call has nothing native to end');
  let closed = 0; S.call = { pushId: 'push-2', timers: [], state: 'live', pc: { close: () => closed++ } }; endCall('');
  assert.equal(closed, 1); assert.deepEqual(log, [], 'answered: the connection\'s own close reports the end');
});

test('a dialled call stops the page ringback once the app plays its own; before that, and for an incoming call, nothing changes', async () => {
  const rings = [], S = { call: null }, state = {};
  const C = { isNativePlatform: () => true, isPluginAvailable: (n) => n === 'CallAudio', nativePromise: async () => ({}),
    addListener: (pl, ev, cb) => { state.cb = cb; return { remove() {} }; } };
  const f = new Function('window', 'S', 'callUi', 'ls', 'displayName', 'hangUp', 'ring', lift('const appOnly=', 'const newCall=') + 'return { natMedia };')(
    { Capacitor: C }, S, () => {}, { get: (k, d) => d }, (h) => h, () => {}, (on) => rings.push(on));
  const k = { muted: false, speaker: false, peer: 'bob', dir: 'out', state: 'calling' }; S.call = k; await f.natMedia(k, []);
  const st = { gathering: 'new', ice: 'new', conn: 'new', sdp: '', speaker: false, muted: false, ended: '' };
  state.cb({ ...st, callkit: true }); assert.deepEqual(rings, [], 'iOS holds the call but its ringback is not playing yet (or never will: a refused start), so the page\'s plays on');
  state.cb({ ...st, callkit: true, ringback: true }); assert.deepEqual(rings, [false]);
  const ki = { muted: false, speaker: false, peer: 'bob', dir: 'in', state: 'connecting' }; S.call = ki; await f.natMedia(ki, []);
  state.cb({ ...st, callkit: true, ringback: true }); assert.deepEqual(rings, [false], 'the person answering has no ringback to stop');
});

test('the boot listener answers or declines the page\'s ringing call from the system screen, and does nothing else', () => {
  const code = lift("if(natOk())window.Capacitor.addListener('CallAudio','state',", '\n'), log = [], S = { call: null }; let cb = null;
  const C = { addListener: (pl, ev, f) => { log.push(['on', pl, ev]); cb = f; return { remove() {} }; } };
  new Function('natOk', 'window', 'S', 'acceptCall', 'hangUp', 'ring', 'pushRing', 'pushLive', code)(() => true, { Capacitor: C }, S, () => log.push(['accept']), (m, r) => log.push(['hangUp', m, r]),
    (on) => log.push(['ring', on]), (k) => log.push(['pushRing', k.pushId]), (id) => { log.push(['pushLive', id]); S.pushCall = { id, at: Date.now() }; });
  assert.deepEqual(log, [['on', 'CallAudio', 'state']]);
  cb({ answered: true }); cb({ ended: 'user' }); cb(null); assert.equal(log.length, 1, 'no call: nothing');
  S.call = { state: 'connecting' }; cb({ answered: true }); cb({ ended: 'user' }); assert.equal(log.length, 1, 'once answered, natMedia\'s own listener has the call');
  S.call = { state: 'ringing' }; cb({ answered: true }); assert.deepEqual(log.at(-1), ['accept'], 'Answer on the system screen');
  cb({ ended: 'user' }); assert.deepEqual(log.at(-1), ['hangUp', '', 'declined'], 'Decline on the system screen: the caller hears so');
  cb({ gathering: 'complete', ended: '' }); assert.equal(log.length, 3, 'any other report is not for it');
  log.length = 0; S.call = null; const t0 = Date.now(); cb({ push: 'PUSH-A' });
  assert.equal(S.pushCall.id, 'PUSH-A', 'a push while the page runs and has no call: the offer about to arrive is that call'); assert.ok(S.pushCall.at >= t0); assert.deepEqual(log, [['pushLive', 'PUSH-A']], 'handled like a boot (release 64): the socket is probed, pending() asked for the chat, which is watched first');
  log.length = 0; S.pushCall = null; S.call = { dir: 'in', state: 'ringing', peer: 'bob' }; cb({ push: 'PUSH-B' });
  assert.deepEqual(log, [['ring', false], ['pushRing', 'PUSH-B']], 'the offer rang here first: the system screen takes the ring over, with the name');
  assert.equal(S.call.pushId, 'PUSH-B'); assert.equal(S.pushCall, null);
  log.length = 0; cb({ push: 'PUSH-C' }); S.call = { dir: 'out', state: 'calling' }; cb({ push: 'PUSH-D' }); assert.deepEqual(log, [], 'a call that already has its push, or one this side placed, is not taken over');
  log.length = 0; new Function('natOk', 'window', code)(() => false, {}); assert.deepEqual(log, [], 'a browser, or an app build without the plugin, listens for nothing');
});

test('coming back after the lock time reloads into the lock, except during a call: a reload would end it, so the lock waits for the next return', () => {
  let cb = null, t = 1e6; const reloads = [], S = { call: null }, doc = { hidden: false, body: { style: {} }, addEventListener: (ev, f) => { assert.equal(ev, 'visibilitychange'); cb = f; } };
  const handler = (cfg) => new Function('document', 'lockCfg', 'lockAfter', 'S', 'location', 'Date', 'let awayAt=0;' + lift("document.addEventListener('visibilitychange',()=>{if(!lockCfg())return;", '\n'))(doc, () => cfg, () => 60e3, S, { reload: () => reloads.push(1) }, { now: () => t });
  const trip = (ms) => { doc.hidden = true; cb(); t += ms; doc.hidden = false; cb(); return reloads.length; };
  handler(null); assert.equal(trip(90e3), 0, 'no lock set up: nothing');
  handler({ salt: 's', hash: 'h' }); assert.equal(trip(59e3), 0, 'back within the lock time: no lock');
  S.call = { state: 'live' }; assert.equal(trip(61e3), 0, 'on a call: no reload, the call lives on'); assert.equal(doc.body.style.visibility, undefined);
  S.call = null; assert.equal(trip(61e3), 1, 'the next return after the call locks'); assert.equal(doc.body.style.visibility, 'hidden');
});

test('nat refuses at once a method the app build lacks (Capacitor never answers one), so start-up cannot hang on an older build', async () => {
  const calls = [], window = { Capacitor: { nativePromise: (p, m, o) => { calls.push(m); return Promise.resolve({ ok: m }); } } };
  const nat = new Function('window', lift('const natHas=', '\n') + '\n' + lift('const nat=', '\n') + '\nreturn nat;')(window);
  window.Capacitor.PluginHeaders = [{ name: 'CallAudio', methods: [{ name: 'start' }, { name: 'stop' }] }];   // the build on the phone before push calls
  await assert.rejects(nat('pending'), /not in this app build/, 'an older build: refused, not left waiting');
  assert.deepEqual(await nat('start'), { ok: 'start' }); assert.deepEqual(calls, ['start'], 'a method it has still goes through');
  window.Capacitor.PluginHeaders.push({ name: 'CallAudio2', methods: [{ name: 'pending' }] });
  await assert.rejects(nat('pending'), /not in this app build/, 'another plugin\'s method does not count');
  window.Capacitor.PluginHeaders = [{ name: 'CallAudio', methods: [{ name: 'pending' }] }];
  assert.deepEqual(await nat('pending'), { ok: 'pending' }, 'a build with it: asked');
  delete window.Capacitor.PluginHeaders; assert.deepEqual(await nat('update'), { ok: 'update' }, 'no method list at all: as before');
});
