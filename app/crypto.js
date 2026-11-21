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
/* ---------- device keys ----------
   Each device has its own key pair that never leaves it and is never backed up. Chat keys are wrapped to a
   person's DEVICES, not to their account key. This is not forward secrecy: message backup, on by default for
   new accounts, keeps every chat key on the server sealed under a key derived from the account key alone, so the account
   keys (which the password box and the recovery words both hold) plus the server's data open all backed-up
   history. Only with backup off does a chat need a device that was in it (or was handed the keys by one).
   A device's entry on your profile is signed by your account key (your first device) or by one of your
   existing devices (one added with the QR handoff), so others know which devices are really yours. */
const devMsg=(h,d)=>enc.encode(['hush-dev-v1',h,d.id,d.ecdh.x,d.ecdh.y,d.sig.x,d.sig.y,d.by||''].join('|'));
const devEntry=d=>({x:d.ecdh.x,y:d.ecdh.y,sx:d.sig.x,sy:d.sig.y,by:d.by||'',s:d.s,ts:d.ts||Date.now(),...(d.nm?{nm:d.nm}:{})}); // nm: the device's name, sealed (sealDevName)
async function newDev(){const k=await newIdentity();return {id:rid().slice(0,12),ecdhPriv:k.ecdhPriv,ecdh:k.ecdh,sigPriv:k.sigPriv,sig:k.sig,by:'',s:'',ts:Date.now()}}
// Logging in again to an account this browser still holds (Add or restore account): the record it keeps, if its device
// key is for these very account keys. That key carries over, so the same browser stays one device on the profile. Only
// a key held here ever carries; another browser, or keys that moved on since, gets a new device as before.
function heldBy(id){const was=S.ids.find(x=>x&&x!==id&&x.handle===id.handle);
  return was&&was.dev&&was.dev.s&&sameKeys(was,id)&&(was.kv||1)===(id.kv||1)?was:null}
// Linked again where the account still is: the new device key replaces this browser's old one, which comes off the profile
// the way logging out takes it off (logOutAccount), since its private keys go with the record replaced here. Named only
// when the profile's entry carries exactly the keys this browser holds and no device was added from it; otherwise null,
// and it stays listed for Remove.
function replacedDev(was,id,devs){const o=was&&was!==id&&was.handle===id.handle&&was.dev,e=o&&devs&&devs[o.id];
  return o&&o.ecdh&&o.sig&&id.dev&&id.dev.id!==o.id&&e&&e.x===o.ecdh.x&&e.y===o.ecdh.y&&e.sx===o.sig.x&&e.sy===o.sig.y&&!Object.values(devs).some(v=>v&&v.by===o.id)?o.id:null}
async function ensureDev(id){ // this account's key for THIS device; a first device signs its own entry with the account key
  const was=id.dev?null:heldBy(id);if(was){id.dev=was.dev;id.trust=id.trust||was.trust}
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
        return (await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await pubKey(parent?parent.sig:pk.sig,'s'),unb64(e.s),devMsg(h,d)))&&await pubKey(d.ecdh,'e')?Object.assign(d,{ts:e.ts||0}):null}catch{return null}};
    for(let round=0;round<4;round++){let grew=false;for(const i of ids){if(ok.has(i))continue;const d=await check(i);if(d){ok.set(i,d);grew=true}}if(!grew)break}
    return [...ok.values()];
  })());
  return devCache.get(key);
}
async function publishDev(){ // put this device's entry on my profile (and forget devices nobody has used in four months)
  if(!S.db||!S.me||!S.me.dev||!S.me.dev.s||!S.dirReady||S.rekeying)return;const m=S.me,d=S.dir[m.handle];if(!d||(d.kv||1)>(m.kv||1))return;
  if(!m.dev.nm)try{m.dev.nm=await sealDevName(m.dev.id,deviceName())}catch{} // its name, for the other devices' notice
  const e=devEntry(m.dev),cur=d.devs&&d.devs[m.dev.id];
  if(cur&&cur.x===e.x&&cur.s===e.s&&cur.nm===e.nm&&Date.now()-(cur.ts||0)<864e5)return;
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
/* "Message backup": on from the start for new accounts (accounts from before keep their choice). When it's on, the
   chat-key store is also kept on the server in a box that only your account keys can open, so logging in on a new
   device with your password or recovery words brings past messages back too. Off means a new device that logs in that
   way starts with empty chats. A save merges, never replaces: the device takes the keys the backup has and adds the
   ones it lacks, and each write names the version it merged, so two devices saving at once can't drop each other's
   keys. Every app open does the same. */
const backupOn=()=>!!(S.prefs&&S.prefs.backup);
function backupKey(id){const k='backup:'+id.handle;
  if(!S.chanKeys.has(k))S.chanKeys.set(k,(async()=>aesKey(await crypto.subtle.importKey('jwk',id.ecdhPriv,EC,false,['deriveBits']),await pubKey(id.ecdh,'e'),'hush-backup:'+id.handle))());
  return S.chanKeys.get(k)}
let backupT=null;
function scheduleBackup(){if(!backupOn()||!S.db||S.rekeying)return;clearTimeout(backupT);backupT=setTimeout(()=>syncBackup().catch(()=>{}),2500)}
async function backupKeys(id,v){ // the key store inside a backup; null when this account can't open it
  try{const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:enc.encode('backup|'+id.handle)},await backupKey(id),unb64(v.ct));
    const o=JSON.parse(dec.decode(pt));return o&&o.v===1&&o.ks&&typeof o.ks==='object'?o.ks:null}catch{return null}}
function mergeKeys(into,from){let n=0; // adds the keys `into` lacks; a key already there is never replaced
  for(const [cid,es] of Object.entries(from||{})){if(!es||typeof es!=='object')continue;
    for(const [e,raw] of Object.entries(es)){if(typeof raw!=='string'||!/^[A-Za-z0-9+/=]{40,48}$/.test(raw)||(into[cid]&&into[cid][e]))continue;(into[cid]=into[cid]||{})[e]=raw;n++}}
  return n}
async function syncBackup(){ // both ways; gives back how many keys this device gained
  if(!S.db||!S.me||!backupOn()||S.rekeying)return 0;const me=S.me,ref=S.db.doc(await backupPath(me));let got=0; // not while the keys are being replaced: the backup moves once they are
  for(let i=0;i<6;i++){
    const s=await ref.get(),v=s.exists?s.data():null,theirs=v?await backupKeys(me,v):{};if(S.me!==me||!backupOn())return got; // nothing is written once it's turned off
    if(!theirs){badBackupNotice();return got} // one this account can't open is left alone, and said so once
    if(!v&&(await backupStillOn(me.handle))!==true)return got; // creating one from nothing: the setting as the server has it, in case another device turned it off since this page loaded
    const mine=ksMap(),n=mergeKeys(mine,theirs);if(n){ls.set(ksKey(),mine);got+=n}
    const all=JSON.parse(JSON.stringify(theirs));if(!mergeKeys(all,mine))return got; // the backup already has every key here
    const iv=crypto.getRandomValues(new Uint8Array(12)),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('backup|'+me.handle)},await backupKey(me),enc.encode(JSON.stringify({v:1,ks:all})));
    try{await ref.set({iv:b64(iv),ct:b64(ct),ts:Math.max(Date.now(),((v&&v.ts)||0)+1)},{was:(v&&v.ts)||0});return got}
    catch(e){if(!(e&&e.code==='conflict'))throw e;await new Promise(r=>setTimeout(r,200+Math.random()*800))} // another device wrote in between: merge again
  }
  return got}
async function restoreBackup(id){ // on a fresh login or recovery: bring back the saved chat keys, if "Message backup" was on
  try{const rd=async()=>S.db.doc(await backupPath(id)).get();let s;try{s=await rd()}catch{await new Promise(r=>setTimeout(r,800));s=await rd()} // the sign-in may still be settling
    if(!s.exists)return 0;const ks=await backupKeys(id,s.data());if(!ks)return 0;
    const key='hush:ks:'+id.handle,m=ls.get(key,{}),n=mergeKeys(m,ks);ls.set(key,m);S.ksFor=null;return n;
  }catch{return 0}}
