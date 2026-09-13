import { useCallback, useEffect, useMemo, useState } from 'react';
import OfferMarket from './OfferMarket';
import ScreenshotAnalyzer, { type AutoFillData, type Screen } from './ScreenshotAnalyzer';
import { championMatches, champions } from './champions';

type ChampionId=string;
type FormState={power:number;level:number;legendaries:number;mythicals:number;voidLegendaries:number;sixStar:number;greatHall:number;factionWars:number;clanBoss:'normal'|'brutal'|'nightmare'|'ultra';arena:'bronze'|'silver'|'gold'|'platinum';gems:number;sacred:number;voidShards:number;legendaryBooks:number;champions:ChampionId[]};
type View='home'|'estimate'|'market';

const combos=[
  {ids:['taras','marichka'] as ChampionId[],name:'Тарас + Маричка',bonus:38000,detail:'Премиальная арена-связка.'},
  {ids:['galathir','nais'] as ChampionId[],name:'Галатир + Наиз',bonus:30000,detail:'Сильное ядро для высокоуровневой арены.'},
  {ids:['rotos','siphi'] as ChampionId[],name:'Ротос + Сифи',bonus:18000,detail:'Связка урона и поддержки.'},
  {ids:['narses','ankora'] as ChampionId[],name:'Нарсес + Анкора',bonus:16000,detail:'Защитная контр-мета.'},
  {ids:['trunda','kymar'] as ChampionId[],name:'Трунда + Каймер',bonus:9500,detail:'Урон по Гидре и быстрые перезапуски.'},
  {ids:['gnut','kymar'] as ChampionId[],name:'Гнут + Каймер',bonus:7000,detail:'Быстрый фарм боссов и подземелий.'}
];
const initial:FormState={power:0,level:0,legendaries:0,mythicals:0,voidLegendaries:0,sixStar:0,greatHall:0,factionWars:0,clanBoss:'normal',arena:'bronze',gems:0,sacred:0,voidShards:0,legendaryBooks:0,champions:[]};
const loadForm=():FormState=>{try{return{...initial,...JSON.parse(localStorage.getItem('rsl-value-form-draft')||'{}')}}catch{return initial}};
const fmt=(n:number)=>new Intl.NumberFormat('ru-RU').format(Math.round(n));

function estimate(f:FormState){
  const roster=f.legendaries*180+f.mythicals*3200+f.voidLegendaries*850+f.sixStar*45;
  const progress=f.level*40+f.greatHall*28+f.factionWars*4.5+({normal:0,brutal:900,nightmare:2400,ultra:5200}[f.clanBoss])+({bronze:0,silver:500,gold:1800,platinum:6500}[f.arena]);
  const resources=f.gems*.55+f.sacred*130+f.voidShards*45+f.legendaryBooks*70;
  const foundCombos=combos.filter(combo=>combo.ids.every(id=>f.champions.includes(id)));
  const comboValue=foundCombos.reduce((sum,combo)=>sum+combo.bonus,0)+f.champions.length*650;
  const market=Math.max(2500,(roster+progress+resources+f.power*520)*.72+comboValue);
  const center=market*.24;
  return{low:center*.9,high:center*1.1,center,foundCombos,parts:[{label:'Коллекция героев',value:roster,color:'#d9fe66'},{label:'Прогресс аккаунта',value:progress,color:'#8e79ff'},{label:'Ключевые связки',value:comboValue,color:'#f2c94c'},{label:'Ресурсы и сила',value:resources+f.power*520,color:'#53d6c8'}]};
}

function Field({label,value,onChange,step=1,suffix}:{label:string;value:number;onChange:(n:number)=>void;step?:number;suffix?:string}){
  const[draft,setDraft]=useState(String(value));useEffect(()=>setDraft(String(value)),[value]);
  return <label className="field"><span>{label}</span><div><input type="number" min="0" step={step} value={draft} onChange={event=>{const next=event.target.value;setDraft(next);onChange(next===''?0:Math.max(0,Number(next)))}}/>{suffix&&<b>{suffix}</b>}</div></label>;
}
function SelectField({label,value,options,onChange}:{label:string;value:string;options:{value:string;label:string}[];onChange:(value:string)=>void}){
  return <label className="field"><span>{label}</span><div><select value={value} onChange={event=>onChange(event.target.value)}>{options.map(option=><option value={option.value} key={option.value}>{option.label}</option>)}</select></div></label>;
}
const Fieldset=({n,title,children}:{n:number;title:string;children:React.ReactNode})=><fieldset><legend><i>{n}</i>{title}</legend><div className="fields">{children}</div></fieldset>;

