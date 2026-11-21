// The made-up page of info-rows.test.js and settings-actions.test.js (redesign step B, release 105).
// A screen function of app/ui.js is cut out by its landmarks and run as written, on elements that only remember what was
// done to them. So a test can read the whole screen as text, press a button, and see which named action was called.
// Nothing is drawn, no browser runs, and nothing is sent anywhere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const UI = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
export function lift(from, to) {
  const a = UI.indexOf(from); assert.ok(a > 0, 'app/ui.js holds ' + JSON.stringify(from));
  const b = UI.indexOf(to, a + from.length); assert.ok(b > a, 'app/ui.js holds ' + JSON.stringify(to) + ' after it');
  return UI.slice(a, b);
}
// the page's code with its surroundings handed in by name; `gives` = what the test wants back
export const build = (code, env, gives) => new Function('env', `const {${Object.keys(env).join(',')}}=env;\n${code}\nreturn {${gives}};`)(env);

// ---- elements --------------------------------------------------------------------------------------------------------
export function node(tag, cls, text) {
  return { tag, className: cls || '', textContent: text == null ? '' : String(text), kids: [], attrs: {}, style: {}, isConnected: true, parent: null, get children() { return this.kids.filter((k) => k && typeof k === 'object'); },
    append(...k) { for (const x of k) { if (x && typeof x === 'object') x.parent = this; this.kids.push(x); } },
    before(x) { x.parent = this.parent; this.parent.kids.splice(this.parent.kids.indexOf(this), 0, x); },
    remove() { if (this.parent) this.parent.kids.splice(this.parent.kids.indexOf(this), 1); },
    replaceChildren(...k) { this.kids = []; this.append(...k); },
    setAttribute(k, v) { this.attrs[k] = String(v); }, insertAdjacentHTML(where, h) { this.kids.push({ markup: where + ' ' + h }); }, focus() {}, select() {} };
}
export const el = (tag, cls, text) => node(tag, cls, text);
export const html = (tag, cls, h) => Object.assign(node(tag, cls), { innerHTML: h });
export const I = new Proxy({}, { get: (_, k) => '<svg ' + String(k) + '/>' });   // every icon, by its name

const PROPS = ['type', 'value', 'placeholder', 'maxLength', 'checked', 'disabled', 'readOnly', 'tabIndex', 'autocomplete', 'autocapitalize', 'spellcheck'];
const HANDLERS = ['onclick', 'onchange', 'oninput', 'onfocus'];
// the whole of an element as text: tag, classes, markup, text, what the code set on it, which handlers it has, and its children in order
export function dump(e, pad = '') {
  if (typeof e === 'string') return pad + JSON.stringify(e);
  if (e.markup) return pad + 'markup ' + e.markup;
  const bits = [e.tag + (e.className ? '.' + e.className.split(' ').join('.') : '')];
  if (e.innerHTML !== undefined) bits.push('html=' + e.innerHTML);
  if (e.textContent) bits.push(JSON.stringify(e.textContent));
  for (const k of PROPS) if (e[k] !== undefined) bits.push(k + '=' + JSON.stringify(e[k]));
  for (const [k, v] of Object.entries(e.attrs)) bits.push('@' + k + '=' + v);
  for (const [k, v] of Object.entries(e.style)) bits.push('style.' + k + '=' + v);
  for (const k of HANDLERS) if (typeof e[k] === 'function') bits.push(k);
  return [pad + bits.join(' '), ...e.kids.map((k) => dump(k, pad + '  '))].join('\n');
}
// every text an element shows, its children's too, in order
export function texts(e) {
  if (typeof e === 'string') return [e];
  if (e.markup) return [e.markup.replace(/^\w+ /, '').replace(/<[^>]*>/g, '')].filter(Boolean);
  const own = e.innerHTML !== undefined ? e.innerHTML.replace(/<[^>]*>/g, '') : e.textContent;
  return [own, ...e.kids.flatMap(texts)].filter(Boolean);
}
// one line per row of a screen: what a person reads there
export const rows = (body) => body.kids.map((k) => (typeof k === 'string' ? 'text' : k.tag + (k.className ? '.' + k.className.split(' ').join('.') : '')) + ': ' + texts(k).join(' | '));
export const sha = (t) => createHash('sha256').update(t).digest('hex').slice(0, 16);
export function all(e, f, out = []) { if (e && typeof e === 'object' && e.kids) { if (f(e)) out.push(e); e.kids.forEach((k) => all(k, f, out)); } return out; }
// the one element of a screen that shows exactly this text
export function find(root, text) {
  const hits = all(root, (e) => (e.innerHTML !== undefined ? e.innerHTML.replace(/<[^>]*>/g, '') : e.textContent) === text);
  assert.equal(hits.length, 1, 'the screen shows ' + JSON.stringify(text) + ' once; it shows it ' + hits.length + ' time(s)');
  return hits[0];
}
export const tick = () => new Promise((r) => setImmediate(r));
