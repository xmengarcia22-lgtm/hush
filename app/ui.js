/* Hush: the screens and everything that drives them. The last of the page's script files (config, crypto, adapter,
   ui): they share one global scope, exactly like the single script they were split from. The icons, the DOM
   helpers, the page state S, every screen and sheet, media display, the inbox watcher and the boot at the end. */
/* ---------- icons ---------- */
const I={
 menu:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
 search:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
 pencil:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>',
 back:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
 more:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',
 lock:'<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>',
 lockBig:'<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>',
 send:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.3 10l12.6 2-12.6 2z"/></svg>',
 one:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>',
 two:'<svg width="18" height="14" viewBox="0 0 30 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m3 12 4.5 4.5L17 7M13 16.5 23 7"/></svg>',
 clock:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
 x:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
 plus:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
 shield:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/></svg>',
 eye:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
 info:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
 mega:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 10v4h3l7 4V6L6 10H3z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" stroke-linecap="round"/></svg>',
 megaSm:'<svg class="mega-sm" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h3.5l7.5 4.5v-15L6.5 9H3z"/><path d="M17 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
 megaBig:'<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h3.5l7.5 4.5v-15L6.5 9H3z"/><path d="M17 8.5a4.5 4.5 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
 clip:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11.5 12.2 19.3a5 5 0 0 1-7-7l8.1-8.1a3.3 3.3 0 0 1 4.7 4.7l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.4-7.4"/></svg>',
 play:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
 xs:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
 globe:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18"/></svg>',
 lockMd:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
 link:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1"/><path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/></svg>',
 smile:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5v.5M15 9.5v.5"/></svg>',
 chart:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 20V11M12 20V4M18 20v-6"/></svg>',
 trash:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
 group:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/></svg>',
 groupSm:'<svg class="mega-sm" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="8" r="4"/><path d="M1.5 21a7.5 7.5 0 0 1 15 0z"/><path d="M16 4a4 4 0 0 1 0 8M18.5 14a7.5 7.5 0 0 1 4 7h-3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
 user:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
 reply:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 8 5 12.5l5 4.5"/><path d="M5 12.5h9a5 5 0 0 1 5 5V19"/></svg>',
 edit:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="m13.5 6.5 4 4"/></svg>',
 copy:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>',
 gear:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
 eyeSm:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
 phone:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M5 3h3.5l2 5-2.5 1.5a11 11 0 0 0 6.5 6.5L16 13.5l5 2V19a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
 userPlus:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M19 8v6M16 11h6"/></svg>',
 chatsIc:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/></svg>',
 contactsIc:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
 mic:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
 pause:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
 down:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
 pin:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 4 4H6l4-4z"/><path d="M12 14v7"/></svg>',
 pinSm:'<svg class="pin-sm" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 3h6l-1 6.5 4 4.5H6l4-4.5z"/><path d="M11 14h2v7h-2z"/></svg>',
 bell:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>',
 bellOff:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l2 2H8"/><path d="M10 21h4M3 3l18 18"/></svg>',
 mutedSm:'<svg class="mute-sm" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
 archive:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/></svg>',
 timer:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>',
 timerSm:'<svg class="timer-sm" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>',
 bookmark:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/></svg>',
 bookmarkBig:'<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4.5L5 21V4a1 1 0 0 1 1-1z"/></svg>',
 fwd:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8l5 4.5-5 4.5"/><path d="M19 12.5H10a5 5 0 0 0-5 5V19"/></svg>',
 fwdSm:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 7l5 5-5 5"/><path d="M19 12H10a5 5 0 0 0-5 5v2"/></svg>',
 fmt:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19 8.5 5h1L15 19M5 14h8"/><path d="M15.5 12.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM18.5 11v8"/></svg>',
 fB:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"/></svg>',
 fI:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4h8M6 20h8M15 4 9 20"/></svg>',
 fU:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/></svg>',
 fS:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12h16M16.5 7.5C16 5.5 14.2 4.5 12 4.5c-2.6 0-4.5 1.3-4.5 3.4 0 1.6 1 2.6 3 3.3M7.5 16.5c.5 2 2.3 3 4.7 3 2.7 0 4.5-1.3 4.5-3.4 0-.8-.3-1.5-.8-2.1"/></svg>',
 fCode:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
 fSpoiler:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1C3.5 7.9 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
 shieldSm:'<svg class="timer-sm" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z"/></svg>',
 eyeOff:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1C3.5 7.9 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
 comment:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M4 5h16v11H10l-5 4v-4H4z"/></svg>',
 image:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
 up:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>',
 peopleIc:'<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/></svg>',
 tick:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>',
 device:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M11 18h2"/></svg>',
 key:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4.5"/><path d="m11.2 11.8 8.8-8.8M16.5 6.5l2.5 2.5M14 9l2 2"/></svg>',
 sliders:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>'
};

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function html(tag,cls,h){const e=el(tag,cls);e.innerHTML=h;return e}
/* ===== HUSH STORE BEGIN ===== */
/* What this device keeps, and how (SPEC.md 12.2). Everything the page stores under `hush:` lives in one map in
   memory and reaches disk only as one AES-256-GCM blob, `hush:sealed`: account and device private keys, chat keys,
   invite secrets, logins and phone numbers, drafts, read marks, who was sent a note. The blob's key is the lock
   password (PBKDF2, 600k rounds) while a password lock is on; otherwise a device key this browser made once and
   keeps non-extractable in IndexedDB, so a copy of localStorage alone opens nothing (where IndexedDB is missing, the
   key sits next to the blob and the password lock is the real protection). Only the lock settings, the theme and
   the blob itself stay plain. Nothing is unsealed until the lock gate has passed; locking reloads the page, which
   drops every unsealed byte; logging an account out removes its entries, and the last one takes the device key.
   This block has no page dependencies beyond enc, dec, b64u and unb64u, so the server's tests lift it out. */
const PLAIN_KEYS=new Set(['hush:applock','hush:lockFails','hush:lockAfter','hush:theme','hush:sealed','hush:sealed:old','hush:devkey']);
const lsSecret=k=>typeof k==='string'&&k.startsWith('hush:')&&!PLAIN_KEYS.has(k);
const lockCfg=()=>{try{return JSON.parse(localStorage.getItem('hush:applock')||'null')}catch{return null}};
const lsPw=()=>{const c=lockCfg();return !!(c&&c.kind==='pw')};
let SECM=null,SECK=null,SECP={},secSave=Promise.resolve(),secDirty=false; // the unsealed map, its key, writes made before it opened, the save chain
const ls={get(k,d){if(lsSecret(k)){const m=SECM||SECP;return k in m?m[k]:d}try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},
  set(k,v){if(lsSecret(k)){const m=SECM||SECP;if(v==null)delete m[k];else m[k]=v;if(SECM)saveSecrets();return}try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v))}catch{}}};
async function lockKey(pw,salt){const b=await crypto.subtle.importKey('raw',enc.encode(pw.normalize('NFKC')),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},b,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function sealBlob(k,json){const iv=crypto.getRandomValues(new Uint8Array(12));
  return JSON.stringify({iv:b64u(iv),ct:b64u(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(json))))})}
async function unsealBlob(k,blob){const b=JSON.parse(blob);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(b.iv)},k,unb64u(b.ct))))}
function saveSecrets(){ // one write per burst of changes, always of the latest map, under the key of that moment
  if(secDirty)return secSave;secDirty=true;
  secSave=secSave.then(async()=>{secDirty=false;const k=SECK,m=SECM;if(!k||!m)return;localStorage.setItem('hush:sealed',await sealBlob(k,JSON.stringify(m)))}).catch(()=>{secDirty=false});
  return secSave}
async function deviceKey(){ // made once by this browser, kept non-extractable in IndexedDB; { key, fresh }
  const made=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']);
  if(typeof indexedDB==='undefined')throw new Error('noidb');
  return new Promise((res,rej)=>{let req;try{req=indexedDB.open('hush',1)}catch(e){rej(e);return}
    req.onupgradeneeded=()=>{req.result.createObjectStore('keys')};
    req.onerror=()=>rej(req.error||new Error('idb'));req.onblocked=()=>rej(new Error('blocked'));
    req.onsuccess=()=>{const db=req.result;let key=null,fresh=false;
      try{const tx=db.transaction('keys','readwrite'),st=tx.objectStore('keys'),g=st.get('device');
        g.onsuccess=()=>{if(g.result)key=g.result;else{key=made;fresh=true;st.put(made,'device')}};
        tx.oncomplete=()=>{db.close();key?res({key,fresh}):rej(new Error('nokey'))};
        tx.onerror=tx.onabort=()=>{db.close();rej(tx.error||new Error('idb'))}}
      catch(e){db.close();rej(e)}}})}
async function fallbackKey(){ // no IndexedDB here: the key sits next to the blob, and the password lock is the real protection
  let raw=null;try{const s=localStorage.getItem('hush:devkey');if(s)raw=unb64u(s)}catch{}
  const fresh=!raw;if(fresh){raw=crypto.getRandomValues(new Uint8Array(32));localStorage.setItem('hush:devkey',b64u(raw))}
  return {key:await crypto.subtle.importKey('raw',raw,{name:'AES-GCM'},false,['encrypt','decrypt']),fresh}}
// Opens the store with `key`, then moves any plain `hush:` entries (from before the sealed store, or an older page)
// into it, writing the blob before the plain copies go. `fresh` says the key was only just made, so a blob that will
// not open is from a key this browser lost: it is set aside under hush:sealed:old rather than left to block the page.
async function openStore(key,fresh){
  let m={},changed=false;const blob=localStorage.getItem('hush:sealed');
  if(blob){try{m=await unsealBlob(key,blob)}catch(e){if(!fresh)throw e;localStorage.setItem('hush:sealed:old',blob);changed=true}}else changed=true;
  const plain=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(lsSecret(k))plain.push(k)}
  for(const k of plain){if(!(k in m)){try{const v=JSON.parse(localStorage.getItem(k));if(v!=null){m[k]=v;changed=true}}catch{}}}
  for(const [k,v] of Object.entries(SECP)){if(v==null)delete m[k];else m[k]=v;changed=true}SECP={};
  SECK=key;SECM=m;
  if(changed)await saveSecrets();
  plain.forEach(k=>{try{localStorage.removeItem(k)}catch{}});
}
async function unlockStore(){ // after the lock gate: a password lock opened the store itself; otherwise the device key does
  if(SECM)return;let dk;try{dk=await deviceKey()}catch{dk=await fallbackKey()}
  await openStore(dk.key,dk.fresh)}
async function openSealed(pw){ // the password lock: the blob opens with the lock password or not at all
  const c=lockCfg(),blob=localStorage.getItem('hush:sealed');if(!c||!blob)throw new Error('nolock');
  const k=await lockKey(pw,unb64u(c.salt));await unsealBlob(k,blob); // a wrong password fails here, before anything changes
  await openStore(k,false)}
async function sealOn(pw){ // the lock password's key takes over from the device key, checked to open before the switch
  const salt=crypto.getRandomValues(new Uint8Array(16)),k=await lockKey(pw,salt);await secSave;
  const json=JSON.stringify(SECM),blob=await sealBlob(k,json);if(JSON.stringify(await unsealBlob(k,blob))!==json)throw new Error('seal');
  SECK=k;localStorage.setItem('hush:sealed',blob);localStorage.setItem('hush:applock',JSON.stringify({kind:'pw',salt:b64u(salt)}));ls.set('hush:lockFails',null)}
async function sealChange(cur,pw){const c=lockCfg(),old=await lockKey(cur,unb64u(c.salt));await unsealBlob(old,localStorage.getItem('hush:sealed'));
  await secSave;const salt=crypto.getRandomValues(new Uint8Array(16)),k=await lockKey(pw,salt);
  SECK=k;localStorage.setItem('hush:sealed',await sealBlob(k,JSON.stringify(SECM)));localStorage.setItem('hush:applock',JSON.stringify({kind:'pw',salt:b64u(salt)}))}
async function sealOff(cur){ // back to the device key; nothing is ever written out plain
  const c=lockCfg(),k=await lockKey(cur,unb64u(c.salt));await unsealBlob(k,localStorage.getItem('hush:sealed'));
  let dk;try{dk=await deviceKey()}catch{dk=await fallbackKey()}await secSave;
  SECK=dk.key;localStorage.setItem('hush:sealed',await sealBlob(dk.key,JSON.stringify(SECM)));localStorage.removeItem('hush:applock');ls.set('hush:lockFails',null)}
function forgetEntries(pred){ // drops every entry, sealed or plain, that `pred(key, value)` picks; returns how many
  let n=0;for(const m of [SECM,SECP])if(m)for(const k of Object.keys(m))if(pred(k,m[k])){delete m[k];n++}
  const gone=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(lsSecret(k)&&pred(k,null))gone.push(k)}
  gone.forEach(k=>{try{localStorage.removeItem(k)}catch{}});n+=gone.length;if(n&&SECM)saveSecrets();return n}
async function forgetDevice(){ // every account and key this device holds: the blob, the device key, the lock settings
  await secSave.catch(()=>{});
  for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith('hush:')&&k!=='hush:theme')try{localStorage.removeItem(k)}catch{}}
  SECM=null;SECK=null;SECP={};
  await new Promise(res=>{if(typeof indexedDB==='undefined'){res();return}try{const r=indexedDB.deleteDatabase('hush');r.onsuccess=r.onerror=r.onblocked=()=>res()}catch{res()}})}
// Another tab of this page wrote the blob: take its map, so this tab's next write carries both tabs' changes.
if(typeof addEventListener==='function')addEventListener('storage',e=>{if(e.key==='hush:sealed'&&e.newValue&&SECK&&!secDirty)unsealBlob(SECK,e.newValue).then(m=>{if(!secDirty)SECM=m}).catch(()=>{})});
/* ===== HUSH STORE END ===== */
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
const safePhoto=p=>typeof p==='string'&&p.length<250000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p)?p:null;
function avatar(key,name,cls='',photo){const a=el('div','avatar '+cls);const ph=safePhoto(photo);
  if(ph){const i=el('img');i.src=ph;i.alt='';a.append(i)}
  else{a.textContent=(name||key||'?').trim().charAt(0).toUpperCase();a.style.background=`hsl(${hue(key||'?')} 52% 52%)`}
  return a}
const userAvatar=(h,cls='')=>avatar(h,displayName(h),cls,S.dir[h]&&S.dir[h].photo);
const convAvatar=(c,cls='')=>isSelf(c)?html('div','avatar saved '+cls,I.bookmark):typeOf(c)==='dm'?userAvatar(dmPeer(c),cls):avatar(c.id,c.name,cls,c.photo);
const isOnline=h=>{const p=S.presence[h];return !!p&&!p.hidden&&Date.now()-p.ts<75000};
function lastSeen(h){
  const p=S.presence[h];if(!p||p.hidden||!p.ts)return 'last seen recently';
  const d=Date.now()-p.ts;if(d<75000)return 'online';
  if(d<3600e3)return `last seen ${Math.max(1,Math.round(d/60000))} min ago`;
  if(new Date(p.ts).toDateString()===new Date().toDateString())return 'last seen at '+fmtTime(p.ts);
  return 'last seen '+new Date(p.ts).toLocaleDateString([], {month:'short',day:'numeric'});
}
const fmtTime=ts=>new Date(ts).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
function fmtListTime(ts){const d=new Date(ts),n=new Date();if(d.toDateString()===n.toDateString())return fmtTime(ts);if(n-d<6*864e5)return d.toLocaleDateString([], {weekday:'short'});return d.toLocaleDateString([], {month:'short',day:'numeric'})}
function fmtDay(ts){const d=new Date(ts),n=new Date();if(d.toDateString()===n.toDateString())return 'Today';const y=new Date(n);y.setDate(n.getDate()-1);if(d.toDateString()===y.toDateString())return 'Yesterday';return d.toLocaleDateString([], {month:'long',day:'numeric'})}
let toastT;function toast(msg,action,fn){
  document.querySelectorAll('.toast').forEach(x=>x.remove());const t=el('div','toast');t.setAttribute('role','status');t.append(el('span',null,msg));
  if(action){const b=el('button','toast-act',action);b.onclick=()=>{t.remove();fn()};t.append(b)}
  document.body.append(t);clearTimeout(toastT);toastT=setTimeout(()=>t.remove(),action?5000:3200)}
const displayName=h=>(S.cnames&&S.cnames.get(h))||(S.dir[h]&&S.dir[h].name)||h;
// Usernames: the real one is lowercase (that's what's stored and searched, so XtremeGamer and xtremegamer are the same account).
// "disp" is how the owner chose to capitalize it. It's only ever shown if it's the same letters, so nobody can fake a different name.
const dispOk=(d,h)=>typeof d==='string'&&d.toLowerCase()===h;
function dispOf(h){if(!h)return h;const m=S.me&&S.me.handle===h&&S.me.disp,d=S.dir&&S.dir[h]&&S.dir[h].disp;return dispOk(m,h)?m:dispOk(d,h)?d:h}
const atOf=h=>'@'+dispOf(h);
/* ===== HUSH BADGES BEGIN ===== */
/* Badges after names (SPEC.md 12.3). Who has one is decided on the server (HUSH_BADGES) and arrives with the hello
   reply; the page never reads a badge from a profile, so nobody can give themselves one. This block depends only on
   `html`, so the server's tests lift it out. */
const BADGE_SVG={
  founder:'<svg viewBox="0 0 32 28"><path d="M4.5 21L3 8l6.5 6L16 5l6.5 9L29 8l-1.5 13Z" fill="#EF9F27" stroke="#633806" stroke-width="1.3" stroke-linejoin="round"/><path d="M16 11.5l2 3-2 3-2-3Z" fill="#E24B4A" stroke="#633806" stroke-width="0.8"/><circle cx="3" cy="7" r="2" fill="#FAC775" stroke="#633806" stroke-width="1"/><circle cx="16" cy="3.8" r="2.2" fill="#FAC775" stroke="#633806" stroke-width="1"/><circle cx="29" cy="7" r="2" fill="#FAC775" stroke="#633806" stroke-width="1"/><rect x="4" y="21" width="24" height="4.5" rx="1" fill="#BA7517" stroke="#633806" stroke-width="1.3"/><circle cx="10" cy="23.25" r="1.2" fill="#1D9E75"/><circle cx="16" cy="23.25" r="1.5" fill="#378ADD"/><circle cx="22" cy="23.25" r="1.2" fill="#1D9E75"/></svg>',
  verified:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="11" fill="#378ADD"/><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'};
const BADGE_LABEL={founder:'Founder',verified:'Verified'};
function badgeOf(h,badges){const b=badges||(typeof S!=='undefined'&&S.badges)||{};const k=String(h||'').toLowerCase();return Object.prototype.hasOwnProperty.call(b,k)&&Object.prototype.hasOwnProperty.call(BADGE_SVG,b[k])?b[k]:null}
function badgeNode(h,badges){const k=badgeOf(h,badges);if(!k)return null;const s=html('span','ubadge ubadge-'+k,BADGE_SVG[k]);s.setAttribute('role','img');s.setAttribute('aria-label',BADGE_LABEL[k]);s.title=BADGE_LABEL[k];return s}
const withBadge=(node,h,badges)=>{const b=badgeNode(h,badges);if(b)node.append(b);return node};
/* ===== HUSH BADGES END ===== */

/* ---------- state ---------- */
const S={db:null,ids:ls.get('hush:ids',[]),me:null,dir:{},dirReady:false,presence:{},convs:[],previews:new Map(),chan:null,posts:[],dmPeers:{},chatDocs:new Map(),
  reads:{},typing:{},agg:new Map(),unsubs:[],unsubConvs:null,serverView:false,cache:new Map(),keys:new Map(),chanKeys:new Map(),media:new Map(),
  rendered:null,stick:true,query:'',replyTo:null,editing:null,comp:null,seenLast:new Map(),convsLoaded:false,
  unread:new Map(),unreadKey:new Map(),readWritten:new Map(),pendingJoin:null,mentions:new Map(),ccount:new Map(),comments:[],scheduled:[],future:[],older:[],flushDraft:null,pins:{},verified:{},warned:new Set(),warnShown:false,mediaBlobs:new Map(),prefs:null,showArchived:false,rawPosts:[],purged:new Set(),recCancel:null,audio:null,newBelow:0,contacts:[],contactsReady:false,cnames:new Map(),tab:'chats',badges:{}};
function applyTheme(){const t=ls.get('hush:theme','system');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme}
applyTheme();

/* ===== HUSH NAV HISTORY BEGIN ===== */
/* The browser's Back (Android's Back button, Safari's swipe from the edge) closes what is open in Hush instead of
   leaving the site. Everything that can be closed (a chat, a sheet, the side menu, the photo viewer, a settings page,
   the archive, a tab other than Chats) is a layer on a stack. While any layer is open, one extra history entry, the
   guard, sits on top of the page's own; Back uses it up and closes the top layer, and the guard is put back if more
   are open. When the app closes its last layer itself (the X, a swipe, Escape, a Back button), the guard is quietly
   taken off again, so history never fills up. The address shown never changes. */
function makeNavHistory(h,defer){ // h: {state, pushState(state), back()}; defer(fn): run fn a moment later
  const stack=[];let guard=!!(h.state&&h.state.hushGuard),pending=false,ignore=0;
  const prune=()=>{while(stack.length&&stack[stack.length-1].alive&&!stack[stack.length-1].alive())stack.pop()}; // closed some other way
  const arm=()=>{if(!guard){h.pushState({hushGuard:1});guard=true}};
  const open=l=>{if(!stack.includes(l))stack.push(l);pending=false;arm();return l};
  const settle=()=>{prune();if(stack.length||!guard||pending)return;pending=true;
    defer(()=>{if(!pending)return;pending=false;if(stack.length||!guard)return;guard=false;ignore++;h.back()})};
  const closed=l=>{const i=stack.indexOf(l);if(i<0)return;stack.splice(i,1);settle()};
  const pop=()=>{ // the browser went back
    if(ignore>0){ignore--;return} // our own step back after the app closed its last layer
    guard=false;prune();const top=stack[stack.length-1];
    if(top&&top.stay){arm();return} // a sheet that must be answered stays
    if(top){stack.pop();top.close()}
    prune();if(stack.length)arm()};
  return {open,closed,pop,get depth(){return stack.length},get guarded(){return guard}};
}
/* ===== HUSH NAV HISTORY END ===== */
const NAV=makeNavHistory({get state(){return history.state},pushState:s=>history.pushState(s,''),back:()=>history.back()},fn=>setTimeout(fn,0));
addEventListener('popstate',()=>NAV.pop());
let navList=null; // the list's own layer: a settings page, the archive or a tab other than Chats
function navSyncList(){
  const want=!!S.me&&(S.tab!=='chats'||!!S.showArchived);
  if(want&&!navList){const l={kind:'list',alive:()=>navList===l,close:()=>{navList=null;listBack()}};navList=NAV.open(l)}
  else if(!want&&navList){const l=navList;navList=null;NAV.closed(l)}
}
function listBack(){ // one step back on the list: a settings page or the archive first, then to Chats
  if((S.tab==='profile'&&isSettingsPage())||(S.tab==='chats'&&S.showArchived))swipeBack();else setTab('chats',-1)}
/* ---------- list pane ---------- */
$('#menuBtn').innerHTML=I.menu;$('#tabChatsIc').innerHTML=I.chatsIc;$('#tabContactsIc').innerHTML=I.peopleIc;$('#tabProfileIc').innerHTML=I.contactsIc;$('#searchIc').innerHTML=I.search;$('#newBtn').innerHTML=I.pencil;
$('#menuBtn').onclick=openDrawer;$('#newBtn').onclick=()=>S.tab==='contacts'?openEditContact(null):openNewChat();
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{const d=TABS.indexOf(b.dataset.tab)-TABS.indexOf(S.tab);if(d)setTab(b.dataset.tab,Math.sign(d));else if(b.dataset.tab==='profile'&&isSettingsPage()){S.profilePage='main';setTab('profile')}else if(b.dataset.tab==='chats'&&S.showArchived){S.showArchived=false;setListTitle();renderList()}});
$('#q').oninput=e=>{S.query=e.target.value.trim().toLowerCase();S.tab==='contacts'?renderContacts():renderList()};

const lastRead=k=>ls.get(`hush:read:${S.me.handle}:${k}`,0);
function markRead(){
  const c=curConv();if(!c||!S.posts.length||document.hidden)return;
  const ts=S.posts[S.posts.length-1].ts;
  if(ts>lastRead(c.id))ls.set(`hush:read:${S.me.handle}:${c.id}`,ts);
  S.unread.set(c.id,0);updateTitle();
  if(S.db&&isMember(c)&&!isRequest(c)&&(S.readWritten.get(c.id)||0)<ts){S.readWritten.set(c.id,ts);writeSeen(c,ts)}
}
async function writeSeen(c,ts){ // "read up to here", filed under a tag only the people in this chat can work out
  try{const e=epochOf(c),t=await memTag(c,e,S.me.handle);if(!t)return;
    await S.db.doc(`channels/${c.id}/reads/${e}~${t}`).set({ts,sg:await sideSig('hush-seen-v1',[c.id,t,ts])});
    S.db.doc(`channels/${c.id}/reads/${S.me.handle}`).delete().catch(()=>{}); // tidy away the old named mark
  }catch{}}
const typeOf=c=>(c&&c.type)||'channel';
const dmPeer=c=>(c.members||[]).find(h=>h!==S.me.handle)||S.dmPeers[c.id]||S.me.handle;
const isSelf=c=>typeOf(c)==='dm'&&dmPeer(c)===S.me.handle;
const convTitle=c=>typeOf(c)==='dm'?(isSelf(c)?'Saved Messages':displayName(dmPeer(c))):c.name;
const titleNode=(tag,cls,c)=>{const n=el(tag,cls,convTitle(c));if(typeOf(c)==='dm'&&!isSelf(c))withBadge(n,dmPeer(c));return n}; // a chat's title, with the person's badge when the chat is a person
const convById=id=>S.convs.find(c=>c.id===id)||S.previews.get(id);
const curConv=()=>S.chan?convById(S.chan):null;
const isMember=c=>!!c&&(c.members||[]).includes(S.me.handle);
const isOwner=c=>!!c&&c.owner===S.me.handle;
const isAdminH=(c,h)=>!!c&&(c.owner===h||(c.admins||[]).includes(h));
const isAdmin=c=>!!(c&&S.me)&&isAdminH(c,S.me.handle);
const canPost=c=>isMember(c)&&(typeOf(c)!=='channel'||isAdmin(c));
const canPin=c=>isMember(c)&&(typeOf(c)==='dm'||isAdmin(c));
const mentionsMe=t=>!!(t&&S.me&&new RegExp('(^|[^\\p{L}\\p{N}_@])@'+S.me.handle+'(?![\\p{L}\\p{N}_])','iu').test(t));
const draftKey=cid=>`hush:draft:${S.me.handle}:${cid}`;
function fmtWhen(ts){const d=new Date(ts),n=new Date(),tm=fmtTime(ts);if(d.toDateString()===n.toDateString())return 'today at '+tm;
  const t=new Date(n);t.setDate(n.getDate()+1);if(d.toDateString()===t.toDateString())return 'tomorrow at '+tm;return d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})+' at '+tm}
const memberText=c=>{const n=(c.members||[]).length;return n===1?'1 member':n+' members'};
const subsText=c=>{const n=(c.members||[]).length;return n===1?'1 subscriber':n+' subscribers'};

let listSeq=0;
async function renderList(){
  const seq=++listSeq,box=$('#threads');updateStatus();
  if(!S.me){box.replaceChildren();return}
  if(S.db&&!S.convsLoaded&&!S.convs.length){box.replaceChildren(...Array.from({length:6},()=>{const r=el('div','thread skel');r.append(el('div','avatar'),el('div','t-main'));r.lastChild.append(el('div','sk1'),el('div','sk2'));return r}));return}
  const arch=S.showArchived,base=S.convs.filter(c=>(c.last||typeOf(c)!=='dm')&&!isRequest(c)&&!hiddenConv(c)),archived=base.filter(c=>isArchived(c.id));
  const pins=P().pinned;
  const items=(arch?archived:S.query?base:base.filter(c=>!isArchived(c.id)))
    .filter(c=>!S.query||(convTitle(c)+' '+(typeOf(c)==='dm'?dmPeer(c):'')).toLowerCase().includes(S.query.replace(/^@/,'')))
    .sort((a,b)=>{const pa=arch?-1:pins.indexOf(a.id),pb=arch?-1:pins.indexOf(b.id);if(pa>=0||pb>=0)return (pa<0?1e9:pa)-(pb<0?1e9:pb);return (b.ts||0)-(a.ts||0)});
  const pvs=await Promise.all(items.map(c=>c.last?openPost(c,c.last):null));
  if(seq!==listSeq)return;
  box.replaceChildren();
  const reqs=arch?[]:pendingRequests();
  if(reqs.length&&!S.query){const r=el('button','thread req-row');const m=el('div','t-main'),top=el('div','t-row'),bot=el('div','t-row');
    top.append(el('span','t-name','Message requests'));bot.append(el('span','t-sub',reqs.slice(0,3).map(c=>displayName(dmPeer(c))).join(', ')+' want'+(reqs.length===1?'s':'')+' to message you'),el('span','unread',String(reqs.length)));
    m.append(top,bot);r.append(html('div','avatar req-av','\u2709\ufe0f'),m);r.onclick=openRequests;box.append(r)}
  if(arch){const h=html('button','arch-head',I.back+'<span>Archived chats</span>');h.onclick=()=>{S.showArchived=false;setListTitle();renderList()};box.append(h)}
  else if(!S.query&&archived.length){
    const r=el('button','thread arch-row');const m=el('div','t-main'),top=el('div','t-row'),bot=el('div','t-row');
    top.append(el('span','t-name','Archived chats'));bot.append(el('span','t-sub',archived.slice(0,4).map(convTitle).join(', ')));
    const n=archived.reduce((a,c)=>a+(S.unread.get(c.id)||0),0);if(n)bot.append(el('span','unread muted',n>99?'99+':String(n)));
    m.append(top,bot);r.append(html('div','avatar arch-av',I.archive),m);r.onclick=()=>{S.showArchived=true;setListTitle();renderList()};box.append(r)}
  if(!items.length&&!S.query){
    if(reqs.length)return;
    const e=el('div','empty');
    if(S.query)e.append(el('strong',null,'No chats found'),el('span',null,'Try a different name or username.'));
    else if(arch)e.append(el('strong',null,'No archived chats'),el('span',null,'Press and hold a chat, then choose Archive.'));
    else e.append(el('strong',null,'No chats yet'),el('span',null,'Tap the pencil to message someone, start a group, or create a channel. Everything is encrypted on this device before it leaves.'));
    box.append(e);return;
  }
  const now=Date.now();
  if(S.query&&items.length)box.append(el('div','menu-label','Chats'));
  items.forEach((c,i)=>{
    const t=typeOf(c),b=el('button','thread'+(c.id===S.chan?' active':''));
    const main=el('div','t-main'),top=el('div','t-row'),bot=el('div','t-row');
    const nm=el('span','t-name');
    if(t==='channel')nm.insertAdjacentHTML('afterbegin',I.megaSm);
    if(t==='group')nm.insertAdjacentHTML('afterbegin',I.groupSm);
    nm.append(convTitle(c));if(t==='dm'&&!isSelf(c))withBadge(nm,dmPeer(c));if(isMuted(c.id))nm.insertAdjacentHTML('beforeend',I.mutedSm);
    top.append(nm,el('span','t-time',c.last?fmtListTime(c.last.ts):''));
    const l=c.last,mine=l&&l.from===S.me.handle;let sub;
    if(!l)sub=t==='group'?memberText(c):subsText(c);
    else if(t==='dm'&&!isSelf(c)&&keyChanged(dmPeer(c)))sub='\u26a0\ufe0f Security code changed';
    else if(l.exp&&l.exp<=now)sub='Message disappeared';
    else if(hiddenPost(l,pvs[i]))sub='New message';
    else if(!mine&&isBlocked(l.from))sub='Message from someone you blocked';
    else{const txt=previewText(pvs[i]);sub=t==='channel'||isSelf(c)?txt:t==='group'?(mine?'You':displayName(l.from))+': '+txt:(mine?'You: ':'')+txt}
    const dr=c.id!==S.chan&&ls.get(draftKey(c.id),'');
    if(dr){const se=el('span','t-sub');se.append(el('span','draft','Draft: '),plainText(dr));bot.append(se)}else bot.append(el('span','t-sub',sub));
    if((S.mentions.get(c.id)||0)&&c.id!==S.chan)bot.append(el('span','unread at','@'));
    const n=S.unread.get(c.id)||0;
    if(n&&c.id!==S.chan)bot.append(el('span','unread'+(isMuted(c.id)?' muted':''),n>99?'99+':String(n)));
    else if(!arch&&isPinned(c.id))bot.insertAdjacentHTML('beforeend',I.pinSm);
    main.append(top,bot);
    const av=convAvatar(c);
    if(t==='dm'&&!isSelf(c)&&isOnline(dmPeer(c))){const w=el('div','av-wrap');w.append(av,el('span','on-dot'));b.append(w)}else b.append(av);
    b.append(main);
    b.onclick=()=>{if(b._noClick&&Date.now()-b._noClick<600)return;openConv(c.id)};
    addLongPress(b,()=>chatMenu(b,c));
    box.append(b);
  });
  if(S.query)searchExtras(box,items);
}
/* ---------- one search box: chats, messages and people ----------
   Messages are searched from what this device has already unlocked (every chat's latest message, plus chats you've opened).
   That index lives only in memory: it's never saved, sent anywhere, and it's gone when the app closes. */
const snipAt=(t,q)=>{t=String(t).replace(/\s+/g,' ');const i=t.toLowerCase().indexOf(q);return i>30?'\u2026'+t.slice(i-25):t};
function indexMsg(key,c,p,text){
  const idx=S.msgIdx||(S.msgIdx=new Map()),pid=p._id||null;
  if(pid)for(const [k,m] of idx)if(k!==key&&m.pid===pid&&m.cid===c.id)idx.delete(k);
  idx.set(key,{cid:c.id,pid,ts:p.ts||0,exp:p.exp||0,from:p.from,text:plainText(text)});
}
function pruneIdx(cid,posts,all){ // forget deleted messages so they stop showing up in search
  if(!S.msgIdx||!posts)return;const ids=new Set(posts.map(p=>p._id)),min=all?0:posts.length?Math.min(...posts.map(p=>p.ts||0)):Infinity;
  for(const [k,m] of S.msgIdx)if(m.cid===cid&&m.pid&&!ids.has(m.pid)&&m.ts>=min)S.msgIdx.delete(k);
}
function openAtMsg(cid,pid){
  openConv(cid);if(!pid)return;let n=0;
  const t=setInterval(()=>{if(S.chan!==cid||++n>30){clearInterval(t);return}
    if(S.rendered&&S.rendered.nodes.get(pid)){clearInterval(t);jumpTo(pid)}},150);
}
function peopleLook(q){if(!S._pl)S._pl=liveSearch({get value(){return S.query||''}},()=>{if(S.tab==='chats'&&S.query)renderList()});S._pl(q)}
function searchExtras(box,items){
  const q=S.query.replace(/^@/,'');if(!q)return;
  const now=Date.now(),pre='p:'+S.me.handle+':';
  const hits=[...(S.msgIdx||new Map()).entries()]
    .filter(([k,m])=>k.startsWith(pre)&&!(m.exp&&m.exp<=now)&&m.text&&m.text.toLowerCase().includes(q)&&convById(m.cid)&&!isRequest(convById(m.cid)))
    .map(([,m])=>m).sort((a,b)=>b.ts-a.ts).slice(0,40);
  if(hits.length){box.append(el('div','menu-label','Messages'));
    hits.forEach(m=>{const c=convById(m.cid),t=typeOf(c),b=el('button','thread'),main=el('div','t-main'),top=el('div','t-row'),bot=el('div','t-row');
      top.append(titleNode('span','t-name',c),el('span','t-time',m.ts?fmtListTime(m.ts):''));
      const who=t==='channel'||isSelf(c)?'':m.from===S.me.handle?'You: ':t==='group'?displayName(m.from)+': ':'';
      bot.append(el('span','t-sub',who+snipAt(m.text,q)));main.append(top,bot);b.append(convAvatar(c,'sm'),main);
      b.onclick=()=>openAtMsg(c.id,m.pid);box.append(b)})}
  const shown=new Set(items.filter(c=>typeOf(c)==='dm').map(dmPeer));
  const ppl=q.length<2?[]:peopleIn(q,[S.me.handle]).filter(d=>!shown.has(d.handle)).slice(0,30);
  if(ppl.length){box.append(el('div','menu-label','People'));
    ppl.forEach(d=>{const b=personRow(Object.assign({},d,{name:displayName(d.handle)}));
      if(d.requests===true&&!knownHandle(d.handle))b.querySelector('.t-sub').append(' \u00b7 sends as a request');
      b.onclick=()=>openDm(d.handle);box.append(b)})}
  if(!items.length&&!hits.length&&!ppl.length){const e=el('div','empty');
    e.append(el('strong',null,'Nothing found'),el('span',null,q.length<2?'Keep typing to search people by name or username.':'No chats, messages or people match that.'));box.append(e)}
  peopleLook(q);
}
function updateStatus(){const st=$('#netStatus');if(st)st.textContent=!S.db?'Offline':S.me&&!S.convsLoaded?'Connecting\u2026':''}
function setListTitle(){const t=$('#listTitle');if(t)t.textContent=S.tab==='contacts'?'Contacts':S.tab==='profile'?'Profile':S.showArchived?'Archived':'Chats';navSyncList()}
function updateTitle(){let n=0;S.unread.forEach((v,k)=>{const c=convById(k);if(k!==S.chan&&!isMuted(k)&&!isArchived(k)&&!(c&&isRequest(c))&&!hiddenConv(c))n+=v});if(S.me)n+=pendingRequests().length;
  document.title=n?`(${n>99?'99+':n}) Hush`:'Hush';const t=$('#tabN');if(t){t.hidden=!n;t.textContent=n>99?'99+':String(n)}}
/* ---------- chat organization: pins, mutes and archive live in your encrypted vault ---------- */
const P=()=>S.prefs||(S.prefs={pinned:[],muted:{},archived:[]});
const isPinned=id=>P().pinned.includes(id),isMuted=id=>!!P().muted[id],isArchived=id=>P().archived.includes(id);
function prefsOk(){if(!S.contactsReady){toast('Still loading your settings. Try again in a moment.');return false}return true}
function togglePin(id){if(!prefsOk())return;const p=P();p.pinned=isPinned(id)?p.pinned.filter(x=>x!==id):[id,...p.pinned];if(isPinned(id))p.archived=p.archived.filter(x=>x!==id);saveContacts()}
function toggleMute(id){if(!prefsOk())return;const p=P();if(p.muted[id])delete p.muted[id];else p.muted[id]=true;saveContacts();updateTitle();toast(isMuted(id)?'Muted. You won\u2019t get alerts from this chat.':'Unmuted')}
function toggleArchive(id,on,quiet){if(!prefsOk())return;const p=P();p.archived=p.archived.filter(x=>x!==id);
  if(on){p.archived.push(id);p.pinned=p.pinned.filter(x=>x!==id)}saveContacts();updateTitle();
  if(!quiet)toast(on?'Chat archived':'Chat moved back to Chats','Undo',()=>toggleArchive(id,!on,true))}
function markConvRead(c){const l=c.last;if(!l)return;ls.set(`hush:read:${S.me.handle}:${c.id}`,l.ts);S.unread.set(c.id,0);updateTitle();renderList();
  if(S.db&&isMember(c))writeSeen(c,l.ts)}
function placeMenu(m,anchor){
  document.body.append(m);const r=anchor.getBoundingClientRect(),mw=m.offsetWidth,mh=m.offsetHeight,vw=innerWidth,vh=innerHeight;
  let top=r.bottom+6;if(top+mh>vh-10)top=Math.max(10,r.top-mh-6);
  let left=r.right>vw/2?r.right-mw:r.left;left=Math.min(Math.max(8,left),vw-mw-8);
  m.style.top=top+'px';m.style.left=left+'px';
  setTimeout(()=>document.addEventListener('click',function h(e){if(!m.contains(e.target)){m.remove();document.removeEventListener('click',h)}}),0);
}
function chatMenu(anchor,c){
  closeMenus();const id=c.id,m=el('div','popmenu msgmenu');
  const items=[[isPinned(id)?I.pin:I.pin,isPinned(id)?'Unpin':'Pin to top',()=>togglePin(id)],
    [isMuted(id)?I.bell:I.bellOff,isMuted(id)?'Unmute':'Mute',()=>toggleMute(id)],
    [I.archive,isArchived(id)?'Unarchive':'Archive',()=>toggleArchive(id,!isArchived(id))]];
  if(S.unread.get(id))items.push([I.tick,'Mark as read',()=>markConvRead(c)]);
  items.forEach(([ic,label,fn])=>{const b=html('button','menu-item',ic);b.append(el('span',null,label));b.onclick=()=>{m.remove();fn()};m.append(b)});
  placeMenu(m,anchor);
}
function addLongPress(node,fn){
  let t=null,x=0,y=0;const clr=()=>{if(t){clearTimeout(t);t=null}};
  node.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;x=e.touches[0].clientX;y=e.touches[0].clientY;clr();
    t=setTimeout(()=>{t=null;node._noClick=Date.now();if(navigator.vibrate)navigator.vibrate(10);fn()},480)},{passive:true});
  node.addEventListener('touchmove',e=>{if(Math.abs(e.touches[0].clientX-x)>8||Math.abs(e.touches[0].clientY-y)>8)clr()},{passive:true});
  node.addEventListener('touchend',clr);node.addEventListener('touchcancel',clr);
  node.addEventListener('contextmenu',e=>{e.preventDefault();clr();fn()});
}
function addSwipe(node,{dir,max=80,threshold=55,on,target,when}){
  let x0=0,y0=0,dx=0,active=false,lock=null;const tg=target||node;
  node.addEventListener('touchstart',e=>{if(e.touches.length!==1||(when&&!when(e)))return;x0=e.touches[0].clientX;y0=e.touches[0].clientY;dx=0;active=true;lock=null;tg.style.transition='none'},{passive:true});
  node.addEventListener('touchmove',e=>{if(!active)return;const mx=e.touches[0].clientX-x0,my=e.touches[0].clientY-y0;
    if(lock===null){if(Math.abs(mx)<10&&Math.abs(my)<10)return;lock=Math.abs(mx)>Math.abs(my)*1.5&&Math.sign(mx)===dir?'x':'y';if(lock==='x')node._noClick=Date.now()}
    if(lock!=='x')return;dx=Math.max(0,Math.min(max,mx*dir));tg.style.transform=`translateX(${dx*dir}px)`;tg.classList.toggle('swipe-ready',dx>=threshold)},{passive:true});
  const end=()=>{if(!active)return;active=false;tg.style.transition='transform .2s ease';tg.style.transform='';tg.classList.remove('swipe-ready');
    if(lock==='x'){node._noClick=Date.now();if(dx>=threshold){if(navigator.vibrate)navigator.vibrate(8);on()}}};
  node.addEventListener('touchend',end);node.addEventListener('touchcancel',end);
}
/* ---------- saved messages, forwarding, disappearing messages ---------- */
function ensureDmPreview(h){ // the DM address if this device has worked it out already (loadDir does that for everyone it loads)
  const id=dmIds.get(h);if(!id){dmIdFor(h).catch(()=>{});return null}
  if(!convById(id))S.previews.set(id,{id,type:'dm',members:h===S.me.handle?[h]:[...new Set([S.me.handle,h])],ts:0,last:null,epoch:0});return id}
function openSaved(){openDm(S.me.handle)}
function openForward(p,o){
  const src=curConv();if(!src)return;
  const {body,close}=sheet('Forward to\u2026');
  const {s,inp}=searchBox('Search chats and contacts');const list=el('div');body.append(s,list);
  const draw=()=>{const q=inp.value.trim().toLowerCase();list.replaceChildren();const me=S.me.handle;
    const tgs=[{title:'Saved Messages',av:()=>html('div','avatar sm saved',I.bookmark),id:()=>ensureDmPreview(me)}];
    S.convs.filter(c=>canPost(c)&&!isSelf(c)).sort((a,b)=>(b.ts||0)-(a.ts||0)).forEach(c=>tgs.push({title:convTitle(c),h:typeOf(c)==='dm'?dmPeer(c):'',av:()=>convAvatar(c,'sm'),id:()=>c.id}));
    (S.contacts||[]).filter(ct=>ct.handle&&S.dir[ct.handle]&&!S.convs.some(c=>c.id===dmIds.get(ct.handle))).forEach(ct=>tgs.push({title:ct.name,h:ct.handle,av:()=>userAvatar(ct.handle,'sm'),id:()=>ensureDmPreview(ct.handle)}));
    tgs.filter(t=>!q||t.title.toLowerCase().includes(q)).forEach(t=>{const b=el('button','thread');const m=el('div','t-main');m.append(withBadge(el('div','t-name',t.title),t.h||''));
      b.append(t.av(),m);b.onclick=()=>{close();const id=t.id();if(!id){toast('That chat isn’t ready yet. Try again in a moment.');return}forwardTo(id,p,o,src,t.title)};list.append(b)});
    if(!list.children.length)list.append(el('div','empty','No matches.'));
  };
  inp.oninput=draw;draw();
}
async function forwardTo(tid,p,o,src,title){
  toast('Forwarding\u2026');
  try{const target=convById(tid),media=[],exp=mediaExp(target);
    for(const m of o.media||[]){
      if(m.v===2){ // the server copies the encrypted pieces to a new id; the sealed descriptor (and its key) comes along
        await ensureDmDoc(target);await ensureDmEpoch(target);const mid='m'+rid();
        await S.db.copyMedia(src.id,m.id,target.id,mid,exp);media.push(Object.assign({},m,{id:mid}));continue}
      await loadMedia(src,m,p.e??0); // sent before stage 6, under the old chat's key: encrypt it afresh
      media.push(await uploadMedia(target,{kind:m.kind,mime:m.mime,src:S.mediaBlobs.get(m.id),w:m.w,h:m.h,dur:m.dur,wave:m.wave,name:m.name},()=>{},exp))}
    const fwd=o.fwd||(typeOf(src)==='channel'?{name:src.name}:{name:(S.dir[p.from]&&S.dir[p.from].name)||p.from});
    await sendBody(tid,buildBody({text:o.text,media,fwd}));
    toast('Forwarded to '+title,'Open',()=>openConv(tid));
  }catch{toast('Couldn\u2019t forward that. Check your connection and try again.')}
}
const TTLS=[[0,'Off'],[300,'5 minutes'],[3600,'1 hour'],[86400,'1 day'],[604800,'1 week']];
const ttlLabel=v=>(TTLS.find(x=>x[0]===v)||[0,Math.round(v/60)+' minutes'])[1];
function openTtl(cid){
  const c=convById(cid);if(!c)return;
  const {body,close}=sheet('Disappearing messages');
  body.append(el('p',null,'New messages in this chat delete themselves for everyone after the time you choose. Messages already sent aren\u2019t affected.'));
  TTLS.forEach(([v,l])=>{const b=el('button','menu-item flush opt');b.append(el('span',null,l));
    if((c.ttl||0)===v)b.insertAdjacentHTML('beforeend',`<span class="check">${I.tick}</span>`);
    b.onclick=async()=>{close();if((c.ttl||0)===v)return;
      try{await ensureDmDoc(c);await S.db.doc('channels/'+cid).update({ttl:v});
        await S.db.collection(`channels/${cid}/posts`).add(await sealSvc(c,'ttl',v));
        toast(v?'New messages will disappear after '+l.toLowerCase():'Disappearing messages are off')}
      catch{toast('That didn\u2019t go through. Check your connection and try again.')}};
    body.append(b)});
  body.append(el('p','hint','People can still take a screenshot or copy a message before it disappears.'));
}
function allPosts(){const m=new Map();(S.older||[]).forEach(p=>m.set(p._id,p));(S.rawPosts||[]).forEach(p=>m.set(p._id,p));return [...m.values()].filter(p=>!p.del).sort((a,b)=>a.ts-b.ts)}
function applyExpiry(){
  const now=Date.now(),c=curConv(),live=[],dead=[],sched=[],future=[];
  allPosts().forEach(p=>{if(p._hide||(p.from&&p.from!==S.me.handle&&isBlocked(p.from)))return;/* someone I blocked: not shown */if(p.exp&&p.exp<=now)dead.push(p);else if(p.ts>now+3000){future.push(p);if(p.from===S.me.handle&&!p.svc)sched.push(p)}else live.push(p)});
  S.posts=live;S.scheduled=sched;S.future=future;if(S.setSchedCount)S.setSchedCount(sched.length);
  if(c&&isMember(c)){dead.forEach(p=>{if(S.purged.has(p._id))return;S.purged.add(p._id);purgePost(c,p)});promoteLast(c,live)}
}
function promoteLast(c,live){ // a scheduled message becomes the chat's latest once its time arrives
  const l=[...live].reverse().find(x=>!x.svc),cur=convById(c.id);if(!l||!cur||!S.convs.some(x=>x.id===c.id))return;
  if(cur.last&&l.ts<=cur.last.ts)return;if(S.promoting===l._id)return;S.promoting=l._id;
  S.db.doc('channels/'+c.id).update(lastUpd(c,{ts:l.ts,last:lastOf(l)})).catch(()=>{});
}
async function loadOlder(){
  const c=curConv();if(!c||!S.db||S.loadingOlder||S.allLoaded)return;const oldest=allPosts()[0];if(!oldest){S.allLoaded=true;return}
  S.loadingOlder=true;const chip=document.querySelector('.older-chip');if(chip)chip.textContent='Loading earlier messages\u2026';
  try{const s=await S.db.collection(`channels/${c.id}/posts`).where('ts','<',oldest.ts).orderBy('ts','desc').limit(200).get();
    if(S.chan!==c.id)return;const docs=await unsealAll(c,s.docs.map(d=>Object.assign({_id:d.id},d.data())));if(S.chan!==c.id)return;if(docs.length<200)S.allLoaded=true;
    const box=$('#msgs');if(box)S.keepScroll={h:box.scrollHeight,top:box.scrollTop};
    S.older=[...docs.reverse(),...(S.older||[])];applyExpiry();await renderConv();
  }catch{toast('Couldn\u2019t load earlier messages. Check your connection.')}
  S.loadingOlder=false;
}
async function purgePost(c,p){ // whoever sees an expired message first deletes it, including its encrypted files
  try{const o=await openPost(c,p);
    for(const m of o.media||[])await S.db.deleteMedia(c.id,m.id);
    await S.db.doc(`channels/${c.id}/posts/${p._id}`).delete();
    const cur=convById(c.id);if(cur&&cur.last&&cur.last.sig===p.sig){const l=[...S.posts].reverse().find(x=>!x.svc);
      await S.db.doc('channels/'+c.id).update(lastUpd(c,{last:l?lastOf(l):null}))}
  }catch{}
}
async function computeUnread(){
  if(!S.db||!S.me)return;const now=Date.now();
  await Promise.all(S.convs.map(async c=>{
    const lr=lastRead(c.id),l=c.last;
    if(!l||l.from===S.me.handle||l.ts<=lr||c.id===S.chan){S.unread.set(c.id,0);S.mentions.set(c.id,0);return}
    const k=c.id+':'+l.ts+':'+lr;if(S.unreadKey.get(c.id)===k)return;S.unreadKey.set(c.id,k);
    try{const s=await S.db.collection(`channels/${c.id}/posts`).where('ts','>',lr).limit(100).get();
      const ds=(await unsealAll(c,s.docs.map(d=>Object.assign({_id:d.id},d.data())))).filter(d=>d.from!==S.me.handle&&!d.svc&&!d.del&&d.ts<=now+3000&&!(d.exp&&d.exp<=now));
      S.unread.set(c.id,ds.length);let men=0;
      if(typeOf(c)==='group')for(const d of ds){const o=await openPost(c,d);if(o.text&&mentionsMe(o.text))men++}
      S.mentions.set(c.id,men)}catch{S.unread.set(c.id,1)}
  }));
  renderList();updateTitle();
}
async function notifyNew(c){
  if(hiddenConv(c))return;
  const pv=await openPost(c,c.last);if(pv.text==null||hiddenPost(c.last,pv)||isBlocked(c.last.from||pv.from))return;
  const men=typeOf(c)==='group'&&mentionsMe(pv.text);if(isMuted(c.id)&&!men)return;
  document.querySelectorAll('.inbanner').forEach(x=>x.remove());
  const b=el('button','inbanner');const m=el('div','t-main');
  const who=typeOf(c)==='group'?displayName(c.last.from)+(men?' mentioned you: ':': '):'';
  m.append(titleNode('div','t-name',c),el('div','t-sub',who+previewText(pv)));
  b.append(convAvatar(c,'sm'),m);b.onclick=()=>{b.remove();openConv(c.id)};
  document.body.append(b);setTimeout(()=>b.remove(),4500);
}
function renderBanner(){
  const b=$('#banner');b.replaceChildren();
  if(!S.db)b.append(el('div','banner',SRV_ERR||'Connecting to Hush\u2026'));
  else if(!S.db.online)b.append(el('div','banner',SRV_ERR||('Can\u2019t reach the Hush server at '+S.db.addr+'. Reconnecting\u2026')));
  else if(S.me&&!hasRecovery(S.me.handle)){ // stays until recovery words are set up; no close button on purpose
    if(!S.contactsReady||S.tab==='profile')return; // wait for the vault (another device may have set them up already)
    const n=html('button','setup-bar','<span class="sb-ic">'+I.key+'</span>');
    const t=el('span','sb-txt');t.append(el('span','sb-t','Finish setting up your account'),el('span','sb-s','Save your recovery words so you can always get back in.'));
    n.append(t);n.insertAdjacentHTML('beforeend','<span class="chev">\u203a</span>');n.onclick=()=>openBackup();b.append(n)}
  else if(S.me&&!loginInfo(S.me.handle)&&!ls.get('hush:backedUp:'+S.me.handle,0)&&!ls.get('hush:nudgeOff:'+S.me.handle,false)){
    const n=el('div','banner nudge');n.append(el('span',null,'Add your phone number so you can log in on other devices.'));
    const go=el('button','link sm','Add');go.onclick=openAddLogin;const x=html('button','icon-btn sm-x',I.xs);x.setAttribute('aria-label','Dismiss');
    x.onclick=()=>{ls.set('hush:nudgeOff:'+S.me.handle,true);renderBanner()};n.append(go,x);b.append(n)}
}

/* ---------- channel crypto ----------
   Each channel has numbered key "epochs". A private epoch key is wrapped separately for each subscriber.
   A public epoch key is published openly (public channels can't be secret). Going private starts a new epoch. */
const APP_URL=location.origin+location.pathname;
const epochOf=c=>c.epoch==null?0:c.epoch;
const keyMap=(c,e)=>(c.keys&&c.keys[e])||null;
const epochsOf=c=>{const es=[...new Set(Object.keys(c.keys||{}).concat(Object.keys(c.openKeys||{})).map(Number))].sort((a,b)=>a-b);return es.length?es:[0]};
const metaOf=s=>({name:s.name||'',desc:s.desc||'',photo:s.photo||null,owner:s.owner||'',admins:s.admins||[],members:s.members||[],banned:s.banned||[]});
async function capsFor(cid){ // the best key this device holds for a chat, for the connector to open it with
  let c=S.chatDocs.get(cid);
  if(!c){const s=await S.db.preview(cid);if(!s.exists)return null;c=Object.assign({id:cid},s.data());S.chatDocs.set(cid,c)}
  if(typeOf(c)==='dm'){const e=epochOf(c);return (e>0&&await memberCap(c,e))||memberCap(c,0)} // the base key always lets you back in to heal
  const shown=await showMeta(c),me=S.me.handle;
  if(shown.owner===me)return ownerCap(cid);
  if((shown.admins||[]).includes(me)){const a=await adminSecret(c);if(a)return adminCapFrom(cid,a)}
  return memberCap(c,epochOf(c));
}
function noteChatDoc(c){ // remember the server's copy; a new epoch or new admin keys mean the connector should open the chat again
  const prev=S.chatDocs.get(c.id);S.chatDocs.set(c.id,c);
  if(prev&&((prev.epoch||0)!==(c.epoch||0)||JSON.stringify(prev.akeys||{})!==JSON.stringify(c.akeys||{}))&&S.db&&S.db.refreshChat)S.db.refreshChat(c.id).catch(()=>{});
}
async function onChatEvicted(cid){ // the server took our level away (a rotation, or we were removed): fetch the new record before trying again
  try{const s=await S.db.preview(cid);if(s.exists)S.chatDocs.set(cid,Object.assign({id:cid},s.data()));else S.chatDocs.delete(cid)}catch{}
}
const wrapSynced=new Set();
async function syncWraps(c){ // wrap the chat keys this device holds for my other trusted devices that may not have them yet
  if(!S.db||!S.me||!S.me.dev||!S.me.dev.s||!c||!isMember(c)||c.visibility==='public'||wrapSynced.has(c.id))return;wrapSynced.add(c.id);
  try{const me=S.me.handle,trusted=new Set(S.me.trust||[]),devs=(await verifiedDevs(me)).filter(d=>trusted.has(d.id)&&d.id!==S.me.dev.id);
    if(!devs.length)return;const done=ls.get('hush:wrapped:'+me,{}),mine=done[c.id]||{},keys={};let n=0;
    for(const e of epochsOf(c)){if(c.openKeys&&c.openKeys[e])continue;const k=await convKey(c,e);if(!k||!k.raw)continue;
      const have=new Set(mine[e]||[]),missing=devs.filter(d=>!have.has(d.id));if(!missing.length)continue;
      const w={};for(const dv of missing)w[rid22()]=await wrapTo(k.raw,dv.ecdh,wrapSalt(c.id,e,me,dv.id));keys[e]=w;mine[e]=[...have,...missing.map(d=>d.id)];n++}
    if(n){await S.db.doc('channels/'+c.id).update({keys});done[c.id]=mine;ls.set('hush:wrapped:'+me,done)}
  }catch{wrapSynced.delete(c.id)}
}
async function rotateTo(c,v,extra){ // a fresh chat key for everyone in `v.members`, plus a fresh sealed description; returns the new epoch
  if(typeOf(c)!=='dm'&&!(v.members||[]).includes(S.me.handle))throw new Error('notmember'); // a list that leaves me out is stale or forged: never hand the chat to it
  const e=epochOf(c)+1,raw=crypto.getRandomValues(new Uint8Array(32));await loadDir(v.members,true); // fresh profiles before wrapping for everyone
  const keys=await wrapAll(raw,v.members,c.id,e),meta=typeOf(c)==='dm'?undefined:await sealMeta(c.id,e,raw,v);
  await S.db.rotateChat(c.id,Object.assign({epoch:e,keys,cap:await memberCapFrom(c.id,e,raw)},meta?{meta}:{},extra||{}));
  ksPut(c.id,e,b64(raw));ls.set('hush:inv:'+c.id,null);
  for(const x of [c,convById(c.id),S.chatDocs.get(c.id)])if(x){x.epoch=e;x.keys=Object.assign({},x.keys,{[e]:keys});if(meta)x.meta=meta}
  return e;
}
const dmEpochBusy=new Map();
async function ensureDmEpoch(c){ // a DM's first message from this app gives it a random key wrapped only to both people's devices
  if(!c||typeOf(c)!=='dm'||(c.epoch||0)>0||!S.db||!S.me.dev||!S.me.dev.s)return;
  if(dmEpochBusy.has(c.id))return dmEpochBusy.get(c.id);
  const job=(async()=>{try{
    const peer=dmPeer(c);await loadDir([peer]);
    if(peer!==S.me.handle&&!(await verifiedDevs(peer)).length)return; // no device key on their profile yet: keep the shared base key
    try{await rotateTo(c,{members:[...new Set([S.me.handle,peer])]})}
    catch(e){if(!e||e.code!=='conflict')throw e; // the other side got there first: take their key
      const d=(await S.db.doc('channels/'+c.id).get()).data()||{};for(const x of [c,convById(c.id)])if(x){x.epoch=d.epoch||0;x.keys=d.keys||{}}}
  }catch{}finally{dmEpochBusy.delete(c.id)}})();
  dmEpochBusy.set(c.id,job);return job;
}
const healed=new Set();
async function healKeys(c){ // after an account recovery a phone holds no key for its DMs: it starts a fresh one. Groups: an admin resends keys.
  if(!S.db||!S.me||!S.me.dev||!S.me.dev.s||!c||typeOf(c)!=='dm'||!isMember(c)||healed.has(c.id))return;
  const e=epochOf(c);if(e===0||e>=31||await convKey(c,e))return;healed.add(c.id);
  try{await rotateTo(c,{members:[...new Set([S.me.handle,dmPeer(c)])]})}catch{healed.delete(c.id)}
}
async function resendKeys(cid,h){ // an admin hands a member every chat key again, wrapped to the devices on their profile today
  const c=S.chatDocs.get(cid)||await freshChan(cid);await loadDir([h],true);
  const raws=await allRaws(c),keys={};for(const [e,r] of Object.entries(raws))keys[e]=await wrapKey(unb64(r),h,cid,Number(e));
  await S.db.doc('channels/'+cid).update({keys});
}
async function allRaws(c){const out={};for(const e of epochsOf(c)){const k=await convKey(c,e);if(k)out[e]=b64(k.raw)}return out}
const hiddenPost=(p,o)=>!!(p&&p.sl===1&&o&&o.text!=null&&!o.verified); // a sealed message whose hidden signature doesn't check out is never shown under anyone's name
async function removeOwn(cid,p){ // delete your own sealed message: prove it's yours, wipe it, then remove it
  const k=p.on||0,ref=S.db.doc(`channels/${cid}/posts/${p._id}`);
  await ref.update({del:true,n:'',d:'',oh:'',on:k+1,ot:await ownTok(cid,p._id,k)});
  await ref.delete();
}
function openPost(c,p,kind){
  if(p.svc)return Promise.resolve({svc:true,text:null,media:[]});
  const key=(kind==='comment'?'cm:':'p:')+S.me.handle+':'+c.id+':'+p.sig;
  if(!S.cache.has(key))S.cache.set(key,(async()=>{
    let text=null,verified=false,media=[],poll=null,reply=null,fwd=null,on=null;const ck=await convKey(c,p.e??0),nokey=!ck&&(typeOf(c)!=='dm'||(p.e??0)>0);
    if(ck){try{text=dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(p.iv)},ck.key,unb64(p.ct)))}catch{}}
    if(text&&text[0]==='\u0001'){try{const o=JSON.parse(text.slice(1));text=String(o.text||'');
      poll=o.poll&&typeof o.poll.q==='string'&&Array.isArray(o.poll.opts)&&o.poll.opts.length>=2?{q:o.poll.q.slice(0,300),opts:o.poll.opts.slice(0,10).map(x=>String(x).slice(0,100)),multi:!!o.poll.multi}:null;
      media=Array.isArray(o.media)?o.media.slice(0,MAX_FILES).filter(m=>m&&typeof m.id==='string'&&/^[a-zA-Z0-9]+$/.test(m.id)&&['image','gif','video','voice','file'].includes(m.kind)&&(m.v!==2||typeof m.k==='string'))
        .map(m=>Object.assign({},m,{wave:Array.isArray(m.wave)?m.wave.slice(0,64).map(v=>Math.max(1,Math.min(31,v|0))):null,name:m.kind==='file'?cleanName(m.name):undefined,mime:String(m.mime||'')})):[];
      reply=o.reply&&typeof o.reply.id==='string'&&/^[A-Za-z0-9_-]+$/.test(o.reply.id)?{id:o.reply.id,from:String(o.reply.from||''),snip:String(o.reply.snip||'').slice(0,100)}:null;
      fwd=o.fwd&&typeof o.fwd.name==='string'?{name:o.fwd.name.slice(0,60)}:null;
      on=typeof o.on==='string'&&/^[A-Za-z0-9_-]+$/.test(o.on)?o.on:null;
    }catch{text=null}}
    const s=await senderKeys(p.from); // someone who joined by link may be nobody this page has looked up yet
    if(s&&(kind==='comment'||typeOf(c)!=='channel'||isAdminH(c,p.from))){try{verified=await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},await pubKey(s.sig,'s'),unb64(p.sig),postData(c.id,p))}catch{}}
    if(text==null||!s)setTimeout(()=>S.cache.delete(key));
    if(text&&kind!=='comment')indexMsg(key,c,p,text);
    return {text,media,poll,reply,fwd,on,verified,known:!!s,nokey};
  })());
  return S.cache.get(key);
}
async function freshChan(cid){const s=await S.db.doc('channels/'+cid).get();if(!s.exists)throw new Error('gone');return Object.assign({id:cid},s.data())}
const joinedPublic=cid=>!!(S.prefs&&Array.isArray(S.prefs.pub)&&S.prefs.pub.includes(cid));
async function showMeta(c,raws){ // an on-screen copy with the readable fields filled in. It is never saved back.
  if(!c)return c;const out=Object.assign({},c),me=S.me&&S.me.handle;
  if(typeOf(c)==='dm'){const peer=S.dmPeers[c.id]||(c.members||[]).find(h=>h!==me);out.members=peer?[...new Set([me,peer])]:(c.members||[me]);return out}
  if(c.visibility==='public'){out.members=[...new Set([c.owner,...(c.admins||[]),...(joinedPublic(c.id)||(c.members||[]).includes(me)?[me]:[])].filter(Boolean))];if(!out.name)out.name='Channel';return out}
  const v=c.meta?await readMeta(c,raws):null;
  if(v){Object.assign(out,v);if(me&&!out.members.includes(me)&&(await convKey(c,epochOf(c))))out.members=[...out.members,me]} // joined by link, not yet written into the list
  else{out.name=typeOf(c)==='group'?'Private group':'Private channel';out.desc='';out.photo=null;out.members=c.members||[];out.admins=c.admins||[];out.owner=c.owner||''}
  if(!out.name)out.name=typeOf(c)==='group'?'Group':'Channel';
  return out;
}
async function chatAnd(cid){const c=S.chatDocs.get(cid)||await freshChan(cid);return [c,await showMeta(c)]} // the server's record and its readable copy
async function setVisibility(cid,vis){
  const [c,shown]=await chatAnd(cid);if(c.visibility===vis)return;const v=metaOf(shown);
  if(vis==='public'){ // history becomes readable to anyone, and so do the name and photo, so people can find it
    await S.db.doc('channels/'+cid).update({visibility:'public',openKeys:await allRaws(c),name:v.name,desc:v.desc,photo:v.photo,owner:v.owner||S.me.handle,admins:v.admins,meta:null,invites:{}})}
  else{ // a fresh key from here on, and the description goes back under seal
    await rotateTo(c,v);
    await S.db.doc('channels/'+cid).update({visibility:'private',name:null,desc:null,photo:null,owner:null,admins:null,invites:{}})}
  ls.set('hush:inv:'+cid,null);
}
async function createInvite(cid){
  const c=S.chatDocs.get(cid)||await freshChan(cid),iid=rid(),secret=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await inviteKey(secret,cid,iid),enc.encode(JSON.stringify(await allRaws(c))));
  const sec=b64u(secret),ph=hexOf(await crypto.subtle.digest('SHA-256',enc.encode(await joinProof(sec,cid,iid))));
  await S.db.doc('channels/'+cid).update({invites:{[iid]:{iv:b64(iv),ct:b64(ct),ph,ts:Date.now()}}});
  const inv={iid,secret:sec,h:S.me.handle};ls.set('hush:inv:'+cid,inv);return inv; // `h`: whose it is, so logging that account out takes it along
}
async function revokeInvite(cid,iid){await S.db.doc('channels/'+cid).update({invites:{[iid]:null}});ls.set('hush:inv:'+cid,null)}
const linkFor=(cid,inv)=>APP_URL+'#join='+cid+(inv?'.'+inv.iid+'.'+inv.secret:'');
function parseJoin(s){const m=String(s||'').match(/(?:join=)?([cg][A-Za-z0-9]{6,})(?:\.([A-Za-z0-9]+)\.([A-Za-z0-9_-]{10,}))?/);return m?{cid:m[1],iid:m[2],secret:m[3]}:null}
async function inviteRaws(cid,j){ // the key history inside an invite link, fetched from the server and unlocked with the link's secret
  const inv=await S.db.inviteBlob(cid,j.iid);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(inv.iv)},await inviteKey(unb64u(j.secret),cid,j.iid),unb64(inv.ct))))}
async function handleJoin(code){
  const am=String(code||'').match(/add=([a-z0-9_]{3,20})/);
  if(am){const h=am[1];
    if(!S.db||!S.me){toast('This link can\u2019t be opened right now. Check your connection.');return false}
    if(h===S.me.handle){toast('That\u2019s your own invite link. Send it to a friend.');return true}
    if(!S.dir[h]){try{const s=await S.db.doc('directory/'+h).get();if(!s.exists){toast('No one on Hush has the username @'+h+'.');return false}S.dir[h]=s.data()}catch{toast('Couldn\u2019t open that link. Check your connection.');return false}}
    openDm(h);return true}
  const j=parseJoin(code);if(!j){toast('That doesn\u2019t look like a Hush invite link.');return false}
  if(!S.db||!S.me){toast('Joining isn\u2019t available right now. Check your connection.');return false}
  let c;try{c=await freshChan(j.cid)}catch{toast('That channel doesn\u2019t exist anymore.');return false}
  if(convById(j.cid)||c.visibility==='public'){S.previews.set(c.id,await showMeta(c));openConv(c.id);return true}
  if(!j.iid||!j.secret){toast('This invite link is incomplete. Ask for a new one.');return false}
  let raws=null;try{raws=await inviteRaws(j.cid,j)}catch(e){toast(e&&e.code==='notfound'?'This invite link was revoked. Ask for a new one.':'Couldn\u2019t read that invite link. Check your connection.');return false}
  const shown=await showMeta(c,raws);
  if((shown.banned||[]).includes(S.me.handle)){toast('You were removed from this channel.');return false}
  confirmJoin(shown,j);return true;
}
async function joinPrivate(cid,j){
  const c=await freshChan(cid),raws=await inviteRaws(cid,j);
  const shown=await showMeta(c,raws);if((shown.banned||[]).includes(S.me.handle))throw new Error('banned');
  const wraps={};for(const [e,r] of Object.entries(raws)){wraps[e]=await wrapKey(unb64(r),S.me.handle,cid,Number(e));ksPut(cid,e,r)}
  await S.db.joinChat(cid,j.iid,await joinProof(j.secret,cid,j.iid),wraps); // proves the link to the server and files our own wraps
  const full=await freshChan(cid);noteChatDoc(full);await S.db.refreshChat(cid);
  try{await S.db.collection('channels/'+cid+'/posts').add(await sealSvc(full,'join',0))}catch{} // members (and an admin, who writes us into the list) see we joined
  await dropPointer(S.me.handle,{t:'invite',cid,from:S.me.handle,type:typeOf(full)});
  S.previews.set(cid,await showMeta(full));openConv(cid);
}
async function joinPublic(cid){ // public channels keep no member list: joining is a note to yourself
  const c=await freshChan(cid);const pub=P().pub||(P().pub=[]);if(!pub.includes(cid)){pub.push(cid);saveContacts()}
  await dropPointer(S.me.handle,{t:'invite',cid,from:S.me.handle,type:'channel'});
  S.previews.set(cid,await showMeta(c));openConv(cid);
}

/* ---------- chat pane ---------- */
function stopConv(){if(S.flushDraft){try{S.flushDraft()}catch{}S.flushDraft=null}S.unsubs.forEach(u=>{try{u()}catch{}});S.unsubs=[];closeMenus();
  if(S.recCancel){S.recCancel();S.recCancel=null}if(S.audio){S.audio.pause();S.audio=null}}
function closeMenus(){document.querySelectorAll('.popmenu').forEach(m=>m.remove())}
function closeConv(){
  stopConv();Object.assign(S,{chan:null,posts:[],rendered:null,replyTo:null,editing:null,comp:null});
  $('#app').classList.remove('in-chat');
  const p=$('#chatPane');p.replaceChildren();const blank=el('div','chat-blank');blank.append(el('span','chip','Select a chat to start messaging'));p.append(blank);
  renderList();updateTitle();
  if(navChat){const l=navChat;navChat=null;NAV.closed(l)}
}
let navChat=null; // the open chat's history layer
function convMenu(c){
  const t=typeOf(c),owner=isOwner(c),admin=isAdmin(c),member=isMember(c),pub=c.visibility==='public',items=[];
  items.push({icon:I.search,label:'Search',fn:openSearch});
  if(t==='dm'&&!isSelf(c)){items.push({icon:I.user,label:'View profile',fn:()=>openProfile(dmPeer(c))});
    items.push({icon:I.x,label:'Block this chat',fn:()=>confirmBlockChat(c)});
    items.push({icon:I.x,label:'Block this person',fn:()=>confirmBlockPerson(dmPeer(c))})}
  else if(t!=='dm'){
    items.push({icon:I.info,label:t==='group'?'Group info':'Channel info',fn:()=>openConvInfo(c.id)});
    if(member&&(admin||(t==='channel'&&pub)))items.push({icon:I.link,label:t==='group'?'Invite via link':'Invite link and QR code',fn:()=>openInvite(c.id,{auto:t==='group'&&admin})});
    if(canPost(c))items.push({icon:I.chart,label:'New poll',fn:()=>openPollCreate(c.id)});
    if(admin)items.push({icon:I.plus,label:t==='group'?'Add members':'Add subscribers',fn:()=>openAddSubs(c.id)});
    if(owner)items.push({icon:I.smile,label:'Reactions',fn:()=>openReactSettings(c.id)});
  }
  items.push({icon:I.image,label:'Shared media',fn:openMediaGallery});
  if((S.scheduled||[]).length)items.push({icon:I.timer,label:`Scheduled messages (${S.scheduled.length})`,fn:openScheduled});
  if(member&&(t==='dm'||owner))items.push({icon:I.timer,label:'Disappearing messages',fn:()=>openTtl(c.id)});
  if(member&&!isSelf(c))items.push({icon:isMuted(c.id)?I.bell:I.bellOff,label:()=>isMuted(c.id)?'Unmute':'Mute',fn:()=>toggleMute(c.id)});
  return items;
}
function openConv(cid){
  const c=convById(cid);if(!c)return;
  stopConv();
  Object.assign(S,{chan:cid,posts:[],rawPosts:[],older:[],allLoaded:false,loadingOlder:false,scheduled:[],future:[],purged:new Set(),rendered:null,stick:true,
    serverView:!!ls.get('hush:serverView',false),replyTo:null,editing:null,reads:{},typing:{},agg:new Map(),comp:null,curTtl:c.ttl||0,newBelow:0,
    pinIdx:0,pinCache:new Map(),comments:[],ccount:new Map(),commentsView:null,keepScroll:null,setSchedCount:null});
  $('#app').classList.add('in-chat');
  if(!navChat){const l={kind:'chat',alive:()=>navChat===l&&!!S.chan,close:closeConv};navChat=NAV.open(l)} // one layer, however many chats are switched between
  const t=typeOf(c),p=$('#chatPane');p.replaceChildren();p.style.transform='';
  const bar=el('div','bar');
  const back=html('button','icon-btn back',I.back);back.setAttribute('aria-label','Back to chats');back.onclick=closeConv;
  const head=el('button','chat-head');const hm=el('div','t-main');const sub=el('div','t-sub');sub.id='convSub';
  hm.append(titleNode('div','t-name',c),sub);head.append(convAvatar(c,'sm'),hm);
  head.onclick=()=>isSelf(c)?null:t==='dm'?openProfile(dmPeer(c)):openConvInfo(cid);
  const sbtn=html('button','icon-btn',I.search);sbtn.setAttribute('aria-label','Search this chat');sbtn.onclick=openSearch;
  const more=html('button','icon-btn',I.more);more.setAttribute('aria-label','Chat options');more.onclick=e=>{e.stopPropagation();toggleChatMenu(convMenu(curConv()||c))};
  bar.append(back,head,sbtn,more);
  const pinbar=el('button','pinbar');pinbar.id='pinbar';pinbar.hidden=true;
  const mw=el('div','msgs-wrap');const msgs=el('div');msgs.id='msgs';
  const down=html('button','to-bottom',I.down);down.setAttribute('aria-label','Scroll to latest');down.hidden=true;const dn=el('span','n');dn.hidden=true;down.append(dn);
  down.onclick=()=>{msgs.scrollTo({top:msgs.scrollHeight,behavior:'smooth'})};
  msgs.onscroll=()=>{S.stick=msgs.scrollHeight-msgs.scrollTop-msgs.clientHeight<80;down.hidden=S.stick;if(S.stick){S.newBelow=0;dn.hidden=true;markRead()}
    if(msgs.scrollTop<60&&!S.allLoaded&&S.posts.length)loadOlder();
    document.querySelectorAll('.msgmenu').forEach(m=>m.remove())};
  S.setNewBelow=n=>{S.newBelow=n;dn.hidden=!n;dn.textContent=n>99?'99+':String(n)};
  const tbub=el('div','typing-bubble');tbub.id='typingBubble';tbub.hidden=true;
  mw.append(msgs,tbub,down);p.append(bar,pinbar,mw);
  if(!isMember(c)){
    if(t==='channel'&&c.visibility==='public'){const f=el('div','composer readonly');const j=el('button','primary join','Join channel');
      j.onclick=async()=>{j.disabled=true;try{await joinPublic(cid)}catch(e){j.disabled=false;if(!e||e.message!=='banned')toast('Couldn\u2019t join. Check your connection and try again.')}};f.append(j);p.append(f)}
  }else if(!canPost(c))p.append(el('div','composer readonly','Only the channel owner and admins can post here'));
  else if(t==='dm'&&!isSelf(c)&&keyChanged(dmPeer(c))){const kw=el('div','composer readonly kwbar');kw.append(keyWarnBox(dmPeer(c)));p.append(kw)}
  else if(isRequest(c))p.append(requestBar(c));
  else{if(awaitingAccept(c))p.append(el('div','reqnote',displayName(dmPeer(c))+' only takes messages from their contacts. You can send one text message as a request. Once they accept, you can chat normally.'));buildComposer(p,c)}
  S.warnShown=!!(t==='dm'&&!isSelf(c)&&keyChanged(dmPeer(c)));pinAll();drawTyping();
  refreshHeader();renderConv();renderList();updateTitle();drawPinBar();loadDir(c.members||[]).then(ch=>syncWraps(convById(cid)||c)).then(ch=>healKeys(convById(cid)||c).then(()=>ch)).then(async ch=>{if(ch&&S.chan===cid){const cc=convById(cid)||c;S.rawPosts=await unsealAll(cc,S.rawPosts);S.older=await unsealAll(cc,S.older);if(S.chan!==cid)return;applyExpiry();pinAll();S.rendered=null;renderConv();refreshHeader()}});refreshPresence();
  if(!S.db)return;
  const base='channels/'+cid;
  S.unsubs.push(
    liveQ(S.db.collection(base+'/posts').orderBy('ts','desc').limit(300),async s=>{const my=S.postSeq=(S.postSeq||0)+1;
      const un=await unsealAll(convById(cid)||c,s.docs.map(d=>Object.assign({_id:d.id,_pending:d.metadata.hasPendingWrites},d.data())).reverse());
      if(S.chan!==cid||my!==S.postSeq)return; // left the chat, or a newer update arrived while unsealing
      S.rawPosts=un;reconcileSvc(convById(cid)||c,un).catch(()=>{});noteAccepted(cid,un);
      if(!s.metadata.fromCache&&s.docs.length<300&&!(S.older||[]).length)S.allLoaded=true;
      if(!s.metadata.fromCache)pruneIdx(cid,S.rawPosts,S.allLoaded);
      applyExpiry();if(S.stick)markRead();renderConv();drawPinBar()},()=>toast('This chat stopped updating. Reload to reconnect.')),
    S.db.collection(base+'/acts').limit(1000).onSnapshot(s=>onActs(s.docs.map(d=>Object.assign({_id:d.id},d.data()))),()=>{}),
    S.db.collection(base+'/reads').limit(1000).onSnapshot(s=>readSide(cid,s.docs,'hush-seen-v1',r=>{S.reads=r;refreshNodes()}),()=>{}),
    S.db.collection(base+'/typing').limit(200).onSnapshot(s=>readSide(cid,s.docs,'hush-type-v1',r=>{S.typing=r;drawTyping();refreshHeader()}),()=>{}));
  if(FEATURES.channelComments&&t==='channel')S.unsubs.push(S.db.collection(base+'/comments').limit(1000).onSnapshot(s=>{
    S.comments=s.docs.map(d=>Object.assign({_id:d.id,_pending:d.metadata.hasPendingWrites},d.data()));
    const cnt=new Map();S.comments.forEach(x=>cnt.set(x.post,(cnt.get(x.post)||0)+1));S.ccount=cnt;refreshNodes();if(S.commentsView)S.commentsView.render()},()=>{}));
}
async function drawPinBar(){
  const pb=$('#pinbar'),c=curConv();if(!pb||!c)return;const pins=(c.pins||[]);
  if(!pins.length){pb.hidden=true;return}
  const idx=S.pinIdx%pins.length,id=pins[idx];let p=allPosts().find(x=>x._id===id);
  if(!p&&S.db){if(!S.pinCache.has(id))S.pinCache.set(id,S.db.doc(`channels/${c.id}/posts/${id}`).get().then(s=>s.exists?unsealPost(c,Object.assign({_id:id},s.data())):null).catch(()=>null));p=await S.pinCache.get(id)}
  const o=p?await openPost(c,p):null;if(curConv()!==c&&curConv()?.id!==c.id)return;
  pb.replaceChildren();pb.hidden=false;pb.insertAdjacentHTML('beforeend',I.pin);
  const m=el('div','t-main');m.append(el('div','pb-title','Pinned message'+(pins.length>1?` ${idx+1} of ${pins.length}`:'')),el('div','t-sub',p?snippet(o):'Message no longer available'));pb.append(m);
  if(canPin(c)){const x=html('span','icon-btn pb-x',I.xs);x.setAttribute('role','button');x.setAttribute('aria-label','Unpin');
    x.onclick=async e=>{e.stopPropagation();try{await S.db.doc('channels/'+c.id).update({pins:pins.filter(v=>v!==id)})}catch{toast('Couldn\u2019t unpin. Try again.')}};pb.append(x)}
  pb.onclick=async()=>{if(p){if(!S.rendered||!S.rendered.nodes.get(id)){for(let k=0;k<10&&!S.allLoaded&&!(S.rendered&&S.rendered.nodes.get(id));k++)await loadOlder()}jumpTo(id)}
    if(pins.length>1){S.pinIdx=(S.pinIdx+1)%pins.length;drawPinBar()}};
}
async function togglePinMsg(c,p){
  const cur=(c.pins||[]),on=!cur.includes(p._id),pins=cur.filter(x=>x!==p._id);if(on)pins.unshift(p._id);
  try{await ensureDmDoc(c);await S.db.doc('channels/'+c.id).update({pins:pins.slice(0,20)});
    if(on)await S.db.collection(`channels/${c.id}/posts`).add(await sealSvc(c,'pin',0));S.pinIdx=0;toast(on?'Message pinned':'Message unpinned')}
  catch{toast('That didn\u2019t go through. Try again.')}
}
function openSearch(){
  const pane=$('#chatPane');const ex=pane.querySelector('.sbar');if(ex){ex.querySelector('input').focus();return}
  const sb=el('div','sbar');const inp=el('input');inp.type='search';inp.placeholder='Search this chat';inp.setAttribute('aria-label','Search this chat');inp.enterKeyHint='search';
  const cnt=el('span','scount');const up=html('button','icon-btn',I.up),dn=html('button','icon-btn',I.down),x=html('button','icon-btn',I.x);
  up.setAttribute('aria-label','Older result');dn.setAttribute('aria-label','Newer result');x.setAttribute('aria-label','Close search');
  const more=el('button','link sm','Search older');more.hidden=S.allLoaded;
  let res=[],idx=0,deb=null;
  const show=()=>{more.hidden=S.allLoaded;if(!inp.value.trim()||inp.value.trim().length<2){cnt.textContent='';return}
    cnt.textContent=res.length?`${idx+1} of ${res.length}`:'No results';if(res.length)jumpTo(res[idx])};
  const run=async()=>{const q=inp.value.trim().toLowerCase();res=[];idx=0;if(q.length<2){show();return}const c=curConv();if(!c)return;
    const ps=S.posts.filter(p=>!p.svc),os=await Promise.all(ps.map(p=>openPost(c,p)));
    ps.forEach((p,i)=>{const t=os[i].text;const cap=(os[i].poll?os[i].poll.q+' '+os[i].poll.opts.join(' '):'');if((t&&plainText(t).toLowerCase().includes(q))||cap.toLowerCase().includes(q))res.push(p._id)});
    res.reverse();show()};
  inp.oninput=()=>{clearTimeout(deb);deb=setTimeout(run,250)};inp.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();up.click()}if(e.key==='Escape')x.click()};
  up.onclick=()=>{if(res.length){idx=(idx+1)%res.length;show()}};dn.onclick=()=>{if(res.length){idx=(idx-1+res.length)%res.length;show()}};
  more.onclick=async()=>{more.disabled=true;more.textContent='Searching\u2026';for(let k=0;k<10&&!S.allLoaded;k++)await loadOlder();more.disabled=false;more.textContent='Search older';run()};
  x.onclick=()=>sb.remove();
  sb.append(html('span','sic',I.search),inp,cnt,more,up,dn,x);pane.querySelector('.bar').after(sb);inp.focus();
}
function openMediaGallery(){
  const c=curConv();if(!c)return;const {body}=sheet('Shared media');const host=el('div');body.append(host);
  const draw=async()=>{host.replaceChildren(el('p','t-sub','Loading\u2026'));
    const ps=S.posts.filter(p=>!p.svc),os=await Promise.all(ps.map(p=>openPost(c,p)));const vis=[],voice=[];
    ps.forEach((p,i)=>(os[i].media||[]).forEach(m=>(m.kind==='voice'?voice:vis).push({p,m})));vis.reverse();voice.reverse();
    host.replaceChildren();
    if(!vis.length&&!voice.length)host.append(el('div','empty','No photos, videos or voice messages here yet.'));
    if(vis.length){host.append(el('div','menu-label flush',`Photos and videos (${vis.length})`));const g=el('div','gallery');
      const list=vis.map(({p,m})=>({m,e:p.e??0})); // the viewer swipes through every photo and video in the chat
      vis.forEach(({p,m},i)=>{const t=mediaNode(c,m,false,p.e??0,()=>viewer(c,list,i));t.classList.add('g-tile');g.append(t)});host.append(g)}
    if(voice.length){host.append(el('div','menu-label flush',`Voice messages (${voice.length})`));
      voice.forEach(({p,m})=>{const r=el('div','g-voice');r.append(el('div','t-sub',`${displayName(p.from)}, ${fmtDay(p.ts)} ${fmtTime(p.ts)}`),voiceNode(c,m,p.e??0));host.append(r)})}
    if(!S.allLoaded){const b=el('button','secondary','Load older media');b.style.width='100%';b.style.marginTop='12px';
      b.onclick=async()=>{b.disabled=true;b.textContent='Loading\u2026';for(let k=0;k<5&&!S.allLoaded;k++)await loadOlder();draw()};host.append(b)}};
  draw();
}
/* ---------- channel comments (switched off for now; planned as a paid bonus feature) ---------- */
const FEATURES={channelComments:false};
function openComments(p,o){
  const c=curConv();if(!c)return;const {body,sh}=sheet('Comments');sh.classList.add('tall');
  const q=el('div','quote static');q.append(el('span','q-from',c.name),el('span','q-text',snippet(o)));body.append(q);
  const list=el('div','clist');body.append(list);
  const allowed=c.comments!==false,member=isMember(c);
  let bar=null,ta=null,go=null;
  if(allowed&&member){bar=el('div','cinput');ta=el('textarea');ta.rows=1;ta.placeholder='Write a comment';ta.setAttribute('aria-label','Write a comment');ta.maxLength=2000;
    go=html('button','send',I.send);go.setAttribute('aria-label','Send comment');bar.append(ta,go);sh.append(bar);
    ta.oninput=()=>{ta.style.height='auto';ta.style.height=Math.min(ta.scrollHeight,120)+'px'};
    ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(pointer:fine)').matches){e.preventDefault();go.click()}};
    go.onclick=async()=>{const text=ta.value.trim();if(!text)return;go.disabled=true;
      try{const cc=curConv();const cm=await sealPost(cc,buildBody({text,on:p._id}));cm.post=p._id;await S.db.collection(`channels/${cc.id}/comments`).add(cm);ta.value='';ta.oninput()}
      catch{toast('Comment not sent. Try again.')}go.disabled=false;ta.focus()}}
  else body.append(el('p','hint',!allowed?'Comments are turned off for this channel.':'Join the channel to comment.'));
  let seq=0;
  const render=async()=>{if(!list.isConnected){S.commentsView=null;return}const my=++seq;const cc=curConv();if(!cc)return;
    const cs=(S.comments||[]).filter(x=>x.post===p._id).sort((a,b)=>a.ts-b.ts);const os=await Promise.all(cs.map(x=>openPost(cc,x,'comment')));if(my!==seq)return;
    list.replaceChildren();if(!cs.length){list.append(el('div','empty','No comments yet. Start the conversation.'));return}
    cs.forEach((x,i)=>{const oo=os[i];if(oo.text!=null&&oo.on!==p._id)return;
      const r=el('div','crow');const m=el('div','t-main');const nm=withBadge(el('div','c-name',displayName(x.from)),x.from);
      if(isAdminH(cc,x.from))nm.append(el('span','role',x.from===cc.owner?'owner':'admin'));
      const tx=el('div','c-text');if(oo.text==null)tx.append(el('span','bad','Couldn\u2019t decrypt this comment.'));else tx.append(richText(oo.text));
      if(oo.known&&!oo.verified)tx.append(el('span','warn','Signature check failed'));
      m.append(nm,tx,el('div','c-time',fmtDay(x.ts)+' '+fmtTime(x.ts)));r.append(userAvatar(x.from,'sm'),m);
      if(x.from===S.me.handle||isAdmin(cc)){const d=html('button','icon-btn c-del',I.trash);d.setAttribute('aria-label','Delete comment');
        d.onclick=async()=>{if(!confirm('Delete this comment?'))return;try{await S.db.doc(`channels/${cc.id}/comments/${x._id}`).delete()}catch{toast('Couldn\u2019t delete it.')}};r.append(d)}
      list.append(r)});
    list.scrollTop=list.scrollHeight};
  S.commentsView={render};render();if(ta)setTimeout(()=>ta.focus(),80);
}
function drawTyping(){ // a little bubble with moving dots at the bottom of the chat, the way a person would expect
  const tb=document.getElementById('typingBubble'),msgs=document.getElementById('msgs'),c=curConv();if(!tb)return;
  const t=c?typeOf(c):'',now=Date.now();
  const who=!c||t==='channel'||isSelf(c)?[]:Object.entries(S.typing)
    .filter(([h,ts])=>h!==S.me.handle&&now-ts<5000&&(c.members||[]).includes(h)).map(([h])=>h);
  if(!who.length){if(!tb.hidden){tb.hidden=true;tb.replaceChildren()}if(msgs)msgs.classList.remove('tb-on');return}
  const label=t==='dm'?'':who.length===1?displayName(who[0]):who.length+' people';
  const sig=label+'|'+who.length;
  if(tb._sig!==sig){tb._sig=sig;tb.replaceChildren();
    if(label)tb.append(el('span','tb-name',label));
    const d=el('span','tb-dots');d.append(el('i'),el('i'),el('i'));tb.append(d);
    tb.setAttribute('aria-label',(label||'Someone')+' is typing')}
  if(tb.hidden){tb.hidden=false;if(S.stick&&msgs)msgs.scrollTop=msgs.scrollHeight}
  if(msgs)msgs.classList.add('tb-on');
}
function refreshHeader(){
  const c=curConv(),sub=$('#convSub');if(!c||!sub)return;
  const t=typeOf(c),now=Date.now();let txt,cls='t-sub',icon='';
  const typers=t==='channel'||isSelf(c)?[]:Object.entries(S.typing).filter(([h,ts])=>h!==S.me.handle&&now-ts<5000&&(c.members||[]).includes(h)).map(([h])=>h);
  if(typers.length){txt=t==='dm'?'typing\u2026':typers.length===1?displayName(typers[0])+' is typing\u2026':typers.length+' people are typing\u2026';cls+=' typing'}
  else if(isSelf(c)){txt='Only you can see this';cls+=' muted'}
  else if(t==='dm'){const pr=dmPeer(c);txt=lastSeen(pr);cls+=txt==='online'?' online':' muted';if(keyChanged(pr)){txt='security code changed';cls='t-sub danger-t'}else if(isVerified(pr))icon=I.shieldSm}
  else if(t==='group'){const on=(c.members||[]).filter(h=>h!==S.me.handle&&isOnline(h)).length;txt=memberText(c)+(on?`, ${on} online`:'');cls+=' muted'}
  else{const pub=c.visibility==='public';icon=pub?I.globe:I.lock;txt=pub?'Public, '+subsText(c):subsText(c);if(pub)cls+=' pub'}
  if(c.ttl&&!typers.length){icon=I.timerSm;txt+=', '+ttlLabel(c.ttl).replace(/s$/,'')+' timer'}
  const k=cls+'|'+txt+'|'+icon;if(sub._k===k)return;sub._k=k;sub.className=cls;sub.innerHTML=icon;sub.append(el('span',null,txt));
}
const sideSeq=new Map();
async function readSide(cid,docs,label,done){ // turn the tags back into names, ignoring anything whose signature doesn't check out
  const my=(sideSeq.get(label)||0)+1;sideSeq.set(label,my);
  const c=curConv();if(!c||c.id!==cid)return;const members=new Set(c.members||[]),maps={},r={};
  for(const d of docs){const v=d.data()||{},ts=v.ts||0;const i=String(d.id),cut=i.indexOf('~');
    let h=null,tag=null;
    if(cut<0){if(members.has(i))h=i} // an older app still files these under the plain name
    else{const e=+i.slice(0,cut);tag=i.slice(cut+1);
      if(!Number.isInteger(e))continue;
      const m=maps[e]||(maps[e]=await tagMap(c,e));h=m[tag];
      if(h&&!(await sideOk(h,v.sg,label,[cid,tag,ts])))h=null}
    if(h&&ts>(r[h]||0))r[h]=ts}
  if(sideSeq.get(label)!==my||S.chan!==cid)return;done(r);
}
/* The on-screen keyboard covers the bottom of the page on a phone. The browser tells us how much room is
   really left, so the whole app shrinks to fit and the message box ends up sitting right above the keys. */
let kbT=null;
function fitKeyboard(){
  const vv=window.visualViewport,app=document.getElementById('app');if(!vv||!app)return;
  const h=Math.round(vv.height),off=Math.round(vv.offsetTop||0),hidden=Math.max(0,Math.round(innerHeight-h-off));
  app.style.height=h+'px';
  app.style.transform=off>1?'translateY('+off+'px)':'';
  const up=hidden>80||off>1;document.documentElement.classList.toggle('kb-up',up);
  const msgs=document.getElementById('msgs');if(msgs&&S.stick)msgs.scrollTop=msgs.scrollHeight;
}
function onViewport(){clearTimeout(kbT);kbT=setTimeout(fitKeyboard,16)}
if(window.visualViewport){visualViewport.addEventListener('resize',onViewport);visualViewport.addEventListener('scroll',onViewport)}
addEventListener('orientationchange',()=>setTimeout(fitKeyboard,250));
let typingAt=0;
function setTyping(on){
  const c=curConv();if(!S.db||!c||!isMember(c)||typeOf(c)==='channel'||isSelf(c))return;
  const now=Date.now();if(on&&now-typingAt<2500)return;if(!on&&!typingAt)return;typingAt=on?now:0;
  (async()=>{try{const e=epochOf(c),t=await memTag(c,e,S.me.handle);if(!t)return;const ts=on?now:0;
    await S.db.doc(`channels/${c.id}/typing/${e}~${t}`).set({ts,sg:await sideSig('hush-type-v1',[c.id,t,ts])});
    S.db.doc(`channels/${c.id}/typing/${S.me.handle}`).delete().catch(()=>{});
  }catch{}})();
}
function heartbeat(force){
  if(!S.db||!S.me||(!force&&document.hidden))return;
  const hide=!!ls.get('hush:hideSeen:'+S.me.handle,false);
  S.db.doc('presence/'+S.me.handle).set(hide?{ts:0,hidden:true}:{ts:Date.now()}).catch(()=>{});
}
/* rich text box: formatting shows live as you type; it's turned into compact markers only when sent */
const FMT_TAGS={b:['B','STRONG'],i:['I','EM'],u:['U'],s:['S','STRIKE','DEL'],code:['CODE']};
function fmtMatch(n,k){if(!n||n.nodeType!==1)return false;if(k==='spoiler')return n.classList.contains('spoiler');if(k==='link')return n.tagName==='A';return (FMT_TAGS[k]||[]).includes(n.tagName)}
function serializeRich(root){
  let out='';
  root.childNodes.forEach(n=>{
    if(n.nodeType===3){out+=n.nodeValue.replace(/\u200b/g,'').replace(/\u00a0/g,' ');return}
    if(n.nodeType!==1)return;const tag=n.tagName;
    if(tag==='BR'){out+='\n';return}
    if(tag==='PRE'){const t=n.textContent;out+=t.trim()?'```\n'+t+'\n```':t;return}
    if(tag==='DIV'||tag==='P'){let inner=serializeRich(n);if(inner==='\n')inner='';out+=(out&&!out.endsWith('\n')?'\n':out?'\n':'')+inner;return}
    if(tag==='A'){const href=n.getAttribute('href')||'',inner=serializeRich(n);
      if(/^https?:\/\//.test(href)&&inner.trim())out+=inner.trim()===href?href:`[${inner.trim().replace(/[\[\]\n]/g,'')}](${href})`;else out+=inner;return}
    const mk=tag==='CODE'?'`':['B','STRONG'].includes(tag)?'**':['I','EM'].includes(tag)?'__':tag==='U'?'++':['S','STRIKE','DEL'].includes(tag)?'~~':n.classList.contains('spoiler')?'||':null;
    let inner=tag==='CODE'?n.textContent:serializeRich(n);
    if(tag==='CODE'&&inner.includes('\n')){out+='```\n'+inner+'\n```';return}
    if(mk&&inner.trim()){const lead=inner.match(/^\s*/)[0],trail=inner.match(/\s*$/)[0];out+=lead+mk+inner.trim()+mk+trail}else out+=inner;
  });
  return out;
}
function buildComposer(p,c){
  const cid=c.id,t=typeOf(c),ph=t==='channel'?'Broadcast a post':isSelf(c)?'Write a note':'Message';
  const cbar=el('div','cbar');cbar.hidden=true;
  const strip=el('div','strip');strip.hidden=true;
  const prog=el('div','progress');prog.hidden=true;const pbar=el('div','pbar'),pfill=el('div','pfill'),plabel=el('div','plabel');pbar.append(pfill);prog.append(plabel,pbar);
  const progress=(f,label)=>{pfill.style.width=Math.round(f*100)+'%';plabel.textContent=label};
  const comp=el('div','composer');
  const ed=el('div','editor');ed.contentEditable='true';ed.setAttribute('role','textbox');ed.setAttribute('aria-multiline','true');ed.setAttribute('aria-label',ph);ed.dataset.ph=ph;ed.spellcheck=true;ed.setAttribute('enterkeyhint','send');
  const getText=()=>serializeRich(ed).replace(/\s+$/,'').replace(/^\n+/,'');
  const isEmpty=()=>!ed.textContent.replace(/[\u200b\s]/g,'').length;
  const setText=txt=>{ed.replaceChildren();if(txt)ed.append(richText(txt));ed.querySelectorAll('.spoiler').forEach(x=>{x.onclick=null;x.onkeydown=null;x.removeAttribute('role');x.removeAttribute('tabindex');x.removeAttribute('aria-label')});
    ed.querySelectorAll('a').forEach(a=>{a.onclick=null;a.removeAttribute('target')});ed.querySelectorAll('.mention').forEach(x=>{x.onclick=null;x.removeAttribute('role');x.removeAttribute('tabindex')});onInput()};
  const placeCaretEnd=()=>{const r=document.createRange();r.selectNodeContents(ed);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r)};
  const send=html('button','send',I.send);send.setAttribute('aria-label','Send');
  const mic=html('button','send mic',I.mic);mic.setAttribute('aria-label','Record a voice message');
  const clip=html('button','icon-btn',I.clip);clip.setAttribute('aria-label','Attach photos, videos or files');
  const fi=el('input');fi.type='file';fi.multiple=true;fi.hidden=true;
  const pollB=t!=='dm'?html('button','icon-btn',I.chart):null;
  if(pollB){pollB.setAttribute('aria-label','New poll');pollB.onclick=()=>openPollCreate(cid)}
  const fbar=el('div','fmtbar');fbar.hidden=true;let fmtPinned=false;const fbtns={};
  const aa=html('button','icon-btn aa',I.fmt);aa.setAttribute('aria-label','Text formatting');aa.setAttribute('aria-pressed','false');
  const inEd=n=>n&&(n===ed||ed.contains(n));
  const within=(node,k)=>{for(let n=node;n&&n!==ed;n=n.parentNode)if(fmtMatch(n,k))return n;return null};
  const unwrap=n=>{const par=n.parentNode;while(n.firstChild)par.insertBefore(n.firstChild,n);par.removeChild(n)};
  const applyFmt=k=>{
    const sel=getSelection();if(!sel.rangeCount||!inEd(sel.anchorNode)){ed.focus();return}
    const r=sel.getRangeAt(0);
    const ex=within(r.commonAncestorContainer,k);
    if(ex){const first=ex.firstChild,last=ex.lastChild;unwrap(ex);if(first&&last){const nr=document.createRange();nr.setStartBefore(first);nr.setEndAfter(last);sel.removeAllRanges();sel.addRange(nr)}onInput();return}
    if(r.collapsed){toast('Select some text first, then pick a style.');return}
    let href=null;
    if(k==='link'){href=prompt('Paste the link (starting with https://)','https://');if(href==null)return;href=href.trim();
      if(!/^https?:\/\/[^\s)]+$/.test(href)||href==='https://'){toast('Links need to start with https:// or http://');return}
      sel.removeAllRanges();sel.addRange(r)}
    const frag=r.extractContents();
    frag.querySelectorAll('*').forEach(n=>{if(fmtMatch(n,k))unwrap(n)});
    let w;if(k==='spoiler'){w=el('span','spoiler')}else if(k==='link'){w=el('a','fmt-link');w.href=href}else if(k==='code'){w=el('code','fmt-code')}else w=document.createElement(FMT_TAGS[k][0].toLowerCase());
    if(k==='code')w.textContent=frag.textContent;else w.append(frag);
    r.insertNode(w);const nr=document.createRange();nr.selectNodeContents(w);sel.removeAllRanges();sel.addRange(nr);onInput();
  };
  [['b','Bold',I.fB,'Ctrl+B'],['i','Italic',I.fI,'Ctrl+I'],['u','Underline',I.fU,'Ctrl+U'],['s','Strikethrough',I.fS,'Ctrl+Shift+X'],['code','Monospace',I.fCode,'Ctrl+Shift+M'],['spoiler','Spoiler',I.fSpoiler,'Ctrl+Shift+P'],['link','Link',I.link,'Ctrl+K']]
    .forEach(([k,label,ic,key])=>{const b=html('button','fb',ic);b.setAttribute('aria-label',label);b.setAttribute('aria-pressed','false');b.title=label+' ('+key+')';
      b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('pointerdown',e=>e.preventDefault());
      b.onclick=()=>applyFmt(k);fbtns[k]=b;fbar.append(b)});
  const fhint=el('span','fb-hint','Select text, then tap a style');fbar.append(fhint);
  const syncFmt=()=>{
    const sel=getSelection(),inside=!!(sel&&sel.rangeCount&&inEd(sel.anchorNode)&&document.activeElement===ed),has=inside&&!sel.isCollapsed;
    fbar.hidden=!(fmtPinned||has)||!comp.isConnected||comp.hidden;aa.setAttribute('aria-pressed',String(fmtPinned));fhint.hidden=has;
    Object.entries(fbtns).forEach(([k,b])=>b.setAttribute('aria-pressed',String(!!(inside&&within(sel.anchorNode,k)))))};
  aa.addEventListener('pointerdown',e=>e.preventDefault());aa.addEventListener('mousedown',e=>e.preventDefault());
  aa.onclick=()=>{fmtPinned=!fmtPinned;if(document.activeElement!==ed){ed.focus();placeCaretEnd()}syncFmt()};
  ['keyup','mouseup','touchend','focus'].forEach(ev=>ed.addEventListener(ev,()=>setTimeout(()=>{syncFmt();syncMentions()},0)));ed.addEventListener('blur',()=>setTimeout(()=>{syncFmt();syncMentions()},150));
  const recbar=el('div','recbar');recbar.hidden=true;
  const rcancel=html('button','icon-btn',I.trash);rcancel.setAttribute('aria-label','Discard recording');
  const rdot=el('span','rdot'),rtime=el('span','rtime','0:00'),rlvl=el('span','rlvl'),rhint=el('span','rhint','Recording');
  const rsend=html('button','send',I.send);rsend.setAttribute('aria-label','Send voice message');
  recbar.append(rcancel,rdot,rtime,rhint,rlvl,rsend);
  const mbox=el('div','mentions');mbox.hidden=true;mbox.setAttribute('role','listbox');mbox.setAttribute('aria-label','People to mention');let mq=null,mIdx=0,mDismiss=null;
  const schip=html('button','sched-chip',I.timerSm+'<span></span>');schip.hidden=true;schip.onclick=openScheduled;
  S.setSchedCount=n=>{schip.hidden=!n;schip.lastChild.textContent=n===1?'1 scheduled message':n+' scheduled messages'};
  // The @mention picker (SPEC.md 12.3): the caret right after "@..." in the editor, matched against the people the
  // page already knows are in this conversation. Nothing is searched or looked up.
  const findMention=()=>{const sel=getSelection();if(!sel.rangeCount||!sel.isCollapsed)return null;const n=sel.anchorNode;if(!n||n.nodeType!==3||!inEd(n))return null;
    const q=mentionQuery(n.nodeValue.slice(0,sel.anchorOffset));return q?{node:n,start:q.start,end:sel.anchorOffset,q:q.q}:null};
  const mentionRows=()=>[...mbox.querySelectorAll('button')];
  const markMention=()=>{const rows=mentionRows();mIdx=Math.max(0,Math.min(mIdx,rows.length-1));
    rows.forEach((b,i)=>{b.classList.toggle('active',i===mIdx);b.setAttribute('aria-selected',String(i===mIdx))});const a=rows[mIdx];if(a&&a.scrollIntoView)a.scrollIntoView({block:'nearest'})};
  const pickMention=h=>{const q=mq;if(!q||!q.node.isConnected)return;const v=q.node.nodeValue,ins=atOf(h)+'\u00a0';q.node.nodeValue=v.slice(0,q.start)+ins+v.slice(q.end);
    const r=document.createRange();r.setStart(q.node,Math.min(q.start+ins.length,q.node.nodeValue.length));r.collapse(true);const s2=getSelection();s2.removeAllRanges();s2.addRange(r);
    mbox.hidden=true;mbox._k=null;mq=null;onInput()};
  const syncMentions=()=>{const cc=convById(cid);if(!cc||isSelf(cc)||document.activeElement!==ed){mbox.hidden=true;return}mq=findMention();
    if(!mq){mDismiss=null;mbox.hidden=true;return}
    if(mDismiss!==null&&mq.q===mDismiss){mbox.hidden=true;return}mDismiss=null;
    const people=t==='dm'?[dmPeer(cc)].filter(h=>h&&h!==S.me.handle):mentionPeople(cc,S.me.handle);
    const opts=mentionMatches(mq.q,people,displayName,6);
    const key=opts.join(',')+'|'+mq.q;if(!mbox.hidden&&mbox._k===key)return;mbox._k=key;   // same list as before: keep the highlighted row
    mbox.replaceChildren();if(!opts.length){mbox.hidden=true;return}
    opts.forEach(h=>{const b=el('button','thread');b.setAttribute('role','option');const m=el('div','t-main');const nm=withBadge(el('div','t-name',displayName(h)),h);
      if(t==='channel')nm.append(el('span','role-sm',h===cc.owner?'owner':'admin'));m.append(nm,el('div','t-sub',atOf(h)));b.append(userAvatar(h,'sm'),m);
      b.addEventListener('mousedown',e=>e.preventDefault());b.addEventListener('pointerdown',e=>e.preventDefault());b.onclick=()=>pickMention(h);mbox.append(b)});
    mIdx=0;markMention();mbox.hidden=false};
  let dT=null;
  const writeDraft=()=>{if(S.editing)return;const v=getText();ls.set(draftKey(cid),v.trim()?v:'')};
  const saveDraft=()=>{clearTimeout(dT);dT=setTimeout(()=>{if(S.chan===cid)writeDraft()},300)};
  S.flushDraft=()=>{clearTimeout(dT);if(ed.isConnected)writeDraft()};
  let files=[],busy=false,rec=null,recT=null;
  const upd=()=>{const emptyTxt=isEmpty(),empty=emptyTxt&&!files.length&&!S.editing;
    mic.hidden=!empty;send.hidden=empty;send.disabled=busy||!S.db;mic.disabled=busy||!S.db;
    const phx=S.editing?'Edit message':files.length?'Add a caption':ph;ed.dataset.ph=phx;ed.setAttribute('aria-label',phx);
    clip.hidden=!!S.editing;if(pollB)pollB.hidden=!!S.editing||!emptyTxt;aa.hidden=emptyTxt&&!fmtPinned};
  function onInput(){if(isEmpty()&&!ed.querySelector('img'))ed.replaceChildren();upd();if(!isEmpty())setTyping(true);syncFmt();syncMentions();saveDraft()}
  ed.addEventListener('focus',()=>{S.stick=true;setTimeout(fitKeyboard,120);setTimeout(fitKeyboard,350)});
  ed.addEventListener('input',onInput);
  const clearEd=()=>{ed.replaceChildren();upd();mbox.hidden=true;clearTimeout(dT);ls.set(draftKey(cid),'')};
  const sync=()=>{cbar.replaceChildren();const r=S.replyTo,e=S.editing;cbar.hidden=!r&&!e;
    if(r||e){const m=el('div','t-main');m.append(el('div','cb-title',e?'Edit message':'Reply to '+displayName(r.from)),el('div','t-sub',e?snippet(e.o):r.snip));
      const x=html('button','icon-btn',I.x);x.setAttribute('aria-label','Cancel');
      x.onclick=()=>{if(S.editing)clearEd();S.replyTo=null;S.editing=null;sync()};
      cbar.append(html('span','cb-ic',e?I.edit:I.reply),m,x)}
    upd()};
  const drawStrip=()=>{strip.replaceChildren();strip.hidden=!files.length;
    files.forEach((x,i)=>{const tile=el('div','st');const k=mediaKind(x.f.type);
      const m=k==='file'?el('div','st-file',x.f.name||'File'):k==='video'?el('video'):el('img');if(k!=='file')m.src=x.url;if(m.tagName==='VIDEO'){m.muted=true;m.playsInline=true;m.preload='metadata'}
      const rm=html('button','st-x',I.xs);rm.setAttribute('aria-label','Remove');rm.disabled=busy;rm.onclick=()=>{if(x.url)URL.revokeObjectURL(x.url);files.splice(i,1);drawStrip();upd()};
      tile.append(m,rm);if(x.f.type==='image/gif')tile.append(el('span','badge','GIF'));strip.append(tile)})};
  const addFiles=list=>{if(S.editing)return;for(const f of list){
      const k=mediaKind(f.type),max=lim().filesPerMessage;
      if(files.length>=max){toast(`Up to ${max} files per message.`);break}
      if(f.size>kindLimit(k)){toast(`${f.name||'That file'} is over the ${fmtLimit(kindLimit(k))} limit for ${k==='gif'?'GIFs':k==='file'?'files':k+'s'}.`);continue}
      files.push({f,url:k==='file'?null:URL.createObjectURL(f)})}
    drawStrip();upd()};
  ed.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&!e.altKey){const k=e.key.toLowerCase(),map=e.shiftKey?{x:'s',m:'code',p:'spoiler'}:{b:'b',i:'i',u:'u',k:'link'};
      if(map[k]){e.preventDefault();applyFmt(map[k]);return}}
    if(!mbox.hidden){const rows=mentionRows();
      if(rows.length&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();mIdx=(mIdx+(e.key==='ArrowDown'?1:rows.length-1))%rows.length;markMention();return}
      if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();const f=rows[mIdx]||rows[0];if(f)f.click();return}
      if(e.key==='Escape'){e.preventDefault();mDismiss=mq?mq.q:'';mbox.hidden=true;return}}
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&matchMedia('(pointer:fine)').matches){e.preventDefault();if(!send.hidden)send.click();return}
    if(e.key==='Escape'&&(S.replyTo||S.editing)){if(S.editing)clearEd();S.replyTo=null;S.editing=null;sync()}});
  ed.addEventListener('paste',e=>{const fs=[...(e.clipboardData?.files||[])];e.preventDefault();
    if(fs.length){addFiles(fs);return}
    const txt=(e.clipboardData&&e.clipboardData.getData('text/plain'))||'';if(!txt)return;
    if(!document.execCommand||!document.execCommand('insertText',false,txt)){const sel=getSelection();if(sel.rangeCount){const r=sel.getRangeAt(0);r.deleteContents();r.insertNode(document.createTextNode(txt));r.collapse(false)}}
    onInput()});
  ed.addEventListener('drop',e=>{if(e.dataTransfer&&e.dataTransfer.files.length)return;e.preventDefault()});
  clip.onclick=()=>{if(!busy)fi.click()};fi.onchange=()=>{addFiles([...fi.files]);fi.value=''};
  p.addEventListener('dragover',e=>e.preventDefault());p.addEventListener('drop',e=>{if(!e.dataTransfer||!e.dataTransfer.files.length)return;e.preventDefault();if(!busy)addFiles([...e.dataTransfer.files])});
  const endRec=()=>{clearInterval(recT);recbar.hidden=true;comp.hidden=false;setTimeout(syncFmt,0);S.recCancel=null;const r=rec;rec=null;return r};
  mic.onclick=async()=>{if(busy||rec)return;
    const r=await startRecording(v=>{rlvl.style.transform=`scaleX(${Math.min(1,.12+v*1.6)})`});if(!r)return;
    rec=r;comp.hidden=true;recbar.hidden=false;fbar.hidden=true;rtime.textContent='0:00';
    recT=setInterval(()=>{const s=(Date.now()-r.t0)/1000;rtime.textContent=fmtDur(s);if(s>=lim().voiceSeconds)rsend.click()},250);
    S.recCancel=()=>{const x=endRec();if(x)x.stop()};if(navigator.vibrate)navigator.vibrate(10)};
  rcancel.onclick=()=>{const x=endRec();if(x)x.stop()};
  rsend.onclick=async()=>{const r=endRec();if(!r)return;const out=await r.stop();
    if(out.dur<.7||!out.blob.size){toast('That was too short. Tap the mic, speak, then tap send.');return}
    if(out.blob.size>lim().voiceBytes){toast('That recording is too long to send.');return}
    const reply=S.replyTo;S.stick=true;busy=true;upd();prog.hidden=false;progress(0,'Encrypting voice message\u2026');
    try{const cc=convById(cid);
      const m={kind:'voice',mime:out.blob.type||'audio/webm',src:out.blob,w:0,h:0,dur:Math.round(out.dur*10)/10,wave:out.wave,chunks:Math.max(1,Math.ceil(out.blob.size/lim().pieceBytes))};
      let done=0;const d=await uploadMedia(cc,m,()=>{done++;progress(done/m.chunks,'Sending\u2026')},mediaExp(cc));
      await sendBody(cid,buildBody({media:[d],reply}));S.replyTo=null;sync()}
    catch(err){toast(sendErr(err))}
    busy=false;prog.hidden=true;upd()};
  const doSend=async at=>{
    const text=getText();if(busy||!S.db)return;
    if(S.editing){const {p:op,o}=S.editing;if(!text.trim()&&!(o.media&&o.media.length))return;
      busy=true;upd();
      try{await editPost(cid,op,o,text);S.editing=null;clearEd();sync()}catch(err){toast(sendErr(err))}
      busy=false;upd();return}
    if(!text.trim()&&!files.length)return;
    const reply=S.replyTo;S.stick=true;
    if(!files.length){const keep=[...ed.childNodes];clearEd();ed.focus();S.replyTo=null;sync();
      try{await sendBody(cid,buildBody({text,reply}),at)}catch(err){ed.replaceChildren(...keep);S.replyTo=reply;sync();saveDraft();toast(sendErr(err))}return}
    busy=true;upd();drawStrip();prog.hidden=false;progress(0,'Encrypting\u2026');
    try{
      const cc=convById(cid),fs=files.map(x=>x.f),prep=[];
      for(let i=0;i<fs.length;i++){progress(0,`Preparing ${i+1} of ${fs.length}\u2026`);prep.push(await prepMedia(fs[i]))}
      const total=prep.reduce((a,m)=>a+m.chunks,0);let done=0;const media=[];
      // three files at a time; the album keeps the order they were picked in
      try{await lanes(prep.length,3,async i=>{media[i]=await uploadMedia(cc,prep[i],()=>{done++;progress(done/total,`Encrypting and uploading\u2026 ${Math.round(done/total*100)}%`)},mediaExp(cc,at))})}
      catch(e){media.filter(Boolean).forEach(d=>S.db.deleteMedia(cc.id,d.id).catch(()=>{}));throw e} // the message won't go: nothing it uploaded stays behind
      progress(1,'Sending\u2026');
      await sendBody(cid,buildBody({text,media,reply}),at);
      files.forEach(x=>URL.revokeObjectURL(x.url));files=[];clearEd();S.replyTo=null;sync();
    }catch(err){toast(sendErr(err))}
    busy=false;prog.hidden=true;drawStrip();upd();
  };
  send.onclick=()=>{if(send._noClick&&Date.now()-send._noClick<600)return;doSend()};
  addLongPress(send,()=>{if(S.editing||busy||!S.db)return;if(isEmpty()&&!files.length){toast('Type a message first, then press and hold send to schedule it.');return}openSchedulePicker(at=>doSend(at))});
  send.title='Send (press and hold to schedule)';
  comp.append(clip,fi);if(pollB)comp.append(pollB);comp.append(aa,ed,send,mic);
  p.append(schip,cbar,mbox,strip,prog,fbar,comp,recbar);
  const dr=ls.get(draftKey(cid),'');if(dr)setText(dr);
  S.comp={sync,syncFmt,setText,focus:()=>{ed.focus();placeCaretEnd()}};upd();S.setSchedCount((S.scheduled||[]).length);
  if(matchMedia('(pointer:fine)').matches)ed.focus();
}
function setReply(p,o){S.editing=null;S.replyTo={id:p._id,from:p.from,snip:snippet(o)};if(S.comp){S.comp.sync();S.comp.focus()}}
function setEdit(p,o){S.replyTo=null;S.editing={p,o};if(S.comp){S.comp.setText(o.text||'');S.comp.sync();S.comp.focus()}}
async function ensureDmDoc(c){ // the first message in a DM creates it: a record with no names, and a sealed pointer for each side
  if(typeOf(c)!=='dm'||S.convs.some(x=>x.id===c.id))return;
  const peer=dmPeer(c),secret=await dmSecret(peer);if(!secret)throw new Error('nokey');
  // Not in my list doesn't mean new: my note for it may have been lost. If the server has it, don't create it again
  // (that is refused); bring it back instead, with fresh notes for both of us.
  const s=await S.db.preview(c.id);
  if(s.exists){const d=Object.assign({id:c.id},s.data());S.chatDocs.set(c.id,d);for(const x of [c,convById(c.id)])if(x){x.epoch=d.epoch||0;x.keys=d.keys||{}}
    S.dmPeers[c.id]=peer;if(!dmInfo(c.id))setDmInfo(c.id,{peer});
    await ensureInbox(Object.assign({},c,{members:[...new Set([S.me.handle,peer])]}),null,true);return}
  const req=peer!==S.me.handle&&!!(S.dir[peer]&&S.dir[peer].requests===true)&&!(dmInfo(c.id)&&dmInfo(c.id).req==='ok');
  await S.db.createChat(c.id,{type:'dm',epoch:0,ts:Date.now(),last:null},{m:await memberCapFrom(c.id,0,secret)});
  S.dmPeers[c.id]=peer;if(req)setDmInfo(c.id,{peer,req:'out'});else if(!dmInfo(c.id))setDmInfo(c.id,{peer});
  await ensureInbox(Object.assign({},c,{members:[...new Set([S.me.handle,peer])],_req:req}));
}
const liveQ=(q,cb,err)=>q.onSnapshotMeta?q.onSnapshotMeta(cb,err):q.onSnapshot(cb,err); // live updates, including "sent" confirmations
const lastOf=p=>({sl:1,id:p._id||p.id,ts:p.ts,e:p.e??0,n:p.n,d:p.d,exp:p.exp||0,edited:p.edited||0,from:null,iv:null,ct:null,sig:null});
const lastUpd=(c,v)=>v; // updating the chat's latest-message marker never says who did it: lastOf() leaves `from` empty
async function sendBody(cid,body,at){
  const c=convById(cid);
  if(awaitingAccept(c)){
    if(typeof body!=='string'||(body[0]==='\u0001'&&(()=>{try{const x=JSON.parse(body.slice(1));return !!(x.media||x.poll||x.fwd)}catch{return true}})()))throw new Error('reqtext');
    if(S.posts.some(x=>x.from===S.me.handle&&!x.svc)||(c.last&&c.last.from===S.me.handle))throw new Error('reqone')}await ensureDmDoc(c);await ensureDmEpoch(c);const p=await sealPost(c,body,at);
  const pid=rid(),stored=await wrapPost(c,p,pid,0);const put=S.db.doc(`channels/${cid}/posts/${pid}`).set(Object.assign({},stored));stored._id=pid;
  if(at&&at>Date.now()+3000){await put;toast('Scheduled for '+fmtWhen(at),'View',()=>openScheduled())}
  else await Promise.all([put,S.db.doc('channels/'+cid).update(lastUpd(c,{ts:p.ts,last:lastOf(stored)}))]); // both go out at once: one trip to the server instead of two
  // The first message from this page in a DM sends both of us a fresh note, in case one was lost: a note that
  // went missing would otherwise never be re-sent, and the chat would stay out of the list. Duplicates are tidied
  // by the recipient.
  const dm=typeOf(c)==='dm'&&!isSelf(c),fresh=dm&&!dmRenoted.has(cid);if(fresh)dmRenoted.add(cid);
  ensureInbox(convById(cid),null,fresh).catch(()=>{});if(dm)recordBase(convById(cid));
  setTyping(false);
}
async function sendNowScheduled(cid,p){
  const c=convById(cid),o=await openPost(c,p);if(o.text==null)throw new Error('decrypt');
  const n=await sealPost(c,buildBody(o),Date.now());
  if(p.sl===1){const k=p.on||0,w=await wrapPost(c,n,p._id,k+1);
    await S.db.doc(`channels/${cid}/posts/${p._id}`).update({ts:w.ts,e:w.e,n:w.n,d:w.d,oh:w.oh,on:w.on,ot:await ownTok(cid,p._id,k),exp:w.exp||0});
    await S.db.doc('channels/'+cid).update({ts:w.ts,last:lastOf(Object.assign(w,{_id:p._id}))});return}
  await S.db.doc(`channels/${cid}/posts/${p._id}`).update({ts:n.ts,e:n.e,iv:n.iv,ct:n.ct,sig:n.sig,exp:n.exp||0});
  await S.db.doc('channels/'+cid).update({ts:n.ts,last:lastOf(n)});
}
function openScheduled(){
  const c=curConv();if(!c)return;const {body,close}=sheet('Scheduled messages');const list=el('div');body.append(list);
  const draw=async()=>{list.replaceChildren();const items=(S.scheduled||[]).slice().sort((a,b)=>a.ts-b.ts);
    if(!items.length){list.append(el('div','empty','Nothing scheduled. Press and hold the send button to schedule a message.'));return}
    for(const p of items){const o=await openPost(c,p);const r=el('div','sched-row');const m=el('div','t-main');
      m.append(el('div','t-name',fmtWhen(p.ts)[0].toUpperCase()+fmtWhen(p.ts).slice(1)),el('div','t-sub',snippet(o)));
      const now=el('button','pill','Send now');now.onclick=async()=>{now.disabled=true;try{await sendNowScheduled(c.id,p);toast('Sent');close()}catch{now.disabled=false;toast('Couldn\u2019t send it. Try again.')}};
      const del=html('button','icon-btn',I.trash);del.setAttribute('aria-label','Delete scheduled message');
      del.onclick=async()=>{if(!confirm('Delete this scheduled message?'))return;try{if(p.sl===1)await removeOwn(c.id,p);else await S.db.doc(`channels/${c.id}/posts/${p._id}`).delete();S.scheduled=S.scheduled.filter(x=>x._id!==p._id);draw()}catch{toast('Couldn\u2019t delete it.')}};
      r.append(m,now,del);list.append(r)}};
  draw();body.append(el('p','hint','Scheduled messages are encrypted now and appear for everyone at the chosen time, even if you\u2019re offline.'));
}
function openSchedulePicker(onPick){
  const {body,close}=sheet('Schedule message');const now=new Date();
  const opts=[];const inH=new Date(Date.now()+3600e3);opts.push(['In 1 hour',inH]);
  const tonight=new Date(now);tonight.setHours(21,0,0,0);if(tonight-now>15*60e3)opts.push(['Tonight at '+fmtTime(tonight),tonight]);
  const tom=new Date(now);tom.setDate(now.getDate()+1);tom.setHours(9,0,0,0);opts.push(['Tomorrow at '+fmtTime(tom),tom]);
  opts.forEach(([l,d])=>{const b=html('button','menu-item flush',I.timer+`<span>${l}</span>`);b.onclick=()=>{close();onPick(d.getTime())};body.append(b)});
  const f=el('label','field');const inp=el('input');inp.type='datetime-local';
  const pad=n=>String(n).padStart(2,'0'),loc=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const min=new Date(Date.now()+2*60e3);inp.min=loc(min);inp.value=loc(new Date(Date.now()+3600e3));f.append(el('span',null,'Or pick a date and time'),inp);
  const go=el('button','primary','Schedule');go.style.width='100%';const err=el('div','err');body.append(f,go,err);
  go.onclick=()=>{const t=new Date(inp.value).getTime();if(!t||t<Date.now()+60e3){err.textContent='Pick a time at least a couple of minutes from now.';return}
    if(t>Date.now()+365*864e5){err.textContent='Pick a time within the next year.';return}close();onPick(t)};
}
async function editPost(cid,p,o,text){
  const c=convById(cid),n=await sealPost(c,buildBody({text,media:o.media,poll:o.poll,reply:o.reply,fwd:o.fwd}),p.ts,p.exp||0),edited=Date.now();
  if(p.sl===1){const k=p.on||0,w=await wrapPost(c,n,p._id,k+1);
    await S.db.doc(`channels/${cid}/posts/${p._id}`).update({e:w.e,n:w.n,d:w.d,oh:w.oh,on:w.on,ot:await ownTok(cid,p._id,k),edited});
    if(c.last&&c.last.sig===p.sig)await S.db.doc('channels/'+cid).update({last:lastOf(Object.assign(w,{_id:p._id,edited}))});return}
  await S.db.doc(`channels/${cid}/posts/${p._id}`).update({e:n.e,iv:n.iv,ct:n.ct,sig:n.sig,edited});
  if(c.last&&c.last.sig===p.sig)await S.db.doc('channels/'+cid).update({last:lastOf(Object.assign(n,{edited}))});
}
async function deletePost(cid,p){
  const c=convById(cid);
  if(c)openPost(c,p).then(o=>{for(const m of o.media||[])S.db.deleteMedia(cid,m.id).catch(()=>{})}).catch(()=>{}); // its files go too
  if(p.sl===1&&p.from===S.me.handle)await removeOwn(cid,p);else await S.db.doc(`channels/${cid}/posts/${p._id}`).delete();
  if(c.last&&c.last.sig===p.sig){const rest=S.posts.filter(x=>x._id!==p._id),l=rest[rest.length-1];
    await S.db.doc('channels/'+cid).update(lastUpd(c,{last:l?lastOf(l):null}))}
}
const sendErr=err=>err&&err.code==='quota_exceeded'?'Storage is full. Older posts need clearing before new ones can be sent.'
  :err&&err.message==='nokey'?'This phone doesn\u2019t have this chat\u2019s key yet. An admin\u2019s phone will add it when they next open the chat.'
  :err&&err.message==='reqtext'?'Only a text message can be sent as a request. Photos and files can be sent once they accept.'
  :err&&err.message==='reqone'?'Your request was sent. You can send more once they accept.'
  :err&&err.message==='decode'?'One of those files couldn\u2019t be read. Try a JPG, PNG, GIF or MP4.'
  :err&&err.code==='full'?'There\u2019s no room for more files in this chat right now. Delete some older media, or try again later.'
  :err&&(err.code==='toolarge'||err.message==='toolarge')?'That file is too large to send.'
  :err&&err.code==='denied'?'You can\u2019t send files in this chat.'
  :'Not sent. Check your connection and try again.';

/* ---------- media: each file encrypted under its own key, in pieces, sent over HTTP (SPEC.md 7.7) ---------- */
// Media limits come from the server (GET /media/limits, set in one place in server/src/limits.js); these are its
// defaults, used until it answers.
const ML_DEFAULT={pieceBytes:1<<20,imageBytes:25e6,gifBytes:15e6,videoBytes:500e6,videoAutoBytes:50e6,fileBytes:500e6,voiceSeconds:900,voiceBytes:15e6,filesPerMessage:10,chatBytes:2e9,maxPieces:477};
const lim=()=>Object.assign({},ML_DEFAULT,(S.db&&S.db.limits)||{});
const MAX_FILES=100; // the most attachments a received message may list; what may be sent is lim().filesPerMessage
const SAFE_MIME=/^(image\/(jpeg|png|gif|webp|heic|heif|avif)|video\/[\w.+-]+|audio\/[\w.+-]+)$/;
const mediaKind=t=>t==='image/gif'?'gif':/^image\/(jpeg|png|webp|avif|heic|heif|bmp)$/.test(t)?'image':t.startsWith('video/')?'video':'file';
const kindLimit=k=>{const L=lim();return k==='gif'?L.gifBytes:k==='image'?L.imageBytes:k==='video'?L.videoBytes:L.fileBytes};
const cleanName=s=>String(s||'').replace(/[\u0000-\u001f\u007f/\\]/g,'_').replace(/^\.+/,'').slice(0,200)||'file';
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const retryable=e=>!e||['offline','ratelimit','internal','timeout'].includes(e.code)||/^http5/.test(e.code||'');
// Runs fn(0..n-1) on a few lanes; the first failure stops the rest from starting new work.
async function lanes(n,k,fn){let next=0,err=null;
  const lane=async()=>{while(next<n&&!err){const i=next++;try{await fn(i)}catch(e){if(!err)err=e}}};
  await Promise.all(Array.from({length:Math.min(k,n)},lane));if(err)throw err}
// When the media of a message to a chat with disappearing messages may be swept: a little after the message itself.
const mediaExp=(c,at)=>c&&c.ttl?(at||Date.now())+c.ttl*1000+10*60e3:0;
// Reads what's needed to show an attachment (no preview image: media is shown at full quality or not at all). The bytes themselves stay in the file (`src`) and are read piece by
// piece while uploading, so a large video is never held in memory whole. Video is sent exactly as recorded: never
// re-encoded, resized or compressed. Photos larger than 4096 px are scaled down to stay sendable.
async function prepMedia(file){
  let kind=mediaKind(file.type),mime=file.type,w=0,h=0,dur=0,src=file;
  if(kind==='video'){
    const url=URL.createObjectURL(file),v=document.createElement('video');v.muted=true;v.playsInline=true;v.preload='metadata';v.src=url;
    await new Promise(r=>{v.onloadedmetadata=r;v.onerror=r;setTimeout(r,6000)});
    w=v.videoWidth;h=v.videoHeight;dur=isFinite(v.duration)?v.duration:0;URL.revokeObjectURL(url);
    if(!w){w=16;h=9}if(!mime)mime='video/mp4';
  }else if(kind==='image'||kind==='gif'){
    const bmp=await createImageBitmap(file).catch(()=>null);
    if(!bmp)kind='file'; // a picture this browser can't open still goes, as a file
    else{w=bmp.width;h=bmp.height;
      const web=['image/jpeg','image/png','image/webp'].includes(file.type);
      if(kind==='image'&&(file.size>8e6||Math.max(w,h)>4096||!web)){ // keep it HD (up to 4096px) but sendable
        const s=Math.min(1,4096/Math.max(w,h)),cv=document.createElement('canvas');cv.width=Math.round(w*s);cv.height=Math.round(h*s);
        cv.getContext('2d').drawImage(bmp,0,0,cv.width,cv.height);
        const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',.92));if(!blob)throw new Error('decode');
        src=blob;mime='image/jpeg';w=cv.width;h=cv.height}}
  }
  const m={kind,mime:kind==='file'?(file.type||'application/octet-stream'):mime,src,w,h,dur,chunks:Math.max(1,Math.ceil(src.size/lim().pieceBytes))};
  if(kind==='file')m.name=cleanName(file.name);
  return m;
}
// Encrypts and uploads one attachment (m.src, a Blob) under a fresh key of its own, four pieces at a time, each
// retried a few times. An upload that can't finish removes what it had stored. Returns the descriptor that goes,
// sealed, into the message. `exp` (ms) lets the server sweep it with a disappearing message.
async function uploadMedia(c,m,tick,exp){
  if(S.db)await ensureDmDoc(c);await ensureDmEpoch(c);
  const L=lim(),size=m.src.size,n=Math.max(1,Math.ceil(size/L.pieceBytes));if(n>L.maxPieces)throw new Error('toolarge');
  const mid='m'+rid(),{k,key}=await newMediaKey(),hashes=new Array(n);
  try{await lanes(n,4,async i=>{
    const plain=new Uint8Array(await m.src.slice(i*L.pieceBytes,Math.min(size,(i+1)*L.pieceBytes)).arrayBuffer());
    hashes[i]=await pieceHash(plain);const body=await sealPiece(key,i,n,plain);
    for(let a=0;;a++){try{await S.db.putPiece(c.id,mid,i,body,exp||0);break}catch(e){if(a>=3||!retryable(e))throw e;await pause(600*2**a)}}
    tick(i)})}
  catch(e){S.db.deleteMedia(c.id,mid).catch(()=>{});throw e}
  const d={id:mid,v:2,k,kind:m.kind,mime:m.mime,size,w:m.w||0,h:m.h||0,dur:m.dur||0,chunks:n,hash:await mediaRoot(hashes)};
  if(m.wave)d.wave=m.wave;if(m.name)d.name=m.name;return d;
}
async function getPiece(cid,mid,i){for(let a=0;;a++){try{return await S.db.getPiece(cid,mid,i)}catch(e){if(a>=3||!retryable(e))throw e;await pause(600*2**a)}}}
// Downloads, decrypts and checks an attachment; resolves to a blob: URL. `onProg(f)` reports progress (0..1).
// Each piece becomes a Blob of its own as soon as it is open, so the browser can keep a large file out of memory.
function loadMedia(c,m,e,onProg){
  if(!S.media.has(m.id))S.media.set(m.id,(async()=>{
    const n=m.chunks|0;if(n<1||n>100000)throw 0;
    const type=m.kind==='file'||!SAFE_MIME.test(m.mime)?'application/octet-stream':m.mime;   // a file is never opened in the page
    const parts=new Array(n);let done=0;const step=()=>{done++;if(onProg)onProg(done/n)};
    if(m.v===2){const key=await mediaKeyOf(m.k),hashes=new Array(n);
      await lanes(n,4,async i=>{const plain=await openPiece(key,i,n,await getPiece(c.id,m.id,i));hashes[i]=await pieceHash(plain);parts[i]=new Blob([plain]);step()});
      if(await mediaRoot(hashes)!==m.hash)throw 0} // matches the signed message
    else{const ck=await convKey(c,e);if(!ck)throw 0; // sent before stage 6: the chat's own key, and a hash of the whole file
      await lanes(n,4,async i=>{const b=await getPiece(c.id,m.id,i);
        parts[i]=new Blob([await crypto.subtle.decrypt({name:'AES-GCM',iv:b.subarray(0,12),additionalData:enc.encode(m.id+':'+i)},ck.key,b.subarray(12))]);step()});
      if(b64(await crypto.subtle.digest('SHA-256',await new Blob(parts).arrayBuffer()))!==m.hash)throw 0}
    const blob=new Blob(parts,{type});S.mediaBlobs.set(m.id,blob);return URL.createObjectURL(blob);
  })().catch(e=>{S.media.delete(m.id);throw e}));
  return S.media.get(m.id);
}
const lq=[];let lActive=0;
function queued(fn){return new Promise((res,rej)=>{lq.push([fn,res,rej]);pumpQ()})}
function pumpQ(){while(lActive<3&&lq.length){const [fn,res,rej]=lq.shift();lActive++;fn().then(res,rej).finally(()=>{lActive--;pumpQ()})}}
/* Photos and videos download by themselves once their message is on screen or within about a screen of it, so
   they are usually ready by the time you see them; messages far off screen wait until you scroll near. The
   observer watches the scrolling list the media sits in (the chat, or the shared-media grid). */
const nearObs=new WeakMap();
function whenNear(node,fn){
  if(typeof IntersectionObserver==='undefined'){fn();return}
  let tries=0;const go=()=>{if(!node.isConnected){if(++tries<120)requestAnimationFrame(go);return}
    let root=node.parentElement;while(root&&root!==document.body&&!/(auto|scroll)/.test(getComputedStyle(root).overflowY))root=root.parentElement;
    if(!root||root===document.body)root=null;const k=root||document;
    let io=nearObs.get(k);
    if(!io){io=new IntersectionObserver(es=>es.forEach(x=>{if(!x.isIntersecting)return;io.unobserve(x.target);const f=x.target._near;x.target._near=null;if(f)f()}),{root,rootMargin:'100% 0px'});nearObs.set(k,io)}
    node._near=fn;io.observe(node)};
  go()}
const fmtDur=s=>{s=Math.round(s||0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0')};
const fmtSize=b=>b>=1e6?(b/1e6).toFixed(1)+' MB':Math.max(1,Math.round(b/1e3))+' KB';
function saveAs(url,name){const a=el('a');a.href=url;a.download=cleanName(name);a.rel='noopener';document.body.append(a);a.click();a.remove()}
const fmtLimit=b=>b>=1e9?+(b/1e9).toFixed(1)+' GB':Math.round(b/1e6)+' MB';
function fileNode(c,m,e){ // any other file: a card with a Download button; it is saved, never opened in the page
  const w=el('div','filecard');w.onclick=ev=>ev.stopPropagation();
  const main=el('div','fc-main');main.append(el('div','fc-name',m.name||'File'),el('div','fc-sub',fmtSize(m.size||0)));
  const btn=el('button','secondary fc-btn','Download');
  btn.onclick=async()=>{btn.disabled=true;btn.textContent='0%';
    try{const url=await loadMedia(c,m,e,f=>{btn.textContent=Math.floor(f*100)+'%'});saveAs(url,m.name||'file');btn.textContent='Download'}
    catch{toast('Couldn’t download this file. Check your connection and try again.');btn.textContent='Download'}
    btn.disabled=false};
  w.append(html('span','fc-ic',I.clip),main,btn);return w}
/* One photo or video in a message or in the shared-media grid. It downloads by itself once it is near the screen;
   a video larger than videoAutoBytes (server/src/limits.js) waits for a tap. A tap opens the full-screen viewer:
   `open` (the viewer over a whole album), or a viewer of just this item. */
function mediaNode(c,m,single,e,open){
  if(m.kind==='voice')return voiceNode(c,m,e);
  if(m.kind==='file')return fileNode(c,m,e);
  const box=el('div','media'+(single?' one':' tile'));
  if(single){const r=Math.min(2.2,Math.max(.6,(m.w||16)/(m.h||9)));box.style.aspectRatio=String(r)}
  box.setAttribute('role','button');box.setAttribute('aria-label',m.kind==='video'?'Play video':'View full size');
  const view=open||(()=>viewer(c,[{m,e}],0));
  // Until it is ready: a plain neutral box of the right shape with a small spinner, never a blurred preview.
  const spin=el('span','spin');box.append(spin);
  const fail=()=>{spin.remove();box.append(el('span','badge err-b','Couldn\u2019t load'))};
  if(m.kind==='video'){
    const about=(m.dur>0?fmtDur(m.dur)+'  ':'')+fmtSize(m.size||0),info=el('span','badge pct',about),mark=()=>{if(!box.querySelector('.vmark'))box.append(html('span','vmark',I.play))};
    const auto=(m.size||0)<=lim().videoAutoBytes;let job=null;
    const fetchIt=()=>job||(job=(box.querySelector('.err-b')?.remove(),loadMedia(c,m,e,f=>{info.textContent=Math.floor(f*100)+'%'})).then(url=>{
      const v=el('video');v.src=url;v.muted=true;v.playsInline=true;v.preload='auto'; // its first frame, at full quality; it plays in the viewer
      spin.remove();info.textContent=about;box.prepend(v);mark();return url}).catch(err=>{job=null;info.textContent=about;fail();throw err}));
    box.append(info);
    if(auto)whenNear(box,()=>fetchIt().catch(()=>{}));else{spin.remove();mark()}
    box.onclick=ev=>{ev.stopPropagation();fetchIt().catch(()=>{});view()};
  }else{
    if(m.kind==='gif')box.append(el('span','badge','GIF'));
    whenNear(box,()=>queued(()=>loadMedia(c,m,e)).then(url=>{const img=el('img');img.alt='';img.src=url;img.onload=()=>spin.remove();box.prepend(img)}).catch(fail));
    box.onclick=ev=>{ev.stopPropagation();view()};
  }
  return box;
}
/* An album: a message's photos and videos as one tiled block (Telegram style). Rows hold up to four items; each
   item's width follows its shape, so every row comes out at one even height. The caption goes underneath. */
const ALBUM_ROWS={2:[2],3:[1,2],4:[2,2],5:[2,3],6:[3,3],7:[2,2,3],8:[2,3,3],9:[3,3,3],10:[3,3,4]};
// On desktop, how wide a message showing these photos and videos is: a lone item keeps its own shape within
// 420 x 460 and is never blown up past its real size (but stays at least 160 wide where that fits), so the bubble
// hugs the picture; an album is a 420-wide block. Phones keep the full-width layout.
const MEDIA_MAX_W=420,MEDIA_MAX_H=460,MEDIA_MIN_W=160;
function mediaFitWidth(vis){
  if(vis.length!==1)return MEDIA_MAX_W;
  const m=vis[0],r=Math.min(2.2,Math.max(.6,(m.w||16)/(m.h||9)));let w=Math.min(MEDIA_MAX_W,MEDIA_MAX_H*r);
  if(m.w&&m.w<w)w=Math.max(m.w,Math.min(MEDIA_MIN_W,MEDIA_MAX_H*r));
  return Math.round(w)}
function albumNode(c,items,e){
  const n=items.length,al=el('div','album'+(n===1?' one':' multi')),list=items.map(m=>({m,e})),open=i=>()=>viewer(c,list,i);
  if(n===1){al.append(mediaNode(c,items[0],true,e,open(0)));return al}
  const rows=(ALBUM_ROWS[n]||ALBUM_ROWS[10]).slice();for(let left=n-10;left>0;left-=3)rows.push(Math.min(3,left));
  let k=0;
  for(const cnt of rows){const row=el('div','arow');
    for(let j=0;j<cnt&&k<n;j++,k++){const m=items[k],r=(m.w||1)/(m.h||1),ar=cnt===1?Math.min(2.2,Math.max(.8,r)):Math.min(2.4,Math.max(.5,r));
      const t=mediaNode(c,m,false,e,open(k));t.style.flex=ar+' 1 0';t.style.aspectRatio=String(ar);row.append(t)}
    al.append(row)}
  return al;
}
function stopOtherAudio(a){if(S.audio&&S.audio!==a)S.audio.pause();S.audio=a}
function voiceNode(c,m,e){
  const w=el('div','voice');w.onclick=ev=>ev.stopPropagation();
  const btn=html('button','vplay',I.play);btn.setAttribute('aria-label','Play voice message');
  const wave=m.wave&&m.wave.length?m.wave:Array(36).fill(6);
  const bars=el('div','vbars');wave.forEach(v=>{const s=el('span');s.style.height=Math.max(3,Math.round(v/31*24))+'px';bars.append(s)});
  const time=el('span','vtime',fmtDur(m.dur));const mid=el('div','vmid');mid.append(bars,time);w.append(btn,mid);
  let audio=null;
  const total=()=>audio&&isFinite(audio.duration)&&audio.duration?audio.duration:(m.dur||1);
  const paint=f=>{const n=Math.round(f*wave.length);[...bars.children].forEach((s,i)=>s.classList.toggle('on',i<n))};
  bars.onclick=ev=>{if(!audio)return;const r=bars.getBoundingClientRect();audio.currentTime=Math.max(0,Math.min(1,(ev.clientX-r.left)/r.width))*total()};
  btn.onclick=async()=>{
    if(audio){if(audio.paused){stopOtherAudio(audio);audio.play().catch(()=>{})}else audio.pause();return}
    btn.replaceChildren(el('span','spin sm'));
    try{const url=await loadMedia(c,m,e);audio=new Audio(url);
      audio.onplay=()=>{btn.innerHTML=I.pause;btn.setAttribute('aria-label','Pause')};
      audio.onpause=()=>{btn.innerHTML=I.play;btn.setAttribute('aria-label','Play voice message')};
      audio.ontimeupdate=()=>{paint(audio.currentTime/total());time.textContent=fmtDur(audio.currentTime)};
      audio.onended=()=>{paint(0);time.textContent=fmtDur(m.dur)};
      stopOtherAudio(audio);await audio.play();
    }catch{btn.innerHTML=I.play;audio=null;toast('Couldn\u2019t play this voice message.')}
  };
  return w;
}
async function startRecording(onLevel){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){toast('Voice messages aren\u2019t supported in this browser.');return null}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}
  catch(e){toast(e&&e.name==='NotAllowedError'?'Microphone access was blocked. Allow it for this page to record voice messages.':'The microphone isn\u2019t available here.');return null}
  // AAC in MP4 first: every browser and phone plays it. Opus in WebM where AAC can't be recorded (older iPhones
  // may not play that one). 32 kb/s is plenty for speech: 15 minutes is under 4 MB.
  const mime=['audio/mp4;codecs=mp4a.40.2','audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||'';
  let rec;try{rec=new MediaRecorder(stream,Object.assign({audioBitsPerSecond:32000},mime?{mimeType:mime}:{}))}catch{stream.getTracks().forEach(t=>t.stop());toast('Recording isn\u2019t supported in this browser.');return null}
  const parts=[],levels=[];rec.ondataavailable=e=>{if(e.data&&e.data.size)parts.push(e.data)};
  let ac=null,iv=null;
  try{ac=new (window.AudioContext||window.webkitAudioContext)();const an=ac.createAnalyser();an.fftSize=512;ac.createMediaStreamSource(stream).connect(an);const buf=new Uint8Array(an.fftSize);
    iv=setInterval(()=>{an.getByteTimeDomainData(buf);let pk=0;for(const v of buf)pk=Math.max(pk,Math.abs(v-128));levels.push(pk/128);onLevel&&onLevel(pk/128)},100)}catch{}
  rec.start(250);const t0=Date.now();
  const stop=()=>new Promise(res=>{
    const fin=()=>{clearInterval(iv);stream.getTracks().forEach(t=>t.stop());if(ac)ac.close().catch(()=>{});
      res({blob:new Blob(parts,{type:(rec.mimeType||mime||'audio/webm').split(';')[0]}),dur:(Date.now()-t0)/1000,wave:waveBars(levels,36)})};
    if(rec.state==='inactive')fin();else{rec.onstop=fin;rec.stop()}});
  return {stop,t0};
}
function waveBars(levels,n){if(!levels.length)return Array(n).fill(4);const out=[];
  for(let i=0;i<n;i++){const a=Math.floor(i*levels.length/n),b=Math.max(a+1,Math.floor((i+1)*levels.length/n));let m=0;for(let j=a;j<b&&j<levels.length;j++)m=Math.max(m,levels[j]);out.push(m)}
  const mx=Math.max(...out,.04);return out.map(v=>Math.max(2,Math.round(v/mx*31)))}
/* Full screen, one photo or video at a time: swipe sideways (or the arrows, or the arrow keys) to move through the
   album, swipe down or press Escape to close. Videos play here with sound and controls. Neighbours are fetched
   ahead, except videos over the auto-load size. */
function viewer(c,items,start){
  const n=items.length;let i=Math.max(0,Math.min(n-1,start)),seq=0,sx=null,sy=0,swiped=false;
  const o=el('div','lightbox viewer'),stage=el('div','lb-stage'),count=el('div','lb-count');
  const x=html('button','icon-btn lb-x',I.x),prev=html('button','icon-btn lb-nav lb-prev',I.back),next=html('button','icon-btn lb-nav lb-next',I.back);
  x.setAttribute('aria-label','Close');prev.setAttribute('aria-label','Previous');next.setAttribute('aria-label','Next');
  const stopAll=()=>stage.querySelectorAll('video').forEach(v=>v.pause());
  const show=()=>{const my=++seq,{m,e}=items[i];stopAll();
    count.textContent=(i+1)+' / '+n;count.hidden=n<2;prev.hidden=i===0;next.hidden=i===n-1;o.dataset.i=String(i);
    const pct=el('div','lb-pct');stage.replaceChildren(el('span','spin'),pct);
    loadMedia(c,m,e,f=>{if(my===seq)pct.textContent=Math.floor(f*100)+'%'}).then(url=>{if(my!==seq)return;let node;
      if(m.kind==='video'){node=el('video');node.src=url;node.controls=true;node.playsInline=true;node.autoplay=true;
        node.onerror=()=>{const sv=el('button','secondary','This video can’t play here. Download it');sv.onclick=ev=>{ev.stopPropagation();saveAs(url,'video')};stage.replaceChildren(sv)}}
      else{node=el('img');node.src=url;node.alt=''}
      stage.replaceChildren(node);if(node.play)node.play().catch(()=>{})})
    .catch(()=>{if(my===seq)stage.replaceChildren(el('div','lb-err','Couldn’t load this. Check your connection.'))});
    for(const j of [i+1,i-1]){const it=items[j];if(it&&(it.m.kind!=='video'||(it.m.size||0)<=lim().videoAutoBytes))loadMedia(c,it.m,it.e).catch(()=>{})}};
  const go=d=>{const j=i+d;if(j<0||j>=n)return;i=j;show()};
  const key=ev=>{if(ev.key==='Escape')close();else if(ev.key==='ArrowLeft')go(-1);else if(ev.key==='ArrowRight')go(1)};
  const layer={kind:'viewer',alive:()=>o.isConnected,close:()=>close()};
  const close=()=>{seq++;stopAll();o.remove();document.removeEventListener('keydown',key);NAV.closed(layer)};NAV.open(layer);
  o.addEventListener('pointerdown',ev=>{const v=ev.target.tagName==='VIDEO'?ev.target:null; // not a drag along a video's controls
    sx=v&&ev.offsetY>v.clientHeight-70?null:ev.clientX;sy=ev.clientY});
  o.addEventListener('pointerup',ev=>{if(sx==null)return;const dx=ev.clientX-sx,dy=ev.clientY-sy;sx=null;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5){swiped=true;go(dx<0?1:-1)}
    else if(dy>110&&dy>Math.abs(dx)*1.5){swiped=true;close()}});
  o.onclick=ev=>{if(swiped){swiped=false;return}if(ev.target===o||ev.target===stage)close()};
  prev.onclick=ev=>{ev.stopPropagation();go(-1)};next.onclick=ev=>{ev.stopPropagation();go(1)};x.onclick=ev=>{ev.stopPropagation();close()};
  document.addEventListener('keydown',key);o.append(stage,prev,next,count,x);document.body.append(o);show();
}
function mediaLabel(m){if(!m||!m.length)return '';const k=new Set(m.map(x=>x.kind)),n=m.length;
  if(k.size===1&&k.has('voice'))return n>1?n+' voice messages':'Voice message';
  if(k.size===1&&k.has('file'))return n>1?n+' files':(m[0].name||'File');
  return k.size>1?n+' media':k.has('video')?(n>1?n+' videos':'Video'):k.has('gif')?(n>1?n+' GIFs':'GIF'):(n>1?n+' photos':'Photo')}
function previewText(pv){if(!pv||pv.text==null)return 'Encrypted message';if(pv.poll)return 'Poll: '+pv.poll.q;const l=mediaLabel(pv.media),t=plainText(pv.text);return l?l+(t?', '+t:''):t}
const snippet=o=>!o||o.text==null?'Message':o.poll?'Poll: '+o.poll.q:o.text?plainText(o.text).slice(0,100):mediaLabel(o.media)||'Message';
function buildBody(o){
  const rich=(o.media&&o.media.length)||o.poll||o.reply||o.fwd||o.on;if(!rich)return o.text||'';
  const x={text:o.text||''};if(o.media&&o.media.length)x.media=o.media;if(o.poll)x.poll=o.poll;if(o.reply)x.reply=o.reply;if(o.fwd)x.fwd=o.fwd;if(o.on)x.on=o.on;
  return '\u0001'+JSON.stringify(x);
}
function toggleChatMenu(items){
  const ex=$('.popmenu');if(ex){ex.remove();return}
  const m=el('div','popmenu');
  items.forEach(it=>{const b=html('button','menu-item',it.icon);b.append(el('span',null,typeof it.label==='function'?it.label():it.label));b.onclick=()=>{m.remove();it.fn()};m.append(b)});
  $('#chatPane').append(m);
  setTimeout(()=>document.addEventListener('click',function h(e){if(!m.contains(e.target)){m.remove();document.removeEventListener('click',h)}}),0);
}
let msgSeq=0;
const readCount=p=>{const c=curConv();if(!c)return 0;return Object.entries(S.reads).filter(([h,ts])=>h!==p.from&&ts>=p.ts&&(c.members||[]).includes(h)).length};
async function renderConv(){
  const box=$('#msgs');if(!box)return;const seq=++msgSeq,c=curConv();if(!c)return;
  const opened=await Promise.all(S.posts.map(p=>openPost(c,p)));
  if(seq!==msgSeq||!$('#msgs'))return;
  const t=typeOf(c),ids=S.posts.map(p=>p._id),key=c.id+'|'+S.serverView+'|'+(c.ttl||0);let R=S.rendered;
  const reuse=R&&R.key===key&&R.box===box&&R.ids.length&&R.ids.length<=ids.length&&R.ids.every((id,i)=>ids[i]===id);
  if(!reuse){
    box.replaceChildren();R=S.rendered={key,box,ids:[],lastDay:'',last:null,nodes:new Map()};
    if(!S.allLoaded&&S.posts.length){const ch=el('button','chip older-chip','Load earlier messages');ch.onclick=loadOlder;box.append(ch)}
    if(S.serverView)box.append(el('div','chip','Server view is on: this is all the server ever stores. Turn it off in Settings.'));
    if(t!=='dm'){const ch=(c.members||[]).filter(keyChanged);if(ch.length){const k=html('button','keychip',I.shield);k.append(el('span',null,`Security code changed for ${ch.slice(0,3).map(displayName).join(', ')}${ch.length>3?' and others':''}. Tap to review.`));k.onclick=()=>openProfile(ch[0]);box.append(k)}}
    if(c.ttl)box.append(html('div','chip ttl-chip',I.timerSm+`<span>New messages disappear after ${ttlLabel(c.ttl).toLowerCase()}</span>`));
    if(!S.posts.length){
      const n=el('div','notice');n.innerHTML=isSelf(c)?I.bookmarkBig:t==='channel'?I.megaBig:I.lockBig;
      n.append(el('div',null,isSelf(c)?'Saved Messages is your private notepad. Forward messages here, or save notes, links, photos and voice memos. Only you can read them.'
        :t==='dm'?`Messages with ${convTitle(c)} are end-to-end encrypted. Tap their name to see their profile and verify your safety number.`
        :t==='group'?'Messages in this group are end-to-end encrypted. Only members can read them. Say hi!'
        :isAdmin(c)?'Your channel is ready. Post text, HD photos, GIFs, videos, voice and polls. Each one is encrypted with a key only your subscribers hold.'
        :'No posts yet. When '+displayName(c.owner)+' broadcasts, posts will show up here.'));
      box.append(n);return;
    }
  }
  let added=0;
  S.posts.forEach((p,i)=>{
    const o=opened[i],ex=R.nodes.get(p._id);
    if(ex){
      if(ex._sig!==p.sig){const n=msgNode(c,p,o,ex._cont);if(!ex.querySelector('.bubble.tail'))n.querySelector('.bubble')?.classList.remove('tail');ex.replaceWith(n);R.nodes.set(p._id,n);if(R.last&&R.last.node===ex)R.last.node=n}
      else if(ex._pending&&!p._pending){ex._pending=false;ex._refresh&&ex._refresh()}
      return;
    }
    const day=fmtDay(p.ts);if(day!==R.lastDay){box.append(el('div','chip',day));R.lastDay=day;R.last=null}
    let node;
    if(p.svc){node=el('div','chip svc');const who=p.from===S.me.handle?'You':displayName(p.from);
      node.textContent=p.svc==='pin'?`${who} pinned a message`:p.svc==='join'?`${who} joined`:p.svc==='leave'?`${who} left`:p.svc==='accept'?`${who} accepted the message request`
        :`${who} ${p.v?'set messages to disappear after '+ttlLabel(p.v).toLowerCase():'turned off disappearing messages'}`;R.last=null}
    else if(hiddenPost(p,o)){node=msgNode(c,p,o,false);R.last=null}
    else{const cont=!!(R.last&&R.last.from===p.from&&t!=='channel');
      if(cont)R.last.node.querySelector('.bubble')?.classList.remove('tail');
      node=msgNode(c,p,o,cont);R.last={from:p.from,node};if(p.from!==S.me.handle)added++}
    if(reuse)node.classList.add('pop');
    R.nodes.set(p._id,node);box.append(node);
  });
  R.ids=ids;refreshNodes();
  if(S.keepScroll){box.scrollTop=box.scrollHeight-S.keepScroll.h+S.keepScroll.top;S.keepScroll=null;S.stick=false}
  else if(S.stick)box.scrollTop=box.scrollHeight;else if(reuse&&added&&S.setNewBelow)S.setNewBelow(S.newBelow+added);
}
function msgNode(c,p,o,cont){
  if(hiddenPost(p,o)){
    if(!o.known&&validHandle(p.from))loadDir([p.from]).then(ch=>{if(ch&&S.chan===c.id){S.rendered=null;renderConv()}}).catch(()=>{});
    const n=el('div','chip svc',o.known?'A message that couldn\u2019t be verified was hidden.':'Checking who sent a message\u2026');n.dataset.id=p._id;n._sig=p.sig;return n}
  const t=typeOf(c),mine=p.from===S.me.handle,side=t==='channel'||mine?'right':'left',self=isSelf(c);
  const media=!S.serverView&&o.text!=null?o.media||[]:[],vis=media.filter(m=>m.kind!=='voice'&&m.kind!=='file'),voices=media.filter(m=>m.kind==='voice'),docs=media.filter(m=>m.kind==='file');
  const wide=vis.length||(!S.serverView&&o.poll);
  const wrap=el('div','msg '+side+(cont?' cont':'')+(wide?' wide':''));wrap.dataset.id=p._id;
  if(vis.length){wrap.classList.add('fit');wrap.style.setProperty('--mw',mediaFitWidth(vis)+'px')}
  const b=el('div','bubble tail'+(mine&&t!=='channel'?' out':'')+(t==='group'&&!mine&&o.text&&mentionsMe(o.text)?' mentioned':''));
  if(t==='channel')b.append(el('div','post-from',c.name));
  else if(t==='group'&&!mine&&!cont){const n=el('div','post-from',displayName(p.from));n.style.color=`hsl(${hue(p.from)} 55% 46%)`;withBadge(n,p.from);if(isAdminH(c,p.from))n.append(el('span','role-sm',p.from===c.owner?'owner':'admin'));b.append(n)}
  const parts=[];
  if(S.serverView)b.append(el('span','cipher',p.ct.slice(0,160)+'\u2026'));
  else if(o.text==null)b.append(el('span','bad',o.nokey?'Sent before this device was added, so its key isn\u2019t on this device.':'Couldn\u2019t decrypt this message.'));
  else{
    if(o.fwd){const f=html('div','fwd',I.fwdSm+'<span></span>');f.lastChild.textContent='Forwarded from '+o.fwd.name;b.append(f)}
    if(o.reply){const q=el('button','quote');q.append(withBadge(el('span','q-from',displayName(o.reply.from)),o.reply.from),el('span','q-text',o.reply.snip));
      q.onclick=e=>{e.stopPropagation();jumpTo(o.reply.id)};b.append(q)}
    if(vis.length){b.append(albumNode(c,vis,p.e??0));b.classList.add('has-album'); // the caption, if any, sits right under it
      if(!o.text&&!voices.length&&!docs.length&&!o.poll&&!(o.known&&!o.verified))b.classList.add('album-only')}
    voices.forEach(m=>b.append(voiceNode(c,m,p.e??0)));docs.forEach(m=>b.append(fileNode(c,m,p.e??0)));
    if(o.poll){const pn=pollNode(p,o.poll);parts.push(pn);b.append(pn)}
    if(o.text){const tx=el('span','txt'+(vis.length?' cap':''));tx.append(richText(o.text));b.append(tx)}
    if(o.known&&!o.verified)b.append(el('span','warn','Signature check failed \u2014 this may not be from '+(t==='channel'?'the channel owner or an admin':displayName(p.from))));
  }
  const meta=el('span','meta');b.append(meta);wrap.append(b);
  if(!S.serverView&&o.text!=null){const rn=reactNode(p);parts.push(rn);wrap.append(rn)}
  let cmt=null;
  if(FEATURES.channelComments&&t==='channel'&&!S.serverView&&o.text!=null){cmt=html('button','cmt-btn',I.comment+'<span></span>');cmt.onclick=e=>{e.stopPropagation();openComments(p,o)};wrap.append(cmt)}
  wrap._sig=p.sig;wrap._cont=cont;wrap._pending=!!p._pending;
  wrap._refresh=()=>{
    const cc=curConv()||c;meta.replaceChildren();
    if((cc.pins||[]).includes(p._id))meta.insertAdjacentHTML('beforeend',I.pinSm);
    if(p.exp)meta.insertAdjacentHTML('beforeend',I.timerSm);
    if(t==='channel'){if(p.from!==cc.owner){meta.append(displayName(p.from));withBadge(meta,p.from);meta.append('\u2003')}const v=readCount(p);if(v){meta.insertAdjacentHTML('beforeend',I.eyeSm);meta.append(v+'\u2003')}}
    meta.append((p.edited?'edited ':'')+fmtTime(p.ts));
    if(mine&&t!=='channel'&&!self)meta.insertAdjacentHTML('beforeend',wrap._pending?I.clock:readCount(p)?I.two:I.one);
    if(cmt){const n=S.ccount.get(p._id)||0;cmt.hidden=cc.comments===false&&!n;cmt.lastChild.textContent=n?(n===1?'1 comment':n+' comments'):'Leave a comment'}
    parts.forEach(x=>x._refresh());
  };
  b.onclick=e=>{if(wrap._noClick&&Date.now()-wrap._noClick<600)return;const sel=window.getSelection&&String(getSelection());if(sel)return;e.stopPropagation();msgMenu(b,p,o)};
  b.oncontextmenu=e=>{e.preventDefault();e.stopPropagation();msgMenu(b,p,o)};
  if(o.text!=null&&!S.serverView)addSwipe(wrap,{dir:-1,max:72,threshold:52,target:b,on:()=>{const cc=curConv();if(cc&&canPost(cc))setReply(p,o)}});
  wrap._refresh();return wrap;
}
function jumpTo(id){
  const n=S.rendered&&S.rendered.nodes.get(id);if(!n){toast('That message isn\u2019t loaded or was deleted.');return}
  n.scrollIntoView({block:'center',behavior:'smooth'});n.classList.remove('flash');void n.offsetWidth;n.classList.add('flash');
}
function msgMenu(anchor,p,o){
  const had=document.querySelector('.msgmenu');closeMenus();if(had&&had._for===p._id)return;
  const c=curConv();if(!c||S.serverView)return;
  const t=typeOf(c),mine=p.from===S.me.handle,admin=isAdmin(c),member=isMember(c);
  const m=el('div','popmenu msgmenu');m._for=p._id;
  if(member&&o.text!=null&&!isSelf(c)){const cfg=reactCfg(c);if(cfg.mode!=='off'){const a=S.agg.get(p._id)||{};const st=el('div','rstrip');
    cfg.allowed.forEach(e=>{const b=el('button','rp'+(a.myR===e?' me':''),e);b.setAttribute('aria-label','React '+e);
      b.onclick=async()=>{m.remove();try{await setAct(curConv(),p._id,'r',a.myR===e?null:{emoji:e})}catch{toast('Reaction not saved. Check your connection and try again.')}};st.append(b)});
    m.append(st)}}
  const items=[];
  if(canPost(c)&&o.text!=null)items.push([I.reply,'Reply',()=>setReply(p,o)]);
  if(FEATURES.channelComments&&t==='channel'&&o.text!=null)items.push([I.comment,'Comments',()=>openComments(p,o)]);
  if(canPin(c)&&o.text!=null)items.push([I.pin,(c.pins||[]).includes(p._id)?'Unpin':'Pin',()=>togglePinMsg(c,p)]);
  if(o.text!=null&&!o.poll)items.push([I.fwd,'Forward',()=>openForward(p,o)]);
  if(o.text)items.push([I.copy,'Copy text',async()=>{try{await navigator.clipboard.writeText(plainText(o.text));toast('Copied')}catch{toast('Copying isn\u2019t allowed here. Press and hold the text to select it.')}}]);
  if(mine&&o.text!=null&&!o.poll&&S.comp)items.push([I.edit,'Edit',()=>setEdit(p,o)]);
  if(o.poll&&!(c.closed&&c.closed[p._id])&&(mine||admin))items.push([I.chart,'Stop poll',async()=>{try{await S.db.doc('channels/'+c.id).update({closed:{[p._id]:true}})}catch{toast('Couldn\u2019t stop the poll. Try again.')}}]);
  if(mine||(admin&&t!=='dm'))items.push([I.trash,'Delete',async()=>{
    if(!confirm(isSelf(c)?'Delete this note?':t==='dm'?'Delete this message for both of you?':'Delete this message for everyone?'))return;
    try{await deletePost(c.id,p)}catch{toast('Couldn\u2019t delete it. Try again.')}},'danger']);
  items.forEach(([ic,label,fn,cls])=>{const b=html('button','menu-item'+(cls?' '+cls:''),ic);b.append(el('span',null,label));b.onclick=()=>{m.remove();fn()};m.append(b)});
  if(!m.children.length)return;
  if(navigator.vibrate)navigator.vibrate(6);
  placeMenu(m,anchor);
}
/* ---------- owner tools: reactions, polls, removing people ---------- */
const EMOJIS=['\u{1F44D}','\u{1F44E}','\u2764\uFE0F','\u{1F525}','\u{1F389}','\u{1F601}','\u{1F602}','\u{1F62E}','\u{1F622}','\u{1F64F}','\u{1F44F}','\u{1F914}','\u{1F4AF}','\u{1F92F}','\u{1F440}','\u{1F3C6}'];
function reactCfg(c){const r=(c&&c.reactions)||{},mode=['all','some','off'].includes(r.mode)?r.mode:'all';
  return {mode,allowed:mode==='all'?EMOJIS:mode==='some'?(r.allowed||[]).filter(e=>EMOJIS.includes(e)):[]}}
async function setAct(c,postId,kind,payload){
  const e=epochOf(c),ck=await convKey(c,e);if(!ck)throw new Error('nokey');
  const tag=await memTag(c,e,S.me.handle);if(!tag)throw new Error('nokey');
  const ref=S.db.doc(`channels/${c.id}/acts/${postId}~${tag}~${kind}`);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(`${c.id}|${postId}|${tag}|${kind}`)},ck.key,enc.encode(JSON.stringify(payload))));
  await ref.set({post:postId,kind,e,iv:b64(iv),ct,ts:Date.now(),sg:await sideSig('hush-act-v1',[c.id,postId,kind,tag,ct])});
  S.db.doc(`channels/${c.id}/acts/${postId}~${S.me.handle}~${kind}`).delete().catch(()=>{}); // tidy away the old named one
}
function openAct(c,v){
  const key='a:'+S.me.handle+':'+(v._id||'')+':'+v.ct;
  if(!S.cache.has(key))S.cache.set(key,(async()=>{try{
    const e=v.e??0;let by=v.by,who=v.by;
    if(!by){const parts=String(v._id||'').split('~');if(parts.length!==3)throw 0;who=parts[1];
      by=(await tagMap(c,e))[who];
      if(!by||!(await sideOk(by,v.sg,'hush-act-v1',[c.id,v.post,v.kind,who,v.ct])))throw 0}
    const ck=await convKey(c,e);if(!ck)throw 0;
    const o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:enc.encode(`${c.id}|${v.post}|${who}|${v.kind}`)},ck.key,unb64(v.ct))));
    if(v.kind==='r'&&typeof o.emoji==='string'&&o.emoji.length<=16)return {post:v.post,by,kind:'r',emoji:o.emoji};
    if(v.kind==='v'&&Array.isArray(o.opts))return {post:v.post,by,kind:'v',opts:[...new Set(o.opts.filter(n=>Number.isInteger(n)&&n>=0&&n<10))]};
  }catch{}S.cache.delete(key);return null})());
  return S.cache.get(key);
}
let actSeq=0;
async function onActs(docs){
  const seq=++actSeq,c=curConv();if(!c)return;
  const list=await Promise.all(docs.map(d=>openAct(c,d)));if(seq!==actSeq)return;
  const agg=new Map(),seen=new Set(),members=new Set(c.members||[]);
  list.forEach(x=>{if(!x||!members.has(x.by))return;const k=x.post+'|'+x.by+'|'+x.kind;if(seen.has(k))return;seen.add(k);
    const a=agg.get(x.post)||{r:{},myR:null,v:{},myV:null,voters:0};
    if(x.kind==='r'){a.r[x.emoji]=(a.r[x.emoji]||0)+1;if(x.by===S.me.handle)a.myR=x.emoji}
    else if(x.opts.length){a.voters++;x.opts.forEach(i=>a.v[i]=(a.v[i]||0)+1);if(x.by===S.me.handle)a.myV=x.opts}
    agg.set(x.post,a)});
  S.agg=agg;refreshNodes();
}
function refreshNodes(){if(S.rendered)S.rendered.nodes.forEach(n=>n._refresh&&n._refresh())}
function reactNode(p){
  const w=el('div','reacts');
  w._refresh=()=>{
    const c=curConv();if(!c)return;const cfg=reactCfg(c),a=S.agg.get(p._id)||{r:{}},member=isMember(c);w.replaceChildren();
    const entries=cfg.mode==='off'?[]:Object.entries(a.r).filter(([e])=>cfg.allowed.includes(e)).sort((x,y)=>y[1]-x[1]);
    w.hidden=!entries.length;
    entries.forEach(([e,n])=>{const b=el('button','rc'+(a.myR===e?' me':''),e+' '+n);b.disabled=!member;b.setAttribute('aria-pressed',a.myR===e);
      b.onclick=async ev=>{ev.stopPropagation();try{await setAct(curConv(),p._id,'r',a.myR===e?null:{emoji:e})}catch{toast('Reaction not saved. Check your connection and try again.')}};w.append(b)});
  };
  return w;
}
function pollNode(p,poll){
  const w=el('div','poll'),q=el('div','poll-q',poll.q),kind=el('div','poll-kind'),list=el('div'),foot=el('div','poll-foot');w.append(q,kind,list,foot);
  const pending=new Set();w.onclick=e=>e.stopPropagation();
  const vote=async opts=>{try{await setAct(curConv(),p._id,'v',opts?{opts}:null);pending.clear()}catch{toast('Vote not saved. Check your connection and try again.')}};
  w._refresh=()=>{
    const c=curConv();if(!c)return;const a=S.agg.get(p._id)||{},member=isMember(c),closed=!!(c.closed&&c.closed[p._id]);
    const mine=a.myV,total=a.voters||0,show=closed||!!mine||!member;
    kind.textContent=closed?'Final results':(poll.multi?'Poll, multiple answers':'Poll');
    list.replaceChildren();
    poll.opts.forEach((o,i)=>{
      if(show){const n=(a.v||{})[i]||0,pct=total?Math.round(n*100/total):0;
        const r=el('div','po res'+(mine&&mine.includes(i)?' mine':''));const bar=el('div','po-bar');bar.style.width=pct+'%';
        r.append(el('span','po-pct',pct+'%'),el('span','po-t',o));if(mine&&mine.includes(i))r.insertAdjacentHTML('beforeend',I.one);r.append(bar);list.append(r)}
      else{const b=el('button','po'+(pending.has(i)?' sel':''));b.append(el('span','po-dot'+(poll.multi?' sq':'')),el('span','po-t',o));
        b.onclick=()=>{if(poll.multi){pending.has(i)?pending.delete(i):pending.add(i);w._refresh()}else vote([i])};list.append(b)}
    });
    foot.replaceChildren(el('span',null,total===1?'1 vote':total+' votes'));
    if(!show&&poll.multi){const v=el('button','link sm','Vote');v.disabled=!pending.size;v.onclick=()=>vote([...pending]);foot.append(v)}
    if(mine&&!closed){const r=el('button','link sm','Retract vote');r.onclick=()=>vote(null);foot.append(r)}
    if(!member&&!closed)foot.append(el('span',null,'Join to vote'));
  };
  return w;
}
function openPollCreate(cid){
  const {body,sh,close}=sheet('New poll');
  const f=el('label','field');const q=el('input');q.maxLength=300;f.append(el('span',null,'Question'),q);
  const optsBox=el('div');const inputs=[];
  const addOpt=()=>{if(inputs.length>=10)return;const i=el('input');i.maxLength=100;i.placeholder='Option '+(inputs.length+1);i.className='opt-in';inputs.push(i);optsBox.append(i);addBtn.hidden=inputs.length>=10};
  const addBtn=html('button','menu-item flush',I.plus+'<span>Add an option</span>');addBtn.onclick=()=>{addOpt();inputs[inputs.length-1].focus()};
  const tg=el('label','toggle');const cb=el('input');cb.type='checkbox';tg.append(cb,el('span',null,'Allow multiple answers'));
  body.append(f,el('div','menu-label flush','Options'),optsBox,addBtn,tg,el('p','hint','Votes are encrypted, just like messages. Everyone sees totals and percentages.'));
  addOpt();addOpt();
  const foot=el('div','sheet-foot');const go=el('button','primary','Post poll');const err=el('div','err');foot.append(go,err);sh.append(foot);
  setTimeout(()=>q.focus(),50);
  go.onclick=async()=>{
    const question=q.value.trim(),opts=[...new Set(inputs.map(i=>i.value.trim()).filter(Boolean))];err.textContent='';
    if(!question){err.textContent='Write a question.';return}
    if(opts.length<2){err.textContent='Add at least two different options.';return}
    go.disabled=true;
    try{await sendBody(cid,buildBody({poll:{q:question,opts,multi:cb.checked}}));S.stick=true;close()}
    catch{err.textContent='Couldn\u2019t post the poll. Check your connection and try again.';go.disabled=false}
  };
}
function openReactSettings(cid){
  const c=convById(cid);if(!c)return;const cfg=reactCfg(c);
  const {body,sh,close}=sheet('Reactions');let mode=cfg.mode;const sel=new Set(cfg.mode==='some'?cfg.allowed:EMOJIS);
  const hint=el('p','hint'),grid=el('div','egrid');
  const draw=()=>{hint.textContent=mode==='all'?'Subscribers can react with any of the reactions below.':mode==='some'?'Tap reactions to turn them on or off. Subscribers can only use the ones you leave on.':'Nobody can react to posts. Existing reactions are hidden.';
    grid.hidden=mode==='off';grid.replaceChildren();
    EMOJIS.forEach(e=>{const b=el('button','eg'+(mode==='all'||sel.has(e)?' on':''),e);b.setAttribute('aria-pressed',mode==='all'||sel.has(e));b.disabled=mode!=='some';
      b.onclick=()=>{sel.has(e)?sel.delete(e):sel.add(e);draw()};grid.append(b)})};
  body.append(segControl([['all','All'],['some','Selected'],['off','Off']],mode,v=>{mode=v;draw()}),hint,grid);draw();
  const foot=el('div','sheet-foot');const go=el('button','primary','Save');const err=el('div','err');foot.append(go,err);sh.append(foot);
  go.onclick=async()=>{err.textContent='';if(mode==='some'&&!sel.size){err.textContent='Pick at least one reaction, or turn reactions off.';return}
    go.disabled=true;try{await S.db.doc('channels/'+cid).update({reactions:{mode,allowed:mode==='some'?EMOJIS.filter(e=>sel.has(e)):[]}});close();toast('Reactions updated')}
    catch{err.textContent='Couldn\u2019t save. Check your connection and try again.';go.disabled=false}};
}
async function kickMember(cid,h,opt={}){ // a new key for everyone else, and a sealed member list without them (SPEC.md 5.6)
  const [c,shown]=await chatAnd(cid);const v=metaOf(shown);
  v.members=v.members.filter(x=>x!==h);const wasAdmin=v.admins.includes(h);v.admins=v.admins.filter(x=>x!==h);
  if(opt.ban!==false)v.banned=[...new Set([...v.banned,h])];
  if(c.visibility==='public'){if(wasAdmin){await S.db.doc('channels/'+cid).update({admins:v.admins});await rotateAdmins(cid,v.admins)}return} // nothing to lock: public posts are public
  await rotateTo(c,v);
  if(wasAdmin&&isOwner(shown))await rotateAdmins(cid,v.admins); // a demoted admin loses the admin key as well
}
async function rotateAdmins(cid,admins){ // a fresh admin secret, wrapped to the owner and the current admins only
  const [c,shown]=await chatAnd(cid);const secret=crypto.getRandomValues(new Uint8Array(32)),who=[...new Set([shown.owner||S.me.handle,...admins])];
  await loadDir(who);const akeys={};for(const h of who)if(h===S.me.handle||S.dir[h])Object.assign(akeys,await wrapKey(secret,h,cid+'#a'));
  await S.db.setAdmins(cid,akeys,await adminCapFrom(cid,secret));ksPut(cid,'a',b64(secret));
  for(const x of [S.chatDocs.get(cid),convById(cid)])if(x)x.akeys=akeys;
}
async function setAdmins(cid,admins){ // owner only: the sealed list and the admin keys change together
  const [c,shown]=await chatAnd(cid);
  if(c.visibility==='public')await S.db.doc('channels/'+cid).update({admins});
  else await S.db.doc('channels/'+cid).update({meta:await sealMetaFor(c,Object.assign(metaOf(shown),{admins}))});
  await rotateAdmins(cid,admins);
}
async function unban(cid,h){const [c,shown]=await chatAnd(cid);if(c.visibility==='public')return;
  await S.db.doc('channels/'+cid).update({meta:await sealMetaFor(c,Object.assign(metaOf(shown),{banned:(shown.banned||[]).filter(x=>x!==h)}))})}
const reconciled=new Set();
async function reconcileSvc(c,posts){ // an admin keeps the sealed member list in step with "joined" and "left" notes
  if(!c||typeOf(c)==='dm'||c.visibility==='public'||!isAdmin(c))return;
  for(const p of posts||[]){if(!p||!p.svc||!['join','leave'].includes(p.svc)||!p.from||reconciled.has(p._id))continue;
    const members=c.members||[];
    if(p.svc==='join'&&!members.includes(p.from)){reconciled.add(p._id);
      try{const [cur]=await chatAnd(c.id);await S.db.doc('channels/'+c.id).update({meta:await sealMetaFor(cur,Object.assign(metaOf(c),{members:[...members,p.from]}))});c.members=[...members,p.from]}catch{reconciled.delete(p._id)}}
    else if(p.svc==='leave'&&members.includes(p.from)&&p.from!==S.me.handle){reconciled.add(p._id);
      try{await kickMember(c.id,p.from,{ban:false})}catch{reconciled.delete(p._id)}}
  }
}
function noteAccepted(cid,posts){ // a reply, or an "accepted" note, from the person we asked: the request is over
  const i=dmInfo(cid);if(!i||i.req!=='out')return;const peer=dmPeer(convById(cid)||{id:cid});
  if((posts||[]).some(p=>p&&p.from===peer&&(p.svc==='accept'||!p.svc))){setDmInfo(cid,{req:'ok'});if(S.chan===cid)setTimeout(()=>openConv(cid),50)}
}
async function leaveChat(cid){ // tell the chat, then forget it; an admin rotates the key when they see the note
  const c=convById(cid);if(!c)return;
  if(c.visibility==='public'){const pub=P().pub||[];P().pub=pub.filter(x=>x!==cid);saveContacts()}
  else{try{await S.db.collection('channels/'+cid+'/posts').add(await sealSvc(c,'leave',0))}catch{}}
  if(S.forgetPointers)S.forgetPointers(cid);S.previews.delete(cid);
}

/* ---------- sheets ---------- */
function sheet(title,opt={}){
  const bd=el('div','backdrop'),sh=el('div','sheet'),hd=el('div','sheet-head'),body=el('div','sheet-body');
  const x=html('button','icon-btn',I.x);x.setAttribute('aria-label','Close');
  const layer={kind:'sheet',alive:()=>bd.isConnected,close:()=>close(),stay:!!opt.locked}; // Back closes it; a locked sheet stays
  const close=()=>{bd.remove();document.removeEventListener('keydown',esc);NAV.closed(layer)};const esc=e=>{if(e.key==='Escape')close()};
  if(!opt.locked){x.onclick=close;bd.onclick=e=>{if(e.target===bd)close()};document.addEventListener('keydown',esc);bd._close=close} // _close: what a back swipe calls
  NAV.open(layer);
  hd.append(el('h2',null,title));if(!opt.locked)hd.append(x);sh.append(hd,body);bd.append(sh);document.body.append(bd);
  return {body,sh,close};
}
function emptyPeople(q){const e=el('div','empty');
  if(q)e.append(el('strong',null,'No one found'),el('span',null,'Try their name or username. Some people choose to be reachable only through their invite link.'));
  else e.append(el('strong',null,'No contacts yet'),el('span',null,'Search for someone by name or username, or add them by phone number in Contacts.'));
  return e}
function peopleIn(q,exclude){return Object.values(S.dir).filter(d=>!exclude.includes(d.handle)&&!isBlocked(d.handle)&&(!q||(d.handle+' '+d.name).toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name))}
function personRow(d){const b=el('button','thread');const m=el('div','t-main');m.append(withBadge(el('div','t-name',d.name),d.handle),el('div','t-sub',atOf(d.handle)));b.append(userAvatar(d.handle,'sm'),m);return b}
function searchBox(ph){const s=el('label','search');s.innerHTML=I.search;const inp=el('input');inp.placeholder=ph;s.append(inp);s.style.margin='4px 0 8px';return {s,inp}}
function picker(host,exclude,onChange){
  const sel=new Set();const {s,inp}=searchBox('Search by name or username');inp.autocapitalize='none';inp.spellcheck=false;const list=el('div');host.append(s,list);let look=null;
  const draw=()=>{const q=inp.value.trim().toLowerCase().replace(/^@/,'');list.replaceChildren();look(q);
    const ppl=peopleIn(q,exclude).filter(d=>q||knownHandle(d.handle));
    if(!ppl.length){list.append(emptyPeople(q));return}
    ppl.forEach(d=>{const b=personRow(d);const pk=el('span','pick');b.append(pk);b.setAttribute('aria-pressed',sel.has(d.handle));
      if(sel.has(d.handle)){b.classList.add('picked');pk.innerHTML=I.tick}
      b.onclick=()=>{sel.has(d.handle)?sel.delete(d.handle):sel.add(d.handle);draw();onChange&&onChange(sel)};list.append(b)})};
  look=liveSearch(inp,draw);inp.oninput=draw;draw();return sel;
}
function actionRow(icon,title,subt,fn){const b=html('button','thread new-ch',`<span class="avatar sm ch-ic">${icon}</span>`);
  const m=el('div','t-main');m.append(el('div','t-name',title),el('div','t-sub',subt));b.append(m);b.onclick=fn;return b}
function openNewChat(){
  if(!S.me)return;
  const {body,close}=sheet('New message');
  body.append(actionRow(I.bookmark,'Saved Messages','Notes, links and files just for you',()=>{close();openSaved()}),
    actionRow(I.group,'New group','Chat with several people at once',()=>{close();openCreateGroup()}),
    actionRow(I.mega,'New channel','Broadcast posts to subscribers',()=>{close();openCreateChannel()}),
    actionRow(I.phone,'Invite by phone number','Find friends or text them an invite',()=>{close();openPhoneInvite()}),
    actionRow(I.link,'Join with a link','Paste an invite link or code',()=>{close();openJoinLink()}));
  const {s,inp}=searchBox('Search by name or username');inp.autocapitalize='none';inp.spellcheck=false;const list=el('div');body.append(s,list);
  let pubs=null,look=null;
  const draw=()=>{const q=inp.value.trim().toLowerCase().replace(/^@/,'');list.replaceChildren();look(q);
    const ppl=peopleIn(q,[S.me.handle]).filter(d=>q||knownHandle(d.handle));
    const chs=(pubs||[]).filter(c=>typeOf(c)==='channel'&&!isMember(c)&&(!q||(c.name+' '+(c.desc||'')).toLowerCase().includes(q)));
    const mine=ppl.filter(d=>contactFor(d.handle)).sort((a,b)=>displayName(a.handle).localeCompare(displayName(b.handle))),rest=ppl.filter(d=>!contactFor(d.handle));
    const sec=(label,arr)=>{if(!arr.length)return;list.append(el('div','menu-label flush',label));arr.forEach(d=>{const b=personRow(Object.assign({},d,{name:displayName(d.handle)}));if(d.requests===true&&!knownHandle(d.handle))b.querySelector('.t-sub').append(' \u00b7 sends as a request');b.onclick=()=>{close();openDm(d.handle)};list.append(b)})};
    sec('Contacts',mine);sec(mine.length?'People on Hush':'People',rest);
    if(chs.length){list.append(el('div','menu-label flush','Public channels'));
      chs.forEach(c=>{const b=el('button','thread');const m=el('div','t-main');const nm=el('div','t-name');nm.innerHTML=I.megaSm;nm.append(c.name);
        m.append(nm,el('div','t-sub',c.desc||subsText(c)));b.append(convAvatar(c,'sm'),m);
        b.onclick=()=>{close();S.previews.set(c.id,c);openConv(c.id)};list.append(b)})}
    if(!ppl.length&&!chs.length)list.append(emptyPeople(q));
    if(!q)list.append(el('p','hint','Search anyone on Hush by name or username. Nobody can read your messages, and people can choose who\u2019s allowed to message them.'));
  };
  look=liveSearch(inp,draw);inp.oninput=draw;draw();
  if(S.db)S.db.collection('channels').where('visibility','==','public').limit(100).get().then(s=>{pubs=s.docs.map(d=>Object.assign({id:d.id},d.data()));draw()}).catch(()=>{});
}
async function openDm(peer){
  await loadDir([peer]);const id=await dmIdFor(peer);
  if(!id){toast('Couldn’t open that chat. Check your connection and try again.');return}
  if(!convById(id))S.previews.set(id,{id,type:'dm',members:[...new Set([S.me.handle,peer])],ts:0,last:null,epoch:0});
  openConv(id);
}
function openCreateGroup(){
  const {body,sh,close}=sheet('New group');
  const f1=el('label','field');const n=el('input');n.maxLength=60;f1.append(el('span',null,'Group name'),n);
  body.append(f1,el('div','menu-label flush','Add people'));
  const foot=el('div','sheet-foot');const go=el('button','primary','Create group');const err=el('div','err');foot.append(go,err);
  const sel=picker(body,[S.me.handle],s=>{go.textContent=s.size?`Create group with ${s.size} other${s.size>1?'s':''}`:'Create group'});
  sh.append(foot);setTimeout(()=>n.focus(),50);
  go.onclick=async()=>{
    const name=n.value.trim();err.textContent='';
    if(!name){err.textContent='Give your group a name.';return}
    if(!S.db){err.textContent='Groups can\u2019t be created right now. Check your connection.';return}
    go.disabled=true;
    try{
      const cid='g'+rid(),members=[S.me.handle,...sel],v={name,desc:'',photo:null,owner:S.me.handle,admins:[],members,banned:[]};
      const doc=await createChatDoc(cid,'group','private',v);
      await ensureInbox(Object.assign({id:cid},doc,v));
      if(!convById(cid))S.convs.unshift(Object.assign({id:cid},doc,v));
      close();openConv(cid);
    }catch{err.textContent='Couldn\u2019t create the group. Check your connection and try again.';go.disabled=false}
  };
}
function openJoinLink(){
  const {body,close}=sheet('Join with a link');
  const f=el('label','field');const inp=el('input');inp.placeholder='Paste the invite link';inp.autocomplete='off';inp.spellcheck=false;f.append(el('span',null,'Invite link or code'),inp);
  const go=el('button','primary','Join');body.append(f,go,el('p','hint','You can also scan a channel\u2019s QR code with your phone camera.'));
  setTimeout(()=>inp.focus(),50);
  go.onclick=async()=>{go.disabled=true;if(await handleJoin(inp.value.trim()))close();else go.disabled=false};
}
function confirmJoin(c,j){
  const grp=typeOf(c)==='group';const {body,close}=sheet(grp?'Join group':'Join channel');
  const top=el('div','info-top');const av=convAvatar(c,'xl');
  top.append(av,el('div','info-name',c.name),el('div','t-sub',grp?memberText(c):subsText(c)));body.append(top);
  if(c.desc)body.append(el('p','info-desc',c.desc));
  body.append(el('p',null,grp?'This is an end-to-end encrypted group. Joining unlocks its messages on this device.':'This is a private, end-to-end encrypted channel. Joining unlocks its posts on this device.'));
  const go=el('button','primary',grp?'Join group':'Join channel');const err=el('div','err');body.append(go,err);
  go.onclick=async()=>{go.disabled=true;err.textContent='';
    try{await joinPrivate(c.id,j);close()}
    catch(e){err.textContent=e&&e.message==='banned'?'You were removed from this channel.':e&&e.message==='revoked'?'This invite link was revoked. Ask for a new one.':'Couldn\u2019t join. The link may be damaged. Ask for a new one.';go.disabled=false}};
}
function segControl(opts,val,onChange){const s=el('div','seg');let cur=val;
  const draw=()=>{s.replaceChildren();opts.forEach(([v,label])=>{const b=el('button',null,label);b.type='button';b.setAttribute('aria-pressed',v===cur);b.onclick=()=>{cur=v;draw();onChange(v)};s.append(b)})};
  draw();return s}
function openCreateChannel(){
  const {body,sh,close}=sheet('New channel');
  const f1=el('label','field');const n=el('input');n.maxLength=60;f1.append(el('span',null,'Channel name'),n);
  const f2=el('label','field');const d=el('input');d.maxLength=200;d.placeholder='Optional';f2.append(el('span',null,'Description'),d);
  let vis='private';const hint=el('p','hint');
  const setHint=()=>{hint.textContent=vis==='private'?'Only people you add or invite with a link can join. Posts are end-to-end encrypted.':'Anyone can find it in search, join and read posts. Public channels can\u2019t be end-to-end encrypted.'};setHint();
  body.append(f1,f2,el('div','menu-label flush','Channel type'),segControl([['private','Private'],['public','Public']],vis,v=>{vis=v;setHint()}),hint,el('div','menu-label flush','Add subscribers now (optional)'));
  const foot=el('div','sheet-foot');const go=el('button','primary','Create channel');const err=el('div','err');foot.append(go,err);
  const sel=picker(body,[S.me.handle],s=>{go.textContent=s.size?`Create channel with ${s.size} subscriber${s.size>1?'s':''}`:'Create channel'});
  sh.append(foot);setTimeout(()=>n.focus(),50);
  go.onclick=async()=>{
    const name=n.value.trim();err.textContent='';
    if(!name){err.textContent='Give your channel a name.';return}
    if(!S.db){err.textContent='Channels can\u2019t be created right now. Check your connection.';return}
    go.disabled=true;
    try{
      const cid='c'+rid(),members=[S.me.handle,...sel],v={name,desc:d.value.trim(),photo:null,owner:S.me.handle,admins:[],members,banned:[]};
      const doc=await createChatDoc(cid,'channel',vis,v);
      if(vis==='public'){const pub=P().pub||(P().pub=[]);if(!pub.includes(cid)){pub.push(cid);saveContacts()}}
      await ensureInbox(Object.assign({id:cid},doc,v));
      if(!convById(cid))S.convs.unshift(Object.assign({id:cid},doc,v));
      close();openConv(cid);
    }catch{err.textContent='Couldn\u2019t create the channel. Check your connection and try again.';go.disabled=false}
  };
}
async function createChatDoc(cid,type,vis,v){ // a new group or channel: chat key, admin secret, sealed description, room keys for the server
  await loadDir(v.members,true); // fresh profiles: wraps go to each member's CURRENT devices, not the ones this page saw earlier
  const raw=crypto.getRandomValues(new Uint8Array(32)),secret=crypto.getRandomValues(new Uint8Array(32)),pub=vis==='public';
  const keys=await wrapAll(raw,v.members,cid,0),akeys=await wrapKey(secret,S.me.handle,cid+'#a');
  const doc=Object.assign({type,visibility:vis,epoch:0,keys:{0:keys},akeys,invites:{},ts:Date.now(),last:null},
    pub?{openKeys:{0:b64(raw)},name:v.name,desc:v.desc,photo:v.photo||null,owner:S.me.handle,admins:[]}:{meta:await sealMeta(cid,0,raw,v)});
  ksPut(cid,0,b64(raw));ksPut(cid,'a',b64(secret));
  await S.db.createChat(cid,doc,{m:await memberCapFrom(cid,0,raw),a:await adminCapFrom(cid,secret),o:await ownerCap(cid)});
  S.chatDocs.set(cid,Object.assign({id:cid},doc));return doc;
}
function openAddSubs(cid){
  const c=convById(cid);if(!c)return;const noun=typeOf(c)==='group'?'member':'subscriber';
  const {body,sh,close}=sheet(`Add ${noun}s`);
  // Or hand out a link: it opens the invite sheet with the link and a Copy button, made on the spot if there is none yet.
  body.append(actionRow(I.link,'Invite via link','Anyone with the link can join',()=>{close();openInvite(cid,{auto:true})}));
  const foot=el('div','sheet-foot');const go=el('button','primary',`Add ${noun}s`);go.disabled=true;const err=el('div','err');foot.append(go,err);
  const sel=picker(body,c.members,s=>{go.disabled=!s.size;go.textContent=s.size?`Add ${s.size} ${noun}${s.size>1?'s':''}`:`Add ${noun}s`});
  sh.append(foot);
  go.onclick=async()=>{
    go.disabled=true;err.textContent='';
    try{
      const [cur,shown]=await chatAnd(cid);await loadDir([...sel],true);const raws=await allRaws(cur),keys={}; // fresh profiles, so the wraps reach their current devices
      for(const [e,r] of Object.entries(raws))keys[e]=await wrapAll(unb64(r),[...sel],cid,Number(e));
      const v=Object.assign(metaOf(shown),{members:[...new Set([...(shown.members||[]),...sel])],banned:(shown.banned||[]).filter(h=>!sel.has(h))});
      await S.db.doc('channels/'+cid).update(Object.assign({keys},cur.visibility==='public'?{}:{meta:await sealMetaFor(cur,v)}));
      for(const x of [convById(cid)])if(x){x.members=v.members;x.banned=v.banned}
      await ensureInbox({id:cid,type:cur.type,members:v.members},[...sel]);
      close();toast(sel.size>1?`${noun[0].toUpperCase()+noun.slice(1)}s added`:`${noun[0].toUpperCase()+noun.slice(1)} added`);
    }catch{err.textContent='Couldn\u2019t add them. Check your connection and try again.';go.disabled=false}
  };
}
function qrSvg(text,label){
  try{if(typeof qrcode!=='function')return null;const q=qrcode(0,'M');q.addData(text);q.make();const n=q.getModuleCount();let d='';
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))d+=`M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-3 -3 ${n+6} ${n+6}" shape-rendering="crispEdges" role="img" aria-label="${label||'QR code for the invite link'}"><rect x="-3" y="-3" width="${n+6}" height="${n+6}" fill="#fff"/><path d="${d}" fill="#17152B"/></svg>`}catch{return null}
}
function openInvite(cid,opt){ // opt.auto: an admin arriving from "Invite via link" gets the link made at once, no extra tap
  const c0=convById(cid);if(!c0)return;const owner=isAdmin(c0),pub=c0.visibility==='public',grp=typeOf(c0)==='group',noun=grp?'group':'channel';
  const {body}=sheet(grp?'Invite via link':'Invite link');const host=el('div');body.append(host);
  const make=async()=>{const i=await createInvite(cid);ls.set('hush:inv:'+cid,i);return i};
  const draw=async(trust)=>{
    host.replaceChildren(el('p',null,'Loading\u2026'));
    let inv=null;
    if(!pub){inv=ls.get('hush:inv:'+cid,null);
      if(inv&&!trust){const f=await freshChan(cid).catch(()=>c0);if(!(f.invites||{})[inv.iid])inv=null}
      if(!inv&&owner&&opt&&opt.auto){try{inv=await make();trust=true}catch{}}}
    host.replaceChildren();
    if(!pub&&!inv){
      host.append(el('p',null,owner?`Create a link that lets people join this private ${noun}. The ${noun} key travels inside the link, so the server can\u2019t use it.`:`Only an admin can create an invite link for this ${noun}.`));
      if(owner){const b=el('button','primary','Create invite link');b.onclick=async()=>{b.disabled=true;try{await make();draw(true)}catch{b.disabled=false;toast('Couldn\u2019t create the link. Check your connection and try again.')}};host.append(b)}
      return;
    }
    const link=linkFor(cid,inv);
    const q=qrSvg(link);if(q)host.append(html('div','qr',q));
    const box=el('input','linkbox');box.readOnly=true;box.value=link;box.onfocus=()=>box.select();
    const row=el('div','row2');const copy=el('button','secondary','Copy link');
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(link);toast('Link copied')}catch{box.focus();box.select();toast('Link selected. Copy it from the box.')}};
    row.append(copy);
    if(navigator.share){const sh=el('button','primary','Share');sh.style.marginTop='0';sh.onclick=async()=>{try{await navigator.share({title:c0.name,text:'Join '+c0.name+' on Hush',url:link})}catch(e){if(!e||e.name!=='AbortError')copy.click()}};row.append(sh)}
    const txt=`Join \u201c${c0.name}\u201d on Hush: ${link}`;const sms=smsLink('',txt);sms.textContent='Send link by text';
    host.append(box,row,sms,el('p','hint',pub
      ?'Anyone with this link or QR code can join. Public channels also show up in search.'
      :`Anyone with this link or QR code can join and read every ${grp?'message':'post'}. Only share it with people you trust.`));
    if(!pub&&owner){const r=el('button','menu-item danger flush','Revoke link');
      r.onclick=async()=>{if(!confirm('Revoke this link? It stops working for anyone who hasn\u2019t joined yet.'))return;
        try{await revokeInvite(cid,inv.iid);toast('Link revoked');draw()}catch{toast('Couldn\u2019t revoke it. Check your connection and try again.')}};host.append(r)}
  };
  draw();
}
function openConvInfo(cid){
  const c=convById(cid);if(!c)return;if(typeOf(c)==='dm'){openProfile(dmPeer(c));return}
  const grp=typeOf(c)==='group',owner=isOwner(c),admin=isAdmin(c),member=isMember(c),pub=c.visibility==='public',noun=grp?'group':'channel';
  const {body,close}=sheet(grp?'Group info':'Channel info');
  const top=el('div','info-top');
  top.append(convAvatar(c,'xl'),el('div','info-name',c.name),el('div','t-sub',grp?memberText(c):(pub?'Public channel, ':'Private channel, ')+subsText(c)));body.append(top);
  if(c.desc)body.append(el('p','info-desc',c.desc));
  const p=el('p');
  if(grp)p.append(el('b',null,'End-to-end encrypted. '),'Only members hold the group key. The group\u2019s name, description and photo are not encrypted.');
  else if(pub)p.append(el('b',null,'Public. '),'Anyone can find this channel, join and read its posts, so they aren\u2019t end-to-end encrypted. Posts are still signed.');
  else p.append(el('b',null,'Private and end-to-end encrypted. '),'Only subscribers hold the channel key. The channel\u2019s name, description and photo are not encrypted.');
  body.append(p);
  const item=(icon,label,fn,extra)=>{const a=html('button','menu-item flush',icon+`<span>${label}</span>`);if(extra)a.append(el('span','role',extra));a.onclick=()=>{close();fn()};body.append(a)};
  if(S.chan===cid)item(I.image,'Shared media',openMediaGallery);
  if(owner)item(I.edit,'Edit name, description and photo',()=>openEditConv(cid));
  if(member&&(admin||pub))item(I.link,grp?'Invite via link':'Invite link and QR code',()=>openInvite(cid,{auto:grp&&admin}));
  if(admin)item(I.plus,grp?'Add members':'Add subscribers',()=>openAddSubs(cid));
  if(owner){
    if(!grp){const v=html('button','menu-item flush',(pub?I.lockMd:I.globe)+`<span>${pub?'Make private':'Make public'}</span>`);
      v.onclick=async()=>{
        const msg=pub?`Make \u201c${c.name}\u201d private?\n\nNew posts get a new key that only current subscribers have. Posts made while it was public stay readable to anyone.`
          :`Make \u201c${c.name}\u201d public?\n\nAnyone will be able to find it, join, and read every post, including past ones. Private invite links stop working.`;
        if(!confirm(msg))return;
        try{await setVisibility(cid,pub?'private':'public');close();toast(pub?'Channel is now private':'Channel is now public');if(S.chan===cid)setTimeout(()=>{if(convById(cid))openConv(cid)},300)}
        catch{toast('That didn\u2019t go through. Check your connection and try again.')}};
      body.append(v);
      if(FEATURES.channelComments){const cm=html('button','menu-item flush',I.comment+'<span>Comments</span>');cm.append(el('span','role',c.comments===false?'Off':'On'));
      cm.onclick=async()=>{try{await S.db.doc('channels/'+cid).update({comments:c.comments===false});close();toast(c.comments===false?'Comments turned on':'Comments turned off')}catch{toast('That didn\u2019t go through. Try again.')}};body.append(cm)}}
    const cfg=reactCfg(c);item(I.smile,'Reactions',()=>openReactSettings(cid),cfg.mode==='all'?'All':cfg.mode==='off'?'Off':cfg.allowed.length+' allowed');
  }
  if(canPost(c))item(I.chart,'New poll',()=>openPollCreate(cid));
  body.append(el('div','menu-label flush',grp?'Members':'Subscribers'));
  if(owner)body.append(el('p','hint','Admins can post, pin, delete messages, add people and remove members. Only you can change settings or delete the '+noun+'.'));
  const memberRow=h=>{const r=el('button','thread');const m=el('div','t-main');
    m.append(withBadge(el('div','t-name',h===S.me.handle?displayName(h)+' (you)':displayName(h)),h),el('div','t-sub'+(isOnline(h)?' online':''),grp?lastSeen(h):atOf(h)));
    r.append(userAvatar(h,'sm'),m);r.onclick=()=>{close();openProfile(h)};return r};
  const act=(label,fn,cls)=>{const k=el('span','kick'+(cls?' '+cls:''),label);k.setAttribute('role','button');k.tabIndex=0;k.onclick=async e=>{e.stopPropagation();await fn()};return k};
  const rank=h=>h===c.owner?0:(c.admins||[]).includes(h)?1:2;
  c.members.slice().sort((a,b)=>rank(a)-rank(b)||displayName(a).localeCompare(displayName(b))).forEach(h=>{
    const r=memberRow(h),isAdm=(c.admins||[]).includes(h);
    if(h===c.owner)r.append(el('span','role','owner'));
    else if(isAdm)r.append(el('span','role','admin'));
    if(owner&&h!==c.owner)r.append(act(isAdm?'Remove admin':'Make admin',async()=>{
      if(!isAdm&&!confirm(`Make ${displayName(h)} an admin? They\u2019ll be able to post, pin, delete messages and remove members.`))return;
      try{const ad=(c.admins||[]).filter(x=>x!==h);if(!isAdm)ad.push(h);await setAdmins(cid,ad);c.admins=ad;close();toast(isAdm?displayName(h)+' is no longer an admin':displayName(h)+' is now an admin');openConvInfo(cid)}
      catch{toast('That didn\u2019t go through. Try again.')}},'adm'));
    if(admin&&!pub&&h!==S.me.handle)r.append(act('Resend keys',async()=>{try{await resendKeys(cid,h);toast('Keys sent to '+displayName(h)+'\u2019s devices')}catch{toast('That didn\u2019t go through. Try again.')}},'adm'));
    if(admin&&!pub&&h!==c.owner&&h!==S.me.handle&&(owner||!isAdm))r.append(act(`Block from this ${noun}`,async()=>{
      if(!confirm(`Block ${displayName(h)} from \u201c${c.name}\u201d?\n\nThey\u2019re removed and can\u2019t rejoin, even with an invite link. They can\u2019t read new ${grp?'messages':'posts'}. This only applies to this ${noun}.`))return;
      try{await kickMember(cid,h,{ban:true});close();toast(`${displayName(h)} was blocked from this ${noun}`);openConvInfo(cid)}catch{toast('Couldn\u2019t block them. Check your connection and try again.')}}));
    if(h!==S.me.handle)r.append(isBlocked(h)?act('Unblock person',async()=>{unblockPeer(h);toast(displayName(h)+' unblocked');close();openConvInfo(cid)})
      :act('Block person',async()=>{if(confirmBlockPerson(h)){close();openConvInfo(cid)}}));
    body.append(r)});
  if(admin&&(c.banned||[]).length){body.append(el('div','menu-label flush',`Blocked from this ${noun}`));
    c.banned.forEach(h=>{const r=memberRow(h);r.append(act('Unblock',async()=>{try{await unban(cid,h);close();toast(displayName(h)+' can join again')}catch{toast('That didn\u2019t go through. Try again.')}}));body.append(r)})}
  if(!member)return;
  const danger=el('button','menu-item danger flush',owner?`Delete ${noun}`:`Leave ${noun}`);
  danger.onclick=async()=>{
    if(!confirm(owner?`Delete \u201c${c.name}\u201d for everyone?`:`Leave \u201c${c.name}\u201d?`))return;
    try{
      if(owner)await S.db.doc('channels/'+cid).delete();
      else await leaveChat(cid);
      S.previews.delete(cid);close();closeConv();toast(owner?`${noun[0].toUpperCase()+noun.slice(1)} deleted`:`You left the ${noun}`);
    }catch{toast('That didn\u2019t go through. Check your connection and try again.')}
  };
  body.append(danger);
}
function pickPhoto(){
  return new Promise(res=>{const fi=el('input');fi.type='file';fi.accept='image/*';fi.style.display='none';document.body.append(fi);
    fi.onchange=async()=>{const f=fi.files[0];fi.remove();if(!f)return res(null);
      try{const bmp=await createImageBitmap(f),s=Math.min(bmp.width,bmp.height),cv=document.createElement('canvas');cv.width=cv.height=320;
        cv.getContext('2d').drawImage(bmp,(bmp.width-s)/2,(bmp.height-s)/2,s,s,0,0,320,320);res(cv.toDataURL('image/jpeg',.85))}
      catch{toast('That photo couldn\u2019t be read. Try a JPG or PNG.');res(null)}};
    fi.click()});
}
function photoEditor(host,key,getName,photo,onChange){
  let cur=photo;const box=el('div','info-top');const av=el('div');const row=el('div','row2 tight');
  const set=el('button','secondary','Set photo'),rm=el('button','secondary','Remove');
  const draw=()=>{av.replaceChildren(avatar(key,getName(),'xl',cur));rm.hidden=!cur};
  set.onclick=async()=>{const p=await pickPhoto();if(p){cur=p;onChange(cur);draw()}};
  rm.onclick=()=>{cur=null;onChange(null);draw()};
  row.append(set,rm);box.append(av,row);host.append(box);draw();return draw;
}
function openEditConv(cid){
  const c=convById(cid);if(!c)return;const grp=typeOf(c)==='group';
  const {body,sh,close}=sheet(grp?'Edit group':'Edit channel');let photo=c.photo||null;
  const n=el('input');n.maxLength=60;n.value=c.name||'';const d=el('input');d.maxLength=200;d.value=c.desc||'';d.placeholder='Optional';
  const redraw=photoEditor(body,c.id,()=>n.value||c.name,photo,p=>photo=p);
  const f1=el('label','field');f1.append(el('span',null,'Name'),n);const f2=el('label','field');f2.append(el('span',null,'Description'),d);
  const pub=c.visibility==='public';
  n.oninput=redraw;body.append(f1,f2,el('p','hint',pub?'This channel is public, so its name, description and photo are visible to everyone, including the server, so people can find it.'
    :'The name, description and photo are encrypted. Only members can see them, not the server.'));
  const foot=el('div','sheet-foot');const go=el('button','primary','Save');const err=el('div','err');foot.append(go,err);sh.append(foot);
  go.onclick=async()=>{const name=n.value.trim();if(!name){err.textContent='The name can\u2019t be empty.';return}
    go.disabled=true;try{const v={name,desc:d.value.trim(),photo:photo||null};const [cur,shown]=await chatAnd(cid);
      await S.db.doc('channels/'+cid).update(cur.visibility==='public'?v:{meta:await sealMetaFor(cur,Object.assign(metaOf(shown),v))});Object.assign(c,v);close();toast('Saved');if(S.chan===cid)setTimeout(()=>openConv(cid),300)}
    catch{err.textContent='Couldn\u2019t save. The photo may be too large, or check your connection.';go.disabled=false}};
}
async function openProfile(h){
  if(h===S.me.handle){openSettings();return}
  const d=S.dir[h];const {body,close}=sheet('Profile');
  const top=el('div','info-top');const st=lastSeen(h);
  top.append(userAvatar(h,'xl'),withBadge(el('div','info-name',displayName(h)),h),el('div','t-sub'+(st==='online'?' online':''),atOf(h)+', '+st));body.append(top);
  if(d&&d.bio)body.append(el('p','info-desc',d.bio));
  if(isBlocked(h))body.append(el('p','warnbox','You blocked this person. Their messages and requests are dropped, and you won’t see them in groups you share.'));
  else if(!S.chan||S.chan!==dmIds.get(h)){const m=el('button','primary','Send message');m.style.width='100%';m.onclick=()=>{close();openDm(h)};body.append(m)}
  const blk=html('button','menu-item danger flush',I.x+`<span>${isBlocked(h)?'Unblock this person':'Block this person'}</span>`);
  blk.onclick=()=>{if(isBlocked(h)){unblockPeer(h);toast(displayName(h)+' unblocked');close()}else if(confirmBlockPerson(h))close()};
  const ct=contactFor(h);
  if(ct){if(d&&d.name&&d.name!==ct.name)body.append(el('p','t-sub center','Saved in your contacts as '+ct.name+'. Profile name: '+d.name));
    const e=html('button','menu-item flush',I.edit+'<span>Edit contact</span>');e.onclick=()=>{close();openEditContact(ct)};body.append(e)}
  const changed=keyChanged(h);let grid=null;
  if(changed)body.prepend(keyWarnBox(h,()=>grid&&grid.scrollIntoView({behavior:'smooth',block:'center'})));
  if(d){
    body.append(el('div','menu-label flush',changed?'New safety number':'Safety number'));
    grid=el('div','digits');(await safetyNumber(S.me.handle,h,changed?{[h]:d}:null)).forEach(g=>grid.append(el('span',null,g)));
    const p1=el('p');p1.append('Compare these numbers with ',el('b',null,displayName(h)),' in person or on a call. If they match on both phones, nobody is intercepting your messages.');
    body.append(grid,p1);
    if(!changed){const vb=el('button',isVerified(h)?'secondary verified':'secondary',isVerified(h)?'\u2713 Verified':'Mark as verified');vb.style.width='100%';
      vb.onclick=()=>{if(isVerified(h)){delete S.verified[h];vb.textContent='Mark as verified';vb.className='secondary'}
        else{if(!S.pins[h])S.pins[h]=keysOf(S.dir[h]);S.verified[h]=fpOf(S.pins[h]);vb.textContent='\u2713 Verified';vb.className='secondary verified'}saveContacts()};
      body.append(vb,el('p','hint','Mark as verified once the numbers match. If the code ever changes, Hush will warn you and pause the chat until you check again.'))}
  }
  body.append(blk);
}
function openSettings(){if(!S.me)return;if(S.chan&&matchMedia('(max-width:759px)').matches)closeConv();setTab('profile')}
function buildSettings(body){
  if(isSettingsPage())return buildSettingsPage(body);
  const me=S.me,d=S.dir[me.handle]||{};let photo=d.photo||null;
  const n=el('input');n.maxLength=40;n.value=d.name||me.name;n.autocomplete='name';
  const bio=el('input');bio.maxLength=140;bio.value=d.bio||'';bio.placeholder='A few words about you';
  const redraw=photoEditor(body,me.handle,()=>n.value||me.name,photo,p=>photo=p);n.oninput=redraw;
  const f1=el('label','field');f1.append(el('span',null,'Name'),n);const f2=el('label','field');f2.append(el('span',null,'Bio'),bio);
  const un=el('input');un.maxLength=20;un.value=dispOf(me.handle);un.autocapitalize='none';un.spellcheck=false;un.autocomplete='off';
  un.oninput=()=>{un.value=un.value.replace(/[^A-Za-z0-9_]/g,'')};
  const f3=el('label','field');f3.append(el('span',null,'Username capitals'),un);
  const save=el('button','primary','Save profile');save.style.width='100%';const err=el('div','err');
  body.append(withBadge(el('p','t-sub center',atOf(me.handle)),me.handle),f1,f3,el('p','hint','You can change which letters are capitals. The letters themselves stay the same, and people find you either way.'),f2,save,err,el('p','hint','Your name, photo and bio are visible to anyone on Hush. Your messages are what\u2019s encrypted.'));
  save.onclick=async()=>{const name=n.value.trim(),disp=un.value.trim();err.textContent='';if(!name){err.textContent='Enter your name.';return}
    if(!dispOk(disp,me.handle)){err.textContent='Your username has to keep the same letters ('+me.handle+'). You can only change which ones are capitals.';un.value=dispOf(me.handle);return}
    if(!S.db){err.textContent='Profiles can\u2019t be saved right now. Check your connection.';return}
    save.disabled=true;
    try{await S.db.doc('directory/'+me.handle).update({name,disp,bio:bio.value.trim(),photo:photo||null});
      me.name=name;me.disp=disp;const i=S.ids.find(x=>x.handle===me.handle);if(i){i.name=name;i.disp=disp}ls.set('hush:ids',S.ids);
      if(S.dir[me.handle])S.dir[me.handle].disp=disp;toast('Profile saved')}
    catch{err.textContent='Couldn\u2019t save. The photo may be too large, or check your connection.'}
    save.disabled=false};
  body.append(el('hr','pf-sep'));
  const st=html('button','menu-item flush pf-row',I.gear+'<span>Settings</span>');st.insertAdjacentHTML('beforeend','<span class="chev">\u203a</span>');
  st.onclick=()=>{S.profilePage='settings';setTab('profile')};
  const svm=html('button','menu-item flush pf-row',I.bookmark+'<span>Saved Messages</span>');svm.insertAdjacentHTML('beforeend','<span class="chev">\u203a</span>');svm.onclick=openSaved;
  body.append(st,svm);
}
const SET_PAGES={'settings':'Settings','settings:privacy':'Privacy','settings:login':'Login and devices','settings:advanced':'Advanced'};
const isSettingsPage=()=>typeof S.profilePage==='string'&&S.profilePage.startsWith('settings');
function setRow(icon,label,role,fn,warn){ // a Telegram-style row that opens another page
  const b=html('button','menu-item flush pf-row',icon+'<span>'+label+'</span>');if(role)b.append(el('span','role'+(warn?' warn':''),role));
  b.insertAdjacentHTML('beforeend','<span class="chev">\u203a</span>');b.onclick=fn;return b}
function buildSettingsPage(body){
  const me=S.me;if(!SET_PAGES[S.profilePage])S.profilePage='settings';const pg=S.profilePage,sub=pg!=='settings';
  const hd=el('div','set-head');const back=html('button','icon-btn',I.back);back.setAttribute('aria-label',sub?'Back to settings':'Back to profile');
  back.onclick=()=>{S.profilePage=sub?'settings':'main';setTab('profile')};hd.append(back,el('h2',null,SET_PAGES[pg]));body.append(hd);
  if(pg==='settings:privacy')return settingsPrivacy(body,me);
  if(pg==='settings:login')return settingsLogin(body,me);
  if(pg==='settings:advanced')return settingsAdvanced(body,me);
  const go=p=>()=>{S.profilePage=p;setTab('profile')};
  body.append(setRow(I.shield,'Privacy','',go('settings:privacy')),
    setRow(I.device,'Login and devices',loginInfo(me.handle)?'':'Not set up',go('settings:login'),true));
  body.append(el('div','menu-label flush','Appearance'),
    segControl([['system','Auto'],['light','Light'],['dark','Dark']],ls.get('hush:theme','system'),v=>{ls.set('hush:theme',v);applyTheme()}));
  body.append(el('hr','pf-sep'));
  body.append(el('div','menu-label flush','Accounts on this device'));
  S.ids.forEach(id=>{const b=el('button','menu-item flush');b.append(userAvatar(id.handle),withBadge(el('span',null,displayName(id.handle)),id.handle));
    if(id.handle===S.me.handle)b.insertAdjacentHTML('beforeend',`<span class="check">${I.tick}</span>`);else b.onclick=()=>{start(id);S.profilePage='main';setTab('profile')};body.append(b)});
  const add=html('button','menu-item flush',I.plus+'<span>Add or restore account</span>');add.onclick=()=>showOnboard(true);body.append(add);
  const out=el('button','btn-danger','Log out');out.setAttribute('aria-label',`Log out of ${atOf(me.handle)} on this device`);out.onclick=()=>logOutAccount(me.handle);
  body.append(out,el('p','hint',hasRecovery(me.handle)?'Erases this device’s copy of your keys and chats. Your password or your recovery words bring the account back.':(loginInfo(me.handle)||{}).loc?'Erases this device’s copy of your keys and chats. Your password brings the account back; recovery words are a safer second way in.':'Erases this device’s copy of your keys and chats. Save your recovery words first, or there is no way back in.'));
  body.append(el('hr','pf-sep'),setRow(I.sliders,'Advanced',hasRecovery(me.handle)?'':'Finish setup',go('settings:advanced'),true),
    el('p','hint','Recovery words, message backup, app lock and encryption tools.'));
}
function settingsPrivacy(body,me){
  const findable=(S.dir[me.handle]||{}).findable!==false;
  body.append(el('div','set-label','Who can find me in search'),segControl([['yes','Anyone'],['no','Only with my link']],findable?'yes':'no',async v=>{
    try{await S.db.doc('directory/'+me.handle).update({findable:v==='yes'});if(S.dir[me.handle])S.dir[me.handle].findable=v==='yes';
      syncSearch();toast(v==='yes'?'People can find you by your username':'Only people with your invite link or number can reach you')}catch{toast('That didn\u2019t save. Try again.')}}),
    el('p','hint','Either way, nobody can read your messages. Your invite link and phone number (if you add one) always work.'));
  const reqOn=(S.dir[me.handle]||{}).requests===true;
  body.append(el('div','set-label','Who can message me'),segControl([['all','Everyone'],['req','Only my contacts']],reqOn?'req':'all',async v=>{
    try{await S.db.doc('directory/'+me.handle).update({requests:v==='req'});if(S.dir[me.handle])S.dir[me.handle].requests=v==='req';
      toast(v==='req'?'People outside your contacts will send a request first':'Anyone can message you')}catch{toast('That didn\u2019t save. Try again.')}}),
    el('p','hint','With \u201cOnly my contacts,\u201d anyone else can send you one text message as a request. It shows at the top of your chats until you accept or delete it. Chats you already have aren\u2019t affected.'));
  const tg=el('label','toggle');const cb=el('input');cb.type='checkbox';cb.checked=!ls.get('hush:hideSeen:'+me.handle,false);
  cb.onchange=()=>{ls.set('hush:hideSeen:'+me.handle,!cb.checked);heartbeat(true)};
  tg.append(cb,el('span',null,'Show my online status and last seen'));
  body.append(tg,el('p','hint','People you can see in Hush will see when you\u2019re online. Turn it off and they\u2019ll see \u201clast seen recently\u201d instead.'));
  body.append(el('div','menu-label flush','Find me by phone number'));
  const pf=el('label','field');const pin=el('input');pin.type='tel';pin.autocomplete='tel';pin.placeholder='Optional';pin.value=ls.get('hush:phone:'+me.handle,'')||'';
  pf.append(el('span',null,'Let friends find me by this number'),pin);
  const prow=el('div','row2');const psave=el('button','secondary','Save number'),prm=el('button','secondary','Remove');prm.hidden=!pin.value;prow.append(psave,prm);
  const perr=el('div','err');
  body.append(pf,prow,perr,el('p','hint','Your number is stored as a scrambled fingerprint, not as the number itself, and has nothing to do with your encryption keys. Numbers aren\u2019t confirmed by text message in this prototype.'));
  psave.onclick=async()=>{perr.textContent='';const e164=normPhone(pin.value);if(!e164){perr.textContent='Enter a full phone number, including the area code.';return}
    if(!S.db){perr.textContent='Numbers can\u2019t be saved right now. Check your connection.';return}
    psave.disabled=true;
    try{const hsh=await phoneHash(e164),ref=S.db.doc('phones/'+hsh),s=await ref.get();
      if(s.exists&&s.data().handle!==me.handle){perr.textContent='That number is already linked to another account.';psave.disabled=false;return}
      const old=ls.get('hush:phone:'+me.handle,null);
      if(old&&old!==e164){const oh=await phoneHash(old);const os=await S.db.doc('phones/'+oh).get();if(os.exists&&os.data().handle===me.handle)await S.db.doc('phones/'+oh).delete()}
      await ref.set({handle:me.handle,ts:Date.now()});ls.set('hush:phone:'+me.handle,e164);pin.value=e164;prm.hidden=false;toast('Friends can now find you by your number')}
    catch{perr.textContent='Couldn\u2019t save. Check your connection and try again.'}
    psave.disabled=false};
  prm.onclick=async()=>{const old=ls.get('hush:phone:'+me.handle,null);
    try{if(old&&S.db){const oh=await phoneHash(old);const os=await S.db.doc('phones/'+oh).get();if(os.exists&&os.data().handle===me.handle)await S.db.doc('phones/'+oh).delete()}
      ls.set('hush:phone:'+me.handle,null);pin.value='';prm.hidden=true;toast('Number removed')}catch{toast('Couldn\u2019t remove it. Try again.')}};
  // Everything blocked, both kinds. People and chats are kept in my vault and never told; per-chat blocks live in the
  // chat's own sealed member list, so they are listed for the chats I run.
  const row=(av,label,sub,fn,h)=>{const r=el('div','menu-item flush static');const m=el('div','t-main');m.append(withBadge(el('div','t-name',label),h||''),el('div','t-sub',sub));
    r.append(av,m);const u=el('button','link sm','Unblock');u.onclick=fn;r.append(u);return r};
  body.append(el('div','menu-label flush','Blocked'));
  const people=(S.prefs&&S.prefs.blocked)||[],chats=(S.prefs&&S.prefs.blockedChats)||[];
  for(const h of people)body.append(row(userAvatar(h,'sm'),displayName(h),'Person · everywhere',()=>{unblockPeer(h);toast(displayName(h)+' unblocked')},h));
  for(const cid of chats){const c=convById(cid)||{id:cid,type:'dm'};const title=c.members?convTitle(c):(S.dmPeers[cid]?displayName(S.dmPeers[cid]):'A chat');
    const ph=c.members?(typeOf(c)==='dm'&&!isSelf(c)?dmPeer(c):''):(S.dmPeers[cid]||'');
    body.append(row(c.members?convAvatar(c,'sm'):avatar(cid,title,'sm'),title,'This chat only',()=>{unblockChat(cid);toast('Chat unblocked')},ph))}
  const inChats=el('div');body.append(inChats);
  (async()=>{for(const c of S.convs.filter(x=>typeOf(x)!=='dm'&&isAdmin(x)&&x.visibility!=='public')){let shown;try{shown=await showMeta(c)}catch{continue}
    for(const h of shown.banned||[])inChats.append(row(userAvatar(h,'sm'),displayName(h),`Blocked from ${shown.name||'a '+typeOf(c)}`,async()=>{
      try{await unban(c.id,h);toast(displayName(h)+' can join again');setTab('profile')}catch{toast('That didn’t go through. Try again.')}},h))}
    if(!people.length&&!chats.length&&!inChats.children.length)body.append(el('p','hint','Nothing is blocked. You can block a person from their profile or a chat’s menu, or block someone from a group you run in its member list.'))})();
}
function settingsLogin(body,me){
  {const li=loginInfo(me.handle);
    if(li){const r=el('div','menu-item flush static');r.innerHTML=I.lockMd;r.append(el('span',null,isEmailLogin(li.login)?'Email':'Phone number'),el('span','role',li.login));body.append(r,
      el('p','hint','Log in on another device with a code, then scan the QR code it shows with this device. Your chats come along.'));
      const lk=html('button','menu-item flush',I.device+'<span>Link a new device</span>');lk.append(el('span','role','Scan QR'));lk.onclick=openLinkScanner;body.append(lk)}
    else{const r=html('button','menu-item flush',I.lockMd+'<span>Add phone number or email</span>');r.append(el('span','role','Not set up'));r.onclick=openAddLogin;body.append(r)}}
  {const li=loginInfo(me.handle);if(li){const r=html('button','menu-item flush',I.lockMd+'<span>'+(li.loc?'Change password':'Add a password')+'</span>');r.append(el('span','role',li.loc?'On':'Optional'));r.onclick=openSetupLogin;body.append(r)}}
}
function settingsAdvanced(body,me){
  body.append(el('div','menu-label flush','Account recovery'));
  const bk=html('button','menu-item flush',I.key+'<span>Recovery words</span>');bk.append(el('span','role'+(hasRecovery(me.handle)?'':' warn'),hasRecovery(me.handle)?'On':'Not set up'));bk.onclick=()=>openBackup();
  const rs=html('button','menu-item flush',I.down+'<span>Restore an account</span>');rs.onclick=()=>openRestore();
  body.append(bk,rs);
  {const tg=el('label','toggle');const cb=el('input');cb.type='checkbox';cb.checked=backupOn();
    cb.onchange=async()=>{if(!S.db){cb.checked=!cb.checked;toast('You need to be online for this.');return}cb.disabled=true;const on=cb.checked;
      try{P().backup=on;if(on)await uploadBackup();else await S.db.doc(await backupPath(me)).delete().catch(()=>{});await saveContacts();
        toast(on?'Message backup is on':'Message backup is off')}
      catch{P().backup=!on;cb.checked=!on;toast('That didn\u2019t save. Try again.')}cb.disabled=false};
    tg.append(cb,el('span',null,'Message backup'));
    body.append(tg,el('p','hint','On: your messages are restored when you log in on a new phone. Off: older messages stay only on the devices that already have them, so a stolen password reveals nothing from before.'))}
  body.append(el('div','menu-label flush','Security'));
  {const al=html('button','menu-item flush',I.lockMd+'<span>Lock Hush</span>');al.append(el('span','role',lsPw()?'Password':lockCfg()?'PIN':'Off'));al.onclick=openAppLock;body.append(al)}
  body.append(el('div','menu-label flush','Encryption'));
  const sv=el('label','toggle');const svc=el('input');svc.type='checkbox';svc.checked=!!ls.get('hush:serverView',false);
  svc.onchange=()=>{ls.set('hush:serverView',svc.checked);S.serverView=svc.checked;S.rendered=null;if(S.chan)renderConv();toast(svc.checked?'Chats now show what the server sees':'Chats are back to normal')};
  sv.append(svc,el('span',null,'Show what the server sees'));
  body.append(sv,el('p','hint','Shows messages the way they\u2019re stored on the server: scrambled text that only the people in the chat can unlock. Useful for checking that encryption is working.'));
  const how=html('button','menu-item flush',I.info+'<span>How encryption works</span>');how.onclick=openHow;body.append(how);
}
function openHow(){
  const {body}=sheet('How encryption works');
  [['Your keys stay on this phone. ','When you create an account, two private keys are made on this device and never uploaded. Only the matching public keys are shared.'],
   ['One-on-one chats. ','You and the other person each work out the same secret key from your own private key and their public key. The key itself is never sent anywhere (ECDH P-256, HKDF, AES-256-GCM).'],
   ['Groups and private channels. ','One shared key, locked separately for each member. Removing someone switches to a new key they never get. Invite links carry the key after the # sign, a part of a link browsers never send to the server.'],
   ['Everything inside is encrypted. ','Text, photos, videos, GIFs, polls, votes, reactions and replies are all locked before they leave your device.'],
   ['Messages are signed. ','Your signing key proves a message really came from you, so a fake one shows a warning.'],
   ['Your contacts are private. ','Your contact list is encrypted with a key only your device can work out, so the server can\u2019t see who you\u2019ve saved or what you call them.'],
   ['Security code warnings. ','Hush remembers each person\u2019s key the first time you talk. If it ever changes, you\u2019re warned and the chat pauses until you check, so a swapped key can\u2019t quietly intercept you.'],
   ['Recovery words. ','Six words made on your device unlock a locked box holding your keys. Nobody else has them, not even us, so nobody can reset your account.'],
   ['Search without snooping. ','You can search for people by name or username, but you can only ever read messages in chats you\u2019re part of. People can hide from search, and can make strangers send a request first.'],
   ['What the server can see. ','Who is in which chat and when messages are sent, plus names, photos, bios, typing and online status, and a scrambled fingerprint of your phone number if you add one. Not what anyone says. Turn on \u201cShow what the server sees\u201d in Settings to check.'],
   ['Public channels are open. ','Anyone can read them, so they can\u2019t be secret.'],
   ['This is a prototype. ','The App Store version would use the Signal Protocol library, which keeps changing keys after every message for even stronger protection.']]
  .forEach(([b,t])=>{const p=el('p');p.append(el('b',null,b),t);body.append(p)});
}
/* ---------- phone numbers: optional, only for finding & inviting people; never touches message keys ---------- */
function normPhone(s){
  let d=String(s||'').trim().replace(/[^\d+]/g,'');if(!d)return null;
  const plus=d.startsWith('+');d=d.replace(/\+/g,'');
  if(!plus){if(d.length===10)d='1'+d;} // no country code: assume US/Canada
  return d.length>=8&&d.length<=15?'+'+d:null;
}
async function phoneHash(e164){return b64u(await crypto.subtle.digest('SHA-256',enc.encode('hush-phone-v1:'+e164)))}
const myInviteLink=()=>APP_URL+'#add='+S.me.handle;
const inviteText=()=>`Join me on Hush, a private messenger where only you and the people you talk to can read your messages. My username is ${atOf(S.me.handle)}. ${myInviteLink()}`;
function smsLink(to,text){const a=el('a','primary btnlink','Send invite by text');a.href=`sms:${to||''}?&body=${encodeURIComponent(text)}`;a.target='_blank';a.rel='noopener';return a}
function shareRow(text,url){
  const row=el('div','row2');const copy=el('button','secondary','Copy invite');
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);toast('Invite copied')}catch{toast('Copying isn\u2019t allowed here. Use Share instead.')}};row.append(copy);
  if(navigator.share){const sh=el('button','secondary','Share');sh.onclick=async()=>{try{await navigator.share({title:'Join me on Hush',text,url})}catch(e){if(!e||e.name!=='AbortError')copy.click()}};row.append(sh)}
  return row;
}
function openPhoneInvite(){
  if(!S.me)return;
  const {body,close}=sheet('Invite by phone number');
  const f=el('label','field');const inp=el('input');inp.type='tel';inp.autocomplete='tel';inp.placeholder='+1 212 555 0123';f.append(el('span',null,'Phone number'),inp);
  const go=el('button','primary','Continue');go.style.width='100%';const out=el('div');const err=el('div','err');
  body.append(f);
  if(navigator.contacts&&navigator.contacts.select){const pick=html('button','menu-item flush',I.user+'<span>Choose from contacts</span>');
    pick.onclick=async()=>{try{const r=await navigator.contacts.select(['tel'],{multiple:false});const t=r&&r[0]&&r[0].tel&&r[0].tel[0];if(t){inp.value=t;go.click()}}catch{toast('Contacts aren\u2019t available here. Type the number instead.')}};body.append(pick)}
  body.append(go,err,out,el('p','hint','Looking up a number only checks whether someone chose to be findable by it. It never touches anyone\u2019s messages or encryption keys.'));
  setTimeout(()=>inp.focus(),50);
  inp.onkeydown=e=>{if(e.key==='Enter')go.click()};
  go.onclick=async()=>{
    err.textContent='';out.replaceChildren();const e164=normPhone(inp.value);
    if(!e164){err.textContent='Enter a full phone number, including the area code.';return}
    go.disabled=true;let found=null;
    try{if(S.db){const s=await S.db.doc('phones/'+await phoneHash(e164)).get();if(s.exists){const h=s.data().handle;if(h&&h!==S.me.handle&&S.dir[h])found=h}}}catch{}
    go.disabled=false;
    if(found){
      out.append(el('div','menu-label flush','On Hush'));const r=personRow(S.dir[found]);r.onclick=()=>{close();openDm(found)};
      const m=el('button','primary','Send a message');m.style.width='100%';m.onclick=()=>{close();openDm(found)};out.append(r,m);
    }else{
      out.append(el('p',null,`${e164} isn\u2019t findable on Hush yet. Send them an invite. The link opens a private chat with you once they sign up.`),
        smsLink(e164,inviteText()),shareRow(inviteText(),myInviteLink()));
    }
  };
}
/* ---------- contacts: your address book, encrypted with a key only you can work out ---------- */
function vaultKey(){
  const k='vault:'+S.me.handle;
  if(!S.chanKeys.has(k))S.chanKeys.set(k,(async()=>aesKey(await myKey('e'),await pubKey(S.me.ecdh,'e'),'hush-vault:'+S.me.handle))());
  return S.chanKeys.get(k);
}
async function loadContacts(){
  let vaultOk=false;S.contacts=[];S.prefs={pinned:[],muted:{},archived:[]};S.pins={};S.verified={};S.warned=new Set();S.contactsReady=false;rebuildNames();
  if(!S.db)return;const me=S.me.handle;
  let s;
  const readVault=async()=>S.db.doc(await vaultPath(me)).get();
  try{s=await readVault()}
  catch{await new Promise(r=>setTimeout(r,800));try{s=await readVault()}catch{}}  // device binding may still be settling on a fresh login; give it a moment
  try{if(!s){S.contactsReady=true;return}
    if(S.me.handle!==me)return;
    if(s.exists){const v=s.data();const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:enc.encode('vault|'+me)},await vaultKey(),unb64(v.ct));
      const o=JSON.parse(dec.decode(pt));const arr=Array.isArray(o)?o:(o.contacts||[]);
      S.contacts=arr.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string');
      const pr=!Array.isArray(o)&&o.prefs||{};
      const okK=k=>k&&k.ecdh&&k.sig&&typeof k.ecdh.x==='string'&&typeof k.ecdh.y==='string'&&typeof k.sig.x==='string'&&typeof k.sig.y==='string';
      if(!Array.isArray(o)&&o.pins&&typeof o.pins==='object')Object.entries(o.pins).forEach(([h,k])=>{if(okK(k))S.pins[h]=keysOf(k)});
      if(!Array.isArray(o)&&o.verified&&typeof o.verified==='object')Object.entries(o.verified).forEach(([h,v])=>{if(typeof v==='string')S.verified[h]=v});
      S.prefs={pinned:Array.isArray(pr.pinned)?pr.pinned.filter(x=>typeof x==='string'):[],muted:pr.muted&&typeof pr.muted==='object'?pr.muted:{},archived:Array.isArray(pr.archived)?pr.archived.filter(x=>typeof x==='string'):[],backup:pr.backup===true,
        rec:pr.rec&&typeof pr.rec.loc==='string'?{loc:pr.rec.loc,ts:+pr.rec.ts||0}:undefined,
        login:pr.login&&typeof pr.login.login==='string'?{login:pr.login.login,...(typeof pr.login.loc==='string'?{loc:pr.login.loc}:{})}:undefined,
        blocked:Array.isArray(pr.blocked)?pr.blocked.filter(h=>typeof h==='string'&&validHandle(h)):[],
        blockedChats:Array.isArray(pr.blockedChats)?pr.blockedChats.filter(x=>typeof x==='string'&&/^(?:[gc][A-Za-z0-9]{12}|d[A-Za-z0-9_-]{22})$/.test(x)):[]}}
    vaultOk=true}
  catch{toast('Your contacts couldn\u2019t be unlocked on this device.')}
  S.contactsReady=true;
  if(vaultOk&&s&&!s.exists&&S.freshSignup===me){S.freshSignup=null;S.prefs.backup=true;saveContacts()} // new account: Message backup on from the start
  if(vaultOk&&S.me.handle===me){const r=recLocal(me),v=S.prefs.rec; // tell your other devices about words set up here (and words set up before this update)
    if(r&&r.loc&&r.conf!==false&&(!v||(v.loc!==r.loc&&(r.ts||0)>(v.ts||0)))){S.prefs.rec={loc:r.loc,ts:r.ts||Date.now()};saveContacts()}
    // Keep the login note and its vault copy in step, so a login saved on the server survives a cleared browser.
    const hint=reconcileLoginHint(loginInfo(me),S.prefs.login);
    if(hint.toLocal)ls.set('hush:login:'+me,hint.toLocal);
    if(hint.toVault){S.prefs.login=hint.toVault;saveContacts();renderBanner()}}
  renderBanner();
  S.cache.clear();S.chanKeys.clear();tagCache.clear();rebuildNames();refreshDir().then(refreshPresence);pinAll();renderContacts();renderList();updateTitle();matchContacts();if(S.chan){const id=S.chan;openConv(id)}
}
let vaultQ=Promise.resolve();
function saveContacts(){
  if(!S.contactsReady||!S.db)return Promise.resolve();
  const me=S.me.handle,data=JSON.stringify({v:3,contacts:S.contacts,prefs:P(),pins:S.pins,verified:S.verified});rebuildNames();renderContacts();renderList();
  vaultQ=vaultQ.then(async()=>{
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('vault|'+me)},await vaultKey(),enc.encode(data));
    await S.db.doc(await vaultPath(me)).set({iv:b64(iv),ct:b64(ct),ts:Date.now()}); // at a blind address with no username on it, so the server can't tie this box to you
  }).catch(()=>toast('That didn\u2019t save. Check your connection and try again.'));
  return vaultQ;
}
function rebuildNames(){S.cnames=new Map();(S.contacts||[]).forEach(c=>{if(c.handle)S.cnames.set(c.handle,c.name)})}
const contactFor=h=>(S.contacts||[]).find(c=>c.handle===h);
async function lookupPhone(e164){try{const s=await S.db.doc('phones/'+await phoneHash(e164)).get();if(!s.exists)return null;const h=s.data().handle;
  if(!h||h===S.me.handle)return null;if(!S.dir[h]){const d=await S.db.doc('directory/'+h).get();if(!d.exists)return null;S.dir[h]=d.data()}return h}catch{return null}}
let matching=false;
async function matchContacts(){
  if(matching||!S.db)return;matching=true;let changed=false;const todo=S.contacts.filter(c=>c.phone&&!c.handle);
  for(let i=0;i<todo.length;i+=5){await Promise.all(todo.slice(i,i+5).map(async c=>{const h=await lookupPhone(c.phone);if(h){c.handle=h;changed=true}}))}
  matching=false;if(changed){await saveContacts();toast('Some of your contacts are on Hush')}
}
const TABS=['chats','contacts','profile']; // the bottom tabs, left to right; a sideways swipe on the list steps through them
function setTab(t,dir){
  const prev=S.tab;S.tab=t;renderBanner();$('#threads').hidden=t!=='chats';$('#contacts').hidden=t!=='contacts';$('#profileView').hidden=t!=='profile';
  document.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  const q=$('#q');if(t!=='profile'&&prev!==t&&q.value){q.value='';S.query=''}q.placeholder=t==='chats'?'Search chats, messages, people':'Search contacts';setListTitle();
  document.querySelector('.searchrow').hidden=t==='profile';
  const nb=$('#newBtn');nb.hidden=t==='profile';nb.innerHTML=t==='chats'?I.pencil:I.userPlus;nb.setAttribute('aria-label',t==='chats'?'New message':'Add contact');
  if(t==='contacts'){renderContacts();matchContacts()}
  else if(t==='profile'){const v=$('#profileView');v.replaceChildren();if(S.me)buildSettings(v);v.scrollTop=0}
  else renderList();
  const view=t==='chats'?$('#threads'):t==='contacts'?$('#contacts'):$('#profileView');
  if(dir&&view){view.classList.remove('tab-in-l','tab-in-r');void view.offsetWidth;view.classList.add(dir>0?'tab-in-r':'tab-in-l')}
}
/* ===== HUSH SWIPE NAV BEGIN ===== */
/* Swipe navigation, one controller for the whole app. A swipe to the right that starts at the left edge goes back:
   out of a sheet, out of an open chat to the list, out of a settings page or the archive (an open chat and those
   pages also take it from anywhere that is not busy with a sideways drag of its own). The side menu closes with a
   swipe to the left, and on the Chats list, where there is nothing to go back from, a swipe to the right from the
   left part of the list pulls it out. On the list, a sideways swipe moves between the bottom tabs. The screen follows the finger and
   goes where it was flung. Whatever already owns a sideways drag keeps it: the photo viewer, swipe-to-reply (always
   to the left, so never a back swipe), strips that scroll sideways, voice-message scrubbing, text being edited. */
const SWIPE={edge:28,slop:10,ratio:1.2,commit:.35,flick:.5,flickMin:30,menuZone:.4};
function swipeAxis(dx,dy){ // null until the finger has moved enough to tell, then 'x' (sideways) or 'y'
  if(Math.abs(dx)<SWIPE.slop&&Math.abs(dy)<SWIPE.slop)return null;return Math.abs(dx)>Math.abs(dy)*SWIPE.ratio?'x':'y'}
function swipeVelocity(pts){ // px per ms over about the last 100 ms of [time, x] samples
  if(!pts||pts.length<2)return 0;const [t1,x1]=pts[pts.length-1];let k=pts.length-2;while(k>0&&t1-pts[k][0]<100)k--;
  const [t0,x0]=pts[k];return t1>t0?(x1-x0)/(t1-t0):0}
function swipeCommits(d,width,v){ // d and v are measured toward where the swipe goes; a fling counts as much as a long drag
  if(v<=-SWIPE.flick/2)return false; // flung back the way it came: the user changed their mind
  return d>=width*SWIPE.commit||(v>=SWIPE.flick&&d>=SWIPE.flickMin)}
function tabStep(tabs,cur,dir){ // dir +1: the finger moves right, so the tab to the left comes in
  const i=tabs.indexOf(cur);if(i<0)return null;const j=i-dir;return j>=0&&j<tabs.length?tabs[j]:null}
function swipePlan(c){ // what a sideways swipe does, decided once its direction is known
  // c: {dir: +1 right / -1 left, edge: started at the left edge, layer: null|'viewer'|'cover'|'locked'|'sheet'|'drawer',
  //     blocked: started on something with its own sideways drag, chat: a chat fills the screen, onList, sub, tab, tabs,
  //     nearLeft: started in the left part of the list (not only the very edge, which iPhone Safari keeps for its Back)}
  if(c.layer==='viewer'||c.layer==='cover'||c.layer==='locked')return null;
  if(c.layer==='drawer')return c.dir<0?{kind:'drawer'}:null;
  if(c.layer==='sheet')return c.dir>0&&c.edge?{kind:'sheet'}:null;
  if(c.blocked&&!c.edge)return null;
  if(c.chat)return c.dir>0?{kind:'chat'}:null;
  if(!c.onList)return null;
  if(c.dir>0&&c.sub)return {kind:'sub'};
  const to=tabStep(c.tabs,c.tab,c.dir);if(to)return {kind:'tab',to};
  if(c.dir>0&&c.tab===c.tabs[0]&&c.nearLeft)return {kind:'menu'}; // nothing to go back to: the side menu comes out
  return {kind:'end'};
}
/* ===== HUSH SWIPE NAV END ===== */
const SWIPE_OWN='input,textarea,select,[contenteditable="true"],.seg,.vbars,.recbar,video';
function ownsSideways(t){ // the touch started on something that drags sideways by itself
  for(let n=t;n&&n.nodeType===1&&n!==document.body;n=n.parentElement){if(n.matches(SWIPE_OWN))return true;
    if(n.scrollWidth>n.clientWidth+2){const o=getComputedStyle(n).overflowX;if(o==='auto'||o==='scroll')return true}}
  return false}
function swipeLayer(){ // the top-most thing over the app, if any
  if(document.querySelector('.lock,.onboard'))return {kind:'cover'};
  if(document.querySelector('.lightbox'))return {kind:'viewer'};
  const all=document.querySelectorAll('body>.backdrop'),bd=all[all.length-1];if(!bd)return null;
  const dr=bd.querySelector('.drawer');if(dr)return {kind:'drawer',bd,node:dr};
  return bd._close?{kind:'sheet',bd,node:bd.querySelector('.sheet')||bd.firstElementChild}:{kind:'locked'};
}
const tabView=()=>$(S.tab==='contacts'?'#contacts':S.tab==='profile'?'#profileView':'#threads');
function swipeBack(){ // the back step a sub-page takes, the same as its Back button
  if(S.tab==='profile'&&isSettingsPage()){S.profilePage=S.profilePage==='settings'?'main':'settings';setTab('profile',-1);return}
  if(S.tab==='chats'&&S.showArchived){S.showArchived=false;setListTitle();renderList();const v=$('#threads');v.classList.remove('tab-in-l','tab-in-r');void v.offsetWidth;v.classList.add('tab-in-l')}
}
function setupSwipeNav(){
  const app=$('#app'),list=document.querySelector('.pane-list'),chat=$('#chatPane');let g=null,quietUntil=0;
  const narrow=()=>matchMedia('(max-width:759px)').matches;
  const still=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
  const decide=(k,dir)=>{
    const L=swipeLayer();if(!S.me&&!L)return null;
    const inChat=!!S.chan&&narrow()&&!L;
    const lr=list.getBoundingClientRect();
    const plan=swipePlan({dir,edge:k.edge,layer:L&&L.kind,blocked:ownsSideways(k.target),chat:inChat,
      onList:!L&&!inChat&&list.contains(k.target),sub:S.tab==='profile'?isSettingsPage():S.tab==='chats'&&!!S.showArchived,tab:S.tab,tabs:TABS,
      nearLeft:k.x0-lr.left<=lr.width*SWIPE.menuZone});
    if(!plan)return null;
    if(plan.kind==='chat'){plan.node=chat;plan.under=list;app.classList.add('sw-back')}
    else if(plan.kind==='sheet'||plan.kind==='drawer'){plan.node=L.node;plan.bd=L.bd}
    else if(plan.kind==='menu'){ // open it now, shut, and let the finger pull it out
      openDrawer();const D=swipeLayer();if(!D||D.kind!=='drawer')return null;
      plan.node=D.node;plan.bd=D.bd;plan.node.style.animation='none';plan.node.style.transform='translateX(-100%)';plan.bd.style.backgroundColor='rgba(10,8,25,0)'}
    else{plan.node=tabView();list.classList.add('sw-clip')}
    if(!plan.node)return null;
    plan.width=plan.node.getBoundingClientRect().width||innerWidth;
    for(const n of [plan.node,plan.under,plan.bd])if(n){n.style.transition='none';n.style.willChange='transform'}
    return plan};
  const paint=(p,d)=>{ // d: how far the finger has carried the screen, in the swipe's own direction (never negative)
    const f=Math.min(1,d/p.width);
    if(p.kind==='drawer'){p.node.style.transform=`translateX(${-d}px)`;p.bd.style.backgroundColor=`rgba(10,8,25,${.45*(1-f)})`;return}
    if(p.kind==='menu'){p.node.style.transform=`translateX(${Math.min(0,d-p.width)}px)`;p.bd.style.backgroundColor=`rgba(10,8,25,${.45*f})`;return}
    if(p.kind==='end'){p.node.style.transform=`translateX(${p.dir*Math.min(56,d*.25)}px)`;return}
    p.node.style.transform=`translateX(${p.kind==='tab'?p.dir*d:d}px)`;
    if(p.kind==='chat')p.under.style.transform=`translateX(${-25*(1-f)}%)`;
    else if(p.kind==='sheet')p.bd.style.backgroundColor=`rgba(10,8,25,${.45*(1-f)})`;
    else p.node.style.opacity=String(1-f*.5)};
  const tidy=p=>{for(const n of [p.node,p.under,p.bd])if(n){n.style.transition='';n.style.transform='';n.style.willChange='';n.style.opacity='';n.style.backgroundColor=''}
    app.classList.remove('sw-back');list.classList.remove('sw-clip')};
  const settle=(p,go)=>{ // glide to the end the finger chose, then do the navigation (or put everything back)
    const ms=still()?0:go?180:220,ease='cubic-bezier(.2,.8,.2,1)';
    for(const n of [p.node,p.under,p.bd])if(n)n.style.transition=`transform ${ms}ms ${ease},opacity ${ms}ms ${ease},background-color ${ms}ms ${ease}`;
    if(go)paint(p,p.width);else if(p.kind==='menu')paint(p,0);else{p.node.style.transform='';if(p.under)p.under.style.transform='';p.node.style.opacity='';if(p.bd){p.bd.style.opacity='';p.bd.style.backgroundColor=''}}
    setTimeout(()=>{
      if(p.kind==='menu'){if(go){if(navigator.vibrate)navigator.vibrate(6)}else p.bd._close();tidy(p);return} // stays open, or goes away again
      if(!go){tidy(p);return}
      if(navigator.vibrate)navigator.vibrate(6);
      if(p.kind==='chat'){app.classList.add('sw-quiet');tidy(p);closeConv();requestAnimationFrame(()=>requestAnimationFrame(()=>app.classList.remove('sw-quiet')))}
      else if(p.kind==='sheet'||p.kind==='drawer'){p.bd.style.visibility='hidden';(p.bd._close||(()=>p.bd.remove()))();tidy(p)}
      else if(p.kind==='tab'){tidy(p);setTab(p.to,-p.dir)}
      else{tidy(p);swipeBack()}
    },ms+20)};
  document.addEventListener('touchstart',e=>{
    if(g&&g.plan){settle(g.plan,false);g=null;return} // a second finger: let go of the swipe
    if(e.touches.length!==1){g=null;return}
    const t=e.touches[0];g={x0:t.clientX,y0:t.clientY,pts:[[e.timeStamp,t.clientX]],axis:null,plan:null,target:e.target,edge:t.clientX<=SWIPE.edge}},{passive:true,capture:true});
  document.addEventListener('touchmove',e=>{
    if(!g||e.touches.length!==1)return;const t=e.touches[0],dx=t.clientX-g.x0,dy=t.clientY-g.y0;
    if(!g.axis){g.axis=swipeAxis(dx,dy);if(!g.axis)return;if(g.axis==='y'){g=null;return}
      const dir=dx>0?1:-1;g.plan=decide(g,dir);if(!g.plan){g=null;return}g.plan.dir=dir}
    if(e.cancelable)e.preventDefault(); // the swipe is ours now: the page under it does not scroll as well
    g.pts.push([e.timeStamp,t.clientX]);if(g.pts.length>16)g.pts.shift();
    paint(g.plan,Math.max(0,dx*g.plan.dir))},{passive:false,capture:true});
  const end=e=>{if(!g)return;const k=g;g=null;if(!k.plan)return;quietUntil=Date.now()+400;
    const t=e.changedTouches&&e.changedTouches[0],d=t?(t.clientX-k.x0)*k.plan.dir:0;
    settle(k.plan,e.type==='touchend'&&k.plan.kind!=='end'&&swipeCommits(d,k.plan.width,swipeVelocity(k.pts)*k.plan.dir))};
  document.addEventListener('touchend',end,{capture:true});document.addEventListener('touchcancel',end,{capture:true});
  document.addEventListener('click',e=>{if(Date.now()<quietUntil){e.stopPropagation();e.preventDefault()}},true); // a swipe is not a tap
}
function contactAvatar(c,cls=''){return c.handle&&S.dir[c.handle]?avatar(c.handle,c.name,cls,S.dir[c.handle].photo):avatar(c.id,c.name,cls)}
function renderContacts(){
  const box=$('#contacts');if(!box||box.hidden||!S.me)return;box.replaceChildren();
  const q=S.query;
  const acts=el('div','c-actions');
  acts.append(actionRow(I.userPlus,'Add contact','By phone number',()=>openEditContact(null)));
  if(navigator.contacts&&navigator.contacts.select)acts.append(actionRow(I.phone,'Import from phone','Pick people from your address book',importContacts));
  acts.append(actionRow(I.link,'Invite friends','Share your personal invite link',openInviteFriends));
  box.append(acts);
  const all=(S.contacts||[]).filter(c=>!q||(c.name+' '+(c.phone||'')+' '+(c.handle||'')).toLowerCase().includes(q));
  const on=all.filter(c=>c.handle&&S.dir[c.handle]).sort((a,b)=>(isOnline(b.handle)-isOnline(a.handle))||a.name.localeCompare(b.name));
  const off=all.filter(c=>!(c.handle&&S.dir[c.handle])).sort((a,b)=>a.name.localeCompare(b.name));
  if(!all.length){const e=el('div','empty');
    if(q)e.append(el('strong',null,'No contacts found'),el('span',null,'Try a different name or number.'));
    else if(!S.contactsReady)e.append(el('span',null,'Loading contacts\u2026'));
    else e.append(el('strong',null,'No contacts yet'),el('span',null,'Add people by phone number. To find someone by username, use the search on Chats. Your contact list is encrypted, so only you can see who\u2019s in it.'));
    box.append(e);return}
  const row=c=>{const b=el('button','thread');const m=el('div','t-main');
    const st=c.handle&&S.dir[c.handle]?lastSeen(c.handle):(c.phone||'');
    m.append(withBadge(el('div','t-name',c.name),c.handle||''),el('div','t-sub'+(st==='online'?' online':''),st));
    const av=contactAvatar(c);
    if(c.handle&&isOnline(c.handle)){const w=el('div','av-wrap');w.append(av,el('span','on-dot'));b.append(w)}else b.append(av);
    b.append(m);b.onclick=()=>openContact(c.id);return b};
  if(on.length){box.append(el('div','menu-label','On Hush'));on.forEach(c=>box.append(row(c)))}
  if(off.length){box.append(el('div','menu-label','Invite to Hush'));
    off.forEach(c=>{const r=row(c);if(c.phone){const inv=el('span','pill','Invite');r.append(inv)}box.append(r)})}
}
function openContact(id){
  const c=(S.contacts||[]).find(x=>x.id===id);if(!c)return;const on=c.handle&&S.dir[c.handle];
  const {body,close}=sheet('Contact');
  const top=el('div','info-top');top.append(contactAvatar(c,'xl'),withBadge(el('div','info-name',c.name),c.handle||''));
  const subs=[];if(on)subs.push(atOf(c.handle),lastSeen(c.handle));if(c.phone)subs.push(c.phone);
  top.append(el('div','t-sub',subs.join(', ')));body.append(top);
  if(on&&S.dir[c.handle].name&&S.dir[c.handle].name!==c.name)body.append(el('p','t-sub center','Profile name: '+S.dir[c.handle].name));
  if(on){const m=el('button','primary','Send message');m.style.width='100%';m.onclick=()=>{close();openDm(c.handle)};body.append(m);
    const pr=html('button','menu-item flush',I.shield+'<span>Profile and safety number</span>');pr.onclick=()=>{close();openProfile(c.handle)};body.append(pr)}
  else{body.append(el('p',null,`${c.name} isn\u2019t on Hush yet. Invite them, and you\u2019ll see them here as soon as they make themselves findable by this number.`));
    if(c.phone)body.append(smsLink(c.phone,inviteText()));body.append(shareRow(inviteText(),myInviteLink()))}
  const ed=html('button','menu-item flush',I.edit+'<span>Edit contact</span>');ed.onclick=()=>{close();openEditContact(c)};
  const del=el('button','menu-item danger flush','Delete contact');
  del.onclick=async()=>{if(!confirm(`Delete ${c.name} from your contacts?`))return;S.contacts=S.contacts.filter(x=>x.id!==c.id);close();await saveContacts();toast('Contact deleted')};
  body.append(ed,del);
}
function openEditContact(c,prefill){
  const editing=!!c;const v=Object.assign({name:'',phone:'',handle:''},c||prefill||{});
  const {body,sh,close}=sheet(editing?'Edit contact':'Add contact');
  const fld=(label,val,attrs)=>{const f=el('label','field');const i=el('input');i.value=val||'';Object.assign(i,attrs||{});f.append(el('span',null,label),i);body.append(f);return i};
  const n=fld('Name',v.name,{maxLength:60,autocomplete:'off'});
  const ph=fld('Phone number',v.phone,{type:'tel',autocomplete:'off',placeholder:'+1 212 555 0123'});
  body.append(el('p','hint','Only you can see your contacts. They\u2019re encrypted on this device before they\u2019re saved, and the names you give people are only shown to you.'));
  const foot=el('div','sheet-foot');const go=el('button','primary',editing?'Save':'Add contact');const err=el('div','err');foot.append(go,err);sh.append(foot);
  setTimeout(()=>(v.name?ph:n).focus(),50);
  go.onclick=async()=>{
    err.textContent='';const name=n.value.trim(),rawPh=ph.value.trim(),keep=editing&&!rawPh&&c.handle?c.handle:'';
    if(!name){err.textContent='Enter a name.';return}
    const e164=rawPh?normPhone(rawPh):null;if(rawPh&&!e164){err.textContent='Enter a full phone number, including the area code.';return}
    if(!e164&&!keep){err.textContent='Add a phone number.';return}
    if(!S.db||!S.contactsReady){err.textContent='Contacts can\u2019t be saved right now. Check your connection.';return}
    const others=S.contacts.filter(x=>!c||x.id!==c.id);
    if(e164&&others.some(x=>x.phone===e164)){err.textContent='That number is already in your contacts.';return}
    go.disabled=true;let h=keep||null;
    if(e164)h=await lookupPhone(e164);
    const rec={id:c?c.id:rid(),name,phone:e164||null,handle:h,ts:c?c.ts:Date.now()};
    S.contacts=c?S.contacts.map(x=>x.id===c.id?rec:x):[...S.contacts,rec];
    close();await saveContacts();
    toast(h?`${name} is on Hush`:`${name} saved. They\u2019re not on Hush yet`);
  };
}
async function importContacts(){
  if(!S.contactsReady){toast('Contacts are still loading.');return}
  let picked;try{picked=await navigator.contacts.select(['name','tel'],{multiple:true})}catch{toast('Your phone\u2019s contacts aren\u2019t available here.');return}
  let n=0;for(const p of picked||[]){const e164=normPhone(p.tel&&p.tel[0]);if(!e164||S.contacts.some(x=>x.phone===e164))continue;
    S.contacts.push({id:rid(),name:String((p.name&&p.name[0])||e164).slice(0,60),phone:e164,handle:null,ts:Date.now()});n++}
  if(!n){toast('No new contacts to add.');return}
  await saveContacts();toast(`Added ${n} contact${n>1?'s':''}`);matchContacts();
}
function openInviteFriends(){
  const {body}=sheet('Invite friends');
  const box=el('input','linkbox');box.readOnly=true;box.value=myInviteLink();box.onfocus=()=>box.select();
  body.append(el('p',null,'Anyone who opens this link after signing up lands in a private chat with you.'),box,smsLink('',inviteText()),shareRow(inviteText(),myInviteLink()));
}
/* ---------- text formatting: **bold** __italic__ ++underline++ ~~strike~~ `mono` ```block``` ||spoiler|| [label](https://link) ---------- */
const FMT=[['```','pre'],['**','b'],['__','i'],['++','u'],['~~','s'],['||','spoiler'],['`','code']];
function mkLink(url){const a=el('a','fmt-link');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.onclick=e=>e.stopPropagation();return a}
/* ===== HUSH MENTIONS BEGIN ===== */
/* @mentions (SPEC.md 12.3). splitMentions is text work only: "@handle" becomes a link from the text alone, with no
   lookup, wherever it is not glued to a word (so an email address is not a mention). Only a tap looks the handle up:
   the same lookup the search box uses, then the one-on-one chat under the usual message-request rules. The server's
   tests lift this block; openMention needs the page and is not run there. */
const MENTION_RE=/@([a-z0-9_]{3,20})(?![\p{L}\p{N}_])/giu;   // a username, not glued to a letter or digit of any alphabet
function splitMentions(text){const out=[];let last=0,m;const re=new RegExp(MENTION_RE.source,'giu');text=String(text||'');
  while((m=re.exec(text))){const prev=m.index?text[m.index-1]:'';if(/[\p{L}\p{N}_@]/u.test(prev))continue;
    if(m.index>last)out.push({t:text.slice(last,m.index)});out.push({t:m[0],h:m[1].toLowerCase()});last=m.index+m[0].length}
  if(last<text.length)out.push({t:text.slice(last)});return out}
async function openMention(h){
  if(!S.me)return;
  if(h===S.me.handle){openSaved();return} // your own name: your Saved Messages, as Telegram does
  if(isBlocked(h)){toast('You blocked @'+h+'. Unblock them in Settings → Privacy to message them.');return}
  if(!S.db||!S.db.online){toast('You’re offline. Try again once you’re connected.');return}
  const d=S.dir[h]||await lookupHandle(h);
  if(!d){toast('Couldn’t find @'+h+' on Hush.');return}
  openDm(h);
}
/* ===== HUSH MENTIONS END ===== */
/* ===== HUSH MENTION PICKER BEGIN ===== */
/* The @mention picker in the message box (SPEC.md 12.3). Who can be suggested comes from what the page already knows
   about the conversation and nothing else: a group's members, a channel's owner and admins, the other person in a
   one-on-one chat. No search, no lookup, nothing leaves the device. These three are pure, so the server's tests lift
   them out; the picker itself lives in buildComposer. */
const MENTION_QUERY_RE=/(^|[\s( ])@([a-z0-9_]{0,20})$/i;   // the caret sits right after "@" plus up to 20 username characters
function mentionQuery(before){before=String(before||'');const m=MENTION_QUERY_RE.exec(before);return m?{start:before.length-m[2].length-1,q:m[2].toLowerCase()}:null}
function mentionPeople(c,me){if(!c)return [];const t=c.type||'channel';
  const hs=t==='channel'?[c.owner].concat(c.admins||[]):(c.members||[]);const seen=new Set();
  return hs.filter(h=>typeof h==='string'&&h&&h!==me&&!seen.has(h)&&seen.add(h))}
function mentionMatches(q,people,nameOf,max){q=String(q||'').toLowerCase();
  const rank=h=>{const n=String(nameOf(h)||'').toLowerCase();if(!q)return 2;if(h.startsWith(q))return 0;if(n.startsWith(q))return 1;
    if(n.split(/\s+/).some(w=>w.startsWith(q)))return 2;return h.includes(q)||n.includes(q)?3:-1};
  return people.map(h=>[rank(h),h]).filter(([r])=>r>=0).sort((a,b)=>a[0]-b[0]||(a[1]<b[1]?-1:a[1]>b[1]?1:0)).slice(0,max||6).map(([,h])=>h)}
/* ===== HUSH MENTION PICKER END ===== */
function linkify(text,parent){
  const re=/https?:\/\/[^\s<>"']+/g;let last=0,m;
  const plain=s=>{for(const seg of splitMentions(s)){if(!seg.h){parent.append(seg.t);continue}
    const sp=el('span','mention'+(S.me&&seg.h===S.me.handle?' me':''),seg.t);sp.setAttribute('role','link');sp.tabIndex=0;
    const go=e=>{e.stopPropagation();e.preventDefault();openMention(seg.h)};sp.onclick=go;sp.onkeydown=e=>{if(e.key==='Enter'||e.key===' ')go(e)};parent.append(sp)}};
  while((m=re.exec(text))){let u=m[0];const trail=u.match(/[.,!?;:)\]]+$/);if(trail)u=u.slice(0,-trail[0].length);
    if(m.index>last)plain(text.slice(last,m.index));const a=mkLink(u);a.textContent=u;parent.append(a);last=m.index+u.length;re.lastIndex=last}
  if(last<text.length)plain(text.slice(last));
}
function parseInto(parent,t,depth){
  let i=0,buf='';const flush=()=>{if(buf){linkify(buf,parent);buf=''}};
  while(i<t.length){
    if(t[i]==='['){const m=/^\[([^\]\n]{1,200})\]\((https?:\/\/[^\s)]{1,500})\)/.exec(t.slice(i,i+720));
      if(m){flush();const a=mkLink(m[2]);parseInto(a,m[1],depth+1);a.title=m[2];parent.append(a);i+=m[0].length;continue}}
    let hit=null;
    if(depth<6)for(const [mk,tag] of FMT){if(t.startsWith(mk,i)){const j=t.indexOf(mk,i+mk.length);
      if(j>i+mk.length&&!(tag==='code'&&t.slice(i+1,j).includes('\n'))){hit=[mk,tag,j];break}}}
    if(hit){const [mk,tag,j]=hit;flush();const inner=t.slice(i+mk.length,j);let e;
      if(tag==='pre'){e=el('pre','fmt-pre');e.textContent=inner.replace(/^\n/,'').replace(/\n$/,'')}
      else if(tag==='code')e=el('code','fmt-code',inner);
      else if(tag==='spoiler'){e=el('span','spoiler');parseInto(e,inner,depth+1);e.tabIndex=0;e.setAttribute('role','button');e.setAttribute('aria-label','Hidden text. Tap to reveal.');
        const show=ev=>{if(e.classList.contains('shown'))return;ev.stopPropagation();e.classList.add('shown');e.removeAttribute('role');e.removeAttribute('aria-label')};
        e.onclick=show;e.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' ')show(ev)}}
      else{e=el(tag);parseInto(e,inner,depth+1)}
      parent.append(e);i=j+mk.length;continue}
    buf+=t[i];i++;
  }
  flush();
}
function richText(t){const f=document.createDocumentFragment();parseInto(f,t,0);return f}
function plainText(t){return String(t||'').replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,'$1').replace(/\|\|[\s\S]*?\|\|/g,'\u2022\u2022\u2022\u2022').replace(/```|\*\*|__|\+\+|~~|`/g,'')}
/* ---------- key pinning: remember each person's key the first time, warn if it ever changes ---------- */
const keyChanged=h=>!!(S.me&&h!==S.me.handle&&S.pins&&S.pins[h]&&S.dir[h]&&!sameKeys(S.pins[h],S.dir[h]));
const fpOf=k=>k?[k.ecdh.x,k.sig.x].join('.'):'';
const isVerified=h=>!!(S.verified&&S.pins&&S.pins[h]&&S.verified[h]===fpOf(S.pins[h])&&!keyChanged(h));
let pinSaveT=null;
function pinAll(){
  if(!S.contactsReady||!S.me)return;let added=false;
  const hs=new Set();(S.contacts||[]).forEach(c=>c.handle&&hs.add(c.handle));S.convs.forEach(c=>(c.members||[]).forEach(h=>hs.add(h)));
  const cur=curConv();if(cur)(cur.members||[]).forEach(h=>hs.add(h));
  hs.forEach(h=>{if(h!==S.me.handle&&!S.pins[h]&&S.dir[h]){S.pins[h]=keysOf(S.dir[h]);added=true}});
  if(added){clearTimeout(pinSaveT);pinSaveT=setTimeout(saveContacts,1500)}
  checkKeys();
}
function checkKeys(){
  Object.keys(S.pins||{}).forEach(h=>{if(keyChanged(h)&&!S.warned.has(h)){S.warned.add(h);
    toast(`\u26a0\ufe0f ${displayName(h)}\u2019s security code changed`,'Review',()=>openProfile(h))}});
}
function acceptKey(h){
  if(!S.dir[h])return;S.pins[h]=keysOf(S.dir[h]);delete S.verified[h];S.warned.delete(h);
  S.cache.clear();S.chanKeys.clear();saveContacts();toast(`Accepted ${displayName(h)}\u2019s new security code`);
  if(S.chan){const id=S.chan;setTimeout(()=>openConv(id),50)}
}
function keyWarnBox(h,onReview){
  const w=el('div','keywarn');w.innerHTML=I.shield;const m=el('div','kw-main');
  m.append(el('b',null,`${displayName(h)}\u2019s security code changed`),
    el('span',null,'Hush accounts keep the same code forever, so this is unusual. It can mean someone is trying to intercept your messages. Check with them in person or on a call before you accept it.'));
  const row=el('div','kw-row');const rv=el('button','secondary','Review');rv.onclick=onReview||(()=>openProfile(h));
  const ok=el('button','secondary danger-t','Accept new code');ok.onclick=()=>{if(confirm(`Only accept if ${displayName(h)} confirmed the change. Accept their new security code?`))acceptKey(h)};
  row.append(rv,ok);m.append(row);w.append(m);return w;
}
/* ---------- backup: your account keys, locked with a password only you know ---------- */
function pwMeter(i,ctx){ // the live strength bar under a new-password field; ctx() returns {login, handle} to check against
  const m=el('div','pw-meter');m.setAttribute('aria-live','polite');const bar=el('div','pw-bar');for(let k=0;k<4;k++)bar.append(el('i'));const lab=el('span','pw-label');m.append(bar,lab);
  const draw=()=>{const c=(ctx&&ctx())||{};const s=pwStrength(i.value,c.login,c.handle);m.dataset.level=s.level;lab.textContent=s.label};
  i.addEventListener('input',draw);draw();return m;
}
function pwField(label,ac){
  const f=el('label','field');const wrap=el('div','pw-wrap');const i=el('input');i.type='password';i.autocomplete=ac;i.spellcheck=false;i.autocapitalize='none';
  const t=html('button','pw-eye',I.eye);t.type='button';t.setAttribute('aria-label','Show password');t.setAttribute('aria-pressed','false');
  t.addEventListener('mousedown',e=>e.preventDefault());
  t.onclick=e=>{e.preventDefault();const show=i.type==='password';i.type=show?'text':'password';t.innerHTML=show?I.eyeOff:I.eye;
    t.setAttribute('aria-label',show?'Hide password':'Show password');t.setAttribute('aria-pressed',String(show));i.focus()};
  wrap.append(i,t);f.append(el('span',null,label),wrap);return {f,i};
}
function openBackup(forced){
  const me=S.me,had=hasRecovery(me.handle);
  const {body,close}=sheet('Your recovery words',{locked:forced===true});
  const intro=()=>{body.replaceChildren(
    el('p',null,forced===true?'One last thing. Hush gives you six words that bring your account back if you lose this phone or forget your password.':'Six words that bring your account back if you lose this phone or forget your password.'),
    el('p','warnbox','Nobody can reset your account for you \u2014 not Hush, not your phone company, not a court order. That\u2019s what keeps you safe. It also means these words are your only way back in, so write them on paper and keep them somewhere safe.'));
    body.append(el('p','hint','The words bring back your account, contacts and groups. Past messages come back only if \u201cMessage backup\u201d in Settings is on.'));
    if(had&&forced!==true)body.append(el('p','hint','Making new words turns your old ones off.'));
    const go=el('button','primary',had&&forced!==true?'Make new words':'Show my words');go.style.width='100%';const err=el('div','err');body.append(go,err);
    go.onclick=async()=>{if(!S.db){err.textContent='You need to be online for this.';return}go.disabled=true;go.textContent='Locking your account\u2026';
      const w=newRecoveryWords();try{await saveRecovery(me,w);renderBanner();show(w)}catch{go.disabled=false;go.textContent='Try again';err.textContent='Couldn\u2019t save. Check your connection and try again.'}};
  };
  const show=w=>{body.replaceChildren(el('p',null,'Write these six words down, in order. Paper is best.'));
    const g=el('ol','rwords');w.forEach(x=>g.append(el('li',null,x)));body.append(g);
    const cp=el('button','secondary','Copy words');cp.onclick=async()=>{try{await navigator.clipboard.writeText(w.join(' '));toast('Copied. Paste them somewhere private.')}catch{toast('Couldn\u2019t copy. Write them down instead.')}};
    const row=el('div','row2');row.append(cp);body.append(row);
    const next=el('button','primary','I wrote them down');next.style.width='100%';body.append(next);next.onclick=()=>check(w);
  };
  const check=w=>{const k=1+(crypto.getRandomValues(new Uint8Array(1))[0]%RW_COUNT);
    body.replaceChildren(el('p',null,`Quick check. What is word number ${k}?`));
    const f=el('label','field');const i=el('input');i.autocapitalize='none';i.autocomplete='off';i.spellcheck=false;f.append(el('span',null,'Word '+k),i);
    const ok=el('button','primary','Done');ok.style.width='100%';const back=el('button','link','Show the words again');const err=el('div','err');
    body.append(f,ok,err,back);setTimeout(()=>i.focus(),50);i.onkeydown=e=>{if(e.key==='Enter')ok.click()};back.onclick=()=>show(w);
    ok.onclick=()=>{const t=(i.value.toLowerCase().match(/[a-z]+/)||[''])[0];const hit=t===w[k-1]||(t.length>=4&&w[k-1].startsWith(t.slice(0,4)));
      if(!hit){err.textContent='That\u2019s not it. Tap \u201cShow the words again\u201d to check.';return}
      confirmRecovery(me);close();toast('Recovery words saved. Keep them safe.');if(S.tab==='profile')setTab('profile')};
  };
  intro();
}
function openRestore(prefill){
  const {body,sh,close}=sheet('Restore an account');sh.parentNode.style.zIndex='60';
  body.append(el('p',null,'Type your six recovery words, in order. The first 4 letters of each word are enough.'),el('p','hint','Your account, contacts and groups come back. Past messages come back only if \u201cMessage backup\u201d was turned on.'));
  const f1=el('label','field');const code=el('textarea','linkbox');code.rows=3;code.placeholder='e.g. maple river anchor\u2026';code.value=prefill||'';code.spellcheck=false;code.autocapitalize='none';code.autocomplete='off';f1.append(el('span',null,'Recovery words'),code);
  const go=el('button','primary','Restore account');go.style.width='100%';const err=el('div','err');
  body.append(f1,go,err);setTimeout(()=>code.focus(),50);
  code.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go.click()}};
  go.onclick=async()=>{err.textContent='';
    let words;try{words=readWords(code.value)}catch(e){err.textContent=e.message==='count'?`That\u2019s ${e.n} word${e.n===1?'':'s'}. You need all six.`:`Word ${e.n} (\u201c${e.t}\u201d) isn\u2019t one of the recovery words. Check the spelling.`;return}
    go.disabled=true;go.textContent='Unlocking\u2026';
    try{if(!S.db)throw new Error('offline');const id=await openRecovery(words).catch(x=>{throw new Error(x.message==='nomatch'?'nomatch':'net')});
      if(!S.db)throw new Error('offline');
      ls.set('hush:backedUp:'+id.handle,Date.now());
      if(lastRecLoc)ls.set('hush:recovery:'+id.handle,{loc:lastRecLoc,ts:Date.now(),conf:true}); // these words work, so they count as set up
      if(!(await enterAccount(id))){go.disabled=false;go.textContent='Restore account';return}
      close();toast(S.backupRestored?'Welcome back, '+id.name+'. Your past messages are back too.':'Welcome back, '+id.name);
    }catch(e){err.textContent=e&&e.message==='nomatch'?'Those words don\u2019t match an account. Check the order and spelling.':'Couldn\u2019t restore. Check your connection and try again.';
      go.disabled=false;go.textContent='Restore account'}};
}
async function enterAccount(id){ // shared by log in and restore
  try{await ensureDev(id)}catch{} // a device key that could not be made or signed: the account key still signs in below
  try{await bindDevice(id)}catch{}
  S.backupRestored=await restoreBackup(id);
  const ref=S.db.doc('directory/'+id.handle),s=await ref.get();
  if(s.exists&&(s.data().kv||1)>(id.kv||1))throw new Error('stale');
  if(s.exists&&!sameKeys(keysOf(s.data()),id)){
    if(!confirm('The security code on the server doesn\u2019t match your account. Someone may have tampered with it. Continue and put your real code back?'))return false;
    await ref.update({ecdh:id.ecdh,sig:id.sig,kv:id.kv||1,ts:Date.now()})}
  else if(!s.exists)await ref.set(Object.assign({handle:id.handle,name:id.name,ecdh:id.ecdh,sig:id.sig,kv:id.kv||1,ts:Date.now()},id.dev&&id.dev.s?{devs:{[id.dev.id]:devEntry(id.dev)}}:{}));
  S.ids=S.ids.filter(x=>x.handle!==id.handle);S.ids.push(id);ls.set('hush:ids',S.ids);
  document.querySelectorAll('.onboard').forEach(x=>x.remove());start(id);
  if(S.resetFor&&(!S.resetFor.handle||S.resetFor.handle===id.handle)){const r=S.resetFor;S.resetFor=null;rememberLogin(id.handle,{login:r.login});
    setTimeout(()=>openSetupLogin(true),700)}else S.resetFor=null;
  if(S.pendingJoin){const pj=S.pendingJoin;S.pendingJoin=null;setTimeout(()=>handleJoin(pj),400)}
  return true;
}
function openSetupLogin(reset){ // reset: true after a password reset, 'again' when the server lost the saved box
  const me=S.me,li=loginInfo(me.handle);if(!li)return openAddLogin();const cur=li.loc&&!reset?li:null,again=reset==='again';
  const {body,close}=sheet(again?'Save your password again':reset?'Choose a new password':cur?'Change password':'Add a password');
  body.append(el('p',null,again?'The server no longer has your saved password, so it can\u2019t be used to log in until you save it again. Enter a password now; your old one is fine.':reset?'You\u2019re back in. Pick a new password so you can log in with it next time.':cur?'Enter your current password, then choose a new one.':'Optional. A password lets you log in on a new device even when your other devices aren\u2019t around. It locks your account on this device first, so Hush never sees it and can\u2019t reset it.'));
  const f0=el('label','field');const lg=el('input');lg.type='email';lg.autocomplete='username';lg.autocapitalize='none';lg.spellcheck=false;lg.placeholder='you@example.com or (212) 555-0134';f0.append(el('span',null,'Email or phone number'),lg);
  const {f:fo,i:po}=pwField('Current password','current-password');
  const {f:f1,i:p1}=pwField(cur?'New password':'Password (at least 8 characters)','new-password');
  const {f:f2,i:p2}=pwField('Type it again','new-password');
  const go=el('button','primary',cur?'Change password':'Save password');go.style.width='100%';const err=el('div','err');
  body.append(...(cur?[fo]:[]),f1,f2,go,err);setTimeout(()=>(cur?po:p1).focus(),50);
  go.onclick=async()=>{err.textContent='';
    const login=li.login;
    const bad=pwProblem(p1.value,login,me.handle);if(bad){err.textContent=bad;return}if(p1.value!==p2.value){err.textContent='The passwords don\u2019t match.';return}
    go.disabled=true;go.textContent='Locking your account\u2026';
    try{
      if(cur){try{await openLoginBox(login,po.value)}catch{throw new Error('oldpw')}}
      const loc=await saveLoginBox(me,login,p1.value);rememberPw(login,p1.value);
      if(cur&&cur.loc&&cur.loc!==loc)S.db.doc('accounts/'+cur.loc).delete().catch(()=>{});
      rememberLogin(me.handle,{login,loc});ls.set('hush:backedUp:'+me.handle,Date.now());renderBanner();
      close();toast(cur?'Password changed':'Password added');if(S.tab==='profile')setTab('profile');
    }catch(e){go.disabled=false;go.textContent=cur?'Change password':'Save password';
      err.textContent=e&&e.message==='taken'?'That email or number already has a Hush account.':e&&e.message==='oldpw'?'Your current password isn\u2019t right.':'Couldn\u2019t save. Check your connection and try again.'}};
}
/* ---------- phone or email + code login; keys move between your devices, never through readable server data ----------
   Prototype note: there's no texting service here, so the code is shown on screen. The real app sends it by SMS or email. */
const isEmailLogin=l=>!!l&&l.includes('@');
const loginKind=l=>isEmailLogin(l)?'email':'phone number';
function demoCode(){return String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,'0')}
function deviceName(){const u=navigator.userAgent;const os=/iPhone/.test(u)?'iPhone':/iPad/.test(u)?'iPad':/Android/.test(u)?'Android':/Mac/.test(u)?'Mac':/Windows/.test(u)?'Windows PC':'a device';
  const br=/CriOS|Chrome/.test(u)&&!/Edg/.test(u)?'Chrome':/Edg/.test(u)?'Edge':/Firefox|FxiOS/.test(u)?'Firefox':/Safari/.test(u)?'Safari':'a browser';return br+' on '+os}

// --- the device that's already logged in: watches for "let me in" requests and asks you to approve ---
let linkPollT=null;const linkSeen=new Set();
function watchLinkRequests(){
  clearInterval(linkPollT);linkPollT=null;const li=S.me&&loginInfo(S.me.handle);if(!S.db||!li)return;
  const me=S.me;
  linkPollT=setInterval(async()=>{if(S.me!==me)return;try{const tag=await loginTag(li.login),s=await S.db.doc('linkreqs/'+tag).get();if(!s.exists)return;const r=s.data();
    if(r.state!=='wait'||!r.pub||Date.now()-r.ts>5*60e3||linkSeen.has(r.ts+':'+r.pub.x))return;linkSeen.add(r.ts+':'+r.pub.x);askApprove(tag,r)}catch{}},3500);
}
function askApprove(tag,r){
  const {body,sh,close}=sheet('Log in on a new device?');sh.parentNode.style.zIndex='70';
  body.append(el('p',null,(r.dev||'A device')+' is trying to log in to your account. To let it in, scan the QR code on its screen with this device.'),
    el('p','warnbox','If someone asked you to scan or approve something, tap Not me. Hush will never ask you to.'));
  const row=el('div','reqbtns'),no=el('button','secondary','Not me'),yes=el('button','primary','Scan QR code');row.append(no,yes);body.append(row);
  try{navigator.vibrate&&navigator.vibrate([30,60,30])}catch{}
  no.onclick=async()=>{try{await S.db.doc('linkreqs/'+tag).update({state:'no'})}catch{}close();toast('Login blocked. Nothing was shared.')};
  yes.onclick=()=>{close();openLinkScanner()};
}
// --- QR reading: the phone's built-in reader when there is one, otherwise a small library loaded on demand ---
let jsqrP=null;
function loadJsQR(){if(window.jsQR)return Promise.resolve(window.jsQR);
  return jsqrP||(jsqrP=new Promise((res,rej)=>{const sc=document.createElement('script');sc.integrity='sha384-b5Ya4Bq3qCyz39m2ISh+4DxjAIljdeFwK/BsXLuj9gugaNwAcj/ia15fxNZL9Nlx';
    sc.src='vendor/jsQR.js?v='+sc.integrity.slice(7,19).replace(/[^A-Za-z0-9]/g,''); // versioned from its pin, like the files index.html loads
    sc.onload=()=>window.jsQR?res(window.jsQR):rej(new Error('noscan'));sc.onerror=()=>{jsqrP=null;rej(new Error('noscan'))};document.head.append(sc)}))}
async function qrDecoder(){
  if('BarcodeDetector' in window){try{const f=await BarcodeDetector.getSupportedFormats();if(f.includes('qr_code')){const d=new BarcodeDetector({formats:['qr_code']});
    return async src=>{const r=await d.detect(src);return r[0]&&r[0].rawValue||null}}}catch{}}
  const jq=await loadJsQR();const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
  return async src=>{const w=src.videoWidth||src.naturalWidth||src.width,h=src.videoHeight||src.naturalHeight||src.height;if(!w||!h)return null;
    const k=Math.min(1,800/Math.max(w,h));cv.width=Math.round(w*k);cv.height=Math.round(h*k);cx.drawImage(src,0,0,cv.width,cv.height);
    const r=jq(cx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height,{inversionAttempts:'attemptBoth'});return r&&r.data||null};
}
const linkScanErr=e=>{const m=e&&e.message;return m==='notqr'?'That isn\u2019t a Hush login code.'
  :m==='nomatch'?'That code isn\u2019t from a login to your account. Never scan a code someone else sends you.'
  :m==='expired'?'That login request expired or was cancelled. Start again on the new device.'
  :m==='nologin'?'Add a phone number or email in Settings first.':'That didn\u2019t go through. Check your connection and try again.'};
async function approveFromQr(text){
  const m=/^hush-link:2:([A-Za-z0-9_-]{22}):([A-Za-z0-9_-]{43})$/.exec(String(text||'').trim());if(!m)throw new Error('notqr');
  const li=S.me&&loginInfo(S.me.handle);if(!li||!S.db)throw new Error('nologin');
  const tag=await loginTag(li.login),s=await S.db.doc('linkreqs/'+tag).get();if(!s.exists)throw new Error('nomatch');const r=s.data();
  if(!r.pub||await pubFp(r.pub)!==m[2])throw new Error('nomatch'); // the code must match the device that's asking to log in to this account
  if(r.state!=='wait'||Date.now()-r.ts>5*60e3)throw new Error('expired');
  linkSeen.add(r.ts+':'+r.pub.x);await approveLink(tag,r,unb64u(m[1]));return r.dev;
}
function openLinkScanner(){
  const {body,sh,close}=sheet('Link a new device');sh.parentNode.style.zIndex='70';
  const li=S.me&&loginInfo(S.me.handle);
  if(!li){body.append(el('p',null,'Add a phone number or email in Settings first. Then log in with it on the new device and scan the code it shows.'));return}
  body.append(el('p','hint','On the new device, open Hush and log in with '+li.login+'. Then point this camera at the QR code it shows.'));
  const cam=el('div','scan-box'),vid=document.createElement('video');vid.setAttribute('playsinline','');vid.muted=true;cam.append(vid);
  const status=el('p','hint center','Starting the camera\u2026'),err=el('div','err');
  const pick=el('button','link','Can\u2019t use the camera? Pick a photo you took of the code');
  const file=document.createElement('input');file.type='file';file.accept='image/*';file.hidden=true;
  body.append(cam,status,err,pick,file,el('p','hint','Only scan a code on a device you\u2019re holding yourself. Anyone who gets you to scan their code gets your account.'));
  let stream=null,done=false,working=false;
  const stop=()=>{done=true;if(stream)stream.getTracks().forEach(t=>t.stop());stream=null};
  const watch=setInterval(()=>{if(!sh.isConnected){stop();clearInterval(watch)}},400);
  const use=async text=>{if(done||working||!text)return;working=true;err.textContent='';status.textContent='Checking\u2026';
    try{const dev=await approveFromQr(text);stop();close();toast('Approved. Your account is opening on '+(dev||'the new device')+'.')}
    catch(e){err.textContent=linkScanErr(e);status.textContent=stream?'Point the camera at the QR code.':'';setTimeout(()=>{working=false},1500)}};
  pick.onclick=()=>file.click();
  file.onchange=async()=>{const f=file.files[0];file.value='';if(!f)return;err.textContent='';
    try{const decode=await qrDecoder(),t=await decode(await createImageBitmap(f));if(!t){err.textContent='No QR code found in that photo. Try a closer, sharper photo.';return}await use(t)}
    catch{err.textContent='Couldn\u2019t read that photo.'}};
  (async()=>{let decode;try{decode=await qrDecoder()}catch{status.textContent='';err.textContent='The QR scanner couldn\u2019t load. Check your connection.';return}
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});if(done){stop();return}vid.srcObject=stream;await vid.play();
      status.textContent='Point the camera at the QR code on your new device.'}
    catch{stop();done=false;cam.remove();status.textContent='The camera isn\u2019t available here. You can pick a photo of the code instead.';return}
    const tick=async()=>{if(done)return;if(!working&&vid.readyState>=2){try{const t=await decode(vid);if(t){if(t.startsWith('hush-link:'))await use(t);else status.textContent='That isn\u2019t a Hush login code.'}}catch{}}
      setTimeout(tick,250)};tick();
  })();
}
async function approveLink(tag,r,secret){
  if(!(secret instanceof Uint8Array)||secret.length!==16)throw new Error('notqr');
  const e=await ephemeral(),key=await linkKey(e.privateKey,r.pub,secret),iv=crypto.getRandomValues(new Uint8Array(12));
  let payload=bundleOf(S.me);const dk=r.devk,okDev=dk&&/^[a-zA-Z0-9]{6,20}$/.test(dk.id||'')&&['x','y','sx','sy'].every(f=>typeof dk[f]==='string'&&dk[f].length>20);
  if(okDev&&S.me.dev&&S.me.dev.s){ // vouch for the new device with THIS device's key, and hand it every chat key this device holds
    const d={id:dk.id,ecdh:{x:dk.x,y:dk.y},sig:{x:dk.sx,y:dk.sy},by:S.me.dev.id};
    const sg=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},await devKey('s'),devMsg(S.me.handle,d)));
    payload={v:2,b:bundleOf(S.me),d:{by:S.me.dev.id,s:sg},ks:ksMap(),trust:[S.me.dev.id,...(S.me.trust||[])]};
    S.me.trust=[...new Set([...(S.me.trust||[]),dk.id])];ls.set('hush:ids',S.ids);wrapSynced.clear();
    const ent=devEntry(Object.assign({},d,{s:sg,ts:Date.now()}));if(S.dir[S.me.handle])(S.dir[S.me.handle].devs=S.dir[S.me.handle].devs||{})[dk.id]=ent;
    S.db.doc('directory/'+S.me.handle).update({devs:{[dk.id]:ent}}).catch(()=>{});
  }
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('hush-link-v2')},key,enc.encode(JSON.stringify(payload))));
  await S.db.doc('linkreqs/'+tag).update({state:'ok',epub:await pubJwk(e),iv:b64u(iv),ct:b64u(ct)});
}
// --- the new device: asks, waits, then unlocks what the old device sent ---
async function requestLink(login,onStatus){
  const tag=await loginTag(login),e=await ephemeral(),secret=crypto.getRandomValues(new Uint8Array(16)),pub=await pubJwk(e),dv=await newDev();
  const ts=Date.now();await S.db.doc('linkreqs/'+tag).set({state:'wait',pub,ts,dev:deviceName(),devk:{id:dv.id,x:dv.ecdh.x,y:dv.ecdh.y,sx:dv.sig.x,sy:dv.sig.y}});
  onStatus({qr:'hush-link:2:'+b64u(secret)+':'+await pubFp(pub)});
  let stop=false;const cancel=()=>{stop=true};
  const done=(async()=>{while(!stop&&Date.now()-ts<5*60e3){await new Promise(r=>setTimeout(r,2000));if(stop)return null;
      try{const s=await S.db.doc('linkreqs/'+tag).get();if(!s.exists)continue;const r=s.data();if(r.ts!==ts)throw new Error('replaced');
        if(r.state==='no'){S.db.doc('linkreqs/'+tag).delete().catch(()=>{});throw new Error('denied')}
        if(r.state==='ok'){const key=await linkKey(e.privateKey,r.epub,secret);
          const pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(r.iv),additionalData:enc.encode('hush-link-v2')},key,unb64u(r.ct));
          S.db.doc('linkreqs/'+tag).delete().catch(()=>{});const o=JSON.parse(dec.decode(pt));if(o.v!==2)return idFromBundle(o);
          const id=idFromBundle(o.b);if(o.d&&typeof o.d.s==='string'&&typeof o.d.by==='string'){id.dev=Object.assign(dv,{by:o.d.by,s:o.d.s,ts:Date.now()});id.trust=Array.isArray(o.trust)?o.trust.filter(x=>typeof x==='string'):[]}
          if(o.ks&&typeof o.ks==='object'){const cur=ls.get('hush:ks:'+id.handle,{});for(const [cid,m] of Object.entries(o.ks))if(m&&typeof m==='object')cur[cid]=Object.assign({},cur[cid]||{},m);ls.set('hush:ks:'+id.handle,cur);S.ksFor=null;if(S.me&&S.me.handle===id.handle)scheduleBackup()}
          return id}}
      catch(err){if(['denied','replaced','format'].includes(err.message))throw err}}
    if(!stop)throw new Error('timeout');return null})();
  return {cancel,done};
}
function signedOutHere(){
  const h=S.me.handle;clearInterval(linkPollT);S.ids=S.ids.filter(x=>x.handle!==h);ls.set('hush:ids',S.ids);
  forgetAccountData(h).then(()=>{
    if(S.ids.length){start(S.ids[0]);toast(atOf(h)+' was moved to a new device and logged out here.')}
    else{S.me=null;dropUnsealed();if(S.db&&S.db.prove)S.db.prove(null);showOnboard(false,'Your account was set up fresh on another device, so it was logged out here.')}});
}
/* ---------- log out: this device forgets one account ----------
   Its private keys, chat keys, drafts and settings are erased here; other accounts on the device stay. The server
   keeps nothing about this device, so the only other step is taking the device off the profile's device list. */
const ownedBy=(k,h)=>k==='hush:ks:'+h||String(k).endsWith(':'+h)||String(k).includes(':'+h+':');
async function forgetAccountData(h){ // every local record filed under this username, and the invite secrets it made
  forgetEntries((k,v)=>ownedBy(k,h)||(String(k).startsWith('hush:inv:')&&!!v&&v.h===h));
  S.ksFor=null;S.ks=null;
  if(!S.ids.length){await forgetDevice();await unlockStore()} // the last account: the blob and the device key go too, and a fresh store is made
  else await secSave;
}
function dropUnsealed(){ // nothing unsealed stays in memory: keys, caches, decrypted media, profiles, the open chat
  for(const p of S.media.values())Promise.resolve(p).then(u=>{try{URL.revokeObjectURL(u)}catch{}},()=>{});
  S.contacts=[];S.contactsReady=false;S.prefs=null;S.convs=[];S.previews.clear();S.chatDocs.clear();S.dmPeers={};dmIds.clear();
  S.chanKeys.clear();S.keys.clear();S.cache.clear();S.media.clear();S.mediaBlobs.clear();tagCache.clear();unsealCache.clear();metaCache.clear();devCache.clear();
  S.posts=[];S.rawPosts=[];S.older=[];S.scheduled=[];S.future=[];S.dir={};S.presence={};S.pins={};S.verified={};S._vp=null;for(const k of Object.keys(backupPaths))delete backupPaths[k];
  dirMiss.clear();loginHealed.clear();healed.clear();wrapSynced.clear();baseDone.clear();dmRenoted.clear();linkSeen.clear();rebuildNames();
}
function confirmSheet(title,text,opt={}){ // a question with two answers; resolves true only for the first one
  return new Promise(res=>{const {body,close}=sheet(title,{locked:true});
    const end=v=>{document.removeEventListener('keydown',esc);close();res(v)},esc=e=>{if(e.key==='Escape')end(false)};
    body.append(el('p',null,text));if(opt.note)body.append(el('p','hint',opt.note));
    const row=el('div','reqbtns'),no=el('button','secondary',opt.no||'No'),yes=el('button',opt.danger?'btn-danger':'primary',opt.yes||'Yes');
    row.append(no,yes);body.append(row);no.onclick=()=>end(false);yes.onclick=()=>end(true);document.addEventListener('keydown',esc);setTimeout(()=>no.focus(),50)})}
async function logOutAccount(h,opt={}){
  const id=S.ids.find(x=>x.handle===h);if(!id)return;
  const li=loginInfo(h),ways=[li&&li.loc?'your '+loginKind(li.login)+' and password':null,hasRecovery(h)?'your six recovery words':null].filter(Boolean);
  const words=ways.length?`To get back in you’ll need ${ways.join(', or ')}. A device where you’re still logged in can also let you back in.`
    :'You haven’t saved a password or recovery words for this account. Without one of those, there is no way back in: this username would be lost for good.';
  if(!opt.confirmed&&!(await confirmSheet('Log out?','Are you sure you want to log out?',{note:`${words} This device’s copy of your keys and chats will be erased.`,danger:true})))return;
  const current=S.me&&S.me.handle===h;
  if(current&&S.db){ // best effort, a couple of seconds at most: take this device off the profile and stop showing as online
    const quick=p=>Promise.race([p,new Promise(r=>setTimeout(r,2000))]).catch(()=>{});
    if(id.dev&&id.dev.id)await quick(S.db.doc('directory/'+h).update({devs:{[id.dev.id]:null}}));
    await quick(S.db.doc('presence/'+h).set({ts:0,hidden:true}));
  }
  if(current){clearInterval(linkPollT);linkPollT=null;if(S.unsubConvs){S.unsubConvs();S.unsubConvs=null}closeConv();S.me=null;if(S.db&&S.db.prove)S.db.prove(null);
    dropUnsealed();renderList()} // nothing unlocked stays in memory, and a fresh (empty) draw retires any list draw still in flight with the old chats
  S.ids=S.ids.filter(x=>x.handle!==h);ls.set('hush:ids',S.ids);if(ls.get('hush:active',null)===h)ls.set('hush:active',null);
  await forgetAccountData(h);
  if(current){
    S.profilePage='main';renderList();updateTitle();
    showOnboard(false,`You’re logged out of ${atOf(h)} on this device.`);
  }else{toast(atOf(h)+' was logged out on this device');if(S.tab==='profile')setTab('profile')}
}
/* ---------- privacy: no list of users; profiles and online status load only for people you deal with ---------- */
const validHandle=h=>/^[a-z0-9_]{3,20}$/.test(h);
function relevantHandles(){const hs=new Set();if(S.me)hs.add(S.me.handle);(S.contacts||[]).forEach(c=>c.handle&&hs.add(c.handle));
  S.convs.forEach(c=>(c.members||[]).forEach(h=>hs.add(h)));S.previews.forEach(c=>(c.members||[]).forEach(h=>hs.add(h)));return [...hs]}
async function loadDir(handles,force){
  if(!S.db)return false;const want=handles.filter(h=>validHandle(h)&&(force||!S.dir[h]));let changed=false;
  for(let i=0;i<want.length;i+=20)await Promise.all(want.slice(i,i+20).map(async h=>{try{const s=await S.db.doc('directory/'+h).get();const v=s.exists?s.data():null;
    if(v&&v.ecdh&&v.sig&&JSON.stringify(S.dir[h])!==JSON.stringify(v)){S.dir[h]=v;changed=true}
    if(v&&S.me&&!dmIds.has(h))dmIdFor(h).catch(()=>{}); // work out the DM address now, so the quick lookups below have it
  }catch{}}));
  return changed;
}
let dirBusy=false;
async function refreshDir(force){
  if(dirBusy||!S.db||!S.me)return;dirBusy=true;let changed=false;try{changed=await loadDir(relevantHandles(),force)}finally{dirBusy=false}
  if(S.dir[S.me.handle]&&(S.dir[S.me.handle].kv||1)>(S.me.kv||1)){signedOutHere();return}
  const first=!S.dirReady;if(first){S.dirReady=true}if(first||force){republishSelf().then(publishDev).catch(()=>{});syncSearch()}
  if(!changed&&!first)return;
  pinAll();renderList();renderContacts();
  if(S.chan){const c=curConv();const warn=!!(c&&typeOf(c)==='dm'&&!isSelf(c)&&keyChanged(dmPeer(c)));
    if(warn!==S.warnShown)openConv(S.chan);else{S.rendered=null;renderConv();refreshHeader()}}
}
async function lookupHandle(h){ // finds someone by their exact username, unless they chose to be reachable only by link
  h=String(h||'').trim().toLowerCase().replace(/^@/,'');if(!validHandle(h)||!S.db||(S.me&&h===S.me.handle))return null;
  try{const s=await S.db.doc('directory/'+h).get();if(!s.exists)return null;const v=s.data();if(!v.ecdh||!v.sig)return null;
    if(v.findable===false&&!contactFor(h)&&!S.convs.some(c=>(c.members||[]).includes(h)))return null;
    S.dir[h]=v;return v}catch{return null}
}
async function refreshPresence(){
  if(!S.db||!S.me)return;const hs=new Set();(S.contacts||[]).forEach(c=>c.handle&&hs.add(c.handle));
  S.convs.forEach(c=>{if(typeOf(c)!=='channel')(c.members||[]).forEach(h=>hs.add(h))});const cur=curConv();if(cur)(cur.members||[]).forEach(h=>hs.add(h));
  hs.delete(S.me.handle);const p={};
  await Promise.all([...hs].slice(0,300).map(async h=>{try{const s=await S.db.doc('presence/'+h).get();if(s.exists)p[h]=s.data()}catch{}}));
  if(JSON.stringify(p)!==JSON.stringify(S.presence)){S.presence=p;refreshHeader();renderList();renderContacts()}
}
/* ---------- profile search: only people who allow it are listed in the search index ---------- */
async function syncSearch(){
  if(!S.db||!S.me||!S.dirReady)return;const d=S.dir[S.me.handle];if(!d)return;
  const name=String(d.name||S.me.name||'').toLowerCase().trim(),parts=name.split(/\s+/);
  const want=d.findable===false?null:{h:S.me.handle,n:name,n2:parts[1]||parts[0]||''};
  const k='hush:search:'+S.me.handle,was=ls.get(k,'');if(JSON.stringify(want)===was)return;
  try{if(want)await S.db.doc('search/'+S.me.handle).set(want);else await S.db.doc('search/'+S.me.handle).delete();ls.set(k,JSON.stringify(want))}catch{}
}
async function searchUsers(q){
  q=String(q||'').trim().toLowerCase().replace(/^@/,'');if(q.length<2||!S.db)return [];
  const hs=new Set();
  await Promise.all(['h','n','n2'].map(async f=>{try{const s=await S.db.collection('search').where(f,'>=',q).where(f,'<=',q+'\uf8ff').limit(10).get();
    s.docs.forEach(x=>{const h=(x.data()||{}).h;if(validHandle(h)&&h!==S.me.handle&&!isBlocked(h))hs.add(h)})}catch{}}));
  await loadDir([...hs]);return [...hs].filter(h=>S.dir[h]);
}
function liveSearch(inp,draw){ // looks people up as you type, then redraws the list
  let t=null;const done=new Set();
  return q=>{if(q.length<2||done.has(q))return;clearTimeout(t);t=setTimeout(()=>{done.add(q);
    Promise.all([searchUsers(q),validHandle(q)&&!S.dir[q]?lookupHandle(q):null]).then(([r,x])=>{if((r.length||x)&&inp.value.trim().toLowerCase().replace(/^@/,'')===q)draw()})},300)};
}
const knownHandle=h=>!!contactFor(h)||S.convs.some(c=>(c.members||[]).includes(h));

/* ---------- message requests ---------- */
/* Whether a one-on-one chat is still a request lives on this side only, in the encrypted vault: the server knows
   nothing about it (SPEC.md 5.6). "in" = they asked me, "out" = I asked them, "ok" = accepted, "no" = deleted. */
const dmInfo=cid=>(S.prefs&&S.prefs.dms&&S.prefs.dms[cid])||null;
function setDmInfo(cid,patch){const m=P().dms||(P().dms={});const next=Object.assign({},m[cid]||{},patch);if(JSON.stringify(m[cid])===JSON.stringify(next))return;m[cid]=next;if(S.contactsReady)saveContacts()}
const reqTo=c=>{if(!c||typeOf(c)!=='dm'||isSelf(c))return null;const i=dmInfo(c.id);if(!i||!i.req||i.req==='ok')return null;return i.req==='out'?dmPeer(c):S.me.handle};
const isRequest=c=>reqTo(c)===S.me.handle;                       // someone asked to message me
const isDeclined=c=>{const i=c&&dmInfo(c.id);return !!(i&&i.req==='no')};
const pendingRequests=()=>S.convs.filter(c=>isRequest(c)&&!isDeclined(c)&&c.last&&!hiddenConv(c));
function awaitingAccept(c){ // I'm the one waiting for them to accept
  if(!c||typeOf(c)!=='dm'||isSelf(c))return false;const i=dmInfo(c.id);if(i&&i.req)return i.req==='out';const peer=dmPeer(c);
  return !S.convs.some(x=>x.id===c.id)&&!!(S.dir[peer]&&S.dir[peer].requests===true);
}
async function answerRequest(c,ok){
  try{if(ok){setDmInfo(c.id,{req:'ok'});try{await S.db.collection('channels/'+c.id+'/posts').add(await sealSvc(c,'accept',0))}catch{}toast('Request accepted. You can chat now.');openConv(c.id)}
    else{setDmInfo(c.id,{req:'no'});closeConv();toast('Request deleted. '+displayName(dmPeer(c))+' won\u2019t be told.')}
    renderList();updateTitle()}catch{toast('That didn\u2019t go through. Try again.')}
}
function requestBar(c){
  const peer=dmPeer(c),f=el('div','composer readonly reqbar');
  f.append(el('p',null,(contactFor(peer)?'':atOf(peer)+' isn\u2019t in your contacts. ')+'They won\u2019t see that you read this unless you accept.'));
  const row=el('div','reqbtns'),no=el('button','secondary','Delete'),blk=el('button','secondary','Block'),yes=el('button','primary','Accept');
  no.onclick=()=>answerRequest(c,false);yes.onclick=()=>answerRequest(c,true);
  blk.onclick=()=>{if(!confirm(`Block ${displayName(peer)}?\n\nTheir requests and invitations will be dropped quietly. You can unblock them in Settings → Privacy.`))return;
    blockPeer(peer);answerRequest(c,false);if(S.forgetPointers)S.forgetPointers(c.id);toast(displayName(peer)+' blocked')};
  row.append(no,blk,yes);f.append(row);return f;
}
function openRequests(){
  const {body,close}=sheet('Message requests');const list=el('div');body.append(list);
  const draw=async()=>{const rs=pendingRequests();list.replaceChildren();
    if(!rs.length){list.append(el('div','empty',''),el('p','hint','No requests right now.'));return}
    for(const c of rs){const pv=await openPost(c,c.last);const b=el('button','thread');const m=el('div','t-main');
      m.append(titleNode('div','t-name',c),el('div','t-sub',previewText(pv)));b.append(convAvatar(c,'sm'),m);b.onclick=()=>{close();openConv(c.id)};list.append(b)}
    list.append(el('p','hint','People who aren\u2019t in your contacts land here when you choose \u201cOnly my contacts\u201d in Profile. Open one to accept or delete it.'))};
  draw();
}
function showRequestAlert(){
  const rs=pendingRequests().filter(c=>!ls.get(`hush:reqseen:${S.me.handle}:${c.id}:${c.last.ts}`,0));
  document.querySelectorAll('.reqalert').forEach(x=>x.remove());if(!rs.length)return;
  const b=el('div','reqalert');b.setAttribute('role','alert');const m=el('button','t-main');
  m.append(el('div','t-name',rs.length===1?'New message request':rs.length+' new message requests'),
    el('div','t-sub',rs.length===1?displayName(dmPeer(rs[0]))+' wants to message you':rs.map(c=>displayName(dmPeer(c))).slice(0,3).join(', ')));
  const x=el('button','icon-btn');x.innerHTML=I.close||'\u2715';x.setAttribute('aria-label','Dismiss');
  const seen=()=>{rs.forEach(c=>ls.set(`hush:reqseen:${S.me.handle}:${c.id}:${c.last.ts}`,1));b.remove()};
  m.onclick=()=>{seen();rs.length===1?openConv(rs[0].id):openRequests()};x.onclick=seen;
  b.append(html('span','reqic','\u2709\ufe0f'),m,x);document.body.append(b);try{navigator.vibrate&&navigator.vibrate([30,60,30])}catch{}
}
/* ---------- drawer ---------- */
function openDrawer(){
  if(!S.me)return;
  const bd=el('div','backdrop');bd.style.alignItems='stretch';const d=el('nav','drawer');
  const layer={kind:'drawer',alive:()=>bd.isConnected,close:()=>close()};
  const close=()=>{bd.remove();NAV.closed(layer)};bd.onclick=e=>{if(e.target===bd)close()};bd._close=close;NAV.open(layer);
  const top=el('button','drawer-top');top.append(userAvatar(S.me.handle),withBadge(el('div','t-name',displayName(S.me.handle)),S.me.handle),el('div','h',atOf(S.me.handle)));
  top.onclick=()=>{close();openSettings()};
  d.append(top,el('div','menu-label','Accounts on this device'));
  S.ids.forEach(id=>{const b=el('button','menu-item');b.append(userAvatar(id.handle),withBadge(el('span',null,displayName(id.handle)),id.handle));
    if(id.handle===S.me.handle)b.insertAdjacentHTML('beforeend',`<span class="check">${I.tick}</span>`);
    b.onclick=()=>{close();if(id.handle!==S.me.handle)start(id)};d.append(b)});
  const add=html('button','menu-item',I.plus+'<span>Add or restore account</span>');add.onclick=()=>{close();showOnboard(true)};
  const inv=html('button','menu-item',I.userPlus+'<span>Contacts</span>');inv.onclick=()=>{close();setTab('contacts')};
  const set=html('button','menu-item',I.gear+'<span>Settings</span>');set.onclick=()=>{close();openSettings()};
  const how=html('button','menu-item',I.info+'<span>How encryption works</span>');how.onclick=()=>{close();openHow()};
  const sv=html('button','menu-item',I.bookmark+'<span>Saved Messages</span>');sv.onclick=()=>{close();openSaved()};
  d.append(sv,inv,add,set,how);bd.append(d);document.body.append(bd);
}
/* ---------- onboarding ---------- */
function showOnboard(adding,notice){
  document.querySelectorAll('.onboard').forEach(x=>x.remove());
  const o=el('div','onboard'),w=el('div','onboard-in');o.append(w);document.body.append(o);
  let login=null,code=null,link=null;
  const head=(t,lead)=>{if(link){link.cancel();link=null}w.replaceChildren(html('div','logo',I.lockBig),el('h1',null,t),el('p','lead',lead))};
  const foot=(back)=>{if(back){const b=el('button','link','Back');b.onclick=back;w.append(b)}if(adding){const c=el('button','link','Cancel');c.onclick=()=>{if(link)link.cancel();o.remove()};w.append(c)}};
  const busy=(b,t)=>{b.disabled=!!t;if(t){b.dataset.t=b.dataset.t||b.textContent;b.textContent=t}else b.textContent=b.dataset.t||b.textContent};
  const offline=err=>{if(S.db)return false;err.textContent='Can\u2019t connect yet. Check your connection and reload.';return true};

  let pw='',mode='new';
  // The phone-or-email field that both the login and the sign-up screen use. Anything with an @ is an email,
  // everything else a phone number (normLogin decides).
  const loginField=(err)=>{const f=el('label','field');const i=el('input');i.type='text';i.placeholder='(212) 555-0134 or you@example.com';
    i.autocomplete='username';i.name='username';i.autocapitalize='none';i.spellcheck=false;i.value=login||'';f.append(el('span',null,'Phone number or email'),i);
    const read=()=>{const l=normLogin(i.value);
      if(!l){err.textContent=i.value.includes('@')?'Enter a valid email address.':'Enter a valid phone number, with the country code if you\u2019re outside the US.';return null}return l};
    return {f,i,read}};
  const stepChoose=()=>{ // the first screen: two clear doors, plus any accounts still on this device
    head(adding?'Add an account':'Hush',notice||'Private messaging, end-to-end encrypted.');
    const li=el('button','primary','Log in'),su=el('button','secondary','Create an account');li.style.width=su.style.width='100%';su.style.marginTop='10px';
    li.onclick=()=>stepLogin();su.onclick=()=>stepSignup();w.append(li,su);
    if(!adding&&S.ids.length){const keep=el('div');S.ids.forEach(id=>{const b=withBadge(el('button','link','Continue as '+atOf(id.handle)),id.handle);b.onclick=()=>{o.remove();S.profilePage='main';start(id)};keep.append(b)});w.append(keep)} // other accounts still on this device
    foot();
  };
  const stepLogin=(msg)=>{
    head('Log in','Your phone number or email, and your password.');
    const err=el('div','err',msg||'');const {f,i,read}=loginField(err);
    const {f:pf,i:p}=pwField('Password','current-password');
    const go=el('button','primary','Log in');
    const forgot=el('button','link','Forgot password?');
    const rec=el('button','link','Use my recovery words');rec.onclick=()=>openRestore(); // always within reach: the words need no phone, email or password
    const su=el('button','link','Don\u2019t have an account? Sign up');su.onclick=()=>stepSignup();
    p.name='password';const form=el('form');form.method='post';form.action='#';form.append(f,pf,go);form.onsubmit=e=>e.preventDefault();go.type='submit';
    w.append(form,err,forgot,rec,su);foot(()=>stepChoose());
    i.onkeydown=e=>{if(e.key==='Enter'&&!p.value){e.preventDefault();p.focus()}};setTimeout(()=>(i.value?p:i).focus(),50);
    forgot.onclick=async()=>{err.textContent='';const l=read();if(!l||offline(err))return;login=l;
      try{if(!(await S.db.doc('logins/'+await loginTag(l)).get()).exists){err.textContent='There\u2019s no account with that '+loginKind(l)+'. Check it, sign up, or use your recovery words.';return}}
      catch{err.textContent='Couldn\u2019t check that. Check your connection and try again.';return}
      mode='forgot';code=demoCode();stepCode()};
    go.onclick=async()=>{err.textContent='';const l=read();if(!l)return;
      if(!p.value){err.textContent='Enter your password.';p.focus();return}
      if(offline(err))return;login=l;
      const here=S.ids.find(x=>(loginInfo(x.handle)||{}).login===l);if(here){o.remove();start(here);return}
      busy(go,'Checking\u2026');
      let r;try{r=await tryLogin(l,p.value)}
      catch(e){busy(go);err.textContent=e&&e.message==='nomatch'?'That password isn\u2019t right. Try again, or tap \u201cForgot password?\u201d':'Couldn\u2019t check that. Check your connection and try again.';return}
      if(r.kind==='wrongpw'){busy(go);err.textContent='That password isn\u2019t right. Try again, or tap \u201cForgot password?\u201d';return}
      if(r.kind==='new'){busy(go);err.textContent='There\u2019s no account with that '+loginKind(l)+'. Check it, or tap \u201cSign up\u201d to create one.';return}
      busy(go,'Unlocking your account\u2026');
      try{const {id,loc}=r;rememberLogin(id.handle,{login:l,loc});rememberPw(l,p.value);if(await enterAccount(id))toast('Welcome back, '+id.name);else busy(go)}
      catch(e){busy(go);err.textContent=e&&e.message==='stale'?'That password is from before your account was set up fresh. Tap \u201cForgot password?\u201d':'Couldn\u2019t log in. Check your connection and try again.'}};
  };
  const stepSignup=(msg)=>{
    head('Create an account','The phone number or email you\u2019ll log in with, and a password. You pick your name and username next.');
    if(S.db&&S.db.warmSignup)S.db.warmSignup(); // the sign-up puzzle (SPEC.md 9.4) is solved now, out of sight, while the form is being filled in
    const err=el('div','err',msg||'');const {f,i,read}=loginField(err);
    const {f:pf,i:p}=pwField('Password (at least 8 characters)','new-password');
    const go=el('button','primary','Continue');
    const li=el('button','link','Already have an account? Log in');li.onclick=()=>stepLogin();
    p.name='new-password';const form=el('form');form.method='post';form.action='#';form.append(f,pf,pwMeter(p,()=>({login:normLogin(i.value)})),go);form.onsubmit=e=>e.preventDefault();go.type='submit';
    i.addEventListener('input',()=>p.dispatchEvent(new Event('input'))); // the meter also watches the phone or email, which the password may not contain
    w.append(form,err,el('p','hint','Hush never sees your password and can\u2019t reset it, so pick one you\u2019ll remember.'),li);foot(()=>stepChoose());
    i.onkeydown=e=>{if(e.key==='Enter'&&!p.value){e.preventDefault();p.focus()}};setTimeout(()=>(i.value?p:i).focus(),50);
    go.onclick=async()=>{err.textContent='';const l=read();if(!l)return;
      const bad=pwProblem(p.value,l);if(bad){err.textContent=bad;p.focus();return}
      if(offline(err))return;login=l;busy(go,'Checking\u2026');
      let taken;try{taken=(await S.db.doc('logins/'+await loginTag(l)).get()).exists}
      catch{busy(go);err.textContent='Couldn\u2019t check that. Check your connection and try again.';return}
      busy(go);if(taken){err.textContent='That '+loginKind(l)+' already has an account. Log in instead.';return}
      pw=p.value;mode='new';code=demoCode();stepCode()};
  };
  const stepCode=()=>{
    head(mode==='forgot'?'Reset your password':'Confirm it\u2019s you','We sent a 6-digit code to '+login+'.');
    w.append(html('div','demo-code','<span>Prototype: no texts or emails are sent yet. Your code is</span><strong>'+code+'</strong>'));
    const i=el('input','code-in');i.inputMode='numeric';i.autocomplete='one-time-code';i.maxLength=6;i.placeholder='\u2022\u2022\u2022\u2022\u2022\u2022';i.setAttribute('aria-label','6-digit code');
    const err=el('div','err'),again=el('button','link','Send a new code');w.append(i,err,again);foot(()=>mode==='forgot'?stepLogin():stepSignup());setTimeout(()=>i.focus(),50);
    again.onclick=()=>{code=demoCode();stepCode()};
    i.oninput=async()=>{i.value=i.value.replace(/\D/g,'').slice(0,6);err.textContent='';if(i.value.length<6)return;
      if(i.value!==code){err.textContent='That code isn\u2019t right. Check it and try again.';i.select();return}
      i.disabled=true;
      try{const s=await S.db.doc('logins/'+await loginTag(login)).get();
        if(mode==='forgot'){if(s.exists)stepExisting(s.data());else stepLogin('There\u2019s no account with that '+loginKind(login)+'.')}
        else s.exists?stepLogin('That '+loginKind(login)+' already has an account. Enter its password, or tap \u201cForgot password?\u201d'):stepNew()}
      catch{i.disabled=false;err.textContent='Couldn\u2019t check that. Check your connection and try again.'}};
  };
  const stepNew=()=>{
    head('Create your account','Last step. Pick how people will see you.');
    if(S.db&&S.db.warmSignup)S.db.warmSignup();
    const f1=el('label','field');const n=el('input');n.autocomplete='name';n.maxLength=40;f1.append(el('span',null,'Your name'),n);
    const f2=el('label','field');const h=el('input');h.autocapitalize='none';h.autocomplete='off';h.spellcheck=false;h.maxLength=20;h.placeholder='letters, numbers, _';f2.append(el('span',null,'Username'),h);
    h.oninput=()=>{h.value=h.value.replace(/[^A-Za-z0-9_]/g,'')};
    const go=el('button','primary','Start messaging'),err=el('div','err');w.append(f1,f2,go,err);foot(()=>stepSignup());setTimeout(()=>n.focus(),50);
    go.onclick=async()=>{const name=n.value.trim(),disp=h.value.trim(),handle=disp.toLowerCase();err.textContent='';
      if(!name){err.textContent='Enter your name.';return}if(handle.length<3){err.textContent='Usernames need at least 3 characters.';return}
      const bad=pwProblem(pw,login,handle);if(bad){err.textContent=bad+' Go back to change it, or pick another username.';return} // the username is only known now
      busy(go,'Creating your keys\u2026');
      try{const ref=S.db.doc('directory/'+handle);if((await ref.get()).exists){err.textContent='That username is taken. If it’s yours, go back and log in with your password or recovery words.';busy(go);return}
        const keys=await newIdentity(),id=Object.assign({handle,disp,name,kv:1},keys);
        // Claim the username first: the server lets this connection create exactly this profile and refuses if the
        // name was taken meanwhile. Only then is the phone or email reserved, so a lost race never burns the number.
        try{await bindDevice(id)}catch(e){throw new Error(e&&e.code==='denied'?'claimed':'net')}
        await ref.set({handle,disp,name,ecdh:keys.ecdh,sig:keys.sig,kv:1,ts:Date.now()});
        // From here on the account exists on the server: whatever else fails, this device keeps its keys.
        S.dir[handle]={handle,disp,name,ecdh:keys.ecdh,sig:keys.sig,kv:1};S.ids=S.ids.filter(x=>x.handle!==handle);S.ids.push(id);ls.set('hush:ids',S.ids);
        let reserved=false,loc=null;
        try{await reserveLogin(login,handle);reserved=true;try{loc=await saveLoginBox(id,login,pw);rememberPw(login,pw)}catch{}}catch{}
        pw='';if(reserved)rememberLogin(handle,loc?{login,loc}:{login});
        S.freshSignup=handle; // a brand-new account starts with Message backup on (loadContacts); accounts from before keep their choice
        await enterAccount(id);
        if(!reserved)toast('Your '+loginKind(login)+' didn’t save. Add it again in Profile → Settings.');else if(!loc)toast('Your password didn’t save. Add it again in Profile → Settings.')}
      catch(e){busy(go);err.textContent=e&&e.message==='claimed'?'That username was just taken. Try another.':'Couldn\u2019t create the account. Check your connection and try again.'}};
  };
  const stepExisting=(rec)=>{
    S.resetFor={login,handle:rec&&rec.handle};
    head('Get back in','Open Hush on a device where you\u2019re still logged in and scan this code. Then you\u2019ll pick a new password.');
    const num=el('div','qr'),box=el('div','link-wait');box.append(el('span','spin'),el('span',null,'Waiting for you to scan\u2026'));const err=el('div','err');
    w.append(num,box,el('p','hint center','Your other device will pop up an alert \u2014 tap Scan QR code. Or go to Settings \u2192 Link a new device.'),err);
    const bk=el('button','link','Use my recovery words'),fresh=el('button','link','I don\u2019t have my other device');
    bk.onclick=()=>openRestore();fresh.onclick=()=>stepFresh(rec);w.append(bk,fresh);foot(()=>stepLogin());
    (async()=>{try{link=await requestLink(login,({qr})=>{const q=qrSvg(qr,'QR code to log in on this device');if(q)num.innerHTML=q;else num.textContent='The QR code couldn\u2019t be drawn. Use another option below.'});const id=await link.done;if(!id)return;
        rememberLogin(id.handle,{login});link=null;if(await enterAccount(id))toast('Welcome back, '+id.name)}
      catch(e){box.remove();num.remove();err.textContent=e&&e.message==='denied'?'The other device said this wasn\u2019t you, so nothing was shared.':e&&e.message==='timeout'?'No approval came through. Go back to try again, or use another option below.':e&&e.message==='stale'?'This account was set up fresh on another device since then.':'Couldn\u2019t reach your other device. Use another option below.'}})();
  };
  const stepFresh=(rec)=>{
    head('No other device?','For your safety, Hush can\u2019t reset an account from a stranger\u2019s device. That\u2019s what stops someone who grabs your phone or login from taking your account.');
    w.append(el('p','warnbox','To get back in you need either a device where you\u2019re still logged in, or your six recovery words. Without one of those, this username stays locked \u2014 nobody can take it, including you. This is the same trade-off Signal makes.'));
    const bk=el('button','primary','I have my recovery words');bk.onclick=()=>openRestore();
    w.append(bk);foot(()=>stepExisting(rec));
  };
  stepChoose();
}
function openAddLogin(){ // for accounts made before phone login existed
  const me=S.me,{body,close}=sheet('Add phone or email');let login=null,code=null;
  const draw=()=>{body.replaceChildren(el('p',null,'Lets you log in on your other phones and computers with a code, and approve new devices from this one.'));
    // One field for both: anything with an @ is an email, everything else a phone number (normLogin decides).
    const f=el('label','field');const i=el('input');i.type='text';i.autocomplete='username';i.autocapitalize='none';i.spellcheck=false;i.placeholder='(212) 555-0134 or you@example.com';f.append(el('span',null,'Phone number or email'),i);
    const go=el('button','primary','Send code');go.style.width='100%';const err=el('div','err');
    body.append(f,go,err);setTimeout(()=>i.focus(),50);i.onkeydown=e=>{if(e.key==='Enter')go.click()};
    go.onclick=()=>{const l=normLogin(i.value);if(!l){err.textContent=i.value.includes('@')?'Enter a valid email address.':'Enter a valid phone number, with the country code if you\u2019re outside the US.';return}login=l;code=demoCode();drawCode()}};
  const drawCode=()=>{body.replaceChildren(el('p',null,'Enter the 6-digit code sent to '+login+'.'),html('div','demo-code','<span>Prototype: your code is</span><strong>'+code+'</strong>'));
    const i=el('input','code-in');i.inputMode='numeric';i.maxLength=6;i.autocomplete='one-time-code';const err=el('div','err');body.append(i,err);setTimeout(()=>i.focus(),50);
    i.oninput=async()=>{i.value=i.value.replace(/\D/g,'').slice(0,6);err.textContent='';if(i.value.length<6)return;if(i.value!==code){err.textContent='That code isn\u2019t right.';return}
      i.disabled=true;
      // Only say "Added" once the reservation is confirmed on the server, and keep it in the vault so it survives a cleared browser.
      try{await reserveLoginConfirmed(login);rememberLogin(me.handle,{login});close();watchLinkRequests();renderBanner();toast('Added. You can now log in with '+login+'.');if(S.tab==='profile')setTab('profile')}
      catch(e){i.disabled=false;err.textContent=e&&e.message==='taken'?'That '+loginKind(login)+' already has an account.':e&&e.code==='denied'?'The server wouldn\u2019t save that: '+(e.message||'not allowed')+'.':'Couldn\u2019t save. Check your connection and try again.'}}};
  draw();
}

/* ---------- app lock: an optional PIN that's asked for when Hush opens (Face ID comes with the App Store version) ---------- */
// How long you can be away before Hush locks again. Each person picks; one minute unless they change it.
const LOCK_TIMES=[[0,'Now'],[60e3,'1 min'],[300e3,'5 min'],[600e3,'10 min'],[3600e3,'1 hr']];
function lockAfter(){const v=ls.get('hush:lockAfter',60e3);return LOCK_TIMES.some(t=>t[0]===v)?v:60e3}
function lockAfterWords(){const v=lockAfter();return v===0?'every time you come back to it':'again if you\u2019ve been away for more than '+({60e3:'a minute',300e3:'5 minutes',600e3:'10 minutes',3600e3:'an hour'})[v]}
function lockTimer(body,onChange){ // the "lock again after" picker, shown once a lock is on
  const sc=segControl(LOCK_TIMES.map(t=>[String(t[0]),t[1]]),String(lockAfter()),v=>{ls.set('hush:lockAfter',Number(v));onChange&&onChange();toast(Number(v)===0?'Hush locks every time you leave it':'Locks after '+LOCK_TIMES.find(t=>t[0]===Number(v))[1]+' away')});
  sc.querySelectorAll('button').forEach(b=>{b.style.whiteSpace='nowrap';b.style.paddingLeft=b.style.paddingRight='4px'});
  body.append(el('div','menu-label flush','Lock again after I\u2019ve been away'),sc)}
async function pinHash(pin,salt){const k=await crypto.subtle.importKey('raw',enc.encode(pin),'PBKDF2',false,['deriveBits']);
  return b64u(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:200000},k,256)))}
async function setPin(pin){const salt=crypto.getRandomValues(new Uint8Array(16));ls.set('hush:applock',{salt:b64u(salt),hash:await pinHash(pin,salt)});ls.set('hush:lockFails',null)}
async function checkPin(pin){const c=lockCfg();if(!c)return true;return await pinHash(pin,unb64u(c.salt))===c.hash}
let lockShown=false,awayAt=0;
const wipeDevice=()=>{document.body.style.visibility='hidden';forgetDevice().finally(()=>location.reload())}; // clear this device, then start over
function showPwLock(){ // asked when Hush opens; nothing about your accounts is readable until the password is right
  return new Promise(done=>{lockShown=true;document.querySelectorAll('.lock').forEach(x=>x.remove());
  const o=el('div','lock');o.setAttribute('role','dialog');o.setAttribute('aria-label','Hush is locked');
  const i=el('input','code-in');i.type='password';i.autocomplete='current-password';i.placeholder='Lock password';i.setAttribute('aria-label','Lock password');i.style.letterSpacing='normal';i.style.fontSize='18px';
  const go=el('button','primary','Unlock');go.style.width='min(260px,100%)';const err=el('div','err'),forgot=el('button','link','Forgot your lock password?');
  o.append(html('div','logo',I.lockBig),el('h1',null,'Hush is locked'),el('p','lead','Enter your lock password to open your chats.'),i,go,err,forgot);document.body.append(o);
  setTimeout(()=>i.focus(),60);
  const fails=()=>ls.get('hush:lockFails',null)||{n:0,until:0};
  i.oninput=()=>{err.textContent=''};i.onkeydown=e=>{if(e.key==='Enter')go.click()};
  go.onclick=async()=>{const f=fails();if(Date.now()<f.until){err.textContent='Too many tries. Wait '+Math.ceil((f.until-Date.now())/1000)+' seconds.';return}
    if(!i.value)return;go.disabled=true;go.textContent='Unlocking\u2026';let ok=false;try{await openSealed(i.value);ok=true}catch{}go.disabled=false;go.textContent='Unlock';
    if(ok){ls.set('hush:lockFails',null);i.value='';o.remove();lockShown=false;awayAt=0;done();return}
    f.n++;if(f.n>=5)f.until=Date.now()+Math.min(30e3*2**(f.n-5),3600e3);ls.set('hush:lockFails',f);
    i.value='';err.textContent=f.n>=5?'Wrong password. Wait a bit before trying again.':'Wrong password. Try again.'};
  forgot.onclick=()=>{if(!confirm('Forgot your lock password?\n\nYou can clear this device and log back in with your email or phone and your Hush password (or your recovery words). Your chats come back when you log in.\n\nClear this device?'))return;wipeDevice()};
  });
}
// The lock gate at start: resolves once the PIN or the lock password is right. Until then nothing is unsealed.
function showLock(){
  if(lsPw())return lockShown?Promise.resolve():showPwLock();
  if(!lockCfg()||lockShown)return Promise.resolve();
  return new Promise(done=>{lockShown=true;document.querySelectorAll('.lock').forEach(x=>x.remove());
  const o=el('div','lock');o.setAttribute('role','dialog');o.setAttribute('aria-label','Hush is locked');
  const i=el('input','code-in');i.type='password';i.inputMode='numeric';i.autocomplete='off';i.maxLength=8;i.placeholder='PIN';i.setAttribute('aria-label','PIN');
  const go=el('button','primary','Unlock');go.style.width='min(260px,100%)';const err=el('div','err'),forgot=el('button','link','Forgot your PIN?');
  o.append(html('div','logo',I.lockBig),el('h1',null,'Hush is locked'),el('p','lead','Enter your PIN to open your chats.'),i,go,err,forgot);document.body.append(o);
  setTimeout(()=>i.focus(),60);
  const fails=()=>ls.get('hush:lockFails',null)||{n:0,until:0};
  i.oninput=()=>{i.value=i.value.replace(/\D/g,'').slice(0,8);err.textContent=''};
  i.onkeydown=e=>{if(e.key==='Enter')go.click()};
  go.onclick=async()=>{const f=fails();if(Date.now()<f.until){err.textContent='Too many tries. Wait '+Math.ceil((f.until-Date.now())/1000)+' seconds.';return}
    if(i.value.length<4)return;go.disabled=true;const ok=await checkPin(i.value);go.disabled=false;
    if(ok){ls.set('hush:lockFails',null);o.remove();lockShown=false;awayAt=0;done();return}
    f.n++;if(f.n>=5)f.until=Date.now()+Math.min(30e3*2**(f.n-5),3600e3);ls.set('hush:lockFails',f);
    i.value='';err.textContent=f.n>=5?'Wrong PIN. Wait a bit before trying again.':'Wrong PIN. Try again.'};
  forgot.onclick=()=>{if(!confirm('Forgot your PIN?\n\nYou can log out every account on this device and log back in with your email or phone and password. Your chats come back when you log in.\n\nLog out of this device?'))return;
    wipeDevice()};
  });
}
// Locking is a reload: the page comes back with everything sealed and the gate in front, so nothing unsealed (keys,
// messages, decrypted media, the screen itself) survives being away, with a PIN just as with a password.
document.addEventListener('visibilitychange',()=>{if(!lockCfg())return;if(document.hidden)awayAt=Date.now();else if(awayAt&&Date.now()-awayAt>=lockAfter()){document.body.style.visibility='hidden';location.reload()}});
function openAppLock(){
  const c=lockCfg();if(c&&c.kind==='pw')return openPwLock();if(c)return openPinLock();
  const {body,close}=sheet('Lock Hush');
  body.append(el('p',null,'Ask for something whenever Hush opens, so someone who picks up your phone can\u2019t read your chats. Pick one:'));
  const a=html('button','menu-item flush',I.lockMd+'<span><b>Password</b> (strongest)<br><small>Also keeps your keys scrambled on this device, so they stay safe even if someone copies its storage. You type it each time Hush opens.</small></span>');
  const b=html('button','menu-item flush',I.lockMd+'<span><b>PIN</b> (quicker)<br><small>Stops someone who picks up your phone. Doesn\u2019t protect against someone who copies the phone\u2019s storage.</small></span>');
  a.onclick=()=>{close();openPwLock()};b.onclick=()=>{close();openPinLock()};body.append(a,b);
}
function openPwLock(){
  const on=lsPw(),{body,close}=sheet('Password lock');
  const introTxt=()=>(on?'Hush asks for your lock password when you open it, and '+lockAfterWords()+'. Your keys stay scrambled on this device until you unlock.'
    :'Hush will ask for this password when it opens. Your account keys and invite links are kept scrambled on this device and only unscrambled in memory after you unlock. You can use your Hush password or a different one.'),intro=el('p',null,introTxt());body.append(intro);
  if(on)lockTimer(body,()=>{intro.textContent=introTxt()});
  const mk=label=>{const f=el('label','field');const i=el('input');i.type='password';i.autocomplete='new-password';f.append(el('span',null,label),i);body.append(f);return i};
  const cur=on?mk('Current lock password'):null,p1=mk(on?'New lock password':'Choose a lock password'),p2=mk('Type it again');
  const go=el('button','primary',on?'Change password':'Turn on password lock');go.style.width='100%';const err=el('div','err');body.append(go,err);
  setTimeout(()=>(cur||p1).focus(),50);
  go.onclick=async()=>{err.textContent='';const bad=pwProblem(p1.value,null);if(bad){err.textContent=bad;return}
    if(p1.value!==p2.value){err.textContent='The passwords don\u2019t match.';return}
    go.disabled=true;go.textContent='Working\u2026';
    try{if(on)await sealChange(cur.value,p1.value);else await sealOn(p1.value);close();toast(on?'Lock password changed':'Hush is now locked with your password');if(S.tab==='profile')setTab('profile')}
    catch{err.textContent=on?'Your current lock password isn\u2019t right.':'Couldn\u2019t turn it on. Nothing was changed.'}
    go.disabled=false;go.textContent=on?'Change password':'Turn on password lock'};
  if(on){const off=el('button','menu-item danger flush','Turn off password lock');
    off.onclick=async()=>{if(!cur.value){err.textContent='Enter your current lock password to turn it off.';cur.focus();return}
      off.disabled=true;try{await sealOff(cur.value);close();toast('Password lock is off');if(S.tab==='profile')setTab('profile')}catch{err.textContent='Your current lock password isn\u2019t right.'}off.disabled=false};
    body.append(off)}
  body.append(el('p','hint','The lock password never leaves this device. If you forget it, you can clear this device and log back in with your Hush password or recovery words.'));
}
function openPinLock(){
  const on=!!lockCfg(),{body,close}=sheet('PIN lock');
  const introTxt=()=>(on?'Hush asks for your PIN when you open it, and '+lockAfterWords()+'.'
    :'Ask for a PIN whenever Hush opens, so someone who picks up your phone can\u2019t read your chats. Face ID comes with the App Store version.'),intro=el('p',null,introTxt());body.append(intro);
  if(on)lockTimer(body,()=>{intro.textContent=introTxt()});
  const mk=(label)=>{const f=el('label','field');const i=el('input');i.type='password';i.inputMode='numeric';i.autocomplete='off';i.maxLength=8;
    i.oninput=()=>{i.value=i.value.replace(/\D/g,'').slice(0,8)};f.append(el('span',null,label),i);body.append(f);return i};
  const cur=on?mk('Current PIN'):null,p1=mk(on?'New PIN (4 to 8 digits)':'Choose a PIN (4 to 8 digits)'),p2=mk('Type it again');
  const go=el('button','primary',on?'Change PIN':'Turn on PIN lock');go.style.width='100%';const err=el('div','err');body.append(go,err);
  setTimeout(()=>(cur||p1).focus(),50);
  go.onclick=async()=>{err.textContent='';
    if(cur&&!(await checkPin(cur.value))){err.textContent='Your current PIN isn\u2019t right.';return}
    if(p1.value.length<4){err.textContent='Use at least 4 digits.';return}
    if(/^(\d)\1+$/.test(p1.value)||'0123456789'.includes(p1.value)||'9876543210'.includes(p1.value)){err.textContent='That PIN is too easy to guess.';return}
    if(p1.value!==p2.value){err.textContent='The PINs don\u2019t match.';return}
    await setPin(p1.value);close();toast(on?'PIN changed':'Hush is now locked with your PIN');if(S.tab==='profile')setTab('profile')};
  if(on){const off=el('button','menu-item danger flush','Turn off PIN lock');
    off.onclick=async()=>{if(!cur.value){err.textContent='Enter your current PIN to turn it off.';cur.focus();return}
      if(!(await checkPin(cur.value))){err.textContent='Your current PIN isn\u2019t right.';return}
      try{localStorage.removeItem('hush:applock')}catch{}ls.set('hush:lockFails',null);close();toast('PIN lock is off');if(S.tab==='profile')setTab('profile')};
    body.append(off)}
  body.append(el('p','hint','The PIN stays on this device and is never sent anywhere. If you forget it, you can log out here and log back in with your password.'));
}
/* A note is trusted only if its claims hold up: it was meant for this box, a one-on-one names the id this device
   computes for that person (so nobody can plant a chat under someone else's name), a signed invite verifies, and
   the sender is not blocked. Invites from before notes were signed carry no signature and are let through; the
   chat key is still the real gate on whether anything can be read. */
async function noteOk(p){
  if(!p||typeof p.from!=='string'||!validHandle(p.from))return false;
  if(p.to&&p.to!==S.me.handle)return false;
  if(isBlocked(p.from)&&!(p.t==='invite'&&heldKey(p.cid)))return false; // a blocked person can't add me to anything new; groups I'm already in stay
  if(p.type==='dm'||p.t==='dm'||p.t==='request'){const peer=p.peer||p.from;if(!(await senderKeys(peer)))return false;return p.cid===await dmIdFor(peer)}
  if(p.t==='invite'){if(!p.sg)return true;return sideOk(p.from,p.sg,'hush-drop-v1',['invite',p.from,S.me.handle,String(p.cid),String(p.ts)])}
  return false;
}
/* Blocking, kept in the encrypted vault so every device of mine agrees and nobody else (the server included) knows.
   A blocked person: their notes (DMs, requests, invitations) are deleted on arrival, our DM with them is hidden,
   their messages in shared groups and channels are hidden, and they never show in my search or pickers.
   A blocked chat: one conversation closed and kept out of the list, new messages included. */
const isBlocked=h=>!!(h&&S.prefs&&Array.isArray(S.prefs.blocked)&&S.prefs.blocked.includes(h));
const isChatBlocked=cid=>!!(S.prefs&&Array.isArray(S.prefs.blockedChats)&&S.prefs.blockedChats.includes(cid));
const hiddenConv=c=>!!c&&(isChatBlocked(c.id)||(typeOf(c)==='dm'&&!isSelf(c)&&isBlocked(dmPeer(c))));
function afterBlockChange(){if(S.chan&&hiddenConv(curConv()))closeConv();else if(S.chan){S.rendered=null;applyExpiry();renderConv()}renderList();updateTitle();if(S.tab==='profile')setTab('profile')}
function blockPeer(h){const b=P().blocked||(P().blocked=[]);if(!b.includes(h))b.push(h);saveContacts();afterBlockChange()}
function unblockPeer(h){const b=P().blocked||[];P().blocked=b.filter(x=>x!==h);saveContacts();afterBlockChange();restoreDm(h).catch(()=>{})}
/* ===== HUSH UNBLOCK BEGIN ===== */
/* Unblocking brings our DM back. My note for it may have been tidied away while they were blocked (blocking used to
   do that, and any note they sent meanwhile was dropped), so if the server still has the chat and it isn't in my
   list, I send myself a fresh note, the same way a lost note is re-sent. */
async function restoreDm(h){
  if(!S.db||!S.db.preview||!S.me||h===S.me.handle)return false;const cid=await dmIdFor(h);if(!cid||S.convs.some(c=>c.id===cid))return false;
  const s=await S.db.preview(cid);if(!s.exists||isBlocked(h))return false;
  S.dmPeers[cid]=h;if(!dmInfo(cid))setDmInfo(cid,{peer:h});
  await ensureInbox({id:cid,type:'dm',members:[S.me.handle,h]},[S.me.handle],true);return true;
}
/* ===== HUSH UNBLOCK END ===== */
function blockChat(cid){const b=P().blockedChats||(P().blockedChats=[]);if(!b.includes(cid))b.push(cid);saveContacts();afterBlockChange()}
function unblockChat(cid){const b=P().blockedChats||[];P().blockedChats=b.filter(x=>x!==cid);saveContacts();afterBlockChange()}
function confirmBlockPerson(h){
  if(!confirm(`Block ${displayName(h)}?\n\nTheir messages and requests will be dropped quietly, their messages in groups and channels you share will be hidden, and they won’t be able to add you to groups. They won’t be told. You can unblock them in Settings → Privacy.`))return false;
  blockPeer(h);toast(displayName(h)+' blocked');return true} // our DM is hidden, not forgotten, so unblocking brings it straight back
function confirmBlockChat(c){
  if(!confirm(`Block this chat with ${convTitle(c)}?\n\nIt closes and stays out of your chat list, new messages included. ${displayName(dmPeer(c))} won’t be told. You can unblock it in Settings → Privacy.`))return false;
  blockChat(c.id);toast('Chat blocked');return true}
const dmRenoted=new Set(),baseDone=new Set();
async function recordBase(c){ // a DM created before base keys were kept gets one, from a device that can open it, so both of us always can
  if(!c||typeOf(c)!=='dm'||isSelf(c)||!S.db||!S.db.setBase||baseDone.has(c.id))return;baseDone.add(c.id);
  try{const cap=await memberCap(c,0);if(cap)await S.db.setBase(c.id,cap)}catch{baseDone.delete(c.id)}}
async function ensureInbox(c,only,fresh){ // make sure everyone in a chat has a pointer to it (once per person, remembered on this device; `fresh` sends again)
  if(!S.db||!c||!c.id||!S.me)return;const me=S.me.handle,key='hush:ptr:'+me,done=ls.get(key,{}),had=new Set(fresh?[]:(done[c.id]||[]));
  const who=[...new Set(only||c.members||[])].filter(h=>!had.has(h)).slice(0,500);if(!who.length)return;
  await loadDir(who);const dm=typeOf(c)==='dm';
  await Promise.all(who.map(async h=>{try{
    const peer=dm?((c.members||[]).find(x=>x!==h)||h):undefined;
    await dropPointer(h,{t:dm?(c._req&&h!==me?'request':'dm'):'invite',cid:c.id,from:me,type:typeOf(c),peer});had.add(h)}catch{}}));
  done[c.id]=[...had];ls.set(key,done);
}
function notePointer(cid,p){ // what a pointer tells this device about a chat
  if(p.type==='dm'||p.t==='dm'||p.t==='request'){const peer=p.peer||p.from;S.dmPeers[cid]=peer;dmIds.set(peer,cid);
    const i=dmInfo(cid);if(p.t==='request'&&p.from!==S.me.handle&&!(i&&i.req))setDmInfo(cid,{peer,req:'in'});else if(!i)setDmInfo(cid,{peer})}
}
function watchDoc(ref,cb,err){
  if(ref.onSnapshot)return ref.onSnapshot(cb,err);
  let dead=false;const tick=()=>ref.get().then(d=>{if(!dead)cb(d)},e=>{if(!dead&&err)err(e)});tick();
  const t=setInterval(tick,4000);return()=>{dead=true;clearInterval(t)};
}
/* ===== HUSH INBOX RULE BEGIN ===== */
/* What to do with a pointer once the chat record it names has been looked at.
     exists  the server still has the chat (its trimmed copy is enough to know that)
     mine    this device can read it: a one-on-one, a public channel, or a wrap it managed to open
     held    this device held a key for this chat at some earlier epoch
     fresh   the pointer arrived in the last couple of minutes
   A chat this device could never open is not one it was thrown out of. The wrap for this device may simply not be
   there yet: the sender wrapped to a profile it had cached before this device existed, or the device entry was
   published a moment after. So such a pointer is kept and the chat looked at again later. A fresh pointer to a
   chat the server does not have yet is treated the same way: the sender may still be writing the record (a note
   can overtake it). Only a chat that is gone for good, or one we once held a key for and now cannot open (we
   were removed), has its pointer tidied away. */
function pointerVerdict({exists,mine,held,fresh}){return !exists?(fresh?'wait':'forget'):mine?'show':held?'forget':'wait'}
/* ===== HUSH INBOX RULE END ===== */
const heldKey=cid=>{const m=ksMap()[cid];return !!(m&&Object.keys(m).some(e=>e!=='a'))};
function watchInbox(id,cb){
  const h=id.handle,docs=new Map(),subs=new Map(),ptrs=new Map(),waiting=new Set(),firstSeen=new Map();let ready=false,pend=0,dead=false;
  const FRESH_MS=2*60e3;const fresh=cid=>{if(!firstSeen.has(cid))firstSeen.set(cid,Date.now());return Date.now()-firstSeen.get(cid)<FRESH_MS};
  const emit=()=>{if(dead)return;
    const list=[...docs.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,300);cb(list,!ready||pend>0)};
  const drop=cid=>{const u=subs.get(cid);if(u)u();subs.delete(cid);docs.delete(cid);waiting.delete(cid)};
  const forget=cid=>{for(const [pid,p] of ptrs)if(p&&p.cid===cid){ptrs.delete(pid);S.db.doc('inbox/'+h+'/c/'+pid).delete().catch(()=>{})}};
  S.forgetPointers=forget;
  const un=S.db.collection('inbox/'+h+'/c').limit(500).onSnapshot(async s=>{
    const seen=new Map();
    for(const d of s.docs){let p=ptrs.get(d.id);
      if(p===undefined){try{p=await openPointer(d.data());if(!(await noteOk(p)))p=null}catch{p=null}ptrs.set(d.id,p);
        if(p===null)S.db.doc('inbox/'+h+'/c/'+d.id).delete().catch(()=>{})} // unreadable, forged or from someone blocked: gone
      if(p&&!seen.has(p.cid))seen.set(p.cid,p);
      else if(p&&seen.has(p.cid)){ptrs.delete(d.id);S.db.doc('inbox/'+h+'/c/'+d.id).delete().catch(()=>{})}} // a second note for a chat already listed: keep one
    if(dead)return;
    for(const pid of [...ptrs.keys()])if(!s.docs.some(d=>d.id===pid))ptrs.delete(pid);
    for(const cid of [...subs.keys()])if(!seen.has(cid))drop(cid);
    for(const [cid,p] of seen){notePointer(cid,p);if(!subs.has(cid))start(cid)}
    ready=true;emit();
  },()=>toast('Your chats stopped updating. Reload to reconnect.'));
  // Watch one chat a pointer names. The watch may end in refusal (our level was revoked, or we never had one yet):
  // for a fresh pointer, or one we never held a key for, that is a reason to look again later, not to forget.
  function start(cid){pend++;let first=true,seq=0;const done=()=>{if(first){first=false;pend--}};
    subs.set(cid,watchDoc(S.db.doc('channels/'+cid),async d=>{const my=++seq;
      const c=d.exists?Object.assign({id:cid},d.data()):null;if(c)noteChatDoc(c);
      const shown=c?Object.assign({},await showMeta(c)):null;
      const mine=!!shown&&(typeOf(c)==='dm'||c.visibility==='public'||!!(await convKey(c,epochOf(c))));
      if(shown&&shown.last)shown.last=await unsealPost(c,shown.last);done();
      if(dead||my!==seq||!subs.has(cid)){if(!dead)emit();return} // a newer copy arrived while unlocking this one
      settle(cid,pointerVerdict({exists:!!c,mine,held:heldKey(cid),fresh:fresh(cid)}),shown)},
    ()=>{done();subs.delete(cid);settle(cid,pointerVerdict({exists:true,mine:false,held:heldKey(cid),fresh:fresh(cid)}),null)}))}
  function settle(cid,verdict,shown){
    if(verdict==='show'){waiting.delete(cid);docs.set(cid,shown);if(typeOf(shown)==='dm')recordBase(shown)}
    else if(verdict==='wait'){docs.delete(cid);waiting.add(cid)} // keep the pointer: a wrap for this device, or the record, may still arrive
    else{waiting.delete(cid);docs.delete(cid);forget(cid)} // deleted, or we were removed: tidy the pointer away
    emit()}
  // Chats we hold a pointer for but could not show yet: look again now and then with a fresh copy of the record. A
  // watch that ended is started afresh; one still deferred is re-opened, which re-sends it once the chat opens.
  const retryT=setInterval(()=>{if(dead||!S.db||!S.db.refreshChat)return;
    for(const cid of [...waiting]){if(![...ptrs.values()].some(p=>p&&p.cid===cid)){waiting.delete(cid);continue}
      S.chatDocs.delete(cid);if(subs.has(cid))S.db.refreshChat(cid).catch(()=>{});else start(cid)}},15000);
  return()=>{dead=true;clearInterval(retryT);un();for(const cid of [...subs.keys()])drop(cid)};
}
/* ---------- boot ---------- */
function start(id){
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist().catch(()=>{})}catch{}
  S.me=id;ls.set('hush:active',id.handle);S.contacts=[];S.contactsReady=false;rebuildNames();ensureDev(id).catch(()=>{});dmIds.clear();S.dmPeers={};S.chatDocs.clear();dmIdFor(id.handle).catch(()=>{});
  if(S.unsubConvs)S.unsubConvs();S.unsubConvs=null;
  Object.assign(S,{convs:[],seenLast:new Map(),convsLoaded:false,unread:new Map(),unreadKey:new Map(),mentions:new Map(),showArchived:false});S.previews.clear();
  closeConv();setListTitle();if(S.tab==='profile')setTab('profile');
  if(!S.db)return;
  const onConvs=(list,fromCache)=>{
    if(S.convsLoaded)list.forEach(c=>{const l=c.last,prev=S.seenLast.get(c.id)||0;
      if(l&&l.ts>prev&&l.from!==S.me.handle){
        if(isArchived(c.id)&&!isMuted(c.id))toggleArchive(c.id,false,true);
        if(isRequest(c)){if(!isDeclined(c)&&!contactFor(dmPeer(c)))setTimeout(showRequestAlert,50)}else if(c.id!==S.chan||document.hidden)notifyNew(c)}});
    list.forEach(c=>{S.seenLast.set(c.id,c.last?c.last.ts:0);S.previews.delete(c.id)});
    const firstLoad=!S.convsLoaded;S.convs=list;if(!fromCache)S.convsLoaded=true;pinAll();refreshDir();
    if(firstLoad&&S.convsLoaded&&S.db.flat)setTimeout(()=>{list.filter(c=>typeOf(c)==='dm').reduce((p,c)=>p.then(()=>healKeys(c)),Promise.resolve()).catch(()=>{})},1500);
    if(S.contactsReady)list.forEach(c=>{if(isRequest(c)&&!isDeclined(c)&&contactFor(dmPeer(c)))setDmInfo(c.id,{req:'ok'});if(c.last&&!c.last.svc)noteAccepted(c.id,[c.last])});
    if(firstLoad&&S.convsLoaded)setTimeout(showRequestAlert,600);
    if(S.chan){const c=convById(S.chan);
      if(!c){if(!fromCache){closeConv();toast('You\u2019re no longer in that chat.')}}
      else{if((c.ttl||0)!==S.curTtl){S.curTtl=c.ttl||0;S.rendered=null}refreshHeader();renderConv();drawPinBar();if(S.commentsView)S.commentsView.render()}}
    renderList();computeUnread();
  };
  // Your inbox is only readable once this device has proven it's yours, so start it after binding.
  bindDevice(id).catch(()=>{}).then(()=>{if(S.me!==id)return;if(S.unsubConvs)S.unsubConvs();S.unsubConvs=watchInbox(id,onConvs);loadContacts();healLogin(id)});heartbeat(true);renderBanner();refreshDir().then(refreshPresence);watchLinkRequests();
}
async function republishSelf(){
  // Puts your public keys in the directory if they're missing, and puts them back if someone replaced them.
  if(!S.db||!S.me||!S.dirReady)return;const m=S.me,d=S.dir[m.handle];if(d&&(d.kv||1)>(m.kv||1))return;
  try{if(!d)await S.db.doc('directory/'+m.handle).set(Object.assign({handle:m.handle,name:m.name,ecdh:m.ecdh,sig:m.sig,ts:Date.now()},dispOk(m.disp,m.handle)?{disp:m.disp}:{},m.dev&&m.dev.s?{devs:{[m.dev.id]:devEntry(m.dev)}}:{}));
    else if(dispOk(m.disp,m.handle)&&d.disp!==m.disp){await S.db.doc('directory/'+m.handle).update({disp:m.disp});d.disp=m.disp}
    else if(!sameKeys(keysOf(d),{ecdh:m.ecdh,sig:m.sig})){toast('Your security code on the server doesn\u2019t match this device. Restore from your backup, or contact the app owner.')}}catch{}
}
(async()=>{
  if(lockCfg())await showLock();   // the PIN or password gate first: nothing is unsealed while it stands
  await unlockStore();             // a password gate opened the store itself; otherwise this browser's device key does
  S.ids=ls.get('hush:ids',[]);
  renderBanner();
  S.db=await connectServer();
  renderBanner();
  if(S.db){
    setInterval(()=>refreshDir(true),60000);setInterval(refreshPresence,40000);
  }
  const active=ls.get('hush:active',null),id=S.ids.find(x=>x.handle===active)||S.ids[0];
  const hj=/join=|add=/.test(location.hash)?location.hash:null;
  if(id){start(id);if(hj)setTimeout(()=>handleJoin(hj),400)}else{S.pendingJoin=hj;showOnboard(false)}
  addEventListener('hashchange',()=>{if(S.me&&/join=|add=/.test(location.hash))handleJoin(location.hash)});
  setInterval(()=>{refreshHeader();drawTyping()},1500);
  setInterval(()=>{const now=Date.now();if(S.chan&&(S.posts.some(p=>p.exp&&p.exp<=now)||(S.future||[]).some(p=>p.ts<=now+3000))){applyExpiry();renderConv();renderList()}},2000);
  updateStatus();setupSwipeNav();
  document.addEventListener('selectionchange',()=>{if(S.comp&&S.comp.syncFmt)S.comp.syncFmt()});setInterval(()=>heartbeat(),45000);
  fitKeyboard();
  document.addEventListener('visibilitychange',()=>{heartbeat();if(!document.hidden)markRead()});
})();