async function safetyNumber(a,b,override){
  const src=[a,b].sort().map(h=>{const d=(override&&override[h])||peerKeys(h);return [h,d.ecdh.x,d.ecdh.y,d.sig.x,d.sig.y].join(',')}).join('|');
  const h=new Uint8Array(await crypto.subtle.digest('SHA-512',enc.encode(src)));const out=[];
  for(let i=0;i<12;i++){const o=i*5;const v=(h[o]*2**32+h[o+1]*2**24+h[o+2]*65536+h[o+3]*256+h[o+4])%100000;out.push(String(v).padStart(5,'0'))}
  return out;
}
async function vaultPath(handle){ // the contact vault lives at an address only its owner can work out
  S._vp=S._vp||{};if(S._vp[handle])return S._vp[handle];
  return S._vp[handle]=await vaultPathOf(S.me);
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
async function dmIdFromSecret(peer,s){const h=await crypto.subtle.digest('SHA-256',new Uint8Array([...enc.encode(peer===S.me.handle?'hush-dmid-v1|self|':'hush-dmid-v1|'),...s]));return 'd'+b64u(h).slice(0,22)} // the id a DM gets from the secret it began with
async function dmIdFor(peer){
  const c=dmIds.get(peer);if(c)return c;
  // After either side's account keys changed the derivation would name a chat that doesn't exist: the alias the vault
  // keeps for each DM (prefs.dms), or the DM already in the chat list, names the conversation that does (SPEC.md 5.3).
  const known=S.contactsReady&&dmInfo?Object.entries((S.prefs&&S.prefs.dms)||{}).find(([cid,i])=>i&&i.peer===peer&&/^d[A-Za-z0-9_-]{22}$/.test(cid)):null;
  let id=known?known[0]:null;
  if(!id){const k=(S.convs||[]).find(x=>typeOf(x)==='dm'&&dmPeer(x)===peer);if(k)id=k.id}
  if(!id){const s=await dmSecret(peer);if(!s)return null;id=await dmIdFromSecret(peer,s)}
  if(S.contactsReady)dmIds.set(peer,id);S.dmPeers[id]=peer;return id} // not remembered before the vault is in: the alias isn't known yet
/* Key wraps: one sealed copy of a chat key per device of each member, filed under a random label. A device finds
   its own copy by trying each one (SPEC.md 5.3), so the server never sees which label belongs to whom.
   The salt a wrap is made with names the chat, the person, their device and, since stage 7, the epoch: a wrap copied
   into another epoch then opens to nothing. Wraps made before that used `cid:handle[:deviceId]` and are still tried,
   second; the replay rule in convKey covers them. The admin secret's wraps have no epoch and keep the old salt. */
const wrapSalt=(base,e,handle,dev)=>e===undefined?base+':'+handle+(dev?':'+dev:''):'hush-wrap-v2|'+base+'|'+Number(e)+'|'+handle+'|'+(dev||'');
async function wrapKey(raw,handle,base,e){
  if(handle!==S.me.handle&&typeof keyChanged==='function'&&keyChanged(handle))return {}; // a key this device hasn't accepted: its devices can't be checked, and the fallback would wrap to the old account key
  if(handle!==S.me.handle&&S.dir[handle]&&S.dir[handle].gone)return {}; // a deleted account keeps its public keys for old signatures only: nothing is locked to it any more
  const pk=peerKeys(handle);if(!pk)throw new Error('nokey');
  const devs=await verifiedDevs(handle),out={};
  if(!devs.length)try{out[rid22()]=await wrapTo(raw,pk.ecdh,wrapSalt(base,e,handle))}catch{} // no device on their profile yet: to the account key (one that doesn't import gets nothing, rather than stopping the key change)
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
async function unwrapMine(map,base,e,want){ // try every wrap with this device's key, then with the account key; the epoch's salt first, then the old one (up to epoch 31: no wrap above it was ever made with it); want: only a secret it passes (verifiedAdmin)
  const me=S.me.handle,dev=S.me.dev&&S.me.dev.ecdhPriv?S.me.dev:null;
  const privs=[];if(dev)privs.push([await devKey('e'),dev.id]);privs.push([await myKey('e'),'']);
  const salts=d=>e===undefined?[wrapSalt(base,undefined,me,d)]:Number(e)>31?[wrapSalt(base,e,me,d)]:[wrapSalt(base,e,me,d),wrapSalt(base,undefined,me,d)];
  for(const w of Object.values(map||{})){if(!w||!w.epk||!w.iv||!w.ct)continue;
    for(const [priv,d] of privs){let bits;try{bits=await crypto.subtle.deriveBits({name:'ECDH',public:await pubKey(w.epk,'e')},priv,256)}catch{continue} // one agreement per wrap, then each salt
      for(const salt of salts(d)){let raw;try{const k=await aesKeyFrom(bits,salt);raw=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(w.iv)},k,unb64(w.ct)))}catch{continue}if(!want||await want(raw))return raw}}}
  return null;
}
function convKey(c,e=epochOf(c)){
  if(!c)return Promise.resolve(null);
  if(typeOf(c)==='dm'&&Number(e)===0)return (async()=>{ // one-on-one, key number 0: the fixed key the two account keys gave when the chat began, kept through a key change (dmBaseBits)
    let bits=null;try{bits=await dmBaseBits(c)}catch{}if(!bits)return null;
    const ck=['dm',S.me.handle,c.id,b64(bits).slice(0,12)].join(':');
    if(!S.chanKeys.has(ck))S.chanKeys.set(ck,aesKeyFrom(bits,c.id).then(key=>({raw:null,key}),()=>null));
    return S.chanKeys.get(ck)})();
  // the record's openKeys (the server writes them) are read in a channel alone: the record says channel and the address starts with c, which the page gives a channel itself; a one-on-one chat (d) and a group (g) never take a key from the record, whatever it says it is
  // a private channel takes them only for an epoch this device holds no key of its own for, stored or in a wrap of mine
  const o=typeOf(c)==='channel'&&String(c.id)[0]==='c'&&c.openKeys&&c.openKeys[e],pv=!!o&&typeOf(c)==='channel'&&c.visibility!=='public',st=ksGet(c.id,e);
  const open=pv&&(st||Object.keys(keyMap(c,e)||{}).length)?null:o,stored=!open&&st,km=!open&&!stored?keyMap(c,e):null;
  if(!open&&!stored&&!(km&&Object.keys(km).length))return walkable(c,e)?walkTo(c,e):Promise.resolve(null);
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
  const got=S.chanKeys.get(ck);return km&&(pv||walkable(c,e))?got.then(k=>k||(pv?convKey(Object.assign({},c,{keys:Object.assign({},c.keys,{[e]:null})}),e):walkTo(c,e))):got; // wraps, none of them mine: openKeys, else the key chain
}
/* The key chain walked back, lazily: a private channel's older key this device lacks comes from the rows between it and
   the lowest key held above it, each row's `b` opened under the key above and followed only from a commit that opens and
   says `full` (rows are authenticated by the key above them, so no signature is checked here). A key that differs from
   one held stops every walk in the channel (walkBad, "broken key history"). Only once the connection holds the chat:
   rows need a level, and opening the chat (capsFor) reads older keys itself. */
const walkable=(c,e)=>typeOf(c)==='channel'&&c.visibility!=='public'&&Number(e)<epochOf(c)&&!!(S.db&&S.db.chatLevel&&S.db.chatLevel(c.id));
const walks=new Map(),walkBad=new Set(); // per channel: the walk in flight; a broken history
const walkWait=new Map(); // per channel: until when no walk is tried
function walkTo(c,e){const cid=c.id;e=Number(e);
  if(walks.has(cid))return walks.get(cid).then(()=>ksGet(cid,e)?convKey(c,e):walkTo(c,e)); // one at a time: a later caller reads what it stored
  if(walkBad.has(cid)||(walkWait.get(cid)||0)>Date.now())return Promise.resolve(null);
  const job=(async()=>{
    const held=ksMap()[cid]||{},top=Math.min(...Object.keys(held).filter(x=>/^\d+$/.test(x)&&Number(x)>e).map(Number));if(top===Infinity)return;
    const ps=[],rows=[];for(let j=e;j<=top;j++)ps.push('channels/'+cid+'/chain/'+j);
    for(let i=0;i<ps.length;i+=300){if(!S.db.chatLevel(cid))return; // the chat was lost meanwhile (an eviction, a dropped connection): a read would open it again, maybe from inside opening it (capsFor), and wait on itself
      for(const d of await S.db.mgetChat(cid,ps.slice(i,i+300)))rows.push(d.exists?d.data():null)} // rows[j-e]
    if(rows.some(Boolean))noteChained(cid);
    let k=unb64(held[top]),j=top;
    for(;j>e;j--){const r=rows[j-e],o=r&&r.b?await openCommit(cid,j,k,r.c):null;if(!o||o.m!=='full')break; // a gap, or a row this page doesn't follow
      const p=await openBack(cid,j,k,r.b),pb=p&&b64(p),was=ksGet(cid,j-1);
      if(!p||was&&was!==pb||Object.entries(ksMap()[cid]||{}).some(([x,v])=>x!==String(j-1)&&x!=='a'&&x!=='b'&&v===pb)){walkBad.add(cid);return} // differs from a key held, or is one held for another epoch
      ksPut(cid,j-1,pb);k=p}
    if(j>e){walkWait.set(cid,Date.now()+30e3);return} // shortcut: the chain ends above it, so every other post below waits 30 s too instead of reading the same rows again; enough until rows are backfilled while a page is open
    const r=rows[0],h=e>0&&ksGet(cid,e-1);if(r&&r.b&&h){const p=await openBack(cid,e,k,r.b);if(!p||b64(p)!==h)walkBad.add(cid)} // the row of e itself, against a key held below it
  })().catch(err=>{if(err&&['offline','ratelimit','timeout','denied'].includes(err.code))walkWait.set(cid,Date.now()+30e3)}).finally(()=>walks.delete(cid)); // denied: the rows were refused, so no one else asks again at once
  walks.set(cid,job);return job.then(()=>ksGet(cid,e)?convKey(c,e):null)}
/* ---------- room keys (SPEC.md 5.1): what the server needs to see before it lets a connection into a chat ----------
   The member key is worked out from the chat key, so whoever can read a chat can prove it; the admin key from a
   separate secret only admins hold; the owner key from the owner's own account key. The server keeps hashes. */
async function hkdf(ikm,salt,info){const k=await crypto.subtle.importKey('raw',ikm,'HKDF',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:enc.encode(salt),info:enc.encode(info)},k,256))}
async function memberCapFrom(cid,e,raw){return b64u(await hkdf(await hkdf(raw,'hush-caproot-v1',cid+'|'+e),'hush-cap-v1','member'))}
/* The key chain (SPEC.md 5.6 "Key chain"): a private channel's row for epoch e holds `c`, the signed commit of that epoch's
   key sealed under it, and from epoch 1 `b`, the key before it sealed under a key worked out from this one. So one key
   opens every key before it, and a joiner needs only the current one. */
async function subKey(raw,label,info){return crypto.subtle.importKey('raw',await hkdf(raw,label,info),'AES-GCM',false,['encrypt','decrypt'])}
async function chainRow(cid,e,raw,prev){ // {b,c}; {c} at epoch 0 or without the key before
  const key=await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['encrypt']),H=b64u(await hkdf(raw,'hush-commit-v1',cid+'|'+e));
  const c=b64(await sealRaw(key,enc.encode('hush-rot-v1|'+cid+'|'+e),enc.encode(JSON.stringify({f:S.me.handle,m:'full',s:await sideSig('hush-rot-v1',[cid,String(e),H,'full'])}))));
  return Number(e)>0&&prev?{b:b64(await sealRaw(await subKey(raw,'hush-back-v1',cid+'|'+e),enc.encode('hush-back-v1|'+cid+'|'+e),prev)),c}:{c}}
