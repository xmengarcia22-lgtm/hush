// The browser's Back closes what is open in Hush instead of leaving the site (Android's Back button, Safari's swipe
// from the edge). The layer stack is pure and lifted out of app/ui.js, and run here against a simulated history.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const a = src.indexOf('/* ===== HUSH NAV HISTORY BEGIN ===== */'), b = src.indexOf('/* ===== HUSH NAV HISTORY END ===== */');
assert.ok(a > 0 && b > a, 'nav history markers present in app/ui.js');
const block = src.slice(a, b);
const makeNavHistory = new Function(block + '\nreturn makeNavHistory;')();

// A browser tab: a list of history entries, the current one, and popstate delivered when it moves back.
function browser(state = null) {
  const deferred = [], br = { entries: [{ state }], i: 0, backs: 0, left: false, pushes: 0 };
  const h = {
    get state() { return br.entries[br.i].state; },
    pushState(s) { br.entries.length = br.i + 1; br.entries.push({ state: s }); br.i++; br.pushes++; },
    back() { br.backs++; },
  };
  const step = () => { if (br.i === 0) { br.left = true; return; } br.i--; br.nav.pop(); };
  br.nav = makeNavHistory(h, (fn) => deferred.push(fn));
  br.settle = () => { while (deferred.length || br.backs) { while (deferred.length) deferred.shift()(); while (br.backs) { br.backs--; step(); } } };
  br.back = () => { step(); br.settle(); }; // the user presses Back (or swipes from the edge in Safari)
  br.extra = () => br.entries.length - 1 - (state && state.hushGuard ? 1 : 0); // history entries Hush has added
  return br;
}
function layer(br, kind, more = {}) { // something open in the app; close() is what Back does, shut() is the app closing it
  const l = { kind, isOpen: true, closedByBack: 0, alive: () => l.isOpen, close: () => { l.isOpen = false; l.closedByBack++; }, ...more };
  l.shut = () => { l.isOpen = false; br.nav.closed(l); br.settle(); };
  br.nav.open(l); br.settle();
  return l;
}

