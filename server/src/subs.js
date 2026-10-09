// Live subscriptions (SPEC.md 7.4). A subscription is either a filtered view of
// one collection (`w`, `o`, `l`) or a fixed set of documents in one collection
// (`ids`). After `init`, the server pushes `set` for every change that matches
// and `del` for every removal or change that no longer matches. Ordering and
// the limit are the client's job after `init`.

import { fail } from './errors.js';
import { matches } from './query.js';

export class SubRegistry {
  constructor(limits) {
    this.limits = limits;
    this.byParent = new Map();   // parent → Set<sub>
    this.byConn = new Map();     // conn → Map<s, sub>
  }

  count(conn) {
    const m = this.byConn.get(conn);
    return m ? m.size : 0;
  }

  add(conn, { s, kind, parent, ids, w, o, l }) {
    let m = this.byConn.get(conn);
    if (!m) { m = new Map(); this.byConn.set(conn, m); }
    if (m.has(s)) fail('conflict', 'subscription id already in use');
    if (m.size >= this.limits.subsPerConn) fail('ratelimit', 'too many subscriptions on this connection');
    const sub = { conn, s, kind, parent, ids: ids ? new Set(ids) : null, w: w || [], o, l };
    m.set(s, sub);
    let set = this.byParent.get(parent);
    if (!set) { set = new Set(); this.byParent.set(parent, set); }
    set.add(sub);
    return sub;
  }

  remove(conn, s) {
    const m = this.byConn.get(conn);
    if (!m) return false;
    const sub = m.get(s);
    if (!sub) return false;
    m.delete(s);
    if (m.size === 0) this.byConn.delete(conn);
    const set = this.byParent.get(sub.parent);
    if (set) { set.delete(sub); if (set.size === 0) this.byParent.delete(sub.parent); }
    return true;
  }

  removeConn(conn) {
    const m = this.byConn.get(conn);
    if (!m) return;
    for (const s of [...m.keys()]) this.remove(conn, s);
  }

  // Removes this connection's subscriptions matching `pred`; returns how many.
  removeWhere(conn, pred) {
    const m = this.byConn.get(conn);
    if (!m) return 0;
    let n = 0;
    for (const [s, sub] of [...m]) if (pred(sub)) { this.remove(conn, s); n++; }
    return n;
  }

  // evt: { parent, id, d, type: 'set' | 'del' }
  dispatch(evt) {
    const set = this.byParent.get(evt.parent);
    if (!set) return 0;
    let n = 0;
    for (const sub of set) {
      if (sub.ids) {
        if (!sub.ids.has(evt.id)) continue;
      }
      let frame;
      if (evt.type === 'del') frame = { s: sub.s, t: 'del', id: evt.id };
      else if (sub.ids || matches(evt.d, sub.w)) frame = { s: sub.s, t: 'set', id: evt.id, d: evt.d };
      else frame = { s: sub.s, t: 'del', id: evt.id };
      sub.conn.send(frame);
      n++;
    }
    return n;
  }

  get totalSubs() {
    let n = 0;
    for (const m of this.byConn.values()) n += m.size;
    return n;
  }
}
