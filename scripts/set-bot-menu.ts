import 'dotenv/config';
const token=process.env.RSL_VALUE_BOT_TOKEN; const url=process.env.PUBLIC_APP_URL;
if(!token||!url) throw new Error('Set RSL_VALUE_BOT_TOKEN and PUBLIC_APP_URL in .env');
async function call(method:string,body:object){const response=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const data=await response.json() as {ok:boolean;description?:string};if(!response.ok||!data.ok) throw new Error(data.description||'Telegram error');return data;}
const me=await call('getMe',{}) as {result?:{username?:string}};
if(me.result?.username?.toLowerCase()!=='rsl_value_bot') throw new Error(`Token belongs to @${me.result?.username||'unknown'}, expected @rsl_value_bot`);
await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Оценить аккаунт',web_app:{url}}});
await call('setMyCommands',{commands:[{command:'start',description:'Главное меню'},{command:'menu',description:'Показать меню'},{command:'offers',description:'Магазин аккаунтов'},{command:'sell',description:'Предложить аккаунт'}]});
console.log(`RSL Value menu configured: ${url}`);
