import { useEffect, useRef, useState } from 'react';
import type { StoreOffer } from '../shared/types';
import { api } from './api';

type Screen = { url: string; name: string; slotId?: string };
const requiredScreenIds=['clan_boss','hydra','profile_facebook'];
const interestLink=(item:StoreOffer)=>`https://t.me/theiamiam?text=${encodeURIComponent(`Заинтересовал аккаунт «${item.title}» (${item.retailPriceRub||item.offerPriceRub} ₽). Открыть оффер в боте: https://t.me/rsl_value_bot?start=${item.id}`)}`;
const fmt = (value: number) => new Intl.NumberFormat('ru-RU').format(Math.round(value));
const loadOfferDraft=()=>{try{return JSON.parse(localStorage.getItem('rsl-value-offer-draft')||'{}') as {title?:string;description?:string;price?:string}}catch{return{}}};
const toDataUrl = async (url: string, maxSide = 1000, quality = .58) => new Promise<string>((resolve, reject) => {
  const image = new Image();
  image.onload = () => {
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) return reject(new Error('Не удалось обработать изображение'));
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    resolve(canvas.toDataURL('image/jpeg', quality));
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
  const [zoom, setZoom] = useState<{src:string;title:string}>();
  const [details,setDetails]=useState<StoreOffer>();
  const [slides,setSlides]=useState<Record<string,number>>({});
  const touchStart=useRef(0);
  const missingRequired=requiredScreenIds.filter(id=>!screens.some(screen=>screen.slotId===id));
  const moveSlide=(item:StoreOffer,direction:number)=>setSlides(current=>{const total=item.images.length;const active=current[item.id]||0;return{...current,[item.id]:(active+direction+total)%total}});

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
    if (screens.length < 10) return setError(`Для проверки нужно минимум 10 скриншотов. Сейчас загружено: ${screens.length}`);
    if(missingRequired.length)return setError('Добавьте обязательные скриншоты: Клановый босс, Гидра и Профиль / привязка Facebook.');
    setBusyId('create'); setError('');
    try {
      let images = await Promise.all(screens.map(screen => toDataUrl(screen.url)));
      const encodedBytes = () => images.reduce((sum, image) => sum + Math.ceil((image.length - image.indexOf(',') - 1) * .75), 0);
      if (encodedBytes() > 8_000_000) images = await Promise.all(screens.map(screen => toDataUrl(screen.url, 760, .46)));
      if (encodedBytes() > 8_000_000) throw new Error('Комплект скриншотов превышает 8 МБ даже после сжатия. Удалите несколько повторяющихся изображений.');
      const item = await api.createOffer({
        title, description, images, screenshotSlotIds:screens.map(screen=>screen.slotId||''),
        offerPriceRub: Number(price), estimatedPriceRub: Math.round(estimateRub), accountData: accountData!
      });
      setCreated(item);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      setError(message || 'Не удалось создать оффер');
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
      <div className="admin-offer-images">{item.images.map((src, index) => <button type="button" className="image-preview-button" key={index} onClick={()=>setZoom({src,title:`Скриншот ${index+1}`})}><img src={src} alt="Скриншот аккаунта"/></button>)}</div>
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
    <div className="section-title"><div><span>{mode === 'buy' ? 'МАГАЗИН' : '03 / ОФФЕР'}</span><h2>{mode === 'buy' ? 'Купить аккаунт' : 'Отправить оффер'}</h2></div><p>{mode === 'buy' ? 'Аккаунты, принятые и опубликованные администраторами RAID STORE.' : 'После оценки отправьте аккаунт администраторам на проверку и публикацию.'}</p></div>

    {incoming && incoming.status === 'pending' && !isAdmin && <div className="incoming-offer pending"><div><span>ОФФЕР НА ПРОВЕРКЕ</span><h3>{incoming.title}</h3><p>Заявка доступна для принятия только администраторам RAID STORE.</p></div><div className="incoming-price"><small>Цена продавца</small><b>{fmt(incoming.offerPriceRub)} ₽</b></div></div>}
    {incoming?.status === 'active' && <div className="incoming-offer active"><div><span>ОФФЕР ОПУБЛИКОВАН</span><h3>{incoming.title}</h3><p>Администратор принял предложение, аккаунт уже находится в магазине.</p></div><div className="incoming-price"><small>Цена в магазине</small><b>{fmt(incoming.retailPriceRub || 0)} ₽</b></div></div>}

    {isAdmin && <div className="admin-queue"><div className="feed-head"><b>Очередь администратора</b><span>{pending.length} на проверке</span></div>{!pending.length && <div className="feed-empty">Новых офферов пока нет.</div>}{pending.map(adminCard)}</div>}

    <div className="market-layout">
      <div className="listing-form"><div className="market-label">СОСТАВИТЬ ОФФЕР</div><h3>Предложить аккаунт</h3><p>{screens.length >= 10 ? `Скриншотов в оффере: ${screens.length}` : `Загрузите ещё ${10-screens.length} скриншот(а). Минимум — 10`}{missingRequired.length>0&&` · обязательных не хватает: ${missingRequired.length}`}</p><input placeholder="Название аккаунта" value={title} onChange={event => setTitle(event.target.value)} /><textarea placeholder="Ключевые герои, связки, прогресс и условия передачи" value={description} onChange={event => setDescription(event.target.value)} /><label><span>Сумма, которую вы хотите получить</span><div><input type="number" min="0" value={price} onChange={event => setPrice(event.target.value)} /><b>₽</b></div></label><small>Оценка сервиса: {fmt(estimateRub)} ₽. Обязательны минимум 10 снимков, включая Кланового босса, Гидру и профиль / привязку Facebook.</small><button disabled={busyId === 'create' || screens.length < 10 || missingRequired.length>0 || Number(price) < 0} onClick={publish}>{busyId === 'create' ? 'Отправляем…' : 'Предложить аккаунт'} <span>→</span></button>{error && <div className="market-error">{error}</div>}{created && <div className="offer-ready"><b>Оффер отправлен</b><p>{created.moderationFlags?.length?'Заявка передана на модерацию с пометкой «Требует внимания».':'Администраторы получили уведомление. После принятия аккаунт автоматически появится в магазине.'}</p></div>}</div>
      <div className="market-feed"><div className="feed-head"><b>Магазин аккаунтов</b><span>{offers.length} предложений</span></div>{!offers.length && <div className="feed-empty">Принятых офферов пока нет. После подтверждения первый аккаунт появится здесь автоматически.</div>}{offers.map(item => {const active=Math.min(slides[item.id]||0,Math.max(0,item.images.length-1));const src=item.images[active];return <article className="store-card" key={item.id} onClick={()=>setDetails(item)}><div className="auction-images store-carousel" onTouchStart={event=>{touchStart.current=event.touches[0].clientX}} onTouchEnd={event=>{const delta=event.changedTouches[0].clientX-touchStart.current;if(Math.abs(delta)>45)moveSlide(item,delta>0?-1:1)}}>{src&&<button type="button" className="image-preview-button" onClick={event=>{event.stopPropagation();setZoom({src,title:`${item.title} · скриншот ${active+1}`})}}><img src={src} alt={`Скриншот аккаунта ${active+1}`}/></button>}<span>В ПРОДАЖЕ</span>{item.images.length>1&&<><button type="button" className="carousel-arrow previous" aria-label="Предыдущий скриншот" onClick={event=>{event.stopPropagation();moveSlide(item,-1)}}>‹</button><button type="button" className="carousel-arrow next" aria-label="Следующий скриншот" onClick={event=>{event.stopPropagation();moveSlide(item,1)}}>›</button><b className="carousel-count">{active+1} / {item.images.length}</b></>}</div><div className="auction-body"><div className="seller">Проверено RAID STORE</div><h3>{item.title}</h3><div className="store-price"><small>Цена в магазине</small><b>{fmt(item.retailPriceRub || item.offerPriceRub)} ₽</b></div><button className="buy-interest" onClick={event=>{event.stopPropagation();setDetails(item)}}>Читать описание <span>→</span></button></div></article>})}</div>
    </div>
    {zoom&&<div className="image-lightbox" role="dialog" aria-modal="true" aria-label={zoom.title} onClick={()=>setZoom(undefined)}><button type="button" aria-label="Закрыть" onClick={()=>setZoom(undefined)}>×</button><img src={zoom.src} alt={zoom.title} onClick={event=>event.stopPropagation()}/><span>{zoom.title}</span></div>}
    {details&&<div className="product-details" role="dialog" aria-modal="true" onClick={()=>setDetails(undefined)}><article onClick={event=>event.stopPropagation()}><button type="button" className="details-close" aria-label="Закрыть" onClick={()=>setDetails(undefined)}>×</button><div className="details-gallery">{details.images.map((src,index)=><button type="button" key={index} onClick={()=>setZoom({src,title:`${details.title} · скриншот ${index+1}`})}><img src={src} alt={`Скриншот ${index+1}`} loading="lazy"/></button>)}</div><div className="details-content"><span>ПРОВЕРЕНО RAID STORE</span><h2>{details.title}</h2><p>{details.description}</p><ul className="details-benefits"><li>Можно изменить почту и пароль</li><li>Без привязки к ФБ</li><li>Аккаунт со 100% гарантией</li></ul>{details.accountData&&<div className="details-stats"><b>Уровень <strong>{details.accountData.level}</strong></b><b>Сила <strong>{details.accountData.power} млн</strong></b><b>Мифических <strong>{details.accountData.mythicals}</strong></b><b>Легендарных <strong>{details.accountData.legendaries}</strong></b><b>Клановый босс <strong>{details.accountData.clanBoss}</strong></b><b>Гидра <strong>{details.accountData.hydra}</strong></b></div>}<div className="details-price"><small>Цена</small><b>{fmt(details.retailPriceRub||details.offerPriceRub)} ₽</b></div><button type="button" className="buy-interest" onClick={()=>window.Telegram?.WebApp.openTelegramLink?.(interestLink(details))}>Заинтересовал аккаунт <span>→</span></button></div></article></div>}
  </section>;
}
