// A self-signed certificate for trying the app from a phone on the same Wi-Fi (`npm run dev:lan`).
//
// Phones refuse WebCrypto, the camera and the microphone on plain http:// to another machine, so the local-network
// listener needs HTTPS. This writes an ECDSA P-256 certificate for localhost, 127.0.0.1 and this PC's local
// addresses, valid 397 days, with no dependencies and without touching the Windows certificate store. It is marked
// as a CA so an iPhone can be told to trust it (Settings > General > About > Certificate Trust Settings).
// The files live in server/devcert/ and are made again only when this PC's addresses change or it nears expiry.

import { generateKeyPairSync, createHash, randomBytes, sign, X509Certificate } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { join } from 'node:path';

// ---- just enough DER ----
const len = (n) => (n < 128 ? Buffer.from([n]) : n < 256 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 255]));
const tlv = (tag, ...parts) => { const b = Buffer.concat(parts); return Buffer.concat([Buffer.from([tag]), len(b.length), b]); };
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const int = (b) => tlv(0x02, b[0] & 0x80 ? Buffer.concat([Buffer.from([0]), b]) : b);
const utf8 = (s) => tlv(0x0c, Buffer.from(s, 'utf8'));
const octets = (b) => tlv(0x04, b);
const bits = (b, unused = 0) => tlv(0x03, Buffer.concat([Buffer.from([unused]), b]));
const TRUE = tlv(0x01, Buffer.from([0xff]));
function oid(s) {
  const a = s.split('.').map(Number), out = [a[0] * 40 + a[1]];
  for (const v of a.slice(2)) { const st = []; let x = v; do { st.unshift(x & 127); x = Math.floor(x / 128); } while (x); for (let i = 0; i < st.length - 1; i++) st[i] |= 128; out.push(...st); }
  return tlv(0x06, Buffer.from(out));
}
const utc = (d) => tlv(0x17, Buffer.from(d.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
const ext = (id, critical, value) => seq(oid(id), ...(critical ? [TRUE] : []), octets(value));
const ipBytes = (ip) => Buffer.from(ip.split('.').map(Number));

// This PC's IPv4 addresses other than loopback and link-local (VPN adapters included; they do no harm).
export function localAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) out.push({ name, address: a.address });
  }
  return out;
}

export function makeCert(ips, days = 397) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const spki = publicKey.export({ type: 'spki', format: 'der' });
  const name = seq(set(seq(oid('2.5.4.3'), utf8('Hush local testing'))), set(seq(oid('2.5.4.10'), utf8('Hush dev server'))));
  const alg = seq(oid('1.2.840.10045.4.3.2'));                                    // ecdsa-with-SHA256
  const now = new Date(Date.now() - 3600_000), until = new Date(now.getTime() + days * 86400_000);
  const serial = randomBytes(16); serial[0] = (serial[0] & 0x3f) | 0x40;   // positive, and no leading zero byte (DER)
  const san = seq(tlv(0x82, Buffer.from('localhost')), ...['127.0.0.1', ...ips].map((ip) => tlv(0x87, ipBytes(ip))));
  const extensions = tlv(0xa3, seq(
    ext('2.5.29.19', true, seq(TRUE)),                                               // basic constraints: CA (so iOS can trust it)
    ext('2.5.29.15', true, bits(Buffer.from([0x84]), 2)),                            // key usage: digitalSignature, keyCertSign
    ext('2.5.29.37', false, seq(oid('1.3.6.1.5.5.7.3.1'))),                          // extended key usage: TLS server
    ext('2.5.29.14', false, octets(createHash('sha1').update(spki).digest())),        // subject key identifier
    ext('2.5.29.17', false, san),                                                    // the names and addresses it is for
  ));
  const tbs = seq(tlv(0xa0, int(Buffer.from([2]))), int(serial), alg, name, seq(utc(now), utc(until)), name, spki, extensions);
  const der = seq(tbs, alg, bits(sign('sha256', tbs, privateKey)));
  const cert = '-----BEGIN CERTIFICATE-----\n' + der.toString('base64').match(/.{1,64}/g).join('\n') + '\n-----END CERTIFICATE-----\n';
  return { key: privateKey.export({ type: 'pkcs8', format: 'pem' }), cert, der };
}

// Returns { key, cert, der, ips, made } for `dir`, making a new certificate only when needed.
export function ensureDevCert(dir) {
  const ips = [...new Set(localAddresses().map((a) => a.address))].sort();
  const kf = join(dir, 'key.pem'), cf = join(dir, 'cert.pem');
  if (existsSync(kf) && existsSync(cf)) {
    try {
      const x = new X509Certificate(readFileSync(cf));
      const has = ips.every((ip) => (x.subjectAltName || '').includes('IP Address:' + ip));
      if (has && new Date(x.validTo).getTime() - Date.now() > 7 * 86400_000) return { key: readFileSync(kf, 'utf8'), cert: readFileSync(cf, 'utf8'), der: x.raw, ips, made: false };
    } catch { /* unreadable: make a new one */ }
  }
  mkdirSync(dir, { recursive: true });
  const c = makeCert(ips);
  writeFileSync(kf, c.key, { mode: 0o600 });
  writeFileSync(cf, c.cert);
  return { ...c, ips, made: true };
}
