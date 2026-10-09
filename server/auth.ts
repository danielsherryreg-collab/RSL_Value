import crypto from 'node:crypto';
import type { RequestHandler } from 'express';
import { logEvent } from './logs.js';

export interface TelegramUser { id: number; first_name: string; username?: string }
declare global { namespace Express { interface Request { telegramUser?: TelegramUser } } }

export function inspectInitData(raw: string, botToken: string, maxAgeSeconds = 86400): { user: TelegramUser | null; reason?: string; ageSeconds?: number } {
  const rejected = (reason: string, ageSeconds?: number) => ({ user: null, reason, ageSeconds });
  if (!raw) return rejected('missing_init_data');
  if (!botToken) return rejected('missing_bot_token');
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  const authDate = Number(params.get('auth_date'));
  const ageSeconds = Date.now() / 1000 - authDate;
  if (!hash || !authDate || !Number.isFinite(authDate)) return rejected('invalid_payload');
  if (ageSeconds < -300) return rejected('future_auth_date', Math.round(ageSeconds));
  if (ageSeconds > maxAgeSeconds) return rejected('expired', Math.round(ageSeconds));
  params.delete('hash');
  const dataCheckString = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');
  if (!/^[a-f0-9]{64}$/.test(hash) || !crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(expected))) return rejected('invalid_signature');
  try {
    const user = JSON.parse(params.get('user') || 'null') as TelegramUser | null;
    if (!user || !Number.isSafeInteger(user.id) || user.id <= 0 || typeof user.first_name !== 'string') return rejected('invalid_user');
    return { user };
  } catch { return rejected('invalid_user'); }
}

export function validateInitData(raw: string, botToken: string, maxAgeSeconds = 86400): TelegramUser | null {
  return inspectInitData(raw, botToken, maxAgeSeconds).user;
}

export const telegramAuth: RequestHandler = (req, res, next) => {
  const raw = String(req.header('X-Telegram-Init-Data') || '');
  const token = process.env.RSL_VALUE_BOT_TOKEN || process.env.BOT_TOKEN || '';
  const result = inspectInitData(raw, token);
  const user = result.user;
  if (user) { req.telegramUser = user; return next(); }
  if (process.env.ALLOW_DEV_AUTH === 'true' && process.env.NODE_ENV !== 'production') {
    req.telegramUser = { id: 10001, first_name: 'Dev', username: 'local_user' }; return next();
  }
  logEvent('warn', 'telegram_auth_rejected', { reason: result.reason!, route: req.route?.path || '/api', requestId: String(res.locals.requestId || ''), ...(result.ageSeconds !== undefined ? { ageSeconds: result.ageSeconds } : {}) });
  res.status(401).json({ error: raw ? 'Telegram-сессия недействительна. Откройте приложение заново через бота.' : 'Для отправки оффера откройте Mini App через Telegram.' });
};
