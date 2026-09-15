import 'dotenv/config';
const token=process.env.RSL_VALUE_BOT_TOKEN; const url=process.env.PUBLIC_APP_URL;
if(!token||!url) throw new Error('Set RSL_VALUE_BOT_TOKEN and PUBLIC_APP_URL in .env');
async function call(method:string,body:object){const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json() as {ok:boolean;description?:string};if(!response.ok||!data.ok) throw new Error(data.description||'Telegram error');return data;}
const me=await call('getMe',{}) as {result?:{username?:string}};
if(me.result?.username?.toLowerCase()!=='rsl_value_bot') throw new Error(`Token belongs to @${me.result?.username||'unknown'}, expected @rsl_value_bot`);
await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Оценить\\Купить',web_app:{url}}});
await call('setMyName',{name:'RAID STORE — Оценка аккаунтов'});
await call('setMyDescription',{description:'Оценка аккаунтов RAID: Shadow Legends по скриншотам. Предложить аккаунт, следить за оффером и смотреть магазин.'});
await call('setMyShortDescription',{short_description:'Оценка и магазин аккаунтов RAID: Shadow Legends'});
await call('setMyCommands',{commands:[{command:'start',description:'Главное меню'},{command:'menu',description:'Показать меню'},{command:'offers',description:'Магазин аккаунтов'},{command:'sell',description:'Предложить аккаунт'}]});
console.log(`RAID STORE bot branding and menu configured: ${url}`);
