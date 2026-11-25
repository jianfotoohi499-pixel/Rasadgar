import React, {useRef, useState} from 'react';
import {View, Text, Pressable, ActivityIndicator, Alert, Share, StyleSheet} from 'react-native';
import MapView, {Marker, UrlTile} from 'react-native-maps';
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
  const mapRef=useRef(null);

  async function locate(){
    if(busy) return;
    setBusy(true);
    setPermission('در حال بررسی مجوز و سرویس مکان‌یابی…');
    try{
      const result=await Location.requestForegroundPermissionsAsync();
      if(result.status!=='granted'){
        setPermission('مجوز مکان‌یابی داده نشد. از تنظیمات گوشی، دسترسی مکان‌یابی هنگام استفاده را فعال کنید.');
        Alert.alert('نیاز به مجوز مکان‌یابی','برای نمایش مختصات و نقشه، اجازه مکان‌یابی هنگام استفاده از برنامه را فعال کنید.');
        return;
      }

      const services=await Location.hasServicesEnabledAsync();
      if(!services){
        setPermission('مکان‌یابی گوشی خاموش است.');
        Alert.alert('مکان‌یابی خاموش است','مکان‌یابی (Location) گوشی را روشن کنید و دوباره تلاش کنید.');
        return;
      }

      // نمایش موقت آخرین موقعیت معتبر، بدون معرفی آن به‌عنوان موقعیت تازه
      try{
        const previous=await Location.getLastKnownPositionAsync({maxAge:120000,requiredAccuracy:1000});
        if(validCoords(previous?.coords)){
          setPosition({
            latitude:previous.coords.latitude,
            longitude:previous.coords.longitude,
            accuracy:previous.coords.accuracy,
            altitude:previous.coords.altitude,
            timestamp:previous.timestamp || Date.now(),
            source:'cached'
          });
          setPermission('آخرین موقعیت ذخیره‌شده نمایش داده شد؛ در حال دریافت موقعیت تازه…');
        }else{
          setPermission('در حال دریافت موقعیت تازه؛ لطفاً چند لحظه صبر کنید…');
        }
      }catch(_){
        setPermission('در حال دریافت موقعیت تازه؛ لطفاً چند لحظه صبر کنید…');
      }

      let timer;
      const currentPromise=Location.getCurrentPositionAsync({
        accuracy:Location.Accuracy.High,
        mayShowUserSettingsDialog:true
      });
      const timeoutPromise=new Promise((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('دریافت موقعیت بیش از ۲۰ ثانیه طول کشید. در فضای باز و با روشن بودن مکان‌یابی دوباره تلاش کنید.')),20000);
      });
      let fix;
      try{
        fix=await Promise.race([currentPromise,timeoutPromise]);
      }finally{
        clearTimeout(timer);
      }

      if(!validCoords(fix?.coords)){
        throw new Error('مختصات معتبر از سرویس مکان‌یابی دریافت نشد.');
      }

      const next={
        latitude:fix.coords.latitude,
        longitude:fix.coords.longitude,
        accuracy:fix.coords.accuracy,
        altitude:fix.coords.altitude,
        timestamp:fix.timestamp || Date.now(),
        source:'fresh'
      };
      setPosition(next);
      setPermission('موقعیت تازه با موفقیت دریافت شد.');
      mapRef.current?.animateToRegion({
        latitude:next.latitude,
        longitude:next.longitude,
        latitudeDelta:0.008,
        longitudeDelta:0.008
      },500);
    }catch(e){
      const message=e?.message || 'خطای نامشخص در دریافت موقعیت';
      setPermission('دریافت موقعیت تازه ناموفق بود؛ در صورت وجود، آخرین موقعیت ذخیره‌شده حفظ شده است.');
      Alert.alert('مکان‌یابی ناموفق',message);
    }finally{
      setBusy(false);
    }
  }

  async function share(){
    if(!position)return;
    const {latitude,longitude}=position;
    try{
      await Share.share({
        message:`موقعیت من: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nنقشه: https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`
      });
    }catch(_){
      Alert.alert('خطا','اشتراک‌گذاری مختصات انجام نشد.');
    }
  }

  return <View style={styles.wrap}>
    <View style={styles.card}>
      <Text style={styles.heading}>موقعیت مکانی من</Text>
      <Text style={styles.muted}>مکان‌یابی با سرویس موقعیت‌یابی گوشی انجام می‌شود. مختصات فقط با اقدام شما به اشتراک گذاشته می‌شود.</Text>
      <Pressable onPress={locate} disabled={busy} style={[styles.button,busy&&styles.buttonBusy]}>
        {busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>◎ دریافت موقعیت فعلی</Text>}
      </Pressable>
      <Text style={styles.status}>{permission}</Text>
      {position&&<>
        <Text style={position.source==='fresh'?styles.fresh:styles.cached}>
          {position.source==='fresh'?'● موقعیت تازه':'◷ آخرین موقعیت ذخیره‌شده؛ هنوز تازه‌سازی نشده'}
        </Text>
        <Text style={styles.coord}>عرض جغرافیایی: {fa(position.latitude)}</Text>
        <Text style={styles.coord}>طول جغرافیایی: {fa(position.longitude)}</Text>
        <Text style={styles.muted}>دقت اعلام‌شده: {position.accuracy==null?'نامشخص':fa(position.accuracy)+' متر'}{position.altitude==null?'':' | ارتفاع: '+fa(position.altitude)+' متر'}</Text>
        <Text style={styles.muted}>زمان ثبت موقعیت: {persianDate(new Date(position.timestamp))}</Text>
        <Pressable onPress={share} style={styles.outline}><Text style={styles.outlineText}>اشتراک‌گذاری مختصات و لینک نقشه</Text></Pressable>
      </>}
    </View>
    <View style={styles.mapCard}>
      <Text style={styles.heading}>کروکی و نقشه خیابان‌ها</Text>
      {position?<MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={{latitude:position.latitude,longitude:position.longitude,latitudeDelta:0.008,longitudeDelta:0.008}}
        mapType="none"
        showsUserLocation
        showsMyLocationButton
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
        <Marker coordinate={{latitude:position.latitude,longitude:position.longitude}} title={position.source==='fresh'?'موقعیت تازه شما':'آخرین موقعیت ذخیره‌شده'} description={`${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`}/>
      </MapView>:<View style={styles.empty}><Text style={styles.emptyIcon}>⌖</Text><Text style={styles.muted}>پس از دریافت موقعیت، نقشه و نشانگر محل شما نمایش داده می‌شود.</Text></View>}
      <Text style={styles.attribution}>نقشه: © OpenStreetMap contributors | برای بارگذاری نقشه اینترنت لازم است.</Text>
    </View>
    <Text style={styles.foot}>دریافت مختصات با سرویس مکان‌یابی گوشی رایگان است و به حساب کاربری نیاز ندارد. دقت به دستگاه، فضای باز و شرایط دریافت سیگنال وابسته است و تضمین دقت ماهواره‌ای وجود ندارد. نقشه خیابان‌ها از OpenStreetMap بارگذاری می‌شود و برای نمایش آن اینترنت لازم است.</Text>
  </View>;
}

