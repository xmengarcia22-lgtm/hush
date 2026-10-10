// Verification codes (SPEC.md 14.10): the server makes, sends and checks the six digits. Email goes out through
// Resend when a key is set; without one the code comes back as demoCode for the page to show. No test here talks to
// Resend: the mailer is replaced by a fake that records what it would have sent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { Codes, codeLogin, createMailer } from '../src/codes.js';
import { loadConfig } from '../src/config.js';
import { startServer, connect, appSource } from './helpers.js';

const EMAIL = 'jordan.hale@example.com';
const PHONE = '+12125550134';

function fakeMailer({ fail = false } = {}) {
  const sent = [];
  return { sent, async send(m) { if (fail) { const e = new Error('nope'); e.code = 'mail'; throw e; } sent.push(m); } };
}

async function withServer(over, fn) {
  const s = await startServer(over);
  const c = await connect(s.url);
  try { await c.hello(); await fn(c, s); } finally { await c.close(); await s.stop(); }
}

// ---- the code store ----

test('a code is six digits, works once, and only for its own login', () => {
  const k = new Codes();
  const code = k.issue(EMAIL);
  assert.match(code, /^\d{6}$/);
  assert.equal(k.check('olivia@example.com', code), 'none');
  assert.equal(k.check(EMAIL, code), 'ok');
  assert.equal(k.check(EMAIL, code), 'none', 'used up');
});

test('a new code replaces the old one', () => {
  const k = new Codes();
  const a = k.issue(EMAIL);
  let b = k.issue(EMAIL);
  while (b === a) b = k.issue(EMAIL);
  assert.equal(k.check(EMAIL, a), 'wrong');
  assert.equal(k.check(EMAIL, b), 'ok');
});

test('a new code can be asked for only after the cooldown, even once the first is used up', () => {
  let t = 1_000_000;
  const k = new Codes({ now: () => t, cooldownMs: 60_000 });
  assert.equal(k.wait(EMAIL), 0, 'nothing sent yet');
  const code = k.issue(EMAIL);
  assert.equal(k.wait(EMAIL), 60_000);
  t += 45_000;
  assert.equal(k.wait(EMAIL), 15_000);
  assert.equal(k.wait(PHONE), 0, 'another address is unaffected');
  assert.equal(k.check(EMAIL, code), 'ok');
  assert.equal(k.wait(EMAIL), 15_000, 'using the code does not reset the wait');
  t += 15_000;
  assert.equal(k.wait(EMAIL), 0);
  k.issue(EMAIL); k.release(EMAIL);
  assert.equal(k.wait(EMAIL), 0, 'a code that never left can be asked for again');
  k.issue(EMAIL); t += 60_000; k.prune();
  assert.equal(k.sentAt.size, 0, 'old stamps are swept');
});

test('five wrong tries kill a code, and so does time', () => {
  let t = 1_000_000;
  const k = new Codes({ now: () => t, ttlMs: 60_000, tries: 5 });
  const code = k.issue(EMAIL);
  const wrong = code === '000000' ? '111111' : '000000';
  for (let n = 0; n < 4; n++) assert.equal(k.check(EMAIL, wrong), 'wrong');
  assert.equal(k.check(EMAIL, wrong), 'wrong');
  assert.equal(k.check(EMAIL, code), 'none', 'the right code no longer works after five misses');

  const c2 = k.issue(EMAIL);
  t += 60_001;
  assert.equal(k.check(EMAIL, c2), 'none', 'expired');
  k.issue(PHONE); t += 60_001; k.prune();
  assert.equal(k.size, 0);
});

test('nothing but six digits is ever taken as a code', () => {
  const k = new Codes({ tries: 100 });
  const code = k.issue(EMAIL);
  for (const bad of [Number(code), ' ' + code, code + '0', '', null, undefined]) assert.equal(k.check(EMAIL, bad), 'wrong');
});

test('the store holds no code and no login in the clear', () => {
  const k = new Codes();
  const code = k.issue(EMAIL);
  const dump = JSON.stringify([...k.map.entries()].map(([t, e]) => [t, e.mac.toString('hex'), e.exp, e.left]));
  assert.ok(!dump.includes(code) && !dump.includes('jordan'));
});

