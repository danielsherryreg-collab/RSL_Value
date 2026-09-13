import { allLegendaryNames } from './allLegendaryNames.js';

export type Champion = { id: string; name: string; original: string; role: string; rarity: 'Мифический' | 'Легендарный' | 'Эпический'; aliases?: string[] };

const mythical: Array<[string,string,string,string?]> = [
  ['alaz','Алаз Солнценосец','Alaz the Sunbearer'],['anaxia','Анаксия Возрождённая','Anaxia the Reborn'],['androc','Андрок Славный','Androc the Glorious'],
  ['aphidus','Афидус Повелитель Улья','Aphidus the Hivelord'],['arachoa','Арахоа Лунопряд','Arachoa Moonspinner'],['arbais','Арбаис Каменный Шип','Arbais the Stonethorn'],
  ['arne','Арне Белый','Arne the White'],['ashnar','Ашнар Душа Дракона','Ashnar Dragonsoul'],['mina','Кровавая Маркиза Мина','Blood Marchioness Mina'],
  ['cinda','Синда Сердце Кузни','Cinda Forgeheart'],['embrys','Эмбрис Аномалия','Embrys the Anomaly'],['fjorad','Фьорад Волчье Сердце','Fjorad Wolfheart'],
  ['frolni','Фролни Механист','Frolni the Mechanist'],['galleus','Галлеус Кровавый Гребень','Galleus Bloodcrest'],['gharol','Гарол Кровавая Кувалда','Gharol Bloodmaul'],
  ['gizmak','Гизмак Ужасный','Gizmak the Terrible'],['heinrik','Хейнрик Погибель Демонов','Heinrik Demondoom'],['lazarius','Иерофант Лазариус','Hierophant Lazarius'],
  ['joan','Жанна Светоносная','Joan the Luminant'],['karnage','Карнаж Анархист','Karnage the Anarch'],['komidus','Комидус Тёмная Улыбка','Komidus Darksmile'],
  ['kurosa','Куроса Алчная','Kurosa the Covetous'],['mikage','Леди Микагэ','Lady Mikage'],['mezomel','Мезомель Волчий Клык','Mezomel Luperfang'],
  ['nais','Наиз Теневой Вор','Nais the Shadowthief','Наис'],['nell','Нелл Чернозубая','Nell Blackteeth'],['krixia','Ночная Королева Криксия','Night Queen Krixia'],
  ['polara','Полара Огненное Сердце','Polara Fireheart'],['sabrael','Сабраэль Дальний','Sabrael the Distant'],['siegfrund','Зигфрунд Нефилим','Siegfrund the Nephilim'],
  ['galathir','Звёздный Мудрец Галатир','Starsage Galathir','Галатир'],['calamitus','Каламитус','The Calamitus'],['theodosia','Теодосия Опальная','Theodosia the Disgraced'],
  ['toshiro','Тоширо Кровавый','Toshiro the Bloody']
];

