import crypto from 'node:crypto';
import type { RequestHandler } from 'express';

export interface TelegramUser { id: number; first_name: string; username?: string }
declare global { namespace Express { interface Request { telegramUser?: TelegramUser } } }

export function validateInitData(raw: string, botToken: string, maxAgeSeconds = 86400): TelegramUser | null {
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  if (!hash || !authDate || Math.abs(Date.now() / 1000 - authDate) > maxAgeSeconds) return null;
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (hash.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return null;
  try { return JSON.parse(params.get('user') || 'null') as TelegramUser | null; } catch { return null; }
}

export const telegramAuth: RequestHandler = (req, res, next) => {
  const raw = String(req.header('X-Telegram-Init-Data') || '');
  const token = process.env.BOT_TOKEN || '';
  const user = token && raw ? validateInitData(raw, token) : null;
  if (user) { req.telegramUser = user; return next(); }
  if (process.env.ALLOW_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    req.telegramUser = { id: 10001, first_name: 'Dev', username: 'local_user' }; return next();
  }
  res.status(401).json({ error: 'Откройте приложение через Telegram' });
};
