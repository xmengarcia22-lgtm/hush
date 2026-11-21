// media_ids.oh (SPEC.md 8.2, release 80): the hash of the uploader's media token, added to an existing media.db at open
// with an empty default, so media from before carries no owner and stays an admin's to delete.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import { Store } from '../src/store.js';

test('an older media.db gains the media token hash column with an empty default', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-store-old-'));
  const old = new DatabaseSync(join(dir, 'media.db'));
  old.exec("CREATE TABLE chunks(cid TEXT NOT NULL, mid TEXT NOT NULL, i INTEGER NOT NULL, iv TEXT NOT NULL, d BLOB NOT NULL, PRIMARY KEY (cid, mid, i)) WITHOUT ROWID; CREATE TABLE media_ids(cid TEXT NOT NULL, mid TEXT NOT NULL, bytes INTEGER NOT NULL DEFAULT 0, exp INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (cid, mid)) WITHOUT ROWID; INSERT INTO media_ids(cid, mid, bytes, exp) VALUES ('gOld000000001', 'mOld000000001', 5, 0)");
  old.close();
  const store = new Store({ dataDir: dir }).open();
  try {
    const col = store.media.prepare('PRAGMA table_info(media_ids)').all().find((r) => r.name === 'oh');
    assert.ok(col, 'the column was added'); assert.equal(col.dflt_value, "''");
    assert.equal(store.media.prepare('SELECT oh FROM media_ids WHERE mid = ?').get('mOld000000001').oh, '', 'media from before carries no hash');
    assert.equal(store.mediaIdBytes('gOld000000001', 'mOld000000001'), 5, 'and is still counted');
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});