async function openCommit(cid,e,raw,c){ // {f,m,s}, or null when it doesn't open under this key
  try{const x=JSON.parse(dec.decode(await openRaw(await crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']),enc.encode('hush-rot-v1|'+cid+'|'+e),unb64(c))));
    return x&&typeof x.f==='string'&&typeof x.m==='string'&&typeof x.s==='string'?{f:x.f,m:x.m,s:x.s}:null}catch{return null}}
async function openBack(cid,e,raw,b){ // the key of epoch e-1, or null
  try{const p=await openRaw(await subKey(raw,'hush-back-v1',cid+'|'+e),enc.encode('hush-back-v1|'+cid+'|'+e),unb64(b));return p.length===32?p:null}catch{return null}}
/* Before a private channel's current key seals a post, comment, service note or meta, or is handed on in a link or a wrap
   (sealKey), its row's commit must check out; reactions, votes, read marks, typing dots and member cards are not held back.
   It opens under that key and names it (H), it is signed by a key of the signer this device hasn't seen change, and the
   signer is the owner or an admin as this device's roles record counts them now (rolesPass). A missing row passes only on a
   device that never saw the channel chained, and only while the row before is missing too. The row, the commit and the
   signature are kept with the keys, so accepting a new security code (acceptKey) checks again; who counts is never kept: it
   is decided at every call, so a corrected record or a key loaded since takes effect at the next seal with nothing cleared.
   `strict` (the backfill's replace, ensureChain): no first sight, the owner must be on record. */
const okKey=(cid,e,raw)=>'ok:'+S.me.handle+':'+cid+':'+e+':'+b64(raw).slice(0,16);
function headOk(c,e,raw,strict,again){const cid=c.id,k=okKey(cid,e,raw)+(strict?':s':''); // kept apart: a first-sight pass (or keyMade) never stands in for a strict one; again: the row read once more after a refusal (below)
  if(!S.chanKeys.has(k))S.chanKeys.set(k,(async()=>{
    const row=async j=>{try{return await S.db.doc('channels/'+cid+'/chain/'+j).get()}catch(err){S.chanKeys.delete(k);throw err}}; // unsure (offline, say): checked again at the next seal
    const d=await row(e);
    if(!d.exists)return !(Number(e)>0&&(await row(e-1)).exists)&&!(rolesOf(cid)||{}).ch;
    noteChained(cid);
    const o=await openCommit(cid,e,raw,d.data().c);if(!o||o.m!=='full')return false;
    const H=b64u(await hkdf(raw,'hush-commit-v1',cid+'|'+e)),sd=[cid,String(e),H,'full'];
    if(typeof keyChanged==='function'&&keyChanged(o.f))return false;
    if(!(await senderKeys(o.f))){S.chanKeys.delete(k);return false} // the signer's keys could not be read (the profile did not load): unsure, not refused for good; checked again at the next seal
    let ok=(await sideOk(o.f,o.s,'hush-rot-v1',sd,0,false))===true; // the signer's current key only: never a replaced one ('prev'), nor a pinned one the directory has moved on from
    // A device removal replaces this account's key before the chat keys: while it runs, a commit under the key it replaced, as
    // this device itself had it (never the server's history of it), lets the removal change them. Not kept: checked again after.
    const was=!ok&&o.f===S.me.handle&&S.rekeying&&S.me.prev&&S.me.prev.sig;
    if(was){try{ok=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await pubKey(was,'s'),unb64(o.s),enc.encode('hush-rot-v1|'+sd.join('|')))}catch{}if(ok)S.chanKeys.delete(k)}
    if(!ok)return false;
    return o.f})()); // the signer whose commit checks out; who counts is decided below, fresh at every call (rolesPass)
  return S.chanKeys.get(k).then(async f=>{if(typeof f!=='string')return f;if(await rolesPass(c,f,strict)){if((rolesOf(cid)||{}).o)noteHi(cid,e);return true}if(again)return false;S.chanKeys.delete(k);return headOk(c,e,raw,strict,1)})} // a cached signer refused: the row is read once more, since the owner may have signed its commit again meanwhile (Remove admin: setAdmins' sign), then refused for good; a pass with the owner on record raises the mark (hi): a first-sight pass raises none, so a key planted then can't lock the channel afterwards
// hk, the owner key a record was taken under, is still hers as this device holds it now, and this device hasn't seen her key change without accepting it (verifiedAdmin's rule)
async function hkNow(r){if(!r.hk||typeof keyChanged==='function'&&keyChanged(r.o))return false;const o=await senderKeys(r.o);return !!o&&r.hk===(o.sig||{}).x}
// The roles part of a key commit's check (headOk), decided at every call and never kept: the owner always; an admin from a list taken under her key as this
// device holds it now (hkNow), on her own page, or while this device runs its own removal (S.rekeying); an unsigned record (a copy this device could not verify, or
// a channel from before release 92 the owner hasn't signed yet) counts no admin (owner decision D1); else the
// channel's owner part is read once more (a copy under her new key is noted on demand: readMeta, noteRoles) and the record read again; no record: first sight (strict: refused)
async function rolesPass(c,f,strict){const cid=c.id;for(let n=0;;n++){await rolesQ.get(cid);const r=rolesOf(cid);if(!r||!r.o)return !strict;if(f===r.o)return true;
  if(!(r.a||[]).includes(f))return false;if(r.o===S.me.handle||S.rekeying||await hkNow(r))return true;
  if(n||!c.ometa)return false;await readOMeta(c)}}
const keyMade=(cid,e,raw)=>{noteHi(cid,e);return S.chanKeys.set(okKey(cid,e,raw),Promise.resolve(true))}; // a key this page made, or took from a link (trusted by the way it came); it raises the mark (hi) too
async function sealKey(c,e,own){ // convKey, for sealing or handing on (SPEC.md 5.6 "Key chain"); own: the owner's part (ometa), which sits at any epoch up to the current one and holds nothing a removed member lacks, so a copy behind the mark seals it all the same
  if(!own&&Number(e)<hiOf(c))throw Object.assign(new Error('rollback'),{code:'conflict'}); // below the mark (hi): refused before any key is looked up; 'conflict', so a key change redone from a fresh record on it (kickMember, revokeRekey, a removal) reads again first, and a copy merely behind another tab's check goes through then
  const ck=await convKey(c,e);if(!ck)return null;
  if(typeOf(c)==='channel'&&c.visibility!=='public'&&Number(e)===epochOf(c)&&!(await headOk(c,e,ck.raw)))throw new Error('badkey');
  return ck}
async function adminCapFrom(cid,secret){return b64u(await hkdf(secret,'hush-cap-v1','admin|'+cid))}
async function ownerCap(cid){return b64u(await hkdf(ownIkm(S.me),'hush-cap-v1','owner|'+cid))}
async function memberCap(c,e){
  if(typeOf(c)==='dm'&&Number(e)===0){const s=await dmSecret(dmPeer(c));return s?memberCapFrom(c.id,0,s):null}
  const k=await convKey(c,e);return k&&k.raw?memberCapFrom(c.id,e,k.raw):null}
const adminCache=new Map();
async function adminSecret(c){ // the admin secret, if this device can unwrap it from the record's current akeys; a private channel's: the one its owner signed first (verifiedAdmin), any other only for the server's admin key, and never kept
  if(!c.akeys){const kept=ksGet(c.id,'a');return kept?unb64(kept):null}
  const pc=typeOf(c)==='channel'&&c.visibility!=='public',v=pc&&await verifiedAdmin(c,true);if(v)return v;
  const k=S.me.handle+':'+((S.me.dev&&S.me.dev.id)||'')+':'+c.id+':'+JSON.stringify(c.akeys);
  if(!adminCache.has(k))adminCache.set(k,unwrapMine(c.akeys,c.id+'#a').then(raw=>{if(raw&&!pc)ksPut(c.id,'a',b64(raw));return raw},()=>null));
  return adminCache.get(k)}
// Anyone holding a device's public key can make a wrap that opens for it, so a server can slip a secret of its own into akeys.
// A private channel's admin secret counts for sealing a link's secret or opening an `as` only when its fingerprint (`ah`) is
// the one the owner signed into this device's roles record (SPEC.md 5.6 "Key chain"): else null, never another one.
// held: by the record as this device holds it right now, neither reading c's ometa into it nor waiting for one being noted (adminSecret: it runs while the chat is being opened, capsFor)
// want: another fingerprint instead, this device's own new one whose signed list hasn't landed (signAdminId)
const adminId=async(cid,raw)=>b64u(await hkdf(raw,'hush-admin-id-v1',cid));
async function verifiedAdmin(c,held,want){
  if(!c||typeOf(c)!=='channel'||c.visibility==='public'||!c.akeys)return null;if(!held){if(c.ometa)await readOMeta(c);await rolesQ.get(c.id)}
  const r=rolesOf(c.id)||{},o=!want&&r.s&&r.h&&!(typeof keyChanged==='function'&&keyChanged(r.o))&&(held?peerKeys(r.o):await senderKeys(r.o)),h=want||o&&r.hk&&r.hk===(o.sig||{}).x&&r.h;if(!h)return null; // only while the owner key that checked it (hk) is still hers as this device holds it, and not while it has seen her key change without accepting it (rolesOk and headOk refuse her then too): after she replaced it (a device removal), none a lost device of hers signed before, nor the one from before, which it knew (held: her key as already loaded, no fetch)
  const k='v:'+S.me.handle+':'+((S.me.dev&&S.me.dev.id)||'')+':'+c.id+':'+h+':'+JSON.stringify(c.akeys);
  if(!adminCache.has(k))adminCache.set(k,unwrapMine(c.akeys,c.id+'#a',undefined,async raw=>(await adminId(c.id,raw))===h).then(raw=>{if(raw)ksPut(c.id,'a',b64(raw));return raw},()=>null));
  return adminCache.get(k)}
const postData=(cid,p)=>enc.encode([cid,p.from,p.ts,p.iv,p.ct].concat(p.e!=null?[p.e]:[]).concat(p.exp?['x'+p.exp]:[]).join('|'));
async function sealPost(c,text,ts,exp){
  const e=epochOf(c),ck=await sealKey(c,e);if(!ck)throw new Error('nokey');
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
async function ownTok(cid,pid,k){return ownTokAs(S.me,cid,pid,k)}
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
   so nobody can leave a mark under somebody else's tag. From release 18 that signature travels inside the
   encryption, as a message's does: the server keeps a time and a sealed blob, and nothing it stores can be checked
   against anyone's account key. */
const tagCache=new Map();
function memTag(c,e,h){const k=c.id+'|'+e+'|'+h;
  if(!tagCache.has(k))tagCache.set(k,(async()=>{const ck=await convKey(c,e);if(!ck){tagCache.delete(k);return null}
    return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-tag-v1|'+c.id+'|'+b64(ck.raw)+'|'+h)))).slice(0,22)})());
  return tagCache.get(k)}
async function tagMap(c,e){const out={};for(const h of new Set(c.members||[])){const t=await memTag(c,e,h);if(t)out[t]=h}return out}
const sideSig=async(label,parts)=>b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},await myKey('s'),enc.encode(label+'|'+parts.join('|'))));
const sideAD=(label,cid,tag)=>enc.encode(label+'|'+cid+'|'+tag);
async function sealSide(c,e,tag,label,ts){ // a seen mark or typing dot: its time, and the signature sealed under the chat key
  const ck=await convKey(c,e);if(!ck)throw new Error('nokey');const iv=crypto.getRandomValues(new Uint8Array(12));
  return {ts,iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:sideAD(label,c.id,tag)},ck.key,enc.encode(await sideSig(label,[c.id,tag,ts]))))}}
async function sideSigOf(c,e,tag,label,v){ // the signature inside a sealed mark, or the plain one an app from before release 18 left
  if(!v.ct)return v.sg;
  try{const ck=await convKey(c,e);if(!ck)return null;return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:sideAD(label,c.id,tag)},ck.key,unb64(v.ct)))}catch{return null}}
const dirMiss=new Map(); // handles whose profile was not found, and when: no point asking again for a minute
async function senderKeys(h){ // the public keys of whoever signed something; fetched on demand for a person this page has never looked up
  let s=peerKeys(h);
  if(!s&&validHandle(h)&&(dirMiss.get(h)||0)<Date.now()-60000){await loadDir([h]);s=peerKeys(h);if(!s)dirMiss.set(h,Date.now())}
  return s;
}
async function sideOk(h,sg,label,parts,ts,allowPrev){return verifyBy(h,sg,enc.encode(label+'|'+parts.join('|')),ts,!!allowPrev)} // allowPrev: a key h had when the thing was dated also counts
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
  const e=epochOf(c),ck=await sealKey(c,e);if(!ck)throw new Error('nokey');
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
    const ok=await sideOk(o.f,o.sg,'hush-svc-v1',[c.id,o.k,String(o.v||0),String(p.ts)],p.ts,true);if(!ok)return null;
    return Object.assign({svc:o.k,from:o.f,v:Number(o.v)||0},ok==='prev'?{prev:1}:{}); // prev: signed by a key its author has since replaced: shown, never acted on
  }catch{return null}})());
  const x=await unsealCache.get(key);if(!x)unsealCache.delete(key);
  return x?Object.assign({},p,x):Object.assign({},p,{svc:'',from:'',_hide:true});
}
const unsealAll=(c,a)=>Promise.all((a||[]).map(p=>p&&p.sv===1?unsealSvc(c,p):unsealPost(c,p)));
/* Member cards (SPEC.md 5.6, release 92): a private channel's subscriber says "I joined by link", "I left" or "my device
   was removed" with a card an admin's page acts on (rollRun), since a channel takes no posts from subscribers. Every card
   is the same size, sealed under the epoch's key, and signed inside by its author. */
