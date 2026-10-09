// Entry point: `node src/index.js` (or `npm start`; `npm run dev` for the local app setup).

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from './config.js';
import { createServer } from './server.js';
import { log } from './log.js';

const cfg = loadConfig();
log.setEnabled(cfg.logging);

if (!['open', 'standard'].includes(cfg.authz)) {
  process.stderr.write(
    'Set HUSH_AUTHZ to choose the authorization policy:\n' +
    '  standard  usernames are proven; chats open only with their room keys (SPEC.md)\n' +
    '  open      no checks at all (tests only)\n',
  );
  process.exit(2);
}
if (cfg.staticDir && !existsSync(join(cfg.staticDir, 'index.html'))) {
  process.stderr.write(`HUSH_STATIC points at ${cfg.staticDir}, but there is no index.html there.\n`);
  process.exit(2);
}

const srv = createServer(cfg);
const { host, port, tls } = await srv.listen();
const lines = [
  `Hush server listening on http://${host}:${port}  (WebSocket at /ws, health at /healthz)`,
  cfg.authz === 'standard' ? 'Authorization: standard (proven usernames, room keys for chats)' : 'Authorization: OPEN - no checks at all, tests only',
  `Data folder: ${cfg.dataDir}`,
  cfg.origins === 'any' ? 'Allowed origins: any (HUSH_ORIGINS=*; never in production)' : cfg.origins.length ? `Allowed origins: ${cfg.origins.join(', ')}, and pages served from this host` : 'Allowed origins: pages served from this host only (set HUSH_ORIGINS for others)',
  cfg.trustProxy ? 'Client addresses: taken from X-Forwarded-For (behind Caddy)' : 'Client addresses: the socket\'s own (set HUSH_TRUST_PROXY=1 behind Caddy)',
  Object.keys(cfg.badges || {}).length ? `Badges: ${Object.entries(cfg.badges).map(([h, b]) => `@${h} ${b}`).join(', ')}` : 'Badges: none (set HUSH_BADGES to give some)',
];
if (cfg.staticDir) lines.push(`Serving the app from: ${cfg.staticDir}`, `Open the app at: http://${host}:${port}/`);
if (tls) {
  const { networkInterfaces } = await import('node:os');
  const ips = Object.entries(networkInterfaces()).flatMap(([name, l]) => (l || []).filter((a) => a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')).map((a) => ({ name, address: a.address })))
    .filter((a) => !/vpn|vethernet|virtual|wsl|hyper-v|vmware|virtualbox|tailscale|zerotier/i.test(a.name));   // a phone can't reach those
  lines.push(`Also listening with HTTPS on ${tls.host}:${tls.port} (self-signed certificate in ${cfg.tls.dir})`);
  for (const a of ips) lines.push(`  From a phone on the same network (${a.name}): https://${a.address}:${tls.port}/`);
  if (!ips.length) lines.push('  No local network found: connect this PC to Wi-Fi or Ethernet.');
  lines.push(`  The certificate itself, for an iPhone to trust: https://<address above>:${tls.port}/hush-dev.crt`);
}
process.stdout.write(lines.join('\n') + '\n');
log.info('server.start', { port, mode: cfg.authz });

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  log.info('server.stop');
  try { await srv.close(); } finally { process.exit(0); }
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
