// The server-wide storage guard (SPEC.md 8.6): new media and the boxes written before signing in are refused with `full`
// when the data disk has under minFreeDisk of it free and under minFreeBytes, or when all media together would pass
// maxMediaBytes. The disk is asked again after diskCheckMs, or once diskCheckBytes were admitted since the last look,
// so a burst of uploads cannot overshoot the floor inside a stale answer; while statfs fails the disk is taken as fine.
// `diskFree()` (tests) stands in for statfs and returns { free, total } in bytes.

import { statfsSync } from 'node:fs';
import { log } from './log.js';

export function createDiskWatch({ dataDir, store, limits, now = Date.now, diskFree = null }) {
  const M = limits.media;
  let at = -Infinity, ok = true, admitted = 0, media = 0, blind = false;
  function look() {
    const was = ok; let freePct = -1;
    ok = true;
    try {
      let free, total;
      if (diskFree) ({ free, total } = diskFree());
      else { const s = statfsSync(dataDir); free = Number(s.bavail) * Number(s.bsize); total = Number(s.blocks) * Number(s.bsize); }
      freePct = Math.round(100 * free / Math.max(1, total));
      ok = !(free / Math.max(1, total) < M.minFreeDisk && free < M.minFreeBytes);
    } catch { if (!blind) log.warn('media.disk', { ok, freePct }); blind = true; }   // unknown: allow, and say so once (freePct -1)
    media = store.mediaStats().bytes;
    at = now(); admitted = 0;
    if (ok !== was) log.warn('media.disk', { ok, freePct });
  }
  const fresh = () => { if (now() - at >= M.diskCheckMs || admitted >= M.diskCheckBytes) look(); };
  return {
    ok() { fresh(); return ok; },
    // Room for `n` more media bytes: under the floor and under maxMediaBytes. Counted as stored and as admitted, so the
    // next look comes sooner and the cached total never lags behind a burst (a delete is picked up at the next look).
    admit(n) { fresh(); if (!ok || media + n > M.maxMediaBytes) return false; media += n; admitted += n; return true; },
  };
}
