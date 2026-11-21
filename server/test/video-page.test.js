// Video calls, the page side (SPEC.md 16.2, video stage P2), lifted out of app/ui.js: the line rule on descriptions, the
// iPhone page's shim that declines a browser's video line for a plugin that takes audio only, who may say a camera is on,
// when a call has video at all, the poor-link rule, the connection dot, the call-log words, and what the page never does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const lift = (from, to) => { const a = ui.indexOf(from), b = ui.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} … ${to} in app/ui.js`); return ui.slice(a, b); };
const { relaySdp } = new Function(lift('/* ===== HUSH CALL SDP BEGIN', '/* ===== HUSH CALL SDP END') + 'return { relaySdp };')();
const shim = new Function(lift('function sdpSecs(', 'function vPrefs(') + 'return { sdpStripVideo, sdpRejectVideo };')();
const rules = new Function(lift('// The rule that turns video off on a poor link', 'async function callStats(') + 'return { videoHealth, callLevel, callQuality };')();
// A real offer (Edge, R0): one audio line with its relay candidate, one bundled video line, H.264 and VP8 only. Its relay
// address is a documentation address in this copy.
const OFFER = readFileSync(new URL('./fixtures/edge-av-offer.sdp', import.meta.url), 'utf8').replace(/\r?\n/g, '\r\n');
const mlines = (s) => s.split('\r\n').filter((l) => l.startsWith('m='));

test('a description has one audio line and at most one video line, a declined one included: no data channel, no second decoder', () => {
  assert.ok(relaySdp(OFFER), 'the browser\'s audio+video offer passes');
  const audio = OFFER.split('\r\nm=video')[0] + '\r\n';
  assert.ok(relaySdp(audio), 'audio alone passes');
  const vsec = 'm=video' + OFFER.split('\r\nm=video')[1];
  assert.equal(relaySdp(OFFER.replace(/\r\n$/, '') + '\r\n' + vsec), null, 'two video lines: refused');
  assert.equal(relaySdp(OFFER + 'm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\nc=IN IP4 0.0.0.0\r\na=mid:2\r\n'), null, 'a data channel: refused');
  assert.equal(relaySdp(OFFER.replace(/m=audio /, 'm=video ')), null, 'no audio line: refused');
  assert.ok(relaySdp(OFFER.replace(/m=video 9 /, 'm=video 0 ')), 'a declined video line (port 0) passes');
});

