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

export async function sendImageAlbums(chatId:number, images:string[]) {
  for(let start=0;start<images.length;start+=10){
    const chunk=images.slice(start,start+10);const form=new FormData();form.set('chat_id',String(chatId));
    const media=chunk.map((dataUrl,index)=>{const match=dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);if(!match)throw new Error('Invalid image data');const name=`photo${index}`;form.append(name,new Blob([Buffer.from(match[2],'base64')],{type:match[1]}),`${name}.${match[1].includes('png')?'png':'jpg'}`);return{type:'photo',media:`attach://${name}`}});
    form.set('media',JSON.stringify(media));const token=process.env.BOT_TOKEN;if(!token)throw new Error('BOT_TOKEN is not configured');const response=await fetch(`${apiBase(token)}/sendMediaGroup`,{method:'POST',body:form});const result=await response.json() as {ok:boolean;description?:string};if(!result.ok)throw new Error(result.description||'Telegram media error');
  }
}

export const answerCallback = (id: string, text?: string) => callTelegram<boolean>('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
