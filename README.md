# Hush

Private messaging with end-to-end encryption: a web app and the small Node.js server behind it.

The server stores encrypted messages it cannot read, public profiles, and the minimum needed to deliver
data to the right people. It does not store IP addresses or access logs, and its database does not record
chat membership, who sent which message, or who talks to whom. Group names and member lists are encrypted
with the group's own key. People find their chats through an encrypted list only their own devices can
open. Invitations arrive in a sealed mailbox that records only the recipient and the hour. Searching by
name or part of a username lists only people who turned that on; typing an exact username finds anyone,
since that is how chats start. `SPEC.md` is the full design and threat model.

## What the server can see

**A copy of the database** cannot read messages, group names or member lists. It does show:

- who has an account, and each profile as published: username, name, bio and photo, all in plaintext
- the username search index, for people who turned search on
- how many devices each account has, and when each was added
- when each chat's key last changed, and how many times
- the size of every message (messages are not padded), how often each was edited, and the size of every
  photo or file
- how many mailbox notes each person has, with the hour each arrived, which roughly shows how many chats
  they are in
- which accounts have set a strong password (the mark that lets an account run a group or channel), and when
- the readable contents of public channels, whose key is kept on the server by design so anyone can read them

**A live server**, or anyone running it, sees more than the database does. It sees which account sends each
message, which chats each connection opens, and each person's contact list, which their app refreshes about
once a minute. The claims above about who sends what and who talks to whom are true of the stored data only.

## What is here

| Path | Holds |
|---|---|
| `index.html`, `app/` | The web app: one page plus four script files and a stylesheet, each pinned by hash in `index.html`. `app/config.js` is the server address. |
| `vendor/` | Two third-party libraries, for QR codes. See `THIRD_PARTY.md`. |
| `server/src/` | The server: WebSocket document store, live subscriptions, identity and room-key checks, the anonymous mailbox, media over HTTP, rate limits. SQLite, no native modules. |
| `server/test/` | The test suite, which also runs the page's own code against a real server. |
| `server/scripts/` | The pin tool, the local dev setup, and deployment examples: a systemd unit and a Caddyfile. |
| `SPEC.md` | The design: identity plane, room keys, mailboxes, the frame protocol, storage, validation, the threat model, hardening, the stage plan. |
| `RELEASES.md` | The hash of every released `index.html`, for anyone to check what they are served. |
| `SECURITY.md` | What Hush protects and what it doesn't yet, the plan to close the gaps, and how to report a vulnerability. |

## Running it locally

Node 22.13 or newer. In `server/`:

```
npm install
npm run dev
```

Open `http://127.0.0.1:8080/`. Open the same address in a second private window to talk to yourself.
`server/README.md` has the details, including trying it from a phone on the same Wi-Fi, every setting the
server takes, and what to run after editing the page.

## Tests

```
cd server
npm test
```

The suite starts real servers on random ports in temporary folders, lifts blocks of the page's own code out of
`app/` and runs them, and checks that every file the page loads is pinned to its current bytes.

## Deploying

`SPEC.md` sections 11 and 16.4 describe the host, the hardening, and the lock-down checklist.
`server/scripts/hush.service` and `server/scripts/Caddyfile.example` are the unit and the Caddy configuration
with the deployment-specific values left as placeholders. Nothing in this repository is a secret: the one
server secret, the address key, is made on the server and never leaves it.

## Verifying a release

`index.html` carries an `integrity` hash for every file it loads, so the SHA-256 of `index.html` alone pins
the whole app. `RELEASES.md` lists that hash for every release and is only ever added to. To check what a
server is serving you:

```
curl -s https://<domain>/ | sha256sum
```

or save the page from the browser and, on Windows, `certutil -hashfile index.html SHA256`. A hash that does
not appear in `RELEASES.md` means the page you received is not a published release.

## License

Hush is free software under the GNU Affero General Public License, version 3 (`LICENSE`). Anyone who runs a
modified Hush as a service must offer its source to the people who use it, which is the same promise this
repository makes. Copyright (C) 2026 the Hush authors. The two vendored libraries have their own licenses,
listed in `THIRD_PARTY.md`.
