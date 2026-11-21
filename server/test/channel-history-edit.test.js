// Release 93b (page), private channels: the owner's Edit sheet (openEditConv) names the admin list Save will sign (release 93 item 7,
// owner decision D4: a hint, since the root cause, a fresh device's first sight of her own older signed copy, has no page-side fix), and
// Channel info's hint on an unsigned admin list (release 93 S3, pinned). The page harness is channel-history-kit.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

import { world, makeChannel, lift } from './channel-history-kit.js';

// Helpers shared with channel-history-strict.test.js and channel-history-revoke.test.js, copied as the removal tests do.
const keyOf = (X, cid, e) => X.unb64(X.ksGet(cid, e));
const read = async (X, cid) => { await X.shown(cid); await X.rolesQ.get(cid); };
async function bareMeta(e, raw, x, ad) {   // an ometa as a page from before release 92 sealed it: no rs
  const iv = randomBytes(12), key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt']);
  return { e, iv: iv.toString('base64'), ct: Buffer.from(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(ad) }, key, Buffer.from(JSON.stringify(x)))).toString('base64') };
}
// A private channel as a page from before release 92 left it: its ometa unsigned, naming no admin secret, read so by everyone in `pages`.
async function pre92(A, cid, members, admins, pages) {
  await makeChannel(A, cid, members, admins);
  await A.S.db.doc('channels/' + cid).update({ ometa: await bareMeta(0, keyOf(A, cid, 0), { name: 'History', desc: '', photo: null, owner: 'alice', admins }, 'hush-ometa-v1|' + cid) });
  for (const P of pages) { await read(P, cid); assert.deepEqual([P.rolesOf(cid).s, P.rolesOf(cid).a], [0, admins], P.handle + ': unsigned'); }
}
// Save pressed in X's Edit sheet (openEditConv), the record being X's copy of it: the sheet's error line ('' once saved).
async function editSave(X, cid, name) {
  X.S.convs = [{ ...(await X.showMeta(await X.sync(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid);
  const at = (f) => X.spy.els.find(f); at((e) => e.tag === 'input').value = name;
  await at((e) => e.cls === 'primary').onclick(); return at((e) => e.cls === 'err').textContent;
}
// X's Edit sheet opened on the record as X's chat list holds it: the hint lines that name the admin list (none on a sheet whose Save signs no list).
const editHint = async (X, cid) => { X.S.convs = [{ ...(await X.showMeta(await X.sync(cid))), id: cid }]; X.spy.els.length = 0; X.openEditConv(cid); return X.spy.els.filter((e) => e.cls === 'hint' && e.textContent.includes('admin list')).map((e) => e.textContent); };
const LINE = (who) => `Save also signs the admin list as this device shows it: ${who}. If someone’s missing or shouldn’t be there, change the admins in Channel info first.`;
// Channel info (openConvInfo) sits among the app's screens and is not lifted whole; the one statement that shows the owner the hint on an
// unsigned admin list is run here as it stands in ui.js, with the page's own roles record, so its condition and its text are both pinned.
// `o`: openConvInfo's isOwner, group and public flags for the sheet in question. The paragraphs it appends, as [tag, class, text].
const infoHint = (X, cid, o) => { const line = lift('function openConvInfo(', 'function pickPhoto(').split('\n').find((l) => l.includes('admin list isn’t signed yet')); assert.ok(line, 'openConvInfo has the hint line');
  const out = []; new Function('owner', 'grp', 'pub', 'rolesOf', 'cid', 'body', 'el', line.trim())(o.owner, o.grp, o.pub, X.rolesOf, cid, { append: (...e) => out.push(...e) }, (tag, cls, text) => ({ tag, cls, textContent: text })); return out.map((e) => [e.tag, e.cls, e.textContent]); };
const HINT = 'This channel’s admin list isn’t signed yet (it was made before this version of Hush, or this device couldn’t check it). Check the admins, then tap Edit and Save to sign it. Until then no admin can remove people or reset the invite link.';

test('146. the owner\'s Edit sheet names the admin list Save will sign (release 93 item 7, owner decision D4): the admins by name, or "no admins"; a fresh device of hers served her own older signed copy first (first sight takes it) shows the admin she has since demoted, so she can remove him in Channel info before she saves, after which the line says no admins and her save signs the list without him everywhere; no line on a group or a public channel, whose Save signs no list', async () => {
  await world({}, async (w) => {
    const { cid } = w, gid = 'g' + cid.slice(1), A = await w.page('alice', { owner: true }), B = await w.page('bob'), G = await w.page('gus');   // gid: a group is made at a group's address (release 107)
    await makeChannel(A, cid, ['alice', 'bob', 'gus'], ['bob']);
    for (const P of [A, B, G]) await read(P, cid);
    assert.deepEqual(await editHint(A, cid), [LINE('bob')], 'the admin Save will sign, by name');
    const older = (await A.sync(cid)).ometa;   // her signed copy naming Bob
    await A.setAdmins(cid, []);   // Remove admin: the list signed again without him, at a later rt
    assert.deepEqual([await editHint(A, cid), (await B.shown(cid)).admins], [[LINE('no admins')], []], 'none left: the line says so, and a member took the demotion');
    // a fresh device of hers (a new browser) is served her own older signed copy first: first sight takes it (SECURITY.md), so a Save there would sign Bob in again
    await A.S.db.doc('channels/' + cid).update({ ometa: older });
    const A2 = await w.page('alice', { owner: true, id: A.id });
    await read(A2, cid);
    assert.deepEqual([A2.rolesOf(cid).s, A2.rolesOf(cid).a], [1, ['bob']], 'first sight: her older copy, Bob an admin on this device');
    assert.deepEqual(await editHint(A2, cid), [LINE('bob')], 'the line shows him: what a Save here would sign');
    await A2.setAdmins(cid, []);   // she removes him in Channel info first
    assert.deepEqual(await editHint(A2, cid), [LINE('no admins')], 'after Remove admin there: none');
    assert.equal(await editSave(A2, cid, 'Renamed'), '', 'then Save');
    for (const P of [B, G]) await read(P, cid);
    assert.deepEqual([B.rolesOf(cid).a, G.rolesOf(cid).a, (await B.shown(cid)).name], [[], [], 'Renamed'], 'everyone: no admin, the new name');
    await makeChannel(A, gid, ['alice', 'bob'], ['bob'], 'group'); await A2.setVisibility(cid, 'public');
    assert.deepEqual([await editHint(A, gid), await editHint(A2, cid)], [[], []], 'a group, a public channel: no line');
  });
});

test('148. Channel info\'s hint on an unsigned admin list (release 93 S3; owner decision D1, the one manual step): on the owner\'s page of a private channel from before release 92 the sheet says the list isn\'t signed yet and names Edit and Save; not on a page that isn\'t the owner\'s (an admin\'s record is unsigned too), a group or a public channel; and no more once her Edit then Save has signed the list', async () => {
  await world({}, async (w) => {
    const { cid } = w, A = await w.page('alice', { owner: true }), B = await w.page('bob');
    await pre92(A, cid, ['alice', 'bob'], ['bob'], [A, B]);
    const hers = { owner: true, grp: false, pub: false };   // the owner's page, a private channel
    assert.deepEqual(infoHint(A, cid, hers), [['p', 'hint', HINT]], 'the owner, unsigned: the hint, one paragraph');
    assert.deepEqual([infoHint(B, cid, { ...hers, owner: false }), infoHint(A, cid, { ...hers, grp: true }), infoHint(A, cid, { ...hers, pub: true })], [[], [], []], 'an admin\'s page (his record unsigned too, but not his step), a group, a public channel: none');
    assert.equal(await editSave(A, cid, 'History'), '', 'Edit, then Save'); await read(A, cid);   // her record notes the signed copy (noteRoles, settled by the read)
    assert.deepEqual([A.rolesOf(cid).s, infoHint(A, cid, hers)], [1, []], 'signed: the hint is gone');
    await read(B, cid);
    assert.deepEqual([B.rolesOf(cid).s, B.rolesOf(cid).t > 1, infoHint(B, cid, { ...hers, owner: false })], [1, true, []], 'Bob takes her signed list; his sheet shows nothing either way');
  });
});
