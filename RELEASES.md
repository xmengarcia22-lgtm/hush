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

To check what you are served: `curl -s https://hushappofficial.com/ | sha256sum`, or save the page from the
browser and run `certutil -hashfile index.html SHA256` on Windows, then compare with the last line above.
