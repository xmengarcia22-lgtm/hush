// Anonymous drops (SPEC.md 6, stage 5). `POST /drop { to, blob, pow? }` files a sealed note into a
// person's mailbox without any session, so the server never has sender and recipient in one place.
// The note is stored exactly as the page writes its own notes, at `inbox/<to>/c/<id>`, which means
// the recipient's existing live subscription delivers it at once and the recipient deletes it as
// before. The server keeps: the recipient, an opaque blob of fixed size, and the hour.
//
// Proof of work is asked for only when the recipient has "only my contacts" on (`requests: true`
// in their profile) or when their mailbox has taken more than half its hourly allowance. The puzzle
// is stateless: sha256("hush-pow-v1|to|hour|nonce") must start with `bits` zero bits. Used
// solutions are remembered in memory for the hour so one cannot be replayed.

import { createHash } from 'node:crypto';
import { HushError, fail } from './errors.js';
import { isPlain } from './merge.js';
import { HANDLE } from './identity.js';
import { genId } from './paths.js';
import { SYSTEM } from './store.js';
import { BucketMap } from './limits.js';
import { NOTE_BYTES, XY } from './schemas.js';

export const hourOf = (now) => Math.floor(now / 36e5) * 36e5;
export const powInput = (to, hour, nonce) => `hush-pow-v1|${to}|${hour}|${nonce}`;
const NONCE = /^[A-Za-z0-9_-]{1,64}$/;

export function leadingZeroBits(buf) {
  let n = 0;
  for (const b of buf) {
    if (b === 0) { n += 8; continue; }
    n += Math.clz32(b) - 24;
    break;
  }
  return n;
}

export function powOk(to, hour, nonce, bits) {
  if (typeof nonce !== 'string' || !NONCE.test(nonce)) return false;
  return leadingZeroBits(createHash('sha256').update(powInput(to, hour, nonce), 'utf8').digest()) >= bits;
}

// Shape of a note as it travels and as it is stored: an ECDH wrap of a plaintext padded to a fixed size.
export function noteOk(blob) {
  if (!isPlain(blob)) return false;
  const keys = Object.keys(blob).sort().join(',');
  if (keys !== 'ct,epk,iv') return false;
  if (!XY(blob.epk)) return false;
  if (typeof blob.iv !== 'string' || blob.iv.length < 1 || blob.iv.length > 64) return false;
  if (typeof blob.ct !== 'string' || blob.ct.length > 2 * NOTE_BYTES) return false;
  return Buffer.from(blob.ct, 'base64').length === NOTE_BYTES;
}

export class Drops {
  constructor({ store, limits, now = Date.now }) {
    this.store = store;
    this.limits = limits;
    this.now = now;
    this.addr = new BucketMap(limits.dropsPerHourPerAddr, limits.dropsPerHourPerAddr / 3600);
    this.recipient = new BucketMap(limits.dropsPerHourPerRecipient, limits.dropsPerHourPerRecipient / 3600);
    this.used = new Map();   // hour → Set("to|nonce")
  }

  // Would a drop to `to` need proof of work right now?
  needsPow(to, dir, now) {
    if (dir && dir.requests === true) return true;
    return this.recipient.tokensLeft(to, now) < this.limits.dropsPerHourPerRecipient / 2;
  }

  // Files the note. Returns { id }. Throws HushError: invalid, notfound, pow (with .bits and .hour), ratelimit.
  accept({ to, blob, pow, addrTag }) {
    const now = this.now(), hour = hourOf(now);
    // Every attempt costs the sender's address its token first, so probing names is as limited as dropping.
    if (!this.addr.take(addrTag, 1, now)) fail('ratelimit', 'drop: too many from here this hour');
    if (typeof to !== 'string' || !HANDLE.test(to)) fail('invalid', 'drop: bad recipient');
    if (!noteOk(blob)) fail('invalid', 'drop: a note is a sealed blob of exactly the padded size');
    const dir = this.store.get('directory/' + to, SYSTEM).d;
    if (!dir) fail('notfound', 'drop: no such recipient');
    if (this.needsPow(to, dir, now)) {
      const bits = this.limits.dropPowBits;
      const nonce = pow && isPlain(pow) ? pow.nonce : undefined;
      if (!powOk(to, hour, nonce, bits)) throw Object.assign(new HushError('pow', 'drop: proof of work required'), { bits, hour });
      let set = this.used.get(hour);
      if (!set) { set = new Set(); this.used.set(hour, set); }
      const key = to + '|' + nonce;
      if (set.has(key)) throw Object.assign(new HushError('pow', 'drop: that proof was already used'), { bits, hour });
      set.add(key);
    }
    if (!this.recipient.take(to, 1, now)) fail('ratelimit', 'drop: that mailbox is busy this hour');
    const parent = 'inbox/' + to + '/c';
    this.store.makeRoom(parent, this.limits.inboxMax - 1);      // the oldest notes give way, nobody is locked out
    const id = genId();
    this.store.set(parent + '/' + id, { epk: { x: blob.epk.x, y: blob.epk.y }, iv: blob.iv, ct: blob.ct, ts: hour }, SYSTEM);
    return { id };
  }

  // Forgets last hour's used proofs and idle buckets.
  prune(now = this.now()) {
    const keep = hourOf(now) - 36e5;
    for (const h of [...this.used.keys()]) if (h < keep) this.used.delete(h);
    this.addr.prune(now);
    this.recipient.prune(now);
  }
}

// HTTP status for an error raised by `accept`.
export function statusOf(e) {
  if (!(e instanceof HushError)) return 500;
  return { invalid: 400, notfound: 404, pow: 429, ratelimit: 429, toolarge: 413 }[e.code] || 500;
}
