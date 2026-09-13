import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

export type Screen = { url: string; name: string; slotId: string };
export type AutoFillData = {
  level: number; power: number; legendaries: number; mythicals: number; voidLegendaries: number;
  sixStar: number; greatHall: number; factionWars: number; gems: number; sacred: number;
  voidShards: number; legendaryBooks: number; champions: string[]; confidence: number;
  marketReferenceRub: number; purchaseEstimateRub: number;
  progress: Record<string, string | number | boolean>; notes: string[];
};

type Slot = { id: string; title: string; hint: string; group: string };
const slots: Slot[] = [
  ...[1,2,3].map(n=>({id:`heroes_${n}`,title:`Герои · экран ${n}`,hint:'Коллекция, сортировка по редкости',group:'Герои'})),
  {id:'great_hall',title:'Большой зал',hint:'Все бонусы и уровни',group:'Прогресс'},
  {id:'summon_portal',title:'Портал призыва',hint:'Количество всех осколков',group:'Ресурсы'},
  {id:'mission_arbiter',title:'Миссии · Арбитр',hint:'Текущий этап цепочки',group:'Миссии'},
  {id:'mission_ramantu',title:'Миссии · Романту',hint:'Текущий этап цепочки',group:'Миссии'},
  {id:'mission_marius',title:'Миссии · Мариус',hint:'Текущий этап цепочки',group:'Миссии'},
  {id:'game_modes',title:'Режимы игры и ресурсы',hint:'Главный экран с энергией, серебром и рубинами',group:'Ресурсы'},
  {id:'faction_wars',title:'Войны фракций',hint:'Количество звёзд',group:'Прогресс'},
  {id:'cursed_city',title:'Проклятый город',hint:'Сложность и прогресс ротации',group:'Прогресс'},
  {id:'iron_twins',title:'Крепость двуликого стража',hint:'Максимальный пройденный этап',group:'Подземелья'},
  {id:'ice_golem',title:'Плато Ледяного голема',hint:'Максимальный этап',group:'Подземелья'},
  {id:'spider',title:'Гнездо Паучихи',hint:'Максимальный этап',group:'Подземелья'},
  {id:'fire_knight',title:'Замок Лавового рыцаря',hint:'Максимальный этап',group:'Подземелья'},
  {id:'sand_devil',title:'Склеп Дьявола пустыни',hint:'Максимальный этап',group:'Подземелья'},
  {id:'shogun',title:'Роща призрачного Сёгуна',hint:'Максимальный этап',group:'Подземелья'},
  ...[1,2,3,4,5,6,7].map(n=>({id:`gear_${n}`,title:`Экипировка героя ${n}`,hint:'Все артефакты и основные характеристики',group:'Экипировка'})),
  {id:'tavern_level',title:'Таверна · повышение уровня',hint:'Запас пива и героев-корма',group:'Таверна'},
  {id:'tavern_rank',title:'Таверна · повышение ранга',hint:'Запас героев для ранга',group:'Таверна'},
  {id:'tavern_skills',title:'Таверна · улучшение навыков',hint:'Книги редкости',group:'Таверна'},
  {id:'tavern_ascend',title:'Таверна · развитие',hint:'Зелья и материалы',group:'Таверна'},
  {id:'profile_frames',title:'Рамки профиля',hint:'Все доступные редкие и событийные рамки',group:'Рамки и аватары'},
  {id:'profile_avatars',title:'Аватары профиля',hint:'Все доступные редкие и событийные аватары',group:'Рамки и аватары'}
];

const compress = (file: File) => new Promise<string>((resolve,reject)=>{
  const url=URL.createObjectURL(file);const image=new Image();
  image.onload=()=>{const scale=Math.min(1,1200/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const context=canvas.getContext('2d');if(!context){URL.revokeObjectURL(url);return reject(new Error('Не удалось обработать изображение'))}context.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/jpeg',.72))};
  image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Не удалось прочитать изображение'))};image.src=url;
});

export default function ScreenshotAnalyzer({onApply,onScreensChange}:{onApply:(data:AutoFillData)=>void;onScreensChange:(screens:Screen[])=>void}){
  const[files,setFiles]=useState<Record<string,{name:string;preview:string;data:string}>>({});const[busy,setBusy]=useState(false);const[error,setError]=useState('');const[result,setResult]=useState<AutoFillData>();
  const count=Object.keys(files).length;const groups=useMemo(()=>[...new Set(slots.map(s=>s.group))],[]);
  useEffect(()=>{onScreensChange(Object.entries(files).map(([slotId,file])=>({slotId,name:file.name,url:file.preview})))},[files,onScreensChange]);
  const choose=async(slot:Slot,file?:File)=>{if(!file)return;setError('');try{const data=await compress(file);setFiles(current=>{const old=current[slot.id];if(old)URL.revokeObjectURL(old.preview);return{...current,[slot.id]:{name:file.name,preview:URL.createObjectURL(file),data}}})}catch(e){setError(e instanceof Error?e.message:'Ошибка изображения')}};
  const analyze=async()=>{if(!count)return;setBusy(true);setError('');try{const response=await api.analyzeScreens(slots.filter(s=>files[s.id]).map(s=>({slotId:s.id,label:s.title,image:files[s.id].data})));setResult(response);onApply(response);document.querySelector('#calculator')?.scrollIntoView({behavior:'smooth'})}catch(e){setError(e instanceof Error?e.message:'Не удалось распознать скриншоты')}finally{setBusy(false)}};
  return <div className="evidence-upload" id="upload"><div className="evidence-head"><div><span>VISION-ОЦЕНКА</span><h2>Комплект скриншотов аккаунта</h2><p>Каждый экран имеет своё назначение. Можно начать с неполного комплекта и дополнить его позже.</p></div><b>{count}/{slots.length}</b></div><div className="evidence-progress"><i style={{width:`${count/slots.length*100}%`}}/></div>
    {groups.map(group=><section className="evidence-group" key={group}><h3>{group}</h3><div className="evidence-grid">{slots.filter(s=>s.group===group).map(slot=><label className={`evidence-slot ${files[slot.id]?'filled':''}`} key={slot.id}>{files[slot.id]?<img src={files[slot.id].preview} alt={slot.title}/>:<i>＋</i>}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>choose(slot,e.target.files?.[0])}/><span><b>{slot.title}</b><small>{files[slot.id]?.name||slot.hint}</small></span>{files[slot.id]&&<em>✓</em>}</label>)}</div></section>)}
    <div className="evidence-actions"><p><b>{count?'Можно запускать анализ':'Добавьте хотя бы один экран героев'}</b><span>Чем полнее комплект, тем выше точность. При запуске изображения передаются OpenAI для распознавания; приложение не сохраняет их отдельно.</span></p><button disabled={!count||busy} onClick={analyze}>{busy?'Распознаём экраны…':'Распознать и заполнить поля'} <span>→</span></button></div>{error&&<div className="market-error">{error}</div>}{result&&<div className="analysis-success"><b>Автозаполнение выполнено · уверенность {Math.round(result.confidence*100)}%</b><strong>Ориентир рынка: {result.marketReferenceRub.toLocaleString('ru-RU')} ₽ · оценка выкупа: {result.purchaseEstimateRub.toLocaleString('ru-RU')} ₽</strong><span>{result.notes.join(' · ')||'Проверьте заполненные значения перед расчётом.'}</span></div>}
  </div>
}
