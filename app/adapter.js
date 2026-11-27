/* Hush: talking to the server. One of the page's script files (they run in order, config, crypto, adapter, ui, and
   share one global scope). The WebSocket adapter with the Firestore-shaped API the rest of the page uses, the
   page's connection setup, and anonymous POST /drop. The adapter block between the HUSH ADAPTER markers has no page
   dependencies, so the server's tests lift it out and run it against a real server. */
/* ===== HUSH ADAPTER BEGIN ===== */
/* ---------- server adapter: the same small database API the app always used, now over one WebSocket ----------
   Paths, documents and queries are exactly what the app sends. Live subscriptions are re-established on every
   reconnect. A write you make shows up in your own live views at once (hasPendingWrites) and settles when the
   server confirms it. Reads and writes made while offline wait a little for the connection, then fail with
   code "offline"; subscriptions simply wait. This block has no page dependencies so it can be tested on its own. */
function createHushAdapter(url,opts){
  opts=opts||{};
  const WS=opts.WebSocket||(typeof WebSocket!=='undefined'?WebSocket:null);
  const offlineWaitMs=opts.offlineWaitMs==null?8000:opts.offlineWaitMs,pingMs=opts.pingMs||25000,callTimeoutMs=opts.callTimeoutMs||30000;
  const onStatus=opts.onStatus||(()=>{});
  const clone=v=>v==null?null:JSON.parse(JSON.stringify(v));
  const mkErr=(code,msg)=>Object.assign(new Error(msg||code),{code});
  const isPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  const ALNUM='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const genId=()=>{const b=new Uint8Array(12);crypto.getRandomValues(b);let s='';for(let i=0;i<12;i++)s+=ALNUM[b[i]%ALNUM.length];return s};
  const splitPath=p=>{const k=p.lastIndexOf('/');return {parent:p.slice(0,k),id:p.slice(k+1)}};
  // the same merge and matching rules the server applies, so local pending views agree with it
  const mergePatch=(t,p)=>{if(!isPlain(p))return p;const o=isPlain(t)?Object.assign({},t):{};for(const [k,v] of Object.entries(p)){if(v===null)delete o[k];else if(isPlain(v))o[k]=mergePatch(o[k],v);else o[k]=v}return o};
  const cmp=(a,b)=>(typeof a==='number'&&typeof b==='number')||(typeof a==='string'&&typeof b==='string')?(a<b?-1:a>b?1:0):NaN;
  const matches=(d,w)=>{for(const [f,op,v] of w||[]){const x=d?d[f]:undefined;if(x==null)return false;
    if(op==='=='){if(x!==v)return false;continue}const c=cmp(x,v);if(Number.isNaN(c))return false;
    if((op==='<'&&!(c<0))||(op==='<='&&!(c<=0))||(op==='>'&&!(c>0))||(op==='>='&&!(c>=0)))return false}return true};
  const orderAndLimit=(rows,o,l)=>{const out=rows.slice();
    if(o){const [f,dir]=o,sg=dir==='desc'?-1:1;out.sort((a,b)=>{const x=a.d[f],y=b.d[f];if(x===undefined&&y===undefined)return a.id<b.id?-1:a.id>b.id?1:0;if(x===undefined)return -sg;if(y===undefined)return sg;const c=cmp(x,y);return (Number.isNaN(c)?0:c)*sg})}
    else out.sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);return l?out.slice(0,l):out};
  // ---- transport ----
  let ws=null,online=false,nextI=0,nextS=0,backoff=500,closed=false,pingT=null,offlineT=null,reconnectT=null,clockOffset=0,fatal='',readyRes;
  let identity=null,proven=null,proofP=null,nonce=null,nonceAt=0,staleRetry=false;const proofWaiters=[];
  // The server's sign-in challenge lasts two minutes. A connection that sat idle longer (a new device waiting for approval, a login screen
  // left open) is replaced by a fresh one before signing in, and if the server still calls the challenge expired, once more.
  const NONCE_FRESH_MS=opts.nonceFreshMs||90e3;
  const calls=new Map(),subs=new Map(),waiting=[];let era=0; // era: one account's time on the adapter (dropSubs)
  const opened=new Map(),opening=new Map(); // chats this connection holds a level for, and opens in progress
  const out=new Set(); // chats where the server refused a key that was the right one: this account was removed from the chat (chat.open's own sentence for a blocked member). An old or wrong key is refused `denied` too, so the page asks here which it was (chatOut). Every attempt at a chat writes it: in only when every key was refused and that sentence was heard, out at any other end (an open, a server error or any other answer, no key to try). The one exception is an attempt that ends too busy or without a connection: it hands the page nothing (no copy, no ended watch), so it leaves this as it was. Emptied with every connection's end
  // ---- the pace (SPEC.md 9.4) ----
  // A connection may send fpm frames at once and fpm/60 a second after that, and 120 queries (query, mget) at once and 2 a second;
  // the server refuses the rest, and a long chat list asks for far more at its start. So the page keeps its own count of both, a
  // little under the server's, on a clock that never steps, and the start's frames for chats nobody is looking at wait in `lane`
  // while the count is under a reserve kept for what the user does: the record read for a chat's keys, chat.open, the record watch,
  // the call watch, the unread count (also under the query count), chat.base. Everything else, and everything but the count for a chat
  // on screen or acted on (`urgent`), does not wait there: it goes as soon as the connection is up and a sign-in in progress is done.
  // The lane is this connection's: it is emptied when the connection ends (rejectCalls).
  let fpm=300,tokens=0,tokAt=0,qtok=0,hold=0,laneT=null,bgCid=null,seen=0;const lane=[],urgent=new Set(),ranks=new Map(),counted=new Set(),went=new Map(),countAt=new Map();let turned=false;   // went: cid → {n: how many of the chat's record frames, call watches and first count the lane sent on this connection; at: when the last went}; countAt: cid → when the lane last sent the chat's count; turned: the last count the lane sent was a turn ahead of the bulk (class 3 below)
  const refill=()=>{const now=performance.now(),d=Math.max(0,now-tokAt);tokens=Math.min(Math.floor(fpm*0.9),tokens+d*fpm/60000);qtok=Math.min(108,qtok+d/500);tokAt=now};
  const asBulk=(cid,fn)=>{bgCid=cid;try{return fn()}finally{bgCid=null}}; // the record read `fn` makes at once is the start's own, not something the user asked for
  const isCount=(op,f)=>op==='query'&&!f.o&&/^channels\/[^/]+\/posts$/.test(f.p||''); // an unread count: the one query of a chat's posts with no order
  const LATER=Symbol('later'),tagged=(f,later)=>{if(later)f[LATER]=later;return f}; // the page's own work it marks `later` (a doc's get, set or delete with {later:tag}, or {later:fn}: fn() gives the tag, or nothing for a frame that does not wait, asked when the frame reaches the lane): it rides on the fields and is never sent (JSON leaves a symbol out)
  const ask=(fn,cid,no)=>{try{return fn?fn(cid):no}catch{return no}}; // the page's own rank and first, each asked inside a try: one that throws is "no place" (-1) or "not first", not a queue that stops or a frame refused
  function laneOf(op,f){const p=f.p||'',q=isCount(op,f);let cid=f.cid,k=0,first=false; // k: 1 call watches, 2 a chat's record (read, open, watch), 3 unread counts, 4 chat.base, 5 the page's own work marked later; q: a count, also held under the query count
    let tag=f[LATER];if(typeof tag==='function')tag=ask(tag,null,null);if(tag)return {cid:'~'+tag,k:5,q:false,first:false};   // in the order it was asked, whatever its tag; asked here, so a frame held while offline or during a sign-in goes by what the page says when it arrives
    if(op==='chat.open')k=2;else if(op==='chat.base')k=4;
    else if(op==='get'&&bgCid&&p==='channels/'+bgCid){cid=bgCid;k=2}
    else if(op==='sub'&&p==='channels'&&f.ids&&f.ids.length===1){cid=f.ids[0];k=2}
    else if(op==='sub'&&/^channels\/[^/]+\/call$/.test(p)){cid=chatOf(p);k=1}
    else if(q){cid=chatOf(p);k=3;first=!counted.has(cid);counted.add(cid)}   // first: the chat's first count on this connection, at a start and after every reconnect, which goes with its row (pump). A later one was asked because the chat moved: the page asks a chat's count one at a time, and again only when its newest message or its read mark changed, after one that failed for a passing reason, or after a change of the blocked list (computeUnread)
    if(!k||!cid||(!q&&(urgent.has(cid)||ask(opts.first,cid,false))))return null;if(!ranks.has(cid))ranks.set(cid,seen++);return {cid,k,q,first}}   // a count always takes its turn: a busy chat that was opened once would otherwise use the query allowance up and keep every other chat's count waiting
  function hurry(cid){if(urgent.has(cid))return;urgent.add(cid);for(let k=0;k<lane.length;)if(lane[k].cid===cid&&!lane[k].q)lane.splice(k,1)[0].go();else k++} // a chat the user is in or acts on: what waited for it goes now, but for its count
  // Every 100 ms, down to the reserve, what waits at that moment goes in this order. The list's order is opts.rank (the page's: the chat
  // list as it draws it, connectServer below); a chat it gives no place (-1, or a rank that throws) goes after every chat it does, in
  // the order the chats were begun, and with no place anywhere the order is the one before the list's first rows had their own
  // (release 111's queue-order fix). "The first 20 rows" are the chats the rank places 0 to 19:
  //  1. call watches; but while a frame of the list's first 20 rows waits, a call watch asked for the first time (no first copy yet:
  //     not `inited`) for a chat below them goes right after those rows' frames, before 3. One that was live before, put back after a
  //     reconnect or an eviction, never waits for them;
  //  2. the first 20 rows' frames, row by row, the row's call watch before its other frames: the record frames (read, open, record
  //     watch), the call watch asked for the first time and the first unread count on this connection. Not while any call watch is due on
  //     the connection (`due`, below: a chat being opened whose call watch is not handed over yet, after a reconnect or an eviction, and
  //     at a start the pushed call's chat or a call watch asked before its chat's open is back): until every one is handed over, those
  //     rows' frames keep their places in 4 and 5 and every call watch is in 1, as before the fix;
  //  3. a later unread count of a chat that has a place, once 5 s have passed since the lane last sent that chat's count, in the lane's
  //     order (the order they waited, but one that came due later goes behind those due before it): it was asked because the chat
  //     moved, so the badge follows a new message ahead of the start's bulk, and a busy chat takes one such turn in 5 s, not one at
  //     every message. Such a turn does not follow another while the query count is down to its last count's worth (under 25) and a
  //     first count of a chat with a place (in 2 or 5) or any count of a chat with no place (in 6) waits: then the two take the query
  //     count in turn, about one a second each, so busy chats, whoever writes in them, cannot keep the rows below from their first
  //     counts, nor the chats with no row (archived chats, requests) from theirs;
  //  4. the record frames of the chats that have a call watch, in the list's order;
  //  5. the other chats' record frames and the first unread count of each chat that has a place, together in the list's order: a chat's
  //     count goes with its own record frames (for a chat that has a call watch, whose record frames are in 4, at its row here), and a
  //     chat's next frame before a later chat's first;
  //  6. every other count (a chat with no place, a later count inside its 5 s) in the order they waited; chat.base;
  //  7. the page's own work it marks `later` (a doc's get, set or delete with {later: tag}, or {later: fn} asked when the frame reaches the
  //     lane: ui.js deletes the notes of its mailbox and saves the vault while it files people from notes so), in the order it was asked,
  //     after the frames of classes 1 to 6 that wait at that moment. sendNow(tag) sends what of a tag waits at once, whatever the count
  //     and a wait the server asked for: the user did something that must not wait behind it.
  // The order is among the frames that wait together: a chat's next frame is not made until the one before it is answered, so at a
  // first start every chat's record read goes before any chat.open. Order alone cannot give the first rows the start's burst: their
  // later frames do not exist yet when it is spent. So room is kept for them: a frame of any other row that is not a lead (below) goes
  // only while the count is above `keep` and the room the first rows still need, five frames a row (read, open, record watch, call
  // watch, first count) less what of the row the lane sent on this connection (`went`), kept for 3 s after the row's last frame went
  // and then let go (a group has no call watch, a chat with nothing unread asks no count). A row keeps room only once the lane has sent
  // a frame of it, and a row's own frames sort first, so the room is there from the turn its first frame goes. Never the whole count:
  // when it is full the others go, whatever the room. The room is above the reserve and above `keep`, never in them.
  // The lane never sends at or under the reserve. So what does not wait, sent at the refill rate or faster, holds the lane for as long
  // as it lasts, and nothing of the lane's is then above the allowance: no frame of the user's own is refused for the lane's sake.
  // (For a while the lane had a turn of its own there, one frame a second. Whenever what does not wait had already taken the whole
  // allowance that frame was above it, so the server refused a frame for it, the user's own message as readily as the lane's: taken out again.)
  function pump(){laneT=null;if(!lane.length)return;refill();if(hold&&tokAt>=hold){tokens=Math.min(tokens,fpm*0.2+(tokAt-hold)*fpm/60000);hold=0}   // a wait the server asked for is over: the count starts again from the reserve and what has come in since, never above what it holds. What came in during the wait is not sent as one batch: the address may still be short of server time, and the server reads a refused socket five times a second
    if(tokens>fpm*0.2&&!hold){const rings=new Set(),due=new Set(),had=new Set(),rk=new Map(),rank=cid=>{if(!rk.has(cid))rk.set(cid,ask(opts.rank,cid,-1));return rk.get(cid)},top=cid=>{const r=rank(cid);return r>=0&&r<20};
      for(const sub of subs.values())if(/\/call$/.test(sub.p)){const c=chatOf(sub.p);rings.add(c);if(sub.inited)had.add(c);if(sub.on!==ws&&opening.has(c))due.add(c)}   // due: a chat being opened now whose call watch is not handed over on this connection yet. Its call watch is still to come (after a reconnect a watch's frame is not made until its chat's open is back). had: a call watch that has had its first copy, on this connection or before
      const keep=Math.min(fpm*0.2+2*due.size,Math.floor(fpm*0.9)-1);   // so room is kept above the reserve, two frames (an open and a call watch) for each such chat. While the count is at or under it only call watches and those chats' own record frames (the read, the open, the record watch) go. Never the whole count: when it is full the others go on, whatever is still to come (an open that is never answered is `due` until its time is up)
      let ahead=false,firsts=false;for(const q of lane){q.top=(q.k<3||q.first)&&top(q.cid);if(q.top)ahead=!due.size}   // q.top: a frame of the list's first 20 rows (a record frame, a call watch, the first count). ahead: they go first, but not while a call watch is still to come (due): then the order of 1, 4 and 5 is the one before
      for(const q of lane){const r=rank(q.cid),c=q.k===1&&(had.has(q.cid)||!ahead)?0:q.top&&ahead?0.25:q.k===1?0.5:q.q?(r>=0&&q.first?2:r>=0&&tokAt-(countAt.has(q.cid)?countAt.get(q.cid):-1e9)>=5000?0.75:3):q.k===2&&rings.has(q.cid)?1:q.k;   // the class, 1 to 7 above
        q.c=c;if(q.q&&(c===2||c===0.25||(c===3&&r<0)))firsts=true;q.lead=q.k===1||(q.k===2&&!q.q&&due.has(q.cid));q.key=c===0.75||c===3||c===5?c*1e9:c*1e9+(r>=0?r:1e6+ranks.get(q.cid))+(c===0.25&&q.k>1?0.5:0)}   // the counts of classes 3 and 6, and class 7, in the order they waited (the sort keeps it): a busy chat's next count goes behind the others'
      let room=-1;const floor=()=>{if(room<0){room=0;for(const [cid,g] of went)if(tokAt-g.at<3000&&top(cid))room+=Math.max(0,5-g.n)}return Math.min(keep+room,Math.floor(fpm*0.9)-1)};   // keep and the room the first rows still need (above), worked out once a turn when a frame of another row is reached. While `ahead` the first rows' frames are sorted before it, so what of them could go this turn has gone and is in `went`; with a call watch due they are not, and the room is counted before some of them went: more than they need for that turn, never a frame more sent
      lane.sort((a,b)=>a.key-b.key);for(let i=0;i<lane.length&&tokens>fpm*0.2;){const q=lane[i];
        if((q.q&&qtok<24)||(q.c===0.75&&turned&&firsts&&qtok<25)||(!q.lead&&(tokens<=keep||(!q.top&&tokens<=floor()))))i++;else{lane.splice(i,1);if(q.k<3||q.first){const g=went.get(q.cid)||{n:0,at:0};g.n++;g.at=tokAt;went.set(q.cid,g)}if(q.q){countAt.set(q.cid,tokAt);turned=q.c===0.75}q.go()}}}
    if(lane.length)laneT=setTimeout(pump,100)}
  const api={flat:true,addr:url,online:false,proven:null,error:'',identityError:null,badges:{},now:()=>Date.now()+clockOffset};
  api.sendNow=tag=>{const cid='~'+tag;for(let k=0;k<lane.length;)if(lane[k].cid===cid)lane.splice(k,1)[0].go();else k++};   // class 7's frames of one tag, waiting in the lane: sent now
  api.ready=new Promise(r=>{readyRes=r});
  // The operator's badge list rides on the hello reply (SPEC.md 12.3); the page hears about a change through onBadges.
  const takeBadges=r=>{const nb=r&&r.badges&&typeof r.badges==='object'&&!Array.isArray(r.badges)?r.badges:{};if(JSON.stringify(nb)===JSON.stringify(api.badges))return;api.badges=nb;try{opts.onBadges&&opts.onBadges(nb)}catch{}};
  function connect(){if(closed)return;clearTimeout(reconnectT);reconnectT=null;let sock;try{sock=new WS(url)}catch(e){scheduleReconnect();return}ws=sock;
    sock.onopen=()=>{if(sock!==ws)return;rawCall('hello',{v:1}).then(async r=>{if(sock!==ws)return;nonce=r.nonce;nonceAt=Date.now();clockOffset=(typeof r.now==='number'?r.now:Date.now())-Date.now();backoff=500;takeBadges(r);
        fpm=r.limits&&Number.isFinite(r.limits.framesPerMin)&&r.limits.framesPerMin>=60?r.limits.framesPerMin:300;tokens=Math.floor(fpm*0.9)-1;qtok=108;hold=0;tokAt=performance.now();   // this connection's allowances (an older server names none: 300), the hello spent
        if(identity)await runProof();if(sock!==ws)return;   // sign in before anything else goes out
        setOnline(true);opened.clear();resendSubs();waiting.splice(0).forEach(f=>f());startPing();readyRes()},
      e=>{if(e&&e.code==='version'){fatal='This copy of Hush is out of date for the server. Reload the page.';api.error=fatal;closed=true}try{sock.close()}catch{}})};
    sock.onmessage=ev=>{if(sock!==ws)return;onMessage(ev)};
    sock.onerror=()=>{};
    sock.onclose=ev=>{if(sock!==ws)return;ws=null;const was=proven;onClose();if(opts.onClosed)try{opts.onClosed(ev&&ev.code,ev&&ev.reason,was)}catch{}}; // the code says why (4401: our keys are no longer the account's, SPEC.md 7.2; 4410: the account `was` signed in as was deleted)
  }
  function onMessage(ev){let f;try{f=JSON.parse(typeof ev.data==='string'?ev.data:String(ev.data))}catch{return}
    if(Number.isInteger(f.i)&&calls.has(f.i)){const c=calls.get(f.i);calls.delete(f.i);clearTimeout(c.timer);if(f.e==='ratelimit'&&f.retry>0){if(f.retry>=1000)hold=performance.now()+Math.min(f.retry,61000);else tokens=0}   // refused "slow down" with a wait. A second or more: the address is out of server time (that frame was not counted); a server that allows 60 frames a minute or fewer says as much for its frame allowance, and any server for a refused frame over about 850 KB (the byte allowance: that frame WAS counted). The lane waits as long as the server says, 61 s at most. Less: the frame allowance, or the byte allowance for a smaller frame: the count is emptied and the lane waits for the reserve again
      if(f.ok)c.resolve(f);else c.reject(Object.assign(mkErr(f.e,f.m),f.e==='pow'?{bits:f.bits,salt:f.salt}:{}));return}
    if(f.s!==undefined&&subs.has(f.s)){onPush(subs.get(f.s),f);return}
    if(f.t==='evict'&&typeof f.cid==='string')onEvict(f.cid)}
  function rejectCalls(){clearTimeout(laneT);laneT=null;urgent.clear();counted.clear();went.clear();countAt.clear();out.clear();for(const q of lane.splice(0))q.reject(mkErr('offline','Not connected to the Hush server'));
    for(const c of calls.values()){clearTimeout(c.timer);c.reject(mkErr('offline','Lost the connection to the Hush server'))}calls.clear()}
  function onClose(){setOnline(false);stopPing();proven=null;api.proven=null;opened.clear();tickets.clear();work=null;rejectCalls();
    for(const sub of subs.values())if(sub.pending.size){sub.pending.clear();emit(sub)}
    scheduleReconnect()}
  // Spread out over a few seconds: after a server restart every page would otherwise be back at the same moment.
  // Not when the user has just come back or opened a chat (present): that reconnect goes at once, one per time it was said.
  let eagerAt=0;
  api.present=()=>{if(!live()&&reconnectT)connect();else eagerAt=Date.now()};   // a reconnect is waiting: now; otherwise the one a close heard within 5 s starts
  // Only an attempt the adapter makes by itself lengthens the next wait: one the user asked for (at once here, or a waiting one brought forward) does not.
  function scheduleReconnect(){if(closed||reconnectT)return;const eager=Date.now()-eagerAt<5000;eagerAt=0;
    reconnectT=eager?setTimeout(connect,0):setTimeout(()=>{backoff=Math.min(backoff*2,30000);connect()},backoff+Math.random()*Math.max(backoff*0.3,4000))}
  function reconnectNow(){const s=ws;ws=null;if(s){try{s.close()}catch{}}setOnline(false);stopPing();proven=null;api.proven=null;opened.clear();tickets.clear();work=null;rejectCalls();clearTimeout(reconnectT);reconnectT=null;connect()}
  // ---- room keys (SPEC.md 5.2): before touching anything inside a chat, open it with the best key the app holds ----
  const chatOf=p=>{const m=/^channels\/([^/]+)/.exec(p||'');return m?m[1]:null};
  const inChat=(sub,cid)=>sub.p.startsWith('channels/'+cid+'/')||(sub.p==='channels'&&sub.ids&&sub.ids.includes(cid));
  const openFail=new Map(); // cid → why the last open failed: 'denied' (every key refused, or none to try), 'offline', 'ratelimit', or the server's other answer
  async function ensureOpen(cid,force){ // true once the connection holds a level for the chat
    if(!opts.caps)return false;let job=opening.get(cid);
    if(!job){const g=era;job=(async()=>{let caps=null,why='denied',gone=false;try{caps=await asBulk(cid,()=>opts.caps(cid))}catch(e){if(!online||(e&&e.code==='offline'))why='offline';else if(e&&(e.code==='ratelimit'||e.code==='timeout')){busy.add(cid);why='ratelimit'}}   // the page's caps failed with the code ratelimit or timeout (its record read for the keys refused or late, or anything else of its own that ends so): too busy just now, as a refused chat.open below, not "no key" (the watch would never be sent)
      if(g!==era){openFail.set(cid,'offline');return false}   // the account changed while its keys were worked out: they are not for this connection
      const list=[...new Set((Array.isArray(caps)?caps:[caps]).filter(Boolean))]; // one key, or several to try in order (a DM after an account key change, SPEC.md 12)
      if(!list.length){if(why==='denied')out.delete(cid);openFail.set(cid,why);return false}const cur=opened.get(cid);if(cur&&list.includes(cur.cap)&&!force)return true;
      for(const cap of list){
        try{const r=await call('chat.open',{cid,cap},g);opened.set(cid,{cap,level:r.level,epoch:r.epoch});openFail.delete(cid);busy.delete(cid);out.delete(cid);if(r.held&&opts.onPower)opts.onPower(cid,r.held);return true}
        catch(e){if(e&&e.code==='denied'){if(e.message==='you were removed from this chat')gone=true;continue} // this key doesn't open it: the next may. The server's sentence for the right key of a blocked member (server/src/protocol.js, chat.open) is noted for `out`
          const code=(e&&e.code)||'denied';if(code!=='offline')opened.delete(cid);if(code==='ratelimit'||code==='timeout')busy.add(cid);else if(code!=='offline')out.delete(cid);openFail.set(cid,code==='timeout'?'ratelimit':code);return false}} // any answer but too busy or no connection is followed by the trimmed copy or by the watches' end: the page must not then read an earlier attempt's answer (`out`); the same where there was no key to try, above
      opened.delete(cid);openFail.set(cid,'denied');gone?out.add(cid):out.delete(cid);return false})().finally(()=>{if(opening.get(cid)===job)opening.delete(cid)});
      opening.set(cid,job)}
    const ok=await job;if(ok)retryDeferred(cid);return ok;
  }
  // A live view of a chat we cannot open yet (a one-on-one chat before its first message, say) shows as empty
  // and goes live by itself once the chat can be opened.
  function retryDeferred(cid){for(const sub of [...subs.values()])if(sub.deferred&&!sub.dead&&inChat(sub,cid)){sub.deferred=false;sendSub(sub)}}
  async function chatCall(op,fields){const cid=chatOf(fields.p),g=era;if(cid){if(!isCount(op,fields))hurry(cid);await ensureOpen(cid)}return call(op,fields,g)}
  // The server took our level for a chat away (a key change, an admin change, or we were removed), and with it our watches of the
  // chat. The chat is opened again and its watches are sent again. They are ended, `denied`, when that open fails for good: every key
  // refused, none to try, no such chat, or any other answer that is not one of the passing ones named next (a server error among them). The page takes that as "look again, and forget the chat if it is so". An open that
  // failed for a passing reason (the server too busy or not answering: `ratelimit`; no connection: `offline`) says nothing about
  // being in the chat and ends nothing: the eviction is run again as a whole, after the wait below, until an open is answered. So
  // a member who was removed is told by the open that says so, on this connection or the next, and one still in loses nothing.
  // A chat evicted a third time within a minute of its last re-open waits before the next one, and each time after: 0.5 to 1 s, then twice as long each time,
  // 8 to 16 s at most, and the wait comes before the page's own read of the record. An eviction costs that read, the open and one frame for each
  // watch of the chat (four in all for a one-on-one chat with its call watch; on screen seven for a group or channel, eight for a one-on-one chat) and the level is no sooner back than the next one can
  // land: the other person of a one-on-one chat can ask for five a second. Without the wait a run of them took every frame the
  // lane may send for as long as it lasted (a list did not load), and for a chat on screen went well above the allowance. The first
  // two evictions of a minute wait for nothing, and a quiet minute after the last re-open starts the count again: one admin action is two evictions some 25 ms apart, and until the second is answered this device does not hold the chat's newest key. (The second waited once, and a device removal that began in that wait passed the chat over as locked: the device's account key changes, and the new one opens no wrap made for the old.) From the third on they wait: an admin removing several members in a row is that case.
  // Nor does an eviction wait while the page says a device removal is running (opts.evictNow; a throw or a no is "wait as usual"): the removal needs every key this device can reach in its key store before the account key changes. The count and the doubling go on as if it had waited. The adapter's own retry of an open that failed for a passing reason (the last line of onEvict) is not one of the pair and never exempt: it always waits, the wait being its only pause.
  const evicts=new Map(); // cid → {n: how many times so far; at: when its last re-open ended; c: how many in a row have come within a minute of the re-open before (0: the first of a run); wait: the wait before that one, ms, kept though not slept when the page said a removal was running}. A watch handed over before an eviction and refused `denied` after it is that eviction's own, not news (sendSub)
  async function onEvict(cid,retry){const g=era,a=evicts.get(cid)||{n:0},n=++a.n;evicts.set(cid,a);opened.delete(cid);
    a.c=performance.now()-a.at<60000?(a.c||0)+1:0;a.wait=a.c>1||retry?Math.min((a.wait||500)*2,16000):0;let now=false;   // the first two of a minute are free; a retry never is
    if(a.wait&&!retry&&opts.evictNow){try{now=!!opts.evictNow(cid)}catch{}}   // the page says a device removal is running: this eviction does not wait (a.wait stays, so the next one doubles it)
    if(a.wait&&!now){await new Promise(r=>setTimeout(r,a.wait/2+Math.random()*a.wait/2));if(g!==era||closed||a.n!==n)return}   // the account signed out or the page closed in that time: nothing of it is asked or sent. Or a later run for this chat began in that time: the chat was opened again by another road (the page asking for it, the next connection) and evicted again, or a watch of it, refused `denied`, ran the eviction again by its one try (sendSub). The later run's wait is the one that counts and it does the rest, so a run of evictions costs its frames once a step however many began. A connection lost in that time changes nothing here: the next one has the watches again, and what this sends a second time the server refuses as held
    if(opts.onEvict){try{await opts.onEvict(cid)}catch{}}
    const ok=await ensureOpen(cid,true),why=openFail.get(cid),again=why==='ratelimit'||why==='offline';a.at=performance.now();
    for(const sub of [...subs.values()])if(inChat(sub,cid)){
      if(ok){sub.on=null;sendSub(sub)}
      else if(!again){sub.dead=true;subs.delete(sub.s);if(sub.err)sub.err(mkErr('denied','You are no longer in this chat'))}}
    if(!ok&&again&&g===era)onEvict(cid,true)   // the whole eviction again, after the wait above, which a retry always has (it is within the minute, not one of the free pair, and the page is not asked): the open that is answered then sends the watches again or ends them
  }
  api.hurry=hurry; // the page's word for a chat tapped before its record came (the adapter forgets it when the connection ends: opts.first says it again)
  api.chatLevel=cid=>{const o=opened.get(cid);return o?o.level:null};
  api.chatOut=cid=>out.has(cid); // true when the last attempt at the chat that did not end too busy or without a connection had every key refused and heard the server say this account was removed from it (`out`)
  api.refreshChat=cid=>ensureOpen(cid,true);
  api.preview=cid=>call('get',{p:'channels/'+cid}).then(r=>docSnap(r.id,r.d,false));
  api.createChat=(cid,d,caps)=>call('chat.create',{cid,d:clone(d),caps}).then(r=>{opened.set(cid,{cap:caps.o||caps.m,level:r.level,epoch:r.epoch});retryDeferred(cid);return r});
  const needOpen=async(cid,bulk)=>{if(!bulk)hurry(cid);if(opts.caps&&!(await ensureOpen(cid)))throw mkErr(openFail.get(cid)||'denied','the chat could not be opened')}; // a level is needed first: why there is none ('offline', 'ratelimit', 'denied') is what the caller acts on
  api.rotateChat=async(cid,spec)=>{await needOpen(cid);const r=await call('chat.rotate',Object.assign({cid},clone(spec)));const o=opened.get(cid);if(o)opened.set(cid,Object.assign({},o,{epoch:r.epoch}));return r};
  api.setAdmins=async(cid,akeys,cap)=>{await needOpen(cid);return call('chat.admins',{cid,akeys:clone(akeys),cap})};
  api.joinChat=(cid,iid,proof,wraps)=>call('chat.join',{cid,iid,proof,wraps:clone(wraps)});
  api.inviteBlob=(cid,iid)=>call('chat.invite',{cid,iid});
  api.setBase=async(cid,cap)=>{await needOpen(cid,true);return call('chat.base',{cid,cap})}; // a DM from before base keys were kept
  api.rebaseChat=async(cid,cap)=>{await needOpen(cid);return call('chat.rebase',{cid,cap})}; // a DM's base key after an account key change (release 21)
  api.setOwner=async(cid,cap)=>{await needOpen(cid);return call('chat.owner',{cid,cap})}; // the owner key, from the owner's new account secret
  api.banChat=async(cid,h,on)=>{await needOpen(cid);return call('chat.ban',{cid,h,on:!!on})}; // block a username from a group or channel, or let it back in: the server refuses a blocked member key
  api.card=async(cid,e,iv,ct)=>{await needOpen(cid);return call('chat.card',{cid,e,iv,ct})}; // this account's member card in a private channel (SPEC.md 5.6): one per account, a newer one replaces it
  api.act=async(cid,post,kind,e,iv,ct)=>{await needOpen(cid);return call('chat.act',{cid,post,kind,e,iv,ct})}; // a channel's reaction or vote (SPEC.md 5.4): the server files it under a slot only it works out, one per account, post and kind
  api.mine=async(cid,posts)=>{await needOpen(cid);return (await call('chat.mine',{cid,posts})).ids}; // the ids of the rows this account's own reactions and votes sit under on these posts, answered to this connection alone
  api.chain=async(cid,e,b,c)=>{await needOpen(cid);return call('chat.chain',b===undefined?{cid,e,c}:{cid,e,b,c})}; // a channel's key-chain row, backfilled or replaced (admin level, SPEC.md 5.6)
  api.slots=async(cid,cap,hs)=>{await needOpen(cid);return (await call('chat.slots',{cid,cap,hs})).tags}; // for each username, the tag its member card sits under in this private channel (admin level with the current member key, else conflict; SPEC.md 5.6): a card counts only in its author's slot
  // Key-chain rows in one go. A chat this connection holds isn't opened again first: the walk can run inside opening it (capsFor), which would wait on itself.
  api.mgetChat=async(cid,ps)=>{if(!opened.has(cid))await needOpen(cid);return (await call('mget',{ps})).docs.map(d=>docSnap(d.id,d.d,false))};
  api.report=(cid,pid,reason)=>call('report.send',{cid,pid,reason}); // a public channel's message: the chat, the message id and a reason, nothing else. No chat level needed
  api.callRelay=async cid=>{await needOpen(cid);return call('call.relay',{cid})}; // a relay (TURN) credential for a call in this one-on-one chat; `unavailable` when the server has no relay
  api.pushSet=o=>call('push.set',{dev:o.dev,tok:o.tok,env:o.env,kind:o.kind});api.pushClear=o=>call('push.clear',{dev:o.dev,kind:o.kind}); // this iPhone's push addresses (kind voip rings, kind alert says "New message") for a closed app: account ops, no chat to open
  api.wakeMint=o=>call('wake.mint',{dev:o.dev,n:o.n,k:o.k});api.wakeRevoke=o=>call('wake.revoke',{tk:o.tk}); // the wake tickets it hands its contacts (k: c rings, m nudges), and taking one back
  api.deleteAccount=o=>call('account.delete',{vault:o&&o.vault}); // the whole account, for good: only on a connection proven with the account key; the vault id goes too, since the server can't work it out
  // ---- media over HTTP (SPEC.md 7.7): this connection vouches for a short-lived ticket, then raw encrypted pieces
  // travel over plain HTTP requests. A ticket dies with its connection, so every reconnect starts afresh. ----
  const FETCH=opts.fetch||(typeof fetch!=='undefined'?fetch.bind(globalThis):null);
  const httpBase=String(url).replace(/^ws(s?):/,'http$1:').replace(/\/ws$/,'');
  const tickets=new Map(),ticketing=new Map();let limitsP=null;
  function ticketFor(cid,fresh){const k=tickets.get(cid);if(k&&!fresh&&k.exp-api.now()>60e3)return Promise.resolve(k.t);
    let job=ticketing.get(cid);
    if(!job){job=(async()=>{hurry(cid);await ensureOpen(cid);const r=await call('media.ticket',{cid});tickets.set(cid,{t:r.t,exp:r.exp});if(r.limits)api.limits=r.limits;return r.t})().finally(()=>ticketing.delete(cid));ticketing.set(cid,job)}
    return job}
  async function mediaFetch(method,cid,path,body,headers,from){
    if(!FETCH)throw mkErr('offline','This browser cannot reach the Hush server');
    for(let a=0;;a++){const h=Object.assign({authorization:'Hush '+await ticketFor(cid,a>0)},headers||{});
      if(from)h['x-hush-from-ticket']=await ticketFor(from,a>0);
      let r;try{r=await FETCH(httpBase+'/media/'+cid+'/'+path,{method,headers:h,body:body||undefined,credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'})}
      catch{throw mkErr('offline','Could not reach the Hush server')}
      if(r.ok)return r;let e={};try{e=await r.json()}catch{}
      // an expired ticket, or a level revoked a moment ago (a rotation we have not heard of yet): open again, once
      if(a===0&&(r.status===401||r.status===403)){if(r.status===403){await ensureOpen(cid,true);if(from)await ensureOpen(from,true)}continue}
      throw mkErr(e.e||'http'+r.status,e.m||'The Hush server refused that ('+r.status+')')}}
  const okJson=r=>r.json();
  api.putPiece=(cid,mid,i,bytes,exp,oh)=>mediaFetch('PUT',cid,mid+'/'+i,bytes,Object.assign({},exp?{'x-hush-exp':String(exp)}:{},oh?{'x-hush-oh':oh}:{})).then(okJson).then(j=>!!j.created); // oh: the hash of the uploader's media token (release 81)
  api.getPiece=(cid,mid,i)=>mediaFetch('GET',cid,mid+'/'+i).then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b));
  api.deleteMedia=(cid,mid,ot)=>mediaFetch('DELETE',cid,mid,null,ot?{'x-hush-ot':ot}:null).then(okJson).then(j=>j.n||0); // ot: the media token, for a member's own file
  api.copyMedia=(from,fromMid,to,mid,exp,oh)=>mediaFetch('POST',to,mid+'/copy',null,Object.assign({'x-hush-from':from+'/'+fromMid},exp?{'x-hush-exp':String(exp)}:{},oh?{'x-hush-oh':oh}:{}),from).then(okJson).then(j=>!!j.copied);
  api.mediaLimits=()=>{if(!limitsP)limitsP=(async()=>{if(!FETCH)throw mkErr('offline','no fetch');
      const j=await (await FETCH(httpBase+'/media/limits',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'})).json();if(!j||!j.ok)throw mkErr('invalid','no limits');api.limits=j.limits;return j.limits})()
    .catch(e=>{limitsP=null;throw e});return limitsP};
  api.wake=tk=>FETCH?FETCH(httpBase+'/wake',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tk}),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'}).then(()=>{},()=>{}):Promise.resolve(); // rings a contact's closed iPhone with a ticket they gave us: anonymous, and the answer says nothing, so neither does this
  // ---- the sign-up puzzle (SPEC.md 9.4): creating a profile costs a little hashing, done here out of sight. The page
  // asks for it the moment the sign-up screen opens (warmSignup), so it is long finished when the person taps Create;
  // should a create still be refused with `pow` (a fresh connection, say), it is solved then and sent again. ----
  const zeroBits=a=>{let n=0;for(const b of a){if(b===0){n+=8;continue}n+=Math.clz32(b)-24;break}return n};
  async function solveWork(prefix,bits){const seed=Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>(b%36).toString(36)).join('');
    for(let n=0;;){const batch=[];
      for(let k=0;k<64;k++,n++){const nonce=seed+n.toString(36);batch.push(crypto.subtle.digest('SHA-256',new TextEncoder().encode(prefix+nonce)).then(h=>[nonce,new Uint8Array(h)]))}
      for(const [nonce,h] of await Promise.all(batch))if(zeroBits(h)>=bits)return nonce}}
  let work=null,working=null; // the solved {salt, nonce} for this connection, and the solving in progress
  function solveSignup(salt,bits){if(!working)working=solveWork('hush-signup-v1|'+salt+'|',bits).then(nonce=>{work={salt,nonce};return nonce}).finally(()=>{working=null});return working}
  // The address of a password box, made by the server from the login's tag and the stretched password (SPEC.md 4.5).
  api.loginGate=(t,x)=>call('login.gate',{t,x}).then(r=>r.loc);
  api.reopen=cid=>ensureOpen(cid,true);
  api.warmSignup=()=>work||working?Promise.resolve():call('signup.pow',{}).then(r=>solveSignup(r.salt,r.bits)).then(()=>{},()=>{});
  async function setWithWork(fields){
    if(working)await working.catch(()=>{});
    if(work)fields=Object.assign({},fields,{pow:work.nonce});
    try{const r=await chatCall('set',fields);if(fields.pow)work=null;return r}
    catch(e){if(!(e&&e.code==='pow'&&typeof e.salt==='string'))throw e;
      work=null;const nonce=await solveSignup(e.salt,e.bits);work=null;
      return chatCall('set',Object.assign({},fields,{pow:nonce}))}
  }
  function setOnline(v){online=v;api.online=v;
    if(v){if(offlineT){clearTimeout(offlineT);offlineT=null}onStatus(true)}
    else if(!offlineT)offlineT=setTimeout(()=>{offlineT=null;if(!online)onStatus(false)},opts.offlineNoticeMs==null?1500:opts.offlineNoticeMs)}
  function startPing(){stopPing();pingT=setInterval(()=>{if(online)api.probe(callTimeoutMs)},pingMs)} // a ping that fails means the socket is dead: a new connection, not a shrug
  api.probe=ms=>{if(!live()){if(reconnectT)connect();return}const s=ws,t=setTimeout(()=>{if(s===ws)reconnectNow()},ms);rawCall('ping',{}).then(()=>clearTimeout(t),e=>{clearTimeout(t);if(s===ws&&!(e&&e.code==='ratelimit'))reconnectNow()})}; // a socket that looks open but carries nothing (dead while the app slept): one ping, and a new connection unless it is answered in time (refused for the allowance, as an older server does, is an answer all the same); a socket already replaced is left to that reconnect, so two probes or a late failure never reconnect twice
  function stopPing(){if(pingT){clearInterval(pingT);pingT=null}}
  function rawCall(op,fields){return new Promise((resolve,reject)=>{if(!ws||ws.readyState!==1){reject(mkErr('offline','Not connected to the Hush server'));return}
    const go=()=>{if(!ws||ws.readyState!==1||(op==='sub'&&!subs.has(fields.s))){reject(mkErr('offline','Not connected to the Hush server'));return}   // a watch ended while it waited is not sent
      const i=++nextI;const timer=setTimeout(()=>{calls.delete(i);reject(mkErr('timeout','The Hush server did not answer in time'))},callTimeoutMs);
      calls.set(i,{resolve,reject,timer});refill();tokens=Math.max(0,tokens-1);if(/^(query|mget|chat\.(invite|mine|slots))$/.test(op))qtok=Math.max(0,qtok-1);   // never under zero, as the server's own counts: what it refuses costs nothing there, and only time would bring a count back from below
      ws.send(JSON.stringify(Object.assign({i,op},fields)))};
    const q=laneOf(op,fields);if(!q){go();return}q.go=go;q.reject=reject;lane.push(q);if(!laneT)laneT=setTimeout(pump,0)})}   // the start's bulk waits its turn (the pace, above)
  const live=()=>online&&!!ws&&ws.readyState===1;
  function call(op,fields,g=era){if(g!==era)return Promise.reject(mkErr('offline','Not connected to the Hush server'));   // asked for by an account that has since signed out: never sent on the next one's connection
    const bg=bgCid;   // the start's own read stays the start's own if it has to wait here
    if(proofP)return proofP.then(()=>asBulk(bg,()=>call(op,fields,g)));   // let a sign-in in progress finish first
    if(online&&!live())setOnline(false);   // the socket is closing under us; its close event (and the reconnect) will follow
    if(online)return rawCall(op,fields);if(fatal)return Promise.reject(mkErr('version',fatal));
    if(!offlineWaitMs)return Promise.reject(mkErr('offline','Not connected to the Hush server'));
    return new Promise((resolve,reject)=>{const go=()=>{clearTimeout(t);asBulk(bg,()=>rawCall(op,fields)).then(resolve,reject)};
      const t=setTimeout(()=>{const k=waiting.indexOf(go);if(k>=0)waiting.splice(k,1);reject(mkErr('offline','Not connected to the Hush server'))},offlineWaitMs);waiting.push(go)})}
  // ---- the sign-in proof (SPEC.md 4.1): sign the server's challenge with the device key, or the account key ----
  const sessionMsg=(h,dev)=>'hush-session-v1|'+nonce+'|'+h+'|'+(dev||'');
  async function doProve(){const idn=identity,h=idn.h;proven=null;api.proven=null;let r=null;
    if(idn.dev&&idn.signDev){try{r=await rawCall('prove',{h,dev:idn.dev,sig:await idn.signDev(sessionMsg(h,idn.dev))})}
      catch(e){if(!e||!['denied','invalid'].includes(e.code))throw e}}   // this device isn't listed on the profile yet: use the account key
    if(!r)r=await rawCall('prove',{h,pub:idn.pub,sig:await idn.signAcct(sessionMsg(h,''))});
    proven=h;api.proven=h;api.kv=r&&r.kv;if(opts.onKv)try{opts.onKv(api.kv)}catch{}}   // kv: the account's key version the server proved us against (release 21)
  function runProof(){if(proofP)return proofP;const h=identity.h;   // a proof for an account we have since switched away from settles nothing
    proofP=doProve().then(()=>{if(identity&&identity.h===h){staleRetry=false;api.identityError=null;settleProof(null)}},
    e=>{if(identity&&identity.h===h){
      if(e&&e.code==='unauth'&&/expired/.test(e.message||'')&&!staleRetry){staleRetry=true;setTimeout(()=>{if(identity&&identity.h===h)reconnectNow()},0);return} // the waiting callers stay waiting: the next hello signs in
      api.identityError=e;if(e&&e.code==='denied'&&opts.onDenied)try{opts.onDenied(e)}catch{} // the page looks whether the account's keys moved on without it (release 21)
      if(e&&e.code==='gone'&&opts.onGone)try{opts.onGone(h)}catch{} // the account was deleted (release 31)
      settleProof(e)}}).finally(()=>{proofP=null});return proofP}
  const awaitProof=()=>new Promise((res,rej)=>proofWaiters.push({res,rej}));
  function settleProof(err){for(const w of proofWaiters.splice(0))err?w.rej(err):w.res()}
  function dropSubs(){for(const sub of subs.values())sub.dead=true;subs.clear();era++;waiting.length=0;opening.clear();ranks.clear();seen=0}   // and what the old account still had waiting for a connection is not sent on the next one's, nor does the next account wait on an open the old one began
  // prove(identity): identity is {h, pub:{x,y}, dev, signDev(msg), signAcct(msg)} or null to sign out.
  // Resolves once the server accepts; rejects if it does not. Switching accounts uses a fresh connection
  // and drops the previous account's live subscriptions silently (the app re-subscribes on start).
  api.prove=idn=>{
    if(!idn){if(!identity&&!proven)return Promise.resolve();identity=null;proven=null;api.proven=null;dropSubs();reconnectNow();return Promise.resolve()}
    const was=identity,same=!!was&&was.h===idn.h;identity=idn;
    if(same){if(proven===idn.h)return Promise.resolve();if(proofP)return awaitProof()}
    else if(was||proven||proofP){dropSubs();reconnectNow();return awaitProof()}   // any change of account, signed in at this moment or not (a lost connection clears the sign-in)
    if(live()&&!proven){const p=awaitProof();if(Date.now()-nonceAt>NONCE_FRESH_MS)reconnectNow();else runProof();return p}
    return awaitProof();   // connecting or offline: the next hello signs in
  };
  // ---- snapshots ----
  const docSnap=(id,d,pending)=>({id,exists:d!=null,data:()=>clone(d),metadata:{hasPendingWrites:!!pending,fromCache:false}});
  function querySnap(sub){const rows=[];for(const [id,d] of sub.pending)rows.push({id,d,p:true});for(const [id,d] of sub.docs)if(!sub.pending.has(id))rows.push({id,d,p:false});
    const docs=orderAndLimit(rows,sub.o,sub.l).map(r=>docSnap(r.id,r.d,r.p));
    return {docs,size:docs.length,empty:!docs.length,metadata:{hasPendingWrites:docs.some(x=>x.metadata.hasPendingWrites),fromCache:false}}}
  // ---- live subscriptions ----
  // After a (re)connect every watch is handed to sendSub again at once. What is sent when is the lane's business (the pace, above):
  // a watch's frame is made when its chat's open is answered, the frames that wait together go in the lane's order, and room is kept
  // for the call watches still to come. A watch the server was too busy for is sent again a little later, never given up.
  const busy=new Set();
  function resendSubs(){for(const sub of [...subs.values()])if(!sub.dead)sendSub(sub)}
  function later(sub){sub.wait=Math.min((sub.wait||1000)*2,60000);setTimeout(()=>{if(!sub.dead&&live())sendSub(sub)},sub.wait/2+Math.random()*sub.wait/2)}
  function addSub(spec,cb,err){const s=++nextS;const sub=Object.assign({s,cb,err,docs:new Map(),pending:new Map(),inited:false,dead:false},spec);subs.set(s,sub);if(online)sendSub(sub);
    return ()=>{sub.dead=true;subs.delete(s);if(online)rawCall('unsub',{s}).catch(()=>{})}}
  async function sendSub(sub){if(closed)return;const f=Object.assign({s:sub.s,p:sub.p},sub.ids?{ids:sub.ids}:{w:sub.w,o:sub.o,l:sub.l});
    const cid=chatOf(sub.p)||(sub.p==='channels'&&sub.ids&&sub.ids.length===1?sub.ids[0]:null);
    if(cid&&/^channels\/[^/]+\/posts$/.test(sub.p))hurry(cid);   // a chat's posts are watched while it is on screen
    if(cid&&opts.caps){const ok=await ensureOpen(cid);if(sub.dead)return;
      if(!ok&&!opened.has(cid)){if(openFail.get(cid)==='offline')return;   // no connection: the next one sends this watch again (resendSubs), so nothing is marked
        if(busy.delete(cid)){later(sub);return}sub.deferred=true;
        if(!sub.inited){ // no key yet. A watch on the chat record itself still gets the trimmed copy anyone signed in may read,
          // so the app can tell "no key for this device yet" from "this chat is gone". Content under the chat stays empty.
          let d=null;
          if(sub.single){try{d=(await asBulk(cid,()=>call('get',{p:'channels/'+cid}))).d}catch{if(!sub.dead)setTimeout(()=>{if(!sub.dead&&!sub.inited)sendSub(sub)},5000);return}if(sub.dead)return}
          if(!sub.inited)onPush(sub,{t:'init',docs:d?[{id:cid,d}]:[]})}
        return}}
    sub.deferred=false;if(sub.on===ws)return;sub.on=ws;const ev=(evicts.get(cid)||0).n;   // sent on this connection already (a send that waited on its chat's open, and the reconnect's own): one frame of a watch at a time
    rawCall('sub',f).then(()=>{sub.wait=0;sub.reopened=false},e=>{if(sub.dead||(e&&(e.code==='offline'||e.code==='conflict'||(e.code==='denied'&&(evicts.get(cid)||0).n!==ev))))return;sub.on=null;   // `conflict`: the server holds this id already, from a frame of this same watch that was on its way or still waited when the watch was sent again after an eviction (a watch's frame never changes): the watch is live. `denied` after an eviction this frame was handed over before: that eviction's onEvict has sent the watch again, or will, or ends it
      if(e&&e.code==='timeout')rawCall('unsub',{s:sub.s}).catch(()=>{});   // no reply in time: the server may hold the watch all the same, and would refuse its id a second time. Ended there first (frames are taken in order)
      if(e&&(e.code==='ratelimit'||e.code==='timeout')){later(sub);return} // too busy just now, not a refusal
      // "Open this chat first" for a chat we believe is open, with no eviction heard since this frame was handed over, means our
      // level went with nothing said: treat it like the eviction it is, once for each time the watch is answered (`reopened` is given
      // back then). A watch refused again right after its chat was opened again is refused for a reason of its own, and ends.
      if(cid&&e&&e.code==='denied'&&!sub.reopened){sub.reopened=true;onEvict(cid);return}
      sub.dead=true;subs.delete(sub.s);if(sub.err)sub.err(e)})}
  function onPush(sub,f){if(sub.dead)return;
    if(f.t==='init'){sub.docs=new Map((f.docs||[]).map(x=>[x.id,x.d]));sub.inited=true}
    else if(f.t==='set'){sub.docs.set(f.id,f.d);sub.pending.delete(f.id)}
    else if(f.t==='del'){sub.docs.delete(f.id);sub.pending.delete(f.id)}
    else return;emit(sub)}
  function emit(sub){queueMicrotask(()=>{if(!sub.inited||sub.dead)return;try{ // never inside the caller's own write, like Firestore
    if(sub.single){const id=sub.ids[0],p=sub.pending.has(id);sub.cb(docSnap(id,p?sub.pending.get(id):sub.docs.has(id)?sub.docs.get(id):null,p))}
    else sub.cb(querySnap(sub))}catch(e){console.error(e)}})}
  const subsFor=(parent,id,d)=>[...subs.values()].filter(sub=>sub.p===parent&&(sub.ids?sub.ids.includes(id):matches(d,sub.w)));
  function notePending(parent,id,d){for(const sub of subsFor(parent,id,d)){sub.pending.set(id,d);emit(sub)}}
  function clearPending(parent,id){for(const sub of subs.values())if(sub.p===parent&&sub.pending.has(id)){sub.pending.delete(id);emit(sub)}}
  function knownDoc(parent,id){for(const sub of subs.values())if(sub.p===parent&&sub.docs.has(id))return sub.docs.get(id);return null}
  // ---- reads, batched where the app fans out (directory and presence lookups) ----
  // The reads of one moment go as one mget. While the connection is up and the page's query count is under 48, a moment of one path
  // only waits half a second, and the single reads of that half second join it: the server counts an mget as one query however many
  // paths it names, so a burst of single reads (the inbox checking a stranger's first message each, one by one) costs one request a
  // half second once half the count is spent (one query for each 90 paths), the server's query count refuses none of them, and the
  // unread counts, which go down to 24, keep the rest. (Each path still takes one of the server's own count of profile reads, 600 a
  // minute; past it a whole request is refused.) A moment of several paths (loadDir's 20 at a time: adding members, a key change)
  // goes at once; if it lands while a single read waits, that read goes with it, in the same request. A moment made while the count is
  // at 48 or more, and one with no connection (it waits for the next one, whose count is full), go at once, as before. None waits in
  // the lane. The batch is sent only under the account signed in when it began (`era`, `g`): a read made in the
  // same moment as a switch of account, before the next account's sign-in begins, is refused `offline`, never sent as the next one.
  let batch=null;
  function getDoc(path,later){if(!/^(directory|presence)\//.test(path))return chatCall('get',tagged({p:path},later)).then(r=>docSnap(r.id,r.d,false));
    if(!batch){const b=batch={paths:[],res:[],g:era,t:null,m:-1};refill();if(online&&qtok<48)Promise.resolve().then(()=>{if(batch===b){if(b.paths.length>1)flushBatch();else b.t=setTimeout(flushBatch,500)}});else Promise.resolve().then(flushBatch)}
    else if(batch.t&&batch.m<0){const b=batch;b.m=b.paths.length;Promise.resolve().then(()=>{if(batch!==b)return;if(b.paths.length-b.m>1){clearTimeout(b.t);flushBatch()}else b.m=-1})}   // a moment of several paths joins a batch that waits: it all goes now, the waiting read in the same request
    return new Promise((resolve,reject)=>{batch.paths.push(path);batch.res.push({resolve,reject})})}
  function flushBatch(){const b=batch;batch=null;if(!b)return;
    for(let k=0;k<b.paths.length;k+=90){const paths=b.paths.slice(k,k+90),res=b.res.slice(k,k+90);   // 90 to a request: a profile is 256 KB at most and an answer 24 MB, so 96 fit and a 97th would have the whole batch refused
      call('mget',{ps:paths},b.g).then(r=>r.docs.forEach((d,j)=>res[j].resolve(docSnap(d.id,d.d,false))),e=>res.forEach(x=>x.reject(e)))}}
  // ---- writes ----
  function setDoc(path,v,was,later){const {parent,id}=splitPath(path),d=clone(v);if(d==null)return Promise.reject(mkErr('invalid','document must be an object'));
    notePending(parent,id,d);return (parent==='directory'?setWithWork({p:path,d}):chatCall('set',tagged(was===undefined?{p:path,d}:{p:path,d,was},later))).then(()=>clearPending(parent,id),e=>{clearPending(parent,id);throw e})}
  function updateDoc(path,v){const {parent,id}=splitPath(path),patch=clone(v),base=knownDoc(parent,id);
    if(base)notePending(parent,id,mergePatch(base,patch));return chatCall('update',{p:path,d:patch}).then(()=>clearPending(parent,id),e=>{clearPending(parent,id);throw e})}
  function deleteDoc(path,ot,later){return chatCall('delete',tagged(ot?{p:path,ot}:{p:path},later)).then(()=>{})} // ot: the author's token, so a message of mine goes in one step
  // ---- the public shape ----
  function docRef(path){const {parent,id}=splitPath(path);return {id,path,get:o=>getDoc(path,o&&o.later),set:(v,o)=>setDoc(path,v,o&&o.was,o&&o.later),update:v=>updateDoc(path,v),delete:o=>deleteDoc(path,o&&o.ot,o&&o.later),
    onSnapshot:(cb,err)=>addSub({p:parent,ids:[id],single:true},cb,err),collection:p=>colRef(path+'/'+p)}}
  function mkQuery(q){return {where:(f,op,v)=>mkQuery(Object.assign({},q,{w:q.w.concat([[f,op,v]])})),orderBy:(f,dir)=>mkQuery(Object.assign({},q,{o:[f,dir==='desc'?'desc':'asc']})),
    limit:n=>mkQuery(Object.assign({},q,{l:n})),
    get:()=>chatCall('query',{p:q.p,w:q.w,o:q.o,l:q.l||1000}).then(r=>{const docs=r.docs.map(x=>docSnap(x.id,x.d,false));return {docs,size:docs.length,empty:!docs.length,metadata:{hasPendingWrites:false,fromCache:false}}}),
    onSnapshot:(cb,err)=>addSub({p:q.p,w:q.w,o:q.o,l:q.l||1000},cb,err),onSnapshotMeta:(cb,err)=>addSub({p:q.p,w:q.w,o:q.o,l:q.l||1000},cb,err),
    doc:id=>docRef(q.p+'/'+(id||genId())),add:v=>{const id=genId();return setDoc(q.p+'/'+id,v).then(()=>docRef(q.p+'/'+id))}}}
  const colRef=p=>mkQuery({p,w:[],o:undefined,l:undefined});
  api.collection=colRef;api.doc=docRef;
  api.close=()=>{closed=true;stopPing();clearTimeout(reconnectT);clearTimeout(offlineT);offlineT=null;if(ws){const s=ws;ws=null;try{s.close()}catch{}}rejectCalls()}; // nothing is left waiting for a reply that can no longer come
  if(!WS){api.error='This browser has no WebSocket support.';fatal=api.error;closed=true}else connect();
  return api;
}
/* ===== HUSH ADAPTER END ===== */
let SRV_ERR='';
// The banner while the server doesn't answer: with a network on this device, the fault is the server's
const srvDown=url=>navigator.onLine?'Hush is temporarily down, back soon. Reconnecting…':'Can’t reach the Hush server at '+url+'. Check that it’s running, then this will reconnect on its own.';
function hushServerUrl(){let s=String(HUSH_CONFIG.server||'').trim();
  // Opened from another device (a phone on the same Wi-Fi, `npm run dev:lan`): a loopback address here would mean
  // that device itself, so talk to the server the page came from instead.
  const loop=h=>/^(127\.0\.0\.1|localhost|\[::1\])$/.test(h);
  if(s&&/^https?:$/.test(location.protocol)&&!loop(location.hostname)){try{if(loop(new URL(s.replace(/^ws/,'http')).hostname))s=''}catch{}}
  if(!s)s=(location.protocol==='https:'?'wss://':'ws://')+location.host;
  s=s.replace(/^https?:/,m=>m==='https:'?'wss:':'ws:').replace(/\/+$/,'');return /\/ws$/.test(s)?s:s+'/ws'}
async function connectServer(){
  const url=hushServerUrl();
  const unreachable=()=>srvDown(url);
  // The order the start's queue goes by (rank) is the chat list as renderList draws it, the same rows in the same order: pinned chats
  // first, then by newest message; a message request, a chat hidden (a blocked person's, a blocked or cleared chat), an archived chat
  // and a one-on-one chat with no message have no row and no place. A chat not listed yet has its row in the list as last drawn
  // (listRank). Worked out again when S.convs is a new list, and at most a second late after a pin, the archive or a block changes.
  let shown={convs:null,at:-1e9,m:null,all:null};
  const listPlace=cid=>{const now=performance.now();
    if(shown.convs!==S.convs||now-shown.at>1000){const pr=S.prefs||{},pins=pr.pinned||[],archived=pr.archived||[];
      const rows=S.me?S.convs.filter(c=>(c.last||typeOf(c)!=='dm')&&!isRequest(c)&&!hiddenConv(c)&&!archived.includes(c.id)).sort((a,b)=>{const pa=pins.indexOf(a.id),pb=pins.indexOf(b.id);if(pa>=0||pb>=0)return (pa<0?1e9:pa)-(pb<0?1e9:pb);return (b.ts||0)-(a.ts||0)}):[];
      shown={convs:S.convs,at:now,m:new Map(rows.map((c,i)=>[c.id,i])),all:new Set(S.convs.map(c=>c.id))}}
    const k=shown.m.get(cid);return k!==undefined?k:shown.all.has(cid)?-1:listRank(cid)};
  const db=createHushAdapter(url,{onStatus:on=>{SRV_ERR=on?'':(db.error||unreachable());if(S.chan&&!S.loaded)renderConv();renderBanner();if(on){pushMark('online');checkForUpdate()}},   // a chat still opening shows or drops its Connecting notice
    caps:cid=>S.me?capsFor(cid):Promise.resolve(null),rank:listPlace,first:cid=>cid===S.wantOpen||!!(S.pushCall&&S.pushCall.cid===cid), // rank: the list's order as drawn for the start's queue (above), the kept list's for a chat not listed yet; first: the chat the user tapped, or the pushed call's
    onPower:(cid,held)=>askPower(cid,held),onEvict:cid=>onChatEvicted(cid),evictNow:()=>!!S.rekeying, // evictNow: while a device removal runs (rekeyRun) an evicted chat is opened again at once, never after the adapter's wait: the removal's read stage needs the chat's newest key in this device's key store before the account key changes
    onKv:kv=>{if(S.me&&!S.rekeying&&typeof kv==='number'&&kv>(S.me.kv||1))keysMovedOn()}, // proven against a newer key version than this device's: the profile is read first (keysMovedOn), and signedOutHere keeps a device whose key the profile still names
    onDenied:()=>keysMovedOn(), // a refused sign-in: see whether the profile's keys moved on without this device
    onClosed:(code,why,was)=>{if(code===4401)keysMovedOn();if(code===4410&&was)accountGone(was)}, // closed by the server for that very reason: look now, not after the next sign-in attempt
    onGone:h=>accountGone(h), // a sign-in refused because the account was deleted
    onBadges:b=>{S.badges=b||{};if(!S.me)return;renderList();if(S.chan){S.rendered=null;renderConv()}if(S.tab==='profile')setTab('profile')}}); // the operator's badge list came with the handshake
  await Promise.race([db.ready,new Promise(r=>setTimeout(r,5000))]);
  if(!db.online)SRV_ERR=db.error||unreachable();
  for(const e of ['online','offline'])addEventListener(e,()=>{if(!db.online){SRV_ERR=db.error||unreachable();renderBanner()}}); // the wording follows the device's network
  db.mediaLimits().catch(()=>{}); // this server's media limits, for checking files before they're sent
  return db;
}
/* ===== HUSH DROP BEGIN ===== */
/* Anonymous drops (SPEC.md 6, stage 5). A note to someone else is not written over this device's own connection
   (that would tie sender to recipient in the server's session state) but posted, with no session at all, to
   POST /drop. Every note is padded to one size before sealing, so its length says nothing about what it is.
   When the recipient only wants contacts, or their mailbox is busy, the server asks for a small proof of work:
   about a second of hashing here, one hash to check there. This block has no page dependencies beyond `enc` and
   `hushServerUrl`, so the server's tests lift it out and check it against the real puzzle (test/drops.test.js). */
const NOTE_PLAIN=1024;
function padNote(obj,n=NOTE_PLAIN){const s=JSON.stringify(obj),m=enc.encode(s).length;if(m>n)throw new Error('toolarge');return s+' '.repeat(n-m)} // n: a member card pads to 512 (sealCard)
const powZeros=a=>{let n=0;for(const b of a){if(b===0){n+=8;continue}n+=Math.clz32(b)-24;break}return n};
async function solvePow(to,hour,bits){ // a nonce whose SHA-256 of "hush-pow-v1|to|hour|nonce" starts with `bits` zero bits
  // The search starts from a random point, so two people writing to the same mailbox in the same hour never land on
  // the same solution (the server accepts each one once).
  const seed=Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>(b%36).toString(36)).join('');
  for(let n=0;;){const batch=[];
    for(let k=0;k<64;k++,n++){const nonce=seed+n.toString(36);batch.push(crypto.subtle.digest('SHA-256',enc.encode('hush-pow-v1|'+to+'|'+hour+'|'+nonce)).then(h=>[nonce,new Uint8Array(h)]))}
    for(const [nonce,h] of await Promise.all(batch))if(powZeros(h)>=bits)return nonce}}
function dropUrl(){return hushServerUrl().replace(/^wss:/,'https:').replace(/^ws:/,'http:').replace(/\/ws$/,'')+'/drop'}
async function postDrop(to,blob,pow,tries){
  const r=await fetch(dropUrl(),{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(Object.assign({to,blob},pow?{pow}:{})),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  let o=null;try{o=await r.json()}catch{}
  if(r.ok&&o&&o.ok)return o.id;
  if(o&&o.e==='pow'&&(tries||0)<2)return postDrop(to,blob,{nonce:await solvePow(to,o.hour,o.bits)},(tries||0)+1); // asked for proof of work: do it and try again
  throw Object.assign(new Error((o&&o.m)||('drop failed: '+r.status)),{code:(o&&o.e)||'net'});
}
/* ===== HUSH DROP END ===== */
