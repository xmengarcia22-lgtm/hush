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
//   HUSH_OWNERS        comma-separated usernames that may read reports (report.list), e.g. alice,bob. Default: none
//   HUSH_TURN_URLS     the call relay (TURN), comma-separated, e.g. turn:relay.example.com:3478?transport=udp. Default: none, and calls are unavailable
//   HUSH_TURN_SECRET   the secret shared with the relay (coturn's static-auth-secret); set with HUSH_TURN_URLS or not at all
//   HUSH_TURN_TTL      seconds a relay credential lasts  default 900
//   HUSH_TLS_PORT      also listen with HTTPS on this port (development over the local network; unset = off)
//   HUSH_TLS_HOST      bind address for it         default 0.0.0.0 (every network this PC is on)
//   HUSH_TLS_DIR       folder holding key.pem and cert.pem (`npm run dev:lan` makes them)
//   HUSH_APNS_KEY      path of the Apple push key (.p8) that rings a closed iPhone (POST /wake). Default: none, and no pushes are sent
//   HUSH_APNS_KEY_ID   that key's 10-character id; set with HUSH_APNS_KEY and HUSH_APNS_TEAM_ID or not at all
//   HUSH_APNS_TEAM_ID  the 10-character Apple team id
//   HUSH_APNS_TOPIC    the app's VoIP push topic   default com.hushappofficial.hush.voip
//   HUSH_APNS_HOST     Apple's push host           default api.push.apple.com; api.sandbox.push.apple.com for Xcode builds

import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { readFileSync } from 'node:fs';
import { X509Certificate, createPrivateKey } from 'node:crypto';
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

// Owners (SPEC.md 8.7): the operator's own usernames, the only ones that may read reports (report.list). Decided here and
// nowhere else, like badges. Register these usernames before listing them: until then anyone could sign up as one.
export function parseOwners(raw) {
  if (raw == null || !String(raw).trim()) return [];
  const out = [];
  for (const k of String(raw).split(',')) {
    const h = k.trim().toLowerCase().replace(/^@/, '');
    if (!h) continue;
    if (!ID.HANDLE.test(h)) throw new Error(`HUSH_OWNERS: "${k.trim()}" is not a username`);
    if (!out.includes(h)) out.push(h);
  }
  return out;
}

// The call relay (SPEC.md 16.2). Calls go through it always, never directly, so without it there are no calls. Credentials
// follow the TURN REST scheme (protocol.js, call.relay). The relay checks a credential when a call starts, and an allocation
// made with it outlives it (tested on coturn: a call held 13 minutes on a 120-second credential, over UDP and TCP), so the TTL
// bounds only how long a leaked credential can start new allocations, not how long a call lasts: hence a short default.
export function parseTurn(env) {
  const urls = String(env.HUSH_TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean), secret = String(env.HUSH_TURN_SECRET || '');
  if (!urls.length && !secret) return null;
  if (!urls.length || !secret) throw new Error('HUSH_TURN_URLS and HUSH_TURN_SECRET are set together or not at all');
  for (const u of urls) if (!/^turns?:[A-Za-z0-9.:[\]-]+(\?transport=(?:udp|tcp))?$/.test(u)) throw new Error(`HUSH_TURN_URLS: "${u}" is not a turn: or turns: address`);
  if (secret.length < 16) throw new Error('HUSH_TURN_SECRET is too short: use a long random value');
  const ttl = intOr(env.HUSH_TURN_TTL, 900);
  if (ttl < 60 || ttl > 86400) throw new Error('HUSH_TURN_TTL is in seconds, between 60 and 86400');
  return { urls, secret, ttl };
}

// Call wake-ups (apns.js). The key file is read and parsed here so a wrong path or a damaged file stops the server at
// start, not at the first call that should have rung. Returns the createApns options, or {} when pushes are off.
export function parseApns(env) {
  const keyFile = String(env.HUSH_APNS_KEY || '').trim(), keyId = String(env.HUSH_APNS_KEY_ID || '').trim(), teamId = String(env.HUSH_APNS_TEAM_ID || '').trim();
  if (!keyFile && !keyId && !teamId) return {};
  if (!keyFile || !keyId || !teamId) throw new Error('HUSH_APNS_KEY, HUSH_APNS_KEY_ID and HUSH_APNS_TEAM_ID are set together or not at all');
  if (!/^[A-Za-z0-9]{10}$/.test(keyId)) throw new Error('HUSH_APNS_KEY_ID is the 10-character id shown next to the key');
  if (!/^[A-Za-z0-9]{10}$/.test(teamId)) throw new Error('HUSH_APNS_TEAM_ID is the 10-character team id');
  let pem;
  try { pem = readFileSync(resolve(keyFile)); } catch { throw new Error(`HUSH_APNS_KEY: cannot read ${keyFile}`); }
  let key;
  try { key = createPrivateKey(pem); } catch { throw new Error('HUSH_APNS_KEY is not a private key (the .p8 file from Apple)'); }
  if (key.asymmetricKeyType !== 'ec') throw new Error('HUSH_APNS_KEY is not an EC key (Apple push keys are P-256)');
  const host = String(env.HUSH_APNS_HOST || 'api.push.apple.com').trim();
  if (!/^[A-Za-z0-9.-]+$/.test(host)) throw new Error('HUSH_APNS_HOST is a host name, like api.push.apple.com');
  return { keyFile: resolve(keyFile), keyId, teamId, topic: String(env.HUSH_APNS_TOPIC || 'com.hushappofficial.hush.voip').trim(), host };
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
    owners: parseOwners(env.HUSH_OWNERS),
    turn: parseTurn(env),
    apnsOpts: parseApns(env),
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
