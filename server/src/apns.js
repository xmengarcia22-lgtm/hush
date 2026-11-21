// The Apple push sender for call wake-ups (HANDOFF.md, ringing when closed) and "New message" nudges: one push per wake
// ticket use, over Apple's HTTP/2 API with a provider token (an ES256 JWT), on node:http2 and node:crypto alone. Without a key
// (HUSH_APNS_KEY unset) it is a stub that reports 'disabled' and the server runs exactly as before.
// Nothing here logs a device token, the provider token or a payload.

import http2 from 'node:http2';
import { readFileSync } from 'node:fs';
import { createPrivateKey, sign } from 'node:crypto';
import { log as defaultLog } from './log.js';

const TOKEN_MAX_AGE_MS = 50 * 60_000;   // Apple: a provider token is refreshed between 20 and 60 minutes
const TIMEOUT_MS = 10_000;
const PING_MS = 5 * 60_000;             // an idle connection is cut by middleboxes in minutes; a ping keeps it open

// Apple's word that this device token will never work again, so the stored push address should go.
export const tokenDead = (status, reason) => status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'ExpiredToken';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const unref = (t) => { if (t.unref) t.unref(); return t; };

export function createApns({ keyFile, keyId, teamId, topic, host = 'api.push.apple.com', connect = http2.connect, now = Date.now, log = defaultLog } = {}) {
  if (!keyFile) return { enabled: false, send: async () => ({ status: 0, reason: 'disabled' }), close() {} };
  const key = createPrivateKey(readFileSync(keyFile));
  const alertTopic = topic.replace(/\.voip$/, '');   // the app's bundle id: an alert goes to the app, a VoIP push to its .voip topic
  let jwt = null, jwtAt = -Infinity;
  const token = () => {
    const t = now();
    if (jwt && t - jwtAt < TOKEN_MAX_AGE_MS) return jwt;
    const data = b64({ alg: 'ES256', kid: keyId }) + '.' + b64({ iss: teamId, iat: Math.floor(t / 1000) });
    jwt = data + '.' + sign('sha256', Buffer.from(data), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url');
    jwtAt = t;
    return jwt;
  };

  // One session, opened at start and kept across sends (Apple asks for that), replaced once it is gone: a call must not
  // wait for a TLS handshake, nor for a 10-second timeout on a connection that quietly died.
  let session = null;
  const alive = (s) => !!s && !s.destroyed && !s.closed;
  const connected = () => {
    if (alive(session)) return session;
    const s = connect(`https://${host}:443`);
    const gone = () => { if (session === s) session = null; };
    s.on('close', gone); s.on('goaway', gone); s.on('error', gone);   // an unheard 'error' would bring the process down
    session = s;
    return s;
  };
  const drop = (s) => { if (session === s) session = null; try { s.destroy(); } catch { /* already gone */ } };
  connected();
  const pinger = unref(setInterval(() => {
    const s = session;
    if (!alive(s)) return;
    const late = unref(setTimeout(() => drop(s), TIMEOUT_MS));
    try { s.ping(() => clearTimeout(late)); } catch { clearTimeout(late); drop(s); }
  }, PING_MS));

  // One request on the current session. `dead` says the session failed before Apple answered, so the push may be tried
  // again on a new one; a refusal or a timeout is final.
  function attempt({ tok, payload, kind }) {
    return new Promise((resolve) => {
      let done = false, timer = null, s = null, req, status = 0; const chunks = [], alert = kind === 'alert';
      const finish = (r) => { if (done) return; done = true; clearTimeout(timer); resolve(r); };
      try {
        s = connected();
        const h = {
          ':method': 'POST', ':path': '/3/device/' + tok,
          authorization: 'bearer ' + token(),
          'apns-topic': alert ? alertTopic : topic, 'apns-push-type': alert ? 'alert' : 'voip', 'apns-priority': '10',
          // A call is delivered now or dropped, it must not ring late; a "New message" banner may wait an hour for the phone.
          'apns-expiration': alert ? String(Math.floor(now() / 1000) + 3600) : '0',
          'content-type': 'application/json',   // no apns-collapse-id: a replaced banner may not alert again, so every message gets its own
        };
        req = s.request(h);
      } catch { if (s) drop(s); finish({ status: 0, reason: 'error', dead: true }); return; }
      timer = unref(setTimeout(() => { finish({ status: 0, reason: 'error' }); try { req.close(http2.constants.NGHTTP2_CANCEL); } catch { /* already gone */ } drop(s); }, TIMEOUT_MS));
      const answered = () => {
        let reason = '';
        if (status !== 200) {
          try { reason = String(JSON.parse(Buffer.concat(chunks).toString('utf8')).reason || ''); } catch { reason = ''; }
          log.warn('apns.refused', { status, reason });
        }
        finish({ status, reason });
      };
      const died = () => { if (done) return; if (status) answered(); else { drop(s); finish({ status: 0, reason: 'error', dead: true }); } };
      req.on('response', (h) => { status = Number(h[':status']) || 0; });
      req.on('data', (c) => chunks.push(c));
      req.on('end', answered);
      req.on('error', died); req.on('close', died);
      req.end(JSON.stringify(payload));
    });
  }

  async function send(x) {
    const t0 = now();
    let cold = !alive(session);
    let r = await attempt(x);
    if (r.dead) { cold = true; r = await attempt(x); }
    const ms = now() - t0;
    // A warm, fast, accepted push leaves no line: there is no per-request logging (log.js); the odd one is worth a line.
    if (cold || ms > 2000 || r.status !== 200) log.info('apns.sent', { ms, cold, status: r.status, kind: x.kind === 'alert' ? 'alert' : 'voip' });
    return { status: r.status, reason: r.reason };
  }

  return { enabled: true, send, close() { clearInterval(pinger); if (session) { try { session.close(); } catch { /* already gone */ } session = null; } } };
}
