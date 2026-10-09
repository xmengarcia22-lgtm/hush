/* Hush: keys and sealing (WebCrypto: ECDH P-256, HKDF-SHA256, AES-256-GCM, ECDSA, PBKDF2). One of the page's
   script files: they run in order (config, crypto, adapter, ui) and share one global scope, exactly like the single
   script they were split from, so a name declared in one file is used in the others without imports. This file
   holds what the others call to lock, unlock, sign and derive; it draws nothing itself. Top-level code here only
   declares things, so load order within the file does not matter. */
const enc=new TextEncoder(),dec=new TextDecoder();
const b64=buf=>{const a=new Uint8Array(buf);let s='';for(let i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)};
const unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const b64u=a=>b64(a).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const unb64u=s=>unb64(s.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((s.length+3)%4));
const rid22=()=>b64u(crypto.getRandomValues(new Uint8Array(16))); // a random label: says nothing about whose wrap it is
const rid=()=>b64(crypto.getRandomValues(new Uint8Array(9))).replace(/[^a-zA-Z0-9]/g,'x');
const hexOf=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
/* ---------- crypto (WebCrypto: ECDH P-256 + HKDF-SHA256 + AES-256-GCM, ECDSA signatures) ---------- */
const EC={name:'ECDH',namedCurve:'P-256'},DS={name:'ECDSA',namedCurve:'P-256'};
async function newIdentity(){
  const e=await crypto.subtle.generateKey(EC,true,['deriveBits']);
  const s=await crypto.subtle.generateKey(DS,true,['sign','verify']);
  const [ep,epub,sp,spub]=await Promise.all([crypto.subtle.exportKey('jwk',e.privateKey),crypto.subtle.exportKey('jwk',e.publicKey),crypto.subtle.exportKey('jwk',s.privateKey),crypto.subtle.exportKey('jwk',s.publicKey)]);
  // `own`: the account's private secret behind message-ownership tokens and owner keys, so the signing key signs and nothing else
  return {ecdhPriv:ep,ecdh:{x:epub.x,y:epub.y},sigPriv:sp,sig:{x:spub.x,y:spub.y},own:b64u(crypto.getRandomValues(new Uint8Array(32)))};
}
const OWN_RE=/^[A-Za-z0-9_-]{43}$/;
// Accounts from before stage 7 have no `own` secret and keep deriving tokens and owner keys from the signing key, so
// their messages and groups stay theirs.
const ownIkm=id=>unb64u(typeof id.own==='string'&&OWN_RE.test(id.own)?id.own:id.sigPriv.d);
const jwk=xy=>({kty:'EC',crv:'P-256',x:xy.x,y:xy.y,ext:true});
async function pubKey(xy,kind){const k=kind+xy.x;if(!S.keys.has(k))S.keys.set(k,crypto.subtle.importKey('jwk',jwk(xy),kind==='e'?EC:DS,true,kind==='e'?[]:['verify']));return S.keys.get(k)}
async function myKey(kind){const id=S.me,k='me'+kind+id.handle;if(!S.keys.has(k))S.keys.set(k,crypto.subtle.importKey('jwk',kind==='e'?id.ecdhPriv:id.sigPriv,kind==='e'?EC:DS,false,kind==='e'?['deriveBits']:['sign']));return S.keys.get(k)}
async function aesKeyFrom(bits,salt){ // the shared ECDH secret, stretched for the one purpose the salt names
  const ikm=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode(salt),info:enc.encode('hush-msg-v1')},ikm,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function aesKey(priv,pub,salt){return aesKeyFrom(await crypto.subtle.deriveBits({name:'ECDH',public:pub},priv,256),salt)}
/* ---------- device keys (forward secrecy, stage 1) ----------
   Each device has its own key pair that never leaves it and is never backed up. Chat keys are wrapped to a
   person's DEVICES, not to their account key, so the account keys plus recovery words alone can no longer
   open old chats. Only a device that was in the chat (or was handed the keys by one) can.
   A device's entry on your profile is signed by your account key (your first device) or by one of your
   existing devices (one added with the QR handoff), so others know which devices are really yours. */
const devMsg=(h,d)=>enc.encode(['hush-dev-v1',h,d.id,d.ecdh.x,d.ecdh.y,d.sig.x,d.sig.y,d.by||''].join('|'));
const devEntry=d=>({x:d.ecdh.x,y:d.ecdh.y,sx:d.sig.x,sy:d.sig.y,by:d.by||'',s:d.s,ts:d.ts||Date.now()});
async function newDev(){const k=await newIdentity();return {id:rid().slice(0,12),ecdhPriv:k.ecdhPriv,ecdh:k.ecdh,sigPriv:k.sigPriv,sig:k.sig,by:'',s:'',ts:Date.now()}}
async function ensureDev(id){ // this account's key for THIS device; a first device signs its own entry with the account key
  const d=id.dev||await newDev();
  if(!d.s||(!d.by&&d.forSig!==id.sig.x)){const sk=await crypto.subtle.importKey('jwk',id.sigPriv,DS,false,['sign']);
    d.by='';d.s=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},sk,devMsg(id.handle,d)));d.forSig=id.sig.x}
  id.dev=d;id.trust=id.trust||[];if(!S.ids.includes(id)){S.ids=S.ids.filter(x=>x.handle!==id.handle);S.ids.push(id)}ls.set('hush:ids',S.ids);return d;
}
async function devKey(kind){const d=S.me.dev,k='dev'+kind+d.id;if(!S.keys.has(k))S.keys.set(k,crypto.subtle.importKey('jwk',kind==='e'?d.ecdhPriv:d.sigPriv,kind==='e'?EC:DS,false,kind==='e'?['deriveBits']:['sign']));return S.keys.get(k)}
const devCache=new Map();
function verifiedDevs(h){ // someone's devices whose entries check out; others get ignored
  const pk=peerKeys(h),all=Object.assign({},(S.dir[h]&&S.dir[h].devs)||{}),mine=S.me&&h===S.me.handle&&S.me.dev;
  if(mine&&mine.s)all[mine.id]=devEntry(mine);
  if(!pk||!pk.sig)return Promise.resolve([]);
  const key=h+':'+pk.sig.x+':'+JSON.stringify(all);
  if(!devCache.has(key))devCache.set(key,(async()=>{
    const ok=new Map(),ids=Object.keys(all).filter(i=>/^[a-zA-Z0-9]{6,20}$/.test(i)&&all[i]&&['x','y','sx','sy','s'].every(f=>typeof all[i][f]==='string'));
    const check=async i=>{const e=all[i],d={id:i,ecdh:{x:e.x,y:e.y},sig:{x:e.sx,y:e.sy},by:typeof e.by==='string'?e.by:''};
      try{const parent=d.by?ok.get(d.by):null;if(d.by&&!parent)return null;
        return (await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await pubKey(parent?parent.sig:pk.sig,'s'),unb64(e.s),devMsg(h,d)))?Object.assign(d,{ts:e.ts||0}):null}catch{return null}};
    for(let round=0;round<4;round++){let grew=false;for(const i of ids){if(ok.has(i))continue;const d=await check(i);if(d){ok.set(i,d);grew=true}}if(!grew)break}
    return [...ok.values()];
  })());
  return devCache.get(key);
}
async function publishDev(){ // put this device's entry on my profile (and forget devices nobody has used in four months)
  if(!S.db||!S.me||!S.me.dev||!S.me.dev.s||!S.dirReady)return;const m=S.me,d=S.dir[m.handle];if(!d||(d.kv||1)>(m.kv||1))return;
  const e=devEntry(m.dev),cur=d.devs&&d.devs[m.dev.id];
  if(cur&&cur.x===e.x&&cur.s===e.s&&Date.now()-(cur.ts||0)<864e5)return;
  e.ts=Date.now();const devs={[m.dev.id]:e};
  for(const [i,v] of Object.entries(d.devs||{}))if(i!==m.dev.id&&v&&(v.ts||0)<Date.now()-120*864e5)devs[i]=null;
  try{await S.db.doc('directory/'+m.handle).update({devs});d.devs=Object.assign({},d.devs,devs);for(const i in d.devs)if(d.devs[i]==null)delete d.devs[i];m.dev.ts=e.ts;ls.set('hush:ids',S.ids)}catch{}
}
/* The chat-key store: every chat key this device has ever unwrapped, kept here so history stays readable
   even once the server no longer holds a wrap this device can open. */
