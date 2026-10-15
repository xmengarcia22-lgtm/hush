# Security

This page says what Hush protects today, what it does not protect yet, and what we plan to change. It is
written to be accurate rather than reassuring. If you find a claim here, in `README.md` or in `SPEC.md` that
the code does not back up, please report it as a bug.

Hush has not had an independent security audit. The limits below come from our own review of the code
(October 2026). An outside review would likely find more.

This page describes release 24.

## Reporting a vulnerability

Please report privately through GitHub: on the repository's **Security** tab, choose **Report a
vulnerability**. Do not open a public issue for anything that could put users at risk.

Helpful details: what an attacker needs (an account, a seat in a chat, the server's data, control of the
server), what they get, and the steps to reproduce it. We will reply, keep you informed while we work on a
fix, and credit you in the release notes if you would like. Hush is a small project and doesn't run a bug
bounty.

## What is solid

- **Standard primitives only.** All cryptography uses the browser's built-in WebCrypto:
  - P-256 for key agreement (ECDH) and signatures (ECDSA)
  - SHA-256 and HKDF-SHA-256
  - AES-256-GCM with random 96-bit nonces
  - PBKDF2-SHA-256 at 600,000 rounds for passwords and recovery words

  There is no third-party crypto library, and no `Math.random` in any crypto path.
- **Messages are end-to-end encrypted.** Each message is encrypted under its chat's current key and signed by
  the sender. It is then sealed so the stored copy does not say who sent it. The server cannot read
  messages, private group names or member lists.
- **Chat keys are wrapped per device.** Each wrap uses a fresh one-time key.
- **No address logs.** IP addresses are only ever used in a keyed hash, under a key kept in memory and
  replaced every hour. Logs hold no addresses, usernames, chat ids or message content.
- **Recovery words are made on your device** and never sent anywhere. Since release 24 there are 12 of them
  (120 bits), and each account's username is mixed into the stretching, so a stolen database has to be
  attacked one account at a time. Sets of 6 made before release 24 keep working until you replace them. The
  app asks you to make new ones.
- **The app you load is pinned.** `index.html` carries a hash for every file it loads, and `RELEASES.md` lists
  the hash of every released `index.html`, so anyone can check what a server sent them (see `README.md`).

## Known limits

### No per-message forward secrecy

There is no ratchet:
- All messages in a chat use the same key until something changes it: someone leaving or being removed, a
  recovery, or a device being removed. A chat can change its key at most 31 times.
- Devices keep every chat key they have ever received.
- A one-on-one chat starts from a fixed key agreement between the two people's account keys.

So someone who gets a chat key, or a device, can read that chat's past messages and its future messages
until the key changes.

### Message backup exposes history

Message backup is on by default for new accounts. It stores your whole collection of chat keys on the
server. That copy is encrypted under a key that comes only from your account key.

The account key sits on every one of your devices, in the box your password opens, and in the box your
recovery words open. Anyone who gets your account key and a copy of the server's data can therefore read
all of your backed-up history. Turning backup off (Settings > Advanced) deletes the server's copy. Your devices still hold their keys, and a
copy someone made before you turned it off can still be read.

### The server operator can try to guess passwords offline

Your password is stretched on your device, and your account keys are kept on the server in a box locked by
it. The server sees a hash of the stretched password when you log in. It also holds its own secret key that
decides where each box lives.

Whoever holds the database and that key can therefore test password guesses offline. The only thing slowing
them down is the 600,000 rounds of stretching. The limit of 10 wrong guesses an hour per username applies to
outside attackers only.

The salt is derived from the username, so it is predictable. A long, unusual password is the real protection
here. Owners and admins of groups and channels must use at least 12 characters.

Recovery boxes don't sit behind that key at all. New 12-word sets are strong enough that this doesn't matter.
Older 6-word sets (60 bits, one salt shared by every user) can be attacked from a stolen database until
they are replaced. A 6-word box can also outlive its replacement if no device of yours remembers where it
is.

### Trust on first use, no key transparency

