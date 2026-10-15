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
| `directory/<h>` | anyone, rate-limited (the sign-up screen checks availability before an account exists) | only `h`, doc.handle == h, doc.sig == proving key | only `h`; `ecdh`/`sig`/`kv` may change only if `kv` increases and the connection proved with the account key (not a device key); `prev` never, the server writes it (below); a tombstone (4.7) never | never; `account.delete` turns it into a tombstone (4.7) |
| `search/<h>` | query only, see 7.6 | only `h`, doc.h == h | only `h` | only `h` |
| `presence/<h>` | anyone proven, batched | only `h` | only `h` | only `h` |
| `phones/<hash>` | nobody: matching is off, 12.4 | nobody | nobody | only stored doc.handle |
| mailbox of `h` | pull / ack only by `h` | drop by anyone, see 6 | – | ack by `h` |

The server reads the `devs` entries for one purpose only: to check a device-key proof. It never stores anything about devices beyond those signed entries on the profile. Until stage 4 lands, everything under `channels/` requires a proven connection and nothing more.

**Key history (release 21).** When an account's keys change (`kv` rises; 14, item 15) the server itself appends the old signing key and its own time to the entry's `prev`: a list of at most eight `{ sig: {x, y}, until }`, the oldest dropped first. Clients never write it: a `set` or `update` that would change it is refused with `denied`, a `set` that leaves it out keeps the stored one, and a new entry may not bring one. Every device uses it to check messages signed before the change (`verifyBy`: an old key is accepted for a post, a sealed service note or a signed invitation note dated up to a minute after its `until`, and the result says so; a service note so verified is shown but never acted on; reactions, reads and typing take the current key only). For a contact whose key the device pinned, only the keys it pinned before count as history (kept at acceptance in the vault's pins), never the profile's `prev` alone, so a server can't vouch for a key the contact never had. A key change raises `kv` by exactly one, brings a new signing key, and is taken only from a connection proven with the key on record. Because a proof is checked asynchronously, `prove` reads the entry again afterwards and refuses with `denied` when its `sig` or `kv` changed in between, or when a free name was created in between; a successful proof records the key version it was made against, and the reply carries `kv`. When `kv` rises, every other connection proven for that handle holds the old keys and is closed with code 4401 `keys changed` (7.2); the connection that wrote the change is marked up to date. A sign-up proof is a reservation, not an account: when the profile is created over another connection, the reserving connection is closed with 4401 `username taken`.

### 4.3 Collections that need no proof

Five collections are addressed by secrets the client derives itself, so knowing the address is the credential. They are reachable before `prove`, which the sign-in, recovery and device-link flows require, and are rate-limited per address bucket and per path (9.4). At rest their addresses are keyed-hashed (8.3).

| Path | get | set / create | update | delete |
|---|---|---|---|---|
| `accounts/<loc>` | anyone | anyone, if absent | never | anyone |
| `logins/<tag>` | anyone | anyone, if absent (from release 20 pages reserve nothing: the rows are the email and phone logins of accounts from before) | never | never |
| `linkreqs/<tag>` | anyone | a signed-in account: its own link offer, only at the address the offer's name makes (14.14) | the device that read the code claims an offer once; only the account that opened it answers (9.3); at a login's tag, nobody from release 16 | the account that opened the offer, or the new device once answered; at a login's tag, nobody |
| `vault/<id>` | anyone | anyone | anyone | never, except by `account.delete` (4.7) |
| `backup/<id>` | anyone | anyone, naming the version it merged (9.3, release 19) | never (from release 19) | anyone |

### 4.4 Removed from the old model

`owners/*`, `owners/*/devices/*`, `uids/*` and the `_uid` / `_by` stamps on every write are gone. The server rejects any document that contains a key beginning with `_`.

### 4.5 Password boxes and the login gate

A password box holds the account's keys, sealed with a key stretched from the password (PBKDF2-SHA-256, 600,000 rounds; the second half of the 512-bit output). The first half, hashed, is `x`. Until release 9 the box lived at `accounts/<x>`, so anyone could test a password guess by reading an address, with no limit per account, since the server could not tell which login an address belonged to.

From release 9 the box lives at `accounts/<HMAC-SHA-256(gate key, "hush-login-gate-v1|" + t + "|" + x)>`, where `t` is the login's tag (`SHA-256("hush-login-v1:" + username)`; until release 20 an account could also log in with the email address or phone number given at sign-up, each with a box of its own, and accounts from before keep those boxes) and the gate key is the server's `addr.key`. Only the server can make that address: the page asks with `login.gate {t, x}` and gets `{loc}` back. Every ask that finds no box is counted against `t`, whoever asks (`pwMissesPerLogin`, 10 an hour); asks that find the box are not counted, so a person who knows their password is never charged for it. From release 15 two more asks are not counted, and prove nothing: one that lands on an address whose box this login had until it was deleted (a password change deletes the old boxes; the server remembers those addresses, under its key, for 30 days, `boxGoneMs`), and the same address asked again within the hour. Neither is a new guess; every new wrong guess still counts, and the answer is the same in every case. While a login is out of tries every answer waits, the right password included, so the wait says nothing about which guess was right. Someone who steals the database without `addr.key` can no longer test guesses offline at all; with `addr.key` (or as the server) they still can, which is why an owner or admin of a group or channel needs a password of 12 characters or more (4.6).

Trade-off, stated plainly: the server now learns, when a box is opened or saved, which login tag the box belongs to. It could already see this on the live connection (the page reads the reservation and the box together); now it is a property of the address. Separate logins of one account still have separate, unlinked boxes.

From release 16 no way in depends on the box addresses in the account’s settings (14.14): linking a device needs no box, and nothing looks a saved address up at the gate, so settings left out of date by a password change on another device never cost a wrong-password try and never lead to a password being asked for. A device that logs in with the password puts that login’s right address back in the settings quietly, for every device. Saving the settings keeps the box addresses another device saved after a password change.

Boxes from before the gate are moved the first time they are opened (`findBox`: read `accounts/<x>`, write it behind the gate, delete the old one), and a signed-in device moves the boxes of all its logins on its next load, without the password. Until a box has moved, its old address can still be guessed without a limit: accounts with no device that loads release 9 stay exposed this way until they log in once.

**Recovery boxes are not behind the gate.** Recovery words (the `HUSH RECOVERY` block of `app/crypto.js`) are made on the device from a list of 1,024 words and stretched the same way (PBKDF2-SHA-256, 600,000 rounds, 512 bits): the first half, hashed, is the address `accounts/<loc>`, the second half the AES-GCM key of a box holding the account's keys. No server key is involved, so a copy of the database is enough to test guesses offline; the words are therefore long and salted per account. From release 24 a new set is 12 words (120 bits), salted with `SHA-256("hush-recovery-salt-v2:" + username)` and sealed with the additional data `hush-recovery-v2`, so a restore asks for the username with the words (the login screen's username fills it in). The salt is worked out on the device; nothing new is stored or sent. Sets made before (v1) are 6 words (60 bits) under one salt shared by every account (`SHA-256("hush-recovery-salt-v1")`, additional data `hush-recovery-v1`), so one stolen database could be attacked for everyone at once. They keep working, without the username, until replaced: the page reads exactly 12 or 6 words and refuses any other count, only ever makes 12, counts a 6-word set as set up, and asks (a dismissable banner, the Settings row, a note after a restore with them) for new words. Making new words deletes the old box once the quick check passes (until then the old words keep working, and removing a device deletes it too), so the weak one stops existing. The device's record of the words (`hush:recovery:<handle>` and its vault copy `rec`) carries `v: 2` for the new kind; no marker means the older kind.

---

### 4.6 Power roles need a secured account (release 9)

Passwords for everyone are at least 8 characters, not all lowercase letters, not common, and not containing the person's own username, email or number. An owner or admin of a group or channel holds keys to other people's chats, so they need a stronger password: 12 characters or more, passing the same checks.

The server never sees a password, so it can't check one. Instead the page sets the account's secured mark, `secure/<h>` = `{ts}`, once it has seen a strong password for the account: at sign-up, at log-in, at a password change, or in the prompt below. Only the account can set it, it is never changed or removed, and nobody can read it but the server, so nobody learns whose password is weak. A changed page could set the mark without a strong password; that weakens only its own account.

The server enforces it in the only two places a connection gains a power level: `chat.create` of a group or channel is refused with `secure`, and `chat.open` with an owner or admin key opens at member level and answers `held: "owner" | "admin"`. Every owner or admin action checks the connection's level, so the tools of an unsecured owner or admin wait. That covers every way into a role: creating, being promoted (the new admin's device opens with the admin key), holding a role from before release 9, and a new device of the account. Ownership can't be handed over in this version (5); a hand-over would go through `chat.open` too. `powerNeedsSecure: false` turns the rule off for development and tests only: a server running with `NODE_ENV=production` ignores it, so there the rule is always on.

