# Security

This page says what Hush protects today, what it does not protect yet, and what we plan to change. It is
written to be accurate rather than reassuring. If you find a claim here, in `README.md` or in `SPEC.md` that
the code does not back up, please report it as a bug.

Hush has not had an independent security audit. The limits below come from our own review of the code
(October 2026). An outside review would likely find more.

This page describes release 92.

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
  the sender. It is then sealed so the stored copy does not say who sent it. A copy of the server's database
  cannot read messages, private group names or member lists. The server itself, or anyone who can write to its
  database, can still read new messages in private groups and one-on-one chats once it has planted a key (the
  first of the known limits below).
- **Chat keys are wrapped per device.** Each wrap uses a fresh one-time key.
- **No address logs.** IP addresses are only ever used in keyed hashes, under keys kept in memory and never
  written anywhere: one replaced every hour, one every day (for limits that must hold across the hour, such as
  sign-ups and uploads), and one made when the server starts and kept until it stops. Under that last one the
  server counts an address's open connections and, since release 112, its server time, its refusal allowance and
  what is unsent to it; that hash is kept while the address has a connection open and for up to a little over an
  hour after. Logs hold no addresses, usernames, chat ids or message content.
- **Recovery words are made on your device** and never sent anywhere. Since release 24 there are 12 of them
  (120 bits), and each account's username is mixed into the stretching, so a stolen database has to be
  attacked one account at a time. Sets of 6 made before release 24 keep working until you replace them. The
  app asks you to make new ones.
- **The app you load is pinned.** `index.html` carries a hash for every file it loads, and `RELEASES.md` lists
  the hash of every released `index.html`, so anyone can check what a server sent them (see `README.md`).

## Known limits

### A malicious server can plant a key in groups and one-on-one chats

The server, or anyone who can write to its database, can read what is sent in a private group or a one-on-one
chat from the moment it plants a key. Nothing signs or announces a key change in these chats.
- It serves a key change with a key it chose, wrapped to the members' public keys. Your app accepts it and
  seals new messages under that key from then on.
- It can then read those new messages, with their media keys, service notes and call setup, and the names and
  member lists written afterwards.
- Checking security codes does not stop this. They cover people's account keys, not the key of a chat, and
  nothing tells you that a chat's key changed.
- Messages sealed before the switch stay unreadable to it.
- Private channels refuse such a key change on devices that have seen the channel's key chain and hold the
  owner's signed admin list (see "Private channel history" below). A device seeing a channel for the first time
  has nothing to check against.
- Until releases 107 and 108 there was a second way, and not only for the server. A chat's record can hold a
  key in the clear: that is how a public channel publishes its key. In a group, and in a one-on-one chat after
  its first key change, the app took such a key before any key of its own, and the server accepted one from the
  other person in a one-on-one chat and from the owner of a group. With a changed app they could put a key of
  their choosing into the record. The other devices then sealed new messages under a key the server stores in
  the clear, which anyone signed in who knew the chat's id could fetch.
  - Since release 108 the app takes a key from a chat's record only in a channel. In a one-on-one chat or a
    group it takes none that another person's app put there.
  - Since release 107 the server refuses a new or changed key in the clear in any record but a public
    channel's, lets only a channel be made public, and makes a chat only at an address of its own kind.
  - A page loaded before release 108 and not reloaded since still trusts a key that is already in a record.
  - Neither release is a defence against the server itself or someone who can write to its database. The
    server's rule does not hold them, and this limit stands as described above.
  - In a private channel the app still takes a key from the record for a key number the device holds no key
    of its own for. Since release 107 the server lets no app put one there for the channel's current key
    number or a later one. A channel's owner with a changed app can still publish the key of a key change, or
    a key for a key number to come, while the channel is public, but the server then refuses to make the
    channel private until its key has changed past every key in its record. The keys a channel published
    while it was public stay in its record, as before. The rule is about what the record holds, not what it
    held: a changed app of the owner's can take the published key out while the channel is public and then
    make the channel private under that same key, which everyone who fetched it can still use. The app
    itself always changes the key first. As said above, the rule does not hold the server itself or someone
    who can write to its database.
  - Neither release cleans a record. A key planted before stays in it. In a one-on-one chat or a group the
    app no longer takes it as a key: a device with a key of its own for that key number uses its own, and one
    with none can no longer open what was sealed under the planted key (a one-on-one chat then makes itself a
    fresh key at the next key number, while it has one left). One thing still reads it: a device does not hand
    that key number on to the account's other devices, so a device linked later may stay without that key
    until the chat's key changes. If a group's real key was put in the record, everything sealed under that
    key is readable to the server, new messages too until the group's key changes.
- A fix is being decided. Today the server also serves the app's code (see "The server serves the app
  code"), which is another way for a hostile server to read your messages.

### No per-message forward secrecy

There is no ratchet:
- All messages in a chat use the same key until something changes it: someone leaving or being removed, a
  recovery, or a device being removed. A group or a one-on-one chat can change its key at most 31 times; a
  private channel has no limit.
- Devices keep every chat key they have ever received.
- A one-on-one chat starts from a fixed key agreement between the two people's account keys.

