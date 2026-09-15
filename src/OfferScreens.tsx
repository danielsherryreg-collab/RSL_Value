import { useEffect, useState } from 'react';
import { api } from './api';
import './offer-screens.css';

export default function OfferScreens({offerId}:{offerId:string}){
  const [data,setData]=useState<{title:string;images:string[]}|null>(null);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState(0);
  useEffect(()=>{let active=true;setData(null);setError('');setSelected(0);api.offerScreens(offerId).then(value=>{if(active)setData(value)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'Не удалось открыть скриншоты')});return()=>{active=false}},[offerId]);
  return <main className="offer-screens"><a href="#home" className="screens-back">← Назад</a><div className="screens-heading"><span>ОФФЕР / СКРИНШОТЫ</span><h1>{data?.title||'Просмотр скриншотов'}</h1><p>{data?`Все ${data.images.length} снимков в одной галерее. Ничего скачивать не нужно.`:'Галерея доступна только администраторам.'}</p></div>{error&&<div className="screens-error">{error}</div>}{!data&&!error&&<p className="screens-loading">Загружаем галерею…</p>}{data&&<><div className="screens-main">{data.images.length>0&&<img src={data.images[selected]} alt={`Скриншот ${selected+1} из ${data.images.length}`}/>}</div><div className="screens-controls"><button type="button" disabled={selected===0} onClick={()=>setSelected(selected-1)}>← Предыдущий</button><span>{selected+1} / {data.images.length}</span><button type="button" disabled={selected>=data.images.length-1} onClick={()=>setSelected(selected+1)}>Следующий →</button></div><div className="screens-grid">{data.images.map((src,index)=><button key={index} type="button" className={selected===index?'active':''} onClick={()=>{setSelected(index);document.querySelector('.screens-main')?.scrollIntoView({behavior:'smooth',block:'start'})}} aria-label={`Открыть скриншот ${index+1}`}><img src={src} alt={`Миниатюра ${index+1}`} loading="lazy"/><span>{index+1}</span></button>)}</div></>}</main>;
}
