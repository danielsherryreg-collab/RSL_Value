import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import type { AuctionListing, Order, StoreOffer } from '../shared/types.js';
import { champions } from '../src/champions.js';
import { telegramAuth } from './auth.js';
import { getAuctions, getOffers, getOrders, getProducts, saveAuctions, saveOffers, saveOrders, saveProducts } from './store.js';
import { answerCallback, answerPreCheckout, createStarsInvoice, sendMessage } from './telegram.js';

const app = express(); const port = Number(process.env.PORT || 3001);
app.use(cors()); app.use(express.json({ limit: '12mb' }));
const publicAppUrl=()=>process.env.PUBLIC_APP_URL||(process.env.RAILWAY_PUBLIC_DOMAIN?`https://${process.env.RAILWAY_PUBLIC_DOMAIN}`:undefined);
const defaultAdminIds=[609701835,8097928728];
const adminIds=()=>Array.from(new Set([...defaultAdminIds,...String(process.env.ADMIN_TELEGRAM_IDS||'').split(',').map(x=>Number(x.trim())).filter(Number.isFinite)]));
const pendingAdminPriceInputs=new Map<number,string>();
const pendingAdminPublishInputs=new Map<number,{offerId:string;step:'title'|'price';title?:string}>();
const requireAdmin:express.RequestHandler=(req,res,next)=>adminIds().includes(req.telegramUser!.id)?next():res.status(403).json({error:'Доступ только для администратора'});
const normalizedOfferTitle=(value:string)=>value.toLocaleLowerCase('ru-RU').replace(/[^a-zа-яё0-9]+/gi,' ').trim();
const offerAccountKey=(item:StoreOffer)=>{const d=item.accountData;if(!d)return`${item.sellerTelegramUserId}|${normalizedOfferTitle(item.title)}`;return`${item.sellerTelegramUserId}|${d.level}|${Math.round(d.power*10)}|${d.legendaries}|${d.mythicals}|${d.voidLegendaries}|${[...d.champions].sort().join(',')}`};
function deduplicateOpenOffers(items:StoreOffer[]){const result:StoreOffer[]=[];let removed=0;for(const item of items){if(!['pending','active'].includes(item.status)){result.push(item);continue}const key=offerAccountKey(item);const index=result.findIndex(candidate=>['pending','active'].includes(candidate.status)&&offerAccountKey(candidate)===key);if(index<0){result.push(item);continue}const previous=result[index];const newest=new Date(item.createdAt)>=new Date(previous.createdAt)?item:previous;const lowestPrice=Math.min(previous.offerPriceRub,item.offerPriceRub);result[index]={...newest,id:previous.id,offerPriceRub:lowestPrice,status:previous.status==='active'&&item.status==='active'?'active':'pending',retailPriceRub:undefined,commissionRub:undefined,acceptedAt:undefined,acceptedByTelegramUserId:undefined,acceptedByUsername:undefined};removed++}return{items:result,removed}}
async function cleanupOfferDuplicates(){const current=await getOffers();const clean=deduplicateOpenOffers(current);if(clean.removed){await saveOffers(clean.items);console.log(`Removed duplicate offers: ${clean.removed}`)}}
const publicationPreview=(item:StoreOffer)=>({inline_keyboard:[[{text:'✅ Опубликовать',callback_data:`admin:confirm_publish:${item.id}`}],[{text:'✏️ Изменить название',callback_data:`admin:publish_title:${item.id}`},{text:'💰 Изменить цену',callback_data:`admin:publish_price:${item.id}`}],[{text:'← К офферу',callback_data:`admin:view_offer:${item.id}`}]]});
const reviewOfferMarkup=(item:StoreOffer)=>({inline_keyboard:[
  ...(item.images.length&&publicAppUrl()?[[{text:`🖼 Смотреть все скриншоты (${item.images.length})`,web_app:{url:`${publicAppUrl()}/#screens/${encodeURIComponent(item.id)}`}}]]:[]),
  ...(item.status==='pending'?[[{text:'💬 Предложить свою цену',callback_data:`admin:propose_price:${item.id}`}],[{text:'📢 Опубликовать',callback_data:`admin:publish_offer:${item.id}`}]]:[]),
  ...(item.sellerUsername?[[{text:'✉️ Написать продавцу',url:`https://t.me/${item.sellerUsername}`}]]:[]),
  [{text:'← К офферам',callback_data:'admin:offers'}]
]});
const defaultRetailPrice=(sellerPrice:number)=>Math.min(10_000_000,Math.max(1000,sellerPrice*2));
app.get('/api/health', (_req,res) => res.json({ ok:true }));
app.get('/api/products', async (_req,res) => res.json((await getProducts()).filter(p=>p.available)));