test('the stack is pure: it touches nothing but the history it is given', () => {
  assert.ok(!/window|document|location|\bhistory\b|S\./.test(block.replace(/\/\*[\s\S]*?\*\//g, '')));
});

test('with nothing open, Back leaves the site as usual and Hush adds no history', () => {
  const br = browser();
  br.back();
  assert.equal(br.left, true);
  assert.equal(br.pushes, 0);
});

test('Back out of an open chat closes the chat and stays on the site; the next Back leaves', () => {
  const br = browser(), chat = layer(br, 'chat');
  assert.equal(br.extra(), 1, 'one guard entry while the chat is open');
  br.back();
  assert.equal(chat.closedByBack, 1);
  assert.equal(br.left, false);
  assert.equal(br.nav.depth, 0);
  assert.equal(br.i, 0, 'the guard is used up');
  br.back();
  assert.equal(br.left, true);
});

test('a sheet over a chat: Back closes the sheet first, then the chat, with only ever one guard entry', () => {
  const br = browser(), chat = layer(br, 'chat'), sh = layer(br, 'sheet');
  assert.equal(br.extra(), 1);
  br.back();
  assert.equal(sh.closedByBack, 1);
  assert.equal(chat.isOpen, true, 'the chat is still open');
  assert.equal(br.i, 1, 'the guard is put back for the chat');
  br.back();
  assert.equal(chat.closedByBack, 1);
  assert.equal(br.i, 0);
  br.back();
  assert.equal(br.left, true);
});

test('when the app closes its last layer itself (X, swipe, Escape), the guard is taken off quietly', () => {
  const br = browser(), chat = layer(br, 'chat'), sh = layer(br, 'sheet');
  sh.shut();
  assert.equal(br.i, 1, 'the chat is still open, so the guard stays');
  chat.shut();
  assert.equal(br.i, 0, 'nothing open: back to the page’s own entry');
  assert.equal(chat.closedByBack, 0, 'the step back did not close anything a second time');
  assert.equal(br.left, false);
  br.back();
  assert.equal(br.left, true, 'so the next Back leaves at once, not after a dead press');
});

test('closing one thing and opening the next in the same moment does not step back at all', () => {
  const br = browser(), menu = layer(br, 'drawer');
  menu.isOpen = false; br.nav.closed(menu); // the side menu closes...
  const page = { kind: 'list', isOpen: true, closedByBack: 0, alive: () => page.isOpen, close: () => { page.isOpen = false; page.closedByBack++; } };
  br.nav.open(page); br.settle(); // ...and Settings opens before the step back runs
  assert.equal(br.i, 1);
  assert.equal(br.extra(), 1);
  br.back();
  assert.equal(page.closedByBack, 1);
  assert.equal(br.left, false);
});

test('a layer that went away some other way is skipped, so Back is never a dead press', () => {
  const br = browser(), chat = layer(br, 'chat'), sh = layer(br, 'sheet');
  sh.isOpen = false; // removed without telling the stack
  br.back();
  assert.equal(chat.closedByBack, 1, 'the press goes to the chat');
  assert.equal(sh.closedByBack, 0);
});

test('a sheet that must be answered is not closed by Back, and Back does not leave the site under it', () => {
  const br = browser(), locked = layer(br, 'sheet', { stay: true });
  br.back();
  assert.equal(locked.isOpen, true);
  assert.equal(locked.closedByBack, 0);
  assert.equal(br.left, false);
  assert.equal(br.i, 1, 'the guard is back');
  locked.shut();
  assert.equal(br.i, 0);
});

test('a Back that steps a settings page back to Settings keeps one guard for the page still open', () => {
  const br = browser();
  let depth = 2; // Privacy, inside Settings
  const page = () => { const l = { kind: 'list', alive: () => l.on, on: true, close: () => { l.on = false; depth--; if (depth > 0) br.nav.open(page()); } }; return l; };
  br.nav.open(page()); br.settle();
  br.back();
  assert.equal(depth, 1);
  assert.equal(br.i, 1);
  assert.equal(br.extra(), 1);
  br.back();
  assert.equal(depth, 0);
  assert.equal(br.i, 0);
});

test('a page reloaded on top of its guard entry reuses it instead of adding another', () => {
  const br = browser({ hushGuard: 1 });
  assert.equal(br.nav.guarded, true);
  layer(br, 'chat');
  assert.equal(br.pushes, 0);
});

test('history never grows: a long session of opening and closing leaves at most one extra entry', () => {
  const br = browser();
  for (let n = 0; n < 50; n++) {
    const chat = layer(br, 'chat'), sh = layer(br, 'sheet');
    assert.ok(br.extra() <= 1);
    if (n % 3 === 0) { br.back(); br.back(); } else if (n % 3 === 1) { sh.shut(); br.back(); } else { sh.shut(); chat.shut(); }
    assert.equal(br.nav.depth, 0);
    assert.equal(br.i, 0);
  }
  assert.equal(br.left, false);
});

test('the wiring: every layer is registered and unregistered, and the address is never changed', () => {
  assert.match(src, /const NAV=makeNavHistory\(\{get state\(\)\{return history\.state\},pushState:s=>history\.pushState\(s,''\),back:\(\)=>history\.back\(\)\}/);
  assert.equal((src.match(/\.pushState\(/g) || []).length, 2, 'history is only touched through the stack (its own call and the adapter)');
  assert.ok(!/replaceState|location\.(href|assign|replace)\s*[=(]/.test(src), 'nothing else rewrites the address or the history');
  assert.match(src, /addEventListener\('popstate',\(\)=>NAV\.pop\(\)\)/);
  assert.match(src, /if\(!navChat\)\{const l=\{kind:'chat',[^}]*close:closeConv\};navChat=NAV\.open\(l\)\}/, 'opening a chat');
  assert.match(src, /if\(navChat\)\{const l=navChat;navChat=null;NAV\.closed\(l\)\}/, 'closing it, however it closes');
  assert.match(src, /const layer=\{kind:'sheet',alive:\(\)=>bd\.isConnected,close:\(\)=>close\(\),stay:!!opt\.locked\}/);
  assert.match(src, /const close=\(\)=>\{bd\.remove\(\);document\.removeEventListener\('keydown',esc\);NAV\.closed\(layer\)\}/);
  assert.match(src, /const close=\(\)=>\{bd\.remove\(\);NAV\.closed\(layer\)\};bd\.onclick=/, 'the side menu');
  assert.match(src, /document\.removeEventListener\('keydown',key\);NAV\.closed\(layer\)\};NAV\.open\(layer\);/, 'the photo viewer');
  assert.match(src, /S\.showArchived\?'Archived':'Chats';navSyncList\(\)\}/, 'tabs, settings pages and the archive, through the list title');
  assert.match(src, /const want=!!S\.me&&\(S\.tab!=='chats'\|\|!!S\.showArchived\);/);
  assert.match(src, /function listBack\(\)\{[^}]*\n?[^}]*swipeBack\(\);else setTab\('chats',-1\)\}/, 'Back on the list: a page back, then to Chats');
});