const ksKey=()=>'hush:ks:'+S.me.handle;
function ksMap(){if(S.ksFor!==S.me.handle){S.ksFor=S.me.handle;S.ks=ls.get(ksKey(),{})}return S.ks}
function ksGet(cid,e){const m=ksMap();return (m[cid]&&m[cid][e])||null}
function ksPut(cid,e,raw){const m=ksMap();if(m[cid]&&m[cid][e]===raw)return;(m[cid]=m[cid]||{})[e]=raw;ls.set(ksKey(),m);scheduleBackup()}
/* "Message backup": off by default. When it's on, the chat-key store is also kept on the server in a box that only
   your account keys can open, so restoring with your recovery words (or password) brings past messages back too.
   Off means recovery brings back your account, contacts and groups, but a new phone starts with empty chats. */
const backupOn=()=>!!(S.prefs&&S.prefs.backup);
function backupKey(id){const k='backup:'+id.handle;
  if(!S.chanKeys.has(k))S.chanKeys.set(k,(async()=>aesKey(await crypto.subtle.importKey('jwk',id.ecdhPriv,EC,false,['deriveBits']),await pubKey(id.ecdh,'e'),'hush-backup:'+id.handle))());
  return S.chanKeys.get(k)}
let backupT=null;
function scheduleBackup(){if(!backupOn()||!S.db)return;clearTimeout(backupT);backupT=setTimeout(()=>uploadBackup().catch(()=>{}),2500)}
async function uploadBackup(){if(!S.db||!S.me)return;const me=S.me,iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('backup|'+me.handle)},await backupKey(me),enc.encode(JSON.stringify({v:1,ks:ksMap()})));
  await S.db.doc(await backupPath(me)).set({iv:b64(iv),ct:b64(ct),ts:Date.now()})}
async function restoreBackup(id){ // on a fresh login or recovery: bring back the saved chat keys, if "Message backup" was on
  try{const rd=async()=>S.db.doc(await backupPath(id)).get();let s;try{s=await rd()}catch{await new Promise(r=>setTimeout(r,800));s=await rd()} // the sign-in may still be settling
    if(!s.exists)return 0;const v=s.data();
    const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:enc.encode('backup|'+id.handle)},await backupKey(id),unb64(v.ct));
    const o=JSON.parse(dec.decode(pt));if(!o||o.v!==1||!o.ks||typeof o.ks!=='object')return 0;
    const key='hush:ks:'+id.handle,m=ls.get(key,{});let n=0;
    for(const [cid,es] of Object.entries(o.ks)){if(!es||typeof es!=='object')continue;
      for(const [e,raw] of Object.entries(es)){if(typeof raw!=='string'||!/^[A-Za-z0-9+/=]{40,48}$/.test(raw)||(m[cid]&&m[cid][e]))continue;(m[cid]=m[cid]||{})[e]=raw;n++}}
    ls.set(key,m);S.ksFor=null;return n;
  }catch{return 0}}
async function safetyNumber(a,b,override){
  const src=[a,b].sort().map(h=>{const d=(override&&override[h])||peerKeys(h);return [h,d.ecdh.x,d.ecdh.y,d.sig.x,d.sig.y].join(',')}).join('|');
  const h=new Uint8Array(await crypto.subtle.digest('SHA-512',enc.encode(src)));const out=[];
  for(let i=0;i<12;i++){const o=i*5;const v=(h[o]*2**32+h[o+1]*2**24+h[o+2]*65536+h[o+3]*256+h[o+4])%100000;out.push(String(v).padStart(5,'0'))}
  return out;
}
async function vaultPath(handle){ // the contact vault lives at an address only its owner can work out
  S._vp=S._vp||{};if(S._vp[handle])return S._vp[handle];
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:await pubKey(S.me.ecdh,'e')},await myKey('e'),256));
  const h=await crypto.subtle.digest('SHA-256',new Uint8Array([...bits,...enc.encode('hush-vault-id:'+handle)]));
  return S._vp[handle]='vault/v'+b64u(h).slice(0,32);
}
const backupPaths={};
async function backupPath(id){ // like the vault, the message backup lives at an address only its owner can work out
  if(backupPaths[id.handle])return backupPaths[id.handle];
  const priv=await crypto.subtle.importKey('jwk',id.ecdhPriv,EC,false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:await pubKey(id.ecdh,'e')},priv,256));
  const h=await crypto.subtle.digest('SHA-256',new Uint8Array([...bits,...enc.encode('hush-backup-id:'+id.handle)]));
  return backupPaths[id.handle]='backup/b'+b64u(h).slice(0,32);
}
/* One-on-one chats: the address and the base key both come from the two account keys (SPEC.md 5.3). Both people
   work them out; the server can't, so a DM's record never says who is in it. */
const dmIds=new Map();
async function dmSecret(peer){const pk=peerKeys(peer);if(!pk)return null;
  return new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:await pubKey(pk.ecdh,'e')},await myKey('e'),256))}
async function dmIdFor(peer){
  const c=dmIds.get(peer);if(c)return c;const s=await dmSecret(peer);if(!s)return null;
  const h=await crypto.subtle.digest('SHA-256',new Uint8Array([...enc.encode(peer===S.me.handle?'hush-dmid-v1|self|':'hush-dmid-v1|'),...s]));
  const id='d'+b64u(h).slice(0,22);dmIds.set(peer,id);S.dmPeers[id]=peer;return id}
/* Key wraps: one sealed copy of a chat key per device of each member, filed under a random label. A device finds
   its own copy by trying each one (SPEC.md 5.3), so the server never sees which label belongs to whom.
   The salt a wrap is made with names the chat, the person, their device and, since stage 7, the epoch: a wrap copied
   into another epoch then opens to nothing. Wraps made before that used `cid:handle[:deviceId]` and are still tried,
   second; the replay rule in convKey covers them. The admin secret's wraps have no epoch and keep the old salt. */