test('codes go only to what the page calls a login: a lowercased email or + and digits', () => {
  assert.equal(codeLogin(EMAIL), EMAIL);
  assert.equal(codeLogin(PHONE), PHONE);
  for (const bad of ['Jordan.Hale@example.com', 'jordan@', 'jordan hale@example.com', '2125550134', '+1212', '+1 212 555 0134', 'x'.repeat(250) + '@e.com', 42, null]) {
    assert.equal(codeLogin(bad), null, String(bad));
  }
});

// ---- the mailer ----

test('no API key means no mailer, so the code is shown on screen', () => {
  assert.equal(createMailer({ apiKey: '', from: 'Hush <a@example.com>' }), null);
  assert.equal(createMailer({}), null);
});

test('the mailer hands Resend the code, the address and the sender, and fails loudly on a refusal', async () => {
  const calls = [];
  let reply = { data: { id: 'x' }, error: null };
  class FakeResend { constructor(key) { this.key = key; this.emails = { send: async (m) => { calls.push({ key, m }); return reply; } }; } }
  const m = createMailer({ apiKey: 're_test_key', from: 'Hush <codes@example.com>' }, FakeResend);
  await m.send({ to: EMAIL, code: '123456' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].key, 're_test_key');
  assert.deepEqual(calls[0].m.to, [EMAIL]);
  assert.equal(calls[0].m.from, 'Hush <codes@example.com>');
  assert.match(calls[0].m.subject, /123456/);
  assert.match(calls[0].m.text, /123456/);
  assert.match(calls[0].m.html, /123456/);
  assert.ok(!JSON.stringify(calls[0].m).includes('re_test_key'), 'the key never goes into the message');

  reply = { data: null, error: { name: 'validation_error', message: 'bad' } };
  await assert.rejects(m.send({ to: EMAIL, code: '123456' }), (e) => e.code === 'mail');
});

test('the real Resend library is installed and has the call the mailer uses', async () => {
  const { Resend } = await import('resend');
  const r = new Resend('re_not_a_real_key');
  assert.equal(typeof r.emails.send, 'function');
});

// ---- over the socket ----

test('without a mail key the server hands back the code (demoCode), and checks it', async () => {
  await withServer({}, async (c) => {
    const r = await c.ok('code.send', { to: EMAIL });
    assert.equal(r.sent, false);
    assert.match(r.demoCode, /^\d{6}$/);
    const wrong = r.demoCode === '000000' ? '111111' : '000000';
    assert.equal((await c.call('code.check', { to: EMAIL, code: wrong })).e, 'denied');
    await c.ok('code.check', { to: EMAIL, code: r.demoCode });
    assert.equal((await c.call('code.check', { to: EMAIL, code: r.demoCode })).e, 'notfound', 'a code works once');
  });
});

test('with a mail key an email gets its code by email and never in the reply', async () => {
  const mailer = fakeMailer();
  await withServer({ mailer }, async (c) => {
    const r = await c.ok('code.send', { to: EMAIL });
    assert.equal(r.sent, true);
    assert.equal(r.demoCode, undefined);
    assert.ok(!JSON.stringify(r).match(/\d{6}/), 'no six digits anywhere in the reply');
    assert.equal(mailer.sent.length, 1);
    assert.equal(mailer.sent[0].to, EMAIL);
    await c.ok('code.check', { to: EMAIL, code: mailer.sent[0].code });
  });
});

test('a phone number still gets the on-screen code until texting exists', async () => {
  const mailer = fakeMailer();
  await withServer({ mailer }, async (c) => {
    const r = await c.ok('code.send', { to: PHONE });
    assert.equal(r.sent, false);
    assert.match(r.demoCode, /^\d{6}$/);
    assert.equal(mailer.sent.length, 0);
  });
});

test('when Resend refuses, the page hears "unavailable" and gets no code to show', async () => {
  await withServer({ mailer: fakeMailer({ fail: true }) }, async (c) => {
    const r = await c.call('code.send', { to: EMAIL });
    assert.equal(r.ok, false);
    assert.equal(r.e, 'unavailable');
    assert.equal(r.demoCode, undefined);
  });
});

