// Search is opt-in (SPEC.md 7.6): only `findable: true` lists a person, and entries from before that rule come off at startup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Store } from '../src/store.js';

const dirOf = (h, findable) => ({ handle: h, ecdh: { x: 'x1', y: 'y1' }, sig: { x: 'x2', y: 'y2' }, ...(findable === undefined ? {} : { findable }) });

test('reopening the store unlists everyone who did not turn search on', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-search-'));
  try {
    let store = new Store({ dataDir: dir }).open();
    for (const [h, f] of [['olduser', undefined], ['optedout', false], ['optedin', true]]) {
      store.set('directory/' + h, dirOf(h, f));
      store.set('search/' + h, { h, n: h, n2: h });
    }
    store.set('search/nodir', { h: 'nodir', n: 'nodir', n2: 'nodir' });
    store.close();
    store = new Store({ dataDir: dir }).open();
    assert.equal(store.get('search/olduser').d, null, 'an account from before the rule (no findable) is unlisted');
    assert.equal(store.get('search/optedout').d, null);
    assert.equal(store.get('search/nodir').d, null, 'an entry with no profile behind it goes too');
    assert.deepEqual(store.get('search/optedin').d, { h: 'optedin', n: 'optedin', n2: 'optedin' }, 'someone who opted in stays listed');
    assert.equal(store.get('directory/olduser').d.handle, 'olduser', 'profiles themselves are untouched');
    store.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the page treats a missing findable as not findable', () => {
  const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  assert.ok(!/findable\s*(!==|===)\s*false/.test(src), 'no check that only an explicit false hides someone');
  assert.match(src, /const want=d\.findable!==true\?null:/, 'syncSearch lists only an explicit opt-in');
  const lookup = src.slice(src.indexOf('async function lookupHandle('), src.indexOf('async function refreshPresence('));
  assert.ok(lookup.length > 0 && !/findable/.test(lookup), 'an exact username finds anyone: the opt-in covers name search only');
  assert.ok(!/invite link or number can reach you/.test(src), 'the search-off toast no longer claims only a link reaches you');
  assert.match(src, /const findable=\(S\.dir\[me\.handle\]\|\|\{\}\)\.findable===true;/, 'Settings shows search as off until it is turned on');
});

// Not search, but the same release's page-source guards (release 24 review).
test('removing a device also deletes recovery boxes that unchecked new words have not replaced yet', () => {
  const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  assert.match(src, /rec\.oldRecs=\[\.\.\.new Set\(\[\.\.\.\[\]\.concat\(\(recLocal\(h\)\|\|\{\}\)\.old\|\|\[\]\)/, 'the pending record\'s old list is part of what removal deletes');
  assert.match(src, /\(v\.loc===r\.loc&&r\.v===2&&v\.v!==2\)/, 'a vault copy an older page saved without v:2 gets it back');
});
