// Swipe navigation: one controller for the whole page. Its rules (which way a swipe goes, when it counts, what it
// does where) are pure and lifted out of app/ui.js; the wiring around them is checked against the page source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../app/styles.css', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const a = src.indexOf('/* ===== HUSH SWIPE NAV BEGIN ===== */'), b = src.indexOf('/* ===== HUSH SWIPE NAV END ===== */');
assert.ok(a > 0 && b > a, 'swipe nav markers present in app/ui.js');
const block = src.slice(a, b);
const { SWIPE, swipeAxis, swipeVelocity, swipeCommits, tabStep, swipePlan } =
  new Function(block + '\nreturn { SWIPE, swipeAxis, swipeVelocity, swipeCommits, tabStep, swipePlan };')();
const TABS = ['chats', 'contacts', 'profile'];

test('the rules are pure: no page, server or storage is touched to decide a swipe', () => {
  assert.ok(!/document|window|\$\(|S\.|localStorage|fetch\(/.test(block));
});

test('direction: nothing is decided until the finger has moved, and a mostly sideways move is sideways', () => {
  assert.equal(swipeAxis(0, 0), null);
  assert.equal(swipeAxis(6, -5), null, 'inside the slop');
  assert.equal(swipeAxis(30, 4), 'x');
  assert.equal(swipeAxis(-30, 10), 'x', 'to the left too');
  assert.equal(swipeAxis(20, 30), 'y', 'scrolling the list stays scrolling');
  assert.equal(swipeAxis(20, 20), 'y', 'a diagonal is not a swipe');
});

test('speed is read from the last moments of the move, not the whole of it', () => {
  assert.equal(swipeVelocity([]), 0);
  assert.equal(swipeVelocity([[0, 10]]), 0);
  const slowThenFast = [[0, 0], [400, 20], [450, 30], [480, 60], [500, 100]];
  assert.ok(swipeVelocity(slowThenFast) > 0.7, 'a fling at the end counts as a fling');
  assert.ok(swipeVelocity([[0, 100], [50, 90], [100, 70]]) < 0, 'moving back the other way is negative');
});

test('a swipe counts past about a third of the screen, or as a fling; a fling back cancels it', () => {
  assert.equal(swipeCommits(100, 390, 0), false, 'short and slow: springs back');
  assert.equal(swipeCommits(140, 390, 0), true, 'past the line');
  assert.equal(swipeCommits(40, 390, 0.9), true, 'short but flung');
  assert.equal(swipeCommits(SWIPE.flickMin - 1, 390, 2), false, 'a twitch is not a fling');
  assert.equal(swipeCommits(300, 390, -0.6), false, 'flung back the way it came');
});

test('tabs: a swipe left brings the next tab, a swipe right the one before, and the ends stop', () => {
  assert.equal(tabStep(TABS, 'chats', -1), 'contacts');
  assert.equal(tabStep(TABS, 'contacts', -1), 'profile');
  assert.equal(tabStep(TABS, 'profile', 1), 'contacts');
  assert.equal(tabStep(TABS, 'contacts', 1), 'chats');
  assert.equal(tabStep(TABS, 'chats', 1), null);
  assert.equal(tabStep(TABS, 'profile', -1), null);
  assert.equal(tabStep(TABS, 'nowhere', -1), null);
});

const base = { dir: 1, edge: false, layer: null, blocked: false, chat: false, onList: true, sub: false, tab: 'chats', tabs: TABS };
const plan = (o) => swipePlan({ ...base, ...o });

test('back from an open chat: a swipe right, from the edge or from anywhere not busy with its own drag', () => {
  assert.deepEqual(plan({ chat: true, onList: false, edge: true }), { kind: 'chat' });
  assert.deepEqual(plan({ chat: true, onList: false }), { kind: 'chat' }, 'Telegram-style, from the middle of the chat too');
  assert.deepEqual(plan({ chat: true, onList: false, blocked: true, edge: true }), { kind: 'chat' }, 'the edge always works');
  assert.equal(plan({ chat: true, onList: false, blocked: true }), null, 'a scrolling strip or a voice scrubber keeps its drag');
  assert.equal(plan({ chat: true, onList: false, dir: -1 }), null, 'a swipe left in a chat is swipe-to-reply, never back');
  assert.equal(plan({ chat: true, onList: false, dir: -1, edge: true }), null);
});

test('the photo viewer, the lock screen and sign-up own every swipe', () => {
  for (const layer of ['viewer', 'cover']) for (const dir of [1, -1]) for (const edge of [true, false]) {
    assert.equal(plan({ layer, dir, edge }), null, `${layer} ${dir} ${edge}`);
    assert.equal(plan({ layer, dir, edge, chat: true, onList: false }), null);
  }
});

test('sheets close with a swipe right from the edge; one that cannot be dismissed stays', () => {
  assert.deepEqual(plan({ layer: 'sheet', edge: true }), { kind: 'sheet' });
  assert.equal(plan({ layer: 'sheet' }), null, 'not from the middle: sheets hold sliders, fields and lists');
  assert.equal(plan({ layer: 'sheet', edge: true, dir: -1 }), null);
  assert.deepEqual(plan({ layer: 'sheet', edge: true, chat: true }), { kind: 'sheet' }, 'a sheet over a chat closes first, not the chat');
  assert.equal(plan({ layer: 'locked', edge: true }), null);
});

test('the side menu closes with a swipe left', () => {
  assert.deepEqual(plan({ layer: 'drawer', dir: -1 }), { kind: 'drawer' });
  assert.deepEqual(plan({ layer: 'drawer', dir: -1, blocked: true }), { kind: 'drawer' });
  assert.equal(plan({ layer: 'drawer', dir: 1 }), null);
});

test('on the list: swipes move between tabs, and a sub-page (settings page, archive) goes back first', () => {
  assert.deepEqual(plan({ dir: -1 }), { kind: 'tab', to: 'contacts' });
  assert.deepEqual(plan({ dir: -1, tab: 'contacts' }), { kind: 'tab', to: 'profile' });
  assert.deepEqual(plan({ dir: 1, tab: 'profile' }), { kind: 'tab', to: 'contacts' });
  assert.deepEqual(plan({ dir: 1, tab: 'chats' }), { kind: 'end' }, 'nothing to the left of Chats: a small give, then back');
  assert.deepEqual(plan({ dir: -1, tab: 'profile' }), { kind: 'end' });
  assert.deepEqual(plan({ dir: 1, tab: 'profile', sub: true }), { kind: 'sub' }, 'Privacy back to Settings');
  assert.deepEqual(plan({ dir: 1, tab: 'chats', sub: true }), { kind: 'sub' }, 'Archived back to Chats');
  assert.deepEqual(plan({ dir: -1, tab: 'chats', sub: true }), { kind: 'tab', to: 'contacts' });
  assert.equal(plan({ dir: -1, blocked: true }), null, 'the search box and the like keep their drag');
  assert.equal(plan({ onList: false }), null);
});

test('the side menu comes out with a swipe right on the Chats list, from the left part, not only the very edge', () => {
  assert.deepEqual(plan({ nearLeft: true }), { kind: 'menu' }, 'a little in from the edge, where iPhone Safari does not take it');
  assert.deepEqual(plan({ nearLeft: true, edge: true }), { kind: 'menu' }, 'and from the edge itself where the browser allows');
  assert.deepEqual(plan({ nearLeft: false }), { kind: 'end' }, 'from the right side of the list: just the small give');
  assert.deepEqual(plan({ nearLeft: true, dir: -1 }), { kind: 'tab', to: 'contacts' }, 'to the left is still the next tab');
  assert.equal(plan({ nearLeft: true, blocked: true }), null, 'not from the search box');
  assert.ok(390 * SWIPE.menuZone > SWIPE.edge * 4, 'on a phone the zone reaches well past the strip Safari keeps');
});

test('wherever a swipe right goes back, back wins over the side menu', () => {
  const near = { nearLeft: true, edge: true };
  assert.deepEqual(plan({ ...near, chat: true, onList: false }), { kind: 'chat' }, 'an open chat');
  assert.deepEqual(plan({ ...near, sub: true }), { kind: 'sub' }, 'the archive');
  assert.deepEqual(plan({ ...near, tab: 'profile', sub: true }), { kind: 'sub' }, 'a settings page');
  assert.deepEqual(plan({ ...near, tab: 'contacts' }), { kind: 'tab', to: 'chats' }, 'Contacts steps back to Chats');
  assert.deepEqual(plan({ ...near, tab: 'profile' }), { kind: 'tab', to: 'contacts' });
  assert.deepEqual(plan({ ...near, layer: 'sheet' }), { kind: 'sheet' }, 'a sheet');
  assert.equal(plan({ ...near, layer: 'drawer' }), null, 'the menu is already out');
  for (const layer of ['viewer', 'cover', 'locked']) assert.equal(plan({ ...near, layer }), null, layer);
});

test('the bottom bar shows the same three tabs, in the same order, as the swipe steps through', () => {
  const nav = html.slice(html.indexOf('<nav class="tabs"'), html.indexOf('</nav>'));
  const order = [...nav.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, TABS);
  for (const btn of nav.match(/<button[^>]*>/g)) assert.ok(!/hidden|display:none/.test(btn), 'no tab is hidden: ' + btn);
  assert.match(src, /const TABS=\['chats','contacts','profile'\]/);
  assert.match(src, /b\.setAttribute\('aria-selected',String\(b\.dataset\.tab===t\)\)/, 'the tab shown is the tab lit');
});

test('one controller: the old half-working handlers are gone and the new one starts at boot', () => {
  assert.ok(!/setupTabSwipe/.test(src));
  assert.ok(!/addSwipe\(\$\('#chatPane'\)/.test(src), 'no second back swipe on the chat pane');
  assert.match(src, /setupSwipeNav\(\);/);
  assert.equal((src.match(/addSwipe\(/g) || []).length, 2, 'addSwipe is defined once and used once, for swipe-to-reply');
  assert.match(src, /addSwipe\(wrap,\{dir:-1,/, 'swipe-to-reply goes left, the opposite way to back');
});

test('the wiring: dismissable sheets and the menu expose their close, the viewer and covers are seen, a swipe is not a tap', () => {
  assert.match(src, /document\.addEventListener\('keydown',esc\);bd\._close=close\}/, 'only a dismissable sheet gets _close');
  assert.match(src, /bd\.onclick=e=>\{if\(e\.target===bd\)close\(\)\};bd\._close=close;/, 'the side menu');
  assert.match(src, /querySelector\('\.lock,\.onboard'\)\)return \{kind:'cover'\}/);
  assert.match(src, /querySelector\('\.lightbox'\)\)return \{kind:'viewer'\}/);
  assert.match(src, /\{passive:false,capture:true\}/, 'touchmove can stop the page scrolling under a swipe');
  assert.match(src, /e\.stopPropagation\(\);e\.preventDefault\(\)\}\},true\); \/\/ a swipe is not a tap/);
  const own = src.match(/const SWIPE_OWN='([^']+)'/)[1].split(',');
  for (const s of ['input', 'textarea', '[contenteditable="true"]', '.vbars', '.recbar', '.seg', 'video']) assert.ok(own.includes(s), s);
});

