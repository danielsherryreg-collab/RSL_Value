import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { inspectInitData } from '../server/auth.js';

const token = 'diagnostics-test-token';
function signed(id: number, date = Math.floor(Date.now() / 1000), signingToken = token) {
  const params = new URLSearchParams({ auth_date: String(date), user: JSON.stringify({ id, first_name: 'Private Test Name' }) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(signingToken).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
assert.equal(inspectInitData('', token).reason, 'missing_init_data');
assert.equal(inspectInitData(signed(123), '').reason, 'missing_bot_token');
assert.equal(inspectInitData(signed(123), token).user?.id, 123);
assert.equal(inspectInitData(signed(123, Math.floor(Date.now() / 1000) - 90000), token).reason, 'expired');
assert.equal(inspectInitData(signed(123, Math.floor(Date.now() / 1000) + 1000), token).reason, 'future_auth_date');
assert.equal(inspectInitData(signed(123, undefined, 'wrong-token'), token).reason, 'invalid_signature');
assert.equal(inspectInitData(signed(0), token).reason, 'invalid_user');
assert.equal(inspectInitData(`auth_date=${Math.floor(Date.now()/1000)}&hash=${'ю'.repeat(64)}`, token).reason, 'invalid_signature');

const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rsl-diagnostics-test-'));
const port = 23000 + crypto.randomInt(10000);
const child = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, NODE_ENV: 'production', ALLOW_DEV_AUTH: 'false', TELEGRAM_POLLING: 'false', DATA_DIR: directory, PORT: String(port), RSL_VALUE_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: 'test-webhook-secret', PUBLIC_APP_URL: 'https://example.com' },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); });
child.stderr.on('data', chunk => { output += chunk.toString(); });
const base = `http://127.0.0.1:${port}`;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (await fetch(`${base}/api/health`).then(r => r.ok).catch(() => false)) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, `Server must start: ${output}`);
  const request = (raw = '') => fetch(`${base}/api/admin/logs`, { headers: { 'X-Telegram-Init-Data': raw } });
  assert.equal((await request()).status, 401);
  assert.equal((await request(signed(123))).status, 403);
  assert.equal((await request(signed(609701835, undefined, 'wrong'))).status, 401);
  const expired = await request(signed(609701835, Math.floor(Date.now() / 1000) - 90000));
  assert.equal(expired.status, 401);
  const callback = (id: number, chatId = id, secret = '') => fetch(`${base}/api/telegram/webhook`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'X-Telegram-Bot-Api-Secret-Token': secret },
    body: JSON.stringify({ callback_query: { id: 'test', from: { id }, data: 'admin:logs', message: { chat: { id: chatId } } } })
  });
  assert.equal((await callback(609701835)).status, 403, 'Forged admin update rejected');
  assert.equal((await callback(123, 123, 'test-webhook-secret')).status, 403, 'Non-admin rejected');
  assert.equal((await callback(609701835, -123, 'test-webhook-secret')).status, 403, 'Group chat rejected');
  const logs = await request(signed(609701835));
  assert.equal(logs.status, 200);
  assert.equal(logs.headers.get('cache-control'), 'private, no-store');
  const rows = await logs.json() as Array<{event:string;details:{reason?:string}}>;
  assert.ok(rows.some(row => row.details.reason === 'missing_init_data'));
  assert.ok(rows.some(row => row.details.reason === 'invalid_signature'));
  assert.ok(rows.some(row => row.details.reason === 'expired'));
  const stored = await fs.readFile(path.join(directory, 'diagnostics.json'), 'utf8');
  assert.ok(!stored.includes(token) && !stored.includes('Private Test Name') && !stored.includes('hash='));
  console.log('Diagnostics checks passed: auth reasons, admin access, spoofed webhook, private chat, persistence, secret exclusion.');
} finally {
  child.kill();
}