const analysisSchema=z.object({screens:z.array(z.object({slotId:z.string().max(40),label:z.string().max(100),image:z.string().startsWith('data:image/').max(1_500_000)})).min(1).max(30)});
app.post('/api/analysis/screens',telegramAuth,async(req,res)=>{
  const parsed=analysisSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Один из скриншотов слишком большой или повреждён'});
  const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)return res.status(503).json({error:'Автораспознавание ещё не подключено: администратору нужно добавить OPENAI_API_KEY в Railway. Скриншоты сохранены в форме и их можно отправить модератору.'});
  const fields={level:{type:'number'},power:{type:'number'},legendaries:{type:'number'},mythicals:{type:'number'},voidLegendaries:{type:'number'},sixStar:{type:'number'},greatHall:{type:'number'},factionWars:{type:'number'},gems:{type:'number'},sacred:{type:'number'},voidShards:{type:'number'},legendaryBooks:{type:'number'},champions:{type:'array',items:{type:'string'}},confidence:{type:'number'},marketReferenceRub:{type:'number'},purchaseEstimateRub:{type:'number'},progress:{type:'object',additionalProperties:false,properties:{arbiterMission:{type:'string'},ramantuMission:{type:'string'},mariusMission:{type:'string'},cursedCity:{type:'string'},clanBoss:{type:'string'},arena:{type:'string'},ironTwinsStage:{type:'number'},iceGolemStage:{type:'number'},spiderStage:{type:'number'},fireKnightStage:{type:'number'},sandDevilStage:{type:'number'},shogunStage:{type:'number'},gearScore:{type:'number'}},required:['arbiterMission','ramantuMission','mariusMission','cursedCity','clanBoss','arena','ironTwinsStage','iceGolemStage','spiderStage','fireKnightStage','sandDevilStage','shogunStage','gearScore']},notes:{type:'array',items:{type:'string'}}};
  const content:any[]=[{type:'input_text',text:'Проанализируй скриншоты аккаунта RAID: Shadow Legends. Каждый снимок подписан. Считывай только видимые значения, неизвестные числа возвращай как 0, неизвестный текст как unknown. Определи героев только из списка: taras, marichka, galathir, nais, rotos, siphi, narses, ankora, trunda, gnut, kymar, armanz. power укажи в миллионах. greatHall — суммарный показатель развития Большого зала, factionWars — звёзды. gearScore от 0 до 100 по качеству экипировки семи основных героев. Калибруй marketReferenceRub по примерам Raid Store: 39 000 ₽ = 3 мифика, 52 легендарных, сила 4.4М и Галатир+Наиз; 61 200 ₽ = 6 мификов, 146 легендарных, сила 16.1М; 113 600 ₽ = 5 мификов, 116 легендарных, сила 13.4М и Тарас+Маричка; 193 200 ₽ = 7 мификов, 186 легендарных, сила 21М, КБ/Гидра/Химера; 369 000 ₽ = 17 мификов, сила 25М, 12 сакралов, 35 первозданных и полный эндгейм. Учитывай экипировку, миссии, подземелья и ресурсы как корректировки между ориентирами. purchaseEstimateRub всегда равен marketReferenceRub * 0.12. Не выдумывай данные; сомнения перечисли в notes.'}];
  content.push({type:'input_text',text:`Расширенный допустимый каталог героев заменяет короткий список выше. Возвращай точные id: ${champions.map(champion=>`${champion.id}=${champion.name}/${champion.original}`).join('; ')}. Учитывай мифических и наиболее ценных легендарных героев при оценке.`});
  for(const screen of parsed.data.screens)content.push({type:'input_text',text:`Тип экрана: ${screen.label} (${screen.slotId})`},{type:'input_image',image_url:screen.image,detail:'high'});
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{authorization:`Bearer ${apiKey}`,'content-type':'application/json'},body:JSON.stringify({model:process.env.OPENAI_VISION_MODEL||'gpt-5.4-mini',store:false,input:[{role:'user',content}],text:{format:{type:'json_schema',name:'rsl_account_analysis',strict:true,schema:{type:'object',additionalProperties:false,properties:fields,required:Object.keys(fields)}}}})});
  const data=await response.json() as any;if(!response.ok)return res.status(502).json({error:data?.error?.message||'Vision API не смог обработать комплект'});
  const text=String(data.output_text||data.output?.flatMap((x:any)=>x.content||[]).find((x:any)=>x.type==='output_text')?.text||'');
  try{const analysis=JSON.parse(text);analysis.purchaseEstimateRub=Math.round(Number(analysis.marketReferenceRub||0)*.12);return res.json(analysis)}catch{return res.status(502).json({error:'Модель вернула неполный результат. Попробуйте уменьшить число скриншотов'})}
});

