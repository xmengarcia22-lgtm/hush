# Hush server specification

Status: written 2026-10-07 as the stage 0 draft; stages 1 to 7 are built (see `server/README.md` and the table in section 16). Deviations made while building are marked "As built". Covers the Node.js service that replaces Firebase for the Hush web app in this folder. The original Firebase page is kept as `index.firebase-backup.html`.

Decisions already taken by the owner:

| Topic | Decision |
|---|---|
| Migration | Fresh start. No Firestore data is imported. The Firebase project is retired and its published API key revoked after cut-over. |
| Host | One Hetzner VPS, Ubuntu, Node 22, one public address (written `<server address>` here). |
| Storage | SQLite to start. |
| TLS and static files | Caddy terminates TLS, serves the app files, and proxies the API to Node on localhost. |

Open items the owner still has to decide are collected in section 14.

---

## 1. Goals and non-goals

**Goals**

1. Keep every message, media file, group name and contact list end-to-end encrypted on the client, exactly as today.
2. Store as little metadata as the app can function with. In particular the server must never hold a plain list of who is in which chat, who talks to whom, or which usernames share a device.
3. Never log or store IP addresses.
4. Keep the client's existing database call shape so that the 122 call sites in index.html keep working behind a new adapter.
5. Be small enough for one person to run: one process, one database file, one reverse proxy.

**Non-goals for this version**

- Hiding activity timing or message sizes from the server.
- Hiding, from a live attacker inside the running server, which connection does what. Only durable storage is protected against that attacker.
- Network-level anonymity (Tor, mix networks).
- Push notifications, offline caching, multi-server scaling.
- Protecting against a malicious server that ships altered JavaScript to the browser. See 10.6 for the option that addresses this.
- Voice and video calls. Deferred, not excluded: they are stage 10, after launch, and section 16 lists what the earlier stages must leave open for them. Audio messages are not deferred; they are ordinary encrypted media attachments and arrive with stage 6.

---

## 2. Vocabulary

| Term | Meaning |
|---|---|
| handle | A username, lowercase, `^[a-z0-9_]{3,20}$`. Public. |
| account keys | A user's long-term P-256 key pairs: one ECDH, one ECDSA. The public halves live in the directory. Already exist in the client. |
| device keys | Per-device P-256 pairs that never leave the device. Listed and signed in the directory entry under `devs`. Already exist. |
| chat | A DM, group or channel. Identified by a chat id, `cid`. |
| epoch | A numbered version of a chat's symmetric key, 0 to 31. Already exists. |
| chat key | The 32-byte AES-GCM key of one epoch. Wrapped per device in the chat record. Already exists. |
| tag | A 22-character pseudonym for a member in one chat and epoch, derived from the chat key. Already exists (`memTag`). |
| room keys | New. Bearer secrets that prove to the server that you may act on a chat: member key, admin key, owner key. The server stores only their hashes. |
| sealed | Encrypted with a chat key so that the server sees only ciphertext. |
| mailbox | New. A per-handle drop box for small sealed notices such as "you were added to chat X". |
| vault | The user's encrypted settings and contacts blob at a blind address. Already exists. |
| proven handle | The handle a WebSocket connection has proved it holds, by signing a server challenge with the account ECDSA key. |

---

## 3. Architecture

```
Browser (index.html + adapter)
   │  wss://<domain>/ws        one WebSocket: all reads, writes, live updates
   │  https://<domain>/drop    one unauthenticated POST per mailbox drop
   ▼
Caddy  (TLS, HSTS, static files from /srv/hush/www, no access log)
   │  127.0.0.1:8080
   ▼
Node 22 service  (single process, `ws` + Node's built-in `node:sqlite`, WebCrypto for signature checks)
   │
   ├── /var/lib/hush/hush.db    documents, chats, mailbox, directory, search
   ├── /var/lib/hush/media.db   encrypted media chunks
   └── /etc/hush/addr.key       server secret for keyed hashing of blind addresses (not in the DB)
```

- One WebSocket per browser tab. The connection holds in memory: at most one proven handle, the set of chats it has opened with a room key and at which level, its subscriptions, and its rate-limit buckets. None of this is written to disk. A restart drops it all and clients transparently reconnect.
- Mailbox drops go over a separate HTTPS POST that carries no session, so the server's own session state never associates sender and recipient.
- The static app is served from the same origin as the API, so the Content-Security-Policy only needs `'self'` plus the explicit `wss://<domain>` entry.
- The service listens only on localhost. Caddy is the only thing exposed on 80 and 443. SSH is key-only.

---

## 4. Identity plane: who you are to the server

Used only for things that are yours by name: your directory entry, search entry, phone lookup entry, presence, mailbox. Chat content never uses it.

### 4.1 Proving a handle

1. Client sends `hello`. Server replies with a 32-byte random `nonce`, the server time, and limits.
2. Client sends `prove { h, sig, dev?, pub? }` where `sig` is an ECDSA P-256 / SHA-256 signature (raw r||s, base64 or base64url) over the UTF-8 string `hush-session-v1|<nonce>|<h>|<dev or empty>`.
3. The key that must have signed depends on the frame:
   - with `dev`, the signing key of that device as listed under `devs` in `directory/<h>`, provided the entry's own signature chain verifies up to the account key (the same check the client's `verifiedDevs` does). This is the normal case for a device that is already on the profile.
   - without `dev`, the account signing key in `directory/<h>`.
   - if `directory/<h>` does not exist (sign-up), `pub` must be present and the signature is verified against it. The connection is then marked as "may create `directory/<h>` with `sig == pub`".
4. On success the connection is marked as acting for `h`. Exactly one handle per connection. To switch accounts the client opens a new connection; this keeps two of a user's handles from ever meeting in one server-side session object.

The client tries its device key first and falls back to the account key when the device is not listed yet (a first login, or a restore from recovery words), which is also how it publishes that device entry afterwards. The nonce is valid for two minutes and is consumed by a successful proof. A connection may prove once; a failed proof counts toward a per-address bucket (see 9.4), ten failures in ten minutes earn a pause.

### 4.2 What a proven handle may do

| Path | get | set / create | update | delete |
|---|---|---|---|---|
| `directory/<h>` | anyone, rate-limited (the sign-up screen checks availability before an account exists) | only `h`, doc.handle == h, doc.sig == proving key | only `h`; `ecdh`/`sig`/`kv` may change only if `kv` increases and the connection proved with the account key (not a device key) | never |
| `search/<h>` | query only, see 7.6 | only `h`, doc.h == h | only `h` | only `h` |
| `presence/<h>` | anyone proven, batched | only `h` | only `h` | only `h` |
| `phones/<hash>` | anyone proven | only `h` == doc.handle | only `h` == doc.handle | only stored doc.handle |
| mailbox of `h` | pull / ack only by `h` | drop by anyone, see 6 | – | ack by `h` |

The server reads the `devs` entries for one purpose only: to check a device-key proof. It never stores anything about devices beyond those signed entries on the profile. Until stage 4 lands, everything under `channels/` requires a proven connection and nothing more.

### 4.3 Collections that need no proof

Five collections are addressed by secrets the client derives itself, so knowing the address is the credential. They are reachable before `prove`, which the sign-in, recovery and device-link flows require, and are rate-limited per address bucket and per path (9.4). At rest their addresses are keyed-hashed (8.3).

| Path | get | set / create | update | delete |
|---|---|---|---|---|
| `accounts/<loc>` | anyone | anyone, if absent | never | anyone |
| `logins/<tag>` | anyone | anyone, if absent | never | never |
| `linkreqs/<tag>` | anyone | anyone | anyone, state machine in 9.3 | anyone |
| `vault/<id>` | anyone | anyone | anyone | never |
| `backup/<id>` | anyone | anyone | anyone | anyone |

### 4.4 Removed from the old model

`owners/*`, `owners/*/devices/*`, `uids/*` and the `_uid` / `_by` stamps on every write are gone. The server rejects any document that contains a key beginning with `_`.

---

## 5. Capability plane: room keys

Used for everything under `channels/<cid>`. The server never learns who is in a chat; it learns that the requester holds a secret for it.

### 5.1 The three keys

| Key | Scope | Derived from | Who holds it |
|---|---|---|---|
| member key `M_e` | one chat, one epoch | the epoch's chat key | every member device that can open epoch `e`; for public channels, anyone, because `openKeys` publishes the chat key |
| admin key `A` | one chat | a random 32-byte admin secret, wrapped to admins' devices in `akeys` | owner and admins |
| owner key `O` | one chat | the owner's private per-account secret `own`, made at sign-up and carried in the login box, the recovery box and the device handoff (accounts from before stage 7 have none and derive it from the signing private key, as before) | owner only, recomputable on any of the owner's devices |

Derivations, all HKDF-SHA-256 with 32-byte output, encoded base64url (43 characters):

```
root_e  = HKDF(ikm = chatKey_e,          salt = "hush-caproot-v1", info = cid + "|" + e)
M_e     = HKDF(ikm = root_e,             salt = "hush-cap-v1",     info = "member")
A       = HKDF(ikm = adminSecret,        salt = "hush-cap-v1",     info = "admin|" + cid)
O       = HKDF(ikm = ownerSigPriv.d,     salt = "hush-cap-v1",     info = "owner|" + cid)
```

For a DM at epoch 0, where today's chat key is derived on the fly from the two account ECDH keys and never exported, `chatKey_0` in the formula above is the raw 256-bit ECDH shared secret between the two account ECDH keys. Both members can compute it; the server cannot.

The server stores `sha256(M_e)` for the current epoch only, `sha256(A)` and `sha256(O)` as lowercase hex. It never stores a key itself. Rotating to a new epoch replaces the member hash and immediately invalidates the old one.

As built: a DM also keeps the hash of its epoch-0 member key permanently as a base key. Either person can always derive it from the two account keys, so a device that lost its chat keys (a restore from recovery words) can still open the DM and rotate it to a fresh epoch. Without this, nobody could ever heal a DM.

