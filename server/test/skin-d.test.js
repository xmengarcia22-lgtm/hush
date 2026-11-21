// Redesign step D (release 106): the Cut look. These tests hold the rules of the approved sheet (PLAN-B.md section 6) against
// app/styles.css, the two look lines of app/ui.js and the two theme-colour lines of index.html. They judge the look, not safety:
// whether a warning can be seen and tapped is checked in the real browser (the walk's visibility-and-tap check), and every
// changed line of the style sheet is read in the release's review. The call screen and the call bar keep their own rules
// byte for byte until step I (tests 9 and 10).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = p => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const css = read('app/styles.css'), ui = read('app/ui.js'), index = read('index.html');
const sha = s => createHash('sha256').update(s).digest('hex');

// The call screen's and the call bar's own rules: from a first line to the end of a last line, both found by their words.
const block = (a, b) => { const i = css.indexOf(a), j = i < 0 ? -1 : css.indexOf(b, i); if (i < 0 || j < 0) return null; const e = css.indexOf('\n', j); return css.slice(i, e < 0 ? css.length : e); };
const CALL1 = block('/* The call screen (callUi)', '@media (prefers-reduced-motion:reduce){#callSheet .call-ctl');
const CALL2 = block('/* The call bar is glass over the chat', '.call-min{position:absolute');
// The guard: the few rules that keep step D's changes of shared classes (the avatar, the sheet, the base type) out of the call
// screen. It is marked by its first and last comment, and tests 3 to 8 leave it out together with the two call blocks.
const GUARD = block('/* step D guard:', '/* end of the step D guard */');
let rest = css; for (const b of [CALL1, CALL2, GUARD]) if (b) rest = rest.replace(b, '');
rest = rest.replace(/\/\*[\s\S]*?\*\//g, '');
const parse = text => { const rules = [];
(function walk(s, ctx) { let d = 0, st = 0, sel = ''; for (let k = 0; k < s.length; k++) { const ch = s[k];
  if (ch === '{') { if (d === 0) { sel = s.slice(st, k).trim(); st = k + 1; } d++; }
  else if (ch === '}') { d--; if (d === 0) { const body = s.slice(st, k); if (/^@(media|supports)/.test(sel)) walk(body, sel); else if (!sel.startsWith('@')) rules.push({ sel, ctx, body }); st = k + 1; } } } })(text.replace(/\/\*[\s\S]*?\*\//g, ''), ''); return rules; };
const rules = parse(rest);
const decls = r => r.body.split(';').map(x => x.trim()).filter(Boolean);
const where = r => (r.ctx ? r.ctx + ' ' : '') + r.sel;

const LIGHT = { bg: '#F2F2F2', surface: '#FAFAFA', 'surface-2': '#E4E4E4', text: '#111111', muted: '#595959', line: '#858585', edge: '#D9D9D9', danger: '#AB1F2E',
  own: '#C8C8C8', in: '#FFFFFF', dim: 'rgba(0,0,0,.42)', focus: '#111111', ph: '#BDBDBD', gtile: '#595959', bar: '#BDBDBD' };
const DARK = { bg: '#000000', surface: '#121212', 'surface-2': '#1F1F1F', text: '#F2F2F2', muted: '#A3A3A3', line: '#666666', edge: '#262626', danger: '#EA5A64',
  own: '#333333', in: '#121212', dim: 'rgba(0,0,0,.6)', focus: '#F2F2F2', ph: '#262626', gtile: '#333333', bar: '#4D4D4D' };
const TILES = { av1: '#5E2129', av2: '#1E4A38', av3: '#263556', av4: '#4A3328', av5: '#1F4A55', av6: '#3F4532', 'av-ink': '#F2F2F2' };
const tokens = body => Object.fromEntries([...body.matchAll(/--([a-z0-9-]+):\s*([^;]+);?/g)].map(m => [m[1], m[2].trim()]));
const rootRule = rules.find(r => r.sel === ':root' && !r.ctx);
const darkRules = rules.filter(r => (r.sel === ':root:not([data-theme="light"])' && /prefers-color-scheme:dark/.test(r.ctx)) || (r.sel === ':root[data-theme="dark"]' && !r.ctx));

test('1 the light theme has the fifteen Cut colours and the six avatar tiles, value for value', () => {
  assert.ok(rootRule, 'a :root rule');
  const t = tokens(rootRule.body);
  for (const [k, v] of Object.entries({ ...LIGHT, ...TILES })) assert.equal(t[k], v, '--' + k);
  assert.match(rootRule.body, /color-scheme:light/);
});

test('2 the dark theme has the fifteen Cut colours, the same in both of its blocks (the system setting and the choice in Settings)', () => {
  assert.equal(darkRules.length, 2, 'two dark blocks');
  for (const r of darkRules) { const t = tokens(r.body); for (const [k, v] of Object.entries(DARK)) assert.equal(t[k], v, where(r) + ' --' + k); assert.match(r.body, /color-scheme:dark/); }
  assert.deepEqual(tokens(darkRules[0].body), tokens(darkRules[1].body));
});

test('3 the font is the system font of the sheet; no web font is named', () => {
  assert.equal(tokens(rootRule.body).font, '-apple-system,"SF Pro Text",system-ui,"Segoe UI",Roboto,sans-serif');
  assert.doesNotMatch(rest, /Figtree/); // the guard alone names it: the call parts keep the live page's font list to the letter until step I (test 15)
  const body = rules.find(r => r.sel === 'body' && /font:/.test(r.body));
  assert.match(body.body, /font:400 17px\/22px var\(--font\)/);
});

test('4 only the six sizes 34, 22, 17, 15, 13 and 11 px (24 px on the emoji keys alone); never under 11, no size in em', () => {
  const SIX = new Set(['34px', '22px', '17px', '15px', '13px', '11px']), EMOJI = /\.rp\b|\.eg\b|\.reqic\b/, bad = [];
  for (const r of rules) for (const d of decls(r)) {
    const m = d.match(/^font(-size)?:(.+)$/); if (!m) continue;
    const v = m[1] ? m[2].trim() : (m[2].match(/(\d*\.?\d+(px|em|rem|%))(\/|\s)/) || [])[1];
    if (!v || v === 'inherit') continue;
    if (SIX.has(v) || (v === '24px' && EMOJI.test(r.sel))) continue;
    bad.push(where(r) + ' { ' + d + ' }');
  }
  assert.deepEqual(bad, []);
});

test('5 no shadow, no gradient, no blur, no text shadow', () => {
  const bad = [];
  for (const r of rules) for (const d of decls(r)) {
    if (/^(box-shadow|text-shadow):(?!none$)/.test(d) || /gradient\(|blur\(|backdrop-filter/.test(d)) bad.push(where(r) + ' { ' + d + ' }');
  }
  assert.deepEqual(bad, []);
  assert.doesNotMatch(rootRule.body, /--shadow:(?!none)/);
});

test('6 the corner is a cut, not a curve: round are only the switch (its track 12 px, its knob), the presence, recording and typing dots, and the sheet grabber (3 px)', () => {
  const ROUND = /^\.toggle input(::before|:checked::before)?$|^\.on-dot$|^\.rdot$|^\.tb-dots i$/, bad = [];
  for (const r of rules) for (const d of decls(r)) {
    const m = d.match(/^border(-[a-z]+-[a-z]+)?-radius:(.+)$/); if (!m) continue;
    const v = m[2].trim(), sels = r.sel.split(',').map(s => s.trim());
    if (v === '0') continue;
    if (v === '50%' && sels.every(s => ROUND.test(s))) continue;
    if (v === '12px' && sels.every(s => s === '.toggle input')) continue;
    if (v === '3px' && sels.every(s => s === '.sheet::before')) continue;
    bad.push(where(r) + ' { ' + d + ' }');
  }
  assert.deepEqual(bad, []);
  assert.equal(tokens(rootRule.body).cut, '8px');
  assert.ok(rules.filter(r => /clip-path:polygon\(/.test(r.body)).length >= 12, 'cut corners are drawn with clip-path');
});

test('7 nothing ends in dots except one-line message previews (the chat row, the reply quote, the reply bar, the pinned line, the banner of a new message)', () => {
  const MAY = new Set(['#threads .thread .t-sub', '.q-text', '.cbar .t-sub', '.pinbar .t-sub', '.inbanner .t-sub']), bad = [];
  for (const r of rules) if (/text-overflow:ellipsis/.test(r.body)) for (const s of r.sel.split(',').map(x => x.trim())) if (!MAY.has(s)) bad.push(where({ ...r, sel: s }));
  assert.deepEqual(bad, []);
  // a rule that cuts with no dots (one line, hidden overflow) is the same fault: only the previews may have both
  const cutNoDots = rules.filter(r => /white-space:nowrap/.test(r.body) && /overflow:hidden/.test(r.body) && !/text-overflow:ellipsis/.test(r.body)).map(where);
  assert.deepEqual(cutNoDots, []);
});

test('8 no rule that hides, dims or switches off taps beyond those of the live page and the ones listed here with their reason', () => {
  // selector => what it does, as on the live page (release 105). A style sheet alone can hide a warning, so every new one is
  // written here on purpose and read in the review.
  const LIVE = `html.kb-up .tabs|display:none
@media(min-width:760px) .back|display:none!important
@media(max-width:759px) #app.in-chat .pane-list|display:none
@media(max-width:759px) #app:not(.in-chat) .pane-chat|display:none
.cipher|opacity:.8
.send:disabled|opacity:.4
.ptr|pointer-events:none
.field[hidden]|display:none
.primary:disabled|opacity:.5
.menu-item.flush:hover::before|display:none
.menu-item.flush:hover+.menu-item.flush::before|display:none
.menu-item.danger::before|display:none
.strip[hidden]|display:none
.vmark|pointer-events:none
.media video|pointer-events:none
.lb-count[hidden]|display:none
@media (pointer:coarse) .lb-nav|display:none
.btn-danger:disabled|opacity:.5
.reacts[hidden]|display:none
.link.sm:disabled|opacity:.4
.egrid[hidden]|display:none
.eg|opacity:.35
.bubble.out .q-text|opacity:.75
.cbar[hidden]|display:none
.tab-n[hidden]|display:none
#calls[hidden]|display:none
#threads[hidden]|display:none
@media (hover:hover) .thread:hover::before|display:none
@media (hover:hover) .thread:hover+.thread::before|display:none
.thread.active::before|display:none
.thread.active+.thread::before|display:none
.thread.swipe-ready::before|display:none
.thread.swipe-ready+.thread::before|display:none
.txt s|opacity:.85
.fmtbar[hidden]|display:none
.icon-btn[hidden]|display:none
.editor:empty::before|pointer-events:none
.fb-hint[hidden]|display:none
.pinbar[hidden]|display:none
.mentions[hidden]|display:none
.cmt-btn[hidden]|display:none
.sched-chip[hidden]|display:none
#profileView[hidden]|display:none
.searchrow[hidden]|display:none
.fab[hidden]|display:none
.to-bottom[hidden]|display:none
.typing-bubble[hidden]|display:none
.to-bottom .n[hidden]|display:none
.send[hidden]|display:none
.send.mic[hidden]|display:none
.recbar[hidden]|display:none
.vbars span|opacity:.35`.split('\n');
  const STEP_D = [ // new in step D, each with its reason
    ['.logo>svg|display:none', 'the old padlock drawing inside the logo box of the login screens and the lock: the box now shows the brand mark and the name, drawn by the style sheet'],
  ];
  const ok = new Set([...LIVE, ...STEP_D.map(x => x[0])]), found = [];
  const HIDE = /^(display:none|visibility:hidden|pointer-events:none|opacity:(0|0?\.\d+)|clip-path:inset\(|content-visibility:|font-size:0|(left|top|right|bottom|margin-left|text-indent):-\d{3,})/;
  for (const r of rules) for (const d of decls(r)) if (HIDE.test(d)) for (const s of r.sel.split(',').map(x => x.trim())) found.push((r.ctx ? r.ctx + ' ' : '') + s + '|' + d);
  assert.deepEqual(found.filter(x => !ok.has(x)), []);
});

test('9 the call screen keeps its own rules byte for byte until step I', () => {
  assert.ok(CALL1, 'the call screen block is found by its first and last line');
  assert.equal(CALL1.split('\n').length, 78);
  assert.equal(sha(CALL1), '7b8deab46aa0b262bfa7d3b9fd32f86d532b93c59dc869454fd0b91bbfa4cf95');
});

test('10 the call bar keeps its own rules byte for byte until step I', () => {
  assert.ok(CALL2, 'the call bar block is found by its first and last line');
  assert.equal(CALL2.split('\n').length, 24);
  assert.equal(sha(CALL2), 'd2c4776d98f03dc4d7fc09956f64ce01f49bcc7b78a3f9cd20228ad732ca2f6d');
});

test('11 the colour of the browser bar follows the page: #F2F2F2 light, #000000 dark', () => {
  assert.match(index, /<meta name="theme-color" content="#F2F2F2" media="\(prefers-color-scheme: light\)">/);
  assert.match(index, /<meta name="theme-color" content="#000000" media="\(prefers-color-scheme: dark\)">/);
});

// The two look lines of app/ui.js, run as written in the page.
const line = re => { const m = ui.match(re); assert.ok(m, 'found in app/ui.js: ' + re); return m[0]; };
const fakeEl = () => (tag, cls, text) => ({ tag, className: cls || '', textContent: text || '', style: {}, kids: [], append(...k) { this.kids.push(...k); } });

test('12 an avatar without a photo is one of the six tiles, always the same for the same username; the colour of the live page stays behind it for the call screen', () => {
  const src = [line(/^const hue=.*$/m), line(/^const AV_COLORS=.*$/m), line(/^const avColor=.*$/m), line(/^const safePhoto=.*$/m), line(/^function avatar\(key,name,cls='',photo\)\{[\s\S]*?\n {2}return a\}/m)].join('\n');
  const { avatar, hue, avColor } = new Function('el', src + '\nreturn {avatar,hue,avColor}')(fakeEl());
  const seen = new Set();
  for (const k of ['olga', 'adam', 'mia', 'bea', 'zed', 'sub', 'rita', 'dora', 'u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'gAbCdEfGhIjKl']) {
    const a = avatar(k, k), n = hue(k) % 6 + 1, [h, s, l] = avColor(k);
    assert.equal(a.style.background, `var(--av${n},hsl(${h} ${s}% ${l}%))`, k);
    assert.equal(avatar(k, 'Another name').style.background, a.style.background, 'the same tile for the same username');
    seen.add(n);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6], 'all six tiles are in use');
  assert.equal(avatar('', '').style.background, avatar('?', 'x').style.background, 'no username: the tile of "?"');
  const p = avatar('olga', 'Olga', 'sm', 'data:image/jpeg;base64,AAAA');
  assert.equal(p.style.background, undefined, 'a photo gets no tile'); assert.equal(p.kids.length, 1);
});

test('13 the date label says "Sealed end to end" in a private chat and in a group, and never in a channel', () => {
  const stmt = line(/const day=fmtDay\(p\.ts\);if\(day!==R\.lastDay\)\{[^\n]*?R\.last=null\}/);
  const run = t => { const box = { kids: [], append(...k) { this.kids.push(...k); } }, R = { lastDay: '', last: 1 };
    new Function('fmtDay', 'p', 'R', 'box', 'el', 't', stmt)(() => 'Today', { ts: 1 }, R, box, fakeEl(), t);
    assert.equal(box.kids.length, 1); assert.equal(R.lastDay, 'Today'); assert.equal(R.last, null); return box.kids[0]; };
  for (const t of ['dm', 'group']) { const n = run(t); assert.equal(n.textContent, 'Today · Sealed end to end', t); assert.equal(n.className, 'chip day'); }
  const ch = run('channel'); assert.equal(ch.textContent, 'Today', 'a channel, public or private: the day alone'); assert.equal(ch.className, 'chip day');
  assert.equal(ui.split('Sealed end to end').length - 1, 1, 'the sentence is in the page once');
  // the same day twice: one label
  const box = { kids: [], append(...k) { this.kids.push(...k); } }, R = { lastDay: 'Today', last: 1 };
  new Function('fmtDay', 'p', 'R', 'box', 'el', 't', stmt)(() => 'Today', { ts: 1 }, R, box, fakeEl(), 'dm');
  assert.equal(box.kids.length, 0); assert.equal(R.last, 1);
});

test('14 the sender name above a group message takes the text colour of the sheet: the page sets no colour of its own on it', () => {
  const fn = line(/^function msgNode\([\s\S]*?\n\}/m);
  assert.doesNotMatch(fn, /style\.color/);
  assert.doesNotMatch(css.replace(CALL1 || '', '').replace(CALL2 || '', ''), /--name-l/);
});

test('15 the step D guard holds only rules for the call screen, the call bar and the floating call picture, so nothing else can sit behind its exemption', () => {
  if (!GUARD) return; // no guard: nothing is exempt
  const g = parse(GUARD); assert.ok(g.length > 0);
  for (const r of g) for (const sel of r.sel.split(/,(?![^(]*\))/).map(x => x.trim())) {
    assert.match(sel, /^(html[.\w-]* |:root\[data-theme="dark"\] |:root:not\(\[data-theme="light"\]\) )?(\.backdrop:has\(#callSheet\)|#callSheet|#callBar|#callThumb)(?![\w-])/, where(r));
    assert.doesNotMatch(sel, /[~+]/, 'no sibling of a call part: ' + where(r)); }
  // what the call parts took from the old shared rules and the old root: the font list, the text sizing, the ring's two colours, the dim behind the sheet
  assert.match(GUARD, /\n#callSheet,#callBar,#callThumb\{font:15px\/1\.4 Figtree,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:auto;--focus:#17448A[;}]/);
  assert.equal((GUARD.match(/--focus:#6CB4F0/g) || []).length, 2, 'the dark ring in both dark blocks');
  assert.match(GUARD, /\n\.backdrop:has\(#callSheet\)\{[^}\n]*--scrim:color-mix\(in srgb,#12202D 30%,transparent\)\}/);
  assert.equal((GUARD.match(/--scrim:color-mix\(in srgb,#03080E 55%,transparent\)/g) || []).length, 2, 'the dark dim in both dark blocks');
  assert.doesNotMatch(GUARD, /\.backdrop:has\(#callSheet\)[^{]*\{[^}]*background/, 'the dim is set by its variable: a background here would beat the rule that clears it for the native video');
});

test('16 the four fixes of the first review: the press never beats a control\'s own rule; the warning box has an edge for its red; the user badge takes the size of the text it follows; a ring is drawn inside, where a cut corner cannot trim it', () => {
  const of = sel => rules.filter(r => r.sel.split(',').map(x => x.trim()).includes(sel)).map(r => r.body).join(';');
  assert.match(rest, /\{:where\(button,a\)\{transition:transform 160ms var\(--ease-out\)\}:where\(button,a\):active\{transform:scale\(\.97\)\}\}/, 'the press has no weight: any rule of a control wins');
  for (const r of rules) for (const sel of r.sel.split(',').map(x => x.trim())) if (/^(button|a)(:active)?$/.test(sel)) assert.doesNotMatch(r.body, /transform|transition/, where(r));
  assert.match(of('.warnbox'), /(^|;)border:1px solid var\(--line\)(;|$)/, 'the page sets the red edge colour inline (app/ui.js): it needs an edge to colour');
  for (const r of rules) if (/\.ubadge/.test(r.sel)) assert.doesNotMatch(r.body, /font-size/, where(r));
  const base = rules.find(r => r.sel === ':focus-visible' && !r.ctx); assert.ok(base, 'a base ring');
  assert.equal(base.body.replace(/\s+/g, ''), 'outline:2pxsolidvar(--focus);outline-offset:-2px');
  assert.match(of('.keychip'), /overflow-wrap:anywhere/); assert.match(of('.keychip>span'), /min-width:0/);
  for (const sel of ['.seg button[aria-pressed="true"]', '.toast-act', '.play']) assert.match(of(sel) + ';' + of(sel + ':focus-visible'), /outline-color:var\(--bg\)/, sel + ': a ring that shows on a fill of the text colour');
});

test('17 the two fixes of the owner\'s order of 2026-11-16: under 360 px the keys of a chat\'s header are 36 px wide and still 44 high, so the name has room beside five keys; the ring of a hidden spoiler takes the page colour', () => {
  const of = (sel, ctx = '') => rules.filter(r => r.ctx.replace(/\s/g, '') === ctx && r.sel.split(',').map(x => x.trim()).includes(sel)).map(r => r.body).join(';');
  const N = '@media(max-width:359px)';
  assert.equal(of('.bar:has(>.chat-head)>.icon-btn', N), 'width:36px', 'narrower only: the height stays the 44 px of .icon-btn, and no other bar is touched');
  assert.equal(of('.chat-head', N), 'gap:8px');
  // 320 px, a one-on-one chat: back, the head (avatar, gap, name), voice, video, search, options
  const px = (body, re) => { const m = body.match(re); assert.ok(m, re + ' in ' + body); return +m[1]; };
  const gap = px(of('.bar'), /(?:^|;)gap:(\d+)px/), pad = px(of('.bar'), /(?:^|;)padding:0 (\d+)px/), av = px(of('.avatar.sm'), /(?:^|;)width:(\d+)px/);
  assert.match(of('.icon-btn'), /(^|;)height:44px(;|$)/);
  assert.ok(320 - 2 * pad - 5 * gap - 5 * 36 - av - 8 >= 60, 'the name box at 320 px');
  assert.match(of('.spoiler:not(.shown)'), /(^|;)background:var\(--text\)(;|$)/, 'the fill that hid a ring of the text colour');
  assert.equal(of('.spoiler:not(.shown):focus-visible'), 'outline-color:var(--bg)');
});