test('the iPhone shim: the plugin gets the offer without its video line, and its answer goes out with that line declined in its place', () => {
  const x = shim.sdpStripVideo(OFFER);
  assert.ok(x, 'a video line was found');
  assert.deepEqual(mlines(x.sdp), [mlines(OFFER)[0]], 'only the audio line goes to the plugin');
  assert.ok(x.sdp.includes('\r\na=group:BUNDLE 0\r\n'), 'the bundle group no longer names the video line');
  assert.equal(x.sdp.split('\r\nm=audio')[1], OFFER.split('\r\nm=video')[0].split('\r\nm=audio')[1] + '\r\n', 'the audio section is untouched');
  assert.ok(x.sdp.endsWith('\r\n') && !/[^\r]\n/.test(x.sdp), 'CRLF throughout, as the plugin expects');
  assert.equal(shim.sdpStripVideo(OFFER.split('\r\nm=video')[0] + '\r\n'), null, 'an audio-only offer is left alone');
  // the plugin's answer (audio only, as the fake plugin and the real one write it), then the line put back declined
  const ans = ['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0', 'a=group:BUNDLE 0', 'm=audio 9 UDP/TLS/RTP/SAVPF 111', 'c=IN IP4 0.0.0.0',
    'a=fingerprint:sha-256 ' + Array(32).fill('AB').join(':'), 'a=setup:active', 'a=mid:0', 'a=sendrecv', 'a=rtpmap:111 opus/48000/2',
    'a=candidate:1 1 udp 41885439 203.0.113.5 50000 typ relay raddr 0.0.0.0 rport 0', ''].join('\r\n');
  const out = shim.sdpRejectVideo(ans, x.cut);
  assert.deepEqual(mlines(out).map((l) => l.split(' ').slice(0, 2).join(' ')), ['m=audio 9', 'm=video 0'], 'as many lines as the offer, in its order, the video one declined');
  const v = out.split('\r\nm=video')[1];
  assert.match(v, /^ 0 UDP\/TLS\/RTP\/SAVPF 108\r\nc=IN IP4 0\.0\.0\.0\r\na=inactive\r\na=mid:1\r\na=rtpmap:108 H264\/90000\r\n$/, 'port 0, inactive, the offer\'s mid and first codec');
  assert.ok(out.includes('a=group:BUNDLE 0\r\n'), 'the declined line is not in the bundle');
  assert.ok(relaySdp(out), 'the answer passes the page\'s own filter before it is sealed');
  // a video line first in the offer is declined first in the answer
  const head = OFFER.split('\r\nm=audio')[0].replace('a=group:BUNDLE 0 1', 'a=group:BUNDLE 1 0');
  const swapped = head + '\r\nm=video' + OFFER.split('\r\nm=video')[1] + 'm=audio' + OFFER.split('\r\nm=audio')[1].split('\r\nm=video')[0] + '\r\n';
  const y = shim.sdpStripVideo(swapped);
  assert.equal(y.cut.at, 0); assert.ok(y.sdp.includes('a=group:BUNDLE 0\r\n'));
  assert.deepEqual(mlines(shim.sdpRejectVideo(ans, y.cut)).map((l) => l.slice(0, 7)), ['m=video', 'm=audio']);
});

test('the shim is only for a plugin without native video, on the remote offer alone, and what the plugin hands back for the far side is what gets the declined line', () => {
  const nm = lift('async function natMedia(', 'const newCall=');
  assert.match(nm, /setRemoteDescription:d=>\{let s=d\.sdp;if\(d\.type==='offer'&&!natVideo\(\)\)\{const x=sdpStripVideo\(s\);if\(x\)\{k\.vcut=x\.cut;s=x\.sdp\}\}return nat\('setRemoteDescription',\{type:d\.type,sdp:s\}\)\}/);
  assert.match(nm, /if\(st\.sdp\)pc\.localDescription=\{sdp:k\.vcut\?sdpRejectVideo\(st\.sdp,k\.vcut\):st\.sdp\}/, 'the plugin\'s own description stays as it made it; only the copy sent on carries the line');
  assert.match(nm, /setLocalDescription:d=>nat\('setLocalDescription',\{type:d\.type,sdp:d\.sdp\}\)/);
  assert.match(lift('const natVideo=', '\n'), /^const natVideo=\(\)=>natOk\(\)&&natApi\(\)>=NATIVE_API\.video&&natHas\('setVideo'\);/, 'by the build\'s declared level: a missing CallAudio header reads as every method');
  assert.match(lift('const NATIVE_API=', '\n'), /^const NATIVE_API=\{calls:1,video:3,vpre:4\};/);
});