const wrapSalt=(base,e,handle,dev)=>e===undefined?base+':'+handle+(dev?':'+dev:''):'hush-wrap-v2|'+base+'|'+Number(e)+'|'+handle+'|'+(dev||'');
async function wrapKey(raw,handle,base,e){
  const pk=peerKeys(handle);if(!pk)throw new Error('nokey');
  const devs=await verifiedDevs(handle),out={};
  if(!devs.length)out[rid22()]=await wrapTo(raw,pk.ecdh,wrapSalt(base,e,handle)); // no device on their profile yet: to the account key
  for(const dv of devs)out[rid22()]=await wrapTo(raw,dv.ecdh,wrapSalt(base,e,handle,dv.id));
  return out;
}
async function wrapAll(raw,handles,base,e){const out={};for(const h of new Set(handles||[])){if(h!==S.me.handle&&!S.dir[h])continue;Object.assign(out,await wrapKey(raw,h,base,e))}return out}
async function wrapTo(raw,xy,salt){
  const eph=await crypto.subtle.generateKey(EC,true,['deriveBits']);
  const k=await aesKey(eph.privateKey,await pubKey(xy,'e'),salt);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const [ct,ej]=await Promise.all([crypto.subtle.encrypt({name:'AES-GCM',iv},k,raw),crypto.subtle.exportKey('jwk',eph.publicKey)]);
  return {epk:{x:ej.x,y:ej.y},iv:b64(iv),ct:b64(ct)};
}
async function unwrapMine(map,base,e){ // try every wrap with this device's key, then with the account key; the epoch's salt first, then the old one
  const me=S.me.handle,dev=S.me.dev&&S.me.dev.ecdhPriv?S.me.dev:null;
  const privs=[];if(dev)privs.push([await devKey('e'),dev.id]);privs.push([await myKey('e'),'']);
  const salts=d=>e===undefined?[wrapSalt(base,undefined,me,d)]:[wrapSalt(base,e,me,d),wrapSalt(base,undefined,me,d)];
  for(const w of Object.values(map||{})){if(!w||!w.epk||!w.iv||!w.ct)continue;
    for(const [priv,d] of privs){let bits;try{bits=await crypto.subtle.deriveBits({name:'ECDH',public:await pubKey(w.epk,'e')},priv,256)}catch{continue} // one agreement per wrap, then each salt
      for(const salt of salts(d)){try{const k=await aesKeyFrom(bits,salt);return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(w.iv)},k,unb64(w.ct)))}catch{}}}}
  return null;
}
function convKey(c,e=epochOf(c)){
  if(!c)return Promise.resolve(null);
  if(typeOf(c)==='dm'&&Number(e)===0){ // one-on-one, key number 0: the fixed key only the two of you can work out from your account keys
    const peer=dmPeer(c),pk=peerKeys(peer),xy=pk&&pk.ecdh;if(!xy)return Promise.resolve(null);
    const ck=['dm',S.me.handle,c.id,xy.x].join(':');
    if(!S.chanKeys.has(ck))S.chanKeys.set(ck,(async()=>{try{return {raw:null,key:await aesKey(await myKey('e'),await pubKey(xy,'e'),c.id)}}catch{return null}})());
    return S.chanKeys.get(ck);
  }
  const open=c.openKeys&&c.openKeys[e],stored=!open&&ksGet(c.id,e),km=!open&&!stored?keyMap(c,e):null;
  if(!open&&!stored&&!(km&&Object.keys(km).length))return Promise.resolve(null);
  const ck=[S.me.handle,c.id,e,open?'o'+open:stored?'k'+stored.slice(0,16):'w'+Object.keys(km).sort().join(',')].join(':');
  if(!S.chanKeys.has(ck))S.chanKeys.set(ck,(async()=>{try{
    let raw;
    if(open)raw=unb64(open);
    else if(stored)raw=unb64(stored);
    else{raw=await unwrapMine(km,c.id,e);if(!raw)return null;
      // A wrap that opens to a key this device already holds for another epoch is a replay (a server copying an
      // old wrap into a new epoch would have everyone keep writing under a key a removed member still holds).
      const got=b64(raw),held=ksMap()[c.id]||{};for(const [e2,r2] of Object.entries(held))if(e2!==String(e)&&e2!=='a'&&r2===got)return null}
    if(!open)ksPut(c.id,e,b64(raw));
    return {raw,key:await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt'])};
  }catch{return null}})());
  return S.chanKeys.get(ck);
}
/* ---------- room keys (SPEC.md 5.1): what the server needs to see before it lets a connection into a chat ----------
   The member key is worked out from the chat key, so whoever can read a chat can prove it; the admin key from a
   separate secret only admins hold; the owner key from the owner's own account key. The server keeps hashes. */
async function hkdf(ikm,salt,info){const k=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:enc.encode(salt),info:enc.encode(info)},k,256))}
async function memberCapFrom(cid,e,raw){return b64u(await hkdf(await hkdf(raw,'hush-caproot-v1',cid+'|'+e),'hush-cap-v1','member'))}
async function adminCapFrom(cid,secret){return b64u(await hkdf(secret,'hush-cap-v1','admin|'+cid))}
async function ownerCap(cid){return b64u(await hkdf(ownIkm(S.me),'hush-cap-v1','owner|'+cid))}
async function memberCap(c,e){
  if(typeOf(c)==='dm'&&Number(e)===0){const s=await dmSecret(dmPeer(c));return s?memberCapFrom(c.id,0,s):null}
  const k=await convKey(c,e);return k&&k.raw?memberCapFrom(c.id,e,k.raw):null}
async function adminSecret(c){ // the admin secret, if this device can unwrap it
  const kept=ksGet(c.id,'a');if(kept)return unb64(kept);
  const raw=await unwrapMine(c.akeys,c.id+'#a');if(raw)ksPut(c.id,'a',b64(raw));return raw}
const postData=(cid,p)=>enc.encode([cid,p.from,p.ts,p.iv,p.ct].concat(p.e!=null?[p.e]:[]).concat(p.exp?['x'+p.exp]:[]).join('|'));
async function sealPost(c,text,ts,exp){
  const e=epochOf(c),ck=await convKey(c,e);if(!ck)throw new Error('nokey');
  const iv=crypto.getRandomValues(new Uint8Array(12)),t=ts||Date.now();
  const p={from:S.me.handle,ts:t,e,iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv},ck.key,enc.encode(text)))};
  const x=exp===undefined?(c.ttl?t+c.ttl*1000:0):exp;if(x)p.exp=x;
  p.sig=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},await myKey('s'),postData(c.id,p)));
  return p;
}
/* ---------- sealed sender ----------
   New messages hide who wrote them: the sender's name and signature travel INSIDE the encryption, so the
   server stores only a time and a sealed blob ("sl":1). Members unseal it and check the hidden signature.
   To edit or delete your own sealed message you show a one-time key only your account can work out
   (the server keeps just its fingerprint "oh"); each use sets up the next one, so a used key is worthless.
   Message requests to strangers keep the old named format: the server must know who is asking. */
const envAD=(cid,pid)=>enc.encode('hush-env-v1|'+cid+'|'+pid);
async function ownTok(cid,pid,k){const ikm=await crypto.subtle.importKey('raw',ownIkm(S.me),'HKDF',false,['deriveBits']);
  return b64u(new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:enc.encode('hush-own-v1'),info:enc.encode(cid+'|'+pid+'|'+k)},ikm,256)))}
