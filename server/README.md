# Hush server

The Node.js service behind the Hush web app. This folder holds stages 1 to 7
of the plan in `../SPEC.md`: the transport, the document store, live
subscriptions, write acknowledgements, no logging of addresses, the client
adapter the page uses, the identity plane (connections prove which username
they hold and can only change that username's records), the capability plane
(everything inside a chat is gated by room keys the server knows only as
hashes), the mailbox (a note telling someone about a chat is dropped through
an anonymous `POST /drop`, never over the sender's own connection), media over
HTTP (photos, videos, voice messages and any other file, each encrypted under
its own key and sent as raw pieces), and stage 7: the page split into files
that `index.html` pins by hash, a security review with its fixes and the rate
limits it added, and the sealed on-device store. What remains before the spec
is complete is the hardening and operations work of stages 8 and 9.

## Media limits

Every media limit is in one block at the top of `src/limits.js`
(`MEDIA_LIMITS`), and the page reads them from `GET /media/limits`, so raising
one for a bigger server is one edit there and a server restart (no page change).
They can also be overridden without editing code, for example
`HUSH_LIMITS='{"media":{"videoBytes":2e9,"chatBytes":20e9}}'`.

| Limit | Default |
|---|---|
| photo (`imageBytes`) | 25 MB (anything over 4096 px is scaled down) |
| GIF (`gifBytes`) | 15 MB |
| video (`videoBytes`) | 500 MB, sent at original quality, never re-encoded |
| video downloaded without a tap (`videoAutoBytes`) | 50 MB; larger videos download when tapped |
| any other file (`fileBytes`) | 500 MB |
| voice message (`voiceSeconds`, `voiceBytes`) | 15 minutes, 15 MB |
| attachments per message (`filesPerMessage`) | 10 |
| all media in one chat (`chatBytes`) | 2 GB |
| piece size (`pieceBytes`) | 1 MiB |
| uploads refused when the disk has under (`minFreeDisk`, `minFreeBytes`) | 10 % and 5 GB free |

## Trying the app locally

Requirements: Node 22.13 or newer from nodejs.org (the server uses Node's
built-in SQLite, so there is nothing to compile and no other software to
install). The only dependency, `ws`, comes with `npm install`. In the project
folder (the one with `index.html`):

```
cd server
npm install
npm run dev
```

On Windows, if PowerShell refuses to run `npm` ("running scripts is disabled"),
use `npm.cmd` in place of `npm` throughout; nothing else differs.

`npm run dev` starts the server with the two settings local testing needs: the
standard policy and the app files served from the project folder. It prints:

```
Hush server listening on http://127.0.0.1:8080  (WebSocket at /ws, health at /healthz)
Authorization: standard (proven usernames, room keys for chats)
Data folder: ...\server\data
Allowed origins: http://127.0.0.1:8080, http://localhost:8080, and pages served from this host
Client addresses: the socket's own (set HUSH_TRUST_PROXY=1 behind Caddy)
Serving the app from: ...\hush-live
Open the app at: http://127.0.0.1:8080/
```

Open `http://127.0.0.1:8080/` in a browser. The page connects to
`ws://127.0.0.1:8080/ws` (the address in `HUSH_CONFIG` in `app/config.js`).
To talk to yourself, open the same address in a second browser
or a private window and create a second account. Data lands in `server/data/`;
delete that folder to start from scratch. Stop the server with Ctrl+C.

### From a phone on the same Wi-Fi

```
npm run dev:lan
```

This is `npm run dev` plus a second listener with HTTPS on port 8443 on every
network the PC is on; `http://127.0.0.1:8080` keeps working as before. It
prints the phone address, for example `https://192.168.1.10:8443/`. Phones
need HTTPS here: on plain `http://` to another machine a browser switches off
WebCrypto (so the app cannot work at all), the camera and the microphone. The
certificate is self-signed, made on first run in `server/devcert/` (never
committed; made again when the PC's address changes), so the phone warns once:

- Android (Chrome): Advanced, then Proceed.
- iPhone: open `https://<address>:8443/hush-dev.crt`, install the profile
  (Settings, Profile Downloaded), then turn it on under Settings, General,
  About, Certificate Trust Settings. Safari does not carry a one-off exception
  over to the live connection, so this step is needed. Remove the profile when
  you are done testing.

Windows only lets the phone in when the Wi-Fi is a Private network and Node is
allowed through the firewall on private networks (Windows asks the first time).
The page finds the server by itself: when it was opened from another device it
uses the address it came from, not `127.0.0.1`.

If the server is not running, the page shows a banner saying it cannot reach the
server and keeps trying on its own. Start the server and reload the page.

`npm start` runs the server without the development extras; it then needs
`HUSH_AUTHZ=standard` (or `open`) set by hand and serves no files (that is
Caddy's job in production).

A data folder from before stage 4 holds old record shapes and will not open.
Delete `server/data` once and sign up again.

If you delete `server/data` while a browser is still logged in, the page puts
that account's profile back on the next connection (it still holds the keys),
re-makes the login reservation for its phone or email, and asks for the
password once more so the password box exists again. Until that happens the
account can be reached only with its recovery words, which is also why
"Forgot password?" on the login screen always offers "Use my recovery words".

## Badges and @mentions

A badge is drawn after a person's name in the chat list, the chat header, the
profile sheet, search results, member lists, and sender names in groups and
channels. Who has one is decided by the server operator in `HUSH_BADGES` and
nowhere else: the server sends the list with its hello reply, and the page
never reads a badge from a profile. Two badges exist: `founder` and `verified`.
To try it locally, give the badge to a username and start the dev server with
it set:

```
$env:HUSH_BADGES='{"Alice":"founder"}'; npm.cmd run dev
```

`@username` in any message is a link. Nothing is looked up because a mention is
on screen; a tap looks the username up and opens your one-on-one chat with that
person under the usual message-request rules, a mention of yourself opens your
profile, and a blocked or unfindable username shows a short notice.

Typing `@` and some letters in the message box shows a short list of people to
insert, drawn only from the conversation itself: a group's members, a channel's
owner and admins, or the other person in a one-on-one chat. It never asks the
server anything. Arrow keys move, Enter or Tab inserts, Escape dismisses.

## What the server can and cannot see about a chat

Every chat is a record under a random id. The server stores:

- its type (one-on-one, group or channel), whether it is public, and its key epoch;
- the hashes of up to three room keys: member, admin, owner (one-on-one chats have a member key only, plus a base key derived from the two account keys so either side can always get back in);
- key wraps: one sealed copy of the chat key per member device, each under a random label, so the server sees roughly how many devices can read but not whose they are;
- a sealed blob holding the name, description, photo, owner, admins, member list and ban list; in a channel the name, description, photo, owner and admins also sit in a second sealed blob, the owner's part, and the server hands the first blob only to the owner's and admins' connections, so everyone else gets the channel without the member list and ban list;
- posts (sealed, no sender), reactions and read marks under per-chat pseudonyms;
- media pieces: opaque encrypted bytes, with per media id only its total size and, for a disappearing message, when it may be swept. Nothing says whether it is a photo, a video, a voice message or a document; that, the file name and the file's own key live inside the sealed message;
- for public channels only: name, description, photo, owner and admins in the clear.

It never stores who is in a chat, who sent a message, or who talks to whom. The
only record that connects a person to a chat is a note in their mailbox, and
that is a blob sealed to their account key, padded to one size: the server
sees that `bob` received a 1 KB note at some hour, not which chat it names or
who sent it. The note arrives through `POST /drop`, a request with no session,
so the sender's connection is not involved either; over the socket a person
may only write notes into their own mailbox. When the recipient has "only my
contacts" on, or their mailbox is busy, the sender's page first solves a small
proof-of-work puzzle (about a second). Notes from other people are kept for 30
days or until the owner deletes them; notes the owner wrote to themselves (their
chat list) are kept until they delete them. A mailbox over 500 notes loses its
oldest, other people's first.

What a live observer at the server can still see: which connection, proven as
which username, opened which chat ids, and when. From release 93 that includes
the usernames an owner's or admin's page asks `chat.slots` about for a channel
(the page does so from release 93b), which are only the authors of the cards
that would act, not every card the page read; they exist only while the
request runs. Nothing durable records any of it. From a channel it does not run,
a page takes only the owner and the admins: it loads their profiles and asks
their presence, never the other subscribers', so what it asks says nothing about
who else is in the channel (SPEC.md 5.3). That includes the profiles it loads
to check a read mark, reaction or vote: in such a channel it names only those of
the owner, the admins and itself (SPEC.md 5.7). A page from before this rule
still loads the profile of any subscriber whose read mark, reaction or vote it
checks, until it reloads, while the server still sends it the member list and
the read marks (SPEC.md 5.3 and 5.4).

## How the room keys work

- Opening a chat means sending the server a key; it hashes it and grants the matching level: owner, admin or member. The key never leaves the connection's memory on the server side and is not stored.
- The member key is derived from the chat key of the current epoch, so anyone who can read the chat can prove it. Removing someone means a new epoch with a new chat key wrapped only for the people who remain; the server replaces the member hash, everyone else's level is revoked at once, and the removed person's key no longer opens anything.
- The admin key comes from a separate secret wrapped only for admins; the owner key from a secret the account made at sign-up and keeps in its login and recovery boxes (accounts from before stage 7 derive it from their signing key), so it survives a lost phone.
- Joining by link: the link's secret unlocks the chat's key history, the server checks a hash of a proof derived from the secret, and the joiner files their own key wraps. The joiner then posts a sealed "joined" note; an admin's client writes them into the sealed member list.
- Leaving posts a sealed "left" note; an admin's client rotates the key when it sees it.
- Public channels publish their chat key, so anyone can derive the member key and read; posting still needs the admin key, and the read marks are for the owner and the admins only.
- Media over HTTP: a connection that has opened a chat asks for a ten-minute media ticket over the socket and sends it with each HTTP request. The server checks that connection's level for the chat on every request, so a rotation, a removal or a closed socket ends access at once; keys never travel over HTTP.

## How sign-in works now

When the page connects, the server sends a random challenge. The page signs it
with this device's own key if the device is listed on the profile, otherwise
with the account key, and sends the signature back. From then on that
connection acts for that username and nothing else. A brand-new username is
claimed the same way: the page signs with a freshly generated account key and
sends the public half along; the server then lets that connection create
exactly that profile, with that key in it. Switching accounts opens a new
connection. The server keeps none of this on disk; the old `owners`, `uids` and
`devices` records are gone and the server refuses them.

With the identity policy the server refuses, among other things:

- changing, deleting or creating a profile that is not the username you proved;
- changing your own account keys without the account key (a device key is not enough) or without raising `kv`;
- writing presence or search entries for anyone but yourself;
- pointing a phone-number entry at your account when it already belongs to another account;
- creating an account box or login reservation at an address that is taken, editing an account box, deleting a login reservation or a vault;
- any read of presence, any search, and anything under `channels/` from a connection that has not signed in;
- a replayed or expired challenge, a second proof on the same connection, and more than ten failed proofs from one place in ten minutes.

Profiles can be read without signing in, because the sign-up screen checks
username availability before an account exists.

## Running the tests

```
cd server
npm test
```

The suite starts real servers on random ports in temporary folders, so it needs
no setup, no network and leaves nothing behind; it takes about fifteen seconds.
Besides the server it runs the page's own code: it lifts the adapter out of
`../app/adapter.js` and runs it against a real server, lifts the recovery and
login code out of `../app/crypto.js` (between the `HUSH RECOVERY` and
`HUSH AUTH` markers) to run the log-out-and-back-in flow for real
(`test/login.test.js`), runs the media encryption, the storage block and the
replay rules the same way, and checks that every file the page loads is pinned
to its current bytes and that the page's files keep to the rules in
"The page's files" below.

## After editing the page

`index.html` pins every file it loads: each `<script src>` and the stylesheet
carries an `integrity` attribute with the SHA-256 of that file's bytes, and the
browser refuses a file that does not match. After any edit under `app/` (or to
`vendor/`):

```
cd server
npm run csp
```

This rewrites the stale pins in place, and writes a version made from each
file's hash into its address (`app/ui.js?v=...`), so a browser that still holds
last release's copy fetches the new file instead of pairing a new page with an
old file the pin would refuse. Caddy sends `no-cache` for `index.html` and
`immutable` for the versioned files (`scripts/Caddyfile.example`). `npm test`
fails while any pin or version is stale.
(Edits to `index.html` itself need nothing: it has no inline script left. If one
is ever added, the same command puts its hash in the Content-Security-Policy.)

## What is here

| File | Role |
|---|---|
| `src/index.js` | Entry point. Reads the environment, refuses to start without `HUSH_AUTHZ`, listens, shuts down cleanly. |
| `src/server.js` | HTTP server (health check, `POST /drop`, `POST /wake`, `/media/*`, optional app files for development), WebSocket endpoint at `/ws`, origin check, background timers. |
| `src/media.js` | Media over HTTP: tickets, piece upload and download, delete, copy for forwards, the disk guard. |
| `src/drops.js` | `POST /drop`: anonymous mailbox notes and proof of work. |
| `src/wake.js` | `POST /wake`: a wake ticket rings the iPhone that issued it, answered the same whatever the ticket's state. |
| `src/apns.js` | The Apple push sender for those wake-ups (HTTP/2, an ES256 provider token); a stub without a key. |
| `src/protocol.js` | One connection: hello handshake, frame parsing, rate limits, idle timeout, dispatch, acknowledgements. |
| `src/store.js` | Documents in SQLite (`hush.db`), media pieces and per-media sizes in SQLite (`media.db`), presence, typing and call records in memory. |
| `src/subs.js` | Live subscriptions: turns store changes into `set` / `del` pushes. |
| `src/schemas.js` | Shape rules per collection, size limits, the "no names on private chats" rule, sealed-post ownership tokens. |
| `src/paths.js` | The path grammar and id patterns shared with the client. |
| `src/merge.js` | Document validation and RFC 7396 merge patch for `update`. |
| `src/query.js` | Query grammar and matching, used both in SQL and for live matching. |
| `src/limits.js` | All limits, the media block first; token buckets and the salted address tag used for pre-authentication limits. |
| `src/authz.js` | The `standard` policy (SPEC.md 4 and 5) and `open` (tests only). |
| `src/log.js` | Lifecycle and error logging that cannot carry user data. |
| `scripts/dev.mjs` | `npm run dev`: the local app setup. |
| `scripts/csp-hash.mjs` | `npm run csp`: pins every file the page loads (integrity attributes in `index.html`). |
| `scripts/devcert.mjs` | The self-signed certificate for `npm run dev:lan`. |
| `scripts/Caddyfile.example`, `scripts/hush.service`, `scripts/hush-turn.service`, `scripts/turnserver.conf.example`, `scripts/hush-turn.nft`, `scripts/hush-turn-nft.service` | Deployment examples for the VPS. |
| `test/` | The test suite, including the adapter tests. |

### The page's files

The app lives one folder up. `index.html` holds the markup, the security policy
and the tags that load the rest; everything else is under `app/`:

| File | Holds |
|---|---|
| `app/styles.css` | every style of the page |
| `app/config.js` | `HUSH_CONFIG`, the server address you edit |
| `app/crypto.js` | keys and sealing: identities and device keys, the chat-key store and message backup, key wraps and room keys, message and metadata sealing, media encryption, recovery words and login boxes, the sign-in proof, inbox notes |
| `app/adapter.js` | the WebSocket adapter, the page's connection setup, and `POST /drop` |
| `app/ui.js` | the screens and everything that drives them, ending with the boot |

The scripts load in that order and share one global scope, exactly as the single
inline script did before stage 7, so nothing is imported or exported: a function
declared in `crypto.js` is simply called from `ui.js`. The rule that keeps this
sound: the files loaded before `ui.js` only declare things at top level; code
that ran at load time there could reach for a name `ui.js` has not declared yet.
The tests check that, the load order, and that no name is declared twice.

What the page keeps in the browser is one encrypted blob (`hush:sealed`), keyed
by the lock password when one is set and otherwise by a device key the browser
keeps non-extractable in IndexedDB; only the lock settings and the theme are
stored plain. Locking is a reload, so nothing unsealed survives it, and logging
out removes the account's entries (the last account removes the blob and the
device key). SPEC.md 12.2 has the details; `test/page-store.test.js` runs the
page's storage block to check them.

## Settings

All through environment variables. Defaults are safe for local use.

| Variable | Default | Meaning |
|---|---|---|
| `HUSH_AUTHZ` | (none) | `standard` (SPEC.md: proven usernames, room keys for chats) or `open` (no checks, tests only). The server exits otherwise. |
| `HUSH_STATIC` | (none) | Folder containing `index.html`. When set, the server serves `/`, `/index.html`, `/app/*.js`, `/app/*.css`, `/app/*.png` and `/vendor/*.js` from it and nothing else. Development only. |
| `HUSH_HOST` | `127.0.0.1` | Bind address. Keep it local; Caddy is the public face. |
| `HUSH_PORT` | `8080` | Bind port. |
| `HUSH_DATA_DIR` | `server/data` | Where the databases live. |
| `HUSH_ADDR_KEY` | `<data dir>/addr.key` | Secret for keyed blind addresses. Created on first start. Back it up separately from the databases. |
| `HUSH_ORIGINS` | (none) | Comma-separated `Origin` values allowed on the WebSocket, `POST /drop`, `POST /wake` and `/media/*`, on top of the one always allowed: a page served from the same host the request came to. Unset means that one only. Any other `Origin` is refused at the WebSocket (403, a missing one too) and on `POST /drop` and `POST /wake` (403 `denied`, `null` included), while a request to those two with no `Origin` is processed; `/media/*` only withholds its CORS headers from another origin. `*` turns the check off (tests and non-browser clients only). `npm run dev` lists the two local names. |
| `HUSH_TRUST_PROXY` | `0` | `1` reads the client address from `X-Forwarded-For`; set it behind Caddy (the unit file does) and nowhere else, since a client reaching Node directly could forge the header. Since release 112 the header is read only from a peer on this machine (`127.0.0.1`, `::1`), so Caddy must reach Node over loopback, as the example Caddyfile does: a proxy on another machine would count as one client, and its 40 sockets and other per-address limits would be everyone's. Either way the address is used only for an in-memory salted rate-limit tag. |
| `HUSH_LOG` | on | `off` silences all logging. |
| `HUSH_LIMITS` | `{}` | JSON overriding any value in `src/limits.js`. |
| `HUSH_BADGES` | (none) | Who carries a badge next to their name, as a JSON object of username to badge, for example `{"Alice":"founder"}`. Badges: `founder`, `verified`. The list goes to every page at connection time; a profile cannot carry one, so nobody can give themselves a badge. |
| `HUSH_TURN_URLS` | (none) | The call relay (TURN), comma-separated, for example `turn:relay.example.com:3478?transport=udp`. Calls always go through it; without it `call.relay` answers `unavailable` and the page says calls aren't available. Set with `HUSH_TURN_SECRET`. Two relays may be listed, grouped by host, as IP literals: the first host is the default, the second serves the Americas (a caller in an `America/*` or `Pacific/Honolulu` time zone picks it; the person called follows the caller's; SPEC.md 16.2). |
| `HUSH_TURN_SECRET` | (none) | The secret shared with the relay (coturn's `static-auth-secret`), at least 16 characters. Relay credentials are `base64(HMAC-SHA1(secret, "<expiry>:<name>"))`, `name` being the account's name for the day (SPEC.md 7.1, `call.relay`). |
| `HUSH_TURN_TTL` | `900` | Seconds a relay credential can start relay allocations (60 to 86400). An allocation outlives its credential, so this does not limit a call's length. |
| `HUSH_APNS_KEY` | (none) | Path of the Apple push key (`.p8`) that rings a closed iPhone on `POST /wake`; readable by the service user only. Without it no push is sent. Set with `HUSH_APNS_KEY_ID` and `HUSH_APNS_TEAM_ID`, or none of the three; a key that can't be read stops the server at start. |
| `HUSH_APNS_KEY_ID` | (none) | That key's 10-character id. |
| `HUSH_APNS_TEAM_ID` | (none) | The 10-character Apple team id. |
| `HUSH_APNS_TOPIC` | `com.hushappofficial.hush.voip` | The app's VoIP push topic. |
| `HUSH_APNS_HOST` | `api.push.apple.com` | Apple's push host; `api.sandbox.push.apple.com` for Xcode builds. |
| `HUSH_TLS_PORT` | (none) | Also listen with HTTPS on this port; `npm run dev:lan` sets 8443. Development only. |
| `HUSH_TLS_HOST` | `0.0.0.0` | Bind address for the HTTPS listener. |
| `HUSH_TLS_DIR` | `server/devcert` | Folder with `key.pem` and `cert.pem`. |

## Call relay (coturn)

Calls go through a TURN relay so no caller's address reaches the other side. It is coturn, its own service
(`scripts/hush-turn.service`) with its own config (`scripts/turnserver.conf.example`, installed as
`/etc/hush/turnserver.conf`). Ports: 3478 UDP and TCP, and UDP 49152-49651 for the relayed media; 443 stays Caddy's.
Hush and the relay share one secret: `HUSH_TURN_SECRET` here is coturn's `static-auth-secret`, and `HUSH_TURN_URLS`
lists the relay's addresses (both in `/etc/hush/hush.env`). The install script generates the secret, writes the config
and the unit, and appends the two variables; the ports are opened in a second step. The relay keeps no logs: the log file
is `/dev/null`, syslog is off, and the unit drops stdout.
The relay forwards only to itself: both ends of a call hold an allocation on this server, so `allowed-peer-ip` is the
server's address and every other address is denied. On that address it may reach only its own relay ports:
`scripts/hush-turn.nft` (installed as `/etc/hush/turn.nft`, with the same address) drops any other UDP the `turnserver`
user sends there, Caddy's HTTP/3 on udp/443 included, and `scripts/hush-turn-nft.service` loads it before the relay starts.

## What the server will and will not do yet

- Accepts every op in SPEC.md section 7. `mail.*` answers `invalid`: it was never needed (notes are watched with `sub` and written with `POST /drop`).
- `POST /drop { to, blob, pow? }`: files a sealed, fixed-size note into a mailbox with no session; 429 `pow` with `{ bits, hour }` when proof of work is needed; 403 `denied` when the `Origin` header is present and not allowed, before anything is read or counted (a request with no `Origin` is processed as before).
- `POST /wake { tk }`: with no session; 204 for any well-formed ticket, whatever its state (400 `invalid` for a bad ticket or body, 413 `toolarge` over 256 bytes, 429 `ratelimit` for the address bucket, the only refusal said out loud). A call ticket (`wake.mint`) sends one VoIP push (a random mark, nothing else) to the iPhone that minted it, 3 a minute and 20 an hour per ticket. A message ticket (kind `m`, release 65) sends one "New message" alert push (no name, text, chat or badge) to the phone's alert token, 6 a minute and 60 an hour per ticket. From release 93 a phone's call rings are also capped at 4 a minute and 30 an hour, whichever tickets ring it; nudges are not counted, and a refusal is silent (204, no push). Every kind spends the address bucket, 300 an hour per address (60 before release 65), before the ticket is read. 403 `denied` when the `Origin` header is present and not allowed, before anything is read or counted; with no `Origin` the request is processed as before (curl gets 204).
- `/media/*` (SPEC.md 7.7): `GET /media/limits`; `PUT` and `GET /media/<cid>/<mid>/<i>` for one encrypted piece (written once; the same bytes again are accepted, different bytes are refused); `DELETE /media/<cid>/<mid>`; `POST /media/<to>/<mid>/copy` for forwards. Refusals: 401 no or expired ticket, 403 no level, 409 piece already stored, 413 too large, 429 slow down, 507 `full` (the chat's allowance or the disk). Media pieces are no longer written over the socket.
- Sweeps a disappearing message's media once its time is up, along with the message.
- Under the standard policy, applies the ownership rules of SPEC.md 4.2, the blind-address rules of 4.3 and the room-key levels of 5.4.
- In a channel, hands the sealed member and blocked lists (`meta`) only to a connection at owner or admin level, by `get`, `mget`, a watch's first answer and every change it pushes (an owner or admin key held at member level for an unsecured account counts). Every other connection gets the record without them, and is not refused for it. The public listing carries no `meta` (SPEC.md 5.3, 5.5, 7.4).
- A private channel's record may carry a subscriber count `n`: a whole number from 0 to 100000, changed at admin level or above, and sent to every subscriber with the record (below admin level too), never in a preview or the public listing. A public channel keeps none: `set`, `update` and `chat.create` drop it, never refuse it, so Make public works with one stored. A group's or a one-on-one chat's record with an `n` is `invalid` (SPEC.md 5.3). Live since release 96. Release 93a's server refuses the field, and most later writes of a record that carries one (`update`, `set`, `chat.join`, `chat.rotate`), so a rollback of this code strips `n` first.
- In a channel, answers reads of the read marks below admin level as if there were none (no document, an empty list, a watch that never fires), never with `denied`. A whole mark (`set`) is still written at member level. `update` and `delete` of any path under a chat, and of `secure/<h>`, first run the check a `get` of the path runs, before anything stored is read. Below the level that may read the path, that check's answer is the answer, whether or not a document is there: `denied` for a connection with no level for the chat, for a member card below admin level, for a channel's read marks below admin level, for a call row outside a one-on-one chat and for `secure/<h>`, and `unauth` for one not signed in (SPEC.md 4.6, 5.4). Live since release 96. Release 93a's server answered by what is stored.
- The public listing of channels is a query only: a `sub` on it is refused at every level (SPEC.md 7.4).
- Since release 97: in a channel, reactions and votes go through `chat.act` (SPEC.md 5.7) under a slot only the server can work out, and `chat.mine` tells an account which rows are its own. `set`, `update` and `delete` of acts in a channel are refused at every level with one answer, and rows from before read as none and go with their post. Groups and one-on-one chats do not change.
- Since release 100: over the frame allowance, the page's keep-alive, `{"i":N,"op":"ping"}` byte for byte and after `hello`, is still answered `{ ok, now }`, so a page that spent its frames on a long chat list no longer takes a refused ping for a dead socket. The `ratelimit` refusal from the two frame allowances carries `retry`, the milliseconds before asking again is any use, and the `hello` reply's `limits` include `framesPerMin`. No limit is loosened (SPEC.md 9.4).
- Since release 110: while more than 1 MB is unsent to a connection (`sendBufferBytes`), its frames wait until it drains; a frame it did not ask for (a watch's change, `evict`) that finds more than 32 MB unsent (`sendBufferMaxBytes`) closes it (`not reading`), never a reply or a watch's first load; and one answer's documents (`mget`, `query`, a watch's first load) are at most 24 MB (`answerBytes`), counted as they are read (since release 112, in an `mget` and a watch by ids a document shown only in part, or as none whether or not it is there, counts as the largest its kind can be: 2 MB for a chat record's preview or the copy a channel's member gets, 64 KB for a channel's reaction or vote, so no refusal tells the size of what is not shown), past which the request is refused `toolarge` and what was counted is taken from an allowance of its own (50 MB a minute; since release 112 it also pays for an `mget`, `query` or `sub` refused for another reason after it counted documents, and for what an answered `mget` counted and did not answer), below which the `mget`, `query` and `sub` of the connection (since release 112, of its address) are refused `ratelimit` and its other frames go on; the public listing of channels takes `visibility == public` and nothing else, is answered in id order with the records that fit (which channels: release 112, below; SPEC.md 7.4, 9.4); since release 112 a query's conditions may name only the fields the page asks by (`ts`; `e` on `roll`; `h`, `n`, `n2` on `search`; `visibility` on `channels`) and its order only `ts` (SPEC.md 7.4); and a `set` of a chat record is refused before the record is read when the connection does not hold the chat, and so is an `update` or a `delete` when the chat's row in `chats` is there; an `update` of a chat that is gone (no row and no record) answers `notfound` (again since release 112), and a `delete` with no row reads the record, if any, first, as before 110, and answers ok when there is none.
- Since release 112, three limits are one address's over all its connections, under the fixed tag the 40 sockets are counted by (each connection had its own, so 40 sockets were 40 budgets): the allowance that refused answers are paid from (50 MB a minute, above); the server time its frames take, 3000 ms a minute and at once (`frameMsPerMinPerAddr`), over which its frames are refused `ratelimit` with `retry` (in milliseconds, a whole number of seconds) before they are parsed and its keep-alive is still answered (the count stops at one minute's worth below zero, and a sign-in refused this way ends the connection, so that the page comes back and signs in); and what is unsent to it, 64 MB (`unsentBytesPerAddr`), past which its frames wait and a push to one of its connections holding more than 1 MB closes that connection (`not reading`). Everyone behind one address shares them. The pushes a write sends are taken from nobody's time, as before 112 (how many watches a chat has is its watchers' to choose, so taken from the writer they could have had it refused): they cost the server about 0.08 ms for each page that has the chat open, for a small message and a chat record of 10 KB (the numbers: SPEC.md 9.4). A connection whose frames wait is still read (up to about 64 KB or 1000 frames), so its close is seen and it is gone within 50 ms, not at `idleMs` (SPEC.md 9.4).
- Since release 112 the public listing of channels is `l` of all the public channels picked at random for each request, the ones answered in id order (it was the first `l` by id, which a creator picks); their ids are kept in memory, read once at start. And two of the chat record fields any member may write are capped when a write changes them: what is added to `closed` is a message id set to `true`, 64 KB in all, and `last` is at most 65 KB and each write of it takes the place of the one before whole (SPEC.md 5.3, 7.4).
- Since release 107: a chat record takes a new or changed published key (`openKeys`) only while it is a public channel, by `set`, `update`, `chat.create` and `chat.rotate` alike; a channel that is not public holds no published key for its current key number or a later one after any of these writes or a `chat.join`, so one whose record holds published keys is made private only once its key number is past every one of them (the page changes the key first, publishing nothing), and the key of a key change made while public, or one published ahead, keeps the channel public until then; only a channel is made public or marked public; and a record is made only at an address of its own kind (`d` one-on-one, `g` group, `c` channel). Each is refused with `invalid`, where the level check has not already answered `denied`. A record from before keeps taking every other write: one that already holds such a key below its current key number or outside a channel (the key stays, and the owner of a group or channel can take it out), a group already marked public, a record at another kind's address. Not so a private channel's record that already holds a published key for its current key number or a later one: it takes none of these writes while the key would stay there (not the latest-message mark, not a join by link), only a key change that passes it, its owner taking it out, or its owner making the channel public. The rule reads what the record holds, not what it held: a published key taken out of a public channel's record no longer keeps the channel from being made private at that key number. None of this holds a writer to the database (SPEC.md 5.3).
- Validates every document against SPEC.md sections 7.3, 9.1, 9.2 and 9.3, including the rule that private chat records never carry a name.
- Enforces sealed-post ownership: edits and deletes of a message need the one-time token whose hash is stored, or the admin level.
- Deletes expired messages on its own, once a minute.
- Keeps presence, typing and call records (SPEC.md 16.2) in memory only.
- Stores account, login, phone, vault, backup and link-request addresses as keyed hashes.
- Logs lifecycle events and error codes only. No request logging, no addresses.
- Rate limits of SPEC.md 9.4, all in `src/limits.js`: per address, lookups of account boxes, logins and phone entries (20 a minute, and 60 an hour per address looked up), link requests, which have an allowance of their own (120 a minute per address and 2,000 an hour per link-request address, `linkReadsPerMinPerAddr` and `linkReadsPerHourPerPath`), and invite lookups; per connection, profile reads (600 a minute, every path of an `mget` counted), searches (30 a minute), new chats (200 a day), posts (60 a minute), reactions, read and typing marks (120 a minute), call records (20 a minute); per address, `call.relay` (10 a minute), and per account (6 a minute, 60 an hour); plus the frame, query, drop and media limits. Since release 97, the frame and byte allowances are taken before a frame is parsed, and over them reads from that socket wait 200 ms (see the release 100 bullet above for the ping and `retry`). `chat.slots` counts one query for every 300 names it is asked, rounded up, at least one (10,000 names count 34).
- A new account brings proof of work (16 bits over a per-connection salt, `signupPowBits`), which the page solves out of sight while the sign-up form is being filled in; a backstop of 100 new accounts a day per address stays behind it.
- Compares every key hash and proof hash in constant time, and stores sealed group metadata only when it is sealed under the chat's current epoch.
- Stage 8 (the lock-down checklist of SPEC.md 16.4 and release transparency) is done and the service is live; stage 9 (backups and monitoring, SPEC.md 16) is still to come.

## The client adapter

The adapter lives in `app/adapter.js` between the markers
`HUSH ADAPTER BEGIN` and `HUSH ADAPTER END`, followed by a few lines of page glue
(`connectServer`, the banner text) and the `POST /drop` code; `HUSH_CONFIG` is in
`app/config.js`. It keeps the Firestore-shaped API the rest of the page uses:

- `doc(path)` with `get`, `set`, `update`, `delete`, `onSnapshot`; `collection(path)` with `where`, `orderBy`, `limit`, `get`, `onSnapshot`, `onSnapshotMeta`, `doc`, `add`.
- Snapshots carry `exists`, `id`, `data()`, `docs`, `size`, `empty`, and `metadata.hasPendingWrites` / `metadata.fromCache` (always `false`).
- A write you make appears in your own live views immediately with `hasPendingWrites: true` and settles when the server confirms it.
- `add` generates the id on the client and sends a `set`, so new messages also show up immediately.
- Reads of `directory/*` and `presence/*` issued in the same tick are sent as one `mget`.
- Reconnects with backoff, proves the username again, re-sends every live subscription, and reports the connection state to the page, which shows a banner after 1.5 seconds offline. Since release 102: `present()` (the page calls it when the app comes back into view and when a chat is opened) makes the waiting reconnect go at once, or the next one a close starts within 5 seconds; one attempt per call, and such an attempt does not lengthen the automatic wait. A chat opened while there is no connection says "Connecting…" until its first posts arrive.
- `prove(identity)` signs the challenge with the device key when the device is listed on the profile and falls back to the account key; `prove(null)` signs out. Switching accounts uses a fresh connection and drops the previous account's live subscriptions silently. Since release 102 this holds for every change of account, also one made while disconnected, and the previous account's calls that were waiting for a connection are refused with `offline` instead of being sent.
- Before any operation under `channels/<cid>`, the adapter asks the page for the best room key it holds (`caps(cid)`) and opens the chat with it; a plain read without a key returns the trimmed preview. On an `evict` push it asks the page to refresh the record (`onEvict`), tries to open again, and either re-sends the chat's live subscriptions or ends them with "no longer in this chat".
- A watch on a chat record the page cannot open yet still delivers that trimmed preview (`exists: true`, no sealed fields), so the page can tell "no key for this device yet" from "this chat is gone"; content under such a chat shows as empty until it can be opened. The page keeps the inbox pointer for such a chat and looks again every 15 seconds; it only tidies the pointer away when the chat is gone or when this device once held a key and now cannot open it (it was removed).
- `close()` rejects every call still waiting for a reply, so nothing lingers.
- `createChat`, `rotateChat`, `setAdmins`, `joinChat`, `inviteBlob`, `preview`, `refreshChat` and `chatLevel` expose the room-key operations.
- `putPiece`, `getPiece`, `deleteMedia`, `copyMedia` and `mediaLimits` do media over HTTP. The adapter fetches and caches a media ticket per chat, renews it before it runs out or when the server says it has, and forgets all tickets on every reconnect.
- Calls made while offline wait up to 8 seconds for a connection and then fail with code `offline`. Subscriptions wait as long as needed.

Production note: when the page is served by Caddy on the real domain, set
`HUSH_CONFIG.server` in `app/config.js` to `""` so the page uses its own origin,
and add `wss://<domain>` to `connect-src` in the policy in `index.html` (modern
browsers treat `'self'` as covering it, older ones do not), then run
`npm run csp` so the changed `config.js` is pinned again.
