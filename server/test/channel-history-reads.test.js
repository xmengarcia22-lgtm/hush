// A channel's read marks (`reads`) are read only at admin level (SPEC.md 5.4): below it the server answers as if there were none,
// never `denied`. A release-92 page takes a `denied` on a watch as an eviction: its adapter opens the chat again and re-sends every
// watch of it under the same ids, the server answers `conflict` for the ones it still holds, and the page drops them, so it stops
// hearing new posts in that channel. Here the page's own code (channel-history-kit.js: the adapter, and writeSeen, readSide and
// readCount from ui.js, as release 92 runs them) meets the server's rule: a subscriber's page keeps every live view of the channel
// and counts no one's view; the owner's and an admin's pages count everyone's, as before. Below admin level a mark is no longer
// updated or deleted, so no answer tells whether one is there; release 92's writeSeen, which writes a whole mark (set) and tidies a
// named mark no read-mark id matches, still saves. The raw rule: channel-privacy.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { lift, mkBuild, world, makeChannel } from './channel-history-kit.js';
import { sleep } from './helpers.js';

const build = mkBuild([lift('const curConv=', '\n'), lift('async function writeSeen(', 'const typeOf='), lift('const sideSeq=', '/* The on-screen keyboard'),
  lift('const tagPeople=', '\n'), lift('const readCount=', '\n'), 'Object.assign(S,{reads:{},writeSeen,readSide,readCount});'].join('\n'));

test('a subscriber\'s page under the read-mark rule keeps every live view of the channel: its read-mark watch starts empty and hears no one\'s mark, it is neither evicted nor opens the chat again, and its posts watch hears the owner\'s next post; the owner\'s and an admin\'s pages count every view, the subscriber\'s page none', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build }), X = await w.page('xena', { build }), B = await w.page('bob', { build }), C = await w.page('carol', { build });
    await makeChannel(A, cid, ['alice', 'xena', 'bob', 'carol'], ['xena']);
    const open = async (P) => { const v = { ...(await P.shown(cid)), id: cid }; P.S.convs = [v]; P.S.chan = cid; return v; };
    const [vX, vB, vC] = [await open(X), await open(B), await open(C)];
    await open(A);
    assert.deepEqual([A, X, B, C].map((P) => P.S.db.chatLevel(cid)), ['owner', 'admin', 'member', 'member']);
    let opens = 0; const st = w.T.srv.store, o0 = st.openChat.bind(st);
    st.openChat = (a, actor) => { if (actor && actor.handle === 'bob') opens++; return o0(a, actor); };
    const posts = [], reads = [], errs = [];
    const stop = [B.S.db.collection(`channels/${cid}/posts`).orderBy('ts', 'desc').limit(300).onSnapshot((s) => posts.push(s.docs.length), (e) => errs.push('posts: ' + (e && e.code))),
      B.S.db.collection(`channels/${cid}/reads`).limit(1000).onSnapshot((s) => reads.push(s.docs.length), (e) => errs.push('reads: ' + (e && e.code)))];
    await sleep(300);
    const t0 = Date.now() - 1000;
    await C.S.writeSeen(vC, Date.now()); await X.S.writeSeen(vX, Date.now());   // Carol and the admin read the channel
    await A.sendBody(cid, 'hello subscribers');   // its frame reaches Bob after any of theirs: one socket, in order
    for (let i = 0; i < 30 && !posts.includes(1); i++) await sleep(100);
    assert.deepEqual([posts.includes(1), errs, opens], [true, [], 0], 'Bob\'s posts watch hears the owner\'s post: no refusal, no eviction, no second open');
    assert.deepEqual(reads, [0], 'his read-mark watch: an empty start, and no one\'s mark after it');
    await B.S.writeSeen(vB, Date.now());   // he still writes his own mark
    const count = async (P) => { let got = {}; const docs = (await P.S.db.collection(`channels/${cid}/reads`).limit(1000).get()).docs;
      await P.S.readSide(cid, docs, 'hush-seen-v1', (r) => { got = r; }); P.S.reads = got; return [Object.keys(got).sort(), P.S.readCount({ from: 'alice', ts: t0 })]; };
    assert.deepEqual(await count(A), [['bob', 'carol', 'xena'], 3], 'the owner\'s page names every reader and counts them (the eye)');
    assert.deepEqual(await count(X), [['bob', 'carol', 'xena'], 3], 'so does an admin\'s');
    assert.deepEqual(await count(B), [[], 0], 'the subscriber\'s page names no one, so it draws no eye');
    for (const f of stop) f();
  });
});

