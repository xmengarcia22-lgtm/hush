// Error type used throughout the server. The `code` travels to the client in
// error replies (`{ ok:false, e:code, m:message }`). Messages are written for
// humans and must never echo client-supplied data, because unexpected errors
// may be logged.

export class HushError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'HushError';
    this.code = code;
  }
}

// The codes are those of SPEC.md 7.2: unauth, denied, notfound, exists, invalid, toolarge, ratelimit, conflict,
// version; plus internal (an unexpected failure), pow (a drop or a sign-up that must bring proof of work first,
// SPEC.md 6 and 9.4) and full (media refused because the chat's allowance or the disk is used up, SPEC.md 7.7).

export function fail(code, message) {
  throw new HushError(code, message);
}