const ownHash=async t=>hexOf(await crypto.subtle.digest('SHA-256',enc.encode(t)));
async function wrapPost(c,p,pid,k){
  const ck=await convKey(c,p.e??0);if(!ck)throw new Error('nokey');const iv=crypto.getRandomValues(new Uint8Array(12));
  const inner=enc.encode(JSON.stringify({f:p.from,i:p.iv,c:p.ct,s:p.sig}));
  const w={sl:1,ts:p.ts,e:p.e??0,n:b64(iv),d:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:envAD(c.id,pid)},ck.key,inner)),oh:await ownHash(await ownTok(c.id,pid,k)),on:k};
  if(p.exp)w.exp=p.exp;return w;
}
/* ---------- names off the side channels ----------
   Seen marks, typing dots and reactions used to be filed under your username, so the server could watch who
   was reading, typing and reacting in every chat. They now sit under a tag worked out from the chat's own key,
   so only people in the chat can tell whose is whose. Each one carries a signature by the person who left it,
   so nobody can leave a mark under somebody else's tag. */
const tagCache=new Map();
function memTag(c,e,h){const k=c.id+'|'+e+'|'+h;
  if(!tagCache.has(k))tagCache.set(k,(async()=>{const ck=await convKey(c,e);if(!ck){tagCache.delete(k);return null}
    return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-tag-v1|'+c.id+'|'+b64(ck.raw)+'|'+h)))).slice(0,22)})());
  return tagCache.get(k)}
async function tagMap(c,e){const out={};for(const h of new Set(c.members||[])){const t=await memTag(c,e,h);if(t)out[t]=h}return out}
const sideSig=async(label,parts)=>b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},await myKey('s'),enc.encode(label+'|'+parts.join('|'))));
const dirMiss=new Map(); // handles whose profile was not found, and when: no point asking again for a minute
async function senderKeys(h){ // the public keys of whoever signed something; fetched on demand for a person this page has never looked up
  let s=peerKeys(h);
  if(!s&&validHandle(h)&&(dirMiss.get(h)||0)<Date.now()-60000){await loadDir([h]);s=peerKeys(h);if(!s)dirMiss.set(h,Date.now())}
  return s;
}
async function sideOk(h,sg,label,parts){const s=await senderKeys(h);if(!s||typeof sg!=='string'||!sg)return false;
  try{return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await pubKey(s.sig,'s'),unb64(sg),enc.encode(label+'|'+parts.join('|')))}catch{return false}}
const unsealCache=new Map();
async function unsealPost(c,p){ // gives back the message with sender, inner ciphertext and signature filled in (on this device only)
  if(!p||p.sl!==1||p.svc)return p;
  const pid=p._id||p.id;
  if(p.del||!p.d)return Object.assign({},p,{from:'',iv:'',ct:'',sig:'gone:'+pid,del:true});
  const key=c.id+':'+pid+':'+p.n;
  if(!unsealCache.has(key))unsealCache.set(key,(async()=>{try{
    const ck=await convKey(c,p.e??0);if(!ck)return null;
    const o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(p.n),additionalData:envAD(c.id,pid)},ck.key,unb64(p.d))));
    return {from:/^[a-z0-9_]{3,20}$/.test(o.f)?o.f:'',iv:String(o.i||''),ct:String(o.c||''),sig:String(o.s||'')};
  }catch{return null}})());
  const v=await unsealCache.get(key);if(!v)unsealCache.delete(key); // keys may arrive later: try again next time
  return Object.assign({},p,v||{from:'',iv:'',ct:'',sig:'bad:'+pid+':'+p.n});
}
async function sealSvc(c,kind,v){ // a system note with the name and what changed tucked inside the encryption
  const e=epochOf(c),ck=await convKey(c,e);if(!ck)throw new Error('nokey');
  const iv=crypto.getRandomValues(new Uint8Array(12)),ts=Date.now();
  const inner=enc.encode(JSON.stringify({f:S.me.handle,k:kind,v:v||0,sg:await sideSig('hush-svc-v1',[c.id,kind,String(v||0),String(ts)])}));
  return {sv:1,ts,e,n:b64(iv),d:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('hush-svc-v1|'+c.id+'|'+ts)},ck.key,inner))};
}
async function unsealSvc(c,p){
  const key='sv:'+c.id+':'+p.ts+':'+p.n;
  if(!unsealCache.has(key))unsealCache.set(key,(async()=>{try{
    const ck=await convKey(c,p.e??0);if(!ck)return null;
    const o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(p.n),additionalData:enc.encode('hush-svc-v1|'+c.id+'|'+p.ts)},ck.key,unb64(p.d))));
    if(!/^[a-z0-9_]{3,20}$/.test(o.f)||!['pin','ttl','join','leave','accept'].includes(o.k))return null;
    if(!(await sideOk(o.f,o.sg,'hush-svc-v1',[c.id,o.k,String(o.v||0),String(p.ts)])))return null;
    return {svc:o.k,from:o.f,v:Number(o.v)||0};
  }catch{return null}})());
  const x=await unsealCache.get(key);if(!x)unsealCache.delete(key);
  return x?Object.assign({},p,x):Object.assign({},p,{svc:'',from:'',_hide:true});
}
const unsealAll=(c,a)=>Promise.all((a||[]).map(p=>p&&p.sv===1?unsealSvc(c,p):unsealPost(c,p)));
/* A private group's or channel's name, description and photo are locked with the group's own key, so the
   server only ever stores gibberish ("meta"). Public channels stay readable so people can find them.
   showMeta() makes a separate on-screen copy with the readable values. That copy is never saved back. */
