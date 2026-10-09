// The identity plane (SPEC.md 4.1): a connection proves it holds a username by
// signing the server's challenge. The signature may come from
//   - the account signing key published in the directory entry,
//   - a device signing key listed under `devs` in that entry, whose own entry is
//     vouched for (signed) by the account key or by another listed device, or
//   - for a username that does not exist yet, a fresh account key sent along
//     (`pub`); the connection may then create exactly that directory entry.
//
// Signed text: "hush-session-v1|<nonce>|<handle>|<device id or empty>".
// Signatures are ECDSA P-256 / SHA-256 in raw r||s form, base64 or base64url.

import { fail } from './errors.js';
import { isPlain } from './merge.js';

const subtle = globalThis.crypto.subtle;
export const HANDLE = /^[a-z0-9_]{3,20}$/;
const DEV_ID = /^[a-zA-Z0-9]{6,20}$/;
const XY = (v) => isPlain(v) && typeof v.x === 'string' && typeof v.y === 'string' && v.x.length >= 40 && v.x.length <= 64 && v.y.length >= 40 && v.y.length <= 64;

function decodeSig(s) {
  if (typeof s !== 'string' || s.length < 80 || s.length > 100) return null;
  const b = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return b.length === 64 ? b : null;
}

export async function verifySig(xy, sigText, message) {
  const sig = decodeSig(sigText);
  if (!sig || !XY(xy)) return false;
  try {
    const key = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: xy.x, y: xy.y, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, sig, Buffer.from(message, 'utf8'));
  } catch {
    return false;
  }
}

export const sessionMessage = (nonce, h, dev) => `hush-session-v1|${nonce}|${h}|${dev || ''}`;
// Identical to devMsg() in the client.
export const deviceMessage = (h, d) => ['hush-dev-v1', h, d.id, d.ecdh.x, d.ecdh.y, d.sig.x, d.sig.y, d.by || ''].join('|');

// Resolves a listed device's keys by walking its vouching chain up to the account key.
export async function deviceKey(dir, h, id, depth = 0, seen = new Set()) {
  if (depth > 4 || seen.has(id) || !DEV_ID.test(id)) return null;
  seen.add(id);
  const e = dir && isPlain(dir.devs) ? dir.devs[id] : null;
  if (!isPlain(e) || !['x', 'y', 'sx', 'sy', 's'].every((f) => typeof e[f] === 'string')) return null;
  const by = typeof e.by === 'string' ? e.by : '';
  let parentSig;
  if (by) {
    const parent = await deviceKey(dir, h, by, depth + 1, seen);
    if (!parent) return null;
    parentSig = parent.sig;
  } else parentSig = dir.sig;
  const d = { id, ecdh: { x: e.x, y: e.y }, sig: { x: e.sx, y: e.sy }, by };
  return (await verifySig(parentSig, e.s, deviceMessage(h, d))) ? d : null;
}

// Returns { via: 'account' | 'device' | 'signup', pub } or throws HushError.
export async function verifyProof({ dir, h, dev, pub, sig, nonce }) {
  if (typeof h !== 'string' || !HANDLE.test(h)) fail('invalid', 'prove: bad handle');
  if (dev !== undefined && dev !== '' && !(typeof dev === 'string' && DEV_ID.test(dev))) fail('invalid', 'prove: bad device id');
  const msg = sessionMessage(nonce, h, dev);
  if (!dir) {
    if (!XY(pub)) fail('denied', 'no account with that username');
    if (dev) fail('invalid', 'a new account proves with its account key');
    if (!(await verifySig(pub, sig, msg))) fail('denied', 'bad signature');
    return { via: 'signup', pub: { x: pub.x, y: pub.y } };
  }
  if (!XY(dir.sig)) fail('denied', 'this account has no usable key');
  if (dev) {
    const d = await deviceKey(dir, h, dev);
    if (!d) fail('denied', 'this device is not listed on the account');
    if (!(await verifySig(d.sig, sig, msg))) fail('denied', 'bad signature');
    return { via: 'device', pub: { x: dir.sig.x, y: dir.sig.y } };
  }
  if (!(await verifySig(dir.sig, sig, msg))) fail('denied', 'bad signature');
  return { via: 'account', pub: { x: dir.sig.x, y: dir.sig.y } };
}
