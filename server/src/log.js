// Logging policy (SPEC.md 11.1): lifecycle events, counters and error codes
// only. Never a network address, a path segment, a handle, a chat id, or any
// frame content. There is no per-connection or per-request logging at all.
//
// Unexpected errors are logged with their code, name and the "at ..." lines of
// the stack. The first stack line (the message) is dropped on purpose, because
// some runtime errors (JSON.parse, for one) quote the offending input.

const ALLOWED_STRING_KEYS = new Set(['mode', 'code', 'reason', 'version', 'event']);

let sink = (line) => process.stderr.write(line + '\n');
let enabled = true;

function emit(level, event, fields) {
  if (!enabled) return;
  const rec = { t: new Date().toISOString(), level, event };
  for (const [k, v] of Object.entries(fields || {})) {
    if (typeof v === 'number' || typeof v === 'boolean') rec[k] = v;
    else if (typeof v === 'string' && ALLOWED_STRING_KEYS.has(k) && v.length <= 40) rec[k] = v;
  }
  sink(JSON.stringify(rec));
}

function stackOnly(err) {
  const s = err && typeof err.stack === 'string' ? err.stack : '';
  return s.split('\n').slice(1).map((l) => l.trim()).filter((l) => l.startsWith('at ')).slice(0, 10).join(' | ');
}

export const log = {
  info: (event, fields) => emit('info', event, fields),
  warn: (event, fields) => emit('warn', event, fields),
  error(event, err) {
    emit('error', event, {
      code: err && typeof err.code === 'string' ? err.code : 'unknown',
      name: err && typeof err.name === 'string' ? err.name : 'Error',
      frames: 0,
    });
    if (enabled && err) sink('  ' + stackOnly(err));
  },
  setEnabled(v) { enabled = !!v; },
  setSink(fn) { sink = fn; },
};
