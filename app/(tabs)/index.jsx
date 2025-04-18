import { Image, StyleSheet, Platform, View} from 'react-native';

import ParallaxScrollView from '@/components/ParallaxScrollView';
import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import MapView from 'react-native-maps';
import {Marker} from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';


export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  
  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
  
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);
    })();
  }, []);
  
  return (
    <ParallaxScrollView
      headerBackgroundColor={{ light: '#DCDCDC', dark: '#1D3D47' }}
      >
        
    {/* <ThemedView style={styles.titleContainer}>
      <ThemedText type="title">User Map!</ThemedText>
    </ThemedView> */}

    {/* If breaking during deployment, it is because it needs an API https://docs.expo.dev/versions/latest/sdk/map-view/ 
    Github docs are also very helpful: https://github.com/react-native-maps/react-native-maps
    */}
    <View style={styles.map_container}> 
    <MapView 
        style={styles.map} 
        showsUserLocation={true}
        
        region={
          location
            ? {
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                latitudeDelta: 1,
                longitudeDelta: 1,
              }
            : {
          latitude: 31.416077,
          longitude: 120.901488,
          latitudeDelta: 1,
          longitudeDelta: 1,
        }

      
      }
      >

{/* user location: note error handling should be added in here in case no location exists */}
{location?.coords && (
  <Marker
    coordinate={{
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    }}
    title="Your Location"
    description="You are here"
    pinColor="blue"
    onPress={() => console.log('Your location pressed!')}
  />
)}

        <Marker
          coordinate={{
            latitude: 31.416077,
            longitude: 120.901488,
          }}
          title="Geo Pin"
          description="This is a photo point."
          onPress={() => console.log('Pin pressed!')}
        />
      </MapView>
    </View>
    


    </ParallaxScrollView>
  );
}

const styles = StyleSheet.create({
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 32
  },
  map: {
    width: '100%',
    height: '100%',
  },
  map_container: {
    height: 800,
    width: '100%', // Change width to 100% to fill the entire screen width,
  },
});