function Header(_props:{view:View}){return <header className="topbar"><a className="logo" href="#home"><i>R</i><b>RSL<span>VALUE</span></b></a><a className="ghost header-buy" href="#market">Купить аккаунт</a></header>}
function Footer(){return <footer><div className="logo"><i>R</i><b>RSL<span>VALUE</span></b></div><p>Независимый сервис оценки. Не связан с Plarium Global Ltd.</p><a href="#home">Наверх ↑</a></footer>}

function Home(){return <main className="home-page"><section className="hero home-hero"><div className="hero-copy"><div className="kicker"><span>●</span> УМНАЯ ОЦЕНКА АККАУНТА</div><h1><em>ОЦЕНИ СИЛУ.</em><br/>УЗНАЙ ЦЕНУ.<br/><small>RAID SHADOW LEGENDS</small></h1><div className="hero-line"/><p>Загрузи полный комплект скриншотов. Мы разберём героев, прогресс, ресурсы, подземелья и экипировку.</p><div className="home-actions"><a className="primary" href="#estimate">Оценка <span>→</span></a><a className="secondary home-buy" href="#market">Купить <span>→</span></a></div></div><div className="home-mark"><i>R</i><span>VISION VALUE</span></div></section><section className="how home-how"><div className="section-title"><div><span>02 / МЕТОДИКА</span><h2>Что влияет на цену</h2></div></div><div className="factor-grid">{[['01','Редкие герои','Мифические и Войд-легендарные герои создают основную ценность коллекции.'],['02','Игровой прогресс','КБ, арена, Войны фракций и Большой зал показывают готовность к эндгейму.'],['03','Запас ресурсов','Осколки, книги и самоцветы позволяют новому владельцу развивать аккаунт.']].map(item=><article key={item[0]}><b>{item[0]}</b><h3>{item[1]}</h3><p>{item[2]}</p></article>)}</div></section></main>}

function ChampionPicker({selected,onChange}:{selected:string[];onChange:(ids:string[])=>void}){
  const[query,setQuery]=useState('');
  const matches=useMemo(()=>champions.filter(champion=>!selected.includes(champion.id)&&championMatches(champion,query)).slice(0,query?12:8),[query,selected]);
  const selectedChampions=selected.map(id=>champions.find(champion=>champion.id===id)).filter((champion):champion is (typeof champions)[number]=>Boolean(champion));
  return <fieldset className="champion-fieldset champion-picker"><legend><i>3</i>Ключевые герои</legend><div className="champion-search"><span>⌕</span><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Введите имя героя: Тарас, Galathir…"/><small>{champions.length} героев</small></div>{selectedChampions.length>0&&<div className="selected-champions">{selectedChampions.map(champion=><button type="button" key={champion.id} onClick={()=>onChange(selected.filter(id=>id!==champion.id))}><span>{champion.name}</span><small>{champion.rarity}</small><b>×</b></button>)}</div>}<div className="champion-results">{matches.map(champion=><button type="button" key={champion.id} onClick={()=>{onChange([...selected,champion.id]);setQuery('')}}><i>{champion.name[0]}</i><span><b>{champion.name}</b><small>{champion.original} · {champion.rarity}</small></span><strong>＋</strong></button>)}{!matches.length&&<p>Герой не найден. Попробуйте часть русского или английского имени.</p>}</div></fieldset>;
}

