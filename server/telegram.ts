const apiBase = (token: string) => `https://api.telegram.org/bot${token}`;

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = process.env.BOT_TOKEN;
  if (!token) throw new Error('BOT_TOKEN is not configured');
  const response = await fetch(`${apiBase(token)}/${method}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json() as { ok: boolean; result: T; description?: string };
  if (!result.ok) throw new Error(result.description || 'Telegram API error');
  return result.result;
}

export const createStarsInvoice = (orderId: string, title: string, description: string, amount: number) => callTelegram<string>('createInvoiceLink', {
  title, description, payload: orderId, currency: 'XTR', prices: [{ label: title, amount }]
});

export const answerPreCheckout = (id: string, ok: boolean, errorMessage?: string) => callTelegram<boolean>('answerPreCheckoutQuery', { pre_checkout_query_id: id, ok, ...(errorMessage ? { error_message: errorMessage } : {}) });

export const sendMessage = (chatId: number, text: string, replyMarkup?: Record<string, unknown>) => callTelegram('sendMessage', { chat_id: chatId, text, ...(replyMarkup ? { reply_markup: replyMarkup } : {}) });

export const answerCallback = (id: string, text?: string) => callTelegram<boolean>('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
