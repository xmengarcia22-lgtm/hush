// The page's own login, recovery and adapter code, lifted out of app/ and bound to a stand-in page, for the tests
// that drive it against a real server (login.test.js and others).
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { appSource } from './helpers.js';

const html = appSource();

// The page's source between two landmarks (the second one excluded).
function lift(from, to) {
  const a = html.indexOf(from);
  assert.ok(a > 0, `the page's files contain ${JSON.stringify(from)}`);
  const b = html.indexOf(to, a + from.length);
  assert.ok(b > a, `the page's files contain ${JSON.stringify(to)} after ${JSON.stringify(from)}`);
  return html.slice(a, b);
}
const line = (from) => lift(from, '\n');

const SRC = [
  line('const b64=buf=>'), line('const unb64=s=>'), line('const b64u=a=>'), line('const unb64u=s=>'),
  line('const dispOk='), line('const validHandle='),
  line('const EC={name:'),
  lift('async function newIdentity(){', 'const jwk=xy=>'),
  lift('function normPhone(s){', 'async function phoneHash('),
  lift('function bundleOf(id){', 'async function linkKey('),
  lift('async function proofFor(id){', 'async function bindDevice(id){'),
  lift('/* ===== HUSH RECOVERY BEGIN ===== */', '/* ===== HUSH RECOVERY END ===== */'),
  lift('/* ===== HUSH AUTH BEGIN ===== */', '/* ===== HUSH AUTH END ===== */'),
].join('\n');
const EXPORTS = 'RWORDS,newIdentity,proofFor,bundleOf,idFromBundle,normLogin,isHandleLogin,saveLoginBoxes,loginsOf,pwProblem,pwStrength,pwStrongEnough,loginSecrets,loginTag,saveLoginBox,openLoginBox,tryLogin,boxLoc,findBox,dropLoginBox,rememberLogin,reconcileLoginHint,loginInfo,healLogin,newRecoveryWords,readWords,recSecrets,saveRecovery,confirmRecovery,openRecovery,hasRecovery,recOld';
const build = new Function('S', 'ls', 'enc', 'dec', 'saveContacts', 'renderBanner', 'P', 'openSetupLogin', `${SRC}\nreturn {${EXPORTS}};`);

const BEGIN = '/* ===== HUSH ADAPTER BEGIN ===== */';
const END = '/* ===== HUSH ADAPTER END ===== */';
const createHushAdapter = new Function(lift(BEGIN, END) + '\nreturn createHushAdapter;')();

// One page's worth of state: the adapter, a localStorage stand-in, and the page's auth code bound to them.
export function page(url) {
  const m = new Map();
  const ls = {
    get: (k, d) => (m.has(k) ? JSON.parse(JSON.stringify(m.get(k))) : d),
    set: (k, v) => { if (v === null || v === undefined) m.delete(k); else m.set(k, JSON.parse(JSON.stringify(v))); },
    clear: () => m.clear(),
  };
  const db = createHushAdapter(url, { WebSocket, onStatus: () => {} });
  const S = { db, me: null, prefs: null, contactsReady: false, ids: [] };
  const calls = { setup: [] };
  const auth = build(S, ls, new TextEncoder(), new TextDecoder(), () => {}, () => {}, () => S.prefs || (S.prefs = {}), (mode) => calls.setup.push(mode));
  return { db, ls, S, auth, calls, close: () => db.close() };
}

// The page's log-out: the device forgets everything about the account and the connection signs out.
export async function logOut(pg) {
  pg.ls.clear();
  pg.S.ids = [];
  pg.S.me = null;
  await pg.db.prove(null);
}

export const sameKeys = (a, b) => a.sig.x === b.sig.x && a.sig.y === b.sig.y && a.ecdh.x === b.ecdh.x && a.ecdh.y === b.ecdh.y && a.sigPriv.d === b.sigPriv.d && a.ecdhPriv.d === b.ecdhPriv.d;

// The page's sign-up, minus the screens: claim the username, write the profile with the display name, and lock the
// keys in the username's password box (release 20: the username is the only login).
export async function signUpWith(pg, pw, handle, name) {
  const keys = await pg.auth.newIdentity();
  const id = { handle, disp: handle, name, kv: 1, ...keys };
  await pg.db.prove(await pg.auth.proofFor(id));
  await pg.db.doc('directory/' + handle).set({ handle, disp: handle, name, ecdh: keys.ecdh, sig: keys.sig, kv: 1, ts: Date.now() });
  const all = await pg.auth.saveLoginBoxes(id, [handle], pw);
  pg.auth.rememberLogin(handle, { login: handle, loc: all[handle], all }, true);
  pg.S.ids = [id];
  pg.S.me = id;
  return { id, all };
}