const cardAD=(cid,e)=>enc.encode('hush-card-v1|'+cid+'|'+e);
const actAD=(cid,post,kind)=>enc.encode('hush-act-v3|'+cid+'|'+post+'|'+kind); // a channel's reaction or vote: not the slot, which the page doesn't know before sealing
const cardData=(cid,x)=>enc.encode(['hush-card-v1',cid,x.k,x.e,x.i,x.ts].join('|'));
// A link joiner's `m`: from the link's secret, over the channel, the link and the author, so no one without the secret can say
// someone came by that link. Not over the epoch or time, so the joiner's page can write the same one again later (healCard).
const joinMac=async(secret,cid,iid,f)=>b64u(await hkdf(secret,'hush-join-mac-v1',[cid,iid,f].join('|')));
async function sealCard(c,k,i,m){
  const e=epochOf(c),ck=await convKey(c,e);if(!ck)throw new Error('nokey');
  const iv=crypto.getRandomValues(new Uint8Array(12)),x={f:S.me.handle,k,e,i:i||'',ts:Date.now()};if(m)x.m=m;
  x.sg=await sideSig('hush-card-v1',[c.id,k,String(e),x.i,String(x.ts)]);
  return {e,iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:cardAD(c.id,e)},ck.key,enc.encode(padNote(x,512))))}}
async function openCard(c,row){ // the card's fields, or null; its signature is checked only where it would act (cardSigOk)
  try{const ck=row&&Number.isInteger(row.e)?await convKey(c,row.e):null;if(!ck)return null;
    const x=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(row.iv),additionalData:cardAD(c.id,row.e)},ck.key,unb64(row.ct))));
    return x&&HANDLE_RE.test(x.f)&&['join','leave','dev','adm'].includes(x.k)&&x.e===row.e&&typeof x.i==='string'&&/^[A-Za-z0-9]{0,20}$/.test(x.i)&&Number.isFinite(x.ts)&&typeof x.sg==='string'?{f:x.f,k:x.k,e:x.e,i:x.i,ts:x.ts,sg:x.sg,m:typeof x.m==='string'?x.m:''}:null}catch{return null}}
// By the author's key in the directory as loaded just now (loadDir(…,true)), not a pin: a stale pin would block the card of
// anyone who replaced a key, and would take a lost device's old one.
async function cardSigOk(c,x){const d=S.dir[x.f];if(!d||!d.sig)return false;
  try{return await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await pubKey(d.sig,'s'),unb64(x.sg),cardData(c.id,x))}catch{return false}}
/* A private group's or channel's name, description and photo are locked with the group's own key, so the
   server only ever stores gibberish ("meta"). Public channels stay readable so people can find them.
   showMeta() makes a separate on-screen copy with the readable values. That copy is never saved back. */
const metaCache=new Map();
// `o`: the owner's part only (name, description, photo, owner, admins), kept in `ometa`, which only the owner key may
// write (SPEC.md 5.3). Its own additional data, so neither blob can be passed off as the other. Meta with its epoch in the
// additional data (v2, given `e`) is read from release 92 and written from release 93b, whose go-live step reloads every
// page that reads only v1 (such a page would show an empty member list, and a group's next join note would rewrite it).
const metaAD=(cid,o,e)=>enc.encode(o?'hush-ometa-v1|'+cid:e!==undefined?'hush-meta-v2|'+cid+'|'+e:'hush-meta-v1|'+cid);
const HANDLE_RE=/^[a-z0-9_]{3,20}$/;
const handleList=a=>Array.isArray(a)?a.filter(h=>typeof h==='string'&&HANDLE_RE.test(h)):[];
async function sealMeta(cid,e,raw,v,o){ // name, description, photo AND who is in the chat: all locked with the chat key (SPEC.md 5.3)
  const key=await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt']),iv=crypto.getRandomValues(new Uint8Array(12));
  const x={name:String(v.name||''),desc:String(v.desc||''),photo:v.photo||null,owner:v.owner||'',admins:handleList(v.admins)};
  if(!o)Object.assign(x,{members:handleList(v.members),banned:handleList(v.banned)});
  else{await rolesQ.get(cid);const r=rolesOf(cid)||{},t=r.t,nh=v._ah!=null,mine=r.hk===S.me.sig.x,ah=nh?v._ah:r.s&&mine&&r.h; // mine: the record's fingerprint was taken under this account's current key; one taken under a key since replaced (a device removal) is neither signed again nor outdone by its `at` (a lost device's, however far ahead, noteRoles); o 'keep': sealed again under a new key (adoptOMeta), at the record's time, only from a signed record (a list this device could not verify is never signed by itself: owner decision D1) and only while the record is the one the copy was read against (_rt, showMeta)
    if((o==='keep'||o==='next')&&(!r.s||v._rt!==t)||o===true&&rolesHeld(cid))throw new Error('nokey');x.rt=o==='keep'?t:o==='next'?t+1:Math.max(Date.now(),(r.t||0)+2); // 'next': a list the page changes by itself (rollRun's admin step), just after the record's time, so it outranks no later owner change a device kept from this one made; any other: later than any copy this device saw and than a 'next' from it, so one sent again can't undo it (noteRoles), and none while a copy of her list waits here past the date limit (rolesHeld); no record's t or ht was noted more than the date limit ahead (rolesAhead), so these stay near her clock
    if(ah)Object.assign(x,{ah,at:nh?Math.max(Date.now(),(mine&&r.ht||0)+1):r.ht||0}); // the admin secret's fingerprint and when it was named: a new one only from the page that just made the secret (_ah, never a copy's; '' names none), else the signed record's
    x.rs=await sideSig('hush-roles-v1',rolesData(cid,e,x))} // the owner's signature over who the owner and admins are, the admin secret, and when
  return {e,iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:metaAD(cid,o,e)},key,enc.encode(JSON.stringify(x))))};
}
async function sealMetaFor(c,v,o){const e=epochOf(c),k=await sealKey(c,e,!!o);if(!k||!k.raw)throw new Error('nokey');return sealMeta(c.id,e,k.raw,v,o)}
const sealOMeta=(cid,e,raw,v)=>sealMeta(cid,e,raw,v,true),sealOMetaFor=(c,v,keep)=>sealMetaFor(c,v,keep==='next'?keep:keep?'keep':true);
async function readMeta(c,raws,o){ // the readable description and member list, or null if this device can't unlock it
  const m=c&&(o?c.ometa:c.meta);if(!m||typeof m.iv!=='string'||typeof m.ct!=='string')return null;
  // Sealed under another epoch than the record's: a stale copy (the server keeps meta re-sealed at every rotation),
  // which would show a member list from before someone was removed and have the next rotation wrap for them again.
  // The owner's part is not re-sealed at rotations: any epoch up to the current one.
  if(o?!(Number.isInteger(m.e)&&m.e>=0&&m.e<=epochOf(c)):Number(m.e)!==epochOf(c))return null;
  const ck=(o?'o:':'')+(S.me?S.me.handle:'')+':'+c.id+':'+m.e+':'+m.iv; // per account: reading a copy notes it into that account's roles record (noteRoles), so a second account signed in on this page reads each copy again
  if(!metaCache.has(ck))metaCache.set(ck,(async()=>{try{
    let key;
    if(raws&&raws[m.e])key=await crypto.subtle.importKey('raw',unb64(raws[m.e]),{name:'AES-GCM'},false,['decrypt']);
    else{const k=await convKey(c,m.e);if(!k)return null;key=k.key}
    let pt=null;for(const ad of o?[metaAD(c.id,true)]:[metaAD(c.id,false,m.e),metaAD(c.id,false)])if(!pt)try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(m.iv),additionalData:ad},key,unb64(m.ct))}catch{} // meta: v2 first, then v1
    if(!pt)return null;const v=JSON.parse(dec.decode(pt));
    const x={name:String(v.name||'').slice(0,60),desc:String(v.desc||'').slice(0,200),photo:typeof v.photo==='string'?v.photo:null,owner:HANDLE_RE.test(v.owner||'')?v.owner:'',admins:handleList(v.admins)};
    if(o&&typeOf(c)==='channel'){if(typeof v.rs==='string')x.rs=v.rs;if(Number.isFinite(v.rt))x.rt=v.rt;if(typeof v.ah==='string')x.ah=v.ah;if(Number.isFinite(v.at))x.at=v.at;noteRoles(c.id,m.e,x,ck)} // not awaited: it may load the owner's profile, and this runs while the chat is being opened (capsFor)
    return o?x:Object.assign(x,{members:handleList(v.members),banned:handleList(v.banned),_unlocked:true});
  }catch{return null}})());
  const v=await metaCache.get(ck);if(!v||rolesAhead(v))metaCache.delete(ck);return v; // don't remember failures: keys may arrive later; nor a roles copy dated too far ahead, so it is noted once the clock has caught up (rolesAhead)
}
const readOMeta=(c,raws)=>readMeta(c,raws,true);
// What this device keeps per private channel from release 92 (SPEC.md 12.2): the owner `o` and admins `a` as of the ometa
// of epoch `e` (`s`: once one signed by the owner was seen, `t`: its time, `h`: the admin secret's fingerprint it names, `ht`: when that was named, `hk`: the owner key it was checked under, `n`: narrowed under a later key of hers at its own time), `ch`, and `dk`, each author's account key version the last dev
// card it acted on came with (rollRun); `p`, on an owner's device: the fingerprint of the admin secret it made last (rotateAdmins), which only it may sign again by itself (signAdminId);
// `ak`, on an owner's device: each admin's account key version the admin secret last went out to them under (rotateAdmins), so her page replaces it by itself once one has risen (rollRun); `hi`, the highest epoch whose key change it checked or made (hiOf, below)
const rolesKey=()=>'hush:roles:'+S.me.handle;
const rolesOf=cid=>ls.get(rolesKey(),{})[cid]||null;
const noteChained=cid=>{const m=ls.get(rolesKey(),{});if(m[cid]&&m[cid].ch)return;m[cid]=Object.assign({},m[cid],{ch:1});ls.set(rolesKey(),m)}; // `ch`: this device saw a key-chain row of the channel
// `hi` (release 93b; private channels only, owner decision D7): the highest epoch whose key change this device checked with the owner on record (headOk) or made or took from a link (keyMade).
// A private channel's record below it is refused for sealing and for a key change (sealKey, 'rollback'): a server serving an older record, or a database restored from before that
// key change, would otherwise have this device seal under a key someone removed since still holds, and wrap for them again at an epoch already used. Never lowered, so after an honest
// restore such a channel stays refused on this device (Phase 3's restored mode is the way back); a fresh device, with no mark, is not
const hiOf=c=>typeOf(c)==='channel'&&c.visibility!=='public'&&(rolesOf(c.id)||{}).hi||0;
const noteHi=(cid,e)=>{const m=ls.get(rolesKey(),{}),r=m[cid]||{};if((r.hi||0)>=Number(e))return;m[cid]=Object.assign({},r,{hi:Number(e)});ls.set(rolesKey(),m)};
const noteOwnAh=(cid,p)=>{const m=ls.get(rolesKey(),{});m[cid]=Object.assign({},m[cid],{p});ls.set(rolesKey(),m)}; // before its akeys go out (rotateAdmins)
// From release 92 ometa carries `rs`, the owner's signature over who the owner and admins are, `ah`, the admin secret's
// fingerprint (adminId) with `at`, when it was named, and `rt`, when: the one thing about them a server, or someone removed who still holds an old key, can't make
const rolesData=(cid,e,x)=>[cid,String(e),String(x.rt),x.owner,[...x.admins].sort().join(',')].concat(x.ah?[x.ah,String(x.at)]:[]); // ah and at last, only when the copy names one
async function rolesOk(cid,e,x){return typeof x.rs==='string'&&!(typeof keyChanged==='function'&&keyChanged(x.owner))&&(await sideOk(x.owner,x.rs,'hush-roles-v1',rolesData(cid,e,x),0,false))===true}
// The date limit: a copy dated more than five minutes ahead of this device's clock is not noted now; it is noted by itself once
// this clock has caught up when that is at most another five minutes away (rolesLater, after loading her profile again), else
// read again later (readMeta); her pages date by their clocks, so no list, a lost device's included, can be dated so far ahead
// that her later changes (rt: max(now, the record's + 2)) never outrank it
const ROLES_SKEW=5*60e3,rolesAhead=x=>{const n=Date.now()+ROLES_SKEW;return x.rt>n||x.at>n},rolesLater=new Map(); // per copy waiting so: whether it holds this account's owner changes (rolesHeld)
// On her page a copy of her own list, signed with her key and dated past the limit (another device of hers whose clock is fast),
// waits to be noted: a change of hers dated by this clock would rank below it and be undone everywhere once it is, so her owner
// changes that take a new rt are refused meanwhile (nokey: try again); sealing her list again ('keep', 'next') never is, a removal's included
const rolesHeld=cid=>[...rolesLater].some(([k,v])=>v&&k.startsWith(S.me.handle+':'+cid+':'));
const rolesQ=new Map(); // per channel: the last noteRoles queued, which a check (headOk) waits for
function noteRoles(cid,e,x,ck){ // an ometa that opened, into the owner and admins this device checks key commits against (SPEC.md 5.6 "Key chain"); ck: readMeta's cache key for the copy
  const me=S.me,job=(rolesQ.get(cid)||Promise.resolve()).then(async()=>{if(!x||!x.owner)return;
    if(rolesAhead(x)){const w=Math.max(x.rt||0,x.at||0)-Date.now()-ROLES_SKEW,k=me.handle+':'+cid+':'+x.rs;if(w<=ROLES_SKEW&&!rolesLater.has(k)){rolesLater.set(k,x.owner===me.handle&&await rolesOk(cid,e,x));setTimeout(()=>loadDir([x.owner],true).catch(()=>{}).then(()=>{rolesLater.delete(k);if(S.me===me)noteRoles(cid,e,x)}),w+1e3)}return} // the date limit (above); a copy of this account's own list, signed with its key, holds its owner changes until then (rolesHeld); her profile loaded again first, so a copy under a key she has replaced meanwhile (a device removal) is checked against her new one, never noted under the old
    const kx=(((await senderKeys(x.owner))||{}).sig||{}).x,ok=await rolesOk(cid,e,x); // kx: the owner's signing key as this device holds it, taken first, so one accepted meanwhile leaves `h` tied to the older key (fail closed)
    if(S.me!==me)return; // another account came in meanwhile: its record is not this one's
    const ids=ls.get('hush:ids',[]),mine=Array.isArray(ids)&&ids.find(i=>i&&i.handle===me.handle);if(x.owner===me.handle&&mine&&mine.sig&&mine.sig.x!==me.sig.x)return; // another tab replaced this account's keys (a device removal) and this one hasn't reloaded yet (the storage handler): it would check its own lists against the key replaced, into the record both tabs share, which her new key's page would then sign again
    const m=ls.get(rolesKey(),{}),r=m[cid]||{};
    if(ck&&!ok&&typeof x.rs==='string')metaCache.delete(ck); // a signed copy that didn't check out here (read before this device had her new key, or her directory entry missing, say) is not remembered as read, at first sight too: the next read, a key check's own included (rolesPass), notes it under the key held then
    if(r.o&&r.o!==x.owner)return; // another owner: nothing changes
    const nh=ok&&!!x.ah&&x.rt===r.t&&x.at>(r.ht||0)&&[...x.admins].sort().join()===[...(r.a||[])].sort().join(); // of the record's own time and list, an admin secret named later: one an owner's page replaced by itself (rotateAdmins' keep)
    if(!r.o)Object.assign(r,{e,o:x.owner,a:x.admins,s:ok?1:0,t:ok?x.rt:0,h:ok?x.ah:undefined,ht:ok?x.at:0,hk:ok?kx:undefined}); // first sight: the owner is fixed from here on; `h`, the admin secret's fingerprint, only from a signed copy, as the list, with `hk`, the owner key that checked it (verifiedAdmin)
    else if(ok&&x.rt>(r.t||0))Object.assign(r,{e,a:x.admins,s:1,t:x.rt,h:x.ah,ht:x.at,hk:kx,n:0}); // signed, and later by its time whatever its epoch (the owner's change may be sealed under a key below one the list was sealed again under meanwhile): the whole list, so a record narrowed below (n) is whole again; a copy from before sent again changes nothing
    else if(ok&&x.rt<=r.t&&(r.hk!==kx||r.n)&&(x.rt===r.t||x.rt>1)){ // at or before the record's time, under the owner's key as this device holds it now, while the record was taken under one she has since replaced (a device removal) or is already so narrowed (n): only the admins in both lists (never one added), the key the record counts under moves, its time stays; so her removal's own copy (keep, at her record's rt) undoes any admin a lost device of hers named at a later rt, whatever date it chose, and a 'next' from another of her devices that missed a drop brings no admin who left back; not a copy at rt 1 (a re-seal by a device with no signed record: adoptOMeta) against a record above 1, so a lost device's list such a device first read can't come back under her new key
      const a=(r.a||[]).filter(h=>x.admins.includes(h)),sub=x.admins.every(h=>(r.a||[]).includes(h)), // sub: the copy names no admin outside the record's
            take=sub&&(r.hk!==kx||x.at>(r.ht||0)||x.ah===r.h),same=r.hk===kx&&a.length===(r.a||[]).length; // the fingerprint: the copy's when its list is within the record's and the key flipped, it was named later, or it is the record's own named again (a 'next' drop); under the same key kept only while the list did not shrink; else none, until a later rt
      Object.assign(r,{e:Math.max(e,r.e||0),a,s:1,h:take?x.ah:same?r.h:undefined,ht:take?x.at:same?r.ht:0,hk:kx,n:1})}
    else if(ok&&x.rt===r.t&&(e>r.e||nh)){if(e>r.e)r.e=e;if(nh)Object.assign(r,{h:x.ah,ht:x.at})} // the same time sealed again under a later key (adoptOMeta): only the epoch moves, so a list of that time naming others changes nothing; for the same list a fingerprint named later is taken, never one from before sent again
    else if(!r.s&&e>=r.e)r.a=(r.a||[]).filter(h=>x.admins.includes(h)); // unsigned (a page from before release 92): it only takes admins away, never from an older epoch, and only until a signed one was seen
    else return;
    m[cid]=r;ls.set(rolesKey(),m)}).catch(()=>{});
  rolesQ.set(cid,job);return job}
