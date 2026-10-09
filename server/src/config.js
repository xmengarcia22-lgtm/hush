// Configuration from environment variables. Everything has a safe default
// except HUSH_AUTHZ, which must be set on purpose (see authz.js).
//
//   HUSH_HOST          bind address            default 127.0.0.1 (Caddy proxies to it)
//   HUSH_PORT          bind port               default 8080
//   HUSH_DATA_DIR      database folder         default <server>/data
//   HUSH_ADDR_KEY      path of addr.key        default <data dir>/addr.key
//   HUSH_ORIGINS       allowed Origin values   default: only pages served from this same host; "*" turns the check off (tests only)
//   HUSH_AUTHZ         authorization policy    "standard" (SPEC.md) or "open" (tests only)
//   HUSH_STATIC        folder with index.html  serve the app from this server (dev only); unset = off
//   HUSH_TRUST_PROXY   use X-Forwarded-For     default 0; set 1 behind Caddy, never when clients reach Node directly
//   HUSH_LOG           "off" silences logging  default on
//   HUSH_LIMITS        JSON object overriding limits.js DEFAULT_LIMITS
//   HUSH_BADGES        JSON object of username to badge, e.g. {"Alice":"founder"}; badges: founder, verified. Default: none
//   HUSH_TLS_PORT      also listen with HTTPS on this port (development over the local network; unset = off)
//   HUSH_TLS_HOST      bind address for it         default 0.0.0.0 (every network this PC is on)
//   HUSH_TLS_DIR       folder holding key.pem and cert.pem (`npm run dev:lan` makes them)

import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { X509Certificate } from 'node:crypto';
import { ID } from './paths.js';

export const SERVER_ROOT = fileURLToPath(new URL('..', import.meta.url));

function intOr(v, d) {
  const n = Number.parseInt(v, 10);
  return Number.isInteger(n) ? n : d;
}

// Badges (SPEC.md 12.3): who carries one is decided here, by the operator, and nowhere else. The list goes to every
// page in the hello reply; a profile cannot carry a badge (the directory schema refuses the field) and the page never
// reads one from a profile, so nobody can give themselves one. Keys are usernames in any capitalization.
export const BADGE_LEVELS = Object.freeze(['founder', 'verified']);
export function parseBadges(raw) {
  if (raw == null || !String(raw).trim()) return {};
  let o;
  try { o = JSON.parse(raw); } catch { throw new Error('HUSH_BADGES is not valid JSON'); }
  if (!o || typeof o !== 'object' || Array.isArray(o)) throw new Error('HUSH_BADGES must be a JSON object, like {"username": "founder"}');
  const out = {};
  for (const [k, v] of Object.entries(o)) {
    const h = String(k).trim().toLowerCase().replace(/^@/, '');
    if (!ID.HANDLE.test(h)) throw new Error(`HUSH_BADGES: "${k}" is not a username`);
    if (!BADGE_LEVELS.includes(v)) throw new Error(`HUSH_BADGES: "${k}" has an unknown badge "${v}" (one of ${BADGE_LEVELS.join(', ')})`);
    out[h] = v;
  }
  return out;
}

export function loadConfig(env = process.env) {
  let limits = {};
  if (env.HUSH_LIMITS) {
    try { limits = JSON.parse(env.HUSH_LIMITS); } catch { throw new Error('HUSH_LIMITS is not valid JSON'); }
  }
  return {
    host: env.HUSH_HOST || '127.0.0.1',
    port: intOr(env.HUSH_PORT, 8080),
    dataDir: env.HUSH_DATA_DIR ? resolve(env.HUSH_DATA_DIR) : resolve(SERVER_ROOT, 'data'),
    addrKeyFile: env.HUSH_ADDR_KEY ? resolve(env.HUSH_ADDR_KEY) : undefined,
    origins: (env.HUSH_ORIGINS || '').trim() === '*' ? 'any' : (env.HUSH_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
    authz: env.HUSH_AUTHZ === 'identity' ? 'standard' : (env.HUSH_AUTHZ || ''),
    staticDir: env.HUSH_STATIC ? resolve(env.HUSH_STATIC) : null,
    trustProxy: env.HUSH_TRUST_PROXY === '1',
    logging: env.HUSH_LOG !== 'off',
    limits,
    badges: parseBadges(env.HUSH_BADGES),
    tls: env.HUSH_TLS_PORT ? loadTls(env) : null,
  };
}

function loadTls(env) {
  const dir = resolve(env.HUSH_TLS_DIR || join(SERVER_ROOT, 'devcert'));
  let key, cert;
  try { key = readFileSync(join(dir, 'key.pem'), 'utf8'); cert = readFileSync(join(dir, 'cert.pem'), 'utf8'); }
  catch { throw new Error(`HUSH_TLS_PORT is set but there is no key.pem and cert.pem in ${dir}`); }
  return { port: intOr(env.HUSH_TLS_PORT, 8443), host: env.HUSH_TLS_HOST || '0.0.0.0', key, cert, der: new X509Certificate(cert).raw, dir };
}
