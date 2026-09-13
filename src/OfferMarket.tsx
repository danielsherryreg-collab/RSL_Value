import { useEffect, useState } from 'react';
import type { StoreOffer } from '../shared/types';
import { api } from './api';

type Screen = { url: string; name: string };
const fmt = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value));
const loadOfferDraft=()=>{try{return JSON.parse(localStorage.getItem('rsl-value-offer-draft')||'{}') as {title?:string;description?:string;price?:string}}catch{return{}}};
const toDataUrl = async (url: string) => new Promise<string>((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const maxSide = 1600;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return reject(new Error('Не удалось обработать изображение'));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/jpeg', .78));
  };
  image.onerror = () => reject(new Error('Не удалось прочитать скриншот'));
  image.src = url;
});

export default function OfferMarket({ screens, estimateRub, accountData, mode = 'all' }: { screens: Screen[]; estimateRub: number; accountData?: NonNullable<StoreOffer['accountData']>; mode?: 'all' | 'sell' | 'buy' }) {
  const [draft] = useState(loadOfferDraft);
  const [offers, setOffers] = useState<StoreOffer[]>([]);
  const [pending, setPending] = useState<StoreOffer[]>([]);
  const [incoming, setIncoming] = useState<StoreOffer>();
  const [created, setCreated] = useState<StoreOffer>();
  const [isAdmin, setIsAdmin] = useState(false);
  const [title, setTitle] = useState(draft.title || '');
  const [description, setDescription] = useState(draft.description || '');
  const [price, setPrice] = useState(draft.price || '');
  const [commissions, setCommissions] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const loadOffers = () => api.offers().then(setOffers).catch(error => setError(error.message));
  const loadPending = () => api.pendingOffers().then(setPending).catch(error => setError(error.message));

  useEffect(() => {
    loadOffers();
    api.adminSession().then(session => {
      setIsAdmin(session.isAdmin);
      if (session.isAdmin) loadPending();
    }).catch(() => undefined);
    const param = window.Telegram?.WebApp.initDataUnsafe?.start_param
      || new URLSearchParams(location.search).get('tgWebAppStartParam') || '';
    if (param.startsWith('offer_')) api.offer(param).then(setIncoming).catch(() => undefined);
  }, []);

  useEffect(() => setPrice(current => current || String(Math.round(estimateRub))), [estimateRub]);
  useEffect(() => { if(mode === 'sell') localStorage.setItem('rsl-value-offer-draft', JSON.stringify({title,description,price})) }, [mode,title,description,price]);
  useEffect(() => { const fill=(event:Event)=>{const detail=(event as CustomEvent<{title:string;description:string}>).detail;if(detail){setTitle(detail.title);setDescription(detail.description)}};window.addEventListener('rsl-generate-offer',fill);return()=>window.removeEventListener('rsl-generate-offer',fill) }, []);

  const publish = async () => {
    if (!screens.length) return setError('Сначала загрузите хотя бы один скриншот');
    setBusyId('create'); setError('');
    try {
      const images = await Promise.all(screens.map(screen => toDataUrl(screen.url)));
      const item = await api.createOffer({
        title, description, images,
        offerPriceRub: Number(price), estimatedPriceRub: Math.round(estimateRub), accountData: accountData!
      });
      setCreated(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setError(message === 'Failed to fetch' || message === 'Load failed'
        ? 'Не удалось связаться с сервером. Закройте Mini App, откройте его через /start и повторите отправку.'
        : message || 'Не удалось создать оффер');
    } finally { setBusyId(''); }
  };

  const accept = async (item: StoreOffer) => {
    const commissionRub = Number(commissions[item.id]);
    if (!Number.isFinite(commissionRub) || commissionRub < 0) return setError('Укажите сумму комиссии');
    setBusyId(item.id); setError('');
    try {
      const updated = await api.acceptOffer(item.id, commissionRub);
      setPending(items => items.filter(offer => offer.id !== item.id));
      if (incoming?.id === item.id) setIncoming(updated);
      await loadOffers();
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Не удалось принять оффер');
    } finally { setBusyId(''); }
  };

  const adminCard = (item: StoreOffer) => {
    const commission = Number(commissions[item.id] || 0);
    return <article className="admin-offer" key={item.id}>
      <div className="admin-offer-images">{item.images.map((src, index) => <img src={src} alt="Скриншот аккаунта" key={index} />)}</div>
      <div className="admin-offer-main">
        <span>ОФФЕР НА ПРОВЕРКЕ</span><h3>{item.title}</h3><p>{item.description}</p>
        {!!item.moderationFlags?.length && <div className="moderation-warning"><b>⚠ ТРЕБУЕТ ВНИМАНИЯ МОДЕРАТОРА</b>{item.moderationFlags.map(flag => <span key={flag}>• {flag}</span>)}</div>}
        <div className="admin-price-row"><small>Продавцу</small><b>{fmt(item.offerPriceRub)} ₽</b></div>
        <label className="commission-field"><span>Комиссия магазина</span><div><input type="number" min="0" placeholder="Например, 25 000" value={commissions[item.id] || ''} onChange={event => setCommissions(values => ({ ...values, [item.id]: event.target.value }))} /><b>₽</b></div></label>
        <div className="admin-total"><small>Цена публикации</small><strong>{fmt(item.offerPriceRub + commission)} ₽</strong></div>
        <button className="admin-accept" disabled={busyId === item.id || commissions[item.id] === undefined || commissions[item.id] === ''} onClick={() => accept(item)}>{busyId === item.id ? 'Публикуем…' : 'Принять и опубликовать'} <span>→</span></button>
      </div>
    </article>;
  };

  return <section className={`market offer-market ${mode === 'buy' ? 'buy-only' : mode === 'sell' ? 'sell-only' : ''}`} id="market">
    <div className="section-title"><div><span>{mode === 'buy' ? 'МАГАЗИН' : '03 / ОФФЕР'}</span><h2>{mode === 'buy' ? 'Купить аккаунт' : 'Отправить оффер'}</h2></div><p>{mode === 'buy' ? 'Аккаунты, принятые и опубликованные администраторами RSL Value.' : 'После оценки отправьте аккаунт администраторам на проверку и публикацию.'}</p></div>

    {incoming && incoming.status === 'pending' && !isAdmin && <div className="incoming-offer pending"><div><span>ОФФЕР НА ПРОВЕРКЕ</span><h3>{incoming.title}</h3><p>Заявка доступна для принятия только администраторам RSL Value.</p></div><div className="incoming-price"><small>Цена продавца</small><b>{fmt(incoming.offerPriceRub)} ₽</b></div></div>}
    {incoming?.status === 'active' && <div className="incoming-offer active"><div><span>ОФФЕР ОПУБЛИКОВАН</span><h3>{incoming.title}</h3><p>Администратор принял предложение, аккаунт уже находится в магазине.</p></div><div className="incoming-price"><small>Цена в магазине</small><b>{fmt(incoming.retailPriceRub || 0)} ₽</b></div></div>}

    {isAdmin && <div className="admin-queue"><div className="feed-head"><b>Очередь администратора</b><span>{pending.length} на проверке</span></div>{!pending.length && <div className="feed-empty">Новых офферов пока нет.</div>}{pending.map(adminCard)}</div>}

    <div className="market-layout">
      <div className="listing-form"><div className="market-label">СОСТАВИТЬ ОФФЕР</div><h3>Предложить аккаунт</h3><p>{screens.length ? `Скриншотов в оффере: ${screens.length}` : 'Загрузите 1–3 скриншота выше'}</p><input placeholder="Название аккаунта" value={title} onChange={event => setTitle(event.target.value)} /><textarea placeholder="Ключевые герои, связки, прогресс и условия передачи" value={description} onChange={event => setDescription(event.target.value)} /><label><span>Сумма, которую вы хотите получить</span><div><input type="number" min="0" value={price} onChange={event => setPrice(event.target.value)} /><b>₽</b></div></label><small>Оценка сервиса: {fmt(estimateRub)} ₽. Даже неполная заявка уйдёт на модерацию с соответствующей пометкой.</small><button disabled={busyId === 'create' || !screens.length || Number(price) < 0} onClick={publish}>{busyId === 'create' ? 'Отправляем…' : 'Предложить аккаунт'} <span>→</span></button>{error && <div className="market-error">{error}</div>}{created && <div className="offer-ready"><b>Оффер отправлен</b><p>{created.moderationFlags?.length?'Заявка передана на модерацию с пометкой «Требует внимания».':'Администраторы получили уведомление. После принятия аккаунт автоматически появится в магазине.'}</p></div>}</div>
      <div className="market-feed"><div className="feed-head"><b>Магазин аккаунтов</b><span>{offers.length} предложений</span></div>{!offers.length && <div className="feed-empty">Принятых офферов пока нет. После подтверждения первый аккаунт появится здесь автоматически.</div>}{offers.map(item => <article className="store-card" key={item.id}><div className="auction-images">{item.images.map((src, index) => <img src={src} alt="Скриншот аккаунта" key={index} />)}<span>В ПРОДАЖЕ</span></div><div className="auction-body"><div className="seller">Проверено RSL Value</div><h3>{item.title}</h3><p>{item.description}</p><div className="store-price"><small>Цена в магазине</small><b>{fmt(item.retailPriceRub || item.offerPriceRub)} ₽</b>{typeof item.commissionRub === 'number' && <span>Сумма продавцу {fmt(item.offerPriceRub)} ₽ + комиссия {fmt(item.commissionRub)} ₽</span>}</div><button className="buy-interest" onClick={() => window.Telegram?.WebApp.openTelegramLink?.('https://t.me/rsl_value_bot')}>Заинтересовал аккаунт <span>→</span></button></div></article>)}</div>
    </div>
  </section>;
}
