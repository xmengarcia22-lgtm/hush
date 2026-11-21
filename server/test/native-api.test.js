// The app build's level (release 85): a page update must not break calls in silence for someone on an older app build. The
// page reads `window.hushBuild.api` when the build says it, else the level its methods imply (`mark` came with the page-keeper
// build); a build too old for calls shows a notice that stays, refuses to place a call, and answers an offer with `end:old` so
// the caller hears why instead of waiting on "Calling…".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const ui = read('app/ui.js');
const lift = (from, to) => { const a = ui.indexOf(from), b = ui.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} … ${to} in app/ui.js`); return ui.slice(a, b); };

const API = lift('const NATIVE_API=', "\nconst UPDATE_URL=");
const run = ({ hushBuild, app = true, callAudio = true, methods = ['start', 'stop', 'mark'] } = {}) => {
  const window = { hushBuild, Capacitor: { isNativePlatform: () => app, isPluginAvailable: (n) => callAudio && n === 'CallAudio', PluginHeaders: [{ name: 'CallAudio', methods: methods.map((name) => ({ name })) }] } };
  const appOnly = () => !!(window.Capacitor && window.Capacitor.isNativePlatform());
  const natOk = () => appOnly() && window.Capacitor.isPluginAvailable('CallAudio');
  const natHas = (m) => { const p = window.Capacitor.PluginHeaders.find((x) => x.name === 'CallAudio'); return !p || p.methods.some((x) => x.name === m); };
  return new Function('window', 'appOnly', 'natOk', 'natHas', API + '\nreturn {NATIVE_API,natApi,natOld}')(window, appOnly, natOk, natHas);
};

test('the level the build says wins, when it is a whole number in range', () => {
  assert.equal(run({ hushBuild: { v: '1.0', n: 37, api: 2 } }).natApi(), 2);
  assert.equal(run({ hushBuild: { v: '1.0', n: 1, api: 0 }, methods: ['start', 'mark'] }).natApi(), 0, 'a declared 0 is honoured over the inferred 1');
  for (const api of [1.5, -1, 1e6, '2', null, undefined, NaN]) assert.equal(run({ hushBuild: { api } }).natApi(), 1, `ignored: ${String(api)}`);
  assert.equal(run({ hushBuild: 'x' }).natApi(), 1, 'a build value that is not an object is ignored');
});

test('without hushBuild the level is read from the methods: mark means the page-keeper build', () => {
  assert.equal(run().natApi(), 1);
  assert.equal(run({ methods: ['start', 'stop', 'pending'] }).natApi(), 0, 'no mark: a build from before the page-keeper');
  assert.equal(run({ callAudio: false }).natApi(), 0, 'an app without CallAudio at all');
  assert.equal(run({ app: false, callAudio: false }).natApi(), 0);
});

test('natOld: only the app can be too old, and calls need level 1', () => {
  const t = run({ methods: ['start'] });
  assert.equal(t.NATIVE_API.calls, 1);
  assert.equal(t.natOld('calls'), true);
  assert.equal(run().natOld('calls'), false, 'the page-keeper build is current enough');
  assert.equal(run({ app: false, callAudio: false }).natOld('calls'), false, 'a browser is never old');
});

test('the update link is the TestFlight one until the numeric id is filled in, then the App Store at launch', () => {
  const m = /\nconst UPDATE_URL='([^']+)';/.exec(ui);
  assert.ok(m, 'UPDATE_URL');
  assert.match(m[1], /^https:\/\/beta\.itunes\.apple\.com\/v1\/app\/(\d{9,10}|APPLE_ID)$/);
});

test('the notice: after the stale banner and the recovery-words bar (which protects the account itself), before the dismissable nudges, with no way to dismiss it', () => {
  const b = lift('function renderBanner(){', '\n/* ---------- channel crypto');
  const stale = b.indexOf('else if(S.stale)'), rec = b.indexOf('else if(S.me&&!hasRecovery(S.me.handle))'), old = b.indexOf("else if(natOld('calls'))"), nudge = b.indexOf('else if(S.me&&recOld(');
  assert.ok(stale > 0 && rec > stale && old > rec && nudge > old, 'order: stale, recovery words, old build, the dismissable nudges');
  const chunk = b.slice(old, nudge);
  assert.match(chunk, /setup-bar.*I\.phone/, 'the recovery bar\'s markup with the phone icon');
  assert.match(chunk, /'Update Hush to keep making calls'/);
  assert.match(chunk, /'This version of the app is too old for calls\. Tap to update\.'/);
  assert.match(chunk, /n\.onclick=\(\)=>\{window\.open\(UPDATE_URL,'_blank','noopener'\)\}/, 'opened as a new window, never by rewriting this page\'s address (the navigation stack owns it)');
  assert.doesNotMatch(chunk, /sm-x|Dismiss|ls\.set\(/, 'nothing closes it and nothing remembers a close');
});

test('placing a call is refused on an old build, before any call state exists', () => {
  assert.match(lift('async function startCall(c,o={}){', 'const tks=heldWake'), /if\(S\.call\|\|!callable\(c\)\)return;\n\s*if\(natOld\('calls'\)\)\{toastErr\('Update Hush to make calls\.'\);return\}\n\s*const k=S\.call=newCall\(/);
});

test('an offer to an old build is answered end:old, one answer a minute per caller like busy, the pushed ring stopped; the caller reads why', () => {
  const o = lift('function onSignal(c,p){', '\nconst callErr=');
  const old = o.indexOf("if(natOld('calls'))"), busy = o.indexOf("{reason:'busy'}");
  assert.ok(old > 0 && busy > old, 'the old-build answer comes before the busy rule');
  const chunk = o.slice(old, busy);
  assert.match(chunk, /busySent\.get\(p\.from\)\|\|0;if\(Date\.now\(\)-t>=60e3\)\{busySent\.set\(p\.from,Date\.now\(\)\);sendSignal\(c,'end',\{id:p\.callId,peer:p\.from\},\{reason:'old'\}\)/);
  assert.match(chunk, /if\(pushed\)\{nat\('stop',\{push:S\.pushCall\.id\}\)\.catch\(\(\)=>\{\}\);pushCallOff\(\)\}return\}/);
  assert.ok(o.includes("p.reason==='old'?displayName(k.peer)+'’s Hush needs an update to take calls.':p.reason==='busy'"), 'the caller\'s text, before the busy text');
  assert.match(lift('function callOutcome(k){', '\n// A received entry'), /\['busy','declined','failed'\]\.includes\(w\)\?w:w==='no answer'\?'missed':k\.was==='calling'&&!w\?'cancelled':'failed'/, 'an unknown reason such as old logs as failed');
});

test('Settings → Advanced names the build and the level calls need, in the app only', () => {
  const s = lift("  if(appOnly()){const b=window.hushBuild,api=natApi();", "\n  if(appOnly()){const lab=el('div','menu-label flush','Call diagnostics')");
  const out = []; const body = { append: (e) => out.push(e) };
  const go = (hushBuild, methods = ['start', 'mark']) => { out.length = 0; const w = { hushBuild };
    new Function('window', 'appOnly', 'natApi', 'NATIVE_API', 'el', 'body', s)(w, () => true, () => run({ hushBuild, methods }).natApi(), { calls: 1 }, (tag, cls, text) => ({ tag, cls, text }), body); return out.map((e) => e.text); };
  assert.deepEqual(go({ v: '1.0', n: 37, api: 2 }), ['App build: 1.0 (37), api 2; calls need api 1']);
  assert.deepEqual(go({ v: '1.0 beta', n: 4, api: 1 }), ['App build: 1.0 (4), api 1; calls need api 1'], 'only digits and dots of the version');
  assert.deepEqual(go(undefined), ['App build: older than release D, api 1; calls need api 1']);
  assert.deepEqual(go(undefined, ['start']), ['App build: older than release D, api 0; calls need api 1']);
});
