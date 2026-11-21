// Release 104, item 5 (SPEC.md 14.15): "sign in first" in the middle of the owner step, U1.
//
// A device removal gives the account new keys and then, chat by chat, replaces what the removed device held: the chat key (the
// key-change loop), and in a chat this account owns the owner key, the admin secret and the open invite links (the owner step).
// From release 104 a chat whose owner step fails is marked "don't use" on this device, for this account (hush:noUse:<username>):
// the device-removed summary names it in a red box and the chat itself says so. Nothing is tried again and no button asks.
//
// A call answered "sign in first" (the connection came back but its sign-in was refused) is waited out: the owner step signs in
// again and goes round. It never marks a chat for the sign-in alone. U2 is in removal-nouse-signin-b.test.js, U3 in
// removal-nouse-signin-c.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { world, makeChannel, linkOf } from './channel-history-kit.js';
import { level, newKeys, draw, has, count, marks, BOX, MANAGE, oldOf, realCapsBuild, run, until, drop, refill, failSignIn } from './removal-kit.js';

const chan = (cid, more = {}) => ({ cid, owner: true, admins: ['bob'], members: ['alice', 'bob'], ...more });
// every sign-in the page asks the adapter for, and how it ended; `before(n)` runs right before the n-th one
const watchProve = (A, before = () => {}) => { const pv = A.S.db.prove, log = []; let n = 0; A.S.db.prove = (idn) => { if (!idn) return pv(idn); before(++n); return pv(idn).then((r) => { log.push('ok'); return r; }, (e) => { log.push(e.code); throw e; }); }; return log; };

test('U1 a reconnect in the middle of the owner step whose sign-in is refused (the address\'s failed sign-ins are used up): the step signs in again, is refused once more, waits, signs in, and goes through. No mark; what the removed device held opens nothing; the sheet shows the progress line all the time and never a button', async () => {
  await world({ limits: { proveFailsPer10Min: 1 } }, async (w) => {
    const { cid } = w; const A = await w.page('alice', { owner: true, build: realCapsBuild() }); await w.page('bob'); const Z = await w.page('zed');
    await makeChannel(A, cid, ['alice', 'bob'], ['bob']); await linkOf(A, cid); const old = await oldOf(A, cid);
    await newKeys(A);
    const so = A.S.db.setOwner, codes = []; let done = false;
    A.S.db.setOwner = async (c, cap) => {
      if (!done) { done = true;
        codes.push('zed:' + await failSignIn(Z));                       // someone at the same address fails one sign-in (the limit here is 1; live: 10 in 10 minutes)
        drop(w, 'alice'); await until(() => !A.S.db.online); await until(() => A.S.db.online, 20000);   // this page's connection drops and comes back
        codes.push('alice came back: ' + ((A.S.db.identityError || {}).code || 'ok') + ', signed in: ' + !!A.S.db.proven);
      }
      try { const r = await so(c, cap); codes.push('setOwner:ok'); return r; } catch (e) { codes.push('setOwner:' + e.code); throw e; }
    };
    const proofs = watchProve(A, (n) => { if (n === 2) refill(w); });      // the page's first sign-in is still refused; before its second the address's count has run off (live: a minute)
    const r = await run(A, [chan(cid)]), s = draw(A, r.rec);
    assert.ok(codes.includes('alice came back: ratelimit, signed in: false'), 'the connection came back unproven');
    assert.ok(codes.includes('setOwner:unauth'), 'the owner key call met the unproven connection');
    assert.deepEqual(proofs, ['ratelimit', 'ok'], 'refused once more, then signed in');
    assert.ok(r.through, 'the removal went on to its next stage'); assert.ok(!r.rec.rotated[0].own && r.rec.rotated[0].ok); assert.deepEqual(marks(A), []);
    assert.ok(!s.box.some((x) => BOX.test(x)) && !has(s, MANAGE)); assert.equal(count(s), '1 chat is secured.');
    assert.deepEqual([level(w, cid, old.own), level(w, cid, old.adm)], [null, null], 'what the removed device held opens nothing');
    assert.deepEqual(r.steps, ['Securing your chats (1 of 1)', 'Moving your settings']); assert.equal(r.asks.length, 0, 'no button was shown');
  });
});