The page asks at that moment, only when the account isn't secured: "Secure your account", naming the role and the chat ("You're now an admin of …. Admins hold the keys to this channel, so your password needs to be stronger"), with a suggestion to turn on the app lock. The prompt asks for the current password first ("Already strong? Just re-enter your current password."): if it is 12 characters or more, not all lowercase letters and not on the built-in list of common passwords, the account is marked secured and the password stays as it is. Only a current password that is too weak opens the fields for a new one, which must also pass the usual rules for choosing a password. Skipping (Not now, the close button, or Back) means: a new group or channel is not created; a role already held stays paused, read and post as a member, asked about again on the next load. Once secured, the page opens the paused chats again and gets the level its keys give.

The highest tier a person has held (none, admin, owner) is kept in their encrypted vault (`prefs.tier`), so the server never sees it. When it climbs past the best so far, the page fires `hush:tier-up` on `window` with `{tier}`, the hook for an upgrade card. A device of an account from before release 9 records the current tier silently the first time.

### 4.7 Deleting an account

Deletion is instant and can't be undone. The page asks for the password or the recovery words first; that check is the page's, not the server's (SECURITY.md).

**What the page erases first**, because only it can find these (their addresses come from secrets the server never sees): the password and recovery boxes, the message backup, the search entry, phone entries, the chats it owns; and it leaves its groups and channels. Then, as the last step, it sends `account.delete {vault}` (7.1) over a connection proven with the account key (4.1), naming its vault's id, which it alone can derive. A device-key proof or a sign-up proof is refused with `denied`, as is a connection proven against keys that have since changed, an account that doesn't exist or is already deleted; `unauth` before any proof; `invalid` for a malformed vault id, and then nothing is erased.

**What the server erases**, in one transaction: `vault/<vault>` (the only way a vault is ever deleted: a client `delete` is still refused, 4.3); every note in `inbox/<h>/c`; `secure/<h>` and `search/<h>`; every `phones` entry whose `handle` is `h`, and every retired `recovery` record and link offer (`linkreqs`) whose `h` is `h`; the block tags of `h` in every chat (5.6) and the reports `h` sent (8.7), found by working their keyed tags out again; and, from memory, the presence row and the mailbox's drop allowance. `directory/<h>` becomes a tombstone. The reply `{ok}` goes out, then every connection proven for `h`, the asking one included, is closed with 4410 `account deleted` (7.2).

**The tombstone** is `{ handle, gone, ecdh, sig, kv, prev? }`, `gone` being the server's time of deletion. It keeps only the public keys and the key history (4.2), so everyone's app can still check the messages the person signed; name, display name, bio, photo, devices, `findable`, `requests` and everything else are dropped. Anyone may still read it (that is how apps learn the account is gone). Nobody writes over it: `set`, `update` and `delete` on it are refused with `denied`, and no client may write `gone`. The username is never free again: `prove` as `h`, with any key, and a sign-up as `h` are refused with `gone`, decided before any signature is checked, so the kept keys sign nobody in. `POST /drop` to `h` answers exactly as for a name that doesn't exist. A tombstone is no account for `report.send` and `report.list`. `login.gate` (4.5) still answers for the account's login tag: it finds no box, since the page deleted them, and answers as it does for any login. A `logins/<tag>` reservation from before release 20 holds only a time, so it can't be told to be this account's and stays.

**What stays**: the messages the person sent, in other people's chats, which apps show under "Deleted account"; the public keys and the username, for good; copies of public-channel posts in reports other people sent (8.7), which hold the post as stored and are not tied to the account; tags in chats (reactions, read marks) that the server can't tie to anyone; and the nightly encrypted backups (8.6), which hold the erased records until they rotate out, up to 7 days.

---

## 5. Capability plane: room keys

Used for everything under `channels/<cid>`. The server never learns who is in a chat; it learns that the requester holds a secret for it.

### 5.1 The three keys

| Key | Scope | Derived from | Who holds it |
|---|---|---|---|
| member key `M_e` | one chat, one epoch | the epoch's chat key | every member device that can open epoch `e`; for public channels, anyone, because `openKeys` publishes the chat key |
| admin key `A` | one chat | a random 32-byte admin secret, wrapped to admins' devices in `akeys` | owner and admins |
| owner key `O` | one chat | the owner's private per-account secret `own`, made at sign-up and carried in the login box, the recovery box and the device handoff (accounts from before stage 7 have none and derive it from the signing private key, as before; a key replacement, 14 item 15, gives every account a fresh `own`) | owner only, recomputable on any of the owner's devices |

Derivations, all HKDF-SHA-256 with 32-byte output, encoded base64url (43 characters):

```
root_e  = HKDF(ikm = chatKey_e,          salt = "hush-caproot-v1", info = cid + "|" + e)
M_e     = HKDF(ikm = root_e,             salt = "hush-cap-v1",     info = "member")
A       = HKDF(ikm = adminSecret,        salt = "hush-cap-v1",     info = "admin|" + cid)
O       = HKDF(ikm = ownerSigPriv.d,     salt = "hush-cap-v1",     info = "owner|" + cid)
```

For a DM at epoch 0, where today's chat key is derived on the fly from the two account ECDH keys and never exported, `chatKey_0` in the formula above is the raw 256-bit ECDH shared secret between the two account ECDH keys. Both members can compute it; the server cannot.

The server stores `sha256(M_e)` for the current epoch only, `sha256(A)` and `sha256(O)` as lowercase hex. It never stores a key itself. Rotating to a new epoch replaces the member hash and immediately invalidates the old one.

As built: a DM also keeps the hash of its epoch-0 member key as a base key (`cap_b`), beside the current member hash. Either person can always derive it from the two account keys, so a device that lost its chat keys (a restore from recovery words) can still open the DM and rotate it to a fresh epoch. Without this, nobody could ever heal a DM.

**Replacing a base key or an owner key (release 21).** When an account's keys are replaced (14, item 15) the old shared secret still derives the old base key, so a removed device could open every DM with it. `chat.rebase { cid, cap }` replaces a DM's base key hash with the one the new keys give. Only a connection that opened the DM with its current member key (the one the last `chat.rotate` set, not the base key) may do it, and only once the DM has a key of its own (epoch 1 or later), so a device holding nothing but the old shared secret can't rebase a DM away from its owner; every other connection's level for the DM is evicted. Either person in the DM can do it (the server knows no members), so whoever holds the current member key first decides the base key: the page therefore re-keys its chats right after publishing the new account keys, and a chat whose keys were replaced from elsewhere first is named in the summary as lost ("start it afresh"). The pages keep the shared secret from before the change in their chat-key store (label `b`), so the DM's history stays readable, and try the old base key last when opening (12). `chat.owner { cid, cap }` replaces a group's or channel's owner key hash: owner level only, not for DMs, every other connection evicted. The owner key comes from the account secret `own`, which a key replacement rotates, so the owner moves it over; this is not a hand-over (5.6).

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
| `meta` | sealed | `{ e, iv, ct }`. Plaintext inside is now `{ name, desc, photo, owner, admins, members, banned }`. Private chats only. Admins write it (the member and blocked lists); when `ometa` is there, clients take name, description, photo, owner and admins from that instead and ignore them here. |
| `ometa` | sealed | `{ e, iv, ct }`, the owner's part: plaintext `{ name, desc, photo, owner, admins }`, sealed with the chat key of epoch `e` under its own associated data (`hush-ometa-v1|cid`, where `meta` uses `hush-meta-v1|cid`), so neither blob passes for the other. Private groups and channels only; written only at owner level (create, update, set). Unlike `meta` it is not re-sealed at every rotation, which carries it unchanged: the server accepts any `e` from 0 to the current epoch when it changes. A device added after it was sealed may hold only later keys (with Message backup off), so the owner's client seals it again under the current epoch whenever it is older (once per epoch, on load or when it sees a rotation); a client that can't open it shows `meta`'s name, description and photo and names no owner or admins. A server replaying an older copy could show an older name or admin list, never an older member list; the server-side powers stay with the keys. Not part of the preview (5.5). A group made before it gets one from the client the owner key opens for, naming that account owner whatever `meta` says, after the old blocked list was handed to the server (5.6); going public removes it (the server drops it). |
| `invites` | plain container | `{ [iid]: { iv, ct, ph, ts } }` as today. `ph` is the hex SHA-256 of the join proof. |
| `ts`, `last` | plain | activity marker, `last` as today but `from` must be null. |
| `pins`, `ttl`, `closed`, `reactions`, `comments` | plain | operational settings; contain post ids, numbers and emoji, never names. |