So someone who gets a chat key, or a device, can read that chat's past messages and its future messages
until the key changes.

### Private channel history

In a private channel, new subscribers can read every post from before they joined. This is not
forward-secret, because each key unlocks the keys before it.
- Anyone with the current key, including through a subscriber's lost or stolen device, can read the whole
  history and new posts until the key changes.
- The key changes when someone leaves or is removed or blocked, when a device is removed, or when an admin
  chooses "Revoke and remove people who joined with it" after a leaked link. It does not change when someone joins, and never on
  a timer. A leave takes effect when an admin's device next opens the channel or next starts (at a start a page goes
  through the private channels its account owns or admins, once a day each, so none needs opening by hand), at most
  8 times a day.
- An open invite link carries the current key: anyone with it can read everything, even without joining,
  until someone is removed. A link sent by email or kept in synced history gives the key to that service too.
- Removing someone or a device stops open links; a subscriber leaving doesn't, an admin leaving does. When an
  admin removes a device, that device keeps admin powers, including seeing links, until the owner's device
  replaces the admin secret. Since release 93b it does that by itself: it notices the admin's new account keys
  (the directory's key version against the one it last wrapped the admin secret to them under) and replaces the
  secret when it next opens the channel or next starts, once it has confirmed that admin's new security code and
  holds the channel's admin list signed (below). The admin's card is only a hint, so a lost device deleting it
  or blocking the admin away delays nothing, and a block such a device placed on an admin the owner lists is
  lifted with that replacement. Before the owner confirms the code the lost device can still make a key change
  signed with the old key, which every device refuses and which freezes the channel until the owner's Fix channel
  (below). An admin who leaves keeps admin powers until the owner's device next acts on the channel (where that
  device holds the admin list unsigned, a channel from before release 92 say, until it next acts once she has
  signed it). In that window a modified app of theirs can see links made meanwhile and make a key change every
  device accepts, which stays in use until the owner's device changes the key without them, as it does when it
  acts on the leave (in a channel with no room left for a key change, until the next one); anyone they let in
  meanwhile stays a subscriber and gets that new key. If such an app also deletes their own leave card and lists
  them again before then, they stay an admin, as one who never left would, until the owner removes them; the
  owner still sees them listed as an admin. Since release 93b a member card counts only in its author's slot,
  which the server tells the owner's and admins' devices (`chat.slots`), so a copy of an admin's leave card
  written again from another account's slot counts for nothing. The server stays the trust anchor for which slot
  is whose: a false answer can make a real card not count or a copy count, and today that is the same server
  that serves the page. An admin whose leave card is still pending and who removes a device in the same page
  session: since release 93b that removal writes the leave card again under its new key in place of the admin
  card, so the leave stands (the owner's device drops them and replaces the admin secret at its next open or
  start); the removal's key change is still made, so the removed device opens no current key.
- An admin's device lists a new subscriber by itself only when their card carries a code from an open link's
  secret. Anyone else holding the key, from a lost phone say, waits to join until an admin adds them: they show
  under Waiting to join for one key change after the one they joined under (an Add gives them the current key),
  and a device such a person removes changes no key there, so the removed device reads on until the key next
  changes. Before Revoke, Remove admin or a block with no room for a key change stops a link, the device tries to
  list whoever joined through it (if that fails, they wait for an Add); a device removal's wipe doesn't.
