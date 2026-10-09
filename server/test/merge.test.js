import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validateDoc, mergePatch, changedKeys, byteLength } from '../src/merge.js';

test('validateDoc accepts ordinary documents', () => {
  validateDoc({ a: 1, b: 'x', c: true, d: null, e: [1, 'two', { f: 3 }], g: { h: { i: 'deep' } } });
});

test('validateDoc rejects non-objects, bad keys and bad values', () => {
  assert.throws(() => validateDoc(null), /must be an object/);
  assert.throws(() => validateDoc([]), /must be an object/);
  assert.throws(() => validateDoc({ _uid: 'x' }), /bad field name/);
  assert.throws(() => validateDoc({ 'has space': 1 }), /bad field name/);
  assert.throws(() => validateDoc({ a: undefined }), /unsupported/);
  assert.throws(() => validateDoc({ a: () => 1 }), /unsupported/);
  assert.throws(() => validateDoc({ a: Infinity }), /finite/);
  assert.throws(() => validateDoc({ a: new Date() }), /unsupported/);
});

test('validateDoc: a leading underscore is refused at the top level only, __proto__ everywhere', () => {
  // Wrap labels are random base64url, so one in 64 starts with "_"; those live under keys.<epoch>.
  const label = '_' + 'a'.repeat(21);
  validateDoc({ keys: { 0: { [label]: { iv: 'x', ct: 'y' } } }, akeys: { [label]: { iv: 'x', ct: 'y' } } });
  validateDoc({ a: [{ _nested: 1 }] });
  assert.throws(() => validateDoc({ _by: 'alice' }), /bad field name/);
  assert.throws(() => validateDoc(JSON.parse('{"__proto__":{"x":1}}')), /bad field name/);
  assert.throws(() => validateDoc(JSON.parse('{"a":{"__proto__":{"x":1}}}')), /bad field name/);
  assert.throws(() => validateDoc({ _ji: 1 }), /bad field name/, 'the old client\'s underscore labels have no exception any more');
});

test('validateDoc enforces the nesting limit', () => {
  const six = { a: { b: { c: { d: { e: { f: 1 } } } } } };
  validateDoc(six);
  const seven = { a: { b: { c: { d: { e: { f: { g: 1 } } } } } } };
  assert.throws(() => validateDoc(seven), /too deeply/);
});

test('mergePatch follows RFC 7396', () => {
  const base = { a: 1, b: { c: 1, d: 2 }, arr: [1, 2], keep: 'k' };
  const out = mergePatch(base, { a: 2, b: { c: null, e: 3 }, arr: [9], gone: null });
  assert.deepEqual(out, { a: 2, b: { d: 2, e: 3 }, arr: [9], keep: 'k' });
  assert.deepEqual(base, { a: 1, b: { c: 1, d: 2 }, arr: [1, 2], keep: 'k' }, 'input is not mutated');
  assert.deepEqual(mergePatch({ x: 1 }, { x: { y: 1 } }), { x: { y: 1 } }, 'scalar replaced by object');
  assert.deepEqual(mergePatch({ x: { y: 1 } }, { x: 'flat' }), { x: 'flat' }, 'object replaced by scalar');
});

test('changedKeys and byteLength', () => {
  assert.deepEqual(changedKeys({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 }).sort(), ['b', 'c']);
  assert.equal(byteLength({ a: 'é' }), Buffer.byteLength('{"a":"é"}'));
});