Group and channel ids are `g` or `c` followed by 12 alphanumerics, as today. DM ids change: `d` followed by 22 base64url characters of `SHA-256("hush-dmid-v1|" + ECDH(a, b))` truncated. Both parties compute the same id; the server cannot; the old `dm~alice~bob` form is gone. Saved messages (a DM with yourself) use ECDH of your own key with itself and the label `hush-dmid-v1|self|`. A conversation keeps its id across a key change (release 21): once either account's keys are replaced the two keys would derive a new id, so the page keeps, in its vault, which conversation belongs to which peer (`prefs.dms`) and looks there, then in its open chats, before deriving. The DM stays one conversation with its history, and a note or a chat that names the id is recognised instead of thrown away.

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
| update `pins` | member | admin | admin |
| update `ttl` | member | owner | owner |
| add wrap entries to `keys` (new labels only, never overwrite or remove; by `update` or `chat.join` only while the record stays within three quarters of its size limit, so a rotation, a removal, always fits: `toolarge` past that) | member | member | member |
| update `meta`, `invites` | – | admin | admin |
| update `reactions`, `comments`, `visibility`, `openKeys`, `name`, `desc`, `photo`, `owner`, `admins`, `ometa`; publish a key (`openKeys` in `chat.rotate`); `chat.rotate` of a public channel (its new posts would stop being public) | – | owner | owner |
| `chat.rotate` (new epoch, new member hash; one marked `why: "leave"` only up to epoch 23, 5.6) | member | admin | admin |
| `chat.admins` (replace `akeys` and admin hash) | – | owner | owner |
| `chat.rebase` (replace the base key hash, release 21) | member, opened with the current member key, epoch 1 or later | – | – |
| `chat.owner` (replace the owner hash, release 21) | – | owner | owner |
| `chat.ban` (block or unblock a username, 5.6) | – | admin | admin |
| `set` whole record (an admin may not change any field the owner's row above lists) | – | admin | admin |
| delete chat | nobody | owner | owner |
| `chat.join` with invite proof | – | anyone proven | anyone proven |

Letting any member add wrap entries means any member can hand the chat key to an outsider. The chat key already leaks that way by screenshot or forwarding, and the members list is in sealed `meta` where other clients can see unexpected additions, so this is accepted. Clients should warn admins when the wrap count for the current epoch exceeds members times verified devices.

### 5.5 Preview read

A `get channels/<cid>` from a connection without a level for `cid` returns a trimmed record: `type`, `visibility`, `epoch`, `keys`, `akeys`, `openKeys`, and for public channels also `name`, `desc`, `photo`, `owner`, `admins`, `ts`, `last`. This is what a newly invited device needs to find its wrap, derive the chat key, derive `M_e`, and `chat.open`. `chat.invite { cid, iid }` additionally returns `{ iv, ct }` of one invite so that a link holder can decrypt the key history and show a join preview. Both are rate-limited per address bucket because chat ids, while random, may leak.

### 5.6 Creation, joining, leaving, removal

**Create.** `chat.create { cid, d, caps: { m, a?, o? } }` from a proven connection. `cid` must be unused. `d` passes the no-names rule and schema. The server stores the hashes of the supplied keys. DMs supply `m` only; groups and channels supply all three. Because both ends of a DM can compute the same id and member key, creating a DM that already exists with a matching member hash succeeds as a no-op, so two people who start the same conversation at the same moment land in one chat.

**Invite someone to a group or channel.** The admin adds wrap entries for each of the invitee's verified devices for every epoch, re-seals `meta` with the new member, and drops `{ t: "invite", cid }` into the invitee's mailbox (section 6). The invitee's device previews the chat, finds its wraps, opens the chat, and writes the chat into its vault chat list.

**Start a DM.** The initiator computes the DM id, creates the chat with `M_0`, then drops `{ t: "dm" }` to the peer. If the peer's directory entry says `requests: true`, the initiator instead drops `{ t: "request", text }` with the first message inside the drop and creates nothing. Accepting means the recipient creates the DM and drops `{ t: "dm" }` back; the initiator's client then sends the message into the chat. Declining means doing nothing. The server has no notion of pending requests at all; the `req` field is gone.

**Join by link.** `chat.join { cid, iid, proof, wraps: { [epoch]: { [label]: wrap } } }`. The server checks `sha256(proof) == invites[iid].ph` and that every label is new, then adds the wraps. A username on the chat's ban list (`chat.ban`) is refused with `banned`, both here (after the proof check, before any wrap is added) and at `chat.invite` (before the invite is looked up, so a link from before the block, which its key change revoked, says so too), so a banned person gets neither the key history nor a wrap from any link, old or new; the refusal is not counted as a wrong link. Both need an account that exists (`unauth` otherwise): a sign-up proof for an unused name costs nothing and would get round any block. Clients can't check this themselves: before joining they see only the preview (5.5), which has no `meta`. The joiner already decrypted the key history from the invite blob, derives `M_e`, opens the chat, and posts a sealed service note `{ k: "join" }` so that members see them; an admin's client adds them to sealed `meta` when it next writes it. For public channels there is no join at all: the client derives `M_e` from `openKeys`.

**Leave.** The leaver posts a sealed service note `{ k: "leave" }` and forgets the chat locally. When an admin's client sees it, it rotates the epoch without the leaver and re-seals `meta`, marking the rotation `why: "leave"`; a "leave" note followed by a later "join" note from the same person is not acted on. Until then the leaver still technically holds a working key; this is the same as every end-to-end encrypted group messenger. A chat has 32 epochs (0 to 31) for its whole life, and a member can make admins' clients rotate with no admin acting (leave, get back in by link or by another member's wrap, leave again), so the server refuses a leave rotation past epoch 23 (`leaveRotateMaxEpoch`, code `conflict`): epochs 24 to 31 stay for removals an admin chooses, which nothing a member does can use up. Once leave rotations are refused, the admin's client drops the leaver from `meta` with an update and no new key, and does not try again; the leaver keeps the current key until the next removal rotates it away. `why` is only for groups and channels; any other value is `invalid`.

**Remove or ban.** The admin rotates: new chat key, wraps for the remaining members' devices, new `M_{e+1}`, `meta` re-sealed with the member removed and optionally added to `banned`. The removed member's connections are evicted at once and their old key no longer opens anything. A ban is also kept by the server, since another admin's client could otherwise write the person back into `meta` and wrap a later key for them: before rotating, the admin's client sends `chat.ban { cid, h, on: true }` (admin level; groups and channels, not DMs), and the server keeps a tag of the chat and the username keyed under its own secret (`HMAC(addr.key, "ban:" + cid + "|" + h)`, 8.3), at most 1000 per chat (`bansPerChat`) from admins and as many again from the owner (the tags can't be listed, so junk a rogue admin added can't be found, and must not stop the owner). From then on `chat.open` refuses that username's member key with `denied`, even when a key was wrapped for them again (the member key itself is shared, so another account holding a leaked current key still opens the chat, 5.4) (the right key, so it is not counted against the wrong-key allowance, 9.4), and their connections that hold the chat at member level lose it at once; `chat.join` and `chat.invite` refuse them too (Join by link). Owner and admin keys are never refused by a ban: a blocked admin keeps the admin key until the owner replaces it, but may not lift any block while blocked (only the owner may then), and the owner's client replaces the admin key before blocking an admin. A client whose key change fails after blocking lifts the block again, so the server and `meta` agree; one that lost the race to another admin's rotation does the removal once more from the fresh record. At epoch 31, with no key change left, a block goes into `meta` without a new key, and the server's block is then what keeps the person out. A public channel has no blocks: `chat.ban` refuses to make one, and the change to public deletes the chat's blocks. A group made before the server kept blocks has them handed over, once per load until it has an `ometa`, by any admin's or the owner's client (before that `ometa` is written). Unblocking (`on: false`), from the blocked list or by adding the person back as a member, lets the member key in again; deleting the chat deletes its bans. Clients also refuse to re-add: an admin's client never wraps a new key for anyone on `banned`, and writes a "join" note's author into `meta` only when they are not on `banned` the note was sealed under the chat's current epoch (an older one may predate the removal), and no later "leave" note from them follows it (a copy of an old note keeps its sealed time, so it sorts back into place). A join note that came just before a rotation no admin's client had acted on is therefore not written in; "Add members" brings that person in. The page blocks only in private groups and channels; public channels are moderated by deleting posts.

**Appoint or demote an admin.** Owner writes `chat.admins { cid, akeys, cap }` with wraps of a fresh admin secret for the current admins' devices and the new admin hash, then re-seals the admin list in `ometa` (5.3) and drops `{ t: "admin", cid }` to a newly appointed admin so their client knows to scan `akeys`.

**Ownership transfer** is not supported in this version. `chat.owner` (5.1, release 21) only lets the owner replace their own key after their account keys changed; the owner stays the same person.

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

**Retention.** A mailbox holds at most 500 notes; past that the oldest give way, other people's notes before the owner's own, and the owner's watch is told, so nobody who was away for a week is locked out of new invitations. Notes from other people older than 30 days are swept hourly. A note the owner wrote to themselves (`own: 1`; only they can write in their mailbox, everyone else goes through `POST /drop`) is never swept: those notes are their chat list (release 17). The page replaces a note someone else left with its own once the chat shows, and of two notes for one chat keeps the newest.

What the server can see: that mailbox `bob` received a 1 KB note at hour H. It cannot see from whom, about which chat, or of what type. A live observer at the server can still see which network address made the POST.

---

## 7. Frame protocol

Text WebSocket frames, UTF-8 JSON, at most 1 MB each. Every client frame carries `i`, a client-chosen integer echoed in the reply.

### 7.1 Client to server

| op | fields | reply |
|---|---|---|
| `hello` | `v: 1` | `{ nonce, now, v, limits, badges }` (`badges` is the operator's list, 12.3) |
| `prove` | `h, sig, dev?, pub?` | `{ h, via, kv }`: `via` is `device`, `account` or `signup` (4.1); `kv` the key version the proof was checked against (4.2, release 21) |
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
| `chat.rotate` | `cid, epoch, keys, cap, meta?, openKeys?, why?` | `{ ok }`. `why: "leave"` marks a rotation for someone who left (groups and channels only): refused with `conflict` past epoch `leaveRotateMaxEpoch` (23), so the last epochs stay for removals (5.6). |
| `chat.admins` | `cid, akeys, cap` | `{ ok }` |
| `chat.base` | `cid, cap` | `{ recorded }`. Records a DM's base key (5.1) for a DM created before base keys were kept. Needs member level on the connection; only while none is recorded, never replacing one. |
| `chat.rebase` | `cid, cap` | `{ ok }`. Replaces a DM's base key (5.1) after an account key change. The connection must have opened the DM with its current member key, and the DM must be at epoch 1 or later; the other connections are evicted. Release 21. |
| `chat.owner` | `cid, cap` | `{ ok }`. Replaces a group's or channel's owner key (5.1). Owner level; not for DMs; the other connections are evicted. Release 21. |
| `chat.ban` | `cid, h, on` | `{ ok }`. Blocks (`on: true`) or unblocks (`on: false`) username `h` in a group or channel (5.6): its member key no longer opens the chat. Admin level; not for DMs, not to block in a public channel, and not from an admin who is blocked; either way twice is fine. At most `bansPerChat` (1000) per chat from admins, twice that from the owner, `toolarge` past that. Blocking evicts that person's connections that hold the chat at member level. |
| `signup.pow` | – | `{ salt, bits }`: the puzzle a new account solves before its profile may be created (9.4). The same puzzle comes back in the `pow` refusal of a `set` on `directory/<h>` sent without a solution; the page asks early and solves out of sight. The `set` carries the answer as `pow`. |
| `media.ticket` | `cid` | `{ t, exp, limits }`. A media ticket for HTTP requests about this chat (7.7). Needs a proven connection holding a level for `cid`. |
| `account.delete` | `vault?` | `{ ok }`, then every connection of the account, this one included, is closed with 4410. Deletes the account (4.7): `vault` is the account's vault id (`vault/<id>` without the prefix), which this op alone may delete. Only over a connection proven with the account key: `denied` for a device-key or sign-up proof, an account that doesn't exist or is already deleted, or keys changed since the proof; `unauth` before any proof; `invalid` for a malformed `vault`. |
| `report.send` | `cid, pid, reason` | `{ ok }`. Reports post `pid` of a public group or channel (8.7); `reason` is `spam`, `abuse`, `illegal` or `other`. Needs a connection proven for an existing account (`unauth` otherwise), not `chat.open`. `denied` for a DM or a private chat, judged from the server's own record; `notfound` for no such chat, or no such post, a service note or a deleted post; `invalid` for a bad id or reason; `ratelimit` past `reportsPerMin`. The same person reporting the same post again is a no-op answered `ok`. |
| `report.list` | `before?, limit?` | `{ reports: [{ id, ts, cid, pid, reason, name, post, key }] }`, newest first, `limit` (default 50, at most 200) older than `before` (ms). Only for a connection proven for an existing account listed in `HUSH_OWNERS` (8.7), whatever `HUSH_AUTHZ` says; `denied` for everyone else. |
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

Error codes: `unauth`, `denied`, `notfound`, `exists`, `invalid`, `toolarge`, `ratelimit`, `conflict`, `version`, `pow` (a drop, section 6, or a sign-up, 9.4, that must bring proof of work first; the reply carries the puzzle), `full` (media refused because the chat's allowance or the server's disk is used up, 7.7), `banned` (`chat.invite` or `chat.join` from someone on the chat's ban list, 5.6), `gone` (`prove` as, or a sign-up of, a username whose account was deleted, 4.7), and `internal` for an unexpected server failure. A frame that cannot be parsed at all gets an error reply without `i`; five such frames close the connection.

Close codes. Before it closes a connection the server pushes `bye` with the reason, then closes the socket: with code 1000, or with 4401 (release 21) when the connection's proof no longer stands: `keys changed` when the account's keys were replaced over another connection and this one was proven against the old ones, `username taken` when a sign-up proof's name was created over another connection (4.2). A page closed with 4401 can't get back in with the keys it holds: its next proof is refused, and it signs the account out on that device (12, item 9). With 4410 `account deleted` when the account was deleted (4.7): every connection of the account is closed so, the deleting one after its reply; any next proof is refused with `gone`.

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

`hello` within 10 seconds of connecting or the socket is closed. `ping` every 25 seconds from the client; a connection silent for 90 seconds is closed. On reconnect the client repeats `hello`, `prove`, `chat.open` for each chat it holds keys for, and every `sub`. Protocol version mismatch returns `version` and the app shows "please reload". A connection proven for an account whose key version rose on another connection is closed with 4401 `keys changed` (4.2, 7.2): its keys are stale, and a reconnect with them is refused.

### 7.6 Search

`search/<h>` holds `{ h, n, n2 }` exactly as today. Prefix queries on `h`, `n`, `n2` with `l <= 10`. The index is opt-in through `findable`, which is why it may be plaintext: a person is listed, and so found by display name or part of a username, only when their directory entry has `findable: true`, which they set in Settings > Privacy. A missing `findable` means not listed (release 24; before that the page treated it as listed). Typing someone's exact username always finds them, as starting a chat needs: `directory/<h>` is readable by exact path either way, so hiding it in the page would only pretend. At startup the server deletes every `search` entry whose owner's directory entry lacks `findable: true`, so accounts from before release 24 are unlisted until they turn search on.

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

Clients already address five things by secrets they derive themselves: `accounts/<loc>`, `logins/<tag>`, `phones/<hash>`, `vault/<id>`, and `backup/<id>` (the backup moves from `backup/<handle>` to a blind address derived like the vault's, with label `hush-backup-id:`). Message backup, the chat-key store kept in that box so a fresh login brings past messages back, is on by default for accounts created from stage 7 on; accounts from before keep whatever they chose, and the switch stays in Settings, Advanced. From release 19 a save never replaces the backup: the device reads it, takes the keys it lacks, adds its own, and writes naming the version it merged (9.3); every app open with Message backup on does the same, so a device that is already signed in picks up keys another device backed up. Turning it off asks first and says that it deletes the backup from the server. Before a device creates a backup from nothing it reads the setting fresh from the vault, so a device left open while another turned it off doesn't put one back; the switch saves the setting before it deletes. A backup this account's keys can't open is left alone, and the person is told once (nothing offers to delete it: a device with out-of-date keys could wipe a backup the other devices still open). A device that can't open some older messages is told so once, with what brings them back. Today those addresses are plain SHA-256 outputs, which a thief with the database can brute-force for phone numbers and weak logins.

The server therefore stores and looks up `HMAC-SHA-256(addr.key, address)` instead of the address, with `addr.key` a 32-byte secret kept at `/etc/hush/addr.key`, readable only by the service user, excluded from database backups and backed up separately. Stealing the database alone yields nothing reversible; stealing both reduces to today's situation.

### 8.4 In memory only, never on disk

Presence (last-seen per handle, expires after 24 hours), typing rows (expire after 15 seconds), connection sessions, chat levels, subscriptions, rate-limit buckets, the hourly address salt.

### 8.5 SQLite settings

WAL journal, `synchronous = NORMAL`, `secure_delete = ON` so deleted rows are zeroed, `foreign_keys = ON`, busy timeout 5 s, one writer (the single Node process), weekly `VACUUM` at a quiet hour, nightly backup through the online backup API.

### 8.6 Background jobs

| Job | Interval | Action |
|---|---|---|
| expiry sweep | 1 min | delete posts with `0 < exp < now`, and media whose `media_ids.exp` has passed (7.7); forget expired media tickets |
| mailbox sweep | 1 h | delete notes from other people older than 30 days, never the owner's own; a mailbox over 500 notes loses its oldest when a note is added, other people's first; delete reports past their 90 days (8.7) |
| link-request sweep | 1 min | delete `linkreqs/*` not written for 10 minutes, aged by the server's own clock (release 24) |
| presence and typing | continuous | in-memory TTL |
| backup | nightly | `.backup` to a temp file, encrypt with `age` to an offline public key, copy off the box (a Hetzner Storage Box or any other location the owner picks), delete temp, keep 7 |
| vacuum | weekly | reclaim and zero freed pages |
| disk watch | 1 min, on upload | refuse new media (507 `full`) when the data disk has under 10 % **and** under 5 GB free, so a large disk with room to spare keeps working; alerting the owner is the health watch's job (11.5) |

### 8.7 Reports

Anyone signed in may report a post in a public group or channel (`report.send`, 7.1) as spam, abuse, illegal or other. Whether a chat is public is decided from the server's own record (its frozen `type` is not `dm` and its `visibility` is `public`), never from the request, so a DM or a private chat can never be reported, even one a crafted client created with `visibility: public`. The table is the server's own, like `bans`; no document path reaches it:

```
reports   (id TEXT PRIMARY KEY, ts, exp, cid, pid, reason, name, post, key, tag TEXT UNIQUE)
```

A row holds the time, an expiry 90 days later, the chat and post ids, the reason, the chat's public name at that moment, the server's own copy of the stored post (nothing the reporter sent), and the published key of that post's epoch (`openKeys[e]`), so the report can still be read if the channel later turns private or is deleted. It never holds the reporter: only `tag = HMAC(addr.key, "report:" + handle | cid | pid)`, unique, so the same person reporting the same post again changes nothing. Reports are read with `report.list` by the usernames in `HUSH_OWNERS` and nobody else, and the tag is never sent. The hourly sweep deletes rows past `exp`, and `report.list` never returns one.

What this reveals: the server keeps, for 90 days, a copy of a post it could already read (a public group or channel publishes its keys in `openKeys`), with the reason, even after the post is deleted or a disappearing message expires. A copy of the database without `addr.key` can't tell who reported. A live operator, who holds `addr.key`, can test whether a guessed username reported a given post, exactly as with block tags (5.6, 10.4 A2), and sees the proven handle of the connection sending each report while it is running.

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

- `directory`: must contain `handle == <h>`, `ecdh{x,y}`, `sig{x,y}`; optional `name, disp, bio, photo, devs, findable, requests, kv, ts`. `prev`, the key history (4.2), is the server's: at most eight `{ sig{x,y}, until }`, appended by the server when `kv` rises; a client write that would change it (a new entry that brings one, an `update` naming it, a `set` with a different one) is refused with `denied`, and a `set` without it keeps the stored one.
- `channels/<cid>`: fields from 5.3 only; no-names denylist; `type` and `visibility` enumerated; `epoch` integer; `keys` and `akeys` values must be wrap objects or `{ v:2, d:{…} }`; whenever `meta` is written (create, update, `chat.rotate`) its `e` must equal the record's epoch after the write; whenever `ometa` is written its `e` must be at most that epoch; the `ct` of `meta` and `ometa` is at most 256 KB and an invite's at most 8 KB, and an update may not take `invites` past 50 links (`toolarge`), and an update that grows `keys`, `meta` or `invites` stops 300 KB short of the record's limit, so nobody pads the record until the owner can't write `ometa` (a removal's rotation clears invites and replaces `meta`).
- posts: exactly the shapes in 5.7; `e <= epoch`. A new post's `ts` lies within 30 days back and 400 days ahead of the server's clock; an update keeps `ts` unless the stored one is in the future or less than a minute old (a scheduled message sent early), and then only to a time within that same window (release 21: a back-dated edit would otherwise make an old-key signature check out past the key history's window, 4.2).
- acts: id pattern and key set `{ post, kind, e, iv, ct, ts }`, all required except `e`. From release 18 the author’s signature travels sealed inside `ct` with what it signs, so nothing stored ties a reaction or a poll vote to an account key; a plain `sg` is refused.
- reads and typing: id `^[0-9]+~[A-Za-z0-9_-]{22}$`, body exactly `{ ts, iv, ct }`: the signature over the chat, the tag and the time is sealed under the chat key (release 18), so only people in the chat can check it; a plain `sg` is refused.
- media piece: over HTTP, a body of at least 28 bytes (iv and tag) and at most `pieceBytes + 28`; stored as `{ i, iv, d }`. Nothing else, ever: no content type, size hint, file name, duration or kind. Whether a media id is a photo, a document or a voice message is known only to the sealed post that references it. The only per-media facts the server keeps are in `media_ids` (8.2): total size and an optional expiry.
- `accounts`, `vault`, `backup`: exactly `{ iv, ct }` or `{ iv, ct, ts }`.
- `backup` writes (release 19): a `set` names the version it was merged from, `was` in the request: the stored `ts`, or 0 when there is none. Anything else is refused with `conflict` (the page reads, merges and tries again, up to six times) and a missing or non-number `was` with `invalid`; an `update` is never accepted. `was` is checked and never stored, and it is a time the server already holds. The page writes `ts` as the later of now and the stored `ts` plus one, so versions only go up.
- `inbox/<h>/c` (section 6): a note is `{ epk, iv, ct, ts }` with `ct` of the one fixed size, plus `own: 1` on a note the owner writes to themselves, which only they can do over the socket. From release 21 such an own note is not charged to the connection's note bucket (9.4): the mailbox holds at most `inboxMax` notes anyway, and the page re-writes its whole chat list after a key change.
- `logins`: exactly `{ ts }`.
- `phones`: exactly `{ handle }`.
- `linkreqs`: from release 16, link offers (14.14): `offer` (opened by a signed-in account, naming itself in `h`, at `offerTag(n)` only), then `wait` (claimed once by the device that scanned the code), then `ok` (answered only by the account that opened it); the account takes it down, or the new device clears it once answered. The records below, at a login’s tag, are what the pages wrote before release 16: still readable, but from release 16 nobody writes, answers or removes one (the emailed codes that opened them are gone, and a box found at the gate proves nothing, since anyone may store one). States `wait`, `ok`, `no` carry the fields the client writes today, in offers and old records alike.
- `presence`: `{ ts }` or `{ hidden: true }`; hidden deletes the in-memory entry.
- `search`: `{ h, n, n2 }`, `h == <h>`, strings ≤ 60 lowercase.

### 9.4 Rate limits

Buckets live in memory. "address bucket" means a token bucket keyed by `HMAC(hourlySalt, remoteAddress)`; the salt is random, rotates every hour, and is never written anywhere, so the key cannot be reversed later. The address is read from Caddy's forwarded header, used for the HMAC, and discarded.

| What | Key | Limit (initial, tunable) |
|---|---|---|
| `hello`, `prove` | address | 30 / min; 10 failed proofs per 10 min then 10-minute block |
| `accounts`, `logins`, `phones`, `recovery` reads | address and per path | 20 / min per address, 60 / h per path (`blindReadsPerMinPerAddr`, `blindReadsPerHourPerPath`); `get` and every path of an `mget` alike, proven or not |
| `linkreqs` reads | address and per path, counted apart from the row above | 120 / min per address, 2000 / h per path (`linkReadsPerMinPerAddr`, `linkReadsPerHourPerPath`). A new device polls its request every 3 s for up to 5 minutes and each device that may let it in polls every 3.5 s, and several of them share one network address, so the strict count above starved them. A request holds only the asking device's public key, its name and the sealed handoff |
| `login.gate` asks that find no box | login tag, whoever asks (also counted as a blind lookup of the address) | 10 / h per login (`pwMissesPerLogin`); while a login is out of tries every answer waits, the right password included (4.5) |
| `directory` create (a sign-up) | proof of work on the connection, with an address count as a backstop | the create must bring a nonce with `sha256("hush-signup-v1\|<salt>\|<nonce>")` starting with `signupPowBits` (16) zero bits, the salt being the connection's own and good for one account; the page fetches the puzzle when the sign-up screen opens and solves it while the person types, so no step is visible and nothing is added to the tap. Behind it, 100 a day per address under a second salt that turns daily (`signupsPerDayPerAddr`), since the hourly tag would reset the count |
| `POST /drop` | address, recipient | 30 / h per address, charged on every attempt; 100 / h per recipient; proof of work once a recipient's hour is half used, or always for a recipient with `requests: true` (section 6) |
| own mailbox notes over the socket (`set` on `inbox/<h>/c`) | connection | 100 / h (`dropsPerHour`); from release 21 a note marked `own: 1` is not counted, since the mailbox itself holds at most 500 (`inboxMax`) and the page re-writes its whole chat list after a key change (9.3) |
| `chat.create` | connection | 200 / day (`chatCreatesPerDay`) |
| `report.send` | connection | 5 / min (`reportsPerMin`), every call counted (8.7) |
| `chat.invite` | address | 20 / min (`invitesPerMinPerAddr`), as 5.5 asks |
| `chat.open` failures | address | 20 / min; a wrong key from a connection that already holds the chat is not counted (it is not guessing: a client may try an owner key it may hold, 5.6), nor is a blocked username's right member key |
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
| directory entries | public profiles and public keys, by design; for a deleted account (4.7), only its username, public keys, key history and the time it was deleted |
| opt-in search and phone entries | that a person chose to be findable; phone entries are keyed-hashed at rest |
| chat records | random ids, type, public or private, epoch, how many wraps exist (roughly members times devices), hashes of room keys, sealed metadata, activity time of the last message |
| chat bans | per group or channel, how many usernames its admins blocked, as tags keyed under `addr.key` (5.6, 8.3): who they are can't be read from the database alone |
| reports | for 90 days, a copy of each reported public-channel post, that epoch's published key, the channel's name and the reason; the reporter only as a tag keyed under `addr.key` (8.7) |
| posts, acts, reads | per chat: times, sizes, pseudonymous tags, ciphertext |
| media pieces | per chat: how many media ids, their sizes and piece counts, when they were uploaded, and for media of a disappearing message, when it expires; never what kind of file, its name or its key |
| mailbox notes | recipient handle, hour of receipt, an opaque 1 KB blob, and whether the owner wrote it to themselves; someone else's note until the owner deletes it or 30 days pass, the owner's own until they delete it |
| account, vault, backup boxes | ciphertext at keyed-hashed addresses |
| link requests | for up to 10 minutes, a sealed device-handoff blob at a keyed-hashed address |

### 10.3 What the server never stores

IP addresses; which handle is in which chat (blocks are kept only as tags keyed under `addr.key`, 5.6: a copy of the database without that key can't tell who is blocked); who reported a post (only a tag keyed the same way, 8.7); who sent any post; who talks to whom; which handles share a device or connection; message content, names of private groups, member lists, contact lists; receipt timestamps other than the mailbox hour; access logs of any kind.

### 10.4 Adversaries and outcomes

**A1. Someone steals the database or a backup.** Gets everything in 10.2 and nothing in 10.3. Cannot reverse phone or login addresses without `addr.key`. Cannot open any box or message.

**A2. A curious operator watching the live process.** Additionally sees, per connection, the proven handle, which chats it opened, and the network address. Can therefore reconstruct membership over time by watching, and sees the username in each `chat.ban`; with `addr.key` it can also test usernames against a chat's block tags, and against report tags to learn whether a guessed person reported a given post (8.7). Nothing durable records membership, and the design keeps sender identity off the mailbox path, but this adversary is only partly defended against. Full defence requires network anonymity, out of scope.

**A3. A malicious server.** Can refuse service, delete or reorder data, serve stale chat records, and withhold key rotations. Cannot read content, forge posts (inner signatures), inject members without a wrap that the invitee's device can open (it has no device private keys), or impersonate a handle (no account private keys). Two replays that would have let it re-admit a removed member through an honest admin's client are refused by the client (5.3): a copy of an older epoch's wrap presented as the new epoch's, and sealed metadata from before the removal. It can serve altered JavaScript; see 10.6.

**A4. Network attacker.** TLS 1.2+ with HSTS. The WebSocket upgrade, and CORS on `/drop` and `/media`, admit only a listed origin (`HUSH_ORIGINS`) or a page served from the host the request came to; a request with no `Origin` is refused unless the check is turned off for tests. The service takes a client address from `X-Forwarded-For` only when told it sits behind Caddy (`HUSH_TRUST_PROXY=1`); otherwise it uses the socket's own, so nobody reaching Node directly can forge their way out of the address limits.

**A5. A member with a tampered client.** Holds valid room keys for their chats. Can spam them within rate limits, overwrite tagged side rows, add wrap entries for outsiders (visible to other clients as unexplained wraps), and ignore client-side rules such as the one-message request limit. Cannot act in chats they are not in, forge another member's posts, or change settings that need an admin key.

**A6. An outsider.** Can enumerate handles through the directory at 600 per minute per connection (9.4), test whether a login exists at 20 per minute, probe account boxes at the same rate, drop mail into any mailbox within limits, and create accounts at the cost of one puzzle each, 100 a day per address. Can also reserve a login or a phone entry that is not theirs, since neither is verified yet (open item 14.10, stage 8). Account boxes already require guessing login and password through 600 000 PBKDF2 iterations client-side per attempt. Recipient-side filtering (contacts only, block) handles unwanted drops.

**A7. A lost or stolen device.** Every device of an account holds the account's private keys, so taking its entry off the profile alone would change nothing; removing it (release 21; 14, item 15) replaces the account's keys. What the device loses at once: the server, which refuses its proofs and closes its connections (4.2); every DM, which gets a new epoch and a new base key (5.1); every group and channel the remover owns, which gets a new owner key and a fresh admin secret and, when private, a new epoch; every private group it administers, which gets a new epoch; the vault, the message backup and the password boxes, which move to new addresses under new keys and a new password; and the recovery words, whose boxes are deleted. What it keeps: the old keys and everything they opened while it had them, so its copy of the old vault and backup and the messages it had read; the keys of groups where the remover is only a member, which it reads until an admin rotates them; and the admin secret of groups the remover administers but does not own, until the owner changes admins. For the 30 days in which the server still accepts a post dated before the change (5.7), a message so dated in a chat that was not re-keyed can't be told from one the removed device wrote afterwards, since it signs with the old key that `prev` still vouches for up to that time. Whoever replaces the keys first keeps the account: a thief who does it before the owner locks the owner out, because the old keys, and the recovery words that hold them, are refused from then on; the same holds chat by chat for a DM's base key and a group's owner key (5.1), which the page therefore replaces right after the account keys and reports as lost when someone got there first. Pre-change messages in chats that were not re-keyed stay editable and deletable by the old ownership secret, which the device holds (5.7); the owner keeps that secret too. So a lost device is removed as soon as it is missed, and the recovery words are kept safe.

### 10.5 Properties this design gives up relative to Firestore rules

Identity-based refereeing inside chats (one request message, bans on public joins, who may answer a request); exact `null` storage semantics; offline cache; managed uptime.

### 10.6 Trust in the delivered JavaScript

The service that stores ciphertext also serves the page that decrypts it. A compromised server could ship a backdoored page. Mitigations in order of cost: every file the page loads (its own `app/*.js` and `app/styles.css`, and the vendor script) carries an `integrity` attribute in `index.html` with the SHA-256 of its bytes, kept current by `npm run csp` and checked by the tests, so the browser refuses a changed file and publishing the SHA-256 of each released `index.html` still pins the whole app (the same tool writes a version made from the hash into each file's address, and Caddy marks `index.html` for revalidation on every visit and the versioned files as immutable, so a returning visitor never pairs a new page with a cached old file, which the pins would refuse and leave blank); serve the static app from a different operator than the API (for example a static host) and point the Content-Security-Policy's `connect-src` at the API domain, so that the API operator cannot alter the app silently; eventually an installable build. The owner should pick one before public launch (open item 14.3). Publishing the hashes is the release transparency item of 16.4; keeping anyone from changing the code in the first place is the rest of that checklist.

---

## 11. Logging, privacy operations and the server itself

### 11.1 Logging policy

- Caddy: no `log` directive, so no access log, for every route including `/drop` and `/media/*`. Its own log goes to journald without the two loggers that print a request's details (`http.handlers.reverse_proxy`, `http.log.error`; from release 17), so no visitor address, path or browser is recorded there. Media responses are never cached (`Cache-Control: no-store` from the service) and not compressed (ciphertext does not compress).
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

### 11.5 Monitoring (built 2026-10-12)

Two dead-man's switches at Healthchecks.io, each a check with a random ping address kept root-only in `/etc/hush/monitor.env`; the pings carry that id and, on a failure, a short reason, never user data. The provider learns the check ids, the ping times, the server's address and those reasons.

- `hush-backup`, expected once a day (grace 3 hours): the nightly backup (8.6) pings it after a successful upload, or its `/fail` address with the reason. A failed or skipped night becomes an email to the owner.
- `hush-watch`, expected every 5 minutes (grace 5 minutes): a systemd timer runs `/usr/local/sbin/hush-watch.sh`, which checks that the service is active, `/healthz` answers `ok`, the journal has no error or warning lines in the last 5 minutes, and the data disk has over 10 % and over 2 GB free. All four pass: one ping. One fails: a `/fail` ping naming it, and a `hush-watch` journal line. The server dead or offline: the pings stop, and the owner is emailed about ten minutes later.

Whoever holds a ping address can only hide a failure by pinging "ok"; it reads nothing. The addresses are rotated from the Healthchecks.io dashboard if they ever leak.

## 12. Client adapter contract

The adapter replaces `connectFirebase` and returns an object with the same shape as today so that the rest of the page is untouched:

- `collection(path)` with `doc(id?)`, `add(d)`, `where`, `orderBy`, `limit`, `get`, `onSnapshot`, `onSnapshotMeta`.
- `doc(path)` with `id`, `get`, `set`, `update`, `delete`, `onSnapshot`, `collection`.
- Snapshot objects with `exists`, `id`, `data()`, `docs`, `size`, `metadata.hasPendingWrites`, `metadata.fromCache`.
- `uid` is removed; `flat` stays `true`; `now()` returns the server-offset time.

Adapter responsibilities beyond translation:

1. Open the socket at page load, `hello` immediately, `prove` once an account is active, reconnect with back-off, and open a fresh connection when the active account changes.
2. For any path under `channels/<cid>`, ensure the chat is open on the connection first. It asks the app for keys through a small interface the app provides: `member(cid, epoch)`, `admin(cid)`, `owner(cid)`. If the app has no chat key yet, the adapter performs the preview read and hands `keys` to the app so it can trial-decrypt its wrap. From release 21 the app may hand back a list of keys, tried in order until one opens: for a DM its epoch key, then the base key the current account keys give, then the one from before a key change (5.1); for a chat the account owns the owner key, the one from before a key change, then its admin and member keys, so a chat whose owner key is no longer the account's still opens to read; when every key is refused the adapter forgets the chat's level, and an operation that needs a level fails with `denied` (or `ratelimit` while the server is busy) before anything is sent.
3. Emulate `hasPendingWrites`: on a local `set` or `add` under a subscribed query, deliver a synthetic snapshot with the pending document, then deliver the server's push without the flag. `fromCache` is always `false` in this version.
4. Batch concurrent `get` calls on `directory/*` and `presence/*` into `mget`.
5. Keep ordering and `limit` for subscriptions client-side after `init`.
6. Translate `sub` with `ids` for the chat list watcher.
7. Send nested objects as-is for `update`; the Firestore dotted-path flattening is removed.
8. Media over HTTP (7.7): `putPiece`, `getPiece`, `deleteMedia`, `copyMedia`, `mediaLimits`. The adapter fetches and caches one media ticket per chat, renews it a minute before it runs out or after a 401, re-opens the chat once after a 403 (a rotation it has not heard of yet), and forgets every ticket on reconnect.
9. Key versions (release 21). The adapter keeps the `kv` of its `prove` reply (`kv`) and reports it to the page (`onKv`), which signs out when the server's version is above its own; a refused proof is reported too (`onDenied`), and the page re-reads its profile and signs out if its keys are stale. `rebaseChat(cid, cap)` and `setOwner(cid, cap)` open the chat and send `chat.rebase` and `chat.owner` (7.1).

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

**One sealed store.** Everything the page keeps under `hush:` lives in one map in memory and reaches disk only as one AES-256-GCM blob, `localStorage['hush:sealed']`: account and device private keys, the ownership secret, chat keys, invite secrets, logins, phone numbers, drafts, read marks, which chats were pointed to whom, the active account. Only the lock settings, the theme and the blob itself are stored plain. `sessionStorage` is not used. Several tabs of one browser share the blob: a tab that sees another tab's write takes the new map, and leaves an account that is no longer in it (logged out, or removed, in the other tab) without writing it back; a tab that can't open the blob any more, or finds it gone (the other tab replaced the device key when the last account left, or set a lock) reloads instead of writing; and at start a blob the device key doesn't open is set aside under `hush:sealed:old`, so a stale write never leaves a page that can't start (release 21; before it, a logout didn't stick while another tab stayed open). The blob's key is:

- the lock password's key (PBKDF2-SHA-256, 600 000 rounds, a random salt) while a password lock is on, so the keys are unreadable without the password even to someone holding the whole storage; or
- otherwise a device key the browser made once, non-extractable, kept in IndexedDB. JavaScript can use it but never read it, and a copy of `localStorage` alone opens nothing. Where IndexedDB is unavailable the key sits next to the blob and the password lock is the real protection.

Turning the password lock on re-keys the blob under the password; turning it off re-keys it under the device key. Nothing is ever written out plain again. On first start after this change, the old plain entries are moved into the blob and removed; a blob that will not open (the browser lost the device key) is set aside, not deleted. Other tabs of the same page pick up each other's blob through the `storage` event.

**The lock.** With a PIN or a password set, the page shows the gate before anything is unsealed: no keys, no chat list, no messages exist in memory until it passes. Locking after time away is a reload, with a PIN just as with a password, so every unsealed byte (keys, decrypted messages and media, the screen itself) is gone the moment the lock falls. Five wrong tries back off; "forgot" clears the device.

**Logout.** Removes that account's entries from the store (keys, chat keys, login, drafts, marks, the invite secrets it made), takes the device off the profile, and drops everything unsealed from memory, including decrypted media and its object URLs. Logging out the last account also deletes the blob and the device key, and a fresh empty store is made. An account logged out elsewhere (its keys replaced on another device) is wiped the same way.

**No service worker.** The page registers none and must not gain one without rules: a future worker may precache `index.html`, `app/` and `vendor/` only, must never cache `/ws`, `/drop` or `/media/*` (which the server also marks `no-store`), and must never hold a decrypted byte. Decrypted media exists only as in-memory blobs with object URLs that are revoked on logout and die with the page.

Outside the page's control: the browser's own password manager, which is offered the Hush password only on the person's say-so, and the browser profile on disk, which is the operating system's to protect.

### 12.3 Badges and mentions (stage 8)

**Badges.** The operator decides who carries a badge, in `HUSH_BADGES` on the server, and nowhere else. The server sends the whole list in the `hello` reply (`badges: { "<handle>": "founder" | "verified" }`), and the page draws the badge after that person's name wherever a name is shown: the chat list, the chat header, the profile sheet, search results, member lists, and sender names in groups and channels. A profile document cannot carry a badge (9.3 refuses unknown fields) and the page never reads one from a profile, so nobody can give themselves one. The list is public by nature and names handles only.

**Report readers.** In the same way, `HUSH_OWNERS` on the server (comma-separated usernames, each `^[a-z0-9_]{3,20}$`, any other entry stops the server at start-up) names the operator's own accounts, the only ones `report.list` answers (8.7). Register those usernames before listing them: until one exists, anyone could sign up with it.

**Mentions.** `@handle` in a message is shown as a link wherever the page shows the text, in one-on-one chats, groups and channels alike. The link is made from the text alone: nothing is looked up because a mention is on screen. A tap looks the handle up (the same lookup the search box uses, by exact username, which finds anyone) and opens the one-on-one chat with that person under the usual message-request rules; a mention of oneself opens one's own Saved Messages; a blocked or unfindable handle shows a short notice.

**The picker.** Typing `@` and some letters in the message box offers a short list of people to insert. The list is drawn only from what the page already knows about the conversation: a group's members, a channel's owner and admins, the other person in a one-on-one chat. It never searches the server or looks anyone up, so it is instant and tells the server nothing about what is being typed. Matching prefers a username prefix, then a name prefix, then a word of the name, then anything containing the letters; at most six are shown. Arrow keys move, Enter or Tab inserts, Escape dismisses until the letters change.

---

### 12.4 Phone numbers (release 9)

Finding friends by phone number is off. A number was never confirmed, so anyone could save yours first and be matched to your friends, who have your number in their contacts, under the name they saved for you. Until numbers can be confirmed by text message, the server refuses to read or make `phones/` entries; an owner can still delete theirs, from Settings. The page no longer looks numbers up (contacts are not matched, and "Invite by phone number" only invites). Login reservations by phone number are a separate thing and still work as logins (14, item 10).

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
7. **Login existence check.** Keep the "no account with that email" pre-check, which is an enumeration oracle, or remove it from the sign-in flow. Default: keep, rate-limited. Release 20: with the username as the only login, the pre-check reveals nothing the public directory doesn't.
8. **Plain `type` on chat records.** Keep plaintext (default) or fold into sealed `meta` at the cost of touching every `typeOf` call site.
9. **Directory read rate.** Decided: 600 per minute per connection (9.4), since the page refreshes every contact's profile each minute.
10. **Unverified logins and phone entries.** Release 9: phone entries can no longer be read or made (12.4), so a taken number no longer points anyone at the taker; login reservations stay unconfirmed. Release 20: the username is the only login. Sign-up asks for a username, a display name and a password and nothing else; no email address or phone number is collected, reserved or accepted on the login screen. Accounts from before keep the boxes they had, but the page no longer offers them, and `logins/<tag>` gets no new rows. Also release 9: the new-device approval code (QR or typed) covers the new device's own key as well as its one-time key (`linkFp`), so a server, or anyone who can edit a waiting request, can no longer swap in a device key of its own for the approving device to sign; both devices show the start of that key (`devShort`, 8 symbols) to compare. Release 11 adds the reverse direction for a logged-in device with no usable camera: it checks for a camera first (`enumerateDevices`, no prompt) and asks for it only when the person taps to scan; without one it shows the code, with the same contents (a fresh 128-bit secret and `linkFp` of the request it shows the code for), and the new device scans or types it. The new device checks the fingerprint against its own keys and writes `cf` = HMAC-SHA-256(secret, `"hush-link-confirm-v3|" + tag + "|" + ts + "|" + fp`) into its request; the logged-in device approves and signs only after that proof checks out for the same request and fingerprint. The shown code works once, for 5 minutes from when it is shown, and dies with the request or the sheet; with several requests waiting the person picks one. Release 13: a new device's request lives 10 minutes. Its confirmation of the email (`linkOk`) is per connection, so after a reload or a reconnect the device continues the same request with `link.resume {t, sig}`: a signature over `"hush-link-resume-v1|" + nonce + "|" + t + "|" + ts` by the device key inside the request, accepted only while that request waits and is under 10 minutes old. The request's keys stay in the page's sealed store until it ends; no reusable token exists. The new device marks a shown code as used only after its proof is stored. Note: the link-request sweep in the table of section 11 is not implemented; requests are removed when answered, withdrawn or replaced, and `link.resume` checks age itself. Parked until stage 8. A login reservation and a phone entry are first come, first served, and a reservation is never deleted: anyone can take another person's email or number before they do, and a taken phone entry points searches by that number at the taker. Closing this needs a verification code by email or SMS at sign-up, which needs the domain and a way to send; both come with stage 8. Decided 2026-10-09: sign-up takes no code. It asks for an email or a phone number (one is required), a password, a username and a display name, in that order, and is done at once; the email or number is reserved for the account but not confirmed. Login is one field that takes any of the account's email, phone number or username, plus the password: each has its own password box at an address made from that login and the password, so the server cannot tell that the boxes belong to one account, and a password change replaces all of them. Confirming an email is for optional account recovery, set up in Settings → Advanced: the server emails a six-digit code (`code.send`, through Resend when `RESEND_API_KEY` is set, on screen otherwise) and checks it (`code.check`). Only a connection that has just confirmed the email may then write the account's recovery record, at `recovery/<SHA-256("hush-recover-v1:<username>|<email>")>`. The record names the username but not the email, and it is never readable, not even by its owner. "Forgot password?" works with that email, or with the email the account signed up with (the server answers `via: "email"` and the request goes to that email's own address, which the account's devices watch): a fresh code for it, checked for the username, is the only thing that lets a connection open a link request (`linkreqs/<login tag>` in state `wait`), after which a device that is still logged in scans the new device's QR code. An email alone never opens an account, since the server holds no keys. Still open: SMS, and the old phone and email reservations, which stay unverified. Retired in release 16 (item 14): the server no longer sends or checks codes, needs no mail key, and takes no new recovery records or requests at a login’s tag.
11. **Wrap salt without the epoch.** Decided and built: wraps made from stage 7 on name the epoch in the salt (5.3); wraps from before still open, under the client's replay rule.
12. **Secrets derived from the signing key.** Decided and built: accounts created from stage 7 on carry a private secret `own` for ownership tokens and owner keys (5.1, 5.7); accounts from before keep the old derivation, so nothing of theirs changes hands.
13. **Sign-up limit per address.** Decided and built: proof of work on every sign-up, solved by the page out of sight, with 100 a day per address as a backstop only (9.4).
14. **Three ways back in (release 16).** The device-linking and recovery roads are separate, and the password is never asked for on the way back in.
    - *Path one, a device where the account is logged in.* "Link a new device" shows a code at once: a fresh 128-bit secret that never goes through the server (the QR `hush-link:4:<secret>`, or 26 symbols plus 2 check symbols to type). The device opens a link offer at `linkreqs/<offerTag(n)>`, where `n` = HMAC(secret, "hush-link-offer-name-v1") and `offerTag(n)` = SHA-256("hush-link-offer-v1|" + n), a space no login's tag can share; the server accepts the offer only from a signed-in account naming itself (`h`), and only at the address its `n` makes. On the new device, Log in → Log in with my other device: it scans (or types, or photographs) the code, makes its keys, and claims the offer once with them and with its proof that it read the code (`cf` = linkConfirm, an HMAC under the secret over the offer's address, the claim's time and both keys). The device that showed the code checks the proof, then asks once: "Let <device name> in? Its screen shows key XXXX-XXXX-XXXX-XXXX", with Let it in and Not mine; the new device shows its own key (`devShort`: the first 80 bits of its fingerprint as 16 symbols; before release 24, 40 bits as 8) while it waits, for up to the code's 5 minutes. Only Let it in approves, from that device's own session: the account bundle sealed to the new device's one-time key and the secret, its device key vouched for. Not mine answers `no` and takes the offer down, and the new device says it wasn't let in. Closing the sheet takes the offer down too, and so does no answer before the new device stops waiting. Either way nothing is shared. Nothing else is asked, no password, no recovery words, no emailed code, and no new password afterwards: nothing was forgotten. Only the account that opened an offer can answer it or take it down; the new device clears it once answered. The code works once, for 5 minutes, while the showing device's sheet is open. Whoever scans it first is let in, so the screen says to let only a device you hold scan it; a server that swaps the claimed keys is refused, since the proof no longer matches.
    - *Path two, the password.* Unchanged: logging in with it lets the device in, with no recovery and no reset. It also puts that login's right box address back in the settings, quietly.
    - *Path three, no logged-in device.* Forgot password? offers the other device (path one) or the recovery words, which from release 24 go with the username (4.5). Back with the words, a new password is set next, and only then; the old one is never asked for, there or later (Settings, or securing the account for an owner or admin role), until a new one is set.
    - *A device added, by any way in.* Every signed-in device shows a notice once: "<name> was added to your account. Its key is XXXX-XXXX-XXXX-XXXX." The name travels in the device's profile entry sealed under the account's own key (`nm`, AES-GCM with additional data `hush-devname-v1|<username>|<device id>`), so only the account's devices can read it. Only entries whose signatures check out are announced, and what a device finds on its first look counts as known; the device that approved one says so in its own message instead.
    - The emailed-code road of 14.10 is retired: "Forgot password?" sends no code, the recovery email setting is gone, and so is the request watcher with its "Log in on a new device?" alert. The server has no `code.send`, `code.check` or `link.resume` any more and needs no mail key, in production or anywhere. Requests at a login's tag are closed: with the codes gone their last key was a box found at the gate, which proves nothing, since anyone may store a box. Recovery-email records take no new writes; their own account may still remove one.
    - A password changed in Settings, which asks for the current one, removes that password's boxes for every login, worked out from the password itself, whatever the settings say. After a recovery with the words the old password isn't known, so its boxes go only where the settings knew their addresses: on an account whose settings were left out of date (release 13), the old password can keep working until it is changed from a device that knows it. Closing that without the server linking a login to a username needs the account's keys replaced at recovery: item 15, a must-do before public launch.
15. **Replace the account's keys to lock out a lost device. Built in release 21 (local build; deploy pending).** Decided 2026-10-11 as a must before public launch, for a recovery with the words; built for device removal first, because every device holds the account's private keys and taking a device's entry off the profile alone locks nothing. Removing a device (Settings → Login and devices → Your devices → Remove) therefore gives the account new keys: a new encryption pair, a new signing pair and a new ownership secret `own`, published under the next key version (`kv` + 1) in one write that also drops every other device entry. The server takes that write only over an account-key proof, appends the old signing key to the entry's `prev` (4.2), closes the account's other connections with 4401 and refuses the old keys from then on. The removing device then re-keys the chats first (every second until then is one in which the lost device's holder could replace a chat's keys himself, 5.1): every private group or channel it owns gets a new epoch, every owned one a new owner key (`chat.owner`) and a fresh admin secret, every private group it administers a new epoch, and every DM a new epoch and a new base key (`chat.rebase`), so the old shared secret opens nothing; a DM whose other person's new security code is not yet accepted here is left for the acceptance (a base key from their old one would lock them out). Then it moves what the old keys guarded: the vault to the address and key the new keys give (the old one stays: vaults are never deleted, and it holds only what the lost device had already), the chat-list notes re-sealed to the new key, the message backup to its new address (merged with the old one first, the old one then deleted), the password boxes replaced under a new password it asks for (the lost device may know the old one, so the old one is refused), and the old recovery boxes deleted, so new words must be made. The old keys stay on that device, their private parts for 30 days, so old notes, the old vault and old messages still open and verify; other devices verify old messages through `prev`. The other devices are logged out and link again by code (item 14, path one). The flow is a stage machine kept in the sealed store and resumed at the next load, so a reload or a lost connection mid-way never loses the account; only a definite refusal of the key write rolls back to the old keys, and a device that finds the keys replaced from elsewhere meanwhile signs out.
    Limits, named in the summary the person sees: a group where the account is only a member keeps its key until an admin rotates it, and the removed device reads it until then; a group it administers but does not own keeps its admin secret in the removed device's hands until the owner changes admins; a chat at epoch 31 can't be rotated; a chat whose keys someone replaced first (the removed device, most likely) is lost and named, to be started afresh; for 30 days a message dated before the change in a chat that was not re-keyed can't be told from one the removed device wrote, and pre-change messages there stay editable by it (10.4, A7); every contact sees "security code changed", and their devices wrap nothing to the account until they accept the new code (their one-on-one chat with it is re-keyed on acceptance); invite links of the re-keyed chats stop working. Whoever replaces the keys first keeps the account, so a lost device is removed as soon as it is missed and the recovery words are kept safe. Already in place before: the page refuses a login whose keys are older than the profile's key version, and signs out a device whose keys are older. Still open: running the same replacement at the end of a recovery with the words, which this item first asked for.

---

## 15. Summary of guarantees for the owner's privacy statement

The Hush server stores encrypted messages it cannot read, public profiles, and the minimum needed to deliver data to the right people. It does not store IP addresses, access logs, chat membership, who sent which message, or who talks to whom. Group names and member lists are encrypted with the group's own key. People find their chats through an encrypted list only their own devices can open. Invitations arrive in a sealed mailbox that records only the recipient and the hour. When an admin blocks someone from a group or channel, the server sees that username in the request and keeps only a tag of it made with the server's own secret key, so a copy of the database shows how many people a chat has blocked, not who (someone who also holds that key could test usernames against it). A copy of the database reveals who has an account and how busy each chat is, and nothing else.

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
| 9 | Operations: backups, monitoring, and whatever of section 11 is still open | Backups (8.6) and monitoring (11.5) built and live 2026-10-12; the rest of section 11 as marked. Release 21, device removal by key replacement (14, item 15): built locally 2026-10-12, deploy pending |
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
