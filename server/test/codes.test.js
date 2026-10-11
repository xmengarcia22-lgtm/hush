// The emailed codes are gone (release 16, SPEC.md 14.14): the server sends and checks none, needs no mail key, and
// takes no new recovery-email records; the page asks for a code nowhere. Sign-up and login are checked here too.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

import { startServer, connect, appSource, makeIdentity, signup } from './helpers.js';
import { SYSTEM } from '../src/store.js';

test('the server has no code operations', async () => {
  const s = await startServer({ authz: 'standard' });
  const c = await connect(s.url);
  try {
    await c.hello();
    for (const op of ['code.send', 'code.check']) assert.equal((await c.call(op, { to: 'jordan.hale@example.com', code: '000000' })).e, 'invalid', op);
  } finally { await c.close(); await s.stop(); }
});

test('in production the server starts without a mail key; a key left in the environment is ignored and never printed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'hush-test-'));
  const key = 're_startup_check_' + 'Z'.repeat(16);
  try {
    const out = await new Promise((resolve, reject) => {
      const p = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', 'src/index.js'], {
        cwd: new URL('..', import.meta.url), env: { ...process.env, NODE_ENV: 'production', RESEND_API_KEY: key, HUSH_AUTHZ: 'standard', HUSH_PORT: '0', HUSH_DATA_DIR: dir, HUSH_LOG: 'off' },
      });
      let o = '';
      const t = setTimeout(() => { p.kill(); reject(new Error('no startup output: ' + o)); }, 15000);
      p.stdout.on('data', (d) => { o += d; if (o.includes('Hush server listening')) p.kill(); });
      p.stderr.on('data', (d) => { o += d; });
      p.on('exit', () => { clearTimeout(t); resolve(o); });
    });
    assert.match(out, /Hush server listening/, 'it starts');
    assert.ok(!out.includes(key), 'the key is not printed');
    assert.ok(!/Refusing to start|Verification codes|Resend/.test(out), 'nothing about mail');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('server/.env is never committed: .gitignore lists it', () => {
  const lines = readFileSync(new URL('../../.gitignore', import.meta.url), 'utf8').split(/\r?\n/).map((l) => l.trim());
  assert.ok(lines.includes('.env'), '.env');
  assert.ok(lines.includes('.env.*'), '.env.*');
});

test('recovery-email records from before release 16: nobody writes or reads one; only its own account removes it', async () => {
  const s = await startServer({ authz: 'standard' });
  const A = await signup(s.url, await makeIdentity('alice')), B = await signup(s.url, await makeIdentity('bob'));
  const anon = await connect(s.url);
  try {
    await anon.hello();
    const at = 'recovery/' + 'R'.repeat(43), mine = { h: 'alice', ts: 1 };
    assert.equal((await A.call('set', { p: at, d: mine })).e, 'denied', 'not even its own account writes one now');
    s.srv.store.set(at, mine, SYSTEM);
    assert.equal((await A.call('get', { p: at })).e, 'denied', 'never read back');
    assert.equal((await B.call('delete', { p: at })).e, 'denied', 'another account can’t remove it');
    assert.equal((await anon.call('delete', { p: at })).e, 'unauth');
    await A.ok('delete', { p: at });
    assert.equal(s.srv.store.get(at, SYSTEM).d, null);
  } finally { for (const c of [A, B, anon]) await c.close(); await s.stop(); }
});

test('the page asks for no code anywhere and keeps no recovery email', () => {
  const src = appSource();
  for (const no of ['code.send', 'code.check', 'sendCode', 'checkCode', 'link.resume', 'linkResume', 'demoCode', 'recEmail', "'recovery/"]) assert.ok(!src.includes(no), 'the page has no ' + no);
  const ui = readFileSync(new URL('../../app/ui.js', import.meta.url), 'utf8');
  assert.ok(!/i\.value!==code/.test(ui), 'no code is compared in the page');
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
  const forgot = between('const stepForgot=', 'const stepLinkScan=');
  assert.match(forgot, /stepLinkScan\(\)[\s\S]*openRestore\(\)/, 'forgot password offers another device, then the recovery words');
  assert.ok(!/pwField|password'\)/.test(forgot), 'and asks for no password');
  assert.ok(!/Recovery email|openRecoveryEmail/.test(between('function settingsAdvanced(', 'function ')), 'no recovery email: nothing uses one now');
  assert.ok(!/openAddLogin/.test(ui));
});
