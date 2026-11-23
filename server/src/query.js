// Query grammar (SPEC.md 7.4): `w` is a list of [field, op, value] with op in
// ==, <, <=, >, >=; `o` is ["ts", "asc"|"desc"]; `l` is a required limit.
// The same comparison rules are applied in SQL (for stored collections) and in
// JavaScript (for in-memory collections and for live subscription matching).

import { fail } from './errors.js';

const OPS = new Set(['==', '<', '<=', '>', '>=']);
// The fields a condition may name, by collection: the ones the page asks by, and no other (any other had SQLite read every document
// of the collection to test it). A condition on ts goes by its index; e is tested over one chat's member cards; h, n and n2 are
// tested over the search entries one by one (4 KB at most each) until l of them match; visibility is the listing's alone (store.js).
// An order is by ts alone (release 112).
const FIELDS = { roll: ['ts', 'e'], search: ['h', 'n', 'n2'], channels: ['visibility'] };
export const SQL_OP = Object.freeze({ '==': '=', '<': '<', '<=': '<=', '>': '>', '>=': '>=' });

export function validateQuery(q, kind, limits) {
  const w = q.w === undefined ? [] : q.w;
  if (!Array.isArray(w) || w.length > 8) fail('invalid', 'query: bad "w"');
  for (const c of w) {
    if (!Array.isArray(c) || c.length !== 3) fail('invalid', 'query: each condition is [field, op, value]');
    const [f, op, v] = c;
    if (!(FIELDS[kind] || ['ts']).includes(f)) fail('invalid', 'query: this collection cannot be asked by that field');
    if (!OPS.has(op)) fail('invalid', 'query: bad operator');
    if (!((typeof v === 'string' && v.length <= 256) || (typeof v === 'number' && Number.isFinite(v)))) fail('invalid', 'query: bad value');
  }
  let o;
  if (q.o !== undefined) {
    if (!Array.isArray(q.o) || q.o.length !== 2 || q.o[0] !== 'ts' || !['asc', 'desc'].includes(q.o[1])) fail('invalid', 'query: "o" is ["ts", "asc" or "desc"]');
    o = ['ts', q.o[1]];
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
