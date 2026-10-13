// The link-request sweep (SPEC.md 8.6): requests last written over 10 minutes ago go, by the server's clock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Store } from '../src/store.js';
import { DEFAULT_LIMITS } from '../src/limits.js';

test('the sweep removes link requests older than 10 minutes, keeps fresh ones and nothing else', () => {
  assert.equal(DEFAULT_LIMITS.linkreqTtlMs, 10 * 60_000);
  const dir = mkdtempSync(join(tmpdir(), 'hush-lrsweep-'));
  let t = 1_000_000_000_000;
  const store = new Store({ dataDir: dir, now: () => t }).open();
  try {
    const old = 'linkreqs/' + 'A'.repeat(43), fresh = 'linkreqs/' + 'B'.repeat(43), dir1 = 'directory/alice';
    store.set(old, { state: 'wait', ts: t + 365 * 86400e3 });   // a client's own clock is not believed
    store.set(dir1, { handle: 'alice', ecdh: { x: 'x', y: 'y' }, sig: { x: 'x', y: 'y' } });
    t += 9 * 60_000;
    store.set(fresh, { state: 'wait', ts: 0 });
    assert.equal(store.sweepLinkreqs(), 0, 'nothing is 10 minutes old yet');
    t += 2 * 60_000;
    assert.equal(store.sweepLinkreqs(), 1);
    assert.equal(store.get(old).d, null);
    assert.ok(store.get(fresh).d, 'a 2-minute-old request stays');
    assert.ok(store.get(dir1).d, 'other collections are untouched, however old');
    t += 60 * 60_000;
    assert.equal(store.sweepLinkreqs(), 1);
    assert.ok(store.get(dir1).d);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