const metaCache=new Map();
const metaAD=cid=>enc.encode('hush-meta-v1|'+cid);
const HANDLE_RE=/^[a-z0-9_]{3,20}$/;
const handleList=a=>Array.isArray(a)?a.filter(h=>typeof h==='string'&&HANDLE_RE.test(h)):[];
async function sealMeta(cid,e,raw,v){ // name, description, photo AND who is in the chat: all locked with the chat key (SPEC.md 5.3)
  const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const pt=enc.encode(JSON.stringify({name:String(v.name||''),desc:String(v.desc||''),photo:v.photo||null,owner:v.owner||'',admins:handleList(v.admins),members:handleList(v.members),banned:handleList(v.banned)}));
  return {e,iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:metaAD(cid)},key,pt))};
}
async function sealMetaFor(c,v){const e=epochOf(c),k=await convKey(c,e);if(!k||!k.raw)throw new Error('nokey');return sealMeta(c.id,e,k.raw,v)}
async function readMeta(c,raws){ // the readable description and member list, or null if this device can't unlock it
  const m=c&&c.meta;if(!m||typeof m.iv!=='string'||typeof m.ct!=='string')return null;
  // Sealed under another epoch than the record's: a stale copy (the server keeps meta re-sealed at every rotation),
  // which would show a member list from before someone was removed and have the next rotation wrap for them again.
  if(Number(m.e)!==epochOf(c))return null;
  const ck=c.id+':'+m.e+':'+m.iv;
  if(!metaCache.has(ck))metaCache.set(ck,(async()=>{try{
    let key;
    if(raws&&raws[m.e])key=await crypto.subtle.importKey('raw',unb64(raws[m.e]),{name:'AES-GCM'},false,['decrypt']);
    else{const k=await convKey(c,m.e);if(!k)return null;key=k.key}
    const v=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(m.iv),additionalData:metaAD(c.id)},key,unb64(m.ct))));
    return {name:String(v.name||'').slice(0,60),desc:String(v.desc||'').slice(0,200),photo:typeof v.photo==='string'?v.photo:null,
      owner:HANDLE_RE.test(v.owner||'')?v.owner:'',admins:handleList(v.admins),members:handleList(v.members),banned:handleList(v.banned),_unlocked:true};
  }catch{return null}})());
  const v=await metaCache.get(ck);if(!v)metaCache.delete(ck);return v; // don't remember failures: keys may arrive later
}
/* invite links carry a secret in the part after #, which never reaches the server */
async function inviteKey(secret,cid,iid){const ikm=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode(cid+':'+iid),info:enc.encode('hush-invite-v1')},ikm,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
// Proof of holding an invite link, worked out from the link's secret. The server only keeps its fingerprint.
async function joinProof(secretB64u,cid,iid){return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-join-v1:'+cid+':'+iid+':'+secretB64u))))}
/* ===== HUSH MEDIA BEGIN ===== */
/* Media encryption, version 2 (SPEC.md 7.7). Every file gets its own random key, carried inside the sealed message
   with the file's other facts (type, name, size, duration, preview); the server sees none of them. The file is cut
   into pieces, and piece i of n is AES-GCM under that key with "hush-media-v2|i|n" as associated data, so pieces
   can't be reordered, dropped from the end, or mixed between files. On the wire a piece is its 12-byte iv followed
   by the ciphertext. The message also carries `hash`: SHA-256 over the SHA-256 of each plaintext piece in order,
   checked before anything is shown, so a file can be hashed piece by piece without holding all of it at once.
   This block has no page dependencies so it can be tested on its own. */
const mediaAad=(i,n)=>new TextEncoder().encode('hush-media-v2|'+i+'|'+n);
const b64std=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
async function newMediaKey(){const raw=crypto.getRandomValues(new Uint8Array(32));
  return {k:b64std(raw),key:await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt','decrypt'])}}
async function mediaKeyOf(k){const raw=Uint8Array.from(atob(String(k)),ch=>ch.charCodeAt(0));if(raw.length!==32)throw new Error('mediakey');
  return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt'])}
async function sealPiece(key,i,n,plain){const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:mediaAad(i,n)},key,plain));
  const out=new Uint8Array(12+ct.length);out.set(iv,0);out.set(ct,12);return out}
async function openPiece(key,i,n,body){
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:body.subarray(0,12),additionalData:mediaAad(i,n)},key,body.subarray(12)))}
const pieceHash=async plain=>new Uint8Array(await crypto.subtle.digest('SHA-256',plain));
async function mediaRoot(hashes){const all=new Uint8Array(hashes.length*32);hashes.forEach((h,i)=>all.set(h,i*32));
  return b64std(new Uint8Array(await crypto.subtle.digest('SHA-256',all)))}
/* ===== HUSH MEDIA END ===== */
const keysOf=d=>d?{ecdh:{x:d.ecdh.x,y:d.ecdh.y},sig:{x:d.sig.x,y:d.sig.y}}:null;
const sameKeys=(a,b)=>!!a&&!!b&&a.ecdh.x===b.ecdh.x&&a.ecdh.y===b.ecdh.y&&a.sig.x===b.sig.x&&a.sig.y===b.sig.y;
function peerKeys(h){if(S.me&&h===S.me.handle)return {ecdh:S.me.ecdh,sig:S.me.sig};return (S.pins&&S.pins[h])||S.dir[h]||null}
/* ===== HUSH RECOVERY BEGIN ===== */
/* ---------- recovery words: six everyday words that bring your account back ----------
   The words are made on this device and never sent anywhere. They're stretched (PBKDF2, 600k rounds) into
   a secret address and a key, exactly like your password, and your account keys are locked into a box there.
   1,024 words, 6 picks = about 1 in a billion billion. No server checks them, so no carrier, email provider
   or court order can reset your account. Typing just the first 4 letters of each word is enough.
   This block and the login block below have no page dependencies beyond S, ls and a few helpers, so the
   server's tests lift them out and run them against a real server (test/login.test.js). */