/* invite links carry a secret in the part after #, which never reaches the server */
async function inviteKey(secret,cid,iid){const ikm=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'HKDF',hash:'SHA-256',salt:enc.encode(cid+':'+iid),info:enc.encode('hush-invite-v1')},ikm,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
// Proof of holding an invite link, worked out from the link's secret. The server only keeps its fingerprint.
async function joinProof(secretB64u,cid,iid){return b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-join-v1:'+cid+':'+iid+':'+secretB64u))))}
// A channel link's secret sealed under the admin secret (`as`, SPEC.md 5.3), so any admin's device can show the link and carry it across a leave
async function sealAs(adminRaw,cid,iid,secret){return b64(await sealRaw(await subKey(adminRaw,'hush-inv-as-v1',cid+'|'+iid),enc.encode('hush-inv-as-v1|'+cid+'|'+iid),secret))}
async function openAs(adminRaw,cid,iid,as){ // the link's 16-byte secret, or null
  try{const s=await openRaw(await subKey(adminRaw,'hush-inv-as-v1',cid+'|'+iid),enc.encode('hush-inv-as-v1|'+cid+'|'+iid),unb64(as));return s.length===16?s:null}catch{return null}}
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
// AES-GCM with any associated data, as iv followed by the ciphertext: media pieces, and the key chain's rows (chainRow)
async function sealRaw(key,ad,plain){const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:ad},key,plain));
  const out=new Uint8Array(12+ct.length);out.set(iv,0);out.set(ct,12);return out}
async function openRaw(key,ad,body){
  return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:body.subarray(0,12),additionalData:ad},key,body.subarray(12)))}
async function sealPiece(key,i,n,plain){return sealRaw(key,mediaAad(i,n),plain)}
async function openPiece(key,i,n,body){return openRaw(key,mediaAad(i,n),body)}
const pieceHash=async plain=>new Uint8Array(await crypto.subtle.digest('SHA-256',plain));
async function mediaRoot(hashes){const all=new Uint8Array(hashes.length*32);hashes.forEach((h,i)=>all.set(h,i*32));
  return b64std(new Uint8Array(await crypto.subtle.digest('SHA-256',all)))}
/* ===== HUSH MEDIA END ===== */
const keysOf=d=>d?{ecdh:{x:d.ecdh.x,y:d.ecdh.y},sig:{x:d.sig.x,y:d.sig.y}}:null;
const sameKeys=(a,b)=>!!a&&!!b&&a.ecdh.x===b.ecdh.x&&a.ecdh.y===b.ecdh.y&&a.sig.x===b.sig.x&&a.sig.y===b.sig.y;
function peerKeys(h){if(S.me&&h===S.me.handle)return {ecdh:S.me.ecdh,sig:S.me.sig};return (S.pins&&S.pins[h])||S.dir[h]||null}
/* ===== HUSH RECOVERY BEGIN ===== */
/* ---------- recovery words: twelve everyday words that, with your username, bring your account back ----------
   The words are made on this device and never sent anywhere. They're stretched (PBKDF2, 600k rounds) into
   a secret address and a key, exactly like your password, and your account keys are locked into a box there.
   1,024 words, 12 picks = 120 bits. The salt is the username (v2), so a stolen copy of the server's data has to be
   attacked one account at a time. Sets made before (v1: 6 words, 60 bits, one salt shared by everyone) still open
   their box until new words replace it. No server checks them, so no carrier, email provider
   or court order can reset your account. Typing just the first 4 letters of each word is enough.
   This block and the login block below have no page dependencies beyond S, ls and a few helpers, so the
   server's tests lift them out and run them against a real server (test/login.test.js). */