### 5.2 Opening a chat on a connection

`chat.open { cid, cap }` hashes `cap`, compares against the chat's three hashes and marks the connection as holding the matching level for `cid`: `member`, `admin` or `owner`. Levels are ordered; owner implies admin implies member. Later frames for that `cid` need no key. When the chat rotates, the server evicts every connection's level for that `cid` except the rotator's and pushes `{ t: "evict", cid }`; clients re-derive and re-open, or treat themselves as removed.

### 5.3 Chat record and the "no names" rule

Nothing under `channels/<cid>` may contain a handle in plaintext. The server enforces a denylist of field names on create, set and update for every chat whose `visibility` is not `public`: `members`, `owner`, `admins`, `banned`, `from`, `by`, `to`, `req`, and any key starting with `_`. Public channels may carry `owner` and `admins` because they are public facts of a public channel, and `name`, `desc`, `photo` in the clear so that they can be browsed.

Fields of the chat record:

| Field | Plain or sealed | Notes |
|---|---|---|
| `type` | plain | `dm`, `group`, `channel`. Needed by the server to pick the posting level. |
| `visibility` | plain | `private` or `public`. |
| `epoch` | plain | current epoch, 0 to 31. |
| `keys` | plain container, sealed content | `{ [epoch]: { [label]: wrap } }`. `label` is 22 random base64url characters. `wrap` is `{ epk:{x,y}, iv, ct }` to one device. Since stage 7 the salt names the epoch as well: `hush-wrap-v2|cid|epoch|handle|deviceId` (the device id empty for a wrap to the account key), so a wrap copied into another epoch opens to nothing. Wraps made before used `cid:handle[:deviceId]` and are still tried, second. A device finds its own entries by trial decryption, one key agreement per wrap. Two rules on the client guard against a server that replays old material (10.4, A3): a wrap that opens to a key the device already holds for another epoch of the chat is ignored, which is what still covers the old-format wraps; and sealed `meta` is read only when its `e` is the record's current epoch, since a stale copy would show the member list from before a removal and have the next rotation wrap for that person again. The server refuses to store `meta` under any other epoch (9.3). The admin secret's wraps (`akeys`) have no epoch and keep the old salt `cid#a:handle[:deviceId]`. |
| `akeys` | as above | `{ [label]: wrap }` of the admin secret, groups and channels only. |
| `openKeys` | plain | `{ [epoch]: base64 chat key }`, public channels only. |
| `meta` | sealed | `{ e, iv, ct }`. Plaintext inside is now `{ name, desc, photo, owner, admins, members, banned }`. Private chats only. |
| `invites` | plain container | `{ [iid]: { iv, ct, ph, ts } }` as today. `ph` is the hex SHA-256 of the join proof. |
| `ts`, `last` | plain | activity marker, `last` as today but `from` must be null. |
| `pins`, `ttl`, `closed`, `reactions`, `comments` | plain | operational settings; contain post ids, numbers and emoji, never names. |

Group and channel ids are `g` or `c` followed by 12 alphanumerics, as today. DM ids change: `d` followed by 22 base64url characters of `SHA-256("hush-dmid-v1|" + ECDH(a, b))` truncated. Both parties compute the same id; the server cannot; the old `dm~alice~bob` form is gone. Saved messages (a DM with yourself) use ECDH of your own key with itself and the label `hush-dmid-v1|self|`.

### 5.4 Operations and required level

| Operation | DM | Group | Channel |
|---|---|---|---|
| read chat record (full), subscribe to posts, acts, reads, typing, comments; read media pieces | member | member | member |
| read chat record (preview, see 5.5) | anyone proven | anyone proven | anyone proven |
| create post, upload media (HTTP `PUT`, 7.7), copy media in (7.7) | member | member | admin |
| delete media | member | member | member |
| create service note (`sv:1`) | member | member | admin |
| update own post | holder of the post's one-time token (5.7) | same | same |
| delete post | token holder, or any member if `del == true` or `exp` has passed | same, plus admin | same, plus admin |
| set / delete acts, reads, typing | member | member | member |
| create comment | – | member | member (feature currently off) |
| update `ts`, `last`, `closed` | member | member | member |
| update `pins`, `ttl` | member | admin | admin |
| add wrap entries to `keys` (new labels only, never overwrite or remove) | member | member | member |
| update `meta`, `reactions`, `comments`, `invites`, `visibility`, `openKeys` | – | admin | admin |
| `chat.rotate` (new epoch, new member hash) | member | admin | admin |
| `chat.admins` (replace `akeys` and admin hash) | – | owner | owner |
| `set` whole record | – | admin | admin |
| delete chat | nobody | owner | owner |
| `chat.join` with invite proof | – | anyone proven | anyone proven |

Letting any member add wrap entries means any member can hand the chat key to an outsider. The chat key already leaks that way by screenshot or forwarding, and the members list is in sealed `meta` where other clients can see unexpected additions, so this is accepted. Clients should warn admins when the wrap count for the current epoch exceeds members times verified devices.

### 5.5 Preview read

A `get channels/<cid>` from a connection without a level for `cid` returns a trimmed record: `type`, `visibility`, `epoch`, `keys`, `akeys`, `openKeys`, and for public channels also `name`, `desc`, `photo`, `owner`, `admins`, `ts`, `last`. This is what a newly invited device needs to find its wrap, derive the chat key, derive `M_e`, and `chat.open`. `chat.invite { cid, iid }` additionally returns `{ iv, ct }` of one invite so that a link holder can decrypt the key history and show a join preview. Both are rate-limited per address bucket because chat ids, while random, may leak.

### 5.6 Creation, joining, leaving, removal

**Create.** `chat.create { cid, d, caps: { m, a?, o? } }` from a proven connection. `cid` must be unused. `d` passes the no-names rule and schema. The server stores the hashes of the supplied keys. DMs supply `m` only; groups and channels supply all three. Because both ends of a DM can compute the same id and member key, creating a DM that already exists with a matching member hash succeeds as a no-op, so two people who start the same conversation at the same moment land in one chat.

**Invite someone to a group or channel.** The admin adds wrap entries for each of the invitee's verified devices for every epoch, re-seals `meta` with the new member, and drops `{ t: "invite", cid }` into the invitee's mailbox (section 6). The invitee's device previews the chat, finds its wraps, opens the chat, and writes the chat into its vault chat list.

**Start a DM.** The initiator computes the DM id, creates the chat with `M_0`, then drops `{ t: "dm" }` to the peer. If the peer's directory entry says `requests: true`, the initiator instead drops `{ t: "request", text }` with the first message inside the drop and creates nothing. Accepting means the recipient creates the DM and drops `{ t: "dm" }` back; the initiator's client then sends the message into the chat. Declining means doing nothing. The server has no notion of pending requests at all; the `req` field is gone.

**Join by link.** `chat.join { cid, iid, proof, wraps: { [epoch]: { [label]: wrap } } }`. The server checks `sha256(proof) == invites[iid].ph` and that every label is new, then adds the wraps. The joiner already decrypted the key history from the invite blob, derives `M_e`, opens the chat, and posts a sealed service note `{ k: "join" }` so that members see them; an admin's client adds them to sealed `meta` when it next writes it. For public channels there is no join at all: the client derives `M_e` from `openKeys`.

**Leave.** The leaver posts a sealed service note `{ k: "leave" }` and forgets the chat locally. When an admin's client sees it, it rotates the epoch without the leaver and re-seals `meta`. Until then the leaver still technically holds a working key; this is the same as every end-to-end encrypted group messenger.

**Remove or ban.** The admin rotates: new chat key, wraps for the remaining members' devices, new `M_{e+1}`, `meta` re-sealed with the member removed and optionally added to `banned`. The removed member's connections are evicted at once and their old key no longer opens anything. Bans are enforced by clients (they refuse to re-add) and by the fact that a banned person has no wrap. The old server-side ban check on public-channel joins is gone; public channels can only be moderated by deleting posts.

**Appoint or demote an admin.** Owner writes `chat.admins { cid, akeys, cap }` with wraps of a fresh admin secret for the current admins' devices and the new admin hash, then re-seals `meta.admins` and drops `{ t: "admin", cid }` to a newly appointed admin so their client knows to scan `akeys`.

**Ownership transfer** is not supported in this version.

### 5.7 Posts, edits and deletes without identity

Only sealed posts exist in the new server; the named format (`from`, `iv`, `ct`, `sig` in the clear) and the `req` slot are rejected. A post is:

```
{ sl: 1, ts, e, n, d, exp?, oh, on: 0 }           sealed message
{ sv: 1, ts, e, n, d }                             sealed service note
```

- `n` is the base64 12-byte nonce, `d` the base64 ciphertext of `{ f, i, c, s }` (sender, inner nonce, inner ciphertext, sender signature) under the chat key with AAD `hush-env-v1|cid|pid`, as today.
- `oh` is the hex SHA-256 of a one-time token only the author can compute, `on` its counter. To update or delete, the author sends `ot` with `sha256(ot) == oh`; the server verifies, strips `ot`, and requires the new `oh`/`on`. Updates may only touch `ts, e, n, d, exp, oh, on, edited, del`. This is today's `ownsSealed` rule unchanged. The token is derived (HKDF) from the account's private secret `own` (5.1); accounts from before stage 7 have none and keep deriving it from the signing key, so their older messages stay editable.
- Server-generated ids (`add`) are 12 alphanumerics. Client-chosen ids must match the same pattern.
- `ts` is client-set milliseconds and must lie within 30 days in the past and 400 days in the future, because scheduled messages exist.
- The server deletes posts whose `exp` has passed on its own, every minute.

Reactions, read marks and typing dots keep their current tagged form: id `<pid>~<tag>~<kind>` or `<e>~<tag>`, body `{ post, kind, e, iv, ct, ts, sg }` or `{ ts, sg }`. Clients verify `sg`; the server does not.

