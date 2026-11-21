// The page's half of own-media delete (release 81): a per-file token derived from the account's own secret, its hash sent with
// every upload and copy (X-Hush-Oh), the token itself with a delete (X-Hush-Ot), so a group member removes the files of their own
// messages while the server can link neither two files to one person nor a file to a message. Source checks over app/*.js and
// the derivation run for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const crypto_ = read('app/crypto.js'), adapter = read('app/adapter.js'), ui = read('app/ui.js');
const liftFrom = (src, from, to) => { const a = src.indexOf(from), b = src.indexOf(to, a); assert.ok(a >= 0 && b > a, `${from} … ${to}`); return src.slice(a, b); };
const line = (src, from) => liftFrom(src, from, '\n');

// The derivation, lifted with the helpers it reaches for; WebCrypto is Node's own.
const SRC = [
  line(crypto_, 'const enc=new TextEncoder()'), line(crypto_, 'const b64=buf=>'), line(crypto_, 'const unb64=s=>'), line(crypto_, 'const b64u=a=>'), line(crypto_, 'const unb64u=s=>'),
  line(crypto_, 'const hexOf=b=>'), line(crypto_, 'const OWN_RE='), line(crypto_, 'const ownIkm=id=>'),
  liftFrom(crypto_, 'async function hkdf(ikm,salt,info){', 'async function memberCapFrom('),
  line(crypto_, 'const ownHash='),
  liftFrom(crypto_, 'async function ownTokAs(id,cid,pid,k){', 'async function ownTokFor('),
  liftFrom(crypto_, 'async function mediaTokAs(id,cid,mid){', '/* ===== HUSH REKEY END ===== */'),
].join('\n');
const C = new Function('S', `${SRC}\nreturn {b64u,ownHash,ownTokAs,mediaTokAs,mediaTok};`);

test('the media token: one per file, unlinkable to the post token and to other files, deterministic on every device of the account', async () => {
  const own = C({}).b64u(crypto.getRandomValues(new Uint8Array(32)));
  const me = { own, sigPriv: { d: C({}).b64u(crypto.getRandomValues(new Uint8Array(32))) } };
  const c = C({ me });
  const t1 = await c.mediaTok('g1', 'm1'), t1b = await c.mediaTokAs(me, 'g1', 'm1'), t2 = await c.mediaTok('g1', 'm2'), t3 = await c.mediaTok('g2', 'm1');
  assert.equal(t1, t1b, 'mediaTok is mediaTokAs for the active account');
  assert.match(t1, /^[A-Za-z0-9_-]{43}$/, '32 bytes, base64url');
  assert.notEqual(t1, t2); assert.notEqual(t1, t3);
  assert.notEqual(t1, await c.ownTokAs(me, 'g1', 'm1', 0), 'another salt than the post token, so the two never coincide');
  assert.equal(await c.mediaTokAs({ own: me.own, sigPriv: me.sigPriv }, 'g1', 'm1'), t1, 'the same secret on another device gives the same token');
  assert.notEqual(await c.mediaTokAs({ own: C({}).b64u(crypto.getRandomValues(new Uint8Array(32))), sigPriv: me.sigPriv }, 'g1', 'm1'), t1, 'another account, another token');
  const h = await c.ownHash(t1);
  assert.match(h, /^[0-9a-f]{64}$/, 'the hash the server keeps: 64 lowercase hex');
  assert.notEqual(h, await c.ownHash(t2));
});

test('dropMedia: the token goes with the delete; a refusal with an old secret at hand is tried once more with it; nothing throws', async () => {
  const code = liftFrom(ui, 'async function dropMedia(cid,mid){', 'async function purgePost(');
  const make = (S, mediaTok, mediaTokAs) => new Function('S', 'mediaTok', 'mediaTokAs', `${code}\nreturn dropMedia;`)(S, mediaTok, mediaTokAs);
  const calls = [];
  const db = (answers) => ({ deleteMedia: async (cid, mid, ot) => { calls.push([cid, mid, ot]); const a = answers.shift(); if (a instanceof Error) throw a; return a; } });
  const denied = Object.assign(new Error('denied'), { code: 'denied' });
  const tok = async (cid, mid) => `cur:${cid}:${mid}`, tokAs = async (id, cid, mid) => `${id.own}:${cid}:${mid}`;
  // the happy path: one call, the current token
  calls.length = 0;
  assert.equal(await make({ me: { prev: { own: 'OLD', sigPriv: {} } }, db: db([2]) }, tok, tokAs)('g1', 'm1'), 2);
  assert.deepEqual(calls, [['g1', 'm1', 'cur:g1:m1']]);
  // refused, an old secret kept: once more with the old token, and its answer is the result
  calls.length = 0;
  assert.equal(await make({ me: { prev: { own: 'OLD', sigPriv: {} } }, db: db([denied, 3]) }, tok, tokAs)('g1', 'm1'), 3);
  assert.deepEqual(calls, [['g1', 'm1', 'cur:g1:m1'], ['g1', 'm1', 'OLD:g1:m1']]);
  // refused twice: swallowed, exactly two tries
  calls.length = 0;
  assert.equal(await make({ me: { prev: { own: 'OLD', sigPriv: {} } }, db: db([denied, denied]) }, tok, tokAs)('g1', 'm1'), 0);
  assert.equal(calls.length, 2);
  // refused, no old secret: one try, swallowed
  calls.length = 0;
  assert.equal(await make({ me: {}, db: db([denied]) }, tok, tokAs)('g1', 'm1'), 0);
  assert.equal(calls.length, 1);
  // another error (offline): one try, swallowed, never the old token
  calls.length = 0;
  assert.equal(await make({ me: { prev: { own: 'OLD', sigPriv: {} } }, db: db([Object.assign(new Error('x'), { code: 'offline' })]) }, tok, tokAs)('g1', 'm1'), 0);
  assert.equal(calls.length, 1);
});

