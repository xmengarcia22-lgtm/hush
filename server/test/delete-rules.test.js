// Who may delete a message for everyone: the page's rule (mayDeleteForAll), lifted out of app/ui.js. The server enforces
// the author's token and admin rank; that an admin may not delete the owner's messages is the page's rule only, because
// the server never learns who wrote what (SPEC.md 5.7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
const line = src.match(/^const mayDeleteForAll=.*;$/m);
assert.ok(line, 'mayDeleteForAll is one line in app/ui.js');
const may = new Function(line[0] + '\nreturn mayDeleteForAll;')();
const ask = (t, who, author) => may({ t, mine: who === author, admin: who !== 'member', owner: who === 'owner', byOwner: author === 'owner' });

test('an admin can\'t delete the owner\'s message; the owner can delete anyone\'s', () => {
  assert.equal(ask('group', 'admin', 'owner'), false, 'admin on the owner\'s message');
  assert.equal(ask('channel', 'admin', 'owner'), false, 'in a channel too');
  assert.equal(ask('group', 'admin', 'member'), true, 'admin on a member\'s message');
  assert.equal(ask('group', 'owner', 'admin'), true, 'owner on an admin\'s message');
  assert.equal(ask('group', 'owner', 'member'), true);
  assert.equal(ask('group', 'admin', 'admin'), true, 'their own');
});

test('members and DMs: only your own', () => {
  assert.equal(ask('group', 'member', 'member'), true, 'their own');
  assert.equal(may({ t: 'group', mine: false, admin: false, owner: false, byOwner: false }), false, 'another member\'s');
  assert.equal(may({ t: 'dm', mine: false, admin: true, owner: true, byOwner: false }), false, 'never the other person\'s in a DM');
  assert.equal(may({ t: 'dm', mine: true, admin: false, owner: false, byOwner: false }), true);
});

test('the message menu and the admin wipe both decide with it', () => {
  assert.match(src, /mayDeleteForAll\(\{t,mine,admin,owner:isOwner\(c\),byOwner:!!c\.owner&&p\.from===c\.owner\}\)\?\[forAll\]:\[\]/, 'message menu');
  assert.match(src, /async function wipeChat\(c\)\{[^]*?!mayDeleteForAll\(\{t,mine:p\.from===S\.me\.handle,admin,owner,byOwner:!!c\.owner&&p\.from===c\.owner\}\)/, 'admin wipe skips what the rule refuses');
});
