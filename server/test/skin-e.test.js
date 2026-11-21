// Redesign step E (release 106): the style sheet of the Calls tab. These tests hold the rules for the markup of the brief
// (#calls, .thread.crow, .crow-main, .crow-call, .calls-note, .tab-n.red) against app/styles.css. They judge the look; whether
// a key can be seen and tapped is checked in the real browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../../app/styles.css', import.meta.url), 'utf8');
const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
const parse = text => { const rules = [];
(function walk(s, ctx) { let d = 0, st = 0, sel = ''; for (let k = 0; k < s.length; k++) { const ch = s[k];
  if (ch === '{') { if (d === 0) { sel = s.slice(st, k).trim(); st = k + 1; } d++; }
  else if (ch === '}') { d--; if (d === 0) { const body = s.slice(st, k); if (/^@(media|supports)/.test(sel)) walk(body, sel); else if (!sel.startsWith('@')) rules.push({ sel, ctx, body }); st = k + 1; } } } })(text, ''); return rules; };
const rules = parse(bare);
const sels = r => r.sel.split(',').map(x => x.trim());
const of = (sel, ctx = '') => rules.filter(r => r.ctx.replace(/\s/g, '') === ctx && sels(r).includes(sel)).map(r => r.body).join(';');
const has = (body, d) => body.split(';').map(x => x.trim()).includes(d);
const N = '@media(max-width:359px)';

test('1 the tab is called #calls: no selector of the sheet names #contacts any more, and the hidden one still hides', () => {
  assert.doesNotMatch(bare, /#contacts/);
  assert.ok(has(of('#calls[hidden]'), 'display:none'));
  assert.ok(has(of('#calls'), 'overflow-y:auto') && has(of('#calls'), 'flex:1'), 'the list scrolls like #threads');
});

test('2 the hairline between rows comes between #calls rows as between #threads rows', () => {
  const a = of('#threads>.thread+.thread::before'), b = of('#calls>.thread+.thread::before');
  assert.ok(b, 'a rule for #calls');
  assert.equal(b, a);
  assert.match(b, /border-top:1px solid var\(--edge\)/);
  assert.ok(has(of('#calls>.thread'), 'position:relative'), 'the row holds the line');
});

test('3 the row is not a button: no pointer on it, no hover or press fill on the whole row; the tap area has its own press, ring and cursor', () => {
  assert.ok(has(of('#calls>.crow'), 'cursor:default'));
  assert.ok(has(of('#calls>.crow'), 'gap:0'), 'the two parts sit flush; each has its own padding');
  assert.ok(has(of('#calls>.crow'), 'align-items:center'), 'the keys sit in the middle of the row, not at its top as in the comment sheet\'s row');
  assert.ok(has(of('#calls>.crow'), 'border-bottom:0'), 'one dividing line per row: the comment sheet\'s own bottom line is undone');
  assert.ok(has(of('.thread.crow:active'), 'background:none'), 'a press on a call key does not fill the row');
  assert.ok(has(of('.thread.crow:hover', '@media(hover:hover)'), 'background:none'));
  assert.ok(has(of('.crow-main:hover', '@media(hover:hover)'), 'background:var(--panel)'));
  const m = of('.crow-main');
  for (const d of ['flex:1', 'min-width:0', 'align-self:stretch', 'display:flex', 'text-align:left']) assert.ok(has(m, d), d);
  assert.ok(has(of('.crow-main:active'), 'background:var(--surface-2)') && has(of('.crow-main:active'), 'transform:none'));
  assert.match(of('.crow-main:focus-visible'), /outline-offset:-3px/);
});

test('4 each call key is 44 px wide and 44 high at every width (the owner, 2026-11-16: no narrower key under 360 px)', () => {
  const k = of('.crow-call');
  assert.ok(has(k, 'width:44px') && has(k, 'min-height:44px'));
  assert.equal(rules.filter(r => r.ctx.replace(/\s/g, '') === N && sels(r).includes('.crow-call')).length, 0, 'no rule for .crow-call in the narrow media query');
  assert.ok(has(of('.icon-btn'), 'height:44px') && has(of('.icon-btn'), 'width:44px'));
});

test('5 a missed row: name and line in the danger red, the name 700 where the others are 400', () => {
  assert.ok(has(of('#calls .t-name'), 'font-weight:400'));
  const mn = of('#calls .crow.missed .t-name'), ms = of('#calls .crow.missed .t-sub');
  assert.ok(has(mn, 'color:var(--danger)') && has(ms, 'color:var(--danger)'));
  assert.ok(has(mn, 'font-weight:700'));
  assert.ok(has(of('#calls .crow.missed .t-name'), 'font-weight:700') && Number(of('#calls .t-name').match(/font-weight:(\d+)/)[1]) < 600);
});

test('6 the red tab badge: danger fill, page colour for the number (reads in both themes)', () => {
  const b = of('.tab-n.red');
  assert.ok(has(b, 'background:var(--danger)') && has(b, 'color:var(--bg)'));
});

test('7 the note after the list wraps, is quiet and centred; in the empty state it sits on a line of its own', () => {
  const n = of('.calls-note');
  for (const d of ['color:var(--muted)', 'text-align:center', 'overflow-wrap:anywhere', 'display:block', 'font-size:15px', 'line-height:20px']) assert.ok(has(n, d), d);
  assert.ok(has(of('.empty .calls-note'), 'padding:12px 0 0'));
});

test('8 nothing of the Calls tab is cut: no dots, no one-line hidden overflow, no nowrap on a name; under 360 px the time may drop below a long name', () => {
  const mine = rules.filter(r => sels(r).some(s => /#calls|\.crow|\.calls-note/.test(s)));
  assert.ok(mine.length >= 10);
  for (const r of mine) { assert.doesNotMatch(r.body, /text-overflow:ellipsis/, r.sel); assert.doesNotMatch(r.body, /white-space:nowrap/, r.sel); assert.doesNotMatch(r.body, /overflow:hidden/, r.sel); }
  assert.ok(has(of('#calls .t-name'), 'overflow-wrap:anywhere') || /overflow-wrap:anywhere/.test(of('.t-name')));
  assert.ok(has(of('#calls .t-row', N), 'flex-wrap:wrap'));
  assert.ok(has(of('#calls .t-time', N), 'margin-left:auto'));
  assert.ok(has(of('.crow-main'), 'gap:12px'));
  // 320 px with 44 px keys: the box of the name and the time beside it may not fall under the 96 px asked for
  assert.ok(320 - 4 - 2 * 44 - 16 - 48 - 12 >= 96);
});
