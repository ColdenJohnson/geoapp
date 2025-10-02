import { Image, StyleSheet, Platform, View, Pressable, Text } from 'react-native';import MapView from 'react-native-maps';
import {Marker, Callout} from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';

import { setUploadResolver } from '../../lib/promiseStore'; // for upload promise
import { useRouter} from 'expo-router';

import { newChallenge, addPhoto, fetchAllLocationPins, fetchPhotosByPinId } from '../../lib/api';
import { ImgFromUrl } from '../../components/ImgDisplay';

import BottomBar from '../../components/ui/BottomBar';
import { CTAButton } from '../../components/ui/Buttons';
import { getDistance } from 'geolib';

import { Toast, useToast } from '../../components/ui/Toast';

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_BASE_URL // from .env file
  const [pins, setPins] = useState([]); // for all pins
  const [pinPhotoUrls, setPinPhotoUrls] = useState({});
  const router = useRouter();
  const mapRef = useRef(null);
  const [didCenter, setDidCenter] = useState(false);

  const NEAR_THRESHOLD_METERS = 2; // "very close" threshold
  const [nearestDistance, setNearestDistance] = useState(null);
  const [isNear, setIsNear] = useState(false);
  const [nearestPin, setNearestPin ] = useState(null);
  const { message: toastMessage, show: showToast} = useToast(3000);

  // TODO: If there were many more pins, we would need pinsArr to be relatively smaller (returned within a radius)
  function computeNearestPin(currentLocation, pinsArr) {
    if (!currentLocation?.coords || !Array.isArray(pinsArr) || pinsArr.length === 0) return null;
    const { latitude, longitude } = currentLocation.coords;
    let bestDist = Infinity;
    let bestPin = null;
    for (const p of pinsArr) {
      if (!p?.location) continue;
      const d = getDistance(
        { latitude, longitude },
        { latitude: p.location.latitude, longitude: p.location.longitude }
      );
      if (d < bestDist) {
        bestDist = d;
        bestPin = p;
      }
    }
    return Number.isFinite(bestDist) ? {pin: bestPin, distance: bestDist} : null;
  }

  function handleTakePhoto() {
    if (!isNear || !nearestPin) {
      console.log(`Not within ${NEAR_THRESHOLD_METERS}, nearest pin is ${nearestDistance} meters away!`); // nearestPin
      showToast(nearestDistance != null ? `Not within ${NEAR_THRESHOLD_METERS}m of a challenge! Currently ${nearestDistance}m away.` : `No challenge nearby!`);
      return;
    }
    viewPhotoChallenge(nearestPin);
  }

  useEffect(() => {
    (async () => {
      const allPins = await fetchAllLocationPins();
      setPins(allPins);

      // Fetch first photo for each pin
      // TODO: this probably should be its own function for clarity
      // this will also eventually be limited to a certain user radius, or only on click/something similar
      // this is a bit fucked because /view_photo_for_each_pin/:pin_id actually returns an array of photo urls of exactly length 1 (filtered in the backend)
      const photoMap = {};
      for (const pin of allPins) {
        // if (pin?._id) {
        //   const photos = await fetchPhotosByPinId(pin._id);
        //   if (photos.length > 0) {
        //     photoMap[pin._id] = photos[0].file_url; // currently just displays the first photo in the array. should do other logic.
        //   }
        // }
        if (pin?._id && pin.most_recent_photo_url) {
          photoMap[pin._id] = pin.most_recent_photo_url;
        }
      }
      setPinPhotoUrls(photoMap);
    })();
  }, []);

  // TODO: To make location watcher run app-wide, put this into a LocationProvider at app root/some type of API (not sure, figure this out)
  // TODO: UseFocusEffect vs UseEffect -- usefocuseffect stops when user navigates away from the screen
  const watchRef = useRef(null);
  useFocusEffect( 
    useCallback(() => {
      let cancelled = false;
      (async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setErrorMsg('Permission to access location was denied');
          return;
        }
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
          (loc) => { if (!cancelled) setLocation(loc); }
        );
        watchRef.current = sub;
      })();
      return () => {
        cancelled = true;
        if (watchRef.current) {
          watchRef.current.remove();
          watchRef.current = null;
        }
      };
    }, [])
  );

  useEffect(() => {
    const d = computeNearestPin(location, pins);
    setNearestDistance(d);
    setIsNear(typeof d === 'number' && d <= NEAR_THRESHOLD_METERS);

    const nearest = computeNearestPin(location, pins);
    setNearestDistance(nearest ? nearest.distance : null);
    setNearestPin(nearest ? nearest.pin : null);
    setIsNear(!!nearest && nearest.distance <= NEAR_THRESHOLD_METERS);
    if (!didCenter && location?.coords && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        },
        500
      );
      setDidCenter(true);
    }
  }, [location, pins, didCenter]);

  async function handleCreateChallengePress() {
    // Prepare to receive the message BEFORE navigating
    const messagePromise = new Promise((resolve) => {
      const { setMessageResolver } = require('../../lib/promiseStore');
      setMessageResolver(resolve);
    });
  
    // Navigate to upload and tell it what the next screen is
    const uploadResult = await new Promise((resolve) => {
      setUploadResolver(resolve);
      router.push({ pathname: '/upload', params: { next: '/enter_message' } });
    });
  
    // Wait for the message (enter_message will resolve it)
    const message = await messagePromise;
  
    // Create the challenge with both pieces
    await newChallenge(location, uploadResult, message);
    router.replace('/');
  }

  async function viewPhotoChallenge(pin) {
    router.push({pathname: '/view_photochallenge', params: { pinId: pin._id } });
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
        key={`map-${pins.length} > 0`} // This line fixes map loading in without pins. It forces a remount of the map when pins.length changes to greater than 0.
        style={styles.map}
        showsUserLocation={true}
        ref={mapRef}
        initialRegion={{
          latitude: location?.coords?.latitude ?? 31.416077,
          longitude: location?.coords?.longitude ?? 120.901488,
          latitudeDelta: location?.coords ? 0.01 : 0.5,
          longitudeDelta: location?.coords ? 0.01 : 0.5,
        }}
      >

{/* Optional explicit user marker (MapView already showsUserLocation) */}
{false && location?.coords && (
  <Marker
    coordinate={{
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
    }}
    title="Your Location"
    description="You are here"
    pinColor="blue"
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
        onPress={() => viewPhotoChallenge(pin)}
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
      <Toast message={toastMessage} bottomOffset={120} />
      <BottomBar>
        <CTAButton
          title={isNear && typeof nearestDistance === 'number' ? `Take Photo` : 'Take Photo'}
          onPress={handleTakePhoto}
          // Gray when pin not near
          style={!isNear ? { borderColor: '#E6E6E6', backgroundColor: '#F2F2F2' } : undefined}
          textStyle={!isNear ? { color: '#9CA3AF' } : undefined}
        />
      </BottomBar>
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
    height: '90%',
    width: '100%',
  },
  button: {
    position: 'absolute',
    top: 20,
    right: 20,
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
    borderRadius: 25,
    padding: 10,
    zIndex: 10,
    elevation: 10,
  },
  buttonText: {
    fontSize: 34,
    lineHeight: 34,
    fontWeight: 'bold',
  },
});
