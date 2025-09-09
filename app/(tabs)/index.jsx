import { Image, StyleSheet, Platform, View, Pressable, Text } from 'react-native';import MapView from 'react-native-maps';
import {Marker, Callout} from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState } from 'react';
import axios from 'axios';

import { setUploadResolver } from '../../lib/promiseStore'; // for upload promise
import { useRouter} from 'expo-router';

import { newPhotoChallenge, addPhotoChallenge, fetchAllLocationPins, fetchPhotosByPinId } from '../../lib/api';
import { ImgFromUrl } from '../../components/ImgDisplay';

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_BASE_URL // from .env file
  const [pins, setPins] = useState([]); // for all pins
  const [pinPhotoUrls, setPinPhotoUrls] = useState({});
  const router = useRouter();

  

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setErrorMsg('Permission to access location was denied');
        return;
      }
      let currentLocation = await Location.getCurrentPositionAsync({});
      setLocation(currentLocation);

      const allPins = await fetchAllLocationPins();
      setPins(allPins);

      // Fetch first photo for each pin
      // TODO: this probably should be its own function for clarity
      // this will also eventually be limited to a certain user radius, or only on click/something similar
      // this is a bit fucked because /view_photo_for_each_pin/:pin_id actually returns an array of photo urls of exactly length 1 (filtered in the backend)
      const photoMap = {};
      for (const pin of allPins) {
        if (pin?._id) {
          const photos = await fetchPhotosByPinId(pin._id);
          if (photos.length > 0) {
            photoMap[pin._id] = photos[0].file_url; // currently just displays the first photo in the array. should do other logic.
          }
        }
      }
      setPinPhotoUrls(photoMap);

    })();
  }, []);

  async function handleCreateChallengePress() {
    const uploadResult = await new Promise((resolve) => {
      setUploadResolver(resolve); // resolver is stored globally
      // navigation.navigate('upload');
      router.push('/upload');
    });
  
    await newPhotoChallenge(location, uploadResult);
  }

  async function handleAddPhotoToChallenge(pin) {
    const uploadResult = await new Promise((resolve) => {
      setUploadResolver(resolve);
      router.push('/upload');
    });
  
    await addPhotoChallenge(pin._id, uploadResult);
  }

  
  return (
    <View
      headerBackgroundColor={{ light: '#DCDCDC', dark: '#1D3D47' }}
      >

    {/* If breaking during deployment, it is because it needs an API https://docs.expo.dev/versions/latest/sdk/map-view/ 
    Github docs are also very helpful: https://github.com/react-native-maps/react-native-maps
    */}
    <View style={styles.map_container}>
    <Pressable // button to create new challenge
        style={({ pressed }) => [
          styles.button, 
          { opacity: pressed ? 0.5 : 1 }
        ]} 
        onPress={handleCreateChallengePress}
      >
        <Text style={styles.buttonText}>+</Text>
        </Pressable>
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
      latitude: location.coords.latitude + 1,
      longitude: location.coords.longitude + 1,
    }}
    title="Your Location"
    description="You are here"
    pinColor="blue"
    // onPress={() => create_new_challenge(location)}
  />
)}


  {pins.map((pin) => (
    pin?.location ? (
    <Marker
      key={pin._id}
      coordinate={{
        latitude: pin.location.latitude,
        longitude: pin.location.longitude,
      }}
      title={"Photo Challenge"}
      description={pin.message || 'Geo Pin'}
    >
      <Callout
        tooltip
        onPress={() => handleAddPhotoToChallenge(pin)}
      >
        <View style={{ width: 150, height: 150, padding: 5, backgroundColor: 'white', borderRadius: 10, alignItems: 'center' }}>
          <ImgFromUrl 
            url={pinPhotoUrls[pin._id]}
            style={{ width: '100%', height: '100%' }}
            resizeMode="cover"
          />
        </View>
      </Callout>
    </Marker> ) : null
  ))}
      </MapView>
    </View>
    </View>
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
    height: '100%',
    width: '100%',
  },
  button: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 10,
    zIndex: 10,
    elevation: 10,
  },
  buttonText: {
    fontSize: 24,
    fontWeight: 'bold',
  },
});