test('the call has video only when the offer and the answer both said this side can do it; a video call is answered with the callee\'s camera coming on, a voice call never', () => {
  const answer = lift('async function gotAnswer(', 'async function callMedia(');
  assert.match(answer, /k\.vok=!!k\.vt&&p\.video===1;if\(!k\.vok\)k\.hadVideo=false;if\(\(k\.cam\|\|k\.camWant&&k\.vt&&k\.vt\.nat\)&&!k\.vok\)\{camOff\(k\);toast\('Video isn’t available on this call\.'\)\}/, 'a "Video call" that became voice is logged as a voice call');
  const accept = lift('async function acceptCall(', 'async function gotAnswer(');
  assert.match(accept, /await k\.pc\.setRemoteDescription\(\{type:'offer',sdp:k\.offer\}\);if\(k\.vwant&&videoCan\(\)\)vAnswer\(k\);await k\.pc\.setLocalDescription\(await k\.pc\.createAnswer\(\)\)/, 'the line is taken before the answer is made');
  assert.match(accept, /Object\.assign\(\{sdp,tag:k\.tag\},k\.vok\?\{video:1\}:\{\}\)/);
  assert.match(accept, /k\.answerSent=true;sendMark\(k\);if\(k\.vok&&k\.ocam\)\{k\.rmarkAt=Date\.now\(\);if\(camAsked\(k\)\)camOn\(k,true\);else toast\('Your camera is off\. Tap Video to turn it on\.'\)\}/, 'the callee\'s camera only with its answer to an offer that said cam:1 and agreed video');
  assert.doesNotMatch(accept.replace(/camOn\(k,true\)/, ''), /camOn\(/, 'no other camera in the answer');
  assert.doesNotMatch(lift('function ringIn(', 'async function acceptCall('), /camOn\(/, 'nor does ringing');
  const start = lift('async function startCall(c,o={}){', 'function ringIn(');
  assert.match(start, /if\(k\.camWant&&k\.vt&&!k\.vt\.nat\)await camOn\(k\);/, 'the caller\'s camera only for "Video call"');
  assert.match(start, /Object\.assign\(\{sdp\},k\.vt\?\{video:1\}:\{\},cam\?\{cam:1\}:\{\}\)/);
  assert.match(lift('async function callMedia(', 'function callGather('), /if\(!m&&k\.dir==='out'&&videoCan\(\)\)\{k\.vt=pc\.addTransceiver\('video',\{direction:'sendrecv'\}\);vPrefs\(k\.vt\)\}/, 'the caller\'s line, with no camera on it');
  assert.match(lift('async function callMedia(', 'function callGather('), /bundlePolicy:'max-bundle'/, 'one transport: one relay allocation a side');
  assert.match(lift('async function callMedia(', 'function callGather('), /pc\.ontrack=e=>\{if\(S\.call!==k\|\|e\.track\.kind!=='audio'\)return;/, 'the far side\'s video never lands in the audio element');
  assert.match(lift('function ringIn(', 'async function acceptCall('), /rcam:p\.cam===1&&videoCan\(\)\?1:0,ocam:p\.cam===1&&videoCan\(\),vwant:p\.video===1/, 'a page that cannot show video rings an ordinary call');
  // gotAnswer, run: the flag both ways
  const run = (k, p) => { const calls = []; const f = new Function('relaySdp', 'relayOk', 'ring', 'callUi', 'callTimer', 'callFail', 'camOff', 'toast', 'videoCaps', 'sendMark', 'S', answer + 'return gotAnswer;')(
    (s) => s, () => true, () => {}, () => {}, () => {}, () => calls.push('fail'), () => calls.push('camOff'), (m) => calls.push('toast:' + m), () => calls.push('caps'), () => calls.push('mark'), { call: k });
    return f(k, p).then(() => calls); };
  return Promise.all([
    run({ vt: {}, cam: {}, pc: { setRemoteDescription: async () => {} } }, { sdp: 'x', video: 1 }).then((c) => assert.deepEqual(c, ['caps', 'mark'])),
    run({ vt: {}, cam: {}, pc: { setRemoteDescription: async () => {} } }, { sdp: 'x' }).then((c) => assert.deepEqual(c, ['camOff', 'toast:Video isn’t available on this call.'])),
    run({ pc: { setRemoteDescription: async () => {} } }, { sdp: 'x', video: 1 }).then((c) => assert.deepEqual(c, [])),
  ]);
});

test('who may say a camera is on: the callee with the answer\'s tag, the caller once answered; a mark only changes what is shown', () => {
  const S = { me: { handle: 'bob' }, call: null }, seen = [];
  const f = new Function('S', 'ls', 'callable', 'sendSignal', 'ringIn', 'gotAnswer', 'gotMark', 'endCall', 'displayName', 'nat', 'pushCallOff', 'natOld',
    lift('const callRecs=', 'const callErr=') + 'return { onSignal };');
  const { onSignal } = f(S, { get: (k, d) => d, set() {} }, () => true, async () => {}, () => {}, () => {}, (k, p) => seen.push(['mark', p.video]), () => seen.push(['end']), (h) => h, async () => ({}), () => {}, () => false);
  const id = 'ab'.repeat(16), mark = (o) => onSignal({ id: 'dX' }, Object.assign({ kind: 'mark', callId: id, from: 'alice', video: 1 }, o));
  S.call = { id, cid: 'dX', dir: 'out', tag: 'T1', state: 'live' };
  mark({ tag: 'T1' }); mark({ tag: 'T2' }); mark({});
  S.call.tag = ''; mark({ tag: '' }); mark({});
  assert.deepEqual(seen, [['mark', 1]], 'from the callee: only with the tag its answer carried');
  seen.length = 0; S.call = { id, cid: 'dX', dir: 'in', state: 'ringing' }; mark({});
  S.call.state = 'connecting'; mark({ video: 1 }); // between the Accept tap and the answer: a caller's mark could turn a voice call's camera on (security review r88)
  S.call.answerSent = true; mark({ video: 0 });
  S.call.id = 'cd'.repeat(16); mark({});
  assert.deepEqual(seen, [['mark', 0]], 'from the caller: once this side has answered, and for this call only');
  assert.ok(!seen.some((x) => x[0] === 'end'), 'a mark never ends a call');
  assert.doesNotMatch(lift('function gotMark(', 'async function camOn('), /camOn\(|getUserMedia/, 'nor starts a camera');
});

test('camera off is stopped, not disabled; marks go at most once a second and only on a change; the lock and the end turn it off', () => {
  const off = lift('function camOff(', 'async function camFlip(');
  assert.match(off, /replaceTrack\(null\)/); assert.match(off, /tr\.stop\(\)/); assert.doesNotMatch(off, /enabled\s*=/, 'a disabled track keeps sending black frames and the light on');
  const sm = lift('function sendMark(', 'function gotMark(');
  assert.match(sm, /v===k\.markSent\|\|\(k\.dir==='in'&&!k\.answerSent\)\)return;k\.markSent=v;k\.markAt=Date\.now\(\);/, 'no mark without a change, none before the callee\'s answer, and the time of the one sent is kept'); assert.match(sm, /const w=1000-\(Date\.now\(\)-\(k\.markAt\|\|0\)\)/, 'one a second');
  assert.match(sm, /k\.dir==='in'&&k\.tag\?\{tag:k\.tag\}:\{\}/, 'the callee\'s carry its tag'); assert.match(sm, /!v&&k\.netOff\?\{why:'net'\}:\{\}/);
  assert.match(lift('function showLock(){', '\n  if(lsPw())'), /if\(S\.call&&S\.call\.cam\)camOff\(S\.call\);/, 'defence in depth: the lock never comes up during a call (it waits for the end), and should one, no picture goes out under it');
  assert.match(lift('function endCall(', 'function logCall('), /try\{if\(k\.cam\)k\.cam\.stop\(\)\}catch\{\}k\.cam=null;/, 'the light goes out with the call');
  const on = lift('async function camOn(', 'function camOff(');
  assert.match(on, /width:\{ideal:1920\},height:\{ideal:1080\},frameRate:\{ideal:30,max:30\}/); assert.match(on, /facingMode:\{ideal:k\.facing\|\|'user'\}/);
  assert.match(on, /if\(tr&&k\.cam!==tr\)tr\.stop\(\)/, 'a camera that could not be attached is not left running');
  assert.match(lift('async function videoCaps(', 'function sendMark('), /top=k\.tcp\?360:!cell&&lv>=40\?1080:720,[^;]*;Object\.assign\(p\.encodings\[0\],\{maxBitrate:k\.tcp\?3e5:top===1080\?4e6:cell\?2e6:25e5,maxFramerate:k\.tcp\?24:30,scaleResolutionDownBy:Math\.max\(1,h\/top\)\}\);if\(dp\)p\.degradationPreference='balanced'/);
});

test('the poor-link rule: under 150 kbit/s or over 10 % lost for 6 s, or held to 180 px by the bandwidth for 10 s, drops video; one try again a call', () => {
  const s = (n, o) => Array.from({ length: n }, () => Object.assign({ kbps: 500, loss: 0, h: 480, lim: false }, o));
  const { videoHealth: vh } = rules;
  assert.equal(vh(s(10, { kbps: 149, lim: true })), 'kbps'); assert.equal(vh(s(10, { kbps: 151, lim: true })), ''); assert.equal(vh(s(9, { kbps: 10, lim: true })), '', 'nine seconds is not ten');
  assert.equal(vh(s(10, { kbps: 3 })), 'kbps', 'nothing gets through, held back or not: off');
  assert.equal(vh(s(10, { kbps: 90 })), '', 'little sent but not held back: a still picture on a good link (the 2026-10-28 two-phone test)');
  assert.equal(vh([...s(9, { kbps: 10, lim: true }), ...s(1)]), '', 'one good second in between');
  assert.equal(vh(s(6, { loss: 0.11 })), 'loss'); assert.equal(vh(s(6, { loss: 0.1 })), '');
  assert.equal(vh(s(10, { lim: true, h: 180 })), 'small'); assert.equal(vh(s(10, { lim: true, h: 181 })), ''); assert.equal(vh(s(9, { lim: true, h: 90 })), '');
  assert.equal(vh(s(10, { lim: false, h: 90 })), '', 'small but not for want of bandwidth');
  assert.equal(vh(s(10, { lim: true, h: 0 })), '', 'no frame height reported is not a small picture');
  const st = lift('async function callStats(', '// The picture:');
  assert.match(st, /if\(k\.cam\)vSample\(k,g\.vo&&p\.t\?\{kbps:\(cur\.vb-\(p\.vb\|\|0\)\)\*8\/dt,loss:g\.rv&&g\.rv\.fractionLost\|\|0,h:g\.vo\.frameHeight\|\|0,/, 'every second the camera is on goes to the warm-up rule, a figure or none');
  assert.match(st, /else if\(!k\.cam&&k\.netOff&&!k\.resumed\)\{[^\n]*k\.rs\.length===10&&k\.rs\.every\(x=>x\.loss<=\.1&&x\.rtt<600\)\)\{k\.resumed=true;k\.rs=\[\];camOn\(k\)\}/, 'once a call, after 10 s of a usable link');
  assert.match(lift('function camOff(', 'async function camFlip('), /k\.netOff=why==='net'/, 'turned off by hand: no automatic try again');
});

test('the warm-up: no judgement for 5 s after the camera starts or the call goes live, none before video has flowed; a camera that never sent in 10 s goes off with its own word and no try again', () => {
  const out = [], k0 = (o) => Object.assign({ camAt: Date.now(), t0: 0 }, o);
  const store = {}, ls = { set: (key, v) => { store[key] = v; } };
  const { vSample } = new Function('camOff', 'toast', 'ls', lift('// The rule that turns video off on a poor link', 'async function callStats(') + 'return { vSample };')((k, why) => out.push(['off', why]), (t) => out.push(['toast', t]), ls);
  const x = (kbps) => ({ kbps, loss: 0, h: 480, lim: false });
  let k = k0(); for (let i = 0; i < 9; i++) vSample(k, x(0)); assert.deepEqual(out, [], 'nothing out in the first seconds: no word yet');
  k = k0({ camAt: Date.now() - 10e3 }); vSample(k, null); assert.deepEqual(out.splice(0), [['off', undefined], ['toast', 'Video couldn’t start on this call.']], 'never sent: off with no poor-link reason (no automatic try again)');
  k = k0({ camAt: Date.now() - 30e3, t0: Date.now() - 3e3 }); vSample(k, null); assert.deepEqual(out, [], 'timed from the call going live: a camera on while it rang is not judged early');
  k = k0({ camAt: Date.now() - 2e3 }); vSample(k, x(300)); for (let i = 0; i < 8; i++) vSample(k, x(10)); assert.equal(k.vflow, true); assert.deepEqual(out, [], 'flowing, but inside the first 5 s: not judged');
  const y = (loss) => ({ kbps: 300, loss, h: 480, lim: false });
  k = k0({ camAt: Date.now() - 6e3 }); vSample(k, x(300)); for (let i = 0; i < 5; i++) vSample(k, y(0.2)); assert.deepEqual(out, [], 'five lossy seconds');
  vSample(k, y(0.2)); assert.deepEqual(out.splice(0), [['off', 'net'], ['toast', 'Video off: poor connection']], 'six lossy seconds after video flowed: the poor-link rule');
  assert.equal(store['hush:vdrop'].w, 'loss'); assert.deepEqual(store['hush:vdrop'].s.at(-1), [300, 20, 480, 0], 'the drop and its figures kept for Settings');
  k = k0({ camAt: Date.now() - 6e3 }); for (let i = 0; i < 12; i++) vSample(k, x(90)); assert.deepEqual(out, [], 'a still picture sending 90 kbit/s, not held back: video stays');
  for (const f of ['async function camOn(', 'async function camOnNat(']) assert.match(lift(f, '\nfunction '), /k\.camAt=Date\.now\(\);k\.vflow=false;k\.vs=\[\];/, f + ' starts the warm-up');
});

test('the connection dot: rtt 300/600 ms, jitter 60/150 ms, loss 2/8 %, and a new level holds 4 seconds before it shows', () => {
  const { callLevel: lv, callQuality: q } = rules;
  assert.deepEqual([lv(299, 0, 0), lv(300, 0, 0), lv(600, 0, 0), lv(0, 59, 0), lv(0, 60, 0), lv(0, 150, 0), lv(0, 0, 0.019), lv(0, 0, 0.02), lv(0, 0, 0.08)], [0, 1, 2, 0, 1, 2, 0, 1, 2]);
  assert.equal(lv(700, 70, 0), 2, 'the worst of the three');
  let st = q({}, 0); assert.equal(st.q, 0, 'the first sample sets it');
  for (let i = 0; i < 3; i++) st = q(st, 2); assert.equal(st.q, 0, 'three seconds poor: still shown good'); st = q(st, 2); assert.equal(st.q, 2, 'the fourth: poor');
  st = q(st, 1); st = q(st, 1); st = q(st, 0); st = q(st, 1); st = q(st, 1); st = q(st, 1); assert.equal(st.q, 2, 'interrupted: the count starts again'); st = q(st, 1); assert.equal(st.q, 1);
});

test('the entry a call leaves says video when a camera was on, on either side', () => {
  const log = new Function('displayName', lift('const fmtDur=', '\n') + lift('function buildBody(', '\nfunction ') + lift('/* ===== HUSH CALL LOG BEGIN', '/* ===== HUSH CALL LOG END')
    + 'return { callOutcome, callOf, callText };')((h) => h);
  assert.deepEqual(log.callOutcome({ t0: Date.now() - 192e3, hadVideo: true }), { kind: 'ended', secs: 192, video: 1 });
  assert.deepEqual(log.callOutcome({ t0: Date.now() - 5e3 }), { kind: 'ended', secs: 5 }, 'a voice call carries no flag: older pages read it as before');
  const t = (x, out) => log.callText(log.callOf(x, true, out, 'bob'));
  assert.equal(t({ kind: 'ended', secs: 192, video: 1 }, true), 'Outgoing video call · 3:12');
  assert.equal(t({ kind: 'ended', secs: 40, video: 1 }, false), 'Incoming video call · 0:40');
  assert.equal(t({ kind: 'missed', secs: 0, video: 1 }, false), 'Missed video call');
  assert.equal(t({ kind: 'ended', secs: 125 }, true), 'Outgoing call · 2:05', 'voice as before');
  assert.equal(log.callOf({ kind: 'ended', secs: 5, video: 2 }, true, true, 'bob').video, 0, 'video is 0 or 1, nothing else');
  assert.equal(log.callOf({ kind: 'ended', secs: 5, video: 1 }, false, true, 'bob').video, 0, 'and only from a one-on-one chat by one of its two people');
});

test('the page never records, captures or casts a call', () => {
  const calls = lift('/* ===== HUSH CALL SDP BEGIN', '/* ===== HUSH WAKE BEGIN');
  for (const api of ['MediaRecorder', 'ImageCapture', 'captureStream', 'drawImage', 'requestPictureInPicture', 'toDataURL', 'toBlob']) assert.ok(!calls.includes(api), api + ' in the call code');
  for (const api of ['ImageCapture', 'captureStream']) assert.ok(!ui.includes(api), api + ' anywhere in the page');
  const els = lift('function vEls(', 'const vRemote=');
  assert.match(els, /v\.disableRemotePlayback=true/); assert.doesNotMatch(els, /\.controls\s*=|'controls'/, 'no controls on the video elements');
});

test('the far side\'s picture follows its frames: three seconds without one while the mark says on is Paused, never off', () => {
  const vRemote = new Function(lift('const vRemote=', '\nfunction vSync(') + '\nreturn vRemote;')(), now = Date.now();
  assert.equal(vRemote({ vok: true, rcam: 1, rseen: now - 500 }), 'live');
  assert.equal(vRemote({ vok: true, rcam: 1, rseen: now - 3500, rmarkAt: now - 9000 }), 'paused');
  assert.equal(vRemote({ vok: true, rcam: 1, rmarkAt: now - 1000 }), 'off', 'just turned on: waiting for its first frame, no "Paused" yet');
  assert.equal(vRemote({ vok: true, rcam: 0, rseen: now }), 'off', 'the mark says off: off, whatever frames are still in flight');
  assert.equal(vRemote({ vok: false, rcam: 1, rseen: now }), 'off', 'no video agreed: nothing shown');
});

test('review fixes: a camera attached as the call ends is stopped, a flip after Video off does not reopen it, a callee mark waits for its answer', () => {
  const on = lift('async function camOn(', 'function camOff(');
  assert.match(on, /await k\.vt\.sender\.replaceTrack\(tr\);if\(S\.call!==k\)throw new Error\('ended'\);k\.cam=tr;/, 'checked again after the attach; the catch stops a track that is not k.cam');
  assert.match(on, /catch\(e\)\{if\(tr&&k\.cam!==tr\)tr\.stop\(\)/);
  assert.match(lift('async function camFlip(', 'const callVideoToggle='), /if\(d\.length<2\|\|k\.cam!==old\)return;/, 'turned off while the device list came: stays off');
  assert.match(lift('function sendMark(', 'function gotMark('), /\|\|\(k\.dir==='in'&&!k\.answerSent\)\)return;k\.markSent=v;/, 'not sent, and not counted as sent, before the answer');
  assert.match(ui, /await sendSignal\(c,'answer',k,Object\.assign\(\{sdp,tag:k\.tag\},k\.vok\?\{video:1\}:\{\}\)\);k\.answerSent=true;sendMark\(k\);/, 'the waiting mark goes right after the answer');
});
