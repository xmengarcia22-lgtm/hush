// Saved contacts after redesign step E: the Contacts tab and its screens are gone, and what an account once saved there
// has no effect any more: not on a name, not on the message-request step, not on whose profile or online state the
// server is asked for, and no screen shows or changes it. The saved list itself stays in the settings box untouched and
// is carried through every save, so a step back to the page before brings it all back.
// The page's own functions are cut out of app/ui.js and run as written (screen-kit.js); nothing is sent anywhere.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI, lift, build, tick } from './screen-kit.js';

const line = (start) => { const a = UI.indexOf('\n' + start); assert.ok(a > 0, 'app/ui.js holds a line that starts ' + JSON.stringify(start)); return UI.slice(a + 1, UI.indexOf('\n', a + 1)); };
// an account that saved two contacts before step E: one under a name of its own, one with only a phone number
const SAVED = [{ id: 'c1', name: 'Mum', phone: '+12125550123', handle: 'priya', ts: 1 }, { id: 'c2', name: 'Plumber', phone: '+12125550199', handle: null, ts: 2 }];
const state = () => ({ me: { handle: 'me' }, contacts: JSON.parse(JSON.stringify(SAVED)), cnames: new Map([['priya', 'Mum']]), dir: { priya: { name: 'Priya Nair' } }, convs: [], previews: new Map(), presence: {} });

test('a name: the profile’s, whatever the account once saved the person as', () => {
  const S = state(), { displayName } = build([line('const isGone='), line('const displayName=')].join('\n'), { S }, 'displayName');
  assert.equal(displayName('priya'), 'Priya Nair');
  assert.equal(displayName('nobody'), 'nobody', 'no profile loaded: the username');
  S.dir.priya.gone = true; assert.equal(displayName('priya'), 'Deleted account');
  assert.ok(!/cnames/.test(line('const displayName=')));
});

test('profiles: asked for the account itself and the people of its chats, not for a saved contact', () => {
  const S = state(); S.convs = [{ id: 'd1', type: 'dm', members: ['me', 'sam'] }];
  const { relevantHandles } = build(lift('function relevantHandles(){', '\nasync function loadDir('), { S, knownIn: (c) => c.members }, 'relevantHandles');
  assert.deepEqual(relevantHandles().sort(), ['me', 'sam']);
});

test('online state: asked for the people of the account’s chats, not for a saved contact', async () => {
  const S = state(), asked = []; S.convs = [{ id: 'd1', type: 'dm', members: ['me', 'sam'] }];
  S.db = { doc: (p) => ({ get: async () => { asked.push(p); return { exists: false }; } }) };
  const { refreshPresence } = build([line('const typeOf='), lift('async function refreshPresence(){', '\n/* ---------- profile search')].join('\n'),
    { S, knownIn: (c) => c.members, curConv: () => null, refreshHeader: () => {}, renderList: () => {} }, 'refreshPresence');
  await refreshPresence();
  assert.deepEqual(asked, ['presence/sam']);
});

test('the search’s hint "sends as a request" is for anyone the account has no chat with, a saved contact too', () => {
  const S = state(), { knownHandle } = build([line('const contactFor='), line('const knownHandle=')].join('\n'), { S, knownIn: (c) => c.members }, 'knownHandle');
  assert.equal(knownHandle('priya'), false);
  S.convs = [{ id: 'd1', type: 'dm', members: ['me', 'priya'] }]; assert.equal(knownHandle('priya'), true, 'a chat makes a person known');
});

