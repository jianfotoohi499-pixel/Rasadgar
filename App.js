import React, {useEffect, useMemo, useState} from 'react';
import {SafeAreaView, ScrollView, View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, {Path, Line, Circle, Text as SvgText} from 'react-native-svg';
import {StatusBar} from 'expo-status-bar';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';

const BLUE='#1556a3', RED='#c62828', GREEN='#16834a', YELLOW='#e6b800', INK='#171717', PAPER='#f7f4ec';
const STORE='zhian.v1';
const today=()=>new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'full'}).format(new Date());
const rial=n=>Number(n||0).toLocaleString('fa-IR')+' ریال';
const initial={city:'تهران',prices:{'دلار آزاد':'','طلای ۱۸ عیار (گرم)':'','ربع سکه':'','نیم سکه':'','تمام سکه':'','نفت برنت (ریال/بشکه)':'','نفت WTI (ریال/بشکه)':''},assets:[],history:[]};

function Card({title,children,color=BLUE}){return <View style={s.card}><Text style={[s.cardTitle,{color}]}>{title}</Text>{children}</View>}
function Field({label,value,onChange,placeholder='مقدار را وارد کنید'}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={String(value??'')} onChangeText={onChange} keyboardType="decimal-pad" placeholder={placeholder} placeholderTextColor="#888" style={s.input}/></View>}
function MiniChart({values}) {
 const vals=values.map(x=>Number(x)||0).filter(x=>x>0);
 if(vals.length<2) return <Text style={s.muted}>برای نمایش روند، حداقل دو روز داده ذخیره کنید.</Text>;
 const w=310,h=110,p=12,min=Math.min(...vals),max=Math.max(...vals),range=max-min||1;
 const pts=vals.map((v,i)=>[p+i*(w-2*p)/(vals.length-1),h-p-(v-min)*(h-2*p)/range]);
 const d=pts.map((pt,i)=>(i?'L':'M')+pt[0]+','+pt[1]).join(' ');
 return <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}><Line x1="10" y1={h-12} x2={w-10} y2={h-12} stroke="#bbb"/><Path d={d} stroke={GREEN} strokeWidth="3" fill="none"/>{pts.map((pt,i)=><Circle key={i} cx={pt[0]} cy={pt[1]} r="3.5" fill={RED}/>)}</Svg>;
}
export default function App(){
 const [data,setData]=useState(initial),[weather,setWeather]=useState(null),[busy,setBusy]=useState(false);
 const [marketBusy,setMarketBusy]=useState(false),[marketInfo,setMarketInfo]=useState(null);
 const [cityQuery,setCityQuery]=useState(''),[showMenu,setShowMenu]=useState(false),[tab,setTab]=useState('خانه');
 const [assetName,setAssetName]=useState(''),[assetValue,setAssetValue]=useState('');
 useEffect(()=>{AsyncStorage.getItem(STORE).then(v=>v&&setData({...initial,...JSON.parse(v)})).catch(()=>{});},[]);
 useEffect(()=>{AsyncStorage.setItem(STORE,JSON.stringify(data)).catch(()=>{});},[data]);
 useEffect(()=>{refreshMarket();const timer=setInterval(refreshMarket,30*60*1000);return ()=>clearInterval(timer);},[]);
 const updatePrice=(k,v)=>setData(d=>({...d,prices:{...d.prices,[k]:v}}));
 async function loadWeather(city=data.city){
   setBusy(true); try {
     const geo=await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=fa&format=json`).then(r=>r.json());
     if(!geo.results?.length) throw new Error('شهر پیدا نشد');
     const g=geo.results[0];
     const [w,a]=await Promise.all([
       fetch(`https://api.open-meteo.com/v1/forecast?latitude=${g.latitude}&longitude=${g.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`).then(r=>r.json()),
       fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${g.latitude}&longitude=${g.longitude}&current=us_aqi,pm2_5,pm10&timezone=auto`).then(r=>r.json())
     ]);
     setWeather({name:g.name,temp:w.current?.temperature_2m,feels:w.current?.apparent_temperature,humidity:w.current?.relative_humidity_2m,wind:w.current?.wind_speed_10m,aqi:a.current?.us_aqi,pm25:a.current?.pm2_5,pm10:a.current?.pm10,updated:new Date().toLocaleTimeString('fa-IR')});
     setData(d=>({...d,city:g.name}));
   } catch(e){Alert.alert('دریافت اطلاعات ناموفق بود',e.message||'اتصال اینترنت یا منبع داده را بررسی کنید.');}
   finally{setBusy(false);}
 }

 async function refreshMarket(){
   setMarketBusy(true);
   try {
     const url='https://raw.githubusercontent.com/iran-market/iran-market.github.io/main/data/latest.json';
     const response=await fetch(url,{headers:{'Cache-Control':'no-cache'}});
     if(!response.ok) throw new Error('پاسخ منبع قیمت دریافت نشد ('+response.status+')');
     const payload=await response.json();
     const rows=Array.isArray(payload.data)?payload.data:(Array.isArray(payload.items)?payload.items:[]);
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
     for(const [label,symbol] of map){const value=asRial(find(symbol));if(value!==null)updates[label]=String(Math.round(value));}
     const usd=asRial(find('USD_IRR_FREE'));
     // نفت جهانی فقط در صورت وجود نماد صریح برنت/WTI در فهرست منبع تبدیل می‌شود.
     for(const [label,pattern] of [['نفت برنت (ریال/بشکه)',/BRENT/i],['نفت WTI (ریال/بشکه)',/WTI/i]]){
       const item=rows.find(x=>pattern.test(String(x.symbol||'')) && String(x.currency||'').toUpperCase()==='USD');
       if(item && usd!==null && Number(item.price)>0) updates[label]=String(Math.round(Number(item.price)*usd));
     }
     if(!Object.keys(updates).length) throw new Error('قیمت‌های موردنیاز در پاسخ منبع موجود نبود.');
     setData(d=>({...d,prices:{...d.prices,...updates}}));
     const published=payload.meta?.published_at||payload.generated_at||new Date().toISOString();
     const stamp=new Date(published);
     const time=Number.isNaN(stamp.getTime())?String(published):stamp.toLocaleString('fa-IR');
     setMarketInfo({time,source:'Iran Market Data',count:Object.keys(updates).length,url,stale:Object.values(rows).some(x=>x.stale===true)});
     Alert.alert('به‌روزرسانی قیمت‌ها',`${Object.keys(updates).length} نرخ از منبع رایگان دریافت شد. زمان انتشار: ${time}`);
   } catch(e){Alert.alert('خطا در دریافت قیمت‌ها',e.message||'اتصال اینترنت را بررسی کنید.');}
   finally{setMarketBusy(false);}
 }
 function saveDay(){
   const row={date:today(),time:new Date().toLocaleTimeString('fa-IR'),prices:data.prices,weather};
   setData(d=>({...d,history:[...d.history,row]})); Alert.alert('ذخیره شد','اطلاعات امروز در حافظه گوشی ثبت شد.');
 }
 function addAsset(){
   if(!assetName.trim()||!Number(assetValue)){Alert.alert('اطلاعات ناقص','نام و ارزش ریالی دارایی را وارد کنید.');return;}
   setData(d=>({...d,assets:[...d.assets,{id:Date.now(),name:assetName,value:Number(assetValue)}]}));setAssetName('');setAssetValue('');
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
 const menu=['خانه','قیمت‌ها','دارایی‌های من','روند تاریخی','راهنما'];
 return <SafeAreaView style={s.safe}><StatusBar style="dark"/><View style={s.header}>
   <Pressable onPress={()=>setShowMenu(!showMenu)} style={s.menuBtn}><Text style={s.menuText}>☰</Text></Pressable>
   <View style={{flex:1}}><Text style={s.brand}>رصد گر ژیان</Text><Text style={s.date}>{today()}</Text></View>
   <Text style={s.clock}>{new Date().toLocaleTimeString('fa-IR',{hour:'2-digit',minute:'2-digit'})}</Text>
 </View>
 {showMenu&&<View style={s.menu}>{menu.map(x=><Pressable key={x} onPress={()=>{setTab(x);setShowMenu(false);}} style={s.menuItem}><Text style={s.menuLabel}>{x}</Text></Pressable>)}</View>}
 <ScrollView contentContainerStyle={s.body}>
 {tab==='خانه'&&<>
  <Card title="آب‌وهوا و کیفیت هوا" color={BLUE}>
   <View style={s.row}><TextInput value={cityQuery} onChangeText={setCityQuery} placeholder={`شهر (پیش‌فرض: ${data.city})`} style={[s.input,{flex:1}]}/><Pressable style={s.smallBtn} onPress={()=>loadWeather(cityQuery||data.city)}><Text style={s.btnText}>جستجو</Text></Pressable></View>
   {weather?<View style={s.tiles}><Text style={s.metric}>🌡 {weather.temp}°</Text><Text style={s.metric}>AQI: {weather.aqi??'—'}</Text><Text style={s.metric}>PM2.5: {weather.pm25??'—'}</Text><Text style={s.muted}>حس‌دمای {weather.feels}° | رطوبت {weather.humidity}% | باد {weather.wind} km/h</Text><Text style={s.muted}>به‌روزرسانی: {weather.updated}</Text></View>:<Text style={s.muted}>برای دریافت وضعیت شهر، جستجو را بزنید.</Text>}
   {busy&&<ActivityIndicator color={BLUE}/>}
   <Pressable onPress={()=>loadWeather()} style={s.outline}><Text style={s.outlineText}>به‌روزرسانی شهر فعلی</Text></Pressable>
  </Card>
  <Card title="نمای کلی قیمت‌ها" color={RED}>
   {['دلار آزاد','طلای ۱۸ عیار (گرم)','ربع سکه','نیم سکه','تمام سکه'].map(k=><View style={s.priceRow} key={k}><Text style={s.label}>{k}</Text><Text style={s.value}>{data.prices[k]?rial(data.prices[k]):'ثبت نشده'}</Text></View>)}
   <Text style={s.muted}>قیمت‌ها با دکمه «دریافت خودکار» از API عمومی Iran Market Data دریافت می‌شوند؛ انتشار اعلامی حدود هر ۳۰ دقیقه است. نرخ‌ها ممکن است با تأخیر یا بدون تضمین سرویس باشند.</Text>
   {marketInfo&&<Text style={s.muted}>منبع: {marketInfo.source} | زمان انتشار: {marketInfo.time} | نرخ‌های دریافت‌شده: {marketInfo.count}</Text>}
  </Card>
  <Card title="ارزش دارایی‌های ثبت‌شده" color={GREEN}>
   <Text style={s.total}>{rial(data.assets.reduce((a,x)=>a+x.value,0))}</Text>
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
 {tab==='دارایی‌های من'&&<Card title="دارایی‌های شخصی" color={GREEN}>
   <Field label="نام دارایی (ملک، خودرو و ...)" value={assetName} onChange={setAssetName}/>
   <Field label="ارزش تخمینی به ریال" value={assetValue} onChange={setAssetValue}/>
   <Pressable style={s.primary} onPress={addAsset}><Text style={s.primaryText}>افزودن دارایی</Text></Pressable>
   {data.assets.map(a=><View key={a.id} style={s.priceRow}><Text style={s.label}>{a.name}</Text><Text style={s.value}>{rial(a.value)}</Text></View>)}
   <Text style={s.total}>جمع: {rial(data.assets.reduce((a,x)=>a+x.value,0))}</Text>
   <Text style={s.muted}>ارزش دلاری = ارزش ریالی ÷ نرخ دلار ریالی. ارزش طلایی = ارزش ریالی ÷ قیمت یک گرم طلا. این دو مقدار پس از ثبت نرخ‌ها قابل محاسبه‌اند.</Text>
   {data.assets.map(a=><Text key={'calc'+a.id} style={s.muted}>{a.name}: {data.prices['دلار آزاد']?`$${(a.value/Number(data.prices['دلار آزاد'])).toFixed(2)}`:'—'} | {data.prices['طلای ۱۸ عیار (گرم)']?`${(a.value/Number(data.prices['طلای ۱۸ عیار (گرم)'])).toFixed(2)} گرم طلا`:'—'}</Text>)}
  </Card>}
 {tab==='روند تاریخی'&&<Card title="نمودار روند قیمت" color={GREEN}>
   <Text style={s.muted}>تاریخچه ذخیره‌شده روی همین گوشی: {data.history.length.toLocaleString('fa-IR')} رکورد</Text>
   {priceFields.map(k=><View key={k}><Text style={s.label}>{k}</Text><MiniChart values={data.history.map(h=>h.prices?.[k])}/></View>)}
   {data.history.slice().reverse().map((h,i)=><View key={i} style={s.priceRow}><Text style={s.label}>{h.date}، {h.time}</Text><Text style={s.value}>{h.prices?.['دلار آزاد']?rial(h.prices['دلار آزاد']):'—'}</Text></View>)}
   <Pressable style={s.outline} onPress={saveDay}><Text style={s.outlineText}>ثبت رکورد جدید امروز</Text></Pressable>
  </Card>}
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
 safe:{flex:1,backgroundColor:PAPER},header:{flexDirection:'row',alignItems:'center',padding:14,borderBottomWidth:1,borderColor:'#ddd',gap:12},
 brand:{fontSize:27,fontWeight:'900',color:BLUE,textAlign:'right'},date:{fontSize:13,color:INK,textAlign:'right'},clock:{fontSize:18,color:RED,fontWeight:'bold'},menuBtn:{padding:9,backgroundColor:'#e9eef6',borderRadius:10},menuText:{fontSize:23,color:BLUE},menu:{position:'absolute',zIndex:5,top:78,left:8,width:165,backgroundColor:'#fff',borderRadius:12,elevation:8,padding:8},menuItem:{padding:12,borderBottomWidth:1,borderColor:'#eee'},menuLabel:{textAlign:'right,color:INK,fontSize:17},
 body:{padding:12,paddingBottom:35},card:{backgroundColor:'#fff',borderRadius:16,padding:15,marginBottom:12,borderWidth:1,borderColor:'#e4dfd4'},cardTitle:{fontSize:21,fontWeight:'900',textAlign:'right',marginBottom:12},row:{flexDirection:'row',gap:8,alignItems:'center'},field:{marginVertical:7},label:{fontSize:16,color:INK,textAlign:'right',fontWeight:'700'},input:{backgroundColor:'#f6f7fa',borderWidth:1,borderColor:'#ccd3df',borderRadius:10,paddingHorizontal:12,paddingVertical:10,fontSize:17,color:INK,textAlign:'right',minHeight:46},smallBtn:{backgroundColor:BLUE,padding:13,borderRadius:10},btnText:{color:'#fff',fontWeight:'bold'},tiles:{paddingVertical:12,gap:8},metric:{fontSize:23,color:GREEN,fontWeight:'900',textAlign:'right'},muted:{fontSize:13,color:'#555',textAlign:'right',lineHeight:22,marginTop:6},outline:{borderWidth:1,borderColor:BLUE,padding:11,borderRadius:10,marginTop:12,alignItems:'center'},outlineText:{color:BLUE,fontWeight:'bold',fontSize:15},priceRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:9,borderBottomWidth:1,borderColor:'#eee',gap:8},value:{fontSize:15,color:RED,fontWeight:'bold',textAlign:'left'},total:{fontSize:24,color:GREEN,fontWeight:'900',textAlign:'right',marginVertical:10},primary:{backgroundColor:BLUE,padding:15,borderRadius:12,alignItems:'center',marginVertical:8},primaryText:{color:'#fff',fontSize:17,fontWeight:'bold'},help:{fontSize:16,color:INK,textAlign:'right',lineHeight:28,marginBottom:8},footer:{textAlign:'center',fontSize:12,color:'#666',padding:12}
});