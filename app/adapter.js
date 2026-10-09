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
  let identity=null,proven=null,proofP=null,nonce=null;const proofWaiters=[];
  const calls=new Map(),subs=new Map(),waiting=[];
  const opened=new Map(),opening=new Map(); // chats this connection holds a level for, and opens in progress
  const api={flat:true,addr:url,online:false,proven:null,error:'',identityError:null,badges:{},now:()=>Date.now()+clockOffset};
  api.ready=new Promise(r=>{readyRes=r});
  // The operator's badge list rides on the hello reply (SPEC.md 12.3); the page hears about a change through onBadges.
  const takeBadges=r=>{const nb=r&&r.badges&&typeof r.badges==='object'&&!Array.isArray(r.badges)?r.badges:{};if(JSON.stringify(nb)===JSON.stringify(api.badges))return;api.badges=nb;try{opts.onBadges&&opts.onBadges(nb)}catch{}};
  function connect(){if(closed)return;clearTimeout(reconnectT);reconnectT=null;let sock;try{sock=new WS(url)}catch(e){scheduleReconnect();return}ws=sock;
    sock.onopen=()=>{if(sock!==ws)return;rawCall('hello',{v:1}).then(async r=>{if(sock!==ws)return;nonce=r.nonce;clockOffset=(typeof r.now==='number'?r.now:Date.now())-Date.now();backoff=500;takeBadges(r);
        if(identity)await runProof();if(sock!==ws)return;   // sign in before anything else goes out
        setOnline(true);opened.clear();for(const sub of subs.values())sendSub(sub);waiting.splice(0).forEach(f=>f());startPing();readyRes()},
      e=>{if(e&&e.code==='version'){fatal='This copy of Hush is out of date for the server. Reload the page.';api.error=fatal;closed=true}try{sock.close()}catch{}})};
    sock.onmessage=ev=>{if(sock!==ws)return;onMessage(ev)};
    sock.onerror=()=>{};
    sock.onclose=()=>{if(sock!==ws)return;ws=null;onClose()};
  }
  function onMessage(ev){let f;try{f=JSON.parse(typeof ev.data==='string'?ev.data:String(ev.data))}catch{return}
    if(Number.isInteger(f.i)&&calls.has(f.i)){const c=calls.get(f.i);calls.delete(f.i);clearTimeout(c.timer);if(f.ok)c.resolve(f);else c.reject(Object.assign(mkErr(f.e,f.m),f.e==='pow'?{bits:f.bits,salt:f.salt}:{}));return}
    if(f.s!==undefined&&subs.has(f.s)){onPush(subs.get(f.s),f);return}
    if(f.t==='evict'&&typeof f.cid==='string')onEvict(f.cid)}
  function rejectCalls(){for(const c of calls.values()){clearTimeout(c.timer);c.reject(mkErr('offline','Lost the connection to the Hush server'))}calls.clear()}
  function onClose(){setOnline(false);stopPing();proven=null;api.proven=null;opened.clear();tickets.clear();work=null;rejectCalls();
    for(const sub of subs.values())if(sub.pending.size){sub.pending.clear();emit(sub)}
    scheduleReconnect()}
  function scheduleReconnect(){if(closed||reconnectT)return;const d=backoff+Math.random()*backoff*0.3;backoff=Math.min(backoff*2,30000);reconnectT=setTimeout(connect,d)}
  function reconnectNow(){const s=ws;ws=null;if(s){try{s.close()}catch{}}setOnline(false);stopPing();proven=null;api.proven=null;opened.clear();tickets.clear();work=null;rejectCalls();clearTimeout(reconnectT);reconnectT=null;connect()}
  // ---- room keys (SPEC.md 5.2): before touching anything inside a chat, open it with the best key the app holds ----
  const chatOf=p=>{const m=/^channels\/([^/]+)/.exec(p||'');return m?m[1]:null};
  const inChat=(sub,cid)=>sub.p.startsWith('channels/'+cid+'/')||(sub.p==='channels'&&sub.ids&&sub.ids.includes(cid));
  async function ensureOpen(cid,force){ // true once the connection holds a level for the chat
    if(!opts.caps)return false;let job=opening.get(cid);
    if(!job){job=(async()=>{let cap=null;try{cap=await opts.caps(cid)}catch{}
      if(!cap)return false;const cur=opened.get(cid);if(cur&&cur.cap===cap&&!force)return true;
      try{const r=await call('chat.open',{cid,cap});opened.set(cid,{cap,level:r.level,epoch:r.epoch});return true}
      catch(e){if(e&&e.code!=='offline')opened.delete(cid);return false}})().finally(()=>{opening.delete(cid)});
      opening.set(cid,job)}
    const ok=await job;if(ok)retryDeferred(cid);return ok;
  }
  // A live view of a chat we cannot open yet (a one-on-one chat before its first message, say) shows as empty
  // and goes live by itself once the chat can be opened.
  function retryDeferred(cid){for(const sub of [...subs.values()])if(sub.deferred&&!sub.dead&&inChat(sub,cid)){sub.deferred=false;sendSub(sub)}}
  async function chatCall(op,fields){const cid=chatOf(fields.p);if(cid)await ensureOpen(cid);return call(op,fields)}
  async function onEvict(cid){ // our level was revoked: a rotation, an admin change, or we were removed
    opened.delete(cid);if(opts.onEvict){try{await opts.onEvict(cid)}catch{}}
    const ok=await ensureOpen(cid,true);
    for(const sub of [...subs.values()])if(inChat(sub,cid)){if(ok)sendSub(sub);else{sub.dead=true;subs.delete(sub.s);if(sub.err)sub.err(mkErr('denied','You are no longer in this chat'))}}
  }
  api.chatLevel=cid=>{const o=opened.get(cid);return o?o.level:null};
  api.refreshChat=cid=>ensureOpen(cid,true);
  api.preview=cid=>call('get',{p:'channels/'+cid}).then(r=>docSnap(r.id,r.d,false));
  api.createChat=(cid,d,caps)=>call('chat.create',{cid,d:clone(d),caps}).then(r=>{opened.set(cid,{cap:caps.o||caps.m,level:r.level,epoch:r.epoch});retryDeferred(cid);return r});
  api.rotateChat=async(cid,spec)=>{await ensureOpen(cid);const r=await call('chat.rotate',Object.assign({cid},clone(spec)));const o=opened.get(cid);if(o)opened.set(cid,Object.assign({},o,{epoch:r.epoch}));return r};
  api.setAdmins=async(cid,akeys,cap)=>{await ensureOpen(cid);return call('chat.admins',{cid,akeys:clone(akeys),cap})};
  api.joinChat=(cid,iid,proof,wraps)=>call('chat.join',{cid,iid,proof,wraps:clone(wraps)});
  api.inviteBlob=(cid,iid)=>call('chat.invite',{cid,iid});
  api.setBase=async(cid,cap)=>{await ensureOpen(cid);return call('chat.base',{cid,cap})}; // a DM from before base keys were kept
  // ---- media over HTTP (SPEC.md 7.7): this connection vouches for a short-lived ticket, then raw encrypted pieces
  // travel over plain HTTP requests. A ticket dies with its connection, so every reconnect starts afresh. ----
  const FETCH=opts.fetch||(typeof fetch!=='undefined'?fetch.bind(globalThis):null);
  const httpBase=String(url).replace(/^ws(s?):/,'http$1:').replace(/\/ws$/,'');
  const tickets=new Map(),ticketing=new Map();let limitsP=null;
  function ticketFor(cid,fresh){const k=tickets.get(cid);if(k&&!fresh&&k.exp-api.now()>60e3)return Promise.resolve(k.t);
    let job=ticketing.get(cid);
    if(!job){job=(async()=>{await ensureOpen(cid);const r=await call('media.ticket',{cid});tickets.set(cid,{t:r.t,exp:r.exp});if(r.limits)api.limits=r.limits;return r.t})().finally(()=>ticketing.delete(cid));ticketing.set(cid,job)}
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
  api.putPiece=(cid,mid,i,bytes,exp)=>mediaFetch('PUT',cid,mid+'/'+i,bytes,exp?{'x-hush-exp':String(exp)}:null).then(okJson).then(j=>!!j.created);
  api.getPiece=(cid,mid,i)=>mediaFetch('GET',cid,mid+'/'+i).then(r=>r.arrayBuffer()).then(b=>new Uint8Array(b));
  api.deleteMedia=(cid,mid)=>mediaFetch('DELETE',cid,mid).then(okJson).then(j=>j.n||0);
  api.copyMedia=(from,fromMid,to,mid,exp)=>mediaFetch('POST',to,mid+'/copy',null,Object.assign({'x-hush-from':from+'/'+fromMid},exp?{'x-hush-exp':String(exp)}:{}),from).then(okJson).then(j=>!!j.copied);
  api.mediaLimits=()=>{if(!limitsP)limitsP=(async()=>{if(!FETCH)throw mkErr('offline','no fetch');
      const j=await (await FETCH(httpBase+'/media/limits',{credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'})).json();if(!j||!j.ok)throw mkErr('invalid','no limits');api.limits=j.limits;return j.limits})()
    .catch(e=>{limitsP=null;throw e});return limitsP};
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
  function startPing(){stopPing();pingT=setInterval(()=>{if(online)rawCall('ping',{}).catch(()=>{})},pingMs)}
  function stopPing(){if(pingT){clearInterval(pingT);pingT=null}}
  function rawCall(op,fields){return new Promise((resolve,reject)=>{if(!ws||ws.readyState!==1){reject(mkErr('offline','Not connected to the Hush server'));return}
    const i=++nextI;const timer=setTimeout(()=>{calls.delete(i);reject(mkErr('timeout','The Hush server did not answer in time'))},callTimeoutMs);
    calls.set(i,{resolve,reject,timer});ws.send(JSON.stringify(Object.assign({i,op},fields)))})}
  const live=()=>online&&!!ws&&ws.readyState===1;
  function call(op,fields){if(proofP)return proofP.then(()=>call(op,fields));   // let a sign-in in progress finish first
    if(online&&!live())setOnline(false);   // the socket is closing under us; its close event (and the reconnect) will follow
    if(online)return rawCall(op,fields);if(fatal)return Promise.reject(mkErr('version',fatal));
    if(!offlineWaitMs)return Promise.reject(mkErr('offline','Not connected to the Hush server'));
    return new Promise((resolve,reject)=>{const go=()=>{clearTimeout(t);rawCall(op,fields).then(resolve,reject)};
      const t=setTimeout(()=>{const k=waiting.indexOf(go);if(k>=0)waiting.splice(k,1);reject(mkErr('offline','Not connected to the Hush server'))},offlineWaitMs);waiting.push(go)})}
  // ---- the sign-in proof (SPEC.md 4.1): sign the server's challenge with the device key, or the account key ----
  const sessionMsg=(h,dev)=>'hush-session-v1|'+nonce+'|'+h+'|'+(dev||'');
  async function doProve(){const idn=identity,h=idn.h;proven=null;api.proven=null;
    if(idn.dev&&idn.signDev){try{await rawCall('prove',{h,dev:idn.dev,sig:await idn.signDev(sessionMsg(h,idn.dev))});proven=h;api.proven=h;return}
      catch(e){if(!e||!['denied','invalid'].includes(e.code))throw e}}   // this device isn't listed on the profile yet: use the account key
    await rawCall('prove',{h,pub:idn.pub,sig:await idn.signAcct(sessionMsg(h,''))});proven=h;api.proven=h}
  function runProof(){if(proofP)return proofP;const h=identity.h;   // a proof for an account we have since switched away from settles nothing
    proofP=doProve().then(()=>{if(identity&&identity.h===h){api.identityError=null;settleProof(null)}},e=>{if(identity&&identity.h===h){api.identityError=e;settleProof(e)}}).finally(()=>{proofP=null});return proofP}
  const awaitProof=()=>new Promise((res,rej)=>proofWaiters.push({res,rej}));
  function settleProof(err){for(const w of proofWaiters.splice(0))err?w.rej(err):w.res()}
  function dropSubs(){for(const sub of subs.values())sub.dead=true;subs.clear()}
  // prove(identity): identity is {h, pub:{x,y}, dev, signDev(msg), signAcct(msg)} or null to sign out.
  // Resolves once the server accepts; rejects if it does not. Switching accounts uses a fresh connection
  // and drops the previous account's live subscriptions silently (the app re-subscribes on start).
  api.prove=idn=>{
    if(!idn){if(!identity&&!proven)return Promise.resolve();identity=null;proven=null;api.proven=null;dropSubs();reconnectNow();return Promise.resolve()}
    const same=!!identity&&identity.h===idn.h;identity=idn;
    if(same){if(proven===idn.h)return Promise.resolve();if(proofP)return awaitProof()}
    else if(proven||proofP){dropSubs();reconnectNow();return awaitProof()}
    if(live()&&!proven){const p=awaitProof();runProof();return p}
    return awaitProof();   // connecting or offline: the next hello signs in
  };
  // ---- snapshots ----
  const docSnap=(id,d,pending)=>({id,exists:d!=null,data:()=>clone(d),metadata:{hasPendingWrites:!!pending,fromCache:false}});
  function querySnap(sub){const rows=[];for(const [id,d] of sub.pending)rows.push({id,d,p:true});for(const [id,d] of sub.docs)if(!sub.pending.has(id))rows.push({id,d,p:false});
    const docs=orderAndLimit(rows,sub.o,sub.l).map(r=>docSnap(r.id,r.d,r.p));
    return {docs,size:docs.length,empty:!docs.length,metadata:{hasPendingWrites:docs.some(x=>x.metadata.hasPendingWrites),fromCache:false}}}
  // ---- live subscriptions ----
  function addSub(spec,cb,err){const s=++nextS;const sub=Object.assign({s,cb,err,docs:new Map(),pending:new Map(),inited:false,dead:false},spec);subs.set(s,sub);if(online)sendSub(sub);
    return ()=>{sub.dead=true;subs.delete(s);if(online)rawCall('unsub',{s}).catch(()=>{})}}
  async function sendSub(sub){const f=Object.assign({s:sub.s,p:sub.p},sub.ids?{ids:sub.ids}:{w:sub.w,o:sub.o,l:sub.l});
    const cid=chatOf(sub.p)||(sub.p==='channels'&&sub.ids&&sub.ids.length===1?sub.ids[0]:null);
    if(cid&&opts.caps){const ok=await ensureOpen(cid);if(sub.dead)return;
      if(!ok&&!opened.has(cid)){sub.deferred=true;
        if(!sub.inited){ // no key yet. A watch on the chat record itself still gets the trimmed copy anyone signed in may read,
          // so the app can tell "no key for this device yet" from "this chat is gone". Content under the chat stays empty.
          let d=null;
          if(sub.single){try{d=(await call('get',{p:'channels/'+cid})).d}catch{if(!sub.dead)setTimeout(()=>{if(!sub.dead&&!sub.inited)sendSub(sub)},5000);return}if(sub.dead)return}
          if(!sub.inited)onPush(sub,{t:'init',docs:d?[{id:cid,d}]:[]})}
        return}}
    sub.deferred=false;
    rawCall('sub',f).catch(e=>{if(sub.dead||(e&&e.code==='offline'))return;
      // "Open this chat first" for a chat we believe is open means our level was just revoked (a rotation we have not
      // heard about yet): treat it exactly like the eviction it is, once. Re-opening either re-sends this watch or ends it.
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
  let batch=null;
  function getDoc(path){if(!/^(directory|presence)\//.test(path))return chatCall('get',{p:path}).then(r=>docSnap(r.id,r.d,false));
    if(!batch){batch={paths:[],res:[]};Promise.resolve().then(flushBatch)}
    return new Promise((resolve,reject)=>{batch.paths.push(path);batch.res.push({resolve,reject})})}
  function flushBatch(){const b=batch;batch=null;if(!b)return;
    for(let k=0;k<b.paths.length;k+=300){const paths=b.paths.slice(k,k+300),res=b.res.slice(k,k+300);
      call('mget',{ps:paths}).then(r=>r.docs.forEach((d,j)=>res[j].resolve(docSnap(d.id,d.d,false))),e=>res.forEach(x=>x.reject(e)))}}
  // ---- writes ----
  function setDoc(path,v){const {parent,id}=splitPath(path),d=clone(v);if(d==null)return Promise.reject(mkErr('invalid','document must be an object'));
    notePending(parent,id,d);return (parent==='directory'?setWithWork({p:path,d}):chatCall('set',{p:path,d})).then(()=>clearPending(parent,id),e=>{clearPending(parent,id);throw e})}
  function updateDoc(path,v){const {parent,id}=splitPath(path),patch=clone(v),base=knownDoc(parent,id);
    if(base)notePending(parent,id,mergePatch(base,patch));return chatCall('update',{p:path,d:patch}).then(()=>clearPending(parent,id),e=>{clearPending(parent,id);throw e})}
  function deleteDoc(path){return chatCall('delete',{p:path}).then(()=>{})}
  // ---- the public shape ----
  function docRef(path){const {parent,id}=splitPath(path);return {id,path,get:()=>getDoc(path),set:v=>setDoc(path,v),update:v=>updateDoc(path,v),delete:()=>deleteDoc(path),
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
function hushServerUrl(){let s=String(HUSH_CONFIG.server||'').trim();
  // Opened from another device (a phone on the same Wi-Fi, `npm run dev:lan`): a loopback address here would mean
  // that device itself, so talk to the server the page came from instead.
  const loop=h=>/^(127\.0\.0\.1|localhost|\[::1\])$/.test(h);
  if(s&&/^https?:$/.test(location.protocol)&&!loop(location.hostname)){try{if(loop(new URL(s.replace(/^ws/,'http')).hostname))s=''}catch{}}
  if(!s)s=(location.protocol==='https:'?'wss://':'ws://')+location.host;
  s=s.replace(/^https?:/,m=>m==='https:'?'wss:':'ws:').replace(/\/+$/,'');return /\/ws$/.test(s)?s:s+'/ws'}
async function connectServer(){
  const url=hushServerUrl();
  const unreachable=()=>'Can\u2019t reach the Hush server at '+url+'. Check that it\u2019s running, then this will reconnect on its own.';
  const db=createHushAdapter(url,{onStatus:on=>{SRV_ERR=on?'':(db.error||unreachable());renderBanner()},
    caps:cid=>S.me?capsFor(cid):Promise.resolve(null),onEvict:cid=>onChatEvicted(cid),
    onBadges:b=>{S.badges=b||{};if(!S.me)return;renderList();if(S.chan){S.rendered=null;renderConv()}if(S.tab==='profile')setTab('profile')}}); // the operator's badge list came with the handshake
  await Promise.race([db.ready,new Promise(r=>setTimeout(r,5000))]);
  if(!db.online)SRV_ERR=db.error||unreachable();
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
function padNote(obj){const s=JSON.stringify(obj),n=enc.encode(s).length;if(n>NOTE_PLAIN)throw new Error('toolarge');return s+' '.repeat(NOTE_PLAIN-n)}
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