// writeSeen as release 92 (the live page) runs it, word for word: a whole mark with set, then the tidy of the old named mark.
const W92 = `async function writeSeen(c,ts){ // "read up to here", filed under a tag only the people in this chat can work out
  try{const e=epochOf(c),t=await memTag(c,e,S.me.handle);if(!t)return;
    await S.db.doc(\`channels/\${c.id}/reads/\${e}~\${t}\`).set(await sealSide(c,e,t,'hush-seen-v1',ts));
    S.db.doc(\`channels/\${c.id}/reads/\${S.me.handle}\`).delete().catch(()=>{}); // tidy away the old named mark
  }catch{}}`;
const build92 = mkBuild([lift('const curConv=', '\n'), W92, lift('const sideSeq=', '/* The on-screen keyboard'),
  lift('const tagPeople=', '\n'), lift('const readCount=', '\n'), 'Object.assign(S,{reads:{},writeSeen,readSide,readCount});'].join('\n'));

test('release 92\'s writeSeen still saves now that a channel\'s read marks are never updated or deleted below admin level: a subscriber\'s page writes its mark and writes it again over its own, the admin\'s and the owner\'s pages theirs, and each tidy of the old named mark is refused as a bad id before any check, as before; the owner\'s and the admin\'s pages count every view, the subscriber\'s none', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true, build: build92 }), X = await w.page('xena', { build: build92 }), B = await w.page('bob', { build: build92 });
    await makeChannel(A, cid, ['alice', 'xena', 'bob'], ['xena']);
    const open = async (P) => { const v = { ...(await P.shown(cid)), id: cid }; P.S.convs = [v]; P.S.chan = cid; return v; };
    const [vA, vX, vB] = [await open(A), await open(X), await open(B)];
    assert.deepEqual([A, X, B].map((P) => P.S.db.chatLevel(cid)), ['owner', 'admin', 'member']);
    const st = w.T.srv.store, d0 = st.delete.bind(st), tidy = [];   // the server's answer to each delete
    st.delete = (...a) => { try { const r = d0(...a); tidy.push('ok'); return r; } catch (e) { tidy.push(e.code); throw e; } };
    const t0 = Date.now() - 1000;
    await B.S.writeSeen(vB, t0 + 1); await B.S.writeSeen(vB, t0 + 2);   // his mark, then again over his own: set, never update
    await X.S.writeSeen(vX, t0 + 3); await A.S.writeSeen(vA, t0 + 4);
    for (let i = 0; i < 50 && tidy.length < 4; i++) await sleep(40);
    assert.deepEqual(tidy, ['invalid', 'invalid', 'invalid', 'invalid'], 'each tidy: a bad id, as before, never denied');
    const count = async (P) => { let got = {}; const docs = (await P.S.db.collection(`channels/${cid}/reads`).limit(1000).get()).docs;
      await P.S.readSide(cid, docs, 'hush-seen-v1', (r) => { got = r; }); P.S.reads = got; return [got, P.S.readCount({ from: 'alice', ts: t0 })]; };
    const all = { alice: t0 + 4, bob: t0 + 2, xena: t0 + 3 };
    assert.deepEqual(await count(A), [all, 2], 'the owner\'s page names every reader at their last mark, and counts them (the eye)');
    assert.deepEqual(await count(X), [all, 2], 'so does the admin\'s');
    assert.deepEqual(await count(B), [{}, 0], 'the subscriber\'s page names no one, so it draws no eye');
  });
});
