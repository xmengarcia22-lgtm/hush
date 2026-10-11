// Blind addresses the server works out the same way the page does. The emailed verification codes that lived here
// (SPEC.md 14.10) are gone since release 16, and with them the mail key.

import { createHash } from 'node:crypto';

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('base64url');
// A login's tag, as the page makes it (SPEC.md 4.5).
export const loginTag = (login) => sha('hush-login-v1:' + login);
// Where a link offer lives (SPEC.md 14.14): made from the offer's name, in a space of its own, so no login's tag is one.
export const offerTag = (n) => sha('hush-link-offer-v1|' + n);