const legendary: Array<[string,string,string,string?,string?]> = [
  ['taras','Тарас Лютый','Taras the Fierce','Арена'],['marichka','Маричка Непоколебимая','Marichka the Unbreakable','Арена'],
  ['acrizia','Акриция','Acrizia','Боссы'],['armanz','Арманз Великолепный','Armanz the Magnificent','Арена'],['gnut','Гнут','Gnut','Боссы'],
  ['siphi','Сифи Невеста Драков','Siphi the Lost Bride','Арена'],['rotos','Ротос Потерянный Жених','Rotos the Lost Groom','Арена'],
  ['duchess','Герцогиня Лилиту','Duchess Lilitu','Поддержка'],['warlord','Воевода','Warlord','Арена'],['yumeko','Юмэко','Yumeko','Арена'],
  ['nekret','Нехрет Великий','Nekhret the Great','Арена'],['harima','Харима','Harima','Арена'],['georgid','Георгид Разрушитель','Georgid the Breaker','Арена'],['narses','Нарсес','Wight King Narses','Арена'],['ankora','Анкора','Wight Queen Ankora','Арена'],
  ['leorius','Леориус Гордый','Leorius the Proud','Арена'],['cardiel','Кардиэль','Cardiel','Поддержка'],['krisk','Криск Вечный','Krisk the Ageless','Гидра'],
  ['trunda','Трунда Гилтмолот','Trunda Giltmallet','Гидра'],['kymar','Принц Каймер','Prince Kymar','ПВЕ'],['thor','Тор Фэйхаммер','Thor Faehammer','Урон'],
  ['ninja','Ниндзя','Ninja','Боссы'],['marius','Мариус Отважный','Marius the Gallant','Эндгейм'],['ramantu','Романту Кровавый Клык','Ramantu Drakesblood','Арена'],
  ['lydia','Лидия Вестница Смерти','Lydia the Deathsiren','ПВЕ'],['mithrala','Митрала Жизненная Погибель','Mithrala Lifebane','Поддержка'],
  ['teox','Теокс Несравненный','Legate Teox','Урон'],['odin','Один Всебатя','Odin Faefather','Арена'],['freyja','Фрейя Ткачиха Судеб','Freyja Fateweaver','Поддержка'],
  ['helicath','Хеликат','Helicath','Клановый босс'],['ukko','Могучий Укко','Mighty Ukko','Гидра'],
  ['tuhanarak','Туханарак','Tuhanarak','Поддержка'],['graazur','Гразур Железное Брюхо','Graazur Irongut','Гидра'],['artak','Артак','Artak','ПВЕ']
];

const featuredChampions: Champion[] = [
  ...mythical.map(([id,name,original,alias])=>({id,name,original,role:'Мифический герой',rarity:'Мифический' as const,aliases:alias?[alias]:[]})),
  ...legendary.map(([id,name,original,role='Легендарный герой',alias])=>({id,name,original,role,rarity:'Легендарный' as const,aliases:alias?[alias]:[]}))
];

const slug=(name:string)=>`legendary_${name.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')}`;
const featuredOriginals=new Set(featuredChampions.map(champion=>champion.original.toLowerCase().replace(/[^a-z0-9]/g,'')));
export const champions: Champion[] = [
  ...featuredChampions,
  ...allLegendaryNames.filter(name=>!featuredOriginals.has(name.toLowerCase().replace(/[^a-z0-9]/g,''))).map(name=>({id:slug(name),name,original:name,role:'Легендарный герой',rarity:'Легендарный' as const,aliases:[]})),
  {id:'maneater',name:'Людоед',original:'Maneater',role:'Клановый босс',rarity:'Эпический',aliases:['Людоед']},
  {id:'seeker',name:'Ловец',original:'Seeker',role:'Арена / Клановый босс',rarity:'Эпический',aliases:['Искатель']}
];

export const normalizeChampionSearch = (value:string) => value.toLocaleLowerCase('ru-RU').replace(/ё/g,'е').replace(/[^a-zа-я0-9]/g,'');
const editDistance=(left:string,right:string)=>{const row=Array.from({length:right.length+1},(_,index)=>index);for(let i=1;i<=left.length;i++){let diagonal=row[0];row[0]=i;for(let j=1;j<=right.length;j++){const above=row[j];row[j]=left[i-1]===right[j-1]?diagonal:Math.min(diagonal,above,row[j-1])+1;diagonal=above}}return row[right.length]};
export const championMatches = (champion:Champion, query:string) => {
  const needle=normalizeChampionSearch(query);if(!needle)return true;
  return [champion.name,champion.original,...(champion.aliases||[])].some(value=>{const candidate=normalizeChampionSearch(value);return candidate.includes(needle)||(needle.length>=3&&editDistance(candidate.slice(0,needle.length),needle)<=Math.min(2,Math.floor(needle.length/3)))});
};
