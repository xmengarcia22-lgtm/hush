// Verification codes (SPEC.md 14.10): the six digits that prove someone can read the email they typed. The server
// makes the code, sends it, and checks it; the page never sees it. Email goes out through Resend when RESEND_API_KEY
// is set. Without a key (local testing) nothing is sent and the reply carries the code as `demoCode`, which the page
// shows on screen. Phone numbers always get the on-screen code until texting is added.
//
// Nothing here is written to disk or logged: a pending code lives in memory, keyed by a salted hash of the login,
// and holds only an HMAC of the digits. A restart forgets every pending code, which only means asking for a new one.

import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^\+\d{8,15}$/;

// What normLogin in the page produces: a lowercased email, or a phone number as + and digits.
export function codeLogin(to) {
  if (typeof to !== 'string' || to.length > 254) return null;
  if (to.includes('@')) return to === to.toLowerCase() && EMAIL.test(to) ? to : null;
  return PHONE.test(to) ? to : null;
}

// The page's blind addresses, made the same way here so a confirmed email can unlock exactly its own records:
// the login tag (link requests, logins) and the recovery record of one account and one email.
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('base64url');
export const loginTag = (login) => sha('hush-login-v1:' + login);
export const recoveryTag = (handle, email) => sha('hush-recover-v1:' + handle + '|' + email);

export class Codes {
  constructor({ now = Date.now, ttlMs = 10 * 60_000, tries = 5, cooldownMs = 60_000 } = {}) {
    this.now = now;
    this.ttlMs = ttlMs;
    this.cooldownMs = cooldownMs;
    this.tries = tries;
    this.key = randomBytes(32);          // never written anywhere; a restart makes a new one
    this.map = new Map();
    this.sentAt = new Map();             // when each login was last sent a code; outlives the code itself, so a used one doesn't reset it
  }
  tag(login) { return createHmac('sha256', this.key).update('login|' + login).digest('base64url'); }
  mac(login, code) { return createHmac('sha256', this.key).update('code|' + login + '|' + code).digest(); }

  // Milliseconds until a new code may be asked for this login; 0 when one may be asked for now.
  wait(login) {
    const at = this.sentAt.get(this.tag(login));
    return at === undefined ? 0 : Math.max(0, at + this.cooldownMs - this.now());
  }

  // Forget that a code was just sent, for when the email never left (the provider refused it).
  release(login) { this.sentAt.delete(this.tag(login)); }

  // A new code for this login; any earlier one stops working.
  issue(login) {
    this.sentAt.set(this.tag(login), this.now());
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    this.map.set(this.tag(login), { mac: this.mac(login, code), exp: this.now() + this.ttlMs, left: this.tries });
    return code;
  }

  // 'ok' (and the code is used up), 'wrong', or 'none' (no code, expired, or too many wrong tries).
  check(login, code) {
    const t = this.tag(login), e = this.map.get(t);
    if (!e || e.exp < this.now() || e.left <= 0) { this.map.delete(t); return 'none'; }
    if (typeof code === 'string' && /^\d{6}$/.test(code) && timingSafeEqual(e.mac, this.mac(login, code))) { this.map.delete(t); return 'ok'; }
    if (--e.left <= 0) this.map.delete(t);
    return 'wrong';
  }

  prune() {
    const n = this.now();
    for (const [t, e] of this.map) if (e.exp < n) this.map.delete(t);
    for (const [t, at] of this.sentAt) if (at + this.cooldownMs <= n) this.sentAt.delete(t);
  }
  get size() { return this.map.size; }
}

// The sender: send({ to, code }) resolves once the provider has accepted the email, and throws otherwise. Null when
// there is no API key, which is what turns on the on-screen code.
export function createMailer({ apiKey, from }, resendClass = null) {
  if (!apiKey) return null;
  let client = null;
  const getClient = async () => {
    if (!client) {
      const R = resendClass || (await import('resend')).Resend;
      client = new R(apiKey);
    }
    return client;
  };
  return {
    async send({ to, code }) {
      const r = await (await getClient()).emails.send({
        from,
        to: [to],
        subject: `${code} is your Hush code`,
        text: `Your Hush code is ${code}\n\nIt works for 10 minutes. If you didn't ask for it, you can ignore this email; nobody can get into an account with the code alone.\n`,
        html: `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#222">`
          + `<p>Your Hush code is</p><p style="font-size:28px;font-weight:600;letter-spacing:6px;margin:8px 0 16px">${code}</p>`
          + `<p style="color:#666">It works for 10 minutes. If you didn't ask for it, you can ignore this email; nobody can get into an account with the code alone.</p></div>`,
      });
      if (!r || r.error) {
        const err = new Error('the email provider refused the message');
        err.code = 'mail';
        throw err;
      }
    },
  };
}