When you first message someone, your app trusts the account keys the server gives it for that username.
Nothing independent lets you check that the server isn't handing out different keys to different people.

You can compare safety numbers in person. If someone's keys change, the app warns you, but accepting the
new keys takes one tap.

### The server serves the app code

Hush is a web app, so the same server that relays your messages also sends you the code that encrypts them.
A server that was compromised or compelled could send one person a modified page.

The release hashes in `RELEASES.md` let you detect this. Your browser does not check them for you, so you
have to compare the hash yourself.

### Public channels are readable by the server

A public channel is meant for anyone to read, so its key is stored on the server in the clear. The server,
and anyone with its data, can read every post. Only private groups, private channels and one-on-one chats
are end-to-end encrypted.

Reporting a post in a public group or channel keeps a copy of that post (which the server could already read), its
key, the channel's name and the reason on the server for 90 days, even if the post is later deleted or the
channel turns private. The server does not store who reported, only a tag keyed with the server's secret
`addr.key`, used to count the same person's report of the same post once. Someone who holds that secret, such
as the live operator, can test whether a guessed user reported a given post, the same as with blocked users.
One-on-one chats and private groups and channels can never be reported: the server checks its own record of
the chat, not what the app says. Only the usernames in `HUSH_OWNERS` can read reports (`SPEC.md` 8.7).

### Deleting an account is confirmed by the app, not the server

Deleting your account asks for your password or recovery words first, but that check happens in the app. The
server can't verify a password, and every signed-in device holds the account keys (`SPEC.md` 10.4, A7), which
is all the server asks for: a connection signed in with the account key. So someone who can run a modified
app on one of your unlocked devices could delete your account without knowing your password. Deletion is
instant and can't be undone, and the username is never freed. A server-side check is planned together with
the stronger password system (OPAQUE, roadmap item 2). What deletion erases and what stays is in `SPEC.md` 4.7.

### Other limits

- **One device, whole account.** Every device holds the account's private keys, so one compromised device
  means the whole account is compromised.
- **Approval only on device linking.** Adding a device with the link code asks an existing device to approve
  it, after comparing a 16-symbol code (80 bits since release 24). Logging in with the password or the
  recovery words adds a device without approval. Your other devices are told only afterwards.
- **Metadata.** The server can see more than message contents. `README.md`, "What the server can see", lists
  what a copy of the database shows and what a live server sees beyond that. In short:
  - plaintext profiles
  - device counts and dates
  - key-change times
  - message and file sizes (no padding)
  - mailbox counts by the hour
  - while running: who sends each message, which chats each connection opens, and contact lists
- **Search.** Typing your exact username finds you, whatever your settings. Only search by display name or
  part of a username is opt-in.
- **Our own constructions.** Some parts are our own designs built from standard pieces, and have not been
  reviewed by anyone else:
  - key wraps in the ECIES style, without sender authentication
  - vault and backup keys made by key agreement between your own keys
  - one account key used for several jobs
  - signatures over `|`-joined strings
  - a slightly biased safety-number encoding

## Roadmap

These are plans, not promises, and none has a date.

1. **Per-message forward secrecy.**
   - One-on-one chats: a Double Ratchet with an X3DH-style start using signed prekeys.
   - Groups: a ratcheting sender-key scheme, or MLS.
   - Message backup will be redesigned to fit, for example as opt-in, or limited to what you choose to keep,
     since backing up every key undoes forward secrecy.
   - Removing a device should then really limit what a stolen device can read.
2. **A login the server can't guess against.**
   - Either an augmented PAKE such as OPAQUE, so the server never holds anything it can test a password
     against, or account keys kept behind a high-entropy secret that never leaves your devices.
   - The per-username guess limit stays as a second line of defence.
3. **Retiring old recovery boxes.** Mark new recovery boxes so the server can later remove unmarked 6-word
   boxes after a warning period.
4. **Key transparency** is not planned yet. Until it is, compare safety numbers for conversations that
   matter.

Each change will be specified in `SPEC.md`, tested, and listed in `RELEASES.md`, with migrations so that
existing accounts keep working.
