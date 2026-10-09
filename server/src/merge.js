// Document shape rules (SPEC.md 7.3) and RFC 7396 merge patch.
//
// A document is a plain JSON object. Keys match ^[A-Za-z0-9_.~-]{1,64}$. A
// top-level key may not start with an underscore (an earlier client stamped
// `_uid`/`_by` labels on writes; the server wants no labels). Nested keys may:
// wrap labels and member tags are 22 random base64url characters (SPEC.md
// 9.1), so one in 64 of them begins with `_`. `__proto__` is refused at every
// level. Values are strings, finite numbers, booleans, null, arrays or nested
// plain objects, at most 6 levels deep.

import { fail } from './errors.js';

export const MAX_DEPTH = 6;
const KEY_RE_TOP = /^[A-Za-z0-9.~-][A-Za-z0-9_.~-]{0,63}$/;
const KEY_RE = /^(?!__proto__$)[A-Za-z0-9_.~-]{1,64}$/;
const keyOk = (k, depth) => (depth === 0 ? KEY_RE_TOP : KEY_RE).test(k);

export function isPlain(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const p = Object.getPrototypeOf(v);
  return p === Object.prototype || p === null;
}

function walk(v, depth, what) {
  if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) fail('invalid', `${what}: numbers must be finite`);
    return;
  }
  if (Array.isArray(v)) {
    if (depth + 1 > MAX_DEPTH) fail('invalid', `${what}: nested too deeply`);
    for (const x of v) walk(x, depth + 1, what);
    return;
  }
  if (isPlain(v)) {
    if (depth + 1 > MAX_DEPTH) fail('invalid', `${what}: nested too deeply`);
    for (const [k, x] of Object.entries(v)) {
      if (!keyOk(k, depth)) fail('invalid', `${what}: bad field name`);
      walk(x, depth + 1, what);
    }
    return;
  }
  fail('invalid', `${what}: unsupported value type`);
}

// Throws HushError('invalid') unless `d` is an acceptable document or patch.
export function validateDoc(d, what = 'document') {
  if (!isPlain(d)) fail('invalid', `${what} must be an object`);
  walk(d, 0, what);
}

// RFC 7396: objects merge recursively, arrays and scalars replace, null removes.
export function mergePatch(target, patch) {
  if (!isPlain(patch)) return patch;
  const out = isPlain(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else if (isPlain(v)) out[k] = mergePatch(out[k], v);
    else out[k] = v;
  }
  return out;
}

// Keys whose value differs between two documents (top level only).
export function changedKeys(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  const out = [];
  for (const k of keys) {
    if (JSON.stringify(before ? before[k] : undefined) !== JSON.stringify(after ? after[k] : undefined)) out.push(k);
  }
  return out;
}

export function byteLength(d) {
  return Buffer.byteLength(JSON.stringify(d), 'utf8');
}