const auctionSchema=z.object({title:z.string().trim().min(5).max(100),description:z.string().trim().min(10).max(1200),images:z.array(z.string().startsWith('data:image/').max(4_500_000)).min(1).max(3),askingPriceRub:z.number().int().min(1000).max(10_000_000),estimatedPriceRub:z.number().int().min(0).max(10_000_000).optional()});
const bidSchema=z.object({amountRub:z.number().int().min(1000).max(10_000_000)});
app.get('/api/auctions',async(_req,res)=>res.json((await getAuctions()).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));
app.post('/api/auctions',telegramAuth,async(req,res)=>{const parsed=auctionSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Проверьте описание, цену и скриншоты'});const items=await getAuctions();const listing:AuctionListing={id:`lot_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,sellerTelegramUserId:req.telegramUser!.id,sellerUsername:req.telegramUser!.username,title:parsed.data.title,description:parsed.data.description,images:parsed.data.images,askingPriceRub:parsed.data.askingPriceRub,estimatedPriceRub:parsed.data.estimatedPriceRub,status:'active',createdAt:new Date().toISOString(),bids:[]};items.push(listing);await saveAuctions(items);res.status(201).json(listing)});
app.post('/api/auctions/:id/bids',telegramAuth,async(req,res)=>{const parsed=bidSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Минимальное предложение — 1 000 ₽'});const items=await getAuctions();const listing=items.find(x=>x.id===req.params.id);if(!listing)return res.status(404).json({error:'Лот не найден'});if(listing.status!=='active')return res.status(409).json({error:'Торги по лоту завершены'});if(listing.sellerTelegramUserId===req.telegramUser!.id)return res.status(403).json({error:'Нельзя предложить цену на свой лот'});listing.bids.push({id:`bid_${Date.now()}_${crypto.randomBytes(2).toString('hex')}`,telegramUserId:req.telegramUser!.id,username:req.telegramUser!.username,amountRub:parsed.data.amountRub,createdAt:new Date().toISOString(),status:'active'});await saveAuctions(items);res.status(201).json(listing)});
app.post('/api/auctions/:id/accept',telegramAuth,async(req,res)=>{const body=z.object({bidId:z.string()}).safeParse(req.body);if(!body.success)return res.status(400).json({error:'Некорректное предложение'});const items=await getAuctions();const listing=items.find(x=>x.id===req.params.id);if(!listing)return res.status(404).json({error:'Лот не найден'});if(listing.sellerTelegramUserId!==req.telegramUser!.id)return res.status(403).json({error:'Только продавец может принять цену'});const bid=listing.bids.find(x=>x.id===body.data.bidId&&x.status==='active');if(!bid)return res.status(404).json({error:'Предложение не найдено'});listing.status='deal';listing.acceptedBidId=bid.id;listing.bids.forEach(x=>x.status=x.id===bid.id?'accepted':'rejected');await saveAuctions(items);res.json(listing)});

const accountDataSchema=z.object({level:z.number(),power:z.number(),legendaries:z.number(),mythicals:z.number(),voidLegendaries:z.number(),sixStar:z.number(),greatHall:z.number(),factionWars:z.number(),clanBoss:z.string(),hydra:z.string(),arena:z.string(),gems:z.number(),energy:z.number(),silver:z.number(),sacred:z.number(),voidShards:z.number(),legendaryBooks:z.number(),champions:z.array(z.string()).max(430)});
const offerSchema=z.object({title:z.string().trim().max(100),description:z.string().trim().max(1200),images:z.array(z.string().startsWith('data:image/').max(10_000_000)).min(10).max(30),offerPriceRub:z.number().int().min(0).max(10_000_000),estimatedPriceRub:z.number().int().min(0).max(10_000_000),accountData:accountDataSchema});
app.get('/api/offers',async(_req,res)=>res.json((await getOffers()).filter(x=>x.status==='active').sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));
app.get('/api/offers/:id',async(req,res)=>{const item=(await getOffers()).find(x=>x.id===req.params.id&&x.status==='active');if(!item)return res.status(404).json({error:'Оффер не найден'});res.json(item)});
app.post('/api/offers',telegramAuth,async(req,res)=>{
  const parsed=offerSchema.safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Не удалось приложить скриншот. Попробуйте выбрать изображение ещё раз'});
  const flags:string[]=[];if(parsed.data.title.length<5)flags.push('Короткое или отсутствующее название');if(parsed.data.description.length<10)flags.push('Описание требует уточнения');if(parsed.data.offerPriceRub<1000)flags.push('Цена ниже рекомендуемого минимума');
  const clean=deduplicateOpenOffers(await getOffers());const items=clean.items;const incoming:StoreOffer={id:`offer_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`,sellerTelegramUserId:req.telegramUser!.id,sellerUsername:req.telegramUser!.username,sellerDisplayName:req.telegramUser!.first_name,title:parsed.data.title||'Аккаунт RSL без названия',description:parsed.data.description||'Описание не заполнено — требуется уточнение модератором',images:parsed.data.images,offerPriceRub:parsed.data.offerPriceRub,estimatedPriceRub:parsed.data.estimatedPriceRub,accountData:parsed.data.accountData,status:'pending',createdAt:new Date().toISOString(),moderationFlags:flags};
  const duplicateIndex=items.findIndex(item=>['pending','active'].includes(item.status)&&offerAccountKey(item)===offerAccountKey(incoming));const replaced=duplicateIndex>=0;let item=incoming;
  if(replaced){const previous=items[duplicateIndex];item={...incoming,id:previous.id,offerPriceRub:Math.min(previous.offerPriceRub,incoming.offerPriceRub)};items[duplicateIndex]=item}else items.push(item);
  await saveOffers(items);
  for(const id of adminIds()){sendMessage(id,`${replaced?'Повторный оффер обновлён':'Новый оффер'}: ${item.title}\nПродавец: ${item.sellerDisplayName}${item.sellerUsername?` (@${item.sellerUsername})`:''}\nTelegram ID: ${item.sellerTelegramUserId}\nМинимальная цена продавца: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽${flags.length?`\n⚠️ Требует внимания: ${flags.join('; ')}`:''}`,{inline_keyboard:[[{text:'Проверить оффер',callback_data:`admin:view_offer:${item.id}`}] ]}).catch(err=>console.error('Admin notification failed',err))}
  res.status(replaced?200:201).json(item)
});
app.get('/api/admin/session',telegramAuth,(req,res)=>res.json({isAdmin:adminIds().includes(req.telegramUser!.id)}));
app.get('/api/admin/offers/pending',telegramAuth,requireAdmin,async(_req,res)=>res.json((await getOffers()).filter(x=>x.status==='pending').reverse()));
app.get('/api/admin/offers/:id/screens',telegramAuth,requireAdmin,async(req,res)=>{const item=(await getOffers()).find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'Оффер не найден'});res.setHeader('Cache-Control','private, no-store');res.json({title:item.title,images:item.images})});
app.post('/api/admin/offers/:id/accept',telegramAuth,requireAdmin,async(req,res)=>{const parsed=z.object({commissionRub:z.number().int().min(0).max(10_000_000)}).safeParse(req.body);if(!parsed.success)return res.status(400).json({error:'Укажите корректную комиссию'});const items=await getOffers();const item=items.find(x=>x.id===req.params.id);if(!item)return res.status(404).json({error:'Оффер не найден'});if(item.status!=='pending')return res.status(409).json({error:'Оффер уже обработан'});item.status='active';item.commissionRub=parsed.data.commissionRub;item.retailPriceRub=item.offerPriceRub+parsed.data.commissionRub;item.acceptedAt=new Date().toISOString();item.acceptedByTelegramUserId=req.telegramUser!.id;item.acceptedByUsername=req.telegramUser!.username;await saveOffers(items);sendMessage(item.sellerTelegramUserId,`Оффер принят ✅\n${item.title}\nЦена в магазине: ${item.retailPriceRub.toLocaleString('ru-RU')} ₽`).catch(err=>console.error('Seller notification failed',err));res.json(item)});

const orderSchema = z.object({ lines:z.array(z.object({ productId:z.string(), quantity:z.number().int().min(1).max(10) })).min(1), promoCode:z.string().max(40).optional() });
app.get('/api/orders', telegramAuth, async (req,res) => res.json((await getOrders()).filter(o=>o.telegramUserId === req.telegramUser!.id).reverse()));
app.post('/api/orders', telegramAuth, async (req,res) => {
  const parsed = orderSchema.safeParse(req.body); if (!parsed.success) return res.status(400).json({error:'Некорректная корзина'});
  const products = await getProducts(); const orders = await getOrders();
  const selected = parsed.data.lines.map(line=>({line,product:products.find(p=>p.id===line.productId)}));
  if (selected.some(x=>!x.product?.available)) return res.status(409).json({error:'Один из аккаунтов уже продан'});
  const amountStars = selected.reduce((sum,x)=>sum + x.product!.priceStars*x.line.quantity,0);
  const order:Order = { id:`ord_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`, telegramUserId:req.telegramUser!.id, username:req.telegramUser!.username, lines:parsed.data.lines, amountStars, status:'pending', createdAt:new Date().toISOString() };
  orders.push(order); await saveOrders(orders);
  let invoiceLink: string | undefined;
  if (process.env.RSL_VALUE_BOT_TOKEN || process.env.BOT_TOKEN) invoiceLink = await createStarsInvoice(order.id, 'Заказ RAID STORE', `${selected.length} позиций. Заказ ${order.id}`, amountStars);
  res.status(201).json({order,invoiceLink});
});

app.post('/api/telegram/webhook', async (req,res) => {
  const update = req.body;
  const message = update.message;
  const callback = update.callback_query;
  const appUrl = publicAppUrl();
  const mainMenu=(userId:number)=>({inline_keyboard:[
    [{text:'📋 Мои офферы',callback_data:'menu:my_offers'},{text:'🛒 Магазин',web_app:{url:`${appUrl}/#market`}}],
    [{text:'➕ Создать оффер',web_app:{url:`${appUrl}/#estimate`}}],
    ...(adminIds().includes(userId)?[[{text:'🛡 Рассмотрение',callback_data:'admin:offers'},{text:'📦 Заказы',callback_data:'admin:orders'}],[{text:'🗑 Управление аккаунтами',callback_data:'admin:accounts'}]]:[])
  ]});
  if (message?.text && /^\/(?:start|menu)(?:@rsl_value_bot)?(?:\s|$)/i.test(message.text) && appUrl) {
    await sendMessage(message.chat.id, adminIds().includes(message.from.id)?'Панель RAID STORE. Вам доступны функции администратора.':'Добро пожаловать в RAID STORE! Здесь можно проверить статус оффера, оценить аккаунт или открыть магазин.', mainMenu(message.from.id));
  } else if ((message?.text === '/offers' || message?.text === '/sell') && appUrl) {
    await sendMessage(message.chat.id, message.text === '/sell' ? 'Загрузите скриншоты, оцените аккаунт и сформируйте оффер.' : 'Откройте витрину принятых офферов.', {
      inline_keyboard: [[{ text: message.text === '/sell' ? '➕ Создать оффер' : '🛒 Смотреть аккаунты', web_app: { url: `${appUrl}/#market` } }]]
    });
  } else if (message?.text === '/paysupport') {
    await sendMessage(message.chat.id, 'По вопросам оплаты напишите менеджеру: @theiamiam');
  } else if(message?.text&&message?.from&&pendingAdminPublishInputs.has(message.from.id)){
    const adminId=message.from.id;const draft=pendingAdminPublishInputs.get(adminId)!;const items=await getOffers();const item=items.find(x=>x.id===draft.offerId);
    if(!adminIds().includes(adminId)||!item||item.status!=='pending'){pendingAdminPublishInputs.delete(adminId);await sendMessage(message.chat.id,'Публикация недоступна: оффер уже обработан или нет прав администратора.');}
    else if(/^отмена$/i.test(message.text.trim())){pendingAdminPublishInputs.delete(adminId);await sendMessage(message.chat.id,'Редактирование публикации отменено.',{inline_keyboard:[[{text:'← К офферу',callback_data:`admin:view_offer:${item.id}`}]]});}
    else if(draft.step==='title'){
      const title=message.text.trim();if(title.length<5||title.length>100)await sendMessage(message.chat.id,'Название должно содержать от 5 до 100 символов. Отправьте новое название или «Отмена».');
      else{item.publicationDraft={title,retailPriceRub:item.publicationDraft?.retailPriceRub||defaultRetailPrice(item.offerPriceRub),adminTelegramUserId:adminId};await saveOffers(items);pendingAdminPublishInputs.delete(adminId);await sendMessage(message.chat.id,`Название изменено. Проверьте публикацию:\n\n${title}\nЦена продавцу: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽\nЦена в магазине: ${item.publicationDraft.retailPriceRub.toLocaleString('ru-RU')} ₽\nКомиссия магазина: ${(item.publicationDraft.retailPriceRub-item.offerPriceRub).toLocaleString('ru-RU')} ₽`,publicationPreview(item));}
    }else{
      const raw=message.text.trim().replace(/\s/g,'');const retailPriceRub=/^\d+$/.test(raw)?Number(raw):NaN;
      if(!Number.isInteger(retailPriceRub)||retailPriceRub<Math.max(1000,item.offerPriceRub)||retailPriceRub>10_000_000)await sendMessage(message.chat.id,`Введите цену магазина цифрами от ${Math.max(1000,item.offerPriceRub).toLocaleString('ru-RU')} до 10 000 000 ₽ или «Отмена».`);
      else{item.publicationDraft={title:draft.title||item.title,retailPriceRub,adminTelegramUserId:adminId};await saveOffers(items);pendingAdminPublishInputs.delete(adminId);await sendMessage(message.chat.id,`Проверьте перед публикацией:\n\n${item.publicationDraft.title}\nЦена продавцу: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽\nЦена в магазине: ${retailPriceRub.toLocaleString('ru-RU')} ₽\nКомиссия магазина: ${(retailPriceRub-item.offerPriceRub).toLocaleString('ru-RU')} ₽\n\nАккаунт ещё не опубликован.`,publicationPreview(item));}
    }
  } else if(message?.text&&message?.from&&pendingAdminPriceInputs.has(message.from.id)){
    const adminId=message.from.id;const offerId=pendingAdminPriceInputs.get(adminId)!;
    if(!adminIds().includes(adminId)){pendingAdminPriceInputs.delete(adminId);await sendMessage(message.chat.id,'Доступ только для администратора.');}
    else if(/^отмена$/i.test(message.text.trim())){pendingAdminPriceInputs.delete(adminId);await sendMessage(message.chat.id,'Ввод цены отменён.',{inline_keyboard:[[{text:'← К офферам',callback_data:'admin:offers'}]]});}
    else{const amount=Number(message.text.replace(/[^\d]/g,''));if(!Number.isInteger(amount)||amount<1000||amount>10_000_000)await sendMessage(message.chat.id,'Введите сумму от 1 000 до 10 000 000 ₽ только цифрами или напишите «Отмена».');else{const items=await getOffers();const item=items.find(x=>x.id===offerId);if(!item||item.status!=='pending'){pendingAdminPriceInputs.delete(adminId);await sendMessage(message.chat.id,'Оффер не найден или уже обработан.');}else{item.proposedPriceRub=amount;item.priceProposalStatus='pending';item.priceProposedAt=new Date().toISOString();item.priceProposedByTelegramUserId=adminId;item.priceProposedByUsername=message.from.username;await saveOffers(items);pendingAdminPriceInputs.delete(adminId);await sendMessage(item.sellerTelegramUserId,`Администратор предлагает новую стоимость за аккаунт:\n\n${item.title}\n\nВаша цена: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽\nПредложение администратора: ${amount.toLocaleString('ru-RU')} ₽`,{inline_keyboard:[[{text:'✅ Принять цену',callback_data:`seller:accept_price:${item.id}`}],[{text:'❌ Отказаться',callback_data:`seller:reject_price:${item.id}`}]]});await sendMessage(message.chat.id,`Предложение ${amount.toLocaleString('ru-RU')} ₽ отправлено продавцу.`,{inline_keyboard:[[{text:'Проверить оффер',callback_data:`admin:view_offer:${item.id}`}],[{text:'← К офферам',callback_data:'admin:offers'}]]});}}}
  }
  if(callback&&appUrl){
    const userId=callback.from.id;const chatId=callback.message?.chat.id||userId;const data=String(callback.data||'');const isAdmin=adminIds().includes(userId);
    await answerCallback(callback.id).catch(()=>undefined);
    if(data==='menu:my_offers'){
      const mine=(await getOffers()).filter(x=>x.sellerTelegramUserId===userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,10);
      const labels:Record<StoreOffer['status'],string>={pending:'⏳ На проверке',active:'✅ Опубликован',sold:'💰 Продан',cancelled:'❌ Отклонён'};
      const text=mine.length?`Ваши офферы:\n\n${mine.map(x=>`${labels[x.status]}\n${x.title}\nСумма продавцу: ${x.offerPriceRub.toLocaleString('ru-RU')} ₽${x.retailPriceRub?`\nЦена в магазине: ${x.retailPriceRub.toLocaleString('ru-RU')} ₽`:''}`).join('\n\n')}`:'У вас пока нет офферов.';
      await sendMessage(chatId,text,{inline_keyboard:[[{text:'➕ Создать оффер',web_app:{url:`${appUrl}/#estimate`}}],[{text:'← Главное меню',callback_data:'menu:home'}]]});
    }else if(data==='menu:home')await sendMessage(chatId,'Главное меню RAID STORE',mainMenu(userId));
    else if(data.startsWith('admin:publish_offer:')||data.startsWith('admin:publish_title:')||data.startsWith('admin:publish_price:')){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{pendingAdminPriceInputs.delete(userId);const action=data.startsWith('admin:publish_offer:')?'start':data.startsWith('admin:publish_title:')?'title':'price';const offerId=data.slice(action==='start'?'admin:publish_offer:'.length:action==='title'?'admin:publish_title:'.length:'admin:publish_price:'.length);const items=await getOffers();const item=items.find(x=>x.id===offerId&&x.status==='pending');
        if(!item)await sendMessage(chatId,'Оффер не найден или уже опубликован.');
        else if(item.priceProposalStatus==='pending')await sendMessage(chatId,'Сначала дождитесь ответа продавца на предложенную цену.');
        else if(item.images.length<10)await sendMessage(chatId,'Публикация недоступна: у оффера меньше 10 скриншотов.');
        else if(action==='start'){item.publicationDraft={title:item.publicationDraft?.title||item.title,retailPriceRub:item.publicationDraft?.retailPriceRub||defaultRetailPrice(item.offerPriceRub),adminTelegramUserId:userId};await saveOffers(items);await sendMessage(chatId,`Подготовка публикации:\n\n${item.publicationDraft.title}\nЦена продавцу: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽\nЦена в магазине: ${item.publicationDraft.retailPriceRub.toLocaleString('ru-RU')} ₽\nКомиссия магазина: ${(item.publicationDraft.retailPriceRub-item.offerPriceRub).toLocaleString('ru-RU')} ₽\n\nНазвание и цену можно изменить до публикации.`,publicationPreview(item));}
        else{pendingAdminPublishInputs.set(userId,{offerId,step:action});await sendMessage(chatId,action==='title'?`Отправьте новое название товара (5–100 символов) для «${item.title}» или «Отмена».`:`Отправьте новую цену магазина в рублях цифрами. Текущая: ${(item.publicationDraft?.retailPriceRub||defaultRetailPrice(item.offerPriceRub)).toLocaleString('ru-RU')} ₽, сумма продавцу: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽. Или «Отмена».`);}
      }
    }else if(data.startsWith('admin:confirm_publish:')){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const offerId=data.slice('admin:confirm_publish:'.length);const items=await getOffers();const item=items.find(x=>x.id===offerId);const draft=item?.publicationDraft;
        if(!item||item.status!=='pending'||!draft)await sendMessage(chatId,'Оффер уже обработан или подготовка публикации не найдена.');
        else if(draft.adminTelegramUserId!==userId)await sendMessage(chatId,'Подготовку публикации создал другой администратор. Откройте оффер и начните свою.');
        else if(item.priceProposalStatus==='pending'||item.images.length<10)await sendMessage(chatId,'Нельзя публиковать оффер до ответа продавца или без 10 скриншотов.');
        else if(draft.title.length<5||draft.title.length>100||!Number.isInteger(draft.retailPriceRub)||draft.retailPriceRub<Math.max(1000,item.offerPriceRub)||draft.retailPriceRub>10_000_000)await sendMessage(chatId,'Название или цена публикации некорректны. Измените их и повторите.');
        else{item.title=draft.title;item.retailPriceRub=draft.retailPriceRub;item.commissionRub=draft.retailPriceRub-item.offerPriceRub;item.status='active';item.acceptedAt=new Date().toISOString();item.acceptedByTelegramUserId=userId;item.acceptedByUsername=callback.from.username;delete item.publicationDraft;await saveOffers(items);await sendMessage(chatId,`Аккаунт опубликован ✅\n\n${item.title}\nЦена магазина: ${item.retailPriceRub.toLocaleString('ru-RU')} ₽\nКомиссия: ${item.commissionRub.toLocaleString('ru-RU')} ₽`,{inline_keyboard:[[{text:'🛒 Открыть магазин',web_app:{url:`${appUrl}/#market`}}],[{text:'← К рассмотрению',callback_data:'admin:offers'}]]});await sendMessage(item.sellerTelegramUserId,`Ваш аккаунт опубликован в RAID STORE ✅\n${item.title}\nЦена в магазине: ${item.retailPriceRub.toLocaleString('ru-RU')} ₽\nСумма продавцу: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽`).catch(error=>console.error('Seller notification failed',error));}
      }
    }else if(data.startsWith('admin:propose_price:')){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{pendingAdminPublishInputs.delete(userId);const offerId=data.slice('admin:propose_price:'.length);const item=(await getOffers()).find(x=>x.id===offerId&&x.status==='pending');if(!item)await sendMessage(chatId,'Оффер не найден или уже обработан.');else{pendingAdminPriceInputs.set(userId,offerId);await sendMessage(chatId,`Введите сумму, которую хотите предложить продавцу за «${item.title}».\n\nТекущая цена продавца: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽\n\nОтправьте сумму цифрами или напишите «Отмена».`);}}
    }else if(data.startsWith('seller:accept_price:')||data.startsWith('seller:reject_price:')){
      const accepting=data.startsWith('seller:accept_price:');const offerId=data.slice(accepting?'seller:accept_price:'.length:'seller:reject_price:'.length);const items=await getOffers();const item=items.find(x=>x.id===offerId);
      if(!item||item.sellerTelegramUserId!==userId)await sendMessage(chatId,'Это предложение недоступно.');
      else if(item.status!=='pending'||item.priceProposalStatus!=='pending'||!item.proposedPriceRub)await sendMessage(chatId,'Это предложение уже обработано.');
      else{item.priceProposalStatus=accepting?'accepted':'rejected';if(accepting)item.offerPriceRub=item.proposedPriceRub;await saveOffers(items);await sendMessage(chatId,accepting?`Вы приняли цену ${item.proposedPriceRub.toLocaleString('ru-RU')} ₽ ✅\nОффер вернулся администратору для завершения проверки.`:`Вы отклонили цену ${item.proposedPriceRub.toLocaleString('ru-RU')} ₽.`);for(const id of adminIds())await sendMessage(id,accepting?`Продавец принял предложенную цену ${item.proposedPriceRub.toLocaleString('ru-RU')} ₽ ✅\n${item.title}`:`Продавец отклонил предложенную цену ${item.proposedPriceRub.toLocaleString('ru-RU')} ₽.\n${item.title}`,{inline_keyboard:[[{text:'Проверить оффер',callback_data:`admin:view_offer:${item.id}`}]]}).catch(()=>undefined);}
    }else if(data.startsWith('admin:view_offer:')){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const offerId=data.slice('admin:view_offer:'.length);const item=(await getOffers()).find(x=>x.id===offerId);if(!item)await sendMessage(chatId,'Оффер не найден.');else{const d=item.accountData;const heroNames=d?.champions.map(id=>champions.find(champion=>champion.id===id)?.name||id).join(', ')||'не указаны';const details=d?`\n\n📊 ДАННЫЕ АККАУНТА\nУровень: ${d.level}\nСила: ${d.power} млн\nМифических: ${d.mythicals}\nЛегендарных: ${d.legendaries}\nЛегендарных Войд: ${d.voidLegendaries}\nГероев 6★: ${d.sixStar}\nКлючевые герои: ${heroNames}\nКлановый босс: ${d.clanBoss}\nГидра: ${d.hydra}\nАрена: ${d.arena}\nВойны фракций: ${d.factionWars}\nБольшой зал: ${d.greatHall}\nЭнергия: ${d.energy.toLocaleString('ru-RU')}\nСеребро: ${d.silver.toLocaleString('ru-RU')}\nРубины: ${d.gems.toLocaleString('ru-RU')}\nСакральные осколки: ${d.sacred}\nВойд-осколки: ${d.voidShards}\nЛегендарные книги: ${d.legendaryBooks}`:'\n\nПолная анкета отсутствует: оффер был создан до обновления.';const seller=`${item.sellerDisplayName||'Пользователь'}${item.sellerUsername?` (@${item.sellerUsername})`:''}`;const proposal=item.proposedPriceRub?`\nПредложение администратора: ${item.proposedPriceRub.toLocaleString('ru-RU')} ₽ (${item.priceProposalStatus==='accepted'?'принято':item.priceProposalStatus==='rejected'?'отклонено':'ожидает ответа'})`:'';await sendMessage(chatId,`📋 ОФФЕР НА ПРОВЕРКЕ\n\n${item.title}\n\n${item.description}\n\n👤 Продавец: ${seller}\nTelegram ID: ${item.sellerTelegramUserId}\nСумма продавцу: ${item.offerPriceRub.toLocaleString('ru-RU')} ₽\nОценка сервиса: ${item.estimatedPriceRub.toLocaleString('ru-RU')} ₽${proposal}${details}`,reviewOfferMarkup(item));}}
    }else if(data==='admin:offers'){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const items=(await getOffers()).filter(x=>x.status==='pending').slice(-10).reverse();const rows=items.map(item=>[{text:`Проверить: ${item.title.slice(0,34)}`,callback_data:`admin:view_offer:${item.id}`}]);await sendMessage(chatId,items.length?`Офферов на проверке: ${items.length}\n\n${items.map(x=>`• ${x.title} — ${x.offerPriceRub.toLocaleString('ru-RU')} ₽\n  ${x.sellerUsername?`@${x.sellerUsername}`:`ID ${x.sellerTelegramUserId}`}`).join('\n')}`:'Новых офферов на проверке нет.',{inline_keyboard:[...rows,[{text:'← Главное меню',callback_data:'menu:home'}]]});}
    }else if(data==='admin:accounts'){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const items=(await getOffers()).filter(x=>x.status==='active').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20);const rows=items.map(item=>[{text:`🗑 ${item.title} · ${(item.retailPriceRub||item.offerPriceRub).toLocaleString('ru-RU')} ₽`,callback_data:`admin:delete_offer:${item.id}`}]);await sendMessage(chatId,items.length?'Опубликованные аккаунты. Выберите аккаунт, который нужно удалить из магазина:':'В магазине пока нет опубликованных аккаунтов.',{inline_keyboard:[...rows,[{text:'🔄 Обновить список',callback_data:'admin:accounts'}],[{text:'← Главное меню',callback_data:'menu:home'}]]});}
    }else if(data.startsWith('admin:delete_offer:')){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const offerId=data.slice('admin:delete_offer:'.length);const item=(await getOffers()).find(x=>x.id===offerId&&x.status==='active');if(!item)await sendMessage(chatId,'Аккаунт уже удалён или не найден.',{inline_keyboard:[[{text:'← К аккаунтам',callback_data:'admin:accounts'}]]});else await sendMessage(chatId,`Удалить аккаунт из магазина?\n\n${item.title}\nЦена: ${(item.retailPriceRub||item.offerPriceRub).toLocaleString('ru-RU')} ₽\n\nЭто действие нельзя отменить.`,{inline_keyboard:[[{text:'✅ Да, удалить',callback_data:`admin:confirm_delete:${item.id}`}],[{text:'Отмена',callback_data:'admin:accounts'}]]});}
    }else if(data.startsWith('admin:confirm_delete:')){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const offerId=data.slice('admin:confirm_delete:'.length);const items=await getOffers();const item=items.find(x=>x.id===offerId&&x.status==='active');if(!item)await sendMessage(chatId,'Аккаунт уже удалён или не найден.',{inline_keyboard:[[{text:'← К аккаунтам',callback_data:'admin:accounts'}]]});else{await saveOffers(items.filter(x=>x.id!==offerId));await sendMessage(item.sellerTelegramUserId,`Аккаунт «${item.title}» снят с публикации администратором.`).catch(()=>undefined);await sendMessage(chatId,`Аккаунт «${item.title}» удалён из магазина.`,{inline_keyboard:[[{text:'← К аккаунтам',callback_data:'admin:accounts'}],[{text:'← Главное меню',callback_data:'menu:home'}]]});}}
    }else if(data==='admin:orders'){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const orders=(await getOrders()).filter(x=>!['completed','cancelled','refunded'].includes(x.status)).slice(-8).reverse();const rows=orders.flatMap(order=>[[{text:`${order.id} · ${order.status} · ${order.amountStars} ⭐`,callback_data:`admin:order:${order.id}`}]]);await sendMessage(chatId,orders.length?'Активные заказы. Нажмите на заказ для управления:':'Активных заказов нет.',{inline_keyboard:[...rows,[{text:'← Главное меню',callback_data:'menu:home'}]]});}
    }else if(data.startsWith('admin:order:')){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const orderId=data.slice('admin:order:'.length);const order=(await getOrders()).find(x=>x.id===orderId);if(!order)await sendMessage(chatId,'Заказ не найден.');else await sendMessage(chatId,`Заказ ${order.id}\nКлиент: @${order.username||order.telegramUserId}\nСтатус: ${order.status}\nСумма: ${order.amountStars} ⭐\nСоздан: ${new Date(order.createdAt).toLocaleString('ru-RU')}`,{inline_keyboard:[[{text:'🚚 Передаётся',callback_data:`admin:deliver:${order.id}`},{text:'✅ Завершить',callback_data:`admin:complete:${order.id}`}],[{text:'← К заказам',callback_data:'admin:orders'}]]});}
    }else if(data.startsWith('admin:deliver:')||data.startsWith('admin:complete:')){
      if(!isAdmin)await sendMessage(chatId,'Доступ только для администратора.');
      else{const completing=data.startsWith('admin:complete:');const orderId=data.slice(completing?'admin:complete:'.length:'admin:deliver:'.length);const orders=await getOrders();const order=orders.find(x=>x.id===orderId);if(!order)await sendMessage(chatId,'Заказ не найден.');else{order.status=completing?'completed':'delivering';await saveOrders(orders);await sendMessage(order.telegramUserId,completing?`Заказ ${order.id} завершён ✅`:`Заказ ${order.id} передан в работу 🚚`);await sendMessage(chatId,completing?'Заказ завершён ✅':'Статус изменён на «Передаётся» 🚚',{inline_keyboard:[[{text:'← К заказам',callback_data:'admin:orders'}]]});}}
    }
  }
  if (update.pre_checkout_query) {
    const orders=await getOrders(); const order=orders.find(o=>o.id===update.pre_checkout_query.invoice_payload && o.status==='pending');
    await answerPreCheckout(update.pre_checkout_query.id, Boolean(order), order ? undefined : 'Заказ недоступен');
  }
  const payment=message?.successful_payment;
  if (payment) {
    const orders=await getOrders(); const order=orders.find(o=>o.id===payment.invoice_payload);
    if (order && order.status==='pending') { order.status='paid'; order.paymentChargeId=payment.telegram_payment_charge_id; await saveOrders(orders); const products=await getProducts(); for(const line of order.lines){const product=products.find(p=>p.id===line.productId); if(product && product.category!=='donate') product.available=false;} await saveProducts(products); await sendMessage(order.telegramUserId,`Оплата получена ✅\nЗаказ ${order.id}. Менеджер скоро свяжется с вами.`); }
  }
  res.json({ok:true});
});

