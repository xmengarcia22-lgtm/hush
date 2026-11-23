// The files the server ships and publishes (the ones the code hash covers) name no private file: a reader of the public
// repository cannot open one (release 112).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const server = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRIVATE = /HANDOFF\.md|PHASE3-PLAN|CHANNELS-HISTORY-PLAN|private-notes/;

test('no shipped server file points to a private file', () => {
  const files = ['README.md', 'package.json', ...['src', 'scripts'].flatMap((d) => readdirSync(join(server, d)).map((f) => join(d, f)))];
  assert.ok(files.length > 20, 'the shipped files are found');
  const hits = files.flatMap((f) => readFileSync(join(server, f), 'utf8').split('\n').map((line, i) => (PRIVATE.test(line) ? `${f}:${i + 1}` : null)).filter(Boolean));
  assert.deepEqual(hits, []);
});
