import { Image, StyleSheet, Platform, View, Pressable, Text, SafeAreaView, useWindowDimensions } from 'react-native';
import MapView from 'react-native-maps';
import {Marker, Callout} from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import axios from 'axios';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { setUploadResolver } from '../../lib/promiseStore'; // for upload promise
import { useRouter} from 'expo-router';

import { newChallenge, fetchAllLocationPins } from '../../lib/api';
import { isInMainlandChina, shouldConvertToGcj02, wgs84ToGcj02 } from '../../lib/geo';
import { ensurePreloadedGlobalDuels, DEFAULT_PRELOAD_COUNT } from '@/lib/globalDuelQueue';

import BottomBar from '../../components/ui/BottomBar';
import { CTAButton } from '../../components/ui/Buttons';
import { getDistance } from 'geolib';

import { Toast, useToast } from '../../components/ui/Toast';
import { usePalette } from '@/hooks/usePalette';

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const PUBLIC_BASE_URL = process.env.EXPO_PUBLIC_BASE_URL // from .env file
  const [pins, setPins] = useState([]); // for all pins
  const router = useRouter();
  const mapRef = useRef(null);
  const [didCenter, setDidCenter] = useState(false);

  const NEAR_THRESHOLD_METERS = 80; // threshold for pin photo distance
  const [nearestDistance, setNearestDistance] = useState(null);
  const [isNear, setIsNear] = useState(false);
  const [nearestPin, setNearestPin ] = useState(null);
  const { message: toastMessage, show: showToast} = useToast(3500);
  const { height: screenHeight } = useWindowDimensions();
  const isSmallScreen = screenHeight < 700;

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
    })();
  }, []);

  const userCoords = useMemo(() => {
    if (
      typeof location?.coords?.latitude === 'number' &&
      typeof location?.coords?.longitude === 'number'
    ) {
      return {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };
    }
    return null;
  }, [location]);

  const userIsInMainland = useMemo(() => {
    if (!userCoords) return false;
    return isInMainlandChina(userCoords.latitude, userCoords.longitude);
  }, [userCoords]);

  const derivedUserCenter = useMemo(() => {
    if (!userCoords) return null;
    return userIsInMainland
      ? wgs84ToGcj02(userCoords.latitude, userCoords.longitude)
      : userCoords;
  }, [userCoords, userIsInMainland]);

  const pinsForDisplay = useMemo(() => {
    if (!Array.isArray(pins)) {
      return [];
    }

    return pins.map((pin) => {
      const baseCoords = pin?.location;
      if (!baseCoords) {
        return pin;
      }

      const needsConversion = shouldConvertToGcj02(userCoords, pin, {
        userIsInMainland,
        pinIsInMainland:
          typeof pin?.pinIsInMainland === 'boolean'
            ? pin.pinIsInMainland
            : undefined,
      });

      return {
        ...pin,
        displayCoords: needsConversion
          ? wgs84ToGcj02(baseCoords.latitude, baseCoords.longitude)
          : baseCoords,
      };
    });
  }, [pins, userCoords, userIsInMainland]);

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
    ensurePreloadedGlobalDuels(DEFAULT_PRELOAD_COUNT).catch((error) =>
      console.error('Failed to warm global duel queue', error)
    );
  }, []);

  useEffect(() => {
    const d = computeNearestPin(location, pins);
    setNearestDistance(d);
    setIsNear(typeof d === 'number' && d <= NEAR_THRESHOLD_METERS);

    const nearest = computeNearestPin(location, pins);
    setNearestDistance(nearest ? nearest.distance : null);
    setNearestPin(nearest ? nearest.pin : null);
    setIsNear(!!nearest && nearest.distance <= NEAR_THRESHOLD_METERS);
    if (!didCenter && userCoords && mapRef.current) {
      handleCenterOnUser();
      setDidCenter(true);
    }
  }, [location, pins, didCenter, userCoords, handleCenterOnUser]);

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
    if (!userCoords || !pin?.location) {
      showToast('Location unavailable. Unable to open this challenge.');
      return;
    }
    const distanceToPin = getDistance(userCoords, {
      latitude: pin.location.latitude,
      longitude: pin.location.longitude,
    });
    if (!Number.isFinite(distanceToPin) || distanceToPin > NEAR_THRESHOLD_METERS) {
      showToast(`Not within ${NEAR_THRESHOLD_METERS}m of this challenge! Currently ${Math.round(distanceToPin)}m away.`);
      return;
    }
    router.push({pathname: '/view_photochallenge', params: { pinId: pin._id } });
  }

  const colors = usePalette();
  const handleCenterOnUser = useCallback(() => {
    if (!derivedUserCenter || !mapRef.current) return;

    mapRef.current.animateToRegion(
      {
        latitude: derivedUserCenter.latitude,
        longitude: derivedUserCenter.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      300
    );
  }, [derivedUserCenter]);
  const styles = useMemo(
    () => createStyles(colors, isSmallScreen),
    [colors, isSmallScreen]
  );

  
  return (

    {/* If breaking during deployment, it is because it needs an API https://docs.expo.dev/versions/latest/sdk/map-view/ 
    Github docs are also very helpful: https://github.com/react-native-maps/react-native-maps
    */},
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
    <Pressable
        style={({ pressed }) => [
          styles.button,
          styles.locateButton,
          { opacity: pressed ? 0.5 : 1 }
        ]}
        onPress={handleCenterOnUser}
      >
        <MaterialIcons name="my-location" size={26} color={colors.text} />
      </Pressable>
    <MapView
        key={`map-${pins.length} > 0`} // This line fixes map loading in without pins. It forces a remount of the map when pins.length changes to greater than 0.
        style={styles.map}
        showsUserLocation={true}
        ref={mapRef}
        initialRegion={{
          latitude: derivedUserCenter?.latitude ?? 31.416077,
          longitude: derivedUserCenter?.longitude ?? 120.901488,
          latitudeDelta: derivedUserCenter ? 0.01 : 0.5,
          longitudeDelta: derivedUserCenter ? 0.01 : 0.5,
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


  {pinsForDisplay.map((pin) => (
    pin?.location ? (
    <Marker
      key={pin._id}
      coordinate={{
        latitude: pin.displayCoords?.latitude ?? pin.location.latitude,
        longitude: pin.displayCoords?.longitude ?? pin.location.longitude,
      }}
      title={"Photo Challenge"}
      description={pin.message || 'Geo Pin'}
    >
      <Callout
        tooltip
        onPress={() => viewPhotoChallenge(pin)}
      >
        <View style={styles.calloutCard}>
          <Text style={styles.calloutLabel}>Challenge</Text>
          <Text style={styles.calloutPrompt} numberOfLines={3}>
            {pin.message || '???'}
          </Text>
          <View style={styles.calloutDivider} />
          <Text style={styles.calloutMeta}>
            Photos: {Number.isFinite(pin?.photo_count) ? pin.photo_count : 0}
          </Text>
        </View>
      </Callout>
    </Marker> ) : null
  ))}

      </MapView>
      <Toast message={toastMessage} bottomOffset={140} />
      <BottomBar>
        <CTAButton
          title={isNear && typeof nearestDistance === 'number' ? `Take Photo` : 'Take Photo'}
          onPress={handleTakePhoto}
          // Gray when pin not near
          style={!isNear ? { borderColor: colors.border, backgroundColor: colors.surface } : undefined}
          textStyle={!isNear ? { color: colors.textMuted } : undefined}
        />
      </BottomBar>
    </View>
  );
}

function createStyles(colors, isSmallScreen) {
  return StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    titleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      padding: 32
    },
    map: {
      width: '100%',
      // on small screens, let the map take up more space
      flex: isSmallScreen ? 0.91 : 0.885,
    },
    map_container: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.bg,
    },
    button: {
      position: 'absolute',
      top: 20,
      right: 20,
      width: 50,
      height: 50,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      borderRadius: 25,
      padding: 10,
      zIndex: 10,
      elevation: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    locateButton: {
      top: 80,
    },
    buttonText: {
      fontSize: 34,
      lineHeight: 34,
      fontWeight: 'bold',
      color: colors.text,
    },
    calloutCard: {
      width: 200,
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    calloutLabel: {
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      color: colors.textMuted,
      marginBottom: 6,
    },
    calloutPrompt: {
      fontSize: 14,
      lineHeight: 18,
      fontWeight: '600',
      color: colors.text,
    },
    calloutDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: 10,
    },
    calloutMeta: {
      fontSize: 12,
      color: colors.textMuted,
    },
    bottomBarSmall: {
      paddingHorizontal: 10,
      paddingTop: 6,
      paddingBottom: 10,
    },
  });
}