test('bad addresses are refused before anything is sent', async () => {
  const mailer = fakeMailer();
  await withServer({ mailer }, async (c) => {
    for (const to of ['not-an-email', 'Jordan.Hale@example.com', '', 7]) assert.equal((await c.call('code.send', { to })).e, 'invalid');
    assert.equal((await c.call('code.check', { to: 'nope', code: '123456' })).e, 'invalid');
    assert.equal(mailer.sent.length, 0);
  });
});

test('codes cannot be used to flood one inbox, or sprayed from one address', async () => {
  const mailer = fakeMailer();
  await withServer({ mailer, limits: { codeSendsPerHourPerLogin: 3, codeSendsPerHourPerAddr: 6 } }, async (c) => {
    for (let n = 0; n < 3; n++) await c.ok('code.send', { to: EMAIL });
    assert.equal((await c.call('code.send', { to: EMAIL })).e, 'ratelimit', 'per email');
    // that refusal still counted against this address: 4 of 6 used
    await c.ok('code.send', { to: 'olivia.lane@example.com' });
    await c.ok('code.send', { to: 'sam@example.com' });
    assert.equal((await c.call('code.send', { to: 'kai@example.com' })).e, 'ratelimit', 'per address');
    assert.equal(mailer.sent.length, 5);
  });
});

test('one code per address per cooldown, from any connection, and a refusal costs nothing', async () => {
  const mailer = fakeMailer();
  await withServer({ mailer, limits: { codeCooldownMs: 700, codeSendsPerHourPerLogin: 100, codeSendsPerHourPerAddr: 100 } }, async (c, s) => {
    await c.ok('code.send', { to: EMAIL });
    const r = await c.call('code.send', { to: EMAIL });
    assert.equal(r.e, 'ratelimit');
    assert.match(r.m, /^wait [1-9]\d* seconds? before asking for another code$/);
    const other = await connect(s.url); await other.hello();
    assert.equal((await other.call('code.send', { to: EMAIL })).e, 'ratelimit', 'a second connection is held to it too');
    await other.close();
    await c.ok('code.send', { to: 'olivia.lane@example.com' });   // another address is not held back
    assert.equal(mailer.sent.length, 2, 'refused asks sent nothing');
    await new Promise((res) => setTimeout(res, 750));
    await c.ok('code.send', { to: EMAIL });
    assert.equal(mailer.sent.length, 3);
  });
});

test('a code the provider refused does not start the cooldown', async () => {
  const mailer = fakeMailer({ fail: true });
  await withServer({ mailer, limits: { codeCooldownMs: 60_000 } }, async (c) => {
    assert.equal((await c.call('code.send', { to: EMAIL })).e, 'unavailable');
    assert.equal((await c.call('code.send', { to: EMAIL })).e, 'unavailable', 'asked again at once, not held back');
  });
});

test('code checks are rate limited per address', async () => {
  await withServer({ limits: { codeChecksPer10MinPerAddr: 3 } }, async (c) => {
    await c.ok('code.send', { to: EMAIL });
    for (let n = 0; n < 3; n++) await c.call('code.check', { to: EMAIL, code: '000000' });
    assert.equal((await c.call('code.check', { to: EMAIL, code: '000000' })).e, 'ratelimit');
  });
});

// ---- configuration ----

test('the key comes from RESEND_API_KEY, the sender from HUSH_MAIL_FROM', () => {
  const a = loadConfig({ RESEND_API_KEY: ' re_abc ', HUSH_MAIL_FROM: 'Hush <codes@example.com>' });
  assert.deepEqual(a.mail, { apiKey: 're_abc', from: 'Hush <codes@example.com>' });
  const b = loadConfig({});
  assert.equal(b.mail.apiKey, '');
  assert.equal(b.mail.from, 'Hush <onboarding@resend.dev>');
});

test('server/.env is never committed: .gitignore lists it', () => {
  const lines = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.ok(lines.includes('.env'), '.env');
  assert.ok(lines.includes('.env.*'), '.env.*');
});

