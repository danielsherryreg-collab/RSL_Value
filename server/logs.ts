import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type LogEntry = { time: string; level: 'info' | 'warn' | 'error'; event: string; details: Record<string, string | number> };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(process.env.DATA_DIR || path.join(root, 'data'), 'diagnostics.json');
const allowedKeys = new Set(['reason', 'route', 'method', 'status', 'durationMs', 'requestId', 'ageSeconds', 'operation']);
let entries: LogEntry[] = [];
let queue = Promise.resolve();
const ready = fs.readFile(file, 'utf8').then(raw => { entries = JSON.parse(raw).slice(-500); }).catch(() => undefined);

export function logEvent(level: LogEntry['level'], event: string, details: LogEntry['details'] = {}) {
  const safe = Object.fromEntries(Object.entries(details).filter(([key]) => allowedKeys.has(key)));
  const entry: LogEntry = { time: new Date().toISOString(), level, event, details: safe };
  console.log(JSON.stringify(entry));
  queue = queue.then(async () => {
    await ready;
    entries.push(entry);
    entries = entries.slice(-500);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(`${file}.tmp`, JSON.stringify(entries));
    await fs.rename(`${file}.tmp`, file);
  }).catch(() => { console.error('Diagnostic log persistence failed'); });
}

export async function recentLogs(errorsOnly = false, limit = 10) {
  await ready;
  await queue;
  return entries.filter(entry => !errorsOnly || entry.level !== 'info').slice(-limit).reverse();
}

export async function formatLogs(errorsOnly = false) {
  const rows = await recentLogs(errorsOnly);
  const labels: Record<string, string> = {
    missing_init_data: 'Telegram не передал данные входа', missing_bot_token: 'Токен бота не настроен',
    invalid_payload: 'Некорректные данные входа', expired: 'Сессия старше 24 часов',
    future_auth_date: 'Время входа находится в будущем', invalid_signature: 'Подпись не совпала: проверьте токен бота',
    invalid_user: 'В данных входа отсутствует корректный пользователь'
  };
  return (`📋 Логи RAID STORE · время UTC\nПоследние ${rows.length} записей, хранится до 500.\n\n` + rows.map(row =>
    `${row.time.slice(0, 19).replace('T', ' ')} [${row.level}] ${row.event}\n${Object.entries(row.details).map(([key, value]) => `${key}: ${key === 'reason' ? labels[String(value)] || value : value}`).join(' · ')}`
  ).join('\n\n') || 'Логов пока нет.').slice(0, 3900);
}
