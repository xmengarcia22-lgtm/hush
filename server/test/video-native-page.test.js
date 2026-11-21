// Video calls, the app's page half (SPEC.md 16.5, video stage P3), lifted out of app/ui.js: inert below build level 3; at
// level 3 the plugin owns the line, the camera and the pictures, and the page says where the pictures go, never while
// anything stands above the call; the floating picture under every lock; no video word in any push.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app/styles.css', import.meta.url), 'utf8');
const lift = (from, to) => { const a = ui.indexOf(from), b = ui.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} … ${to} in app/ui.js`); return ui.slice(a, b); };

// natMedia run against a fake plugin: what start is told and whether the page takes the native video line
const natMediaRun = async (nv, k) => {
  const calls = [], window = { Capacitor: { addListener: () => ({ remove() {} }) } };
  const nat = (m, o) => { calls.push([m, o]); return Promise.resolve({}); };
  const camAsked = new Function('return ' + lift('const camAsked=', '; //').slice('const camAsked='.length))();
  const f = new Function('window', 'nat', 'natVideo', 'sysName', 'sdpStripVideo', 'sdpRejectVideo', 'S', 'hangUp', 'ring', 'callUi', 'natVState', 'camAsked',
    lift('async function natMedia(', 'const newCall=') + 'return natMedia;')(window, nat, () => nv, (h) => h, () => null, (s) => s, { call: k }, () => {}, () => {}, () => {}, () => {}, camAsked);
  await f(k, []);
  return calls;
};

test('below build level 3 nothing changes: start says nothing of video, the page takes no native line, the shim stays', async () => {
  const k = { dir: 'out', peer: 'bob', camWant: true };
  const calls = await natMediaRun(false, k);
  const start = calls.find((c) => c[0] === 'start')[1];
  assert.equal(start.video, undefined); assert.equal(start.videoCall, undefined); assert.equal(k.vt, undefined, 'no video line on an api-2 build');
  assert.match(lift('async function natMedia(', 'const newCall='), /if\(d\.type==='offer'&&!natVideo\(\)\)\{const x=sdpStripVideo\(s\)/, 'the shim, for a build without native video');
  assert.match(lift('const videoCan=', '\n'), /^const videoCan=\(\)=>appOnly\(\)\?natVideo\(\):/, 'the app offers video only with native video');
});

test('at build level 3 the plugin negotiates the line: start says video, and the system screen says a video call only when one was chosen', async () => {
  const out = { dir: 'out', peer: 'bob', camWant: true };
  let s = (await natMediaRun(true, out)).find((c) => c[0] === 'start')[1];
  assert.deepEqual([s.video, s.videoCall], [true, true]); assert.deepEqual(out.vt, { nat: true });
  const voice = { dir: 'out', peer: 'bob', camWant: false };
  s = (await natMediaRun(true, voice)).find((c) => c[0] === 'start')[1]; assert.deepEqual([s.video, s.videoCall], [true, false], 'a voice call keeps the line, camera off');
  const inc = { dir: 'in', peer: 'bob', rcam: 1, ocam: true };
  s = (await natMediaRun(true, inc)).find((c) => c[0] === 'start')[1]; assert.deepEqual([s.video, s.videoCall], [true, true], 'an offer that said cam:1');
  s = (await natMediaRun(true, { dir: 'in', peer: 'bob', rcam: 1, ocam: false })).find((c) => c[0] === 'start')[1]; assert.equal(s.videoCall, false, 'a voice offer whose caller turned a camera on later (rcam by a mark) stays a voice call: no camera, no speaker');
  s = (await natMediaRun(true, { dir: 'in', peer: 'bob', ocam: true, sys: true, sysSeen: false })).find((c) => c[0] === 'start')[1]; assert.equal(s.videoCall, false, 'answered on the system screen while it said audio: voice');
  s = (await natMediaRun(true, { dir: 'in', peer: 'bob', ocam: true, sys: true, sysSeen: true })).find((c) => c[0] === 'start')[1]; assert.equal(s.videoCall, true, 'answered on the system screen once it said video');
  assert.match(lift('async function natMedia(', 'const newCall='), /if\(st\.video&&S\.call===k\)natVState\(k,st\.video\);/, 'the plugin\'s video news reaches the page');
  assert.match(lift('async function startCall(c,o={}){', 'function ringIn('), /camWant:!!o\.cam/);
  assert.match(lift('function vAnswer(k){', 'async function videoCaps('), /^function vAnswer\(k\)\{if\(k\.vt&&k\.vt\.nat\)\{k\.vok=true;k\.markSent=0;return\}/, 'the callee takes the line through the plugin, its camera off');
});

// camOn / camOff / camFlip run with the plugin: only setVideo and switchCamera, never getUserMedia
const camKit = (refuse = false) => {
  const calls = [], gum = [], k = { vt: { nat: true }, vok: true, timers: [] }, S = { call: k };
  const nat = (m, o) => { calls.push([m, o]); return Promise.resolve(m === 'switchCamera' ? { facing: 'back' } : m === 'setVideo' ? { on: !refuse && !!(o && o.on), facing: 'front' } : {}); };
  const navigator = { mediaDevices: { getUserMedia: (x) => { gum.push(x); throw new Error('no'); }, enumerateDevices: async () => [] } };
  const ls = { get: () => true, set() {} };
  const src = lift('async function camOnNat(', 'const callVideoToggle=');
  const f = new Function('k0', 'S', 'nat', 'navigator', 'ls', 'toast', 'toastErr', 'sendMark', 'callUi', 'vSync', 'videoCaps', src + 'return { camOn, camOff, camFlip, natVState };')(k, S, nat, navigator, ls, () => {}, () => {}, () => calls.push(['mark']), () => {}, () => {}, () => {});
  return { k, S, calls, gum, ...f };
};

test('in the app the Video key turns the camera on and off through the plugin, Flip turns it round, and the far side\'s news only changes what is shown', async () => {
  const t = camKit();
  await t.camOn(t.k);
  assert.deepEqual(t.calls[0], ['setVideo', { on: true, facing: 'front' }]); assert.equal(t.gum.length, 0, 'never getUserMedia in the app');
  assert.ok(t.k.cam && t.k.cam.nat && t.k.hadVideo, 'the stand-in track'); assert.ok(t.calls.some((c) => c[0] === 'mark'), 'the mark goes as in a browser');
  await t.camFlip(t.k); assert.ok(t.calls.some((c) => c[0] === 'switchCamera')); assert.equal(t.k.facing, 'environment');
  t.camOff(t.k); assert.equal(t.k.cam, null); assert.deepEqual(t.calls.filter((c) => c[0] === 'setVideo').pop(), ['setVideo', { on: false }], 'off is the plugin\'s camera stopped');
  await t.camOn(t.k); t.natVState(t.k, { local: 'off', remote: 'live' }); assert.equal(t.k.cam, null, 'the camera taken by another app: off'); assert.equal(t.k.nrem, 'live');
  const u = camKit(); u.natVState(u.k, { local: 'on', remote: 'live' }); assert.equal(u.k.cam, undefined, 'the plugin\'s news never turns a camera on');
  assert.ok(Date.now() - u.k.rseen < 1000, 'a live far side counts as a frame seen now'); const r0 = u.k.rseen; u.natVState(u.k, { remote: 'stalled' }); assert.equal(u.k.rseen, r0, 'stalled: no new frame, so "Paused" after 3 s');
  assert.match(lift('function vThumb(k){', '\n  if(!th)'), /if\(!k\.vl\|\|vRemote\(k\)!=='live'\|\|\(k\.vt&&k\.vt\.nat\)\)\{if\(th\)th\.remove\(\);return\}/, 'no floating browser thumbnail in the app: it has its own picture in picture');
  const v = camKit(); v.S.call = null; await v.camOn(v.k); assert.equal(v.k.cam, undefined, 'the call ended while the camera started: no stand-in'); assert.deepEqual(v.calls.pop(), ['setVideo', { on: false }], 'and the plugin\'s camera is stopped');
  assert.match(lift('async function camOn(', 'function camOff('), /^async function camOn\(k,auto\)\{if\(k\.cam\|\|k\.camBusy\|\|!k\.vt\)return;if\(k\.vt\.nat\)return camOnNat\(k\);/);
});

// vLayout run: rectangles while the call screen shows, nulls while minimized, covered or gone
const layKit = ({ mini = false, cover = null, rlive = true, cam = true } = {}) => {
  const calls = [], cls = new Set(), k = { vt: { nat: true }, mini, cam: cam ? { nat: true } : null, vl: {}, rvEl: { r: [0, 0, 390, 844] }, lvEl: { r: [282, 103, 96, 128] } };
  const sheetEl = { isConnected: true, closest: () => own }, own = { id: 'own' };
  const nodes = cover ? [own, cover] : [own];
  const document = { documentElement: { classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)), remove: (c) => cls.delete(c) } }, querySelectorAll: () => nodes };
  const getComputedStyle = (x) => ({ zIndex: String(x.z ?? 20) });
  const vRemote = () => (rlive ? 'live' : 'off');
  const src = lift('const vCovered=', '\nfunction vThumb(');
  const f = new Function('document', 'getComputedStyle', 'callSheet', 'S', 'nat', 'vRemote', src.replace(/const vBox=[^\n]*\n/, 'const vBox=e=>e&&e.r?{x:e.r[0],y:e.r[1],w:e.r[2],h:e.r[3]}:null;\n') + 'return { vLayout, vCovered, vUp };')(
    document, getComputedStyle, { sh: sheetEl }, { call: k }, (m, o) => { calls.push([m, o]); return Promise.resolve({}); }, vRemote);
  return { k, calls, cls, ...f };
};

test('the pictures go where the page\'s two empty frames are, and nowhere while the call is minimized or anything stands above it', () => {
  let t = layKit(); t.vLayout(t.k);
  assert.deepEqual(t.calls[0], ['setLayout', { remote: { x: 0, y: 0, w: 390, h: 844 }, local: { x: 282, y: 103, w: 96, h: 128 } }]); assert.ok(t.cls.has('call-native-video'), 'the call screen goes clear');
  t.vLayout(t.k); assert.equal(t.calls.length, 1, 'nothing sent again while nothing moved');
  t = layKit({ rlive: false }); t.vLayout(t.k); assert.deepEqual(t.calls[0][1], { remote: null, local: { x: 282, y: 103, w: 96, h: 128 } }, 'the far side\'s camera off: this side\'s picture alone');
  t = layKit({ mini: true }); t.k.pip = true; t.vLayout(t.k); assert.deepEqual(t.calls[0], ['setLayout', { remote: null, local: null }]); assert.deepEqual(t.calls[1], ['setPip', { on: false }]); assert.ok(!t.cls.has('call-native-video'));
  t = layKit({ cover: { z: 9999 } }); t.k.pip = true; t.vLayout(t.k); assert.deepEqual(t.calls[0][1], { remote: null, local: null }, 'a lock over the call: no pictures'); assert.deepEqual(t.calls[1], ['setPip', { on: false }]);
  t = layKit({ cover: { z: 20 } }); t.vLayout(t.k); assert.deepEqual(t.calls[0][1], { remote: null, local: null }, 'a sheet over the call');
  t = layKit({ cover: { z: 19 } }); t.vLayout(t.k); assert.notEqual(t.calls[0][1].remote, null, 'the call-mode lock stands below the call screen by design');
  const b = layKit(); b.k.vt = { sender: {} }; b.vLayout(b.k); assert.equal(b.calls.length, 0, 'a browser call: no plugin calls at all');
  assert.match(lift('function vDrop(k){', '\nfunction callUi('), /if\(k\.vt&&k\.vt\.nat\)\{document\.documentElement\.classList\.remove\('call-native-video'\);[^\n]*nat\('setLayout',\{remote:null,local:null\}\)[^\n]*nat\('setPip',\{on:false\}\)/, 'the end takes the pictures away');
  assert.match(ui, /bar\.replaceChildren\(\.\.\.\[main,mu,cm,sp,en\]\.filter\(Boolean\)\);vThumb\(k\);vLayout\(k\);/, 'minimizing tells the plugin at once');
  assert.match(ui, /\n {2}for\(const v of \[k\.rvEl,k\.lvEl\]\)if\(v\.srcObject&&v\.paused\)v\.play\(\)\.catch\(\(\)=>\{\}\);vLayout\(k\)\}/, 'every redraw of the picture says where it is');
  assert.match(ui, /addEventListener\('resize',\(\)=>\{if\(S\.call\)vLayout\(S\.call\)\}\);/);
  assert.match(lift('function dragCorner(', 'function vEls('), /requestAnimationFrame\(\(\)=>vLayout\(S\.call\)\);n\._dragged=Date\.now\(\);/, 'a dragged picture moves when it lands');
});

test('picture in picture only while the app is in the background with the far side\'s picture live and nothing over the call', () => {
  const l = ui.match(/document\.addEventListener\('visibilitychange',\(\)=>\{const k=S\.call;if\(!k\|\|!k\.vt\|\|!k\.vt\.nat\|\|!k\.vok\)return;[^\n]*/);
  assert.ok(l, 'the listener'); assert.match(l[0], /const on=document\.hidden&&vUp\(k\)&&vRemote\(k\)==='live';if\(on!==!!k\.pip\)\{k\.pip=on;nat\('setPip',\{on\}\)/, 'the same test as the pictures: not while minimized or covered, or the next redraw turns it off again');
  assert.match(lift('function vLayout(k){', '\n'), /const up=vUp\(k\);/, 'one test for both');
  const t = layKit({ mini: true }); assert.equal(t.vUp(t.k), false, 'minimized: no picture in picture'); const u = layKit(); assert.equal(u.vUp(u.k), true);
});

test('review fixes: the camera runs only when the plugin says so, and a camera this page did not turn on is turned off', async () => {
  const t = camKit(true); await t.camOn(t.k);
  assert.equal(t.k.cam, undefined, 'the plugin said the camera did not start: no stand-in camera, so sendMark has nothing to say "on" about');
  assert.ok(!t.k.hadVideo, 'nor a video call in the log');
  const u = camKit(); u.natVState(u.k, { local: 'on', remote: 'none' }); assert.deepEqual(u.calls.pop(), ['setVideo', { on: false }], 'the plugin reports a camera on that this page never turned on: off at once');
  const w = camKit(); await w.camOn(w.k); const n = w.calls.length; w.natVState(w.k, { local: 'on', remote: 'live' }); assert.equal(w.calls.length, n, 'a camera this side turned on is left alone');
});

test('review fixes: while native pictures show in call mode, the PIN lock under the call screen and what it holds down are not painted', () => {
  const head = 'html.call-native-video.call-mode :is(', a = css.indexOf(head), b = css.indexOf('){visibility:hidden}', a);
  assert.ok(a >= 0 && b > a, 'a rule that hides them (not only a lower z-index)');
  const sels = css.slice(a + head.length, b).split(/,(?![^(]*\))/).map((x) => x.trim());
  for (const s of ['.lock', '.lock~.inbanner', '.lock~.toast', '.lock~.reqalert', '.lock~.backdrop:not(:has(#callSheet))']) assert.ok(sels.includes(s), s + ' stays painted over the native pictures: ' + JSON.stringify(sels));
});

test('the browser\'s guards stay on the browser path; the app\'s stats feed the same drop rule', async () => {
  const vs = lift('function vSync(k){', '\n// In the app the plugin draws');
  assert.match(vs, /if\(k\.vt&&!k\.vt\.nat&&!k\.rvEl\.srcObject\)k\.rvEl\.srcObject=new MediaStream\(\[k\.vt\.receiver\.track\]\);/);
  assert.match(vs, /if\(lv&&!k\.cam\.nat&&\(k\.lvEl\.srcObject/, 'no MediaStream of a stand-in track');
  const st = lift('async function natVStats(k){', '\n// Picture in picture in the app');
  assert.match(st, /if\(k\.cam&&!k\.cam\.pre\)\{if\(k\.nloc==='paused'\)\{k\.camAt=now;k\.vs=\[\]\}else vSample\(k,o&&o\.kbps!=null\?\{kbps:\+o\.kbps\|\|0,loss:\+o\.loss\|\|0,h:\+o\.h\|\|0,lim:o\.limit==='bandwidth'\}:null\)\}/, 'the same warm-up rule; a first figure without a rate is no figure; a paused camera (the app in the background) restarts it');
  assert.match(lift('function natVState(k,v){', '\n'), /k\.nloc=v\.local;/);
  const t = camKit(); t.k.vok = false; await t.camOn(t.k);
  assert.deepEqual(t.calls.filter((c) => c[0] === 'setVideo').pop(), ['setVideo', { on: false }], 'a camera the plugin starts in a call whose answer had no video goes off again'); assert.ok(!t.k.cam);
  const tg = new Function('camOff', 'camOn', 'callUi', 'natPre', lift('const callVideoToggle=', '\n') + '\nreturn callVideoToggle;')(() => {}, () => { throw new Error('camOn while ringing out'); }, () => {}, () => false);
  const k = { state: 'calling', vt: { nat: true }, camWant: true }; tg(k); assert.equal(k.camWant, false, 'ringing out, a tap withdraws the wish'); tg(k); assert.equal(k.camWant, true);
  assert.match(lift("if((k.vt||k.vwait&&k.state==='calling')&&(k.vok||k.state==='calling')){", '\n'), /const on=!!k\.cam\|\|!!k\.camBusy&&!k\.camNo\|\|k\.state==='calling'&&\(!k\.vt\|\|!!k\.vt\.nat\)&&!!k\.camWant,/, 'the key shows the wish while it rings out, and a camera that is starting');
  assert.match(st, /else if\(!k\.cam&&k\.netOff&&!k\.resumed\)\{[^\n]*\{k\.resumed=true;k\.rs=\[\];camOn\(k\)\}/, 'the one automatic try again, as in a browser');
  assert.match(st, /if\(k\.nrem==='live'\)k\.rseen=now;/, 'the far side\'s frames by the plugin\'s word');
  assert.match(ui, /if\(!k\.nat\)k\.statT=setInterval\(\(\)=>callStats\(k\),1000\);else if\(k\.vt&&k\.vt\.nat\)k\.statT=setInterval\(\(\)=>natVStats\(k\),1000\);/);
});

test('the app\'s "Video call": the offer is not held for the camera (the plugin starts it only once the call\'s audio runs), it still says cam, and the camera goes on after the answer', () => {
  const sc = lift('async function startCall(c,o={}){', '\nfunction ringIn(');
  assert.match(sc, /if\(k\.camWant&&k\.vt&&!k\.vt\.nat\)await camOn\(k\);else if\(k\.camWant&&k\.vt&&natPre\(\)\)camOnNat\(k,true\);await k\.pc\.setLocalDescription/, 'a browser opens its camera before the offer; a level-4 app starts its ringing preview (not awaited); a level-3 app waits for the answer');
  assert.match(sc, /const cam=k\.cam\|\|k\.camWant&&k\.vt&&k\.vt\.nat\?1:0;k\.markSent=cam;\n\s*await sendSignal\(c,'offer',k,Object\.assign\(\{sdp\},k\.vt\?\{video:1\}:\{\},cam\?\{cam:1\}:\{\}\)\)/);
  const ga = lift('async function gotAnswer(k,p){', '\nasync function callMedia(');
  assert.match(ga, /if\(\(k\.cam\|\|k\.camWant&&k\.vt&&k\.vt\.nat\)&&!k\.vok\)\{camOff\(k\);toast\('Video isn’t available on this call\.'\)\}/, 'an answer without video: said, and no camera opened');
  assert.match(ga, /if\(k\.vok\)\{videoCaps\(k\);if\(k\.vt\.nat&&k\.camWant&&\(!k\.cam\|\|k\.cam\.pre\)\)camOnNat\(k\);else sendMark\(k\)\}/, 'the camera goes on the line after the answer (from the preview, or started then), not awaited; no off mark while it starts');
  assert.match(css, /\nhtml\.call-full \.toast\{bottom:auto;top:calc\(env\(safe-area-inset-top,0px\) \+ 65px\)\}/, 'a toast on the full call screen stays clear of End');
});

test('the system screen says video only for a verified offer that chose it, and no push names video', () => {
  assert.match(ui, /const pushRing=k=>nat\('update',\{id:k\.pushId,name:sysName\(k\.peer\),\.\.\.\(k\.rcam\?\{video:true\}:\{\}\)\}\)/);
  assert.match(lift('function ringIn(', 'async function acceptCall('), /^function ringIn\(c,p\)\{const sdp=relaySdp\(p\.sdp\);/, 'rcam is set in ringIn, after openSignal checked the offer');
  const wake = lift('/* ===== HUSH WAKE BEGIN', '/* ===== HUSH WAKE END');
  assert.doesNotMatch(wake, /video|cam:/i, 'nothing about video in a wake or a nudge');
});

test('every lock covers every picture: the floating thumbnail sits under the call-mode lock, and the clear call screen leaves the lock opaque', () => {
  const z = (sel) => { const m = css.match(new RegExp(sel.replace(/[.#]/g, (c) => '\\' + c) + '\\{[^}]*z-index:(\\d+)')); assert.ok(m, sel); return +m[1]; };
  const thumb = z('#callThumb'), lock = z('.lock'), callModeLock = +css.match(/html\.call-mode \.lock\{z-index:(\d+)\}/)[1];
  assert.ok(thumb < callModeLock && thumb < lock, `#callThumb ${thumb} under the locks ${callModeLock}/${lock}`);
  assert.match(css, /html\.call-native-video \.backdrop:has\(#callSheet\),html\.call-native-video #callSheet\{background:transparent\}/);
  for (const r of css.split('\n').filter((l) => /call-native-video[^{]*\.lock/.test(l))) {
    assert.match(r, /^html\.call-native-video\.call-mode /, 'a lock is set aside only in call mode, where it stands under the call screen: ' + r.slice(0, 80));
    assert.doesNotMatch(r.split('{')[1], /background/, 'the lock is never made see-through');
  }
  assert.match(css, /html\.call-native-video \.call-video:not\(\.rv\) \.v-local\{box-shadow:0 0 0 200vmax var\(--bg\)\}/, 'this side\'s picture alone: the rest keeps the call screen\'s colour');
});

test('the call screen over video (second two-phone test): nothing selectable, the whole far-side picture, the note under the status line, a compact row of readable keys only while a picture shows, no fading', () => {
  assert.ok(css.includes('#callSheet,#callBar{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}'), 'a hold on End is a press, not a selection');
  assert.ok(css.includes('.call-video video:not(.small){inset:0;width:100%;height:100%;object-fit:contain}'), 'a browser shows the whole picture too');
  assert.ok(css.includes('.v-note{margin-top:6px;') && !/\.v-note\{position:absolute/.test(css), 'the note is not in the key row');
  assert.ok(!/\.idle/.test(css) && !ui.includes('vWake'), 'the keys never fade out over video');
  assert.ok(css.includes('#callSheet.vcall .call-btn svg,#callSheet.vcall .call-btn.end svg{width:56px;height:56px;'), 'design A: one row of 56 px circles');
  const vs = lift('function vSync(k){', '\n// In the app the plugin draws');
  assert.ok(vs.includes("callSheet.sh.classList.toggle('vcall',r==='live'||lv||w);callSheet.sh.classList.toggle('vwait',w)"), 'the compact layout only while a picture shows: a voice call keeps its keys');
  assert.ok(lift('function vEls(k){', 'const vRemote=').includes('k.vl.append(k.rvEl,k.lvEl);return k.vl}') && ui.includes('if(vl)who.append(k.vnote);'), 'the note sits with the name and status');
  assert.ok(!/k\.hint/.test(ui) && !css.includes('.call-btn.hint'), 'no camera-off hint: the callee\'s camera comes on with its answer');
});

test('security review r88: a tap while the camera starts cancels it (the key reads off, the plugin is told, no camera, no error)', async () => {
  const t = camKit(); const p = t.camOn(t.k); assert.equal(t.k.camBusy, true);
  const tg = new Function('camOff', 'camOn', 'callUi', 'nat', 'natPre', lift('const callVideoToggle=', '\n') + '\nreturn callVideoToggle;')(() => {}, () => { throw new Error('camOn again'); }, () => {}, (m, o) => { t.calls.push([m, o]); return Promise.resolve({}); }, () => false);
  t.k.netOff = true; tg(t.k); assert.equal(t.k.camNo, true); assert.equal(t.k.netOff, false, 'the cancel stands: no automatic try again after a poor link'); assert.deepEqual(t.calls.at(-1), ['setVideo', { on: false }], 'the plugin is told at once');
  await p; assert.ok(!t.k.cam, 'the camera that was starting never counts as on'); assert.deepEqual(t.calls.filter((c) => c[0] === 'setVideo').at(-1), ['setVideo', { on: false }]);
  assert.match(lift("if((k.vt||k.vwait&&k.state==='calling')&&(k.vok||k.state==='calling')){", '\n'), /!!k\.camBusy&&!k\.camNo/, 'the key reads off right after the tap');
  assert.match(lift('async function camOn(k,auto){', '\nfunction '), /if\(S\.call!==k\|\|k\.camNo\)throw new Error\('ended'\);[\s\S]*if\(k\.camNo\)return camOff\(k\);/, 'a browser camera cancelled while it opened is stopped');
});

test('round 4: the caller\'s ringing preview (level 4): the camera on this screen only, then on the line after the answer; a tap ends it and the wish', async () => {
  assert.match(lift('const natPre=', '\n'), /^const natPre=\(\)=>natVideo\(\)&&natApi\(\)>=NATIVE_API\.vpre;/);
  const t = camKit(); t.k.state = 'calling'; delete t.k.vok; t.k.camWant = true;
  await t.camOn.call(null, t.k); // level-3 path through camOn: no preview flag, and no camera before video is agreed
  assert.ok(!t.k.cam, 'a plain On while it rings out is not a preview: nothing counts as on');
  const src = lift('async function camOnNat(', 'const callVideoToggle=');
  const u = camKit(); u.k.state = 'calling'; delete u.k.vok; u.k.camWant = true;
  const f = new Function('k0', 'S', 'nat', 'navigator', 'ls', 'toast', 'toastErr', 'sendMark', 'callUi', 'vSync', 'videoCaps', src + 'return camOnNat;')(u.k, u.S, (m, o) => { u.calls.push([m, o]); return Promise.resolve({ on: true, facing: 'front' }); }, {}, { get: () => true, set() {} }, () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
  await f(u.k, true);
  assert.deepEqual(u.calls.at(-1), ['setVideo', { on: true, facing: 'front', preview: true }], 'the preview asks the plugin for the camera without the line');
  assert.ok(u.k.cam && u.k.cam.pre === true && !u.k.hadVideo, 'a preview camera, not yet a video call');
  u.k.state = 'connecting'; u.k.vok = true; await f(u.k);
  assert.deepEqual(u.calls.at(-1), ['setVideo', { on: true, facing: 'front' }], 'after the answer a plain On puts it on the line');
  assert.ok(u.k.cam && !u.k.cam.pre && u.k.hadVideo, 'now this side sends video');
  const w = camKit(); w.k.state = 'calling'; delete w.k.vok; w.k.camWant = true; let off = 0;
  const g = new Function('k0', 'S', 'nat', 'navigator', 'ls', 'toast', 'toastErr', 'sendMark', 'callUi', 'vSync', 'videoCaps', src + 'return camOnNat;')(w.k, w.S, () => Promise.resolve({ on: true, facing: 'front' }), {}, { get: () => true, set() {} }, () => {}, () => {}, () => {}, () => {}, () => {}, () => {});
  await g(w.k, true); w.k.state = 'connecting';
  const ga = lift('async function gotAnswer(k,p){', '\nasync function callMedia(');
  assert.match(ga, /if\(\(k\.cam\|\|k\.camWant&&k\.vt&&k\.vt\.nat\)&&!k\.vok\)\{camOff\(k\);/, 'an answer without video ends the preview');
  const tg = new Function('camOff', 'camOn', 'callUi', 'nat', 'natPre', 'camOnNat', lift('const callVideoToggle=', '\n') + '\nreturn callVideoToggle;')(() => { off++; }, () => {}, () => {}, () => Promise.resolve({}), () => true, () => {});
  w.k.state = 'calling'; tg(w.k); assert.equal(off, 1);
  const camOffReal = new Function('S', 'sendMark', 'callUi', lift('function camOff(', '\nasync function camFlip(') + '\nreturn camOff;')({ call: w.k }, () => {}, () => {});
  w.k.cam = { pre: true, stop() {} }; w.k.vt = {}; camOffReal(w.k); // the tap, the bar's camera key, the plugin, a failed start: any way the preview goes off
  assert.equal(w.k.camWant, false, 'a preview turned off ends the wish: no camera after the answer');
  const vs = lift('function vSync(k){', '\n// In the app the plugin draws');
  assert.match(vs, /w=vWait\(k\),pre=w\|\|lv&&r!=='live'&&\(k\.state==='calling'\|\|k\.state==='connecting'\|\|!!k\.rcam&&Date\.now\(\)-\(k\.t0\|\|0\)<3000\),sw=pre\|\|!!k\.swap&&lv&&r==='live';/, 'this side\'s own picture fills the screen until the far side\'s arrives');
  assert.ok(css.includes('.call-video video.fill:not(.small),.call-video.pre .v-local{object-fit:cover}'));
});

test('round 4: a picture fills the screen when its shape is close to the screen\'s, else the whole picture shows', () => {
  const vFit = new Function('return ' + lift('const vFit=', '; //').slice('const vFit='.length))();
  const v = (w, h, cw, ch) => { const cl = new Set(); const e = { videoWidth: w, videoHeight: h, clientWidth: cw, clientHeight: ch, classList: { toggle: (c, on) => (on ? cl.add(c) : cl.delete(c)) } }; vFit(e); return cl.has('fill'); };
  assert.equal(v(1080, 1920, 390, 844), true, 'a phone\'s 9:16 on a phone: fill (about 9 % off each side)');
  assert.equal(v(640, 480, 390, 844), false, 'a 4:3 webcam: the whole picture');
  assert.equal(v(1920, 1080, 390, 844), false, 'a phone held sideways: the whole picture');
  assert.equal(v(0, 0, 390, 844), false, 'no frame yet: the whole picture');
  assert.match(lift('const vCell=', '\n'), /c\.type==='cellular'/, 'a browser on a mobile network sends 720p up to 2 Mbit/s');
});

test('design A over video: a key turns white only in the unusual state (Mute on, camera off), as in FaceTime', () => {
  assert.ok(css.includes('#callSheet.vcall :is(#callMute.on,#callVideo:not(.on)) svg{background:#fff;color:#0C1520}'));
  assert.ok(!css.includes('#callSheet.vcall .call-btn.on svg'), 'Speaker on and a running camera stay glass');
});

test('fifth round: a Video call shows the video look from the tap (no avatar screen first) until its camera shows or fails; a tap before the line exists only changes the wish', () => {
  const vWait = new Function('return ' + lift('const vWait=', '; //').slice('const vWait='.length))();
  assert.equal(vWait({ vwait: true, camWant: true, state: 'calling' }), true);
  assert.equal(vWait({ vwait: true, camWant: true, state: 'calling', cam: {} }), false, 'the camera shows: the preview takes over');
  assert.equal(vWait({ vwait: true, camWant: true, state: 'live' }), false);
  assert.equal(vWait({ state: 'calling' }), false, 'a voice call: the avatar screen as before');
  assert.match(lift('async function startCall(c,o={}){', '\nfunction ringIn('), /camWant:!!o\.cam,vwait:!!o\.cam&&\(natOk\(\)\?natPre\(\):videoCan\(\)\)\}\)/, 'only a Video call that will show this side\'s camera while it rings');
  const tg = new Function('camOff', 'camOn', 'callUi', 'nat', 'natPre', 'camOnNat', lift('const callVideoToggle=', '\n') + '\nreturn callVideoToggle;')(() => { throw new Error('camOff'); }, () => { throw new Error('camOn'); }, () => {}, () => { throw new Error('the plugin'); }, () => true, () => { throw new Error('camOnNat'); });
  const k = { state: 'calling', camWant: true, vwait: true }; tg(k); assert.deepEqual([k.camWant, k.vwait], [false, true], 'before the line exists a tap only changes the wish'); assert.equal(vWait(k), false, 'the choice withdrawn: the avatar screen'); tg(k); assert.deepEqual([k.camWant, k.vwait], [true, true]); assert.equal(vWait(k), true);
  assert.equal(vWait({ vwait: true, camWant: false, state: 'calling', vt: { nat: true } }), false, 'withdrawn after the line exists (the camera never starts, nothing clears vwait): no black screen');
  for (const f of ['async function camOn(', 'async function camOnNat(']) assert.match(lift(f, '\nfunction '), /finally\{k\.camBusy=false;k\.vwait=false;/, f + ' ends the wait, shown or failed');
  assert.ok(css.includes('#callSheet.vwait{background:#000}'));
  assert.match(ui, /const vl=k\.vt\|\|k\.vwait\?vEls\(k\):null;/);
});

test('the dialler still rings and draws the call screen in the tap (a comment once swallowed both)', () => {
  assert.match(lift('async function startCall(c,o={}){', '\nfunction ringIn('), /vwait:[^\n]*\}\);ring\(true,true\);callUi\(\); \/\//);
});
