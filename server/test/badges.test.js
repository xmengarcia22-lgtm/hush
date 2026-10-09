// Badges (SPEC.md 12.3): decided by the operator in HUSH_BADGES, sent with the hello reply, never a profile field.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { loadConfig, parseBadges } from '../src/config.js';
import { startServer, connect, signup, makeIdentity, directoryDoc } from './helpers.js';

const FOUNDER_SVG = '<svg viewBox="0 0 32 28"><path d="M4.5 21L3 8l6.5 6L16 5l6.5 9L29 8l-1.5 13Z" fill="#EF9F27" stroke="#633806" stroke-width="1.3" stroke-linejoin="round"/><path d="M16 11.5l2 3-2 3-2-3Z" fill="#E24B4A" stroke="#633806" stroke-width="0.8"/><circle cx="3" cy="7" r="2" fill="#FAC775" stroke="#633806" stroke-width="1"/><circle cx="16" cy="3.8" r="2.2" fill="#FAC775" stroke="#633806" stroke-width="1"/><circle cx="29" cy="7" r="2" fill="#FAC775" stroke="#633806" stroke-width="1"/><rect x="4" y="21" width="24" height="4.5" rx="1" fill="#BA7517" stroke="#633806" stroke-width="1.3"/><circle cx="10" cy="23.25" r="1.2" fill="#1D9E75"/><circle cx="16" cy="23.25" r="1.5" fill="#378ADD"/><circle cx="22" cy="23.25" r="1.2" fill="#1D9E75"/></svg>';

test('HUSH_BADGES is parsed, usernames are normalized, and anything else is refused', () => {
  assert.deepEqual(parseBadges(undefined), {});
  assert.deepEqual(parseBadges('  '), {});
  assert.deepEqual(parseBadges('{"Olivia":"founder","@Ann_1":"verified"}'), { olivia: 'founder', ann_1: 'verified' });
  assert.deepEqual(loadConfig({ HUSH_BADGES: '{"Olivia":"founder"}' }).badges, { olivia: 'founder' });
  assert.deepEqual(loadConfig({}).badges, {});
  assert.throws(() => parseBadges('{"olivia":"king"}'), /unknown badge/);
  assert.throws(() => parseBadges('{"no spaces":"founder"}'), /not a username/);
  assert.throws(() => parseBadges('["olivia"]'), /JSON object/);
  assert.throws(() => parseBadges('{oops'), /not valid JSON/);
});

test('the hello reply carries the badge list, and an empty one when nobody has a badge', async () => {
  const T = await startServer({ badges: { olivia: 'founder' } });
  try {
    const c = await connect(T.url);
    assert.deepEqual((await c.hello()).badges, { olivia: 'founder' });
    await c.close();
  } finally { await T.stop(); }
  const U = await startServer();
  try {
    const c = await connect(U.url);
    assert.deepEqual((await c.hello()).badges, {});
    await c.close();
  } finally { await U.stop(); }
});

test('a profile cannot carry a badge: the server refuses the field on set and on update', async () => {
  const T = await startServer({ badges: { olivia: 'founder' } });
  try {
    const me = await makeIdentity('mallory');
    const c = await signup(T.url, me);
    const u = await c.call('update', { p: 'directory/mallory', d: { badge: 'founder' } });
    assert.equal(u.ok, false); assert.equal(u.e, 'invalid');
    const s = await c.call('set', { p: 'directory/mallory', d: { ...directoryDoc(me), badge: 'founder' } });
    assert.equal(s.ok, false); assert.equal(s.e, 'invalid');
    const g = await c.ok('get', { p: 'directory/mallory' });
    assert.equal('badge' in g.d, false);
    await c.close();
  } finally { await T.stop(); }
});

// ---- the page's badge block, lifted out of app/ui.js --------------------------------------------------------------
const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const a = src.indexOf('/* ===== HUSH BADGES BEGIN ===== */'), b = src.indexOf('/* ===== HUSH BADGES END ===== */');
assert.ok(a > 0 && b > a, 'badge markers present in app/ui.js');
const fakeHtml = (tag, cls, h) => ({ tag, className: cls, innerHTML: h, attrs: {}, title: '', children: [], setAttribute(k, v) { this.attrs[k] = v; }, append(x) { this.children.push(x); } });
const page = new Function('html', src.slice(a, b) + '\nreturn { badgeOf, badgeNode, withBadge, BADGE_SVG };')(fakeHtml);

test('the page draws a badge for a listed handle only, from the operator\'s list alone', () => {
  const badges = { olivia: 'founder', ann: 'verified' };
  assert.equal(page.badgeOf('olivia', badges), 'founder');
  assert.equal(page.badgeOf('Olivia', badges), 'founder', 'capitalization does not matter');
  assert.equal(page.badgeOf('ann', badges), 'verified');
  assert.equal(page.badgeOf('bob', badges), null);
  assert.equal(page.badgeOf('bob', { bob: 'king' }), null, 'an unknown badge name draws nothing');
  assert.equal(page.badgeOf('constructor', {}), null, 'object prototype names are not badges');
  assert.equal(page.badgeOf('', badges), null);
  assert.equal(page.BADGE_SVG.founder, FOUNDER_SVG, 'the founder badge is the agreed drawing, byte for byte');
  const n = page.badgeNode('olivia', badges);
  assert.equal(n.className, 'ubadge ubadge-founder');
  assert.equal(n.innerHTML, FOUNDER_SVG);
  assert.equal(n.attrs.role, 'img');
  assert.equal(n.attrs['aria-label'], 'Founder');
  assert.equal(page.badgeNode('bob', badges), null, 'no badge, no node');
  const host = fakeHtml('div', 't-name', '');
  assert.equal(page.withBadge(host, 'ann', badges), host);
  assert.equal(host.children.length, 1);
  assert.equal(host.children[0].className, 'ubadge ubadge-verified');
  page.withBadge(host, 'bob', badges);
  assert.equal(host.children.length, 1, 'nothing is appended for someone without a badge');
});

// Wherever the page draws a person's name as a label, the badge goes with it. A bare label would be a regression,
// so this reads the page's code: every name label is wrapped in withBadge, and every chat title goes through
// titleNode, which adds the badge when the chat is a person.
test('no name label in the page is drawn without the badge', () => {
  const bare = [
    /(?<!withBadge\()el\('(?:div|span)','t-name',displayName\(/g,          // a row's name
    /(?<!withBadge\()el\('span',null,displayName\(/g,                      // an account row
    /(?<!withBadge\()el\('div','info-name',displayName\(/g,                // a profile sheet
    /(?<!withBadge\()el\('span','q-from',displayName\(/g,                  // a quoted reply
    /(?<!withBadge\()el\('div','c-name'/g,                                 // a comment author
    /(?<!withBadge\()el\('div','t-name',(?:label|t\.title|c\.name)\)/g,    // the privacy, forward and contacts rows
    /el\('(?:div|span)','t-name',convTitle\(/g,                            // a chat title: titleNode, never bare
  ];
  for (const re of bare) {
    const hits = [...src.matchAll(re)].map((m) => src.slice(Math.max(0, m.index - 60), m.index + 60).replace(/\s+/g, ' '));
    assert.deepEqual(hits, [], 'a name is drawn without its badge near: ' + hits.join(' || '));
  }
  assert.ok((src.match(/titleNode\('(?:div|span)','t-name',/g) || []).length >= 4, 'chat titles go through titleNode: the search hits, the new-message alert, the chat header, the request list');
  assert.ok((src.match(/withBadge\(/g) || []).length >= 19, 'the badge is drawn in every place a name is: nineteen sites at the time of writing, and never fewer');
});
