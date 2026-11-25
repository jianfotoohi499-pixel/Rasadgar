import React, {useState} from 'react';
import {View, Text, Pressable, ActivityIndicator, Alert, Share, Linking, StyleSheet} from 'react-native';
import Svg, {Path, Circle, Line} from 'react-native-svg';
import * as Location from 'expo-location';

const fa = value => Number(value).toLocaleString('fa-IR',{maximumFractionDigits:6});
const persianDate = value => new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Tehran'}).format(value);
function validCoords(coords){
  return !!coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)
    && coords.latitude >= -90 && coords.latitude <= 90
    && coords.longitude >= -180 && coords.longitude <= 180;
}
export default function LocationScreen(){
  const [position,setPosition]=useState(null);
  const [busy,setBusy]=useState(false);
  const [permission,setPermission]=useState('برای نمایش موقعیت، دکمه دریافت موقعیت را بزنید.');

  async function locate(){
    if(busy)return;
    setBusy(true);
    setPermission('در حال بررسی مجوز و سرویس مکان‌یابی…');
    try{
      const result=await Location.requestForegroundPermissionsAsync();
      if(result?.status!=='granted'){
        setPermission('مجوز مکان‌یابی داده نشد. از تنظیمات گوشی، دسترسی مکان هنگام استفاده را فعال کنید.');
        Alert.alert('نیاز به مجوز مکان‌یابی','برای نمایش مختصات، اجازه مکان‌یابی هنگام استفاده از برنامه را فعال کنید.');
        return;
      }
      const services=await Location.hasServicesEnabledAsync();
      if(!services){
        setPermission('مکان‌یابی گوشی خاموش است.');
        Alert.alert('مکان‌یابی خاموش است','مکان‌یابی (Location) گوشی را روشن کنید و دوباره تلاش کنید.');
        return;
      }
      try{
        const previous=await Location.getLastKnownPositionAsync({maxAge:120000,requiredAccuracy:1000});
        if(validCoords(previous?.coords)){
          setPosition({latitude:previous.coords.latitude,longitude:previous.coords.longitude,accuracy:previous.coords.accuracy,altitude:previous.coords.altitude,timestamp:previous.timestamp||Date.now(),source:'cached'});
          setPermission('آخرین موقعیت ذخیره‌شده نمایش داده شد؛ در حال دریافت موقعیت تازه…');
        }
      }catch(_){}
      let timer;
      const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('دریافت موقعیت بیش از ۲۰ ثانیه طول کشید. در فضای باز دوباره تلاش کنید.')),20000);});
      let fix;
      try{
        fix=await Promise.race([Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High,mayShowUserSettingsDialog:true}),timeout]);
      }finally{clearTimeout(timer);}
      if(!validCoords(fix?.coords))throw new Error('مختصات معتبر از سرویس مکان‌یابی دریافت نشد.');
      setPosition({latitude:fix.coords.latitude,longitude:fix.coords.longitude,accuracy:fix.coords.accuracy,altitude:fix.coords.altitude,timestamp:fix.timestamp||Date.now(),source:'fresh'});
      setPermission('موقعیت تازه با موفقیت دریافت شد.');
    }catch(e){
      const message=String(e?.message||e||'خطای نامشخص در دریافت موقعیت');
      setPermission('دریافت موقعیت تازه ناموفق بود؛ در صورت وجود، آخرین موقعیت حفظ شده است.');
      Alert.alert('مکان‌یابی ناموفق',message);
    }finally{setBusy(false);}
  }
  function mapUrl(){
    if(!position)return null;
    const {latitude,longitude}=position;
    return `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`;
  }
  async function openMap(){
    const url=mapUrl();if(!url)return;
    try{await Linking.openURL(url);}catch(_){Alert.alert('بازکردن نقشه ناموفق بود','مرورگر یا برنامه نقشه در گوشی در دسترس نیست.');}
  }
  async function share(){
    if(!position)return;
    try{await Share.share({message:`موقعیت من: ${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}\nنقشه: ${mapUrl()}`});}
    catch(_){Alert.alert('خطا','اشتراک‌گذاری مختصات انجام نشد.');}
  }
  return <View style={styles.wrap}>
    <View style={styles.card}>
      <Text style={styles.heading}>موقعیت مکانی من</Text>
      <Text style={styles.muted}>مکان‌یابی با سرویس گوشی انجام می‌شود. اطلاعات فقط با اقدام شما به اشتراک گذاشته می‌شود.</Text>
      <Pressable onPress={locate} disabled={busy} style={[styles.button,busy&&styles.buttonBusy]}>
        {busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>◎ دریافت موقعیت فعلی</Text>}
      </Pressable>
      <Text style={styles.status}>{permission}</Text>
      {position&&<>
        <Text style={position.source==='fresh'?styles.fresh:styles.cached}>{position.source==='fresh'?'● موقعیت تازه':'◷ آخرین موقعیت ذخیره‌شده؛ هنوز تازه‌سازی نشده'}</Text>
        <Text style={styles.coord}>عرض جغرافیایی: {fa(position.latitude)}</Text>
        <Text style={styles.coord}>طول جغرافیایی: {fa(position.longitude)}</Text>
        <Text style={styles.muted}>دقت اعلام‌شده: {position.accuracy==null?'نامشخص':fa(position.accuracy)+' متر'}{position.altitude==null?'':' | ارتفاع: '+fa(position.altitude)+' متر'}</Text>
        <Text style={styles.muted}>زمان ثبت موقعیت: {persianDate(new Date(position.timestamp))}</Text>
        <View style={styles.row}>
          <Pressable onPress={openMap} style={[styles.outline,{flex:1}]}><Text style={styles.outlineText}>نمایش نقشه خیابان‌ها</Text></Pressable>
          <Pressable onPress={share} style={[styles.outline,{flex:1}]}><Text style={styles.outlineText}>اشتراک‌گذاری</Text></Pressable>
        </View>
      </>}
    </View>
    <View style={styles.mapCard}>
      <Text style={styles.heading}>کروکی موقعیت</Text>
      {position?<View style={styles.mapPreview}>
        <Svg width="100%" height="190" viewBox="0 0 320 190">
          <Path d="M-10 40 L330 145 M-10 150 L330 35 M60 -10 L110 200 M230 -10 L190 200" stroke="#214e79" strokeWidth="16" fill="none"/>
          <Path d="M-10 40 L330 145 M-10 150 L330 35 M60 -10 L110 200 M230 -10 L190 200" stroke="#0b2a4c" strokeWidth="11" fill="none"/>
          <Path d="M0 95 L320 95 M160 0 L160 190" stroke="#4b83b2" strokeWidth="1.5" strokeDasharray="5 6" fill="none"/>
          <Circle cx="160" cy="95" r="27" fill="#087cf0" opacity="0.22"/>
          <Circle cx="160" cy="95" r="14" fill="#087cf0" stroke="#ffffff" strokeWidth="4"/>
          <Circle cx="160" cy="95" r="4" fill="#ffffff"/>
        </Svg>
        <Text style={styles.mapLabel}>نشانگر مرکز موقعیت ثبت‌شده</Text>
        <Text style={styles.muted}>برای مشاهده نقشه واقعی خیابان‌ها و جزئیات اطراف، نقشه OpenStreetMap را باز کنید.</Text>
        <Pressable onPress={openMap} style={styles.button}><Text style={styles.buttonText}>بازکردن نقشه OpenStreetMap ↗</Text></Pressable>
      </View>:<View style={styles.empty}>
        <Svg width="76" height="76" viewBox="0 0 76 76"><Circle cx="38" cy="38" r="30" stroke="#168cff" strokeWidth="2" fill="none"/><Circle cx="38" cy="38" r="15" stroke="#56c8ff" strokeWidth="2" fill="none"/><Circle cx="38" cy="38" r="5" fill="#56c8ff"/><Line x1="38" y1="0" x2="38" y2="20" stroke="#56c8ff" strokeWidth="2"/><Line x1="38" y1="56" x2="38" y2="76" stroke="#56c8ff" strokeWidth="2"/></Svg>
        <Text style={styles.muted}>پس از دریافت موقعیت، کروکی و نشانگر محل شما نمایش داده می‌شود.</Text>
      </View>}
      <Text style={styles.attribution}>نقشه خیابان‌ها: © OpenStreetMap contributors</Text>
    </View>
    <Text style={styles.foot}>GPS و دریافت مختصات رایگان است و به حساب کاربری نیاز ندارد. دقت به دستگاه و شرایط سیگنال وابسته است. کروکی داخل برنامه شماتیک است؛ نقشه واقعی از OpenStreetMap باز می‌شود و به اینترنت نیاز دارد.</Text>
  </View>;
}
const styles=StyleSheet.create({
 wrap:{gap:12},
 card:{backgroundColor:'#08254b',borderRadius:16,padding:15,borderWidth:1,borderColor:'#174b80'},
 mapCard:{backgroundColor:'#08254b',borderRadius:16,padding:12,borderWidth:1,borderColor:'#174b80'},
 heading:{fontSize:19,fontWeight:'900',color:'#f1f7ff',textAlign:'right',marginBottom:8},
 muted:{fontSize:13,color:'#b4c9e4',textAlign:'right',lineHeight:22,marginTop:5},
 button:{backgroundColor:'#087cf0',borderRadius:11,minHeight:48,alignItems:'center',justifyContent:'center',marginTop:12,paddingHorizontal:10},
 buttonBusy:{opacity:0.7},buttonText:{color:'#fff',fontSize:15,fontWeight:'800',textAlign:'center'},
 status:{fontSize:13,color:'#56c8ff',textAlign:'right',marginTop:10},
 fresh:{fontSize:13,color:'#68e0a3',textAlign:'right',fontWeight:'800',marginTop:8},
 cached:{fontSize:13,color:'#ffd27a',textAlign:'right',fontWeight:'800',marginTop:8},
 coord:{fontSize:16,color:'#ffffff',fontWeight:'800',textAlign:'right',marginTop:8},
 row:{flexDirection:'row',gap:8},
 outline:{borderWidth:1,borderColor:'#168cff',borderRadius:10,padding:12,alignItems:'center',justifyContent:'center',marginTop:12},
 outlineText:{color:'#56c8ff',fontWeight:'800',textAlign:'center'},
 mapPreview:{backgroundColor:'#061d3b',borderRadius:12,padding:8,marginTop:8},
 mapLabel:{color:'#f1f7ff',fontWeight:'800',textAlign:'center'},
 empty:{height:220,alignItems:'center',justifyContent:'center',backgroundColor:'#061d3b',borderRadius:12,padding:18},
 attribution:{fontSize:10,color:'#a9c2e2',textAlign:'center',marginTop:8},
 foot:{fontSize:12,color:'#a9c2e2',lineHeight:21,textAlign:'right',paddingHorizontal:4}
});