function Calculator({form,setForm}:{form:FormState;setForm:React.Dispatch<React.SetStateAction<FormState>>}){
  const[ready,setReady]=useState(false);const result=useMemo(()=>estimate(form),[form]);
  const update=<K extends keyof FormState>(key:K,value:FormState[K])=>setForm(current=>({...current,[key]:value}));
  const total=result.parts.reduce((sum,part)=>sum+part.value,0)||1;
  return <section className="calculator" id="calculator"><div className="section-title"><div><span>02 / ПРОВЕРКА ДАННЫХ</span><h2>Проверьте автозаполнение</h2></div><p>Исправьте значения, которые система прочитала неточно.</p></div><div className="calc-grid"><form onSubmit={event=>{event.preventDefault();setReady(true)}}>
    <Fieldset n={1} title="Основа аккаунта"><Field label="Уровень" value={form.level} onChange={value=>update('level',value)}/><Field label="Сила аккаунта" value={form.power} step={.1} suffix="млн" onChange={value=>update('power',value)}/></Fieldset>
    <Fieldset n={2} title="Коллекция"><Field label="Легендарных героев" value={form.legendaries} onChange={value=>update('legendaries',value)}/><Field label="Мифических героев" value={form.mythicals} onChange={value=>update('mythicals',value)}/><Field label="Легендарных Войд" value={form.voidLegendaries} onChange={value=>update('voidLegendaries',value)}/><Field label="Героев 6★" value={form.sixStar} onChange={value=>update('sixStar',value)}/></Fieldset>
    <ChampionPicker selected={form.champions} onChange={value=>update('champions',value)}/>
    <Fieldset n={4} title="Прогресс"><Field label="Звёзды Войн фракций" value={form.factionWars} onChange={value=>update('factionWars',value)}/><Field label="Бонусы Большого зала" value={form.greatHall} onChange={value=>update('greatHall',value)}/><SelectField label="Клановый босс" value={form.clanBoss} onChange={value=>update('clanBoss',value as FormState['clanBoss'])} options={[{value:'normal',label:'Обычный / Сложный'},{value:'brutal',label:'Жестокий'},{value:'nightmare',label:'Кошмарный'},{value:'ultra',label:'Ультра-кошмарный'}]}/><SelectField label="Классическая арена" value={form.arena} onChange={value=>update('arena',value as FormState['arena'])} options={[{value:'bronze',label:'Бронза'},{value:'silver',label:'Серебро'},{value:'gold',label:'Золото'},{value:'platinum',label:'Платина'}]}/></Fieldset>
    <Fieldset n={5} title="Ресурсы"><Field label="Самоцветы" value={form.gems} onChange={value=>update('gems',value)}/><Field label="Сакральные осколки" value={form.sacred} onChange={value=>update('sacred',value)}/><Field label="Войд-осколки" value={form.voidShards} onChange={value=>update('voidShards',value)}/><Field label="Легендарные книги" value={form.legendaryBooks} onChange={value=>update('legendaryBooks',value)}/></Fieldset>
    <button className="primary calculate" type="submit">Получить оценку <span>→</span></button></form>
    <aside className={`result ${ready?'revealed':''}`}><div className="result-head"><span>ПРИМЕРНАЯ СТОИМОСТЬ</span></div><p className="range">{fmt(result.low)}–{fmt(result.high)} ₽</p><p className="sub">Расчётная стоимость: <b>{fmt(result.center)} ₽</b></p><div className="meter"><span style={{width:`${Math.min(92,35+result.center/900)}%`}}/></div>{result.foundCombos.length>0&&<div className="combo-report"><h3>Найденные комбинации</h3>{result.foundCombos.map(combo=><article key={combo.name}><div><b>{combo.name}</b><strong>+{fmt(combo.bonus)} ₽</strong></div><p>{combo.detail}</p></article>)}</div>}<div className="breakdown"><h3>Из чего сложилась цена</h3>{result.parts.map(part=><div key={part.label}><span><i style={{background:part.color}}/>{part.label}</span><b>{Math.round(part.value/total*100)}%</b></div>)}</div><div className="notice">Проверьте распознанные данные перед отправкой модератору.</div></aside>
  </div></section>;
}

export default function App(){
  const[view,setView]=useState<View>(()=>location.hash==='#estimate'?'estimate':location.hash==='#market'?'market':'home');
  const[form,setForm]=useState<FormState>(loadForm);const[screens,setScreens]=useState<Screen[]>([]);const result=useMemo(()=>estimate(form),[form]);
  useEffect(()=>{localStorage.setItem('rsl-value-form-draft',JSON.stringify(form))},[form]);
  useEffect(()=>{const change=()=>{setView(location.hash==='#estimate'?'estimate':location.hash==='#market'?'market':'home');window.scrollTo({top:0})};addEventListener('hashchange',change);return()=>removeEventListener('hashchange',change)},[]);
  const applyAnalysis=useCallback((data:AutoFillData)=>setForm(current=>({...current,level:data.level,power:data.power,legendaries:data.legendaries,mythicals:data.mythicals,voidLegendaries:data.voidLegendaries,sixStar:data.sixStar,greatHall:data.greatHall,factionWars:data.factionWars,gems:data.gems,sacred:data.sacred,voidShards:data.voidShards,legendaryBooks:data.legendaryBooks,champions:data.champions.filter((id):id is ChampionId=>champions.some(champion=>champion.id===id))})),[]);
  const syncScreens=useCallback((next:Screen[])=>setScreens(next),[]);
  return <div className="page"><Header view={view}/>{view==='home'&&<Home/>}{view==='estimate'&&<main className="estimate-page"><ScreenshotAnalyzer onApply={applyAnalysis} onScreensChange={syncScreens}/><Calculator form={form} setForm={setForm}/><OfferMarket mode="sell" screens={screens.filter(screen=>screen.slotId.startsWith('heroes_'))} estimateRub={result.center}/></main>}{view==='market'&&<main className="shop-page"><OfferMarket mode="buy" screens={[]} estimateRub={0}/></main>}<Footer/></div>;
}
