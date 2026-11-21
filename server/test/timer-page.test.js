// The page's answer to a message timer the other side moved without a note (SPEC.md 5.7): the timer as last seen per chat lives
// in the sealed store; a record that moved with no service note of the new value shows a local line in the chat; a message that
// outlives the chat's timer shows its real lifetime. None of it is a post.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const ui = readFileSync(new URL('app/ui.js', ROOT), 'utf8');
const lift = (from, to) => { const a = ui.indexOf(from), b = ui.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} … ${to} in app/ui.js`); return ui.slice(a, b); };
const TTL = lift('const TTLS=', '\nfunction openTtl(');   // TTLS, ttlLabel, lifeLabel, ttlSeenKey, noteTtl, ttlChip
const make = (store = {}, me = { handle: 'alice' }, ttlMine = null) => {
  const S = { me, ttlMine };
  const ls = { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } };
  const f = new Function('S', 'ls', TTL + '\nreturn {ttlLabel, lifeLabel, lifeMark, noteTtl, ttlChip, ttlSeenKey}');
  return Object.assign(f(S, ls), { store, S });
};

test('the seen-timer key is sealed and belongs to the account alone', () => {
  assert.doesNotMatch(lift('const PLAIN_KEYS=', '\n'), /ttlSeen/, 'sealed with the rest');
  const ownedBy = new Function(lift('const ownedBy=', '\n') + 'return ownedBy')();
  assert.equal(ownedBy('hush:ttlSeen:alice', 'alice'), true, 'logging alice out takes it');
  assert.equal(ownedBy('hush:ttlSeen:alice', 'al'), false);
  assert.equal(make().ttlSeenKey(), 'hush:ttlSeen:alice');
});

test('the first sighting records silently; a change without a note is flagged; my own change a moment ago is not', () => {
  const t = make(); const c = { id: 'd1', ttl: 3600 };
  t.noteTtl(c); assert.deepEqual(t.store['hush:ttlSeen:alice'], { d1: { v: 3600 } }, 'recorded, no flag');
  t.noteTtl(c); assert.deepEqual(t.store['hush:ttlSeen:alice'], { d1: { v: 3600 } }, 'unchanged');
  t.noteTtl({ id: 'd1', ttl: 31536000 }); assert.deepEqual(t.store['hush:ttlSeen:alice'].d1, { v: 31536000, un: 1 }, 'moved: flagged until a note of that value shows');
  t.noteTtl({ id: 'd1' }); assert.deepEqual(t.store['hush:ttlSeen:alice'].d1, { v: 0, un: 1 }, 'turned off: flagged too');
  const m = make({ 'hush:ttlSeen:alice': { d1: { v: 0 } } }, { handle: 'alice' }, { cid: 'd1', v: 300, at: Date.now() });
  m.noteTtl({ id: 'd1', ttl: 300 }); assert.deepEqual(m.store['hush:ttlSeen:alice'].d1, { v: 300 }, 'mine, just now: not flagged');
  const old = make({ 'hush:ttlSeen:alice': { d1: { v: 0 } } }, { handle: 'alice' }, { cid: 'd1', v: 300, at: Date.now() - 120e3 });
  old.noteTtl({ id: 'd1', ttl: 300 }); assert.deepEqual(old.store['hush:ttlSeen:alice'].d1, { v: 300, un: 1 }, 'a stale marker does not vouch');
  const other = make({ 'hush:ttlSeen:alice': { d1: { v: 0 } } }, { handle: 'alice' }, { cid: 'd2', v: 300, at: Date.now() });
  other.noteTtl({ id: 'd1', ttl: 300 }); assert.deepEqual(other.store['hush:ttlSeen:alice'].d1, { v: 300, un: 1 }, 'a marker for another chat does not vouch');
});

test('the line: none when the latest ttl note announces the value (and the flag clears); the wording for on and off', () => {
  const t = make({ 'hush:ttlSeen:alice': { d1: { v: 3600, un: 1 } } });
  assert.equal(t.ttlChip({ id: 'd1', ttl: 3600 }, [{ svc: 'ttl', v: 0, ts: 1 }, { svc: 'ttl', v: 3600, ts: 2 }, { from: 'bob', ts: 3 }]), null, 'announced');
  assert.deepEqual(t.store['hush:ttlSeen:alice'].d1, { v: 3600 }, 'the flag is gone');
  const u = make({ 'hush:ttlSeen:alice': { d1: { v: 3600, un: 1 }, d2: { v: 0, un: 1 }, d3: { v: 300 } } });
  assert.equal(u.ttlChip({ id: 'd1', ttl: 3600 }, [{ svc: 'ttl', v: 3600, ts: 1 }, { svc: 'ttl', v: 0, ts: 2 }, { from: 'bob', ts: 3 }]),
    'Message timer changed to 1 hour by the other side', 'an older note of the same value does not count: the latest says otherwise');
  assert.deepEqual(u.store['hush:ttlSeen:alice'].d1, { v: 3600, un: 1 }, 'still flagged: the line stays until a note of that value shows');
  assert.equal(u.ttlChip({ id: 'd2', ttl: 0 }, []), 'Message timer turned off by the other side');
  assert.equal(u.ttlChip({ id: 'd3', ttl: 300 }, []), null, 'no flag, no line');
  assert.equal(u.ttlChip({ id: 'd9', ttl: 300 }, []), null, 'never seen, no line');
});

test('the real lifetime shows beside the timer mark only when a message outlives the chat\'s timer by more than a minute', () => {
  const { lifeLabel } = make();
  assert.equal(lifeLabel(31536000e3), '1 year'); assert.equal(lifeLabel(2 * 86400e3), '2 days'); assert.equal(lifeLabel(3600e3), '1 hour');
  assert.equal(lifeLabel(90e3), '2 minutes'); assert.equal(lifeLabel(5e3), '5 seconds'); assert.equal(lifeLabel(14 * 86400e3), '2 weeks');
  const r = lift('wrap._refresh=()=>{', "\n    if(t==='channel')");
  assert.match(r, /const ttl=\(cc\.ttl\|\|0\)\*1000,lm=lifeMark\(p,ttl\);if\(p\.exp\|\|ttl\)\{meta\.insertAdjacentHTML\('beforeend',I\.timerSm\);if\(lm\)\{const s=el\('span','life',lm\);s\.title='This message lives longer than the chat\\u2019s timer';meta\.append\(s\)\}\}/, 'the mark whenever the message expires or the chat has a timer; the label only from lifeMark');
  assert.match(readFileSync(new URL('app/styles.css', ROOT), 'utf8'), /\n\.meta \.life\{color:var\(--danger\)\}\n/);
  const { lifeMark } = make(), ts = 1_700_000_000_000, H = 3600e3;
  assert.equal(lifeMark({ ts, exp: ts + 2 * H }, H), '2 hours', 'outlives the timer by more than a minute');
  assert.equal(lifeMark({ ts, exp: ts + H + 30e3 }, H), null, 'within the minute\'s allowance: just the mark');
  assert.equal(lifeMark({ ts, exp: ts + H }, H), null, 'exactly the timer: just the mark');
});

test('a message with no expiry in a timed chat is marked never: it escapes neither the mark nor the label', () => {
  const { lifeMark } = make(), ts = 1_700_000_000_000;
  assert.equal(lifeMark({ ts }, 3600e3), 'never');
  assert.equal(lifeMark({ ts, exp: 0 }, 300e3), 'never');
  assert.match(lift('wrap._refresh=()=>{', "\n    if(t==='channel')"), /if\(p\.exp\|\|ttl\)\{meta\.insertAdjacentHTML\('beforeend',I\.timerSm\)/, 'the timer mark is drawn for it, so the label has a place');
});

test('with the timer off no message is labelled: an earlier timed message keeps its plain mark', () => {
  const { lifeMark } = make(), ts = 1_700_000_000_000;
  assert.equal(lifeMark({ ts, exp: ts + 3600e3 }, 0), null);
  assert.equal(lifeMark({ ts, exp: ts + 365 * 86400e3 }, 0), null, 'however long: the chat has no timer to outlive');
  assert.equal(lifeMark({ ts }, 0), null, 'no expiry, no timer: nothing');
});

test('a timer note entering the view redraws the conversation, so an unannounced-timer chip goes the moment the note is in', () => {
  assert.match(lift('const reuse=R&&R.key===key', '\n'), /&&!posts\.slice\(R\.ids\.length\)\.some\(p=>p\.svc==='ttl'\);/, 'no reuse when a new post is a ttl note');
});

test('the local line is a chip in the conversation, never a post: nothing of it touches the message list, the latest-message fallbacks or read marks', () => {
  assert.match(lift("if(c.ttl)box.append(html('div','chip ttl-chip'", '\n    if(!posts.length){'), /if\(S\.loaded\)\{const tc=ttlChip\(c,posts\);if\(tc\)box\.append\(el\('div','chip svc',tc\)\)\}/, 'drawn after the timer chip, once the first snapshot is in');
  assert.doesNotMatch(TTL, /S\.posts|rawPosts|lastOf|markRead|writeSeen|unread|S\.db\./, 'reads the store and the posts it is handed, writes nothing else');
  assert.match(lift('const onConvs=(list,fromCache)=>{', 'const firstLoad='), /list\.forEach\(c=>\{S\.seenLast\.set\(c\.id,c\.last\?c\.last\.ts:0\);S\.previews\.delete\(c\.id\);noteTtl\(c\)\}\);/, 'every chat record that arrives is looked at, open or not');
  assert.match(lift('function openTtl(cid){', '\n}'), /S\.ttlMine=\{cid,v,at:Date\.now\(\)\};await ensureDmDoc\(c\)/, 'my own change marks itself before the record moves');
});