const RWORDS='acorn adult agent alarm album alley amber anchor angel ankle antler anvil apple apricot apron arch arena arm armor army arrow art ash aspen atlas attic aunt autumn avocado award axe axis baby back bacon badge bag bagel bake bald ball bamboo banana band banjo bank barber barn barrel base basil basket bat bath battery bay beach beam bean bear beast beaver bed bee beef beet bell belt bench berry bicycle bike bill bird biscuit bison blade blank blaze blender blimp blizzard block blond bloom blouse blue bluff board boat body boil bolt bone bonus book boot border boss bottle boulder bounce bowl box boy bracelet brain bramble branch brass brave bread breeze brick bride brief bright bronze broom brown brush bubble bucket buddy budget buffalo bugle build bulb bull bunch bunny burger burrow bus bush butler butter buyer cabbage cabin cable cactus caddy cage cake calf call calm camel camp canal candy cane cannon canoe canvas canyon cap cape captain car caramel card cargo carpet carrot cart cash castle cat catfish cattle cave cedar cell cement chain chalk champ chapel charm cheek chef cherry chess chick chief child chimney chin chip choir chop chrome cider cigar cinema cinnamon circle city clam clay clerk cliff climb clock cloth cloud clover clown club coach coal coast coat cobra cobweb cocoa code coffee coin cold collar colt comb comet comic compass condor cookie copper coral cord cork corn cotton couch cougar county court cousin cow cowboy coyote crab craft crane crate crayon cream creek crew cricket crisp crop cross crow crumb crust cube cup cupcake curtain curve cushion cycle daffodil dagger dairy daisy dance dart date dawn deck deer delta denim dentist desert desk dial diamond diary dice diesel dingo dinner dish diver dock doctor dog doll dolphin dome domino donkey donut door dough dove dragon drama drawer dream dress drift drill drink drone drum duck dumpling dune dust eagle earth easel echo eclipse edge eel egg eggplant elbow elder elephant elk elm ember emerald empire engine entry envy equal error essay event exam exit fabric face fact fair falcon family fan farm fawn feast feather fence fern ferry fever fiddle field fig film finch finger fire fish flag flame flash fleet flint float flock floor flour flower flute foam focus fog folk food foot forest fork fort fossil fountain fox frame frog frost fruit fudge fuel fund funnel fur gadget galaxy game garage garden garlic garnet gate gazelle gear gecko gem genius geyser ghost giant gift ginger giraffe glacier glass glove glow glue goat goblet gold golf goose gopher gorilla gown grain granite grape grass gravy green griddle grill grin grove guard guest guitar gulf gum gumbo habit hall ham hammer hamster hand harbor harness harp hat hatchet hawk hay hazel head heart heat hedge helmet hen herb hermit hero hiker hill hinge hippo hobby hockey honey hood hook hope horn horse host hotel hound house hug human hummus humor husky hut ice iceberg icon idea igloo inch index ink inkwell inn iris iron island ivory ivy jackal jaguar jam jar jasmine javelin jaw jazz jeans jeep jelly jet jewel jigsaw job jockey joke judge juice jukebox jungle kangaroo kayak kernel ketchup kettle key kid king kitchen kite kitten kiwi knee knife knight knot koala label lace ladder ladle lady lagoon lake lamb lamp lane lantern laptop lasso latch lava lawn layer leaf ledge lemon lens leopard lettuce lever lid lilac lily limb lime lion lip list lizard llama loaf lobby lobster lock lodge log loop lotus lunch lynx magnet maid mail mammoth mango manor mantle maple marble market marsh mascot mask mast match maze meadow medal melon menu mesa metal meter microwave mill minnow mint mirror mitten model mohawk mole monkey monsoon moon moose mop mosaic moth motor mouse mouth mud muffin mug mule muscle museum music mustang nail name napkin navy neck nectar needle nest net nickel night noble noodle north nose note novel nugget nurse nut nutmeg oak oar oasis oatmeal ocean octopus olive omelet onion opera orange orbit orchid ostrich otter outlet oven owl oyster paddle page pail paint palace palm pan panda panel paper paprika parade park parrot parsley party pasta patch path peach peak pear pebble pecan pedal pelican pen pencil penguin penny pepper pheasant piano piccolo pickle picnic pie pier pig pigeon pillow pilot pine pink pipe pirate pistol pitch pizza plane plate plaza plum pluto pocket poem polar pole pond pony pool popcorn poppy porch port possum poster pot potato pouch powder prairie pretzel prince prism puffin pug pulse pump pupil puppy purple puzzle quail quartz queen quest quilt quiver rabbit raccoon radar radio raft rain raisin rake ranch rapids raven razor recipe reef reindeer relay rhino ribbon rice riddle ridge ring river road robin robot rock rodeo roof room rooster root rope rose rover ruby rug ruler saddle safari saffron sail salad salmon salt sand sapphire sardine sauce sauna scale scarf school scooter scout screw sea seagull seal season seed sequoia shade shark sheep shelf sherbet shield ship shirt shoe shore shovel shrimp sign silk silver singer sink siren skate ski skillet skull skunk sky sled sleeve slice slope sloth smile smoke snail snake snorkel snow soap sock sofa soil soldier sombrero song soup spark spear spider spike spinach spoon spring sprocket spruce square squid stable stage stamp star steam steel stem stick stingray stone stool storm stove straw stream string strudel sugar suit summer sun sundae swamp swan sweater swing sword syrup table taco tadpole tail tank tape target taxi tea teacup teapot temple tennis tent thimble thread throne thumb thunder ticket tide tiger timber toast toe tomato tongue tool tooth torch toucan tower town toy track trail tree tribe trombone trophy truck trumpet trunk tuba tugboat tulip tuna tundra tunnel turkey turnip turtle tusk tuxedo twig umbrella uncle unicorn valley van vanilla vase velvet vest violin visor volcano vulture waffle wagon waiter wall walnut walrus wand warthog wasabi water wave wax weasel weevil well whale wheat wheel whip whisker wig wildcat willow window wing winter wire wizard wolf wombat wood wool worm wren yacht yard yarn yodel yogurt zebra zeppelin zero zipper zoo zucchini'.split(' ');
const RW_COUNT=12,RW_OLD=6; // new sets are 12 words (v2); 6-word sets (v1) are still read, never made
function newRecoveryWords(){const r=crypto.getRandomValues(new Uint16Array(RW_COUNT));return Array.from(r,v=>RWORDS[v&1023])}
function readWords(text){ // forgiving: any case, any spacing or punctuation, first 4 letters are enough. Exactly 12 or 6 words.
  const toks=String(text||'').toLowerCase().match(/[a-z]+/g)||[];const out=[];
  for(let k=0;k<toks.length;k++){const t=toks[k];let w=RWORDS.includes(t)?t:null;
    if(!w&&t.length>=4){const m=RWORDS.filter(x=>x.startsWith(t.slice(0,4)));if(m.length===1)w=m[0]}
    if(!w)throw Object.assign(new Error('word'),{n:k+1,t});out.push(w)}
  if(out.length!==RW_COUNT&&out.length!==RW_OLD)throw Object.assign(new Error('count'),{n:out.length});
  return out;
}
const recVer=words=>words.length===RW_COUNT?2:words.length===RW_OLD?1:0;
const recLabel=v=>'hush-recovery-v'+v; // AES-GCM additional data: a v1 box never opens as v2 or the other way round
// The salt's username, by the handle rule and not the login one (normLogin), which refuses the all-digit handles older accounts may have.
const recUser=u=>{u=String(u||'').trim().replace(/^@/,'').toLowerCase();return /^[a-z0-9_]{3,20}$/.test(u)?u:null};
async function recSecrets(words,user){ // v2 salts with the username (per account, nothing stored); v1 had one salt for everyone
  const v=recVer(words);if(!v)throw Object.assign(new Error('count'),{n:words.length});
  if(v===2&&!(user=recUser(user)))throw new Error('user');
  const salt=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(v===2?'hush-recovery-salt-v2:'+user:'hush-recovery-salt-v1')));
  const base=await crypto.subtle.importKey('raw',enc.encode(words.join(' ')),'PBKDF2',false,['deriveBits']);
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},base,512));
  const loc=b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',bits.slice(0,32))));
  const key=await crypto.subtle.importKey('raw',bits.slice(32),{name:'AES-GCM'},false,['encrypt','decrypt']);
  return {loc,key};
}
async function saveRecovery(id,words){
  if(recVer(words)!==2)throw new Error('count'); // only the strong kind is ever made
  const {loc,key}=await recSecrets(words,id.handle),iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(recLabel(2))},key,enc.encode(JSON.stringify(bundleOf(id)))));
  await S.db.doc('accounts/'+loc).set({iv:b64u(iv),ct:b64u(ct)});
  const mine=S.me&&S.me.handle===id.handle,v=mine&&S.prefs&&S.prefs.rec;
  const r=recLocal(id.handle),old=[...new Set([...(r&&Array.isArray(r.old)?r.old:[]),r&&r.loc,v&&v.loc].filter(l=>typeof l==='string'&&l!==loc))];
  // the old words keep working until the quick check passes (confirmRecovery), so new words never written down lock nobody out
  ls.set('hush:recovery:'+id.handle,{loc,ts:Date.now(),conf:false,v:2,old});ls.set('hush:backedUp:'+id.handle,Date.now());
  if(v){delete S.prefs.rec;saveContacts()} // not counted as set up again until the quick check is passed
}
function confirmRecovery(id){ // the quick check passed: now the words count, on every device
  const r=recLocal(id.handle);if(!r||!r.loc)return;const ts=Date.now();
  (Array.isArray(r.old)?r.old:[]).forEach(l=>S.db.doc('accounts/'+l).delete().catch(()=>{})); // old words stop working now, whichever device made them
  ls.set('hush:recovery:'+id.handle,{loc:r.loc,ts,conf:true,v:r.v});
  if(S.me&&S.me.handle===id.handle&&S.contactsReady){P().rec={loc:r.loc,ts,v:r.v};saveContacts()}
  renderBanner();
}
let lastRecLoc=null;
async function openRecovery(words,user){ // user: the username, needed for 12 words only
  const v=recVer(words),{loc,key}=await recSecrets(words,user);lastRecLoc=loc;const s=await S.db.doc('accounts/'+loc).get();if(!s.exists)throw new Error('nomatch');
  const d=s.data();let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(d.iv),additionalData:enc.encode(recLabel(v))},key,unb64u(d.ct))}catch{throw new Error('nomatch')}
  const id=idFromBundle(JSON.parse(dec.decode(pt)));if(v===2&&id.handle!==recUser(user))throw new Error('nomatch');
  return id;
}
const recLocal=h=>ls.get('hush:recovery:'+h,null);
// Set up = the quick check was passed, on this device or another one (the encrypted vault carries it).
// Saves from before the check existed have no "conf" and count as set up.
const hasRecovery=h=>{const r=recLocal(h),v=S.me&&S.me.handle===h&&S.contactsReady&&S.prefs&&S.prefs.rec;
  const vOk=!!(v&&typeof v.loc==='string');
  if(r&&r.conf===false)return vOk&&(v.ts||0)>(r.ts||0);
  return !!r||vOk};
// Set up, but with the older 6-word kind (records without v:2): asked, never forced, to make new ones.
const recOld=h=>{if(!hasRecovery(h))return false;const r=recLocal(h),v=S.me&&S.me.handle===h&&S.contactsReady&&S.prefs&&S.prefs.rec;
  const c=[r&&r.conf!==false&&r,v&&typeof v.loc==='string'&&v].filter(Boolean).sort((a,b)=>(b.ts||0)-(a.ts||0))[0];return !!c&&c.v!==2};
/* ===== HUSH RECOVERY END ===== */
/* ===== HUSH AUTH BEGIN ===== */
/* ---------- log in with username + password ----------
   The password never leaves the device. It's stretched (PBKDF2, 600k rounds) into two things:
   a secret address for your account on the server, and the key that locks your account keys.
   The server only ever holds a locked box at an address it can't connect to your username.
   Accounts made before sign-up took a username and password log in with their email or phone number instead, so a
   "login" is one of three things: a username (lowercase, as in the directory), an email, or +digits. */
const isHandleLogin=l=>typeof l==='string'&&/^[a-z0-9_]{3,20}$/.test(l);
function normLogin(s){ // the username, with or without its @: 3 to 20 letters, numbers or _, at least one letter. Since release 20 the only login.
  s=String(s||'').trim().replace(/^@/,'');return /^[A-Za-z0-9_]{3,20}$/.test(s)&&/[A-Za-z_]/.test(s)?s.toLowerCase():null}
