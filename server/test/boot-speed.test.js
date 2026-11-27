// Two boot speedups (release 77): the socket opens before the lock gate and the store, since the hello carries nothing of
// the account (app/ui.js boot, app/adapter.js hello), and the inbox notes open all at once instead of one after the other
// (watchInbox). Nothing else in the boot moves: the stretch the call tests pin is byte for byte what it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ROOT = new URL('../../', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const ui = read('app/ui.js'), ad = read('app/adapter.js');
const lift = (from, to) => { const a = ui.indexOf(from), b = ui.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} … ${to} in app/ui.js`); return ui.slice(a, b); };
const liftAd = (from, to) => { const a = ad.indexOf(from), b = ad.indexOf(to, a); assert.ok(a > 0 && b > a, `${from} … ${to} in app/adapter.js`); return ad.slice(a, b); };

test('the socket goes out right after the pushed-call question, before the gate and the store; the boot awaits it where it used to open it', () => {
  const boot = lift('\n(async()=>{\n', '\n})();');
  const at = (s) => { const k = boot.indexOf(s); assert.ok(k > 0, s); return k; };
  assert.ok(at('S.pushCall=natOk()') < at('const dbP=connectServer();'), 'after S.pushCall is known: the online mark on a pushed call\'s diag line needs it');
  assert.match(boot, /\n  if\(S\.pushCall\)\{document\.documentElement\.classList\.add\('call-mode'\)[^\n]*\n  const dbP=connectServer\(\);[^\n]*\n  const plan=lockPlan\(lockCfg\(\),!!S\.pushCall\);/, 'the line before the gate');
  assert.match(boot, /\n  S\.ids=ls\.get\('hush:ids',\[\]\);\n(?:  (?:const active=|if\(id&&!S\.pushCall\)\{S\.me=id;renderList\(\)\})[^\n]*\n){2}  renderBanner\(\);\n  S\.db=await dbP;\n  renderBanner\(\);\n/, 'awaited where the socket used to be opened, after the cached list\'s early draw; the banner before it still says Connecting');
  assert.equal(boot.match(/connectServer\(\)/g).length, 1, 'opened once');
  assert.doesNotMatch(lift("const plan=lockPlan(lockCfg(),!!S.pushCall);", 'S.ids=ls.get'), /connectServer|dbP|renderList|splashOff/, 'the stretch the call tests pin is untouched');
});

test('the hello carries the protocol version only; a proof goes out only once the page has set an identity, which start() does after the gate', () => {
  assert.match(ad, /rawCall\('hello',\{v:1\}\)\.then\(async r=>\{/);
  assert.match(ad, /let identity=null,proven=null/);
  assert.match(ad, /if\(identity\)await runProof\(\);if\(sock!==ws\)return;/, 'the proof, when there is an identity, before anything else');
  const cs = liftAd('async function connectServer(){', '\n}');
  assert.doesNotMatch(cs, /prove\(|identity|pushSet|alertToken/, 'connectServer sets no identity and sends no push address');
  assert.match(lift('function start(id){', '\n}'), /bindDevice\(id\)/, 'the identity is set by start, after the store is open');
});

test('every connection callback is safe before the store is open and before an account is active', () => {
  const cs = liftAd('async function connectServer(){', '\n}');
  assert.match(cs, /onBadges:b=>\{S\.badges=b\|\|\{\};if\(!S\.me\)return;/);
  assert.match(cs, /caps:cid=>S\.me\?capsFor\(cid\):Promise\.resolve\(null\)/);
  assert.match(cs, /onKv:kv=>\{if\(S\.me&&/);
  // The two options of the paced start (release 111), by their text. rank (listPlace, since the review of the queue-order fix: the
  // list as drawn, pace-page-order.test.js) ranks S.convs's rows only with an account, reads S.prefs itself for the pins and the
  // archive (hiddenConv, which it calls for each row, may make S.prefs through P(); by then loadContacts has: S.convs is empty until
  // watchInbox starts after it), and then asks listRank (app/ui.js) for the kept list's order; first reads two plain fields of S. Neither reads the store here, and the
  // adapter guards both besides (adapter-pace-fix.test.js: one that throws is "no place" or "not first").
  assert.match(cs, /rank:listPlace,/, 'rank: the list as drawn');
  assert.match(cs, /const pr=S\.prefs\|\|\{\},pins=pr\.pinned\|\|\[\],archived=pr\.archived\|\|\[\];/, 'the pins and the archive read from S.prefs itself, with empty ones when there is none');
  assert.match(cs, /const rows=S\.me\?S\.convs\.filter\(/, 'rows only with an account');
  assert.match(cs, /return k!==undefined\?k:shown\.all\.has\(cid\)\?-1:listRank\(cid\)\};/, 'then the kept list\'s order for a chat not listed yet');
  assert.match(cs, /first:cid=>cid===S\.wantOpen\|\|!!\(S\.pushCall&&S\.pushCall\.cid===cid\),/, 'first: the row tapped, or the pushed call\'s chat');
  assert.match(lift('function listRank(cid){', '\n'), /^function listRank\(cid\)\{const h=S\.me&&S\.me\.handle;if\(!h\|\|S\.convsLoaded\)return -1;/, 'no account, or the live list whole: no place, before the kept list is read');
  assert.match(ui, /\nconst S=\{[^\n]*,convs:\[\],/, 'S.convs is a list from the first moment');
  assert.match(lift('async function keysMovedOn(){', '\nasync function signedOutHere('), /if\(movedOnBusy\|\|!S\.db\|\|!S\.me\|\|S\.rekeying\)return;/, 'a refusal or a close code before an account: nothing');
  assert.match(lift('function reloadIfIdle(){', '\n}'), /if\(!S\.stale\|\|!S\.me\|\|S\.pushCall\)return;/, 'a release found while the gate stands reloads nothing');
  assert.match(lift('const pushMark=', '\n'), /if\(S\.pushCall\|\|/, 'the online mark only on a pushed call\'s line');
  assert.match(lift('function renderBanner(){', '\n  else if(!S.db.online)'), /if\(!S\.db\)b\.append\(el\('div','banner',SRV_ERR\|\|'Connecting to Hush/, 'until S.db is assigned the banner says Connecting, whatever the socket has reached');
});

test('inbox notes open all at once; the staleness check comes once, before any bookkeeping; the rules after it are as they were', async () => {
  const w = lift("const un=S.db.collection('inbox/'+h+'/c')", '\n  // Watch one chat a pointer names.');
  const open = w.indexOf('const opened=new Map(await Promise.all('), stale = w.indexOf('if(run!==runs)return;'), set = w.indexOf('ptrs.set(d.id,p)');
  assert.ok(open > 0 && open < stale && stale < set, 'open, then the staleness check once, then the bookkeeping');
  assert.equal(w.match(/run!==runs/g).length, 1);
  assert.equal(w.match(/await /g).length, 7, 'the only awaits of the pass: Promise.all, openPointer, noteOk, (release 108) the read of my own profile when a note from a new person is to be judged, (release 109b) recheck and its one profile read, for a week-old note that failed with no keys held, and (release 111) a note\'s opening taken over from a pass cut short');
  assert.ok(w.indexOf('const recheck=') < open, 'recheck is called from the open line only, so its read comes before the staleness check too');
  assert.ok(w.indexOf('loadDir([h],true)') > open && w.indexOf('loadDir([h],true)') < stale, 'that read comes before the staleness check too, so the check still covers every wait of the pass');
  assert.match(w, /if\(p===undefined\)\{p=opened\.get\(d\.id\);ptrs\.set\(d\.id,p\);\n\s*if\(p===null\)\{if\(!unsure\.has\(d\.id\)&&canDrop\(\)&&\(d\.data\(\)\.ts\|\|0\)<old\)delNote\(d\.id\);/, 'the week-old unreadable note rule (release 111: deleted once, delNote)');
  assert.ok(w.includes(",old=Date.now()-7*864e5,canDrop=()=>S.contactsReady&&S.vaultOk!==false&&!S.rekeying&&!(ls.get('hush:rekey:'+h,null)||{}).stage&&S.dir[h]&&(S.dir[h].kv||1)===(S.me.kv||1);"), 'its conditions, taken once at the top of the pass (release 109b round 2: recheck reads only when they hold)');
  assert.match(w, /const x=d\.data\(\),k=kept\.get\(p\.cid\),rank=n=>\(n\.ts\|\|0\)\*2\+\(n\.own===1\?1:0\),lose=k&&k\.id!==d\.id&&\(rank\(k\.x\)>=rank\(x\)\?d\.id:k\.id\);/, 'the duplicate note rule');
  // the open line, run: a note already known is not opened again; one that fails to open or to check is null; all start before any finishes
  // (release 111: the line is three, up to its comment, and keeps each opening in `opens` until a pass files the note)
  const line = w.slice(open, w.indexOf('// every new note at once', open));
  const log = [];
  const openPointer = async (d) => { log.push('start ' + d.id); await new Promise((r) => setTimeout(r, 3)); log.push('end ' + d.id); if (d.id === 'c') throw new Error('not mine'); return { cid: d.id.toUpperCase() }; };
  const noteOk = async (p) => p.cid !== 'D';
  const docs = ['a', 'b', 'c', 'd'].map((id) => ({ id, data: () => ({ id }) }));
  const opened = await new Function('s', 'ptrs', 'openPointer', 'noteOk', 'recheck', 'opens', 'unsure', 'return (async()=>{' + line + '\nreturn opened})()')({ docs }, new Map([['a', { cid: 'A' }]]), openPointer, noteOk, async () => false, new Map(), new Set());
  assert.deepEqual([...opened], [['b', { cid: 'B' }], ['c', null], ['d', null]]);
  assert.deepEqual(log.slice(0, 3), ['start b', 'start c', 'start d'], 'every open starts before any ends');
});