test('every piece delete on the page goes through dropMedia; the upload and the forward carry the token hash', () => {
  assert.equal((ui.match(/S\.db\.deleteMedia\(/g) || []).length, 2, 'the two calls inside dropMedia and nowhere else');
  assert.equal((ui.match(/\bdropMedia\(/g) || []).length, 6, 'the definition and five callers');
  for (const re of [
    /openPost\(c,p\)\.then\(o=>\{for\(const m of o\.media\|\|\[\]\)dropMedia\(c\.id,m\.id\)\}\)\.catch\(\(\)=>\{\}\);/,   // delete-for-everyone sweep
    /for\(const m of o\.media\|\|\[\]\)await dropMedia\(c\.id,m\.id\);/,   // purgePost
    /media\.filter\(Boolean\)\.forEach\(d=>dropMedia\(cc\.id,d\.id\)\);throw e\}/,   // a send that failed
    /openPost\(c,p\)\.then\(o=>\{for\(const m of o\.media\|\|\[\]\)dropMedia\(cid,m\.id\)\}\)\.catch\(\(\)=>\{\}\);/,   // deletePost
    /catch\(e\)\{dropMedia\(c\.id,mid\);throw e\}/,   // an upload that could not finish
  ]) assert.match(ui, re);
  const up = liftFrom(ui, 'async function uploadMedia(c,m,tick,exp){', '\n}');
  assert.match(up, /,oh=await ownHash\(await mediaTok\(c\.id,mid\)\);/, 'one hash per file, computed once');
  assert.match(up, /S\.db\.putPiece\(c\.id,mid,i,body,exp\|\|0,oh\)/, 'every piece carries it');
  assert.equal((up.match(/mediaTok\(/g) || []).length, 1);
  assert.match(liftFrom(ui, 'async function forwardTo(tid,p,o,src,title){', '\n}'), /S\.db\.copyMedia\(src\.id,m\.id,target\.id,mid,exp,await ownHash\(await mediaTok\(target\.id,mid\)\)\)/, 'the copy is the forwarder\'s file');
});

test('the adapter sets X-Hush-Oh on a piece and a copy, X-Hush-Ot on a delete, each only when given', () => {
  assert.match(line(adapter, '  api.putPiece='), /^  api\.putPiece=\(cid,mid,i,bytes,exp,oh\)=>mediaFetch\('PUT',cid,mid\+'\/'\+i,bytes,Object\.assign\(\{\},exp\?\{'x-hush-exp':String\(exp\)\}:\{\},oh\?\{'x-hush-oh':oh\}:\{\}\)\)/);
  assert.match(line(adapter, '  api.deleteMedia='), /^  api\.deleteMedia=\(cid,mid,ot\)=>mediaFetch\('DELETE',cid,mid,null,ot\?\{'x-hush-ot':ot\}:null\)/);
  assert.match(line(adapter, '  api.copyMedia='), /^  api\.copyMedia=\(from,fromMid,to,mid,exp,oh\)=>mediaFetch\('POST',to,mid\+'\/copy',null,Object\.assign\(\{'x-hush-from':from\+'\/'\+fromMid\},exp\?\{'x-hush-exp':String\(exp\)\}:\{\},oh\?\{'x-hush-oh':oh\}:\{\}\),from\)/);
  assert.match(crypto_, /^async function mediaTokAs\(id,cid,mid\)\{return b64u\(await hkdf\(ownIkm\(id\),'hush-media-own-v1',cid\+'\|'\+mid\)\)\}$/m, 'its own salt, the chat and the file in the info');
});
