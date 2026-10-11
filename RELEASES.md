# Releases

Every release of the app served at `https://hushappofficial.com`, oldest first. The value is the SHA-256 of
`index.html` exactly as served. Because the page pins every file it loads by hash, this one value pins the
whole app (`SPEC.md` 10.6 and 16.4).

This list is only ever added to, never edited. A page whose hash is not here is not a published release.

| Date (UTC) | Release | SHA-256 of `index.html` |
|---|---|---|
| 2026-10-09 | Go-live | `230981406a09e72623baf55b34ac33ec11186852ca1dbd868d48bc9c094b9072` |
| 2026-10-09 | Founder badge, @mention links, @mention picker | `78e87b54de583f73e15da9edaea62e9699400bd9f8943d9a0345c8b086771514` |
| 2026-10-09 | Versioned file addresses and caching headers | `84bb13e1c3808373b37e3cdf2787d4fbcf120918ee0907bbc4453e25d4e14290` |
| 2026-10-09 | Badge wherever a name is shown | `7700d5364fdd25b7695aa4d62208b127d4d65f1fce834093be0ca78176b70e51` |
| 2026-10-09 | Neutral sample phone numbers in input placeholders | `e87def444e4e654949627b1ee7e83bcf3c31cef567c71cdb8dddcc19b75ae247` |
| 2026-10-09 | Swipe navigation, Back closes what is open, Contacts tab, own @mention opens Saved Messages | `13dffd0797428bf5991cf10264cfb015443ff0ea590e97f2f554a69ace5e1bc1` |
| 2026-10-10 | Sign-up and login by email, phone or username; emailed recovery codes with a 60-second resend wait; typed device-approval code | `787cefc8e7c04b06eea1073e00c64febb66768156526165bde5308a854b4bc9e` |
| 2026-10-10 | New-device login: retry after backing out, own read allowance for login requests, clear error messages, sign-in after a long wait, update notice | `d169c3e5d851e266ca77c76e0a498c8ae489c2d39c631bac2a503c1c1a015c63` |
| 2026-10-10 | Security fixes: approval code covers the device key, phone matching off, password gate with a per-login limit, secured accounts for owners and admins, tighter code limits | `9b26c5dbb2ad4898944a729cbd1fdde0782b8bc4d410e53fd2c22789f42d6e7e` |
| 2026-10-10 | Secure-your-account gate checks the current password first and keeps it when it is strong enough | `beced5d3e3890bc07c46f6a52ce4a3d674d66330db0617f7de7e824333f2affc` |
| 2026-10-10 | Link a new device from a computer with no camera: it shows the code and the new device scans it; a device that logged in by username keeps the account’s other logins | `1cde82386cadf1358e98a05eba4405a27252cb734e5e0b06f79cfea1386e6def` |
| 2026-10-10 | Linking a new device: a big Scan button on the new device, and the typing box tucked behind Can’t scan? on the computer | `6a675e1220f954635629b0ab844e096606677667d532b0710416625f7eb27cc7` |
| 2026-10-11 | Scanning to link a new device: full-HD camera and enlarged crops, a bigger code, move-closer guidance, and retries that survive a reload or a dropped connection without new codes | `38982f39bc73cd6b273478b0061f0465c3a9c030013eb7c8dafe29c76b05315c` |
| 2026-10-11 | Linking a new device finishes after a password change made on another device; Not me only says it blocked a login when it did; the new device no longer shows its own code; no alert pops over the code the computer shows | `e82073aaac936067cd2271713623f2e9c623480d1c25df512d64ce6a1f68ae14` |
| 2026-10-11 | Linking a new device when this device’s saved login is out of date: it asks for your password once and puts the saved login right for every device; Try again keeps the scan; a newer code replaces the old one; Start over on the new device; checks of an old or repeated password address no longer count as wrong guesses | `ab705bef6ff22aa203431bdcb5cf4dab0366171254da5b04ad0f425cf829e9e1` |
| 2026-10-11 | Three ways back in: a device where you’re logged in lets a new one in after asking Let it in or Not mine, with no password; the password works as before; with no device, the recovery words and then a new password. Every device is told when a device is added. A password change reaches every login. Emailed codes are gone | `2d32c5348c5f048d1d159757d29dbc0219bc1fa3f8f4fbdc11c82af3261f91e9` |
| 2026-10-11 | Chats stay in your list: the notes you write to yourself are never swept after 30 days, the newest of two notes for a chat is kept, and a chat leaves the list only when it was deleted or you were removed, never on a busy server or a restart; reconnects after a restart are spread out | `6da0107d33443cdec155d5e66f781146fb56c52c7b9d2b131804b8169ec77684` |

To check what you are served: `curl -s https://hushappofficial.com/ | sha256sum`, or save the page from the
browser and run `certutil -hashfile index.html SHA256` on Windows, then compare with the last line above.
