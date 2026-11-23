// Call wake-ups (ringing when the app is closed): `POST /wake { tk }` with a contact's wake ticket sends one VoIP push to
// the iPhone that issued it; a message ticket (kind m, release 65) sends one alert push saying only "New message", through
// per-ticket buckets of its own. The ticket is all the server reads; who holds it and which chat it is for, it does not
// learn. An unknown, revoked or exhausted ticket is answered exactly like a good one, so a ticket's state cannot be
// probed; only a malformed request or a busy address is refused out loud. The push carries a random mark and a tag
// made from the ticket and that mark, never the ticket itself (a bearer token: whoever holds it can ring the phone): the
// phone that issued the ticket names the caller from its own table, Apple's push service sees nothing stable across
// calls from the same contact, and the server, which reads the ticket anyway, learns nothing new.

import { createHash, createHmac, randomBytes } from 'node:crypto';
import { fail } from './errors.js';
import { BucketMap } from './limits.js';
import { tokenDead } from './apns.js';
import { log as defaultLog } from './log.js';

const TICKET = /^[A-Za-z0-9_-]{22}$/;

export class Wakes {
  constructor({ store, apns, limits, now = Date.now, log = defaultLog }) {
    this.store = store;
    this.apns = apns;
    this.now = now;
    this.log = log;
    this.addr = new BucketMap(limits.wakePerHourPerAddr, limits.wakePerHourPerAddr / 3600, 3600_000);
    this.minute = new BucketMap(limits.wakePerMinPerTicket, limits.wakePerMinPerTicket / 60);
    this.hour = new BucketMap(limits.wakePerHourPerTicket, limits.wakePerHourPerTicket / 3600, 3600_000);
    this.msgMinute = new BucketMap(limits.msgPerMinPerTicket, limits.msgPerMinPerTicket / 60);
    this.msgHour = new BucketMap(limits.msgPerHourPerTicket, limits.msgPerHourPerTicket / 3600, 3600_000);
    this.devMinute = new BucketMap(limits.wakePerMinPerDevice, limits.wakePerMinPerDevice / 60);   // one phone's call rings, whichever tickets ring it
    this.devHour = new BucketMap(limits.wakePerHourPerDevice, limits.wakePerHourPerDevice / 3600, 3600_000);
  }

  // Throws HushError invalid or ratelimit, both about the caller; everything about the ticket is silent. The push is not
  // awaited: the reply says only that the request was taken, and Apple's answer decides whether the address is kept.
  accept({ tk, addrTag }) {
    const now = this.now();
    if (typeof tk !== 'string' || !TICKET.test(tk)) fail('invalid', 'wake: bad ticket');
    // One address bucket for every kind, spent before the ticket is read: the one refusal said out loud tells nothing about
    // the ticket. Then the ticket (one primary-key read): a message ticket spends per-ticket buckets of its own, an unknown
    // one the call buckets, as every ticket did before, and both end in silence.
    if (!this.addr.take(addrTag, 1, now)) fail('ratelimit', 'wake: too many from here this hour');
    const w = this.store.wakeLookup(tk), m = !!w && w.k === 'm';
    const [minute, hour] = m ? [this.msgMinute, this.msgHour] : [this.minute, this.hour];
    if (!minute.take(tk, 1, now) || !hour.take(tk, 1, now) || !w) return;
    // A call ring then spends its phone's allowance too, however many tickets ring it, and only once the ticket's own
    // passed, so one contact alone never uses it up. Silent like the rest; a nudge is not counted.
    const phone = w.h + '|' + w.dev;
    if (!m && (!this.devMinute.take(phone, 1, now) || !this.devHour.take(phone, 1, now))) return;
    let payload;
    if (m) payload = { aps: { alert: 'New message', sound: 'default' } };   // no name, text, chat or badge: the phone learns only that there is one
    else {
      const mark = randomBytes(12).toString('base64url');
      // The tag is an HMAC of the mark under a key only the ticket gives, so it is new on every push (CONTRACT.md revision 2).
      const key = createHash('sha256').update('hush-wake-name').update(tk).digest();
      payload = { w: mark, t: createHmac('sha256', key).update(mark).digest('base64url').slice(0, 22) };
    }
    this.apns.send({ tok: w.tok, payload, kind: m ? 'alert' : 'voip' })
      .then(({ status, reason }) => { if (tokenDead(status, reason)) this.store.pushDrop({ h: w.h, dev: w.dev, k: w.k }); })
      .catch((e) => this.log.error('wake.push.failed', e));
  }

  // Forgets idle buckets (the hourly sweep).
  prune(now = this.now()) {
    this.addr.prune(now);
    this.minute.prune(now);
    this.hour.prune(now);
    this.msgMinute.prune(now);
    this.msgHour.prune(now);
    this.devMinute.prune(now);
    this.devHour.prune(now);
  }
}