const styles=StyleSheet.create({
 wrap:{gap:12},
 card:{backgroundColor:'#08254b',borderRadius:16,padding:15,borderWidth:1,borderColor:'#174b80'},
 mapCard:{backgroundColor:'#08254b',borderRadius:16,padding:12,borderWidth:1,borderColor:'#174b80'},
 heading:{fontSize:19,fontWeight:'900',color:'#f1f7ff',textAlign:'right',marginBottom:8},
 muted:{fontSize:13,color:'#b4c9e4',textAlign:'right',lineHeight:22,marginTop:5},
 button:{backgroundColor:'#087cf0',borderRadius:11,minHeight:48,alignItems:'center',justifyContent:'center',marginTop:12},
 buttonBusy:{opacity:0.7},
 buttonText:{color:'#fff',fontSize:16,fontWeight:'800'},
 status:{fontSize:13,color:'#56c8ff',textAlign:'right',marginTop:10},
 fresh:{fontSize:13,color:'#68e0a3',textAlign:'right',fontWeight:'800',marginTop:8},
 cached:{fontSize:13,color:'#ffd27a',textAlign:'right',fontWeight:'800',marginTop:8},
 coord:{fontSize:16,color:'#ffffff',fontWeight:'800',textAlign:'right',marginTop:8},
 outline:{borderWidth:1,borderColor:'#168cff',borderRadius:10,padding:12,alignItems:'center',marginTop:12},
 outlineText:{color:'#56c8ff',fontWeight:'800'},
 map:{height:340,borderRadius:12,marginTop:8},
 empty:{height:220,alignItems:'center',justifyContent:'center',backgroundColor:'#061d3b',borderRadius:12,padding:18},
 emptyIcon:{fontSize:55,color:'#56c8ff'},
 attribution:{fontSize:10,color:'#a9c2e2',textAlign:'center',marginTop:8},
 foot:{fontSize:12,color:'#a9c2e2',lineHeight:21,textAlign:'right',paddingHorizontal:4}
});
