import React, {useState} from 'react';
import {View, Text, Pressable, ActivityIndicator, Alert, Share, StyleSheet} from 'react-native';
import MapView, {Marker, UrlTile} from 'react-native-maps';
import * as Location from 'expo-location';

const fa = value => Number(value).toLocaleString('fa-IR',{maximumFractionDigits:6});
const persianDate = value => new Intl.DateTimeFormat('fa-IR-u-ca-persian',{dateStyle:'full',timeZone:'Asia/Tehran'}).format(value);

export default function LocationScreen(){
  const [position,setPosition]=useState(null);
  const [busy,setBusy]=useState(false);
  const [permission,setPermission]=useState('برای نمایش موقعیت، دکمه دریافت موقعیت را بزنید.');
  const [mapReady,setMapReady]=useState(false);

  async function locate(){
    setBusy(true);
    try{
      // ابتدا درخواست مجوز را نمایش بده؛ بررسی سرویس GPS پیش از درخواست مجوز
      // در برخی نسخه‌ها/دستگاه‌های اندروید باعث خروج ناگهانی برنامه می‌شود.
      const result=await Location.requestForegroundPermissionsAsync();
      if(result.status!=='granted'){
        setPermission('مجوز مکان‌یابی داده نشد. از تنظیمات گوشی اجازه دسترسی هنگام استفاده را فعال کنید.');
        throw new Error('مجوز موقعیت مکانی لازم است.');
      }
      const services=await Location.hasServicesEnabledAsync();
      if(!services) throw new Error('مکان‌یابی گوشی خاموش است. GPS یا Location را روشن کنید.');
      setPermission('در حال دریافت مختصات GPS…');
      let fix=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
      if(!fix?.coords) throw new Error('مختصات دریافت نشد.');
      setPosition({latitude:fix.coords.latitude,longitude:fix.coords.longitude,accuracy:fix.coords.accuracy,altitude:fix.coords.altitude});
      setPermission('موقعیت با GPS گوشی دریافت شد.');
    }catch(e){Alert.alert('مکان‌یابی ناموفق',e.message||String(e));}
    finally{setBusy(false);}
  }

  async function share(){
    if(!position)return;
    const {latitude,longitude}=position;
    await Share.share({message:`موقعیت من: ${latitude.toFixed(6)}, ${longitude.toFixed(6)}\nنقشه: https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=17/${latitude}/${longitude}`});
  }

  return <View style={styles.wrap}>
    <View style={styles.card}>
      <Text style={styles.heading}>موقعیت مکانی من</Text>
      <Text style={styles.muted}>مکان‌یابی با GPS خود گوشی انجام می‌شود. موقعیت بدون اجازه شما ارسال نمی‌شود.</Text>
      <Pressable onPress={locate} disabled={busy} style={styles.button}>
        {busy?<ActivityIndicator color="#fff"/>:<Text style={styles.buttonText}>◎ دریافت موقعیت فعلی</Text>}
      </Pressable>
      <Text style={styles.status}>{permission}</Text>
      {position&&<>
        <Text style={styles.coord}>عرض جغرافیایی: {fa(position.latitude)}</Text>
        <Text style={styles.coord}>طول جغرافیایی: {fa(position.longitude)}</Text>
        <Text style={styles.muted}>دقت تقریبی GPS: {position.accuracy==null?'نامشخص':fa(position.accuracy)+' متر'}{position.altitude==null?'':' | ارتفاع: '+fa(position.altitude)+' متر'}</Text>
        <Text style={styles.muted}>زمان ثبت: {persianDate(new Date())}</Text>
        <Pressable onPress={share} style={styles.outline}><Text style={styles.outlineText}>اشتراک‌گذاری مختصات و لینک نقشه</Text></Pressable>
      </>}
    </View>
    <View style={styles.mapCard}>
      <Text style={styles.heading}>کروکی و نقشه خیابان‌ها</Text>
      {position?<MapView
        style={styles.map}
        initialRegion={{...position,latitudeDelta:0.008,longitudeDelta:0.008}}
        region={{...position,latitudeDelta:0.008,longitudeDelta:0.008}}
        onMapReady={()=>setMapReady(true)}
        mapType="none"
        showsUserLocation
        showsMyLocationButton
      >
        <UrlTile urlTemplate="https://tile.openstreetmap.org/{z}/{x}/{y}.png" maximumZ={19} flipY={false}/>
        <Marker coordinate={position} title="موقعیت فعلی شما" description={`${position.latitude.toFixed(6)}, ${position.longitude.toFixed(6)}`}/>
      </MapView>:<View style={styles.empty}><Text style={styles.emptyIcon}>⌖</Text><Text style={styles.muted}>پس از دریافت موقعیت GPS، نقشه و نشانگر محل شما نمایش داده می‌شود.</Text></View>}
      <Text style={styles.attribution}>نقشه: © OpenStreetMap contributors | برای بارگذاری نقشه اینترنت لازم است.</Text>
    </View>
    <Text style={styles.foot}>نکته: دریافت مختصات GPS رایگان و بدون نیاز به حساب کاربری است. نمایش نقشه از کاشی‌های عمومی OpenStreetMap استفاده می‌کند؛ دسترس‌پذیری و سرعت آن به اینترنت و محدودیت سرویس نقشه وابسته است. برای استفاده آفلاین باید نقشه منطقه از قبل دانلود و ذخیره شود.</Text>
  </View>;
}

const styles=StyleSheet.create({
 wrap:{gap:12},
 card:{backgroundColor:'#fff',borderRadius:16,padding:15,borderWidth:1,borderColor:'#dbe4f0'},
 mapCard:{backgroundColor:'#fff',borderRadius:16,padding:12,borderWidth:1,borderColor:'#dbe4f0'},
 heading:{fontSize:19,fontWeight:'900',color:'#102b50',textAlign:'right',marginBottom:8},
 muted:{fontSize:13,color:'#526174',textAlign:'right',lineHeight:22,marginTop:5},
 button:{backgroundColor:'#1556a3',borderRadius:11,minHeight:48,alignItems:'center',justifyContent:'center',marginTop:12},
 buttonText:{color:'#fff',fontSize:16,fontWeight:'800'},
 status:{fontSize:13,color:'#1556a3',textAlign:'right',marginTop:10},
 coord:{fontSize:16,color:'#142b48',fontWeight:'800',textAlign:'right',marginTop:8},
 outline:{borderWidth:1,borderColor:'#1556a3',borderRadius:10,padding:12,alignItems:'center',marginTop:12},
 outlineText:{color:'#1556a3',fontWeight:'800'},
 map:{height:340,borderRadius:12,marginTop:8},
 empty:{height:220,alignItems:'center',justifyContent:'center',backgroundColor:'#eef3f8',borderRadius:12,padding:18},
 emptyIcon:{fontSize:55,color:'#1556a3'},
 attribution:{fontSize:10,color:'#64748b',textAlign:'center',marginTop:8},
 foot:{fontSize:12,color:'#64748b',lineHeight:21,textAlign:'right',paddingHorizontal:4}
});