---

## 6. Mailboxes

A mailbox replaces the old `inbox/<handle>/c/<cid>` list, which was a plain map of who is in what.

Each person's mailbox is `inbox/<h>/c/`: sealed notes at random ids, each an ECDH wrap to the owner's account key, readable and deletable only by `h`, never edited. A note says which chat exists, from whom, of what type. The server sees a recipient, a blob of one fixed size, and the hour. Stage 4 built the notes and their live delivery through the ordinary `sub`. Stage 5, as built, changed one thing: who writes them. A note to anyone else is posted to `POST /drop` with no session, so no connection of the sender's ever links sender to recipient. A connection may still write notes into its own box (the chat list keeps a note per chat for its owner); writing into anyone else's box over the socket is refused. The pull-and-ack ops once planned here were never needed: the live subscription delivers, the owner deletes.

**Drop.** `POST /drop` with JSON `{ to, blob, pow? }`. No cookies, no session, no proof. The server charges the sender's address bucket for every attempt first, so probing names costs the same as dropping. It then requires `to` to be a handle with a directory entry and `blob` to be a sealed note of exactly the padded size, stores `{ epk, iv, ct, ts }` at `inbox/<to>/c/<random id>` with `ts` the receipt hour, and the recipient's open watch, if any, is pushed the note at once. Replies: 200 `{ ok, id }`; 400 `invalid`; 404 `notfound`; 413 `toolarge`; 429 `ratelimit`; 429 `pow` with `{ bits, hour }` when proof of work is needed.

**Blob.** `{ epk:{x,y}, iv, ct }`, an ECDH wrap to the recipient's account ECDH key with salt `hush-inbox-v1:<to>`, the same construction as `wrapTo` in the client. The plaintext is JSON padded with trailing spaces to exactly 1024 bytes, so `ct` is always 1040 bytes. One size class; nothing needs more. The plaintext:

```
{ t:"invite"|"dm"|"request", cid, from, to, ts, type?, peer?, sg? }
```

The first message of a request is not in the note: it is an ordinary sealed post in the chat, already end-to-end encrypted.

**What the recipient checks.** A note is trusted only if its claims hold up, and a note that fails is deleted: it names this box as `to`; a one-on-one note names the chat id the recipient computes from the sender's account key (5.3), so nobody can plant a chat under someone else's name without a signature at all; an invite carries `sg`, the sender's account signature over `hush-drop-v1|invite|from|to|cid|ts`, verified against the sender's directory entry (invites from before notes were signed carry none and are let through: the chat key is the real gate on whether anything can be read); and the sender is not on the recipient's block list, which lives in the vault. Verifying a signed note from a stranger means fetching their profile right then, which a live observer can correlate with the drop; this is adversary A2's existing view and is accepted.

**Proof of work.** Asked for only when the recipient has "only my contacts" on (`requests: true` in their profile) or when their mailbox has taken more than half its hourly allowance. The puzzle is stateless: `sha256("hush-pow-v1|to|hour|nonce")` must start with `bits` zero bits (16 by default, about a second in a browser). The server verifies with one hash and remembers used `to|nonce` pairs in memory for the hour, so a solution is good once. The sender's page solves it on a 429 `pow` reply and posts again.

**Retention.** A mailbox holds at most 500 notes; past that the oldest give way, and the owner's watch is told, so nobody who was away for a week is locked out of new invitations. Notes older than 30 days are swept hourly.

What the server can see: that mailbox `bob` received a 1 KB note at hour H. It cannot see from whom, about which chat, or of what type. A live observer at the server can still see which network address made the POST.

---

## 7. Frame protocol

Text WebSocket frames, UTF-8 JSON, at most 1 MB each. Every client frame carries `i`, a client-chosen integer echoed in the reply.

### 7.1 Client to server

