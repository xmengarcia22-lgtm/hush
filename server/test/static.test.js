import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';

import { startServer } from './helpers.js';

function raw(url, path, method = 'GET') {
  const u = new URL(url);
  return new Promise((res, rej) => {
    const r = request({ host: u.hostname, port: u.port, path, method }, (resp) => {
      let body = '';
      resp.on('data', (d) => { body += d; });
      resp.on('end', () => res({ status: resp.statusCode, type: resp.headers['content-type'], body }));
    });
    r.on('error', rej);
    r.end();
  });
}

test('serves only the app page, its own files under app/ and vendor scripts, nothing else', async () => {
  const root = mkdtempSync(join(tmpdir(), 'hush-static-'));
  mkdirSync(join(root, 'vendor'));
  mkdirSync(join(root, 'app'));
  mkdirSync(join(root, 'server', 'data'), { recursive: true });
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>Hush</title>');
  writeFileSync(join(root, 'vendor', 'a.js'), 'console.log(1)');
  writeFileSync(join(root, 'vendor', 'notes.txt'), 'nope');
  writeFileSync(join(root, 'app', 'ui.js'), 'console.log(2)');
  writeFileSync(join(root, 'app', 'styles.css'), 'body{margin:0}');
  writeFileSync(join(root, 'app', 'notes.txt'), 'nope');
  writeFileSync(join(root, 'SPEC.md'), 'secret design');
  writeFileSync(join(root, 'server', 'data', 'hush.db'), 'binary');
  const T = await startServer({ staticDir: root });
  try {
    const home = await raw(T.httpUrl, '/');
    assert.equal(home.status, 200);
    assert.match(home.type, /text\/html/);
    assert.match(home.body, /Hush/);
    assert.equal((await raw(T.httpUrl, '/index.html')).status, 200);
    const js = await raw(T.httpUrl, '/vendor/a.js');
    assert.equal(js.status, 200);
    assert.match(js.type, /javascript/);
    assert.equal((await raw(T.httpUrl, '/vendor/a.js', 'HEAD')).status, 200);
    assert.match((await raw(T.httpUrl, '/app/ui.js')).type, /javascript/);
    const css = await raw(T.httpUrl, '/app/styles.css');
    assert.equal(css.status, 200);
    assert.match(css.type, /text\/css/);
    for (const p of ['/SPEC.md', '/server/data/hush.db', '/vendor/notes.txt', '/app/notes.txt', '/app/..%2Findex.html', '/vendor/..%2Findex.html', '/vendor/%2e%2e/SPEC.md', '/.git/config', '/index.html/']) {
      assert.equal((await raw(T.httpUrl, p)).status, 404, p);
    }
    assert.equal((await raw(T.httpUrl, '/healthz')).status, 200);
  } finally {
    await T.stop();
    rmSync(root, { recursive: true, force: true });
  }
});

test('without HUSH_STATIC nothing but the health check is served', async () => {
  const T = await startServer();
  try {
    assert.equal((await raw(T.httpUrl, '/')).status, 404);
    assert.equal((await raw(T.httpUrl, '/index.html')).status, 404);
  } finally { await T.stop(); }
});