test('the message-request step: a saved contact’s request is a request like any other', () => {
  const start = lift('\nfunction start(id){', '\n  // Your inbox is only readable');
  assert.ok(!/contactFor|S\.contacts\.|cnames/.test(start), 'start asks nothing about saved contacts');
  assert.ok(start.includes('if(isRequest(c)){if(!isDeclined(c))setTimeout(showRequestAlert,50)}else if(c.id!==S.chan||document.hidden)notifyNew(c)}});'), 'its alert comes up for a saved contact as well');
  assert.ok(start.includes('\n    if(S.contactsReady)list.forEach(c=>{if(c.last&&!c.last.svc)noteAccepted(c.id,[c.last])});\n'), 'and nothing accepts it for the account');
  // the only writers of "accepted" left: the person's own Accept, and the other side's reply or accept note to a request this account sent
  assert.deepEqual(UI.match(/setDmInfo\([^,()]+,\{req:'ok'\}\)/g), ["setDmInfo(cid,{req:'ok'})", "setDmInfo(c.id,{req:'ok'})"]);
  assert.ok(lift('\nasync function answerRequest(c,ok){', '\nfunction requestBar(').includes("if(ok){setDmInfo(c.id,{req:'ok'});"));
  assert.ok(lift('\nfunction noteAccepted(cid,posts){', '\n}').includes("const i=dmInfo(cid);if(!i||i.req!=='out')return;"));
});

test('no screen shows a saved contact or changes the saved list', () => {
  for (const n of ['renderContacts', 'openContact', 'openEditContact', 'importContacts', 'matchContacts'])
    assert.ok(!new RegExp('\\b' + n + '\\b').test(UI), n + ' is gone from app/ui.js');
  const profile = lift('\nasync function openProfile(h){', '\nfunction openSettings(){');
  assert.ok(!/contactFor|Saved in your contacts|Edit contact/.test(profile), 'a person’s profile says nothing of a saved contact');
  for (const w of ['Add contact', 'Edit contact', 'Delete contact', 'Import from phone', 'No contacts found', 'Loading contacts', 'Search contacts', 'Contact deleted'])
    assert.ok(!UI.includes(w), JSON.stringify(w) + ' is gone');
  // the list in memory is set when the settings are read and emptied when an account leaves the page; nothing else writes it
  assert.deepEqual([...new Set(UI.match(/S\.contacts=[^;]*;/g))].sort(), ['S.contacts=[];', "S.contacts=arr.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string');"]);
  assert.ok(!/S\.contacts\.(push|splice|pop|shift|unshift|sort|reverse|length\s*=)/.test(UI));
});

test('the saved list is carried through a save unchanged', async () => {
  const S = Object.assign(state(), { contactsReady: true, vaultOk: true, prefs: { pinned: ['d1'], muted: {}, archived: [] }, pins: {}, verified: {} }), plain = [], wrote = [];
  S.db = { doc: (p) => ({ set: async (v) => { wrote.push(p); } }) };
  const env = { S, P: () => S.prefs, rebuildNames: () => {}, syncNames: () => {}, renderCalls: () => {}, renderList: () => {}, syncLogin: async () => null, withAll: (a) => a, toastErr: (m) => { throw new Error(m); },
    crypto: { getRandomValues: (a) => a, subtle: { encrypt: async (alg, key, data) => { plain.push(JSON.parse(new TextDecoder().decode(data))); return new Uint8Array(1); } } },
    enc: new TextEncoder(), b64: () => '', vaultKey: async () => 'key', vaultPath: async () => 'box' };
  const { saveContacts } = build(lift('let vaultQ=Promise.resolve();', '\n/* The account\'s password-box addresses'), env, 'saveContacts');
  S.prefs.blocked = ['sam'];                      // any change of the settings: a block, a pin, a cleared chat
  await saveContacts(); await tick();
  assert.deepEqual(wrote, ['box']);
  assert.deepEqual(plain[0].contacts, SAVED, 'every saved contact, every field, in its order');
  assert.deepEqual([plain[0].v, plain[0].prefs.blocked], [3, ['sam']]);
  assert.match(UI, /\n  S\.contacts=arr\.filter\(c=>c&&typeof c\.id==='string'&&typeof c\.name==='string'\);/, 'and read back as before');
});