| op | fields | reply |
|---|---|---|
| `hello` | `v: 1` | `{ nonce, now, v, limits, badges }` (`badges` is the operator's list, 12.3) |
| `prove` | `h, sig, pub?` | `{ ok }` |
| `get` | `p` | `{ id, d }` or `{ id, d: null }` |
| `mget` | `ps: [p, …]` (≤ 300) | `{ docs: [{ id, d }] }` |
| `set` | `p, d` | `{ ok }` |
| `update` | `p, d` | `{ ok }` |
| `delete` | `p, ot?` | `{ ok }` |
| `add` | `p, d` | `{ id }` |
| `query` | `p, w?, o?, l` | `{ docs: [{ id, d }] }` |
| `sub` | `s, p, w?, o?, l` or `s, p, ids: […]` | `{ ok }` then pushes |
| `unsub` | `s` | `{ ok }` |
| `chat.create` | `cid, d, caps` | `{ ok }` |
| `chat.open` | `cid, cap` | `{ level, epoch }` |
| `chat.invite` | `cid, iid` | `{ iv, ct }` |
| `chat.join` | `cid, iid, proof, wraps` | `{ ok }` |
| `chat.rotate` | `cid, epoch, keys, cap, meta?, openKeys?` | `{ ok }` |
| `chat.admins` | `cid, akeys, cap` | `{ ok }` |
| `chat.base` | `cid, cap` | `{ recorded }`. Records a DM's base key (5.1) for a DM created before base keys were kept. Needs member level on the connection; only while none is recorded, never replacing one. |
| `signup.pow` | – | `{ salt, bits }`: the puzzle a new account solves before its profile may be created (9.4). The same puzzle comes back in the `pow` refusal of a `set` on `directory/<h>` sent without a solution; the page asks early and solves out of sight. The `set` carries the answer as `pow`. |
| `media.ticket` | `cid` | `{ t, exp, limits }`. A media ticket for HTTP requests about this chat (7.7). Needs a proven connection holding a level for `cid`. |
| `mail.*` | never needed: notes are watched with `sub` on `inbox/<h>/c` and written with `POST /drop` (section 6); answered `invalid` | – |
| `call.*` | reserved for stage 10 (16.2); answered `invalid` until then | – |
| `ping` | – | `{ ok, now }` |

Paths `p` use exactly today's shapes: `directory/<h>`, `channels/<cid>`, `channels/<cid>/posts/<pid>`, `channels/<cid>/media/<mid>/chunks/<i>` (read and delete only; pieces are written over HTTP, 7.7), `search/<h>`, `presence/<h>`, `phones/<hash>`, `logins/<tag>`, `accounts/<loc>`, `linkreqs/<tag>`, `vault/<id>`, `backup/<id>`. The server maps the first segment to a table and an authorization class.

### 7.2 Server to client

```
{ i, ok: true, ...result }
{ i, ok: false, e: "<code>", m: "<human message>" }
{ s, t: "init", docs: [{ id, d }] }           first result of a subscription
{ s, t: "set",  id, d }                        a document now matches
{ s, t: "del",  id }                           a document was removed or no longer matches
{ t: "evict", cid }                            your level for this chat was revoked
{ t: "mail" }                                  something arrived in your mailbox
{ t: "bye", reason }                           server is closing the connection
```

Error codes: `unauth`, `denied`, `notfound`, `exists`, `invalid`, `toolarge`, `ratelimit`, `conflict`, `version`, `pow` (a drop, section 6, or a sign-up, 9.4, that must bring proof of work first; the reply carries the puzzle), `full` (media refused because the chat's allowance or the server's disk is used up, 7.7), and `internal` for an unexpected server failure. A frame that cannot be parsed at all gets an error reply without `i`; five such frames close the connection.

### 7.3 Write semantics

- `set` replaces the whole document.
- `update` applies RFC 7396 JSON merge patch: nested objects merge, arrays replace, a `null` value removes the key. This is a deliberate difference from Firestore, which stored `null`. Every place the client sets `null` (`name`, `photo`, `meta`, `last`, retired device entries, retired wrap fields) only ever tests the field for truthiness afterwards, so removal is compatible. SQLite's `json_patch` implements exactly this.
- `add` generates the id.
- A write is acknowledged only after it is committed. The adapter uses the acknowledgement to flip a post from "pending" to "sent". Pushes caused by the write go out while it is applied, so a connection that both writes and subscribes receives the `set` push before its own `ok`.
- Maximum nesting depth 6. Keys must match `^[A-Za-z0-9_.~-]{1,64}$`. Top-level keys may not start with `_` (the old adapter's `_uid`/`_by` stamps); nested keys may, because wrap labels and member tags (9.1) are random base64url and one in 64 begins with `_`. `__proto__` is refused at every level.

### 7.4 Queries and subscriptions

`w` is a list of `[field, op, value]` with `op` in `==`, `<`, `<=`, `>`, `>=`. `o` is `[field, "asc"|"desc"]`. `l` is required, at most 1000, at most 10 on `search`. Two range conditions on the same string field express the prefix search the client already does.

Queries are allowed only on: `channels` (only `visibility == public`), `channels/<cid>/posts`, `acts`, `reads`, `typing`, `comments`, `channels/<cid>/media/<mid>/chunks`, and `search`. Everything else is fetched by exact path. The `array-contains` operator is gone with the members list.

A subscription sends `init`, then one `set` or `del` per changed document that matches `w`. Ordering and `l` are applied by the server for `init` and by the client thereafter. `sub` with `ids` watches a set of documents in one collection and is how the chat list watches its chats. Limits: 600 subscriptions per connection, 1000 documents per subscription.

### 7.5 Connection life cycle

`hello` within 10 seconds of connecting or the socket is closed. `ping` every 25 seconds from the client; a connection silent for 90 seconds is closed. On reconnect the client repeats `hello`, `prove`, `chat.open` for each chat it holds keys for, and every `sub`. Protocol version mismatch returns `version` and the app shows "please reload".

### 7.6 Search

`search/<h>` holds `{ h, n, n2 }` exactly as today. Prefix queries on `h`, `n`, `n2` with `l <= 10`. The index is opt-in through `findable`, which is why it may be plaintext.

### 7.7 Media over HTTP (stage 6)

Photos, GIFs, videos, voice messages and any other file are media. Their bytes travel over plain HTTP requests as raw ciphertext, not as base64 inside socket frames.

**Encryption (client).** Every attachment gets a fresh random 256-bit key of its own. The file is cut into pieces of `pieceBytes` (1 MiB) of plaintext; piece `i` of `n` is AES-GCM under the file key with a random 12-byte iv and the associated data `hush-media-v2|i|n`, so a piece cannot be moved to another place, the file cannot be cut short, and pieces of different files cannot be mixed. On the wire and at rest a piece is its iv followed by the ciphertext and tag. Video is sent exactly as recorded, never re-encoded or downscaled; photos over 4096 pixels are scaled down to stay sendable.

**The sealed descriptor.** The message that shows an attachment carries, inside its sealed body, `{ id, v: 2, k, kind, mime, size, chunks, hash, w, h, dur, wave?, name? }`: the media id, the file key `k` (base64), the kind (`image`, `gif`, `video`, `voice`, `file`), the type, the size and piece count, and `hash`, which is SHA-256 over the concatenated SHA-256 of each plaintext piece in order. The reader checks `hash` before showing anything; it is covered by the message signature. There is no preview image: a client downloads and decrypts a photo or video by itself as soon as its message is on screen or within about a screen of it (videos only up to `videoAutoBytes`; larger ones on tap), shows a plain neutral box of the right shape until then, and shows the media at full quality once checked. Media further away waits until it is scrolled near.

**Albums.** One message may carry up to `filesPerMessage` attachments in its `media` list, in the order they were picked, with one caption in its `text`. Clients show the photos and videos of a message as one tiled block (rows of up to four, each item as wide as its shape needs so a row has one height) with the caption underneath, and a single photo the same way. Tapping an item opens a full-screen viewer that swipes between the items. All of this is presentation: the album is the existing sealed message, and the server sees nothing new. (Messages from before this rule may still carry a small `thumb`; it is ignored.) A descriptor without `v` is media from before stage 6: it was encrypted with the chat key of the post's epoch, with associated data `<mid>:<i>`, in 180 KB pieces, and `hash` is over the whole file. Such media stays readable through the same HTTP path; nothing is migrated.

**Tickets: the room-key gate over HTTP.** An HTTP request carries no chat level of its own, and room keys never travel over HTTP. A proven connection that holds a level for a chat asks for a ticket with `media.ticket { cid }` and gets `{ t, exp, limits }`: 24 random bytes, valid for `ticketTtlMs` (10 minutes) and only for that chat, held in memory only and bound to that connection. Each HTTP request sends `Authorization: Hush <t>`. The server then checks the connection's **current** level for the chat on every request, exactly as a socket operation would (5.4): a rotation, an admin change or a removal ends access at once, and a ticket dies with its connection. A client renews a ticket shortly before it runs out, or when a request answers 401.

**Routes.**

| Request | Needs | Answer |
|---|---|---|
| `GET /media/limits` | nothing | `{ ok, limits }`: the media limits of 9.2, for the client to check files before sending |
| `PUT /media/<cid>/<mid>/<i>` body: iv and ciphertext; optional `X-Hush-Exp: <ms>` | member (admin in a channel) | 201 stored, 200 the same bytes were already stored (a retry). Pieces are write-once: different bytes for a stored piece answer 409, so no member can swap a piece of someone else's file |
| `GET /media/<cid>/<mid>/<i>` | member | the piece as `application/octet-stream`, `Cache-Control: no-store` |
| `DELETE /media/<cid>/<mid>` | member | `{ n }`: every piece of that media id removed |
| `POST /media/<to>/<mid>/copy` with `X-Hush-From: <cid>/<mid>` and `X-Hush-From-Ticket` | member of the source; member (admin in a channel) of the target | 201 copied, 200 already there. A forward: the server copies the pieces to a new id in the target chat, and the sealed descriptor is reused with that id, so nothing is downloaded or uploaded again and each copy can be deleted or expire on its own |

Refusals: 400 `invalid`, 401 `unauth` (no, unknown or expired ticket), 403 `denied` (no level, or the ticket is for another chat), 404 `notfound`, 409 `conflict`/`exists`, 413 `toolarge`, 429 `ratelimit`, 507 `full`. Every answer carries `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`. Cross-origin requests are answered for the allowed origins (`Authorization`, `X-Hush-Exp`, `X-Hush-From`, `X-Hush-From-Ticket` headers; `GET`, `PUT`, `POST`, `DELETE`).

**Disappearing messages.** When a chat has a message timer, the client uploads with `X-Hush-Exp` set a little after the message's own expiry. The server keeps, per media id, the latest such time (and keeps the media for good once any piece came without one, so a piece is never swept before the message that shows it), and the expiry sweep (8.6) deletes the media when it passes. The server already sees the expiry of every disappearing message (5.7), so this reveals nothing new.

**Clean-up.** Deleting or expiring a message deletes its media. An upload that cannot finish deletes what it had stored. A message that was never sent after its media went up leaves the media behind; it counts against the chat's allowance until the chat is deleted. The server keeps no link from a message to its media, by design.

---

## 8. Storage

### 8.1 Tables in hush.db

```
docs      (path TEXT PRIMARY KEY, parent TEXT, id TEXT, d TEXT, ts INTEGER, exp INTEGER)
          index (parent, ts), index (parent, id), index (exp) where exp > 0
chats     (cid TEXT PRIMARY KEY, type, visibility, epoch INTEGER,
           cap_m TEXT, cap_a TEXT, cap_o TEXT)
          index (visibility)
search    (h TEXT PRIMARY KEY, n TEXT, n2 TEXT)   index (n), index (n2)
```

`docs` holds directory entries, chat records, posts, acts, reads, comments, invites-by-reference, mailbox notes (`inbox/<h>/c/<id>`, section 6), and the blind-address collections. There is no separate mail table: a note is a document like any other, which is what lets the existing live subscription deliver it. `ts` is copied from the document's own `ts` field when present so that post pagination is indexable; the server adds no timestamps of its own.

### 8.2 Tables in media.db

```
chunks    (cid TEXT, mid TEXT, i INTEGER, iv TEXT, d BLOB, PRIMARY KEY (cid, mid, i))
media_ids (cid TEXT, mid TEXT, bytes INTEGER, exp INTEGER, PRIMARY KEY (cid, mid))
```

`chunks` holds the encrypted pieces: since stage 6 they arrive over HTTP (7.7) as raw bytes, 1 MiB of plaintext each, written once. Pieces stored before stage 6 (180 KB, written over the socket) stay where they are and are read through the same HTTP path. `media_ids` keeps, per media id, only its stored size (for the per-chat allowance) and, for media of a disappearing message, when it may be swept; it was filled once from `chunks` when stage 6 first started. The socket may still read and delete pieces but no longer writes them.

The store is format-agnostic by rule, not by accident: no content type, file name, duration or "kind" ever appears in a row or in the path. A voice message, a photo, a video and a document look alike to the server; what a media id is, and the key that opens it, is known only to the sealed message that points at it. Limits are in 9.2.

Audio messages are media attachments and nothing more: the client records, encodes and encrypts the clip exactly as it does a photo. Browsers record with `MediaRecorder` at 32 kb/s, preferring AAC in MP4 (which every browser and phone plays) and falling back to Opus in WebM; the duration and a waveform are computed before encrypting and sealed in the descriptor. A phone app records AAC with the platform recorder and uses the same descriptor and the same upload path; the server needs nothing new for it.

### 8.3 Keyed blind addresses

Clients already address five things by secrets they derive themselves: `accounts/<loc>`, `logins/<tag>`, `phones/<hash>`, `vault/<id>`, and `backup/<id>` (the backup moves from `backup/<handle>` to a blind address derived like the vault's, with label `hush-backup-id:`). Message backup, the chat-key store kept in that box so a fresh login brings past messages back, is on by default for accounts created from stage 7 on; accounts from before keep whatever they chose, and the switch stays in Settings, Advanced. Today those addresses are plain SHA-256 outputs, which a thief with the database can brute-force for phone numbers and weak logins.

The server therefore stores and looks up `HMAC-SHA-256(addr.key, address)` instead of the address, with `addr.key` a 32-byte secret kept at `/etc/hush/addr.key`, readable only by the service user, excluded from database backups and backed up separately. Stealing the database alone yields nothing reversible; stealing both reduces to today's situation.

### 8.4 In memory only, never on disk

Presence (last-seen per handle, expires after 24 hours), typing rows (expire after 15 seconds), connection sessions, chat levels, subscriptions, rate-limit buckets, the hourly address salt.

### 8.5 SQLite settings

WAL journal, `synchronous = NORMAL`, `secure_delete = ON` so deleted rows are zeroed, `foreign_keys = ON`, busy timeout 5 s, one writer (the single Node process), weekly `VACUUM` at a quiet hour, nightly backup through the online backup API.

### 8.6 Background jobs

| Job | Interval | Action |
|---|---|---|
| expiry sweep | 1 min | delete posts with `0 < exp < now`, and media whose `media_ids.exp` has passed (7.7); forget expired media tickets |
| mailbox sweep | 1 h | delete notes older than 30 days; a mailbox over 500 notes loses its oldest at drop time instead |
| link-request sweep | 1 min | delete `linkreqs/*` older than 10 minutes |
| presence and typing | continuous | in-memory TTL |
| backup | nightly | `.backup` to a temp file, encrypt with `age` to an offline public key, copy off the box (a Hetzner Storage Box or any other location the owner picks), delete temp, keep 7 |
| vacuum | weekly | reclaim and zero freed pages |
| disk watch | 1 min, on upload | refuse new media (507 `full`) when the data disk has under 10 % **and** under 5 GB free, so a large disk with room to spare keeps working; alerting the owner comes with stages 7 to 9 |

---

## 9. Validation and limits

### 9.1 Identifiers

| Thing | Pattern |
|---|---|
| handle | `^[a-z0-9_]{3,20}$` |
| group / channel id | `^[gc][A-Za-z0-9]{12}$` |
| DM id | `^d[A-Za-z0-9_-]{22}$` |
| post, comment, invite id | `^m?[A-Za-z0-9]{12}$` |
| media id | `^m[A-Za-z0-9]{12}$` |
| media piece index | `0` to `99999` in the path; the real bound is the most pieces the largest allowed file needs (9.2) |
| epoch | integer 0 to 31 |
| wrap label, tag | `^[A-Za-z0-9_-]{22}$` |
| room key | `^[A-Za-z0-9_-]{43}$` |
| blind address | `^[A-Za-z0-9_-]{43}$` for accounts, logins, phones; `^v[A-Za-z0-9_-]{32}$` vault; `^b[A-Za-z0-9_-]{32}$` backup |
| `oh`, `ph` | 64 lowercase hex |

### 9.2 Sizes

| Document | Limit |
|---|---|
| frame | 1 MB |
| post, comment, act, read, typing | 64 KB |
| chat record | 2 MB |
| directory entry | 256 KB; `name` 60, `bio` 200, `disp` must lowercase to the handle |
| vault, backup, account box | 2 MB |
| mailbox note | plaintext padded to exactly 1024 bytes before sealing; `ct` is therefore always 1040 bytes, on `POST /drop` and over the socket alike |

Media limits all live in one block, `MEDIA_LIMITS` in `server/src/limits.js`, overridable with `HUSH_LIMITS='{"media":{…}}'`, and the client reads them from `GET /media/limits`, so raising one for a bigger server is one change and a restart. Defaults:

| Media | Limit |
|---|---|
| piece | 1 MiB of plaintext (`pieceBytes`); a stored piece adds a 12-byte iv and a 16-byte tag |
| pieces per media id | enough for the largest allowed file: 477 at the defaults |
| photo | 25 MB before scaling (`imageBytes`) |
| GIF | 15 MB (`gifBytes`) |
| video | 500 MB (`videoBytes`), at original quality |
| video downloaded without a tap | up to 50 MB (`videoAutoBytes`); larger videos download when tapped |
| any other file | 500 MB (`fileBytes`) |
| voice message | 15 minutes and 15 MB (`voiceSeconds`, `voiceBytes`) |
| attachments per message | 10 (`filesPerMessage`) |
| all media in one chat | 2 GB (`chatBytes`), counted as stored bytes; refused with 507 `full` |
| free disk | uploads refused under 10 % and under 5 GB free (`minFreeDisk`, `minFreeBytes`) |
| media ticket | 10 minutes (`ticketTtlMs`), and never longer than its connection |

The server enforces the piece size, the piece count, the per-chat allowance and the disk guard. The per-kind sizes can only be checked by the client, since the server never learns the kind; they are the client's rules, published by the server so there is one place to change them.

### 9.3 Schema rules per collection

- `directory`: must contain `handle == <h>`, `ecdh{x,y}`, `sig{x,y}`; optional `name, disp, bio, photo, devs, findable, requests, kv, ts`.
- `channels/<cid>`: fields from 5.3 only; no-names denylist; `type` and `visibility` enumerated; `epoch` integer; `keys` and `akeys` values must be wrap objects or `{ v:2, d:{…} }`; whenever `meta` is written (create, update, `chat.rotate`) its `e` must equal the record's epoch after the write.
- posts: exactly the shapes in 5.7; `e <= epoch`.
- acts: id pattern and key set `{ post, kind, e, iv, ct, ts, sg }`, all required except `e`.
- reads and typing: id `^[0-9]+~[A-Za-z0-9_-]{22}$`, body exactly `{ ts, sg }`.
- media piece: over HTTP, a body of at least 28 bytes (iv and tag) and at most `pieceBytes + 28`; stored as `{ i, iv, d }`. Nothing else, ever: no content type, size hint, file name, duration or kind. Whether a media id is a photo, a document or a voice message is known only to the sealed post that references it. The only per-media facts the server keeps are in `media_ids` (8.2): total size and an optional expiry.
- `accounts`, `vault`, `backup`: exactly `{ iv, ct }` or `{ iv, ct, ts }`.
- `logins`: exactly `{ ts }`.
- `phones`: exactly `{ handle }`.
- `linkreqs`: states `wait`, `ok`, `no` with the fields the client writes today; a `wait` record may only be replaced after 10 minutes or by a `no`/`ok` transition.
- `presence`: `{ ts }` or `{ hidden: true }`; hidden deletes the in-memory entry.
- `search`: `{ h, n, n2 }`, `h == <h>`, strings ≤ 60 lowercase.

### 9.4 Rate limits

Buckets live in memory. "address bucket" means a token bucket keyed by `HMAC(hourlySalt, remoteAddress)`; the salt is random, rotates every hour, and is never written anywhere, so the key cannot be reversed later. The address is read from Caddy's forwarded header, used for the HMAC, and discarded.

| What | Key | Limit (initial, tunable) |
|---|---|---|
| `hello`, `prove` | address | 30 / min; 10 failed proofs per 10 min then 10-minute block |
| `accounts`, `logins`, `linkreqs`, `phones` reads | address and per path | 20 / min per address, 60 / h per path (`blindReadsPerMinPerAddr`, `blindReadsPerHourPerPath`); `get` and every path of an `mget` alike, proven or not |
| `directory` create (a sign-up) | proof of work on the connection, with an address count as a backstop | the create must bring a nonce with `sha256("hush-signup-v1\|<salt>\|<nonce>")` starting with `signupPowBits` (16) zero bits, the salt being the connection's own and good for one account; the page fetches the puzzle when the sign-up screen opens and solves it while the person types, so no step is visible and nothing is added to the tap. Behind it, 100 a day per address under a second salt that turns daily (`signupsPerDayPerAddr`), since the hourly tag would reset the count |
| `POST /drop` | address, recipient | 30 / h per address, charged on every attempt; 100 / h per recipient; proof of work once a recipient's hour is half used, or always for a recipient with `requests: true` (section 6) |
| `chat.create` | connection | 200 / day (`chatCreatesPerDay`) |
| `chat.invite` | address | 20 / min (`invitesPerMinPerAddr`), as 5.5 asks |
| `chat.open` failures | address | 20 / min |
| posts and comments | connection | 60 / min (`postsPerMin`); a connection is one person, which is what "per chat level" meant |
| media writes | chat | 600 / min media pieces per chat (`pieceWritesPerMinPerChat`) |
| media reads | address | 3000 pieces / min (`pieceReadsPerMinPerAddr`) |
| `media.ticket` | connection | counted as a frame; at most 200 live tickets per connection, the oldest give way |
| acts, reads, typing | connection | 120 / min (`sideWritesPerMin`) |
| `query`, `mget` | connection | 120 / min |
| `search` queries | connection | 30 / min (`searchPerMin`) |
| directory reads | connection | 600 / min, every path of an `mget` counted (`directoryReadsPerMin`). The 60 first written here would cut off anyone with more than 60 contacts, because the page refreshes every contact's profile once a minute; lowering the limit means slowing that refresh (open item 14.9) |
| all frames | connection | 300 / min, 50 MB / min |

---

## 10. Threat model

### 10.1 Assets

Message and media content; group membership and the social graph; the mapping of real-world identifiers (phone, email) to handles; account recovery blobs; availability.

### 10.2 What the server stores, by sensitivity

| Stored | What it reveals |
|---|---|
| directory entries | public profiles and public keys, by design |
| opt-in search and phone entries | that a person chose to be findable; phone entries are keyed-hashed at rest |
| chat records | random ids, type, public or private, epoch, how many wraps exist (roughly members times devices), hashes of room keys, sealed metadata, activity time of the last message |
| posts, acts, reads | per chat: times, sizes, pseudonymous tags, ciphertext |
| media pieces | per chat: how many media ids, their sizes and piece counts, when they were uploaded, and for media of a disappearing message, when it expires; never what kind of file, its name or its key |
| mailbox notes | recipient handle, hour of receipt, an opaque 1 KB blob, until the owner deletes it or 30 days pass |
| account, vault, backup boxes | ciphertext at keyed-hashed addresses |
| link requests | for up to 10 minutes, a sealed device-handoff blob at a keyed-hashed address |

### 10.3 What the server never stores

IP addresses; which handle is in which chat; who sent any post; who talks to whom; which handles share a device or connection; message content, names of private groups, member lists, contact lists; receipt timestamps other than the mailbox hour; access logs of any kind.

### 10.4 Adversaries and outcomes

**A1. Someone steals the database or a backup.** Gets everything in 10.2 and nothing in 10.3. Cannot reverse phone or login addresses without `addr.key`. Cannot open any box or message.

**A2. A curious operator watching the live process.** Additionally sees, per connection, the proven handle, which chats it opened, and the network address. Can therefore reconstruct membership over time by watching. Nothing durable records it, and the design keeps sender identity off the mailbox path, but this adversary is only partly defended against. Full defence requires network anonymity, out of scope.

**A3. A malicious server.** Can refuse service, delete or reorder data, serve stale chat records, and withhold key rotations. Cannot read content, forge posts (inner signatures), inject members without a wrap that the invitee's device can open (it has no device private keys), or impersonate a handle (no account private keys). Two replays that would have let it re-admit a removed member through an honest admin's client are refused by the client (5.3): a copy of an older epoch's wrap presented as the new epoch's, and sealed metadata from before the removal. It can serve altered JavaScript; see 10.6.

**A4. Network attacker.** TLS 1.2+ with HSTS. The WebSocket upgrade, and CORS on `/drop` and `/media`, admit only a listed origin (`HUSH_ORIGINS`) or a page served from the host the request came to; a request with no `Origin` is refused unless the check is turned off for tests. The service takes a client address from `X-Forwarded-For` only when told it sits behind Caddy (`HUSH_TRUST_PROXY=1`); otherwise it uses the socket's own, so nobody reaching Node directly can forge their way out of the address limits.

**A5. A member with a tampered client.** Holds valid room keys for their chats. Can spam them within rate limits, overwrite tagged side rows, add wrap entries for outsiders (visible to other clients as unexplained wraps), and ignore client-side rules such as the one-message request limit. Cannot act in chats they are not in, forge another member's posts, or change settings that need an admin key.

**A6. An outsider.** Can enumerate handles through the directory at 600 per minute per connection (9.4), test whether a login exists at 20 per minute, probe account boxes at the same rate, drop mail into any mailbox within limits, and create accounts at the cost of one puzzle each, 100 a day per address. Can also reserve a login or a phone entry that is not theirs, since neither is verified yet (open item 14.10, stage 8). Account boxes already require guessing login and password through 600 000 PBKDF2 iterations client-side per attempt. Recipient-side filtering (contacts only, block) handles unwanted drops.

**A7. A compromised device.** Out of scope except that device keys never leave the device and the owner can rotate chats to exclude it.

### 10.5 Properties this design gives up relative to Firestore rules

Identity-based refereeing inside chats (one request message, bans on public joins, who may answer a request); exact `null` storage semantics; offline cache; managed uptime.

### 10.6 Trust in the delivered JavaScript

The service that stores ciphertext also serves the page that decrypts it. A compromised server could ship a backdoored page. Mitigations in order of cost: every file the page loads (its own `app/*.js` and `app/styles.css`, and the vendor script) carries an `integrity` attribute in `index.html` with the SHA-256 of its bytes, kept current by `npm run csp` and checked by the tests, so the browser refuses a changed file and publishing the SHA-256 of each released `index.html` still pins the whole app (the same tool writes a version made from the hash into each file's address, and Caddy marks `index.html` for revalidation on every visit and the versioned files as immutable, so a returning visitor never pairs a new page with a cached old file, which the pins would refuse and leave blank); serve the static app from a different operator than the API (for example a static host) and point the Content-Security-Policy's `connect-src` at the API domain, so that the API operator cannot alter the app silently; eventually an installable build. The owner should pick one before public launch (open item 14.3). Publishing the hashes is the release transparency item of 16.4; keeping anyone from changing the code in the first place is the rest of that checklist.

---

## 11. Logging, privacy operations and the server itself

### 11.1 Logging policy

- Caddy: no `log` directive, so no access log, for every route including `/drop` and `/media/*`. Error log to journald, messages only. Media responses are never cached (`Cache-Control: no-store` from the service) and not compressed (ciphertext does not compress).
- Node: no request logging. Error log lines contain an error code and a stack trace, never a path segment, handle, chat id or address. Uncaught exceptions do not dump memory.
- journald: `SystemMaxUse=200M`, `MaxRetentionSec=14day`.
- Metrics: counters only (connections, frames per second, database size, free disk), exposed on localhost for the owner.
- No third-party analytics, fonts, CDN or error-reporting services anywhere.

### 11.2 Host hardening

- Ubuntu with unattended security upgrades; `ufw` allowing 22, 80, 443 only; SSH keys only, root login off. The owner's checklist for these, and for the places outside the server from which the code can be changed, is 16.4 (stage 8). That port list is the baseline up to stage 9. Stage 10 adds one UDP port range for the call relay (section 16); hardening scripts and alerts written before then must treat the firewall list as configuration, not as an invariant that any extra listener violates.
- Service runs as user `hush` under systemd with `ProtectSystem=strict`, `ProtectHome=yes`, `PrivateTmp=yes`, `NoNewPrivileges=yes`, `ReadWritePaths=/var/lib/hush`, `Restart=always`.
- Full-disk encryption is not available on a standard Hetzner VPS image without a custom install; the owner decides whether to use an encrypted data partition unlocked at boot by hand (open item 14.4). Keyed addresses and ciphertext-only storage limit what an unencrypted disk exposes.
- Time kept by `systemd-timesyncd`; clock skew affects expiry sweeps.

### 11.3 Caddy duties

Terminate TLS for `<domain>`, redirect 80 to 443, send `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`; serve `/srv/hush/www` with the app files and correct types, `index.html` as `Cache-Control: no-cache` and the versioned files under `app/` and `vendor/` as immutable (10.6); proxy `/ws` (WebSocket), `/drop`, `/media/*` and `/healthz` to `127.0.0.1:8080`; pass the client address only in the forwarded header the service uses for the salted bucket (the unit file sets `HUSH_TRUST_PROXY=1` for that; without it the service uses the socket's own address); no compression on the WebSocket or on `/media/*`; no request-body size cap below the media piece size.

### 11.4 Deployment layout

```
/opt/hush/server/        service code, owned by root, read-only to hush
/srv/hush/www/           index.html, app/ (the page's own files, 12.1), vendor/, manifest, icons
/var/lib/hush/           hush.db, media.db, WAL files      (owner hush, mode 700)
/etc/hush/addr.key       32 random bytes                   (owner hush, mode 400)
/etc/caddy/Caddyfile
```

Releases are a `git pull` plus `systemctl restart hush`. Database schema changes run as versioned migrations at start-up.

---

## 12. Client adapter contract

The adapter replaces `connectFirebase` and returns an object with the same shape as today so that the rest of the page is untouched:

- `collection(path)` with `doc(id?)`, `add(d)`, `where`, `orderBy`, `limit`, `get`, `onSnapshot`, `onSnapshotMeta`.
- `doc(path)` with `id`, `get`, `set`, `update`, `delete`, `onSnapshot`, `collection`.
- Snapshot objects with `exists`, `id`, `data()`, `docs`, `size`, `metadata.hasPendingWrites`, `metadata.fromCache`.
- `uid` is removed; `flat` stays `true`; `now()` returns the server-offset time.

Adapter responsibilities beyond translation:

1. Open the socket at page load, `hello` immediately, `prove` once an account is active, reconnect with back-off, and open a fresh connection when the active account changes.
2. For any path under `channels/<cid>`, ensure the chat is open on the connection first. It asks the app for keys through a small interface the app provides: `member(cid, epoch)`, `admin(cid)`, `owner(cid)`. If the app has no chat key yet, the adapter performs the preview read and hands `keys` to the app so it can trial-decrypt its wrap.
3. Emulate `hasPendingWrites`: on a local `set` or `add` under a subscribed query, deliver a synthetic snapshot with the pending document, then deliver the server's push without the flag. `fromCache` is always `false` in this version.
4. Batch concurrent `get` calls on `directory/*` and `presence/*` into `mget`.
5. Keep ordering and `limit` for subscriptions client-side after `init`.
6. Translate `sub` with `ids` for the chat list watcher.
7. Send nested objects as-is for `update`; the Firestore dotted-path flattening is removed.
8. Media over HTTP (7.7): `putPiece`, `getPiece`, `deleteMedia`, `copyMedia`, `mediaLimits`. The adapter fetches and caches one media ticket per chat, renews it a minute before it runs out or after a 401, re-opens the chat once after a 403 (a rotation it has not heard of yet), and forgets every ticket on reconnect.

**Development conveniences.** An optional static file mode (`HUSH_STATIC`) serves only `index.html`, `app/*.js`, `app/*.css` and `vendor/*.js` from the same origin; `npm run dev` turns it on. The legacy data model that bridged stages 2 and 3 was retired in stage 4; the client writes only the shapes in this document now.

### 12.1 The page's files (stage 7)

The page was one file with one inline script until stage 7. It is now `index.html` (the markup, the policy, and the tags that load the rest) plus a folder `app/`:

| File | Holds |
|---|---|
| `app/styles.css` | every style the page had inline |
| `app/config.js` | `HUSH_CONFIG`, the server address the owner edits |
| `app/crypto.js` | keys and sealing: identities and device keys, the chat-key store and message backup, DM ids, key wraps and room keys, message and metadata sealing, side-channel tags and signatures, media encryption (the `HUSH MEDIA` block), recovery words and login boxes (`HUSH RECOVERY`, `HUSH AUTH`), the sign-in proof, the QR handoff bundle, inbox notes |
| `app/adapter.js` | the WebSocket adapter (the `HUSH ADAPTER` block), the page's connection setup, and anonymous `POST /drop` (the `HUSH DROP` block) |
| `app/ui.js` | the screens and everything that drives them: icons, DOM helpers, the page state, every screen and sheet, media display, the inbox watcher, the boot |

The four scripts are classic scripts loaded in that order and share one global scope, exactly as the single script did, so nothing was renamed, wrapped or exported and behaviour is unchanged. The one rule that keeps it so: the files loaded before `app/ui.js` only declare things at top level (functions, arrow functions, literals, empty maps), since code that ran at load time there could reach for a name `ui.js` has not declared yet. The tests check that rule, the load order, and that no name is declared twice. The server's tests lift the marked blocks out of these files by their markers, as they did from the inline script.

### 12.2 What the page keeps on the device (stage 7)

The page is built for a hostile browser environment: a copy of its storage, a shared or stolen device, a page left open.

**One sealed store.** Everything the page keeps under `hush:` lives in one map in memory and reaches disk only as one AES-256-GCM blob, `localStorage['hush:sealed']`: account and device private keys, the ownership secret, chat keys, invite secrets, logins, phone numbers, drafts, read marks, which chats were pointed to whom, the active account. Only the lock settings, the theme and the blob itself are stored plain. `sessionStorage` is not used. The blob's key is:

- the lock password's key (PBKDF2-SHA-256, 600 000 rounds, a random salt) while a password lock is on, so the keys are unreadable without the password even to someone holding the whole storage; or
- otherwise a device key the browser made once, non-extractable, kept in IndexedDB. JavaScript can use it but never read it, and a copy of `localStorage` alone opens nothing. Where IndexedDB is unavailable the key sits next to the blob and the password lock is the real protection.

Turning the password lock on re-keys the blob under the password; turning it off re-keys it under the device key. Nothing is ever written out plain again. On first start after this change, the old plain entries are moved into the blob and removed; a blob that will not open (the browser lost the device key) is set aside, not deleted. Other tabs of the same page pick up each other's blob through the `storage` event.

**The lock.** With a PIN or a password set, the page shows the gate before anything is unsealed: no keys, no chat list, no messages exist in memory until it passes. Locking after time away is a reload, with a PIN just as with a password, so every unsealed byte (keys, decrypted messages and media, the screen itself) is gone the moment the lock falls. Five wrong tries back off; "forgot" clears the device.

**Logout.** Removes that account's entries from the store (keys, chat keys, login, drafts, marks, the invite secrets it made), takes the device off the profile, and drops everything unsealed from memory, including decrypted media and its object URLs. Logging out the last account also deletes the blob and the device key, and a fresh empty store is made. An account logged out elsewhere (its keys replaced on another device) is wiped the same way.

**No service worker.** The page registers none and must not gain one without rules: a future worker may precache `index.html`, `app/` and `vendor/` only, must never cache `/ws`, `/drop` or `/media/*` (which the server also marks `no-store`), and must never hold a decrypted byte. Decrypted media exists only as in-memory blobs with object URLs that are revoked on logout and die with the page.

Outside the page's control: the browser's own password manager, which is offered the Hush password only on the person's say-so, and the browser profile on disk, which is the operating system's to protect.

### 12.3 Badges and mentions (stage 8)

**Badges.** The operator decides who carries a badge, in `HUSH_BADGES` on the server, and nowhere else. The server sends the whole list in the `hello` reply (`badges: { "<handle>": "founder" | "verified" }`), and the page draws the badge after that person's name wherever a name is shown: the chat list, the chat header, the profile sheet, search results, member lists, and sender names in groups and channels. A profile document cannot carry a badge (9.3 refuses unknown fields) and the page never reads one from a profile, so nobody can give themselves one. The list is public by nature and names handles only.

**Mentions.** `@handle` in a message is shown as a link wherever the page shows the text, in one-on-one chats, groups and channels alike. The link is made from the text alone: nothing is looked up because a mention is on screen. A tap looks the handle up (the same lookup the search box uses, which respects "reachable only by link") and opens the one-on-one chat with that person under the usual message-request rules; a mention of oneself opens one's own profile; a blocked or unfindable handle shows a short notice.

**The picker.** Typing `@` and some letters in the message box offers a short list of people to insert. The list is drawn only from what the page already knows about the conversation: a group's members, a channel's owner and admins, the other person in a one-on-one chat. It never searches the server or looks anyone up, so it is instant and tells the server nothing about what is being typed. Matching prefers a username prefix, then a name prefix, then a word of the name, then anything containing the letters; at most six are shown. Arrow keys move, Enter or Tab inserts, Escape dismisses until the letters change.

---

## 13. Changes to the client implied by this specification

Line numbers refer to the single-file index.html of the time and are for orientation only; the code now lives in the files of 12.1.

| Area | Change |
|---|---|
| Security policy, line 5 | `connect-src` becomes `'self' wss://<domain>`; drop Google domains and `frame-src`; recompute the inline-script hash after every edit (tooling in stage 2). |
| Firebase libraries and config, lines 551 to 596 | Removed; replaced by the adapter. |
| Boot, line 3771 | Call the new connector. |
| Device binding, lines 3170 to 3177 | Replaced by `prove`. |
| Inbox, lines 3700 to 3734 | The chat list comes from the vault; `watchInbox` subscribes to those ids with `sub ids`; `ensureInbox` is removed. |
| DM ids, line 841 | ECDH-derived id; peer learns of the DM through a mailbox drop. |
| Chat creation, lines 2377 to 2380 and 2423 to 2427 | Members, owner, admins move into sealed `meta`; wraps keyed by random labels; `chat.create` with room keys. |
| Key lookup, lines 1157 to 1166 | Find own wrap by trial decryption instead of `keys[e][handle].d[devId]`. |
| Key wrapping, lines 1135 to 1141 | Emit `{ label: wrap }` entries per device. |
| Rotation and healing, lines 1186 to 1215 | Use `chat.rotate` and derive the new member key. |
| Invites and joining, lines 1381 to 1421 | `chat.join`; joiner posts a `join` service note instead of editing `members`. |
| Adding members, lines 2439 to 2448 | Wraps plus sealed `meta` plus mailbox drop. |
| Leave and remove, around lines 2530 to 2545 | `leave` service note; removal is a rotation. |
| Message requests, lines 3404 to 3418 and 1855 to 1861 | Request lives in the mailbox drop; no `req` field, no `req` slot. |
| `showMeta` / `readMeta`, lines 1325 to 1349 | Sealed metadata gains `owner, admins, members, banned`; helpers like `isMember`, `isAdminH`, `dmPeer` read from the unsealed copy. |
| Service notes, lines 1272 to 1289 | New kinds `join` and `leave`. |
| Backup, lines 801 to 811 | Blind address instead of `backup/<handle>`. |
| Presence, line 1655 | Unchanged shape; server keeps it in memory. |
| Legacy paths | Named posts, `inbox1` migration query, `ensureMigrated`, `upgradeMeta`, account-key wraps, and the "tidy away the old named mark" deletes become dead code and are removed. |
| `_by` / `_uid` stamping and `anon()` | Removed; the server no longer wants them. |

---

## 14. Open items

1. **Domain name.** Caddy needs a DNS name for automatic certificates. The owner provides one whose A record points at the server (`<server address>`). The spec refers to it as `<domain>`.
2. **Proof of work on drops.** Decided in stage 5: on for recipients with `requests: true`, and for any recipient whose hourly allowance is half used (section 6).
3. **Who serves the JavaScript.** Same origin as the API (simplest) or a separate static host (stronger trust split, see 10.6). Default: same origin for the first release.
4. **Disk encryption on the VPS.** Encrypted data partition unlocked by hand after reboot, or rely on keyed addresses and ciphertext-only storage. Default: no disk encryption in the first release.
5. **Decoy wraps.** Allow rotators to add random wrap entries to blur group size. Default: off.
6. **Presence model.** Keep handle-keyed in-memory presence, or move to per-chat beacons. Default: keep, opt-in as today.
7. **Login existence check.** Keep the "no account with that email" pre-check, which is an enumeration oracle, or remove it from the sign-in flow. Default: keep, rate-limited.
8. **Plain `type` on chat records.** Keep plaintext (default) or fold into sealed `meta` at the cost of touching every `typeOf` call site.
9. **Directory read rate.** Decided: 600 per minute per connection (9.4), since the page refreshes every contact's profile each minute.
10. **Unverified logins and phone entries.** Parked until stage 8. A login reservation and a phone entry are first come, first served, and a reservation is never deleted: anyone can take another person's email or number before they do, and a taken phone entry points searches by that number at the taker. Closing this needs a verification code by email or SMS at sign-up, which needs the domain and a way to send; both come with stage 8.
11. **Wrap salt without the epoch.** Decided and built: wraps made from stage 7 on name the epoch in the salt (5.3); wraps from before still open, under the client's replay rule.
12. **Secrets derived from the signing key.** Decided and built: accounts created from stage 7 on carry a private secret `own` for ownership tokens and owner keys (5.1, 5.7); accounts from before keep the old derivation, so nothing of theirs changes hands.
13. **Sign-up limit per address.** Decided and built: proof of work on every sign-up, solved by the page out of sight, with 100 a day per address as a backstop only (9.4).

---

## 15. Summary of guarantees for the owner's privacy statement

The Hush server stores encrypted messages it cannot read, public profiles, and the minimum needed to deliver data to the right people. It does not store IP addresses, access logs, chat membership, who sent which message, or who talks to whom. Group names and member lists are encrypted with the group's own key. People find their chats through an encrypted list only their own devices can open. Invitations arrive in a sealed mailbox that records only the recipient and the hour. A copy of the database reveals who has an account and how busy each chat is, and nothing else.

---

## 16. Stages, and what the early ones must leave open

The stage numbers used throughout this document and in `server/README.md`:

| Stage | Scope | Status |
|---|---|---|
| 1 to 4 | Transport, document store, live subscriptions, identity plane, capability plane, client adapter | Built |
| 5 | Mailbox: `POST /drop`, padded notes, proof of work, the block list (section 6) | Built |
| 6 | Media over HTTP: photos, videos, voice messages and any file, each under its own key, with tickets for the room-key gate (7.7, 8.2, 9.2) | Built |
| 7 | The page split into `app/` files pinned by `index.html` (12.1, 10.6); the security review and its fixes (replay rules in 5.3, constant-time checks, the rate limits of 9.4, sign-up proof of work, strict origin and proxy defaults, the per-account ownership secret, wraps that name their epoch); the sealed on-device store, the lock gate and logout wipe (12.2); the native-build plan (16.5); the stage 8 checklist (16.4) | Built |
| 8 | Locking down write access, the checklist in 16.4: the developer PC and the backup copy of the code, the Hetzner server, the Hetzner account; release transparency. With the domain in hand, verification codes by email or SMS at sign-up (open item 14.10) | Built and live since 2026-10-09, except 14.10 |
| 9 | Operations: backups, monitoring, and whatever of section 11 is still open | Planned |
| 10 | Voice and video calls | After launch |

### 16.1 Audio messages (stage 6)

Built with stage 6. An audio message is a media attachment of kind `voice`. It uses the same pieces, limits, tickets and HTTP routes as any other file (7.7), and the server cannot tell it from a photo: pieces carry `{ i, iv, d }` and nothing else, and every descriptive fact about the clip (codec, duration, waveform) lives inside the sealed descriptor. Recording is described in 8.2; a clip may run 15 minutes (`voiceSeconds`).

### 16.2 Voice and video calls (stage 10)

Calls use WebRTC between the two clients for encryption and codecs, and nothing else from WebRTC's usual connectivity story. Specifically:

- **Media is relayed through our own server, always.** The service runs a relay (a TURN-style UDP listener next to the Node process, on the same host, not behind Caddy) and clients offer relay candidates only. Host and server-reflexive candidates are never gathered or exchanged, so neither party's client address ever reaches the other party. This is the whole point of stage 10's design and is not a fallback to be turned off for speed.
- **Signaling rides the existing WebSocket as sealed posts.** Offers, answers and candidates travel inside the chat exactly like a message, encrypted with the chat key of the current epoch, under the pseudonymous tag. The server sees that a chat had some small posts; it does not see that a call was placed, let alone by whom. Call setup therefore needs no new identity-plane rule: whoever holds the member key may signal.
- **Relay credentials are per call, short-lived, and granted to a proven connection.** A `call.*` family of ops (reserved now, answered `invalid` until stage 10, in the same way `mail.*` is reserved for stage 5) hands out a relay allocation to a connection that has opened the chat with its member key.
- **The relay keeps addresses the way the rest of the service does: in memory, for the life of the session, never on disk, never in a log.** Relay sessions are rate-limited by the same hourly-salted address tag as everything else (9.4). The relay sees both endpoints' addresses for the duration of the call, which is the same exposure adversary A2 already has for every WebSocket, and no more. Media bytes passing through it are end-to-end encrypted by WebRTC (DTLS-SRTP); the relay cannot read them.
- **Group calls are not promised by this section.** If they come, they come through the same relay and the same sealed signaling; nothing here should be read as a design for them.

### 16.3 What stages 1 to 9 must not do

Each of these is a door that an earlier stage could close by accident. They are constraints on that stage, not work for it.

| Stage | Must keep | Because stage |
|---|---|---|
| 7 to 9 (media, kept from stage 6) | Pieces stay opaque: no content type, duration or kind, in the row or the path. Limits stay in the one `MEDIA_LIMITS` block. The post size limit (64 KB) is not lowered, since posts carry the sealed media descriptors. | Audio must stay indistinguishable from other media. |
| 7 to 9 (hardening) | The firewall list in 11.2 is configuration. Alerting, intrusion checks and the systemd unit must not assume the Node process is the only listener or that 443 is the only open port. | 10 adds a UDP relay listener. |
| 7 to 9 (hardening) | The no-address rule in 11.1 is written for the service, not for one process: any component added later, relay included, inherits it. | 10's relay would otherwise be the first place addresses could leak. |
| 7 to 9 (operations) | The deployment layout in 11.4 leaves room for a second service unit and its own config under `/etc/hush/`. Caddy is not assumed to front every listener. | 10's relay is a sibling of Node, not a route through Caddy. |
| 5 and 7 (protocol) | The frame grammar reserves the `call.*` op family alongside `mail.*`. Nothing treats "every op is a document op" as a rule. | 10 hands out relay allocations over the same socket. |
| 4 and 5 (capability plane) | Signaling is just posts: no stage adds a server-side notion of "who is in a call" or a new per-chat record type that the server can read. | 10 keeps call metadata as invisible as message metadata. |
| 3 (identity) | Nothing ties a connection to a network address beyond the hourly-salted bucket. | 10's relay rate limits reuse that bucket and nothing else. |

### 16.4 Stage 8: locking down write access

Everything else in this document protects what the server stores. It counts for nothing if someone can change the code itself: an altered `app/ui.js` can send every key to a third party, and the pins of 12.1 only prove that the page a person received is the page the server meant to send. The code can be changed from three places, and there is one way for anyone to notice if it was. Each item is a box to tick before launch; none needs a code change.

**The developer PC and the backup copy of the code.** The code is written here and the server is reached from here, so this is the first place to protect.

- [ ] The Windows account has a password or PIN of its own and locks itself after a few minutes away; nobody else uses it. Windows Hello is fine. What matters is that nobody can sit down at an unlocked session.
- [ ] The drive is encrypted (BitLocker, or device encryption on Home editions), so a lost or stolen PC does not hand over the code, the SSH key and the signed-in sessions.
- [ ] The SSH private key that opens the server has a passphrase, lives only on this PC, and is never copied into the backup of the code.
- [ ] The backup copy of the code (GitHub, or wherever it lives) is private, and the account that owns it has two-factor sign-in on, with the recovery codes written down and kept offline. Where the service allows it, password-only sign-in is turned off.
- [ ] Only the owner can write to that copy: no collaborators with push access, no deploy tokens, no integrations that can push. `git pull` on the server reads this copy (11.4), so whoever can write to it can change what runs.
- [ ] The email account behind the backup service and the Hetzner account has two-factor sign-in too, since password resets arrive there.

**The Hetzner server.**

- [ ] SSH accepts keys only: `PasswordAuthentication no`, `PermitRootLogin no`, `KbdInteractiveAuthentication no`, one named admin user with `sudo`. If the owner's own address is fixed, `ufw` limits port 22 to it.
- [ ] The firewall allows 80 and 443 to everyone, 22 for SSH, and nothing else (`ufw default deny incoming`), as in 11.2. Hetzner's own firewall in the Cloud Console repeats the same list, so a slip on the box is caught by the second one.
- [ ] Security updates install themselves (`unattended-upgrades`, with a reboot window at a quiet hour), and the owner looks at `apt list --upgradable` now and then for anything held back.
- [ ] The service runs as `hush`, a user with no shell and no password, under the systemd unit of 11.2 (`ProtectSystem=strict`, `NoNewPrivileges=yes`, `ReadWritePaths=/var/lib/hush`).
- [ ] The app's files are read-only to the app: `/opt/hush/server` and `/srv/hush/www` are owned by root, mode 755; `hush` and Caddy can only read them; only `/var/lib/hush` is writable by `hush`. So even a bug in the service cannot change the code the next visitor is served.
- [ ] Nothing else runs on the box: no panel, no second site, no database reachable from outside. `ss -tlnp` shows Caddy on 80 and 443, Node on `127.0.0.1:8080`, SSH, and nothing more.
- [ ] Releases happen only over SSH from the developer PC (`git pull`, then `systemctl restart hush`, 11.4). There is no web-based deploy hook.

**The Hetzner account.** Whoever holds it can open a console on the server, reset its root password or copy its disk, so it is a way around every item above.

- [ ] A strong password used nowhere else, kept in a password manager.
- [ ] Two-factor sign-in turned on (an authenticator app, not SMS), with the recovery codes kept offline next to the backup service's.
- [ ] One account, one owner: no shared logins, and no project members who do not need access.
- [ ] The rescue console and the password reset are the account's superpowers; the owner treats the account like the server's root key.

**Release transparency.** The items above keep outsiders out. This one lets anyone check that it worked, and lets them check on the owner too.

- [ ] Every release publishes the SHA-256 of its `index.html`, with the date and the release name, somewhere the server cannot quietly rewrite: the release notes in the code's repository, or any other place the owner already announces releases. Because `index.html` carries an `integrity` attribute for every file it loads (12.1, 10.6), that one hash pins the whole app: a changed `app/ui.js` would not load under the published page, and a changed `index.html` would not match the published hash.
- [ ] Anyone can verify what they are served: `curl -s https://<domain>/ | sha256sum`, or save the page from the browser and run `certutil -hashfile index.html SHA256` on Windows, then compare with the published value. The privacy statement (section 15) gets a line saying this exists and where the hashes are.
- [ ] The published list is only ever added to, never edited. A hash that changes without a new release line is the signal that something on the server was changed.

### 16.5 Native build (Capacitor, iOS)

The App Store version wraps the same page: `index.html`, `app/` and `vendor/` become the web assets of a Capacitor project and run in WKWebView. Nothing is rewritten for it.

**What stays the same.** The whole page and its script files, the adapter and the protocol, every key, every piece of encryption, the server. The sealed store (12.2) works as is: WKWebView gives the app its own `localStorage` and IndexedDB inside the app container, so the device key lives there; for the launch build the blob may move to the Keychain through a Capacitor plugin, which only changes where `hush:sealed` is read and written, not what it holds. Face ID in front of the lock gate is the one addition the lock screen has been waiting for.

**What changes.**

- **Server address.** The page cannot fall back to its own origin (it loads from `capacitor://localhost`), so `app/config.js` carries the real address, `wss://<domain>`, and the policy's `connect-src` lists `https://<domain>` and `wss://<domain>`. `npm run csp` pins the file as usual.
- **Origin.** WKWebView sends `Origin: capacitor://localhost`, so that value goes into `HUSH_ORIGINS` beside the site's own; nothing else on the server changes.
- **File picker.** `<input type="file">` works in WKWebView for photos, videos and files; the album picker and the camera sheet open natively. Where the system picker falls short (several videos at once, the camera roll's originals), the Camera and Filesystem plugins hand back the same `File` objects and the rest of the media path (7.7) is unchanged, including "never re-encode video".
- **Camera and microphone.** `getUserMedia` works in WKWebView from iOS 14.3 with the usage strings in `Info.plist`, so voice messages and the in-app QR scanner run as they do on the web; the Camera plugin is the fallback for photo capture.
- **Push.** Push arrives through APNs via the Push Notifications plugin, and the only thing a push may carry is "something is waiting": no sender, no chat, no text. The server knows the recipient of a mailbox note, so a note can wake a device; a message in a chat cannot name a member, so a push for it would need a per-chat registration under the chat's side-channel tag (5.3), which is a design for a later stage, not a change to this one. Until then the app refreshes on open, as the web page does.
- **Release transparency.** The hash published for a release (16.4) is of the `index.html` inside the app bundle too; the App Store build is made from the same files and says which release it carries.
