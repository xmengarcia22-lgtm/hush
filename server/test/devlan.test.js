// `npm run dev:lan`: a second, HTTPS listener with a locally made certificate, so a phone on the same Wi-Fi gets a
// secure page (WebCrypto, camera and microphone need one). The certificate must verify for the addresses it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get } from 'node:https';
import { X509Certificate } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

import { makeCert, ensureDevCert } from '../scripts/devcert.mjs';
import { startServer } from './helpers.js';

const fetchTls = (url, ca) => new Promise((resolve, reject) => {
  get(url, { ca }, (res) => { const parts = []; res.on('data', (c) => parts.push(c)); res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body: Buffer.concat(parts) })); }).on('error', reject);
});

test('the local certificate names localhost, 127.0.0.1 and the given addresses, and can be trusted as a root', () => {
  const c = makeCert(['192.168.1.10']);
  const x = new X509Certificate(c.cert);
  assert.match(x.subjectAltName, /DNS:localhost/);
  assert.match(x.subjectAltName, /IP Address:127\.0\.0\.1/);
  assert.match(x.subjectAltName, /IP Address:192\.168\.1\.10/);
  assert.equal(x.ca, true, 'an iPhone can be told to trust it');
  assert.ok(x.verify(x.publicKey), 'self-signed');
  const days = (new Date(x.validTo) - new Date(x.validFrom)) / 86400_000;
  assert.ok(days <= 398, 'within what phones accept for a server certificate');
});

test('ensureDevCert keeps a certificate that still fits and makes one when there is none', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-cert-'));
  try {
    const a = ensureDevCert(dir), b = ensureDevCert(dir);
    assert.equal(a.made, true);
    assert.equal(b.made, false, 'reused while this PC\'s addresses are the same');
    assert.equal(a.cert, b.cert);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('with TLS on, the same app, health check, certificate download and WebSocket answer over HTTPS', async () => {
  const c = makeCert([]);
  const S = await startServer({ tls: { port: 0, host: '127.0.0.1', key: c.key, cert: c.cert, der: c.der } });
  try {
    const port = S.srv.tlsPort();
    const h = await fetchTls(`https://127.0.0.1:${port}/healthz`, c.cert);
    assert.equal(h.status, 200, 'the certificate verifies for 127.0.0.1');
    assert.equal(String(h.body), 'ok');
    const crt = await fetchTls(`https://127.0.0.1:${port}/hush-dev.crt`, c.cert);
    assert.equal(crt.type, 'application/x-x509-ca-cert');
    assert.ok(crt.body.equals(c.der));
    const lim = await fetchTls(`https://127.0.0.1:${port}/media/limits`, c.cert);
    assert.equal(JSON.parse(lim.body).limits.videoAutoBytes, 50e6);
    const ws = new WebSocket(`wss://127.0.0.1:${port}/ws`, { ca: c.cert });
    const reply = await new Promise((resolve, reject) => { ws.once('open', () => ws.send(JSON.stringify({ i: 1, op: 'hello', v: 1 }))); ws.once('message', (m) => resolve(JSON.parse(String(m)))); ws.once('error', reject); });
    assert.equal(reply.ok, true, 'wss works on the HTTPS listener');
    ws.close();
  } finally { await S.stop(); }
});
