import React, { useEffect, useState } from 'react';
import { Alert, I18nManager, SafeAreaView, StatusBar, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native';
import * as SQLite from 'expo-sqlite';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

const dbPromise = SQLite.openDatabaseAsync('modiriat_kala.db');
const C = { bg:'#F4F6FA', card:'#FFFFFF', ink:'#172033', muted:'#758096', primary:'#2457D6', green:'#16865B', red:'#C43D4B', line:'#E5E9F1', pale:'#EAF0FF' };

function Btn({title,onPress,secondary=false}) {
  return <TouchableOpacity onPress={onPress} style={{backgroundColor:secondary?'#E9EDF5':C.primary,padding:13,borderRadius:12,alignItems:'center',marginVertical:5}}>
    <Text style={{color:secondary?C.ink:'#fff',fontWeight:'700',fontSize:14}}>{title}</Text>
  </TouchableOpacity>;
}
function Field({label,value,onChangeText,placeholder,keyboardType='default'}) {
  return <View style={{marginBottom:10}}>
    <Text style={{textAlign:'right',color:C.muted,fontSize:12,marginBottom:5}}>{label}</Text>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder||label} keyboardType={keyboardType}
      placeholderTextColor="#A4ADBC" style={{backgroundColor:'#F7F8FB',borderWidth:1,borderColor:C.line,borderRadius:10,padding:12,textAlign:'right',color:C.ink}} />
  </View>;
}
export default function App() {
  const [db,setDb]=useState(null), [tab,setTab]=useState('خانه'), [products,setProducts]=useState([]);
  const [name,setName]=useState(''), [barcode,setBarcode]=useState(''), [qty,setQty]=useState('0'), [buy,setBuy]=useState('0'), [sell,setSell]=useState('0');
  const [search,setSearch]=useState(''), [moveProduct,setMoveProduct]=useState(null), [moveQty,setMoveQty]=useState('1'), [moveType,setMoveType]=useState('in');
  const [business,setBusiness]=useState('فروشگاه نمونه'), [dark,setDark]=useState(false);
  const theme = dark ? { ...C, bg:'#101522',card:'#1B2433',ink:'#F2F5FA',muted:'#AAB4C5',line:'#303B4D' } : C;

  useEffect(()=>{ (async()=>{
    const d=await dbPromise;
    await d.execAsync(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS businesses(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY AUTOINCREMENT,business_id INTEGER NOT NULL,name TEXT NOT NULL,barcode TEXT,qty REAL DEFAULT 0,buy REAL DEFAULT 0,sell REAL DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE IF NOT EXISTS movements(id INTEGER PRIMARY KEY AUTOINCREMENT,business_id INTEGER NOT NULL,product_id INTEGER NOT NULL,type TEXT NOT NULL,qty REAL NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
    const b=await d.getFirstAsync('SELECT * FROM businesses LIMIT 1');
    if(!b) await d.runAsync('INSERT INTO businesses(name) VALUES(?)','فروشگاه نمونه');
    setDb(d); await refresh(d);
  })().catch(e=>Alert.alert('خطا در پایگاه داده',String(e))); },[]);
  async function refresh(d=db) { if(!d)return; const rows=await d.getAllAsync('SELECT * FROM products WHERE business_id=1 ORDER BY id DESC'); setProducts(rows); }
  async function addProduct(){
    if(!name.trim()) return Alert.alert('اطلاعات ناقص','نام کالا را وارد کنید.');
    const d=db; await d.runAsync('INSERT INTO products(business_id,name,barcode,qty,buy,sell) VALUES(1,?,?,?,?,?)',name.trim(),barcode.trim(),Number(qty)||0,Number(buy)||0,Number(sell)||0);
    setName('');setBarcode('');setQty('0');setBuy('0');setSell('0');await refresh(d);setTab('کالاها');
  }
  async function movement(){
    if(!moveProduct || !(Number(moveQty)>0)) return Alert.alert('ورودی نامعتبر','کالا و تعداد معتبر انتخاب کنید.');
    const delta=moveType==='in'?Number(moveQty):-Number(moveQty);
    if(moveProduct.qty+delta<0) return Alert.alert('موجودی ناکافی','موجودی کالا برای خروج کافی نیست.');
    await db.runAsync('UPDATE products SET qty=qty+? WHERE id=?',delta,moveProduct.id);
    await db.runAsync('INSERT INTO movements(business_id,product_id,type,qty) VALUES(1,?,?,?)',moveProduct.id,moveType,Number(moveQty));
    setMoveProduct(null);setMoveQty('1');await refresh();
    Alert.alert('ثبت شد',moveType==='in'?'ورود کالا ثبت شد.':'خروج کالا ثبت شد.');
  }
  const shown=products.filter(p=>p.name.includes(search)||String(p.barcode||'').includes(search));
  const total=products.reduce((s,p)=>s+Number(p.qty||0),0);
  const low=products.filter(p=>Number(p.qty)<=5).length;
  const money=n=>Number(n||0).toLocaleString('fa-IR');
  const page=(title,sub,children)=><ScrollView contentContainerStyle={{padding:16,paddingBottom:30}}><Text style={{fontSize:23,fontWeight:'800',color:theme.ink,textAlign:'right'}}>{title}</Text><Text style={{fontSize:12,color:theme.muted,textAlign:'right',marginTop:4,marginBottom:16}}>{sub}</Text>{children}</ScrollView>;
  const card=(label,value,accent=C.primary)=><View style={{backgroundColor:theme.card,borderRadius:14,padding:15,flex:1,borderWidth:1,borderColor:theme.line}}><Text style={{color:theme.muted,textAlign:'right',fontSize:12}}>{label}</Text><Text style={{color:accent,textAlign:'right',fontWeight:'800',fontSize:22,marginTop:7}}>{value}</Text></View>;
  let content;
  if(tab==='خانه') content=page('مدیریت کالا','نمای کلی موجودی فروشگاه',<>
    <View style={{flexDirection:'row',gap:10,marginBottom:10}}>{card('تعداد اقلام',money(products.length))}{card('مجموع موجودی',money(total),C.green)}</View>
    <View style={{flexDirection:'row',gap:10,marginBottom:18}}>{card('هشدار کمبود',money(low),C.red)}{card('وضعیت سامانه','آفلاین‌محور',C.green)}</View>
    <View style={{backgroundColor:theme.card,borderRadius:14,padding:16,borderColor:theme.line,borderWidth:1}}>
      <Text style={{textAlign:'right',fontWeight:'800',color:theme.ink,fontSize:16,marginBottom:8}}>دسترسی سریع</Text>
      <Btn title="＋ ثبت کالای جدید" onPress={()=>setTab('افزودن کالا')}/>
      <Btn title="⇄ ثبت ورود یا خروج" onPress={()=>setTab('عملیات انبار')} secondary/>
      <Btn title="▤ مشاهده فهرست کالاها" onPress={()=>setTab('کالاها')} secondary/>
    </View>
    <Text style={{textAlign:'right',color:theme.muted,fontSize:11,marginTop:14}}>اطلاعات این نسخه روی همین دستگاه ذخیره می‌شود.</Text>
  </>);
  else if(tab==='کالاها') content=page('فهرست کالاها',`${products.length} کالا ثبت شده`,<>
    <Field label="جست‌وجوی نام یا بارکد" value={search} onChangeText={setSearch} placeholder="جست‌وجو..."/>
    <Btn title="＋ افزودن کالا" onPress={()=>setTab('افزودن کالا')}/>
    {shown.map(p=><View key={p.id} style={{backgroundColor:theme.card,borderRadius:12,padding:13,marginTop:9,borderWidth:1,borderColor:theme.line}}>
      <Text style={{textAlign:'right',fontWeight:'800',color:theme.ink,fontSize:15}}>{p.name}</Text>
      <Text style={{textAlign:'right',color:theme.muted,fontSize:11,marginTop:4}}>بارکد: {p.barcode||'ثبت نشده'}</Text>
      <View style={{flexDirection:'row',justifyContent:'space-between',marginTop:8}}><Text style={{color:C.green,fontWeight:'700'}}>موجودی: {money(p.qty)}</Text><Text style={{color:theme.muted}}>فروش: {money(p.sell)}</Text></View>
    </View>)}
    {shown.length===0&&<Text style={{textAlign:'center',color:theme.muted,margin:20}}>کالایی پیدا نشد.</Text>}
  </>);
  else if(tab==='افزودن کالا') content=page('ثبت کالای جدید','مشخصات اولیه کالا را وارد کنید',<>
    <Field label="نام کالا *" value={name} onChangeText={setName}/>
    <Field label="بارکد" value={barcode} onChangeText={setBarcode} keyboardType="numeric"/>
    <Field label="موجودی اولیه" value={qty} onChangeText={setQty} keyboardType="decimal-pad"/>
    <Field label="قیمت خرید" value={buy} onChangeText={setBuy} keyboardType="numeric"/>
    <Field label="قیمت فروش" value={sell} onChangeText={setSell} keyboardType="numeric"/>
    <Btn title="ذخیره کالا" onPress={addProduct}/>
    <Btn title="انصراف" onPress={()=>setTab('کالاها')} secondary/>
  </>);
  else if(tab==='عملیات انبار') content=page('عملیات انبار','ثبت ورود و خروج موجودی',<>
    <Text style={{textAlign:'right',color:theme.ink,fontWeight:'700',marginBottom:8}}>نوع عملیات</Text>
    <View style={{flexDirection:'row',gap:8}}><View style={{flex:1}}><Btn title="ورود کالا" onPress={()=>setMoveType('in')} secondary={moveType!=='in'}/></View><View style={{flex:1}}><Btn title="خروج کالا" onPress={()=>setMoveType('out')} secondary={moveType!=='out'}/></View></View>
    <Text style={{textAlign:'right',color:theme.ink,fontWeight:'700',marginVertical:8}}>انتخاب کالا</Text>
    {products.map(p=><TouchableOpacity key={p.id} onPress={()=>setMoveProduct(p)} style={{padding:12,backgroundColor:moveProduct?.id===p.id?theme.pale:theme.card,borderWidth:1,borderColor:theme.line,borderRadius:10,marginBottom:6}}>
      <Text style={{textAlign:'right',color:theme.ink,fontWeight:'700'}}>{p.name} — موجودی: {money(p.qty)}</Text></TouchableOpacity>)}
    <Field label="تعداد" value={moveQty} onChangeText={setMoveQty} keyboardType="decimal-pad"/>
    <Btn title={moveType==='in'?'ثبت ورود':'ثبت خروج'} onPress={movement}/>
  </>);
  else if(tab==='گزارش‌ها') content=page('گزارش‌های پایه','خلاصه وضعیت موجودی',<>
    {card('تعداد کالاها',money(products.length))}
    <View style={{height:9}}/>
    {card('مجموع تعداد موجود',money(total),C.green)}
    <View style={{height:9}}/>
    {card('کالاهای با موجودی ۵ یا کمتر',money(low),C.red)}
    <Text style={{textAlign:'right',color:theme.muted,fontSize:11,marginTop:14}}>گزارش‌های مالی، سود و زیان و خروجی اکسل در نسخه‌های بعدی توسعه می‌یابد.</Text>
  </>);
  else content=page('تنظیمات','تنظیمات محلی برنامه',<>
    <View style={{backgroundColor:theme.card,padding:14,borderRadius:12,borderWidth:1,borderColor:theme.line}}>
      <Text style={{textAlign:'right',color:theme.ink,fontWeight:'700'}}>کسب‌وکار فعال</Text>
      <TextInput value={business} onChangeText={setBusiness} style={{textAlign:'right',borderWidth:1,borderColor:theme.line,borderRadius:9,padding:10,marginTop:8,color:theme.ink}}/>
      <Text style={{textAlign:'right',color:theme.muted,fontSize:11,marginTop:8}}>ساختار داده برای تفکیک کسب‌وکارها در نظر گرفته شده؛ مدیریت چندمستاجری و کاربران هنوز فعال نشده است.</Text>
    </View>
    <View style={{marginTop:12}}><Btn title={dark?'فعال‌سازی پوسته روشن':'فعال‌سازی پوسته تیره'} onPress={()=>setDark(!dark)} secondary/></View>
    <Text style={{textAlign:'right',color:theme.muted,fontSize:11,marginTop:12}}>نسخه اولیه آزمایشی — اتصال سرور، همگام‌سازی ابری و ورود کاربران در این خروجی پیاده‌سازی نشده است.</Text>
  </>);
  const tabs=[['خانه','⌂'],['کالاها','▦'],['عملیات انبار','⇄'],['گزارش‌ها','▤'],['تنظیمات','⚙']];
  return <SafeAreaView style={{flex:1,backgroundColor:theme.bg}}>
    <StatusBar barStyle={dark?'light-content':'dark-content'} backgroundColor={theme.bg}/>
    <View style={{paddingHorizontal:16,paddingVertical:12,backgroundColor:theme.card,borderBottomWidth:1,borderColor:theme.line,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
      <Text style={{color:theme.primary,fontWeight:'900',fontSize:18}}>مدیریت کالا</Text>
      <Text style={{color:theme.muted,fontSize:11}}>{business}</Text>
    </View>
    <View style={{flex:1}}>{content}</View>
    <View style={{flexDirection:'row',backgroundColor:theme.card,borderTopWidth:1,borderColor:theme.line,paddingVertical:7}}>
      {tabs.map(([t,ic])=><TouchableOpacity key={t} onPress={()=>setTab(t)} style={{flex:1,alignItems:'center',paddingVertical:5}}>
        <Text style={{fontSize:18,color:tab===t?theme.primary:theme.muted}}>{ic}</Text>
        <Text style={{fontSize:10,color:tab===t?theme.primary:theme.muted,fontWeight:tab===t?'800':'500',marginTop:3}}>{t}</Text>
      </TouchableOpacity>)}
    </View>
  </SafeAreaView>;
}