test('the wiring for the menu swipe: where it may start, and it follows the finger out or goes away again', () => {
  assert.match(src, /nearLeft:k\.x0-lr\.left<=lr\.width\*SWIPE\.menuZone\}/, 'measured from the left of the list pane');
  assert.match(src, /else if\(plan\.kind==='menu'\)\{[^}]*openDrawer\(\);const D=swipeLayer\(\);if\(!D\|\|D\.kind!=='drawer'\)return null;/);
  assert.match(src, /plan\.node\.style\.animation='none';plan\.node\.style\.transform='translateX\(-100%\)'/, 'starts shut, without its own slide-in');
  assert.match(src, /if\(p\.kind==='menu'\)\{p\.node\.style\.transform=`translateX\(\$\{Math\.min\(0,d-p\.width\)\}px\)`/);
  assert.match(src, /if\(p\.kind==='menu'\)\{if\(go\)\{[^}]*\}else p\.bd\._close\(\);tidy\(p\);return\}/, 'let go early and it closes, through the same close as a tap');
  assert.match(src, /\$\('#menuBtn'\)\.onclick=openDrawer;/, 'the menu button still opens it');
});

test('the back step a swipe takes matches the Back buttons', () => {
  const back = src.slice(src.indexOf('function swipeBack('), src.indexOf('function setupSwipeNav('));
  assert.match(back, /S\.profilePage=S\.profilePage==='settings'\?'main':'settings'/, 'like the settings Back button');
  assert.match(src, /back\.onclick=\(\)=>\{S\.profilePage=sub\?'settings':'main';setTab\('profile'\)\}/);
  assert.match(back, /S\.showArchived=false;setListTitle\(\);renderList\(\)/, 'like tapping Chats in the archive');
  assert.match(src, /if\(p\.kind==='chat'\)\{[^}]*closeConv\(\)/, 'out of a chat, as the chat Back button does');
});

test('styles: the list waits under a chat during a back swipe on a phone, and its slide-in does not replay', () => {
  const m = css.slice(css.indexOf('/* swipe navigation'));
  assert.match(m, /@media \(max-width:759px\)\{\s*#app\.sw-back \.pane-list\{display:flex;position:absolute;inset:0;z-index:0\}/);
  assert.match(m, /#app\.sw-back \.pane-chat\{position:absolute;inset:0;z-index:1;background:var\(--bg\)/);
  assert.match(m, /#app\.sw-quiet \.pane-list,#app\.sw-quiet \.pane-chat\{animation:none!important\}/);
  assert.match(m, /\.pane-list\.sw-clip\{overflow:hidden\}/);
});
