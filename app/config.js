/* Hush: where the server is. The page's script files run in this order and share one global scope, exactly like
   the single script they were split from: app/config.js, app/crypto.js, app/adapter.js, app/ui.js. */
/* =====================================================================
   HUSH SERVER ADDRESS. The WebSocket address of your Hush server (see
   server/README.md). Leave empty to use the same host this page came from
   (that is the production setup behind Caddy). If you change the host here,
   add it to connect-src in the Content-Security-Policy at the top of
   index.html as well, then run `npm run csp` in the server folder (which also pins this file).
   ===================================================================== */
const HUSH_CONFIG = {
  server: ""
};
