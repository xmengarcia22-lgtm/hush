// Query grammar (SPEC.md 7.4): `w` is a list of [field, op, value] with op in
// ==, <, <=, >, >=; `o` is [field, "asc"|"desc"]; `l` is a required limit.
// The same comparison rules are applied in SQL (for stored collections) and in
// JavaScript (for in-memory collections and for live subscription matching).

import { fail } from './errors.js';

const FIELD_RE = /^[A-Za-z0-9_]{1,64}$/;
const OPS = new Set(['==', '<', '<=', '>', '>=']);
export const SQL_OP = Object.freeze({ '==': '=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' });

export function validateQuery(q, kind, limits) {
  const w = q.w === undefined ? [] : q.w;
  if (!Array.isArray(w) || w.length > 8) fail('invalid', 'query: bad "w"');
  for (const c of w) {
    if (!Array.isArray(c) || c.length !== 3) fail('invalid', 'query: each condition is [field, op, value]');
    const [f, op, v] = c;
    if (typeof f !== 'string' || !FIELD_RE.test(f)) fail('invalid', 'query: bad field');
    if (!OPS.has(op)) fail('invalid', 'query: bad operator');
    if (!((typeof v === 'string' && v.length <= 256) || (typeof v === 'number' && Number.isFinite(v)))) fail('invalid', 'query: bad value');
  }
  let o;
  if (q.o !== undefined) {
    if (!Array.isArray(q.o) || q.o.length !== 2 || typeof q.o[0] !== 'string' || !FIELD_RE.test(q.o[0]) || !['asc', 'desc'].includes(q.o[1])) {
      fail('invalid', 'query: bad "o"');
    }
    o = [q.o[0], q.o[1]];
  }
  const max = kind === 'search' ? limits.searchLimitMax : limits.queryLimitMax;
  if (!Number.isInteger(q.l) || q.l < 1) fail('invalid', 'query: "l" (limit) is required');
  if (q.l > max) fail('invalid', `query: limit above ${max}`);
  return { w, o, l: q.l };
}

function cmp(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0;
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  return NaN;
}

export function matches(d, w) {
  for (const [f, op, v] of w) {
    const x = d ? d[f] : undefined;
    if (x === undefined || x === null) return false;
    if (op === '==') { if (x !== v) return false; continue; }
    const c = cmp(x, v);
    if (Number.isNaN(c)) return false;
    if (op === '<' && !(c < 0)) return false;
    if (op === '<=' && !(c <= 0)) return false;
    if (op === '>' && !(c > 0)) return false;
    if (op === '>=' && !(c >= 0)) return false;
  }
  return true;
}

// rows: [{ id, d }]. Missing sort fields sort first, like SQLite NULLs.
export function orderAndLimit(rows, o, l) {
  const out = rows.slice();
  if (o) {
    const [f, dir] = o;
    const sign = dir === 'desc' ? -1 : 1;
    out.sort((a, b) => {
      const x = a.d[f], y = b.d[f];
      if (x === undefined && y === undefined) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      if (x === undefined) return -1 * sign;
      if (y === undefined) return 1 * sign;
      const c = cmp(x, y);
      return (Number.isNaN(c) ? 0 : c) * sign;
    });
  } else {
    out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return out.slice(0, l);
}