app.get('/api/admin/orders', async (req,res) => { if(req.header('authorization')!==`Bearer ${process.env.ADMIN_TOKEN}`) return res.status(401).json({error:'Unauthorized'}); res.json((await getOrders()).reverse()); });
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); app.use(express.static(path.join(root,'dist','web'))); app.get('/{*path}',(req,res,next)=>req.path.startsWith('/api/')?next():res.sendFile(path.join(root,'dist','web','index.html')));

async function startTelegramPolling(){
  const token=process.env.RSL_VALUE_BOT_TOKEN||process.env.BOT_TOKEN;if(!token||process.env.TELEGRAM_POLLING!=='true')return;
  let offset=0;let connected=false;const base=`https://api.telegram.org/bot${token}`;
  console.log('Telegram polling enabled');
  while(true){
    try{
      const response=await fetch(`${base}/getUpdates`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({offset,timeout:25,allowed_updates:['message','callback_query','pre_checkout_query']})});
      const data=await response.json() as {ok:boolean;result?:Array<{update_id:number}>;description?:string};
      if(!data.ok)throw new Error(data.description||'getUpdates failed');
      if(!connected){connected=true;console.log('Telegram polling connected')}
      for(const update of data.result||[]){
        console.log(`Telegram update received: ${update.update_id}`);
        const delivered=await fetch(`http://127.0.0.1:${port}/api/telegram/webhook`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(update)});
        if(!delivered.ok)throw new Error(`Local update handler returned ${delivered.status}`);
        console.log(`Telegram update handled: ${update.update_id}`);
        offset=update.update_id+1;
      }
    }catch(error){connected=false;console.error('Telegram polling error',error);await new Promise(resolve=>setTimeout(resolve,3000));}
  }
}

app.listen(port,()=>{console.log(`RAID STORE API: http://localhost:${port}`);void cleanupOfferDuplicates().catch(error=>console.error('Offer deduplication failed',error));void startTelegramPolling()});