/* Passwords: at least 8 characters, not all lowercase letters, not on the built-in list of common passwords, and not
   containing the person's own username, phone number or email. An owner or admin of a group or channel needs 12 or
   more (pwStrongEnough, SPEC.md 4.6): their password guards other people's chats too. The list holds the usual suspects of 8+ characters from the
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
  if(/^[a-z]+$/.test(pw))return 'Add a capital letter, a number, a space or a symbol.';
  if(handle&&low.includes(String(handle).toLowerCase()))return 'Password can\u2019t contain your username.';
  if(login&&!isHandleLogin(login)){const l=String(login).toLowerCase();
    if(l.includes('@')){const local=l.split('@')[0];if(low.includes(l)||(local.length>=4&&low.includes(local)))return 'Password can\u2019t contain your email.'}
    else{const d=l.replace(/\D/g,''),pd=low.replace(/\D/g,'');if(d.length>=7&&(pd.includes(d)||pd.includes(d.slice(-7))))return 'Password can\u2019t contain your phone number.'}}
  return null;
}
const pwStrongEnough=pw=>pw.length>=12&&!/^[a-z]+$/.test(pw)&&!COMMON_PW.has(pw.toLowerCase()); // what a power role asks of a password, new or already in use
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
/* Where a password box lives (SPEC.md 4.5). The login's tag and the stretched password (loc above, never the password)
   go to the server, which mixes in a secret of its own: nobody can work out a box address without asking it, and it
   counts the asks that find no box, per login, so a password can't be guessed at speed. loc is still what this device
   remembers for each login; boxes made before the gate lived at loc itself, and findBox moves such a box behind the
   gate the first time it is opened. */
const gated=new Map();
async function boxLoc(login,x){const t=await loginTag(login),k=t+'|'+x;
  if(!gated.has(k))gated.set(k,S.db.loginGate(t,x).catch(e=>{gated.delete(k);throw e}));return gated.get(k)}
async function moveBox(x,g,d){
  try{await S.db.doc('accounts/'+g).set({iv:d.iv,ct:d.ct})}catch(e){if(e&&(e.code==='full'||e.code==='ratelimit'))return;if(!(e&&e.code==='exists'))throw e} // no room or no allowance for a new row today: log in with the old box and move it next time
  await S.db.doc('accounts/'+x).delete().catch(()=>{})}
async function findBox(login,x){ // the box for this login and stretched password, wherever it is, or null
  const g=await boxLoc(login,x),s=await S.db.doc('accounts/'+g).get();if(s.exists)return s.data();
  const o=await S.db.doc('accounts/'+x).get();if(!o.exists)return null;
  await moveBox(x,g,o.data());return o.data()}
async function dropLoginBox(login,x){ // a login's box for an old password, behind the gate and from before it
  await S.db.doc('accounts/'+x).delete().catch(()=>{});
  try{await S.db.doc('accounts/'+await boxLoc(login,x)).delete()}catch{}}
async function saveLoginBox(id,login,pw){
  const {loc,key}=await loginSecrets(login,pw),iv=crypto.getRandomValues(new Uint8Array(12));
  const payload=JSON.stringify(bundleOf(id));
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('hush-login-v1')},key,enc.encode(payload)));
  await S.db.doc('accounts/'+await boxLoc(login,loc)).set({iv:b64u(iv),ct:b64u(ct)});return loc;
}
async function unsealBundle(d,key){ // a locked password box → the account inside it, or 'nomatch'
  let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(d.iv),additionalData:enc.encode('hush-login-v1')},key,unb64u(d.ct))}catch{throw new Error('nomatch')}
  try{return idFromBundle(JSON.parse(dec.decode(pt)))}catch{throw new Error('nomatch')}
}
async function openLoginBox(login,pw){
  const {loc,key}=await loginSecrets(login,pw),d=await findBox(login,loc);if(!d)throw new Error('nomatch');
  return {id:await unsealBundle(d,key),loc};
}
/* One login attempt, three possible answers:
     in       the box at the address made from this login and password opened: here is the account
     wrongpw  no box there, but the username exists, so the password must be wrong
     new      neither: nobody has signed up with this login
   The box itself is the real test. It is looked up first and on its own, so a login still works when the
   reservation is missing (a server whose data was reset while this account's profile was republished). */
async function tryLogin(login,pw){
  const {loc,key}=await loginSecrets(login,pw);
  const [rec,d]=await Promise.all([S.db.doc('directory/'+login).get(),findBox(login,loc)]);
  if(d)return {kind:'in',id:await unsealBundle(d,key),loc};
  return {kind:rec.exists?'wrongpw':'new'};
}
const loginInfo=h=>ls.get('hush:login:'+h,null);
/* Which login this device uses is kept in two places: a plain localStorage note for speed, and the encrypted
   vault (prefs.login) so it survives a cleared or partitioned browser, exactly as recovery words do (prefs.rec).
   Without the vault copy, a login that is saved for good on the server (its reservation can never be deleted)
   looks like "Not set up" again the moment the local note is lost. rememberLogin writes both. */
/* An account is logged in to with its username (release 20). Accounts from before may also hold a box for the email
   address or phone number given at sign-up then; each login has its own password box, at an address made from that
   login and the password, so the server can't tell that two boxes belong to one account. The note keeps, besides the
   login this device used, `all`: every login of the account with its box address, so a password change replaces every box. */
const hintOf=(login,loc,all)=>Object.assign({login},loc?{loc}:{},all&&Object.keys(all).length?{all}:{});
const sameHint=(a,b)=>!!a&&!!b&&JSON.stringify(hintOf(a.login,a.loc,a.all))===JSON.stringify(hintOf(b.login,b.loc,b.all));
// replace: the boxes in rec.all are now all there is (after a password change); otherwise they are added to what is known.
function rememberLogin(h,rec,replace){
  if(!rec||!rec.login)return;const old=ls.get('hush:login:'+h,null)||{};
  const all=Object.assign({},replace?{}:old.all||{},rec.all||{});if(rec.loc)all[rec.login]=rec.loc;
  const v=hintOf(rec.login,rec.loc,all);
  ls.set('hush:login:'+h,v);
  if(S.me&&S.me.handle===h&&S.contactsReady){const p=P();
    if(!sameHint(p.login,v)){p.login=hintOf(v.login,v.loc,replace?all:Object.assign({},(p.login&&p.login.all)||{},all));saveContacts(!!replace)}} // replace: a password change made here, its addresses win
}
// Every login the account is known to have here, the username always among them.
const loginsOf=h=>{const li=loginInfo(h)||{};return [...new Set([h,...(li.login?[li.login]:[]),...Object.keys(li.all||{})])]};
// On load, keep the two copies in step: push a local-only note up to the vault, or restore a lost note from it. The
// vault is shared by all of the account's devices, so for the box addresses it wins; this device adds what it alone knows.
function reconcileLoginHint(local,vault){
  if(local&&local.login){
    const all=Object.assign({},local.all||{},(vault&&vault.all)||{}),merged=hintOf(local.login,all[local.login]||local.loc,all),out={}; // its own login's box too: a password changed elsewhere moved it
    if(!sameHint(vault,merged))out.toVault=merged;
    if(!sameHint(local,merged))out.toLocal=merged;
    return out}
  if(vault&&vault.login)return {toLocal:hintOf(vault.login,vault.loc,vault.all)};
  return {};
}
// A box for each login under one password, made side by side; returns {login: box address}. A box that is already
// there for this login and password (the same address) counts as made.
async function saveLoginBoxes(id,logins,pw){
  const all={};
  await Promise.all(logins.map(async l=>{try{all[l]=await saveLoginBox(id,l,pw)}catch(e){if(e&&e.code==='exists')all[l]=(await loginSecrets(l,pw)).loc;else throw e}}));
  return all;
}
/* After a server reset the profile comes back by itself (republishSelf puts the keys back), so the login has to
   come back too, or nobody could log in with it again once this device logs out. The reservation is re-made from
   this device's copy of the login. The password box can't be, since the password never stays on the device, and it
   isn't looked for either: asking the gate about a saved address that is out of date (a password changed on another
   device) would count as a wrong password, and no way in depends on it (SPEC.md 14.14). Nothing asks for the password.
   Checked once per account per page load. */
const loginHealed=new Set();
async function healLogin(id){
  const h=id.handle,li=loginInfo(h);if(!S.db||!li||!li.login||loginHealed.has(h))return;loginHealed.add(h);
  try{for(const l of loginsOf(h)){if(isHandleLogin(l))continue; // a username needs no reservation: the profile itself holds the name
      const ref=S.db.doc('logins/'+await loginTag(l));if(!(await ref.get()).exists)await ref.set({ts:Date.now()})}
    // A box from before the gate, still at its old address (a plain read), is moved behind it.
    const boxes=Object.assign({},li.all||{},li.loc?{[li.login]:li.loc}:{});
    for(const [l,x] of Object.entries(boxes)){const o=await S.db.doc('accounts/'+x).get();if(o.exists)await moveBox(x,await boxLoc(l,x),o.data())}
  }catch{loginHealed.delete(h)}
}
async function rememberPw(login,pw){ // Chrome and Edge only (PasswordCredential): offers to save it in Google Password Manager; Safari and the iPhone app save through the login form itself; Hush never stores it
  try{if(window.PasswordCredential&&navigator.credentials)await navigator.credentials.store(new PasswordCredential({id:login,password:pw,name:login}))}catch{}}
/* ===== HUSH AUTH END ===== */
/* ===== HUSH REKEY BEGIN ===== */
/* ---------- new account keys (SPEC.md 14.15, release 21) ----------
   Every device holds the account's private keys, so removing a lost device means new ones: the page publishes them
   with kv+1 and keeps the old ones on this device as `prev` (the private parts for 30 days) so old notes, the old
   vault and old messages still open and verify. The server keeps the old signing keys on the profile (`prev`) so
   every device can check messages signed before the change. This block has no page dependencies beyond S, ls and
   the helpers above, so test/rekey.test.js lifts it out. */
const REKEY_SKEW=60000,REKEY_KEEP_MS=30*864e5;
async function rekeyIdentity(id){ // in place: S.me stays the same object
  if(!(typeof id.own==='string'&&OWN_RE.test(id.own)))id.own=id.sigPriv.d; // an account from before stage 7 derived its tokens from the signing key until now
  id.prev={ecdhPriv:id.ecdhPriv,ecdh:id.ecdh,sigPriv:id.sigPriv,sig:id.sig,own:id.own,kv:id.kv||1,until:Date.now()};
  const n=await newIdentity();id.ecdhPriv=n.ecdhPriv;id.ecdh=n.ecdh;id.sigPriv=n.sigPriv;id.sig=n.sig;id.own=n.own;id.kv=(id.kv||1)+1;return id;
}
function unrekeyIdentity(id){const p=id.prev;id.ecdhPriv=p.ecdhPriv;id.ecdh=p.ecdh;id.sigPriv=p.sigPriv;id.sig=p.sig;id.own=p.own;id.kv=p.kv;delete id.prev}
function trimPrev(id){const p=id.prev;if(p&&Date.now()>(p.until||0)+REKEY_KEEP_MS){delete p.ecdhPriv;delete p.sigPriv}} // the public key and its date stay, for old signatures; `own` too: messages from before answer to it, and the lost device has it anyway
function prevSigsOf(h){ // the signing keys h had before and when each stopped. For someone whose key this device pinned, only the keys it pinned before (kept at acceptKey): the server's history could name any key. Otherwise the server's, plus this device's own memory of its last change
  const pin=S.me&&h!==S.me.handle&&S.pins&&S.pins[h],src=pin?pin.prev:S.dir[h]&&S.dir[h].prev;
  const out=Array.isArray(src)?src.filter(p=>p&&p.sig&&typeof p.sig.x==='string'&&typeof p.sig.y==='string'&&Number.isFinite(p.until)):[];
  if(S.me&&h===S.me.handle&&S.me.prev&&S.me.prev.sig)out.push({sig:S.me.prev.sig,until:S.me.prev.until});
  return out}
