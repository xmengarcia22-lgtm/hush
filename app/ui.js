/* Hush: the screens and everything that drives them. The last of the page's script files (config, crypto, adapter,
   ui): they share one global scope, exactly like the single script they were split from. The icons, the DOM
   helpers, the page state S, every screen and sheet, media display, the inbox watcher and the boot at the end. */
/* ---------- icons ---------- */
const I={
 menu:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
 search:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M10.5 3a7.5 7.5 0 1 0 4.4 13.6l4.6 4.6 1.9-1.9-4.6-4.6A7.5 7.5 0 0 0 10.5 3zm0 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9z"/></svg>',
 pencil:'<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16.5 15.5 5 19 8.5 7.5 20H4zM16.5 4 17.9 2.6 21.4 6.1 20 7.5z"/></svg>',
 back:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 3.5 7 12l8.5 8.5 2-2L11 12l6.5-6.5z"/></svg>',
 more:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10.2 3h3.6v3.6h-3.6zM10.2 10.2h3.6v3.6h-3.6zM10.2 17.4h3.6V21h-3.6z"/></svg>',
 lock:'<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10V7a5 5 0 0 1 10 0v3h1a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h1zm2 0h6V7a3 3 0 0 0-6 0v3z"/></svg>',
 lockBig:'<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2a5 5 0 0 1 5 5v3h2v12H5V10h2V7a5 5 0 0 1 5-5zm0 2.4A2.6 2.6 0 0 0 9.4 7v3h5.2V7A2.6 2.6 0 0 0 12 4.4zM10.9 14h2.2v4h-2.2z"/></svg>',
 send:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3l19 9-19 9 2.2-7.5L14 12 5.2 10.5z"/></svg>',
 one:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4.5 4.5L19 7"/></svg>',
 two:'<svg width="18" height="14" viewBox="0 0 30 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m3 12 4.5 4.5L17 7M13 16.5 23 7"/></svg>',
 clock:'<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
 x:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5.1 3.4 3.4 5.1 10.3 12l-6.9 6.9 1.7 1.7L12 13.7l6.9 6.9 1.7-1.7L13.7 12l6.9-6.9-1.7-1.7L12 10.3z"/></svg>',
 plus:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10.8 3h2.4v7.8H21v2.4h-7.8V21h-2.4v-7.8H3v-2.4h7.8z"/></svg>',
 shield:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2l9 3v6c0 5-3.6 9.3-9 11-5.4-1.7-9-6-9-11V5zm-1.5 13.2-2.9-2.9-1.4 1.4 4.3 4.3 7.3-7.3-1.4-1.4z"/></svg>',
 eye:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 5c5 0 9 3.5 11 7-2 3.5-6 7-11 7S3 15.5 1 12c2-3.5 6-7 11-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 1.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z"/></svg>',
 info:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1.2 5h2.4v2.4h-2.4zm0 4h2.4v6h-2.4z"/></svg>',
 mega:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h3.5l7.5 4.5v-15L6.5 9zM16.5 9.5H19v5h-2.5z"/></svg>',
 megaSm:'<svg class="mega-sm" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h3.5l7.5 4.5v-15L6.5 9zM16.5 9.5H19v5h-2.5z"/></svg>',
 megaBig:'<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h3.5l7.5 4.5v-15L6.5 9zM16.5 9.5H19v5h-2.5z"/></svg>',
 clip:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11.4 7.5V15a1.1 1.1 0 0 0 2.2 0V6.5a2.6 2.6 0 0 0-5.2 0V16a4.1 4.1 0 0 0 8.2 0V6.5h1.8V16a5.9 5.9 0 0 1-11.8 0V6.5a4.4 4.4 0 0 1 8.8 0V15a2.9 2.9 0 0 1-5.8 0V7.5z"/></svg>',
 play:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
 xs:'<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.4 4.1 14 2.5l3 3 3-3 1.6 1.6-3 3 3 3L20 11.7l-3-3-3 3-1.6-1.6 3-3z"/></svg>',
 globe:'<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2.4a7.6 7.6 0 1 0 0 15.2 7.6 7.6 0 0 0 0-15.2zM12 4.4a4.2 7.6 0 1 1 0 15.2 4.2 7.6 0 1 1 0-15.2zm0 2.4a1.8 5.2 0 1 0 0 10.4 1.8 5.2 0 1 0 0-10.4zM4.4 10.8h15.2v2.4H4.4z"/></svg>',
 lockMd:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2a5 5 0 0 1 5 5v3h2v12H5V10h2V7a5 5 0 0 1 5-5zm0 2.4A2.6 2.6 0 0 0 9.4 7v3h5.2V7A2.6 2.6 0 0 0 12 4.4zM10.9 14h2.2v4h-2.2z"/></svg>',
 link:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M7.5 8h4v2.4h-4a1.6 1.6 0 0 0 0 3.2h4V16h-4a4 4 0 0 1 0-8zm5 0h4a4 4 0 0 1 0 8h-4v-2.4h4a1.6 1.6 0 0 0 0-3.2h-4zM8.5 10.8h7v2.4h-7z"/></svg>',
 smile:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM8.6 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm6.8 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM7.4 14h9.2a4.6 4.6 0 0 1-9.2 0z"/></svg>',
 chart:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 12h4v9H3zM10 3h4v18h-4zM17 7h4v14h-4z"/></svg>',
 flag:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M5 2h2.2v20H5zM8.2 3H20l-3 5 3 5H8.2z"/></svg>',
 trash:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M9 2h6v2h5v2.2H4V4h5zM5.2 7.5h13.6L17.6 22H6.4z"/></svg>',
 group:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM2 21v-3l4-3h6l4 3v3zM17.5 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM16 14.5h3l3.5 2.5V21h-4v-2.5z"/></svg>',
 groupSm:'<svg class="mega-sm" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM2 21v-3l4-3h6l4 3v3zM17.5 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM16 14.5h3l3.5 2.5V21h-4v-2.5z"/></svg>',
 user:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM3 22v-2.5c0-3 4-5 9-5s9 2 9 5V22z"/></svg>',
 reply:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 4v5c6.3 0 10.2 3.2 11 10-2.1-4.2-5.2-6-11-6v5l-8-7z"/></svg>',
 edit:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M4 16.5 15.5 5 19 8.5 7.5 20H4zM16.5 4 17.9 2.6 21.4 6.1 20 7.5z"/></svg>',
 copy:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 2h13v13h-3.2V5.2H8zM3 7h13v15H3z"/></svg>',
 gear:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M10 2h4l.6 2.8 2.4 1.4 2.7-.9 2 3.5-2.1 1.9v2.6l2.1 1.9-2 3.5-2.7-.9-2.4 1.4L14 22h-4l-.6-2.8-2.4-1.4-2.7.9-2-3.5 2.1-1.9v-2.6L2.3 8.8l2-3.5 2.7.9 2.4-1.4zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>',
 eyeSm:'<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 5c5 0 9 3.5 11 7-2 3.5-6 7-11 7S3 15.5 1 12c2-3.5 6-7 11-7zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zm0 1.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4z"/></svg>',
 phone:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 2.2c.6-.3 1.3-.1 1.6.5l2 4.3c.3.6.1 1.3-.4 1.7L7.9 10.1a12.4 12.4 0 0 0 6 6l1.4-1.9c.4-.5 1.1-.7 1.7-.4l4.3 2c.6.3.8 1 .5 1.6l-1.2 2.6c-.4.9-1.4 1.4-2.4 1.3C9.9 20.6 3.4 14.1 2.7 5.8c-.1-1 .4-2 1.3-2.4z"/></svg>',
 phoneSm:'<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 2.2c.6-.3 1.3-.1 1.6.5l2 4.3c.3.6.1 1.3-.4 1.7L7.9 10.1a12.4 12.4 0 0 0 6 6l1.4-1.9c.4-.5 1.1-.7 1.7-.4l4.3 2c.6.3.8 1 .5 1.6l-1.2 2.6c-.4.9-1.4 1.4-2.4 1.3C9.9 20.6 3.4 14.1 2.7 5.8c-.1-1 .4-2 1.3-2.4z"/></svg>',
 callPhone:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 2.2c.6-.3 1.3-.1 1.6.5l2 4.3c.3.6.1 1.3-.4 1.7L7.9 10.1a12.4 12.4 0 0 0 6 6l1.4-1.9c.4-.5 1.1-.7 1.7-.4l4.3 2c.6.3.8 1 .5 1.6l-1.2 2.6c-.4.9-1.4 1.4-2.4 1.3C9.9 20.6 3.4 14.1 2.7 5.8c-.1-1 .4-2 1.3-2.4z"/></svg>',
 callMic:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z"/><path d="M5 11a1 1 0 0 1 1 1 6 6 0 0 0 12 0 1 1 0 1 1 2 0 8 8 0 0 1-7 7.9V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-1.1A8 8 0 0 1 4 12a1 1 0 0 1 1-1z"/></svg>',
 callMicOff:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.3 2.3a1 1 0 0 1 1.4 0l17 17a1 1 0 0 1-1.4 1.4l-3.6-3.6A8 8 0 0 1 13 19.9V21h2a1 1 0 1 1 0 2H9a1 1 0 1 1 0-2h2v-1.1A8 8 0 0 1 4 12a1 1 0 1 1 2 0 6 6 0 0 0 9.3 5L13.8 15.5A4 4 0 0 1 8 12V9.7L3.3 3.7a1 1 0 0 1 0-1.4zM12 2a4 4 0 0 1 4 4v5.2L8.3 3.5A4 4 0 0 1 12 2zm6.3 12.6A6 6 0 0 0 18 12a1 1 0 1 1 2 0 8 8 0 0 1-.3 2.1z"/></svg>',
barMic:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',barMicOff:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3 3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.54-.9L19.73 21 21 19.73 4.27 3z"/></svg>',barSpk:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',barEnd:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>',barLock:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6z"/></svg>', // filled glyphs for the call bar
callSpeaker:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.8 5.5a9 9 0 0 1 0 13"/></svg>',
 video:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-4v12l-6-4z"/></svg>',
 callVideo:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h10a2 2 0 0 1 2 2v1.6l3.5-2.4A1 1 0 0 1 21 8v8a1 1 0 0 1-1.5.8L16 14.4V16a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"/></svg>',
 callVideoOff:'<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3.3 2.3a1 1 0 0 1 1.4 0l17 17a1 1 0 0 1-1.4 1.4L17.6 18H4a2 2 0 0 1-2-2V8c0-1 .7-1.8 1.7-2L3.3 3.7a1 1 0 0 1 0-1.4zM8.4 6H14a2 2 0 0 1 2 2v1.6l3.5-2.4A1 1 0 0 1 21 8v8c0 .3-.1.5-.3.7z"/></svg>',
 callFlip:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5h3.2L8 6h8l1.8 2.5H21V19H3z"/><path d="M9.2 14a2.8 2.8 0 0 0 4.9 1.6M14.8 12.6A2.8 2.8 0 0 0 9.9 11"/><path d="M14.5 15.9l-.4-.3.6-.4M9.5 10.7l.4.3-.6.4"/></svg>',
 userPlus:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM2 21v-2c0-2.8 3.6-4.5 8-4.5 1 0 2 .1 2.8.3A6 6 0 0 0 12 19.5V21zM18 14h2v3h3v2h-3v3h-2v-3h-3v-2h3z"/></svg>',
 chatsIc:'<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v11l-3 3h-7l-5 4v-4H3z"/></svg>',
 contactsIc:'<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM3 22v-2.5c0-3 4-5 9-5s9 2 9 5V22z"/></svg>',
 mic:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 1.5a3.5 3.5 0 0 1 3.5 3.5v6.5a3.5 3.5 0 0 1-7 0V5A3.5 3.5 0 0 1 12 1.5zM5 11h2.2a4.8 4.8 0 0 0 9.6 0H19a7 7 0 0 1-5.8 6.9V20H16v2.2H8V20h2.8v-2.1A7 7 0 0 1 5 11z"/></svg>',
 pause:'<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4.5v16H6zM13.5 4H18v16h-4.5z"/></svg>',
 down:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>',
 pin:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 2h8v2.2h-1.2v5.6l3.2 3.2V15H6v-2l3.2-3.2V4.2H8zM10.9 16h2.2v6h-2.2z"/></svg>',
 pinSm:'<svg class="pin-sm" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 2h8v2.2h-1.2v5.6l3.2 3.2V15H6v-2l3.2-3.2V4.2H8zM10.9 16h2.2v6h-2.2z"/></svg>',
 bell:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3c-3 0-5 2.3-5 5.5V13l-2 3v1h14v-1l-2-3V8.5C17 5.3 15 3 12 3zM9.5 19h5a2.5 2.5 0 0 1-5 0z"/></svg>',
 bellOff:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 16V11a6 6 0 0 1 9.5-4.9M18 11v5l2 2H8"/><path d="M10 21h4M3 3l18 18"/></svg>',
 mutedSm:'<svg class="mute-sm" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
 archive:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M3 3h18v5H3zM4 9h16v12H4zm5 2v2.2h6V11z"/></svg>',
 timer:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M9 1.5h6v2.2h-1.9v1.5a8.5 8.5 0 1 1-2.2 0V3.7H9zM12 7.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm-1.1 2h2.2v4.6h3v2.2h-5.2z"/></svg>',
 timerSm:'<svg class="timer-sm" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M9 1.5h6v2.2h-1.9v1.5a8.5 8.5 0 1 1-2.2 0V3.7H9zM12 7.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zm-1.1 2h2.2v4.6h3v2.2h-5.2z"/></svg>',
 bookmark:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M5 2h14v20l-7-5-7 5z"/></svg>',
 bookmarkBig:'<svg width="40" height="40" viewBox="0 0 24 24" fill="currentColor"><path d="M5 2h14v20l-7-5-7 5z"/></svg>',
 fwd:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M14 4v5C7.7 9 3.8 12.2 3 19c2.1-4.2 5.2-6 11-6v5l8-7z"/></svg>',
 fwdSm:'<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M14 4v5C7.7 9 3.8 12.2 3 19c2.1-4.2 5.2-6 11-6v5l8-7z"/></svg>',
 fmt:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 19 8.5 5h1L15 19M5 14h8"/><path d="M15.5 12.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM18.5 11v8"/></svg>',
 fB:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round"><path d="M7 4h6a4 4 0 0 1 0 8H7zM7 12h7a4 4 0 0 1 0 8H7z"/></svg>',
 fI:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10 4h8M6 20h8M15 4 9 20"/></svg>',
 fU:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/></svg>',
 fS:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 12h16M16.5 7.5C16 5.5 14.2 4.5 12 4.5c-2.6 0-4.5 1.3-4.5 3.4 0 1.6 1 2.6 3 3.3M7.5 16.5c.5 2 2.3 3 4.7 3 2.7 0 4.5-1.3 4.5-3.4 0-.8-.3-1.5-.8-2.1"/></svg>',
 fCode:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5"/></svg>',
 fSpoiler:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1C3.5 7.9 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
 shieldSm:'<svg class="timer-sm" width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M12 2l9 3v6c0 5-3.6 9.3-9 11-5.4-1.7-9-6-9-11V5zm-1.5 13.2-2.9-2.9-1.4 1.4 4.3 4.3 7.3-7.3-1.4-1.4z"/></svg>',
 eyeOff:'<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3 3.8M6.1 6.1C3.5 7.9 2 12 2 12s3.6 7 10 7c1.8 0 3.4-.5 4.8-1.3"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
 comment:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 3h18v11l-3 3h-7l-5 4v-4H3z"/></svg>',
 image:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M2 20 9 9l4.5 7 2.5-3.5L22 20zM16 5h4v4h-4z"/></svg>',
 up:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3.5 15.5 12 7l8.5 8.5-2 2L12 11l-6.5 6.5z"/></svg>',
 peopleIc:'<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M9 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8zM2 21v-3l4-3h6l4 3v3zM17.5 6a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM16 14.5h3l3.5 2.5V21h-4v-2.5z"/></svg>',
 tick:'<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 15.6 5.1 11.2 3 13.3l6.5 6.5L21 8.3l-2.1-2.1z"/></svg>',
 device:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M6 1h12v22H6zm2.2 3v14h7.6V4zM10.6 20h2.8v1.4h-2.8z"/></svg>',
 key:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path fill-rule="evenodd" d="M15.5 2a6.5 6.5 0 0 0-6.2 8.5L2 17.8V22h4.2v-2.6h2.6v-2.6h2.6l2.1-2.1A6.5 6.5 0 1 0 15.5 2zm1.5 3.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z"/></svg>',
 sliders:'<svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M3 5h18v2.2H3zM3 10.9h18v2.2H3zM3 16.8h18V19H3zM6 3h4v6.2H6zM13 8.9h4v6.2h-4zM8 14.8h4V21H8z"/></svg>'
};

/* ---------- helpers ---------- */
const $=(s,r=document)=>r.querySelector(s);
function el(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e}
function html(tag,cls,h){const e=el(tag,cls);e.innerHTML=h;return e}
/* ===== HUSH STORE BEGIN ===== */
/* What this device keeps, and how (SPEC.md 12.2). Everything the page stores under `hush:` lives in one map in
   memory and reaches disk only as one AES-256-GCM blob, `hush:sealed`: account and device private keys, chat keys,
   invite secrets, logins and phone numbers, drafts, read marks, who was sent a note, the message timer last seen per chat
   (so a change the other side did not announce can be pointed out), the chat list as last drawn
   (titles, last-line text, times, counts; no text from a chat with a timer), so the next start paints it at once. The blob's key is the lock
   password (PBKDF2, 600k rounds) while a password lock is on; otherwise a device key this browser made once and
   keeps non-extractable in IndexedDB, so a copy of localStorage alone opens nothing (where IndexedDB is missing, the
   key sits next to the blob and the password lock is the real protection). Only the lock settings, the theme and
   the blob itself stay plain. Nothing is unsealed until the lock gate has passed; locking reloads the page, which
   drops every unsealed byte; logging an account out removes its entries, and the last one takes the device key.
   This block has no page dependencies beyond enc, dec, b64u and unb64u, so the server's tests lift it out. */
const PLAIN_KEYS=new Set(['hush:applock','hush:lockFails','hush:lockAfter','hush:theme','hush:sealed','hush:sealed:old','hush:sealed:old2','hush:devkey','hush:msgPushDev']); // msgPushDev: whether this iPhone wants message banners, a choice of the device that outlives a log-out (each account's own setting is sealed and goes with the account)
const lsSecret=k=>typeof k==='string'&&k.startsWith('hush:')&&!PLAIN_KEYS.has(k);
const lockCfg=()=>{try{return JSON.parse(localStorage.getItem('hush:applock')||'null')}catch{return null}};
const lsPw=()=>{const c=lockCfg();return !!(c&&c.kind==='pw')};
const lockPlan=(cfg,callMode)=>!cfg?'none':cfg.kind==='pw'||!callMode?'await':'show'; // the gate at start: a password lock is answered first (the store is sealed under it); a PIN lock seals nothing, so a page booted for a pushed call shows it without waiting and the call can ring and be answered while the chats stay covered
let SECM=null,SECK=null,SECP={},secSave=Promise.resolve(),secDirty=false,lastSealed=null; // the unsealed map, its key, writes made before it opened, the save chain, the blob as this tab last read or wrote it
const ls={get(k,d){if(lsSecret(k)){const m=SECM||SECP;return k in m?m[k]:d}try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},
  set(k,v){if(lsSecret(k)){const m=SECM||SECP;
    if(k==='hush:ids'&&Array.isArray(v)&&Array.isArray(m[k]))for(const t of m[k]){const i=v.findIndex(x=>x&&t&&x.handle===t.handle);if(i>=0&&(t.kv||1)>(v[i].kv||1))v[i]=t} // an account's newer keys (another tab replaced them) are never written over by a stale copy
    if(v==null)delete m[k];else m[k]=v;if(SECM)saveSecrets();return}try{if(v==null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v))}catch{}}};
async function lockKey(pw,salt){const b=await crypto.subtle.importKey('raw',enc.encode(pw.normalize('NFKC')),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',salt,iterations:600000},b,{name:'AES-GCM',length:256},false,['encrypt','decrypt'])}
async function sealBlob(k,json){const iv=crypto.getRandomValues(new Uint8Array(12));
  return JSON.stringify({iv:b64u(iv),ct:b64u(new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},k,enc.encode(json))))})}
async function unsealBlob(k,blob){const b=JSON.parse(blob);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(b.iv)},k,unb64u(b.ct))))}
function saveSecrets(){ // one write per burst of changes, always of the latest map, under the key of that moment
  if(secDirty)return secSave;secDirty=true;
  secSave=secSave.then(async()=>{secDirty=false;const k=SECK,m=SECM;if(!k||!m)return;
    const disk=localStorage.getItem('hush:sealed');if(disk!==lastSealed){let theirs=null;if(disk)try{theirs=await unsealBlob(k,disk)}catch{} // another tab wrote in between: carry its changes along
      if(!theirs){if(typeof location!=='undefined')location.reload();return} // gone, or under a key this tab no longer has (the last account was logged out there, or a lock was set): writing would leave a store nobody can open, or bring a logged-out account back
      mergeSealed(m,theirs)}
    const blob=await sealBlob(k,JSON.stringify(m));localStorage.setItem('hush:sealed',blob);lastSealed=blob}).catch(()=>{secDirty=false});
  return secSave}
function mergeSealed(m,theirs){ // another tab wrote since this one last read the blob: keep an account's newer keys, the key-store entries this tab lacks, and a device-removal record in progress
  const ids=Array.isArray(theirs['hush:ids'])?theirs['hush:ids']:[],mine=Array.isArray(m['hush:ids'])?m['hush:ids']:[];
  for(const t of ids){const i=mine.findIndex(x=>x&&x.handle===t.handle);if(i>=0&&(t.kv||1)>(mine[i].kv||1))mine[i]=t}
  const has=h=>mine.some(x=>x&&x.handle===h); // only for accounts this tab still has: one logged out here stays forgotten
  for(const [k,v] of Object.entries(theirs)){if(k.startsWith('hush:ks:')&&v&&typeof v==='object'&&has(k.slice(8))){const o=m[k]&&typeof m[k]==='object'?m[k]:(m[k]={});for(const [cid,es] of Object.entries(v))for(const [e,raw] of Object.entries(es||{}))if(!(o[cid]&&o[cid][e]))(o[cid]=o[cid]||{})[e]=raw}
    else if(k.startsWith('hush:rekey:')&&has(k.slice(11))&&v&&(!m[k]||(v.at||v.done||0)>(m[k].at||m[k].done||0)))m[k]=v}} // the record with the later heartbeat (or its 'done' mark) wins
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
// Opens the store with the first of `keys` that opens the blob (the device key from IndexedDB, then one kept beside the
// blob), then moves any plain `hush:` entries (from before the sealed store, or an older page) into it, writing the blob
// before the plain copies go. A blob none of them opens is from a key this browser no longer has (lost, or replaced by a
// tab that logged the last account out): unless a password lock guards it, it is set aside under hush:sealed:old (a second
// one under hush:sealed:old2, never over the first) and counted as read, so the fresh store writes over it rather than
// leaving a page that reloads. One set aside earlier is kept until every account it lists is signed in here again, then
// what this store lacks comes over (mergeSealed: chat keys, newer account keys) and it is dropped: a boot whose IndexedDB
// failed once (release 72) used to leave the old store behind for good.
async function openStore(keys,sure){ // keys: this device's keys, the IndexedDB one first; sure: the key store answered (or there is none), so a blob no key opens is really from a key this browser lost, not from a store that failed to answer this once
  const key=keys[0];let m={},changed=false;const blob=localStorage.getItem('hush:sealed');
  if(blob){let open=false;for(const k of keys){try{m=await unsealBlob(k,blob);open=true;if(k!==key)changed=true;break}catch{}} // opened under a later key (the one kept beside the blob): written back under the first, which IndexedDB guards
    if(!open){if(lsPw())throw new Error('locked');if(!sure)throw new Error('store');localStorage.setItem(localStorage.getItem('hush:sealed:old')?'hush:sealed:old2':'hush:sealed:old',blob);changed=true}lastSealed=blob}else changed=true; // under a password lock only the password opens it
  for(const o of ['hush:sealed:old','hush:sealed:old2']){const old=localStorage.getItem(o);if(!old)continue;
    for(const k of keys){let t;try{t=await unsealBlob(k,old)}catch{continue}const mine=Array.isArray(m['hush:ids'])?m['hush:ids']:[],ids=Array.isArray(t['hush:ids'])?t['hush:ids']:[];
      if(ids.length&&ids.every(x=>x&&mine.some(y=>y&&y.handle===x.handle))){mergeSealed(m,t);localStorage.removeItem(o);changed=true}break}}
  const plain=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(lsSecret(k))plain.push(k)}
  for(const k of plain){if(!(k in m)){try{const v=JSON.parse(localStorage.getItem(k));if(v!=null){m[k]=v;changed=true}}catch{}}}
  for(const [k,v] of Object.entries(SECP)){if(v==null)delete m[k];else m[k]=v;changed=true}SECP={};
  SECK=key;SECM=m;
  if(changed)await saveSecrets();
  if(keys.length>1&&!localStorage.getItem('hush:sealed:old')&&!localStorage.getItem('hush:sealed:old2'))localStorage.removeItem('hush:devkey'); // the store is under the IndexedDB key and nothing set aside may still need the key beside the blob: a copy of localStorage alone opens nothing again (SPEC.md 12.2)
  plain.forEach(k=>{try{localStorage.removeItem(k)}catch{}});
}
async function unlockStore(){ // after the lock gate: a password lock opened the store itself; otherwise the device key does, with a key kept beside the blob (fallbackKey) as the second try
  if(SECM)return;const keys=[];let noidb=false;
  try{keys.push((await Promise.race([deviceKey(),new Promise((_,rej)=>setTimeout(()=>rej(new Error('slow')),8000))])).key)}catch(e){noidb=!!(e&&e.message==='noidb')}
  const sure=keys.length>0||noidb; // IndexedDB failing for one launch with a store on disk (WebKit bug 277615: its connection is lost after a relaunch and the open errors or hangs) makes no new key and sets nothing aside: that would show a signed-in person the sign-up
  if(localStorage.getItem('hush:devkey')||noidb||(!keys.length&&!localStorage.getItem('hush:sealed')))keys.push((await fallbackKey()).key); // a key kept beside the blob is tried too; one is made only where there is no IndexedDB, or nothing is sealed yet
  if(!keys.length)throw new Error('store'); // the boot shows this and offers a retry; nothing on disk changes
  await openStore(keys,sure)}
async function openSealed(pw){ // the password lock: the blob opens with the lock password or not at all
  const c=lockCfg(),blob=localStorage.getItem('hush:sealed');if(!c||!blob)throw new Error('nolock');
  const k=await lockKey(pw,unb64u(c.salt));await unsealBlob(k,blob); // a wrong password fails here, before anything changes
  await openStore([k],true)}
async function sealOn(pw){ // the lock password's key takes over from the device key, checked to open before the switch
  const salt=crypto.getRandomValues(new Uint8Array(16)),k=await lockKey(pw,salt);await secSave;
  const json=JSON.stringify(SECM),blob=await sealBlob(k,json);if(JSON.stringify(await unsealBlob(k,blob))!==json)throw new Error('seal');
  SECK=k;localStorage.setItem('hush:sealed',blob);lastSealed=blob;localStorage.setItem('hush:applock',JSON.stringify({kind:'pw',salt:b64u(salt)}));ls.set('hush:lockFails',null)}
async function sealChange(cur,pw){const c=lockCfg(),old=await lockKey(cur,unb64u(c.salt));await unsealBlob(old,localStorage.getItem('hush:sealed'));
  await secSave;const salt=crypto.getRandomValues(new Uint8Array(16)),k=await lockKey(pw,salt);
  SECK=k;localStorage.setItem('hush:sealed',lastSealed=await sealBlob(k,JSON.stringify(SECM)));localStorage.setItem('hush:applock',JSON.stringify({kind:'pw',salt:b64u(salt)}))}
async function sealOff(cur){ // back to the device key; nothing is ever written out plain
  const c=lockCfg(),k=await lockKey(cur,unb64u(c.salt));await unsealBlob(k,localStorage.getItem('hush:sealed'));
  let dk;try{dk=await deviceKey()}catch{dk=await fallbackKey()}await secSave;
  SECK=dk.key;localStorage.setItem('hush:sealed',lastSealed=await sealBlob(dk.key,JSON.stringify(SECM)));localStorage.removeItem('hush:applock');ls.set('hush:lockFails',null)}
function forgetEntries(pred){ // drops every entry, sealed or plain, that `pred(key, value)` picks; returns how many
  let n=0;for(const m of [SECM,SECP])if(m)for(const k of Object.keys(m))if(pred(k,m[k])){delete m[k];n++}
  const gone=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(lsSecret(k)&&pred(k,null))gone.push(k)}
  gone.forEach(k=>{try{localStorage.removeItem(k)}catch{}});n+=gone.length;if(n&&SECM)saveSecrets();return n}
async function forgetDevice(){ // every account and key this device holds: the blob, the device key, the lock settings
  await secSave.catch(()=>{});
  for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k&&k.startsWith('hush:')&&k!=='hush:theme'&&k!=='hush:msgPushDev')try{localStorage.removeItem(k)}catch{}}
  SECM=null;SECK=null;SECP={};lastSealed=null;
  await new Promise(res=>{if(typeof indexedDB==='undefined'){res();return}try{const r=indexedDB.deleteDatabase('hush');r.onsuccess=r.onerror=r.onblocked=()=>res()}catch{res()}})}
// Another tab of this page wrote the blob: take its map, so this tab's next write carries both tabs' changes.
if(typeof addEventListener==='function')addEventListener('storage',e=>{if(e.key!=='hush:sealed'||!e.newValue||!SECK||secDirty)return;
  unsealBlob(SECK,e.newValue).then(m=>{if(secDirty)return;SECM=m;lastSealed=e.newValue;const ids=Array.isArray(m['hush:ids'])?m['hush:ids']:[];
    if(S.me&&!ids.some(x=>x&&x.handle===S.me.handle)){callOff(false);S.ids=ids;S.me=null;dropUnsealed();if(S.db&&S.db.prove)S.db.prove(null);if(S.ids.length)start(S.ids[0]);else showOnboard(false,'You logged out in another tab.')} // logged out in another tab: this one leaves the account too, and writes nothing of it back
    else if(S.me&&!S.rekeying&&ids.some(x=>x&&x.handle===S.me.handle&&x.sig&&S.me.sig&&x.sig.x!==S.me.sig.x))location.reload()}, // another tab replaced this account's keys (a device removal): this one reloads into them, as signedOutHere does once the profile shows them, so it checks nothing it shares with that tab against the key replaced (noteRoles)
    ()=>location.reload())}); // a blob this tab can't open: the device key or the lock changed in another tab; a fresh start takes it up
const rekeyPending=rec=>!!(rec&&typeof rec==='object'&&typeof rec.stage==='string'); // a removal record mid-way; a finished one is only a done mark
/* ===== HUSH STORE END ===== */
const hue=s=>{let h=0;for(const c of s)h=(h*31+c.charCodeAt(0))%360;return h};
// Avatar colours as [hue, saturation %, lightness %]: no purples (hue 235–320 is skipped), white initials 4.8:1 or more.
const AV_COLORS=[[215,55,42],[188,55,32],[160,40,32],[80,35,33],[38,60,36],[18,55,42],[355,45,44],[205,22,40],[200,45,38],[150,35,30]];
const avColor=s=>AV_COLORS[hue(s)%AV_COLORS.length]; // same key, same colour
const safePhoto=p=>typeof p==='string'&&p.length<250000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(p)?p:null;
function avatar(key,name,cls='',photo){const a=el('div','avatar '+cls);const ph=safePhoto(photo);
  if(ph){const i=el('img');i.src=ph;i.alt='';a.append(i)}
  else{a.textContent=(name||key||'?').trim().charAt(0).toUpperCase();const [h,s,l]=avColor(key||'?');a.style.background=`var(--av${hue(key||'?')%6+1},hsl(${h} ${s}% ${l}%))`} // one of the sheet's six tiles, the same for the same username; the older colour stays behind it for the call screen (step I)
  return a}
const userAvatar=(h,cls='')=>isGone(h)?avatar('?','?',cls):avatar(h,displayName(h),cls,S.dir[h]&&S.dir[h].photo);
const convAvatar=(c,cls='')=>isSelf(c)?html('div','avatar saved '+cls,I.bookmark):typeOf(c)==='dm'?userAvatar(dmPeer(c),cls):avatar(c.id,c.name,cls,c.photo);
const isOnline=h=>{const p=S.presence[h];return !!p&&!p.hidden&&Date.now()-p.ts<75000};
function lastSeen(h){
  if(isGone(h))return ''; // a deleted account is never seen again
  const p=S.presence[h];if(!p||p.hidden||!p.ts)return 'last seen recently';
  const d=Date.now()-p.ts;if(d<75000)return 'online';
  if(d<3600e3)return `last seen ${Math.max(1,Math.round(d/60000))} min ago`;
  if(new Date(p.ts).toDateString()===new Date().toDateString())return 'last seen at '+fmtTime(p.ts);
  return 'last seen '+new Date(p.ts).toLocaleDateString([], {month:'short',day:'numeric'});
}
const fmtTime=ts=>new Date(ts).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'});
function fmtListTime(ts){const d=new Date(ts),n=new Date();if(d.toDateString()===n.toDateString())return fmtTime(ts);if(n-d<6*864e5)return d.toLocaleDateString([], {weekday:'short'});return d.toLocaleDateString([], {month:'short',day:'numeric'})}
function fmtDay(ts){const d=new Date(ts),n=new Date();if(d.toDateString()===n.toDateString())return 'Today';const y=new Date(n);y.setDate(n.getDate()-1);if(d.toDateString()===y.toDateString())return 'Yesterday';return d.toLocaleDateString([], {month:'long',day:'numeric'})}
// A short tap: the iPhone app's native Haptics plugin, else the Vibration API (Android and others; iPhone browsers have
// none, so nothing happens there). Reduce Motion doesn't stop it: iOS keeps haptics on with it. firm: destructive actions and errors.
const haptic=firm=>{try{const C=window.Capacitor;
  if(C&&C.isNativePlatform&&C.isNativePlatform())C.nativePromise('Haptics','impact',{style:firm?'MEDIUM':'LIGHT'}).catch(()=>{}); // an app build without the plugin refuses: no buzz
  else if(navigator.vibrate)navigator.vibrate(firm?20:10)}catch{}};
const toastErr=(msg,action,fn)=>{haptic(true);toast(msg,action,fn)}; // a toast that says something failed
const confirmDanger=msg=>{const ok=confirm(msg);if(ok)haptic(true);return ok}; // a destructive action, confirmed
let toastT;function toast(msg,action,fn,ms){ // ms: how long it stays, for one that must be seen
  document.querySelectorAll('.toast').forEach(x=>x.remove());const t=el('div','toast');t.setAttribute('role','status');t.append(el('span',null,msg));
  if(action){const b=el('button','toast-act',action);b.onclick=()=>{t.remove();fn()};t.append(b)}
  document.body.append(t);clearTimeout(toastT);toastT=setTimeout(()=>t.remove(),ms||(action?5000:3200))}
const isGone=h=>!!(S.dir[h]&&S.dir[h].gone); // a deleted account: the server keeps its public keys, so its old messages still verify
const displayName=h=>isGone(h)?'Deleted account':(S.dir[h]&&S.dir[h].name)||h;
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
function applyTheme(){const t=ls.get('hush:theme','light');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t;else delete document.documentElement.dataset.theme}
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
  const open=l=>{if(!stack.includes(l)){if(l.under)stack.unshift(l);else stack.push(l)}pending=false;arm();return l}; // under: beneath whatever is open, so Back closes those first
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
$('#tabChatsIc').innerHTML=I.chatsIc;$('#tabCallsIc').innerHTML=I.phone;$('#tabProfileIc').innerHTML=I.sliders;$('#searchIc').innerHTML=I.search;$('#newBtn').innerHTML=I.pencil;
$('#newBtn').onclick=()=>openNewChat();
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{const d=TABS.indexOf(b.dataset.tab)-TABS.indexOf(S.tab);if(d){haptic();setTab(b.dataset.tab,Math.sign(d))}else if(b.dataset.tab==='profile'&&isSettingsPage()){S.profilePage='main';setTab('profile')}else if(b.dataset.tab==='chats'&&S.showArchived){S.showArchived=false;setListTitle();renderList()}});
$('#q').oninput=e=>{S.query=e.target.value.trim().toLowerCase();renderList()};

const lastRead=k=>ls.get(`hush:read:${S.me.handle}:${k}`,0);
// What the chat on screen writes for every message that arrives (its read mark, the chat's latest-message marker) goes at most once a
// second for each key: at once when a second has passed since the last, else once at the end of that second, the latest asked for
// (by a clock that does not step, so the device's clock set back holds nothing up). However fast messages arrive, these two writes come to two
// frames a second where they were three a message (SPEC.md 9.4). Not paced: the delete each page sends for a message that expires, and
// the profile read for a sender this page holds no profile for. A page closed, put to sleep for good or signed out inside the second
// leaves the last mark of a burst unwritten.
const paceAt=new Map(),paceT=new Map();
function paced(k,fn){clearTimeout(paceT.get(k));const d=(paceAt.get(k)||-1e3)+1000-performance.now(),go=()=>{paceAt.set(k,performance.now());fn()};if(d<=0)go();else paceT.set(k,setTimeout(go,d))}
function markRead(){
  const c=curConv();if(!c||!S.posts.length||document.hidden)return;
  const ts=S.posts[S.posts.length-1].ts;
  if(ts>lastRead(c.id))ls.set(`hush:read:${S.me.handle}:${c.id}`,ts);
  S.unread.set(c.id,0);updateTitle();
  if(S.db&&isMember(c)&&!isRequest(c)&&(S.readWritten.get(c.id)||0)<ts){S.readWritten.set(c.id,ts);const me=S.me.handle;paced('seen:'+c.id,()=>{if(S.me&&S.me.handle===me)writeSeen(c,ts)})} // the mark that waited its second is written for its own chat also when another is on screen by then, never under another account
}
async function writeSeen(c,ts){ // "read up to here", filed under a tag only the people in this chat can work out
  try{const e=epochOf(c),t=await memTag(c,e,S.me.handle);if(!t)return;
    await S.db.doc(`channels/${c.id}/reads/${e}~${t}`).set(await sealSide(c,e,t,'hush-seen-v1',ts));
  }catch{}}
const typeOf=c=>(c&&c.type)||'channel';
const chatRec=(cid,d)=>Object.assign({},d,{id:cid}); // a record as the server gave it, at the address asked for: a field `id` in it never wins
const dmPeer=c=>(c.members||[]).find(h=>h!==S.me.handle)||S.dmPeers[c.id]||S.me.handle;
const isSelf=c=>typeOf(c)==='dm'&&dmPeer(c)===S.me.handle;
const convTitle=c=>typeOf(c)==='dm'?(isSelf(c)?'Saved Messages':displayName(dmPeer(c))):c.name;
const titleNode=(tag,cls,c)=>{const n=el(tag,cls,convTitle(c));if(typeOf(c)==='dm'&&!isSelf(c))withBadge(n,dmPeer(c));return n}; // a chat's title, with the person's badge when the chat is a person
const convById=id=>S.convs.find(c=>c.id===id)||S.previews.get(id);
const curConv=()=>S.chan?convById(S.chan):null;
const isMember=c=>!!c&&((c.members||[]).includes(S.me.handle)||typeOf(c)==='channel'&&c.visibility!=='public'&&!!levelHere(c)); // a private channel's list is its owner's and admins' alone (SPEC.md 5.3): a subscriber is one by the level its current key gives this connection
const levelHere=c=>c&&c.id&&S.db&&S.db.chatLevel?S.db.chatLevel(c.id):null; // what the server gave this connection's key
const isOwner=c=>!!c&&(c.owner===S.me.handle||levelHere(c)==='owner');
const isAdminH=(c,h)=>!!c&&(c.owner===h||(c.admins||[]).includes(h));
const isAdmin=c=>!!(c&&S.me)&&(isAdminH(c,S.me.handle)||['owner','admin'].includes(levelHere(c)));
const knownIn=c=>typeOf(c)==='channel'&&!isAdmin(c)?[c.owner,...(c.admins||[])].filter(Boolean):(c.members||[]); // the people of a chat this page takes into its people lists, key pins, presence and profile loads: a channel's subscribers are for its owner and admins alone to know (SPEC.md 5.3), so from a channel where this account is neither, only its owner and admins (whose posts and key changes every subscriber checks)
const canPost=c=>isMember(c)&&(typeOf(c)!=='channel'||isAdmin(c));
const canPin=c=>isMember(c)&&(typeOf(c)==='dm'||isAdmin(c));
// Who may delete a message for everyone: its author; outside DMs an admin, but never the owner's, which only the owner may.
// shortcut: the page's rule only; the server lets any admin delete any message, since it never learns who wrote what.
const mayDeleteForAll=({t,mine,admin,owner,byOwner})=>mine||(admin&&t!=='dm'&&(owner||!byOwner));
// Only messages in a public group or channel can be reported: the server can't read anything else, so it couldn't check a report.
const mayReport=(c,p,mine)=>typeOf(c)!=='dm'&&c.visibility==='public'&&!mine&&p.sv!==1&&!p.svc&&!p.del&&!!p._id;
const mentionsMe=t=>!!(t&&S.me&&new RegExp('(^|[^\\p{L}\\p{N}_@])@'+S.me.handle+'(?![\\p{L}\\p{N}_])','iu').test(t));
const draftKey=cid=>`hush:draft:${S.me.handle}:${cid}`;
function fmtWhen(ts){const d=new Date(ts),n=new Date(),tm=fmtTime(ts);if(d.toDateString()===n.toDateString())return 'today at '+tm;
  const t=new Date(n);t.setDate(n.getDate()+1);if(d.toDateString()===t.toDateString())return 'tomorrow at '+tm;return d.toLocaleDateString([], {weekday:'short',month:'short',day:'numeric'})+' at '+tm}
const memberText=c=>{const n=(c.members||[]).length;return n===1?'1 member':n+' members'};
const subsText=(c,lead='',all)=>{const l=(c.members||[]).length,pub=c.visibility==='public',n=isAdmin(c)?l:all&&!pub?(l||c.n):null;return Number.isInteger(n)&&n>=0?lead+(n===1?'1 subscriber':n+' subscribers'):pub?'Public channel':'Private channel'}; // who a channel's subscribers are is for its owner and admins alone to know (SPEC.md 5.3); how many there are is not, but only Channel info (all) says, and of a private channel only: an admin counts the list this page holds, anyone else the list the copy holds (while the server still hands it out) or else the record's n, a whole number of 0 or more; a public channel's count waits for Phase 3, so below admin level it shows none whatever its record carries (no server stores one there, and its shown people are no count); with no number, only what kind of channel it is; lead (their line alone) goes before the number
let countQ=Promise.resolve();
const recount=c=>{if(typeOf(c)!=='channel'||c.visibility==='public'||S.rekeying||c._unlocked&&c.n===(c.members||[]).length)return;const cid=c.id;return countQ=countQ.then(async()=>{try{const f=await freshChan(cid),s=await showMeta(f);if(s._unlocked&&isAdmin(s)&&f.n!==s.members.length)await S.db.doc('channels/'+cid).update({n:s.members.length})}catch{}})}; // the count for pages that hold no list (the record's n, which subsText shows in Channel info): a private channel's owner's and admins' pages bring it in step with the list (a public channel has none to read: showMeta sets no _unlocked), a separate best-effort update of n alone after each write of the list and when they open the channel; never part of the list's own write, its refusal (a server that doesn't take the field) ignored and nothing depending on it; the record read afresh, one count at a time, and nothing written when n is right, nor even read when the copy at hand shows it

// A chat row's drawn values, strings and numbers only (no record, no key): what renderList paints, and what the sealed
// store keeps as the list cache (hush:list:<handle>) so the next start paints the list before the server answers.
// k: dm | self | group | channel | req | arch; n title; h the peer (dm); ts last message time; s the second line;
// u unread shown; m muted; p pinned; at a mention; b badge; x the last message's expiry (a timer chat caches no s).
function rowModel(c,pv,now){
  const t=typeOf(c),l=c.last,mine=l&&l.from===S.me.handle,dm=t==='dm'&&!isSelf(c),h=dm?dmPeer(c):'';let sub;
  if(S.call&&S.call.cid===c.id&&S.call.state==='live')sub='In a call';
  else if(!l)sub=t==='group'?memberText(c):subsText(c);
  else if(dm&&keyChanged(h))sub='\u26a0\ufe0f Security code changed';
  else if(l.exp&&l.exp<=now)sub='Message disappeared';
  else if(hiddenPost(l,pv))sub='New message';
  else if(!mine&&isBlocked(l.from))sub='Message from someone you blocked';
  else{if(pv&&pv.nokey)noKeyNotice(c,l.e??0);const txt=previewText(pv);sub=t==='channel'||isSelf(c)?txt:t==='group'?(mine?'You':displayName(l.from))+': '+txt:(mine&&!(pv&&pv.call)?'You: ':'')+txt}
  return {id:c.id,k:isSelf(c)?'self':t,n:convTitle(c),h,ts:l?l.ts:0,s:sub,u:S.unread.get(c.id)||0,m:isMuted(c.id),p:!S.showArchived&&isPinned(c.id),at:!!S.mentions.get(c.id),b:dm?badgeOf(h):null,x:l&&l.exp||0}}
// The row for a model; c is the live record (the avatar photo, the presence dot, the tap and the menu). A cached row has none: its tap waits for the record.
function drawRow(m,c){
  const row=m.k==='req'||m.k==='arch',b=el('button','thread'+(row?' '+m.k+'-row':m.id===S.chan?' active':'')),main=el('div','t-main'),top=el('div','t-row'),bot=el('div','t-row'),nm=el('span','t-name');
  if(m.k==='channel')nm.insertAdjacentHTML('afterbegin',I.megaSm);if(m.k==='group')nm.insertAdjacentHTML('afterbegin',I.groupSm);
  nm.append(m.n);if(m.b)withBadge(nm,m.h,{[m.h]:m.b});if(m.m)nm.insertAdjacentHTML('beforeend',I.mutedSm);
  top.append(nm,el('span','t-time',m.ts?fmtListTime(m.ts):''));
  const dr=!row&&m.id!==S.chan&&ls.get(draftKey(m.id),'');
  if(dr){const se=el('span','t-sub');se.append(el('span','draft','Draft: '),plainText(dr));bot.append(se)}else bot.append(el('span','t-sub',m.s||(m.x&&m.x<=Date.now()?'Message disappeared':'')));
  if(m.at&&m.id!==S.chan)bot.append(el('span','unread at','@'));
  if(m.u&&m.id!==S.chan)bot.append(el('span','unread'+(m.m||m.k==='arch'?' muted':''),m.u>99?'99+':String(m.u)));else if(m.p)bot.insertAdjacentHTML('beforeend',I.pinSm);
  main.append(top,bot);
  const av=c?convAvatar(c):m.k==='req'?html('div','avatar req-av','\u2709\ufe0f'):m.k==='arch'?html('div','avatar arch-av',I.archive):m.k==='self'?html('div','avatar saved',I.bookmark):avatar(m.h||m.id,m.n);
  if(c&&m.k==='dm'&&isOnline(m.h)){const w=el('div','av-wrap');w.append(av,el('span','on-dot'));b.append(w)}else b.append(av);
  b.append(main);
  if(c){b.onclick=()=>{if(b._noClick&&Date.now()-b._noClick<600)return;openConv(c.id)};addLongPress(b,()=>chatMenu(b,c))}
  else if(!row)b.onclick=()=>{S.wantOpen=m.id;if(S.db&&S.db.hurry)S.db.hurry(m.id)}; // opened by onConvs the moment the record is in, which this tap sends for ahead of the start's other chats
  return b}

let listSeq=0,lastList={h:'',j:''},listOrder={h:'',m:null};
function listRank(cid){const h=S.me&&S.me.handle;if(!h||S.convsLoaded)return -1;if(listOrder.h!==h){const rows=ls.get('hush:list:'+h,null);listOrder={h,m:new Map((Array.isArray(rows)?rows:[]).map((m,i)=>[m&&m.id,i]))}}const r=listOrder.m.get(cid);return r===undefined?-1:r} // a chat's place in the list as last drawn, while the live one is still coming: the start's queue follows it
async function renderList(){
  const seq=++listSeq,box=$('#threads'),kept=[],tap=(r,m)=>{if(m.k==='req')r.onclick=()=>{if(pendingRequests().length||(S.invites||[]).length)openRequests()};if(m.k==='arch')r.onclick=()=>{S.showArchived=true;setListTitle();renderList()};return r};updateStatus(); // tap: a kept summary row opens what the live one opens, with whatever is in; Message requests only once one is in (its sheet would say there is none)
  const skel=()=>Array.from({length:6},()=>{const r=el('div','thread skel');r.append(el('div','avatar'),el('div','t-main'));r.lastChild.append(el('div','sk1'),el('div','sk2'));return r}),head=()=>{const h=html('button','arch-head',I.back+'<span>Archived chats</span>');h.onclick=()=>{S.showArchived=false;setListTitle();renderList()};return h};
  if(!S.me){box.replaceChildren();return}
  splashOff('list'); // the list's first draw for an account, rows or not: the shell is the first screen
  if(!S.convsLoaded&&S.tab==='chats'&&!S.query&&!S.showArchived){const rows=ls.get('hush:list:'+S.me.handle,null),set=S.contactsReady; // the list as last drawn, until the live one is whole (it comes chat by chat): a row stands, with no time limit, until its chat has been in the live list in this start (S.seenLast: its live row takes its place below, and from then on it is as on the live list) or is known gone: the chat watch forgot it or no note names it (S.chatGone), or this account's settings, once read, keep it out of this list. A summary row stands until the live one of its kind has been drawn in this start (S.liveSum), Archived chats not once the settings archive nothing. Once the settings are read a row's pin and muted marks are theirs; its count and line stay as saved
    if(Array.isArray(rows))kept.push(...rows.filter(m=>m&&!(m.id?S.seenLast.has(m.id)||S.chatGone&&S.chatGone(m.id)||set&&(isArchived(m.id)||isChatBlocked(m.id)||clearedAt(m.id)&&!(m.ts>clearedAt(m.id))||m.k==='dm'&&(isBlocked(m.h)||['in','no'].includes((dmInfo(m.id)||{}).req))):S.liveSum&&S.liveSum.has(m.k)||set&&m.k==='arch'&&!P().archived.length)).map(m=>m.id&&set?Object.assign({},m,{p:isPinned(m.id),m:isMuted(m.id)}):m));if(kept.length&&!S.convs.length){if(!S.boot.cache)S.boot.cache=performance.now();box.replaceChildren(...kept.map(m=>tap(drawRow(m),m)));return}}
  if(!S.convsLoaded&&!S.convs.length){box.replaceChildren(...(S.showArchived?[head()]:[]),...skel());return}
  const arch=S.showArchived,base=S.convs.filter(c=>(c.last||typeOf(c)!=='dm')&&!isRequest(c)&&!hiddenConv(c)),archived=base.filter(c=>isArchived(c.id));
  const pins=P().pinned;
  const items=(arch?archived:S.query?base:base.filter(c=>!isArchived(c.id)))
    .filter(c=>!S.query||(convTitle(c)+' '+(typeOf(c)==='dm'?dmPeer(c):'')).toLowerCase().includes(S.query.replace(/^@/,'')))
    .concat(kept.filter(m=>m.id)) // the kept rows of the chats not in yet, in the live rows' order: a row's time is its newest message's, as a send writes the chat's
    .sort((a,b)=>{const pa=arch?-1:pins.indexOf(a.id),pb=arch?-1:pins.indexOf(b.id);if(pa>=0||pb>=0)return (pa<0?1e9:pa)-(pb<0?1e9:pb);return (b.ts||0)-(a.ts||0)});
  const pvs=await Promise.all(items.map(c=>c.last?openPost(c,c.last):null));
  if(seq!==listSeq)return;
  box.replaceChildren();
  const reqs=arch?[]:pendingRequests(),invs=arch?[]:S.invites||[],rows=[];const wl=arch||S.query?[]:waitList();
  if(wl.length){const n=new Set(wl.flatMap(([,x])=>x.hs)).size,b=el('div','banner nudge wait-note');b.append(el('span',null,(n===1?'1 person is':n+' people are')+' waiting to join your channels')); // people an admin's page found waiting (noteWait): one notice, its sheet lists them by channel
    const go=el('button','link sm','Add');go.onclick=()=>openWaiting();b.append(go);box.append(b)}
  if((reqs.length||invs.length)&&!S.query){const m={k:'req',n:'Message requests',s:reqs.length?reqs.slice(0,3).map(c=>displayName(dmPeer(c))).join(', ')+' want'+(reqs.length===1?'s':'')+' to message you':invs.length===1?'1 invitation':invs.length+' invitations',u:reqs.length+invs.length};rows.push(m);const r=drawRow(m);r.onclick=openRequests;box.append(r);if(S.liveSum)S.liveSum.add('req')}else{const k=kept.find(x=>x.k==='req');if(k)box.append(tap(drawRow(k),k))} // this row and the archived one: the kept row until the live list has drawn its own once (its chats come one by one)
  if(arch)box.append(head());
  else if(!S.query&&archived.length){const m={k:'arch',n:'Archived chats',s:archived.slice(0,4).map(convTitle).join(', '),u:archived.reduce((a,c)=>a+(S.unread.get(c.id)||0),0)};rows.push(m);const r=drawRow(m);r.onclick=()=>{S.showArchived=true;setListTitle();renderList()};box.append(r);if(S.liveSum)S.liveSum.add('arch')}else{const k=kept.find(x=>x.k==='arch');if(k)box.append(tap(drawRow(k),k))}
  if(arch&&!S.convsLoaded&&!items.length&&!S.query){box.append(...skel());return} // the archived list while the live one comes: its chats may still be on their way
  if(!items.length&&!S.query&&!reqs.length&&!invs.length){const e=el('div','empty');
    if(arch)e.append(el('strong',null,'No archived chats'),el('span',null,'Press and hold a chat, then choose Archive.'));
    else e.append(el('strong',null,'No chats yet'),el('span',null,'Tap the pencil to message someone, start a group, or create a channel. Everything is encrypted on this device before it leaves.'));
    box.append(e)}
  const now=Date.now();
  if(S.query&&items.length)box.append(el('div','menu-label','Chats'));
  items.forEach((c,i)=>{if(kept.includes(c)){box.append(drawRow(c));return}const m=rowModel(c,pvs[i],now);rows.push(c.ttl||m.x?Object.assign({},m,{s:''}):m);box.append(drawRow(m,c))}); // a chat with a timer, or whose last message disappears, caches no text: it exists at rest nowhere else
  if(S.convsLoaded&&!arch&&!S.query&&S.tab==='chats'&&!S.call){if(!S.boot.live)S.boot.live=performance.now(); // the whole list as drawn, for the next start; not during a call: its row would come back as "In a call"
    const j=JSON.stringify(rows.slice(0,90));if(lastList.h!==S.me.handle||lastList.j!==j){lastList={h:S.me.handle,j};listOrder.h='';ls.set('hush:list:'+S.me.handle,JSON.parse(j))}}
  if(S.query)searchExtras(box,items);
}
/* ---------- one search box: chats, messages, people and public channels ----------
   Messages are searched from what this device has already unlocked (every chat's latest message, plus chats you've opened).
   That index lives only in memory: it's never saved, sent anywhere, and it's gone when the app closes.
   Public channels (release 111) are matched on this device against the server's listing of them (pubChans): what is typed is not sent for them. */
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
    .filter(([k,m])=>k.startsWith(pre)&&!(m.exp&&m.exp<=now)&&m.text&&m.text.toLowerCase().includes(q)&&!(m.from&&m.from!==S.me.handle&&isBlocked(m.from))&&convById(m.cid)&&!isRequest(convById(m.cid)))
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
  const chs=q.length<2?[]:pubChans().filter(c=>typeOf(c)==='channel'&&!S.convs.some(x=>x.id===c.id)&&(c.name+' '+(c.desc||'')).toLowerCase().includes(q)); // public channels that are not among my chats, by name or description: found here only, never listed unasked
  if(chs.length){box.append(el('div','menu-label','Public channels'));
    chs.forEach(c=>{const b=el('button','thread');const m=el('div','t-main');const nm=el('div','t-name');nm.innerHTML=I.megaSm;nm.append(c.name);
      m.append(nm,el('div','t-sub',c.desc||subsText(c)));b.append(convAvatar(c,'sm'),m);
      b.onclick=()=>{S.previews.set(c.id,c);openConv(c.id)};box.append(b)})}
  if(!items.length&&!hits.length&&!ppl.length&&!chs.length){const e=el('div','empty');
    e.append(el('strong',null,'Nothing found'),el('span',null,q.length<2?'Keep typing to search people by name or username.':'No chats, messages or people match that.'));box.append(e)}
  peopleLook(q);
}
function pubChans(){const h=S.me.handle,now=Date.now();let L=S._pubs; // the server's listing of public channels, for the search above: asked for once when a search begins and kept a minute, for this account alone, never once a key or once a drawing of the list; a request that fails is not sent again inside that minute
  if(!L||L.h!==h||Math.abs(now-L.at)>60000){L=S._pubs={h,at:now,rows:L&&L.h===h?L.rows:[]};
    if(S.db)S.db.collection('channels').where('visibility','==','public').limit(100).get().then(s=>{L.rows=s.docs.map(d=>chatRec(d.id,d.data()));if(S._pubs===L&&S.tab==='chats'&&S.query)renderList()}).catch(()=>{})}
  return L.rows}
function updateStatus(){const st=$('#netStatus');if(st)st.textContent=S.me&&!S.convsLoaded?'Connecting\u2026':!S.db?'Offline':''}
function setListTitle(){const t=$('#listTitle');if(t)t.textContent=S.tab==='calls'?'Calls':S.tab==='profile'?'Settings':S.showArchived?'Archived':'Chats';navSyncList()}
function updateTitle(){let n=0;S.unread.forEach((v,k)=>{const c=convById(k);if(k!==S.chan&&!isMuted(k)&&!isArchived(k)&&!(c&&isRequest(c))&&!hiddenConv(c))n+=v});if(S.me)n+=pendingRequests().length+(S.invites||[]).length;
  document.title=n?`(${n>99?'99+':n}) Hush`:'Hush';const t=$('#tabN');if(t){t.hidden=!n;t.textContent=n>99?'99+':String(n)}}
/* ---------- chat organization: pins, mutes and archive live in your encrypted vault ---------- */
const P=()=>S.prefs||(S.prefs={pinned:[],muted:{},archived:[]});
const isPinned=id=>P().pinned.includes(id),isMuted=id=>!!P().muted[id],isArchived=id=>P().archived.includes(id);
// Deleted for me, in the vault so it holds on all my devices: single messages by id, and a whole chat up to when it was cleared.
// shortcut: message times are the sender's clock, so a reply from a clock minutes behind can land before the clear and stay hidden.
const clearedAt=id=>(P().cleared||{})[id]||0,goneForMe=(cid,p)=>p.ts<=clearedAt(cid)||((P().hid||{})[cid]||[]).includes(p._id);
const clearedConv=c=>!!clearedAt(c.id)&&!(c.last&&c.last.ts>clearedAt(c.id)); // back in the list when a newer message arrives
function hideMsg(cid,id){if(!prefsOk())return;const h=P().hid||(P().hid={});h[cid]=[...(h[cid]||[]).filter(x=>x!==id),id].slice(-300);saveContacts();applyExpiry();renderConv()}
function clearForMe(c){if(!prefsOk())return;const p=P();(p.cleared||(p.cleared={}))[c.id]=Math.max(Date.now(),(c.last&&c.last.ts)||0);delete (p.hid||{})[c.id];
  p.pinned=p.pinned.filter(x=>x!==c.id);p.archived=p.archived.filter(x=>x!==c.id);if(typeOf(c)==='dm'&&!isSelf(c))revokeWake(dmPeer(c));saveContacts();if(S.chan===c.id)closeConv();renderList();updateTitle()}
function prefsOk(){if(!S.contactsReady){toastErr('Still loading your settings. Try again in a moment.');return false}return true}
function togglePin(id){if(!prefsOk())return;const p=P();p.pinned=isPinned(id)?p.pinned.filter(x=>x!==id):[id,...p.pinned];if(isPinned(id))p.archived=p.archived.filter(x=>x!==id);saveContacts()}
function toggleMute(id){if(!prefsOk())return;const p=P();if(p.muted[id])delete p.muted[id];else p.muted[id]=true;muteWake(convById(id),!!p.muted[id]);saveContacts();updateTitle();toast(isMuted(id)?'Muted. You won\u2019t get alerts from this chat.':'Unmuted')}
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
  items.push([I.trash,'Delete',()=>deleteMenu(anchor,chatDeletes(c)),'danger']);
  items.forEach(([ic,label,fn,cls])=>{const b=html('button','menu-item'+(cls?' '+cls:''),ic);b.append(el('span',null,label));b.onclick=()=>{m.remove();fn()};m.append(b)});
  placeMenu(m,anchor);
}
function deleteMenu(anchor,opts){ // "Delete for me" / "Delete for everyone": picking one is the confirmation
  closeMenus();const m=el('div','popmenu msgmenu');
  opts.forEach(([label,fn])=>{const b=html('button','menu-item danger',I.trash);b.append(el('span',null,label));b.onclick=()=>{m.remove();haptic(true);fn()};m.append(b)});
  placeMenu(m,anchor);
}
function reportMenu(anchor,c,p){ // picking a reason sends it: the server gets the chat, the message id and the reason, nothing else
  closeMenus();const m=el('div','popmenu msgmenu');m.append(el('div','menu-label','Report this message'));
  [['spam','Spam'],['abuse','Abuse'],['illegal','Illegal content'],['other','Other']].forEach(([r,label])=>{const b=html('button','menu-item',I.flag);b.append(el('span',null,label));
    b.onclick=async()=>{m.remove();try{await S.db.report(c.id,p._id,r);toast('Reported. Thanks.')}
      catch(e){const k=e&&e.code;toastErr(k==='denied'||k==='notfound'?'This can\u2019t be reported any more.':k==='ratelimit'?'Too many reports. Try again later.':'Couldn\u2019t send the report. Check your connection and try again.')}};m.append(b)});
  placeMenu(m,anchor);
}
// Deleting a whole chat. A DM: for me hides it; for everyone takes my messages from both sides (each person deletes only
// their own). A group or channel: for me leaves it (the owner, who can't leave, hides it); for everyone the owner deletes it
// and an admin deletes every message but the owner's, keeping the chat and its members.
function chatDeletes(c){
  const t=typeOf(c),noun=t==='channel'?'channel':'group',fail=()=>toastErr('That didn’t go through. Check your connection and try again.');
  const done=msg=>{S.previews.delete(c.id);if(S.chan===c.id)closeConv();toast(msg)};
  if(t==='dm')return [['Delete for me',()=>clearForMe(c)],['Delete for everyone',async()=>{
    if(!confirmDanger(isSelf(c)?'Delete all your saved messages?':'Delete all your messages in this chat for both of you? Their own messages stay with them.'))return;
    try{const bad=await wipeChat(c);clearForMe(c);if(bad)toastErr(`${bad} older message${bad===1?'':'s'} couldn’t be deleted.`)}catch{fail()}}]];
  const owner=isOwner(c),r=[['Delete for me',owner?()=>clearForMe(c):async()=>{
    if(!confirmDanger(`Leave “${c.name}”?`))return;try{await leaveChat(c.id);done(`You left the ${noun}`)}catch{fail()}}]];
  if(owner)r.push(['Delete for everyone',async()=>{if(!confirmDanger(`Delete “${c.name}” for everyone?`))return;
    try{await S.db.doc('channels/'+c.id).delete();done(`${noun[0].toUpperCase()+noun.slice(1)} deleted`)}catch{fail()}}]);
  else if(isAdmin(c))r.push(['Delete for everyone',async()=>{if(!confirmDanger(`Delete every message in “${c.name}” for everyone, except the owner’s? The ${noun} and its members stay.`))return;
    try{const bad=await wipeChat(c);if(bad)toastErr(`${bad} message${bad===1?'':'s'} couldn’t be deleted.`);else toast('Messages deleted')}catch{fail()}}]);
  return r;
}
// Deletes for everyone each message of a chat that I may (mayDeleteForAll): in a DM mine, in a group an admin's every one
// but the owner's. Service notes stay: they carry joins and leaves. Returns how many the server refused.
// shortcut: pages by time, so messages sharing a page's oldest millisecond can be skipped; run it again to catch them.
async function wipeChat(c){
  const t=typeOf(c),admin=isAdmin(c),owner=isOwner(c),col=S.db.collection(`channels/${c.id}/posts`),gone=new Set();let before=null,keep=null,bad=0;
  for(;;){const s=await (before==null?col:col.where('ts','<',before)).orderBy('ts','desc').limit(200).get();if(!s.docs.length)break;
    const ps=await unsealAll(c,s.docs.map(d=>Object.assign({_id:d.id},d.data())));before=Math.min(...ps.map(p=>p.ts));
    for(const p of ps){
      if(p.sv===1||p.svc||!mayDeleteForAll({t,mine:p.from===S.me.handle,admin,owner,byOwner:!!c.owner&&p.from===c.owner})){if(!p.sv&&!p.svc&&!p.del&&!keep)keep=p;continue} // sv: the server's mark, so a note this device can't read stays too
      openPost(c,p).then(o=>{for(const m of o.media||[])dropMedia(c.id,m.id)}).catch(()=>{}); // its files go too
      try{await S.db.doc(`channels/${c.id}/posts/${p._id}`).delete(p.sl===1&&p.from===S.me.handle?{ot:await ownTokFor(c.id,p)}:undefined);gone.add(p._id)}catch{bad++}}
    if(s.docs.length<200)break}
  await S.db.doc('channels/'+c.id).update(lastUpd(c,{last:keep?lastOf(keep):null,pins:(c.pins||[]).filter(id=>!gone.has(id))}));
  return bad;
}
// grab: an element that dips under the finger when the hold completes (messages), with the haptic tap; then fn.
function addLongPress(node,fn,grab){
  let t=null,x=0,y=0,touching=false,fired=false;const clr=()=>{if(t){clearTimeout(t);t=null}};
  node.addEventListener('touchstart',e=>{if(e.touches.length!==1)return;touching=true;fired=false;x=e.touches[0].clientX;y=e.touches[0].clientY;clr();
    t=setTimeout(()=>{t=null;fired=true;node._noClick=Date.now();haptic();if(!grab){fn();return}
      grab.classList.remove('grab');void grab.offsetWidth;grab.classList.add('grab');setTimeout(fn,150);setTimeout(()=>grab.classList.remove('grab'),400)},480)},{passive:true});
  node.addEventListener('touchmove',e=>{if(Math.abs(e.touches[0].clientX-x)>8||Math.abs(e.touches[0].clientY-y)>8)clr()},{passive:true});
  const up=()=>{clr();touching=false;if(fired)node._noClick=Date.now()}; // the tap a browser may send when the finger lifts after a hold does nothing
  node.addEventListener('touchend',up);node.addEventListener('touchcancel',up);
  // A mouse's right click opens it at once; the one Android sends during a hold is the hold itself, already handled
  node.addEventListener('contextmenu',e=>{e.preventDefault();if(touching||Date.now()-(node._noClick||0)<1000)return;clr();fn()});
}
function addSwipe(node,{dir,max=80,threshold=55,on,target,when}){
  let x0=0,y0=0,dx=0,active=false,lock=null;const tg=target||node;
  node.addEventListener('touchstart',e=>{if(e.touches.length!==1||(when&&!when(e)))return;x0=e.touches[0].clientX;y0=e.touches[0].clientY;dx=0;active=true;lock=null;tg.style.transition='none'},{passive:true});
  node.addEventListener('touchmove',e=>{if(!active)return;const mx=e.touches[0].clientX-x0,my=e.touches[0].clientY-y0;
    if(lock===null){if(Math.abs(mx)<10&&Math.abs(my)<10)return;lock=Math.abs(mx)>Math.abs(my)*1.5&&Math.sign(mx)===dir?'x':'y';if(lock==='x')node._noClick=Date.now()}
    if(lock!=='x')return;dx=Math.max(0,Math.min(max,mx*dir));tg.style.transform=`translateX(${dx*dir}px)`;tg.classList.toggle('swipe-ready',dx>=threshold)},{passive:true});
  const end=()=>{if(!active)return;active=false;tg.style.transition='transform .2s ease';tg.style.transform='';tg.classList.remove('swipe-ready');
    if(lock==='x'){node._noClick=Date.now();if(dx>=threshold){haptic();on()}}};
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
  const {s,inp}=searchBox('Search chats');const list=el('div');body.append(s,list);
  const draw=()=>{const q=inp.value.trim().toLowerCase();list.replaceChildren();const me=S.me.handle;
    const tgs=[{title:'Saved Messages',av:()=>html('div','avatar sm saved',I.bookmark),id:()=>ensureDmPreview(me)}];
    S.convs.filter(c=>canPost(c)&&!isSelf(c)).sort((a,b)=>(b.ts||0)-(a.ts||0)).forEach(c=>tgs.push({title:convTitle(c),h:typeOf(c)==='dm'?dmPeer(c):'',av:()=>convAvatar(c,'sm'),id:()=>c.id}));
    tgs.filter(t=>!q||t.title.toLowerCase().includes(q)).forEach(t=>{const b=el('button','thread');const m=el('div','t-main');m.append(withBadge(el('div','t-name',t.title),t.h||''));
      b.append(t.av(),m);b.onclick=()=>{close();const id=t.id();if(!id){toastErr('That chat isn’t ready yet. Try again in a moment.');return}forwardTo(id,p,o,src,t.title)};list.append(b)});
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
        await S.db.copyMedia(src.id,m.id,target.id,mid,exp,await ownHash(await mediaTok(target.id,mid)));media.push(Object.assign({},m,{id:mid}));continue} // the copy is the forwarder's file
      await loadMedia(src,m,p.e??0); // sent before stage 6, under the old chat's key: encrypt it afresh
      media.push(await uploadMedia(target,{kind:m.kind,mime:m.mime,src:S.mediaBlobs.get(m.id),w:m.w,h:m.h,dur:m.dur,wave:m.wave,name:m.name},()=>{},exp))}
    const fwd=o.fwd||(typeOf(src)==='channel'?{name:src.name}:{name:(S.dir[p.from]&&S.dir[p.from].name)||p.from});
    await sendBody(tid,buildBody({text:o.text,media,fwd}));
    toast('Forwarded to '+title,'Open',()=>openConv(tid));
  }catch{toastErr('Couldn\u2019t forward that. Check your connection and try again.')}
}
const TTLS=[[0,'Off'],[300,'5 minutes'],[3600,'1 hour'],[86400,'1 day'],[604800,'1 week']];
const ttlLabel=v=>(TTLS.find(x=>x[0]===v)||[0,Math.round(v/60)+' minutes'])[1];
const lifeLabel=ms=>{const s=Math.round(ms/1000),[n,u]=[[31536000,'year'],[604800,'week'],[86400,'day'],[3600,'hour'],[60,'minute']].find(x=>s>=x[0])||[1,'second'],k=Math.round(s/n);return k+' '+u+(k===1?'':'s')};
const lifeMark=(p,ttl)=>!ttl?null:!p.exp?'never':p.exp-p.ts>ttl+60e3?lifeLabel(p.exp-p.ts):null; // the label beside a message's timer mark while the chat has a timer: a message that never ends, or outlives the timer by over a minute
// The message timer as last seen per chat, in the sealed store (hush:ttlSeen:<handle>, SPEC.md 5.7 and 12.2): either side of a
// DM may move the timer and only a stock page announces it, so a record whose ttl moved with no service note of the new value
// from whoever moved it is pointed out in the chat. The first sighting of a chat records its timer and says nothing.
const ttlSeenKey=()=>'hush:ttlSeen:'+S.me.handle;
function noteTtl(c){const seen=ls.get(ttlSeenKey(),{}),cur=c.ttl||0,was=seen[c.id];
  if(was===undefined)seen[c.id]={v:cur};
  else if((was.v||0)!==cur){const m=S.ttlMine;seen[c.id]=m&&m.cid===c.id&&m.v===cur&&Date.now()-m.at<60e3?{v:cur}:{v:cur,un:1}} // my own change announces itself a moment later
  else return;ls.set(ttlSeenKey(),seen)}
function ttlChip(c,posts){const seen=ls.get(ttlSeenKey(),{}),e=seen[c.id];if(!e||!e.un)return null;
  const last=posts.filter(p=>p.svc==='ttl').pop();if(last&&(last.v||0)===(c.ttl||0)){delete e.un;ls.set(ttlSeenKey(),seen);return null} // announced after all
  return c.ttl?`Message timer changed to ${ttlLabel(c.ttl).toLowerCase()} by the other side`:'Message timer turned off by the other side'}
function openTtl(cid){
  const c=convById(cid);if(!c)return;
  const {body,close}=sheet('Disappearing messages');
  body.append(el('p',null,'New messages in this chat delete themselves for everyone after the time you choose. Messages already sent aren\u2019t affected.'));
  TTLS.forEach(([v,l])=>{const b=el('button','menu-item flush opt');b.append(el('span',null,l));
    if((c.ttl||0)===v)b.insertAdjacentHTML('beforeend',`<span class="check">${I.tick}</span>`);
    b.onclick=async()=>{close();if((c.ttl||0)===v)return;
      try{S.ttlMine={cid,v,at:Date.now()};await ensureDmDoc(c);await S.db.doc('channels/'+cid).update({ttl:v});
        await S.db.collection(`channels/${cid}/posts`).add(await sealSvc(c,'ttl',v));
        toast(v?'New messages will disappear after '+l.toLowerCase():'Disappearing messages are off')}
      catch{toastErr('That didn\u2019t go through. Check your connection and try again.')}};
    body.append(b)});
  body.append(el('p','hint','People can still take a screenshot or copy a message before it disappears.'));
}
function allPosts(){const m=new Map();(S.older||[]).forEach(p=>m.set(p._id,p));(S.rawPosts||[]).forEach(p=>m.set(p._id,p));return [...m.values()].filter(p=>!p.del).sort((a,b)=>a.ts-b.ts)}
function applyExpiry(){
  const now=Date.now(),c=curConv(),live=[],dead=[],sched=[],future=[];
  allPosts().forEach(p=>{if(p._hide||(c&&goneForMe(c.id,p))||(p.from&&p.from!==S.me.handle&&isBlocked(p.from)))return;/* someone I blocked: not shown */if(p.exp&&p.exp<=now)dead.push(p);else if(p.ts>now+3000){future.push(p);if(p.from===S.me.handle&&!p.svc)sched.push(p)}else live.push(p)});
  S.posts=live;S.scheduled=sched;S.future=future;if(S.setSchedCount)S.setSchedCount(sched.length);
  if(c&&isMember(c)){dead.forEach(p=>{if(S.purged.has(p._id))return;S.purged.add(p._id);purgePost(c,p)});promoteLast(c,live)}
}
function promoteLast(c,live,now){ // a scheduled message becomes the chat's latest once its time arrives
  const l=[...live].reverse().find(x=>!x.svc),cur=convById(c.id);if(!l||!cur||!S.convs.some(x=>x.id===c.id))return;
  if(cur.last&&l.ts<=cur.last.ts)return;if(S.promoting===l._id)return;
  if(!now)return paced('last',()=>{if(S.chan===c.id)promoteLast(c,S.posts,1)}); // one such write a second (paced): asked again when its turn comes, with what is true by then, so a marker that waited never goes over a newer one
  S.promoting=l._id;
  S.db.doc('channels/'+c.id).update(lastUpd(c,{ts:l.ts,last:lastOf(l)})).catch(()=>{});
}
async function loadOlder(){
  const c=curConv();if(!c||!S.db||S.loadingOlder||S.allLoaded)return;const oldest=allPosts()[0];if(!oldest){S.allLoaded=true;return}
  S.loadingOlder=true;const chip=document.querySelector('.older-chip');if(chip)chip.textContent='Loading earlier messages\u2026';
  try{const s=await S.db.collection(`channels/${c.id}/posts`).where('ts','<',oldest.ts).orderBy('ts','desc').limit(200).get();
    if(S.chan!==c.id)return;const docs=await unsealAll(c,s.docs.map(d=>Object.assign({_id:d.id},d.data())));if(S.chan!==c.id)return;if(docs.length<200)S.allLoaded=true;
    const box=$('#msgs');if(box)S.keepScroll={h:box.scrollHeight,top:box.scrollTop};
    S.older=[...docs.reverse(),...(S.older||[])];applyExpiry();await renderConv();
  }catch{toastErr('Couldn\u2019t load earlier messages. Check your connection.')}
  S.loadingOlder=false;
}
// Deletes one file's pieces as its owner (release 81): the media token lets a member remove the files of their own messages and
// an admin anyone's; a file sealed before a key change answers to the old secret, so that is tried once. A refusal is not an
// error here: the pieces fall to the chat's allowance or the server's sweep.
async function dropMedia(cid,mid){
  try{return await S.db.deleteMedia(cid,mid,await mediaTok(cid,mid))}
  catch(e){const p=S.me&&S.me.prev;if(!(e&&e.code==='denied'&&p&&p.own))return 0;
    return S.db.deleteMedia(cid,mid,await mediaTokAs({own:p.own,sigPriv:p.sigPriv},cid,mid)).catch(()=>0)}}
async function purgePost(c,p){ // whoever sees an expired message first deletes it, including its encrypted files
  try{const o=await openPost(c,p);
    for(const m of o.media||[])await dropMedia(c.id,m.id); // a refused piece delete is not a failure of the purge: the expired post still goes, the pieces expire on the server's sweep
    await S.db.doc(`channels/${c.id}/posts/${p._id}`).delete();
    const cur=convById(c.id);if(cur&&cur.last&&cur.last.sig===p.sig){const l=[...S.posts].reverse().find(x=>!x.svc);
      await S.db.doc('channels/'+c.id).update(lastUpd(c,{last:l?lastOf(l):null}))}
  }catch{}
}
async function computeUnread(){
  if(!S.db||!S.me)return;const now=Date.now(),R=S.unreadRedo||(S.unreadRedo={ids:new Set(),wait:0,t:null,busy:new Set(),again:new Set()});let failed=false;
  await Promise.all(S.convs.map(async c=>{
    const lr=lastRead(c.id),l=c.last;
    if(!l||l.from===S.me.handle||l.ts<=lr||c.id===S.chan){S.unread.set(c.id,0);S.mentions.set(c.id,0);return}
    const k=c.id+':'+l.ts+':'+lr;if(S.unreadKey.get(c.id)===k)return;
    if(R.busy.has(c.id)){R.again.add(c.id);return} // one count a chat, waiting or on its way: a chat written to faster than it can be counted is counted again once this one is back
    S.unreadKey.set(c.id,k);R.busy.add(c.id);
    try{const s=await S.db.collection(`channels/${c.id}/posts`).where('ts','>',lr).limit(100).get();
      const ds=(await unsealAll(c,s.docs.map(d=>Object.assign({_id:d.id},d.data())))).filter(d=>d.from!==S.me.handle&&!(d.from&&isBlocked(d.from))&&!d.svc&&!d.del&&d.ts<=now+3000&&!(d.exp&&d.exp<=now));
      const os=await Promise.all(ds.map(d=>openPost(c,d)));noteCalls(c,ds,os);
      if(c.id===S.chan||lastRead(c.id)!==lr){S.unreadKey.delete(c.id);return} // opened or read while it waited its turn: this count is stale (its calls are noted all the same), and it does not stand for the chat: left unread, the chat is counted again
      S.unread.set(c.id,os.filter(o=>!o.wake).length);let men=0; // a wake ticket is not a message
      if(typeOf(c)==='group')for(const o of os){if(o.text&&mentionsMe(o.text))men++}
      S.mentions.set(c.id,men)}
    catch(e){if(!['ratelimit','timeout','offline'].includes(e&&e.code)){S.unread.set(c.id,1);return}R.ids.add(c.id);failed=true} // refused for the allowance, late or no connection: asked again below, never shown as 1
    finally{R.busy.delete(c.id);if(R.again.delete(c.id))setTimeout(computeUnread,0)}
  }));
  if(failed&&!R.t){R.wait=Math.min((R.wait||1000)*2,60000);R.t=setTimeout(()=>{R.t=null;for(const id of R.ids)S.unreadKey.delete(id);R.ids.clear();computeUnread()},R.wait)} // one timer for all of them; the wait doubles once per wait, 2 s to a minute
  else if(!failed&&!R.ids.size)R.wait=0;
  renderList();updateTitle();
}
async function notifyNew(c){
  if(hiddenConv(c))return;
  const pv=await openPost(c,c.last);if(pv.text==null||hiddenPost(c.last,pv)||isBlocked(c.last.from||pv.from))return;
  const men=typeOf(c)==='group'&&mentionsMe(pv.text);if(isMuted(c.id)&&!men)return;
  document.querySelectorAll('.inbanner').forEach(x=>x.remove());
  const b=el('button','inbanner');const m=el('div','t-main');
  const who=typeOf(c)==='group'?displayName(c.last.from)+(men?' mentioned you: ':': '):'';
  m.append(titleNode('div','t-name',c),el('div','t-sub',ls.get('hush:hideBannerText',false)?'New message':who+previewText(pv)));
  b.append(convAvatar(c,'sm'),m);b.onclick=()=>{b.remove();const k=S.call;if(k&&!k.mini&&k.state!=='ringing'){k.mini=true;callUi()}openConv(c.id)};
  document.body.append(b);setTimeout(()=>b.remove(),4500);
}
/* ===== HUSH UPDATE BEGIN ===== */
// An open page keeps running the files it loaded, even after the server is updated. index.html names every file it loads
// with a version (?v=<hash>), so a page that finds the served index.html naming other versions than its own is out of
// date. It says so, and reloads by itself when the person comes back to it, unless something is half typed.
const PINNED=/(app\/[a-z]+\.(?:js|css))\?v=([0-9a-f]{12})/g;
function pinsOf(text){const m={};let x;PINNED.lastIndex=0;while((x=PINNED.exec(String(text||''))))m[x[1]]=x[2];return m}
function outOfDate(loaded,served){const k=Object.keys(served);return k.length>0&&k.some(f=>loaded[f]!==served[f])}
let updateChecking=false;
async function checkForUpdate(){
  if(updateChecking||S.stale)return;updateChecking=true;
  try{const loaded=pinsOf([...document.querySelectorAll('script[src],link[rel="stylesheet"][href]')].map(e=>e.getAttribute('src')||e.getAttribute('href')).join('\n'));
    const r=await fetch(location.pathname||'/',{cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
    if(r.ok&&outOfDate(loaded,pinsOf(await r.text()))){S.stale=true;renderBanner();if(document.hidden)reloadIfIdle()}}
  catch{}finally{updateChecking=false}
}
function reloadIfIdle(){
  if(!S.stale||!S.me||S.pushCall)return; // not while the page is up for a pushed call: a reload of its own takes no foreground time from iOS and can freeze mid-load in the background
  const a=document.activeElement,typing=a&&(a.isContentEditable||/^(INPUT|TEXTAREA)$/.test(a.tagName))&&String(a.value!==undefined?a.value:a.textContent).trim();
  if(!typing&&!document.querySelector('.backdrop'))location.reload();
}
function storeRetry(){ // this device's copy did not open (its key store did not answer: unlockStore): nothing is changed, and a reload tries again
  const {body}=sheet('Couldn’t open your data',{locked:true});const b=el('button','primary','Try again');b.style.width='100%';b.onclick=()=>location.reload();
  body.append(el('p',null,'This phone’s copy of your account didn’t open. Nothing was changed. Close Hush and open it again, or tap Try again.'),b);splashOff('retry')}
document.addEventListener('visibilitychange',()=>{if(document.hidden)return;if(S.stale)reloadIfIdle();else checkForUpdate()});
setInterval(()=>{if(!document.hidden)checkForUpdate()},10*60e3);
/* ===== HUSH UPDATE END ===== */
function renderBanner(){
  const b=$('#banner');b.replaceChildren();
  if(!S.db)b.append(el('div','banner',SRV_ERR||'Connecting to Hush\u2026'));
  else if(!S.db.online)b.append(el('div','banner',SRV_ERR||srvDown(S.db.addr)));
  else if(S.stale){const n=el('div','banner nudge');n.append(el('span',null,'Hush was updated.'));const go=el('button','link sm','Reload');go.onclick=()=>location.reload();n.append(go);b.append(n)}
  else if(S.me&&!hasRecovery(S.me.handle)){ // stays until recovery words are set up; no close button on purpose
    if(!S.contactsReady||S.tab==='profile')return; // wait for the vault (another device may have set them up already)
    const n=html('button','setup-bar','<span class="sb-ic">'+I.key+'</span>');
    const t=el('span','sb-txt');t.append(el('span','sb-t','Finish setting up your account'),el('span','sb-s','Save your recovery words so you can always get back in.'));
    n.append(t);n.insertAdjacentHTML('beforeend','<span class="chev">\u203a</span>');n.onclick=()=>openBackup();b.append(n)}
  else if(natOld('calls')){ // an app build too old for calls: stays until the app is updated; no close button on purpose; after the recovery words, which protect the account itself (the call refusal has its own toast, and the caller is told)
    const n=html('button','setup-bar','<span class="sb-ic">'+I.phone+'</span>');
    const t=el('span','sb-txt');t.append(el('span','sb-t','Update Hush to keep making calls'),el('span','sb-s','This version of the app is too old for calls. Tap to update.'));
    n.append(t);n.insertAdjacentHTML('beforeend','<span class="chev">›</span>');n.onclick=()=>{window.open(UPDATE_URL,'_blank','noopener')};b.append(n)} // a new window: the app hands a foreign address to the system and this page stays as it is
  else if(S.me&&recOld(S.me.handle)&&!ls.get('hush:recOldOff:'+S.me.handle,false)){ // older 6-word set: a gentle, dismissable nudge (Settings keeps offering it)
    const n=el('div','banner nudge');n.append(el('span',null,'Your recovery words are an older, shorter kind. Make new, stronger ones.'));
    const go=el('button','link sm','Make new');go.onclick=()=>openBackup();const x=html('button','icon-btn sm-x',I.xs);x.setAttribute('aria-label','Dismiss');
    x.onclick=()=>{ls.set('hush:recOldOff:'+S.me.handle,true);renderBanner()};n.append(go,x);b.append(n)}
  else if(S.me&&!loginInfo(S.me.handle)&&!ls.get('hush:backedUp:'+S.me.handle,0)&&!ls.get('hush:nudgeOff:'+S.me.handle,false)){
    const n=el('div','banner nudge');n.append(el('span',null,'Add a password so you can log in on other devices.'));
    const go=el('button','link sm','Add');go.onclick=()=>openSetupLogin();const x=html('button','icon-btn sm-x',I.xs);x.setAttribute('aria-label','Dismiss');
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
/* The highest power tier this person has held: none (''), admin, owner. Kept in the encrypted vault, so the server never
   sees it. When it climbs past the best so far, 'hush:tier-up' fires on window with {tier}: the hook for the upgrade
   card. The first time a device of an account from before this sees a role, it records it without firing. */
const TIERS=['','admin','owner'];let tierQueued=null;
function noteTier(t){
  if(!S.me)return;
  if(!S.contactsReady){if(!tierQueued||tierQueued.h!==S.me.handle||TIERS.indexOf(t)>TIERS.indexOf(tierQueued.t))tierQueued={h:S.me.handle,t};return}
  const p=P(),was=p.tier;if(was!==undefined&&TIERS.indexOf(t)<=TIERS.indexOf(was))return;
  p.tier=t;saveContacts();if(was!==undefined)window.dispatchEvent(new CustomEvent('hush:tier-up',{detail:{tier:t}}));
}
const ownerCapOld=async cid=>S.me.prev&&S.me.prev.own?b64u(await hkdf(ownIkm(S.me.prev),'hush-cap-v1','owner|'+cid)):null; // the owner key the account's previous secret gave (release 21)
async function capsFor(cid){ // the keys this device holds for a chat, best first, for the connector to open it with
  let c=S.chatDocs.get(cid);
  if(!c){const s=await S.db.preview(cid);if(!s.exists)return null;c=chatRec(cid,s.data());S.chatDocs.set(cid,c)}
  if(typeOf(c)==='dm'){const e=epochOf(c);return [e>0&&await memberCap(c,e),await memberCap(c,0),await dmBaseCapOld(c)].filter(Boolean)} // the base key always lets you back in to heal; after a key change the one from before is tried too
  const shown=await showMeta(c),me=S.me.handle;
  // Named owner only by meta (any admin may rewrite it): the owner key once this connection holds the chat (not counted then)
  const unsure=c.visibility!=='public'&&!shown._ometa&&!(S.db.chatLevel(cid)&&!notOwner(cid));
  if(shown.owner===me&&unsure)ownTried.delete(cid);
  if(shown.owner===me&&!unsure){noteTier('owner');if(c.visibility!=='public'&&!shown._ometa)ownTried.add(cid);const caps=[await ownerCap(cid),await ownerCapOld(cid)].filter(Boolean);if(S.rekeying)caps.reverse(); // the server knows the old owner key until this device replaces it (rekeyRun): while that runs it is tried first, so no open fails
    const a=await adminSecret(c).catch(()=>null);return [...caps,a?await adminCapFrom(cid,a):null,await memberCap(c,epochOf(c))].filter(Boolean)} // then the admin and member keys: a chat whose owner key is no longer mine still opens to read
  if((shown.admins||[]).includes(me))noteTier('admin');
  // Only the owner and admins hold the admin secret. Where nothing only the owner writes names the owner and admins (a
  // preview, a group from before ometa, an ometa this device can't open), it is tried before the member key, so a blocked
  // or keyless owner or admin still opens; once this connection holds the chat the owner key is tried too (not counted
  // as a wrong key then), and the whole record opens it again (noteChatDoc).
  const known=c.visibility==='public'||!!shown._ometa;
  const a=!known||(shown.admins||[]).includes(me)?await adminSecret(c).catch(()=>null):null;
  const own=a&&!known&&S.db.chatLevel(cid)&&!notOwner(cid)?await ownerCap(cid):null;if(own)ownTried.add(cid);else ownTried.delete(cid);
  if(a)return [own,await adminCapFrom(cid,a),await memberCap(c,epochOf(c))].filter(Boolean);
  return memberCap(c,epochOf(c));
}
function noteChatDoc(c){ // remember the server's copy; a new epoch or new admin keys mean the connector should open the chat again
  const prev=S.chatDocs.get(c.id);S.chatDocs.set(c.id,c);
  if(!prev||!S.db||!S.db.refreshChat)return;
  if((prev.epoch||0)!==(c.epoch||0)||JSON.stringify(prev.akeys||{})!==JSON.stringify(c.akeys||{}))S.db.refreshChat(c.id).catch(()=>{});
  // so does the first whole record after a preview (it names no owner), where opening again can climb
  else if(!prev.meta&&!prev.ometa&&(c.meta||c.ometa))showMeta(c).then(async s=>{if(s.owner===S.me.handle||c.visibility!=='public'&&!s._ometa&&!notOwner(c.id)&&await adminSecret(c))await climb(c)}).catch(()=>{});
}
async function onChatEvicted(cid){ // the server took our level away (a rotation, or we were removed): fetch the new record before trying again
  try{const s=await S.db.preview(cid);if(s.exists)S.chatDocs.set(cid,chatRec(cid,s.data()));else S.chatDocs.delete(cid)}catch{}
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
async function rotateTo(c,v,extra,opts){ // a fresh chat key for everyone in `v.members`, plus a fresh sealed description; returns the new epoch. opts.noLoad: the profiles were fetched a moment ago
  v=Object.assign({},v,{members:(v.members||[]).filter(h=>h===S.me.handle||!(v.banned||[]).includes(h))});if(typeOf(c)!=='dm'&&!v.members.includes(S.me.handle))throw new Error('notmember'); // never a wrap for someone blocked; a list that leaves me out is stale or forged: never hand the chat to it
  // A private channel's member cards (SPEC.md 5.6): leavers go with every key change; link joiners come in only with
  // opts.joins (a leave-only batch), never with a removal, a lost device or a leaked link
  const ch=typeOf(c)==='channel'&&c.visibility!=='public',lv=ch&&!!extra&&extra.why==='leave';
  if(lv&&(leaveWait.get(c.id)||0)>Date.now())throw Object.assign(new Error('ratelimit'),{code:'ratelimit'}); // the server refused one a moment ago: the cards wait, and nothing is wrapped meanwhile
  if(ch){await rolesQ.get(c.id);const r=rolesOf(c.id);if(r&&r.o&&r.o!==S.me.handle&&(!r.s||!(r.a||[]).includes(S.me.handle)))throw new Error('badkey')} // named neither owner nor admin by this device's signed roles record, or the record is unsigned (it counts no admin: owner decision D1): every member would refuse this key's commit (SPEC.md 5.6 "Key chain")
  // A channel's key chain (SPEC.md 5.6): the key before, sealed under the new one, and the signed commit, going public to
  // private too; in a private channel only once that key's own commit checks out (sealKey), so a planted key is neither
  // chained nor its member list wrapped for; without the key before there is no row, and a chained channel then answers conflict
  const old=typeOf(c)==='channel'?await (ch?sealKey:convKey)(c,epochOf(c)):null;
  const roll=ch?((opts&&opts.roll)||await readRoll(c,v)):null; // a read that fails (the cards, or whose slot each sits in) fails the key change: a new key is never wrapped for whoever left because the cards could not be read
  if(roll){const out=new Set(roll.leave.map(x=>x.f).filter(h=>h!==S.me.handle));
    v.members=[...new Set([...v.members,...(opts&&opts.joins?roll.join.map(x=>x.f):[])])].filter(h=>!out.has(h)&&(h===S.me.handle||!(v.banned||[]).includes(h)));v.admins=(v.admins||[]).filter(h=>!out.has(h))}
  const e=epochOf(c)+1,raw=crypto.getRandomValues(new Uint8Array(32));if(!(opts&&opts.noLoad))await loadDir(v.members,true); // fresh profiles before wrapping for everyone
  const keys=await wrapAll(raw,v.members,c.id,e),meta=typeOf(c)==='dm'?undefined:await sealMeta(c.id,e,raw,v);
  const back=old&&old.raw?await chainRow(c.id,e,raw,old.raw):null,cap=await memberCapFrom(c.id,e,raw);
  // opts.carry (a leave's key change, rollRun): the open links whose `as` this admin opens go on, sealed for the new key (carryLinks);
  // one revoked meanwhile makes the server answer invalid: once more from a fresh record, then with none
  let inv=ch&&opts&&opts.carry?await carryLinks(c,e,raw):{};
  try{for(let n=0;;n++)try{await S.db.rotateChat(c.id,Object.assign({epoch:e,keys,cap},meta?{meta}:{},back?{back}:{},Object.keys(inv).length?{invites:inv}:{},extra||{}));break}
    catch(err){if(!Object.keys(inv).length||!err||err.code!=='invalid')throw err;inv=n?{}:await carryLinks(await freshChan(c.id),e,raw)}}
  catch(err){if(lv&&err&&err.code==='ratelimit'&&/try again later/.test(err.message||''))leaveWait.set(c.id,Date.now()+15*60e3);throw err} // 15 minutes, as the server's own gap, only for its own answer ('try again later'); any other rate limit (the connection's own, 'slow down', or a chat.open it sent first refused or timed out, 'the chat could not be opened') is over in a moment: no wait
  ksPut(c.id,e,b64(raw));if(!Object.keys(inv).length||!inv[(ls.get('hush:inv:'+c.id,null)||{}).iid])ls.set('hush:inv:'+c.id,null);if(back)noteChained(c.id); // the link this device shows stays only when it was carried; the row went with the key change
  if(typeOf(c)==='channel')keyMade(c.id,e,raw);
  if(roll){const ka=levelHere(c)==='owner'&&(rolesOf(c.id)||{}).s?[]:(rolesOf(c.id)||{}).a||[];for(const x of [...roll.leave.filter(x=>!ka.includes(x.f)),...roll.dev])delCard(c.id,x.id); // applied; best effort: a card left behind names someone no longer listed, or fails the dk rule; an admin's leave card stays for the owner's page, which drops them (rollRun), and on her own page while her record is unsigned, where it drops none (owner decision D1): the card waits for her save, else that save would sign them in again
    if(roll.dev.length){const m=ls.get(rolesKey(),{}),r=m[c.id]=m[c.id]||{};r.dk=Object.assign({},r.dk);for(const x of roll.dev)r.dk[x.f]=(S.dir[x.f]&&S.dir[x.f].kv)||1;ls.set(rolesKey(),m)}}
  for(const x of [c,convById(c.id),S.chatDocs.get(c.id)])if(x){x.epoch=e;x.keys=Object.assign({},x.keys,{[e]:keys});if(meta)x.meta=meta}
  if(ch)recount(c); // the list went out with the key change: its count follows (recount)
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
async function resendKeys(cid,h){ // an admin hands a member every chat key again (a channel's current one, handRaws), wrapped to the devices on their profile today
  const c=S.chatDocs.get(cid)||await freshChan(cid);await loadDir([h],true);
  const raws=await handRaws(c),keys={};for(const [e,r] of Object.entries(raws))keys[e]=await wrapKey(unb64(r),h,cid,Number(e));
  await S.db.doc('channels/'+cid).update({keys});
}
async function allRaws(c){const out={};for(const e of epochsOf(c)){const k=await convKey(c,e);if(k)out[e]=b64(k.raw)}return out}
const hiddenPost=(p,o)=>!!(o&&(o.wake||(p&&p.sl===1&&o.text!=null&&!o.verified))); // a sealed message whose hidden signature doesn't check out is never shown under anyone's name; a wake ticket is never shown at all
async function removeOwn(cid,p){ // delete your own sealed message: prove it's yours, wipe it, then remove it
  const k=p.on||0,ref=S.db.doc(`channels/${cid}/posts/${p._id}`);
  await ref.update({del:true,n:'',d:'',oh:'',on:k+1,ot:await ownTokFor(cid,p)});
  await ref.delete();
}
function openPost(c,p,kind){
  if(p.svc)return Promise.resolve({svc:true,text:null,media:[]});
  const key=(kind==='comment'?'cm:':'p:')+S.me.handle+':'+c.id+':'+p.sig;
  if(!S.cache.has(key))S.cache.set(key,(async()=>{
    let text=null,verified=false,media=[],poll=null,reply=null,fwd=null,on=null,call=null,wake=null;const ck=await convKey(c,p.e??0),nokey=!ck&&(typeOf(c)!=='dm'||(p.e??0)>0);
    if(ck){try{text=dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(p.iv)},ck.key,unb64(p.ct)))}catch{}}
    if(text&&text[0]==='\u0001'){try{const o=JSON.parse(text.slice(1));text=String(o.text||'');
      poll=o.poll&&typeof o.poll.q==='string'&&Array.isArray(o.poll.opts)&&o.poll.opts.length>=2?{q:o.poll.q.slice(0,300),opts:o.poll.opts.slice(0,10).map(x=>String(x).slice(0,100)),multi:!!o.poll.multi}:null;
      media=Array.isArray(o.media)?o.media.slice(0,MAX_FILES).filter(m=>m&&typeof m.id==='string'&&/^[a-zA-Z0-9]+$/.test(m.id)&&['image','gif','video','voice','file'].includes(m.kind)&&(m.v!==2||typeof m.k==='string'))
        .map(m=>Object.assign({},m,{wave:Array.isArray(m.wave)?m.wave.slice(0,64).map(v=>Math.max(1,Math.min(31,v|0))):null,name:m.kind==='file'?cleanName(m.name):undefined,mime:String(m.mime||'')})):[];
      reply=o.reply&&typeof o.reply.id==='string'&&/^[A-Za-z0-9_-]+$/.test(o.reply.id)?{id:o.reply.id,from:String(o.reply.from||''),snip:String(o.reply.snip||'').slice(0,100)}:null;
      fwd=o.fwd&&typeof o.fwd.name==='string'?{name:o.fwd.name.slice(0,60)}:null;
      on=typeof o.on==='string'&&/^[A-Za-z0-9_-]+$/.test(o.on)?o.on:null;
      if(o.call){const peer=dmPeer(c);call=callOf(o.call,kind!=='comment'&&typeOf(c)==='dm'&&!isSelf(c)&&(p.from===S.me.handle||p.from===peer),p.from===S.me.handle,peer);text='';media=[];poll=reply=fwd=on=null} // a call entry is that and nothing else
      if(o.wake&&typeof o.wake==='object'){const tk=v=>v==null?v:String(v||'');wake={d:String(o.wake.d||''),t:tk(o.wake.t),m:tk(o.wake.m)};text='';media=[];poll=reply=fwd=on=call=null} // a wake ticket (ringing, or "New message", when the app is closed): kept below, never shown; a kind left out is unchanged, null takes it back
    }catch{text=null}}
    const s=await senderKeys(p.from); // someone who joined by link may be nobody this page has looked up yet
    if(s&&(kind==='comment'||typeOf(c)!=='channel'||isAdminH(c,p.from)))verified=await verifyBy(p.from,p.sig,postData(c.id,p),p.ts,true); // a key the sender still had when the message was dated counts too (release 21)
    if(text==null||!s)setTimeout(()=>S.cache.delete(key));
    if(text&&kind!=='comment')indexMsg(key,c,p,text);
    if(wake&&verified&&kind!=='comment')noteWake(c,p,wake);
    return {text,media,poll,reply,fwd,on,call,wake,verified,known:!!s,nokey};
  })());
  return S.cache.get(key);
}
async function freshChan(cid){const s=await S.db.doc('channels/'+cid).get();if(!s.exists)throw new Error('gone');return chatRec(cid,s.data())}
const joinedPublic=cid=>!!(S.prefs&&Array.isArray(S.prefs.pub)&&S.prefs.pub.includes(cid));
async function showMeta(c,raws){ // an on-screen copy with the readable fields filled in. It is never saved back.
  if(!c)return c;const out=Object.assign({},c),me=S.me&&S.me.handle;for(const k in out)if(k[0]==='_')delete out[k]; // the _ marks below are this page's own, never the server's record's
  if(typeOf(c)==='dm'){const peer=S.dmPeers[c.id]||(c.members||[]).find(h=>h!==me);out.members=peer?[...new Set([me,peer])]:(c.members||[me]);return out}
  if(c.visibility==='public'){out.members=[...new Set([c.owner,...(c.admins||[]),...(joinedPublic(c.id)||(c.members||[]).includes(me)?[me]:[])].filter(Boolean))];if(!out.name)out.name='Channel';return out}
  const v=c.meta?await readMeta(c,raws):null;
  if(v){Object.assign(out,v);if(me&&!out.members.includes(me)&&(await convKey(c,epochOf(c)))){out.members=[...out.members,me];out._unlisted=true}} // joined by link, not yet written into the list (_unlisted: the chat watch heals it, healCard)
  else{out.name=typeOf(c)==='group'?'Private group':'Private channel';out.desc='';out.photo=null;out.members=c.members||[];out.admins=c.admins||[];out.owner=c.owner||''}
  // The owner's own part (ometa), which only the owner key writes: once there, what an admin seals into meta names no owner, admins or name
  if(c.ometa){const o=await readOMeta(c,raws);Object.assign(out,o?{...o,_ometa:true}:{owner:'',admins:[]})} // unopened: meta's name, description and photo, but no owner or admins
  // A channel with a roles record (SPEC.md 5.6 "Key chain"), signed or not (an unsigned one only ever loses admins): the owner
  // and admins shown, and written back, are the record's. _odd: this copy names others (or there is none); _stale: it is
  // older than the record, by epoch or by rt (one with no rs by epoch alone), so no owner write is built from it. _rt: the
  // record's time as read here (none without a record), the only one a copy sealed again may keep (sealMeta 'keep', from a signed record only)
  // shortcut: a re-seal landing just after a later owner write (another tab or device, within a round trip) leaves a stale copy that no owner write here replaces until another owner device writes; keep a hash of the record's name, description and photo, so such a copy can be sealed again, if that shows up
  if(typeOf(c)==='channel'&&(out._ometa||!c.ometa)){await rolesQ.get(c.id);const r=rolesOf(c.id),m=c.ometa||{},a=[...((r&&r.a)||[])];out._rt=(r||{}).t;
    if(r&&r.o)Object.assign(out,{owner:r.o,admins:a,_odd:!c.ometa||out.owner!==r.o||[...out.admins].sort().join()!==[...a].sort().join(),_stale:m.e<r.e||typeof out.rs==='string'&&out.rt<r.t})}
  if(!out.name)out.name=typeOf(c)==='group'?'Group':'Channel';
  return out;
}
const ownTried=new Set(),notOwnerKey=()=>'hush:notOwner:'+S.me.handle,notOwner=cid=>!!ls.get(notOwnerKey(),{})[cid];
let climbQ=Promise.resolve();
const climb=c=>climbQ=climbQ.then(async()=>{try{await S.db.refreshChat(c.id); // open again, best key first (capsFor); a few a second
  if(ownTried.has(c.id)&&S.db.chatLevel(c.id)==='admin'){const m=ls.get(notOwnerKey(),{});m[c.id]=1;ls.set(notOwnerKey(),m)}}catch{} // the owner key was refused: no chat changes owner, so it is not tried again on this device
  await new Promise(r=>setTimeout(r,250))});
const handedKey=()=>'hush:handed:'+S.me.handle;
const handOver=async(c,shown)=>{ // a group from before ometa: its blocks predate the server's list; handed over once per device and list
  if(c.ometa)return;const b=JSON.stringify([...(shown.banned||[])].sort()),m=ls.get(handedKey(),{});if(b==='[]'||m[c.id]===b)return;
  for(const h of shown.banned)await S.db.banChat(c.id,h,true);m[c.id]=b;ls.set(handedKey(),m)};
const oAdopted=new Set();
// The owner's write of ometa (with `more`, the record's other fields; keep: sealed again, adoptOMeta), one at a time per channel,
// so one sealed again never lands after a later one from this page; then into this page's copies of the record and its roles
// record at once (noteRoles, through readOMeta): a server that keeps its echo from this page can't have it take, or seal again, an older copy
const oWrites=new Map();
function putOMeta(c,v,more,keep){const job=(oWrites.get(c.id)||Promise.resolve()).catch(()=>{}).then(async()=>{const m=await sealOMetaFor(c,v,keep);
  await S.db.doc('channels/'+c.id).update(Object.assign({},more,{ometa:m}));for(const x of [S.chatDocs.get(c.id),convById(c.id)])if(x)x.ometa=m;await readOMeta(Object.assign({},c,{ometa:m}))});oWrites.set(c.id,job);return job}
async function adoptOMeta(c,shown){ // ometa (SPEC.md 5.3), once per page load and epoch where this device holds the admin secret
  if(!S.db||!S.me||!c||!c.meta||!shown||typeOf(c)==='dm'||c.visibility==='public'||S.rekeying)return;
  const ch=typeOf(c)==='channel',k=c.id+':'+epochOf(c)+(ch&&c.ometa?':'+c.ometa.iv:'');if(oAdopted.has(k)||c.ometa&&!shown._ometa||shown._odd||shown._stale||ch&&!(rolesOf(c.id)||{}).s)return;oAdopted.add(k); // a channel's per copy of ometa: its signature is checked once; with a roles record only a copy of the record's own list, never an older one (showMeta), and only once the record is signed: a list this device could not verify (a channel from before release 92, a copy under a key it does not hold as hers) is never sealed again by itself; the owner signs it by hand, Edit then Save (owner decision D1)
  if(c.ometa&&c.ometa.e>=epochOf(c)&&(!ch||await rolesOk(c.id,c.ometa.e,shown))){if(!ch)oAdopted.delete(k);return} // nothing to do: up to date (in a channel, signed by the owner: rs), or unopened here; a failure waits for the next load
  try{if(!(await adminSecret(c).catch(()=>null)))return; // only the owner and admins hold it
    if(!c.ometa&&!notOwner(c.id))await climb(c);const lv=S.db.chatLevel(c.id); // the owner key is tried while only meta names the owner (capsFor)
    if(lv!=='owner'&&lv!=='admin')return;
    if(shown._unlocked)await handOver(c,shown); // first: a failure leaves no ometa, so the next load tries again
    // the owner is whoever the owner key opens for, not what meta says (even a meta an admin made unreadable); a later
    // ometa is sealed again under the current epoch, so a device added since (it holds only the later keys) can open it
    // a channel's at the rt of this device's signed roles record, never a later one (sealMeta 'keep'), so an owner device the server kept a later change from adds none elsewhere; after a device removal of hers such a copy still narrows the records her removal's copy narrowed, to the admins both lists name, until her next change of admins (noteRoles; SECURITY.md)
    if(lv==='owner')await putOMeta(c,Object.assign({},shown,c.ometa?{}:{owner:S.me.handle}),null,ch)}catch{}
}
async function chatAnd(cid){let c=S.chatDocs.get(cid);if(!c||typeOf(c)!=='dm'&&c.visibility!=='public'&&!c.meta)c=await freshChan(cid);return [c,await showMeta(c)]} // the server's record and its readable copy; a private group's or channel's read again when the copy kept has no sealed list (a preview, or one read below admin level), so no write starts from it
async function setVisibility(cid,vis){
  const [c,shown]=await chatAnd(cid);if(c.visibility===vis)return;const v=metaOf(shown);
  if(c.ometa&&(!shown._ometa||shown._stale))throw new Error('nokey'); // an ometa this device can't open, or one older than its roles record: its owner part would be published
  if(vis==='public'){ // history becomes readable to anyone, and so do the name and photo, so people can find it
    await S.db.doc('channels/'+cid).update({visibility:'public',openKeys:await allRaws(c),name:v.name,desc:v.desc,photo:v.photo,owner:v.owner||S.me.handle,admins:v.admins,meta:null,ometa:null,invites:{}})}
  else{ // a fresh key from here on, and the description goes back under seal
    await rotateTo(c,v);
    await putOMeta(c,Object.assign({},v,{_ah:''}),{visibility:'private',name:null,desc:null,photo:null,owner:null,admins:null,invites:{}}); // naming no admin secret: the one the roles records name is from before it went public, and an admin dropped since may know it
    for(const x of [c,convById(cid),S.chatDocs.get(cid)])if(x)x.visibility='private';await signAdminId(cid).catch(()=>{})} // then a fresh one, signed (SPEC.md 5.6 "Key chain"); a failure leaves every page refusing until the owner's next open
  ls.set('hush:inv:'+cid,null);
}
async function createInvite(cid){
  const c=S.chatDocs.get(cid)||await freshChan(cid),iid=rid(),secret=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const a=await verifiedAdmin(c);if(!a&&typeOf(c)==='channel'&&!(await adminSecret(c)))throw new Error('nokey'); // a private channel's link carries `as` under the admin secret its owner signed; with none here it has none (it joins, but the next leave stops it and its joiners wait for an Add); a device holding no admin secret makes no channel link
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await inviteKey(secret,cid,iid),enc.encode(JSON.stringify(await handRaws(c)))); // { epoch: key }: a channel's current key alone, or every key held
  const sec=b64u(secret),ph=hexOf(await crypto.subtle.digest('SHA-256',enc.encode(await joinProof(sec,cid,iid))));
  await S.db.doc('channels/'+cid).update({invites:{[iid]:Object.assign({iv:b64(iv),ct:b64(ct),ph,ts:Date.now()},a?{as:await sealAs(a,cid,iid,secret)}:{})}});
  const inv={iid,secret:sec,h:S.me.handle};ls.set('hush:inv:'+cid,inv);return inv; // `h`: whose it is, so logging that account out takes it along
}
async function revokeInvite(cid,iid){await S.db.doc('channels/'+cid).update({invites:{[iid]:null}});ls.set('hush:inv:'+cid,null)}
const linkFor=(cid,inv)=>APP_URL+'#join='+cid+(inv?'.'+inv.iid+'.'+inv.secret:'');
const dropHash=()=>{if(/join=|add=/.test(location.hash))history.replaceState(history.state,'',location.pathname+location.search)}; // a link read is cleared from the address bar before any sheet's history entry could copy it; NAV's state stays
function parseJoin(s){const m=String(s||'').match(/(?:join=)?([cg][A-Za-z0-9]{6,})(?:\.([A-Za-z0-9]+)\.([A-Za-z0-9_-]{10,}))?/);return m?{cid:m[1],iid:m[2],secret:m[3]}:null}
async function inviteRaws(cid,j){ // the key history inside an invite link, fetched from the server and unlocked with the link's secret
  const inv=await S.db.inviteBlob(cid,j.iid);
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(inv.iv)},await inviteKey(unb64u(j.secret),cid,j.iid),unb64(inv.ct))))}
async function handleJoin(code){
  const am=String(code||'').match(/add=([a-z0-9_]{3,20})/);
  if(am){const h=am[1];
    if(!S.db||!S.me){toastErr('This link can\u2019t be opened right now. Check your connection.');return false}
    if(h===S.me.handle){toast('That\u2019s your own invite link. Send it to a friend.');return true}
    if(!S.dir[h]){try{const s=await S.db.doc('directory/'+h).get();if(!s.exists){toastErr('No one on Hush has the username @'+h+'.');return false}S.dir[h]=s.data()}catch{toastErr('Couldn\u2019t open that link. Check your connection.');return false}}
    openDm(h);return true}
  const j=parseJoin(code);if(!j){toastErr('That doesn\u2019t look like a Hush invite link.');return false}
  if(!S.db||!S.me){toastErr('Joining isn\u2019t available right now. Check your connection.');return false}
  let c;try{c=await freshChan(j.cid)}catch{toast('That channel doesn\u2019t exist anymore.');return false}
  if(S.convs.some(x=>x.id===j.cid)||c.visibility==='public'){S.previews.set(c.id,await showMeta(c));openConv(c.id);return true} // the list, not a preview left from before a removal
  if(!j.iid||!j.secret){toastErr('This invite link is incomplete. Ask for a new one.');return false}
  let raws=null;try{raws=await inviteRaws(j.cid,j)}catch(e){toastErr(e&&e.code==='notfound'?'This invite link was revoked. Ask for a new one.':e&&e.code==='banned'?'You were removed from this '+(typeOf(c)==='group'?'group.':'channel.'):'Couldn\u2019t read that invite link. Check your connection.');return false} // only the server can refuse a banned person: the preview has no blocked list
  confirmJoin(await showMeta(c,raws),j);return true;
}
async function joinPrivate(cid,j){
  let raws=await inviteRaws(cid,j);const me=S.me.handle,pre=await freshChan(cid),ch=typeOf(pre)==='channel',top=r=>Math.max(...Object.keys(r).map(Number));
  // A channel's link (release 92) holds the current key alone, the ones before it coming from the key chain; one made for
  // another epoch (carried across a key change a moment ago) is read once more, then refused
  if(ch&&top(raws)!==epochOf(pre)&&top(raws=await inviteRaws(cid,j))!==epochOf(pre))throw Object.assign(new Error('stale'),{code:'stale'});
  const cur=top(raws),wraps={};for(const [e,r] of Object.entries(raws)){if(!ch||Number(e)===cur)wraps[e]=await wrapKey(unb64(r),me,cid,Number(e));ksPut(cid,e,r)} // a channel: only the current key is wrapped (an older link's keys are kept all the same)
  if(raws[cur])keyMade(cid,cur,unb64(raws[cur])); // the link's newest key came from an admin by a way the server can't touch
  await S.db.joinChat(cid,j.iid,await joinProof(j.secret,cid,j.iid),wraps); // proves the link to the server and files our own wraps
  if(ch){const done=ls.get('hush:wrapped:'+me,{}),m=done[cid]=done[cid]||{};m[cur]=[...new Set([...(m[cur]||[]),...(await verifiedDevs(me)).map(d=>d.id)])];ls.set('hush:wrapped:'+me,done)} // wrapped for every device of mine: syncWraps doesn't do it again
  const full=await freshChan(cid);noteChatDoc(full);await S.db.refreshChat(cid);
  if(typeOf(full)==='channel')await writeCard(full,'join',j.iid,await joinMac(unb64u(j.secret),cid,j.iid,me)).catch(()=>{}); // a channel takes no notes from subscribers: an admin's page reads the card, checks its `m` against the link and writes us into the list (rollRun)
  else try{await S.db.collection('channels/'+cid+'/posts').add(await sealSvc(full,'join',0))}catch{} // members (and an admin, who writes us into the list) see we joined
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
  stopConv();if(S.db)S.db.present();   // the user wants this chat now: a reconnect that is waiting, or about to, does not sit out its random wait
  Object.assign(S,{chan:cid,posts:[],rawPosts:[],older:[],allLoaded:false,loadingOlder:false,scheduled:[],future:[],purged:new Set(),rendered:null,loaded:!S.db,stick:true,
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
  bar.append(back,head);
  if(t==='dm'&&!isSelf(c)){const cb=html('button','icon-btn',I.phone);cb.id='callBtn';cb.setAttribute('aria-label','Voice call');cb.hidden=true;cb.onclick=()=>startCall(curConv()||c);bar.append(cb);
    if(videoCan()){const vb=html('button','icon-btn',I.video);vb.id='videoBtn';vb.setAttribute('aria-label','Video call');vb.hidden=true;vb.onclick=()=>startCall(curConv()||c,{cam:true});bar.append(vb)}} // shown by refreshHeader while a call can be placed; Video call only where video works (a browser for now)
  bar.append(sbtn,more);
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
  if(t!=='dm'&&ls.get('hush:noUse:'+S.me.handle,{})[cid])p.append(el('div','reqnote','Couldn’t secure this chat. A device you removed may still have control here. Start a new chat with the same people.')); // a device removal could not replace this chat's owner key or admin secret (rekeyRun)
  if(!isMember(c)){
    if(t==='channel'&&c.visibility==='public'){const f=el('div','composer readonly');const j=el('button','primary join','Join channel');
      j.onclick=async()=>{j.disabled=true;try{await joinPublic(cid)}catch(e){j.disabled=false;if(!e||e.message!=='banned')toastErr('Couldn\u2019t join. Check your connection and try again.')}};f.append(j);p.append(f)}
  }else if(!canPost(c))p.append(el('div','composer readonly','Only the channel owner and admins can post here'));
  else if(t==='dm'&&!isSelf(c)&&isGone(dmPeer(c)))p.append(el('div','composer readonly','This account was deleted. You can read this chat, but not reply.'));
  else if(t==='dm'&&!isSelf(c)&&keyChanged(dmPeer(c))){const kw=el('div','composer readonly kwbar');kw.append(keyWarnBox(dmPeer(c)));p.append(kw)}
  else if(isRequest(c))p.append(requestBar(c));
  else{if(awaitingAccept(c))p.append(el('div','reqnote',displayName(dmPeer(c))+' asks new people to send a request first. You can send one text message as a request. Once they accept, you can chat normally.'));buildComposer(p,c)}
  S.warnShown=!!(t==='dm'&&!isSelf(c)&&(keyChanged(dmPeer(c))||isGone(dmPeer(c))));pinAll();drawTyping(); // either swaps the composer out: refreshDir opens the chat again when it changes
  refreshHeader();renderConv();renderList();updateTitle();drawPinBar();loadDir(knownIn(c)).then(ch=>syncWraps(convById(cid)||c)).then(ch=>{const cc=convById(cid)||c;if(isAdmin(cc)){ensureChain(cc).catch(()=>{});rollRun(cc);recount(cc)}return ch}).then(ch=>healKeys(convById(cid)||c).then(()=>ch)).then(async ch=>{if(ch&&S.chan===cid){const cc=convById(cid)||c;S.rawPosts=await unsealAll(cc,S.rawPosts);S.older=await unsealAll(cc,S.older);if(S.chan!==cid)return;applyExpiry();pinAll();S.rendered=null;renderConv();refreshHeader()}});refreshPresence();
  if(!S.db)return;
  const base='channels/'+cid;
  S.unsubs.push(
    liveQ(S.db.collection(base+'/posts').orderBy('ts','desc').limit(300),async s=>{const my=S.postSeq=(S.postSeq||0)+1;
      const un=await unsealAll(convById(cid)||c,s.docs.map(d=>Object.assign({_id:d.id,_pending:d.metadata.hasPendingWrites},d.data())).reverse());
      if(S.chan!==cid||my!==S.postSeq)return; // left the chat, or a newer update arrived while unsealing
      S.loaded=true;S.rawPosts=un;reconcileSvc(convById(cid)||c,un).catch(()=>{});noteAccepted(cid,un);
      if(!s.metadata.fromCache&&s.docs.length<300&&!(S.older||[]).length)S.allLoaded=true;
      if(!s.metadata.fromCache)pruneIdx(cid,S.rawPosts,S.allLoaded);
      applyExpiry();if(S.stick)markRead();renderConv();drawPinBar()},()=>{if(S.chan===cid)toastErr('This chat stopped updating. Reload to reconnect.')}),
    S.db.collection(base+'/acts').limit(1000).onSnapshot(s=>onActs(s.docs.map(d=>Object.assign({_id:d.id},d.data()))),()=>{}),
    S.db.collection(base+'/reads').limit(1000).onSnapshot(s=>readSide(cid,s.docs,'hush-seen-v1',r=>{S.reads=r;refreshNodes()}),()=>{}),
    S.db.collection(base+'/typing').limit(200).onSnapshot(s=>readSide(cid,s.docs,'hush-type-v1',r=>{S.typing=r;drawTyping();refreshHeader()}),()=>{}));
  if(FEATURES.channelComments&&t==='channel')S.unsubs.push(S.db.collection(base+'/comments').limit(1000).onSnapshot(s=>{
    S.comments=s.docs.map(d=>Object.assign({_id:d.id,_pending:d.metadata.hasPendingWrites},d.data()));
    const cnt=new Map();S.comments.forEach(x=>cnt.set(x.post,(cnt.get(x.post)||0)+1));S.ccount=cnt;refreshNodes();if(S.commentsView)S.commentsView.render()},()=>{}));
}
async function drawPinBar(){
  const pb=$('#pinbar'),c=curConv();if(!pb||!c)return;const pins=(c.pins||[]);
  if(!pins.length||isRequest(c)){pb.hidden=true;return} // a request shows its first text and nothing else: the sender can pin any of the other messages
  const idx=S.pinIdx%pins.length,id=pins[idx];let p=allPosts().find(x=>x._id===id);
  if(!p&&S.db){if(!S.pinCache.has(id))S.pinCache.set(id,S.db.doc(`channels/${c.id}/posts/${id}`).get().then(s=>s.exists?unsealPost(c,Object.assign({_id:id},s.data())):null).catch(()=>null));p=await S.pinCache.get(id)}
  if(p&&p.from&&p.from!==S.me.handle&&isBlocked(p.from))p=null; // someone I blocked: shown as unavailable
  const o=p?await openPost(c,p):null;if(curConv()!==c&&curConv()?.id!==c.id)return;
  pb.replaceChildren();pb.hidden=false;pb.insertAdjacentHTML('beforeend',I.pin);
  const m=el('div','t-main');m.append(el('div','pb-title','Pinned message'+(pins.length>1?` ${idx+1} of ${pins.length}`:'')),el('div','t-sub',p?snippet(o):'Message no longer available'));pb.append(m);
  if(canPin(c)){const x=html('span','icon-btn pb-x',I.xs);x.setAttribute('role','button');x.setAttribute('aria-label','Unpin');
    x.onclick=async e=>{e.stopPropagation();try{await S.db.doc('channels/'+c.id).update({pins:pins.filter(v=>v!==id)})}catch{toastErr('Couldn\u2019t unpin. Try again.')}};pb.append(x)}
  pb.onclick=async()=>{if(p){if(!S.rendered||!S.rendered.nodes.get(id)){for(let k=0;k<10&&!S.allLoaded&&!(S.rendered&&S.rendered.nodes.get(id));k++)await loadOlder()}jumpTo(id)}
    if(pins.length>1){S.pinIdx=(S.pinIdx+1)%pins.length;drawPinBar()}};
}
async function togglePinMsg(c,p){
  const cur=(c.pins||[]),on=!cur.includes(p._id),pins=cur.filter(x=>x!==p._id);if(on)pins.unshift(p._id);
  try{await ensureDmDoc(c);await S.db.doc('channels/'+c.id).update({pins:pins.slice(0,20)});
    if(on)await S.db.collection(`channels/${c.id}/posts`).add(await sealSvc(c,'pin',0));S.pinIdx=0;toast(on?'Message pinned':'Message unpinned')}
  catch{toastErr('That didn\u2019t go through. Try again.')}
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
      catch{toastErr('Comment not sent. Try again.')}go.disabled=false;ta.focus()}}
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
        d.onclick=async()=>{if(!confirmDanger('Delete this comment?'))return;try{await S.db.doc(`channels/${cc.id}/comments/${x._id}`).delete()}catch{toastErr('Couldn\u2019t delete it.')}};r.append(d)}
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
  const c=curConv(),sub=$('#convSub');if(!c||!sub)return;const cb=$('#callBtn');if(cb)cb.hidden=!!S.call||!callable(c);const vb=$('#videoBtn');if(vb)vb.hidden=!!S.call||!callable(c);
  const t=typeOf(c),now=Date.now();let txt,cls='t-sub',icon='';
  const typers=t==='channel'||isSelf(c)?[]:Object.entries(S.typing).filter(([h,ts])=>h!==S.me.handle&&now-ts<5000&&(c.members||[]).includes(h)).map(([h])=>h);
  if(typers.length){txt=t==='dm'?'typing\u2026':typers.length===1?displayName(typers[0])+' is typing\u2026':typers.length+' people are typing\u2026';cls+=' typing'}
  else if(isSelf(c)){txt='Only you can see this';cls+=' muted'}
  else if(t==='dm'){const pr=dmPeer(c);txt=lastSeen(pr);cls+=txt==='online'?' online':' muted';if(keyChanged(pr)){txt='security code changed';cls='t-sub danger-t'}else if(isVerified(pr))icon=I.shieldSm}
  else if(t==='group'){const on=(c.members||[]).filter(h=>h!==S.me.handle&&isOnline(h)).length;txt=memberText(c)+(on?`, ${on} online`:'');cls+=' muted'}
  else{const pub=c.visibility==='public';icon=pub?I.globe:I.lock;txt=subsText(c,pub?'Public, ':'');if(pub)cls+=' pub'}
  if(c.ttl&&!typers.length){icon=I.timerSm;txt+=', '+ttlLabel(c.ttl).replace(/s$/,'')+' timer'}
  const k=cls+'|'+txt+'|'+icon;if(sub._k===k)return;sub._k=k;sub.className=cls;sub.innerHTML=icon;sub.append(el('span',null,txt));
}
const sideSeq=new Map();
async function readSide(cid,docs,label,done){ // turn the tags back into names, ignoring anything whose signature doesn't check out
  const my=(sideSeq.get(label)||0)+1;sideSeq.set(label,my);
  const c=curConv();if(!c||c.id!==cid)return;const members=new Set(tagPeople(c)),maps={},r={};
  for(const d of docs){const v=d.data()||{},ts=v.ts||0;const i=String(d.id),cut=i.indexOf('~');
    let h=null,tag=null;
    if(cut<0){if(members.has(i))h=i} // an older app still files these under the plain name
    else{const e=+i.slice(0,cut);tag=i.slice(cut+1);
      if(!Number.isInteger(e))continue;
      const m=maps[e]||(maps[e]=await tagMap({...c,members:[...members]},e));h=m[tag];
      if(h&&!(await sideOk(h,await sideSigOf(c,e,tag,label,v),label,[cid,tag,ts])))h=null}
    if(h&&ts>(r[h]||0))r[h]=ts}
  if(sideSeq.get(label)!==my||S.chan!==cid)return;done(r);
}
/* The on-screen keyboard covers the bottom of the page on a phone. The browser tells us how much room is
   really left, so the whole app shrinks to fit and the message box ends up sitting right above the keys. */
// The iPhone app's Keyboard plugin unhooks WKWebView from the keyboard notifications, so visualViewport may not shrink there;
// the plugin reports the keys' height instead (0 for a hardware keyboard's QuickType bar).
let kbT=null,kbH=0;
addEventListener('keyboardWillShow',e=>{kbH=e.keyboardHeight||0;fitKeyboard()});addEventListener('keyboardWillHide',()=>{kbH=0;fitKeyboard()});
function fitKeyboard(){
  const vv=window.visualViewport,app=document.getElementById('app');if(!vv||!app)return;
  const h=Math.round(kbH?Math.min(vv.height,innerHeight-kbH):vv.height),off=Math.round(vv.offsetTop||0),hidden=Math.max(0,Math.round(innerHeight-h-off));
  const up=hidden>80||off>1,notch=parseFloat(getComputedStyle(document.documentElement).paddingTop)||0;
  app.style.height=up?(h-notch)+'px':''; // the page pads the notch and home bar (safe areas): keys down, the plain 100% fits; keys up, only the notch's padding is above the app
  app.style.transform=off>1?'translateY('+off+'px)':'';
  document.documentElement.classList.toggle('kb-up',up);
  const de=document.documentElement.style;if(up){de.setProperty('--kb-top',off+'px');de.setProperty('--kb-bottom',hidden+'px');revealFocus()}else{de.removeProperty('--kb-top');de.removeProperty('--kb-bottom')} // the sign-in screens, sheets and the lock end at the keys too (styles.css)
  const msgs=document.getElementById('msgs');if(msgs&&S.stick)msgs.scrollTop=msgs.scrollHeight;
}
// The sign-in screens, the sheets and the lock live outside #app, so nothing else brings a box there up from under the keys: the focused one scrolls into the room above them
function revealFocus(){const f=document.activeElement;if(f&&f.matches('input,textarea')&&f.closest('.onboard,.backdrop,.lock')&&document.documentElement.classList.contains('kb-up'))f.scrollIntoView({block:'nearest'})}
document.addEventListener('focusin',()=>setTimeout(revealFocus,60));
function onViewport(){clearTimeout(kbT);kbT=setTimeout(fitKeyboard,16)}
// Keys up: a drag on a list closes them, and so does a drag down on the messages (as iOS apps do)
{let x0=0,y0=null;
  document.addEventListener('touchstart',e=>{const t=e.touches[0];y0=e.touches.length===1&&e.target.closest?.('#threads,#calls,#msgs')?t.clientY:null;x0=t.clientX},{passive:true});
  document.addEventListener('touchmove',e=>{if(y0==null||!document.documentElement.classList.contains('kb-up'))return;const t=e.touches[0],dy=t.clientY-y0;
    if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(t.clientX-x0)&&(dy>0||!e.target.closest('#msgs'))){y0=null;document.activeElement?.blur()}},{passive:true})}
document.addEventListener('gesturestart',e=>{if(!e.target.closest?.('.viewer'))e.preventDefault()},{passive:false}); // Safari ignores maximum-scale; only the media viewer may pinch
if(window.visualViewport){visualViewport.addEventListener('resize',onViewport);visualViewport.addEventListener('scroll',onViewport)}
addEventListener('orientationchange',()=>setTimeout(fitKeyboard,250));
let typingAt=0;
function setTyping(on){
  const c=curConv();if(!S.db||!c||!isMember(c)||typeOf(c)==='channel'||isSelf(c))return;
  const now=Date.now();if(on&&now-typingAt<2500)return;if(!on&&!typingAt)return;typingAt=on?now:0;
  (async()=>{try{const e=epochOf(c),t=await memTag(c,e,S.me.handle);if(!t)return;const ts=on?now:0;
    await S.db.doc(`channels/${c.id}/typing/${e}~${t}`).set(await sealSide(c,e,t,'hush-type-v1',ts));
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
      if(!/^https?:\/\/[^\s)]+$/.test(href)||href==='https://'){toastErr('Links need to start with https:// or http://');return}
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
      if(files.length>=max){toastErr(`Up to ${max} files per message.`);break}
      if(f.size>kindLimit(k)){toastErr(`${f.name||'That file'} is over the ${fmtLimit(kindLimit(k))} limit for ${k==='gif'?'GIFs':k==='file'?'files':k+'s'}.`);continue}
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
    S.recCancel=()=>{const x=endRec();if(x)x.stop()};haptic()};
  rcancel.onclick=()=>{const x=endRec();if(x)x.stop()};
  rsend.onclick=async()=>{const r=endRec();if(!r)return;const out=await r.stop();
    if(out.dur<.7||!out.blob.size){toastErr('That was too short. Tap the mic, speak, then tap send.');return}haptic();
    if(out.blob.size>lim().voiceBytes){toastErr('That recording is too long to send.');return}
    const reply=S.replyTo;S.stick=true;busy=true;upd();prog.hidden=false;progress(0,'Encrypting voice message\u2026');
    try{const cc=convById(cid);
      const m={kind:'voice',mime:out.blob.type||'audio/webm',src:out.blob,w:0,h:0,dur:Math.round(out.dur*10)/10,wave:out.wave,chunks:Math.max(1,Math.ceil(out.blob.size/lim().pieceBytes))};
      let done=0;const d=await uploadMedia(cc,m,()=>{done++;progress(done/m.chunks,'Sending\u2026')},mediaExp(cc));
      await sendBody(cid,buildBody({media:[d],reply}));S.replyTo=null;sync()}
    catch(err){toastErr(sendErr(err,t))}
    busy=false;prog.hidden=true;upd()};
  const doSend=async at=>{
    const text=getText();if(busy||!S.db)return;
    if(S.editing){const {p:op,o}=S.editing;if(!text.trim()&&!(o.media&&o.media.length))return;
      busy=true;upd();
      try{await editPost(cid,op,o,text);S.editing=null;clearEd();sync()}catch(err){toastErr(sendErr(err,t))}
      busy=false;upd();return}
    if(!text.trim()&&!files.length)return;
    haptic(); // once per message sent, never per keystroke
    const reply=S.replyTo;S.stick=true;
    if(!files.length){const keep=[...ed.childNodes];clearEd();ed.focus();S.replyTo=null;sync();
      try{await sendBody(cid,buildBody({text,reply}),at)}catch(err){ed.replaceChildren(...keep);S.replyTo=reply;sync();saveDraft();toastErr(sendErr(err,t))}return}
    busy=true;upd();drawStrip();prog.hidden=false;progress(0,'Encrypting\u2026');
    try{
      const cc=convById(cid),fs=files.map(x=>x.f),prep=[];
      for(let i=0;i<fs.length;i++){progress(0,`Preparing ${i+1} of ${fs.length}\u2026`);prep.push(await prepMedia(fs[i]))}
      const total=prep.reduce((a,m)=>a+m.chunks,0);let done=0;const media=[];
      // three files at a time; the album keeps the order they were picked in
      try{await lanes(prep.length,3,async i=>{media[i]=await uploadMedia(cc,prep[i],()=>{done++;progress(done/total,`Encrypting and uploading\u2026 ${Math.round(done/total*100)}%`)},mediaExp(cc,at))})}
      catch(e){media.filter(Boolean).forEach(d=>dropMedia(cc.id,d.id));throw e} // the message won't go: nothing it uploaded stays behind
      progress(1,'Sending\u2026');
      await sendBody(cid,buildBody({text,media,reply}),at);
      files.forEach(x=>URL.revokeObjectURL(x.url));files=[];clearEd();S.replyTo=null;sync();
    }catch(err){toastErr(sendErr(err,t))}
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
function setReply(p,o){haptic();S.editing=null;S.replyTo={id:p._id,from:p.from,snip:snippet(o)};if(S.comp){S.comp.sync();S.comp.focus()}}
function setEdit(p,o){haptic();S.replyTo=null;S.editing={p,o};if(S.comp){S.comp.setText(o.text||'');S.comp.sync();S.comp.focus()}}
async function ensureDmDoc(c){ // the first message in a DM creates it: a record with no names, and a sealed pointer for each side
  if(typeOf(c)!=='dm'||S.convs.some(x=>x.id===c.id))return;
  const peer=dmPeer(c),secret=await dmSecret(peer);if(!secret)throw new Error('nokey');
  // Not in my list doesn't mean new: my note for it may have been lost. If the server has it, don't create it again
  // (that is refused); bring it back instead, with fresh notes for both of us.
  const s=await S.db.preview(c.id);
  if(s.exists){const d=chatRec(c.id,s.data());S.chatDocs.set(c.id,d);for(const x of [c,convById(c.id)])if(x){x.epoch=d.epoch||0;x.keys=d.keys||{}}
    S.dmPeers[c.id]=peer;if(!dmInfo(c.id))setDmInfo(c.id,{peer});
    await ensureInbox(Object.assign({},c,{members:[...new Set([S.me.handle,peer])]}),null,true);return}
  dmIds.delete(peer);if(c.id!==await dmIdFor(peer))throw new Error('stale'); // the id this chat was opened under is from before a key change: never create a chat there
  const req=peer!==S.me.handle&&!!(S.dir[peer]&&S.dir[peer].requests===true)&&!(dmInfo(c.id)&&dmInfo(c.id).req==='ok');
  await S.db.createChat(c.id,{type:'dm',epoch:0,ts:Date.now(),last:null},{m:await memberCapFrom(c.id,0,secret)});
  S.dmPeers[c.id]=peer;if(req)setDmInfo(c.id,{peer,req:'out'});else if(!dmInfo(c.id))setDmInfo(c.id,{peer});
  await ensureInbox(Object.assign({},c,{members:[...new Set([S.me.handle,peer])],_req:req}));
}
const liveQ=(q,cb,err)=>q.onSnapshotMeta?q.onSnapshotMeta(cb,err):q.onSnapshot(cb,err); // live updates, including "sent" confirmations
const lastOf=p=>({sl:1,id:p._id||p.id,ts:p.ts,e:p.e??0,n:p.n,d:p.d,exp:p.exp||0,edited:p.edited||0,from:null,iv:null,ct:null,sig:null});
const lastUpd=(c,v)=>v; // updating the chat's latest-message marker never says who did it: lastOf() leaves `from` empty
async function sendBody(cid,body,at,quiet){ // quiet: the chat's latest-message marker is left alone, so nothing moves or shows (a wake ticket); in a timed chat it lives ttl from the server's clock, like any message there, and the ticket is sent again once it has gone (mintPass)
  let c=convById(cid);
  if(awaitingAccept(c)){
    if(typeof body!=='string'||(body[0]==='\u0001'&&(()=>{try{const x=JSON.parse(body.slice(1));return !!(x.media||x.poll||x.fwd)}catch{return true}})()))throw new Error('reqtext');
    if(S.posts.some(x=>x.from===S.me.handle&&!x.svc)||(c.last&&c.last.from===S.me.handle))throw new Error('reqone')}await ensureDmDoc(c);await ensureDmEpoch(c);
  if(epochOf(c)<hiOf(c)){await freshEpoch(cid).catch(()=>{});c=convById(cid)||c} // the chat's copy is below this device's mark (hi: another tab checked a newer key, or the server went back to an older record): read once more, and sealKey refuses what is still below it ('rollback', release 93b)
  // A channel post a key change overtook (conflict, SPEC.md 5.7) is sealed once more under the new key, with the same id, so the latest-message marker heals (shortcut: the bubble is gone while the record is read again, as the adapter drops a refused write's pending copy; keep it pending there if that shows)
  const pid=rid();for(let n=0;;n++){const p=await sealPost(c,body,at,quiet?(c.ttl?S.db.now()+c.ttl*1000:0):undefined);
  const stored=await wrapPost(c,p,pid,0);const put=S.db.doc(`channels/${cid}/posts/${pid}`).set(Object.assign({},stored));stored._id=pid;
  if(quiet)return put;
  try{if(at&&at>Date.now()+3000){await put;toast('Scheduled for '+fmtWhen(at),'View',()=>openScheduled())}
  else{await Promise.all([put,S.db.doc('channels/'+cid).update(lastUpd(c,{ts:p.ts,last:lastOf(stored)}))]);nudge(c,body)}break} // both go out at once: one trip to the server instead of two; then their closed iPhone hears of it
  catch(e){if(n||!e||e.code!=='conflict'||typeOf(c)!=='channel'||!((await freshEpoch(cid))>p.e))throw e;c=convById(cid)||c}} // the chat's copy as it is now: the chat watch may have put a new one in its place meanwhile
  // The first message from this page in a DM sends both of us a fresh note, in case one was lost: a note that
  // went missing would otherwise never be re-sent, and the chat would stay out of the list. Duplicates are tidied
  // by the recipient. While I wait for their answer this note says request too, as the first did: an app that was
  // closed reads both at once, and a plain one read first made the request a normal chat (release 108).
  const dm=typeOf(c)==='dm'&&!isSelf(c),fresh=dm&&!dmRenoted.has(cid),lc=convById(cid);if(fresh)dmRenoted.add(cid);
  ensureInbox(awaitingAccept(lc)&&(dmInfo(cid)||{}).req==='out'?Object.assign({},lc,{_req:true}):lc,null,fresh).catch(()=>{});if(dm)recordBase(lc);
  setTyping(false);
}
async function sendNowScheduled(cid,p){
  const c=convById(cid),o=await openPost(c,p);if(o.text==null)throw new Error('decrypt');
  const n=await sealPost(c,buildBody(o),Date.now());
  if(p.sl===1){const k=p.on||0,w=await wrapPost(c,n,p._id,k+1);
    await S.db.doc(`channels/${cid}/posts/${p._id}`).update({ts:w.ts,e:w.e,n:w.n,d:w.d,oh:w.oh,on:w.on,ot:await ownTokFor(cid,p),exp:w.exp||0});
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
      const now=el('button','pill','Send now');now.onclick=async()=>{now.disabled=true;try{await sendNowScheduled(c.id,p);toast('Sent');close()}catch{now.disabled=false;toastErr('Couldn\u2019t send it. Try again.')}};
      const del=html('button','icon-btn',I.trash);del.setAttribute('aria-label','Delete scheduled message');
      del.onclick=async()=>{if(!confirmDanger('Delete this scheduled message?'))return;try{if(p.sl===1)await removeOwn(c.id,p);else await S.db.doc(`channels/${c.id}/posts/${p._id}`).delete();S.scheduled=S.scheduled.filter(x=>x._id!==p._id);draw()}catch{toastErr('Couldn\u2019t delete it.')}};
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
    await S.db.doc(`channels/${cid}/posts/${p._id}`).update({e:w.e,n:w.n,d:w.d,oh:w.oh,on:w.on,ot:await ownTokFor(cid,p),edited});
    if(c.last&&c.last.sig===p.sig)await S.db.doc('channels/'+cid).update({last:lastOf(Object.assign(w,{_id:p._id,edited}))});return}
  await S.db.doc(`channels/${cid}/posts/${p._id}`).update({e:n.e,iv:n.iv,ct:n.ct,sig:n.sig,edited});
  if(c.last&&c.last.sig===p.sig)await S.db.doc('channels/'+cid).update({last:lastOf(Object.assign(n,{edited}))});
}
async function deletePost(cid,p){
  const c=convById(cid);
  if(c)openPost(c,p).then(o=>{for(const m of o.media||[])dropMedia(cid,m.id)}).catch(()=>{}); // its files go too
  if(p.sl===1&&p.from===S.me.handle)await removeOwn(cid,p);else await S.db.doc(`channels/${cid}/posts/${p._id}`).delete();
  if(c.last&&c.last.sig===p.sig){const rest=S.posts.filter(x=>x._id!==p._id),l=rest[rest.length-1];
    await S.db.doc('channels/'+cid).update(lastUpd(c,{last:l?lastOf(l):null}))}
}
const sendErr=(err,t)=>err&&err.code==='quota_exceeded'?'Storage is full. Older posts need clearing before new ones can be sent.'
  :err&&err.message==='nokey'&&t==='dm'?'This chat isn\u2019t ready on this phone yet. Close it and open it again.' // a DM has no admin: opening it fetches their keys or starts a fresh key (healKeys)
  :err&&err.message==='nokey'?'This chat isn\u2019t ready on this phone yet. It will be once an admin next opens it.'
  :err&&err.message==='badkey'?'Nothing was sent: Hush couldn\u2019t check this channel. Reload Hush. If the owner\u2019s security code changed, accept the new code. If the channel was made before this version of Hush, its owner signs its admin list once: Channel info, then Edit and Save. If it keeps happening, ask the channel\u2019s owner.' // its commit didn't check out (sealKey); an unsigned admin list counts no admin, so an admin's key refuses on every page but the owner's until she saves the list once (owner decision D1)
  :err&&err.message==='rollback'?'Nothing was sent: this channel looks out of date. Reload Hush. If it keeps happening, ask the channel’s owner.' // below this device's mark (sealKey, release 93b): the server serves an older record than a key change this device saw, or a database restored from before it
  :err&&err.message==='reqtext'?'Only a text message can be sent as a request. Photos and files can be sent once they accept.'
  :err&&err.message==='reqone'?'Your request was sent. You can send more once they accept.'
  :err&&err.message==='decode'?'One of those files couldn\u2019t be read. Try a JPG, PNG, GIF or MP4.'
  :err&&err.code==='full'?'There\u2019s no room for more files in this chat right now. Delete some older media, or try again later.'
  :err&&(err.code==='toolarge'||err.message==='toolarge')?'That file is too large to send.'
  :err&&err.code==='denied'?'You can\u2019t send files in this chat.'
  :err&&err.code==='conflict'&&t==='channel'?'The channel was just updated. Try again.' // sent again once already (sendBody), or an edit
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
  const mid='m'+rid(),{k,key}=await newMediaKey(),hashes=new Array(n),oh=await ownHash(await mediaTok(c.id,mid)); // the hash of my token for this file: the server keeps it, and only its holder or an admin deletes the pieces
  try{await lanes(n,4,async i=>{
    const plain=new Uint8Array(await m.src.slice(i*L.pieceBytes,Math.min(size,(i+1)*L.pieceBytes)).arrayBuffer());
    hashes[i]=await pieceHash(plain);const body=await sealPiece(key,i,n,plain);
    for(let a=0;;a++){try{await S.db.putPiece(c.id,mid,i,body,exp||0,oh);break}catch(e){if(a>=3||!retryable(e))throw e;await pause(600*2**a)}}
    tick(i)})}
  catch(e){dropMedia(c.id,mid);throw e}
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
    catch{toastErr('Couldn’t download this file. Check your connection and try again.');btn.textContent='Download'}
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
    box.onclick=ev=>{ev.stopPropagation();if(Date.now()-(box.closest('.msg')?._noClick||0)<600)return;fetchIt().catch(()=>{});view()}; // not the tap that ends a press-and-hold
  }else{
    if(m.kind==='gif')box.append(el('span','badge','GIF'));
    whenNear(box,()=>queued(()=>loadMedia(c,m,e)).then(url=>{const img=el('img');img.alt='';img.draggable=false;img.src=url;img.onload=()=>spin.remove();box.prepend(img)}).catch(fail));
    box.onclick=ev=>{ev.stopPropagation();if(Date.now()-(box.closest('.msg')?._noClick||0)<600)return;view()};
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
    }catch{btn.innerHTML=I.play;audio=null;toastErr('Couldn\u2019t play this voice message.')}
  };
  return w;
}
async function startRecording(onLevel){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||!window.MediaRecorder){toastErr('Voice messages aren\u2019t supported in this browser.');return null}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}
  catch(e){toastErr(e&&e.name==='NotAllowedError'?'Microphone access was blocked. Allow it for this page to record voice messages.':'The microphone isn\u2019t available here.');return null}
  // AAC in MP4 first: every browser and phone plays it. Opus in WebM where AAC can't be recorded (older iPhones
  // may not play that one). 32 kb/s is plenty for speech: 15 minutes is under 4 MB.
  const mime=['audio/mp4;codecs=mp4a.40.2','audio/webm;codecs=opus','audio/mp4','audio/webm','audio/ogg;codecs=opus'].find(t=>MediaRecorder.isTypeSupported&&MediaRecorder.isTypeSupported(t))||'';
  let rec;try{rec=new MediaRecorder(stream,Object.assign({audioBitsPerSecond:32000},mime?{mimeType:mime}:{}))}catch{stream.getTracks().forEach(t=>t.stop());toastErr('Recording isn\u2019t supported in this browser.');return null}
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
  const n=items.length;let i=Math.max(0,Math.min(n-1,start)),seq=0,sx=null,sy=0,swiped=false,z=1,tx=0,ty=0;const pts=new Map();
  const o=el('div','lightbox viewer'),stage=el('div','lb-stage'),count=el('div','lb-count');
  const x=html('button','icon-btn lb-x',I.x),prev=html('button','icon-btn lb-nav lb-prev',I.back),next=html('button','icon-btn lb-nav lb-next',I.back);
  x.setAttribute('aria-label','Close');prev.setAttribute('aria-label','Previous');next.setAttribute('aria-label','Next');
  const stopAll=()=>stage.querySelectorAll('video').forEach(v=>v.pause());
  const tf=()=>{const m=stage.querySelector('img,video');if(m)m.style.transform=`translate(${tx}px,${ty}px) scale(${z})`};
  const show=()=>{const my=++seq,{m,e}=items[i];stopAll();z=1;tx=ty=0;
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
    sx=v&&ev.offsetY>v.clientHeight-70?null:ev.clientX;sy=ev.clientY;pts.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});if(pts.size>1||z>1)sx=null});
  // pinch (1x-4x about the fingers' midpoint) and one-finger pan while zoomed
  const mid=()=>{const a=[...pts.values()];return a.length<2?{...a[0],d:0}:{x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2,d:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}};
  o.addEventListener('pointermove',ev=>{if(!pts.has(ev.pointerId))return;const b=mid();pts.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});if(pts.size>2||(pts.size<2&&z===1))return;
    const a=mid(),k=pts.size>1?Math.max(1,Math.min(4,z*a.d/b.d))/z:1,W=innerWidth,H=innerHeight;z*=k;
    tx=z===1?0:Math.max(-W*z/2,Math.min(W*z/2,a.x-W/2-k*(b.x-W/2-tx)));ty=z===1?0:Math.max(-H*z/2,Math.min(H*z/2,a.y-H/2-k*(b.y-H/2-ty)));tf()});
  o.addEventListener('pointercancel',ev=>pts.delete(ev.pointerId));
  o.addEventListener('pointerup',ev=>{pts.delete(ev.pointerId);if(sx==null)return;const dx=ev.clientX-sx,dy=ev.clientY-sy;sx=null;
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
function previewText(pv){if(!pv||pv.text==null)return 'Encrypted message';if(pv.wake)return '';if(pv.call)return callText(pv.call);if(pv.poll)return 'Poll: '+pv.poll.q;const l=mediaLabel(pv.media),t=plainText(pv.text);return l?l+(t?', '+t:''):t}
const snippet=o=>!o||o.text==null?'Message':o.call?callText(o.call):o.poll?'Poll: '+o.poll.q:o.text?plainText(o.text).slice(0,100):mediaLabel(o.media)||'Message';
function buildBody(o){
  const rich=(o.media&&o.media.length)||o.poll||o.reply||o.fwd||o.on||o.call||o.wake;if(!rich)return o.text||'';
  const x={text:o.text||''};if(o.media&&o.media.length)x.media=o.media;if(o.poll)x.poll=o.poll;if(o.reply)x.reply=o.reply;if(o.fwd)x.fwd=o.fwd;if(o.on)x.on=o.on;if(o.call)x.call=o.call;if(o.wake)x.wake=o.wake;
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
const tagPeople=c=>c.members&&c.members.length&&(typeOf(c)!=='channel'||isAdmin(c))?c.members:[c.owner,...(c.admins||[]),S.me.handle].filter(Boolean); // whose read marks, and in a group or one-on-one chat reactions and votes, this page names, loading each one's profile to check the signature: the list it holds, or, in a channel this account neither owns nor runs (its subscribers are for the owner and admins alone, SPEC.md 5.3: whatever list its copy carries) and with no list, the owner, the admins and itself
const readCount=p=>{const c=curConv();if(!c)return 0;return Object.entries(S.reads).filter(([h,ts])=>h!==p.from&&ts>=p.ts&&tagPeople(c).includes(h)).length};
async function renderConv(){
  const box=$('#msgs');if(!box)return;const seq=++msgSeq,c=curConv();if(!c)return;
  let posts=S.posts,opened=await Promise.all(posts.map(p=>openPost(c,p)));
  if(seq!==msgSeq||!$('#msgs'))return;
  noteCalls(c,posts,opened,true);
  if(opened.some(o=>o.wake)){posts=posts.filter((p,i)=>!opened[i].wake);opened=opened.filter(o=>!o.wake)} // wake tickets travel as messages and are never shown
  let more=null; // a request I have not answered: its first text message, and a count of whatever else was sent; nothing else is drawn, so no photo is fetched (SPEC.md 5.6)
  if(isRequest(c)){const i=posts.findIndex((p,j)=>!p.svc&&reqText(opened[j])),n=posts.filter(p=>!p.svc).length-(i<0?0:1);
    posts=i<0?[]:[posts[i]];opened=i<0?[]:[opened[i]];if(n)more=el('div','chip svc',n===1?'1 more message waits until you accept.':n+' more messages wait until you accept.')}
  const t=typeOf(c),ids=posts.map(p=>p._id),key=c.id+'|'+S.serverView+'|'+(c.ttl||0);let R=S.rendered;
  const reuse=R&&R.key===key&&R.box===box&&R.ids.length&&R.ids.length<=ids.length&&R.ids.every((id,i)=>ids[i]===id)&&!posts.slice(R.ids.length).some(p=>p.svc==='ttl'); // a timer note entering the view redraws, so the unannounced-timer chip goes
  if(!reuse){
    box.replaceChildren();R=S.rendered={key,box,ids:[],lastDay:'',last:null,nodes:new Map()};
    if(!S.allLoaded&&S.posts.length){const ch=el('button','chip older-chip','Load earlier messages');ch.onclick=loadOlder;box.append(ch)}
    if(S.serverView)box.append(el('div','chip','This is all Hush ever stores: scrambled text. Turn it off in Settings.'));
    if(t!=='dm'){const ch=knownIn(c).filter(keyChanged);if(ch.length){const k=html('button','keychip',I.shield);k.append(el('span',null,`Security code changed for ${ch.slice(0,3).map(displayName).join(', ')}${ch.length>3?' and others':''}. Tap to review.`));k.onclick=()=>openProfile(ch[0]);box.append(k)}}
    if(c.ttl)box.append(html('div','chip ttl-chip',I.timerSm+`<span>New messages disappear after ${ttlLabel(c.ttl).toLowerCase()}</span>`));
    if(S.loaded){const tc=ttlChip(c,posts);if(tc)box.append(el('div','chip svc',tc))} // a timer change the other side did not announce; a chip, not a post: it never counts, reads or previews
    if(!posts.length&&more){box.append(more);return}
    if(!posts.length){if(!S.loaded){if(S.db&&!S.db.online&&(!S.db.error||/out of date/.test(S.db.error))){const n=el('div','chip',S.db.error?'This copy of Hush is out of date. Close Hush and open it again.':'Connecting…');n.setAttribute('role','status');box.append(n)}return} // an empty box, not the empty-chat notice, until the first snapshot has been decrypted; and while a connection is on its way it says so (not after the version error: nothing is connecting then, and the banner says to reload)
      const n=el('div','notice');n.innerHTML=isSelf(c)?I.bookmarkBig:t==='channel'?I.megaBig:I.lockBig;
      n.append(el('div',null,isSelf(c)?'Saved Messages is your private notepad. Forward messages here, or save notes, links, photos and voice memos. Only you can read them.'
        :t==='dm'?`Messages with ${convTitle(c)} are end-to-end encrypted. Tap their name to see their profile and verify your security code.`
        :t==='group'?'Messages in this group are end-to-end encrypted. Only members can read them. Say hi!'
        :isAdmin(c)?'Your channel is ready. Post text, HD photos, GIFs, videos, voice and polls. Only your subscribers can read them.'
        :'No posts yet. When '+displayName(c.owner)+' broadcasts, posts will show up here.'));
      box.append(n);return;
    }
  }
  let added=0;
  posts.forEach((p,i)=>{
    const o=opened[i],ex=R.nodes.get(p._id);
    if(ex){
      if(ex._sig!==p.sig){const n=msgNode(c,p,o,ex._cont);if(!ex.querySelector('.bubble.tail'))n.querySelector('.bubble')?.classList.remove('tail');ex.replaceWith(n);R.nodes.set(p._id,n);if(R.last&&R.last.node===ex)R.last.node=n}
      else if(ex._pending&&!p._pending){ex._pending=false;ex._refresh&&ex._refresh()}
      return;
    }
    const day=fmtDay(p.ts);if(day!==R.lastDay){box.append(el('div','chip day',t==='channel'?day:day+' · Sealed end to end'));R.lastDay=day;R.last=null}
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
  if(R.more)R.more.remove();R.more=more;if(more)box.append(more);
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
  if(t==='group'&&!mine&&!cont){const n=el('div','post-from',displayName(p.from));withBadge(n,p.from);if(isAdminH(c,p.from))n.append(el('span','role-sm',p.from===c.owner?'owner':'admin'));b.append(n)}
  const parts=[];
  if(S.serverView)b.append(el('span','cipher',p.ct.slice(0,160)+'\u2026'));
  else if(o.text==null){if(o.nokey)noKeyNotice(c,p.e??0);b.append(el('span','bad',o.nokey?(typeOf(c)==='dm'?'Sent before this device was added, so it can\u2019t be shown here.':walkBad.has(c.id)?'This channel\u2019s history doesn\u2019t check out, so this post can\u2019t be opened.':'Sent before you joined on this device, so it can\u2019t be shown here.'):'Couldn\u2019t decrypt this message.'))}
  else{
    if(o.call){const n=html('span','call-log'+(callMissed(o.call)?' missed':''),I.phoneSm);n.append(el('span',null,callText(o.call)));b.append(n)} // the rest is empty: openPost keeps nothing else of an entry
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
    const ttl=(cc.ttl||0)*1000,lm=lifeMark(p,ttl);if(p.exp||ttl){meta.insertAdjacentHTML('beforeend',I.timerSm);if(lm){const s=el('span','life',lm);s.title='This message lives longer than the chat\u2019s timer';meta.append(s)}} // a flipped timer shows on the message itself
    if(t==='channel'){if(p.from!==cc.owner){meta.append(displayName(p.from));withBadge(meta,p.from);meta.append('\u2003')}const v=readCount(p);if(v){meta.insertAdjacentHTML('beforeend',I.eyeSm);meta.append(v+'\u2003')}}
    meta.append((p.edited?'edited ':'')+fmtTime(p.ts));
    if(mine&&t!=='channel'&&!self)meta.insertAdjacentHTML('beforeend',wrap._pending?I.clock:readCount(p)?I.two:I.one);
    if(cmt){const n=S.ccount.get(p._id)||0;cmt.hidden=cc.comments===false&&!n;cmt.lastChild.textContent=n?(n===1?'1 comment':n+' comments'):'Leave a comment'}
    parts.forEach(x=>x._refresh());
  };
  b.onclick=e=>{if(wrap._noClick&&Date.now()-wrap._noClick<600){e.stopPropagation();return} // the tap that ends a hold: swallowed here, or it would close the menu the hold just opened
    const sel=window.getSelection&&String(getSelection());if(sel)return;e.stopPropagation();msgMenu(b,p,o)};
  addLongPress(wrap,()=>msgMenu(b,p,o,true),b); // press and hold anywhere on it (text, photo, video, the time over a photo); a right click too
  if(o.text!=null&&!o.call&&!S.serverView)addSwipe(wrap,{dir:-1,max:72,threshold:52,target:b,on:()=>{const cc=curConv();if(cc&&canPost(cc))setReply(p,o)}});
  wrap._refresh();return wrap;
}
function jumpTo(id){
  const n=S.rendered&&S.rendered.nodes.get(id);if(!n){toastErr('That message isn\u2019t loaded or was deleted.');return}
  n.scrollIntoView({block:'center',behavior:'smooth'});n.classList.remove('flash');void n.offsetWidth;n.classList.add('flash');
}
function msgMenu(anchor,p,o,quiet){ // quiet: a press-and-hold already gave the haptic tap
  const had=document.querySelector('.msgmenu');closeMenus();if(had&&had._for===p._id)return;
  const c=curConv();if(!c||S.serverView)return;
  const t=typeOf(c),mine=p.from===S.me.handle,admin=isAdmin(c),member=isMember(c);
  const m=el('div','popmenu msgmenu');m._for=p._id;
  if(member&&o.text!=null&&!isSelf(c)){const cfg=reactCfg(c);if(cfg.mode!=='off'){const a=S.agg.get(p._id)||{};const st=el('div','rstrip');
    cfg.allowed.forEach(e=>{const b=el('button','rp'+(a.myR===e?' me':''),e);b.setAttribute('aria-label','React '+e);
      b.onclick=async()=>{m.remove();try{await setAct(curConv(),p._id,'r',a.myR===e?null:{emoji:e})}catch{toastErr('Reaction not saved. Check your connection and try again.')}};st.append(b)});
    m.append(st)}}
  const items=[];
  if(canPost(c)&&o.text!=null&&!o.call)items.push([I.reply,'Reply',()=>setReply(p,o)]);
  if(FEATURES.channelComments&&t==='channel'&&o.text!=null)items.push([I.comment,'Comments',()=>openComments(p,o)]);
  if(canPin(c)&&o.text!=null&&!o.call)items.push([I.pin,(c.pins||[]).includes(p._id)?'Unpin':'Pin',()=>{haptic();togglePinMsg(c,p)}]);
  if(o.text!=null&&!o.poll&&!o.call)items.push([I.fwd,'Forward',()=>openForward(p,o)]);
  if(o.text)items.push([I.copy,'Copy text',async()=>{try{await navigator.clipboard.writeText(plainText(o.text));haptic();toast('Copied')}catch{toastErr('Copying isn\u2019t allowed here. Press and hold the text to select it.')}}]);
  if(mine&&o.text!=null&&!o.poll&&!o.call&&S.comp)items.push([I.edit,'Edit',()=>setEdit(p,o)]);
  if(mayReport(c,p,mine))items.push([I.flag,'Report',()=>reportMenu(anchor,c,p)]);
  if(!mine&&validHandle(p.from)&&!isSelf(c)&&p.sv!==1&&!p.svc)items.push(isBlocked(p.from)?[I.x,'Unblock '+displayName(p.from),()=>{unblockPeer(p.from);toast(displayName(p.from)+' unblocked')}]:[I.x,'Block '+displayName(p.from),()=>confirmBlockPerson(p.from),'danger']);
  if(o.poll&&!(c.closed&&c.closed[p._id])&&(mine||admin))items.push([I.chart,'Stop poll',async()=>{try{await S.db.doc('channels/'+c.id).update({closed:{[p._id]:true}})}catch{toastErr('Couldn\u2019t stop the poll. Try again.')}}]);
  const forAll=['Delete for everyone',async()=>{try{await deletePost(c.id,p)}catch{toastErr('Couldn\u2019t delete it. Try again.')}}];
  items.push([I.trash,'Delete',()=>deleteMenu(anchor,isSelf(c)?[['Delete',forAll[1]]]:[['Delete for me',()=>hideMsg(c.id,p._id)],...(mayDeleteForAll({t,mine,admin,owner:isOwner(c),byOwner:!!c.owner&&p.from===c.owner})?[forAll]:[])]),'danger']);
  items.forEach(([ic,label,fn,cls])=>{const b=html('button','menu-item'+(cls?' '+cls:''),ic);b.append(el('span',null,label));b.onclick=()=>{m.remove();fn()};m.append(b)});
  if(!m.children.length)return;
  if(!quiet)haptic(); // the message menu opened by a tap
  placeMenu(m,anchor);
}
/* ---------- owner tools: reactions, polls, removing people ---------- */
const EMOJIS=['\u{1F44D}','\u{1F44E}','\u2764\uFE0F','\u{1F525}','\u{1F389}','\u{1F601}','\u{1F602}','\u{1F62E}','\u{1F622}','\u{1F64F}','\u{1F44F}','\u{1F914}','\u{1F4AF}','\u{1F92F}','\u{1F440}','\u{1F3C6}'];
function reactCfg(c){const r=(c&&c.reactions)||{},mode=['all','some','off'].includes(r.mode)?r.mode:'all';
  return {mode,allowed:mode==='all'?EMOJIS:mode==='some'?(r.allowed||[]).filter(e=>EMOJIS.includes(e)):[]}}
async function setAct(c,postId,kind,payload){
  const e=epochOf(c),ck=await convKey(c,e);if(!ck)throw new Error('nokey');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  if(typeOf(c)==='channel')return S.db.act(c.id,postId,kind,e,b64(iv),b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:actAD(c.id,postId,kind)},ck.key,enc.encode(padNote(payload,64))))); // no tag, no signature, one size: nobody can tell whose it is or, from its length, what it picked (SPEC.md 5.4)
  const tag=await memTag(c,e,S.me.handle);if(!tag)throw new Error('nokey');
  const ref=S.db.doc(`channels/${c.id}/acts/${postId}~${tag}~${kind}`);
  const p=JSON.stringify(payload); // the signature travels inside, with exactly what it signs
  const ct=b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(`${c.id}|${postId}|${tag}|${kind}`)},ck.key,enc.encode(JSON.stringify({p,sg:await sideSig('hush-act-v2',[c.id,postId,kind,tag,p])}))));
  await ref.set({post:postId,kind,e,iv:b64(iv),ct,ts:Date.now()});
  S.db.doc(`channels/${c.id}/acts/${postId}~${S.me.handle}~${kind}`).delete().catch(()=>{}); // tidy away the old named one
}
function openAct(c,v){
  const key='a:'+S.me.handle+':'+(v._id||'')+':'+v.ct;
  if(!S.cache.has(key))S.cache.set(key,(async()=>{try{
    const e=v.e??0,chan=typeOf(c)==='channel';let by=v.by,who=v.by;
    if(chan&&v.an!==1)throw 0; // a row from before chat.act, as an older server still hands out: it counts for no one (SPEC.md 5.4)
    if(!chan&&!by){const parts=String(v._id||'').split('~');if(parts.length!==3)throw 0;who=parts[1];
      by=(await tagMap({...c,members:tagPeople(c)},e))[who];
      if(!by||(v.sg&&!(await sideOk(by,v.sg,'hush-act-v1',[c.id,v.post,v.kind,who,v.ct]))))throw 0} // a plain signature: left by an app from before release 18
    const ck=await convKey(c,e);if(!ck)throw 0;
    let o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:chan?actAD(c.id,v.post,v.kind):enc.encode(`${c.id}|${v.post}|${who}|${v.kind}`)},ck.key,unb64(v.ct))));
    if(!chan&&!v.by&&!v.sg){if(typeof o.p!=='string'||!(await sideOk(by,o.sg,'hush-act-v2',[c.id,v.post,v.kind,who,o.p])))throw 0;o=JSON.parse(o.p)} // signed inside
    if(v.kind==='r'&&typeof o.emoji==='string'&&o.emoji.length<=16)return {post:v.post,by,kind:'r',emoji:o.emoji};
    if(v.kind==='v'&&Array.isArray(o.opts))return {post:v.post,by,kind:'v',opts:[...new Set(o.opts.filter(n=>Number.isInteger(n)&&n>=0&&n<10))]};
  }catch{}S.cache.delete(key);return null})());
  return S.cache.get(key);
}
function ownActs(c,list){ // ids: this account's own rows known for this chat (chat.mine, kept per post since they never change); asked: the asking about the posts not known yet; a refusal is not kept, so the next change asks again
  const k='m:'+S.me.handle+':'+c.id,m=S.cache.get(k)||{posts:new Set(),ids:new Set()},todo=[...new Set(list.filter(Boolean).map(x=>x.post))].filter(p=>!m.posts.has(p));S.cache.set(k,m);
  return {ids:m.ids,asked:(async()=>{try{for(let i=0;i<todo.length;i+=300){const part=todo.slice(i,i+300);(await S.db.mine(c.id,part)).forEach(id=>m.ids.add(id));part.forEach(p=>m.posts.add(p))}}catch{}})()}}
let actSeq=0;
async function onActs(docs){
  const seq=++actSeq,c=curConv();if(!c)return;
  const list=await Promise.all(docs.map(d=>openAct(c,d)));if(seq!==actSeq)return;
  const chan=typeOf(c)==='channel',draw=own=>{const agg=new Map(),seen=new Set(),members=new Set(tagPeople(c));
    list.forEach((x,n)=>{if(!x||(!chan&&!members.has(x.by)))return;const me=chan?own.has(docs[n]._id):x.by===S.me.handle,k=x.post+'|'+(chan?docs[n].ct:x.by)+'|'+x.kind,dup=seen.has(k);if(dup&&!chan)return;seen.add(k); // in a channel a sealed row counts once, wherever copies of it sit; your own is still your own
      const a=agg.get(x.post)||{r:{},myR:null,v:{},myV:null,voters:0};
      if(x.kind==='r'){if(!dup)a.r[x.emoji]=(a.r[x.emoji]||0)+1;if(me)a.myR=x.emoji}
      else if(x.opts.length){if(!dup){a.voters++;x.opts.forEach(i=>a.v[i]=(a.v[i]||0)+1)}if(me)a.myV=x.opts}
      agg.set(x.post,a)});
    S.agg=agg;refreshNodes()};
  if(!chan)return draw();
  const {ids,asked}=ownActs(c,list),found=()=>docs.filter((d,n)=>list[n]&&ids.has(d._id)).length,had=found();
  draw(ids); // the counts first, so a slow chat.mine holds none back; the ids known so far keep your own mark on through a later change
  await asked;if(seq===actSeq&&found()!==had)draw(ids); // again only if its answer found a row of yours among these, and these are still the newest
}
function refreshNodes(){if(S.rendered)S.rendered.nodes.forEach(n=>n._refresh&&n._refresh())}
function reactNode(p){
  const w=el('div','reacts');
  w._refresh=()=>{
    const c=curConv();if(!c)return;const cfg=reactCfg(c),a=S.agg.get(p._id)||{r:{}},member=isMember(c);w.replaceChildren();
    const entries=cfg.mode==='off'?[]:Object.entries(a.r).filter(([e])=>cfg.allowed.includes(e)).sort((x,y)=>y[1]-x[1]);
    w.hidden=!entries.length;
    entries.forEach(([e,n])=>{const b=el('button','rc'+(a.myR===e?' me':''),e+' '+n);b.disabled=!member;b.setAttribute('aria-pressed',a.myR===e);
      b.onclick=async ev=>{ev.stopPropagation();try{await setAct(curConv(),p._id,'r',a.myR===e?null:{emoji:e})}catch{toastErr('Reaction not saved. Check your connection and try again.')}};w.append(b)});
  };
  return w;
}
function pollNode(p,poll){
  const w=el('div','poll'),q=el('div','poll-q',poll.q),kind=el('div','poll-kind'),list=el('div'),foot=el('div','poll-foot');w.append(q,kind,list,foot);
  const pending=new Set();w.onclick=e=>e.stopPropagation();
  const vote=async opts=>{try{await setAct(curConv(),p._id,'v',opts?{opts}:null);pending.clear()}catch{toastErr('Vote not saved. Check your connection and try again.')}};
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
  if(opt.why&&!v.members.includes(h))return; // a leave another page already handled
  v.members=v.members.filter(x=>x!==h);const wasAdmin=v.admins.includes(h);v.admins=v.admins.filter(x=>x!==h);
  if(c.visibility==='public'){if(wasAdmin){await S.db.doc('channels/'+cid).update({admins:v.admins});await rotateAdmins(cid,v.admins)}return} // nothing to lock: public posts are public
  if(wasAdmin&&isOwner(shown))try{await setAdmins(cid,v.admins,undefined,true)}catch(e){if(e&&e.message==='badkey')e.noBan=true;throw e} // first the admin key and the owner's sealed list: a blocked admin can't lift the block with the key; no link joiner listed first (noList): this block's key change leaves them out; a badkey here placed no block yet (noBan: the toast says so)
  let full=false;if(opt.ban!==false){v.banned=[...new Set([...v.banned,h])];await S.db.banChat(cid,h,true).catch(e=>{if(!e||e.code!=='toolarge')throw e;full=true})} // the server refuses their member key from here on; a full list still lets the new key leave them out
  const chan=typeOf(c)==='channel';let at=c; // at: the record the last key change was tried from
  try{try{await rotateTo(c,v,opt.why&&{why:opt.why})}
  catch(e){if(!e||e.code!=='conflict'&&e.code!=='toolarge')throw e; // toolarge: the record has no room for a key change
    const f=await freshChan(cid),w=metaOf(await showMeta(f)),still=w.members.includes(h);
    w.members=w.members.filter(x=>x!==h);w.admins=w.admins.filter(x=>x!==h);if(opt.ban!==false)w.banned=[...new Set([...w.banned,h])];
    if(chan&&e.code==='conflict'&&epochOf(f)===epochOf(c))throw e; // a channel keeps the lists-only way for toolarge only (SPEC.md 5.6): a refused key change (no chain row: this device lacks the key before) fails, and the block is lifted
    if(epochOf(f)!==epochOf(c)&&still)try{at=f;await rotateTo(f,w,opt.why&&{why:opt.why});return full?'full':undefined}catch(e2){if(!e2||e2.code!=='conflict'&&e2.code!=='toolarge'||chan&&e2.code==='conflict')throw e2} // another admin changed the key first: once more, from their record (in a channel a second conflict fails)
    // no key change left for this (leaves past their budget, anything at epoch 31), or theirs already left them out: the
    // lists only, never a retry (SPEC.md 5.6); a block stays on the server, which then is all that keeps them out
    if(still||opt.ban!==false){const m=chan?withJoin(w,await readRoll(f,w).catch(()=>null)):null; // a channel's open links stop in the same write, as a key change stops them (null: the merge keeps {}): whoever joined through one is listed in it, while they still vouch for them (readRoll)
      await S.db.doc('channels/'+cid).update(Object.assign({meta:await sealMetaFor(f,m||w)},chan?{invites:null}:{}));if(chan){ls.set('hush:inv:'+cid,null);recount(f)}}}}
  catch(e){if(opt.ban!==false&&!(e&&e.message==='badkey'))try{const f=await freshChan(cid);if(epochOf(f)===epochOf(at)&&!metaOf(await showMeta(f)).banned.includes(h))await S.db.banChat(cid,h,false)}catch{} // the record shows nothing applied since the last try (a lost reply may hide a key change that was): the server lets them in again, as the sealed list does; unsure, or with a key that didn't check out (badkey), they stay blocked
    throw e}
  return full?'full':undefined;
}
async function rotateAdmins(cid,admins,opts){ // a fresh admin secret, wrapped to the owner and the current admins only; opts.keep: replaced by the page itself (signAdminId, an adm card, a device removal), signed at its record's time, never a later one (sealMeta 'keep')
  const [c,shown]=await chatAnd(cid);const secret=crypto.getRandomValues(new Uint8Array(32)),who=[...new Set([shown.owner||S.me.handle,...admins])];
  const pc=typeOf(c)==='channel'&&c.visibility!=='public',wipe=!!(opts&&opts.wipe),old=pc&&!wipe?await verifiedAdmin(c):null,ah=pc&&await adminId(cid,secret);
  if(pc&&opts&&opts.keep&&!(rolesOf(cid)||{}).s)throw new Error('nokey'); // by the page itself, from an unsigned record: no secret is handed to a list this device could not verify, and nothing is written first (owner decision D1; the owner's own change, Make or Remove admin, signs her list afresh)
  await loadDir(who,true);const akeys={};for(const h of who)if(h===S.me.handle||S.dir[h])Object.assign(akeys,await wrapKey(secret,h,cid+'#a'));
  if(pc)noteOwnAh(cid,ah);await S.db.setAdmins(cid,akeys,await adminCapFrom(cid,secret));ksPut(cid,'a',b64(secret));
  if(pc){const m=ls.get(rolesKey(),{}),r=m[cid]=m[cid]||{};r.ak=Object.assign({},r.ak);for(const h of admins)if(h!==S.me.handle&&!keyChanged(h))r.ak[h]=(S.dir[h]||{}).kv||1;ls.set(rolesKey(),m)} // ak: each admin's account key version this secret went out under (rollRun replaces it by itself once one has risen); an admin whose new code isn't accepted here got no wrap (wrapKey), so their last noted version stays and the next secret, once it is accepted, reaches them
  for(const x of [S.chatDocs.get(cid),convById(cid)])if(x)x.akeys=akeys;
  if(!pc)return;const inv=(await freshChan(cid).catch(()=>c)).invites||{}; // a private channel's open links (SPEC.md 5.6 "Links across a key change"):
  let had=false;if(wipe){had=Object.keys(inv).length>0;if(had){await S.db.doc('channels/'+cid).update({invites:null});toast('Open invite links stopped working.','New link',()=>openInvite(cid,{auto:true}),8000)}ls.set('hush:inv:'+cid,null)} // an admin dropped knows every link's secret: they all stop (true when any did, for a caller whose own toast replaces this one)
  // then the record's list signed again naming the new secret's fingerprint (SPEC.md 5.6 "Key chain"): until it lands every page
  // refuses the new secret (verifiedAdmin), and when it fails this device's next open makes another (signAdminId, from noteOwnAh)
  if(c.ometa&&(!shown._ometa||shown._stale))throw new Error('nokey');await putOMeta(c,Object.assign(metaOf(shown),{_ah:ah,_rt:shown._rt}),null,!!(opts&&opts.keep));
  if(wipe)return had;
  if(old){const ups={};for(const [iid,x] of Object.entries(inv)){const s=x&&x.as&&await openAs(old,cid,iid,x.as);if(s)ups[iid]={as:await sealAs(secret,cid,iid,s)}} // admins only added: each `as` sealed again under the new secret, now signed
    if(Object.keys(ups).length)await S.db.doc('channels/'+cid).update({invites:ups}).catch(()=>{})} // best effort: a link left behind still joins, it just isn't carried across a leave
}
async function setAdmins(cid,admins,roll,noList){ // owner only: the sealed list and the admin keys change together; roll: rollRun's drop of the admins who left or were blocked (roll.gone), with the cards it read; noList: a block's first step (kickMember), whose key change leaves a link's joiners out
  const [c,shown]=await chatAnd(cid);if(roll)admins=(shown.admins||[]).filter(h=>!roll.gone.includes(h)); // rollRun's drop: from the list as it is now, so an admin change made while the cards were read stands
  const drop=(shown.admins||[]).some(h=>!admins.includes(h));if(roll&&!drop)return false; // dropping: the admin key first, so a failure between the two still names them and the next try (rollRun's too) finds them again; adding: named first
  if(c.visibility!=='public'&&(c.ometa&&(!shown._ometa||shown._stale)||!roll&&rolesHeld(cid)))throw new Error('nokey'); // an ometa this device can't open: writing one would wipe the rest; one older than its roles record would be signed again; and none while a copy of her list waits here past the date limit (rolesHeld), before anything is written
  const pc=drop&&typeOf(c)==='channel'&&c.visibility!=='public',sign=async()=>{ // the current key's commit may be the dropped admin's: the owner signs it again first, so every member's check (sealKey) still passes once the list leaves them out;
    const f=await freshChan(cid),e=epochOf(f),K=await sealKey(f,e);if(!K)throw new Error('nokey');const d=await S.db.doc('channels/'+cid+'/chain/'+e).get(); // from the record as it is now: a copy one key change behind would sign the row below the head
    if(d.exists){const p=e>0&&d.data().b!==undefined&&ksGet(cid,e-1),w=await chainRow(cid,e,K.raw,p&&unb64(p));await S.db.chain(cid,e,e>0?w.b||d.data().b:undefined,w.c)}return e}; // the key before as this device's store holds it (never the record's openKeys); the row's own only without it; a repair row (no b, repairKey) is signed again without one: the key she refused is never chained
  // rollRun's drop (SPEC.md 5.6 "Member cards"): the secret replaced at the record's rt with its list (keep), then a key change of the
  // owner's without them, so one they made meanwhile (an admin who left still could) is used no more, where signing it again would
  // vouch for it, then the list without them just after the record's rt ('next'); a failure before the list leaves them named, so the next open tries again
  if(pc&&!roll&&!noList)await listLinked(c,shown).catch(()=>{}); // not before a block's key change (noList); Remove admin stops every open link (rotateAdmins' wipe): whoever joined through one is listed first, while this page still opens its `as` (the secret goes below); best effort, as Revoke's rollRun is
  const signed=pc&&!roll&&await sign();
  const stopped=drop&&await rotateAdmins(cid,admins,{wipe:true,keep:!!roll}); // and every open link stops: the dropped admin knows their secrets
  if(pc&&roll){try{const f=await freshChan(cid),v=metaOf(await showMeta(f));v.members=v.members.filter(h=>admins.includes(h)||!shown.admins.includes(h));await rotateTo(f,v,undefined,{roll,joins:!roll.dev.length})}
    catch(e){if(!e||e.code!=='toolarge')throw e;await sign()}} // shortcut: with no room for a key change the current key is signed again as before, so one the dropped admin made stays in use until the next key change; prune old wrap tables (release 93) to close it
  else if(pc&&epochOf(await freshChan(cid))!==signed)await sign(); // a key change that landed meanwhile (one the dropped admin timed, say) is signed too, now that they can make none
  if(c.visibility==='public')await S.db.doc('channels/'+cid).update({admins});
  else{await handOver(c,shown);await putOMeta(roll?await freshChan(cid):c,Object.assign(metaOf(shown),{admins},roll?{_rt:shown._rt}:{}),null,roll&&'next')}
  if(!drop)await rotateAdmins(cid,admins);
  return !!stopped; // true when open links stopped: the caller's toast says so
}
async function repairKey(cid,members){ // Channel info's Repair (owner decision D1, SPEC.md 5.6 "The owner's repair"): a private channel whose current key this device refuses (badkey: a key a stale admin secret made, or a planted one) gets a fresh key for the list she confirmed (openRepair), its row her signed commit alone, no `b`, so the refused key is chained to nothing, then a fresh admin secret, since a stale one is what can freeze a channel; every open link stops with it (whoever froze it may know their secrets). From a signed record only: an unsigned one is handed no secret (D1)
  const [c,shown]=await chatAnd(cid),e=epochOf(c),me=S.me.handle;
  if(typeOf(c)!=='channel'||c.visibility==='public'||levelHere(c)!=='owner'||!shown._ometa||shown._stale||!(rolesOf(cid)||{}).s)throw new Error('nokey');
  if(!(await sealKey(c,e).then(()=>false,err=>{if(!err||err.message!=='badkey')throw err;return true})))throw Object.assign(new Error('conflict'),{code:'conflict'}); // only a current key this device refuses: one that checks out by now (repaired from another device of hers, say) is left alone
  const v=metaOf(shown);v.members=[...new Set([me,...v.admins,...(members||[])])];const lifted=v.banned.filter(h=>v.members.includes(h));v.banned=v.banned.filter(h=>!v.members.includes(h)); // her signed admins always, and the people she confirmed: her confirmation wins over the blocked list sealed under the refused key (whoever froze the channel wrote it, the sheet shows it as members), so anyone she kept is not blocked (lifted: their server block goes below) while a block from before the freeze, whose person the sheet did not show, stays; the name, description and admins are the owner's part, which only her key writes
  const n=e+1,raw=crypto.getRandomValues(new Uint8Array(32));await loadDir(v.members,true);
  const keys=await wrapAll(raw,v.members,cid,n),meta=await sealMeta(cid,n,raw,v),back=await chainRow(cid,n,raw,null),cap=await memberCapFrom(cid,n,raw);
  await S.db.rotateChat(cid,{epoch:n,keys,cap,meta,back});
  ksPut(cid,n,b64(raw));noteChained(cid);keyMade(cid,n,raw);chainRuns.delete(me+':'+cid); // the backfill run from before the repair counts no more: the chain no longer reaches below it, so links hand on every key held (handRaws)
  for(const x of [c,convById(cid),S.chatDocs.get(cid)])if(x){x.epoch=n;x.keys=Object.assign({},x.keys,{[n]:keys});x.meta=meta}
  recount(c);await rotateAdmins(cid,v.admins,{wipe:true,keep:true}); // the secret replaced and the list signed again naming it, under the repaired key
  for(const h of lifted)await S.db.banChat(cid,h,false).catch(()=>{});return n} // last, and best effort, as rollRun's lift is: the server's block whoever froze the channel placed on a person she kept ("Block from this channel" from a lost admin device, kickMember) would otherwise outlive the repair unseen, since the sealed list no longer names them (Blocked from this channel shows the list); a round trip here must neither widen the window before the stale secret is replaced nor, failing, call a repaired channel unrepaired
async function unban(cid,h){const [c,shown]=await chatAnd(cid);if(c.visibility==='public')return;if(!shown._unlocked)throw new Error('nokey'); // a list this device can't read would be sealed again empty
  await S.db.doc('channels/'+cid).update({meta:await sealMetaFor(c,Object.assign(metaOf(shown),{banned:(shown.banned||[]).filter(x=>x!==h)}))});
  await S.db.banChat(cid,h,false)} // after the sealed list: a failure leaves them blocked everywhere, not listed as blocked yet let in
const reconciled=new Set();
async function reconcileSvc(c,posts){ // an admin keeps the sealed member list in step with "joined" and "left" notes
  if(!c||typeOf(c)==='dm'||c.visibility==='public'||!isAdmin(c)||!c._unlocked)return; // only from a list this page read
  for(const p of posts||[]){if(!p||!p.svc||!['join','leave'].includes(p.svc)||!p.from||p.prev||reconciled.has(p._id))continue; // a note signed by a key its author has since replaced is shown, never acted on
    const members=c.members||[];
    const later=k=>posts.slice(posts.indexOf(p)+1).some(q=>q&&q.svc===k&&q.from===p.from);
    if(p.svc==='join'&&!members.includes(p.from)&&!(c.banned||[]).includes(p.from)&&(p.e??0)>=epochOf(c)&&!later('leave')){reconciled.add(p._id); // never someone blocked, nor a note from before the last key change (it may predate a removal), nor one they left after
      try{const [cur]=await chatAnd(c.id);await S.db.doc('channels/'+c.id).update({meta:await sealMetaFor(cur,Object.assign(metaOf(c),{members:[...members,p.from]}))});c.members=[...members,p.from];if(typeOf(c)==='channel')recount(c)}catch{reconciled.delete(p._id)}}
    else if(p.svc==='leave'&&members.includes(p.from)&&p.from!==S.me.handle&&!later('join')){reconciled.add(p._id); // a later "joined" from them outweighs it
      try{await kickMember(c.id,p.from,{ban:false,why:'leave'});c.members=members.filter(x=>x!==p.from)}catch{reconciled.delete(p._id)}}
  }
}
function noteAccepted(cid,posts){ // a reply, or an "accepted" note, from the person we asked: the request is over
  const i=dmInfo(cid);if(!i||i.req!=='out')return;const peer=dmPeer(convById(cid)||{id:cid});
  if((posts||[]).some(p=>p&&p.from===peer&&(p.svc==='accept'||!p.svc))){setDmInfo(cid,{req:'ok'});if(S.chan===cid)setTimeout(()=>openConv(cid),50)}
}
async function leaveChat(cid){ // tell the chat, then forget it; an admin rotates the key when they see the note
  const c=convById(cid);if(!c)return;
  if(c.visibility==='public'){const pub=P().pub||[];P().pub=pub.filter(x=>x!==cid);saveContacts()}
  else if(typeOf(c)==='channel')await writeCard(c,'leave').catch(()=>{}); // a card, written again at each start until the key changes (resendCards)
  else{try{await S.db.collection('channels/'+cid+'/posts').add(await sealSvc(c,'leave',0))}catch{}}
  if(S.forgetPointers)S.forgetPointers(cid);S.previews.delete(cid);
}
/* ---------- member cards (SPEC.md 5.6, release 92) ----------
   A private channel takes no notes from subscribers, so joining by link, leaving and a removed device are cards
   (sealCard) that an admin's page reads when it opens the channel (rollRun) and before every key change (rotateTo).
   Each card is noted on this device first (hush:cardsOut) and written again at a start until its effect shows. */
async function writeCard(c,k,i,mac,again){ // throws on failure: the caller decides; mac: a link joiner's `m` (joinMac), noted with the card
  const m=ls.get(cardsKey(),{}),o={k,e:epochOf(c),i:i||''};if(mac)o.m=mac;if(k==='adm')o.a=await akHash(c);m[c.id]=o;ls.set(cardsKey(),m);
  try{const d=await sealCard(c,k,i,mac);await S.db.card(c.id,d.e,d.iv,d.ct)}
  catch(e){if(again||!e||e.code!=='invalid')throw e;return writeCard(await freshChan(c.id),k,i,mac,true)} // an epoch this record hasn't reached: once more, from a fresh one
  const n=ls.get(cardsKey(),{});if(n[c.id]&&n[c.id].k===k&&n[c.id].e===o.e){n[c.id].sent=Date.now();ls.set(cardsKey(),n)}
}
const cardsKey=()=>'hush:cardsOut:'+S.me.handle;
const delCard=(cid,id)=>S.db.doc('channels/'+cid+'/roll/'+id).delete().catch(()=>{});
const akHash=async c=>hexOf(await crypto.subtle.digest('SHA-256',enc.encode(JSON.stringify(c.akeys||{}))));
const leaveWait=new Map(),rollBusy=new Map(),healTried=new Set(); // leaveWait: until when a leave key change is not tried again (a ratelimit); healTried: me:cid:epoch, once per load
function healCard(c){ // a member the list leaves out while holding the current key writes a join card again (the bug of release 91)
  const me=S.me&&S.me.handle,e=epochOf(c),k=me+':'+c.id+':'+e;
  if(!me||typeOf(c)!=='channel'||c.visibility==='public'||(c.banned||[]).includes(me)||healTried.has(k))return;
  const o=ls.get(cardsKey(),{})[c.id];
  if(!c._unlocked&&!(o&&o.k==='join'&&o.e===e))return; // no list to read (a preview, or a subscriber's page once the server hands the list to admins alone): only a join this device noted at the current epoch; after a key change, holding the key means an admin listed us
  healTried.add(k);
  if(o&&o.e===e&&(o.k!=='join'||o.sent>Date.now()-7*864e5))return; // one card per account: never over a pending leave, dev or adm card; a join sent this week stands (the server keeps it 30 days)
  const j=o&&o.k==='join'?o:{};return writeCard(c,'join',j.i,j.m).catch(()=>{})} // the link and `m` noted at the join; a joiner from release 91 noted none, so its card waits for an admin's Add
async function resendCards(){ // at a start: the cards whose effect hasn't shown yet, once more
  const me=S.me;if(!me)return;
  for(const [cid,o] of Object.entries(ls.get(cardsKey(),{}))){if(S.me!==me)return;
    const drop=()=>{const m=ls.get(cardsKey(),{});delete m[cid];ls.set(cardsKey(),m)};
    let f;try{f=await freshChan(cid)}catch(e){if(e&&(e.message==='gone'||e.code==='denied'))drop();continue} // deleted, or removed; anything else waits for the next start
    if(o.k==='adm'?o.a!==await akHash(f):o.k!=='join'&&epochOf(f)>o.e)drop(); // the admin secret was replaced, or the key changed: a leave or a lost device took effect; a join's entry stays, so healCard writes its link and `m` again if a later list leaves us out
    else if(o.k!=='join')await writeCard(f,o.k,o.i).catch(()=>{}); // a join is written again only by healCard, while the list leaves us out
    // shortcut: cardsOut is per device, so a re-join on another device before an admin's page ran is written over by this leave (one more removal, then the link again); check this account's inbox pointers if that shows up
    await pause(250)}}
async function readRoll(c,v,all){ // an admin's view of the cards that would act, each signature checked; all: Revoke's list, every epoch's join cards; wait: unlisted join cards not listed by themselves (no open link vouches for them at the current epoch), from this epoch or the one before
  const cur=epochOf(c),me=S.me.handle,out={join:[],wait:[],leave:[],dev:[],adm:[]},rows=[],seen=new Set(),dk=(rolesOf(c.id)||{}).dk||{},has=(a,h)=>(a||[]).includes(h);
  const own=levelHere(c)==='owner'&&v.admins.length>0&&!!(rolesOf(c.id)||{}).s; // the owner's page takes an admin's own leave card at any epoch but a public one (anyone may seal under its key), even under a meta naming them again (theirs may be): only it drops them (rollRun), and only from a signed record: on an unsigned one it drops none (D1), so the card kept there (rotateTo) acts as a member's, once, not at every open
  // shortcut: no other floor, so a card left behind (a failed delete, toolarge) drops an admin made one again within its 30 days; note when the signed list named each admin if that shows up
  let q=S.db.collection('channels/'+c.id+'/roll');if(!all&&!own)q=q.where('e','>=',cur-1); // shortcut: so it reads every card while the list names admins (at most 10,000); keep the newest card time read per channel if big channels show it
  try{for(let n=0,last=null;n<10;n++){ // a page at a time by the server's time; a tie at a page's edge is read twice and kept once
      const s=await (last===null?q:q.where('ts','>=',last)).orderBy('ts').limit(1000).get();
      for(const d of s.docs)if(!seen.has(d.id)){seen.add(d.id);rows.push(Object.assign({},d.data(),{id:d.id}))}
      if(s.size<1000)break;last=s.docs[s.docs.length-1].data().ts}}
  catch(e){if(e&&e.code==='denied')return Object.assign(out,{denied:true});throw e} // an admin whose connection holds only member level reads none (denied: rollRun and the notice's Add stop there)
  const cards=(await Promise.all(rows.filter(r=>r.iid===undefined).map(async r=>{const x=await openCard(c,r);return x&&Object.assign(x,{id:r.id})}))).filter(Boolean); // join requests (iid) are release 93's
  // join: unlisted, at the current epoch or the one before (the wait lasts through one key change); leave: listed, someone else; dev: listed; adm: an admin. Never a blocked author's.
  const would=cards.filter(x=>!has(v.banned,x.f)&&(x.k==='join'?all||x.e>=cur-1&&!has(v.members,x.f):own&&x.k==='leave'&&has(v.admins,x.f)&&!(c.openKeys||{})[x.e]||x.e>=cur-1&&(x.k==='dev'||has(x.k==='adm'?v.admins:v.members,x.f))&&(x.k!=='leave'||x.f!==me)));
  // Only in its author's slot (SPEC.md 5.6, release 93): the server tells this page the tag each author's card sits under, so a card written again from another account's slot counts for nothing. Fails closed: with no answer (a rate limit, offline) no card acts, never every card, and the caller's run fails for the next open; a stale key (conflict: a key change landed since this copy) is asked once more with the fresh one
  const hs=[...new Set(would.map(x=>x.f))];let tags=[];
  if(hs.length)try{tags=await S.db.slots(c.id,await memberCap(c,cur),hs)}catch(e){if(!e||e.code!=='conflict')throw e;const f=await freshChan(c.id);tags=await S.db.slots(c.id,await memberCap(f,epochOf(f)),hs)}
  const slot=new Map(hs.map((h,i)=>[h,tags[i]])),acts=would.filter(x=>slot.get(x.f)===x.id);
  if(acts.length)await loadDir([...new Set(acts.map(x=>x.f))],true); // the directory's key as of now, for the signatures and the dev rule
  for(const h of new Set(acts.map(x=>x.f)))if(!S.dir[h]){const s=await S.db.doc('directory/'+h).get(),v=s.exists?s.data():null;if(v&&v.ecdh&&v.sig)S.dir[h]=v} // loadDir swallows a failed read: an author it left no entry for is read once more and kept (loadDir's own entry test), so a dropped connection fails this read (rollRun: tried again later) instead of passing for a deleted account, whose card is dropped below
  // a join card counts only through its link: one whose `as` this admin opens with the admin secret the owner signed (open, or carried across a leave) and whose secret gives the card's `m`
  const a=acts.some(x=>x.k==='join')?await verifiedAdmin(c):null,secs=new Map();
  const linked=async x=>{const l=a&&x.i&&(c.invites||{})[x.i];if(!l||!l.as)return false;if(!secs.has(x.i))secs.set(x.i,openAs(a,c.id,x.i,l.as));const s=await secs.get(x.i);return !!s&&x.m===await joinMac(s,c.id,x.i,x.f)};
  for(const x of acts)if((x.k!=='dev'||((S.dir[x.f]||{}).kv||1)>Math.max(1,dk[x.f]||0))&&await cardSigOk(c,x)){ // a dev card counts once per new account key
    const k=x.k==='dev'&&!has(v.members,x.f)?'wait':x.k!=='join'?x.k:(all||x.e===cur)&&await linked(x)?'join':has(v.members,x.f)?null:'wait';if(k)out[k].push(x)} // listed by itself only at the current epoch, whose key it holds; any other join card's unlisted author waits for an admin's Add, which wraps the current key for them: for one key change after its own (a leave batch is never held back for them), so a leave that cut them off doesn't lose them
  return out}
// Link joiners the cards vouch for (readRoll's join) go into the list with no new key: their wraps came with the link, and never an
// unblock. rollRun does so at the open; so does a write that stops a link with no key change (Revoke, Remove admin, a block with no
// room for a key change), first, while the link's `as` still vouches for them, else they would wait (readRoll). Never with a dev card
// pending: its key change leaves them out (a lost device may know the link's secret); a removal's wipe lists no one for that reason too
const withJoin=(v,r)=>r&&r.join.length&&!r.dev.length?Object.assign({},v,{members:[...new Set([...v.members,...r.join.map(x=>x.f)])]}):null; // the list with them, or null with no one to add
async function listJoin(c,v,r){const w=withJoin(v,r);if(!w)return;await S.db.doc('channels/'+c.id).update({meta:await sealMetaFor(c,w)});const cv=convById(c.id);if(cv)cv.members=w.members;recount(c)}
const listLinked=async(c,shown)=>{if(!shown._unlocked)return;const v=metaOf(shown);await listJoin(c,v,await readRoll(c,v))}; // the cards read here, before the write
function rollRun(c){ // an admin's page acts on the cards when it opens the channel; one run at a time per channel, and a failure waits for the next open
  if(!c||typeOf(c)!=='channel'||c.visibility==='public'||!isAdmin(c)||S.rekeying)return Promise.resolve();
  if(rollBusy.has(c.id))return rollBusy.get(c.id);
  const cid=c.id,me=S.me,job=(async()=>{try{
    const [cur,shown]=await chatAnd(cid);if(!shown._unlocked)return null; // no current key on this device: nothing to act on, and the pass leaves the channel unstamped, with no wait (goLive: null, nothing was busy)
    await sealKey(cur,epochOf(cur)); // a planted current key stops everything here (badkey)
    if(levelHere(cur)==='owner')await signAdminId(cid).catch(()=>{}); // a signed list naming no admin secret (a channel from before release 92 the owner has saved once, say): a fresh one first, into this copy too (rotateAdmins), so the `as` below are under it
    await sealOldAs(cur).catch(()=>{}); // a link from before release 92 this device made: its `as` first, so the cards below count through it
    const v=metaOf(shown),r=await readRoll(cur,v),out=new Set(r.leave.map(x=>x.f));if(r.denied||S.me!==me)return null; // a read the server refused (member level only), or another account in meanwhile: nothing noted or written, and the pass leaves the channel unstamped, with no wait (goLive)
    noteWait(cid,shown.name,[...new Set(r.wait.map(x=>x.f))].filter(h=>h!==me.handle)); // who waits to join, for the chat list's notice
    await listJoin(cur,v,r);
    if(levelHere(cur)==='owner'&&shown._ometa&&!shown._stale&&(rolesOf(cid)||{}).s){ // the owner's page: an admin who left, or was blocked, stops being one (not from a copy older than its roles record, nor from an unsigned record: no fresh admin secret for a list this device could not verify, owner decision D1; the leaves below still go through)
      const gone=v.admins.filter(h=>!v.members.includes(h)||v.banned.includes(h)||out.has(h));
      if(gone.length){await setAdmins(cid,v.admins.filter(h=>!gone.includes(h)),Object.assign(r,{gone}));return} // with a key change without them, which applies the cards below too
      else{const ak=(rolesOf(cid)||{}).ak||{},up=v.admins.filter(h=>((S.dir[h]||{}).kv||1)>Math.max(1,ak[h]||0)&&!keyChanged(h)); // an admin whose account keys changed since this page last wrapped the admin secret to them (rotateAdmins' ak; none noted counts as the first version), once their new code is accepted here: a device removal of theirs leaves the lost device holding the secret, so it is replaced whether or not their adm card is still there (a lost device at admin level can delete it, or block it away: release 93b)
        if(up.length||r.adm.length&&!r.adm.some(x=>keyChanged(x.f))){await rotateAdmins(cid,v.admins,{wipe:true,keep:true});for(const x of r.adm)delCard(cid,x.id);await Promise.all(v.admins.map(h=>S.db.banChat(cid,h,false).catch(()=>{})))}}} // an adm card alone waits while its author's new security code isn't accepted here: the new secret would leave them out (wrapKey), and ak hands it on once it is. The admins she lists are let back in at the server: a block none of her lists has (the lost device's) would otherwise outlive the secret it was placed with and refuse the real admin's key changes, cards and blocks
    if((r.leave.length||r.dev.length)&&JSON.stringify(cur.keys||{}).length<=1e6){ // shortcut: past 1 MB of wrap tables leaves wait, until release 93 prunes old ones
      const a=(rolesOf(cid)||{}).a||[],carry=!r.dev.length&&!r.leave.some(x=>v.admins.includes(x.f)||a.includes(x.f)); // carry: open links may survive this one (SPEC.md 5.6 "Links across a key change")
      try{await rotateTo(cur,Object.assign({},v,{members:v.members.filter(h=>!out.has(h))}),{why:'leave'},{roll:r,joins:!r.dev.length,carry})}
      catch(e){if(!e||e.code!=='ratelimit')throw e;if(e.message!=='ratelimit'&&!/try again later/.test(e.message||''))return false}} // too soon after the last one (the server's own answer, 'try again later', or the wait it set, rotateTo's 'ratelimit'): the cards wait; any other rate limit (the connection's frame or posts budget, 'slow down'; a chat.open refused or timed out, 'the chat could not be opened') is a failure like any other, and nothing waits for it
  }catch(e){return e&&e.message==='badkey'?null:false}finally{rollBusy.delete(cid)}})(); // false: it failed, so the start's pass leaves the channel unstamped and waits longer (goLive); badkey (a current key this page refuses: an unsigned record, a planted key) is null, unstamped too, but nothing was busy, so the pass only pauses, and the next open or start tries again
  rollBusy.set(cid,job);return job}
/* The key chain's backfill (SPEC.md 5.6 "Key chain"): an owner's or admin's page writes the rows a private channel lacks,
   from the current key down, each key trusted because the row above opened to it (or this run just wrote that row from it).
   The key put in a row's `b` is one this device holds itself (stored, a wrap of mine or the walk), never the record's openKeys
   alone, and must match what the row above says; a missing row is written only below every row, a present one replaced only
   when the row below it is signed as a head's must be by an owner or admin on record (row 0, holding no key, under the key the
   chain gave), and nothing is written at or below a public epoch.
   A chained channel's head row is never written here: a current key it doesn't open may be planted. Once per load; true
   once the chain reaches every key this device holds or can unwrap (so a link or a wrap of the current key alone hands out as much). */
const chainRuns=new Map(); // me:cid → this load's backfill
function ensureChain(c){
  const cid=c&&c.id,k=S.me&&cid&&S.me.handle+':'+cid;
  if(!k||!S.db||typeOf(c)!=='channel'||c.visibility==='public'||S.rekeying)return Promise.resolve(false);
  if(!chainRuns.has(k))chainRuns.set(k,(async()=>{
    const cur=epochOf(c),ps=[],rows=[];for(let j=0;j<=cur;j++)ps.push('channels/'+cid+'/chain/'+j);
    for(let i=0;i<ps.length;i+=300)for(const d of await S.db.mgetChat(cid,ps.slice(i,i+300)))rows.push(d.exists?d.data():null); // opens the chat first, when it isn't yet
    if(!['owner','admin'].includes(S.db.chatLevel(cid)))return false;
    const any=rows.some(Boolean),top=await convKey(c,cur);if(any)noteChained(cid);
    else if((rolesOf(cid)||{}).ch||S.db.chatLevel(cid)!=='owner'&&!(rolesOf(cid)||{}).s)return false; // no rows, on a channel this device saw chained: the server hides them, maybe for a head key it planted, under which a first backfill would seal every real key; nor by an admin whose record is unsigned (a channel from before release 92 the owner hasn't signed yet): the head row it would sign counts for nothing on every member (rolesPass), which would refuse the current key
    if(!top||!top.raw)return false;
    const below=async j=>{if(Object.keys(ksMap()[cid]||{}).some(x=>/^\d+$/.test(x)&&Number(x)<j))return true; // a key below a gap: held, or in a wrap of mine not opened yet (allRaws would hand it on)
      for(const x of epochsOf(c))if(x<j-1&&await convKey(c,x))return true;return false};
    // shortcut: a wrap of mine counts as mine, though a server could swap one in for an epoch this device never opened, hide the rows below and have older keys sealed under it; keep where each stored key came from (wrap, chain, link) if that has to close
    let K=top.raw,read=0;
    for(let j=cur;j>=0;j--){
      if(c.openKeys&&c.openKeys[j])return false; // a public epoch (a channel made public, then private again): anyone may seal a row under its key, so nothing is followed or written from here, and links hand on every key
      const r=rows[j],o=r?await openCommit(cid,j,K,r.c):null,good=!!o&&o.m==='full';
      if(j===cur&&any&&!(good&&await headOk(c,cur,K)))return false; // the head of a chained channel: written only by a key change, and followed only once its commit checks out
      if(good&&j>0&&!r.b)return false; // the owner's repair row (SPEC.md 5.6 "The owner's repair", repairKey): the chain ends here by her word, so nothing below it is followed or written and a key she refused is never chained over it, whatever the row below would pass; links then hand on every key held (handRaws)
      const Kp=j>0?await convKey(Object.assign({},c,{openKeys:null}),j-1):null,kp=Kp&&Kp.raw;if(j>0&&!kp)return !(await below(j)); // row j needs the key before it, this device's own (the walk may have brought it), never the record's openKeys alone
      const p=good&&j>0?await openBack(cid,j,K,r.b):null;
      if(good&&(j===0||p&&b64(p)===b64(kp))){K=kp;continue}
      // a row that doesn't open, or names another key before, is replaced only when the held key opens the row below and its
      // commit checks out as a head's must, by an owner or admin on record, never at first sight (a key this device was handed,
      // a planted wrap say, must not overwrite a good row); row 0, which holds no key, under the K the chain gave; one not
      // marked full, or the head, never; a missing one only below every row (a channel from before the chain)
      if(r?o&&!good||j===cur||j>0&&(!rows[j-1]||!(await headOk(c,j-1,kp,1))):rows.slice(0,j).some(Boolean))return false;
      if(!read++&&epochOf(await freshChan(cid))!==cur)return false; // before the first write, the record as it is now: one past this copy (a key change it hasn't caught up with) would be left with its head missing above these rows
      const w=await chainRow(cid,j,K,kp);await S.db.chain(cid,j,w.b,w.c);noteChained(cid);await pause(250);K=kp}
    return true})().then(ok=>{if(!ok)chainRuns.delete(k);return ok},()=>{chainRuns.delete(k);return false})); // not done: the next open tries again
  return chainRuns.get(k)}
async function handRaws(c){ // the keys a link, Add or Resend hands on, { epoch: key }: in a private channel the current one alone once the chain reaches every key held (ensureChain), else every key held as before; never under a current key whose commit doesn't check out (sealKey)
  const e=epochOf(c),ok=await ensureChain(c),K=await sealKey(c,e);return ok&&K?{[e]:b64(K.raw)}:allRaws(c)}
/* Open links across a leave's key change (SPEC.md 5.6 "Links across a key change"): each link whose `as` this admin opens is
   sealed again for the new key alone, the same { epoch: key } map a link holds; one without `as`, or whose `as` doesn't open, is wiped.
   Here, in keptLink and in sealOldAs, only with the admin secret the owner signed (verifiedAdmin): with none, nothing. */
async function carryLinks(c,e,raw){
  const a=await verifiedAdmin(c),out={};if(!a)return out;
  for(const [iid,x] of Object.entries(c.invites||{})){const s=x&&x.as&&await openAs(a,c.id,iid,x.as);if(!s)continue;
    const iv=crypto.getRandomValues(new Uint8Array(12)),ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},await inviteKey(s,c.id,iid),enc.encode(JSON.stringify({[e]:b64(raw)})));
    out[iid]={iv:b64(iv),ct:b64(ct),ph:x.ph,ts:x.ts,as:x.as}}
  return out}
async function keptLink(c){ // the newest open link whose `as` this device opens, so the invite sheet shows (and Revoke stops) a link another admin's device made
  const a=await verifiedAdmin(c);if(!a)return null;
  for(const [iid,x] of Object.entries(c.invites||{}).sort((p,q)=>(q[1].ts||0)-(p[1].ts||0))){const s=x&&x.as&&await openAs(a,c.id,iid,x.as);
    if(s){const inv={iid,secret:b64u(s),h:S.me.handle};ls.set('hush:inv:'+c.id,inv);return inv}}
  return null}
// A link this device shows, made by a page from before release 92, has no `as`: sealed now from the secret kept here, so every
// admin's page vouches for its joiners (readRoll) and a leave carries it. rollRun, before it reads the cards.
// shortcut: a link whose secret no device kept (made on one logged out since) never gets one: its joiners wait and a leave stops it; revoke and share it again at go-live if that shows up
async function sealOldAs(c){const inv=ls.get('hush:inv:'+c.id,null),x=inv&&(c.invites||{})[inv.iid],a=x&&!x.as?await verifiedAdmin(c):null;if(!a)return;
  const as=await sealAs(a,c.id,inv.iid,unb64u(inv.secret));await S.db.doc('channels/'+c.id).update({invites:{[inv.iid]:{as}}});x.as=as}
// The owner's page, for a private channel whose signed roles record names no admin secret (one from before release 92 she has
// signed by hand, or made private again), or names one other than its own last one whose list didn't land (noteOwnAh, still in akeys): a fresh secret,
// its fingerprint signed at the record's time (rotateAdmins' keep), so none a server slipped in is ever taken and no older list
// comes back. rollRun, after its key check; the start's pass may call it per channel. True when it made one.
async function signAdminId(cid){const [c,shown]=await chatAnd(cid);
  if(S.rekeying||typeOf(c)!=='channel'||c.visibility==='public'||levelHere(c)!=='owner'||!shown._ometa||shown._stale||await verifiedAdmin(c))return false;
  const r=rolesOf(cid)||{};if(!r.s||r.h&&!(r.p&&await verifiedAdmin(c,true,r.p)))return false; // an unsigned record (a list this device could not verify) is handed no secret (owner decision D1); one signed that no wrap matches, and not this device's own: a device the server kept a later change from, one added since, or akeys swapped, replace nothing (fail closed)
  const out=new Set(shown.admins.length?(await readRoll(c,metaOf(shown))).leave.map(x=>x.f):[]); // an admin whose leave card waits (kept while her list was unsigned, rotateTo) gets no wrap of the fresh secret: rollRun's drop, right after this, signs the list without them; a read that fails makes no secret (the caller's run reads the cards itself and fails there too); with no admin named there is no one to leave out, so no read
  await rotateAdmins(cid,shown.admins.filter(h=>!out.has(h)),{keep:true});return true}
const tickRow=(h,boxes)=>{const l=el('label','thread'),cb=el('input'),m=el('div','t-main');cb.type='checkbox';cb.value=h;boxes.push(cb); // one person to tick (Revoke and change the key, Add subscribers' waiting list)
  m.append(withBadge(el('div','t-name',displayName(h)),h),el('div','t-sub',atOf(h)));l.append(cb,m);return l}; // the @username too: anyone can copy a display name
/* A channel link's two Revoke options (SPEC.md 5.6 "Member cards"): the link alone, or, for a link that leaked, a new key that
   leaves out whoever joined through it and everyone still waiting, unless an admin ticks them; that one stops every open link. */
function openRevoke(cid,iid){
  const {body,close}=sheet('Revoke link'),host=el('div'),fail=()=>toastErr('That didn’t go through. Check your connection and try again.');
  const one=el('button','menu-item danger flush','Revoke'),both=el('button','menu-item danger flush','Revoke and remove people who joined with it');
  one.onclick=async()=>{if(!confirmDanger('Revoke this link? It stops working for anyone who hasn’t joined yet.'))return;
    try{await rollRun(convById(cid));await revokeInvite(cid,iid);close();toast('Link revoked')}catch{toastErr('Couldn’t revoke it. Check your connection and try again.')}}; // the cards first, as opening the channel does: whoever joined through it since is listed while the link still vouches for them
  both.onclick=async()=>{if(both.disabled)return;both.disabled=true;host.replaceChildren(el('p','hint','Loading…'));
    try{const [c,shown]=await chatAnd(cid);if(!shown._unlocked)throw new Error('nokey');
      const v=metaOf(shown),r=await readRoll(c,v,true),who=a=>[...new Set(a.map(x=>x.f))].filter(h=>h!==S.me.handle&&!isAdminH(v,h)),boxes=[],rows=[]; // never the owner or an admin: they hold the admin secret, so only Remove admin or a block cuts them off
      // shortcut: a listed joiner can still replace their own card with one naming no link and so miss "Joined with this link"; keep each member's link in the sealed list (release 93) if that has to close
      const mine=who(r.join.filter(x=>x.i===iid)),wait=who([...r.join.filter(x=>x.i!==iid&&!v.members.includes(x.f)),...r.wait].sort((p,q)=>p.ts-q.ts)); // by this link, as its `m` shows; the server keeps one card per account
      for(const [t,hs] of [['Joined with this link',mine],['Waiting to join',wait]])if(hs.length)rows.push(el('div','menu-label flush',t),...hs.map(h=>tickRow(h,boxes))); // listed or not, then everyone else not listed yet; none ticked
      const l=(c.invites||{})[iid],blind=!l||!l.as||!(await verifiedAdmin(c)); // a link with no `as`, or a device holding no admin secret the owner signed: no card counts as this link's (readRoll's linked), so "Joined with this link" can't be shown here, and the sheet says so rather than "no one"
      if(blind)rows.push(el('p','hint',levelHere(c)==='owner'&&!(rolesOf(cid)||{}).s?'This channel’s admin list isn’t signed yet, so this device can’t tell who joined with this link and can’t remove them here. In Channel info, tap Edit and Save to sign it, then open the channel again. You can still revoke the link.' // the owner's own unsigned record (a channel from before release 92 she hasn't saved yet, owner decision D1): no admin secret counts here until she signs the list, so the hint names the one manual step, and her next open makes the secret
        :'This device can’t show who joined with this link, so it can’t remove them here. The channel’s owner hasn’t confirmed this device as an admin’s yet, or the link was made with an older version of Hush. You can still revoke the link.'));
      else if(!boxes.length)rows.push(el('p','hint','No one who joined with this link in the last 30 days is listed, and no one is waiting.'));
      else rows.push(el('p','hint','Changed your mind? Most people you remove here stay under Waiting to join for now, so you can add them back. Anyone else needs a new link.'));
      const go=el('button','primary','Remove and revoke');go.disabled=blind;rows.push(go);host.replaceChildren(...rows); // owner decision D5: not from a device that can't tell who joined
      go.onclick=async()=>{if(!confirmDanger('Remove and revoke? Everyone you left unticked loses access. Open invite links stop working.'))return;go.disabled=true;
        try{await revokeRekey(cid,iid,boxes.filter(b=>b.checked).map(b=>b.value),boxes.filter(b=>!b.checked).map(b=>b.value));close();
          toast('Invite link reset. Share a new one.','New link',()=>openInvite(cid,{auto:true}),8000)}catch{go.disabled=false;fail()}}}
    catch{both.disabled=false;host.replaceChildren();fail()}};
  body.append(one,el('p','hint','The link stops working. People who already joined stay. Someone who opened the link but didn’t join may still be able to read for a while. If the link got into the wrong hands, use the second choice.'),
    both,el('p','hint','For a link that got into the wrong hands. Tick the people who should stay. Everyone you leave unticked is removed. Only people who joined in the last 30 days are listed. All invite links for this channel stop working.'),host)}
async function revokeRekey(cid,iid,ticked,left){ // the cards read again at confirm: this link's joiners, and everyone the sheet left unticked (listed meanwhile or not), get no new key unless ticked
  const me=S.me.handle,tk=new Set(ticked||[]);let [c,shown]=await chatAnd(cid);
  for(let n=0;;n++){const v=metaOf(shown),r=await readRoll(c,v,true),out=new Set([...(left||[]),...r.join.filter(x=>x.i===iid).map(x=>x.f)].filter(h=>h!==me&&!tk.has(h)&&!isAdminH(v,h)));
    v.members=[...new Set([...v.members,...tk])].filter(h=>!out.has(h)); // never an unblock (rotateTo leaves out anyone blocked, and every leave card's author), and no one waiting comes in: no join is folded
    try{return await rotateTo(c,v,undefined,{roll:r})} // no why, no carry: the server stops every open link; a list that didn't open leaves me out, which rotateTo refuses
    catch(e){if(n||!e||e.code!=='conflict')throw e;c=await freshChan(cid);shown=await showMeta(c)}}} // another admin changed the key first: once more, from their record
function openRepair(cid){ // Channel info's Repair (openConvInfo: the owner of a private channel whose current key this device refuses): who the fresh key goes to, as this device holds the list, for her to check first, since whoever made the refused key may have written the list sealed under it too; her signed admins are listed and not for unticking (Channel info changes admins)
  const c=convById(cid);if(!c)return;const {body,close}=sheet('Fix channel'),me=S.me.handle,adm=new Set(c.admins||[]),boxes=[];
  body.append(el('p','hint','Nobody can post in this channel right now. If an admin’s security code changed, accept the new code first and open the channel again. If that doesn’t help, someone who used to be an admin may have tampered with the channel. Fixing it gives the channel a fresh start. The invite link is reset.'));
  body.append(el('div','menu-label flush','Who keeps access'),el('p','hint','Check this list and untick anyone who shouldn’t be subscribed. Admins are the ones you confirmed. To change them, use Channel info first.'));
  for(const h of [...new Set([...adm,...(c.members||[])])].filter(h=>h!==me)){const r=tickRow(h,boxes),cb=boxes[boxes.length-1];cb.checked=true;if(adm.has(h)){cb.disabled=true;r.append(el('span','role','admin'))}body.append(r)}
  body.append(el('p','hint','People you add after this won’t see posts from before the fix. People who join with an invite link still see everything.'));
  const go=el('button','primary','Fix channel');body.append(go);
  go.onclick=async()=>{if(!confirmDanger('Fix the channel? Everyone you unticked loses access. The invite link is reset.'))return;go.disabled=true;
    try{await repairKey(cid,boxes.filter(b=>b.checked).map(b=>b.value));close();toast('Channel fixed. Invite link reset. Share a new one.','New link',()=>openInvite(cid,{auto:true}),8000)}
    catch(e){go.disabled=false;toastErr(e&&e.code==='conflict'?'The channel changed meanwhile. Open Channel info again.':'Couldn’t fix it. Check your connection and try again.')}}}
async function freshEpoch(cid){ // a post refused for an older key (sendBody): the record read again onto the chat's copy, and its ometa read first, so an admin added since is known when the new commit is checked (sealKey)
  const f=await freshChan(cid);noteChatDoc(f);const x=convById(cid);if(x)for(const k of ['epoch','keys','ttl','meta','ometa'])x[k]=f[k];
  await showMeta(f);return epochOf(f)}
/* The start's pass (SPEC.md 5.6 "The start's pass"): once the chat list is live, what opening each private channel this
   account owns or admins would do (rollRun), one channel at a time with a pause between (longer after one that failed), at most once a day per channel
   (hush:pass `at`, set only when the run went through: a failure leaves it for the next start and moves on), never the
   channel on screen (its own open does it), one tab at a time per account, and stopped by a change of account or a device
   removal. It never signs a list for the first time: a channel from before release 92 is signed by the owner, Edit then Save (owner decision D1). */
const passKey=()=>'hush:pass:'+S.me.handle,stampPass=cid=>{const m=ls.get(passKey(),{});m[cid]={at:Date.now()};ls.set(passKey(),m)};
async function goLive(me){ // one tab at a time per account (the stamps are shared through the sealed store): two tabs started together would each sign a fresh admin secret for every channel whose signed list names none
  await withLock('hush:pass:'+me.handle,{ifAvailable:true},async lock=>{if(!lock)return;let bad=0; // channels failed in a row, for the pause below
    for(const c of [...S.convs]){if(S.me!==me||S.rekeying||!S.db)return;
      if(typeOf(c)!=='channel'||c.visibility==='public'||c.id===S.chan||!isAdmin(c))continue;
      const cid=c.id,today=((ls.get(passKey(),{})[cid]||{}).at||0)>Date.now()-864e5;let ok=today,r;
      try{if(!today&&(r=await rollRun(c))!==false){ok=true;if(r!==null&&S.me===me)stampPass(cid)}}catch{ok=false} // the account checked again after the await: nothing is filed under one that came in meanwhile; null (no current key here, a read refused, or a current key this page refuses, badkey): unstamped, but nothing was busy, so the short pause below
      if(ok)bad=0;if(!today||!ok)await pause(ok?1000:REKEY_BACKOFF[Math.min(bad++,REKEY_BACKOFF.length-1)])}})} // a second after one that went through, so a big account's first start doesn't drain the connection's frame budget (owner decision D4); after one that failed: two seconds, then more (as the removal waits), so a busy connection is not asked again at once
// Who waits to join (readRoll's wait), per channel as an admin's page last read the cards (an open, or the pass), for the chat
// list's notice (renderList) and its sheet (openWaiting); in the sealed store, so the next start shows it before its own pass.
// Shown less anyone the record since lists or blocks, and never for a public channel; one added elsewhere who then left shows until the cards are read again
const waitKey=()=>'hush:wait:'+S.me.handle,waitList=()=>Object.entries(ls.get(waitKey(),{})).map(([cid,x])=>{const c=convById(cid),ok=c&&c.visibility!=='public'&&isAdmin(c);return [cid,Object.assign({},x,{hs:ok?x.hs.filter(h=>!(c.members||[]).includes(h)&&!(c.banned||[]).includes(h)):[]})]}).filter(([,x])=>x.hs.length);
function noteWait(cid,n,hs){const m=ls.get(waitKey(),{}),v=hs.length?{n,hs}:null;if(JSON.stringify(m[cid]||null)===JSON.stringify(v))return;if(v)m[cid]=v;else delete m[cid];ls.set(waitKey(),m);renderList()}
// A private channel this page is no longer an admin of (the owner's list as opened here leaves this account out, and the server gives it no admin level), seen by the chat watch: who waits to join, and dk (whose dev cards it acted on), are an admin's to keep
function adminGone(c){if(!c||typeOf(c)!=='channel'||c.visibility==='public'||!c._ometa||isAdmin(c))return;noteWait(c.id,'',[]);const m=ls.get(rolesKey(),{});if(m[c.id]&&m[c.id].dk){delete m[c.id].dk;ls.set(rolesKey(),m)}}
async function openWaiting(){ // the notice's sheet: everyone waiting to join, by channel, unticked; Add reads each channel's cards again, then adds the ticked still waiting as Add subscribers does (addSubs), the rest keep waiting
  const {body,sh,close}=sheet('Waiting to join'),foot=el('div','sheet-foot'),go=el('button','primary','Add subscribers'),err=el('div','err'),boxes=[],of=[],wl=waitList();
  await loadDir([...new Set(wl.flatMap(([,x])=>x.hs))]); // their profiles first (displayName): after a reload within the stamp window no card read has loaded them yet
  for(const [cid,x] of wl){const c=convById(cid);body.append(el('div','menu-label flush',c?convTitle(c):x.n||'Channel'));for(const h of x.hs){body.append(tickRow(h,boxes));of.push(cid)}}
  const count=()=>{const n=boxes.filter(b=>b.checked).length;go.disabled=!n;go.textContent=n?`Add ${n} subscriber${n>1?'s':''}`:'Add subscribers'};count();for(const b of boxes)b.onchange=count;
  go.onclick=async()=>{go.disabled=true;err.textContent='';const by=new Map();boxes.forEach((b,i)=>{if(b.checked)(by.get(of[i])||by.set(of[i],new Set()).get(of[i])).add(b.value)});let n=0;
    try{for(const [cid,sel] of by){const [cur,shown]=await chatAnd(cid),r=shown._unlocked?await readRoll(cur,metaOf(shown)):null;if(!r||r.denied)throw new Error('nokey'); // the cards read again first: whoever was listed, blocked or left since this device last read them is not added (a block is never lifted here), and the entry is as of now
        const still=[...new Set(r.wait.map(x=>x.f))].filter(h=>h!==S.me.handle);noteWait(cid,shown.name,still);for(const h of [...sel])if(!still.includes(h))sel.delete(h);if(sel.size){await addSubs(cid,sel);n+=sel.size}
        boxes.forEach((b,i)=>{if(of[i]===cid&&b.checked){b.checked=false;b.disabled=true}})} // this channel is done (its people added, or waiting no more): a failure on a later channel leaves them out of the next press, which would otherwise read this channel's cards again and add whoever a copy not yet caught up still shows waiting
      close();toast(n?n>1?'Subscribers added':'Subscriber added':'No one left to add.')}
    catch{err.textContent=(n?`${n} subscriber${n>1?'s':''} added. Couldn’t add the rest.`:'Couldn’t add them.')+' Check your connection and try again.';count()}}; // count: the button for the people still ticked
  foot.append(go,err);sh.append(foot)}

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
  if(q)e.append(el('strong',null,'No one found'),el('span',null,'Try their name or username. Some people can be found only by their exact username.'));
  else e.append(el('strong',null,'Find someone'),el('span',null,'Search for someone by name or username.'));
  return e}
function peopleIn(q,exclude){return Object.values(S.dir).filter(d=>!d.gone&&!exclude.includes(d.handle)&&!isBlocked(d.handle)&&(!q||(d.handle+' '+d.name).toLowerCase().includes(q))).sort((a,b)=>a.name.localeCompare(b.name))}
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
    actionRow(I.user,'Invite friends','Share your personal invite link',()=>{close();openInviteFriends()}),
    actionRow(I.link,'Join with a link','Paste an invite link or code',()=>{close();openJoinLink()}));
  const {s,inp}=searchBox('Search by name or username');inp.autocapitalize='none';inp.spellcheck=false;const list=el('div');body.append(s,list);
  let look=null;
  const draw=()=>{const q=inp.value.trim().toLowerCase().replace(/^@/,'');list.replaceChildren();look(q);
    const ppl=peopleIn(q,[S.me.handle]).filter(d=>q||knownHandle(d.handle));
    const sec=(label,arr)=>{if(!arr.length)return;list.append(el('div','menu-label flush',label));arr.forEach(d=>{const b=personRow(Object.assign({},d,{name:displayName(d.handle)}));if(d.requests===true&&!knownHandle(d.handle))b.querySelector('.t-sub').append(' \u00b7 sends as a request');b.onclick=()=>{close();openDm(d.handle)};list.append(b)})};
    sec('People',ppl);
    if(!ppl.length)list.append(emptyPeople(q));
    if(!q)list.append(el('p','hint','Search people on Hush by name or username. Finding someone doesn\u2019t let you read their messages, and people can ask new people to send a request first.'));
  };
  look=liveSearch(inp,draw);inp.oninput=draw;draw();
}
async function openDm(peer){
  await loadDir([peer]);const id=await dmIdFor(peer);
  if(isGone(peer)&&!(id&&convById(id))){toastErr('This account was deleted.');return} // an old chat with them still opens, read-only; a new one never starts
  if(!id){toastErr('Couldn’t open that chat. Check your connection and try again.');return}
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
    if(!(await ensureSecure('owner',name,'group'))){err.textContent='Secure your account to create a group.';return}
    go.disabled=true;
    try{
      const cid='g'+rid(),members=[S.me.handle,...sel],v={name,desc:'',photo:null,owner:S.me.handle,admins:[],members,banned:[]};
      const doc=await createChatDoc(cid,'group','private',v);
      await ensureInbox(Object.assign({id:cid},doc,v));
      if(!convById(cid))S.convs.unshift(Object.assign({id:cid},doc,v));
      close();openConv(cid);
    }catch(e){err.textContent=e&&e.code==='secure'?'Secure your account to create a group.':'Couldn\u2019t create the group. Check your connection and try again.';go.disabled=false}
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
    catch(e){err.textContent=e&&e.code==='banned'?'You were removed from this '+(grp?'group.':'channel.'):e&&e.code==='notfound'?'This invite link was revoked. Ask for a new one.':e&&e.code==='toolarge'?'This '+(grp?'group':'channel')+' has no room for you right now. Ask an admin to add you.':e&&e.code==='stale'?'This invite link is out of date. Ask for a new one.':'Couldn\u2019t join. The link may be damaged. Ask for a new one.';go.disabled=false}};
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
    if(!(await ensureSecure('owner',name,'channel'))){err.textContent='Secure your account to create a channel.';return}
    go.disabled=true;
    try{
      const cid='c'+rid(),members=[S.me.handle,...sel],v={name,desc:d.value.trim(),photo:null,owner:S.me.handle,admins:[],members,banned:[]};
      const doc=await createChatDoc(cid,'channel',vis,v);
      if(vis==='public'){const pub=P().pub||(P().pub=[]);if(!pub.includes(cid)){pub.push(cid);saveContacts()}}
      await ensureInbox(Object.assign({id:cid},doc,v));
      if(!convById(cid))S.convs.unshift(Object.assign({id:cid},doc,v));
      close();openConv(cid);
    }catch(e){err.textContent=e&&e.code==='secure'?'Secure your account to create a channel.':'Couldn\u2019t create the channel. Check your connection and try again.';go.disabled=false}
  };
}
async function createChatDoc(cid,type,vis,v){ // a new group or channel: chat key, admin secret, sealed description, room keys for the server
  await loadDir(v.members,true); // fresh profiles: wraps go to each member's CURRENT devices, not the ones this page saw earlier
  const raw=crypto.getRandomValues(new Uint8Array(32)),secret=crypto.getRandomValues(new Uint8Array(32)),pub=vis==='public';
  const keys=await wrapAll(raw,v.members,cid,0),akeys=await wrapKey(secret,S.me.handle,cid+'#a');
  const doc=Object.assign({type,visibility:vis,epoch:0,keys:{0:keys},akeys,invites:{},ts:Date.now(),last:null},
    pub?{openKeys:{0:b64(raw)},name:v.name,desc:v.desc,photo:v.photo||null,owner:S.me.handle,admins:[]}:{meta:await sealMeta(cid,0,raw,v),ometa:await sealOMeta(cid,0,raw,type==='channel'?Object.assign({},v,{_ah:await adminId(cid,secret)}):v)}); // a channel's admin secret named by its signed fingerprint from the start (SPEC.md 5.6 "Key chain")
  ksPut(cid,0,b64(raw));ksPut(cid,'a',b64(secret));
  await S.db.createChat(cid,doc,{m:await memberCapFrom(cid,0,raw),a:await adminCapFrom(cid,secret),o:await ownerCap(cid)});
  if(type==='channel'){keyMade(cid,0,raw);await chainRow(cid,0,raw).then(r=>S.db.chain(cid,0,undefined,r.c)).then(()=>noteChained(cid)).catch(()=>{})} // chained from birth: row 0, the signed commit of its first key (SPEC.md 5.6 "Key chain")
  S.chatDocs.set(cid,Object.assign({id:cid},doc));noteTier('owner');return doc;
}
async function addSubs(cid,sel){ // Add subscribers, and the chat list's notice (openWaiting): the current key wrapped for the people picked, the sealed list with them and no block on them, their pointer (ensureInbox), and they wait no more
  const [cur,shown]=await chatAnd(cid);if(cur.visibility!=='public'&&!shown._unlocked)throw new Error('nokey'); // a list this device can't read: the one sealed would name only the people picked
  await loadDir([...sel],true);const raws=await handRaws(cur),keys={}; // fresh profiles, so the wraps reach their current devices
  for(const [e,r] of Object.entries(raws))keys[e]=await wrapAll(unb64(r),[...sel],cid,Number(e));
  const v=Object.assign(metaOf(shown),{members:[...new Set([...(shown.members||[]),...sel])],banned:(shown.banned||[]).filter(h=>!sel.has(h))});
  if(cur.visibility!=='public')for(const h of sel)await S.db.banChat(cid,h,false); // added on purpose: the server lets their key in, whatever block it kept
  await S.db.doc('channels/'+cid).update(Object.assign({keys},cur.visibility==='public'?{}:{meta:await sealMetaFor(cur,v)}));
  for(const x of [convById(cid)])if(x){x.members=v.members;x.banned=v.banned}
  if(typeOf(cur)==='channel')recount(cur); // the count follows the list (recount)
  await ensureInbox({id:cid,type:cur.type,members:v.members},[...sel],true); // fresh: their note again even to someone this device noted before (a former member, or one a key change cut off, whose own page forgot its pointer)
  const w=ls.get(waitKey(),{})[cid];if(w)noteWait(cid,w.n,w.hs.filter(h=>!sel.has(h)))}
function openAddSubs(cid){
  const c=convById(cid);if(!c)return;const noun=typeOf(c)==='group'?'member':'subscriber';
  const {body,sh,close}=sheet(`Add ${noun}s`);
  // Or hand out a link: it opens the invite sheet with the link and a Copy button, made on the spot if there is none yet.
  body.append(actionRow(I.link,'Invite via link','Anyone with the link can join',()=>{close();openInvite(cid,{auto:true})}));
  const wh=el('div');body.append(wh); // a private channel's people waiting to join, above the search
  const foot=el('div','sheet-foot');const go=el('button','primary',`Add ${noun}s`);go.disabled=true;const err=el('div','err');foot.append(go,err);
  const count=s=>{go.disabled=!s.size;go.textContent=s.size?`Add ${s.size} ${noun}${s.size>1?'s':''}`:`Add ${noun}s`};
  const sel=picker(body,c.members,count);
  sh.append(foot);
  const waiting=typeOf(c)==='channel'&&c.visibility!=='public'&&(async()=>{ // a join card no open link vouches for (readRoll's wait): ticked here, they go in with the people picked
    const [cur,shown]=await chatAnd(cid);if(!shown._unlocked)return;const boxes=[],hs=[...new Set((await readRoll(cur,metaOf(shown))).wait.map(x=>x.f))].filter(h=>h!==S.me.handle);
    if(hs.length)wh.append(el('div','menu-label flush','Waiting to join'),...hs.map(h=>tickRow(h,boxes)));for(const b of boxes)b.onchange=()=>{b.checked?sel.add(b.value):sel.delete(b.value);count(sel)}})().catch(()=>{});
  go.onclick=async()=>{
    go.disabled=true;err.textContent='';
    try{await addSubs(cid,sel);close();toast(sel.size>1?`${noun[0].toUpperCase()+noun.slice(1)}s added`:`${noun[0].toUpperCase()+noun.slice(1)} added`)}
    catch{err.textContent='Couldn\u2019t add them. Check your connection and try again.';go.disabled=false}
  };
  return waiting; // the waiting list being read (a test awaits it)
}
function qrSvg(text,label){
  try{if(typeof qrcode!=='function')return null;const q=qrcode(0,'M');q.addData(text);q.make();const n=q.getModuleCount();let d='';
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))d+=`M${c} ${r}h1v1h-1z`;
    return `<svg viewBox="-3 -3 ${n+6} ${n+6}" shape-rendering="crispEdges" role="img" aria-label="${label||'QR code for the invite link'}"><rect x="-3" y="-3" width="${n+6}" height="${n+6}" fill="#fff"/><path d="${d}" fill="#17152B"/></svg>`}catch{return null}
}
function openInvite(cid,opt){ // opt.auto: an admin arriving from "Invite via link" gets the link made at once, no extra tap
  const c0=convById(cid);if(!c0)return;const owner=isAdmin(c0),pub=c0.visibility==='public',grp=typeOf(c0)==='group',noun=grp?'group':'channel';
  const {body,close}=sheet(grp?'Invite via link':'Invite link');const host=el('div');body.append(host);
  const make=async()=>{const i=await createInvite(cid);ls.set('hush:inv:'+cid,i);return i};
  const draw=async(trust)=>{
    host.replaceChildren(el('p',null,'Loading\u2026'));
    let inv=null;
    if(!pub){inv=ls.get('hush:inv:'+cid,null);
      if(inv&&!trust){const f=await freshChan(cid).catch(()=>c0);if(!(f.invites||{})[inv.iid])inv=null}
      if(!inv&&owner&&!grp)inv=await keptLink(await freshChan(cid).catch(()=>c0)).catch(()=>null); // a channel's link another admin's device made, from its `as`
      if(!inv&&owner&&opt&&opt.auto){try{inv=await make();trust=true}catch{}}}
    host.replaceChildren();
    if(!pub&&!inv){
      host.append(el('p',null,owner?`Create a link that lets people join this private ${noun}. Anyone who has the ${noun} link can join, so share it with care. Hush can\u2019t open it.`:`Only an admin can create an invite link for this ${noun}.`));
      if(owner){const b=el('button','primary','Create invite link');b.onclick=async()=>{b.disabled=true;try{await make();draw(true)}catch{b.disabled=false;toastErr('Couldn\u2019t create the link. Check your connection and try again.')}};host.append(b)}
      return;
    }
    const link=linkFor(cid,inv);
    const q=qrSvg(link);if(q)host.append(html('div','qr',q));
    const box=el('input','linkbox');box.readOnly=true;box.value=link;box.onfocus=()=>box.select();
    const row=el('div','row2');const copy=el('button','secondary','Copy link');
    copy.onclick=async()=>{try{await navigator.clipboard.writeText(link);toast('Link copied')}catch{box.focus();box.select();toast('Link selected. Copy it from the box.')}};
    row.append(copy);
    if(navigator.share){const sh=el('button','primary','Share');sh.style.marginTop='0';sh.onclick=async()=>{try{await navigator.share({title:c0.name,text:'Join '+c0.name+' on Hush',url:link})}catch(e){if(!e||e.name!=='AbortError')copy.click()}};row.append(sh)}
    host.append(box,row,el('p','hint',pub
      ?'Anyone with this link or QR code can join. Public channels also show up in search.'
      :`Anyone with this link or QR code can join and read every ${grp?'message':'post'}. Only share it with people you trust.`));
    if(!pub&&owner){const r=el('button','menu-item danger flush','Revoke link');
      r.onclick=!grp?()=>{close();openRevoke(cid,inv.iid)}:async()=>{if(!confirmDanger('Revoke this link? It stops working for anyone who hasn\u2019t joined yet.'))return; // a channel's: the link alone, or with a new key (openRevoke)
        try{await revokeInvite(cid,inv.iid);toast('Link revoked');draw()}catch{toastErr('Couldn\u2019t revoke it. Check your connection and try again.')}};host.append(r)}
  };
  draw();
}
function openConvInfo(cid){
  const c=convById(cid);if(!c)return;if(typeOf(c)==='dm'){openProfile(dmPeer(c));return}
  const grp=typeOf(c)==='group',owner=isOwner(c),pub=c.visibility==='public',noun=grp?'group':'channel',can=infoCan(c);
  const {body,close}=sheet(grp?'Group info':'Channel info');
  const top=el('div','info-top');
  top.append(convAvatar(c,'xl'),el('div','info-name',c.name),el('div','t-sub',grp?memberText(c):subsText(c,pub?'Public channel, ':'Private channel, ',1)));body.append(top);
  if(c.desc)body.append(el('p','info-desc',c.desc));
  const p=el('p');
  if(grp)p.append(el('b',null,'End-to-end encrypted. '),'Only members can read the messages or see the group\u2019s name, description and photo.');
  else if(pub)p.append(el('b',null,'Public. '),'Anyone can find this channel, join and read its posts, so they aren\u2019t end-to-end encrypted. Posts are still signed.');
  else p.append(el('b',null,'Private and end-to-end encrypted. '),'Only subscribers can read the posts or see the channel\u2019s name, description and photo.');
  body.append(p);
  const item=(icon,label,fn,extra)=>{const a=html('button','menu-item flush',icon+`<span>${label}</span>`);if(extra)a.append(el('span','role',extra));a.onclick=()=>{close();fn()};body.append(a)};
  if(S.chan===cid)item(I.image,'Shared media',openMediaGallery);
  if(can.edit)item(I.edit,'Edit name, description and photo',()=>openEditConv(cid));
  if(can.invite)item(I.link,grp?'Invite via link':'Invite link and QR code',()=>openInvite(cid,{auto:can.autoLink}));
  if(can.add)item(I.plus,grp?'Add members':'Add subscribers',()=>openAddSubs(cid));
  if(can.visibility){const v=html('button','menu-item flush',(pub?I.lockMd:I.globe)+`<span>${pub?'Make private':'Make public'}</span>`);
      v.onclick=async()=>{
        const msg=pub?`Make \u201c${c.name}\u201d private?\n\nFrom now on only current subscribers can read new posts. Posts made while it was public stay readable to anyone.`
          :`Make \u201c${c.name}\u201d public?\n\nAnyone will be able to find it, join, and read every post, including past ones. Private invite links stop working.`;
        if(!confirm(msg))return;
        try{await setVisibility(cid,pub?'private':'public');close();toast(pub?'Channel is now private':'Channel is now public');if(S.chan===cid)setTimeout(()=>{if(convById(cid))openConv(cid)},300)}
        catch{toastErr('That didn\u2019t go through. Check your connection and try again.')}};
      body.append(v);
      if(FEATURES.channelComments){const cm=html('button','menu-item flush',I.comment+'<span>Comments</span>');cm.append(el('span','role',c.comments===false?'Off':'On'));
      cm.onclick=async()=>{try{await S.db.doc('channels/'+cid).update({comments:c.comments===false});close();toast(c.comments===false?'Comments turned on':'Comments turned off')}catch{toastErr('That didn\u2019t go through. Try again.')}};body.append(cm)}}
  if(can.reactions){const cfg=reactCfg(c);item(I.smile,'Reactions',()=>openReactSettings(cid),cfg.mode==='all'?'All':cfg.mode==='off'?'Off':cfg.allowed.length+' allowed')}
  if(can.poll)item(I.chart,'New poll',()=>openPollCreate(cid));
  const mark=el('div','menu-label flush',grp?'Members':can.noSubs?'Owner and admins':'Subscribers');body.append(mark);
  if(owner&&!grp&&!pub)sealKey(c,epochOf(c)).catch(e=>{if(!e||e.message!=='badkey'||!body.isConnected)return;const a=html('button','menu-item flush',I.key+'<span>Fix channel</span>');a.append(el('span','role warn','Needs fixing'));a.onclick=()=>{close();openRepair(cid)};mark.before(a)}); // a current key this device refuses (a stale admin secret's key change, a planted key): only the owner can end that, with a fresh key she signs (openRepair, SPEC.md 5.6 "The owner's repair"); checked after the sheet is drawn, and nothing shown once it is closed
  if(owner)body.append(el('p','hint','Admins can post, pin, delete messages, add people and remove members. Only you can change settings or delete the '+noun+'.'));
  if(owner&&!grp&&!pub&&!(rolesOf(cid)||{}).s)body.append(el('p','hint','This channel’s admin list isn’t signed yet (it was made before this version of Hush, or this device couldn’t check it). Check the admins, then tap Edit and Save to sign it. Until then no admin can remove people or reset the invite link.')); // owner decision D1: the one manual step
  const memberRow=h=>{const r=el('button','thread');const m=el('div','t-main');
    m.append(withBadge(el('div','t-name',h===S.me.handle?displayName(h)+' (you)':displayName(h)),h),el('div','t-sub'+(isOnline(h)?' online':''),grp?lastSeen(h):atOf(h)));
    r.append(userAvatar(h,'sm'),m);r.onclick=()=>{close();openProfile(h)};return r};
  const act=(label,fn,cls)=>{const k=el('span','kick'+(cls?' '+cls:''),label);k.setAttribute('role','button');k.tabIndex=0;k.onclick=async e=>{e.stopPropagation();await fn()};return k};
  const rank=h=>h===c.owner?0:(c.admins||[]).includes(h)?1:2;
  knownIn(c).slice().sort((a,b)=>rank(a)-rank(b)||displayName(a).localeCompare(displayName(b))).forEach(h=>{
    const r=memberRow(h),isAdm=(c.admins||[]).includes(h),mc=memberCan(c,h);
    if(h===c.owner)r.append(el('span','role','owner'));
    else if(isAdm)r.append(el('span','role','admin'));
    if(mc.admin)r.append(act(isAdm?'Remove admin':'Make admin',async()=>{
      if(!isAdm&&!confirm(`Make ${displayName(h)} an admin? They\u2019ll be able to post, pin, delete messages and remove members.`))return;
      try{const stopped=await toggleAdmin(cid,c,h,isAdm);close();const msg=isAdm?displayName(h)+' is no longer an admin':displayName(h)+' is now an admin';
        if(stopped)toast(msg+'. Open invite links stopped working.','New link',()=>openInvite(cid,{auto:true}),8000);else toast(msg);openConvInfo(cid)} // this toast replaces rotateAdmins' own, so it carries the stopped links and "New link" on
      catch{toastErr('That didn\u2019t go through. Try again.')}},'adm'));
    if(mc.resend)r.append(act('Send access again',async()=>{try{await resendKeys(cid,h);toast('Access sent again to '+displayName(h)+'\u2019s devices')}catch{toastErr('That didn\u2019t go through. Try again.')}},'adm'));
    if(mc.ban)r.append(act(`Block from this ${noun}`,async()=>{
      if(!confirmDanger(`Block ${displayName(h)} from \u201c${c.name}\u201d?\n\nThey\u2019re removed and can\u2019t rejoin, even with an invite link. They can\u2019t read new ${grp?'messages':'posts'}. This only applies to this ${noun}.${grp?'':' Open invite links stop working. You can make a new one.'}`))return;
      try{const had=!grp&&Object.keys((S.chatDocs.get(cid)||c).invites||{}).length,r=await kickMember(cid,h,{ban:true});close();const msg=r==='full'?`${displayName(h)} was removed, but this ${noun}\u2019s block list is full, so a link could bring them back. Ask the owner to block them.`:`${displayName(h)} was blocked from this ${noun}`;
        if(had)toast(msg,'New link',()=>openInvite(cid,{auto:true}),8000);else toast(msg);openConvInfo(cid)}catch(e){toastErr(e&&e.message==='badkey'?e.noBan?'Hush couldn\u2019t check this channel, so nothing was changed and they are not blocked. Reload Hush. If the owner\u2019s security code changed, accept the new code.':'They were blocked and can\u2019t open the channel again, but securing the channel didn\u2019t finish. Reload Hush. If the owner\u2019s security code changed, accept the new code. If it keeps happening, ask the channel\u2019s owner.':'Couldn\u2019t block them. Check your connection and try again.')}})); // a private channel's key change stopped its open links: a new one is a tap away
    if(mc.block)r.append(isBlocked(h)?act('Unblock person',async()=>{unblockPeer(h);toast(displayName(h)+' unblocked');close();openConvInfo(cid)})
      :act('Block person',async()=>{if(confirmBlockPerson(h)){close();openConvInfo(cid)}}));
    body.append(r)});
  if(can.unban&&(c.banned||[]).length){body.append(el('div','menu-label flush',`Blocked from this ${noun}`));
    c.banned.forEach(h=>{const r=memberRow(h);r.append(act('Unblock',async()=>{try{await unban(cid,h);close();toast(displayName(h)+' can join again')}catch{toastErr('That didn\u2019t go through. Try again.')}}));body.append(r)})}
  if(!can.leave)return;
  const danger=el('button','menu-item danger flush',owner?`Delete ${noun}`:`Leave ${noun}`);
  danger.onclick=async()=>{
    if(!confirmDanger(owner?`Delete \u201c${c.name}\u201d for everyone?`:`Leave \u201c${c.name}\u201d?`))return;
    try{
      await deleteOrLeave(cid,owner);close();closeConv();toast(owner?`${noun[0].toUpperCase()+noun.slice(1)} deleted`:`You left the ${noun}`);
    }catch{toastErr('That didn\u2019t go through. Check your connection and try again.')}
  };
  body.append(danger);
}
function infoCan(c){ // which rows Group info and Channel info offer this account. It decides what the sheet shows, nothing else: the server refuses what a role may not do. noSubs: a channel's subscribers are for its owner and admins alone to know (SPEC.md 5.3), so to anyone else the sheet names none (its top line gives their number alone), lists the owner and admins (knownIn: the record's own part, never the list) and offers no action on them
  const grp=typeOf(c)==='group',owner=isOwner(c),admin=isAdmin(c),member=isMember(c),pub=c.visibility==='public';
  return {edit:owner,invite:member&&(admin||pub),autoLink:grp&&admin,add:admin,visibility:owner&&!grp,reactions:owner,poll:canPost(c),noSubs:!grp&&!admin,unban:admin,leave:member};
}
function memberCan(c,h){ // the same for one person's line in that sheet: which buttons this account is offered on person h. Worked out when the line is drawn; a button keeps what it was drawn with
  const grp=typeOf(c)==='group',owner=isOwner(c),admin=isAdmin(c),pub=c.visibility==='public',me=h===S.me.handle;
  return {admin:owner&&h!==c.owner,resend:admin&&!pub&&!me,ban:admin&&!pub&&h!==c.owner&&!me&&(owner||!(c.admins||[]).includes(h)),block:!me&&(grp||admin)};
}
async function toggleAdmin(cid,c,h,isAdm){ // Make admin and Remove admin: the new list goes to setAdmins, and the page's own copy changes only once that went through. isAdm is what the line showed when it was drawn: handed in, never read again. Answers what setAdmins answers (true: open invite links stopped working)
  const ad=(c.admins||[]).filter(x=>x!==h);if(!isAdm)ad.push(h);const stopped=await setAdmins(cid,ad);c.admins=ad;return stopped;
}
async function deleteOrLeave(cid,owner){ // the sheet's last row: its owner deletes the chat for everyone, anyone else leaves it, never both. owner is what the sheet showed when it was drawn, handed in. The chat's line in the chat list is forgotten only once the server has done it
  if(owner)await S.db.doc('channels/'+cid).delete();
  else await leaveChat(cid);
  S.previews.delete(cid);
}
function pickPhoto(){
  return new Promise(res=>{const fi=el('input');fi.type='file';fi.accept='image/*';fi.style.display='none';document.body.append(fi);
    fi.onchange=async()=>{const f=fi.files[0];fi.remove();if(!f)return res(null);
      try{const bmp=await createImageBitmap(f),s=Math.min(bmp.width,bmp.height),cv=document.createElement('canvas');cv.width=cv.height=320;
        cv.getContext('2d').drawImage(bmp,(bmp.width-s)/2,(bmp.height-s)/2,s,s,0,0,320,320);res(cv.toDataURL('image/jpeg',.85))}
      catch{toastErr('That photo couldn\u2019t be read. Try a JPG or PNG.');res(null)}};
    fi.click()});
}
function photoEditor(host,key,getName,photo,onChange){ // onChange answers false (or a promise of it) when the photo did not take: the picture goes back as it was
  let cur=photo;const box=el('div','info-top');const av=el('div');const row=el('div','row2 tight');
  const set=el('button','secondary','Set photo'),rm=el('button','secondary','Remove');
  const draw=()=>{av.replaceChildren(avatar(key,getName(),'xl',cur));rm.hidden=!cur};
  const put=async p=>{const was=cur;cur=p;const ok=onChange(p);draw();if(await ok===false&&cur===p){cur=was;draw()}};
  set.onclick=async()=>{const p=await pickPhoto();if(p)await put(p)};
  rm.onclick=()=>put(null);
  row.append(set,rm);box.append(av,row);host.append(box);draw();return draw;
}
function openEditConv(cid){
  const c=convById(cid);if(!c)return;const grp=typeOf(c)==='group';
  const {body,sh,close}=sheet(grp?'Edit group':'Edit channel');let photo=c.photo||null;
  const n=el('input');n.maxLength=60;n.value=c.name||'';const d=el('input');d.maxLength=200;d.value=c.desc||'';d.placeholder='Optional';
  const redraw=photoEditor(body,c.id,()=>n.value||c.name,photo,p=>photo=p);
  const f1=el('label','field');f1.append(el('span',null,'Name'),n);const f2=el('label','field');f2.append(el('span',null,'Description'),d);
  const pub=c.visibility==='public';
  n.oninput=redraw;body.append(f1,f2,el('p','hint',pub?'This channel is public, so everyone can see its name, description and photo. That is how people find it.'
    :'The name, description and photo are encrypted. Only members can see them, not Hush.'));
  if(!grp&&!pub)body.append(el('p','hint','Save also signs the admin list as this device shows it: '+((c.admins||[]).length?c.admins.map(displayName).join(', '):'no admins')+'. If someone’s missing or shouldn’t be there, change the admins in Channel info first.')); // Save signs the list this device holds (chatAnd, the same copy the chat list shows), and a device of hers served an older signed copy of it first (a fresh browser at first sight, say) holds an admin she has since demoted: named here, so she sees it before she signs it again (release 93 item 7, owner decision D4)
  const foot=el('div','sheet-foot');const go=el('button','primary','Save');const err=el('div','err');foot.append(go,err);sh.append(foot);
  go.onclick=async()=>{const name=n.value.trim();if(!name){err.textContent='The name can\u2019t be empty.';return}
    go.disabled=true;try{const v={name,desc:d.value.trim(),photo:photo||null};const [cur,shown]=await chatAnd(cid);
      if(cur.visibility!=='public'){if(cur.ometa&&(!shown._ometa||shown._stale))throw new Error('nokey');await handOver(cur,shown)}await (cur.visibility==='public'?S.db.doc('channels/'+cid).update(v):putOMeta(cur,Object.assign(metaOf(shown),v)));Object.assign(c,v);close();toast('Saved');if(S.chan===cid)setTimeout(()=>openConv(cid),300)}
    catch{err.textContent='Couldn\u2019t save. The photo may be too large, or check your connection.';go.disabled=false}};
}
async function openProfile(h){
  if(h===S.me.handle){openSettings();return}
  if(isGone(h)){const {body}=sheet('Profile'),top=el('div','info-top');top.append(userAvatar(h,'xl'),el('div','info-name','Deleted account')); // no badge: the account is gone
    body.append(top,el('p','hint','This account was deleted. Its messages stay where they were sent, but it can’t be messaged any more.'));return}
  const d=S.dir[h];const {body,close}=sheet('Profile');
  const top=el('div','info-top');const st=lastSeen(h);
  top.append(userAvatar(h,'xl'),withBadge(el('div','info-name',displayName(h)),h),el('div','t-sub'+(st==='online'?' online':''),atOf(h)+', '+st));body.append(top);
  if(d&&d.bio)body.append(el('p','info-desc',d.bio));
  if(isBlocked(h))body.append(el('p','warnbox','You blocked this person. Their messages and requests are dropped, and you won’t see them in groups you share.'));
  else if(!S.chan||S.chan!==dmIds.get(h)){const m=el('button','primary','Send message');m.style.width='100%';m.onclick=()=>{close();openDm(h)};body.append(m)}
  const blk=html('button','menu-item danger flush',I.x+`<span>${isBlocked(h)?'Unblock this person':'Block this person'}</span>`);
  blk.onclick=()=>{if(isBlocked(h)){unblockPeer(h);toast(displayName(h)+' unblocked');close()}else if(confirmBlockPerson(h))close()};
  const changed=keyChanged(h);let grid=null;
  if(changed)body.prepend(keyWarnBox(h,()=>grid&&grid.scrollIntoView({behavior:'smooth',block:'center'})));
  if(d){
    body.append(el('div','menu-label flush',changed?'New security code':'Security code'));
    grid=el('div','digits');(await safetyNumber(S.me.handle,h,changed?{[h]:d}:null)).forEach(g=>grid.append(el('span',null,g)));
    const p1=el('p');p1.append('Compare these numbers with ',el('b',null,displayName(h)),' in person or on a call. If they match on both phones, nobody is intercepting your messages.');
    body.append(grid,p1);
    if(!changed){const vb=el('button',isVerified(h)?'secondary verified':'secondary',isVerified(h)?'\u2713 Verified':'Mark as verified');vb.style.width='100%';
      vb.onclick=()=>{if(isVerified(h)){delete S.verified[h];vb.textContent='Mark as verified';vb.className='secondary'}
        else{if(!S.pins[h])S.pins[h]=pinOf(S.dir[h]);S.verified[h]=fpOf(S.pins[h]);vb.textContent='\u2713 Verified';vb.className='secondary verified'}saveContacts()};
      body.append(vb,el('p','hint','Mark as verified once the numbers match. If the code ever changes, Hush will warn you and pause the chat until you check again.'))}
  }
  body.append(blk);
}
function openSettings(){if(!S.me)return;if(S.chan&&matchMedia('(max-width:759px)').matches)closeConv();setTab('profile')}
function buildSettings(body){
  if(isSettingsPage())return buildSettingsPage(body);
  const me=S.me,mine=S.dir[me.handle],d=mine||{};let photo=d.photo||null;
  const n=el('input');n.maxLength=40;n.value=d.name||me.name;n.autocomplete='name';
  const bio=el('input');bio.maxLength=140;bio.value=d.bio||'';bio.placeholder='A few words about you';
  const redraw=photoEditor(body,me.handle,()=>n.value||me.name,photo,async p=>{ // Set photo and Remove save by themselves, the photo alone: the Name and Bio fields stay as typed until Save profile
    if(!S.db){toastErr('Profiles can’t be saved right now. Check your connection.');return false}
    const was=photo,held=(S.dir[me.handle]||{}).photo,copy=v=>{const d=S.dir[me.handle];if(d){if(v)d.photo=v;else delete d.photo}};photo=p;copy(p); // the copy takes the pick at once: a Settings screen built before the write answers shows it, and its Save profile sends it
    try{await S.db.doc('directory/'+me.handle).update({photo:p||null});if(photo===p)copy(p)} // again: a minute read that landed meanwhile put the old record back
    catch{if(photo===p)photo=was;if(S.dir[me.handle]&&(S.dir[me.handle].photo||null)===p){copy(held);if(!n.isConnected&&S.tab==='profile')setTab('profile')}toastErr('Couldn’t save. The photo may be too large, or check your connection.');return false}});n.oninput=redraw; // on failure a Settings screen built since then (it showed the pick) is built again; this one puts its own picture back
  const f1=el('label','field');f1.append(el('span',null,'Name'),n);const f2=el('label','field');f2.append(el('span',null,'Bio'),bio);
  const un=el('input');un.maxLength=20;un.value=dispOf(me.handle);un.autocapitalize='none';un.spellcheck=false;un.autocomplete='off';
  un.oninput=()=>{un.value=un.value.replace(/[^A-Za-z0-9_]/g,'')};
  const f3=el('label','field');f3.append(el('span',null,'Username capitals'),un);
  const save=el('button','primary','Save profile');save.style.width='100%';const err=el('div','err');
  body.append(withBadge(el('p','t-sub center',atOf(me.handle)),me.handle),f1,f3,el('p','hint','You can change which letters are capitals. The letters themselves stay the same, and people find you either way.'),f2,save,err,el('p','hint','Your name, photo and bio are visible to anyone on Hush. Your messages are what\u2019s encrypted.'));
  save.onclick=async()=>{const name=n.value.trim(),disp=un.value.trim();err.textContent='';if(!name){err.textContent='Enter your name.';return}
    if(!dispOk(disp,me.handle)){err.textContent='Your username has to keep the same letters ('+me.handle+'). You can only change which ones are capitals.';un.value=dispOf(me.handle);return}
    if(!S.db||!mine||!('name' in mine)){err.textContent='Profiles can\u2019t be saved right now. Check your connection.';return} // built before my record was read, so its Bio and photo are not mine and would be written over it; a screen built after a read that worked saves. A copy with no name is the key replacement's stub (mirror stage), not a read, even once republishSelf has put the capitals in it: every record the page writes carries a name
    save.disabled=true;
    try{await saveProfile(me,name,disp,bio.value.trim(),photo||null);toast('Profile saved');if(S.chan){S.rendered=null;renderConv()}} // a chat open beside Settings is drawn again in full: a reply quote of my name is drawn once and kept, and the minute read now finds nothing changed
    catch{err.textContent='Couldn\u2019t save. The photo may be too large, or check your connection.'}
    save.disabled=false};
  body.append(el('hr','pf-sep'));
  const st=html('button','menu-item flush pf-row',I.gear+'<span>More settings</span>');st.insertAdjacentHTML('beforeend','<span class="chev">\u203a</span>');
  st.onclick=()=>{S.profilePage='settings';setTab('profile')};
  const svm=html('button','menu-item flush pf-row',I.bookmark+'<span>Saved Messages</span>');svm.insertAdjacentHTML('beforeend','<span class="chev">\u203a</span>');svm.onclick=openSaved;
  body.append(st,svm);
}
async function saveProfile(me,name,disp,bio,photo){ // Save profile: the one write to the directory; only once it went through, the page's own copies and the device's list of accounts. me is the account the screen was drawn for, handed in
  await S.db.doc('directory/'+me.handle).update({name,disp,bio,photo});
  me.name=name;me.disp=disp;const i=S.ids.find(x=>x.handle===me.handle);if(i){i.name=name;i.disp=disp}ls.set('hush:ids',S.ids);
  const d=S.dir[me.handle];if(d){Object.assign(d,{name,disp,bio});if(photo)d.photo=photo;else delete d.photo} // the copy every screen draws from, as the server now keeps it (null removes the field): left to the once-a-minute read, a second Save profile sent the old photo back
}
const SET_PAGES={'settings':'More settings','settings:privacy':'Privacy','settings:login':'Login and devices','settings:advanced':'Advanced'};
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
    segControl([['system','Auto'],['light','Light'],['dark','Dark']],ls.get('hush:theme','light'),v=>{ls.set('hush:theme',v);applyTheme()}));
  body.append(el('hr','pf-sep'));
  body.append(el('div','menu-label flush','Accounts on this device'));
  S.ids.forEach(id=>{const b=el('button','menu-item flush');b.append(userAvatar(id.handle),withBadge(el('span',null,displayName(id.handle)),id.handle));
    if(id.handle===S.me.handle)b.insertAdjacentHTML('beforeend',`<span class="check">${I.tick}</span>`);else b.onclick=()=>{start(id);S.profilePage='main';setTab('profile')};body.append(b)});
  const add=html('button','menu-item flush',I.plus+'<span>Add or restore account</span>');add.onclick=()=>showOnboard(true);body.append(add);
  const out=el('button','btn-danger','Log out');out.setAttribute('aria-label',`Log out of ${atOf(me.handle)} on this device`);out.onclick=()=>logOutAccount(me.handle);
  body.append(out,el('p','hint',hasRecovery(me.handle)?'Erases your chats from this device. Your password or your recovery words bring the account back.':(loginInfo(me.handle)||{}).loc?'Erases your chats from this device. Your password brings the account back; recovery words are a safer second way in.':'Erases your chats from this device. Save your recovery words first, or there is no way back in.'));
  body.append(el('hr','pf-sep'),setRow(I.sliders,'Advanced',hasRecovery(me.handle)?'':'Finish setup',go('settings:advanced'),true),
    el('p','hint','Recovery words, message backup, app lock and encryption tools.'));
}
function settingsPrivacy(body,me){
  const findable=(S.dir[me.handle]||{}).findable===true; // opt-in: off until the person turns it on
  body.append(el('div','set-label','Who can find me in search'),segControl([['yes','Anyone'],['no','Exact username only']],findable?'yes':'no',async v=>{
    try{await setFindable(me,v==='yes');
      toast(v==='yes'?'People can find you by your name or part of your username':'You’re out of name search. Anyone who types your exact username can still find you')}catch{toastErr('That didn\u2019t save. Try again.')}}),
    el('p','hint','Either way, being found doesn\u2019t let anyone read your messages. Your invite link always works.'));
  const reqOn=(S.dir[me.handle]||{}).requests===true;
  body.append(el('div','set-label','New people can'),segControl([['all','Message me directly'],['req','Send a request first']],reqOn?'req':'all',async v=>{
    try{await setRequests(me,v==='req');
      toast(v==='req'?'New people are asked to send a request first':'Anyone can message you')}catch{toastErr('That didn\u2019t save. Try again.')}}),
    el('p','hint','With \u201cSend a request first,\u201d Hush asks a new person to send one text message as a request before a one-on-one chat. Chats you already have aren\u2019t affected. People can still add you to groups and channels.'));
  const tg=el('label','toggle');const cb=el('input');cb.type='checkbox';cb.checked=!ls.get('hush:hideSeen:'+me.handle,false);
  cb.onchange=()=>{ls.set('hush:hideSeen:'+me.handle,!cb.checked);heartbeat(true)};
  tg.append(cb,el('span',null,'Show my online status and last seen'));
  body.append(tg,el('p','hint','People you can see in Hush will see when you\u2019re online. Turn it off and they\u2019ll see \u201clast seen recently\u201d instead.'));
  if(appOnly()){const ct=el('label','toggle'),cc=el('input');cc.type='checkbox';cc.checked=!ls.get('hush:hideCallName',false);cc.onchange=()=>{ls.set('hush:hideCallName',!cc.checked);syncNames()};
    ct.append(cc,el('span',null,'Show names on the '+devWord()+' call screen'));
    body.append(ct,el('p','hint','During a call the '+devWord()+' shows it on the lock screen and at the top of the screen. Turn this off and it says \u201cHush call\u201d instead of the person\u2019s name. Hush calls never appear in the Phone app\u2019s Recents.'))}
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
      try{await unban(c.id,h);toast(displayName(h)+' can join again');setTab('profile')}catch{toastErr('That didn’t go through. Try again.')}},h))}
    if(!people.length&&!chats.length&&!inChats.children.length)body.append(el('p','hint','Nothing is blocked. You can block a person from their profile or a chat’s menu, or block someone from a group you run in its member list.'))})();
}
async function setFindable(me,on){ // Who can find me in search: the write, then the page's own copy, then the search list brought in line with it (syncSearch reads that copy)
  await S.db.doc('directory/'+me.handle).update({findable:on});if(S.dir[me.handle])S.dir[me.handle].findable=on;syncSearch();
}
async function setRequests(me,on){ // Who can message me: the write, then the page's own copy
  await S.db.doc('directory/'+me.handle).update({requests:on});if(S.dir[me.handle])S.dir[me.handle].requests=on;
}
function settingsLogin(body,me){
  {const li=loginInfo(me.handle);
    if(li){ // every way in, the username first: each works with the same password
      for(const l of loginsOf(me.handle).sort((a,b)=>isHandleLogin(b)-isHandleLogin(a))){const r=el('div','menu-item flush static');r.innerHTML=I.lockMd;
        r.append(el('span',null,isHandleLogin(l)?'Username':isEmailLogin(l)?'Email':'Phone number'),el('span','role',isHandleLogin(l)?atOf(l):l));body.append(r)}
      body.append(el('p','hint','Log in on another device with any of these and your password. Or with no password: on the new device tap Log in \u2192 Log in with my other device, and scan the code it shows with this one. Your chats come along.'))}
    else{const r=html('button','menu-item flush',I.lockMd+'<span>Add a password</span>');r.append(el('span','role','Not set up'));r.onclick=()=>openSetupLogin();body.append(r)}}
  {const lk=html('button','menu-item flush',I.device+'<span>Link a new device</span>');lk.append(el('span','role','Scan its code'));lk.onclick=openLinkScanner;body.append(lk)}
  {const list=el('div');body.append(el('div','menu-label flush','Your devices'),list,el('p','hint','Removing a device locks it out at once. Your other devices are logged out and link again from here. The people you chat with see that your security code changed.'));
    const row=(name,sub,fn)=>{const r=html('div','menu-item flush static',I.device);r.append(el('span',null,name),el('span','role',sub));if(fn){const b=el('button','link sm danger-t','Remove');b.onclick=fn;r.append(b)}list.append(r)};
    verifiedDevs(me.handle).then(async devs=>{if(S.me!==me||!list.isConnected)return;const all=(S.dir[me.handle]&&S.dir[me.handle].devs)||{},mine=me.dev&&me.dev.id; // the device's name on the profile, never the display name
      for(const d of devs.sort((a,b)=>(b.id===mine)-(a.id===mine)||(b.ts||0)-(a.ts||0))){const e=d.id===mine?me.dev:all[d.id],name=(await openDevName(d.id,e&&e.nm))||'A device',key=await devShort({id:d.id,x:d.ecdh.x,y:d.ecdh.y,sx:d.sig.x,sy:d.sig.y});
        row(name,key+(d.id===mine?' · This device':' · '+fmtListTime(d.ts||0)),d.id===mine?null:()=>removeDevice(d.id,name,key))}
      for(const i of Object.keys(all))if(!devs.some(d=>d.id===i))row((await openDevName(i,all[i]&&all[i].nm))||'A device','Can’t be checked',null)}).catch(()=>{})}
  {const li=loginInfo(me.handle);if(li){const r=html('button','menu-item flush',I.lockMd+'<span>'+(li.loc?'Change password':'Add a password')+'</span>');r.append(el('span','role',li.loc?'On':'Optional'));r.onclick=openSetupLogin;body.append(r)}}
}
function settingsAdvanced(body,me){
  body.append(el('div','menu-label flush','Account recovery'));
  const bk=html('button','menu-item flush',I.key+'<span>Recovery words</span>');bk.append(el('span','role'+(hasRecovery(me.handle)?'':' warn'),hasRecovery(me.handle)?(recOld(me.handle)?'Older kind: make new':'On'):'Not set up'));bk.onclick=()=>openBackup();
  const rs=html('button','menu-item flush',I.down+'<span>Restore an account</span>');rs.onclick=()=>openRestore();
  body.append(bk,rs);
  {const tg=el('label','toggle');const cb=el('input');cb.type='checkbox';cb.checked=backupOn();
    cb.onchange=async()=>{if(!S.db){cb.checked=!cb.checked;toastErr('You need to be online for this.');return}const on=cb.checked;
      if(!on&&!(await confirmSheet('Turn off Message backup?','This deletes your Message backup from the server.',{danger:true,yes:'Turn off and delete',no:'Keep it on',
        note:'After that, a device that logs in with your password or recovery words won\u2019t be able to open older messages. Linking a new device from one you\u2019re logged in on still brings them over, and your devices keep what they have. You can turn it back on at any time.'}))){cb.checked=true;return}
      cb.disabled=true;
      if(await setMessageBackup(me,on,()=>{cb.checked=!on}))toast(on?'Message backup is on':'Message backup is off');
      else toastErr('That didn\u2019t save. Try again.');cb.disabled=false};
    tg.append(cb,el('span',null,'Message backup'));
    body.append(tg,el('p','hint','On: your messages are restored when you log in on a new phone. Off: older messages stay only on the devices that already have them, so a stolen password reveals nothing from before.'))}
  body.append(el('div','menu-label flush','Security'));
  {const al=html('button','menu-item flush',I.lockMd+'<span>Lock Hush</span>');al.append(el('span','role',lsPw()?'Password':lockCfg()?'PIN':'Off'));al.onclick=openAppLock;body.append(al)}
  {const old=[];try{for(const k of ['hush:sealed:old','hush:sealed:old2']){const b=localStorage.getItem(k);if(b)old.push(b)}}catch{} // a copy of this device's data set aside at a start that could not open it (openStore): shown only while one is kept, so a loss can be judged; it merges back once every account it lists is signed in here
    if(old.length){const p=el('p','hint','Set-aside data: checking…');body.append(p);
      Promise.all(old.map(b=>unsealBlob(SECK,b).then(m=>(Array.isArray(m&&m['hush:ids'])?m['hush:ids']:[]).map(x=>x&&x.handle?atOf(x.handle):'').filter(Boolean).join(', ')||'no account',()=>null)))
        .then(r=>{p.textContent='Set-aside data: '+r.map((x,i)=>'copy '+(i+1)+(x==null?' does not open on this device':' opens; accounts: '+x)).join('; ')+'. A copy that opens merges back once every account it lists is signed in here.'})}}
  body.append(el('div','menu-label flush','Encryption'));
  const sv=el('label','toggle');const svc=el('input');svc.type='checkbox';svc.checked=!!ls.get('hush:serverView',false);
  svc.onchange=()=>{ls.set('hush:serverView',svc.checked);S.serverView=svc.checked;S.rendered=null;if(S.chan)renderConv();toast(svc.checked?'Chats now show what Hush stores':'Chats are back to normal')};
  sv.append(svc,el('span',null,'Show what Hush stores'));
  body.append(sv,el('p','hint','Shows your messages the way Hush keeps them: scrambled text that only the people in the chat can unlock. A way to see for yourself that Hush can\u2019t read them.'));
  const how=html('button','menu-item flush',I.info+'<span>How encryption works</span>');how.onclick=openHow;body.append(how);
  const hb=el('label','toggle'),hbc=el('input');hbc.type='checkbox';hbc.checked=!!ls.get('hush:hideBannerText',false);hbc.onchange=()=>ls.set('hush:hideBannerText',hbc.checked);
  hb.append(hbc,el('span',null,'Hide message text in banners'));body.append(el('div','menu-label flush','Banners'),hb,el('p','hint','Banners then say only “New message”.'));
  if(appOnly()&&natHas('alertToken')){const mp=el('label','toggle'),mpc=el('input');mpc.type='checkbox';mpc.checked=msgPushOn(me); // a browser, or an older app build, has no alert address: no toggle, and no ticket of its own
    mpc.onchange=()=>setMsgPush(mpc.checked).catch(e=>{mpc.checked=msgPushOn(me);toastErr(e&&e.code==='denied'?'Notifications are off for Hush in '+devWord()+' Settings':'That didn’t go through. Try again.')});
    mp.append(mpc,el('span',null,'Message notifications on this '+devWord()));body.append(mp,el('p','hint','A banner says only “New message”: no name, no text. Muted chats and blocked people never send one.'))}
  if(appOnly()&&S.boot){const l=window.hushLaunch,o=performance.timeOrigin,lo=typeof l==='number'&&o-l>=0&&o-l<30e3,s=v=>(v/1e3).toFixed(2)+' s'; // this launch's timing, nothing about accounts; launch→page only from an app build that sets hushLaunch (the tap's time), and not for a reload of that launch's page
    body.append(el('p','hint','Start-up: '+(lo?'launch→page '+s(o-l)+', ':'')+'page→ready '+s(S.boot.at)+' ('+S.boot.why+')'+(S.boot.live?', chats '+(S.boot.cache?'from cache at '+s(S.boot.cache)+', ':'')+'live '+s(S.boot.live):'')))}
  if(appOnly()){const b=window.hushBuild,api=natApi(); // the app build's own numbers when it says them (hushBuild, from release D's build on), else the level read from its methods
    body.append(el('p','hint','App build: '+(b&&typeof b.v==='string'&&Number.isInteger(b.n)?b.v.replace(/[^0-9.]/g,'')+' ('+b.n+'), api '+api:'older than release D, api '+api)+'; calls need api '+NATIVE_API.calls))}
  if(appOnly()){const lab=el('div','menu-label flush','Call diagnostics'),cp=el('button','link','Copy'),dg=el('div'),st=el('p','hint'),lines=[];cp.style.margin='0 0 0 10px';dg.append(el('p','hint','none yet'));lab.append(cp);const vd=ls.get('hush:vdrop',null),vdl=vd&&Array.isArray(vd.s)?'Last video drop: '+String(vd.w).slice(0,8)+(Number.isFinite(vd.t)?' '+Math.max(0,Math.round((Date.now()-vd.t)/6e4))+' min ago':'')+(vd.s.length?', '+vd.s.map(x=>Array.isArray(x)?x.join('/'):'').join(' ')+' (kbit/s/% lost/px/held)':''):'';body.append(lab,dg,st);if(vdl)body.append(el('p','hint',vdl)); // the plugin's timelines of its last pushed calls, newest first, in seconds after each push, and the live call's numbers every 2 s
    cp.onclick=async()=>{try{await navigator.clipboard.writeText([...lines,st.textContent,vdl].filter(Boolean).join('\n')||'none yet');toast('Copied')}catch{toastErr('Copying isn\u2019t allowed here. Press and hold the text to select it.')}}; // kinds and seconds only, nothing that names a call or a person: safe to paste into any chat
    nat('diag').then(r=>{const ev=(r&&Array.isArray(r.events)?r.events:[]).filter(e=>e&&typeof e.k==='string'&&Number.isFinite(e.t)),calls=[];let cur=null;for(const e of ev){if(e.k==='push'||!cur)calls.push(cur=[]);cur.push(e);if(e.k.startsWith('end:'))cur=null} // a line per call: a push starts one, an end closes it, so a busy mark between calls stands alone; an older build keeps one call: one line
      calls.reverse().forEach(c=>lines.push(c.map(e=>e.k+' +'+((e.t-c[0].t)/1e3).toFixed(1)+' s').join(', ')));if(lines.length)dg.replaceChildren(...lines.map(l=>el('p','hint',l)))},()=>{}); // an older build without diag: "none yet"
    const n=(v,u)=>Number.isFinite(v)?Math.round(v)+(u||''):'–',vs=x=>String(x||'–').slice(0,20),tick=()=>{if(!dg.isConnected)return clearInterval(t);if(!S.call){st.textContent='';return} // the page is rebuilt on every navigation: gone from it, the readout stops
      nat('stats').then(r=>{if(r&&S.call&&dg.isConnected)st.textContent=`rtt ${n(r.rttMs,' ms')}, jitter ${n(r.jbMs,' ms')}, ${n(r.recv)} in / ${n(r.sent)} out, ${n(r.lost)} lost, level ${n(r.inLevel*100,'%')} in / ${n(r.outLevel*100,'%')} out, ${r.proto||'–'}, relay ${S.call.offered?['eu','us'][S.call.offered.indexOf(S.call.relay)]||S.call.relay:'–'}`+(r.vOut?`; sent ${n(r.vOut.w)}x${n(r.vOut.h)} ${n(r.vOut.fps,' fps')} ${n(r.vOut.kbps)}/${n(r.vOut.tgt)} kbit/s ${vs(r.vOut.codec)}${r.vOut.enc?' '+vs(r.vOut.enc):''} (${vs(r.vOut.limit)}, ${n(r.vOut.rc)} changes), bwe ${n(r.vOut.bwe,' kbit/s')}`:'')+(r.vIn&&r.vIn.w?`; received ${n(r.vIn.w)}x${n(r.vIn.h)} ${n(r.vIn.fps,' fps')} ${n(r.vIn.kbps,' kbit/s')} ${vs(r.vIn.codec)}, ${n(r.vIn.drop)} dropped, ${n(r.vIn.frz)} freezes`:'')+(r.vCam?`; camera ${n(r.vCam.w)}x${n(r.vCam.h)}@${n(r.vCam.fps)}`:'')+(r.vTier?`; tier ${n(r.vTier.w)}x${n(r.vTier.h)}@${n(r.vTier.fps)} ${n(r.vTier.kbps)} kbit/s ${r.vTier.wifi?'wifi':'mobile'}, H.264 level ${n(r.vTier.lv)}, heat ${n(r.vTier.heat)}`:'')},()=>{})},t=setInterval(tick,2000);tick()}
  const del=html('button','menu-item danger flush',I.trash+'<span>Delete account</span>');del.onclick=openDeleteAccount;body.append(el('div','menu-label flush','Account'),del); // the very last row
}
async function setMessageBackup(me,on,back){ // the Message backup switch, whole: answers true when it is done, false when a step failed and the setting was put back as it was. The question and what is said stay with the screen; back() is the screen putting its switch back, called between the setting put back and its second save, where that statement always stood
  try{P().backup=on;await saveContacts(); // the setting first, so a device saving at this moment sees it off before it could put a backup back
    if(on){if(await syncBackup())keysArrived()}else await S.db.doc(await backupPath(me)).delete(); // a delete that fails leaves it on: never say "off" while the backup is still there
    return true}
  catch{P().backup=!on;back();saveContacts();return false}
}
function openHow(){
  const {body}=sheet('How encryption works');
  [['Your keys are made on this phone. ','Two private keys are made on this device. They leave it only locked: in a box your password opens, in a box your recovery words open, and to a device you link.'],
   ['One-on-one chats. ','You and the other person each work out the same secret key from your own private key and their public key. The first key is never sent between you. Later keys travel locked for each device (ECDH P-256, HKDF, AES-256-GCM). With \u201cMessage backup\u201d on, your chat keys are also kept on the server, in a box only your account keys can open.'],
   ['Groups and private channels. ','One shared key, locked separately for each member. Removing someone switches to a new key they never get. Invite links carry the key after the # sign, a part of a link browsers never send to the server.'],
   ['Everything inside is encrypted. ','Text, photos, videos, GIFs, polls, votes, reactions and replies are all locked before they leave your device.'],
   ['Messages are signed. ','Your signing key proves a message really came from you, so a fake one shows a warning.'],
   ['Your settings are private. ','Your pinned, muted and blocked lists are encrypted with a key only your devices can work out, so the server can\u2019t read them. Blocking someone from a group or channel you run is different: the server keeps that, so it can keep them out.'],
   ['Security code warnings. ','Hush remembers each person\u2019s key the first time you talk. If it ever changes, you\u2019re warned and the chat pauses until you check, so a swapped key can\u2019t quietly intercept you.'],
   ['Recovery words. ','Twelve words made on your device, together with your username, unlock a locked box holding your keys. Nobody else has them, not even us, so nobody can reset your account.'],
   ['Search without snooping. ','You can search for people by name or username, but you can only ever read messages in chats you\u2019re part of. People can stay out of name search (their exact username still finds them), and can ask new people to send a request first.'],
   ['What the server can see. ','Who is in which chat, when messages are sent, and who calls whom and when, plus usernames, names, photos, bios, typing and online status. Not what anyone says. Turn on \u201cShow what Hush stores\u201d in Settings to check.'],
   ['Public channels are open. ','Anyone can read them, so they can\u2019t be secret.']]
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
function shareRow(text,url){
  const row=el('div','row2');const copy=el('button','secondary','Copy invite');
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(text);toast('Invite copied')}catch{toastErr('Copying isn\u2019t allowed here. Use Share instead.')}};row.append(copy);
  if(navigator.share){const sh=el('button','secondary','Share');sh.onclick=async()=>{try{await navigator.share({title:'Join me on Hush',text,url})}catch(e){if(!e||e.name!=='AbortError')copy.click()}};row.append(sh)}
  return row;
}
/* ---------- contacts: your address book, encrypted with a key only you can work out ---------- */
// A device's name on the account's profile (the notice when a device is added), sealed under the account's own key
// so only its devices can read it: the profile itself is public.
async function sealDevName(id,name){const iv=crypto.getRandomValues(new Uint8Array(12));
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('hush-devname-v1|'+S.me.handle+'|'+id)},await vaultKey(),enc.encode(String(name||'').slice(0,80)));
  return b64u(iv)+'.'+b64u(new Uint8Array(ct))}
async function openDevName(id,nm){if(typeof nm!=='string'||nm.split('.').length!==2)return null;const [a,b]=nm.split('.');
  try{return dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(a),additionalData:enc.encode('hush-devname-v1|'+S.me.handle+'|'+id)},await vaultKey(),unb64u(b)))}catch{return null}}
function vaultKey(){
  const k='vault:'+S.me.handle;
  if(!S.chanKeys.has(k))S.chanKeys.set(k,vaultKeyOf(S.me));
  return S.chanKeys.get(k);
}
// The vault's copy of the login note, read back with every login of the account (all), not just the one this device
// used: dropping all made a device that logged in by username forget the email login, and then wrote that loss back.
const loginPref=l=>l&&typeof l.login==='string'?{login:l.login,...(typeof l.loc==='string'?{loc:l.loc}:{}),...(l.all&&typeof l.all==='object'?{all:Object.fromEntries(Object.entries(l.all).filter(([k,v])=>normLogin(k)===k&&typeof v==='string'&&/^[A-Za-z0-9_-]{43}$/.test(v)))}:{})}:undefined;
async function readVaultWith(id){ // the vault as `id`'s keys find it: the parsed object, or null when there is none; throws when it can't be read or opened
  const s=await S.db.doc(await vaultPathOf(id)).get();if(!s.exists)return null;const v=s.data();
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:enc.encode('vault|'+id.handle)},await vaultKeyOf(id),unb64(v.ct))))}
function applyVault(o){ // what the vault holds, into the page: contacts, pinned keys, verified marks and the settings
  const arr=Array.isArray(o)?o:(o.contacts||[]);
  S.contacts=arr.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string');
  const pr=!Array.isArray(o)&&o.prefs||{};
  const okK=k=>k&&k.ecdh&&k.sig&&typeof k.ecdh.x==='string'&&typeof k.ecdh.y==='string'&&typeof k.sig.x==='string'&&typeof k.sig.y==='string';
  const okP=p=>p&&p.sig&&typeof p.sig.x==='string'&&typeof p.sig.y==='string'&&Number.isFinite(p.until);
  if(!Array.isArray(o)&&o.pins&&typeof o.pins==='object')Object.entries(o.pins).forEach(([h,k])=>{if(okK(k))S.pins[h]=Object.assign(keysOf(k),Array.isArray(k.prev)?{prev:k.prev.filter(okP).slice(-8).map(p=>({sig:{x:p.sig.x,y:p.sig.y},until:p.until}))}:{})});
  if(!Array.isArray(o)&&o.verified&&typeof o.verified==='object')Object.entries(o.verified).forEach(([h,v])=>{if(typeof v==='string')S.verified[h]=v});
  S.prefs={pinned:Array.isArray(pr.pinned)?pr.pinned.filter(x=>typeof x==='string'):[],muted:pr.muted&&typeof pr.muted==='object'?pr.muted:{},archived:Array.isArray(pr.archived)?pr.archived.filter(x=>typeof x==='string'):[],backup:pr.backup===true,
    rec:pr.rec&&typeof pr.rec.loc==='string'?Object.assign({loc:pr.rec.loc,ts:+pr.rec.ts||0},pr.rec.v===2?{v:2}:{}):undefined,
    login:loginPref(pr.login),
    blocked:Array.isArray(pr.blocked)?pr.blocked.filter(h=>typeof h==='string'&&validHandle(h)):[],
    blockedChats:Array.isArray(pr.blockedChats)?pr.blockedChats.filter(x=>typeof x==='string'&&/^(?:[gc][A-Za-z0-9]{12}|d[A-Za-z0-9_-]{22})$/.test(x)):[],
    hid:Object.fromEntries(Object.entries(pr.hid&&typeof pr.hid==='object'?pr.hid:{}).filter(([,a])=>Array.isArray(a)).map(([cid,a])=>[cid,a.filter(x=>typeof x==='string').slice(-300)])),
    cleared:Object.fromEntries(Object.entries(pr.cleared&&typeof pr.cleared==='object'?pr.cleared:{}).filter(([,t])=>Number.isFinite(t))),
    secure:pr.secure===true||undefined,tier:TIERS.includes(pr.tier)?pr.tier:undefined,
    dms:Object.fromEntries(Object.entries(pr.dms&&typeof pr.dms==='object'?pr.dms:{}).filter(([cid,i])=>/^d[A-Za-z0-9_-]{22}$/.test(cid)&&i&&typeof i==='object'&&!Array.isArray(i)&&validHandle(i.peer)&&(i.req===undefined||['in','out','ok','no'].includes(i.req))).map(([cid,i])=>[cid,Object.assign({peer:i.peer},i.req?{req:i.req}:{})])), // each one-on-one chat under its person (SPEC.md 5.6): the alias a key change relies on
    wake:wakeOf(pr.wake),pub:Array.isArray(pr.pub)?pr.pub.filter(x=>typeof x==='string'&&/^[gc][A-Za-z0-9]{12}$/.test(x)):[]}}
async function loadContacts(){
  S.contacts=[];S.prefs={pinned:[],muted:{},archived:[]};S.pins={};S.verified={};S.warned=new Set();S.contactsReady=false;S.vaultOk=undefined;rebuildNames();
  if(!S.db)return;const me=S.me.handle;
  let o=null,ok=false,err=null;
  for(let i=0;i<2&&!ok;i++){try{o=await readVaultWith(S.me);ok=true}catch(e){err=e;if(!i)await new Promise(r=>setTimeout(r,800))}}  // device binding may still be settling on a fresh login; give it a moment
  if(S.me.handle!==me)return;
  if(!ok&&err&&typeof err.code==='string'){S.vaultOk=false;S.contactsReady=true;return} // the server refused or the connection dropped: nothing to show, and nothing is written over the vault (saveContacts)
  if(ok&&o)try{applyVault(o)}catch{ok=false}
  if(!ok)toastErr('Your settings couldn\u2019t be unlocked on this device.');
  S.vaultOk=ok;S.contactsReady=true;
  const pending=o===null&&!!(ls.get('hush:rekey:'+me,null)||{}).stage&&!!(S.me.prev&&S.me.prev.ecdhPriv); // a device removal half done: finishRekey writes the new vault from the old one, so nothing is saved here yet
  if(ok&&!pending&&o===null&&S.freshSignup===me){S.freshSignup=null;S.prefs.backup=true;S.prefs.tier='';saveContacts()} // new account: Message backup on from the start, and no power tier yet
  if(ok&&!pending&&S.me.handle===me&&backupOn())S.keySync=syncBackup().then(n=>{if(n&&S.me&&S.me.handle===me)keysArrived()}).catch(()=>{}); // every app open: take the keys the backup has, add the ones it lacks
  if(tierQueued&&tierQueued.h===me){const t=tierQueued.t;tierQueued=null;noteTier(t)}
  if(ok&&!pending&&S.me.handle===me){const r=recLocal(me),v=S.prefs.rec; // tell your other devices about words set up here (and words set up before this update)
    if(r&&r.loc&&r.conf!==false&&(!v||(v.loc!==r.loc&&(r.ts||0)>(v.ts||0))||(v.loc===r.loc&&r.v===2&&v.v!==2))){ /* the last: an older page saved the vault without v */S.prefs.rec=Object.assign({loc:r.loc,ts:r.ts||Date.now()},r.v===2?{v:2}:{});saveContacts()}
    // Keep the login note and its vault copy in step, so a login saved on the server survives a cleared browser.
    const hint=reconcileLoginHint(loginInfo(me),S.prefs.login);
    if(hint.toLocal)ls.set('hush:login:'+me,hint.toLocal);
    if(hint.toVault){S.prefs.login=hint.toVault;saveContacts();renderBanner()}
    // Logged in here with the password just now: that login's box address is right, whatever older settings say. It
    // goes back into the settings quietly, for every device; nothing asks for the password to repair them.
    const pv=pwVerified.get(me),pli=loginInfo(me);pwVerified.delete(me);
    if(pv&&pli&&(pli.all||{})[pv.login]!==pv.loc){const all=Object.assign({},pli.all||{},{[pv.login]:pv.loc}),fixed=hintOf(pli.login,pli.login===pv.login?pv.loc:pli.loc,all);
      ls.set('hush:login:'+me,fixed);S.prefs.login=fixed;saveContacts(true)}}
  renderBanner();
  S.cache.clear();S.chanKeys.clear();tagCache.clear();rebuildNames();syncNames();refreshDir().then(refreshPresence);pinAll();renderCalls();renderList();updateTitle();if(S.chan){const id=S.chan;openConv(id)}
}
let vaultQ=Promise.resolve();
// The page's own saves: made while the chat watch files people from notes (S.filing > 0: watchInbox), not by the user. Such a save's
// frames go through the queue below the reserve (the adapter's `later`, tag 'vault', asked when a frame reaches the queue), and the last
// save in line, if it is the page's own and not begun (vaultBg), takes the copy of the next save made with the same password rule: a
// pass that files a hundred people writes the vault once, and the vault ends with the newest copy (a save that is not joined ends the
// joining). A save of the user's never waits in the queue: from then on every save of the page's own in line before it (vaultLine: the
// saves made and not done) goes without it, a frame of theirs that waits there goes at once, and the user's is written right after
// them. A save is the account's that was signed in when it was made (`id`): after every wait it stops, writing nothing, if another
// account is signed in by then. One of the page's own that fails is made again after a wait (5 s, doubling to a minute) for as long as
// it fails, without a word; a save of the user's that fails still says so, and so does one of the page's own the user's save joined.
let vaultBg=null,vaultWait=5000;const vaultLine=new Set();
const pwVerified=new Map(); // account -> {login, loc}: a box address just proven right by logging in here with the password
function saveContacts(keepLogin){ // keepLogin: this save carries a password change made here, so its box addresses win
  if(!S.contactsReady||!S.db)return Promise.resolve();
  if(S.vaultOk===false){if(!S.vaultWarned){S.vaultWarned=true;toastErr('Your settings can’t be saved on this device until they can be unlocked. Reload to try again.')}return Promise.resolve()} // a device that could not read its vault never writes an empty one over it
  const id=S.me,me=id.handle,doc=JSON.parse(JSON.stringify({v:3,contacts:S.contacts,prefs:P(),pins:S.pins,verified:S.verified}));rebuildNames();syncNames();renderCalls();renderList(); // a contact renamed, a ticket minted or taken back: the iPhone's name table follows
  const bg=S.filing>0,keep=!!keepLogin;
  if(!bg){for(const j of vaultLine)j.bg=false;if(S.db.sendNow)S.db.sendNow('vault')}
  if(vaultBg&&vaultBg.id===id&&vaultBg.keep===keep){vaultBg.doc=doc;if(!bg)vaultBg.bg=vaultBg.own=false;return vaultBg.p} // own: the page's own copy; one the user's save joined is the user's
  const job={id,doc,keep,bg,own:bg};vaultBg=bg?job:null;vaultLine.add(job);
  job.p=vaultQ=vaultQ.then(async()=>{if(vaultBg===job)vaultBg=null;const doc=job.doc,o={later:()=>job.bg&&'vault'};try{if(S.me!==id)return;
    // saved whole, so a device still holding the addresses from before another device's password change would put them back
    if(!keep&&doc.prefs.login){const v=await syncLogin(me,o).catch(()=>null);if(S.me!==id)return;if(v)doc.prefs.login=withAll(doc.prefs.login,v.all)}
    const iv=crypto.getRandomValues(new Uint8Array(12)),key=await vaultKey();if(S.me!==id)return; // vaultKey and vaultPath work from S.me: asked only while it is this save's account
    const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('vault|'+me)},key,enc.encode(JSON.stringify(doc)));if(S.me!==id)return;
    const path=await vaultPath(me);if(S.me!==id)return;
    await S.db.doc(path).set({iv:b64(iv),ct:b64(ct),ts:Date.now()},o); // at a blind address with no username on it, so the server can't tie this box to you
    if(job.own)vaultWait=5000}finally{vaultLine.delete(job)}
  }).catch(()=>{if(!job.own){toastErr('That didn\u2019t save. Check your connection and try again.');return}
    const w=vaultWait;vaultWait=Math.min(w*2,60000);setTimeout(()=>{if(!vaultBg&&S.me===id){S.filing=(S.filing||0)+1;try{saveContacts(keep)}finally{S.filing--}}},w)});
  return vaultQ;
}
/* The account's password-box addresses as its settings hold them now. A password changed on another device moves every
   box, and this device reads the settings only when it starts: without this it would go on using the old addresses, and
   saving them back. Brings this device's login note and its copy of the settings up to date; returns the settings' copy. */
async function syncLogin(me,opt){ // opt: from saveContacts, {later:fn}: fn() gives 'vault' while the save is the page's own, asked when the read reaches the queue
  const s=await S.db.doc(await vaultPath(me)).get(opt);if(!s.exists||!S.me||S.me.handle!==me)return null;const d=s.data();
  const o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(d.iv),additionalData:enc.encode('vault|'+me)},await vaultKey(),unb64(d.ct))));
  const v=!Array.isArray(o)&&o.prefs&&loginPref(o.prefs.login);if(!v||!v.all||!S.me||S.me.handle!==me)return null;
  const li=loginInfo(me);if(li)ls.set('hush:login:'+me,withAll(li,v.all));
  if(S.prefs&&S.prefs.login)S.prefs.login=withAll(S.prefs.login,v.all);
  return v;
}
const withAll=(h,all)=>{const a=Object.assign({},h.all||{},all);return hintOf(h.login,a[h.login]||h.loc,a)}; // newer addresses win, the login's own too
function rebuildNames(){S.cnames=new Map();(S.contacts||[]).forEach(c=>{if(c.handle)S.cnames.set(c.handle,c.name)})}
const contactFor=h=>(S.contacts||[]).find(c=>c.handle===h);
// Matching contacts by phone number is off until numbers can be confirmed by text message (SPEC.md 12.4); the server
// refuses the lookups too. An unconfirmed number let anyone claim yours and be matched to your friends under your name.
async function lookupPhone(e164){return null}
let matching=false;
const TABS=['chats','calls','profile']; // the bottom tabs, left to right
function setTab(t,dir){
  const prev=S.tab;S.tab=t;renderBanner();$('#threads').hidden=t!=='chats';$('#calls').hidden=t!=='calls';$('#profileView').hidden=t!=='profile';
  document.querySelectorAll('.tab').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.tab===t)));
  const q=$('#q');if(t!=='profile'&&prev!==t&&q.value){q.value='';S.query=''}q.placeholder='Search chats, messages, people';setListTitle();
  document.querySelector('.searchrow').hidden=t!=='chats';
  $('#newBtn').hidden=t!=='chats';
  if(t==='calls')renderCalls();
  else if(t==='profile'){const v=$('#profileView');v.replaceChildren();if(S.me)buildSettings(v);v.scrollTop=0}
  else renderList();
  const view=t==='chats'?$('#threads'):t==='calls'?$('#calls'):$('#profileView');
  if(dir&&view){view.classList.remove('tab-in-l','tab-in-r');void view.offsetWidth;view.classList.add(dir>0?'tab-in-r':'tab-in-l')}
}
/* ===== HUSH SWIPE NAV BEGIN ===== */
/* Swipe navigation, one controller for the whole app. A swipe to the right that starts at the left edge goes back:
   out of a sheet, out of an open chat to the list, out of a settings page or the archive (an open chat and those
   pages also take it from anywhere that is not busy with a sideways drag of its own). No swipe moves between the
   bottom tabs. The screen follows the finger and
   goes where it was flung. Whatever already owns a sideways drag keeps it: the photo viewer, swipe-to-reply (always
   to the left, so never a back swipe), strips that scroll sideways, voice-message scrubbing, text being edited. */
const SWIPE={edge:28,slop:10,ratio:1.2,commit:.35,flick:.5,flickMin:30};
function swipeAxis(dx,dy){ // null until the finger has moved enough to tell, then 'x' (sideways) or 'y'
  if(Math.abs(dx)<SWIPE.slop&&Math.abs(dy)<SWIPE.slop)return null;return Math.abs(dx)>Math.abs(dy)*SWIPE.ratio?'x':'y'}
function swipeVelocity(pts){ // px per ms over about the last 100 ms of [time, x] samples
  if(!pts||pts.length<2)return 0;const [t1,x1]=pts[pts.length-1];let k=pts.length-2;while(k>0&&t1-pts[k][0]<100)k--;
  const [t0,x0]=pts[k];return t1>t0?(x1-x0)/(t1-t0):0}
function swipeCommits(d,width,v){ // d and v are measured toward where the swipe goes; a fling counts as much as a long drag
  if(v<=-SWIPE.flick/2)return false; // flung back the way it came: the user changed their mind
  return d>=width*SWIPE.commit||(v>=SWIPE.flick&&d>=SWIPE.flickMin)}
function swipePlan(c){ // what a sideways swipe does, decided once its direction is known
  // c: {dir: +1 right / -1 left, edge: started at the left edge, layer: null|'viewer'|'cover'|'locked'|'sheet',
  //     blocked: started on something with its own sideways drag, chat: a chat fills the screen, onList, sub}
  if(c.layer==='viewer'||c.layer==='cover'||c.layer==='locked')return null;
  if(c.layer==='sheet')return c.dir>0&&c.edge?{kind:'sheet'}:null;
  if(c.blocked&&!c.edge)return null;
  if(c.chat)return c.dir>0?{kind:'chat'}:null;
  if(!c.onList)return null;
  return c.dir>0&&c.sub?{kind:'sub'}:null;
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
  return bd._close?{kind:'sheet',bd,node:bd.querySelector('.sheet')||bd.firstElementChild}:{kind:'locked'};
}
const tabView=()=>$(S.tab==='calls'?'#calls':S.tab==='profile'?'#profileView':'#threads');
function swipeBack(){ // the back step a sub-page takes, the same as its Back button
  if(S.tab==='profile'&&isSettingsPage()){S.profilePage=S.profilePage==='settings'?'main':'settings';setTab('profile',-1);return}
  if(S.tab==='chats'&&S.showArchived){S.showArchived=false;setListTitle();renderList();const v=$('#threads');v.classList.remove('tab-in-l','tab-in-r');void v.offsetWidth;v.classList.add('tab-in-l')}
}
// Pull to refresh on the chat list: a gap opens above the rows (header and search stay put) with an iOS-style spinner whose
// ticks appear as you pull; past the line it spins briefly and the rows slide back. Messages already arrive live, so the
// refresh only redraws the list and re-reads profiles; the spin shows even when nothing is new.
function setupPullRefresh(){
  const box=$('#threads'),ptr=el('div','ptr');box.before(ptr);
  ptr.innerHTML='<svg viewBox="0 0 28 28" aria-hidden="true">'+[0,1,2,3,4,5,6,7].map(i=>`<line x1="14" y1="3" x2="14" y2="8.5" transform="rotate(${i*45} 14 14)" opacity="${1-(8-i)%8*.1}"/>`).join('')+'</svg>';
  const ticks=[...ptr.querySelectorAll('line')],GO=60,put=(v,ease)=>{ptr.style.transition=ease?'height .25s ease-out':'none';ptr.style.height=v+'px';
    box.classList.toggle('pull',v>0);ticks.forEach((t,i)=>t.style.visibility=i<v/GO*8?'':'hidden')};
  let x0=0,y0=null,d=0,busy=false;
  box.addEventListener('touchstart',e=>{d=0;y0=!busy&&box.scrollTop<=0&&e.touches.length===1?e.touches[0].clientY:null;if(y0!=null)x0=e.touches[0].clientX},{passive:true});
  box.addEventListener('touchmove',e=>{if(y0==null)return;const t=e.touches[0],dy=t.clientY-y0;
    if(box.scrollTop>0||Math.abs(t.clientX-x0)>Math.abs(dy)){y0=null;put(0,1);return} // the list scrolled, or it's a sideways swipe
    d=Math.max(0,Math.min(90,dy*.5));put(d)},{passive:true});
  box.addEventListener('touchend',async()=>{if(y0==null)return;y0=null;if(d<GO){put(0,1);return}
    busy=true;haptic();put(GO,1);ptr.classList.add('go');
    await Promise.all([Promise.all([renderList(),refreshDir()]).catch(()=>{}),new Promise(r=>setTimeout(r,450))]);
    ptr.classList.remove('go');put(0,1);busy=false});
  box.addEventListener('touchcancel',()=>{if(y0!=null){y0=null;put(0,1)}});
}
function setupSwipeNav(){
  const app=$('#app'),list=document.querySelector('.pane-list'),chat=$('#chatPane');let g=null,quietUntil=0;
  const narrow=()=>matchMedia('(max-width:759px)').matches;
  const still=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
  const decide=(k,dir)=>{
    const L=swipeLayer();if(!S.me&&!L)return null;
    const inChat=!!S.chan&&narrow()&&!L;
    const plan=swipePlan({dir,edge:k.edge,layer:L&&L.kind,blocked:ownsSideways(k.target),chat:inChat,
      onList:!L&&!inChat&&list.contains(k.target),sub:S.tab==='profile'?isSettingsPage():S.tab==='chats'&&!!S.showArchived});
    if(!plan)return null;
    if(plan.kind==='chat'){plan.node=chat;plan.under=list;app.classList.add('sw-back')}
    else if(plan.kind==='sheet'){plan.node=L.node;plan.bd=L.bd}
    else{plan.node=tabView();list.classList.add('sw-clip')}
    if(!plan.node)return null;
    plan.width=plan.node.getBoundingClientRect().width||innerWidth;
    for(const n of [plan.node,plan.under,plan.bd])if(n){n.style.transition='none';n.style.willChange='transform'}
    return plan};
  const paint=(p,d)=>{ // d: how far the finger has carried the screen, in the swipe's own direction (never negative)
    const f=Math.min(1,d/p.width);
    p.node.style.transform=`translateX(${d}px)`;
    if(p.kind==='chat')p.under.style.transform=`translateX(${-25*(1-f)}%)`;
    else if(p.kind==='sheet')p.bd.style.backgroundColor=`rgba(10,8,25,${.45*(1-f)})`;
    else p.node.style.opacity=String(1-f*.5)};
  const tidy=p=>{for(const n of [p.node,p.under,p.bd])if(n){n.style.transition='';n.style.transform='';n.style.willChange='';n.style.opacity='';n.style.backgroundColor=''}
    app.classList.remove('sw-back');list.classList.remove('sw-clip')};
  const settle=(p,go)=>{ // glide to the end the finger chose, then do the navigation (or put everything back)
    const ms=still()?0:go?180:220,ease='cubic-bezier(.2,.8,.2,1)';
    for(const n of [p.node,p.under,p.bd])if(n)n.style.transition=`transform ${ms}ms ${ease},opacity ${ms}ms ${ease},background-color ${ms}ms ${ease}`;
    if(go)paint(p,p.width);else{p.node.style.transform='';if(p.under)p.under.style.transform='';p.node.style.opacity='';if(p.bd){p.bd.style.opacity='';p.bd.style.backgroundColor=''}}
    setTimeout(()=>{
      if(!go){tidy(p);return}
      haptic();
      if(p.kind==='chat'){app.classList.add('sw-quiet');tidy(p);closeConv();requestAnimationFrame(()=>requestAnimationFrame(()=>app.classList.remove('sw-quiet')))}
      else if(p.kind==='sheet'){p.bd.style.visibility='hidden';(p.bd._close||(()=>p.bd.remove()))();tidy(p)}
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
    settle(k.plan,e.type==='touchend'&&swipeCommits(d,k.plan.width,swipeVelocity(k.pts)*k.plan.dir))};
  document.addEventListener('touchend',end,{capture:true});document.addEventListener('touchcancel',end,{capture:true});
  document.addEventListener('click',e=>{if(Date.now()<quietUntil){e.stopPropagation();e.preventDefault()}},true); // a swipe is not a tap
}
function contactAvatar(c,cls=''){return c.handle&&S.dir[c.handle]?avatar(c.handle,c.name,cls,S.dir[c.handle].photo):avatar(c.id,c.name,cls)}
/* ---------- the Calls tab ---------- */
// A list of this device's own, made of the call entries it has opened in its one-on-one chats. Each row is
// [chat, message, time, outcome, outgoing, video, seconds, end of life] and carries no name; the rows are kept in the
// sealed device store and nowhere else, and nothing here asks the server anything.
const CALLS_MAX=200;
const callsChat=c=>!!c&&typeOf(c)==='dm'&&!isSelf(c)&&!isRequest(c)&&!hiddenConv(c);
const callsUp=()=>!!S.me&&S.contactsReady&&S.vaultOk!==false; // requests, blocks and cleared chats are known only once the settings are read
function noteCalls(c,posts,opened,open){ // posts of chat c with what openPost made of them; open: they are all the open chat shows
  if(!callsUp()||!callsChat(c)||!S.convs.some(x=>x.id===c.id))return; // a chat of the account on this page now, not of the one before it
  const key='hush:calls:'+S.me.handle,was=ls.get(key,[]),now=Date.now(),peer=dmPeer(c),ids=new Set(posts.map(p=>p._id||p.id));
  const min=!open||!S.loaded?Infinity:S.allLoaded?0:Math.min(...posts.map(p=>p.ts||0)); // as pruneIdx: only as far back as the chat is loaded
  const rows=was.filter(r=>r[0]!==c.id||!(ids.has(r[1])||r[2]>=min));
  posts.forEach((p,i)=>{const o=opened[i],k=o&&o.call,id=p._id||p.id;
    if(k&&k.kind&&k.peer===peer&&o.verified&&id&&!p._pending&&!(p.ts>now+3000)&&!(p.exp&&p.exp<=now)&&!goneForMe(c.id,{ts:p.ts,_id:id}))rows.push([c.id,id,p.ts,k.kind,k.out?1:0,k.video?1:0,k.secs,p.exp||0])});
  const next=rows.sort((a,b)=>b[2]-a[2]).slice(0,CALLS_MAX);
  if(JSON.stringify(next)!==JSON.stringify(was)){ls.set(key,next);renderCalls()}
}
function callRows(){ // the rows to show, newest first; a row whose message is gone for this account is dropped for good
  if(!callsUp())return [];const key='hush:calls:'+S.me.handle,was=ls.get(key,[]),now=Date.now(),shown=[];
  const keep=was.filter(r=>{const c=S.convs.find(x=>x.id===r[0]);if((r[7]&&r[7]<=now)||goneForMe(r[0],{ts:r[2],_id:r[1]})||(c&&!callsChat(c)))return false;if(c)shown.push(r);return true}); // a chat this device does not hold at the moment keeps its rows, unshown
  if(keep.length!==was.length)ls.set(key,keep);return shown}
function callGroups(rows){ // calls back to back with the same person, the same words, direction and kind, on the same day: one row
  const gs=[];rows.forEach(r=>{const c=S.convs.find(x=>x.id===r[0]),k=callOf({kind:r[3],secs:r[6],video:r[5]},true,!!r[4],dmPeer(c)),w=callText(k),day=new Date(r[2]).toDateString(),g=gs[gs.length-1];
    if(g&&g.c.id===c.id&&g.w===w&&g.k.out===k.out&&g.k.video===k.video&&g.day===day)g.n++;else gs.push({c,k,w,day,ts:r[2],n:1})});
  return gs}
function renderCalls(){
  const bn=$('#tabCallsN'),box=$('#calls'),rows=callRows();let n=0;
  if(rows.length){const sk='hush:callsSeen:'+S.me.handle,seen=ls.get(sk,0);n=rows.filter(r=>r[2]>seen&&callMissed({out:!!r[4],kind:r[3]})).length;
    if(n&&S.tab==='calls'){ls.set(sk,Math.max(Date.now(),rows[0][2]));n=0}} // being on Calls sees every missed call, also one that comes in while it is open
  bn.hidden=!n;bn.textContent=n>99?'99+':String(n);
  if(n)bn.parentNode.setAttribute('aria-label','Calls, '+n+(n===1?' missed call':' missed calls'));else bn.parentNode.removeAttribute('aria-label');
  box.replaceChildren();if(box.hidden||!callsUp()||!S.convsLoaded)return; // a list not on screen holds nothing; before the settings and the chats are in, "No calls yet" would not be known
  const gs=callGroups(rows);
  if(!gs.length){const e=el('div','empty');e.append(el('strong',null,'No calls yet'),el('span',null,'Calls you make and receive in one-on-one chats show up here. Call entries are end-to-end encrypted, like your messages.'),el('span','calls-note','Older calls show up after you open their chat.'));box.append(e);return}
  gs.forEach(g=>{const c=g.c,name=convTitle(c),row=el('div','thread crow'+(callMissed(g.k)?' missed':'')),main=el('button','crow-main'),m=el('div','t-main'),top=el('div','t-row');
    main.type='button';top.append(withBadge(el('div','t-name',g.n>1?name+' ('+g.n+')':name),dmPeer(c)),el('span','t-time',fmtListTime(g.ts)));m.append(top,el('div','t-sub',g.w));
    main.append(convAvatar(c),m);main.onclick=()=>openConv(c.id);row.append(main);
    if(callable(c)){const call=(icon,label,o)=>{const b=html('button','icon-btn crow-call',icon);b.type='button';b.setAttribute('aria-label',label+' '+name);b.onclick=()=>startCall(convById(c.id),o);row.append(b)}; // a tap on a button rings, as the chat's own header does; nothing else here does
      if(videoCan())call(I.video,'Video call',{cam:true});call(I.phone,'Call')}
    box.append(row)});
  box.append(el('div','calls-note','Older calls show up after you open their chat.'));
}
function openInviteFriends(){
  const {body}=sheet('Invite friends');
  const box=el('input','linkbox');box.readOnly=true;box.value=myInviteLink();box.onfocus=()=>box.select();
  body.append(el('p',null,'Anyone who opens this link after signing up lands in a private chat with you.'),box,shareRow(inviteText(),myInviteLink()));
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
  if(!S.db||!S.db.online){toastErr('You’re offline. Try again once you’re connected.');return}
  const d=S.dir[h]||await lookupHandle(h);
  if(!d){toastErr('Couldn’t find @'+h+' on Hush.');return}
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
const pinOf=d=>Object.assign(keysOf(d),Array.isArray(d.prev)?{prev:d.prev.filter(p=>p&&p.sig&&typeof p.sig.x==='string'&&typeof p.sig.y==='string'&&Number.isFinite(p.until)).slice(-8).map(p=>({sig:{x:p.sig.x,y:p.sig.y},until:p.until}))}:{}); // a pin with the profile's key history as first seen: their older messages verify by it
const keyChanged=h=>!!(S.me&&h!==S.me.handle&&S.pins&&S.pins[h]&&S.dir[h]&&!sameKeys(S.pins[h],S.dir[h]));
const fpOf=k=>k?[k.ecdh.x,k.sig.x].join('.'):'';
const isVerified=h=>!!(S.verified&&S.pins&&S.pins[h]&&S.verified[h]===fpOf(S.pins[h])&&!keyChanged(h));
let pinSaveT=null;
function pinAll(){
  if(!S.contactsReady||!S.me)return;let added=false;
  const hs=new Set();(S.contacts||[]).forEach(c=>c.handle&&hs.add(c.handle));S.convs.forEach(c=>knownIn(c).forEach(h=>hs.add(h)));
  const cur=curConv();if(cur)knownIn(cur).forEach(h=>hs.add(h));
  hs.forEach(h=>{if(h!==S.me.handle&&!S.pins[h]&&S.dir[h]){S.pins[h]=pinOf(S.dir[h]);added=true}});
  if(added){clearTimeout(pinSaveT);pinSaveT=setTimeout(saveContacts,1500)}
  checkKeys();
}
function checkKeys(){
  Object.keys(S.pins||{}).forEach(h=>{if(keyChanged(h)&&!S.warned.has(h)){S.warned.add(h);
    toast(`\u26a0\ufe0f ${displayName(h)}\u2019s security code changed`,'Review',()=>openProfile(h))}});
}
async function acceptKey(h){
  if(!S.dir[h])return;
  for(const c of S.convs)if(typeOf(c)==='dm'&&!isSelf(c)&&dmPeer(c)===h)await dmBaseBits(c).catch(()=>{}); // the secret our chat began with, while S.pins still gives their old key: its history stays readable (release 21)
  const old=S.pins[h];S.pins[h]=Object.assign(keysOf(S.dir[h]),old&&old.sig?{prev:[...(old.prev||[]).slice(-7),{sig:old.sig,until:Date.now()}]}:{}); // the key accepted before stays pinned as history: their old messages verify by it, and by nothing the server could name
  delete S.verified[h];S.warned.delete(h);
  S.cache.clear();S.chanKeys.clear();metaCache.clear();saveContacts();toast(`Accepted ${displayName(h)}\u2019s new security code`); // metaCache: each ometa read again, so a list signed by the new key is taken into the roles record now (noteRoles)
  dmIds.delete(h);for(const [id,c] of S.previews)if(typeOf(c)==='dm'&&dmPeer(c)===h&&!dmInfo(id)&&!S.convs.some(x=>x.id===id))S.previews.delete(id); // the id their old key gave: a chat opened under it, never created, is forgotten
  if(S.chan){const id=S.chan;setTimeout(()=>convById(id)?openConv(id):openDm(h),50)} // the open chat again, or the one their key names now
  rewrapFor(h).catch(()=>{});
}
async function rewrapFor(h){ // after accepting someone's new key: our chat keys to their devices again (wrapKey refused while it was unaccepted), and a fresh key for our one-on-one chat. Once per key version of theirs.
  const me=S.me.handle,k='hush:rewrapped:'+h,kv=(S.dir[h]&&S.dir[h].kv)||1,was=ls.get(k,null),done=was&&was.kv===kv&&Array.isArray(was.cids)?was:{kv,cids:[]};
  for(const c of S.convs.slice()){if(!S.me||S.me.handle!==me)return;if(done.cids.includes(c.id))continue;const dm=typeOf(c)==='dm';
    if(dm?(isSelf(c)||dmPeer(c)!==h||epochOf(c)<1):(c.visibility==='public'||!(c.members||[]).includes(h)||!(await adminSecret(c).catch(()=>null))))continue;
    let ok=false;for(let rl=0;!ok;){await pause(300);
      try{if(dm){await rotateTo(c,{members:[me,h]});await S.db.rebaseChat(c.id,await memberCap(c,0))}else await resendKeys(c.id,h);ok=true} // the one-on-one chat's base key from the two current keys, too: a removal that found their key unaccepted left it
      catch(e){if(e&&e.code==='ratelimit'){await pause(REKEY_BACKOFF[Math.min(rl++,REKEY_BACKOFF.length-1)]);continue}break}}
    if(ok){done.cids.push(c.id);ls.set(k,done)}}
}
function keyWarnBox(h,onReview){
  const w=el('div','keywarn');w.innerHTML=I.shield;const m=el('div','kw-main');
  m.append(el('b',null,`${displayName(h)}\u2019s security code changed`),
    el('span',null,'A code changes when someone removes a lost device or sets their account up again — or when someone is trying to intercept your messages. Check with them in person or on a call before you accept it.'));
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
function pwForm(login){ // a real form, as at login, so the phone's password manager offers to save or update the password; the hidden username names the account, since these sheets show none
  const un=el('input');un.name='username';un.autocomplete='username';un.value=login||'';un.hidden=true;un.readOnly=true;un.tabIndex=-1;
  const form=el('form');form.method='post';form.action='#';form.onsubmit=e=>e.preventDefault();form.append(un);return form;
}
function openBackup(forced){
  const me=S.me,had=hasRecovery(me.handle);
  const {body,close}=sheet('Your recovery words',{locked:forced===true});
  const intro=()=>{body.replaceChildren(
    el('p',null,forced===true?'One last thing. Hush gives you twelve words that, with your username, bring your account back if you lose this phone or forget your password.':'Twelve words that, with your username, bring your account back if you lose this phone or forget your password.'),
    el('p','warnbox','Nobody can reset your account for you \u2014 not Hush, not your phone company, not a court order. That\u2019s what keeps you safe. It also means these words are your only way back in, so write them on paper and keep them somewhere safe.'));
    body.append(el('p','hint','The words bring back your account and your pinned, muted and blocked lists. Groups and past messages come back only if \u201cMessage backup\u201d in Settings is on.'));
    if(had&&forced!==true)body.append(el('p','hint',recOld(me.handle)?'Your words are an older, shorter kind (6 words). New ones are 12 words and far harder to guess. Making new words turns your old ones off.':'Making new words turns your old ones off.'));
    const go=el('button','primary',had&&forced!==true?'Make new words':'Show my words');go.style.width='100%';const err=el('div','err');body.append(go,err);
    go.onclick=async()=>{if(!S.db){err.textContent='You need to be online for this.';return}go.disabled=true;go.textContent='Locking your account\u2026';
      const w=newRecoveryWords();try{await saveRecovery(me,w);renderBanner();show(w)}catch{go.disabled=false;go.textContent='Try again';err.textContent='Couldn\u2019t save. Check your connection and try again.'}};
  };
  const show=w=>{body.replaceChildren(el('p',null,'Write these twelve words down, in order, with your username ('+atOf(me.handle)+'). Paper is best.'));
    const g=el('ol','rwords');w.forEach(x=>g.append(el('li',null,x)));body.append(g);
    const cp=el('button','secondary','Copy words');cp.onclick=async()=>{try{await navigator.clipboard.writeText(w.join(' '));toast('Copied. Paste them somewhere private.')}catch{toastErr('Couldn\u2019t copy. Write them down instead.')}};
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
function openRestore(prefill,user){ // user: a username already typed on the login screen
  const {body,sh,close}=sheet('Restore an account');sh.parentNode.style.zIndex='60';
  body.append(el('p',null,'Type your username and your recovery words, in order. The first 4 letters of each word are enough.'),el('p','hint','Your account and your pinned, muted and blocked lists come back. Groups and past messages come back only if \u201cMessage backup\u201d was turned on.'));
  const f0=el('label','field');const un=el('input');un.type='text';un.placeholder='Username';un.autocomplete='username';un.autocapitalize='none';un.spellcheck=false;un.value=user||'';f0.append(el('span',null,'Username'),un);body.append(f0);
  const f1=el('label','field');const code=el('textarea','linkbox');code.rows=3;code.placeholder='e.g. maple river anchor\u2026';code.value=prefill||'';code.spellcheck=false;code.autocapitalize='none';code.autocomplete='off';f1.append(el('span',null,'Recovery words'),code);
  const go=el('button','primary','Restore account');go.style.width='100%';const err=el('div','err');
  body.append(f1,go,err);setTimeout(()=>(un.value?code:un).focus(),50);
  un.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();code.focus()}};
  code.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();go.click()}};
  go.onclick=async()=>{err.textContent='';
    let words;try{words=readWords(code.value)}catch(e){err.textContent=e.message==='count'?`That\u2019s ${e.n} word${e.n===1?'':'s'}. You need all ${RW_COUNT} (or all ${RW_OLD}, if your words are the older, shorter kind).`:`Word ${e.n} (\u201c${e.t}\u201d) isn\u2019t one of the recovery words. Check the spelling.`;return}
    const u=recUser(un.value),old=words.length===RW_OLD; // the username is the salt of 12-word sets; 6-word sets never needed it
    if(!old&&!u){err.textContent=un.value.trim()?'That isn\u2019t a username: 3 to 20 letters, numbers or _.':'Enter your username too: your recovery words only work together with it.';un.focus();return}
    go.disabled=true;go.textContent='Unlocking\u2026';
    try{if(!S.db)throw new Error('offline');const id=await openRecovery(words,u).catch(x=>{throw new Error(x.message==='nomatch'?'nomatch':'net')});
      if(!S.db)throw new Error('offline');
      ls.set('hush:backedUp:'+id.handle,Date.now());
      if(lastRecLoc)ls.set('hush:recovery:'+id.handle,Object.assign({loc:lastRecLoc,ts:Date.now(),conf:true},old?{}:{v:2})); // these words work, so they count as set up (old ones get the nudge to replace them)
      ls.set('hush:recovered:'+id.handle,Date.now());S.resetFor={handle:id.handle}; // path three: the password was forgotten, so a new one is set next
      if(!(await enterAccount(id))){go.disabled=false;go.textContent='Restore account';return}
      close();toast(S.backupRestored?'Welcome back, '+id.name+'. Your past messages are back too.':'Welcome back, '+id.name);
      if(old)setTimeout(()=>toast('Your recovery words are an older, shorter kind. Make new ones in Settings \u2192 Advanced \u2192 Recovery words.'),4000); // asked, not forced; the banner offers it too
    }catch(e){err.textContent=e&&e.message==='nomatch'?(old?'Those words don\u2019t match an account. Check the order and spelling.':'Those words don\u2019t match that username. Check the username, the order and the spelling.')
        :e&&e.message==='stale'?'These recovery words are old ones. They stopped working when a device was removed from your account. Use a device you\u2019re still logged in on, then make new words. If you aren\u2019t logged in anywhere, these words can\u2019t bring the account back: whoever removed the device has it.':'Couldn\u2019t restore. Check your connection and try again.';
      go.disabled=false;go.textContent='Restore account'}};
}
async function enterAccount(id){ // shared by log in and restore
  const was=S.ids.find(x=>x&&x!==id&&x.handle===id.handle); // the account is still on this browser (Add or restore account): ensureDev keeps its device key, or replacedDev below retires it
  try{await ensureDev(id)}catch{} // a device key that could not be made or signed: the account key still signs in below
  try{await bindDevice(id)}catch{}
  S.backupRestored=await restoreBackup(id);
  const ref=S.db.doc('directory/'+id.handle),s=await ref.get();
  if(s.exists&&(s.data().kv||1)>(id.kv||1))throw new Error('stale');
  if(s.exists&&!sameKeys(keysOf(s.data()),id)){
    if(!confirm('The security code Hush holds for you doesn\u2019t match your account. Someone may have tampered with it. Continue and put your real code back?'))return false;
    await ref.update({ecdh:id.ecdh,sig:id.sig,kv:id.kv||1,ts:Date.now()})}
  else if(!s.exists)await ref.set(Object.assign({handle:id.handle,name:id.name,ecdh:id.ecdh,sig:id.sig,kv:id.kv||1,ts:Date.now()},id.dev&&id.dev.s?{devs:{[id.dev.id]:devEntry(id.dev)}}:{}));
  {const old=s.exists?replacedDev(was,id,s.data().devs):null;if(old){await ref.update({devs:{[old]:null}}).catch(()=>{});if(S.dir[id.handle]&&S.dir[id.handle].devs)delete S.dir[id.handle].devs[old]}} // linked again here: this browser's old device comes off, as a logout takes it off
  S.ids=S.ids.filter(x=>x.handle!==id.handle);S.ids.push(id);ls.set('hush:ids',S.ids);
  document.querySelectorAll('.onboard').forEach(x=>x.remove());start(id);
  if(S.resetFor&&(!S.resetFor.handle||S.resetFor.handle===id.handle)){const r=S.resetFor;S.resetFor=null;rememberLogin(id.handle,{login:r.login});
    setTimeout(()=>openSetupLogin(true),700)}else S.resetFor=null;
  if(S.pendingJoin){const pj=S.pendingJoin;S.pendingJoin=null;setTimeout(()=>handleJoin(pj),400)}
  return true;
}
/* ---------- power roles need a secured account (SPEC.md 4.6) ----------
   An owner or admin of a group or channel holds keys to other people's chats, so their password must be strong (12+).
   The server can't see passwords: the page checks, and once a password it saw was strong it sets the account's
   secured mark, which only the server can read. Without it the server won't let the account create a group or channel,
   and opens its chats at member level, owner or admin tools paused, until the account is secured. Skipping the prompt
   keeps it that way: a new group or channel isn't made, and an existing role stays paused, asked about again next load. */
const isSecure=h=>!!(ls.get('hush:secure:'+h,0)||(S.me&&S.me.handle===h&&S.contactsReady&&P().secure));
async function markSecure(){
  if(!S.me||!S.db)return false;const h=S.me.handle;
  try{await S.db.doc('secure/'+h).set({ts:Date.now()})}catch{return false}
  ls.set('hush:secure:'+h,Date.now());if(S.contactsReady&&!P().secure){P().secure=true;saveContacts()}
  for(const cid of S.paused||[])S.db.reopen(cid).catch(()=>{});S.paused=new Set();return true;
}
function ensureSecure(role,name,kind,held){ // true once the account may hold this role; asks only when needed
  if(isSecure(S.me.handle))return Promise.resolve(true);
  return new Promise(res=>openSetupLogin(false,{role,name,kind,held,done:res}));
}
const powerAsked=new Set();
function askPower(cid,held){ // the server opened a chat at member level: this account holds a power role there, unsecured
  (S.paused||(S.paused=new Set())).add(cid);if(!S.me||powerAsked.has(cid)||S.securing)return;powerAsked.add(cid);
  const c=convById(cid)||S.chatDocs.get(cid)||{};S.securing=true;
  ensureSecure(held,c.name||'this chat',typeOf(c)==='channel'?'channel':'group',true).then(()=>{S.securing=false});
}
const powerLead=p=>'You\u2019re '+(p.role==='owner'?(p.held?'the owner':'about to become the owner'):'now an admin')+' of \u201c'+p.name+'\u201d. '+(p.role==='owner'?'Owners':'Admins')+' look after this '+p.kind+', so your password needs to be stronger: at least 12 characters.';
function openSetupLogin(reset,power){ // reset: true after a recovery with the words (path three); power: {role,name,kind,done} securing for a power role
  const me=S.me,li=loginInfo(me.handle)||{login:me.handle};
  // Back with the recovery words and no new password yet: the old one is forgotten, so it is never asked for (SPEC.md 14.14)
  if(ls.get('hush:recovered:'+me.handle,null))reset=reset||true;
  const cur=li.loc&&!reset?li:null,strong=!!power||isSecure(me.handle);
  const {body,sh,close}=sheet(power?'Secure your account':reset?'Choose a new password':cur?'Change password':'Add a password');
  body.append(el('p',null,power?powerLead(power):reset?'You\u2019re back in. Pick a new password so you can log in with it next time.':cur?'Enter your current password, then choose a new one.':'Optional. A password lets you log in on a new device even when your other devices aren\u2019t around. It locks your account on this device first, so Hush never sees it and can\u2019t reset it.'));
  const {f:fo,i:po}=pwField('Current password','current-password');
  const {f:f1,i:p1}=pwField(strong?'New password (at least 12 characters)':cur?'New password':'Password (at least 8 characters)','new-password');
  const {f:f2,i:p2}=pwField('Type it again','new-password');
  const go=el('button','primary',power?'Secure my account':cur?'Change password':'Save password');go.style.width='100%';const err=el('div','err');
  const askCur=cur||(power&&!reset);if(askCur&&power)f1.hidden=f2.hidden=true; // power: the current password is checked first (not when it was forgotten: back with the recovery words); new fields only if it is too weak
  const form=pwForm(li.login);form.append(...(askCur?[fo]:[]),f1,f2,go);go.type='submit';body.append(form,err);setTimeout(()=>(askCur?po:p1).focus(),50);
  let secured=false;
  if(power){
    fo.after(el('p','hint','Already strong? Just re-enter your current password.'));
    const lock=el('button','link','Turn on app lock');lock.onclick=()=>openAppLock();
    const later=el('button','link','Not now');later.onclick=close;
    body.append(el('p','hint','Also turn on the app lock, so someone who picks up your phone can\u2019t act as you in this '+power.kind+'.'),lock,
      el('p','hint',power.role==='owner'&&!power.held?'Not now: the '+power.kind+' isn\u2019t created.':'Not now: you stay in the '+power.kind+' and can read and post, but your '+power.role+' tools wait until your account is secured.'),later);
    const watch=setInterval(()=>{if(!sh.isConnected){clearInterval(watch);power.done(secured)}},300);
  }
  go.onclick=async()=>{err.textContent='';
    // One password for every way in: a box for the username and for each email or number, all replaced together, and
    // the old boxes removed so the old password stops working everywhere (after a reset too).
    const login=li.login,logins=loginsOf(me.handle);
    if(power&&f1.hidden){ // step one: the password they already have, kept as it is when it is strong enough
      if(!po.value){err.textContent='Enter your current password.';po.focus();return}
      go.disabled=true;
      try{await openLoginBox(login,po.value)}catch(e){go.disabled=false;
        err.textContent=e&&e.code==='ratelimit'?(/wrong passwords/.test(e.message||'')?'Too many wrong passwords for this login. Try again later.':'Too many tries from this network just now. Wait a minute, then try again.'):'That isn\u2019t your current password.';
        if(!cur&&!(e&&e.code==='ratelimit')){f1.hidden=f2.hidden=false;err.textContent+=' No password saved for this account? Choose one below.'}return}
      if(!pwStrongEnough(po.value)){go.disabled=false;f1.hidden=f2.hidden=false;err.textContent='Your current password is too weak for this. Choose a new one below: at least 12 characters, not all lowercase.';p1.focus();return}
      if(!(await markSecure())){go.disabled=false;err.textContent='Couldn\u2019t save. Check your connection and try again.';return}
      secured=true;close();toast('Your account is secured');return}
    const bad=logins.map(l=>pwProblem(p1.value,isHandleLogin(l)?null:l,me.handle)).find(Boolean)||(strong&&p1.value.length<12?'Use at least 12 characters: this password guards '+(power?'your '+power.kind:'your groups and channels')+'.':null);if(bad){err.textContent=bad;return}if(p1.value!==p2.value){err.textContent='The passwords don\u2019t match.';return}
    go.disabled=true;go.textContent='Locking your account\u2026';
    try{
      if(cur){try{await openLoginBox(login,po.value)}catch(e){throw e&&e.code==='ratelimit'?e:new Error('oldpw')}}
      const old=new Set(Object.entries(Object.assign({},li.all||{},li.loc?{[login]:li.loc}:{})).map(([l,x])=>l+'|'+x));
      // and the current password's own boxes, worked out from it for every login: settings left out of date (release 13)
      // may not name them, and the old password must stop working everywhere
      if(cur)for(const l of logins)old.add(l+'|'+(await loginSecrets(l,po.value)).loc);
      const all=await saveLoginBoxes(me,logins,p1.value);rememberPw(login,p1.value);
      for(const e of old){const i=e.lastIndexOf('|'),l=e.slice(0,i),loc=e.slice(i+1);if(all[l]!==loc)dropLoginBox(l,loc)}
      rememberLogin(me.handle,{login,loc:all[login],all},true);ls.set('hush:backedUp:'+me.handle,Date.now());ls.set('hush:recovered:'+me.handle,null);renderBanner();
      if(pwStrongEnough(p1.value)&&await markSecure())secured=true;
      close();(power&&!secured?toastErr:toast)(power?(secured?'Your account is secured':'Password changed, but it couldn\u2019t be marked as secured. Try again.'):cur?'Password changed':'Password added');if(S.tab==='profile')setTab('profile');
    }catch(e){go.disabled=false;go.textContent=cur?'Change password':'Save password';
      err.textContent=e&&e.message==='oldpw'?'Your current password isn\u2019t right.':e&&e.code==='ratelimit'?(/wrong passwords/.test(e.message||'')?'Too many wrong passwords for this login. Try again later.':'Too many tries from this network just now. Wait a minute, then try again.'):'Couldn\u2019t save. Check your connection and try again.'}};
}
/* ---------- moving to a new device; keys move between your devices, never through readable server data ----------
   No screen sends or checks an emailed code any more: a new device is let in by one where the account is logged in
   (SPEC.md 14.14), or comes back with the recovery words. */
const isEmailLogin=l=>!!l&&l.includes('@');
function deviceName(){const u=navigator.userAgent;const os=/iPhone/.test(u)?'iPhone':/iPad/.test(u)||(/Mac/.test(u)&&navigator.maxTouchPoints>1)?'iPad':/Android/.test(u)?'Android':/Mac/.test(u)?'Mac':/Windows/.test(u)?'Windows PC':'a device';
  const br=/CriOS|Chrome/.test(u)&&!/Edg/.test(u)?'Chrome':/Edg/.test(u)?'Edge':/Firefox|FxiOS/.test(u)?'Firefox':/Safari/.test(u)?'Safari':'a browser';return br+' on '+os}

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
  // Where people aim, at full resolution and enlarged to 800 px: the centre 60%, then a tighter 35% for a small or blurred
  // code, then the whole frame shrunk for one held off-centre. A camera tries one of these per frame, in turn, so a phone
  // isn't busy for long; a single photo tries them all.
  const read=(src,sx,sy,sw,sh,up)=>{const k=up?800/Math.max(sw,sh):Math.min(1,800/Math.max(sw,sh));cv.width=Math.round(sw*k);cv.height=Math.round(sh*k);
    cx.imageSmoothingQuality='high';cx.drawImage(src,sx,sy,sw,sh,0,0,cv.width,cv.height);
    const r=jq(cx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height,{inversionAttempts:'attemptBoth'});return r&&r.data||null};
  const crop=(src,w,h,f)=>{const s=Math.round(Math.min(w,h)*f);return read(src,Math.round((w-s)/2),Math.round((h-s)/2),s,s,true)};
  const ways=[(src,w,h)=>crop(src,w,h,0.6),(src,w,h)=>crop(src,w,h,0.35),(src,w,h)=>read(src,0,0,w,h,false)];let turn=0;
  return async src=>{const w=src.videoWidth||src.naturalWidth||src.width,h=src.videoHeight||src.naturalHeight||src.height;if(!w||!h)return null;
    if(src.videoWidth)return ways[turn++%ways.length](src,w,h);
    for(const way of ways){const r=way(src,w,h);if(r)return r}return null};
}
// What linking a device says when it doesn't work. The server's or the network's reason first, then the people-made ones.
const linkNetErr=e=>e&&e.code==='ratelimit'?'Too many lookups from this network just now. Wait a minute, then try again.'
  :e&&e.code==='offline'?'Can\u2019t reach Hush. Check your connection, then try again.':'';
const linkScanErr=e=>linkNetErr(e)||linkScanMsg(e);
const linkScanMsg=e=>{const m=e&&e.message;return m==='notqr'?'That isn\u2019t a Hush login code.'
  :m==='expired'||(e&&e.code==='denied')?'That code has expired or was already used. Show a new one on your other device.'
  :m==='oldcode'?'That code is from an older version of Hush. Reload Hush on your other device, then show a new code.'
  :m==='badcode'?'That code doesn\u2019t look right. Check each character against your other device\u2019s screen.'
  :m==='wrongway'?'That code is for a new device to scan. Here, scan the code the new device shows.'
  :m==='swapped'?'That code doesn\u2019t match the request behind it, so nothing was shared. Show a new code on the new device and scan again.'
  :'That didn\u2019t go through. Check your connection and try again.'};
const linkWaitMsg=e=>e&&e.message==='denied'?'Your other device didn\u2019t let this one in, so nothing was shared.'
  :e&&e.message==='timeout'?'No answer came from your other device. Check it still shows the code, then scan again.'
  :e&&e.message==='ended'?'Your other device stopped showing that code, so nothing was shared. Show a new one and scan again.'
  :e&&e.message==='format'?'What arrived couldn\u2019t be opened, so nothing was used. Scan again.'
  :'Couldn\u2019t finish. Check your connection, then scan again.';
// A scanned or typed code (SPEC.md 14.14): the 128-bit secret of the code a signed-in device shows. Codes from before
// (versions 2 and 3, made by a new device for its own request) are refused with a word about why.
function linkProof(text){
  const t=String(text||'').trim(),m=/^hush-link:4:([A-Za-z0-9_-]{22})$/.exec(t);
  if(m)return {secret:unb64u(m[1])};
  if(/^hush-link:[23]:/.test(t))throw new Error('oldcode');
  const c=parseLinkCode(t,4);
  if(!c)throw new Error(/^hush-link:/.test(t)?'notqr':parseLinkCode(t,3)||parseLinkCode(t,2)?'oldcode':'badcode');
  return {secret:c.secret};
}
/* ---------- path one, the signed-in device's side: "Link a new device" (SPEC.md 14.14) ----------
   From release 58 the NEW device shows the code and this one scans it: the device in use is the one with the camera
   out, and the new device has no app lock yet to go dark behind. The code names the new device's ask (its keys, at an
   address made from the code's secret) and carries the fingerprint of those keys; a match is the approval, given at once
   from this account's session, with no further question. Whoever's code is scanned gets this account, so the screen says
   to scan only the device in your other hand. A device with no camera (a computer) shows a code instead (openLinkOffer):
   a fresh 128-bit secret the new device scans or types, whose claim this device checks and lets in after one tap. */
function openLinkScanner(){
  hasCamera().then(yes=>{if(!yes)return openLinkOffer();let got=null;
    scanOtherCode(async t=>{got=await approveAsk(t)},()=>{if(!got)return;const {d,key}=got;haptic();
      toast('Linked '+(d.dev||'the new device')+' to your account. Device code '+key+'. Not yours?','Remove it',()=>removeDevice(d.devk.id,d.dev||'A device',key),30e3)},
      {title:'Link a new device',hint:'On the new device, tap Log in \u2192 Log in with my other device. It shows a code: scan it here.',noType:true,
       warn:'Scan only the code on the device in your other hand. Whoever\u2019s code you scan gets your whole account, at once.',alt:['No camera here? Show a code instead',openLinkOffer]})})}
// The new device's code (version 5) names its ask; the ask must be fresh, unanswered and carry exactly the keys the code
// fingerprints. Then approveLink, as for a claim. Returns {d, key} for the toast; throws a word for linkScanMsg otherwise.
async function approveAsk(text){
  const q=parseLinkQr5(text);
  if(!q)throw new Error(/^hush-link:4:/.test(String(text||'').trim())||parseLinkCode(text,4)?'wrongway':/^hush-link:/.test(String(text||'').trim())?'oldcode':'notqr');
  const tag=await offerTag(await offerName(q.secret)),ref=S.db.doc('linkreqs/'+tag),s=await ref.get(),d=s.exists&&s.data();
  if(!d||d.state!=='ask'||!(S.db.now()-d.ts<5*60e3))throw new Error('expired'); // both sides stamp the server's clock
  const fp=unb64u(await linkFp(d.pub,d.devk));if(q.fp.some((b,i)=>b!==fp[i]))throw new Error('swapped');
  const key=await devShort(d.devk);await approveLink(tag,d,q.secret);linkedDev(ref,d);return {d,key};
}
function linkedDev(ref,d){ // after an approval: the row goes if the new device can't clear it, and its notice is the toast already shown
  setTimeout(()=>ref.delete().catch(()=>{}),60e3);
  const k='hush:devsSeen:'+S.me.handle,seen=ls.get(k,null);if(seen)ls.set(k,[...new Set([...seen,d.devk.id])])}
function openLinkOffer(){
  const {body,sh,close}=sheet('Link a new device');sh.parentNode.style.zIndex='70';
  body.append(el('p','hint','On the new device, tap Log in \u2192 Log in with my other device \u2192 Scan or type its code instead, then scan this code with it.'));
  const host=el('div');body.append(host);showOffer(host,sh,close);
}
async function showOffer(host,sh,close){
  host.replaceChildren(el('p','hint center','Making a code\u2026'));
  const secret=crypto.getRandomValues(new Uint8Array(16)),n=await offerName(secret),tag=await offerTag(n),ref=S.db.doc('linkreqs/'+tag),end=Date.now()+5*60e3;
  try{await ref.set({state:'offer',ts:Date.now(),h:S.me.handle,n})}
  catch(e){host.replaceChildren(el('p','hint center',linkNetErr(e)||'Couldn\u2019t make a code. Check your connection, then close this and try again.'));return}
  const q=el('div','qr big'),left=el('p','hint center'),svg=qrSvg('hush-link:4:'+b64u(secret),'QR code for your new device to scan');if(svg)q.innerHTML=svg;
  host.replaceChildren(el('p',null,'Scan this with your new device, or type the code under it there.'),q,el('div','link-code-text',linkCode(secret,null,4)),left,
    el('p','warnbox','Only let a device you\u2019re holding scan this: whoever scans it first is let into your account.'));
  let over=false;
  const stop=msg=>{over=true;ref.delete().catch(()=>{});if(msg)host.replaceChildren(el('p','hint center',msg))};
  const approve=async d=>{const key=await devShort(d.devk);left.textContent='Letting '+(d.dev||'the new device')+' in (device code '+key+')\u2026';
    try{await approveLink(tag,d,secret)}
    catch(e){const again=el('button','primary','Try again');again.style.width='100%';again.onclick=()=>{host.replaceChildren(left);approve(d)};
      host.replaceChildren(el('p','hint center',(linkNetErr(e)||'That didn\u2019t go through.')+' Nothing was shared yet.'),again);return}
    linkedDev(ref,d);close();toast('Approved. Your account is opening on '+(d.dev||'the new device')+', device code '+key+'.')};
  // Claimed, with the proof that the code was read: the person is asked once. The new device shows its key while it
  // waits; only "Let it in" approves. "Not mine", or closing the sheet, takes the offer down and nothing is shared.
  const ask=async d=>{const key=await devShort(d.devk),yes=el('button','primary','Let it in'),no=el('button','secondary','Not mine');
    yes.style.width=no.style.width='100%';no.style.marginTop='8px';
    host.replaceChildren(el('p',null,'Let '+(d.dev||'this device')+' in? Its screen shows device code '+key+'.'),yes,no,el('p','hint','Not a device you\u2019re holding, or a different code? Tap Not mine: nothing is shared.'));
    // The new device waits 5 minutes from its claim, so the question ends a little before it gives up.
    let done=false;const until=Date.now()+5*60e3-10e3,watch=setInterval(()=>{if(done||sh.isConnected&&Date.now()<until)return;done=true;clearInterval(watch);ref.delete().catch(()=>{});
      host.replaceChildren(el('p','hint center','No answer in time, so nothing was shared. Close this and tap Link a new device again.'))},400);
    yes.onclick=()=>{if(done)return;done=true;clearInterval(watch);host.replaceChildren(left);approve(d)};
    no.onclick=async()=>{if(done)return;done=true;clearInterval(watch);
      try{await ref.update({state:'no'});setTimeout(()=>ref.delete().catch(()=>{}),60e3)}catch{ref.delete().catch(()=>{})}
      host.replaceChildren(el('p','hint center','Not let in. Nothing was shared, and this code no longer works.'))}};
  const tick=async()=>{if(over)return;if(!sh.isConnected)return stop();
    if(Date.now()>end)return stop('This code has expired. Close this and tap Link a new device again for a new one.');
    left.textContent='Works once, for '+Math.ceil((end-Date.now())/60e3)+' more minute'+(end-Date.now()>60e3?'s':'')+'.';
    try{const s=await ref.get(),d=s.exists&&s.data();
      if(!d)return stop('This code was taken down. Close this and tap Link a new device again.');
      if(d.state==='wait'){over=true; // claimed: used either way, and let in only with the proof that the code was read
        if(!(d.cf&&d.cf===await linkConfirm(secret,tag,d.ts,await linkFp(d.pub,d.devk))))return stop('A device answered this code without proof that it read it, so nothing was shared.');
        return ask(d)}
    }catch{}
    setTimeout(tick,2000)};
  tick();
}
// Whether this device has a camera, without asking for it (no permission prompt; the list only says what kinds exist).
const hasCamera=async()=>{try{return !!(navigator.mediaDevices&&navigator.mediaDevices.enumerateDevices)&&(await navigator.mediaDevices.enumerateDevices()).some(d=>d.kind==='videoinput')}catch{return false}};
// Starts the camera (this is when the browser asks) and reads QR codes into onText until the returned stop() is called.
async function startQrCamera(vid,onText,onSlow){ // onSlow: nothing read for 8 seconds
  const decode=await qrDecoder(),stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1920},height:{ideal:1080}}}); // full HD where the camera has it: without asking, most phones send 640x480
  vid.srcObject=stream;await vid.play();let on=true,seen=false;
  const slow=setTimeout(()=>{if(on&&!seen&&onSlow)onSlow()},8000);
  const tick=async()=>{if(!on)return;if(vid.readyState>=2){try{const t=await decode(vid);if(t){seen=true;await onText(t)}}catch{}}setTimeout(tick,250)};tick();
  return ()=>{on=false;clearTimeout(slow);stream.getTracks().forEach(t=>t.stop())};
}
// The scan sheet: the camera, a photo of the code, and (unless opt.noType) the typed form. The new device uses it for the
// code a computer shows; a signed-in phone uses it, with its own title, hint, warning and "show a code instead" (opt.alt), for the code a new device shows.
function scanOtherCode(useText,onOk,opt={}){
  const {body,sh,close}=sheet(opt.title||'Scan your other device\u2019s code');sh.parentNode.style.zIndex='70'; // above the sign-in screen it opens from
  const status=el('p','hint center','Looking for a camera\u2026'),err=el('div','err'),cam=el('div','scan-box'),vid=document.createElement('video');vid.setAttribute('playsinline','');vid.muted=true;cam.append(vid);cam.hidden=true;
  const camBtn=el('button','secondary','Scan with this device\u2019s camera');camBtn.style.width='100%';camBtn.hidden=true;
  const tf=el('label','field'),ti=el('input','code-in');ti.autocapitalize='characters';ti.autocomplete='off';ti.spellcheck=false;ti.placeholder='XXXXXX-XXXXXX-\u2026';ti.style.letterSpacing='1px';ti.style.fontSize='15px';
  tf.append(el('span',null,'Code from your other device'),ti);const tgo=el('button','secondary','Use this code');tgo.style.width='100%';
  const pick=el('button','link','Can\u2019t use the camera? Pick a photo you took of the code');const file=document.createElement('input');file.type='file';file.accept='image/*';file.hidden=true;
  body.append(el('p','hint',opt.hint||'On your other device, open Settings \u2192 Login and devices \u2192 Link a new device \u2192 Show a code instead. Scan or type the code it shows here.'));
  if(opt.warn)body.append(el('p','warnbox',opt.warn));
  body.append(status,camBtn,cam,err);if(!opt.noType)body.append(tf,tgo);body.append(pick,file);
  if(opt.alt){const a=el('button','link',opt.alt[0]);a.onclick=()=>{finish();close();opt.alt[1]()};body.append(a)}
  let stopCam=null,busy=false;
  const finish=()=>{if(stopCam)stopCam();stopCam=null};
  const watch=setInterval(()=>{if(!sh.isConnected){finish();clearInterval(watch)}},400);
  const use=async(text,typed)=>{if(busy||!text)return;busy=true;err.textContent='';
    try{await useText(text);finish();close();onOk()}
    catch(e){err.textContent=typed&&e&&e.message==='notqr'?linkScanErr(new Error('badcode')):linkScanErr(e);
      setTimeout(()=>{busy=false},typed?300:1500)}};
  tgo.onclick=()=>{const v=ti.value.trim();if(!v){err.textContent='Type or paste the code first.';return}use(v,true)};
  ti.onkeydown=e=>{if(e.key==='Enter')tgo.click()};
  pick.onclick=()=>file.click();
  file.onchange=async()=>{const f=file.files[0];file.value='';if(!f)return;err.textContent='';
    try{const t=await (await qrDecoder())(await createImageBitmap(f));if(!t){err.textContent='No QR code found in that photo. Try a closer, sharper photo.';return}use(t)}catch{err.textContent='Couldn\u2019t read that photo.'}};
  camBtn.onclick=async()=>{status.textContent='Starting the camera\u2026';cam.hidden=false;
    try{stopCam=await startQrCamera(vid,t=>{if(t.startsWith('hush-link:'))return use(t)},
        ()=>{status.textContent=opt.noType?'Can\u2019t read it yet. Move closer so the code fills the square.':'Can\u2019t read it yet. Move closer so the code fills the square, or type the code below instead.';if(!opt.noType)tf.scrollIntoView({block:'center'})});
      camBtn.hidden=true;status.textContent='Move closer until the QR code on your other device fills the square.'}
    catch{cam.hidden=true;status.textContent=opt.noType?'The camera couldn\u2019t start. Pick a photo of the code, or show a code instead.':'The camera couldn\u2019t start. Type the code below, or pick a photo of it.'}};
  hasCamera().then(yes=>{if(!sh.isConnected)return;camBtn.hidden=!yes;
    status.textContent=yes?'Tap to scan the code with this device\u2019s camera. Your browser will ask first.':opt.noType?'No camera here. Pick a photo of the code, or show a code instead.':'No camera here. Type the code shown under the QR on your other device.'});
}
async function approveLink(tag,r,secret){
  if(!(secret instanceof Uint8Array)||secret.length!==16)throw new Error('notqr');
  const e=await ephemeral(),key=await linkKey(e.privateKey,r.pub,secret),iv=crypto.getRandomValues(new Uint8Array(12));
  let payload=bundleOf(S.me),ent=null;const dk=r.devk,okDev=dk&&/^[a-zA-Z0-9]{6,20}$/.test(dk.id||'')&&['x','y','sx','sy'].every(f=>typeof dk[f]==='string'&&dk[f].length>20);
  if(okDev&&S.me.dev&&S.me.dev.s){ // vouch for the new device with THIS device's key, and hand it every chat key this device holds
    const d={id:dk.id,ecdh:{x:dk.x,y:dk.y},sig:{x:dk.sx,y:dk.sy},by:S.me.dev.id};
    const sg=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},await devKey('s'),devMsg(S.me.handle,d)));
    payload={v:2,b:bundleOf(S.me),d:{by:S.me.dev.id,s:sg},ks:ksMap(),trust:[S.me.dev.id,...(S.me.trust||[])]};
    ent=devEntry(Object.assign({},d,{s:sg,ts:Date.now(),nm:await sealDevName(dk.id,r.dev)}));
  }
  const ct=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode('hush-link-v2')},key,enc.encode(JSON.stringify(payload))));
  await S.db.doc('linkreqs/'+tag).update({state:'ok',h:S.me.handle,epub:await pubJwk(e),iv:b64u(iv),ct:b64u(ct)}); // from this account's session, which names itself: its own offer, or an ask it scanned
  if(ent){ // trusted and listed only once the approval is in, so a refused one leaves no device behind
    S.me.trust=[...new Set([...(S.me.trust||[]),dk.id])];ls.set('hush:ids',S.ids);wrapSynced.clear();
    if(S.dir[S.me.handle])(S.dir[S.me.handle].devs=S.dir[S.me.handle].devs||{})[dk.id]=ent;
    S.db.doc('directory/'+S.me.handle).update({devs:{[dk.id]:ent}}).catch(()=>{});
  }
}
/* ---------- path one, the new device's side (SPEC.md 14.14) ----------
   Both ways end the same: this device waits on a row for the sealed handoff, opens it with its one-time key and the
   code's secret, and clears the row (awaitLink). Release 58, askLink: this device shows the code. It makes its keys and
   writes an ask with them at the address the code's secret names; the QR carries the secret and the fingerprint of the
   keys, so the device that scans it lets in these keys and no others, at once. Before that, claimLink: a signed-in device
   shows the code and this one claims the offer with its keys and its proof that it read the code (linkConfirm); still the
   way with a computer that has no camera. Each returns {done, cancel}: done resolves to the account once let in. */
function askLink(onShow,want){ // onShow(qrText, deviceKey) once the ask is on the server; want: see awaitLink
  let stop=false,w=null,ref=null;
  const done=(async()=>{
    const secret=crypto.getRandomValues(new Uint8Array(16)),n=await offerName(secret),tag=await offerTag(n);ref=S.db.doc('linkreqs/'+tag);
    const e=await ephemeral(),pub=await pubJwk(e),dv=await newDev(),devk={id:dv.id,x:dv.ecdh.x,y:dv.ecdh.y,sx:dv.sig.x,sy:dv.sig.y};
    await ref.set({state:'ask',ts:S.db.now(),n,pub,devk,dev:deviceName()});
    if(stop){ref.delete().catch(()=>{});return null}
    keepAwake(true);onShow(linkQr5(secret,await linkFp(pub,devk)),await devShort(devk));
    w=awaitLink(ref,e,secret,dv,want);let id=null;try{id=await w.done}finally{keepAwake(false);if(!id)ref.delete().catch(()=>{})} // not let in: the ask goes
    return id})();
  return {done,cancel:()=>{stop=true;if(w)w.cancel();keepAwake(false)}};
}
// The screen stays on while this device shows its code (best effort). iOS lets the lock go when the page is hidden, so it
// is asked for again on return.
let awake=null,awakeWant=false;
function keepAwake(on){awakeWant=on;if(!on){if(awake)awake.release().catch(()=>{});awake=null;return}
  if(awake||document.hidden||!navigator.wakeLock)return;
  navigator.wakeLock.request('screen').then(l=>{if(!awakeWant){l.release().catch(()=>{});return}awake=l;l.onrelease=()=>{if(awake===l)awake=null}}).catch(()=>{})}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&awakeWant)keepAwake(true)});
async function claimLink(text){
  const {secret}=linkProof(text),tag=await offerTag(await offerName(secret)),ref=S.db.doc('linkreqs/'+tag);
  const s=await ref.get(),o=s.exists&&s.data();if(!o||o.state!=='offer')throw new Error('expired');
  const e=await ephemeral(),pub=await pubJwk(e),dv=await newDev(),devk={id:dv.id,x:dv.ecdh.x,y:dv.ecdh.y,sx:dv.sig.x,sy:dv.sig.y},ts=Date.now();
  await ref.update({state:'wait',pub,ts,dev:deviceName(),devk,cf:await linkConfirm(secret,tag,ts,await linkFp(pub,devk))});
  return Object.assign(awaitLink(ref,e,secret,dv),{key:await devShort(devk)});
}
function awaitLink(ref,e,secret,dv,want){ // polls the row for up to 5 minutes; dv becomes the account's device here once vouched for; want(id): whether to take the account that answered, asked before anything of it is kept
  let stop=false;
  const done=(async()=>{for(const until=Date.now()+5*60e3;Date.now()<until;){await new Promise(r=>setTimeout(r,2000));if(stop)return null;
      let r;try{const s=await ref.get();if(!s.exists)throw new Error('ended');r=s.data()}catch(err){if(err.message==='ended')throw err;continue}
      if(r.state==='no'){ref.delete().catch(()=>{});throw new Error('denied')}
      if(r.state!=='ok')continue;
      let pt;try{pt=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64u(r.iv),additionalData:enc.encode('hush-link-v2')},await linkKey(e.privateKey,r.epub,secret),unb64u(r.ct))}catch{throw new Error('format')}
      ref.delete().catch(()=>{});const p=JSON.parse(dec.decode(pt)),id=idFromBundle(p.v===2?p.b:p);
      if(want&&!await want(id))throw Object.assign(new Error('other'),{handle:id.handle}); // another account answered the code: nothing of it is kept
      if(p.v!==2)return id;
      if(p.d&&typeof p.d.s==='string'&&typeof p.d.by==='string'){id.dev=Object.assign(dv,{by:p.d.by,s:p.d.s,ts:Date.now()});id.trust=Array.isArray(p.trust)?p.trust.filter(x=>typeof x==='string'):[]}
      if(p.ks&&typeof p.ks==='object'){const cur=ls.get('hush:ks:'+id.handle,{});for(const [cid,m] of Object.entries(p.ks))if(m&&typeof m==='object')cur[cid]=Object.assign({},cur[cid]||{},m);ls.set('hush:ks:'+id.handle,cur);S.ksFor=null;if(S.me&&S.me.handle===id.handle)scheduleBackup()}
      return id}
    throw new Error('timeout')})();
  return {done,cancel:()=>{stop=true}};
}
/* ---------- device removal (SPEC.md 14.15, release 21) ----------
   Every device holds the account's private keys, so a lost one is locked out by giving the account new keys: this
   device publishes them (kv+1) with itself as the only device left, the server closes the account's other connections
   and refuses the old keys, and this device then moves what the old keys guarded (vault, chat-list notes, message
   backup, password boxes), changes the chat keys it can and re-bases its one-on-one chats so the old shared secrets no
   longer open them. The old keys stay here as S.me.prev (the private parts for 30 days) so old notes and messages still
   open and verify. The run is a stage machine kept in the sealed store from the first server write on, so a reload or a
   dropped connection mid-way picks it up where it stopped (finishRekey, at start). */
const REKEY_BACKOFF=[2000,5000,15000,30000],REKEY_NET='Couldn’t reach Hush. Check your connection.';
const withLock=(name,opts,fn)=>typeof navigator!=='undefined'&&navigator.locks?navigator.locks.request(name,opts,fn):fn(true); // one tab at a time runs a removal; a lock dies with its tab
const signWith=async(jwk,msg)=>b64u(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},await crypto.subtle.importKey('jwk',jwk,DS,false,['sign']),enc.encode(msg)))); // a sign-in signature by any account key, the old one included
function rekeyCaches(h){ // everything derived from the account keys, or from which keys this device believes it has
  S.keys.clear();S.chanKeys.clear();S.cache.clear();S._vp=null;delete backupPaths[h];dmIds.clear();S.dmPeers={};devCache.clear();wrapSynced.clear();tagCache.clear();unsealCache.clear();metaCache.clear();healed.clear();loginHealed.delete(h);baseDone.clear()}
function rekeySheet(title){ // the locked progress sheet of a removal: one status line, and a button when a tap is needed
  const {body,close}=sheet(title,{locked:true}),line=el('div','link-wait'),spin=el('span','spin'),txt=el('span'),box=el('div');line.append(spin,txt);body.append(line,box);
  const ask=(text,label,then)=>new Promise(res=>{txt.textContent=text;spin.hidden=true;box.replaceChildren();const b=el('button','primary',label);b.style.width='100%';b.onclick=()=>{box.replaceChildren();spin.hidden=false;if(then)then();res()};box.append(b)});
  return {step:t=>{txt.textContent=t;spin.hidden=false;box.replaceChildren()},retry:t=>ask(t,'Try again'),fail:t=>ask(t,'Close',close),close, // close: the sheet goes without a tap (rekeyRun's `lost` branches, when the account signed out is the only one on the device)
    done:node=>{close();const s=sheet('Device removed',{locked:true}),row=el('div','row2'),w=el('button','secondary','Make new recovery words'),ok=el('button','primary','Done');
      const end=()=>{s.close();if(S.tab==='profile')setTab('profile')};w.onclick=()=>{end();openBackup()};ok.onclick=end;row.append(w,ok);s.body.append(node,row)}};
}
function rekeyPassword(h,li){ // the new password a removal asks for when the account has one: the lost device may know the old one
  return new Promise(res=>{const {body,close}=sheet('Choose a new password',{locked:true}),login=li.login||h,strong=isSecure(h);
    body.append(el('p',null,'The removed device may know your current password, so choose a new one. It replaces the old one for every device.'));
    const {f:f1,i:p1}=pwField(strong?'New password (at least 12 characters)':'New password','new-password'),{f:f2,i:p2}=pwField('Type it again','new-password');
    const go=el('button','primary','Continue'),no=el('button','link','Cancel'),err=el('div','err');go.style.width='100%';
    const form=pwForm(login);form.append(f1,pwMeter(p1,()=>({login:isHandleLogin(login)?null:login,handle:h})),f2,go);go.type='submit';body.append(form,err,no);setTimeout(()=>p1.focus(),50);
    no.onclick=()=>{close();res(null)};
    go.onclick=async()=>{const pw=p1.value;err.textContent='';
      const bad=loginsOf(h).map(l=>pwProblem(pw,isHandleLogin(l)?null:l,h)).find(Boolean)||(strong&&pw.length<12?'Use at least 12 characters: this password guards your groups and channels.':null);
      if(bad){err.textContent=bad;return}if(pw!==p2.value){err.textContent='The passwords don’t match.';return}
      go.disabled=true;go.textContent='Checking…';const same=(await loginSecrets(login,pw)).loc===((li.all&&li.all[login])||li.loc);go.disabled=false;go.textContent='Continue';
      if(same){err.textContent='That’s your current password. The lost device may know it: choose a new one.';p1.focus();return}
      close();res(pw)}})}
async function removeDevice(devId,name,key){ // Settings → Login and devices → Your devices → Remove
  if(!S.db||!S.db.online){toastErr('You need to be online for this.');return}
  if(!S.me||!S.me.dev||devId===S.me.dev.id||S.rekeying)return;const h=S.me.handle;
  if(!S.contactsReady||S.vaultOk===false){toastErr('Your settings haven’t loaded yet. Try again in a moment.');return}
  if(!(await confirmSheet('Remove this device?',`${name} (device code ${key}) will be locked out of your account at once.`,{danger:true,yes:'Remove device',no:'Keep it',
    note:'Your other devices are logged out too. You link them again from this one. If you use a password, you’ll choose a new one. Your recovery words stop working, so you’ll make new ones. People you chat with will see that your security code changed.'})))return;
  let pw=null;const li=loginInfo(h);if(li&&li.loc){pw=await rekeyPassword(h,li);if(!pw)return}
  if(!S.me||S.me.handle!==h||S.rekeying)return;
  await withLock('hush:rekey:'+h,{ifAvailable:true},lock=>lock?rekeyRun({stage:'read',devId,name,key,pw},rekeySheet('Removing device')):toastErr('A device removal is already running in another tab.'));
}
/* ===== HUSH DEVICE REMOVAL BEGIN ===== */
async function rekeyChat(x,h,needDir,c){ // one chat's key change in a removal (rekeyRun's rotate stage): what happened, for rekeySummary; throws for rekeyRun to retry or skip
  if(x.type==='dm'){if(x.peer&&x.peer!==h&&keyChanged(x.peer))return {cid:x.cid,skip:'keychanged'}; // their new code isn't accepted here yet: a base key from their old one would lock them out; re-keyed on accepting (rewrapFor)
    await needDir([x.peer]);await rotateTo(c,{members:[...new Set([h,x.peer].filter(Boolean))]},undefined,{noLoad:true});await pause(250);await S.db.rebaseChat(x.cid,await memberCap(c,0));return {cid:x.cid,ok:true}} // the new shared secret becomes the base key
  if(!x.unlocked)return {cid:x.cid,skip:'locked'};
  const pc=x.type==='channel'&&x.vis!=='public';
  if(x.owner||x.admin){const shown=await showMeta(c),v=metaOf(shown);
    if(x.vis!=='public'&&!shown._unlocked)return {cid:x.cid,skip:'locked'}; // the description did not open: a rotation would re-seal an empty member list
    v.members=[...new Set([...(v.members.length?v.members:x.members),h])];
    if(x.vis!=='public'){await needDir(v.members);await rotateTo(c,v,undefined,{noLoad:true})} // no joins folded, no link carried (SPEC.md 5.6)
    return {cid:x.cid,ok:true}}
  if(pc){S.chatDocs.delete(x.cid);const f=await freshChan(x.cid);S.chatDocs.set(x.cid,f);const v=await readMeta(f),o=ls.get(cardsKey(),{})[x.cid]||{}; // from a fresh record, as a key change since the read stage leaves the kept one's member key refused
    if(o.k==='leave'){await writeCard(f,'leave');return {cid:x.cid,skip:'left',card:'leave'}} // a leave card still pending (leaveChat; the channel stays in the read stage's list): the leave again, signed by the new account key (one signed by the old one no longer checks), never a dev or join card over it, which would keep them listed, or waiting, at the next key change
    if(v&&!v.members.includes(h)){const j=o.k==='join'?o:{};await writeCard(f,'join',j.i,j.m);return {cid:x.cid,skip:'unlisted',card:'join'}} // waiting to join (SPEC.md 5.6): no admin's page acts on a dev card from an unlisted author, and it would replace the join card, which counts only signed by the account key of now (cardSigOk): the join card again, with the link and `m` noted at the join (as healCard), so they keep waiting; the lost device reads on until the key next changes (rekeySummary)
    await writeCard(f,'dev');return {cid:x.cid,card:'dev'}} // a subscriber can't change the key: the card asks the next admin's page to (rollRun); so too with no list to read (v null, as on every subscriber's page once the server hands the list to admins alone), the safe choice: a listed subscriber's card gets the key changed, an unlisted joiner's acts on nothing and they wait for an Add
  return {cid:x.cid,skip:'member'}}
async function rekeyRun(rec,ui){ // the stages in order; the record is kept from 'write' on, and a resumed run starts at its stage
  const h=S.me.handle,key='hush:rekey:'+h,save=()=>{rec.at=Date.now();ls.set(key,rec)}; // the whole record, the new password included, in the sealed store (as safe there as the keys): a reload goes on from it
  const needDir=async hs=>{const miss=hs.filter(m=>m&&m!==h&&!S.dir[m]);if(miss.length)try{await loadDir(miss,true)}catch{}if(hs.some(m=>m&&m!==h&&!S.dir[m]))throw Object.assign(new Error(S.db.online?'a member’s profile could not be fetched':'offline'),{code:S.db.online?'nodir':'offline'})}; // never re-key a chat without a member it would wrap for
  const resumed=rec.stage!=='read',acct=id=>proofFor(id).then(p=>Object.assign(p,{dev:'',signDev:null})); // an account-key proof: only it may change the keys
  const timed=p=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(Object.assign(new Error('timeout'),{code:'timeout'})),30000))]);
  const prove=idn=>timed(S.db.prove(null).then(()=>S.db.prove(idn))); // a fresh sign-in: the adapter keeps a proven connection otherwise
  const chatFor=async cid=>{let c=S.chatDocs.get(cid);if(c&&(c.meta||typeOf(c)==='dm'||c.visibility==='public'))return c; // the whole record, sealed description included: a read without a level gives only a preview (after a reload, before the chat list is up)
    await S.db.refreshChat(cid).catch(()=>{});c=await freshChan(cid);S.chatDocs.set(cid,c);await S.db.refreshChat(cid).catch(()=>{});return c}; // opened once to read it whole, then again at the level the whole record shows this account holds
  S.rekeying=true;
  try{
    if(resumed&&(!S.contactsReady||S.vaultOk===false)){const old=['write','mirror','rotate','vault'].includes(rec.stage); // the settings the stages read: from the old vault with the old keys until the vault stage has moved it, then from the new one
      for(;;){try{const o=await readVaultWith(old?{handle:h,ecdhPriv:S.me.prev.ecdhPriv,ecdh:S.me.prev.ecdh}:S.me);if(o)applyVault(o);S.contactsReady=true;S.vaultOk=true;break}catch{await ui.retry('Couldn’t read your settings. Check your connection.')}}}
    if(rec.stage==='read'){ui.step('Reading your chats');
      clearTimeout(backupT);if(S.unsubConvs){S.unsubConvs();S.unsubConvs=null}S.recheckChats=null;S.forgetPointers=null; // nothing else writes while this runs
      if(backupOn()){S.rekeying=false;try{await syncBackup()}catch{}S.rekeying=true} // the keys my other devices backed up, while the old keys still open the backup
      rec.notes=[];rec.chats=[];
      const q=await S.db.collection('inbox/'+h+'/c').limit(500).get();
      for(const d of q.docs){try{const p=await openPointer(d.data());rec.notes.push({id:d.id,p:{t:p.t,cid:p.cid,type:p.type,peer:p.peer}})}catch{}} // a note this device can't open is left as it is
      rec.oldBackupPath=await backupPath(S.me);
      rec.oldRecs=[...new Set([...[].concat((recLocal(h)||{}).old||[]),recLocal(h)&&recLocal(h).loc,S.prefs&&S.prefs.rec&&S.prefs.rec.loc].filter(l=>typeof l==='string'))]; // old: boxes new, unchecked words haven't replaced yet
      rec.myName=(await openDevName(S.me.dev.id,S.me.dev.nm))||deviceName();
      for(const [cid,i] of Object.entries(P().dms||{}))if(i&&i.peer&&!S.dmPeers[cid])S.dmPeers[cid]=i.peer;
      for(const n of rec.notes)if(n.p.peer&&!S.dmPeers[n.p.cid])S.dmPeers[n.p.cid]=n.p.peer;
      for(const n of rec.notes)if(n.p.peer&&/^d/.test(n.p.cid)&&!dmInfo(n.p.cid))setDmInfo(n.p.cid,{peer:n.p.peer}); // every one-on-one chat filed under its person before the ids it derives change
      const cids=[...new Set([...S.convs.map(c=>c.id),...S.chatDocs.keys(),...Object.keys(P().dms||{}),...rec.notes.map(n=>n.p.cid)])];
      for(const cid of cids){let c=S.chatDocs.get(cid)||convById(cid);if(!c){await pause(250);try{c=await freshChan(cid)}catch{continue}} // at most four reads a second
        else if(typeOf(c)!=='dm'&&c.visibility!=='public'&&!S.db.chatLevel(cid)){const k=S.chatDocs.get(cid);await pause(750);S.chatDocs.delete(cid);let f=null;try{f=await freshChan(cid)}catch{}if(f&&f.meta){c=f;S.chatDocs.set(cid,f)}else if(k)S.chatDocs.set(cid,k)} // a private chat this connection holds no level for (an eviction whose re-open waits, a refused re-open, a list still loading): no watch brings its record, so the kept copy may be the one of before a key change, and a key this stage does not store now cannot be unwrapped once the account's key has changed (the rotate stage would file the chat "locked"). Read once, without the kept copy (capsFor then works from a fresh preview, not from an old member key); a read that fails or brings only the trimmed copy leaves the kept one
        try{const dm=typeOf(c)==='dm',shown=await showMeta(c),owner=shown.owner===h,admin=(shown.admins||[]).includes(h);
          if(!dm&&c.visibility!=='public')await allRaws(c); // every key this device can unwrap goes into the key store: the new key could not open an account-key wrap
          if(owner||admin)await adminSecret(c);
          if(dm)await dmBaseBits(c); // the shared secret the chat began with, kept: its history stays readable after the change
          rec.chats.push({cid,type:typeOf(c),vis:c.visibility,owner,admin,admins:shown.admins||[],members:knownIn(shown),peer:dm?dmPeer(c):undefined,name:dm?displayName(dmPeer(c)):shown.name||'',
            unlocked:dm||c.visibility==='public'||!!(await convKey(c,epochOf(c)))})}catch{}}
      ui.step('Checking your account');
      for(;;){try{await prove(await acct(S.me));break}
        catch(e){if(e&&e.code==='denied'){S.rekeying=false;start(S.me);ui.fail('Your account was secured again from another device, so this device can’t make changes any more. If that wasn’t you, whoever holds that device has the account: your old recovery words no longer open it.');return}
          await ui.retry(REKEY_NET)}}
      rec.stage='keys'}
    if(rec.stage==='keys'){ui.step('Securing your account');
      rec.trust=S.me.trust||[];rec.dev={by:S.me.dev.by,s:S.me.dev.s,forSig:S.me.dev.forSig,nm:S.me.dev.nm,ts:S.me.dev.ts}; // what a roll-back puts back
      await rekeyIdentity(S.me);S.me.trust=[];
      rec.stage='write';save();ls.set('hush:ids',S.ids);await saveSecrets(); // on disk before the server hears of them: a tab closed in between must not lose the account
      let onDisk=false;for(let i=0;i<2&&!onDisk;i++){if(i){ls.set('hush:ids',S.ids);await saveSecrets()}onDisk=((await peekSealed('hush:ids'))||[]).some(x=>x&&x.handle===h&&(x.kv||1)===S.me.kv)} // and checked there: a full store would otherwise lose them
      if(!onDisk){unrekeyIdentity(S.me);Object.assign(S.me.dev,rec.dev);S.me.trust=rec.trust||[];ls.set('hush:ids',S.ids);ls.set(key,{done:Date.now()});rekeyCaches(h);S.rekeying=false;start(S.me);ui.fail('Couldn’t finish on this device. Nothing was changed.');return}
      rekeyCaches(h)}
    if(rec.stage==='write'){ui.step('Updating your profile');
      if(!(S.dir[h]&&S.dir[h].devs))try{await loadDir([h],true)}catch{} // the device list as the server has it: every other entry is dropped by the write
      // Which keys the server has: ours already (the write landed), still the old ones (it never did), or someone else's.
      const probe=async()=>{for(;;){while(!S.db.online)await pause(1000);
        try{await prove(await acct(S.me));return 'new'}catch(e){if(!(e&&e.code==='denied')){await ui.retry(REKEY_NET);continue}}
        try{await prove({h,pub:{x:S.me.prev.sig.x,y:S.me.prev.sig.y},dev:'',signDev:null,signAcct:m=>signWith(S.me.prev.sigPriv,m)});return 'old'}
        catch(e){if(e&&e.code==='denied')return 'lost';await ui.retry(REKEY_NET)}}};
      const write=async()=>{const d=S.me.dev;d.by='';d.forSig='';await ensureDev(S.me); // this device's entry, signed by the new account key
        d.nm=await sealDevName(d.id,rec.myName);d.ts=Date.now();ls.set('hush:ids',S.ids);
        const devs={[d.id]:devEntry(d)};for(const i of Object.keys((S.dir[h]&&S.dir[h].devs)||{}))if(i!==d.id)devs[i]=null; // every other device entry goes: they link again by code
        await S.db.doc('directory/'+h).update({ecdh:S.me.ecdh,sig:S.me.sig,kv:S.me.kv,ts:Date.now(),devs})}; // one write: the server closes the account's other connections
      let state=resumed?await probe():'old';
      while(state!=='new'){
        if(state==='lost'){unrekeyIdentity(S.me);Object.assign(S.me.dev,rec.dev);S.me.trust=rec.trust||[];ls.set('hush:ids',S.ids);ls.set(key,{done:Date.now()});await saveSecrets();rekeyCaches(h);S.rekeying=false; // back to the keys this device really had, on disk, so the sign-out below sees them as outdated
          try{await loadDir([h],true)}catch{}if(S.ids.some(x=>x.handle!==h))ui.fail('Another device secured your account while this was running. This device can’t make changes any more.');else ui.close();signedOutHere(h);return} // the only account on this device: the sheet is closed, since the sign-up screen that follows says why and would only cover it; left in the page, it showed again over an account made there afterwards
        try{await write()}
        catch(e){if(e&&['denied','invalid','toolarge','notfound','conflict'].includes(e.code)){ // refused for good: back to the old keys, nothing changed
            unrekeyIdentity(S.me);Object.assign(S.me.dev,rec.dev);S.me.trust=rec.trust||[];ls.set('hush:ids',S.ids);ls.set(key,{done:Date.now()});rekeyCaches(h);S.rekeying=false;await S.db.prove(null);start(S.me);
            ui.fail('Couldn’t update your account ('+(e.message||e.code)+'). Nothing was changed.');return}}
        state=await probe()} // whether or not the write landed, the new keys prove this connection from here on
      rec.stage='mirror';save()}
    if(rec.stage==='mirror'){try{await loadDir([h],true)}catch{} // the server's copy, with the key history it keeps (prev)
      Object.assign(S.dir[h]=S.dir[h]||{handle:h},{ecdh:S.me.ecdh,sig:S.me.sig,kv:S.me.kv,devs:{[S.me.dev.id]:devEntry(S.me.dev)}});
      devCache.clear();for(const k of [...rolesLater.keys()])if(k.startsWith(h+':'))rolesLater.delete(k);ls.set('hush:ids',S.ids);rec.stage='rotate';save()} // and this account's copies of her lists waiting past the date limit (rolesLater): checked under the key just replaced, they hold her owner changes no more (their timers find them failing under the new key); not in rekeyCaches, which the roll-backs call while the old key still stands
    if(rec.stage==='rotate'){rec.rotated=rec.rotated||[];const n=rec.chats.length; // the chats first: every second until their keys are replaced is one in which the lost device's holder could replace them himself
      for(const x of rec.chats)if(x.type==='dm'&&x.peer)S.dmPeers[x.cid]=x.peer; // a one-on-one record names nobody: the page knows its person from the read
      const hs=[...new Set(rec.chats.flatMap(x=>[...(x.members||[]),...(x.peer?[x.peer]:[])]))];
      for(let i=0;i<hs.length;i+=20){try{await loadDir(hs.slice(i,i+20),true)}catch{}if(i+20<hs.length)await pause(300)} // fresh profiles before wrapping for everyone
      for(const x of rec.chats){if(rec.rotated.some(d=>d.cid===x.cid))continue;ui.step(`Securing your chats (${rec.rotated.length+1} of ${n})`);
        let res=null,again=0,rl=0;
        while(!res){await pause(250);
          try{res=await rekeyChat(x,h,needDir,await chatFor(x.cid))}
          catch(e){if(S.db.error)throw new Error(S.db.error);const code=e&&e.code; // the "out of date" error: the run stops here and a reload goes on (nothing is filed for this chat)
            if(code==='unauth')await prove(await acct(S.me)).catch(e2=>{if(e2&&e2.code==='denied')throw Object.assign(e2,{lost:1})}); // "sign in first" here too: sign in again, then wait and go round, as the owner step below does; a sign-in refused for good ends the run the same way (marked `lost`)
            if(code==='ratelimit'||code==='offline'||code==='unauth'){await pause(REKEY_BACKOFF[Math.min(rl++,REKEY_BACKOFF.length-1)]);continue} // never skipped for a busy server, a dropped connection or a connection that is not signed in
            if(code==='denied'&&/could not be opened/.test((e&&e.message)||'')){if(!S.db.online){await pause(REKEY_BACKOFF[Math.min(rl++,REKEY_BACKOFF.length-1)]);continue}res={cid:x.cid,skip:'taken'};continue} // no key this account derives opens it any more: someone replaced it first
            if((code==='conflict'||code==='nodir')&&again<1){again++;if(code==='conflict')try{const c=await freshChan(x.cid);S.chatDocs.set(x.cid,c);if(epochOf(c)>=31&&typeOf(c)!=='channel')res={cid:x.cid,skip:'epochcap'}}catch{}continue} // a channel has no epoch cap (release 91)
            res={cid:x.cid,skip:'error',msg:String((e&&e.message)||code||e)}}}
        const pc=x.type==='channel'&&x.vis!=='public';
        if(res.skip&&(x.owner||x.admin)&&pc)await S.db.doc('channels/'+x.cid).update({invites:null}).catch(()=>{}); // no new key, so no link wiped: the lost device may hold the link secrets (an admin's opens every `as`), so every open link stops
        if(pc&&x.admin&&!x.owner&&(res.ok||res.skip==='error'))try{const c=await chatFor(x.cid),k=(ls.get(cardsKey(),{})[x.cid]||{}).k==='leave'?'leave':'adm';res.card=k;await writeCard(c,k)}catch{} // the lost device keeps the admin secret, whatever the key change did: the card asks the owner's page to replace it (noted first, so a failed write goes out at the next start); a leave card still pending (leaveChat) goes again instead, signed by the new account key, since an adm card over it would lose the leave: the owner's page drops them and replaces the secret on it (rollRun)
        // the owner key from the new secret, then an admin secret the old key never wrapped, whatever the key change did; every
        // open link stops (wipe, waited for: one left would be sealed again under the new secret and outlive the next leaves)
        if(x.owner&&x.type!=='dm'){const p0=(rolesOf(x.cid)||{}).p;let set=false,fresh=0,look=null,uns=false;
          for(rl=0;;){await pause(250);
          try{if(look){await verifiedAdmin(await freshChan(x.cid),true,(rolesOf(x.cid)||{}).p);throw look} // the one read: the record as the server holds it now. This device's own copy in it is kept only if its fingerprint is the one this step noted before its write (verifiedAdmin); then the first failure is taken up again, below
            await S.db.setOwner(x.cid,await ownerCap(x.cid));set=true;await pause(250);const a=(await showMeta(await chatFor(x.cid))).admins||[];
            if(pc&&!(rolesOf(x.cid)||{}).s){uns=true;const sec=crypto.getRandomValues(new Uint8Array(32));noteOwnAh(x.cid,await adminId(x.cid,sec));await S.db.setAdmins(x.cid,await wrapKey(sec,h,x.cid+'#a'),await adminCapFrom(x.cid,sec));ksPut(x.cid,'a',b64(sec));res.own='unsigned';break} // no list this device could verify (a channel from before release 92 she hasn't signed yet): a fresh admin secret wrapped to her own devices alone (not rotateAdmins, which would hand it to the list and seal the list again), so the lost device's old one no longer opens the channel at admin level; the unsigned list gets no secret (its admins are at member level until she signs it and her page next opens the channel: signAdminId then replaces this one, noted here as her page's own) and no copy of it is sealed (owner decisions D1 and D3); the summary says what to do
            await rotateAdmins(x.cid,a.length?a:x.admins,{wipe:true,keep:true});break}
          catch(e){const code=e&&e.code;if(code==='unauth')await prove(await acct(S.me)).catch(e2=>{if(e2&&e2.code==='denied')throw Object.assign(e2,{lost:1})}); // "sign in first": the connection came back with its sign-in refused, so sign in again (as the removal's first stage does), then wait and go round; only a sign-in refused for good ends the run: marked `lost`, it signs this device out (the catch at the end)
            if(code==='ratelimit'||code==='offline'||code==='unauth'){await pause(REKEY_BACKOFF[Math.min(rl++,REKEY_BACKOFF.length-1)]);continue}
            if(code==='denied'&&!/could not be opened/.test((e&&e.message)||'')&&fresh<3){const up=await S.db.refreshChat(x.cid).catch(()=>false); // refused while the chat is open: opened afresh with every key the page holds (the first open of a group with no readable signed list is at admin level, capsFor). No answer: waited out like any dropped call. Owner level: the step runs again, three times at most. An open that ANSWERED below owner level is the refusal
              if(!up){await pause(REKEY_BACKOFF[Math.min(rl++,REKEY_BACKOFF.length-1)]);continue}if(S.db.chatLevel(x.cid)==='owner'){fresh++;continue}}
            const st=ksGet(x.cid,'a'),r=rolesOf(x.cid)||{},p=r.p;if(set&&pc&&!uns&&code==='timeout'&&!look&&p&&p!==p0){look=e;continue} // a call that got no answer may have landed: one read of the record says (the server writes the admin key and the wraps in one step); a failed read is waited out or ends the step like any other call. Never after the never-signed branch (uns, set where that branch is entered): the roles record's own word could change meanwhile, once a signed copy is noted
            if(set&&pc&&st&&p&&p!==p0&&await adminId(x.cid,unb64(st))===p&&await S.db.doc('channels/'+x.cid).update({invites:null}).then(()=>true,()=>false))break; // the owner key landed, the stored admin secret is the one THIS step made (its fingerprint is the one rotateAdmins noted before the write; the secret is stored only once the server took it, or once the read found it there) and the link stop went through now: what the removed device held opens nothing, so the step counts as done; only the signed list is left, and the owner's next open signs it (signAdminId)
            if(S.db.error)throw new Error(S.db.error);if(code!=='notfound'&&(e&&e.message)!=='gone')res.own='error';break}} // the "out of date" error (the adapter is closed for good; every way to the mark passes here): the run stops as a closed tab would leave it, this chat not in the record and not marked, and a reload goes on. A chat that no longer exists is not marked either
          {const m=ls.get('hush:noUse:'+h,{}),f=res.own==='error';if(f!==!!m[x.cid]){if(f)m[x.cid]=1;else delete m[x.cid];ls.set('hush:noUse:'+h,m)}} // the mark "don't use", on this device, per account: set where the step failed, taken off only where a later removal's step went through; the store is written only when the mark changes
        }
        rec.rotated.push(res);save()}
      rec.stage='vault';save()}
    if(rec.stage==='vault'){ui.step('Moving your settings');
      for(;;){await saveContacts(true);let ok=false;try{ok=(await S.db.doc(await vaultPath(h)).get()).exists}catch{}if(ok)break;await ui.retry('Couldn’t save your settings. Check your connection.')}
      rec.stage='backup';save()} // the old vault stays where it is (vaults are never deleted): it holds only what the lost device had already
    if(rec.stage==='backup'){ui.step('Moving your Message backup');
      if(backupOn()){S.rekeying=false;try{await syncBackup()}catch{}S.rekeying=true} // refused while rekeying; it writes at the new address, under the new key
      if(rec.oldBackupPath)await S.db.doc(rec.oldBackupPath).delete().catch(()=>{});
      rec.stage='notes';save()}
    if(rec.stage==='notes'){rec.noted=rec.noted||[];const n=rec.notes.length;
      for(const x of rec.notes){if(rec.noted.includes(x.id))continue;ui.step(`Rewriting your chat list (${rec.noted.length+1} of ${n})`);const p=x.p;
        for(let rl=0;;){await pause(250);
          try{await dropPointer(h,Object.assign({t:p.t,cid:p.cid,from:h},p.type?{type:p.type}:{},p.peer?{peer:p.peer}:{}));break} // sealed to the new key, as my own note
          catch(e){if(e&&e.code==='ratelimit'){await pause(REKEY_BACKOFF[Math.min(rl++,REKEY_BACKOFF.length-1)]);continue}await ui.retry(REKEY_NET)}}
        await S.db.doc('inbox/'+h+'/c/'+x.id).delete().catch(()=>{});rec.noted.push(x.id);save()}
      rec.stage='boxes';save()}
    if(rec.stage==='boxes'){const li=loginInfo(h);
      if(rec.pw&&li){ui.step('Updating your password');const login=li.login||h,old=Object.assign({},li.all||{},li.loc?{[login]:li.loc}:{}); // as openSetupLogin does after a password change
        for(;;){try{const all=await saveLoginBoxes(S.me,loginsOf(h),rec.pw);rememberPw(login,rec.pw).catch(()=>{});
            for(const [l,x] of Object.entries(old))if(all[l]!==x)await dropLoginBox(l,x).catch(()=>{});
            rememberLogin(h,{login,loc:all[login],all},true);ls.set('hush:backedUp:'+h,Date.now());ls.set('hush:recovered:'+h,null);
            if(pwStrongEnough(rec.pw))await markSecure().catch(()=>{});S.prefs.login=loginInfo(h);await saveContacts(true);break}
          catch{await ui.retry('Couldn’t save your new password. Check your connection.')}}}
      else if(li&&li.loc)rec.pwSkipped=true; // resumed after a reload: the new password was only in memory
      delete rec.pw;rec.stage='recovery';save()}
    if(rec.stage==='recovery'){for(const l of rec.oldRecs||[])S.db.doc('accounts/'+l).delete().catch(()=>{}); // the old words opened a box holding the old keys
      ls.set('hush:recovery:'+h,null);ls.set('hush:recovered:'+h,null);if(S.prefs)delete S.prefs.rec;await saveContacts(true);rec.stage='reconnect';save()}
    if(rec.stage==='reconnect'){ui.step('Reconnecting');rec.rotated=rec.rotated||[];ls.set(key,{done:Date.now()});S.rekeying=false;await S.db.prove(null);start(S.me); // a 'done' mark rather than nothing: a stale copy of the record in another tab can't bring it back
      for(let i=0;i<150&&!S.contactsReady;i++)await pause(100);renderBanner();ui.done(rekeySummary(rec))}
  }catch(e){ // not foreseen: with a record kept a reload picks the run up; before one, nothing has changed
    if(e&&e.lost){try{await loadDir([h],true)}catch{}const d=S.dir[h]; // the chats stage's own account-key sign-in was refused for good (marked where it is asked, nowhere else). The profile is read first, while the record still stands: the removal ends only if the profile carries a key version above this device's AND a signing key that is not this device's (what keysMovedOn and signedOutHere look at), which says another holder of the new keys replaced them meanwhile
      if(S.me&&S.me.handle===h&&d&&(d.kv||1)>(S.me.kv||1)&&!(d.sig&&S.me.sig&&d.sig.x===S.me.sig.x&&d.sig.y===S.me.sig.y)){ls.set(key,{done:Date.now()});S.rekeying=false;if(S.ids.some(x=>x.handle!==h))ui.fail('Another device secured your account while this was running. This device can’t make changes any more.');else ui.close();signedOutHere(h);return}} // then as the write stage's `lost` (the sheet closed when this is the only account on the device), but the new keys are published and are this device's real ones, so nothing is put back: the record ends and this device is signed out. The chat in hand and those after it are not secured, and this device can do no more for them. In every other case (the profile could not be read, has no entry, names this device's own key or carries no higher version, or the account is no longer the current one) the refusal is no key change this device can see: the record is kept and the run stops below like any other, to go on at the next start
    if((ls.get(key,null)||{}).stage)ui.fail('Removing the device stopped ('+(S.db.error&&/out of date/.test(S.db.error)?'this copy of Hush is out of date':(e&&e.message)||e)+'). Close Hush and open it again to finish it.'); // while the adapter's out-of-date error stands (renderConv's test for its chip) the reason is these fixed words: the adapter's own sentence would put a second instruction into the same sheet. Every other stop keeps its own reason
    else{S.rekeying=false;start(S.me);ui.fail('Couldn’t remove the device ('+((e&&e.message)||e)+'). Nothing was changed.')}}
}
/* ===== HUSH DEVICE REMOVAL END ===== */
function rekeySummary(rec){ // what changed, and what the removed device still holds, in plain words
  const nameOf=cid=>(rec.chats.find(x=>x.cid===cid)||{}).name||'a chat',mk=d=>d.own==='error'&&d.skip!=='taken',names=k=>rec.rotated.filter(d=>d.skip===k&&!mk(d)).map(d=>nameOf(d.cid)),n=el('div'),ok=rec.rotated.filter(d=>d.ok&&d.own!=='error').length;
  n.style.overflowWrap='anywhere'; // a chat name of one long word breaks inside the summary instead of running off the screen; set here because this release leaves styles.css untouched
  n.append(el('p',null,`${rec.name} can no longer use your account.`),el('p',null,`${ok} chat${ok===1?' is':'s are'} secured.`));
  const mem=rec.rotated.filter(d=>d.skip==='member'&&!rec.chats.some(x=>x.cid===d.cid&&x.type==='channel'&&x.vis==='public')).map(d=>nameOf(d.cid));if(mem.length)n.append(el('p','hint','The removed device can still read new messages in these groups: '+mem.join(', ')+'. Ask an admin there to accept your new security code, then block you, unblock you and add you again. That shuts it out.'));
  const dev=rec.rotated.filter(d=>d.card==='dev').map(d=>nameOf(d.cid));if(dev.length)n.append(el('p','hint','Ask an admin of these channels to open the channel: '+dev.join(', ')+'. If they see you under Waiting to join, they add you, then open the channel once more. That shuts the removed device out. Until an admin has accepted your new security code, new posts there may not show for you either. If that lasts more than 30 days, ask for a new invite link.'));
  const un=names('unlisted');if(un.length)n.append(el('p','hint','The removed device can still read '+un.join(', ')+'. Removing it changed nothing there, because the channel hasn’t finished adding you. If your invite link still works, an admin adds you when they next open Hush. If it doesn’t, ask an admin to add you: you are under Waiting to join. Once you are added, ask the admin to accept your new security code, then block you, unblock you and add you again. That shuts it out.'));
  const left=rec.rotated.filter(d=>d.card==='leave').map(d=>nameOf(d.cid));if(left.length)n.append(el('p','hint','You had left '+left.join(', ')+'. That still stands.'));
  const adm=rec.chats.filter(x=>x.admin&&!x.owner&&x.type!=='dm'),carded=x=>rec.rotated.some(d=>d.cid===x.cid&&(d.card==='adm'||d.card==='leave')),list=a=>a.map(x=>x.name||'a chat').join(', '); // the owner's page acts on an adm card, or on an admin's own leave card (a private channel's); without one the owner has to
  if(adm.some(x=>!carded(x)))n.append(el('p','hint','The removed device can still act as an admin of '+list(adm.filter(x=>!carded(x)))+'. Ask the owner to accept your new security code, then remove you as an admin and make you one again.'));
  if(adm.some(carded))n.append(el('p','hint','The removed device can still act as an admin of '+list(adm.filter(carded))+' until the owner next opens Hush and has accepted your new security code. If it’s an older channel, the owner first taps Edit, then Save. Then it is shut out. If the removed device is in the wrong hands, tell the owner now.'));
  const uns=rec.rotated.filter(d=>d.own==='unsigned').map(d=>nameOf(d.cid));if(uns.length)n.append(el('p','hint','Your admins in '+uns.join(', ')+' can’t post or manage there right now. Open each one, check its admins, then tap Edit and Save. They get access back the next time you open Hush.'));
  const own=rec.rotated.filter(mk).map(d=>nameOf(d.cid));if(own.length){const b=el('p','warnbox','Couldn’t secure these chats: '+own.join(', ')+'. A device you removed may still have control there. Don’t use them any more. Start new chats with the same people.');b.style.background='color-mix(in srgb,var(--danger) 10%,transparent)';b.style.borderColor='color-mix(in srgb,var(--danger) 35%,transparent)';n.append(b)} // shortcut: the red look is set here because this release leaves styles.css untouched; move it to a class at the next stylesheet release
  const taken=names('taken');if(taken.length)n.append(el('p','warnbox','Someone locked you out of these chats first, most likely with the removed device: '+taken.join(', ')+'. Don’t use them any more. Start new chats with the same people.'));
  const kc=names('keychanged');if(kc.length)n.append(el('p','hint','Your chat with '+kc.join(', ')+' is secured once you accept their new security code. Open the chat to check it.'));
  const bad=[...names('epochcap'),...names('error'),...names('locked')];if(bad.length)n.append(el('p','hint','Couldn’t secure these chats: '+bad.join(', ')+'. The removed device may still read new messages there. Don’t write anything private in them; start new chats if you need to.'));
  n.append(el('p','hint','For the next 30 days, Hush can’t tell whether an older message in a chat that wasn’t secured again came from you or from the removed device.'),
    el('p','hint','Invite links for the secured chats were reset. Share new ones.'),el('p','hint','Your other devices were logged out. Link them again from here.'));
  if(rec.pwSkipped)n.append(el('p','warnbox','Set a new password in Settings: the lost device may know the old one.'));
  return n}
async function finishRekey(){ // at start: a removal cut short by a reload or a dropped connection goes on from its stage, in one tab at a time; true when one ran here or in another tab
  const h=S.me.handle,key='hush:rekey:'+h;if(!rekeyPending(ls.get(key,null))||!S.me.prev)return false;
  const run=async()=>{const rec=ls.get(key,null);if(!rekeyPending(rec))return false;await rekeyRun(rec,rekeySheet('Finishing device removal'));return true};
  const r=await withLock(key,{ifAvailable:true},lock=>lock?run():null);if(r!==null)return !!r;
  const {body,close}=sheet('Finishing device removal',{locked:true});body.append(el('p',null,'Hush is finishing a device removal in another tab. This tab reloads when it’s done.'));
  await withLock(key,{},async()=>{}); // until the other tab is done, or gone
  if(rekeyPending(await peekSealed(key))){close();await withLock(key,{ifAvailable:true},lock=>lock?run():null);return true} // gone mid-way: this tab goes on from the record
  location.reload();return true}
async function peekSealed(k){try{const b=localStorage.getItem('hush:sealed');if(!b||!SECK)return null;const m=await unsealBlob(SECK,b);return m[k]}catch{return null}} // an entry as the blob on disk has it now: another tab may have written since
let movedOnBusy=false;
async function keysMovedOn(){ // the server closed this connection for newer keys, or refused its sign-in: read the profile now, whatever else is in flight (refreshDir yields to a refresh already running), and sign out if the keys moved on
  if(movedOnBusy||!S.db||!S.me||S.rekeying)return;movedOnBusy=true;const h=S.me.handle;
  try{for(let i=0;i<3&&S.me&&S.me.handle===h;i++){try{await loadDir([h],true)}catch{}if(S.dir[h]&&(S.dir[h].kv||1)>(S.me.kv||1)){signedOutHere();return}await pause(2000)}}finally{movedOnBusy=false}}
async function signedOutHere(who){if(who&&(!S.me||S.me.handle!==who))return; // `who`: the account a removal's own sign-out is for (rekeyRun's two `lost` branches). When that is no longer the current account, nothing is done to the one that is; a call that names none works on the current account, as before
  const h=S.me.handle,fresh=await peekSealed('hush:ids'),mine=Array.isArray(fresh)&&fresh.find(x=>x&&x.handle===h);
  if(mine&&(mine.kv||1)>=Math.max((S.dir[h]&&S.dir[h].kv)||1,(S.db&&S.db.kv)||1)){location.reload();return} // another tab of this browser replaced the keys (release 21): this tab reloads into them instead of wiping the account
  const d=S.dir[h];if(d&&d.sig&&S.me&&S.me.sig&&d.sig.x===S.me.sig.x&&d.sig.y===S.me.sig.y&&(d.kv||1)>(S.me.kv||1)){S.me.kv=d.kv;ls.set('hush:ids',S.ids);return} // the profile's current key is this device's own: only the version number was behind (a sign-in just proved the key), so it is taken and nothing is wiped
  if(!S.me||S.me.handle!==h)return;pushMark('out');callOff(false);S.ids=S.ids.filter(x=>x.handle!==h);ls.set('hush:ids',S.ids);
  forgetAccountData(h).then(()=>{
    if(S.ids.length){start(S.ids[0]);toast(atOf(h)+' was moved to a new device and logged out here.')}
    else{S.me=null;dropUnsealed();if(S.db&&S.db.prove)S.db.prove(null);showOnboard(false,'Your account was set up fresh on another device, so it was logged out here.')}});
}
/* The account was deleted: here (sure), or on another device, when the server closes this connection with 4410 or
   refuses its sign-in as 'gone'. Then only once its profile says so too. This device forgets it as a log-out does, and
   from then on nothing republishes it. One at a time, so the deleting run and the server's close can't race. */
const goneSeen=new Set();let goneQ=Promise.resolve();
const accountGone=(h,sure)=>goneQ=goneQ.then(async()=>{
  if(!h||goneSeen.has(h)||!S.ids.some(x=>x.handle===h))return;
  if(!sure&&!(await S.db.doc('directory/'+h).get().then(s=>!!(s.exists&&s.data().gone),()=>false)))return; // a dropped connection alone wipes nothing
  goneSeen.add(h);const current=!!S.me&&S.me.handle===h,msg=sure||S.deleting===h?'Your account was deleted.':'This account was deleted.';
  if(current){callOff(false);if(S.unsubConvs){S.unsubConvs();S.unsubConvs=null}closeConv();S.me=null;if(S.db&&S.db.prove)S.db.prove(null);dropUnsealed();renderList();renderCalls()}
  S.ids=S.ids.filter(x=>x.handle!==h);ls.set('hush:ids',S.ids);if(ls.get('hush:active',null)===h)ls.set('hush:active',null);
  await forgetAccountData(h);S.deleting=null;if(!current)return;
  S.profilePage='main';if(S.ids.length){start(S.ids[0]);toast(msg)}else{renderList();updateTitle();showOnboard(false,msg)}}).catch(()=>{});
/* ---------- log out: this device forgets one account ----------
   Its private keys, chat keys, drafts and settings are erased here; other accounts on the device stay. The server
   keeps nothing about this device, so the only other step is taking the device off the profile's device list. */
const ownedBy=(k,h)=>k==='hush:ks:'+h||String(k).endsWith(':'+h)||String(k).includes(':'+h+':');
async function forgetAccountData(h){ // every local record filed under this username, and the invite secrets it made
  forgetEntries((k,v)=>ownedBy(k,h)||(String(k).startsWith('hush:inv:')&&!!v&&v.h===h));
  S.ksFor=null;S.ks=null;if(natOk()){nat('names',{map:{}}).catch(()=>{});namesSent=''} // the iPhone's ring-name table went with this account's tickets
  if(!S.ids.length){await forgetDevice();await unlockStore()} // the last account: the blob and the device key go too, and a fresh store is made
  else await secSave;
}
function dropUnsealed(){ // nothing unsealed stays in memory: keys, caches, decrypted media, profiles, the open chat
  for(const p of S.media.values())Promise.resolve(p).then(u=>{try{URL.revokeObjectURL(u)}catch{}},()=>{});
  S.contacts=[];S.contactsReady=false;S.prefs=null;S.convs=[];S.previews.clear();S.chatDocs.clear();S.dmPeers={};dmIds.clear();
  S.chanKeys.clear();S.keys.clear();S.cache.clear();S.media.clear();S.mediaBlobs.clear();tagCache.clear();unsealCache.clear();metaCache.clear();devCache.clear();
  S.posts=[];S.rawPosts=[];S.older=[];S.scheduled=[];S.future=[];S.dir={};S.presence={};S.pins={};S.verified={};S._vp=null;for(const k of Object.keys(backupPaths))delete backupPaths[k];
  dirMiss.clear();loginHealed.clear();healed.clear();wrapSynced.clear();baseDone.clear();dmRenoted.clear();rebuildNames();
  walks.clear();walkBad.clear();walkWait.clear();chainRuns.clear();healTried.clear();leaveWait.clear(); // the key chain's walks and backfills, the member cards' once-per-load marks
}
// Keys came in from Message backup: what was locked on this device may open now. The open chat is opened again, since
// without its key this device may not have been let in at all.
function keysArrived(){if(S.recheckChats)S.recheckChats();if(S.chan)openConv(S.chan);renderList()}
// Once per device: some older messages can't be opened here. Say why, and what brings them back. Asked only once this
// open's backup pull is done and the key is still missing, so keys on their way from the backup don't set it off.
function noKeyNotice(c,e){const h=S.me.handle,k='hush:nokeyTold:'+h;if(ls.get(k,false))return;
  setTimeout(async()=>{if(S.me&&S.me.handle===h&&!S.contactsReady)return noKeyNotice(c,e); // the vault first: this open's backup pull starts with it
    await S.keySync;if(!S.me||S.me.handle!==h||ls.get(k,false)||await convKey(c,e))return;ls.set(k,true);
    const {body,close}=sheet('Some older messages won\u2019t open here');const ok=el('button','primary','OK');ok.style.width='100%';ok.onclick=close;
    body.append(el('p',null,'They were sent before this device was added.'),
      el('p',null,backupOn()?'To bring them back, open Hush on a device that can still read them. With Message backup on, it adds their keys to your backup, and this device picks them up the next time you open Hush here.'
        :'To bring them back, turn on Message backup (Settings \u2192 Advanced) on a device that can still read them. This device then picks their keys up the next time you open Hush here.'),ok)},1500)}
// Message backup as the vault on the server has it right now: true, false, or null when it can't be read. A device left
// open while another turned it off still believes it's on; told false, it falls in line instead of putting a backup back.
async function backupStillOn(h){let on;
  try{const s=await S.db.doc(await vaultPath(h)).get();if(!s.exists)return backupOn(); // no settings saved yet (a brand-new account): what this page knows is all there is
    const v=s.data(),o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:enc.encode('vault|'+h)},await vaultKey(),unb64(v.ct))));
    on=!Array.isArray(o)&&!!(o.prefs&&o.prefs.backup===true)}catch{return null}
  if(on===false&&S.me&&S.me.handle===h&&backupOn()){P().backup=false;if(S.tab==='profile')setTab('profile')}
  return on}
// Once per device: there's a Message backup this device's keys can't open. Said plainly, and nothing offered that would
// delete it, since a device with out-of-date keys could wipe a backup the other devices still open.
function badBackupNotice(){const k='hush:badBackupTold:'+S.me.handle;if(ls.get(k,false))return;ls.set(k,true);
  const {body,close}=sheet('Your Message backup can\u2019t be opened here');const ok=el('button','primary','OK');ok.style.width='100%';ok.onclick=close;
  body.append(el('p',null,'There is a Message backup on the server, but this device\u2019s keys can\u2019t open it, so it can\u2019t bring older messages back here. Nothing was changed: if your other devices can still open it, it keeps working for them.'),ok)}
function confirmSheet(title,text,opt={}){ // a question with two answers; resolves true only for the first one
  return new Promise(res=>{const {body,sh,close}=sheet(title,{locked:true});if(opt.over)sh.parentNode.style.zIndex='70'; // over: above the sign-in screen
    const end=v=>{document.removeEventListener('keydown',esc);close();res(v)},esc=e=>{if(e.key==='Escape')end(false)};
    body.append(el('p',null,text));if(opt.note)body.append(el('p','hint',opt.note));
    const row=el('div','reqbtns'),no=el('button','secondary',opt.no||'No'),yes=el('button',opt.danger?'btn-danger':'primary',opt.yes||'Yes');
    row.append(no,yes);body.append(row);no.onclick=()=>end(false);yes.onclick=()=>{if(opt.danger)haptic(true);end(true)};document.addEventListener('keydown',esc);setTimeout(()=>no.focus(),50)})}
async function logOutAccount(h,opt={}){
  const id=S.ids.find(x=>x.handle===h);if(!id)return;
  const li=loginInfo(h),ways=[li&&li.loc?'your username and password':null,hasRecovery(h)?'your recovery words':null].filter(Boolean);
  const words=ways.length?`To get back in you’ll need ${ways.join(', or ')}. A device where you’re still logged in can also let you back in.`
    :'You haven’t saved a password or recovery words for this account. Without one of those, there is no way back in: this username would be lost for good.';
  if(!opt.confirmed&&!(await confirmSheet('Log out?','Are you sure you want to log out?',{note:`${words} Your chats will be erased from this device.`,danger:true})))return;
  const current=S.me&&S.me.handle===h;if(current)callOff(true);
  if(current&&S.db){ // best effort, a couple of seconds at most: take this device off the profile and stop showing as online
    const quick=p=>Promise.race([p,new Promise(r=>setTimeout(r,2000))]).catch(()=>{});
    const pd=ls.get('hush:pushDev:'+h,null);if(pd){await quick(S.db.pushClear({dev:pd}));ls.set('hush:pushDev:'+h,null)} // this iPhone's push address and its wake tickets
    if(id.dev&&id.dev.id)await quick(S.db.doc('directory/'+h).update({devs:{[id.dev.id]:null}}));
    await quick(S.db.doc('presence/'+h).set({ts:0,hidden:true}));
  }
  if(current){if(S.unsubConvs){S.unsubConvs();S.unsubConvs=null}closeConv();S.me=null;if(S.db&&S.db.prove)S.db.prove(null);
    dropUnsealed();renderList();renderCalls()} // nothing unlocked stays in memory, and a fresh (empty) draw retires any list draw still in flight with the old chats
  S.ids=S.ids.filter(x=>x.handle!==h);ls.set('hush:ids',S.ids);if(ls.get('hush:active',null)===h)ls.set('hush:active',null);
  await forgetAccountData(h);
  if(current){
    S.profilePage='main';renderList();updateTitle();
    showOnboard(false,`You’re logged out of ${atOf(h)} on this device.`);
  }else{toast(atOf(h)+' was logged out on this device');if(S.tab==='profile')setTab('profile')}
}
/* ---------- delete my account, for good (release 31) ----------
   The server keeps a tombstone of the profile with its public keys, so the account's old messages still verify and show
   as "Deleted account", and nobody can take the username again. Groups and channels it owns go for everyone first. Its
   password and recovery boxes, Message backup, search entry and saved number sit at addresses the server can't tie to
   it, so this device erases them before the account itself. The password or words are checked here only (the server
   never sees either): an accepted limit. */
async function chatsOf(h){ // every group and channel the account is in (once each), [{cid, name, own}]: owned ones are deleted with it, the rest it leaves
  const out=[];for(const c of S.convs.filter((x,i,a)=>typeOf(x)!=='dm'&&a.findIndex(y=>y.id===x.id)===i)){let shown=c;try{shown=await showMeta(c)}catch{}
    out.push({cid:c.id,name:shown.name||c.name||'A '+typeOf(c),own:isOwner(c)||shown.owner===h&&(c.visibility==='public'||!!shown._ometa)})} // an old group's meta is sealed by admins too: it can't make me the owner
  return out}
/* ===== HUSH DELETE ACCOUNT BEGIN ===== */
const sameAcct=(a,b)=>!!(a&&b&&a.handle===b.handle&&a.sig&&b.sig&&a.sig.x===b.sig.x&&a.sig.y===b.sig.y);
async function deleteProof(h,mode,v){ // {pw} or {recLoc} once what was typed opens this account as it is now; throws 'nomatch', 'stale' (keys from before a change), 'net', or the ratelimit error
  const why=e=>e&&e.code==='ratelimit'?e:new Error(e&&e.message==='nomatch'?'nomatch':'net');
  if(mode==='pw'){let r;try{r=await openLoginBox((loginInfo(h)||{}).login||h,v)}catch(e){throw why(e)}if(!sameAcct(r.id,S.me))throw new Error('stale');return {pw:v}}
  if(mode==='words'){let w,id;try{w=readWords(v)}catch{throw new Error('nomatch')}try{id=await openRecovery(w,h)}catch(e){throw why(e)}if(!sameAcct(id,S.me))throw new Error('stale');return {recLoc:lastRecLoc}}
  if(normLogin(v)!==h)throw new Error('nomatch');return {}}
async function deleteAccountRun(h,proof,step){ // the steps in order. One that must work and doesn't throws with nothing on this device wiped, so the run can simply start again
  const chats=await chatsOf(h);
  for(const c of chats.filter(x=>x.own)){step('Deleting “'+c.name+'”');
    try{await S.db.doc('channels/'+c.cid).delete()}
    catch{if((await S.db.preview(c.cid).catch(x=>({exists:!(x&&x.code==='notfound')}))).exists)throw Object.assign(new Error('chat'),{chat:c.name})} // already gone (an earlier try): skipped
    S.previews.delete(c.cid);await pause(250)}
  step('Leaving your other groups and channels');
  for(const c of chats.filter(x=>!x.own)){await leaveChat(c.cid).catch(()=>{});await pause(250)}
  step('Erasing your password, recovery words and Message backup');
  ls.set('hush:delacct:'+h,Date.now()); // from here a retry is let through on the username alone: the password's boxes may be gone
  const li=loginInfo(h)||{},boxes=new Set(Object.entries(Object.assign({},li.all||{},li.login&&li.loc?{[li.login]:li.loc}:{})).map(([l,x])=>l+'|'+x));
  if(proof.pw)for(const l of loginsOf(h))boxes.add(l+'|'+(await loginSecrets(l,proof.pw)).loc); // the password's own boxes too: an out-of-date note may not name them
  for(const b of boxes){const i=b.lastIndexOf('|');await dropLoginBox(b.slice(0,i),b.slice(i+1)).catch(()=>{})}
  const r=recLocal(h)||{};
  for(const l of new Set([r.loc,...(Array.isArray(r.old)?r.old:[]),S.prefs&&S.prefs.rec&&S.prefs.rec.loc,proof.recLoc].filter(x=>typeof x==='string')))await S.db.doc('accounts/'+l).delete().catch(()=>{});
  await S.db.doc(await backupPath(S.me)).delete().catch(()=>{});await S.db.doc('search/'+h).delete().catch(()=>{});
  const ph=ls.get('hush:phone:'+h,null);if(ph)await S.db.doc('phones/'+await phoneHash(ph)).delete().catch(()=>{});
  step('Deleting your account');const vault=(await vaultPath(h)).split('/')[1];S.deleting=h;
  const timed=p=>Promise.race([p,new Promise((_,rej)=>setTimeout(()=>rej(Object.assign(new Error('timeout'),{code:'timeout'})),30000))]);
  try{await timed(S.db.prove(null).then(async()=>S.db.prove(Object.assign(await proofFor(S.me),{dev:'',signDev:null})))); // a fresh sign-in with the account key: only it may delete the account
    await S.db.deleteAccount({vault})}
  catch(e){if(!(e&&e.code==='gone')&&!(await S.db.doc('directory/'+h).get().then(s=>!!(s.exists&&s.data().gone),()=>false))){ // 'gone', or the profile says so: it went through and only the answer was lost
    S.deleting=null;if(S.me&&S.me.handle===h)start(S.me);throw e}}
  await accountGone(h,true)}
/* ===== HUSH DELETE ACCOUNT END ===== */
async function openDeleteAccount(){
  const h=S.me&&S.me.handle;if(!h)return;
  if(!S.db||!S.db.online){toastErr('You need to be online for this.');return}
  if(!S.contactsReady||S.vaultOk===false||!S.convsLoaded){toastErr('Your chats and settings haven’t loaded yet. Try again in a moment.');return}
  const li=loginInfo(h),mode=ls.get('hush:delacct:'+h,null)?'name':li&&li.loc?'pw':hasRecovery(h)?'words':'name';
  const {body,close}=sheet('Delete account'),own=el('p',null,'Checking which groups and channels you own…');
  body.append(el('p','warnbox','This permanently deletes your account '+atOf(h)+'. It can’t be undone.'),
    el('p',null,'Your profile, settings, Message backup and private keys are erased. Your username and public keys stay on the server, marked as deleted, so the name can never be used again, by you or anyone else.'),
    el('p',null,'Messages you sent in other people’s chats stay, shown as from “Deleted account”.'),own,
    el('p',null,'Every device you’re logged in on will be logged out.'),
    el('p','hint','Backup copies on our side are gone within 7 days.'));
  let f,i;if(mode==='pw')({f,i}=pwField('Your password','current-password'));
  else{f=el('label','field');i=el(mode==='words'?'textarea':'input',mode==='words'?'linkbox':null);if(mode==='words')i.rows=3;else i.type='text';
    i.autocapitalize='none';i.spellcheck=false;i.autocomplete='off';f.append(el('span',null,mode==='words'?'Your recovery words':'Your username'),i)}
  const go=el('button','btn-danger','Delete my account');go.style.width='100%';go.disabled=true;const prog=el('p','hint'),err=el('div','err');
  body.append(el('p',null,mode==='pw'?'To confirm, enter your password.':mode==='words'?'To confirm, enter your recovery words.':'To confirm, type your username: '+h),f,go,prog,err);
  let listed=false;const ready=()=>{go.disabled=!listed||!i.value.trim()};i.oninput=ready; // only once the owned list is shown
  chatsOf(h).then(cs=>{const o=cs.filter(c=>c.own);listed=true;ready();
    own.textContent=o.length?'These groups and channels you own will be deleted for everyone: '+o.map(c=>c.name).join(', ')+'.':'You don’t own any groups or channels, so none will be deleted.'},()=>{own.textContent='Couldn’t check which groups and channels you own. Close this and try again.'});
  go.onclick=async()=>{if(go.disabled)return;err.textContent='';go.disabled=i.disabled=true;prog.textContent='Checking…';
    const back=()=>{go.disabled=i.disabled=false;prog.textContent=''};let proof;
    try{proof=await deleteProof(h,mode,i.value)}catch(e){back();
      err.textContent=e&&e.code==='ratelimit'?(/wrong passwords/.test(e.message||'')?'Too many wrong passwords for this login. Try again later.':'Too many tries from this network just now. Wait a minute, then try again.')
        :e&&e.message==='stale'?'That’s an old one. Use your current '+(mode==='pw'?'password.':'recovery words.')
        :e&&e.message==='nomatch'?(mode==='pw'?'That isn’t your password.':mode==='words'?'Those words don’t match this account. Check the order and spelling.':'That isn’t your username. Type '+h+' exactly.')
        :'Couldn’t check that. Check your connection and try again.';return}
    haptic(true);
    try{await deleteAccountRun(h,proof,t=>{prog.textContent=t});close()}
    catch(e){if(goneSeen.has(h)){close();return}back();
      toastErr(e&&e.chat?'Couldn’t delete “'+e.chat+'”, so your account wasn’t deleted. Check your connection and try again.':'Couldn’t delete your account. Check your connection and try again.')}};
}
/* ---------- privacy: no list of users; profiles and online status load only for people you deal with ---------- */
const validHandle=h=>/^[a-z0-9_]{3,20}$/.test(h);
function relevantHandles(){const hs=new Set();if(S.me)hs.add(S.me.handle);
  S.convs.forEach(c=>knownIn(c).forEach(h=>hs.add(h)));S.previews.forEach(c=>knownIn(c).forEach(h=>hs.add(h)));return [...hs]}
async function loadDir(handles,force){
  if(!S.db)return false;const want=handles.filter(h=>validHandle(h)&&(force||!S.dir[h]));let changed=false;
  for(let i=0;i<want.length;i+=20)await Promise.all(want.slice(i,i+20).map(async h=>{try{const s=await S.db.doc('directory/'+h).get();const v=s.exists?s.data():null;
    if(v&&v.ecdh&&v.sig&&JSON.stringify(S.dir[h])!==JSON.stringify(v)){S.dir[h]=v;changed=true}
    if(v&&S.me&&!dmIds.has(h))dmIdFor(h).catch(()=>{}); // work out the DM address now, so the quick lookups below have it
  }catch{}}));
  return changed;
}
let dirBusy=false;
// A device added to this account, by any way in, is shown once on every signed-in device, with its name and its key.
// What is there on this device's first look counts as known; only devices whose entries check out are announced.
let devNoticeBusy=false;
async function noticeNewDevices(){
  const me=S.me,d=me&&S.dir[me.handle];if(!d||devNoticeBusy||S.rekeying||(ls.get('hush:rekey:'+me.handle,null)||{}).stage)return;devNoticeBusy=true; // not while this device replaces the keys: the list is being rewritten
  try{const k='hush:devsSeen:'+me.handle,ids=Object.keys(d.devs||{}),seen=ls.get(k,null);ls.set(k,ids);if(!seen)return;
    const fresh=ids.filter(i=>!seen.includes(i)&&i!==(me.dev&&me.dev.id));if(!fresh.length)return;
    const ok=new Set((await verifiedDevs(me.handle)).map(v=>v.id));
    for(const i of fresh){if(!ok.has(i)||S.me!==me)continue;const e=d.devs[i],name=await openDevName(i,e.nm),key=await devShort({id:i,x:e.x,y:e.y,sx:e.sx,sy:e.sy});
      const {body,close}=sheet('A device was added');const b=el('button','primary','OK');b.style.width='100%';b.onclick=close;
      body.append(el('p',null,(name||'A device')+' was added to your account. Its device code is '+key+'.'),b)}}
  catch{}finally{devNoticeBusy=false}
}
async function refreshDir(force){
  if(dirBusy||!S.db||!S.me||S.rekeying)return;dirBusy=true;let changed=false;try{changed=await loadDir(relevantHandles(),force)}finally{dirBusy=false}
  if(S.dir[S.me.handle]&&(S.dir[S.me.handle].kv||1)>(S.me.kv||1)){signedOutHere();return}
  if(isGone(S.me.handle)){accountGone(S.me.handle);return} // deleted on another device: nothing below may publish the profile again
  const first=!S.dirReady;if(first){S.dirReady=true}if(first||force){republishSelf().then(publishDev).catch(()=>{});syncSearch()}
  noticeNewDevices();
  if(!changed&&!first)return;
  pinAll();renderList();renderCalls();
  if(S.chan){const c=curConv();const warn=!!(c&&typeOf(c)==='dm'&&!isSelf(c)&&(keyChanged(dmPeer(c))||isGone(dmPeer(c))));
    if(warn!==S.warnShown)openConv(S.chan);else{S.rendered=null;renderConv();refreshHeader()}}
}
async function lookupHandle(h){ // finds anyone by their exact username, as starting a chat needs; name search is the opt-in part (syncSearch)
  h=String(h||'').trim().toLowerCase().replace(/^@/,'');if(!validHandle(h)||!S.db||(S.me&&h===S.me.handle))return null;
  try{const s=await S.db.doc('directory/'+h).get();if(!s.exists)return null;const v=s.data();if(!v.ecdh||!v.sig)return null;
    S.dir[h]=v;return v}catch{return null}
}
async function refreshPresence(){
  if(!S.db||!S.me||S.pushCall)return;const hs=new Set(); // not while the page is up for a pushed call: that offer comes first, and the 40-s round picks presence up after
  S.convs.forEach(c=>{if(typeOf(c)!=='channel')(c.members||[]).forEach(h=>hs.add(h))});const cur=curConv();if(cur)knownIn(cur).forEach(h=>hs.add(h));
  hs.delete(S.me.handle);const p={};
  await Promise.all([...hs].slice(0,300).map(async h=>{try{const s=await S.db.doc('presence/'+h).get();if(s.exists)p[h]=s.data()}catch{}}));
  if(JSON.stringify(p)!==JSON.stringify(S.presence)){S.presence=p;refreshHeader();renderList()}
}
/* ---------- profile search: only people who allow it are listed in the search index ---------- */
async function syncSearch(){
  if(!S.db||!S.me||!S.dirReady)return;const d=S.dir[S.me.handle];if(!d)return;
  const name=String(d.name||S.me.name||'').toLowerCase().trim(),parts=name.split(/\s+/);
  const want=d.findable!==true?null:{h:S.me.handle,n:name,n2:parts[1]||parts[0]||''};
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
const knownHandle=h=>S.convs.some(c=>knownIn(c).includes(h));

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
    renderList();updateTitle();syncCallWatch()}catch{toastErr('That didn\u2019t go through. Try again.')} // syncCallWatch: an accepted request is watched for calls from now on, not from the next pass (a request has no call watch, an accept changes nothing in the list, and the pass that runs by the clock comes every 15 s)
}
function requestBar(c){
  const peer=dmPeer(c),f=el('div','composer readonly reqbar');
  f.append(el('p',null,'They won\u2019t see that you read this unless you accept.'));
  const row=el('div','reqbtns'),no=el('button','secondary','Delete'),blk=el('button','secondary','Block'),yes=el('button','primary','Accept');
  no.onclick=()=>answerRequest(c,false);yes.onclick=()=>answerRequest(c,true);
  blk.onclick=()=>{if(!confirm(`Block ${displayName(peer)}?\n\nTheir requests and invitations will be dropped quietly. You can unblock them in Settings → Privacy.`))return;
    blockPeer(peer);answerRequest(c,false);if(S.forgetPointers)S.forgetPointers(c.id);toast(displayName(peer)+' blocked')};
  row.append(no,blk,yes);f.append(row);return f;
}
const reqText=o=>!!(o&&o.text&&!o.media.length&&!o.poll&&!o.fwd&&!o.call&&!o.wake); // a plain text message: what a request may be, and all that one shows before it is answered
const inviteLine=v=>atOf(v.from)+' invited you to a '+(v.cid[0]==='g'?'group':'channel');
function openRequests(){
  const {body,close}=sheet('Message requests');const list=el('div');body.append(list);let seq=0;
  const gone=f=>{S.invites=(S.invites||[]).filter(v=>!f(v));draw();renderList();updateTitle()};
  const draw=async()=>{const my=++seq,rs=pendingRequests(),vs=S.invites||[],out=[];
    if(!rs.length&&!vs.length){list.replaceChildren(el('div','empty',''),el('p','hint','No requests right now.'));return}
    for(const c of rs){let pv=null; // the first text message, as the open request shows it: never a later one
      try{for(const p of await unsealAll(c,(await S.db.collection('channels/'+c.id+'/posts').orderBy('ts','asc').limit(20).get()).docs.map(d=>Object.assign({_id:d.id},d.data())))){const o=await openPost(c,p);if(!p.svc&&reqText(o)){pv=o;break}}}catch{}
      const b=el('button','thread');const m=el('div','t-main');
      m.append(titleNode('div','t-name',c),el('div','t-sub',pv?previewText(pv):''));b.append(convAvatar(c,'sm'),m);b.onclick=()=>{close();openConv(c.id)};out.push(b)}
    for(const v of vs){ // an invitation that waits for my Join (watchInbox): the inviter's username and the kind of chat, nothing the inviter wrote
      const r=el('div','thread static'),m=el('div','t-main'),row=el('div','reqbtns'),no=el('button','secondary','Delete'),blk=el('button','secondary','Block'),yes=el('button','primary','Join');
      m.append(el('div','t-name',inviteLine(v)));r.append(userAvatar(v.from,'sm'),m);
      no.onclick=()=>{if(S.forgetPointers)S.forgetPointers(v.cid);gone(x=>x.cid===v.cid)};
      blk.onclick=()=>{if(!confirm(`Block ${displayName(v.from)}?\n\nTheir requests and invitations will be dropped quietly. You can unblock them in Settings → Privacy.`))return;
        blockPeer(v.from);if(S.forgetPointers)S.forgetPointers(v.cid);gone(x=>x.from===v.from);toast(displayName(v.from)+' blocked')};
      yes.onclick=async()=>{try{await dropPointer(S.me.handle,{t:'invite',cid:v.cid,from:S.me.handle,type:v.cid[0]==='g'?'group':'channel'});gone(x=>x.cid===v.cid)} // my own note for the chat, as every join writes: the chat watch then shows it
        catch{toastErr('That didn’t go through. Try again.')}};
      row.append(no,blk,yes);out.push(r,row)}
    out.push(el('p','hint','Requests and invitations waiting for your answer show here. Open a request to accept or delete it.'));if(my===seq)list.replaceChildren(...out)};
  draw();
}
function showRequestAlert(){ // once per chat: the latest-message mark, which anyone in the chat can move, plays no part
  const key=c=>`hush:reqseen:${S.me.handle}:${c.id}`,rs=pendingRequests().filter(c=>!ls.get(key(c),0)),was=document.querySelector('.reqalert');
  document.querySelectorAll('.reqalert').forEach(x=>x.remove());if(!rs.length)return;
  const b=el('div','reqalert');b._ids=rs.map(c=>c.id);b.setAttribute('role','alert');const m=el('button','t-main');
  m.append(el('div','t-name',rs.length===1?'New message request':rs.length+' new message requests'),
    el('div','t-sub',rs.length===1?displayName(dmPeer(rs[0]))+' wants to message you':rs.map(c=>displayName(dmPeer(c))).slice(0,3).join(', ')));
  const x=el('button','icon-btn');x.innerHTML=I.close||'\u2715';x.setAttribute('aria-label','Dismiss');
  const seen=()=>{rs.forEach(c=>ls.set(key(c),1));b.remove()};
  m.onclick=()=>{seen();rs.length===1?openConv(rs[0].id):openRequests()};x.onclick=seen;
  b.append(html('span','reqic','\u2709\ufe0f'),m,x);document.body.append(b);if(rs.some(c=>!(was&&was._ids.includes(c.id))))haptic(true) // the alert is drawn again whenever the chat list changes: it buzzes only for a request it did not show yet
}
/* ---------- onboarding ---------- */
function showOnboard(adding,notice){
  document.querySelectorAll('.onboard').forEach(x=>x.remove());
  const o=el('div','onboard'),w=el('div','onboard-in');o.append(w);document.body.append(o);splashOff('onboard');
  let login=null,link=null; // link: this device's claim on another device's code, while it waits
  const head=(t,lead)=>{if(link){link.cancel();link=null}w.replaceChildren(html('div','logo',I.lockBig),el('h1',null,t),el('p','lead',lead))};
  const foot=(back)=>{if(back){const b=el('button','link','Back');b.onclick=back;w.append(b)}if(adding){const c=el('button','link','Cancel');c.onclick=()=>{if(link)link.cancel();o.remove()};w.append(c)}};
  const busy=(b,t)=>{b.disabled=!!t;if(t){b.dataset.t=b.dataset.t||b.textContent;b.textContent=t}else b.textContent=b.dataset.t||b.textContent};
  const offline=err=>{if(S.db)return false;err.textContent='Can\u2019t connect yet. Check your connection and reload.';return true};

  // The login screen's one field takes the account's username, with or without its @ (release 20: the only login).
  const loginField=(err)=>{const f=el('label','field');const i=el('input');i.type='text';i.placeholder='Username';
    i.autocomplete='username';i.name='username';i.autocapitalize='none';i.spellcheck=false;i.value=login||'';f.append(el('span',null,'Username'),i);
    const read=()=>{const l=normLogin(i.value);if(!l){err.textContent=i.value.trim()?'That isn’t a username: 3 to 20 letters, numbers or _. Check it and try again.':'Enter your username.';return null}return l};
    return {f,i,read}};
  const stepChoose=()=>{ // the first screen: two clear doors, plus any accounts still on this device
    head(adding?'Add an account':'Hush',notice||'Private messaging, end-to-end encrypted.');
    const li=el('button','primary','Log in'),su=el('button','secondary','Create an account');li.style.width=su.style.width='100%';su.style.marginTop='10px';
    li.onclick=()=>stepLogin();su.onclick=()=>stepSignup();w.append(li,su);
    if(!adding&&S.ids.length){const keep=el('div');S.ids.forEach(id=>{const b=withBadge(el('button','link','Continue as '+atOf(id.handle)),id.handle);b.onclick=()=>{o.remove();S.profilePage='main';start(id)};keep.append(b)});w.append(keep)} // other accounts still on this device
    foot();
  };
  const stepLogin=(msg)=>{
    head('Log in','Your username and your password.');
    const err=el('div','err',msg||'');const {f,i,read}=loginField(err);
    const {f:pf,i:p}=pwField('Password','current-password');
    const go=el('button','primary','Log in');
    const forgot=el('button','link','Forgot password?');
    const rec=el('button','link','Log in with my other device');rec.onclick=()=>{login=normLogin(i.value)||login;stepLinkShow()}; // no password: a device where you're logged in lets this one in; a username typed here is the only account the code may open
    const su=el('button','link','Don’t have an account? Sign up');su.onclick=()=>stepSignup();
    p.name='password';const form=el('form');form.method='post';form.action='#';form.append(f,pf,go);form.onsubmit=e=>e.preventDefault();go.type='submit';
    w.append(form,err,forgot,rec,su);foot(()=>stepChoose());
    i.onkeydown=e=>{if(e.key==='Enter'&&!p.value){e.preventDefault();p.focus()}};setTimeout(()=>(i.value?p:i).focus(),50);
    forgot.onclick=()=>{err.textContent='';login=normLogin(i.value)||login;stepForgot()}; // the username typed here fills the recovery screen
    go.onclick=async()=>{err.textContent='';const l=read();if(!l)return;
      if(!p.value){err.textContent='Enter your password.';p.focus();return}
      if(offline(err))return;login=l;
      const here=S.ids.find(x=>loginsOf(x.handle).includes(l));if(here){o.remove();start(here);return}
      busy(go,'Checking…');
      let r;try{r=await tryLogin(l,p.value)}
      catch(e){busy(go);const w=e&&e.code==='ratelimit'&&/wait (\d+) minute/.exec(e.message||'');
        err.textContent=w?'Too many wrong passwords for this login. Try again in '+w[1]+' minute'+(w[1]==='1'?'':'s')+', or tap “Forgot password?”'
          :e&&e.code==='ratelimit'?'Too many tries from this network. Wait a minute, then try again.'
          :e&&e.message==='nomatch'?'That password isn’t right. Try again, or tap “Forgot password?”':'Couldn’t check that. Check your connection and try again.';return}
      if(r.kind==='wrongpw'){busy(go);err.textContent='That password isn’t right. Try again, or tap “Forgot password?”';return}
      if(r.kind==='new'){busy(go);err.textContent='There’s no account with that username. Check it, or tap “Sign up” to create one.';return}
      busy(go,'Unlocking your account…');
      try{const {id,loc}=r;rememberLogin(id.handle,{login:l,loc});pwVerified.set(id.handle,{login:l,loc});rememberPw(l,p.value);if(await enterAccount(id)){toast('Welcome back, '+id.name);if(pwStrongEnough(p.value))markSecure()}else busy(go)}
      catch(e){busy(go);err.textContent=e&&e.message==='stale'?'That password is an old one. It stopped working when a device was removed from your account, or the account was set up again. Log in from a device you’re still logged in on, or use your new recovery words.':'Couldn’t log in. Check your connection and try again.'}};
  };
  // Sign-up, one screen and no code: a username, the name people see, and a password. The account is logged in to with
  // the username and the password; no email address or phone number is asked for, stored or reserved (release 20).
  const stepSignup=(msg)=>{
    head('Create an account','Pick a username, the name people see, and a password.');
    if(S.db&&S.db.warmSignup)S.db.warmSignup(); // the sign-up puzzle (SPEC.md 9.4) is solved now, out of sight, while the form is being filled in
    const err=el('div','err',msg||'');
    const f1=el('label','field');const h=el('input');h.type='text';h.name='username';h.autocomplete='username';h.autocapitalize='none';h.spellcheck=false;h.maxLength=20;h.placeholder='letters, numbers, _';f1.append(el('span',null,'Username'),h);
    const f2=el('label','field');const n=el('input');n.autocomplete='name';n.maxLength=40;f2.append(el('span',null,'Display name'),n);
    const {f:pf,i:p}=pwField('Password (at least 8 characters)','new-password');
    const go=el('button','primary','Create account');
    const li=el('button','link','Already have an account? Log in');li.onclick=()=>stepLogin();
    h.oninput=()=>{h.value=h.value.replace(/[^A-Za-z0-9_]/g,'');p.dispatchEvent(new Event('input'))}; // the meter also watches the username, which the password may not contain
    p.name='new-password';const form=el('form');form.method='post';form.action='#';form.append(f1,f2,pf,pwMeter(p,()=>({handle:h.value.trim().toLowerCase()})),go);form.onsubmit=e=>e.preventDefault();go.type='submit';
    w.append(form,err,el('p','hint','Hush never sees your password and can’t reset it, so pick one you’ll remember, or let your phone make and save one; if you ever forget it, your recovery words bring you back.'),li);foot(()=>stepChoose());setTimeout(()=>h.focus(),50);
    go.onclick=async()=>{const disp=h.value.trim(),handle=disp.toLowerCase(),name=n.value.trim(),pw=p.value;err.textContent='';
      if(handle.length<3){err.textContent='Usernames need at least 3 characters.';h.focus();return}
      if(!/[a-z_]/.test(handle)){err.textContent='Usernames need at least one letter.';h.focus();return}
      if(!name){err.textContent='Enter the name people will see.';n.focus();return}
      const bad=pwProblem(pw,null,handle);if(bad){err.textContent=bad;p.focus();return}
      if(offline(err))return;busy(go,'Creating your account…');
      try{const ref=S.db.doc('directory/'+handle);if((await ref.get()).exists){busy(go);err.textContent='That username is taken. Try another, or log in if it’s yours.';return}
        const keys=await newIdentity(),id=Object.assign({handle,disp,name,kv:1},keys);
        // Claim the username first: the server lets this connection create exactly this profile and refuses if the name was taken meanwhile.
        try{await bindDevice(id)}catch(e){throw new Error(e&&e.code==='denied'?'claimed':'net')}
        await ref.set({handle,disp,name,ecdh:keys.ecdh,sig:keys.sig,kv:1,ts:Date.now()});
        // From here on the account exists on the server: whatever else fails, this device keeps its keys.
        S.dir[handle]={handle,disp,name,ecdh:keys.ecdh,sig:keys.sig,kv:1};S.ids=S.ids.filter(x=>x.handle!==handle);S.ids.push(id);ls.set('hush:ids',S.ids);
        let all={};try{all=await saveLoginBoxes(id,[handle],pw);rememberPw(handle,pw)}catch{} // the one password box, for the username
        if(all[handle])rememberLogin(handle,{login:handle,loc:all[handle],all},true);else rememberLogin(handle,{login:handle});
        S.freshSignup=handle; // a brand-new account starts with Message backup on (loadContacts); accounts from before keep their choice
        await enterAccount(id);if(pwStrongEnough(pw))markSecure();
        if(!all[handle])toastErr('Your password didn’t save. Add it again in Settings → Login and devices.')}
      catch(e){busy(go);err.textContent=e&&e.message==='claimed'?'That username was just taken. Try another.':'Couldn’t create the account. Check your connection and try again.'}};
  };
  // Forgot password: two ways back in, and neither asks for the password. A device where you're still logged in lets this
  // one in (path one). With none, the recovery words (and the username) bring the account back, and then a new password is set (path three).
  const stepForgot=()=>{
    head('Forgot your password?','You don\u2019t need it to get back in.');
    const ln=el('button','primary','Use a device where I\u2019m still logged in'),rw=el('button','secondary','Use my recovery words');
    ln.style.width=rw.style.width='100%';rw.style.marginTop='10px';ln.onclick=()=>stepLinkShow();rw.onclick=()=>openRestore(null,login);
    w.append(ln,rw,el('p','warnbox','No other device and no recovery words? Then nobody can open this account again, including you: Hush can\u2019t reset it, and that\u2019s what keeps anyone else from taking it.'));
    foot(()=>stepLogin());
  };
  // Path one (SPEC.md 14.14, release 58): this device shows a code; a device where the account is logged in scans it and
  // lets this one in at once, from its own session. Nothing else is asked, no password and no recovery words: the scan is
  // the approval. Nothing was forgotten, so no new password is asked for either. The code lives 5 minutes; the screen stays on.
  const stepLinkShow=()=>{
    head('Log in with your other device','On a device where you\u2019re logged in, open Settings \u2192 Login and devices \u2192 Link a new device, and scan this code with it.');
    const host=el('div'),err=el('div','err'),q=el('div','qr big'),left=el('p','hint center'),box=el('div','link-wait');
    const alt=el('button','link','Your other device has no camera? Scan or type its code instead');alt.onclick=()=>stepLinkScan();
    const bk=el('button','link','No other device? Use my recovery words');bk.onclick=()=>openRestore(null,login);
    host.append(el('p','hint center','Making a code\u2026'));w.append(host,err,alt,bk);foot(()=>stepLogin());
    const again=()=>{const b=el('button','primary','Show a new code');b.style.width='100%';b.onclick=()=>stepLinkShow();host.replaceChildren(b)};
    if(offline(err)){again();return}
    // Whoever photographs this code can answer it first, from an account of their own: only the account asked for is opened.
    // The username typed on the Log in screen names it; with none, the person is asked once, here, before anything is kept.
    const want=async id=>login?id.handle===login:confirmSheet('Open @'+id.handle+'?','Open @'+id.handle+' ('+id.name+') on this device?',{yes:'Open it',no:'Not my account',over:true});
    const c=link=askLink((qr,key)=>{const svg=qrSvg(qr,'QR code for your other device to scan');if(svg)q.innerHTML=svg;const end=Date.now()+5*60e3;
      box.append(el('span','spin'),el('span',null,'Waiting for your other device to scan this\u2026'));host.replaceChildren(q,el('p','hint center','Device code: '+key),box,left);
      const tick=()=>{if(link!==c||!host.isConnected)return;left.textContent='Works for '+Math.max(1,Math.ceil((end-Date.now())/60e3))+' more minute'+(end-Date.now()>60e3?'s':'')+'.';setTimeout(tick,1000)};tick()},want);
    (async()=>{try{const id=await c.done;if(link!==c||!id)return;link=null;if(await enterAccount(id))toast('Welcome, '+id.name)}
      catch(e){if(link!==c)return;link=null;const m=e&&e.message;
        err.textContent=m==='other'?'That answer came from @'+e.handle+(login?', not @'+login:'')+', so nothing was opened.':m==='timeout'?'Nobody scanned this code in time, so it stopped working.':m==='ended'?'This code stopped working, so nothing was shared.':linkNetErr(e)||linkWaitMsg(e);again()}})();
  };
  // The other way round, for a logged-in computer with no camera: it shows a code (Link a new device → Show a code instead)
  // and this device scans or types it, claims the offer, and waits for one tap there.
  const stepLinkScan=()=>{
    head('Log in with your other device','On a device where you\u2019re logged in, open Settings \u2192 Login and devices \u2192 Link a new device \u2192 Show a code instead. Then scan or type the code it shows.');
    const go=el('button','primary','Scan or type the code');go.style.width='100%';const box=el('div','link-wait'),err=el('div','err');box.hidden=true;
    const bk=el('button','link','Back to showing a code');bk.onclick=()=>stepLinkShow();
    w.append(go,box,err,bk);foot(()=>stepLogin());
    go.onclick=()=>scanOtherCode(async t=>{link=await claimLink(t)},async()=>{
      const c=link;if(!c)return;go.hidden=true;err.textContent='';box.hidden=false;
      box.replaceChildren(el('span','spin'),el('span',null,'Code accepted. On your other device, tap Let it in. It shows this device\u2019s code: '+c.key+'.'));
      try{const id=await c.done;if(link!==c||!id)return;link=null;if(await enterAccount(id))toast('Welcome, '+id.name)}
      catch(e){if(link!==c)return;link=null;box.hidden=true;go.hidden=false;go.textContent='Scan again';err.textContent=linkNetErr(e)||linkWaitMsg(e)}});
  };
  stepChoose();
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
let lockShown=false,awayAt=0,lockGate=null; // lockGate: the boot waiting at a PIN gate; a pushed call lets it through with the lock still shown (a PIN seals nothing)
const wipeDevice=()=>{document.body.style.visibility='hidden';forgetDevice().finally(()=>location.reload())}; // clear this device, then start over
function showPwLock(){ // asked when Hush opens; nothing about your accounts is readable until the password is right
  return new Promise(done=>{lockShown=true;document.querySelectorAll('.lock').forEach(x=>x.remove());
  const o=el('div','lock');o.setAttribute('role','dialog');o.setAttribute('aria-label','Hush is locked');
  const i=el('input','code-in');i.type='password';i.autocomplete='off';i.name='lock';i.placeholder='Lock password';i.setAttribute('aria-label','Lock password');i.style.letterSpacing='normal';i.style.fontSize='18px'; // not a login: the lock password may or may not be the Hush password, so the phone must neither offer the saved one here nor save this one over it
  const go=el('button','primary','Unlock');go.style.width='min(260px,100%)';const err=el('div','err'),forgot=el('button','link','Forgot your lock password?');
  o.append(html('div','logo',I.lockBig),el('h1',null,'Hush is locked'),el('p','lead','Enter your lock password to open your chats.'),i,go,err,forgot);document.body.append(o);splashOff('lock');
  setTimeout(()=>i.focus(),60);
  const fails=()=>ls.get('hush:lockFails',null)||{n:0,until:0};
  i.oninput=()=>{err.textContent=''};i.onkeydown=e=>{if(e.key==='Enter')go.click()};
  go.onclick=async()=>{const f=fails();if(Date.now()<f.until){err.textContent='Too many tries. Wait '+Math.ceil((f.until-Date.now())/1000)+' seconds.';return}
    if(!i.value)return;go.disabled=true;go.textContent='Unlocking\u2026';let ok=false;try{await openSealed(i.value);ok=true}catch{}go.disabled=false;go.textContent='Unlock';
    if(ok){ls.set('hush:lockFails',null);i.value='';o.remove();lockShown=false;awayAt=0;done();return}
    f.n++;if(f.n>=5)f.until=Date.now()+Math.min(30e3*2**(f.n-5),3600e3);ls.set('hush:lockFails',f);
    i.value='';err.textContent=f.n>=5?'Wrong password. Wait a bit before trying again.':'Wrong password. Try again.'};
  forgot.onclick=()=>{if(!confirmDanger('Forgot your lock password?\n\nYou can clear this device and log back in with your username and your Hush password (or your recovery words). Your account comes back when you log in. Past messages and groups come back only if \u201cMessage backup\u201d is on.\n\nClear this device?'))return;wipeDevice()};
  });
}
// The lock gate at start: resolves once the PIN or the lock password is right. Until then nothing is unsealed.
function showLock(){
  if(S.call&&S.call.cam)camOff(S.call); // no picture of this side goes out while the lock stands (it paints opaque over the call screen)
  if(lsPw())return lockShown?Promise.resolve():showPwLock();
  if(!lockCfg()||lockShown)return Promise.resolve();
  return new Promise(done=>{lockGate=done;lockShown=true;document.querySelectorAll('.lock').forEach(x=>x.remove());
  const o=el('div','lock');o.setAttribute('role','dialog');o.setAttribute('aria-label','Hush is locked');
  const i=el('input','code-in');i.type='password';i.inputMode='numeric';i.autocomplete='off';i.maxLength=8;i.placeholder='PIN';i.setAttribute('aria-label','PIN');
  const go=el('button','primary','Unlock');go.style.width='min(260px,100%)';const err=el('div','err'),forgot=el('button','link','Forgot your PIN?');
  o.append(html('div','logo',I.lockBig),el('h1',null,'Hush is locked'),el('p','lead','Enter your PIN to open your chats.'),i,go,err,forgot);document.body.append(o);splashOff('lock');
  setTimeout(()=>i.focus(),60);
  const fails=()=>ls.get('hush:lockFails',null)||{n:0,until:0};
  i.oninput=()=>{i.value=i.value.replace(/\D/g,'').slice(0,8);err.textContent=''};
  i.onkeydown=e=>{if(e.key==='Enter')go.click()};
  go.onclick=async()=>{const f=fails();if(Date.now()<f.until){err.textContent='Too many tries. Wait '+Math.ceil((f.until-Date.now())/1000)+' seconds.';return}
    if(i.value.length<4)return;go.disabled=true;const ok=await checkPin(i.value);go.disabled=false;
    if(ok){ls.set('hush:lockFails',null);o.remove();lockShown=false;awayAt=0;done();return}
    f.n++;if(f.n>=5)f.until=Date.now()+Math.min(30e3*2**(f.n-5),3600e3);ls.set('hush:lockFails',f);
    i.value='';err.textContent=f.n>=5?'Wrong PIN. Wait a bit before trying again.':'Wrong PIN. Try again.'};
  forgot.onclick=()=>{if(!confirmDanger('Forgot your PIN?\n\nYou can log out every account on this device and log back in with your username and password. Your account comes back when you log in. Past messages and groups come back only if \u201cMessage backup\u201d is on.\n\nLog out of this device?'))return;
    wipeDevice()};
  });
}
// Locking is a reload: the page comes back with everything sealed and the gate in front, so nothing unsealed (keys,
// messages, decrypted media, the screen itself) survives being away, with a PIN just as with a password.
document.addEventListener('visibilitychange',()=>{if(!lockCfg())return;if(document.hidden)awayAt=Date.now();else if(awayAt&&!S.call&&Date.now()-awayAt>=lockAfter()){document.body.style.visibility='hidden';location.reload()}}); // not during a call: the reload would end it, so the lock waits for the next return
function openAppLock(){
  const c=lockCfg();if(c&&c.kind==='pw')return openPwLock();if(c)return openPinLock();
  const {body,close}=sheet('Lock Hush');
  body.append(el('p',null,'Ask for something whenever Hush opens, so someone who picks up your phone can\u2019t read your chats. Pick one:'));
  const a=html('button','menu-item flush',I.lockMd+'<span><b>Password</b> (strongest)<br><small>Also scrambles your account on this phone, so it stays safe even if someone copies the phone\u2019s storage. You type it each time Hush opens.</small></span>');
  const b=html('button','menu-item flush',I.lockMd+'<span><b>PIN</b> (quicker)<br><small>Stops someone who picks up your phone. Doesn\u2019t protect against someone who copies the phone\u2019s storage.</small></span>');
  a.onclick=()=>{close();openPwLock()};b.onclick=()=>{close();openPinLock()};body.append(a,b);
}
function openPwLock(){
  const on=lsPw(),{body,close}=sheet('Password lock');
  const introTxt=()=>(on?'Hush asks for your lock password when you open it, and '+lockAfterWords()+'. Your account stays scrambled on this phone until you unlock.'
    :'Hush will ask for this password when it opens. Your account is kept scrambled on this phone until you unlock. You can use your Hush password or a different one.'),intro=el('p',null,introTxt());body.append(intro);
  if(on)lockTimer(body,()=>{intro.textContent=introTxt()});
  const mk=label=>{const f=el('label','field');const i=el('input');i.type='password';i.autocomplete='off';f.append(el('span',null,label),i);body.append(f);return i}; // off, as on the lock screen: never saved as the Hush password
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
    :'Ask for a PIN whenever Hush opens, so someone who picks up your phone can\u2019t read your chats.'),intro=el('p',null,introTxt());body.append(intro);
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
  if(p.type==='dm'||p.t==='dm'||p.t==='request'){const peer=p.peer||p.from;if(!(await senderKeys(peer)))return false;const cid=await dmIdFor(peer),known=(dmInfo(p.cid)||{}).peer||S.dmPeers[p.cid];
    return p.cid===cid||(known?known===peer:!!(/^d/.test(p.cid)&&ksMap()[p.cid]))} // or a chat this device already knows under that person (its id is from before a key change); one it holds keys for but knows under nobody counts once, and never under someone else
  if(p.t==='invite'){if(!p.sg)return true;return !!(await sideOk(p.from,p.sg,'hush-drop-v1',['invite',p.from,S.me.handle,String(p.cid),String(p.ts)],p.ts,true))} // an invitation signed before the inviter's key change still counts: its date is in what is signed
  return false;
}
/* Blocking, kept in the encrypted vault so every device of mine agrees and nobody else (the server included) knows.
   A blocked person: their notes (DMs, requests, invitations) are deleted on arrival, our DM with them is hidden,
   their messages in shared groups and channels are hidden, and they never show in my search or pickers.
   A blocked chat: one conversation closed and kept out of the list, new messages included. */
const isBlocked=h=>!!(h&&S.prefs&&Array.isArray(S.prefs.blocked)&&S.prefs.blocked.includes(h));
const isChatBlocked=cid=>!!(S.prefs&&Array.isArray(S.prefs.blockedChats)&&S.prefs.blockedChats.includes(cid));
const hiddenConv=c=>!!c&&(isChatBlocked(c.id)||clearedConv(c)||(typeOf(c)==='dm'&&!isSelf(c)&&isBlocked(dmPeer(c))));
function afterBlockChange(){S.unreadKey.clear();computeUnread(); // counts made before the change were cached with the old list
  if(S.chan&&hiddenConv(curConv()))closeConv();else if(S.chan){S.rendered=null;applyExpiry();renderConv()}renderList();updateTitle();if(S.tab==='profile')setTab('profile')}
function blockPeer(h){haptic(true);const b=P().blocked||(P().blocked=[]);if(!b.includes(h))b.push(h);revokeWake(h);saveContacts();afterBlockChange()}
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
function blockChat(cid){haptic(true);const b=P().blockedChats||(P().blockedChats=[]);if(!b.includes(cid))b.push(cid);const c=S.convs.find(x=>x.id===cid);if(c&&typeOf(c)==='dm'&&!isSelf(c))revokeWake(dmPeer(c));saveContacts();afterBlockChange()} // a blocked chat's person can no longer ring this phone
function unblockChat(cid){const b=P().blockedChats||[];P().blockedChats=b.filter(x=>x!==cid);saveContacts();afterBlockChange()}
function confirmBlockPerson(h){
  if(!confirm(`Block ${displayName(h)}?\n\nTheir messages and requests will be dropped quietly, their messages in groups and channels you share will be hidden, and they won’t be able to add you to groups. They won’t be told. You can unblock them in Settings → Privacy.`))return false;
  blockPeer(h);toast(displayName(h)+' blocked');return true} // our DM is hidden, not forgotten, so unblocking brings it straight back
function confirmBlockChat(c){
  if(!confirm(`Block this chat with ${convTitle(c)}?\n\nIt closes and stays out of your chat list, new messages included. ${displayName(dmPeer(c))} won’t be told. You can unblock it in Settings → Privacy.`))return false;
  blockChat(c.id);toast('Chat blocked');return true}
const dmRenoted=new Set(),baseDone=new Set();
async function recordBase(c){ // a DM created before base keys were kept gets one, from a device that can open it, so both of us always can
  if(!c||typeOf(c)!=='dm'||isSelf(c)||!S.me||!S.db||!S.db.setBase||baseDone.has(c.id))return;baseDone.add(c.id);
  const key='hush:base:'+S.me.handle;if(ls.get(key,[]).includes(c.id))return; // done from this device before: once a chat, not at every start
  try{const cap=await memberCap(c,0);if(cap){await S.db.setBase(c.id,cap);ls.set(key,[...new Set([...ls.get(key,[]),c.id])])}}catch{baseDone.delete(c.id)}}
async function ensureInbox(c,only,fresh){ // make sure everyone in a chat has a pointer to it (once per person, remembered on this device; `fresh` sends again)
  if(!S.db||!c||!c.id||!S.me)return;const me=S.me.handle,key='hush:ptr:'+me,done=ls.get(key,{}),had=new Set(fresh?[]:(done[c.id]||[]));
  const who=[...new Set(only||c.members||[])].filter(h=>!had.has(h)).slice(0,500);if(!who.length)return;
  await loadDir(who);const dm=typeOf(c)==='dm';
  await Promise.all(who.map(async h=>{try{
    const peer=dm?((c.members||[]).find(x=>x!==h)||h):undefined;
    await dropPointer(h,{t:dm?(c._req&&h!==me?'request':'dm'):'invite',cid:c.id,from:me,type:typeOf(c),peer});had.add(h)}catch{}}));
  done[c.id]=[...new Set([...(done[c.id]||[]).filter(h=>!who.includes(h)),...had])];ls.set(key,done); // only those tried now change their mark (one that failed is tried again later); anyone else noted before stays, so a fresh send to a few forgets no one
}
function notePointer(cid,p){ // what a pointer tells this device about a chat
  if(p.type==='dm'||p.t==='dm'||p.t==='request'){const peer=p.peer||p.from;if(S.dmPeers[cid]&&S.dmPeers[cid]!==peer)return;S.dmPeers[cid]=peer;dmIds.set(peer,cid); // a chat keeps the person it is known under
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
const heldKey=cid=>{const m=ksMap()[cid];return !!(m&&Object.keys(m).some(e=>e!=='a'&&e!=='b'))};
// A private channel this account held a key for and can't open now, once the account has changed its keys (or before this page
// has read its own profile): an admin's page that hasn't accepted the new security code changed the key without it (wrapKey)
// and hands it on once it does (rewrapFor), so the pointer waits rather than goes, for 30 days from the first time this page
// found the channel so (hush:codeWait, ended once the channel shows or goes) (SPEC.md 5.6 "Member cards")
// shortcut: a removal or block of such an account keeps its pointer for those 30 days too, and a code accepted after them finds none (a new link brings the channel back); have rewrapFor leave a note again if that shows up
const codeWait=cid=>{if(!/^c/.test(cid))return false;if(!S.dir[S.me.handle])return true;if(!prevSigsOf(S.me.handle).length)return false;
  const k='hush:codeWait:'+S.me.handle,m=ls.get(k,{});if(!m[cid]){m[cid]=Date.now();ls.set(k,m)}return m[cid]>Date.now()-REKEY_KEEP_MS};
const codeWaitEnd=cid=>{const k='hush:codeWait:'+S.me.handle,m=ls.get(k,{});if(m[cid]){delete m[cid];ls.set(k,m)}};
function watchInbox(id,cb){
  const h=id.handle,docs=new Map(),subs=new Map(),ptrs=new Map(),waiting=new Set(),refused=new Set(),firstSeen=new Map(),kept=new Map(),renoted=new Set(),answered=new Map(),rechecks=new Map();let ready=false,pend=0,dead=false,runs=0;
  const FRESH_MS=2*60e3;const fresh=cid=>{if(!firstSeen.has(cid))firstSeen.set(cid,Date.now());return Date.now()-firstSeen.get(cid)<FRESH_MS};
  const emit=()=>{if(dead)return;
    const list=[...docs.values()].sort((a,b)=>(b.ts||0)-(a.ts||0)).slice(0,300);cb(list,!ready||pend>0)};
  const drop=cid=>{const u=subs.get(cid);if(u)u();subs.delete(cid);docs.delete(cid);waiting.delete(cid)};
  const forget=cid=>{lost.add(cid);for(const [pid,p] of ptrs)if(p&&p.cid===cid){ptrs.delete(pid);S.db.doc('inbox/'+h+'/c/'+pid).delete().catch(()=>{})}
    for(const [id,g] of gone)if(g.cid===cid&&!g.done){g.now=true;if(!g.busy)delNote(id,cid,true)}if(S.db.sendNow)S.db.sendNow('inbox:'+cid)}; // and the chat's notes the page was deleting by itself (an older note): at once too
  // A note this page deletes by itself (an older note of a chat, one it cannot use) is deleted once: not again at the next change of the
  // mailbox while that delete waits or is on its way, nor after it was taken. One that fails (refused, not answered, the connection gone)
  // is sent again by itself after a wait, 2 s doubling to a minute, while the note is still there (here: the notes of the newest pass).
  // They wait in the queue below the reserve (the adapter's `later`, tag 'inbox:<chat>', or 'inbox' for a note that names none it can
  // read); a chat the user deletes, leaves or blocks (forget) deletes at once every note of it this watch has read, these among them
  // (`now`; a note of it not read yet is not among them). The wait is on a
  // clock that does not step (performance.now), and its timer sends again whatever that clock says.
  const gone=new Map();let here=new Set();
  const delNote=(id,cid,again)=>{let g=gone.get(id);if(g&&(g.busy||g.done||(!again&&g.at>performance.now())))return;if(!g)gone.set(id,g={w:2000,at:0,cid});g.busy=true;
    S.db.doc('inbox/'+h+'/c/'+id).delete({later:()=>!g.now&&'inbox'+(g.cid?':'+g.cid:'')}).then(()=>{g.busy=false;g.done=true},()=>{g.busy=false;const w=g.w;g.at=performance.now()+w;g.w=Math.min(w*2,60000);
      setTimeout(()=>{if(!dead&&gone.get(id)===g&&here.has(id))delNote(id,g.cid,true)},w)})};
  const filed=fn=>{S.filing=(S.filing||0)+1;try{fn()}finally{S.filing--}}; // people filed from notes: the vault saves this makes are the page's own (saveContacts)
  // A pass that a newer copy of the mailbox cuts short files nothing, and the next opens again what it opened: in a burst of notes each
  // pass is cut short by the next. So a note's opening (with its sender's profile read) is kept while it is under way, and once it found
  // the note good until a pass files it (opens); one that found nothing is not kept, and a pass that took it over under way and finds
  // nothing treats the note as not known yet (unsure: it waits). My own profile is read once at a time (selfRead): a pass that needs it while
  // a read is under way takes that read's answer.
  const opens=new Map();let selfRead=null;
  // What this watch knows is gone, for the rows of the list as last drawn that stand while the live list comes (renderList): a chat it
  // forgot (deleted, this account removed, or left, blocked or declined here), and, once a pass has read every note of the mailbox, a
  // chat no note names (named: that pass's chats, until the next such pass; a note not read yet may name any chat; never set again
  // once a copy of this watch has had the query's 500 notes (capped): the server may hold more, which the copies after it need not
  // bring; a fresh copy after a reconnect may, and capped stays set even then).
  // Also (absent) a
  // chat whose record the server answers as not there now, if the list as last drawn has its row: its record was there then, so it
  // was deleted; a note's chat with no such row may still be being written, and the note waits as the verdict says, either way.
  const lost=new Set(),absent=new Set();let named=null,capped=false;S.chatGone=cid=>lost.has(cid)||absent.has(cid)&&listRank(cid)>=0||!!named&&!named.has(cid);
  S.forgetPointers=forget;
  const un=S.db.collection('inbox/'+h+'/c').limit(500).onSnapshot(async s=>{here=new Set(s.docs.map(d=>d.id));if(here.size>=500)capped=true;
    const seen=new Map(),run=++runs,unsure=new Set(),old=Date.now()-7*864e5,canDrop=()=>S.contactsReady&&S.vaultOk!==false&&!S.rekeying&&!(ls.get('hush:rekey:'+h,null)||{}).stage&&S.dir[h]&&(S.dir[h].kv||1)===(S.me.kv||1); // old: one cutoff for the pass, so a note is a week old in recheck and in the delete line alike
    // A week-old note that failed with no keys held for its person (the age it goes at below): loadDir keeps no error, so a
    // failed profile read looked like "no such person". Read once more: a read that fails leaves the note for the next pass
    // (unsure); one that finds no keys leaves it bad; one that finds them puts them in the copy and asks noteOk again.
    // Only while the delete line could delete, and once a minute per person (rechecks), as dirMiss paces noteOk's read: a
    // note not read again waits too, so a stranger's pile costs no reads at every pass.
    const recheck=async(d,p)=>{const who=p&&(p.peer||p.from);if(!who||!validHandle(who)||peerKeys(who)||isBlocked(p.from)||(d.data().ts||0)>=old)return false;
      let r=rechecks.get(who);if(!canDrop()){unsure.add(d.id);return false}
      if(!r||r.at<Date.now()-60000||r.off&&S.db.online){const n=r={at:Date.now()};rechecks.set(who,n);n.v=S.db.doc('directory/'+who).get().then(s=>s.exists?s.data():null,e=>{n.off=!!e&&e.code==='offline';throw e})} // off: failed for want of a link, read again once there is one (a reconnect is rare; refusals by the server stay paced)
      let v;try{v=await r.v}catch{unsure.add(d.id);return false}
      if(!v||!v.ecdh||!v.sig)return false;S.dir[who]=v;return noteOk(p)};
    const opened=new Map(await Promise.all(s.docs.filter(d=>!ptrs.has(d.id)).map(async d=>{let o=opens.get(d.id);const took=!!o;
      if(!o){o=(async()=>{let p;try{p=await openPointer(d.data());if(!(await noteOk(p))&&!(await recheck(d,p)))p=null}catch{p=null}return p})();opens.set(d.id,o)}
      const p=await o;if(!p){if(opens.get(d.id)===o)opens.delete(d.id);if(took)unsure.add(d.id)}return [d.id,p]}))); // every new note at once, not one after the other
    // Who left a note decides what it is, not what the note says (release 108, SPEC.md 5.6 and 6). `own`: the chats one of
    // my own notes names (the stored mark, which only my signed-in connection can set); `knows`: a person I have an accepted
    // or self-started one-on-one chat with; `asks`: one-on-one notes from someone else, for a chat and a person my vault does not know.
    const isDm=p=>p.type==='dm'||p.t==='dm'||p.t==='request',vault=S.contactsReady&&S.vaultOk!==false,note=d=>ptrs.get(d.id)||opened.get(d.id),
      own=new Set(s.docs.filter(d=>d.data().own===1&&note(d)).map(d=>note(d).cid)),
      knows=who=>Object.values((S.prefs||{}).dms||{}).some(i=>i.peer===who&&i.req!=='in'&&i.req!=='no'),
      asks=[...opened].filter(([,p])=>p&&isDm(p)&&!own.has(p.cid)&&!(vault&&(dmInfo(p.cid)||knows(p.peer||p.from))));
    if(asks.length)await (selfRead||(selfRead=loadDir([h],true).finally(()=>{selfRead=null}))); // my own setting decides, as the server holds it now
    if(run!==runs)return; // a newer list arrived while these notes opened: that pass decides, never this stale one
    kept.clear(); // emptied here and filled below in the same step: a chat's record that comes while this pass waits finds the last pass's notes (adopt), never none
    filed(()=>{for(const [id,p] of asks){if(!S.dir[h]||(S.dir[h].requests===true&&!vault))opened.set(id,null); // my profile or my vault is not read: the note waits for the next pass
      else if(S.dir[h].requests===true)setDmInfo(p.cid,{peer:p.peer||p.from,req:'in'})}}) // a request, whatever its tag says; with the setting off the tag decides, as before
    const hold=new Map(),beside=new Set(); // an invitation someone else left: its chat waits for my Join (true) or goes in as before (false); beside: someone else's note that is newer than my own for the chat
    for(const d of s.docs){const p=note(d);if(!p||isDm(p)||d.data().own===1)continue;
      if(own.has(p.cid)){const mine=s.docs.filter(m=>m.data().own===1&&(note(m)||{}).cid===p.cid),q=note(mine[0]);
        if(mine.some(m=>(m.data().ts||0)>=(d.data().ts||0))){ptrs.set(d.id,null);delNote(d.id,p.cid)}
        else{beside.add(d.id);if(!dead&&!(answered.get(p.cid)>=(d.data().ts||0))){const t=Math.max(...s.docs.filter(o=>o.data().own!==1&&(note(o)||{}).cid===p.cid).map(o=>o.data().ts||0));answered.set(p.cid,t);dropPointer(h,{t:q.t,cid:q.cid,from:h,type:q.type,peer:q.peer}).catch(()=>answered.delete(p.cid))}}
        continue} // the chat rests on my own note: theirs never takes its place below. Theirs goes once mine is not the older one, never before: a page from before release 108 keeps the newer note and deletes mine, and with theirs deleted here too no note would be left. So while mine is older it is written again, once per chat for the newest hour of theirs (answered), not once for each of their notes: a pile left for one chat filled my mailbox with my own notes and pushed out what waits there; with my clock behind, mine stays the older one and the mark keeps every later pass from writing again. Not by a watch that has ended (a device removal or another account has the mailbox by then)
      const inn=subs.has(p.cid)||joinedPublic(p.cid); // shown by this page already, or a public channel I joined; a stored key does not count: any read of the record stores the inviter's wrap (convKey)
      if(!p.sg||!/^[gc]/.test(p.cid)||(!inn&&(!vault||isBlocked(p.from)))){ptrs.delete(d.id);opened.set(d.id,null)} // no signature (one that is there was checked by noteOk): dropped, as a forged note is; so is one from a person blocked since; and without my vault a person I blocked cannot be told from anyone else, so it waits
      else if(inn)hold.set(p.cid,false);else if(!hold.has(p.cid))hold.set(p.cid,true)} // no pass for a person I chat with: with "Send a request first" off, one note from a stranger makes them one
    for(const d of s.docs){let p=ptrs.get(d.id);
      if(p===undefined){p=opened.get(d.id);ptrs.set(d.id,p);
        if(p===null){if(!unsure.has(d.id)&&canDrop()&&(d.data().ts||0)<old)delNote(d.id); // unreadable, forged or from someone blocked: gone, once a week old (another device of mine, or my old key, may still open a fresh one)
          else ptrs.delete(d.id)}} // unless this device may simply not know yet (settings not read, keys changing): looked at again next time
      if(!p||beside.has(d.id))continue;
      // a second note for a chat already listed: the newest stays (on a tie, one I wrote myself) and the other goes, once (delNote)
      const x=d.data(),k=kept.get(p.cid),rank=n=>(n.ts||0)*2+(n.own===1?1:0),lose=k&&k.id!==d.id&&(rank(k.x)>=rank(x)?d.id:k.id);
      if(lose){ptrs.set(lose,null);delNote(lose,p.cid);if(lose===d.id)continue}
      kept.set(p.cid,{id:d.id,x,p});if(!hold.get(p.cid))seen.set(p.cid,p)}
    if(dead)return;
    for(const pid of [...ptrs.keys()])if(!here.has(pid))ptrs.delete(pid);
    if(!capped&&ptrs.size===here.size)named=new Set([...ptrs.values()].filter(Boolean).map(p=>p.cid)); // every note of this copy read (none left to look at again), and no copy of this watch had 500
    for(const [id,g] of gone)if(!here.has(id)&&!g.busy)gone.delete(id); // not one on its way: a note I wrote myself may be out of one copy of the mailbox and in the next
    for(const id of [...opens.keys()])if(ptrs.has(id)||!here.has(id))opens.delete(id);
    for(const cid of [...subs.keys()])if(!seen.has(cid))drop(cid);
    // The start's queue sends a chat no list has placed yet in the order the chats are begun here: the newest note first, a stranger's one-on-one note
    // after every chat of mine. Worked out once per chat, for the chats not watched yet, and before the notes are filed: filing one puts its person in the vault.
    const order=[...seen].filter(([cid])=>!subs.has(cid)).map(([cid,p])=>[(own.has(cid)||!isDm(p)||knows(p.peer||p.from)?1e15:0)+(kept.get(cid).x.ts||0),cid]).sort((a,b)=>b[0]-a[0]);
    filed(()=>{for(const [cid,p] of seen)notePointer(cid,p)}); // in note order, as before: which of two one-on-one chats a person is known under does not change
    for(const [,cid] of order)start(cid);
    S.invites=[...kept.values()].filter(k=>hold.get(k.p.cid)).map(k=>({cid:k.p.cid,from:k.p.from})); // what Message requests shows: who invited, and the address for its kind; the chat itself is not opened or watched
    ready=true;emit();
  },()=>toastErr('Your chats stopped updating. Reload to reconnect.'));
  // Watch one chat a pointer names. The watch may end in refusal (our level was revoked, or we never had one yet):
  // that is a reason to look again later, never by itself to forget.
  function start(cid){pend++;let first=true,seq=0;const done=()=>{if(first){first=false;pend--}};
    subs.set(cid,watchDoc(S.db.doc('channels/'+cid),async d=>{const my=++seq,rf=refused.has(cid),out=!!S.db.chatOut&&S.db.chatOut(cid); // rf: this chat's watch was refused on this page. out: the server answered the right key for this chat "you were removed" (the adapter keeps it), asked as the copy comes: another open may end otherwise while the copy is worked on
      const c=d.exists?chatRec(cid,d.data()):null;if(c)noteChatDoc(c);
      const shown=c?Object.assign({},await showMeta(c)):null;adoptOMeta(c,shown);adminGone(shown);
      const mine=!!shown&&!(out&&typeOf(c)!=='dm'&&c.visibility!=='public')&&(typeOf(c)==='dm'||c.visibility==='public'||!!(await convKey(c,epochOf(c)))||['owner','admin'].includes(S.db.chatLevel(cid)));
      // Holding the current key is not being let in: a member blocked with no key change still holds it, and the server refuses it
      // in so many words (out). Such a copy, the trimmed one anyone signed in may read, is not mine: forgotten as a removal is (below).
      if(mine&&(shown._unlisted||!shown._unlocked))healCard(shown); // holding the key, left out of the list, or with no list to read: a join card again, so an admin's page lists us (healCard decides)
      if(shown&&shown.last)shown.last=await unsealPost(c,shown.last);done();
      if(dead||my!==seq||!subs.has(cid)){if(!dead)emit();return} // a newer copy arrived while unlocking this one
      if(c)absent.delete(cid);else absent.add(cid);
      settle(cid,pointerVerdict({exists:!!c,mine,held:!mine&&heldKey(cid)&&!codeWait(cid),fresh:fresh(cid)&&!rf}),shown);if(rf)refused.delete(cid)}, // codeWait asked only where the copy is not mine: the first ask starts its 30 days. No record after a refusal (rf, used up by the first copy after it): the chat was open here and is gone, not one whose sender is still writing it
    // A refusal may mean we were removed, or not let in yet, or only that the key this page offered was an old one (the
    // chat's key changed and the record kept here is not the newest): the server answers `denied` to all of them. It
    // says which in words, and the adapter keeps the one case that is certain: the right key, refused because this
    // account was removed (S.db.chatOut). Then the chat is forgotten at once, as it always was (a one-on-one chat
    // can't remove me, and a chat this device never held a key for waits). Any other refusal settles nothing and
    // deletes no note: the chat waits, out of the list, and retry looks at it again with a fresh copy of the record,
    // whose verdict (above) forgets it if this device held a key and cannot open the current one, or the server then
    // says the account was removed. A watch ended any other way says nothing about the chat: it stays in the list
    // and is looked at again. (After an eviction the adapter ends the watches `denied` for every answer to the
    // re-open but a rate limit, no answer in time or a lost connection, a server error among them: such a chat waits
    // out of the list like the others.)
    e=>{done();subs.delete(cid);if(e&&e.code==='denied'){refused.add(cid);settle(cid,pointerVerdict({exists:true,mine:false,held:!!S.db.chatOut&&S.db.chatOut(cid)&&heldKey(cid)&&!/^d/.test(cid)&&!codeWait(cid)}),null)}else{waiting.add(cid);emit()}}))}
  // A chat in the list rests on a note I wrote myself: the server sweeps other people's notes after 30 days. A note
  // someone else left (an invite, a DM), or one from before release 17, is replaced by my own once the chat shows, and
  // tidying then keeps the newest. A message request I haven't answered stays as it came.
  function adopt(cid,shown){const k=kept.get(cid),i=dmInfo(cid);if(!k||k.x.own===1||renoted.has(cid)||(i&&i.req==='in'))return;renoted.add(cid);
    const dm=typeOf(shown)==='dm';dropPointer(h,{t:dm?'dm':'invite',cid,from:h,type:typeOf(shown),peer:dm?(k.p.peer||k.p.from):undefined}).catch(()=>renoted.delete(cid))}
  function settle(cid,verdict,shown){
    if(verdict==='show'){waiting.delete(cid);codeWaitEnd(cid);docs.set(cid,shown);if(typeOf(shown)==='dm'){recordBase(shown);const pr=dmPeer(shown);if(pr&&S.contactsReady&&!dmInfo(cid))filed(()=>setDmInfo(cid,{peer:pr}))}adopt(cid,shown)} // every one-on-one chat filed under its person: the alias a key change relies on
    else if(verdict==='wait'){docs.delete(cid);waiting.add(cid);if(shown&&!heldKey(cid))noKeyNotice(shown,epochOf(shown))} // keep the pointer: a wrap for this device, or the record, may still arrive (the sheet about older messages only where this device never held the chat's key)
    else{waiting.delete(cid);docs.delete(cid);codeWaitEnd(cid);forget(cid)} // deleted, or we were removed: tidy the pointer away
    emit()}
  // Chats we hold a pointer for but could not show yet: look again now and then with a fresh copy of the record. A
  // watch that ended is started afresh; one still deferred is re-opened, which re-sends it once the chat opens.
  const retry=()=>{if(dead||!S.db||!S.db.refreshChat)return;
    for(const cid of [...waiting].slice(0,20)){if(![...ptrs.values()].some(p=>p&&p.cid===cid)){waiting.delete(cid);continue}
      waiting.delete(cid);waiting.add(cid); // twenty at a time, taking turns
      S.chatDocs.delete(cid);if(subs.has(cid))S.db.refreshChat(cid).catch(()=>{});else start(cid)}};
  const retryT=setInterval(retry,15000);S.recheckChats=retry; // keys came in from the backup: look now, not at the next tick
  return()=>{dead=true;S.invites=[];clearInterval(retryT);un();for(const cid of [...subs.keys()])drop(cid);S.chatGone=null}; // what it knew is of this account only
}
/* ---------- voice calls (SPEC.md 16.2) ----------
   One-on-one and audio only, and always through the operator's relay (TURN): this page gathers relay candidates only
   and takes only relay candidates from the other side, so neither person learns where the other is. There is no direct
   fallback: a server without a relay has no calls. Setup (offer, answer, end) is signed with the account key, sealed
   under the chat's current key and left as a record the server keeps in memory for a minute. What became of each call
   is left in the chat as one entry, an ordinary sealed and signed message the caller's page writes when the call is over.
   The sound itself is DTLS-SRTP between the two browsers, with fresh keys for every call. */
/* ===== HUSH CALL SDP BEGIN ===== */
// A session description with every candidate that isn't a relay's dropped and each relay candidate's note of where this
// side really is (raddr, rport) blanked. null unless a relay candidate is left and one DTLS fingerprint pins the call: a
// bundled audio+video description repeats the same a=fingerprint under each m= section, so identical values (case aside)
// count once, and two different values, two identities in one description, refuse it. At most 10000 characters: a browser's
// full audio+video description with its relay candidates is about 6000 and seals to about 1.5x, under the server's 16000.
// A relay candidate's address must be an IP literal: a name is looked up by the browser (system DNS, relay-only policy or
// not), which would tell whoever runs that name's DNS where the person called is. a=remote-candidates goes for the same reason.
const ipLit=a=>/^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/.test(a)
  ||(/^[0-9a-f:.]+$/i.test(a)&&a.includes(':')&&(()=>{try{return !!new URL('http://['+a+']')}catch{return false}})());
function relaySdp(sdp){
  if(typeof sdp!=='string'||sdp.length>10000||/\r(?!\n)/.test(sdp))return null;let relay=0;const fp=new Set();
  const out=sdp.split(/\r?\n/).filter(l=>{if(/^a=fingerprint:/i.test(l))fp.add(l.slice(14).trim().toLowerCase());if(/^a=remote-candidates/i.test(l))return false;if(!/^a=candidate:/i.test(l))return true;const t=l.split(' ');
      return t[6]==='typ'&&t[7]==='relay'&&/^(?:udp|tcp)$/i.test(t[2])&&ipLit(t[4])&&++relay>0})
    .map(l=>/^a=candidate:/i.test(l)?l.replace(/ raddr \S+ rport \S+/,' raddr 0.0.0.0 rport 0'):l);
  const m=out.filter(l=>/^m=/.test(l)),mOk=m.length<=2&&m.filter(l=>/^m=audio /.test(l)).length===1&&m.every(l=>/^m=(?:audio|video) /.test(l)); // one audio line and at most one video line (a declined one, port 0, too): no data channel, no second video decoder
  return relay&&fp.size===1&&mOk?out.join('\r\n'):null}
// The relay addresses in a description relaySdp passed, and the check on the other side's: each was offered to this device
// by the server in this call (the address this device used stands for a host the list writes as a name), and one of them is
// the relay this device used. Both ends then sit on one of this server's relays and nobody can steer a device to another,
// while a page that still gathers on every offered relay can talk to one that picked.
const relayIps=sdp=>[...new Set(sdp.split('\r\n').filter(l=>/^a=candidate:/i.test(l)).map(l=>l.split(' ')[4].toLowerCase()))];
const relayOk=(theirs,ours,offered)=>{const t=relayIps(theirs);return t.length>0&&ours.length>0&&t.every(a=>offered.includes(a)||ours.includes(a))&&ours.some(a=>t.includes(a))};
// The server may list two relays (SPEC 16.2), hosts in list order: the first the default, the second the Americas'. The caller
// picks by its own time zone and WebRTC gets that host's URLs alone; the callee follows the relay the offer's candidates
// name (its own zone's among them when an older caller offered every relay), so one relay sees a call and the server none of it.
const relayHost=u=>{const m=/^turns?:(\[[^\]]*\]|[^:?/]+)/i.exec(u);return m?m[1].replace(/^\[|\]$/g,'').toLowerCase():''};
const relayHosts=servers=>[...new Set(servers.flatMap(s=>[].concat(s.urls).map(relayHost)))];
const relayPick=(servers,tz,want)=>{const h=relayHosts(servers),zone=h[1]&&/^(?:America\/|Pacific\/Honolulu$)/.test(tz)?h[1]:h[0],host=want&&!want.includes(zone)&&h.find(x=>want.includes(x))||zone; // an offer on a relay the server never offered: the own pick, and relayOk ends the call
  return servers.map(s=>({...s,urls:[].concat(s.urls).filter(u=>relayHost(u)===host)})).filter(s=>s.urls.length)};
/* ===== HUSH CALL SDP END ===== */
/* ===== HUSH CALL LOG BEGIN ===== */
// The entry a call leaves in the chat: {kind, secs} in a message's body (buildBody), written by the caller's page alone.
// ended: answered, secs long. missed: no answer in 45 seconds. cancelled: the caller hung up before an answer.
const CALL_KINDS=['ended','declined','missed','cancelled','busy','failed'];
function callOutcome(k){const w=k.why,secs=k.t0?Math.max(0,Math.min(86400,Math.round((Date.now()-k.t0)/1000))):0; // k.was: the state it ended in; k.why: the reason given
  return Object.assign({kind:k.t0||(k.was==='connecting'&&!w)?'ended':['busy','declined','failed'].includes(w)?w:w==='no answer'?'missed':k.was==='calling'&&!w?'cancelled':'failed',secs},k.hadVideo?{video:1}:{})} // video: a camera was on, on either side, at some point
// A received entry: only this shape, and only in a one-on-one chat by one of its two people (ok). Anything else is a call of no known kind.
function callOf(x,ok,out,peer){const good=ok&&!!x&&typeof x==='object'&&CALL_KINDS.includes(x.kind)&&Number.isInteger(x.secs)&&x.secs>=0&&x.secs<=86400;
  return {kind:good?x.kind:'',secs:good&&x.kind==='ended'?x.secs:0,out:!!out,peer,video:good&&x.video===1?1:0}}
const callMissed=k=>!k.out&&['missed','cancelled','busy'].includes(k.kind); // busy: their phone was on another call and never rang
function callText(k){const d=k.secs?' \u00b7 '+fmtDur(k.secs):'',w=k.video?' video call':' call';
  return k.kind==='ended'?(k.out?'Outgoing':'Incoming')+w+d:k.kind==='failed'?'Call failed':!k.kind?'Voice call':callMissed(k)?'Missed'+w
    :k.kind==='declined'?(k.out?'Call declined':'Declined call'):k.kind==='busy'?displayName(k.peer)+' was busy':k.kind==='missed'?'No answer':k.kind==='cancelled'?'Cancelled call':'Voice call'}
/* ===== HUSH CALL LOG END ===== */
const callNow=()=>S.db&&S.db.now?S.db.now():Date.now(); // the server's clock, so two pages' clocks needn't agree
const callAD=(cid,rec)=>enc.encode('hush-call-v1|'+cid+'|'+rec),callSigData=(cid,e,body)=>enc.encode('hush-call-v1|'+cid+'|'+e+'|'+body);
const callPeerOk=h=>!!h&&!!S.me&&h!==S.me.handle&&!isBlocked(h)&&!isGone(h)&&!keyChanged(h);
const callable=c=>!!(c&&S.db&&S.me&&window.RTCPeerConnection&&typeOf(c)==='dm'&&!isSelf(c)&&isMember(c)&&epochOf(c)>=1&&!isRequest(c)&&!awaitingAccept(c)&&!isChatBlocked(c.id)&&callPeerOk(dmPeer(c)));
async function sendSignal(c,kind,k,extra){ // k: {id, peer}. Signed over everything, the chat and its epoch included, then sealed to the record's id
  const me=S.me.handle,sk=myKey('s'),e=epochOf(c),ck=await convKey(c,e);if(!ck)throw new Error('nokey');const ts=callNow(),rec=rid22(),iv=crypto.getRandomValues(new Uint8Array(12)); // who signs is fixed before any wait: an account switch may follow at once
  const body=JSON.stringify(Object.assign({v:1,callId:k.id,kind,from:me,to:k.peer,ts,exp:ts+(k.pushed||k.pushId?60e3:30e3)},extra||{})); // a minute when their closed iPhone is being woken for it (the app needs time to start), and for the answer of the iPhone that was woken: the caller may be re-subscribing when it lands
  const sg=b64(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},await sk,callSigData(c.id,e,body)));
  await S.db.doc(`channels/${c.id}/call/${rec}`).set({ts,iv:b64(iv),ct:b64(await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:callAD(c.id,rec)},ck.key,enc.encode(JSON.stringify({e,p:body,sg}))))});
}
async function openSignal(c,rec,v,mine){ // the setup message in a call record if every check holds, else null. mine: one my other device wrote
  try{const me=S.me.handle,peer=dmPeer(c),e=epochOf(c),ck=await convKey(c,e);if(!ck||!v||peer===me)return null;
    const o=JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(v.iv),additionalData:callAD(c.id,rec)},ck.key,unb64(v.ct))));
    if(!o||o.e!==e||typeof o.p!=='string')return null;const p=JSON.parse(o.p),now=callNow(),from=mine?me:peer;
    if(!p||p.v!==1||typeof p.callId!=='string'||!/^[0-9a-f]{32}$/.test(p.callId)||!['offer','answer','end','mark'].includes(p.kind)||p.from!==from||p.to!==(mine?peer:me))return null;
    if(!(Math.abs(now-p.ts)<60e3)||!(p.exp>now)||!(Math.abs(Date.now()-p.ts)<600e3)||((p.kind==='offer'||p.kind==='answer')&&typeof p.sdp!=='string')||(!mine&&!callPeerOk(peer)))return null;
    if([p.video,p.cam].some(x=>x!==undefined&&x!==0&&x!==1)||(p.why!==undefined&&p.why!=='net')||(p.kind==='mark'&&p.video===undefined))return null; // video: this side can do video (offer, answer) or its camera is on (mark); cam: the caller starts with its camera on; why: a camera turned off by a poor link // the server's clock (a minute, the life of a pushed offer; a plain one still dies at 30 s by its exp), and this device's own within 10 minutes: a lying server clock can't make an old offer new
    return await verifyBy(from,o.sg,callSigData(c.id,e,o.p),p.ts)===true?p:null; // the current key only: a replaced key never starts a call
  }catch{return null}}
const callRecs=new Set(),callSeen=new Set(),callSubs=new Map(),busySent=new Map();let callSubsOf=null,callSheet=null,ringT=null,ringAc=null;
const pushMark=k=>{if(S.pushCall||(S.call&&S.call.pushId))nat('mark',{k}).catch(()=>{})}; // a word on the pushed call's diag line (CallPush.mark): where the page got to. Only with a push, so only in the app, where nat exists; an older build refuses the method and nothing is lost
// The offers this account was shown on this device, for a day (the last 200): a reload empties callSeen, and the server
// could then hand an old offer back with its clock set to match.
function seenOffer(id){const key='hush:callSeen:'+S.me.handle,now=Date.now(),l=ls.get(key,[]),m=(Array.isArray(l)?l:[]).filter(x=>Array.isArray(x)&&x[1]>now-864e5);
  if(m.some(x=>x[0]===id))return true;m.push([id,now]);ls.set(key,m.slice(-200));return false}
const callSubsFor=h=>{if(callSubsOf!==h){callSubs.forEach(u=>{try{u()}catch{}});callSubs.clear();callSubsOf=h}}; // one account's watches at a time
const watchCalls=cid=>{if(!callSubs.has(cid))callSubs.set(cid,S.db.collection('channels/'+cid+'/call').orderBy('ts','desc').limit(50).onSnapshot(s=>onCallRecs(cid,s.docs.slice().reverse()),()=>callSubs.delete(cid)))}; // the newest 50, so a flood of records can't push a new one out of view; read oldest first, so a call's end comes after its offer
function syncCallWatch(){ // a live watch on the call records of each recent one-on-one chat, so a call rings with that chat closed
  if(!S.db||!S.me)return;callSubsFor(S.me.handle);
  const want=new Set(S.convs.filter(c=>typeOf(c)==='dm'&&!isSelf(c)&&epochOf(c)>=1&&!hiddenConv(c)&&!isRequest(c)).slice(0,90).map(c=>c.id));if(S.pushCall&&S.pushCall.cid)want.add(S.pushCall.cid); // with the chat list's own watches, inside the server's 600 a connection; a request, waiting or deleted, takes none of the 90 (it cannot call: callable); the chat the push was for stays watched whatever the list holds yet
  for(const [cid,u] of callSubs)if(!want.has(cid)){u();callSubs.delete(cid)}
  want.forEach(watchCalls)}
async function watchPushCall(){ // booted for a pushed call whose push carries the ticket's mark: that chat's call records are watched before the chat list is even asked for, so the offer is confirmed within the system screen's window
  const pc=S.pushCall,me=S.me;if(!pc||!pc.tag||!me||!me.dev||!me.dev.id||!S.db)return;const dev=me.dev.id;
  for(const [peer,d] of Object.entries(wakeP().issued)){if(!d[dev]||await tkKey(d[dev])!==pc.tag)continue;
    await loadDir([peer]).catch(()=>{});const cid=await dmIdFor(peer).catch(()=>null);if(!cid||S.me!==me||S.pushCall!==pc)return;
    if(!convById(cid)){const s=await S.db.preview(cid);if(!s.exists||S.me!==me)return;const c=chatRec(cid,s.data());S.chatDocs.set(cid,c);S.previews.set(cid,await showMeta(c))} // the chat as the server has it, until the list brings it
    pc.cid=cid;callSubsFor(me.handle);watchCalls(cid);return}}
async function onCallRecs(cid,docs,again){ // again: the one retry a record gets when the page could not judge it yet (its chat, the other person's keys or the chat key still loading)
  for(const d of docs){const key=cid+'/'+d.id;if(callRecs.has(key)||d.metadata.hasPendingWrites)continue;callRecs.add(key);
    const c=convById(cid),v=d.data();if(!S.me)continue;
    const p=c?await openSignal(c,d.id,v,false):null;
    if(!p&&!again&&!(c&&S.dir[dmPeer(c)]&&await Promise.resolve(convKey(c,epochOf(c))).catch(()=>null))){setTimeout(()=>{callRecs.delete(key);onCallRecs(cid,[d],true)},1500);continue} // not judged with everything in hand, so not dropped: the offer the page was woken for may be it
    if(!c)continue;if(p){onSignal(c,p);continue}
    const k=S.call,q=k&&k.dir==='in'&&k.cid===cid&&k.state==='ringing'&&await openSignal(c,d.id,v,true);
    if(q&&q.kind!=='offer'&&S.call===k&&q.callId===k.id&&k.state==='ringing')endCall('')}} // answered or declined on another of my devices
function onSignal(c,p){const k=S.call;
  if(p.kind==='offer'){const pushed=!!S.pushCall&&S.pushCall.cid===c.id;if(pushed)pushMark('offer');if(callSeen.has(p.callId)||!S.me)return;if(!callable(c)){if(pushed)pushMark('drop:callable');return}callSeen.add(p.callId);if(seenOffer(p.callId)){if(!pushed)return;pushMark('seen')} // a request, a blocked chat: no ring and no answer, and not marked seen either, so the same offer can ring once the chat has loaded. The offer in the chat the push named rings although this device stored its id: the page that stored it was replaced mid-ring (a reload), and that push's system screen rings this very call; the id stays recorded
    if(natOld('calls')){const t=busySent.get(p.from)||0;if(Date.now()-t>=60e3){busySent.set(p.from,Date.now());sendSignal(c,'end',{id:p.callId,peer:p.from},{reason:'old'}).catch(()=>{})}if(pushed){nat('stop',{push:S.pushCall.id}).catch(()=>{});pushCallOff()}return} // this build can't take the call: the caller is told why (one answer a minute to each person, as busy), and the system screen a push woke stops ringing
    if(k){const t=busySent.get(p.from)||0;if(Date.now()-t>=60e3){busySent.set(p.from,Date.now());sendSignal(c,'end',{id:p.callId,peer:p.from},{reason:'busy'}).catch(()=>{})}return} // at most one a minute to each person, so offers can't make this device sign on demand
    return ringIn(c,p)}
  if(p.kind==='end'&&!k&&S.pushCall&&S.pushCall.cid===c.id&&!callSeen.has(p.callId)&&!seenOffer(p.callId)){const pc=S.pushCall;setTimeout(()=>{if(S.pushCall===pc&&!S.call){nat('stop',{push:pc.id}).catch(()=>{});pushCallOff()}},1500);return} // the caller hung up before the offer the iPhone was woken for was even written: its system screen stops ringing. Only an end in the chat the push named (its tag) counts, so no other contact can stop a ring, and only after a moment, so an offer right behind it (a redial after a missed call) rings instead; an end for a call this device rang is nothing new
  if(!k||k.id!==p.callId||k.cid!==c.id||(k.dir==='out'&&k.tag&&p.tag!==k.tag))return; // once answered, only the device that answered can end it
  if(p.kind==='answer'){if(k.dir==='out'&&k.state==='calling')gotAnswer(k,p);return}
  if(p.kind==='mark'){if(k.dir==='out'?!k.tag||p.tag!==k.tag:!k.answerSent)return;return gotMark(k,p)} // the callee's carry the answer's tag, as an end does; the caller's count once this side has answered. A mark only changes what is shown: it never ends a call or starts a camera
  endCall(p.reason==='old'?displayName(k.peer)+'’s Hush needs an update to take calls.':p.reason==='busy'?displayName(k.peer)+' is on another call.':p.reason==='declined'?'Call declined':k.state==='ringing'?'Missed call from '+displayName(k.peer):'Call ended',p.reason)}
const callErr=e=>e&&e.code==='unavailable'?'Calls aren’t available yet.':e&&e.name==='NotAllowedError'?'Microphone access was blocked. Allow it for this page to make calls.':e&&e.name==='NotFoundError'?'No microphone was found.':e&&e.code==='norelay'?'Couldn’t reach the call relay. Try again.':'The call couldn’t start. Try again.';
const appOnly=()=>{const C=window.Capacitor;return !!(C&&C.isNativePlatform&&C.isNativePlatform())}; // Speaker is for the iPhone app, never a browser
const devWord=()=>{const u=navigator.userAgent;return /iPhone/.test(u)?'iPhone':/iPad/.test(u)||(/Mac/.test(u)&&navigator.maxTouchPoints>1)?'iPad':'iPhone'}; // the device the app runs on, for its settings copy: an iPad's web view reports a Mac's user agent (desktop content mode), and the touch points tell it from a Mac; an iPhone says so itself (its agent has "Mac OS X" too); anything else is the iPhone, as the copy always said
const natOk=()=>{const C=window.Capacitor;return appOnly()&&!!(C.isPluginAvailable&&C.isPluginAvailable('CallAudio'))}; // an app build with its own call audio
const natHas=m=>{const p=(window.Capacitor.PluginHeaders||[]).find(x=>x.name==='CallAudio');return !p||p.methods.some(x=>x.name===m)}; // Capacitor never answers a method the app build lacks (it only logs), so an older build's missing one is refused here
const nat=(m,o)=>natHas(m)?window.Capacitor.nativePromise('CallAudio',m,o||{}):Promise.reject(new Error('CallAudio.'+m+' is not in this app build'));
const NATIVE_API={calls:1,video:3,vpre:4}; // the oldest app build each feature works with (1: the build with the page-keeper, the first to list `mark`; 3: native video; 4: the caller's ringing preview); raised only in a page release after the build it needs is on every phone
const natApi=()=>{const b=window.hushBuild;if(b&&Number.isInteger(b.api)&&b.api>=0&&b.api<1e6)return b.api;return natOk()&&natHas('mark')?1:0}; // a build from before hushBuild is read from the methods it lists
const natOld=f=>appOnly()&&natApi()<NATIVE_API[f]; // the app is too old for this feature: a notice, and the feature refused rather than failing in silence
const natVideo=()=>natOk()&&natApi()>=NATIVE_API.video&&natHas('setVideo'); // the app's own call audio can carry video (by its declared level: a missing CallAudio header reads as "every method" to natHas)
const natPre=()=>natVideo()&&natApi()>=NATIVE_API.vpre; // setVideo takes preview: the camera runs at once, nothing is sent until a plain On after the answer
const UPDATE_URL='https://beta.itunes.apple.com/v1/app/6822849203'; // the app's TestFlight page (its numeric Apple id); the App Store link, apps.apple.com/app/id6822849203, at launch
const sysName=h=>ls.get('hush:hideCallName',false)?'Hush call':displayName(h); // the name on the iPhone's call screen and lock screen
const tkKeys=new Map(),tkKey=tk=>tkKeys.get(tk)||tkKeys.set(tk,crypto.subtle.digest('SHA-256',enc.encode('hush-wake-name'+tk)).then(b64u)).get(tk); // a ticket's key id (CONTRACT.md revision 2): the name table's key, and what pending() reports for the push that matched it. The ticket itself rings the phone and never goes to Apple; the push carries only a per-push mark derived from this key
const pushRing=k=>nat('update',{id:k.pushId,name:sysName(k.peer),...(k.rcam?{video:true}:{})}).then(r=>!!(r&&r.ringing),()=>false).then(on=>{if(!on&&S.call===k&&k.state==='ringing')ring(true)}); // the system screen rings the pushed call, named; if that call is gone already, the page rings it
async function natMedia(k,iceServers){ // the app's own WebRTC plays the call (earpiece first, a real Speaker); signalling, sealing and the relay checks stay in this page
  const gl=[],pc={iceGatheringState:'new',iceConnectionState:'new',connectionState:'new',localDescription:null,addEventListener:(t,f)=>{if(t==='icegatheringstatechange')gl.push(f)},
    createOffer:()=>nat('createOffer'),createAnswer:()=>nat('createAnswer'),setLocalDescription:d=>nat('setLocalDescription',{type:d.type,sdp:d.sdp}),setRemoteDescription:d=>{let s=d.sdp;if(d.type==='offer'&&!natVideo()){const x=sdpStripVideo(s);if(x){k.vcut=x.cut;s=x.sdp}}return nat('setRemoteDescription',{type:d.type,sdp:s})}, // a browser's offer with its video line: the plugin gets it without (it refuses any line but audio) and the answer declines the line (state below)
    close:()=>{nat('stop',{user:!!k.byUser}).catch(()=>{}).finally(()=>h.remove())}}; // End from this side: iOS is asked to end its call; any other end is reported to it as the far side's
  const h=window.Capacitor.addListener('CallAudio','state',st=>{if(!st)return;if(st.ended==='user'&&S.call===k)return hangUp(''); // ended from the iPhone's own call controls: the other side is told, as with End
    if('push' in st||'answered' in st)return; // pushed-call news carries no call state
    if(st.sdp)pc.localDescription={sdp:k.vcut?sdpRejectVideo(st.sdp,k.vcut):st.sdp};if(st.ringback&&k.dir==='out'&&k.state==='calling')ring(false); // the app plays the ringback now, on the call's own audio
    const g=st.gathering!==pc.iceGatheringState,i=st.ice!==pc.iceConnectionState,c=st.conn!==pc.connectionState;pc.iceGatheringState=st.gathering;pc.iceConnectionState=st.ice;pc.connectionState=st.conn;
    if(g)gl.forEach(f=>f());if(i&&pc.oniceconnectionstatechange)pc.oniceconnectionstatechange();if(c&&pc.onconnectionstatechange)pc.onconnectionstatechange();
    if(st.video&&S.call===k)natVState(k,st.video);
    if(S.call===k&&(!!st.speaker!==k.speaker||(st.callkit&&!!st.muted!==k.muted))){k.speaker=!!st.speaker;if(st.callkit)k.muted=!!st.muted;callUi()}}); // the keys follow the phone; mute only once the iPhone holds the call, so a mute from dialling stands
  const nv=natVideo();if(nv)k.vt={nat:true}; // the plugin owns the video line and draws both pictures; the page keeps the keys, the marks and where the pictures go
  try{await nat('start',{iceServers,name:sysName(k.peer),incoming:k.dir==='in',...(k.pushId?{pushed:true}:{}),...(nv?{video:true,videoCall:!!(k.dir==='out'?k.camWant:camAsked(k))}:{})})}catch(e){h.remove();throw Object.assign(new Error((e&&e.message)||'start'),{name:e&&e.code==='NotAllowedError'?'NotAllowedError':'Error'})}
  k.nat=true;if(S.call===k)callUi();
  const t={kind:'audio',stop(){},get enabled(){return !k.muted},set enabled(v){nat('setMuted',{on:!v}).catch(()=>{})}};
  return {pc,stream:{getTracks:()=>[t],getAudioTracks:()=>[t]}}}
const newCall=(o)=>Object.assign({pc:null,stream:null,audio:null,muted:false,speaker:false,t0:0,timers:[]},o);
const callTimer=(k,ms,state,fn)=>k.timers.push(setTimeout(()=>{if(S.call===k&&k.state===state)fn()},ms));
const callFail=()=>hangUp('The call couldn’t connect.','failed');
const lateQ=[],callModeOver=()=>S.pushCall||S.call?new Promise(r=>lateQ.push(r)):Promise.resolve(); // boot work that can wait while the page came up for a pushed call (healLogin, presence, minting, key healing) runs once the call is over or call mode has lapsed
const pushCallOff=()=>{S.pushCall=null;document.documentElement.classList.remove('call-mode');if(!S.call)lateQ.splice(0).forEach(r=>r())}; // call mode over: the call screen no longer needs to rise above a waiting PIN lock
const pushLive=id=>{const pc=S.pushCall={id,at:Date.now()};document.documentElement.classList.add('call-mode');if(lockGate){lockGate();lockGate=null}if(S.db)S.db.probe(3000);setTimeout(()=>{if(S.pushCall===pc)pushCallOff()},60e3); // a push heard by a running page, handled like a boot: the socket may have died while the app slept, so it is tested at once; the pushed chat is watched first, and the push lives a minute
  nat('pending').then(r=>{if(S.pushCall===pc&&r&&r.id===pc.id&&typeof r.tag==='string'&&r.tag){pc.tag=r.tag;return watchPushCall()}}).catch(()=>{})};
async function startCall(c,o={}){ // o.cam: "Video call", the caller's camera on from the start
  if(S.call||!callable(c))return;
  if(natOld('calls')){toastErr('Update Hush to make calls.');return}
  const k=S.call=newCall({id:hexOf(crypto.getRandomValues(new Uint8Array(16))),cid:c.id,peer:dmPeer(c),dir:'out',state:'calling',camWant:!!o.cam,vwait:!!o.cam&&(natOk()?natPre():videoCan())});ring(true,true);callUi(); // the ringback starts inside the tap, so iPhone lets it play; vwait: the video look from the tap, until this side's camera shows or fails
  const tks=heldWake(k.peer);k.pushed=tks.length>0;tks.forEach(tk=>S.db.wake(tk)); // their closed iPhone is woken in the tap itself, while the offer is still being built, so it rings seconds sooner: the offer lives a minute and the ring lasts 60 s, not 30 and 45
  try{await callMedia(k,await S.db.callRelay(c.id));if(k.camWant&&k.vt&&!k.vt.nat)await camOn(k);else if(k.camWant&&k.vt&&natPre())camOnNat(k,true);await k.pc.setLocalDescription(await k.pc.createOffer()); // the app's camera waits for the answer (gotAnswer): its plugin holds a camera until the call's audio is on, which needs this offer
    const sdp=await callGather(k);if(S.call!==k)return;k.ips=relayIps(sdp);const cam=k.cam||k.camWant&&k.vt&&k.vt.nat?1:0;k.markSent=cam;
    await sendSignal(c,'offer',k,Object.assign({sdp},k.vt?{video:1}:{},cam?{cam:1}:{}));k.sent=true;if(S.call!==k){logCall(k);return sendSignal(c,'end',k).catch(()=>{})} // hung up while the offer was on its way
    callTimer(k,k.pushed?60e3:45e3,'calling',()=>hangUp('No answer','no answer'))}
  catch(e){if(S.call===k)hangUp(callErr(e),'failed')}}
function ringIn(c,p){const sdp=relaySdp(p.sdp);
  if(!sdp)return; // an offer with no usable relay candidate is never rung, nor answered
  const k=S.call=newCall({id:p.callId,cid:c.id,peer:p.from,dir:'in',state:'ringing',offer:sdp,rcam:p.cam===1&&videoCan()?1:0,ocam:p.cam===1&&videoCan(),vwant:p.video===1}),pushed=!!S.pushCall&&Date.now()-S.pushCall.at<60e3; // the offer the iPhone was woken for: its system screen rings already, so it gets the caller's name and the page adds no second ringtone
  if(pushed){k.pushId=S.pushCall.id;S.pushCall=null;pushRing(k)}else ring(true);callUi();
  callTimer(k,pushed?60e3:45e3,'ringing',()=>endCall('Missed call from '+displayName(k.peer)))} // a pushed offer lives a minute
async function acceptCall(){const k=S.call,c=k&&convById(k.cid);if(!k||k.state!=='ringing')return;if(!c||!callable(c))return hangUp('','failed');
  ring(false);k.state='connecting';k.tag=hexOf(crypto.getRandomValues(new Uint8Array(8)));callUi();
  try{await callMedia(k,await S.db.callRelay(k.cid));await k.pc.setRemoteDescription({type:'offer',sdp:k.offer});if(k.vwant&&videoCan())vAnswer(k);await k.pc.setLocalDescription(await k.pc.createAnswer());
    const sdp=await callGather(k);if(S.call!==k)return;
    if(!relayOk(k.offer,relayIps(sdp),k.offered))return callFail(); // checked once this side knows its relay; the offer's addresses were already literals, so nothing was looked up
    await sendSignal(c,'answer',k,Object.assign({sdp,tag:k.tag},k.vok?{video:1}:{}));k.answerSent=true;sendMark(k);if(k.vok&&k.ocam){k.rmarkAt=Date.now();if(camAsked(k))camOn(k,true);else toast('Your camera is off. Tap Video to turn it on.')}if(k.pushId)pushMark('sent');callTimer(k,20e3,'connecting',callFail)} // a video call is answered with this side's camera off, whatever the caller's
  catch(e){if(k.pushId)pushMark('fail:'+String((e&&(e.code||e.name))||'x').toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,16));if(S.call===k)hangUp(callErr(e),'failed')}}
async function gotAnswer(k,p){const sdp=relaySdp(p.sdp);if(!sdp||!relayOk(sdp,k.ips||[],k.offered))return callFail();
  ring(false);k.state='connecting';k.tag=typeof p.tag==='string'?p.tag:'';k.vok=!!k.vt&&p.video===1;if(!k.vok)k.hadVideo=false;if((k.cam||k.camWant&&k.vt&&k.vt.nat)&&!k.vok){camOff(k);toast('Video isn’t available on this call.')}callUi();callTimer(k,20e3,'connecting',callFail); // video only when both sides said they can
  try{await k.pc.setRemoteDescription({type:'answer',sdp});if(k.vok){videoCaps(k);if(k.vt.nat&&k.camWant&&(!k.cam||k.cam.pre))camOnNat(k);else sendMark(k)}}catch{if(S.call===k)callFail()}} // the app's "Video call": its camera now (the offer said on already; a camera that fails sends the off mark)
async function callMedia(k,r){ // the microphone, and a connection that may only ever use the relay
  if(S.call!==k)throw new Error('ended');if(!r||!Array.isArray(r.iceServers)||!r.iceServers.length)throw Object.assign(new Error('unavailable'),{code:'unavailable'});
  const srv=relayPick(r.iceServers,Intl.DateTimeFormat().resolvedOptions().timeZone,k.offer&&relayIps(k.offer));k.offered=relayHosts(r.iceServers);k.relay=relayHosts(srv)[0]; // the relay this call allocates on: the caller's own zone picks, the callee has the offer
  const m=natOk()?await natMedia(k,srv):null,stream=m?m.stream:await navigator.mediaDevices.getUserMedia({audio:true});if(S.call!==k){stream.getTracks().forEach(t=>t.stop());if(m)m.pc.close();throw new Error('ended')}
  k.stream=stream;const pc=k.pc=m?m.pc:new RTCPeerConnection({iceServers:srv,iceTransportPolicy:'relay',bundlePolicy:'max-bundle'});stream.getTracks().forEach(t=>{t.enabled=!k.muted;if(!m)pc.addTrack(t,stream)}); // muted while dialling: it opens muted. One transport for every line: one relay allocation a side
  if(!m&&k.dir==='out'&&videoCan()){k.vt=pc.addTransceiver('video',{direction:'sendrecv'});vPrefs(k.vt)} // the video line, there from the start with no camera on it: turning video on later needs no new offer
  pc.ontrack=e=>{if(S.call!==k||e.track.kind!=='audio')return;if(!k.audio){k.audio=el('audio');k.audio.id='callAudio';k.audio.autoplay=true;document.body.append(k.audio)}k.audio.srcObject=e.streams[0]||new MediaStream([e.track])};
  pc.oniceconnectionstatechange=()=>{if(S.call!==k)return;const s=pc.iceConnectionState;
    if((s==='connected'||s==='completed')&&k.state==='connecting'){k.state='live';k.t0=Date.now();if(!k.nat)k.statT=setInterval(()=>callStats(k),1000);else if(k.vt&&k.vt.nat)k.statT=setInterval(()=>natVStats(k),1000);callUi()}else if(s==='failed')callFail()};
  pc.onconnectionstatechange=()=>{if(S.call!==k)return;const s=pc.connectionState;clearTimeout(k.dropT); // gone quiet for 5 seconds on end, or closed: over, here at least
    if(s==='closed')endCall('Call ended');else if(s==='disconnected')k.timers.push(k.dropT=setTimeout(()=>{if(S.call===k&&pc.connectionState==='disconnected')endCall('Call ended')},5e3))}}
function callGather(k){const pc=k.pc; // the whole description once, after the relay has answered (no trickling), with anything but relay candidates gone
  return new Promise(res=>{let t=null;const done=()=>{if(pc.iceGatheringState==='complete'){clearTimeout(t);res()}};t=setTimeout(res,8000);pc.addEventListener('icegatheringstatechange',done);done()})
    .then(()=>{const sdp=relaySdp(pc.localDescription&&pc.localDescription.sdp);if(!sdp)throw Object.assign(new Error('norelay'),{code:'norelay'});return sdp})}
/* ===== HUSH CALL VIDEO BEGIN ===== */
// Video rides one line every browser call carries from the start with no camera on it: on is a camera track on that line's
// sender, off is no track and the camera stopped (its light out), and a sealed `mark` record tells the other side which
// (SPEC.md 16.2). No second offer, ever. In a video call both cameras come on (the caller's for "Video call", the callee's as it answers one); in a voice call only a tap turns one on.
const videoCan=()=>appOnly()?natVideo():!!(window.RTCRtpTransceiver&&RTCRtpTransceiver.prototype.setCodecPreferences&&navigator.mediaDevices&&navigator.mediaDevices.getUserMedia); // a browser that can choose codecs, or an app build with native video (NATIVE_API.video)
// The iPhone app's plugin, on every build before native video (NATIVE_API.video), refuses a description with any line but
// audio. Its page takes a browser's audio+video offer by handing the plugin the offer without its video section, and the
// plugin's answer on with that section declined (port 0, the JSEP way to refuse a line): the call goes ahead as voice.
// shortcut: the shim goes when every phone runs a build with native video (setVideo)
function sdpSecs(s){const head=[],secs=[];for(const l of s.split(/\r?\n/)){if(!l)continue;if(l.startsWith('m='))secs.push([l]);else (secs.length?secs[secs.length-1]:head).push(l)}return {head,secs}}
const sdpJoin=(head,secs)=>[...head,...secs.flat()].join('\r\n')+'\r\n';
function sdpStripVideo(sdp){const {head,secs}=sdpSecs(sdp),at=secs.findIndex(s=>s[0].startsWith('m=video '));if(at<0)return null;
  const v=secs[at],mid=(v.find(l=>l.startsWith('a=mid:'))||'a=mid:').slice(6),pt=v[0].split(' ')[3]||'0';
  return {sdp:sdpJoin(head.map(l=>l.startsWith('a=group:BUNDLE ')?l.split(' ').filter(x=>x!==mid).join(' '):l),secs.filter((_,i)=>i!==at)),
    cut:{at,lines:['m=video 0 UDP/TLS/RTP/SAVPF '+pt,'c=IN IP4 0.0.0.0','a=inactive','a=mid:'+mid,...v.filter(l=>l.startsWith('a=rtpmap:'+pt+' '))]}}}
function sdpRejectVideo(sdp,cut){const {head,secs}=sdpSecs(sdp);secs.splice(cut.at,0,cut.lines);return sdpJoin(head,secs)}
function vPrefs(t){try{const c=RTCRtpReceiver.getCapabilities('video').codecs,f=x=>x.sdpFmtpLine||'',h=c.filter(x=>/^video\/h264$/i.test(x.mimeType)&&/profile-level-id=42e01f/i.test(f(x))&&/packetization-mode=1/.test(f(x))),v=c.filter(x=>/^video\/vp8$/i.test(x.mimeType));
  if(h.length||v.length)t.setCodecPreferences([...h,...v,...c.filter(x=>/^video\/rtx$/i.test(x.mimeType))])}catch{}} // H.264 baseline first (hardware on phones and Macs), VP8 the one fallback, and their resends: a short description, and no software-only codec forced on a phone
function vAnswer(k){if(k.vt&&k.vt.nat){k.vok=true;k.markSent=0;return} // the app: the plugin takes the offer's line itself (start said video)
  const t=k.pc.getTransceivers().find(x=>x.receiver&&x.receiver.track&&x.receiver.track.kind==='video');if(!t)return;t.direction='sendrecv';vPrefs(t);k.vt=t;k.vok=true;k.markSent=0} // the callee takes the offer's video line, its camera still off
const vCell=()=>{const c=navigator.connection;return !!c&&c.type==='cellular'}; // only some browsers say; the rest count as Wi-Fi
async function videoCaps(k){const s=k.vt&&k.vt.sender;if(!s||!s.track)return; // what this side sends is capped whatever the far side asks: 1080p up to 4 Mbit/s to an H.264 decoder that takes it (level 4.0), else 720p up to 2.5 Mbit/s, 2 Mbit/s on a mobile network (where the browser says so), 360p at 300 kbit/s on a TCP relay path, 30 frames a second, stepping down size and rate together on a weak link
  for(const dp of [true,false])try{const p=s.getParameters();if(!p.encodings||!p.encodings.length)return;const fm=((p.codecs||[])[0]||{}).sdpFmtpLine||'',lv=parseInt((/profile-level-id=[0-9a-f]{4}([0-9a-f]{2})/i.exec(fm)||[])[1],16)||0,cell=vCell(),top=k.tcp?360:!cell&&lv>=40?1080:720,h=(s.track.getSettings().height)||1080;Object.assign(p.encodings[0],{maxBitrate:k.tcp?3e5:top===1080?4e6:cell?2e6:25e5,maxFramerate:k.tcp?24:30,scaleResolutionDownBy:Math.max(1,h/top)});if(dp)p.degradationPreference='balanced';else delete p.degradationPreference;await s.setParameters(p);return}catch{}}
function sendMark(k){clearTimeout(k.markT);const go=()=>{k.markT=null;const c=convById(k.cid),v=k.cam?1:0;if(S.call!==k||!k.vok||!c||v===k.markSent||(k.dir==='in'&&!k.answerSent))return;k.markSent=v;k.markAt=Date.now(); // at most one a second and none without a change: the server counts them with the other call records; a callee's mark waits for its answer: the caller only takes marks carrying the answer's tag.
  sendSignal(c,'mark',k,Object.assign({video:v},!v&&k.netOff?{why:'net'}:{},k.dir==='in'&&k.tag?{tag:k.tag}:{})).catch(()=>{})};const w=1000-(Date.now()-(k.markAt||0));if(w>0)k.markT=setTimeout(go,w);else go()}
function gotMark(k,p){const was=k.rcam;k.rcam=p.video;k.rnet=!p.video&&p.why==='net';if(p.video&&!was)k.rmarkAt=Date.now();if(k.rnet)toast(displayName(k.peer)+'’s video is off: poor connection');if(p.video&&!k.vl)callUi();else vSync(k)}
// The app's camera, through the plugin: the same consent (this side's tap, a video call's start, or the one automatic try again after a
// poor link turned it off), and a stand-in track so camOff, endCall and the marks treat it as a browser's.
async function camOnNat(k,pre){k.camBusy=true;k.camNo=false; // pre: the caller's ringing preview (the camera on this screen only; a plain On after the answer puts it on the line)
  try{const r=await nat('setVideo',Object.assign({on:true,facing:k.facing==='environment'?'back':'front'},pre?{preview:true}:{}));if(S.call!==k||!k.vok&&(!pre||k.state!=='calling')||k.camNo){nat('setVideo',{on:false}).catch(()=>{});return} // the plugin starts a camera only once the audio runs, after the answer: no video in it, no camera
    if(!(r&&r.on===true)){if(pre)k.camWant=false;else if(k.cam&&k.cam.pre)camOff(k);toastErr('The camera couldn’t start.');return} // the plugin's word decides: no stand-in camera and no "on" mark unless it says the camera runs
    k.facing=r&&r.facing==='back'?'environment':'user';k.cam={nat:true,pre:!!pre,stop:()=>{nat('setVideo',{on:false}).catch(()=>{})},getSettings:()=>({facingMode:k.facing})};k.netOff=false;k.cams=2;if(pre)return;k.hadVideo=true;k.camAt=Date.now();k.vflow=false;k.vs=[];
    if(!ls.get('hush:videoNote',false)){ls.set('hush:videoNote',true);toast('Video calls can use 2 to 4 GB of data an hour.')}}
  catch(e){if(pre)k.camWant=false;else if(k.cam&&k.cam.pre)camOff(k);if(S.call===k&&!k.camNo)toastErr(e&&(e.code==='NotAllowedError'||e.name==='NotAllowedError')?'Camera access is off for Hush. Turn it on in Settings to send video.':'The camera couldn’t start.')}
  finally{k.camBusy=false;k.vwait=false;if(S.call===k){sendMark(k);callUi()}}}
function natVState(k,v){k.nrem=v.remote;k.nloc=v.local;if(v.remote==='live')k.rseen=Date.now();if(v.local==='off'&&k.cam&&k.cam.nat)camOff(k);else if(v.local&&v.local!=='off'&&!k.cam&&!k.camBusy)nat('setVideo',{on:false}).catch(()=>{});vSync(k)} // a camera this page did not turn on is turned off at once // the plugin's news: the far side's frames (live, stalled, none), and this side's camera gone (taken by another app); paused (the app in the background) needs no mark: the far side sees "Paused"
async function camOn(k,auto){if(k.cam||k.camBusy||!k.vt)return;if(k.vt.nat)return camOnNat(k);k.camBusy=true;k.camNo=false;let tr=null;
  try{tr=(await navigator.mediaDevices.getUserMedia({video:Object.assign({width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:30}},k.camDev?{deviceId:{exact:k.camDev}}:{facingMode:{ideal:k.facing||'user'}})})).getVideoTracks()[0];
    if(S.call!==k||k.camNo)throw new Error('ended');
    await k.vt.sender.replaceTrack(tr);if(S.call!==k)throw new Error('ended');k.cam=tr;k.hadVideo=true;k.netOff=false;k.camAt=Date.now();k.vflow=false;k.vs=[];tr.onended=()=>{if(S.call===k&&k.cam===tr)camOff(k)};videoCaps(k); // the camera went away (unplugged, taken by another app): video off; the call is checked again after the attach: it may have ended meanwhile, and the catch then stops the track.
    if(k.camNo)return camOff(k); // turned off while it started
    k.cams=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput').length;
    if(!ls.get('hush:videoNote',false)){ls.set('hush:videoNote',true);toast('Video calls can use 2 to 4 GB of data an hour.')}}
  catch(e){if(tr&&k.cam!==tr)tr.stop();if(S.call===k&&!k.camNo&&!(auto&&e&&/^(NotFound|Overconstrained)Error$/.test(e.name)))toastErr(e&&e.name==='NotAllowedError'?'Camera access was blocked. Allow it for this page to send video.':'The camera couldn’t start.')}
  finally{k.camBusy=false;k.vwait=false;if(S.call===k){sendMark(k);callUi()}}}
function camOff(k,why){const tr=k.cam;if(!tr)return;k.cam=null;if(tr.pre)k.camWant=false;k.netOff=why==='net';tr.onended=null;try{k.vt.sender.replaceTrack(null).catch(()=>{})}catch{}tr.stop();if(k.lvEl)k.lvEl.srcObject=null;sendMark(k);if(S.call===k)callUi()} // stopped, not disabled: a disabled track still sends black frames and keeps the light on
async function camFlip(k){const old=k.cam;if(!old||k.camBusy)return;
  if(old.nat){try{const r=await nat('switchCamera');if(k.cam===old)k.facing=r&&r.facing==='back'?'environment':'user'}catch{}return vSync(k)} // the app turns its own camera round: no new track, no mark
  const s=old.getSettings();
  if(s.facingMode){k.facing=s.facingMode==='user'?'environment':'user';k.camDev=null}else{const d=(await navigator.mediaDevices.enumerateDevices()).filter(x=>x.kind==='videoinput');if(d.length<2||k.cam!==old)return;k.camDev=d[(d.findIndex(x=>x.deviceId===s.deviceId)+1)%d.length].deviceId} // turned off (or flipped) while the list came: leave it as the person left it
  k.cam=null;old.onended=null;old.stop();await camOn(k)} // one camera open at a time (iOS Safari allows no more), so the old one stops first; no mark: the picture just changes
const camAsked=k=>!!k.ocam&&(!k.sys||k.sysSeen); // the callee answered a video call it was shown as one: on this page, or on the system screen once it said video
const vWait=k=>!!k.vwait&&!!k.camWant&&!k.cam&&(k.state==='calling'||k.state==='connecting'); // the video look from the tap while this side's camera is still wanted and not yet showing
const callVideoToggle=k=>!k.vt?(k.camWant=!k.camWant,callUi()):k.cam?(k.camNo=!!k.camBusy,camOff(k)):k.camBusy?(k.camNo=true,k.netOff=false,k.state==='calling'&&(k.camWant=false),k.vt.nat&&nat('setVideo',{on:false}).catch(()=>{}),callUi()):k.state==='calling'&&k.vt.nat?(k.camWant=!k.camWant,k.camWant&&natPre()?camOnNat(k,true):callUi()):camOn(k); // while the app's call rings out a tap changes what the caller wants (and its preview with it): the camera goes on the line after the answer
// The rule that turns video off on a poor link, over one sample a second while the camera sends (newest last), naming what
// fired: the last 10 all under 150 kbit/s out while the bandwidth holds the encoder back, or all under 5 (nothing gets through)
// ('kbps': a still face on a good link sends little and is never held back), the last 6 all over 10 % lost ('loss'), or the last 10 held to 180 pixels or fewer by
// the bandwidth ('small'); '' while the link carries video.
function videoHealth(s){const a=s.slice(-6),b=s.slice(-10);
  return b.length===10&&b.every(x=>x.kbps<150&&(x.lim||x.kbps<5))?'kbps':a.length===6&&a.every(x=>x.loss>.1)?'loss':b.length===10&&b.every(x=>x.lim&&x.h>0&&x.h<=180)?'small':''}
// One sample a second while the camera is on (x null: no figure yet), timed from the camera's start or the call going live: the
// rule judges only once video has flowed and 5 s have passed; a camera that never got any out in 10 s is off with no poor-link word and no try again.
function vSample(k,x){const t=Date.now()-Math.max(k.camAt||0,k.t0||0);if(x&&x.kbps>=20)k.vflow=true;
  if(!k.vflow){if(t>=10e3){vDropNote('nostart',[]);camOff(k);toast('Video couldn’t start on this call.')}return}
  if(t<5e3||!x)return;k.vs=(k.vs||[]).concat(x).slice(-10);const w=videoHealth(k.vs);if(w){vDropNote(w,k.vs);k.vs=[];camOff(k,'net');toast('Video off: poor connection')}}
const vDropNote=(w,s)=>ls.set('hush:vdrop',{t:Date.now(),w,s:s.map(x=>[Math.round(x.kbps),Math.round(x.loss*100),x.h,x.lim?1:0])}); // the last drop's rule and figures for Settings → Advanced: numbers only, nothing that names a call or a person
const callLevel=(rtt,jit,loss)=>Math.max(rtt>=600?2:rtt>=300?1:0,jit>=150?2:jit>=60?1:0,loss>=.08?2:loss>=.02?1:0); // 0 good, 1 fair, 2 poor
function callQuality(st,lv){if(st.q===undefined)return {q:lv,c:lv,n:0};if(lv===st.q)return {q:st.q,c:lv,n:0};const n=lv===st.c?st.n+1:1;return n>=4?{q:lv,c:lv,n:0}:{q:st.q,c:lv,n}} // the dot moves only once a new level has held for 4 seconds
async function callStats(k){if(S.call!==k||!k.pc||k.nat)return;let r;try{r=await k.pc.getStats()}catch{return}if(S.call!==k)return; // once a second in a live browser call: the dot, the far side's frames, the drop rule
  const now=Date.now(),g={};r.forEach(s=>{const kd=s.kind||s.mediaType;
    if(s.type==='outbound-rtp'&&kd==='video')g.vo=s;else if(s.type==='inbound-rtp'&&kd==='video')g.vi=s;else if(s.type==='inbound-rtp'&&kd==='audio')g.ai=s;
    else if(s.type==='remote-inbound-rtp'&&kd==='video')g.rv=s;else if(s.type==='candidate-pair'&&s.state==='succeeded'&&(s.nominated||s.selected))g.cp=s});
  const p=k.sp||{},dt=Math.max(1,now-(p.t||now-1000)),cur={t:now,vb:g.vo?g.vo.bytesSent:0,vf:g.vi?g.vi.framesDecoded:0,al:g.ai?g.ai.packetsLost:0,ar:g.ai?g.ai.packetsReceived:0};k.sp=cur;
  const lc=g.cp&&r.get(g.cp.localCandidateId),tcp=!!lc&&/^(?:tcp|tls)$/.test(lc.relayProtocol||'');if(tcp!==!!k.tcp){k.tcp=tcp;videoCaps(k)}
  if(cur.vf>(p.vf||0))k.rseen=now;
  const al=Math.max(0,cur.al-(p.al||0)),ar=Math.max(0,cur.ar-(p.ar||0)),loss=al+ar?al/(al+ar):0,rtt=g.cp&&g.cp.currentRoundTripTime!=null?g.cp.currentRoundTripTime*1000:0,jit=g.ai&&g.ai.jitter!=null?g.ai.jitter*1000:0;
  k.qs=callQuality(k.qs||{},callLevel(rtt,jit,loss));const q=document.getElementById('callQ');if(q){const w=['good','fair','poor'][k.qs.q];q.dataset.q=w;q.setAttribute('aria-label','Connection: '+w)}
  if(k.cam)vSample(k,g.vo&&p.t?{kbps:(cur.vb-(p.vb||0))*8/dt,loss:g.rv&&g.rv.fractionLost||0,h:g.vo.frameHeight||0,lim:g.vo.qualityLimitationReason==='bandwidth'}:null);
  else if(!k.cam&&k.netOff&&!k.resumed){k.rs=(k.rs||[]).concat({loss,rtt}).slice(-10);if(k.rs.length===10&&k.rs.every(x=>x.loss<=.1&&x.rtt<600)){k.resumed=true;k.rs=[];camOn(k)}} // one automatic try again a call, after 10 s of a usable link
  vSync(k)}
async function natVStats(k){if(S.call!==k||!k.vok)return;let r;try{r=await nat('stats')}catch{return}if(S.call!==k)return; // the app's numbers once a second: the far side's frames and the same drop rule as in a browser
  const o=r&&r.vOut,now=Date.now();if(k.nrem==='live')k.rseen=now;
  if(k.cam&&!k.cam.pre){if(k.nloc==='paused'){k.camAt=now;k.vs=[]}else vSample(k,o&&o.kbps!=null?{kbps:+o.kbps||0,loss:+o.loss||0,h:+o.h||0,lim:o.limit==='bandwidth'}:null)} // in the background the camera is paused: no judgement, and the warm-up starts again on return
  else if(!k.cam&&k.netOff&&!k.resumed){k.rs=(k.rs||[]).concat({loss:o?+o.loss||0:0,rtt:+(r&&r.rttMs)||0}).slice(-10);if(k.rs.length===10&&k.rs.every(x=>x.loss<=.1&&x.rtt<600)){k.resumed=true;k.rs=[];camOn(k)}}
  vSync(k)}
// Picture in picture in the app: the far side's picture in a small window of its own while Hush is in the background, only
// while it is live and nothing stands over the call; a rotation or a resize moves the native pictures with the page's.
document.addEventListener('visibilitychange',()=>{const k=S.call;if(!k||!k.vt||!k.vt.nat||!k.vok)return;const on=document.hidden&&vUp(k)&&vRemote(k)==='live';if(on!==!!k.pip){k.pip=on;nat('setPip',{on}).catch(()=>{})}});
addEventListener('resize',()=>{if(S.call)vLayout(S.call)});
// The picture: one layer behind the call screen's text and keys, the far side's video filling it and this side's in a corner.
function dragCorner(n,tap,always){let s=null; // a small picture dragged to a corner; a tap without a drag is the tap
  n.addEventListener('pointerdown',e=>{if(!always&&!n.classList.contains('small'))return;s={x:e.clientX,y:e.clientY,m:false};try{n.setPointerCapture(e.pointerId)}catch{}e.stopPropagation()});
  n.addEventListener('pointermove',e=>{if(!s)return;const dx=e.clientX-s.x,dy=e.clientY-s.y;if(Math.abs(dx)+Math.abs(dy)>8)s.m=true;if(s.m)n.style.transform=`translate(${dx}px,${dy}px)`});
  n.addEventListener('pointerup',()=>{if(!s)return;const m=s.m;s=null;const r=n.getBoundingClientRect();n.style.transform='';if(!m){if(tap)tap();return}requestAnimationFrame(()=>vLayout(S.call));n._dragged=Date.now();n.dataset.corner=(r.top+r.height/2<innerHeight/2?'t':'b')+(r.left+r.width/2<innerWidth/2?'l':'r')});
  n.addEventListener('pointercancel',()=>{s=null;n.style.transform=''})}
function vEls(k){if(k.vl)return k.vl;const mk=c=>{const v=el('video',c);v.autoplay=v.playsInline=v.muted=true;v.disableRemotePlayback=true;v.setAttribute('playsinline','');v.dataset.corner='tr';v.addEventListener('resize',()=>vFit(v));return v}; // no controls: nothing here records, saves or casts a call
  k.vl=el('div','call-video');k.rvEl=mk('v-remote');k.lvEl=mk('v-local');k.vnote=el('div','v-note');for(const v of [k.rvEl,k.lvEl])dragCorner(v,()=>{k.swap=!k.swap;vSync(k)});k.vl.append(k.rvEl,k.lvEl);return k.vl}
const vRemote=k=>{if(!k.vok||!k.rcam)return 'off';const t=Date.now();return k.rseen&&t-k.rseen<3000?'live':t-Math.max(k.rseen||0,k.rmarkAt||0)>=3000?'paused':'off'}; // the far side's camera by its mark, shown by its frames: three seconds without one while the mark says on is "Paused", never "off"
const vFit=v=>{const a=v.videoWidth/v.videoHeight,s=v.clientWidth/v.clientHeight;v.classList.toggle('fill',a>0&&s>0&&Math.min(a/s,s/a)>=.7)}; // fill when the shapes are close (a phone's 9:16 on a phone), the whole picture otherwise (a 4:3 webcam, a phone held sideways), as the app's plugin does
function vSync(k){if(!k||!k.vl||S.call!==k)return;const r=vRemote(k),lv=!!k.cam,w=vWait(k),pre=w||lv&&r!=='live'&&(k.state==='calling'||k.state==='connecting'||!!k.rcam&&Date.now()-(k.t0||0)<3000),sw=pre||!!k.swap&&lv&&r==='live'; // pre: this side's own picture fills the screen until the far side's arrives
  if(k.vt&&!k.vt.nat&&!k.rvEl.srcObject)k.rvEl.srcObject=new MediaStream([k.vt.receiver.track]);
  if(lv&&!k.cam.nat&&(k.lvEl.srcObject&&k.lvEl.srcObject.getVideoTracks()[0])!==k.cam){k.lvEl.srcObject=new MediaStream([k.cam]);const f=k.cam.getSettings().facingMode;k.lvEl.classList.toggle('mirror',!f||f==='user')} // the front camera's preview as a mirror; what is sent is never mirrored
  k.vl.classList.toggle('rv',r==='live');k.vl.classList.toggle('lv',lv);k.vl.classList.toggle('pre',pre);k.rvEl.classList.toggle('small',sw);k.lvEl.classList.toggle('small',!sw);vFit(k.rvEl);vFit(k.lvEl);
  k.vnote.textContent=r==='paused'?'Paused':k.rnet&&!k.rcam?'Video off: poor connection':'';if(r==='live')k.hadVideo=true;
  if(callSheet){callSheet.sh.classList.toggle('vid',r==='live'||sw);callSheet.sh.classList.toggle('vcall',r==='live'||lv||w);callSheet.sh.classList.toggle('vwait',w)}if(k.mini&&k.state!=='ringing')vThumb(k);
  for(const v of [k.rvEl,k.lvEl])if(v.srcObject&&v.paused)v.play().catch(()=>{});vLayout(k)}
// In the app the plugin draws both pictures natively BEHIND the web view, at the rectangles the page gives for its two (empty)
// video elements; the call screen's background is cleared only while one shows. Nothing is drawn while anything stands above
// the call screen (a lock, a sheet, the photo viewer) or while it is minimized: those paint opaque, and the plugin is told
// to take the pictures away too.
const vCovered=()=>{const own=callSheet&&callSheet.sh.closest('.backdrop');return [...document.querySelectorAll('.lock,.backdrop,.lightbox,.onboard')].some(x=>x!==own&&(parseInt(getComputedStyle(x).zIndex,10)||0)>=20)}; // the call-mode lock (19) stands below the call screen (20) by design
const vBox=e=>{const b=e&&e.getBoundingClientRect();return b&&b.width&&b.height?{x:Math.round(b.left),y:Math.round(b.top),w:Math.round(b.width),h:Math.round(b.height)}:null};
const vUp=k=>S.call===k&&!!callSheet&&callSheet.sh.isConnected&&!k.mini&&!vCovered()&&!!k.vl; // the full call screen shows, with nothing above it: the only time native pictures are drawn or go to picture in picture
function vLayout(k){if(!k||!k.vt||!k.vt.nat)return;const up=vUp(k);
  const lay={remote:up&&vRemote(k)==='live'?vBox(k.rvEl):null,local:up&&k.cam?vBox(k.lvEl):null},j=JSON.stringify(lay);
  document.documentElement.classList.toggle('call-native-video',!!(lay.remote||lay.local));
  if(j!==k.lay){k.lay=j;nat('setLayout',lay).catch(()=>{})}
  if(!up&&k.pip){k.pip=false;nat('setPip',{on:false}).catch(()=>{})}}
function vThumb(k){let th=document.getElementById('callThumb');if(!k.vl||vRemote(k)!=='live'||(k.vt&&k.vt.nat)){if(th)th.remove();return} // the app has its own picture in picture (setPip): its pictures are native, not in this page // minimized, the far side's video floats in a corner above the chat; a tap brings the call back
  if(!th){th=el('button');th.id='callThumb';th.dataset.corner='br';th.setAttribute('aria-label','Back to the video call with '+displayName(k.peer));dragCorner(th,null,true);th.onclick=()=>{if(Date.now()-(th._dragged||0)<400)return;k.mini=false;callUi()};document.body.append(th)}
  if(k.rvEl.parentNode!==th){k.rvEl.classList.remove('small');th.append(k.rvEl);k.rvEl.play().catch(()=>{})}}
function vDrop(k){for(const v of [k.rvEl,k.lvEl])if(v){v.srcObject=null;v.remove()}if(k.vl)k.vl.remove();const th=document.getElementById('callThumb');if(th)th.remove();
  if(k.vt&&k.vt.nat){document.documentElement.classList.remove('call-native-video');if(k.lay!=='{"remote":null,"local":null}')nat('setLayout',{remote:null,local:null}).catch(()=>{});if(k.pip)nat('setPip',{on:false}).catch(()=>{});k.pip=false}} // the call is over: no picture left behind the web view
/* ===== HUSH CALL VIDEO END ===== */
function hangUp(msg,reason){const k=S.call,c=k&&convById(k.cid);if(!k)return;if(!reason)k.byUser=true; // ended on purpose from this side (End, leaving the page), not a failure
  if(c&&(k.sent||k.pushed||k.dir==='in'))sendSignal(c,'end',k,Object.assign(reason?{reason}:{},k.tag&&k.dir==='in'?{tag:k.tag}:{})).catch(()=>{});endCall(msg,reason)} // pushed: their iPhone was woken in the tap, so even before the offer the end goes out and stops its ring
function endCall(msg,why){const k=S.call;if(!k)return;S.call=null;k.was=k.state;k.why=why||'';k.state='ended';ring(false);pushCallOff();k.timers.forEach(clearTimeout);logCall(k);
  try{if(k.stream)k.stream.getTracks().forEach(t=>t.stop())}catch{}try{if(k.cam)k.cam.stop()}catch{}k.cam=null;clearInterval(k.statT);clearTimeout(k.markT);vDrop(k); // the camera's light goes out with the call
  try{if(k.pc)k.pc.close();else if(k.pushId)nat('stop',{push:k.pushId}).catch(()=>{})}catch{}if(k.audio){k.audio.srcObject=null;k.audio.remove()} // a pushed call that only rang: its system screen stops ringing too
  callUi();if(msg)toast(msg)}
function logCall(k){ // the call's entry in the chat, once, from the page that placed it: an ordinary message, so the server can't tell it from one
  if(k.dir!=='out'||!k.sent||k.logged||k.quiet||!S.me||!convById(k.cid))return;k.logged=true;sendBody(k.cid,buildBody({call:callOutcome(k)})).catch(()=>{})}
function ring(on,back){ // a soft two-note ring, and a tap where the phone has one, while a call waits to be answered.
  // back: the caller's ringback instead, the standard 440 + 480 Hz tone, 2 s on and 4 s off
  clearInterval(ringT);ringT=null;if(ringAc){ringAc.close().catch(()=>{});ringAc=null}if(!on)return;
  const beep=()=>{if(!back)haptic(true);try{ringAc=ringAc||new (window.AudioContext||window.webkitAudioContext)();if(ringAc.state!=='running')ringAc.resume().catch(()=>{}); // the microphone starting can pause it on iPhone
    const t=ringAc.currentTime;(back?[[440,0,2],[480,0,2]]:[[440,0,.4],[554,.4,.4]]).forEach(([f,d,l])=>{const o=ringAc.createOscillator(),g=ringAc.createGain();o.frequency.value=f;g.gain.setValueAtTime(0,t+d);g.gain.linearRampToValueAtTime(.06,t+d+.05);
      if(back)g.gain.setValueAtTime(.06,t+d+l-.1);g.gain.linearRampToValueAtTime(0,t+d+l-.05);o.connect(g).connect(ringAc.destination);o.start(t+d);o.stop(t+d+l)})}catch{}};
  beep();ringT=setInterval(beep,back?6000:2500)}
const minimizeSwipe=(dx,dy)=>dy>80&&dy>Math.abs(dx)*1.5; // a downward drag, clearly more down than sideways
let callLayer=null;const callNav=on=>{if(on&&!callLayer){const l={kind:'call',alive:()=>callLayer===l,close:()=>{},stay:true,under:true};callLayer=NAV.open(l)}else if(!on&&callLayer){const l=callLayer;callLayer=null;NAV.closed(l)}}; // minimized: Back closes what is above, then is absorbed, never leaving the site mid-call
function callSpeakerToggle(k){nat('setSpeaker',{on:!k.speaker}).then(r=>{if(S.call===k){k.speaker=!!(r&&r.speaker);callUi()}},()=>{})}
function callMuteToggle(k){k.muted=!k.muted;if(k.stream)k.stream.getAudioTracks().forEach(t=>{t.enabled=!k.muted});callUi()}
function callUi(){ // one screen in three states: calling out, ringing in, and in the call (data-state on #callSheet)
  const k=S.call;refreshHeader();renderList(); // the call's chat row reads "In a call" while it is live
  let bar=document.getElementById('callBar');if(bar)clearInterval(bar.tick);
  const root=document.documentElement.classList;
  if(!k){if(callSheet){clearInterval(callSheet.tick);callSheet.close();callSheet=null}if(bar)bar.remove();root.remove('call-mini','call-full');callNav(false);return}
  if(k.mini&&k.state!=='ringing'){const fromFull=!!callSheet;
    if(callSheet){clearInterval(callSheet.tick);if(callSheet.sh.isConnected)callSheet.close();callSheet=null}
    root.add('call-mini');root.remove('call-full');callNav(true);if(!bar){bar=el('div');bar.id='callBar';bar.setAttribute('role','region');bar.setAttribute('aria-label','Call in progress');document.body.append(bar)}
    const main=el('button','cb-main'),tm=el('span','cb-time'),mu=html('button','cb-mute',k.muted?I.barMicOff:I.barMic),sp=k.nat?html('button','cb-spk',I.barSpk):null,en=html('button','cb-end',I.barEnd); // Speaker only with the app's own call audio, as on the full screen
    main.setAttribute('aria-label','Back to the call with '+displayName(k.peer));tm.id='callBarTime';const sub=html('span','cb-sub',I.barLock);sub.append(tm);const txt=el('div','cb-txt');txt.append(el('span','cb-name',displayName(k.peer)),sub);main.append(userAvatar(k.peer,'sm'),txt);main.onclick=()=>{k.mini=false;callUi()};
    if(k.state==='live'){const tick=()=>{tm.textContent=fmtDur((Date.now()-k.t0)/1000)};tick();bar.tick=setInterval(tick,1000)}else tm.textContent=k.state==='calling'?'Calling…':'Connecting…';
    mu.setAttribute('aria-label','Mute');mu.setAttribute('aria-pressed',String(k.muted));mu.onclick=()=>callMuteToggle(k);if(sp){sp.setAttribute('aria-label','Speaker');sp.setAttribute('aria-pressed',String(k.speaker));sp.onclick=()=>callSpeakerToggle(k)}
    const cm=k.cam?html('button','cb-cam',I.callVideo):null;if(cm){cm.setAttribute('aria-label','Turn camera off');cm.onclick=()=>camOff(k)} // minimized, this side's camera keeps sending: the bar says so and turns it off
    en.setAttribute('aria-label','End call');en.onclick=()=>hangUp('');bar.replaceChildren(...[main,mu,cm,sp,en].filter(Boolean));vThumb(k);vLayout(k);if(fromFull)main.focus();return}
  const hadBar=!!bar;if(bar)bar.remove();root.remove('call-mini');root.add('call-full');
  if(!callSheet||!callSheet.sh.isConnected){callSheet=sheet('Voice call',{locked:true});callSheet.sh.id='callSheet';
    // shortcut: no drag preview, add if the owner asks
    let p0=null;callSheet.sh.addEventListener('touchstart',e=>{p0=e.target.closest('.call-btn,video.small')?null:{x:e.touches[0].clientX,y:e.touches[0].clientY}},{passive:true}); // dragging the small picture is not a swipe
    callSheet.sh.addEventListener('touchmove',e=>{const c=S.call;if(!p0||c!==k||c.state==='ringing')return;const t=e.touches[0];if(minimizeSwipe(t.clientX-p0.x,t.clientY-p0.y)){p0=null;c.mini=true;callUi()}},{passive:true})}
  const {body,sh}=callSheet,name=displayName(k.peer),who=el('div','call-who'),st=el('div','call-status'),keys=el('div','call-keys'),big=el('div','call-big'),ctl=el('div','call-ctl'),e2e=html('div','call-e2e',I.lock);sh.dataset.state=k.state;clearInterval(callSheet.tick);
  e2e.append('End-to-end encrypted');st.id='callStatus';who.append(userAvatar(k.peer,'xl'),withBadge(el('div','info-name',name),k.peer),st);
  sh.setAttribute('aria-label',(k.vok||k.rcam||vWait(k)?'Video call with ':'Voice call with ')+name);
  if(k.state==='live'&&!k.nat){const q=el('span','call-q'),w=['good','fair','poor'][(k.qs||{}).q||0];q.id='callQ';q.dataset.q=w;q.setAttribute('role','img');q.setAttribute('aria-label','Connection: '+w);e2e.append(q)} // filled in once a second by callStats
  const btn=(row,id,cls,icon,label,fn)=>{const b=html('button','call-btn '+cls,icon);b.id=id;b.append(el('span',null,label));b.onclick=fn;row.append(b);return b}; // round key, label under it; keys holds Mute and, with stage 3, Speaker
  if(k.state==='ringing'){st.textContent=k.rcam?'Incoming video call':'Incoming voice call';btn(big,'callDecline','end',I.callPhone,'Decline',()=>hangUp('','declined'));btn(big,'callAccept','ok',I.callPhone,'Accept',acceptCall)}
  else{if(k.state==='live'){const tick=()=>{st.textContent=fmtDur((Date.now()-k.t0)/1000)};st.id='callTime';tick();callSheet.tick=setInterval(tick,1000)}else st.textContent=k.state==='calling'?'Calling…':'Connecting…';
    const m=btn(keys,'callMute',k.muted?'key on':'key',k.muted?I.callMicOff:I.callMic,k.muted?'Muted':'Mute',()=>callMuteToggle(k));m.setAttribute('aria-pressed',String(k.muted));m.setAttribute('aria-label','Mute'); // from the moment of dialling: before the microphone is open, only k.muted changes, and callMedia applies it
    if(k.nat)btn(keys,'callSpeaker',k.speaker?'key on':'key',I.callSpeaker,'Speaker',()=>callSpeakerToggle(k)).setAttribute('aria-pressed',String(k.speaker)); // only with the app's own call audio: WebKit's keeps iPhone calls on the loudspeaker whatever the page asks (measured 2026-10-20)
    if((k.vt||k.vwait&&k.state==='calling')&&(k.vok||k.state==='calling')){const on=!!k.cam||!!k.camBusy&&!k.camNo||k.state==='calling'&&(!k.vt||!!k.vt.nat)&&!!k.camWant,v=btn(keys,'callVideo','key'+(on?' on':''),on?I.callVideo:I.callVideoOff,'Video',()=>callVideoToggle(k));v.setAttribute('aria-pressed',String(on));v.setAttribute('aria-label','Video');keys.classList.add('v');
      if(k.cam&&k.cams>1)btn(keys,'callFlip','key',I.callFlip,'Flip',()=>camFlip(k)).setAttribute('aria-label','Flip camera')}
    btn(big,'callEnd','end',I.callPhone,'End',()=>hangUp(''))}
  const th=document.getElementById('callThumb');if(th)th.remove();const vl=k.vt||k.vwait?vEls(k):null;if(vl&&k.rvEl.parentNode!==vl)vl.prepend(k.rvEl); // back from the floating picture
  if(vl)who.append(k.vnote);ctl.append(keys,big);body.replaceChildren(...(vl?[vl]:[]),e2e,who,ctl);vSync(k);
  if(k.state!=='ringing'){const mn=html('button','icon-btn call-min',I.down);mn.setAttribute('aria-label','Minimize call');mn.onclick=()=>{k.mini=true;callUi()};body.prepend(mn);if(hadBar)mn.focus()}} // first in Tab order, as on screen
addEventListener('pagehide',()=>{if(S.call)hangUp('')}); // closing or leaving the page ends the call
// The account is leaving this page (logged out, replaced or deleted): its call ends before anything else, and leaves no
// entry. sign: say so to the other side, while the account's keys are still here; else end it here only.
function callOff(sign){const k=S.call;if(!k)return;k.quiet=true;if(sign)hangUp('');else endCall('')}
/* ===== HUSH WAKE BEGIN ===== */
/* Ringing when the app is closed, the page side. An iPhone build that can be woken registers its push address (push.set)
   and mints one random wake ticket per contact it can call (wake.mint), sent to each as an ordinary sealed message
   {wake:{d,t}} that is never shown: to the server it is a message like any other (in a chat with a message timer it expires
   like any other too, and the same ticket is sent again once it has). A caller presents the tickets it holds for the
   callee to POST /wake, anonymously, as the offer goes out. Both sides keep theirs in the vault, so every device of the
   account has them: issued[peer][myDevice]=ticket, issuedAt[peer][myDevice]=when its message was last sent (issuedM and
   issuedAtM for message tickets), held[peer][theirDevice]={t,ts}. A browser, or today's app, has no pushToken and no ticket to send, and behaves as before.
   A message ticket (kind m, {wake:{d,m}}, issuedM[peer][myDevice], held[peer][theirDevice].m) works the same way for a
   "New message" banner, minted only while the account's "Message notifications on this iPhone" setting is on, and
   presented by sendBody when the person is not online. */
const TK_RE=/^[A-Za-z0-9_-]{22}$/,DEV_RE=/^[a-zA-Z0-9]{6,20}$/;
const wakeP=()=>P().wake||(P().wake={issued:{},held:{},issuedM:{},issuedAt:{},issuedAtM:{}});
const heldWake=(peer,k='t')=>Object.values(wakeP().held[peer]||{}).map(x=>x[k]).filter(Boolean).slice(0,4);
const msgPushOn=id=>!!ls.get('hush:msgPush:'+id.handle,ls.get('hush:msgPushDev',false)); // an account with no setting of its own yet takes this iPhone's last choice, so a log-out and a sign-in keep the banners
function wakeOf(w){ // the vault's copy, checked field by field like the rest of the settings
  const tk=t=>typeof t==='string'&&TK_RE.test(t),m=(o,ok)=>Object.fromEntries(Object.entries(o&&typeof o==='object'?o:{}).filter(([h,v])=>validHandle(h)&&v&&typeof v==='object').map(([h,v])=>[h,Object.fromEntries(Object.entries(v).filter(([d,x])=>DEV_RE.test(d)&&ok(x)))]).filter(([,v])=>Object.keys(v).length));
  return {issued:m(w&&w.issued,tk),issuedM:m(w&&w.issuedM,tk),issuedAt:m(w&&w.issuedAt,Number.isFinite),issuedAtM:m(w&&w.issuedAtM,Number.isFinite),held:m(w&&w.held,x=>!!x&&Number.isFinite(x.ts)&&(x.t===undefined||tk(x.t))&&(x.m===undefined||tk(x.m))&&(x.t!==undefined||x.m!==undefined))}} // shortcut: an older page saving the vault drops issuedM and issuedAt, so this page mints or sends again; the duplicates are harmless
function noteWake(c,p,w){ // a ticket in a message: kept only from the other person in a one-on-one chat, under their device; null takes it back
  if(typeOf(c)!=='dm'||isSelf(c)||!S.me||p.from===S.me.handle||p.from!==dmPeer(c)||!S.contactsReady||S.vaultOk===false)return;
  if(!DEV_RE.test(w.d)||![w.t,w.m].every(v=>v==null||TK_RE.test(v))||(w.t===undefined&&w.m===undefined))return;
  const H=wakeP().held,h=H[p.from]||{},old=h[w.d]||{},n=Object.assign({},old);
  for(const k of ['t','m'])if(w[k]!==undefined&&!(old.ts>p.ts&&old[k]!==undefined)){if(w[k]===null)delete n[k];else n[k]=w[k]} // each kind on its own word, and history opens in any order: a newer word about that kind wins
  if(n.t===old.t&&n.m===old.m)return;n.ts=Math.max(old.ts||0,p.ts);
  if(n.t===undefined&&n.m===undefined)delete h[w.d];else h[w.d]=n;
  const ds=Object.keys(h);if(ds.length>4)delete h[ds.sort((a,b)=>h[a].ts-h[b].ts)[0]]; // their four newest phones at most: the vault is not theirs to fill
  if(Object.keys(h).length)H[p.from]=h;else delete H[p.from];saveContacts()}
function revokeWake(h,kinds=['issued','issuedM']){ // blocked, removed or deleted: the tickets this account gave them stop ringing us; theirs are kept, so they can still be called later. The caller saves
  const W=P().wake;if(!h||!W)return;
  for(const k of kinds){const mine=W[k][h]||{};delete W[k][h];if(S.db)for(const tk of Object.values(mine))S.db.wakeRevoke({tk}).catch(()=>{})}} // shortcut: a revoke lost to the network is not retried; that ticket rings this device until they are blocked again
function muteWake(c,on){ // a muted person's messages never nudge this account's iPhones: their message tickets are taken back; unmuted, the next mint pass hands out new ones. The caller saves
  if(!c||typeOf(c)!=='dm'||isSelf(c))return;if(on)revokeWake(dmPeer(c),['issuedM']);else{wakeMinted.delete(S.me.handle);mintWake()}}
function nudge(c,body){ // a message in a one-on-one chat: the person's closed iPhones say "New message" through the tickets they gave this account. No online check: iOS shows nothing while the app is in front, and presence stays "online" up to 75 s after the app is closed
  if(typeOf(c)!=='dm'||isSelf(c))return;const o=body[0]==='\u0001'?JSON.parse(body.slice(1)):{text:body};
  if(o.text||(o.media&&o.media.length)||o.poll)heldWake(dmPeer(c),'m').forEach(tk=>S.db.wake(tk))} // a call's outcome or a ticket is no news
let namesSent=''; // the table as the plugin last got it
async function syncNames(){ // the name the system screen shows for the first ring, by the key id of each ticket this device issued: the plugin keeps it outside the web view, since the page isn't up yet when the ring starts. Sent after the settings load, a mint, a revoke or a rename (each saves), and when the name setting changes
  if(!natOk()||!S.me||!S.me.dev||!S.me.dev.id||!S.contactsReady)return;const me=S.me,dev=me.dev.id,map={},mine=Object.entries(wakeP().issued).filter(([,d])=>d[dev]),hide=ls.get('hush:hideCallName',false);
  if(!hide)await loadDir(mine.map(([h])=>h)).catch(()=>{});if(S.me!==me)return;for(const [peer,d] of mine)map[await tkKey(d[dev])]=hide?'':displayName(peer); // named as the chat list names them: a saved contact's name, else the directory's. Names hidden: every key stays with an empty name, so the ring says "Hush call" and the page still learns which chat the push was for
  const j=JSON.stringify(map);if(S.me!==me||j===namesSent)return;namesSent=j;nat('names',{map}).catch(()=>{})} // an older build has no table: nothing to do
const wakeMinted=new Set(); // accounts this page has minted for: one pass per load, and a failed one waits for the next load
let minting=null; // one pass at a time: a pass asked for while one runs (unmute, the toggle) follows it, so no contact is minted twice; a second ticket nobody tracks could not be taken back
function mintWake(){if(minting){minting.again=true;return minting}
  const p=minting=mintPass().catch(()=>{}).then(()=>{minting=null;if(p.again){wakeMinted.delete(S.me&&S.me.handle);return mintWake()}});return p}
async function mintPass(){ // an iPhone build only: a ticket from this device for every contact I can call who has none from it yet, each sent as an unseen message; with message notifications on, a message ticket too, for everyone not muted. In a chat with a message timer the ticket's message expires with the timer, so the same ticket is sent again once it has (at most once a load)
  if(!natOk()||!S.db||!S.me||!S.me.dev||!S.me.dev.id||!S.contactsReady||S.vaultOk===false||!S.convsLoaded||S.pushCall||wakeMinted.has(S.me.handle))return; // not while the page is up for a pushed call: run again once that is over
  const me=S.me,dev=me.dev.id,W=wakeP(),A=W.issuedAt||(W.issuedAt={}),AM=W.issuedAtM||(W.issuedAtM={}),gone=(c,T)=>c.ttl>0&&((T[dmPeer(c)]||{})[dev]||0)+c.ttl*1000<Date.now(); // a timed chat whose message carrying this kind of ticket has expired since it was last sent
  const need=(I,T,ok)=>S.convs.filter(c=>callable(c)&&c.last&&ok(c)&&(!(I[dmPeer(c)]||{})[dev]||gone(c,T))).slice(0,20); // shortcut: a chat with no message yet gets its ticket once one is sent, and the 21st contact waits for the next load (the server mints 20 a call, 200 a device)
  const todo=[['t',W.issued,A,need(W.issued,A,()=>true)],['m',W.issuedM,AM,msgPushOn(me)?need(W.issuedM,AM,c=>!isMuted(c.id)):[]]].filter(x=>x[3].length);
  wakeMinted.add(me.handle);if(!todo.length)return;
  for(const [f,I,T,list] of todo){const fresh=list.filter(c=>!(I[dmPeer(c)]||{})[dev]);let tickets=[];
    if(fresh.length)try{tickets=(await S.db.wakeMint({dev,n:fresh.length,k:f==='t'?'c':'m'})).tickets||[]}catch{continue}
    for(const c of list){const peer=dmPeer(c),had=(I[peer]||{})[dev],t=had||tickets.shift();if(!t)continue;
      if(S.me!==me||!(await sendBody(c.id,buildBody({wake:{d:dev,[f]:t}}),c.last.ts-1,true).then(()=>true,()=>false))){if(!had)S.db.wakeRevoke({tk:t}).catch(()=>{});continue} // dated just before the latest message, so it never becomes the chat's latest and nothing moves or shows; a new ticket undelivered is taken back, a re-sent one waits for the next load
      if(!had)(I[peer]=I[peer]||{})[dev]=t;(T[peer]=T[peer]||{})[dev]=Date.now()}}
  if(S.me===me)saveContacts()}
const pushAddr=(id,kind)=>nat(kind==='alert'?'alertToken':'pushToken').then(r=>{if(S.me!==id||!r||typeof r.tok!=='string'||!/^[0-9a-f]{64}$/i.test(r.tok))throw new Error('token');
  return S.db.pushSet({dev:id.dev.id,tok:r.tok.toLowerCase(),env:r.env==='sandbox'?'sandbox':'prod',kind})}); // one kind of push address from the plugin, handed to the server under this device
function registerPush(id){ // an iPhone build that can be rung while closed hands the server its push address; today's build has no pushToken and does nothing
  if(!natOk()||!S.db||!id.dev||!id.dev.id)return;
  pushAddr(id,'voip').then(()=>ls.set('hush:pushDev:'+id.handle,id.dev.id)).catch(()=>{});
  if(msgPushOn(id))pushAddr(id,'alert').catch(()=>{})} // the alert address follows the account in use: the server keeps one account per token
async function setMsgPush(on){ // the setting's toggle, the server first so a failure leaves the toggle telling the truth: on registers this iPhone's alert address and hands out message tickets; off drops the address, and the tickets already out go quiet with it
  const me=S.me;if(on)await pushAddr(me,'alert');else await S.db.pushClear({dev:me.dev.id,kind:'alert'});
  ls.set('hush:msgPush:'+me.handle,on);ls.set('hush:msgPushDev',on);if(on){wakeMinted.delete(me.handle);mintWake()}}
/* ===== HUSH WAKE END ===== */
/* ---------- boot ---------- */
// The app's launch logo goes the moment the first screen is painted: the chat list's shell (renderList), a lock gate (showLock,
// showPwLock), the sign-up (showOnboard) or the retry sheet (storeRetry), or 2.5 s into the boot whatever has been reached. The
// SplashScreen plugin's own launchShowDuration is only the cap; the hide fades 150 ms, at once with Reduce Motion. Once: S.boot
// keeps when and why, for Settings → Advanced. A browser has no logo and nothing to do.
const splashOff=why=>{if(S.boot)return;S.boot={at:performance.now(),why};const rm=matchMedia('(prefers-reduced-motion:reduce)').matches,C=window.Capacitor;
  try{if(appOnly()&&(C.PluginHeaders||[]).some(p=>p.name==='SplashScreen'))C.nativePromise('SplashScreen','hide',{fadeOutDuration:rm?0:150}).catch(()=>{})}catch{}};
function start(id){
  if(S.call){S.call.quiet=true;hangUp('')} // a call belongs to the account it was placed from, and leaves no entry: the next account would sign it
  try{navigator.storage&&navigator.storage.persist&&navigator.storage.persist().catch(()=>{})}catch{}
  S.me=id;ls.set('hush:active',id.handle);S.contacts=[];S.contactsReady=false;rebuildNames();trimPrev(id);S.rekeying=!!(id.prev&&rekeyPending(ls.get('hush:rekey:'+id.handle,null))); // a removal left half done resumes below; until then nothing republishes the old keys
  ensureDev(id).catch(()=>{});dmIds.clear();S.dmPeers={};S.chatDocs.clear();metaCache.clear();dmIdFor(id.handle).catch(()=>{}); // metaCache: each ometa read again, so this account's roles record notes it (noteRoles), one a switch away cut short included
  if(S.unsubConvs)S.unsubConvs();S.unsubConvs=null;
  Object.assign(S,{convs:[],seenLast:new Map(),convsLoaded:false,unread:new Map(),unreadKey:new Map(),unreadRedo:null,mentions:new Map(),showArchived:false});S.previews.clear();S.liveSum=new Set(); // liveSum: the summary rows the live list has drawn in this start (renderList)
  closeConv();setListTitle();renderCalls();if(S.tab==='profile')setTab('profile');
  if(!S.db)return;
  const onConvs=(list,fromCache)=>{
    if(S.convsLoaded)list.forEach(c=>{const l=c.last,prev=S.seenLast.get(c.id)||0;
      if(l&&l.ts>prev&&l.from!==S.me.handle){
        if(isArchived(c.id)&&!isMuted(c.id))toggleArchive(c.id,false,true);
        if(isRequest(c)){if(!isDeclined(c))setTimeout(showRequestAlert,50)}else if(c.id!==S.chan||document.hidden)notifyNew(c)}});
    list.forEach(c=>{S.seenLast.set(c.id,c.last?c.last.ts:0);S.previews.delete(c.id);noteTtl(c)});
    const firstLoad=!S.convsLoaded;S.convs=list;if(!fromCache)S.convsLoaded=true;pinAll();refreshDir();
    if(firstLoad&&S.convsLoaded&&S.db.flat)setTimeout(()=>{callModeOver().then(()=>list.filter(c=>typeOf(c)==='dm').reduce((p,c)=>p.then(()=>healKeys(c)),Promise.resolve())).catch(()=>{})},1500); // after the call, if the page came up for a pushed one
    if(S.contactsReady)list.forEach(c=>{if(c.last&&!c.last.svc)noteAccepted(c.id,[c.last])});
    list.forEach(c=>{const l=c.last;if(l&&!l.svc&&callsChat(c))openPost(c,l).then(o=>{if(o.call)noteCalls(c,[l],[o])},()=>{})}); // the Calls list: a call entry that is a one-on-one chat's newest message
    if(firstLoad&&S.convsLoaded)setTimeout(showRequestAlert,600);
    if(firstLoad&&S.convsLoaded)setTimeout(()=>{if(S.me===id)callModeOver().then(()=>goLive(id)).catch(()=>{})},3000); // the start's pass, once the list has been live a moment and any pushed call is over (SPEC.md 5.6)
    if(S.chan){const c=convById(S.chan);
      if(!c){if(!fromCache){closeConv();toast('You\u2019re no longer in that chat.')}}
      else{if((c.ttl||0)!==S.curTtl){S.curTtl=c.ttl||0;S.rendered=null}refreshHeader();renderConv();drawPinBar();if(S.commentsView)S.commentsView.render()}}
    renderList();renderCalls();computeUnread();syncCallWatch();mintWake();
    if(S.wantOpen&&convById(S.wantOpen)){const w=S.wantOpen;S.wantOpen=null;openConv(w)}else if(S.convsLoaded)S.wantOpen=null; // a cached row tapped before its record came
  };
  // Your inbox is only readable once this device has proven it's yours, so start it after binding. A device removal
  // left half done is finished first (it starts the page again itself), then the settings are read, then the chat list:
  // a one-on-one note with an id from before a key change is then known through its alias (dmIdFor), not deleted.
  // healLogin after the settings are read: a password changed on another device moved the boxes, it didn't lose them.
  // Booted for a pushed call: that chat's call watch goes out before the chat list, and presence, minting, healLogin
  // and the push address wait until the call is over.
  bindDevice(id).catch(()=>{}).then(async()=>{if(S.me!==id)return;if(await finishRekey().catch(()=>false)||S.me!==id)return;await loadContacts().catch(()=>{});if(S.me!==id)return;await watchPushCall().catch(()=>{});if(S.me!==id)return;if(S.unsubConvs)S.unsubConvs();S.unsubConvs=watchInbox(id,onConvs);await callModeOver();if(S.me!==id)return;refreshPresence();mintWake();resendCards().catch(()=>{});healLogin(id);registerPush(id)});heartbeat(true);renderBanner();refreshDir().then(refreshPresence);
}
async function republishSelf(){
  // Puts your public keys in the directory if they're missing, and puts them back if someone replaced them.
  if(!S.db||!S.me||!S.dirReady||S.rekeying||goneSeen.has(S.me.handle))return;const m=S.me,d=S.dir[m.handle];if(d&&(d.gone||(d.kv||1)>(m.kv||1)))return; // never brings a deleted account back
  try{if(!d){if((await S.db.doc('directory/'+m.handle).get()).exists)return;await S.db.doc('directory/'+m.handle).set(Object.assign({handle:m.handle,name:m.name,ecdh:m.ecdh,sig:m.sig,ts:Date.now()},dispOk(m.disp,m.handle)?{disp:m.disp}:{},m.dev&&m.dev.s?{devs:{[m.dev.id]:devEntry(m.dev)}}:{}))} // no copy can mean a read that failed (loadDir keeps no error): a whole record only once a read that worked found none, or the photo, bio, settings and other devices would be gone
    else if(dispOk(m.disp,m.handle)&&d.disp!==m.disp){await S.db.doc('directory/'+m.handle).update({disp:m.disp});d.disp=m.disp}
    else if(!sameKeys(keysOf(d),{ecdh:m.ecdh,sig:m.sig})){toastErr('The security code Hush holds for you isn\u2019t this phone\u2019s. Someone may have tampered with it. To put yours back, open Settings, Advanced, Restore an account, and enter your recovery words.')}}catch{}
}
(async()=>{
  setTimeout(()=>splashOff('cap'),2500); // the launch screen never outlives the boot's first 2.5 s, whatever it has reached (offline, a slow server, a pushed-call boot)
  if(natOk())window.Capacitor.addListener('CallAudio','state',st=>{const k=S.call;if(!st)return;if(typeof st.push==='string'&&st.push){if(!k)pushLive(st.push);else if(k.dir==='in'&&k.state==='ringing'&&!k.pushId){k.pushId=st.push;ring(false);pushRing(k)}return}if(!k||k.state!=='ringing')return;if(st.answered===true){k.sys=true;k.sysSeen=st.seen===true;acceptCall()}else if(st.ended==='user')hangUp('','declined')}); // the system screen while the page's call still rings: Answer there answers here, Decline there declines (natMedia's own listener lives from the answer on); an Answer or Decline before the offer reached the page is sent again by the plugin after update. A push while this page already runs (the app open or in the background) is for the offer about to arrive, or for the one ringing here, which the system screen then rings instead
  S.pushCall=natOk()?await Promise.race([nat('pending'),new Promise(r=>setTimeout(r,5e3,null))]).then(r=>r&&typeof r.id==='string'&&r.id?Object.assign({id:r.id,at:Date.now()},typeof r.tag==='string'&&r.tag?{tag:r.tag}:{}):null,()=>null):null; // the iPhone was woken by a push for a call (an older build has no such question: null; and start-up never waits more than 5 s on it); tag: the mark of the ticket that woke it, which names the chat before anything has loaded
  if(S.pushCall){document.documentElement.classList.add('call-mode');setTimeout(()=>{if(S.pushCall)pushCallOff()},60e3)} // call mode until the offer comes, or for the minute it could live
  const dbP=connectServer(); // the socket and the hello carry nothing of the account, so they go out while the gate and the store are dealt with
  const plan=lockPlan(lockCfg(),!!S.pushCall);if(plan==='await')await showLock();else if(plan==='show')showLock(); // the PIN or password gate first: nothing is unsealed while it stands; in call mode a PIN lock stands without being waited for
  try{await unlockStore()}catch{return storeRetry()} // a password gate opened the store itself; otherwise this browser's device key does; a store none of the keys opens is left as it is
  S.ids=ls.get('hush:ids',[]);
  const active=ls.get('hush:active',null),id=S.ids.find(x=>x.handle===active)||S.ids[0];
  if(id&&!S.pushCall){S.me=id;renderList()} // the list as last drawn for this account, before the socket; start(id) below takes over
  renderBanner();
  S.db=await dbP;
  renderBanner();
  if(S.db){
    setInterval(()=>refreshDir(true),60000);setInterval(refreshPresence,40000);setInterval(syncCallWatch,15000); // a block lifted, say: the list itself didn't change
  }
  const hj=/join=|add=/.test(location.hash)?location.hash:null;dropHash(); // read, then gone from the address bar (signed out, S.pendingJoin keeps it in memory only)
  if(id){start(id);if(hj)setTimeout(()=>handleJoin(hj),400)}else{S.pendingJoin=hj;showOnboard(false)}
  addEventListener('hashchange',()=>{const h=location.hash;if(!/join=|add=/.test(h))return;dropHash();if(S.me)handleJoin(h);else S.pendingJoin=h});
  setInterval(()=>{refreshHeader();drawTyping()},1500);
  setInterval(()=>{const now=Date.now();if(S.chan&&(S.posts.some(p=>p.exp&&p.exp<=now)||(S.future||[]).some(p=>p.ts<=now+3000))){applyExpiry();renderConv();renderList()}},2000);
  updateStatus();setupSwipeNav();setupPullRefresh();
  document.addEventListener('selectionchange',()=>{if(S.comp&&S.comp.syncFmt)S.comp.syncFmt()});setInterval(()=>heartbeat(),45000);
  fitKeyboard();
  document.addEventListener('visibilitychange',()=>{heartbeat();if(!document.hidden){markRead();S.db.present();S.db.probe(3000)}}); // back in view: a socket that died in the background is replaced now, not at the next 25-s ping, and without the random wait
})();