const RWORDS='acorn adult agent alarm album alley amber anchor angel ankle antler anvil apple apricot apron arch arena arm armor army arrow art ash aspen atlas attic aunt autumn avocado award axe axis baby back bacon badge bag bagel bake bald ball bamboo banana band banjo bank barber barn barrel base basil basket bat bath battery bay beach beam bean bear beast beaver bed bee beef beet bell belt bench berry bicycle bike bill bird biscuit bison blade blank blaze blender blimp blizzard block blond bloom blouse blue bluff board boat body boil bolt bone bonus book boot border boss bottle boulder bounce bowl box boy bracelet brain bramble branch brass brave bread breeze brick bride brief bright bronze broom brown brush bubble bucket buddy budget buffalo bugle build bulb bull bunch bunny burger burrow bus bush butler butter buyer cabbage cabin cable cactus caddy cage cake calf call calm camel camp canal candy cane cannon canoe canvas canyon cap cape captain car caramel card cargo carpet carrot cart cash castle cat catfish cattle cave cedar cell cement chain chalk champ chapel charm cheek chef cherry chess chick chief child chimney chin chip choir chop chrome cider cigar cinema cinnamon circle city clam clay clerk cliff climb clock cloth cloud clover clown club coach coal coast coat cobra cobweb cocoa code coffee coin cold collar colt comb comet comic compass condor cookie copper coral cord cork corn cotton couch cougar county court cousin cow cowboy coyote crab craft crane crate crayon cream creek crew cricket crisp crop cross crow crumb crust cube cup cupcake curtain curve cushion cycle daffodil dagger dairy daisy dance dart date dawn deck deer delta denim dentist desert desk dial diamond diary dice diesel dingo dinner dish diver dock doctor dog doll dolphin dome domino donkey donut door dough dove dragon drama drawer dream dress drift drill drink drone drum duck dumpling dune dust eagle earth easel echo eclipse edge eel egg eggplant elbow elder elephant elk elm ember emerald empire engine entry envy equal error essay event exam exit fabric face fact fair falcon family fan farm fawn feast feather fence fern ferry fever fiddle field fig film finch finger fire fish flag flame flash fleet flint float flock floor flour flower flute foam focus fog folk food foot forest fork fort fossil fountain fox frame frog frost fruit fudge fuel fund funnel fur gadget galaxy game garage garden garlic garnet gate gazelle gear gecko gem genius geyser ghost giant gift ginger giraffe glacier glass glove glow glue goat goblet gold golf goose gopher gorilla gown grain granite grape grass gravy green griddle grill grin grove guard guest guitar gulf gum gumbo habit hall ham hammer hamster hand harbor harness harp hat hatchet hawk hay hazel head heart heat hedge helmet hen herb hermit hero hiker hill hinge hippo hobby hockey honey hood hook hope horn horse host hotel hound house hug human hummus humor husky hut ice iceberg icon idea igloo inch index ink inkwell inn iris iron island ivory ivy jackal jaguar jam jar jasmine javelin jaw jazz jeans jeep jelly jet jewel jigsaw job jockey joke judge juice jukebox jungle kangaroo kayak kernel ketchup kettle key kid king kitchen kite kitten kiwi knee knife knight knot koala label lace ladder ladle lady lagoon lake lamb lamp lane lantern laptop lasso latch lava lawn layer leaf ledge lemon lens leopard lettuce lever lid lilac lily limb lime lion lip list lizard llama loaf lobby lobster lock lodge log loop lotus lunch lynx magnet maid mail mammoth mango manor mantle maple marble market marsh mascot mask mast match maze meadow medal melon menu mesa metal meter microwave mill minnow mint mirror mitten model mohawk mole monkey monsoon moon moose mop mosaic moth motor mouse mouth mud muffin mug mule muscle museum music mustang nail name napkin navy neck nectar needle nest net nickel night noble noodle north nose note novel nugget nurse nut nutmeg oak oar oasis oatmeal ocean octopus olive omelet onion opera orange orbit orchid ostrich otter outlet oven owl oyster paddle page pail paint palace palm pan panda panel paper paprika parade park parrot parsley party pasta patch path peach peak pear pebble pecan pedal pelican pen pencil penguin penny pepper pheasant piano piccolo pickle picnic pie pier pig pigeon pillow pilot pine pink pipe pirate pistol pitch pizza plane plate plaza plum pluto pocket poem polar pole pond pony pool popcorn poppy porch port possum poster pot potato pouch powder prairie pretzel prince prism puffin pug pulse pump pupil puppy purple puzzle quail quartz queen quest quilt quiver rabbit raccoon radar radio raft rain raisin rake ranch rapids raven razor recipe reef reindeer relay rhino ribbon rice riddle ridge ring river road robin robot rock rodeo roof room rooster root rope rose rover ruby rug ruler saddle safari saffron sail salad salmon salt sand sapphire sardine sauce sauna scale scarf school scooter scout screw sea seagull seal season seed sequoia shade shark sheep shelf sherbet shield ship shirt shoe shore shovel shrimp sign silk silver singer sink siren skate ski skillet skull skunk sky sled sleeve slice slope sloth smile smoke snail snake snorkel snow soap sock sofa soil soldier sombrero song soup spark spear spider spike spinach spoon spring sprocket spruce square squid stable stage stamp star steam steel stem stick stingray stone stool storm stove straw stream string strudel sugar suit summer sun sundae swamp swan sweater swing sword syrup table taco tadpole tail tank tape target taxi tea teacup teapot temple tennis tent thimble thread throne thumb thunder ticket tide tiger timber toast toe tomato tongue tool tooth torch toucan tower town toy track trail tree tribe trombone trophy truck trumpet trunk tuba tugboat tulip tuna tundra tunnel turkey turnip turtle tusk tuxedo twig umbrella uncle unicorn valley van vanilla vase velvet vest violin visor volcano vulture waffle wagon waiter wall walnut walrus wand warthog wasabi water wave wax weasel weevil well whale wheat wheel whip whisker wig wildcat willow window wing winter wire wizard wolf wombat wood wool worm wren yacht yard yarn yodel yogurt zebra zeppelin zero zipper zoo zucchini'.split(' ');
const RW_COUNT=6;
function newRecoveryWords(){const r=crypto.getRandomValues(new Uint16Array(RW_COUNT));return Array.from(r,v=>RWORDS[v&1023])}
function readWords(text){ // forgiving: any case, any spacing or punctuation, first 4 letters are enough
  const toks=String(text||'').toLowerCase().match(/[a-z]+/g)||[];const out=[];
  for(let k=0;k<toks.length;k++){const t=toks[k];let w=RWORDS.includes(t)?t:null;
    if(!w&&t.length>=4){const m=RWORDS.filter(x=>x.startsWith(t.slice(0,4)));if(m.length===1)w=m[0]}
    if(!w)throw Object.assign(new Error('word'),{n:k+1,t});out.push(w)}
  if(out.length!==RW_COUNT)throw Object.assign(new Error('count'),{n:out.length});
  return out;
}
async function recSecrets(words){
  const salt=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-recovery-salt-v1')));
  const base=await crypto.subtle.importKey('raw',enc.encode(words.join(' ')),'PBKDF2',false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},base,512));
  const loc=b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',bits.slice(0,32))));
  const key=await crypto.subtle.importKey('raw',bits.slice(32),{name:'AES-GCM'},false,['encrypt','decrypt']);
  return {loc,key};
}
async function saveRecovery(id,words){
  const {loc,key}=await recSecrets(words),iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('hush-recovery-v1')},key,enc.encode(JSON.stringify(bundleOf(id)))));
  await S.db.doc('accounts/'+loc).set({iv:b64u(iv),ct:b64u(ct)});
  const mine=S.me&&S.me.handle===id.handle,v=mine&&S.prefs&&S.prefs.rec;
  [...new Set([recLocal(id.handle),v].filter(o=>o&&o.loc&&o.loc!==loc).map(o=>o.loc))]
    .forEach(l=>S.db.doc('accounts/'+l).delete().catch(()=>{})); // old words stop working, whichever device made them
  ls.set('hush:recovery:'+id.handle,{loc,ts:Date.now(),conf:false});ls.set('hush:backedUp:'+id.handle,Date.now());
  if(v){delete S.prefs.rec;saveContacts()} // not counted as set up again until the quick check is passed
}
function confirmRecovery(id){ // the quick check passed: now the words count, on every device
  const r=recLocal(id.handle);if(!r||!r.loc)return;const ts=Date.now();
  ls.set('hush:recovery:'+id.handle,{loc:r.loc,ts,conf:true});
  if(S.me&&S.me.handle===id.handle&&S.contactsReady){P().rec={loc:r.loc,ts};saveContacts()}
  renderBanner();
}
let lastRecLoc=null;
async function openRecovery(words){
  const {loc,key}=await recSecrets(words);lastRecLoc=loc;const s=await S.db.doc('accounts/'+loc).get();if(!s.exists)throw new Error('nomatch');
  const d=s.data();let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(d.iv),additionalData:enc.encode('hush-recovery-v1')},key,unb64u(d.ct))}catch{throw new Error('nomatch')}
  return idFromBundle(JSON.parse(dec.decode(pt)));
}
const recLocal=h=>ls.get('hush:recovery:'+h,null);
// Set up = the quick check was passed, on this device or another one (the encrypted vault carries it).
// Saves from before the check existed have no "conf" and count as set up.
const hasRecovery=h=>{const r=recLocal(h),v=S.me&&S.me.handle===h&&S.contactsReady&&S.prefs&&S.prefs.rec;
  const vOk=!!(v&&typeof v.loc==='string');
  if(r&&r.conf===false)return vOk&&(v.ts||0)>(r.ts||0);
  return !!r||vOk};
/* ===== HUSH RECOVERY END ===== */
/* ===== HUSH AUTH BEGIN ===== */
/* ---------- log in with email or phone + password ----------
   The password never leaves the device. It's stretched (PBKDF2, 600k rounds) into two things:
   a secret address for your account on the server, and the key that locks your account keys.
   The server only ever holds a locked box at an address it can't connect to your email or number. */
