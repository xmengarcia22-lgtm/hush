// `npm run dev`: the local setup for trying the app against this server.
//   - standard policy (proven usernames, room keys for chats)
//   - serves index.html and vendor/ from the project folder on the same port
// `npm run dev:lan` (or `--lan`) also listens with HTTPS on port 8443 on every network this PC is on, with a
// self-signed certificate made in server/devcert/, so a phone on the same Wi-Fi can use the app (phones allow
// WebCrypto, the camera and the microphone only on HTTPS). http://127.0.0.1:8080 keeps working as before.
// Everything can still be overridden through the environment.

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
process.env.HUSH_AUTHZ ||= 'standard';
process.env.HUSH_STATIC ||= resolve(here, '..', '..');
// The server always admits a page served from its own host. Local testing also opens the page as "localhost"
// against a server reached as 127.0.0.1 (and the other way round), so both names are listed. Forwarded addresses
// stay untrusted (the default): nothing sits in front of Node here.
const port = process.env.HUSH_PORT || '8080';
process.env.HUSH_ORIGINS ||= `http://127.0.0.1:${port},http://localhost:${port}`;

if (process.argv.includes('--lan')) {
  const { ensureDevCert } = await import('./devcert.mjs');
  process.env.HUSH_TLS_PORT ||= '8443';
  process.env.HUSH_TLS_DIR ||= resolve(here, '..', 'devcert');
  const c = ensureDevCert(process.env.HUSH_TLS_DIR);
  process.env.HUSH_ORIGINS += ',' + ['localhost', '127.0.0.1', ...c.ips].map((h) => `https://${h}:${process.env.HUSH_TLS_PORT}`).join(',');
  if (c.made) process.stdout.write(`Made a new local certificate for ${['localhost', '127.0.0.1', ...c.ips].join(', ')} in ${process.env.HUSH_TLS_DIR}\n`);
}

await import('../src/index.js');