async function verifyBy(h,sgB64,data,ts,allowPrev){ // h's signature over data: true by their current key or, with allowPrev, 'prev' by one they still had when it was dated (true enough to show, not to act on)
  const s=await senderKeys(h);if(!s||typeof sgB64!=='string'||!sgB64)return false;
  try{const sg=unb64(sgB64),ok=async xy=>crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await pubKey(xy,'s'),sg,data);
    if(await ok(s.sig))return true;
    if(allowPrev&&typeof ts==='number'&&ts>0)for(const p of prevSigsOf(h))if(ts<=p.until+REKEY_SKEW&&await ok(p.sig))return 'prev';
    return false}catch{return false}}
async function ownTokAs(id,cid,pid,k){const ikm=await crypto.subtle.importKey('raw',ownIkm(id),'HKDF',false,['deriveBits']);
  return b64u(new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt:enc.encode('hush-own-v1'),info:enc.encode(cid+'|'+pid+'|'+k)},ikm,256)))}
async function ownTokFor(cid,p){ // the token for one of my messages: one sealed before the key change answers to the old secret
  const k=p.on||0,pid=p._id||p.id;
  for(const id of [S.me,S.me.prev&&S.me.prev.own?{own:S.me.prev.own,sigPriv:S.me.prev.sigPriv}:null].filter(Boolean)){const t=await ownTokAs(id,cid,pid,k);if(!p.oh||await ownHash(t)===p.oh)return t}
  return ownTokAs(S.me,cid,pid,k)}
// The token for one of my files, kept nowhere: a member deletes the pieces of their own messages with it (X-Hush-Ot), the
// server holds only its hash from the upload (X-Hush-Oh). One per media id under its own salt, so two files of one person, or
// a file and a message, stay unlinkable on the server.
async function mediaTokAs(id,cid,mid){return b64u(await hkdf(ownIkm(id),'hush-media-own-v1',cid+'|'+mid))}
async function mediaTok(cid,mid){return mediaTokAs(S.me,cid,mid)}
async function vaultPathOf(id){ // the vault address any identity {handle,ecdhPriv,ecdh} gives; vaultPath caches S.me's
  const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:await pubKey(id.ecdh,'e')},await crypto.subtle.importKey('jwk',id.ecdhPriv,EC,false,['deriveBits']),256));
  const h=await crypto.subtle.digest('SHA-256',new Uint8Array([...bits,...enc.encode('hush-vault-id:'+id.handle)]));
  return 'vault/v'+b64u(h).slice(0,32)}
async function vaultKeyOf(id){return aesKey(await crypto.subtle.importKey('jwk',id.ecdhPriv,EC,false,['deriveBits']),await pubKey(id.ecdh,'e'),'hush-vault:'+id.handle)}
async function dmBaseBits(c){ // a DM's key-0 secret, kept in the key store ('b') so its history stays readable after either side's key change
  const b=ksGet(c.id,'b');if(b)return unb64(b);const s=await dmSecret(dmPeer(c));if(!s)return null;
  if(c.id===await dmIdFromSecret(dmPeer(c),s))ksPut(c.id,'b',b64(s)); // kept only when the chat's id derives from this secret: then it is the one the chat began with, whatever keys either side has now
  return s}
async function dmBaseCapOld(c){ // the base key from before a key change, for the connector to try after the current one; null while nothing changed
  const b=ksGet(c.id,'b');if(!b)return null;const s=await dmSecret(dmPeer(c));if(s&&b64(s)===b)return null;return memberCapFrom(c.id,0,unb64(b))}
/* ===== HUSH REKEY END ===== */
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
/* ===== HUSH LINKCODE BEGIN ===== */
// The QR code's contents as something to type or paste, for an approving device with no camera. It carries the same two
// things the QR does, so it protects the same way: the 128-bit secret that never goes through the server, and the
// first 128 bits of the request's fingerprint (linkFp), which covers both of the new device's keys: the one-time key the
// handoff is sealed to and the device's own key, which the approving device signs onto the account. A server, or
// anyone who can edit the request, that swapped either key would make the code stop matching. Codes before that
// (version 2) covered only the one-time key; their check symbols differ, so they are told apart and refused.
// Version 4 (SPEC.md 14.14) is the code a signed-in device shows to link a new one: its 128-bit secret alone, 26 symbols
// plus 2 check symbols, since the new device's keys don't exist yet when it is shown.
// Crockford base32 (no I, L, O or U; a typed O reads as 0, I and L as 1), 52 symbols plus 2 check symbols, shown in
// groups of six. A mistyped symbol fails the check here instead of approving a request nobody can open.
const LC_ABC='0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const lcCheck=(v,ver=3)=>{let a=ver===3?7:ver===4?13:0,b=0;for(const x of v){a=(a+x+1)%32;b=(b+a)%32}return [a,b]};
function linkCode(secret,fp,ver=3){ // secret: 16 bytes; fp: the linkFp string (versions 2 and 3; version 4 has none)
  const bytes=new Uint8Array(ver===4?16:32);bytes.set(secret,0);if(ver!==4)bytes.set(unb64u(fp).slice(0,16),16);
  const v=[];let acc=0,bits=0;
  for(const b of bytes){acc=(acc<<8)|b;bits+=8;while(bits>=5){v.push((acc>>(bits-5))&31);bits-=5}acc&=(1<<bits)-1}
  if(bits)v.push((acc<<(5-bits))&31);
  v.push(...lcCheck(v,ver));
  return v.map(x=>LC_ABC[x]).join('').replace(/(.{6})(?=.)/g,'$1-');
}
function parseLinkCode(text,ver=3){ // {secret, fp} (16 bytes each; version 4: {secret}), or null when it isn't a whole, correct code of that version
  const t=String(text||'').toUpperCase().replace(/[\s-]+/g,'').replace(/O/g,'0').replace(/[IL]/g,'1'),k=ver===4?26:52;
  if(t.length!==k+2)return null;
  const v=[];for(const ch of t){const i=LC_ABC.indexOf(ch);if(i<0)return null;v.push(i)}
  const [a,b]=lcCheck(v.slice(0,k),ver);if(a!==v[k]||b!==v[k+1])return null;
  const out=new Uint8Array(ver===4?16:32);let acc=0,bits=0,n=0;
  for(const x of v.slice(0,k)){acc=(acc<<5)|x;bits+=5;if(bits>=8){if(n<out.length)out[n++]=(acc>>(bits-8))&255;bits-=8}acc&=(1<<bits)-1}
  if(acc!==0)return null; // the spare bits (four; two in version 4) are always zero
  return ver===4?{secret:out}:{secret:out.slice(0,16),fp:out.slice(16)};
}
// Version 5 (SPEC.md 14.14, release 58): the code the NEW device shows, a QR only, since nothing is typed in this direction:
// its 128-bit secret, which names its ask, and the first 128 bits of linkFp over both of its keys, so the device that scans
// it lets in exactly the keys on the screen it scanned, not ones a server swapped into the ask.
const linkQr5=(secret,fp)=>'hush-link:5:'+b64u(secret)+':'+b64u(unb64u(fp).slice(0,16));
function parseLinkQr5(text){ // {secret, fp} (16 bytes each), or null
  const m=/^hush-link:5:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{22})$/.exec(String(text||'').trim());if(!m)return null;
  const secret=unb64u(m[1]),fp=unb64u(m[2]);return secret.length===16&&fp.length===16?{secret,fp}:null;
}
// A new device's own key as one string, for the fingerprints below; '-' when a request carries none.
const devkStr=dk=>dk&&typeof dk==='object'?[dk.id,dk.x,dk.y,dk.sx,dk.sy].map(v=>String(v)).join('|'):'-';
// What the QR code and the typed code commit to: the one-time key and the device's own key, together.
const linkFp=async(pub,devk)=>b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-link-fp-v3|'+String(pub&&pub.x)+'.'+String(pub&&pub.y)+'|'+devkStr(devk)))));
// The start of a device key's fingerprint, 80 bits as 16 symbols ("7K2M-9QX4-…"), shown on both devices to compare by eye.
// Release 23 showed only the first 8, so those stay the same for the same key.
async function devShort(dk){
  const h=new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-dev-short-v1|'+devkStr(dk))));
  const v=[];let acc=0,bits=0;
  for(const b of h.slice(0,10)){acc=(acc<<8)|b;bits+=8;while(bits>=5){v.push((acc>>(bits-5))&31);bits-=5}acc&=(1<<bits)-1}
  return v.map(x=>LC_ABC[x]).join('').match(/.{4}/g).join('-');
}
// The reverse direction (the approving device shows the code, the new device scans it): the new device's proof that it
// read the code and that the code named its own keys. An HMAC under the shown secret, bound to this one request (its tag
// and creation time) and its fingerprint, with a label saying what it is for, so it can't be replayed for another request
// or passed off as anything else. Only the two screens ever hold the secret, so the server can't make one.
async function linkConfirm(secret,tag,ts,fp){
  const k=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode('hush-link-confirm-v3|'+tag+'|'+ts+'|'+fp))));
}
// Where a link offer lives (SPEC.md 14.14): its name is made from the code's secret with a label, so the secret itself
// never reaches the server, and its address from the name in a space of its own, so no login's tag can be one.
async function offerName(secret){
  const k=await crypto.subtle.importKey('raw',secret,{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64u(new Uint8Array(await crypto.subtle.sign('HMAC',k,enc.encode('hush-link-offer-name-v1'))));
}
const offerTag=async n=>b64u(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode('hush-link-offer-v1|'+n))));
/* ===== HUSH LINKCODE END ===== */
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
  if(h===me){await S.db.doc('inbox/'+h+'/c/'+rid()).set(Object.assign(w,{ts,own:1}));return} // a note to yourself goes over your own connection, marked as yours: never swept
  await postDrop(h,w);
}
async function openPointer(d){
  const open=async priv=>{const k=await aesKey(priv,await pubKey(d.epk,'e'),PTR_SALT(S.me.handle));return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(d.iv)},k,unb64(d.ct))))};
  let o;try{o=await open(await myKey('e'))}
  catch(e){const p=S.me.prev;if(!(p&&p.ecdhPriv))throw e; // a note left before this account's keys were replaced still opens with the old key (kept 30 days)
    o=await open(await crypto.subtle.importKey('jwk',p.ecdhPriv,EC,false,['deriveBits']))}
  if(!o||typeof o.cid!=='string'||!/^(?:[gc][A-Za-z0-9]{12}|d[A-Za-z0-9_-]{22})$/.test(o.cid))throw new Error('format');return o;
}