- Link secrets are kept for admins' devices under the admin secret, and only under one whose fingerprint the
  owner has signed with the list of admins, with her current key, and never on a device that has seen her key
  change without accepting it. So the server can't slip in an admin secret of its own and read link secrets, and
  with them the channel key, nor, on a device that has loaded her new security code, can a device the owner has
  removed, through a list it signed or the admin secret it knew, except through a list dated after hers that one
  of her own devices took before the removal (below). A device the server keeps from loading her new
  code still takes lists her removed device signs with her old key, and can hand it the keys that come after. As
  with the list of admins, a device the server keeps from a later change can still be handed back an older admin
  secret, which an admin removed since knows. An owner's device kept so replaces the admin secret by itself only at
  the time of the list it holds, so it brings no removed admin back on the devices that saw the change (with a
  device removal of hers in between, they keep only the admins in both lists, and trust its admin secret only when
  its list names no one else). Until the owner's device has signed one (a channel from before release 92, until the
  owner has saved its admin list once and her device next opens it or starts; one made private again, until her
  device next opens it or starts), a new link still works for joining, but it stops at the next leave and the
  people who joined through it wait until an admin adds them. The same holds when the channel's admin secret isn't
  the signed one and the owner's device didn't just make it (the server swapped one in, say), until the owner next
  changes admins, when a device she removed had signed, before its removal, a list dated after the one her devices
  hold (even by a moment) that none of her devices took, until the copy of her list that her removal signs has
  been taken on the device (below), or she changes admins at a later time than that (one of hers that took it
  signs that list again with the next admin secret it makes, at the removal say, so every admin the list names
  gets it, an admin of the removed device's own included: below), and on an admin's device that has seen her new
  security code without accepting it, until it does.
- Someone removed keeps what they could already read.
- A new key goes to no one whose new security code the admin's device making it hasn't accepted. So after you
  remove a device, or at any later key change, you may lose a channel until that admin's device accepts your new
  code; your device keeps the channel waiting for 30 days from when it first finds it locked, and after that only
  a new link brings it back. Your device can't tell this from being removed, so once your account has changed
  its keys a removal from a private channel also keeps it waiting, hidden, for those 30 days.
- Each new key is signed by the owner or admin who made it. A device doesn't post, comment, write the member
  list or hand a key on under a key whose signature doesn't check out; reactions, votes, read marks and
  member cards are not held back, so a planted key can read those. The list of admins it checks against is
  signed by the owner, and carries the time it was signed (`rt`), so an older signed list never replaces a
  newer one, and the owner's device signs only the list it has on record. A device learns who the owner is
  the first time it reads the channel's settings and never goes back to an older list, so until then, or if
  the server kept a later change of admins from it, someone removed who still holds an old key could, with
  the server's help, get a key of their own accepted by that device. A device takes no list dated more than five
  minutes ahead of its own clock (until its clock catches up: a list dated up to ten minutes ahead is then taken by
  itself, after loading her security code again, so not under a key she has replaced meanwhile; a list dated
  further ahead is taken the next time the device reads it, with the security code it already holds), but any time
  after the list her devices hold will do (even by a moment), so a lost device of the owner's running a modified
  app can, before she removes it, sign such a list naming an admin of its own, and every device that takes it keeps
  that list. Her removal signs her own list again under her new key, and a device that takes that copy keeps only
  the admins both lists name, so an admin that a lost device named in such a list is dropped on every device that
  takes the copy, whatever date the lost device gave the list. If one of her own devices took that list (the server
  showed it there), it counts as hers: the removal signs it again under her new key, so the admin the lost device
  named stays one, as does anything else the lost device did at a normal time before its removal (a tab of hers
  left open in the same browser reloads into her new keys and takes no list of hers meanwhile, so the lost device
  can't pass a later one through it). From the moment a device has loaded her new security code until it has taken
  her removal's copy, it accepts no admin's key change in that channel, the one the lost device named and the real
  admins alike (so under a key an admin made, it neither posts nor comments there): a device whose clock runs more
  than five minutes behind hers takes the copy only once it has caught up, one that has seen her key change and not
  accepted it only once it has accepted the new code, and a device the server keeps from loading her new code is
  not covered, as above. The copy never adds an admin, so if a device of hers was kept by the server from a later
  change of admins, its older list is signed again under her new key, by the removal when that device does it, or
  when that device is next shown a copy of the list under a key since replaced (the one it was kept on is, once the
  removal has changed the key; the server picks the moment, until her next change of admins), and members keep only
  the admins both lists name (her other devices too, and one shown a copy older than the list it holds refuses her
  change, so she makes it from one that isn't); so they do when the lost device's own list left an admin out, and
  then her own devices show the right list, so nothing prompts her. An admin left out so can't change the key on
  those devices until her next change there, and on those devices no admin's page trusts the admin secret, so a
  link an admin makes there joins but stops at the next leave, and the people who joined through it wait until an
  admin adds them. Until the date the lost device gave its list has passed, a change of hers is dated before it: on
  the devices that took that list it drops admins but adds none, and after an add no admin's page there trusts the
  admin secret (as above); her first change dated after it carries her whole list. So after removing a lost or
  stolen device, from the device that removed it, check the admin list of each channel you own and save it once
  (Edit channel, then Save; a device of yours linked after the removal may be shown the lost device's list first:
  it holds that list unsigned, the channel info says so, and saving it unchecked would make it yours), and ask the
  members who pinned your old security code to accept the new one. A device trusts no admin list it could not
  verify under your current security code as it holds it: a list with no signature (a channel from before release
  92) or one whose signature fails (a lost device's, signed with a code you have since replaced) is kept unsigned,
  counts no admin for a key change on any device but yours (yours count the admins on their record, as before),
  and the device never signs it, seals it again, hands an admin secret to it or saves it by itself; it reads such
  a list again until a copy verifies, and your own save, or your removal's copy, replaces it. So a channel from
  before release 92 has no signed list until you open it once, check its admins and save the list (Edit channel,
  then Save; since release 93b the Edit sheet names the list Save will sign); until then no admin can change its
  key (their device refuses before anything is written and backfills no key chain, and its start's pass only
  pauses there), a current key an admin's device made before release 92 checks out on no device but yours (an
  admin can't post there meanwhile; subscribers only read, and notice nothing while channel comments stay off:
  so save each channel you own right after release 92 is live, before an admin's device opens it), your device
  removal replaces the admin secret there with one only your own devices hold (release 93b), so the removed
  device loses admin level at once, and the channel's admins have none until you have saved the list and your
  device next opens the channel or starts (they can't post or manage it meanwhile; the removal's summary says
  so), and a list a lost device signed there before its removal counts no admin on any device that has your new
  code (taken before, it is under your replaced code; first read after, it is held unsigned) until your save
  replaces it. An admin who left before that save (your device applied the leave but could drop no admin from an
  unsigned list, and keeps their leave card) is dropped by your device's next open after it, before it hands out
  the fresh admin secret, so the save does not sign them back in, even if another admin added them back
  meanwhile (release 93b; before it, it did). One of the owner's own devices can be kept from a change too: a
  change the owner then makes there, a rename included, starts from the list of admins that device last saw, and
  is taken everywhere. A new device of the owner's (a fresh browser, say) likewise starts from the list it first
  reads, and a change the owner makes there is taken everywhere (since release 93b its Edit sheet names the
  admin list Save will sign, so an admin demoted since, shown by an older copy, can be seen and removed in
  Channel info first: a mitigation, the device still starts from the list it first reads); it seals nothing
  again until it holds a list it verified, and an admin it drops by itself (one who left or was blocked) is
  dropped only on devices that have seen no later list than the one it holds. An admin removed from a page older
  than release 92 is still an admin to every release-92 page that holds the signed list until the owner removes
  them again from a release-92 page. An admin made from such a page is no admin to any release-92 page, one
  whose list is unsigned included, so their key change is refused before it is written and no page is left
  refusing the current key. Still, reload every tab left on release 90 or 91 before changing admins from it. The
  first owner device, or admin device holding the signed list, to open a channel from before release 92 vouches
  for the key it holds.
- Until a device has seen a channel's key chain, it trusts the first owner and the keys it sees on any
  channel, not only on channels from before release 92: a server can answer that a channel has no rows.
- Once it has, the server can't make an owner's or admin's device give away an older key while it fills in the
  chain: the device seals a key only under one the chain vouches for or one it holds itself, never one named
  only in the channel's settings; it replaces an entry of the chain that holds a key only when the entry below
  it is signed by the owner or an admin it has on record (never before it has read who they are); and it stops
  at the keys of a time the channel was public. One gap is left: a wrap the server swapped in, for an epoch that
  device never opened, is trusted as the device's own, so older keys can still be sealed under the key in it.
- During a device removal, a key change signed by the account's own replaced key, as that device held it,
  is accepted on that device while the removal runs, so the removal can change the key.
- Since release 93b a device refuses a private channel record older than a key change it checked or made (a
  rollback): nothing is sealed and no key is changed from it, and the message names a reload. The same holds
  after an honest restore of the server's database from a backup or a snapshot: a private channel whose key
  changed in the lost window stops posting on the devices that saw the newer key, with no way back in release 93
  (Phase 3's restored mode); a device that never saw the newer key is not affected, and the owner's Edit, then
  Save still works. Groups and one-on-one chats keep no such guard, since a malicious server can plant a key
  there anyway (above), so it would only cost an honest restore (owner decision D7).
- A channel whose current key is signed by a key that has since been replaced (a device removal that could not
  change that channel's key, say) is refused by every release-92 page: no one can post or comment in it, and its
  key is not changed, until the owner repairs it. This fails closed on purpose. Since release 93b the owner's
  Channel info offers Fix channel on such a channel (tagged "Needs fixing"): a fresh key she signs, chained to nothing
  before it (the refused key is never vouched for), wrapped to the list she confirms in the sheet (shown as her
  device holds it, so she unticks anyone she doesn't know; her signed admins always), with the admin secret
  replaced in the same run and every open invite link stopped. The cost: people who later join through the key
  chain read nothing from before the repair; invite links still carry every key. Whoever made the refused key may
  have written the blocked list sealed under it too, so for the people the sheet shows the owner's ticks win:
  anyone she leaves ticked, and her signed admins, is taken off the sealed blocked list and the server's block on
  them is lifted once the admin secret is replaced (best effort: a lift the page could not make shows nowhere,
  and Block from this channel, then Unblock, then Add subscribers puts it right). A block on anyone the sheet
  does not show stays, whoever placed it: Channel info's Block takes a subscriber off the member list as it
  blocks them, so a subscriber a lost admin device blocked that way is not in the sheet and stays blocked in the
  sealed list and at the server, and after a repair the owner still checks Blocked from this channel and unblocks
  (and adds back) anyone wrongly there. If an admin's security code changed, accepting it first may be all the
  channel needs. A holder of a stale admin secret (a lost admin device before the owner's device replaces the
  secret, say) can make a key change no page accepts, which freezes the channel; Fix channel is the way out. Release
  93a also closes one other way into this state, a key change from a tab still on release 90 landing while a
  channel's key chain is first filled in.

### Who is in a channel

In any channel, public or private, only the owner and the admins are meant to learn who the subscribers are.
Two changes brought the rule, a page half and a server half, and only the server half enforces it. The page
half went live first, as release 94. The server half went live on 2026-11-05 as release 96, after a Hetzner
snapshot, and after every tab and iPhone app that an owner or an admin may use was reloaded or restarted. That
order mattered for two reasons. An older page decides that you belong to a channel from the member list. With
the list no longer sent, it shows no Leave, reactions, votes or read marks until it reloads. And an older page
of an owner or an admin seals the member list again from whatever copy it holds. A copy read below admin level
has none, so a subscriber just made an admin could seal a list that names only the people they add. Pages from
release 94 on refuse to do that.

What the page half does:
- The app shows a subscriber only the owner and the admins by name. Channel info of a private channel also
  shows a subscriber how many subscribers it has, a number and never names (release 95). A public channel
  shows no count until Phase 3. The chat header, the chat list and the join sheet say only "Private channel"
  or "Public channel". Channel info lists "Owner and admins" and offers no Block person or Unblock person on
  them.
- The owner and the admins are not secret. They sign posts, and subscribers check key changes against them.
- The people lists take no other subscribers from a channel you do not own or run. The app loads the
  profiles, pins the keys, checks the security codes and asks the presence of only its owner and admins. The
  list that a device removal keeps names only them too.
- In a channel you do not own or run, the app names, counts and checks only the owner's, the admins' and
  your own read marks, reactions and votes, whatever member list its copy carries. So it loads no other
  subscriber's profile to check a signature. Before release 98 its counts of reactions and votes could be
  lower than an admin's; since then everyone counts the same rows.
  Its view count on a post covers only the views of the owner, the admins and you. Since release 96 there is
  none, because the server withholds read marks from a subscriber.
- A subscriber's app no longer needs the member list. It knows it belongs from the level its key gives.
- An admin's app never seals the member list from a copy it could not read. This closes the window in which
  an Add or Unblock right after an eviction left only the people added, or nobody, listed.
- A device that is no longer an admin (Remove admin) forgets who waited to join and whose lost-device cards
  it acted on. A device removed from the channel while offline keeps them, hidden.

What the server half does, live since release 96:
- In any channel, the server hands the member and blocked lists to the owner's and admins' connections only.
  Subscribers, link holders and non-members never get them, a modified app included.
- The read marks follow the same rule. Who read a channel, and when, is known to its owner and admins only.
  Subscribers, and in a public channel anyone who opens it with the published key, get no read marks.
  They also can't update or delete one: below admin level the server refuses both, whether or not the mark
  is there. An account with no place in the channel, and a connection that never signed in, are refused
  too, with the same answer for a mark and for none. So they can no longer confirm from the tags that a
  guessed username read it. Subscribers no longer see the view count. A subscriber can still write a whole
  mark of their own, which is how the owner and the admins get their view counts.
- The same holds for everything under a chat, and for the secured mark. Below the level that may read it, an update
  or a delete gets one answer whether or not the document is there, and the server reads nothing stored first. So
  nobody below that level can probe a member card, a reaction, a post or a key-chain row, or tell whose account has
  the secured mark, whether signed in or not. A demoted or removed admin who still holds card tags from
  `chat.slots` is the case that mattered.
- The public listing of channels can no longer be subscribed to. It used to stream the id and time of every
  chat record change on the server.
- A public channel keeps no member list sealed under a key that it publishes, since anyone could open it.
- A subscriber's app can't tell whether it is on the list. Removing a device on it writes the lost-device
  card either way. For a listed subscriber that gets the key changed at an admin's next open. An unlisted
  joiner's card changes no key by itself. Since release 104 it keeps them under Waiting to join: an admin
  adds them, and the admin's next open of the channel then changes the key. Until then the removed device
  reads on. (Before release 104 the card acted on nothing and they dropped out of Waiting to join.) The
  summary the app shows can't tell the two cases apart, so it says what to ask an admin for in both.

Before release 96, every subscriber's connection received the member list and the read marks. A modified app
could read the list and the count, and so could Channel info on a page from before the page half. Anyone
holding the chat key could match guessed usernames to read marks, reactions and votes. A page from
before the page half also fetches the profile of any subscriber whose read mark, reaction or vote it checks,
and a name search on that page can then find them, until the page reloads. The page half stops this: in a
channel you do not own or run, the app checks only the owner's, the admins' and your own, whatever list its
copy carries. The server half closed this for a modified app too, for the list and the read marks. Releases 97 and 98
close it for reactions and votes (see below). Key pins saved in vaults before the page half still hold other subscribers' names and
keys. No chat names them. A toast for one appears only if that person's profile is loaded again, for example
by a username lookup.

What stays visible once both halves are live:
- To subscribers: the owner and the admins.
- To subscribers of a private channel: its exact subscriber count and when it changes, a number and never
  names (release 95). A public channel shows no count until Phase 3.
- To anyone who can read the channel's record: roughly how many devices hold the key, from its key wraps.
- To the operator: which signed-in account opens which channel.
- To the operator, and to anyone with a copy of the database, since release 96: each private channel's exact
  subscriber count, once an owner or admin has opened the channel on a current page, a number and no names,
  for private channels only (the server drops the field from a public channel's record). Before that, only
  the rough figure from the key wraps.

What still shows who is in a channel, and is not fixed yet:
- Since releases 97 and 98 (2026-11-09) no reader of a channel's reactions and poll votes can match one
  to a guessed username, the owner and the admins included: only the counts show, and your own app shows
  your own choice. A row holds no name, tag, signature or time. Before them, anyone who could read them
  (a subscriber, or anyone in a public channel) could. The server itself can still tie them: it
  keeps each account to one reaction and one vote per post by filing each under a slot only it can compute,
  so whoever runs it can tie each one to an account, also after the account is deleted, since it keeps the
  username, and, in a public channel or under a key it planted, see what that account picked. Phase 3 plans anonymous tokens, so the server can check that
  each reaction or vote is valid and used only once without being able to tell whose it is (the live
  server will still see network addresses and timing).
- With that fix, timing can still hint who to someone watching live: a row appears when someone acts, so in a
  quiet channel, or one with very few subscribers, timing or elimination can suggest who reacted. No frame says
  so. A person's rows stay counted after they leave, are blocked or delete their account.
- The number of devices that hold a private channel's key can be counted from its key wraps (counts and
  timing, no names).
- A subscriber's watch of the channel record still shows when a member or blocked list changes: a frame
  arrives with the lists left out, so there are no names, only timing of the same kind as the key wrap
  counts.
- Making a private channel public exposes the reactions and votes made while it was private. With the fix above it exposes only their counts and choices, with no names.
- Member lists that a subscriber's device already decrypted before this change stay on that device.
- Typing rows in a channel are readable by any member. No stock page writes them, so only a modified app has
  any.
- Since release 96 a subscriber in a channel can no longer update or delete anyone's read mark,
  but can still overwrite one with a whole mark of their own. The owner's and the admins' pages then drop
  it, since its signature isn't that person's, so a subscriber can still take someone's view out of the
  counts. In a group, members can still update, delete and overwrite each other's marks, which they can
  read anyway.

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

You can compare security codes in person. If someone's keys change, the app warns you, but accepting the
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

Reporting a post in a public channel keeps a copy of that post (which the server could already read), its
key, the channel's name and the reason on the server for 90 days, even if the post is later deleted or the
channel turns private. The server does not store who reported, only a tag keyed with the server's secret
`addr.key`, used to count the same person's report of the same post once. Someone who holds that secret, such
as the live operator, can test whether a guessed user reported a given post, the same as with blocked users.
One-on-one chats and private groups and channels can never be reported: the server checks its own record of
the chat, not what the app says. Only the usernames in `HUSH_OWNERS` can read reports (`SPEC.md` 8.7).

Whether a channel is public is one word in its record, and the record is the server's. The server, or anyone
who can write to its database, can mark a private channel public and put a key of its own choosing into the
record. The app still believes that word, as it did before release 108. This stays open: a private channel
that somebody who can write the database marks public is read as public by the app. A fix is planned for the
release after 108. What release 108 does close is smaller: a record's own `id` field is never believed. The
app files every chat record under the address it asked the server for, whatever `id` the record carries.

### Deleting an account is confirmed by the app, not the server

Deleting your account asks for your password or recovery words first, but that check happens in the app. The
server can't verify a password, and every signed-in device holds the account keys (`SPEC.md` 10.4, A7), which
is all the server asks for: a connection signed in with the account key. So someone who can run a modified
app on one of your unlocked devices could delete your account without knowing your password. Deletion is
instant and can't be undone, and the username is never freed. A server-side check is planned together with
the stronger password system (OPAQUE, roadmap item 2). What deletion erases and what stays is in `SPEC.md` 4.7.

### Voice calls go through our relay

One-on-one voice calls always run through a relay (TURN) on our server, never directly between the two
devices. That is on purpose: neither person learns the other's network address or rough location. There is no
fallback to a direct connection, and a server without a relay has no calls.

The trade-off: while a call is live, the relay sees both people's network addresses, when the call starts and
how long it lasts. None of that is written to disk or logged, but someone with access to the running server
could link who is calling whom while the call is happening.

The audio is end-to-end encrypted by WebRTC (DTLS-SRTP), with fresh keys for every call that are gone when it
ends, so the relay can't decrypt it. Each call setup message is signed by the account key of whichever side
sends it, caller or callee, and sealed with the chat's key, which the server never holds unless it has planted
one (the first known limit above), and kept in the server's memory for a minute at most. Each call leaves one
entry in the chat ("Missed call", "Incoming call" and the like), written by the caller's app as an ordinary
message: sealed and signed like any other, so the server sees only another encrypted post, and in a chat with
disappearing messages it disappears with them.

Your app takes only relay addresses that are plain IP addresses and are our relay's own, so the other person
can't make your device look up a name of their choosing. A setup message counts for 30 seconds by our server's
clock, and only within 10 minutes of your device's own clock, and your device remembers for a day the calls it
has already shown you. A malicious server could still replay, within those 10 minutes, a call offer your device
never saw: it would ring, but it can't connect, because the keys it was made with are gone.

Relay passwords last 15 minutes (a call can go on longer) and are rate-limited per network address and per
account. The relay caps how many relay sessions one account holds at once, knowing the account only by a name
that changes every day and doesn't reveal the username. The relay forwards only to itself, never to any other
address. Calls inherit everything above: they are only as trustworthy as the security code you checked, and the
page that places them comes from our server.

A second relay, in the United States, runs beside the one in Finland. The caller's device picks one by its own time zone
and the other side follows, so one relay, never both, sees a call. Neither relay records anything about a call; the
United States box also keeps no system logs at all.

### Message requests and held invitations are kept by your own app

"Send a request first" (Settings, Privacy) and the hold on invitations are rules of your own app, not of the
server. The server never knows who has an open request with whom, and it referees none of this
(`SPEC.md` 5.6 and 6).

What the setting does, since release 108: with it on, your app treats a first one-on-one message from a person
you have no chat with as a request, whatever the sender's app says about it; the cases where it does not are
listed under "What stays open" below. Until you accept, the chat is not in your chat list, the Calls list or
search, has no unread count, cannot ring you, and sends no read mark. An open request shows its first text
message, with its quote box if that message is a reply (the name and the words in the box are the sender's
choice) and with the reactions on it; any other message the person sent is counted in one line and not shown,
and its photos are not downloaded. Before release 108 the sender's app decided, so a modified app could skip
the request, and an honest first message became a normal chat about every second time when your app had been
closed.

Whatever the setting says, an invitation to a group or channel you are not in now waits under Message requests
until you tap Join, also when it comes from a person you chat with. You count as in a chat when your mailbox
holds a note of your own for it (every join writes one, and all your devices read it), when this page already
shows the chat, or when it is a public channel you joined. A key stored on your device does not count. So a
group or channel you left or were removed from waits for Join when you are added again, with the two exceptions
listed under "What stays open" below. While an invitation waits, your app does not watch the chat and tells the
inviter nothing. It sends the server nothing that names the chat (it does read the inviter's profile, to check
the signature) unless you open a link to that chat yourself: then your app reads the chat's record and shows
the server that it holds a key for the chat, as it does for any link, and the invitation still waits. An
invitation with no valid signature is dropped, so a person you blocked can no longer invite you under a made-up
name.

What stays open:

- A modified app can still store messages in a request chat. You are shown none of them but the first text
  before you accept; your app downloads the sealed records to count them.
- The server still accepts the member list an inviter writes, so your username can stand in a group's member
  list, where its members see it, before you join or after you delete the invitation.
- Removing a lost device (the key replacement) writes every note in your mailbox that your app can open
  again as your own, without judging it. An invitation that was waiting at that moment is joined by it. So is
  one your app had dropped: one with no valid signature, or from a person you blocked. And a one-on-one note
  your app had refused becomes a normal chat that can ring you.
- A request you deleted can come back as a normal chat that can ring you when you use more than one device:
  your app writes a note of its own for the chat, and a device of yours that still holds the older settings
  takes the chat for a normal one and saves that.
- If you block a person you have no chat with and later unblock them, and they had started a one-on-one chat
  with you, your app files that chat as a normal one, also with "Send a request first" on.
- Before it judges a first message your app reads your own profile from the server again. If that read fails
  and the app still holds an older copy, the older copy decides: if that copy says the setting is off, the
  message can become a normal chat.
- Your devices share one settings vault. A page from before release 108 that is still open on one of your
  devices decides the old way: it takes a first message as the sender's app tagged it and lets an invitation
  straight in. What it let in stays on all your devices after that page is reloaded. Such a page also deletes
  your own note for a chat when a newer note for it arrives, as one does when a member writes there for the
  first time from a device. If no updated page of yours is open at that moment, or the old page deletes your
  note before an updated page has seen both notes, the chat can then show under Message requests on an
  updated device the next time it opens or reloads, until you tap Join on one of them. Delete or Block there
  takes the chat off your chat list on all your devices. Where the newer note is an invitation that names a
  one-on-one chat (no honest app writes one), that chat gets no row there: it can be missing from an updated
  device's chat list until the other person opens the app again and writes to you, sometimes only after the
  hour has changed. Its messages are kept.
- A group or channel you are in can show once under Message requests after the update to release 108: one
  where a page from before release 108 had let a member's newer note take the place of your own. Tap Join and
  it is back in your chat list. While it waits there your app does not watch it, so you see no new messages
  from it.
- An invitation back into a group or channel you left goes in without Join on a device of yours that still
  shows the chat because it was not connected when you left on another device. That device can then put the
  chat back on all your devices. And if you are removed and added again before any of your devices has seen the
  removal, the chat simply stays in your chat list.
- A mailbox keeps 500 notes, and when it is full the server pushes out the oldest notes of other people first.
  So anybody who knows your username can, with a few hundred notes left while your app is closed, push waiting
  requests and waiting invitations out of your mailbox. Your own notes, which keep your chat list, go only when
  no note of anybody else is left, and a pile of notes for one chat you are in makes each open device of yours
  write your own note for that chat once, so such a pile does not take chats off your chat list. Before release
  108 a pile of invitations into new groups made your app write a note of its own for each, and with two devices
  open that could push your own notes out too.
- Release 108 leaves one fault of this kind open. Somebody who knows the addresses of very many chats you are
  in, without being in them, can leave a note for each of those chats while your app is closed. When your
  devices open, each one writes a new note of your own for each such chat before your older note for it is
  deleted. In a full mailbox those new notes push out your oldest own notes, and the chats those notes kept
  leave your chat list on all your devices. The messages stay on the server. It takes a big account and several
  devices, or browser tabs, opening together. Measured: an account in 300 chats, notes left for 150 of them,
  two devices: 43 of the other 150 chats left the chat list. An account in 250 chats, notes for 100 of them,
  three devices: 29 of the other 150 left. An account in 40 chats, notes for 20 of them, two devices: none left.
  The page before release 108 lost no chat in these runs. They ran on a test server without its limit on how
  fast a device may write; under that limit the numbers can differ.
- A chat's place in your chat list goes by a time kept with the chat, and any member of the chat may write that
  time; in a public channel that is anyone with an account. Your app lists the 300 chats with the newest time,
  and listens for calls in the first 90 one-on-one chats among them that you have not blocked or deleted for
  yourself. Before release 113 one write of a far-off date kept a chat first for good. Since release 113 the
  server stores a time that is written more than a minute ahead of its own clock as its own clock's time, so a
  new write can no longer do that. A chat that was given such a date before release 113 keeps it until the
  next message in that chat, or another change that writes its record again, such as pinning a message in it;
  a join by link, a key change and a change of admins leave it as it is. A member can still set the time to
  now, or up to a minute ahead, as often as they like, as a new message would. So enough accounts that each
  start a chat with you still push your oldest chats out of the 300 and out of the 90, and can keep them out
  by keeping their own chat's time fresh: those chats are then missing from your list until they get a newer
  message, and a call in one of them can fail to ring in an open browser page. A request you have not answered
  takes a place in the same way, so "Send a request first" does not stop this. Blocking such a chat takes it
  out of the 90, and "Delete for me" does so until the chat's next message, which the same member can send.
  Neither gives its place among the 300 back, unless you block it while it is still a request you have not
  answered. The messages stay on the server.
- The time of a chat's latest message is also kept with the chat and written by any member. Your app dates
  "Delete for me" and "Mark as read" by it. Since release 113 the server refuses a write of it that is not a
  number or is more than 400 days ahead, which is as far ahead as a message may be dated; a latest message
  written with no time at all is still taken. One that a chat held before release 113 stays until that chat's
  latest message is next written. Within those 400 days it is still the member's to write: if they date it
  ahead and you then use "Delete for me" on that chat, the chat stays hidden on all your devices until that
  date, and "Mark as read" on it stops its unread count on that device until that date.
- Requests and held invitations rest on the note the other person left in your mailbox, which the server
  removes after 30 days. One you have not answered by then is gone, and nobody is told.

### Other limits

- **One device, whole account.** Every device holds the account's private keys, so one compromised device
  means the whole account is compromised.
- **Approval only on device linking.** Adding a device with the link code asks an existing device to approve
  it, after comparing a 16-symbol code (80 bits since release 24). Logging in with the password or the
  recovery words adds a device without approval. Your other devices are told only afterwards.
- **A saved password.** If you let Apple Passwords (iCloud Keychain) or another password manager save your Hush
  password, the key to your account-key box lives there too: in Apple's case in its end-to-end encrypted keychain,
  synced to every device on your Apple ID and reachable by whoever controls that Apple ID together with one trusted
  device. That is your choice at the prompt. Your recovery words are never offered for saving.
- **Metadata.** The server can see more than message contents. `README.md`, "What the server can see", lists
  what a copy of the database shows and what a live server sees beyond that. In short:
  - plaintext profiles
  - device counts and dates
  - key-change times
  - message and file sizes (no padding)
  - mailbox counts by the hour
  - while running: who sends each message, which chats each connection opens, and contact lists
- **The list of public channels can be crowded.** The app lists up to 100 public channels and searches only those.
  Until release 112 the server gave the first 100 by id, and whoever makes a channel picks its id, so 100 channels
  made at the lowest ids hid every other one. Since release 112 each request gets 100 of all public channels picked
  at random. Hiding is now only crowding: with 1,000 public channels a given one is in one list in ten, and anyone
  can make public channels (200 a day for each account). Channels with very large records can also end one list
  early, because one answer holds at most 24 MB. A search by name on the server would be the real fix; it needs an
  app change and is not built.
- **Limits per network address are shared.** The server counts open connections, server time and unsent data per
  network address (`SPEC.md` 9.4). People behind one address, as on a mobile carrier, an office network or a VPN
  exit, share those budgets. Heavy use by one of them can have the others refused for a while. Someone at that
  address who means to can keep the others out for as long as they go on: by using up the server time, or with a
  few connections that ask for large answers and never read them, which has every other connection of the address
  wait unanswered. The server time fits one or two people starting the app at once: about twelve starts a minute
  for a whole address. Each of them can also tell roughly how much of a budget the others have used.
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
4. **Key transparency** is not planned yet. Until it is, compare security codes for conversations that
   matter.

Each change will be specified in `SPEC.md`, tested, and listed in `RELEASES.md`. Phase 3, the rebuild behind
items 1 and 2, starts with a clean wipe, so today's accounts and chats will not carry over.
