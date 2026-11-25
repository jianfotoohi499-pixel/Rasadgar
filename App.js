import React, {useEffect, useMemo, useState} from 'react';
import {SafeAreaView, ScrollView, View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator, PermissionsAndroid, Platform} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, {Path, Line, Circle, Text as SvgText} from 'react-native-svg';
import {StatusBar} from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import {requireOptionalNativeModule} from 'expo-modules-core';
// نبود ماژول پیامک نباید مانع اجرای کل برنامه شود.
const TransactionSms=requireOptionalNativeModule('TransactionSms');
import LocationScreen from './LocationScreen';

const BLUE='#087cf0', RED='#ff9b24', GREEN='#19c66a', YELLOW='#f4c542', INK='#f2f7ff', PAPER='#04152f';
const STORE='zhian.v1';
const today=(date=new Date())=>new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'full',timeZone:'Asia/Tehran'}).format(date);
const jalaliDate=(value)=>{if(!value)return '—';const raw=String(value);if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw))return raw;const date=new Date(raw.length===10?raw+'T12:00:00Z':raw);if(Number.isNaN(date.getTime()))return raw;return new Intl.DateTimeFormat('fa-IR-u-ca-persian',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'UTC'}).format(date);};
const tehranDate=(date=new Date())=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);const v=Object.fromEntries(p.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}`;};
const rial=n=>Number(n||0).toLocaleString('fa-IR')+' ریال';
const normalizeNumber=value=>{const digits=String(value??'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));const cleaned=digits.replace(/[٬،,\s]/g,'').replace(/٫/g,'.');return Number(cleaned);};
const assetTypes=['ملک','خودرو','طلا','ارز','سپرده بانکی','سهام','سایر'];
const initial={city:'تهران',prices:{'دلار آزاد':'','طلای ۱۸ عیار (گرم)':'','ربع سکه':'','نیم سکه':'','تمام سکه':'','نفت برنت (ریال/بشکه)':'','نفت WTI (ریال/بشکه)':'','تورم سالانه (%)':''},assets:[],loans:[],accounts:[],transactions:[],history:[]};

function Card({title,children,color=BLUE,icon='📊'}){return <View style={s.card}><View style={s.cardHeading}><Text style={s.cardIcon}>{icon}</Text><Text style={[s.cardTitle,{color,flex:1}]}>{title}</Text></View>{children}</View>}
function Field({label,value,onChange,placeholder='مقدار را وارد کنید',keyboardType='decimal-pad'}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={String(value??'')} onChangeText={onChange} keyboardType={keyboardType} placeholder={placeholder} placeholderTextColor="#888" style={s.input}/></View>}
function MiniChart({values}) {
 const vals=values.map(x=>Number(x)||0).filter(x=>x>0);
 if(vals.length<2) return <Text style={s.muted}>برای نمایش روند، حداقل دو روز داده ذخیره کنید.</Text>;
 const w=310,h=110,p=12,min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
 const pts=vals.map((v,i)=>[p+i*(w-2*p)/(vals.length-1),h-p-(v-min)*(h-2*p)/range]);
 const d=pts.map((pt,i)=>(i?'L':'M')+pt[0]+','+pt[1]).join(' ');
 return <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}><Line x1="10" y1={h-12} x2={w-10} y2={h-12} stroke="#42658a"/><Path d={d} stroke={GREEN} strokeWidth="3" fill="none"/>{pts.map((pt,i)=><Circle key={i} cx={pt[0]} cy={pt[1]} r="3.5" fill={RED}/>)}</Svg>;
}
export default function App(){
 const [data,setData]=useState(initial),[weather,setWeather]=useState(null),[busy,setBusy]=useState(false);
 const [now,setNow]=useState(()=>new Date()),[storageLoaded,setStorageLoaded]=useState(false);
 const [marketBusy,setMarketBusy]=useState(false),[marketInfo,setMarketInfo]=useState(null);
 const [cityQuery,setCityQuery]=useState(''),[cityResults,setCityResults]=useState([]),[showMenu,setShowMenu]=useState(false),[tab,setTab]=useState('خانه');
 const [assetName,setAssetName]=useState(''),[assetValue,setAssetValue]=useState(''),[assetType,setAssetType]=useState('ملک');
 const [loanName,setLoanName]=useState(''),[loanAmount,setLoanAmount]=useState(''),[installmentAmount,setInstallmentAmount]=useState(''),[installmentCount,setInstallmentCount]=useState(''),[firstDueDate,setFirstDueDate]=useState('');
 const [accountBank,setAccountBank]=useState(''),[accountName,setAccountName]=useState(''),[accountLast4,setAccountLast4]=useState(''),[accountBalance,setAccountBalance]=useState('');
 const [editRecord,setEditRecord]=useState(null),[editName,setEditName]=useState(''),[editType,setEditType]=useState(''),[editValue,setEditValue]=useState(''),[editExtra,setEditExtra]=useState(''),[editAccountId,setEditAccountId]=useState('');
 const [smsEnabled,setSmsEnabled]=useState(false),[smsSyncing,setSmsSyncing]=useState(false),[smsOldCount,setSmsOldCount]=useState(null);
 const [txAccount,setTxAccount]=useState(''),[txAmount,setTxAmount]=useState(''),[txType,setTxType]=useState('برداشت'),[txCategory,setTxCategory]=useState('خرید'),[txDate,setTxDate]=useState(()=>tehranDate()),[smsText,setSmsText]=useState('');
 useEffect(()=>{let active=true;(async()=>{try{const [saved,sms]=await Promise.all([AsyncStorage.getItem(STORE),AsyncStorage.getItem('zhian.sms.enabled')]);if(!active)return;if(saved){const parsed=JSON.parse(saved);setData({...initial,...parsed,prices:{...initial.prices,...(parsed.prices||{})},assets:Array.isArray(parsed.assets)?parsed.assets:[],loans:Array.isArray(parsed.loans)?parsed.loans:[],accounts:Array.isArray(parsed.accounts)?parsed.accounts:[],transactions:Array.isArray(parsed.transactions)?parsed.transactions:[],history:Array.isArray(parsed.history)?parsed.history:[]});}setSmsEnabled(sms==='yes');}catch(e){console.warn('Storage restore failed',e);}finally{if(active)setStorageLoaded(true);}})();return()=>{active=false;};},[]);
 useEffect(()=>{if(storageLoaded)AsyncStorage.setItem(STORE,JSON.stringify(data)).catch(e=>console.warn('Storage save failed',e));},[data,storageLoaded]);
 useEffect(()=>{const clock=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(clock);},[]);
 useEffect(()=>{refreshMarket(true);const timer=setInterval(()=>refreshMarket(true),30*60*1000);return ()=>clearInterval(timer);},[]);
 useEffect(()=>{if(!storageLoaded)return;loadWeather(data.city,null,true);const timer=setInterval(()=>loadWeather(data.city,null,true),30*60*1000);return()=>clearInterval(timer);},[storageLoaded,data.city]);
 const updatePrice=(k,v)=>setData(d=>({...d,prices:{...d.prices,[k]:v}}));
 async function searchCities(){
   const query=cityQuery.trim();
   if(!query){Alert.alert('جست‌وجوی شهر','نام شهر را وارد کنید.');return;}
   setBusy(true);
   try{const geo=await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(query)+'&count=8&language=fa&format=json').then(r=>r.json());
     setCityResults((geo.results||[]).map(g=>({id:String(g.id)+'-'+g.latitude,name:g.name,admin1:g.admin1,country:g.country,latitude:g.latitude,longitude:g.longitude})));
     if(!geo.results?.length) Alert.alert('نتیجه‌ای پیدا نشد','نام شهر را دقیق‌تر وارد کنید.');
   }catch(e){Alert.alert('خطا در جست‌وجوی شهر',e.message||'اتصال اینترنت را بررسی کنید.');}finally{setBusy(false);}
 }
 async function loadWeather(city=data.city,coordinates=null,silent=false){
   setBusy(true); try {
     const g=coordinates||(await fetch('https://geocoding-api.open-meteo.com/v1/search?name='+encodeURIComponent(city)+'&count=1&language=fa&format=json').then(r=>r.json())).results?.[0];
     if(!g) throw new Error('شهر پیدا نشد');
     const [w,a]=await Promise.all([
       fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code,precipitation_probability_max&forecast_days=2&timezone=auto`).then(r=>r.json()),
       fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${g.latitude}&longitude=${g.longitude}&current=us_aqi,pm2_5,pm10&timezone=auto`).then(r=>r.json())
     ]);
     setWeather({name:g.name,temp:w.current?.temperature_2m,feels:w.current?.apparent_temperature,humidity:w.current?.relative_humidity_2m,wind:w.current?.wind_speed_10m,aqi:a.current?.us_aqi,pm25:a.current?.pm2_5,pm10:a.current?.pm10,today:{date:w.daily?.time?.[0],max:w.daily?.temperature_2m_max?.[0],min:w.daily?.temperature_2m_min?.[0],code:w.daily?.weather_code?.[0],rain:w.daily?.precipitation_probability_max?.[0]},tomorrow:{date:w.daily?.time?.[1],max:w.daily?.temperature_2m_max?.[1],min:w.daily?.temperature_2m_min?.[1],code:w.daily?.weather_code?.[1],rain:w.daily?.precipitation_probability_max?.[1]},updated:new Date().toLocaleTimeString('fa-IR',{timeZone:'Asia/Tehran'})});
     setCityResults([]);setCityQuery(g.name);
     setData(d=>({...d,city:g.name}));
   } catch(e){if(!silent)Alert.alert('دریافت اطلاعات ناموفق بود',e.message||'اتصال اینترنت یا منبع داده را بررسی کنید.');}
   finally{setBusy(false);}
 }

 async function refreshMarket(silent=false){
   setMarketBusy(true);
   try {
     const url='https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/latest.json';
     const response=await fetch(url,{headers:{'Cache-Control':'no-cache'}});
     if(!response.ok) throw new Error('پاسخ منبع قیمت دریافت نشد ('+response.status+')');
     const payload=await response.json();
     // قالب واقعی منبع: data.categories یک شیء از آرایه‌های دسته‌بندی است.
     const categoryRows=payload.data?.categories;
     const rows=Array.isArray(payload.data)?payload.data:
       (categoryRows&&typeof categoryRows==='object'?Object.values(categoryRows).flat():
       (Array.isArray(payload.items)?payload.items:[]));
     if(!rows.length) throw new Error('ساختار داده‌های منبع قابل شناسایی نیست.');
     const find=(symbol)=>rows.find(x=>x.symbol===symbol);
     const asRial=(item)=>{
       if(!item || item.price==null || !Number.isFinite(Number(item.price))) return null;
       const unit=String(item.currency||'').toUpperCase();
       if(unit==='IRT') return Number(item.price)*10;
       if(unit==='IRR') return Number(item.price);
       return null;
     };
     const updates={};
     const map=[
       ['دلار آزاد','USD_IRR_FREE'],
       ['طلای ۱۸ عیار (گرم)','GOLD_18K_IRR'],
       ['ربع سکه','COIN_QUARTER_IRR'],
       ['نیم سکه','COIN_HALF_IRR'],
       ['تمام سکه','COIN_EMAMI_IRR']
     ];
     const selected=[];
     for(const [label,symbol] of map){
       const item=find(symbol),value=asRial(item);
       if(value!==null){updates[label]=String(Math.round(value));selected.push(item);}
     }
     const usd=asRial(find('USD_IRR_FREE'));
     const brent=rows.find(x=>x.symbol==='BRENT_USD' && String(x.currency||'').toUpperCase()==='USD');
     if(brent && usd!==null && Number(brent.price)>0){updates['نفت برنت (ریال/بشکه)']=String(Math.round(Number(brent.price)*usd));selected.push(brent);}
     // اگر نماد WTI در منبع موجود نباشد، مقدار قبلی دست‌نخورده می‌ماند.
     const wti=rows.find(x=>/^(WTI|WTI_USD|CRUDE_WTI)$/i.test(String(x.symbol||'')) && String(x.currency||'').toUpperCase()==='USD');
     if(wti && usd!==null && Number(wti.price)>0){updates['نفت WTI (ریال/بشکه)']=String(Math.round(Number(wti.price)*usd));selected.push(wti);}
     if(!Object.keys(updates).length) throw new Error('قیمت‌های موردنیاز در پاسخ منبع موجود نبود.');
     setData(d=>({...d,prices:{...d.prices,...updates}}));
     const published=payload.data?.generated_at||payload.generated_at||new Date().toISOString();
     const stamp=new Date(published);
     const time=Number.isNaN(stamp.getTime())?String(published):stamp.toLocaleString('fa-IR');
     setMarketInfo({time,source:'Iran Market Data',count:Object.keys(updates).length,url,stale:selected.some(x=>x.stale===true)});
     if(!silent)Alert.alert('به‌روزرسانی قیمت‌ها',`${Object.keys(updates).length} نرخ از منبع رایگان دریافت شد. زمان انتشار: ${time}`);
   } catch(e){if(!silent)Alert.alert('خطا در دریافت قیمت‌ها',e.message||'اتصال اینترنت را بررسی کنید.');}
   finally{setMarketBusy(false);}
 }
 function saveDay(){
   const row={date:today(now),time:new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Tehran'}).format(now),prices:data.prices,weather};
   setData(d=>({...d,history:[...d.history,row]})); Alert.alert('ذخیره شد','اطلاعات امروز در حافظه گوشی ثبت شد.');
 }
 function addAsset(){
   const numericValue=normalizeNumber(assetValue);
   if(!assetName.trim()||!Number.isFinite(numericValue)||numericValue<=0){Alert.alert('اطلاعات ناقص','نام دارایی و ارزش ریالی معتبر و بزرگ‌تر از صفر وارد کنید. اعداد فارسی و انگلیسی پذیرفته می‌شوند.');return;}
   setData(d=>({...d,assets:[...d.assets,{id:Date.now(),type:assetType,name:assetName.trim(),value:numericValue}]}));
   setAssetName('');setAssetValue('');
 }
 function addAccount(){
   const balance=normalizeNumber(accountBalance),last4=normalizeNumber(accountLast4).toString();
   if(!accountBank.trim()||!accountName.trim()||!Number.isFinite(balance)||balance<0||(accountLast4.trim()&&!/^\d{1,4}$/.test(last4))){Alert.alert('اطلاعات حساب','نام بانک، عنوان حساب و موجودی معتبر را وارد کنید. فقط چهار رقم آخر کارت اختیاری است.');return;}
   const id=Date.now();setData(d=>({...d,accounts:[...(d.accounts||[]),{id,bank:accountBank.trim(),name:accountName.trim(),last4:accountLast4.trim()?last4.padStart(4,'0'):'',balance}]}));
   setAccountBank('');setAccountName('');setAccountLast4('');setAccountBalance('');setTxAccount(String(id));
 }

 async function requestSmsAccess(){
   if(!TransactionSms){Alert.alert('قابلیت پیامک در دسترس نیست','ماژول پیامک در این نسخه نصب نشده است؛ سایر بخش‌های برنامه بدون مشکل قابل استفاده‌اند.');return;}
   if(Platform.OS!=='android'){Alert.alert('عدم پشتیبانی','خواندن خودکار پیامک فقط در نسخه اندروید پشتیبانی می‌شود.');return;}
   try{
     const receive=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,{title:'اجازه دریافت پیامک جدید',message:'برای ثبت خودکار تراکنش‌های بانکی جدید لازم است.',buttonPositive:'اجازه می‌دهم',buttonNegative:'انصراف'});
     if(receive!==PermissionsAndroid.RESULTS.GRANTED){Alert.alert('مجوز داده نشد','برای پیامک‌های جدید، مجوز دریافت لازم است.');return;}
     const read=await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS,{title:'اجازه بررسی پیامک‌های قبلی',message:'برای یک‌بار بررسی صندوق پیامک و استخراج فقط تراکنش‌های بانکی، دسترسی خواندن پیامک لازم است. متن پیامک‌ها در برنامه ذخیره نمی‌شود.',buttonPositive:'اجازه می‌دهم',buttonNegative:'انصراف'});
     if(read!==PermissionsAndroid.RESULTS.GRANTED){Alert.alert('مجوز خواندن پیامک داده نشد','پیامک‌های قبلی بررسی نمی‌شوند. دریافت پیامک‌های جدید همچنان قابل فعال‌سازی است.');setSmsEnabled(true);await AsyncStorage.setItem('zhian.sms.enabled','yes');return;}
     setSmsEnabled(true);await AsyncStorage.setItem('zhian.sms.enabled','yes');
     const count=await TransactionSms.scanInbox(10000);setSmsOldCount(count);await syncSmsTransactions();
     Alert.alert('بررسی پیامک‌ها انجام شد',`تعداد ${count} پیامک دارای الگوی تراکنش شناسایی شد. موارد تکراری حذف می‌شوند؛ پیامک‌های شخصی و رمزهای یک‌بارمصرف وارد حساب نمی‌شوند.`);
   }catch(e){Alert.alert('خطا در مجوز پیامک',String(e));}
 }
 async function scanOldSms(){
   if(!TransactionSms){Alert.alert('قابلیت پیامک در دسترس نیست','ماژول پیامک در این نسخه نصب نشده است.');return;}
   if(Platform.OS!=='android')return;
   try{const granted=await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);if(!granted){Alert.alert('مجوز لازم است','ابتدا مجوز خواندن پیامک را فعال کنید.');return;}setSmsSyncing(true);const count=await TransactionSms.scanInbox(10000);setSmsOldCount(count);await syncSmsTransactions();Alert.alert('اسکن تمام شد',`${count} پیامک دارای الگوی تراکنش شناسایی شد.`);}catch(e){Alert.alert('خطا در اسکن پیامک‌ها',String(e));}finally{setSmsSyncing(false);}
 }
 async function syncSmsTransactions(){
   if(!TransactionSms||Platform.OS!=='android')return;
   if(Platform.OS!=='android')return;
   setSmsSyncing(true);
   try{
     const incoming=await TransactionSms.getPendingTransactions();
     if(!incoming?.length)return;
     setData(d=>{
       const known=new Set((d.transactions||[]).map(t=>String(t.id)));
       const fresh=incoming.filter(m=>m.id&&!known.has(String(m.id)));
       if(!fresh.length)return d;
       let nextAccounts=[...(d.accounts||[])];
       const added=fresh.map(m=>{
         const account=m.last4?nextAccounts.find(a=>a.last4===m.last4):(nextAccounts.length===1?nextAccounts[0]:null);
         const source=String(m.source||'پیامک خودکار');
         if(account&&source!=='پیامک قدیمی')nextAccounts=nextAccounts.map(a=>a.id===account.id?{...a,balance:a.balance+(m.type==='واریز'?Number(m.amount):-Number(m.amount))}:a);
         return {id:String(m.id),accountId:account?.id??null,amount:Number(m.amount),type:m.type==='واریز'?'واریز':'برداشت',category:'تراکنش پیامکی',date:tehranDate(new Date(Number(m.timestamp)||Date.now())),source,sender:String(m.sender||'')};
       });
       return {...d,accounts:nextAccounts,transactions:[...(d.transactions||[]),...added]};
     });
   }catch(e){Alert.alert('دریافت پیامک ناموفق بود',String(e));}
   finally{setSmsSyncing(false);}
 }
 useEffect(()=>{if(!smsEnabled||!TransactionSms)return;syncSmsTransactions();const timer=setInterval(syncSmsTransactions,12000);return()=>clearInterval(timer);},[smsEnabled]);
 function removeTransaction(t){
   const historical=String(t.source||'')==='پیامک قدیمی';
   Alert.alert('حذف تراکنش',historical?'تراکنش قدیمی حذف شود؟ موجودی حساب تغییر نمی‌کند.':'تراکنش حذف و اثر آن بر موجودی برگردانده شود؟',[{text:'انصراف',style:'cancel'},{text:'حذف',style:'destructive',onPress:()=>setData(d=>({...d,transactions:(d.transactions||[]).filter(x=>x.id!==t.id),accounts:historical?(d.accounts||[]):(d.accounts||[]).map(a=>a.id!==t.accountId?a:{...a,balance:a.balance+(t.type==='واریز'?-t.amount:t.amount)})}))}]);
 }
 function startEdit(kind,item){
   setEditRecord({kind,id:item.id,original:item});
   setEditName(kind==='asset'?item.name:kind==='account'?item.name:kind==='transaction'?item.category:item.name||'');
   setEditType(kind==='asset'?item.type:kind==='transaction'?item.type:'');
   setEditValue(String(kind==='asset'?item.value:kind==='account'?item.balance:item.amount));
   setEditExtra(kind==='account'?item.bank:kind==='transaction'?item.date:item.last4||'');
   setEditAccountId(String(item.accountId??''));
 }
 function cancelEdit(){setEditRecord(null);setEditName('');setEditType('');setEditValue('');setEditExtra('');setEditAccountId('');}
 function saveEdit(){
   if(!editRecord)return;
   const value=normalizeNumber(editValue),{kind,id,original}=editRecord;
   if(!Number.isFinite(value)||value<0||!editName.trim()||(kind==='transaction'&&(!['واریز','برداشت'].includes(editType)||value<=0||!/^\\d{4}-\\d{2}-\\d{2}$/.test(editExtra)))){Alert.alert('اطلاعات نامعتبر','عنوان، مبلغ، نوع تراکنش و تاریخ معتبر را بررسی کنید.');return;}
   setData(d=>{
     if(kind==='asset')return {...d,assets:d.assets.map(x=>x.id===id?{...x,name:editName.trim(),type:editType,value}:x)};
     if(kind==='account')return {...d,accounts:(d.accounts||[]).map(x=>x.id===id?{...x,name:editName.trim(),bank:editExtra.trim(),balance:value,last4:x.last4}:x)};
     if(kind==='transaction'){
       const oldSigned=original.type==='واریز'?original.amount:-original.amount;
       const newSigned=editType==='واریز'?value:-value;
       const nextId=editAccountId?Number(editAccountId):null;
       return {...d,transactions:(d.transactions||[]).map(x=>x.id===id?{...x,accountId:nextId,amount:value,type:editType,category:editName.trim(),date:editExtra.trim()}:x),accounts:(d.accounts||[]).map(a=>{if(String(original.source||'')==='پیامک قدیمی')return a;const delta=(a.id===original.accountId?-oldSigned:0)+(a.id===nextId?newSigned:0);return delta?{...a,balance:a.balance+delta}:a;})};
     }
     return d;
   });
   cancelEdit();Alert.alert('ذخیره شد','تغییرات در گوشی ثبت شد.');
 }
 function addTransaction(){
   const amount=normalizeNumber(txAmount);
   if(!txAccount||!Number.isFinite(amount)||amount<=0||!/^\\d{4}-\\d{2}-\\d{2}$/.test(txDate)){Alert.alert('اطلاعات تراکنش','حساب، مبلغ و تاریخ معتبر با قالب YYYY-MM-DD را وارد کنید.');return;}
   setData(d=>({...d,accounts:(d.accounts||[]).map(a=>String(a.id)!==String(txAccount)?a:{...a,balance:a.balance+(txType==='واریز'?amount:-amount)}),transactions:[...(d.transactions||[]),{id:Date.now(),accountId:Number(txAccount),amount,type:txType,category:txCategory,date:txDate,source:'دستی'}]}));
   setTxAmount('');setSmsText('');
 }
 function parsePastedSms(){
   const text=smsText.trim();if(!text){Alert.alert('متن پیامک','متن پیامک بانکی را جای‌گذاری کنید.');return;}
   const normalized=text.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
   const patterns=[/(?:مبلغ تراکنش|مبلغ خرید|مبلغ)\D{0,12}([0-9][0-9,٬،.]*)/i,/(?:برداشت|واریز|خرید|انتقال|پرداخت|کسر)\D{0,8}([0-9][0-9,٬،.]*)/i,/([0-9][0-9,٬،.]*)\s*(?:ریال|تومان)/i];
   let amount=null;
   for(const pattern of patterns){const candidate=normalized.match(pattern)?.[1];if(!candidate)continue;const digits=candidate.replace(/[,٬،.]/g,'');if(digits.length>12)continue;const value=Number(digits);if(Number.isFinite(value)&&value>=1000){amount=value;break;}}
   if(amount===null){Alert.alert('مبلغ پیدا نشد','مبلغ تراکنش را دستی وارد کنید؛ شماره کارت و تاریخ به‌عنوان مبلغ انتخاب نمی‌شوند.');return;}
   if(/تومان/.test(text))amount*=10;
   setTxAmount(String(amount));setTxType(/واریز|دریافت|بستانکار|واریزی/.test(text)?'واریز':'برداشت');
   const account=(data.accounts||[]).find(a=>a.last4&&normalized.includes(a.last4));if(account)setTxAccount(String(account.id));
   Alert.alert('اطلاعات استخراج شد','مبلغ و نوع تراکنش پیشنهاد شد؛ پیش از ثبت آن را بررسی کنید.');
 }
 function removeAccount(id){Alert.alert('حذف حساب','حساب حذف شود؟ تراکنش‌های قبلی حفظ می‌شوند.',[{text:'انصراف',style:'cancel'},{text:'حذف',style:'destructive',onPress:()=>setData(d=>({...d,accounts:(d.accounts||[]).filter(a=>a.id!==id)}))}]);}
 function addLoan(){
   const principal=normalizeNumber(loanAmount),payment=normalizeNumber(installmentAmount),count=normalizeNumber(installmentCount);
   const parts=firstDueDate.trim().replace(/-/g,'/').split('/').map(x=>normalizeNumber(x));
   if(!loanName.trim()||!Number.isFinite(principal)||principal<=0||!Number.isFinite(payment)||payment<=0||!Number.isInteger(count)||count<1||parts.length!==3||parts[0]<2000||parts[0]>2100||parts[1]<1||parts[1]>12||parts[2]<1||parts[2]>31){Alert.alert('اطلاعات ناقص','نام وام، مبلغ وام، مبلغ قسط، تعداد اقساط و تاریخ اولین سررسید را کامل کنید. تاریخ میلادی به شکل YYYY/MM/DD باشد.');return;}
   const [year,month,day]=parts,start=new Date(Date.UTC(year,month-1,day));
   if(start.getUTCFullYear()!==year||start.getUTCMonth()!==month-1||start.getUTCDate()!==day){Alert.alert('تاریخ نامعتبر','تاریخ اولین سررسید را بررسی کنید.');return;}
   const installments=Array.from({length:count},(_,i)=>{const due=new Date(Date.UTC(year,month-1+i,1));const last=new Date(Date.UTC(due.getUTCFullYear(),due.getUTCMonth()+1,0)).getUTCDate();due.setUTCDate(Math.min(day,last));return {number:i+1,amount:payment,dueDate:due.toISOString().slice(0,10),paid:false,paidAt:null};});
   setData(d=>({...d,loans:[...(d.loans||[]),{id:Date.now(),name:loanName.trim(),principal,installmentAmount:payment,installments}]}));
   setLoanName('');setLoanAmount('');setInstallmentAmount('');setInstallmentCount('');setFirstDueDate('');
   Alert.alert('ثبت شد','برنامه '+count+' قسط ماهانه ایجاد شد.');
 }
 function toggleInstallment(loanId,number){setData(d=>({...d,loans:(d.loans||[]).map(l=>l.id!==loanId?l:{...l,installments:l.installments.map(i=>i.number!==number?i:{...i,paid:!i.paid,paidAt:!i.paid?new Date().toISOString():null})})}));}
 function removeLoan(id){Alert.alert('حذف وام','وام و اقساط آن حذف شود؟',[{text:'انصراف',style:'cancel'},{text:'حذف',style:'destructive',onPress:()=>setData(d=>({...d,loans:(d.loans||[]).filter(l=>l.id!==id)}))}]);}
 function removeAsset(id){
   Alert.alert('حذف دارایی','این دارایی از فهرست حذف شود؟',[{text:'انصراف',style:'cancel'},{text:'حذف',style:'destructive',onPress:()=>setData(d=>({...d,assets:d.assets.filter(a=>a.id!==id)}))}]);
 }
 async function exportBackup(){
   try { const payload=JSON.stringify(data,null,2); const uri=FileSystem.documentDirectory+'rasadgar-zhian-backup.json';
     await FileSystem.writeAsStringAsync(uri,payload);
     if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,{mimeType:'application/json',dialogTitle:'پشتیبان رصد گر ژیان'});
     else Alert.alert('ذخیره شد',uri);
   } catch(e){Alert.alert('خطا در پشتیبان‌گیری',String(e));}
 }
 async function exportExcel(){
   try {
     const rows=data.history.map(h=>({تاریخ:h.date,ساعت:h.time,شهر:h.weather?.name||data.city,دما:h.weather?.temp??'',AQI:h.weather?.aqi??'',دلار_ریال:h.prices?.['دلار آزاد']||'',طلای_۱۸_عیار_ریال:h.prices?.['طلای ۱۸ عیار (گرم)']||'',ربع_سکه:h.prices?.['ربع سکه']||'',نیم_سکه:h.prices?.['نیم سکه']||'',تمام_سکه:h.prices?.['تمام سکه']||'',نفت_برنت_ریال:h.prices?.['نفت برنت (ریال/بشکه)']||'',نفت_WTI_ریال:h.prices?.['نفت WTI (ریال/بشکه)']||''}));
     const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),'تاریخچه');
     XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data.assets.map(a=>({دارایی:a.name,ارزش_ریالی:a.value}))), 'دارایی‌ها');
     XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((data.accounts||[]).map(a=>({بانک:a.bank,عنوان_حساب:a.name,چهار_رقم_آخر:a.last4,موجودی_ریال:a.balance}))), 'حساب‌ها');
     XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((data.transactions||[]).map(t=>({تاریخ:t.date,حساب:(data.accounts||[]).find(a=>a.id===t.accountId)?.name||'',نوع:t.type,دسته:t.category,مبلغ_ریال:t.amount,منبع:t.source}))), 'تراکنش‌ها');
     XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet((data.loans||[]).flatMap(l=>(l.installments||[]).map(i=>({وام:l.name,اصل_وام_ریال:l.principal,شماره_قسط:i.number,مبلغ_قسط_ریال:i.amount,تاریخ_سررسید:i.dueDate,وضعیت:i.paid?'پرداخت‌شده':'پرداخت‌نشده'})))), 'وام‌ها و اقساط');
     const out=XLSX.write(wb,{type:'base64',bookType:'xlsx'}); const uri=FileSystem.documentDirectory+'rasadgar-zhian.xlsx';
     await FileSystem.writeAsStringAsync(uri,out,{encoding:FileSystem.EncodingType.Base64});
     if(await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri,{mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',dialogTitle:'خروجی اکسل رصد گر ژیان'});
     else Alert.alert('ذخیره شد',uri);
   } catch(e){Alert.alert('خطا در خروجی اکسل',String(e));}
 }
 async function importBackup(){
   try {
     const picked=await DocumentPicker.getDocumentAsync({type:['application/json','text/json'],copyToCacheDirectory:true});
     if(picked.canceled||!picked.assets?.length) return;
     const raw=await FileSystem.readAsStringAsync(picked.assets[0].uri);
     const restored=JSON.parse(raw);
     if(!restored || typeof restored!=='object' || !restored.prices || !Array.isArray(restored.assets) || !Array.isArray(restored.history)) throw new Error('ساختار فایل پشتیبان معتبر نیست.');
     Alert.alert('تأیید بازیابی','اطلاعات فعلی با نسخه پشتیبان جایگزین می‌شود. ادامه می‌دهید؟',[
       {text:'انصراف',style:'cancel'},
       {text:'بازیابی',style:'destructive',onPress:()=>{setData({...initial,...restored});Alert.alert('بازیابی شد','اطلاعات پشتیبان در گوشی جایگزین شد.');}}
     ]);
   } catch(e){Alert.alert('بازیابی ناموفق',e.message||String(e));}
 }
 const priceFields=Object.keys(data.prices);
 const loans=data.loans||[];
 const accounts=data.accounts||[];
 const transactions=data.transactions||[];
 const totalBankBalance=accounts.reduce((sum,a)=>sum+(Number(a.balance)||0),0);
 const totalDeposits=transactions.filter(t=>t.type==='واریز').reduce((sum,t)=>sum+t.amount,0);
 const totalWithdrawals=transactions.filter(t=>t.type==='برداشت').reduce((sum,t)=>sum+t.amount,0);
 const totalAssets=data.assets.reduce((sum,x)=>sum+(Number(x.value)||0),0)+totalBankBalance;
 const totalLoanPrincipal=loans.reduce((sum,l)=>sum+(Number(l.principal)||0),0);
 const unpaidInstallments=loans.flatMap(l=>l.installments||[]).filter(i=>!i.paid);
 const remainingDebt=unpaidInstallments.reduce((sum,i)=>sum+(Number(i.amount)||0),0);
 const netAssets=totalAssets-remainingDebt;
 const menu=[{name:'خانه',icon:'🏠',desc:'نمای کلی و وضعیت امروز'},{name:'قیمت‌ها',icon:'📈',desc:'دلار، طلا، سکه و نفت'},{name:'دارایی‌های من',icon:'💎',desc:'ثبت و ویرایش اموال'},{name:'حساب‌ها و تراکنش‌ها',icon:'🏦',desc:'موجودی و گردش حساب'},{name:'وام‌ها و اقساط',icon:'🗓️',desc:'سررسیدها و پرداخت‌ها'},{name:'گزارش مالی',icon:'📊',desc:'جمع دارایی و بدهی'},{name:'روند تاریخی',icon:'📉',desc:'نمودار و سوابق'},{name:'موقعیت و نقشه',icon:'📍',desc:'GPS، مختصات و کروکی'},{name:'راهنما',icon:'🧭',desc:'آموزش و تنظیمات'}];
 return <SafeAreaView style={s.safe}><StatusBar style="light"/><View style={s.header}>
   <Pressable onPress={()=>setShowMenu(!showMenu)} style={s.menuBtn}><Text style={s.menuText}>☰</Text></Pressable>
   <View style={s.headerMark}><Text style={s.headerEye}>◉</Text></View><View style={{flex:1}}><Text style={s.brand}>دیدبان ژیان</Text><Text style={s.date}>بازار • دارایی • زندگی | {today()}</Text></View>
   <Text style={s.clock}>{now.toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit',second:'2-digit',timeZone:'Asia/Tehran'})}</Text>
 </View>
 {showMenu&&<View style={s.menu}><Text style={s.menuHeading}>بخش‌های رصدگر ژیان</Text><View style={s.menuGrid}>{menu.map(x=><Pressable key={x.name} onPress={()=>{setTab(x.name);setShowMenu(false);}} style={[s.menuTile,tab===x.name&&s.menuTileActive]}><Text style={s.menuIcon}>{x.icon}</Text><Text style={s.menuLabel}>{x.name}</Text><Text style={s.menuDesc}>{x.desc}</Text></Pressable>)}</View></View>}
 <ScrollView contentContainerStyle={s.body}>
 {editRecord&&<Card title="ویرایش اطلاعات" color={YELLOW} icon="✏️"><Field label="عنوان" value={editName} onChange={setEditName}/>{editRecord.kind==='asset'&&<Field label="نوع دارایی" value={editType} onChange={setEditType}/>}{editRecord.kind==='transaction'&&<><Field label="نوع تراکنش: واریز یا برداشت" value={editType} onChange={setEditType}/><Field label="تاریخ" value={editExtra} onChange={setEditExtra} keyboardType="default"/><Text style={s.label}>اتصال به حساب بانکی</Text>{accounts.map(a=><Pressable key={a.id} onPress={()=>setEditAccountId(String(a.id))} style={[s.choice,{backgroundColor:editAccountId===String(a.id)?'#0b477c':'#061d3b'}]}><Text style={s.label}>{editAccountId===String(a.id)?'✓ ':''}{a.bank} — {a.name}</Text></Pressable>)}</>}{editRecord.kind==='account'&&<Field label="نام بانک" value={editExtra} onChange={setEditExtra}/>}<Field label="مبلغ ریالی" value={editValue} onChange={setEditValue}/><View style={s.row}><Pressable style={[s.primary,{flex:1}]} onPress={saveEdit}><Text style={s.primaryText}>ذخیره ویرایش</Text></Pressable><Pressable style={[s.outline,{flex:1}]} onPress={cancelEdit}><Text style={s.outlineText}>انصراف</Text></Pressable></View></Card>}
 {tab==='خانه'&&<>
   <View style={s.dashboardHero}><Text style={s.dashboardEyebrow}>مرکز پایش هوشمند</Text><Text style={s.dashboardTitle}>دیدبان ژیان</Text><Text style={s.dashboardSub}>موقعیت، بازار و وضعیت روزانه در یک نگاه</Text><Text style={s.dashboardClock}>{now.toLocaleDateString('fa-IR',{timeZone:'Asia/Tehran'})}  •  {now.toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tehran'})}</Text></View>
   <View style={s.metricGrid}>
    <View style={s.metricCard}><Text style={s.metricEmoji}>🥇</Text><Text style={s.metricLabel}>طلای ۱۸ عیار / گرم</Text><Text style={s.metricValue}>{data.prices['طلای ۱۸ عیار (گرم)']?rial(data.prices['طلای ۱۸ عیار (گرم)']):'دریافت نشده'}</Text></View>
    <View style={s.metricCard}><Text style={s.metricEmoji}>💵</Text><Text style={s.metricLabel}>دلار آزاد</Text><Text style={s.metricValue}>{data.prices['دلار آزاد']?rial(data.prices['دلار آزاد']):'دریافت نشده'}</Text></View>
    <View style={s.metricCard}><Text style={s.metricEmoji}>🛢️</Text><Text style={s.metricLabel}>نفت برنت / بشکه</Text><Text style={s.metricValue}>{data.prices['نفت برنت (ریال/بشکه)']?rial(data.prices['نفت برنت (ریال/بشکه)']):'دریافت نشده'}</Text></View>
    <View style={s.metricCard}><Text style={s.metricEmoji}>🌤️</Text><Text style={s.metricLabel}>آب‌وهوای {data.city}</Text><Text style={s.metricValue}>{weather?.temp!=null?`${weather.temp}°C`:'در حال دریافت'}</Text></View>
    <View style={s.metricCard}><Text style={s.metricEmoji}>📈</Text><Text style={s.metricLabel}>تورم سالانه</Text><Text style={s.metricValue}>{data.prices['تورم سالانه (%)']?`${data.prices['تورم سالانه (%)']}٪`:'برای ثبت دستی'}</Text></View>
   </View>
   <View style={s.sectionHeading}><Text style={s.sectionHeadingText}>موقعیت جغرافیایی و کروکی</Text><Pressable onPress={()=>setTab('موقعیت و نقشه')}><Text style={s.sectionLink}>جزئیات GPS ←</Text></Pressable></View>
   <Pressable onPress={()=>setTab('موقعیت و نقشه')} style={s.locationLaunch}><Text style={s.locationLaunchIcon}>⌖</Text><View style={{flex:1}}><Text style={s.locationLaunchTitle}>دریافت موقعیت و نمایش کروکی</Text><Text style={s.locationLaunchSub}>GPS، مختصات و نقشه خیابان‌ها</Text></View><Text style={s.locationLaunchArrow}>←</Text></Pressable>
  <Card title="آب‌وهوا و کیفیت هوا" color={BLUE} icon="🌤️">
   <View style={s.row}><TextInput value={cityQuery} onChangeText={v=>{setCityQuery(v);setCityResults([]);}} placeholder={`نام شهر (فعلی: ${data.city})`} style={[s.input,{flex:1}]}/><Pressable style={s.smallBtn} onPress={searchCities}><Text style={s.btnText}>یافتن شهر</Text></Pressable></View>
   {cityResults.map(g=><Pressable key={g.id} onPress={()=>loadWeather(g.name,g)} style={[s.outline,{marginTop:6}]}><Text style={s.outlineText}>{g.name}{g.admin1?', '+g.admin1:''}{g.country?', '+g.country:''}</Text></Pressable>)}
   {weather?<View style={s.tiles}>
    <Text style={s.metric}>دمای فعلی: {weather.temp??'—'} درجه سانتی‌گراد</Text>
    <Text style={s.label}>وضعیت امروز</Text><Text style={s.muted}>{jalaliDate(weather.today?.date)||'امروز'}</Text><Text style={s.muted}>بیشینه دما: {weather.today?.max??'—'}° | کمینه دما: {weather.today?.min??'—'}° | احتمال بارش: {weather.today?.rain??'—'}٪</Text>
    <Text style={s.label}>پیش‌بینی فردا</Text><Text style={s.muted}>{jalaliDate(weather.tomorrow?.date)||'فردا'}</Text><Text style={s.muted}>بیشینه دما: {weather.tomorrow?.max??'—'}° | کمینه دما: {weather.tomorrow?.min??'—'}° | احتمال بارش: {weather.tomorrow?.rain??'—'}٪</Text>
    <Text style={s.label}>شرایط فعلی و کیفیت هوا</Text><Text style={s.muted}>دمای احساسی: {weather.feels??'—'}° سانتی‌گراد</Text><Text style={s.muted}>رطوبت نسبی: {weather.humidity??'—'}٪</Text><Text style={s.muted}>سرعت باد: {weather.wind??'—'} کیلومتر بر ساعت</Text><Text style={s.muted}>شاخص کیفیت هوا (AQI): {weather.aqi??'—'}</Text><Text style={s.muted}>ذرات معلق PM2.5: {weather.pm25??'—'} میکروگرم/مترمکعب</Text><Text style={s.muted}>ذرات معلق PM10: {weather.pm10??'—'} میکروگرم/مترمکعب</Text><Text style={s.muted}>آخرین دریافت: {weather.updated}</Text>
   </View>:<Text style={s.muted}>برای دریافت وضعیت شهر، نام شهر را جست‌وجو و از فهرست نتایج انتخاب کنید.</Text>}
   {busy&&<ActivityIndicator color={BLUE}/>}
   <Pressable onPress={()=>loadWeather()} style={s.outline}><Text style={s.outlineText}>به‌روزرسانی شهر فعلی</Text></Pressable>
  </Card>
  <Card title="نمای کلی قیمت‌ها" color={RED} icon="📊">
   {['دلار آزاد','طلای ۱۸ عیار (گرم)','ربع سکه','نیم سکه','تمام سکه'].map(k=><View style={s.priceRow} key={k}><Text style={s.label}>{k}</Text><Text style={s.value}>{data.prices[k]?rial(data.prices[k]):'ثبت نشده'}</Text></View>)}
   <Text style={s.muted}>قیمت‌ها با دکمه «دریافت خودکار» از API عمومی Iran Market Data دریافت می‌شوند؛ انتشار اعلامی حدود هر ۳۰ دقیقه است. نرخ‌ها ممکن است با تأخیر یا بدون تضمین سرویس باشند.</Text>
   {marketInfo&&<Text style={s.muted}>منبع: {marketInfo.source} | زمان انتشار: {marketInfo.time} | نرخ‌های دریافت‌شده: {marketInfo.count}</Text>}
  </Card>
  <Card title="خلاصه وضعیت مالی" color={GREEN} icon="💰">
   <Text style={s.label}>مجموع دارایی‌ها</Text><Text style={s.total}>{rial(totalAssets)}</Text>
   <Text style={s.label}>مانده بدهی اقساط</Text><Text style={[s.total,{color:RED}]}>{rial(remainingDebt)}</Text>
   <Text style={s.label}>خالص دارایی پس از کسر بدهی</Text><Text style={s.total}>{rial(netAssets)}</Text>
   <Text style={s.muted}>مجموع ارزش دارایی‌های ثبت‌شده</Text>
   <Text style={s.total}>{rial(totalAssets)}</Text><Text style={s.muted}>موجودی حساب‌های بانکی: {rial(totalBankBalance)}</Text>
   <Text style={s.muted}>برای تبدیل به دلار یا طلا، نرخ معتبر دلار و گرم طلا را در قیمت‌ها ثبت کنید.</Text>
  </Card>
  <Pressable style={s.primary} onPress={saveDay}><Text style={s.primaryText}>ذخیره اطلاعات امروز در تاریخچه</Text></Pressable>
 </>}
 {tab==='قیمت‌ها'&&<Card title="ثبت و به‌روزرسانی قیمت‌ها" color={RED}>
   <Text style={s.muted}>دریافت خودکار از منبع عمومی رایگان انجام می‌شود. همه قیمت‌های داخلی و نفت پس از تبدیل به ریال در برنامه ذخیره می‌شوند. در صورت قطع منبع، امکان ورود دستی باقی است.</Text>
   <Pressable style={s.primary} onPress={refreshMarket} disabled={marketBusy}><Text style={s.primaryText}>{marketBusy?'در حال دریافت قیمت‌ها…':'دریافت خودکار قیمت‌های بازار'}</Text></Pressable>
   {marketInfo&&<Text style={s.muted}>آخرین دریافت: {marketInfo.time} | منبع: {marketInfo.source}</Text>}
   {priceFields.map(k=><Field key={k} label={k+' (ریال)'} value={data.prices[k]} onChange={v=>updatePrice(k,v)}/>)}
   <Pressable style={s.primary} onPress={()=>Alert.alert('ثبت شد','قیمت‌ها در گوشی ذخیره شدند.')}><Text style={s.primaryText}>ذخیره قیمت‌ها</Text></Pressable>
  </Card>}
 {tab==='دارایی‌های من'&&<Card title="دارایی‌های شخصی" color={GREEN} icon="🏠">
   <Text style={s.label}>نوع دارایی را انتخاب کنید</Text>
   <View style={{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:9}}>
    {assetTypes.map(t=><Pressable key={t} onPress={()=>setAssetType(t)} style={{paddingVertical:9,paddingHorizontal:12,borderRadius:9,backgroundColor:assetType===t?GREEN:'#edf1ed',borderWidth:1,borderColor:assetType===t?GREEN:'#ccd8ce'}}><Text style={{color:assetType===t?'#fff':'#17324f',fontWeight:'700'}}>{t}</Text></Pressable>)}
   </View>
   <Field label={assetType==='سایر'?'عنوان دارایی':'نام یا شرح دارایی'} value={assetName} onChange={setAssetName} placeholder={assetType==='سایر'?'مثلاً تجهیزات، لوازم یا سایر موارد':'نام یا توضیح دارایی را وارد کنید'}/>
   <Field label="ارزش تخمینی به ریال (اعداد فارسی یا انگلیسی)" value={assetValue} onChange={setAssetValue} placeholder="مثلاً ۱۲۵۰۰۰۰۰۰۰"/>
   <Pressable style={s.primary} onPress={addAsset}><Text style={s.primaryText}>افزودن دارایی</Text></Pressable>
   {data.assets.length===0&&<Text style={s.muted}>هنوز دارایی ثبت نشده است. نوع دارایی، نام و ارزش ریالی را وارد و «افزودن دارایی» را انتخاب کنید.</Text>}
   {data.assets.map(a=><View key={a.id} style={s.priceRow}>
    <View style={{flex:1}}><Text style={s.label}>{a.name}</Text><Text style={s.muted}>{a.type||'سایر'}</Text></View>
    <Text style={s.value}>{rial(a.value)}</Text>
    <Pressable onPress={()=>startEdit('asset',a)} style={{padding:8}}><Text style={{color:BLUE,fontWeight:'bold'}}>ویرایش</Text></Pressable><Pressable onPress={()=>removeAsset(a.id)} style={{padding:8}}><Text style={{color:RED,fontWeight:'bold'}}>حذف</Text></Pressable>
   </View>)}
   <Text style={s.total}>جمع: {rial(data.assets.reduce((a,x)=>a+x.value,0))}</Text>
   <Text style={s.muted}>ارزش دلاری = ارزش ریالی ÷ نرخ دلار ریالی. ارزش طلایی = ارزش ریالی ÷ قیمت یک گرم طلا. این دو مقدار پس از ثبت نرخ‌ها قابل محاسبه‌اند.</Text>
   {data.assets.map(a=><Text key={'calc'+a.id} style={s.muted}>{a.name}: {data.prices['دلار آزاد']?`$${(a.value/Number(data.prices['دلار آزاد'])).toFixed(2)}`:'—'} | {data.prices['طلای ۱۸ عیار (گرم)']?`${(a.value/Number(data.prices['طلای ۱۸ عیار (گرم)'])).toFixed(2)} گرم طلا`:'—'}</Text>)}
  </Card>}
 {tab==='حساب‌ها و تراکنش‌ها'&&<>
  <Card title="حساب‌های بانکی و موجودی‌ها" color={BLUE} icon="🏦">
   <Text style={s.total}>مجموع موجودی ثبت‌شده: {rial(totalBankBalance)}</Text>
   <Text style={s.muted}>موجودی فعلی را دستی ثبت کنید یا با پیامک بانکی به‌روزرسانی کنید. اتصال مستقیم به سامانه بانک فعلاً وجود ندارد.</Text>
   <Field label="نام بانک" value={accountBank} onChange={setAccountBank} placeholder="مثلاً بانک ملت"/>
   <Field label="عنوان حساب" value={accountName} onChange={setAccountName} placeholder="مثلاً حساب حقوق"/>
   <Field label="چهار رقم آخر کارت (اختیاری)" value={accountLast4} onChange={setAccountLast4} placeholder="فقط چهار رقم آخر"/>
   <Field label="موجودی فعلی (ریال)" value={accountBalance} onChange={setAccountBalance}/>
   <Pressable style={s.primary} onPress={addAccount}><Text style={s.primaryText}>افزودن حساب بانکی</Text></Pressable>
   {accounts.map(a=><View key={a.id} style={s.bankCard}><Text style={s.bankEmoji}>💳</Text><View style={{flex:1}}><Text style={s.label}>{a.bank} — {a.name}</Text><Text style={s.muted}>{a.last4?'چهار رقم آخر: '+a.last4:'بدون شماره کارت'}</Text></View><Text style={s.bankBalance}>{rial(a.balance)}</Text><Pressable onPress={()=>startEdit('account',a)}><Text style={{color:BLUE,padding:6}}>ویرایش</Text></Pressable><Pressable onPress={()=>removeAccount(a.id)}><Text style={{color:RED,padding:6}}>حذف</Text></Pressable></View>)}
   {accounts.length===0&&<Text style={s.muted}>هنوز حساب بانکی ثبت نشده است.</Text>}
  </Card>
  <Card title="ثبت تراکنش بانکی" color={GREEN} icon="💸">
   <Text style={s.muted}>هر واریز یا برداشت را به حساب مربوط وصل کنید تا موجودی محاسباتی آن حساب به‌روزرسانی شود.</Text>
   {accounts.map(a=><Pressable key={a.id} onPress={()=>setTxAccount(String(a.id))} style={[s.choice,{backgroundColor:String(txAccount)===String(a.id)?'#dceaff':'#f4f6f9'}]}><Text style={s.label}>{String(txAccount)===String(a.id)?'✓ ':''}{a.bank} — {a.name}</Text></Pressable>)}
   <View style={s.row}>{['برداشت','واریز'].map(t=><Pressable key={t} onPress={()=>setTxType(t)} style={[s.typeButton,{backgroundColor:txType===t?(t==='واریز'?'#dff4e7':'#fde8e8'):'#f3f4f6'}]}><Text style={s.label}>{t==='واریز'?'⬇️ ':'⬆️ '}{t}</Text></Pressable>)}</View>
   <Field label="مبلغ تراکنش (ریال)" value={txAmount} onChange={setTxAmount}/>
   <Field label="دسته‌بندی" value={txCategory} onChange={setTxCategory} placeholder="خرید، قبض، حقوق، انتقال"/>
   <Field label="تاریخ تراکنش (YYYY-MM-DD)" value={txDate} onChange={setTxDate} keyboardType="default"/>
   <Pressable style={s.primary} onPress={addTransaction}><Text style={s.primaryText}>ثبت تراکنش و به‌روزرسانی موجودی</Text></Pressable>
  </Card>
  <Card title="ثبت خودکار پیامک‌های تراکنش" color={YELLOW} icon="✉️">
   <Text style={s.muted}>پس از فعال‌سازی، پیامک‌های ورودی از هر فرستنده فقط در صورت داشتن نشانه‌های تراکنش بانکی و مبلغ پردازش می‌شوند. متن کامل پیامک ذخیره نمی‌شود و رمزهای پویا و کدهای ورود کنار گذاشته می‌شوند.</Text>
   <View style={s.row}><Pressable style={[s.primary,{flex:1,backgroundColor:smsEnabled?GREEN:BLUE}]} onPress={requestSmsAccess}><Text style={s.primaryText}>{smsEnabled?'مجوز پیامک فعال است':'فعال‌سازی دریافت خودکار پیامک'}</Text></Pressable><Pressable style={s.outline} onPress={scanOldSms}><Text style={s.outlineText}>{smsSyncing?'در حال بررسی…':'اسکن پیامک‌های قدیمی'}</Text></Pressable></View>
   <Text style={s.muted}>وضعیت: {smsEnabled?'فعال':'غیرفعال'} | ذخیره فقط روی همین گوشی</Text>
   {smsOldCount!==null&&<Text style={s.muted}>آخرین اسکن: {smsOldCount} پیامک تراکنشی شناسایی شد.</Text>}
   <TextInput multiline value={smsText} onChangeText={setSmsText} placeholder="متن پیامک بانکی را جای‌گذاری کنید" style={[s.input,{minHeight:100,textAlignVertical:'top'}]}/>
   <Pressable style={s.outline} onPress={parsePastedSms}><Text style={s.outlineText}>استخراج مبلغ و نوع تراکنش</Text></Pressable>
  </Card>
  <Card title="گردش حساب و جمع تراکنش‌ها" color={RED} icon="📈">
   <Text style={s.label}>مجموع واریزها: {rial(totalDeposits)}</Text><Text style={s.label}>مجموع برداشت‌ها: {rial(totalWithdrawals)}</Text>
   {transactions.slice().reverse().map(t=><View key={t.id} style={s.priceRow}><View style={{flex:1}}><Text style={s.label}>{t.type} — {t.category}</Text><Text style={s.muted}>{jalaliDate(t.date)} | {accounts.find(a=>a.id===t.accountId)?.name||'نیازمند تعیین حساب'} | {t.source}</Text></View><Text style={[s.value,{color:t.type==='واریز'?GREEN:RED}]}>{t.type==='واریز'?'+':'−'}{rial(t.amount)}</Text><Pressable onPress={()=>startEdit('transaction',t)}><Text style={{color:BLUE,padding:5}}>ویرایش</Text></Pressable><Pressable onPress={()=>removeTransaction(t)}><Text style={{color:RED,padding:5}}>حذف</Text></Pressable></View>)}
   {transactions.length===0&&<Text style={s.muted}>تراکنشی ثبت نشده است.</Text>}
  </Card>
 </>}
 {tab==='وام‌ها و اقساط'&&<Card title="ثبت و مدیریت وام‌ها و اقساط" color={RED}>
   <Text style={s.muted}>اقساط به‌صورت ماهانه از تاریخ اولین سررسید ساخته می‌شوند. تاریخ را با تقویم میلادی و قالب YYYY/MM/DD وارد کنید.</Text>
   <Field label="نام وام" value={loanName} onChange={setLoanName} placeholder="مثلاً وام مسکن"/>
   <Field label="مبلغ کل وام (ریال)" value={loanAmount} onChange={setLoanAmount}/>
   <Field label="مبلغ هر قسط (ریال)" value={installmentAmount} onChange={setInstallmentAmount}/>
   <Field label="تعداد کل اقساط" value={installmentCount} onChange={setInstallmentCount}/>
   <Field label="تاریخ اولین سررسید (میلادی YYYY/MM/DD)" value={firstDueDate} onChange={setFirstDueDate} placeholder="2026/12/05" keyboardType="default"/>
   <Pressable style={s.primary} onPress={addLoan}><Text style={s.primaryText}>ثبت و ساخت برنامه اقساط</Text></Pressable>
   <Text style={s.label}>اصل وام‌های ثبت‌شده: {rial(totalLoanPrincipal)}</Text><Text style={s.label}>تعداد اقساط باقی‌مانده: {unpaidInstallments.length.toLocaleString('fa-IR')}</Text><Text style={s.total}>مبلغ اقساط باقی‌مانده: {rial(remainingDebt)}</Text>
   {loans.length===0&&<Text style={s.muted}>هنوز وامی ثبت نشده است.</Text>}
   {loans.map(l=><View key={l.id} style={s.loanCard}><Text style={s.cardTitle}>{l.name}</Text><Text style={s.muted}>اصل وام: {rial(l.principal)} | مبلغ هر قسط: {rial(l.installmentAmount)}</Text><Text style={s.label}>مانده این وام: {rial((l.installments||[]).filter(i=>!i.paid).reduce((a,i)=>a+i.amount,0))}</Text>
     {(l.installments||[]).map(i=><View key={i.number} style={s.installmentRow}><View style={{flex:1}}><Text style={s.label}>قسط {i.number.toLocaleString('fa-IR')} — {rial(i.amount)}</Text><Text style={s.muted}>سررسید: {jalaliDate(i.dueDate)}</Text></View><Pressable onPress={()=>toggleInstallment(l.id,i.number)} style={[s.payBtn,{backgroundColor:i.paid?GREEN:'#fff',borderColor:i.paid?GREEN:BLUE}]}><Text style={{color:i.paid?'#fff':BLUE,fontWeight:'bold'}}>{i.paid?'پرداخت شد':'ثبت پرداخت'}</Text></Pressable></View>)}
     <Pressable onPress={()=>removeLoan(l.id)} style={s.outline}><Text style={[s.outlineText,{color:RED}]}>حذف وام</Text></Pressable>
   </View>)}
  </Card>}
 {tab==='گزارش مالی'&&<Card title="گزارش جامع دارایی و بدهی" color={GREEN}>
   <Text style={s.label}>مجموع ارزش دارایی‌ها با احتساب حساب‌های بانکی</Text><Text style={s.total}>{rial(totalAssets)}</Text><Text style={s.muted}>موجودی حساب‌های بانکی: {rial(totalBankBalance)}</Text>
   <Text style={s.label}>مجموع اصل وام‌ها</Text><Text style={s.total}>{rial(totalLoanPrincipal)}</Text>
   <Text style={s.label}>مانده اقساط پرداخت‌نشده</Text><Text style={[s.total,{color:RED}]}>{rial(remainingDebt)}</Text>
   <Text style={s.muted}>تعداد اقساط پرداخت‌نشده: {unpaidInstallments.length.toLocaleString('fa-IR')}</Text>
   <Text style={s.label}>خالص دارایی پس از کسر بدهی</Text><Text style={s.total}>{rial(netAssets)}</Text>
   <Text style={s.muted}>محاسبه خالص: مجموع دارایی‌ها منهای مبالغ اقساط پرداخت‌نشده. اصل وام جداگانه نمایش داده می‌شود و دوباره از بدهی کسر نمی‌شود.</Text>
  </Card>}
 {tab==='روند تاریخی'&&<Card title="نمودار روند قیمت" color={GREEN}>
   <Text style={s.muted}>تاریخچه ذخیره‌شده روی همین گوشی: {data.history.length.toLocaleString('fa-IR')} رکورد</Text>
   {priceFields.map(k=><View key={k}><Text style={s.label}>{k}</Text><MiniChart values={data.history.map(h=>h.prices?.[k])}/></View>)}
   {data.history.slice().reverse().map((h,i)=><View key={i} style={s.priceRow}><Text style={s.label}>{jalaliDate(h.date)}، {h.time}</Text><Text style={s.value}>{h.prices?.['دلار آزاد']?rial(h.prices['دلار آزاد']):'—'}</Text></View>)}
   <Pressable style={s.outline} onPress={saveDay}><Text style={s.outlineText}>ثبت رکورد جدید امروز</Text></Pressable>
  </Card>}
 {tab==='موقعیت و نقشه'&&<LocationScreen/>}
 {tab==='راهنما'&&<Card title="راهنمای استفاده" color={YELLOW}>
   <Text style={s.help}>۱. شهر را جستجو کنید؛ تهران به‌صورت پیش‌فرض انتخاب شده است.</Text>
   <Text style={s.help}>۲. در بخش قیمت‌ها «دریافت خودکار» را بزنید؛ در صورت نیاز می‌توانید نرخ‌ها را دستی اصلاح کنید. نفت نیز به ریال/بشکه نمایش داده می‌شود.</Text>
   <Text style={s.help}>۳. دارایی‌هایی مانند ملک و خودرو را با ارزش ریالی ثبت کنید.</Text>
   <Text style={s.help}>۴. هر روز «ذخیره اطلاعات امروز» را بزنید تا داده‌ها برای نمودار تاریخی ثبت شوند.</Text>
   <Text style={s.help}>۵. اطلاعات در حافظه داخلی برنامه ذخیره می‌شوند و با حذف برنامه ممکن است پاک شوند؛ از گوشی نسخه پشتیبان بگیرید.</Text>
   <Text style={s.help}>منابع آب‌وهوا و آلودگی: Open-Meteo. منبع قیمت: Iran Market Data (فایل JSON عمومی؛ انتشار اعلامی حدود هر ۳۰ دقیقه، بدون کلید API). قیمت‌ها تضمین معاملاتی ندارند؛ زمان دریافت و وضعیت تازگی را بررسی کنید.</Text>
   <Pressable style={s.outline} onPress={exportBackup}><Text style={s.outlineText}>تهیه فایل پشتیبان JSON</Text></Pressable><Pressable style={s.outline} onPress={exportExcel}><Text style={s.outlineText}>خروجی Excel تاریخچه و دارایی‌ها</Text></Pressable><Pressable style={s.outline} onPress={importBackup}><Text style={s.outlineText}>بازیابی پشتیبان</Text></Pressable>
  </Card>}
 <Text style={s.footer}>داده‌های بازار نمونه نیستند؛ موارد خالی یعنی نرخ دریافت/ثبت نشده است.</Text>
 </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({
 locationLaunch:{flexDirection:'row',alignItems:'center',gap:12,backgroundColor:'#08254b',borderRadius:16,padding:15,borderWidth:1,borderColor:'#168cff',marginBottom:12},locationLaunchIcon:{fontSize:30,color:'#56c8ff',fontWeight:'900'},locationLaunchTitle:{fontSize:15,color:'#f1f7ff',fontWeight:'900',textAlign:'right'},locationLaunchSub:{fontSize:12,color:'#b4c9e4',textAlign:'right',marginTop:4},locationLaunchArrow:{fontSize:22,color:'#56c8ff'},
 safe:{flex:1,backgroundColor:'#03132d'},header:{flexDirection:'row',alignItems:'center',paddingHorizontal:12,paddingVertical:14,borderBottomWidth:1,borderColor:'#164a82',gap:10,backgroundColor:'#03132d'},headerMark:{width:42,height:42,borderRadius:14,backgroundColor:'#0757a5',alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#e5b94a'},headerEye:{fontSize:27,color:'#31c7ff',fontWeight:'900'},
 brand:{fontSize:25,fontWeight:'900',color:'#f4f8ff',textAlign:'right'},cardHeading:{flexDirection:'row',alignItems:'center',gap:10,marginBottom:8},cardIcon:{fontSize:28},bankCard:{flexDirection:'row',alignItems:'center',gap:8,padding:12,backgroundColor:'#0b2d57',borderRadius:13,marginTop:9},bankEmoji:{fontSize:28},bankBalance:{fontSize:13,color:GREEN,fontWeight:'900'},choice:{padding:10,borderRadius:9,marginVertical:4,borderWidth:1,borderColor:'#286092',backgroundColor:'#061d3b'},typeButton:{flex:1,padding:12,borderRadius:9,alignItems:'center',marginTop:8},date:{fontSize:13,color:'#b9d5f5',textAlign:'right'},clock:{fontSize:18,color:'#35d8ff',fontWeight:'bold'},menuBtn:{padding:9,backgroundColor:'#0757a5',borderRadius:10},menuText:{fontSize:23,color:BLUE},menu:{position:'absolute',zIndex:5,top:75,left:8,right:8,backgroundColor:'#08254b',borderRadius:20,elevation:12,padding:14,borderWidth:1,borderColor:'#15528d'},menuHeading:{fontSize:17,fontWeight:'900',color:'#65c9ff',textAlign:'right',marginBottom:12},menuGrid:{flexDirection:'row',flexWrap:'wrap',gap:9},menuTile:{width:'48%',minHeight:105,backgroundColor:'#0b2b53',borderRadius:14,padding:10,borderWidth:1,borderColor:'#164a82',alignItems:'flex-end',justifyContent:'center'},menuTileActive:{backgroundColor:'#0b477c',borderColor:'#56c8ff'},menuIcon:{fontSize:25,marginBottom:5},menuLabel:{textAlign:'right',color:'#f1f6ff',fontSize:14,fontWeight:'900'},menuDesc:{textAlign:'right',color:'#a9c2e2',fontSize:11,marginTop:4},
 body:{padding:10,paddingBottom:35},card:{backgroundColor:'#08254b',borderRadius:20,padding:16,marginBottom:14,borderWidth:1,borderColor:'#174b80',elevation:3,shadowColor:'#000000',shadowOpacity:0.08,shadowRadius:8,shadowOffset:{width:0,height:3}},loanCard:{backgroundColor:'#0b2d57',borderWidth:1,borderColor:'#164a82',borderRadius:12,padding:12,marginTop:12},installmentRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,paddingVertical:9,borderBottomWidth:1,borderColor:'#e3e7ec'},payBtn:{borderWidth:1,borderRadius:9,padding:9},cardTitle:{fontSize:21,fontWeight:'900',textAlign:'right',marginBottom:12},row:{flexDirection:'row',gap:8,alignItems:'center'},field:{marginVertical:7},label:{fontSize:16,color:'#f0f6ff',textAlign:'right',fontWeight:'700'},input:{backgroundColor:'#061d3b',borderWidth:1,borderColor:'#286092',borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:17,color:'#f0f6ff',textAlign:'right',minHeight:46},smallBtn:{backgroundColor:BLUE,padding:13,borderRadius:10},btnText:{color:'#ffffff',fontWeight:'bold'},tiles:{paddingVertical:12,gap:8},metric:{fontSize:23,color:GREEN,fontWeight:'900',textAlign:'right'},muted:{fontSize:13,color:'#b4c9e4',textAlign:'right',lineHeight:22,marginTop:6},outline:{borderWidth:1,borderColor:BLUE,padding:11,borderRadius:10,marginTop:12,alignItems:'center'},outlineText:{color:BLUE,fontWeight:'bold',fontSize:15},priceRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:9,borderBottomWidth:1,borderColor:'#174b80',gap:8},value:{fontSize:15,color:RED,fontWeight:'bold',textAlign:'left'},total:{fontSize:24,color:GREEN,fontWeight:'900',textAlign:'right',marginVertical:10},primary:{backgroundColor:BLUE,padding:15,borderRadius:12,alignItems:'center',marginVertical:8},primaryText:{color:'#fff',fontSize:17,fontWeight:'bold'},help:{fontSize:16,color:'#f0f6ff',textAlign:'right',lineHeight:28,marginBottom:8},footer:{textAlign:'center',fontSize:12,color:'#a9c2e2',padding:12},dashboardHero:{backgroundColor:'#041b3b',borderRadius:22,padding:18,borderWidth:1.5,borderColor:'#168cff',marginBottom:12,elevation:5,shadowColor:'#087cf0',shadowOpacity:0.2,shadowRadius:10,shadowOffset:{width:0,height:4}},dashboardEyebrow:{fontSize:12,color:'#58c8ff',textAlign:'right',fontWeight:'800'},dashboardTitle:{fontSize:32,color:'#56c8ff',fontWeight:'900',textAlign:'right',marginTop:5},dashboardSub:{fontSize:14,color:'#b9d5f5',textAlign:'right',marginTop:4},dashboardClock:{fontSize:13,color:'#31d5ff',textAlign:'right',marginTop:12},metricGrid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:14},metricCard:{width:'48%',minHeight:124,backgroundColor:'#082b55',borderRadius:17,borderWidth:1.5,borderColor:'#1476c8',padding:12,justifyContent:'center',alignItems:'center',elevation:4,shadowColor:'#087cf0',shadowOpacity:0.18,shadowRadius:8,shadowOffset:{width:0,height:3}},metricEmoji:{fontSize:25,marginBottom:5},metricLabel:{fontSize:12,color:'#9fc7ec',textAlign:'right'},metricValue:{fontSize:15,color:'#ffffff',fontWeight:'900',textAlign:'right',marginTop:8},sectionHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:9,paddingHorizontal:4},sectionHeadingText:{fontSize:18,color:'#f1f7ff',fontWeight:'900'},sectionLink:{fontSize:13,color:'#45c6ff',fontWeight:'800'}
});