function normLogin(s){
  s=String(s||'').trim();if(!s)return null;
  if(s.includes('@')){s=s.toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)?s:null}
  return normPhone(s);
}
/* Passwords: at least 8 characters, not on the built-in list of common passwords, and not containing the
   person's own username, phone number or email. The list holds the usual suspects of 8+ characters from the
   big breach counts; anything shorter is already refused by the length rule. */
const COMMON_PW=new Set(('password 12345678 123456789 1234567890 12345678910 123456789a 123456abc 123abc123 1234qwer qwer1234 1q2w3e4r 1q2w3e4r5t 1qaz2wsx 1qaz2wsx3edc zaq12wsx !qaz2wsx '+
  'qwertyuiop qwertyui qwerty123 qwerty1234 qwertyuiop123 asdfghjkl asdfgh123 asdfasdf asdf1234 zxcvbnm123 poiuytrewq mnbvcxz1 123qweasd qweasdzxc qazwsxedc abcdefgh abcdefg1 abcd1234 abc12345 abc123456 1234abcd a1b2c3d4 1234567a '+
  '11111111 00000000 88888888 987654321 9876543210 0123456789 123123123 1111111111 1212121212 123321123 123654789 147258369 159753456 741852963 102030405 1234512345 112233445566 123456654321 '+
  'password1 password2 password12 password123 password1234 password! password1! password!1 passw0rd p@ssw0rd p@ssword pa55word letmein1 letmein123 welcome1 welcome12 welcome123 changeme changeme1 default1 secret123 test1234 testtest temp1234 guest123 admin123 admin1234 administrator root1234 internet computer whatever whatever1 trustno1 '+
  'iloveyou iloveyou1 iloveyou2 iloveu123 loveme123 lovely123 loveyou1 babygirl babygirl1 hottie123 sunshine princess football footbal1 baseball basketball volleyball swimming soccer123 hockey123 superman starwars pokemon1 batman123 monkey123 dragon123 master123 shadow123 mustang1 corvette freedom1 blessed1 jesus123 godisgood '+
  'michael1 jennifer jessica1 matthew1 anthony1 joshua123 andrew123 thomas123 william1 robert123 michelle elizabeth christian daniel123 ashley123 nicole123 hunter123 charlie1 charlie123 jordan23 samantha jasmine1 maggie123 buster123 cookie123 bailey123 scooter1 bandit123 molly123 sophie123 scooby12 snoopy12 mickey123 minnie123 tigger123 pepper123 ginger123 '+
  'hello123 cheese123 chocolate butterfly liverpool cocacola summer123 winter123 spring123 autumn12 january1 february december november september lakers24 yankees1 redsox123 arsenal1 chelsea1 manchester barcelona realmadrid juventus rangers1 dolphins dolphin1 metallica nirvana1 slipknot linkinpark blink182').split(' '));
function pwProblem(pw,login,handle){ // null when the password is acceptable, else a short message saying why not
  if(pw.length<8)return 'Use at least 8 characters.';
  const low=pw.toLowerCase();
  if(COMMON_PW.has(low))return 'This password is too common.';
  if(/^(.+?)\1+$/.test(low)||/^(?:0?1234567890?|9876543210)+$/.test(low))return 'This password is too easy to guess.';
  if(handle&&low.includes(String(handle).toLowerCase()))return 'Password can\u2019t contain your username.';
  if(login){const l=String(login).toLowerCase();
    if(l.includes('@')){const local=l.split('@')[0];if(low.includes(l)||(local.length>=4&&low.includes(local)))return 'Password can\u2019t contain your email.'}
    else{const d=l.replace(/\D/g,''),pd=low.replace(/\D/g,'');if(d.length>=7&&(pd.includes(d)||pd.includes(d.slice(-7))))return 'Password can\u2019t contain your phone number.'}}
  return null;
}
function pwStrength(pw,login,handle){ // 0 empty, 1 weak, 2 fair, 3 good, 4 strong; weak whenever pwProblem would refuse it
  if(!pw)return {level:0,label:''};
  if(pwProblem(pw,login,handle))return {level:1,label:'Weak'};
  const classes=[/[a-z]/,/[A-Z]/,/\d/,/[^A-Za-z0-9]/].filter(r=>r.test(pw)).length,n=pw.length;
  let s=n>=16?4:n>=12?3:2;if(classes<2)s-=1;if(classes>=3&&n>=10)s+=1;s=Math.max(1,Math.min(4,s));
  return {level:s,label:['','Weak','Fair','Good','Strong'][s]};
}
async function loginSecrets(login,pw){
  const salt=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-login-salt-v1:'+login)));
  const base=await crypto.subtle.importKey('raw',enc.encode(pw.normalize('NFKC')),'PBKDF2',false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},base,512));
  const loc=b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',bits.slice(0,32))));
  const key=await crypto.subtle.importKey('raw',bits.slice(32),{name:'AES-GCM'},false,['encrypt','decrypt']);
  return {loc,key};
}
const loginTag=async login=>b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-login-v1:'+login))));
async function saveLoginBox(id,login,pw){
  const {loc,key}=await loginSecrets(login,pw),iv=crypto.getRandomValues(new Uint8Array(12));
  const payload=JSON.stringify(bundleOf(id));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('hush-login-v1')},key,enc.encode(payload)));
  await S.db.doc('accounts/'+loc).set({iv:b64u(iv),ct:b64u(ct)});return loc;
}
async function unsealBundle(d,key){ // a locked password box → the account inside it, or 'nomatch'
  let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(d.iv),additionalData:enc.encode('hush-login-v1')},key,unb64u(d.ct))}catch{throw new Error('nomatch')}
  try{return idFromBundle(JSON.parse(dec.decode(pt)))}catch{throw new Error('nomatch')}
}
async function openLoginBox(login,pw){
  const {loc,key}=await loginSecrets(login,pw);const s=await S.db.doc('accounts/'+loc).get();if(!s.exists)throw new Error('nomatch');
  return {id:await unsealBundle(s.data(),key),loc};
}
/* One login attempt, three possible answers:
     in       the box at the address made from this login and password opened: here is the account
     wrongpw  no box there, but this login is reserved, so the password must be wrong
     new      no box and no reservation: nobody has signed up with this login
   The box itself is the real test. It is looked up first and on its own, so a login still works when the
   reservation is missing (a server whose data was reset while this account's profile was republished). */
async function tryLogin(login,pw){
  const {loc,key}=await loginSecrets(login,pw);
  const [rec,box]=await Promise.all([S.db.doc('logins/'+await loginTag(login)).get(),S.db.doc('accounts/'+loc).get()]);
  if(box.exists)return {kind:'in',id:await unsealBundle(box.data(),key),loc};
  return {kind:rec.exists?'wrongpw':'new'};
}
async function reserveLogin(login,handle){ // one account per email or number
  const ref=S.db.doc('logins/'+await loginTag(login));if((await ref.get()).exists)throw new Error('taken'); // no username stored: knowing someone's number shouldn't reveal their account
  try{await ref.set({ts:Date.now()})}catch(e){if(e&&e.code==='exists')throw new Error('taken');throw e} // lost a race for the same login
}
async function reserveLoginConfirmed(login){ // reserve, then read it back, so a write the server dropped never shows as saved
  await reserveLogin(login);
  if(!(await S.db.doc('logins/'+await loginTag(login)).get()).exists)throw new Error('net');
}
const loginInfo=h=>ls.get('hush:login:'+h,null);
/* Which login this device uses is kept in two places: a plain localStorage note for speed, and the encrypted
   vault (prefs.login) so it survives a cleared or partitioned browser, exactly as recovery words do (prefs.rec).
   Without the vault copy, a login that is saved for good on the server (its reservation can never be deleted)
   looks like "Not set up" again the moment the local note is lost. rememberLogin writes both. */