test('the server says which way codes go at startup and never prints the key', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-test-'));
  const key = 're_startup_check_' + 'Z'.repeat(16);
  const run = (env) => new Promise((resolve, reject) => {
    const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.js'], {
      cwd: new URL('..', import.meta.url), env: { ...process.env, HUSH_AUTHZ: 'open', HUSH_PORT: '0', HUSH_DATA_DIR: dir, HUSH_LOG: 'off', ...env },
    });
    let out = '';
    const t = setTimeout(() => { p.kill(); reject(new Error('no startup output: ' + out)); }, 15000);
    p.stdout.on('data', (d) => { out += d; if (out.includes('Verification codes:')) { clearTimeout(t); p.once('exit', () => resolve(out)); p.kill(); } });
    p.stderr.on('data', (d) => { out += d; });
  });
  try {
    const on = await run({ RESEND_API_KEY: key, HUSH_MAIL_FROM: 'Hush <codes@example.com>' });
    assert.match(on, /Verification codes: emailed through Resend, from Hush <codes@example.com>/);
    assert.ok(!on.includes(key) && !on.includes('re_'), 'no key in the output');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- the page ----

test('the page no longer makes codes: it asks the server to send and to check', () => {
  const src = appSource();
  assert.ok(!/function demoCode\b/.test(src), 'no code made in the page');
  assert.ok(!/demoCode\(\)/.test(src));
  assert.ok(!/Prototype: (no texts|your code)/.test(src), 'the old prototype notice is gone');
  assert.match(src, /api\.sendCode=to=>call\('code\.send',\{to\}\)/);
  assert.match(src, /api\.checkCode=\(to,code,h\)=>call\('code\.check',h\?\{to,code,h\}:\{to,code\}\)/);
  const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  assert.match(ui, /S\.db\.checkCode\(em,i\.value,isHandleLogin\(login\)\?login:undefined\)/, 'forgot password checks on the server, for this username');
  assert.match(ui, /S\.db\.checkCode\(email,i\.value\)/, 'so does confirming a recovery email');
  assert.equal((ui.match(/sendLoginCode\(/g) || []).length, 4, 'one definition and three senders');
  assert.ok(!/i\.value!==code/.test(ui), 'no code is compared in the page');
});

test('the page shows a code on screen only when the server handed one back', () => {
  const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  const m = /async function sendLoginCode\(login\)\{[^\n]*\}/.exec(ui);
  assert.ok(m);
  const make = new Function('S', m[0] + '; return sendLoginCode;');
  const run = (reply) => make({ db: { sendCode: async () => reply } })(EMAIL);
  return Promise.all([
    run({ sent: true }).then((d) => assert.equal(d, null)),
    run({ sent: false, demoCode: '042133' }).then((d) => assert.equal(d, '042133')),
    run({ sent: false, demoCode: '<b>1</b>' }).then((d) => assert.equal(d, null, 'only six digits are ever put on screen')),
  ]);
});

test('sign-up: email or phone, password, username, display name, in that order and with no code; login takes any of them', () => {
  const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  const between = (a, b) => { const i = ui.indexOf(a), j = ui.indexOf(b, i + a.length); assert.ok(i > 0 && j > i, a); return ui.slice(i, j); };
  const signup = between('const stepSignup=', 'const stepForgot=');
  for (const no of ['sendLoginCode', 'checkCode', 'stepCode', 'demoBox']) assert.ok(!signup.includes(no), 'sign-up sends no code: ' + no);
  const order = ["'Email or phone number'", "pwField('Password", "'Username'", "'Display name'"].map((t) => signup.indexOf(t));
  assert.ok(order.every((n) => n > 0), 'every field is there');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the order asked for');
  assert.match(signup, /saveLoginBoxes\(id,reserved\?\[handle,contact\]:\[handle\],pw\)/, 'a password box for the username and for the email or number');
  const login = between('const stepLogin=', 'const stepSignup=');
  assert.match(ui, /f\.append\(el\('span',null,'Email, phone or username'\),i\)/, 'one login field for all three');
  assert.ok(!login.includes('sendLoginCode'), 'logging in sends no code');
  assert.match(login, /forgot\.onclick=\(\)=>\{[^\n]*stepForgot\(\)\}/);
  assert.match(between('const stepForgot=', 'const stepExisting='), /stepCode\(em\)[\s\S]*if\(!r\.link\)[\s\S]*r\.via==='email'/, 'a new device asks only when the server says the email belongs to the account');
  assert.match(between('function settingsAdvanced(', 'function '), /Recovery email[\s\S]*openRecoveryEmail/);
  assert.ok(!/openAddLogin/.test(ui));
});