function rememberLogin(h,rec){
  if(!rec||!rec.login)return;const v={login:rec.login};if(rec.loc)v.loc=rec.loc;
  ls.set('hush:login:'+h,v);
  if(S.me&&S.me.handle===h&&S.contactsReady){const p=P(),cur=p.login;
    if(!cur||cur.login!==v.login||cur.loc!==v.loc){p.login=v;saveContacts()}}
}
// On load, keep the two copies in step: push a local-only note up to the vault, or restore a lost note from it.
function reconcileLoginHint(local,vault){
  if(local&&local.login){if(!vault||vault.login!==local.login||vault.loc!==local.loc)return {toVault:{login:local.login,...(local.loc?{loc:local.loc}:{})}};return {}}
  if(vault&&vault.login)return {toLocal:{login:vault.login,...(vault.loc?{loc:vault.loc}:{})}};
  return {};
}
/* After a server reset the profile comes back by itself (republishSelf puts the keys back), so the login has to
   come back too, or nobody could log in with it again once this device logs out. The reservation is re-made from
   this device's copy of the login. The password box can't be, since the password never stays on the device: when
   it is gone as well, the password is asked for once more. Checked once per account per page load. */
const loginHealed=new Set();
async function healLogin(id){
  const h=id.handle,li=loginInfo(h);if(!S.db||!li||!li.login||loginHealed.has(h))return;loginHealed.add(h);
  try{const ref=S.db.doc('logins/'+await loginTag(li.login));if((await ref.get()).exists)return;
    await ref.set({ts:Date.now()});
    if(li.loc&&!(await S.db.doc('accounts/'+li.loc).get()).exists&&S.me===id){
      rememberLogin(h,{login:li.login});setTimeout(()=>{if(S.me===id)openSetupLogin('again')},700)}
  }catch{loginHealed.delete(h)}
}
async function rememberPw(login,pw){ // offers to save it in iCloud Keychain / Google Password Manager; Hush itself never stores it
  try{if(window.PasswordCredential&&navigator.credentials)await navigator.credentials.store(new PasswordCredential({id:login,password:pw,name:login}))}catch{}}
/* ===== HUSH AUTH END ===== */
/* ---------- telling the server who you are (SPEC.md 4.1) ----------
   The server sends a one-time challenge; this device signs it. The signature comes from this device's own key
   when the device is listed on your profile, otherwise from your account key (that is also how a brand-new
   username is claimed: the server then lets this connection create exactly that profile). Nothing about
   devices is stored on the server beyond the signed entries on your profile. */
async function proofFor(id){
  const sign=async(jwk,msg)=>b64u(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},await crypto.subtle.importKey('jwk',jwk,DS,false,['sign']),enc.encode(msg))));
  const d=id.dev&&id.dev.s&&id.dev.sigPriv?id.dev:null;
  return {h:id.handle,pub:{x:id.sig.x,y:id.sig.y},dev:d?d.id:'',signDev:d?m=>sign(d.sigPriv,m):null,signAcct:m=>sign(id.sigPriv,m)};
}
async function bindDevice(id){ // kept under its old name: every caller still awaits it before touching the account's records
  if(!S.db||!S.db.prove)return;
  await S.db.prove(await proofFor(id));
}
function bundleOf(id){return {v:1,handle:id.handle,disp:dispOk(id.disp,id.handle)?id.disp:undefined,name:id.name,kv:id.kv||1,ecdhPriv:id.ecdhPriv,ecdh:id.ecdh,sigPriv:id.sigPriv,sig:id.sig,own:typeof id.own==='string'&&OWN_RE.test(id.own)?id.own:undefined}}
function idFromBundle(o){
  if(!o||!validHandle(o.handle)||!o.ecdhPriv||!o.sigPriv||!o.ecdh||!o.sig||o.ecdhPriv.x!==o.ecdh.x||o.sigPriv.x!==o.sig.x)throw new Error('format');
  return {handle:o.handle,disp:dispOk(o.disp,o.handle)?o.disp:undefined,name:String(o.name||o.handle).slice(0,40),kv:o.kv||1,ecdhPriv:o.ecdhPriv,ecdh:o.ecdh,sigPriv:o.sigPriv,sig:o.sig,own:typeof o.own==='string'&&OWN_RE.test(o.own)?o.own:undefined};
}
async function linkKey(myPriv,theirPubJwk,secret){ // secret only travels inside the QR code, never through the server
  const pub=await crypto.subtle.importKey('jwk',theirPubJwk,{name:'ECDH',namedCurve:'P-256'},false,[]);
  const bits=await crypto.subtle.deriveBits({name:'ECDH',public:pub},myPriv,256);
  const hk=await crypto.subtle.importKey('raw',bits,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:secret,info:enc.encode('hush-link-v2')},hk,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
const ephemeral=()=>crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
const pubJwk=async k=>{const j=await crypto.subtle.exportKey('jwk',k.publicKey);return {kty:j.kty,crv:j.crv,x:j.x,y:j.y}};
const pubFp=async j=>b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(String(j.x)+'.'+String(j.y)))));
/* ---------- private inbox (SPEC.md 6) ----------
   Each person has a box of sealed pointers at inbox/<username>/c/<random id>. Anyone signed in may leave one, but
   only its owner can open it: it is locked to their account key and says which chat, from whom. The server sees a
   recipient and a blob, never which chat someone was added to, and it never holds a list of anyone's chats. */
const PTR_SALT=h=>'hush-inbox-v1:'+h;
async function dropPointer(h,payload){
  const pk=await senderKeys(h);if(!pk)throw new Error('nokey');
  const me=S.me.handle,ts=Math.floor(Date.now()/36e5)*36e5,body=Object.assign({},payload,{to:h,ts});
  if(body.t==='invite')body.sg=await sideSig('hush-drop-v1',['invite',me,h,String(body.cid),String(ts)]); // so nobody can claim someone else invited you
  const w=await wrapTo(enc.encode(padNote(body)),pk.ecdh,PTR_SALT(h));
  if(h===me){await S.db.doc('inbox/'+h+'/c/'+rid()).set(Object.assign(w,{ts}));return} // a note to yourself may go over your own connection
  await postDrop(h,w);
}
async function openPointer(d){
  const k=await aesKey(await myKey('e'),await pubKey(d.epk,'e'),PTR_SALT(S.me.handle));
  const o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(d.iv)},k,unb64(d.ct))));
  if(!o||typeof o.cid!=='string'||!/^(?:[gc][A-Za-z0-9]{12}|d[A-Za-z0-9_-]{22})$/.test(o.cid))throw new Error('format');return o;
}
