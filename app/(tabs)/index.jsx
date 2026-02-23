import { StyleSheet, View, Pressable, Alert, Text } from 'react-native';
import MapView from 'react-native-maps';
import {Marker, Callout} from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState, useRef, useCallback, useMemo, useContext } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setUploadResolver } from '../../lib/promiseStore'; // for upload promise
import { useRouter} from 'expo-router';

import { newChallenge, fetchAllLocationPins, addPhoto } from '../../lib/api';
import { isInMainlandChina, shouldConvertToGcj02, wgs84ToGcj02 } from '../../lib/geo';
import { ensurePreloadedGlobalDuels, DEFAULT_PRELOAD_COUNT } from '@/lib/globalDuelQueue';

import { getDistance } from 'geolib';

import { Toast, useToast } from '../../components/ui/Toast';
import { usePalette } from '@/hooks/usePalette';
import { AuthContext } from '@/hooks/AuthContext';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [pins, setPins] = useState([]); // for all pins
  const [optimisticPhotosByPin, setOptimisticPhotosByPin] = useState({});
  const router = useRouter();
  const mapRef = useRef(null);
  const [didCenter, setDidCenter] = useState(false);

  const NEAR_THRESHOLD_METERS = 80; // threshold for pin photo distance
  const [showFriendsOnly, setShowFriendsOnly] = useState(false);
  const { message: toastMessage, show: showToast } = useToast(3500);
  const insets = useSafeAreaInsets();
  const bottomTabOverflow = useBottomTabOverflow();
  const { user, friends, invalidateStats } = useContext(AuthContext);

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
    const nearestNow = computeNearestPin(location, pins);
    const closestPin = nearestNow?.pin ?? null;
    const closestDistance = nearestNow?.distance ?? null;
    const inRange = Number.isFinite(closestDistance) && closestDistance <= NEAR_THRESHOLD_METERS;

    if (!inRange || !closestPin) {
      console.log(`Not within ${NEAR_THRESHOLD_METERS}, nearest pin is ${closestDistance} meters away!`); // nearestPin
      showToast(closestDistance != null ? `Not within ${NEAR_THRESHOLD_METERS}m of a challenge! Currently ${closestDistance}m away.` : `No challenge nearby!`);
      Alert.alert(
                  'Uh-oh!',
                  closestDistance != null ? `Not within ${NEAR_THRESHOLD_METERS}m of a challenge! \n Would you like to create a new challenge?` : `No challenge nearby! \n Would you like to create a new challenge?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Create', style: 'default', onPress: async () => {
                        try {
                          handleCreateChallengePress();
                        } catch (e) {
                          console.error('Create challenge error:', e);
                        }
                      } }
                  ]
                );
      return;
    }
    uploadPhotoToNearestChallenge(closestPin);
  }

  // Camera-plus action: go straight into upload for the nearest in-range challenge.
  function uploadPhotoToNearestChallenge(pin) {
    if (!pin?._id) {
      showToast('No valid challenge nearby.');
      return;
    }

    const uploadPromise = new Promise((resolve) => {
      setUploadResolver(resolve);
      router.push({
        pathname: '/upload',
        params: {
          prompt: pin?.message || '',
        },
      });
    });

    uploadPromise
      .then(async (uploadResult) => {
        if (!uploadResult) {
          return;
        }
        const pinId = pin._id;
        showToast('Uploading photo…', 60000);
        setPins((prev) =>
          Array.isArray(prev)
            ? prev.map((p) =>
                p?._id === pinId
                  ? { ...p, photo_count: Math.max(0, Number(p?.photo_count || 0) + 1) }
                  : p
              )
            : prev
        );
        setOptimisticPhotosByPin((prev) => {
          const current = Array.isArray(prev?.[pinId]) ? prev[pinId] : [];
          return { ...prev, [pinId]: [uploadResult, ...current].slice(0, 3) };
        });

        try {
          await addPhoto(pinId, uploadResult);
          invalidateStats();
          showToast('Upload success', 2200);
        } catch (error) {
          setPins((prev) =>
            Array.isArray(prev)
              ? prev.map((p) =>
                  p?._id === pinId
                    ? { ...p, photo_count: Math.max(0, Number(p?.photo_count || 0) - 1) }
                    : p
                )
              : prev
          );
          setOptimisticPhotosByPin((prev) => {
            const current = Array.isArray(prev?.[pinId]) ? prev[pinId] : [];
            const next = current.filter((url) => url !== uploadResult);
            if (next.length === 0) {
              const { [pinId]: _removed, ...rest } = prev;
              return rest;
            }
            return { ...prev, [pinId]: next };
          });
          throw error;
        }
      })
      .catch((error) => {
        console.error('Failed to upload photo to nearest challenge', error);
        showToast('Upload failed', 2500);
      });
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
  const friendUidSet = useMemo(() => {
    if (!Array.isArray(friends)) return new Set();
    return new Set(
      friends
        .map((friend) => friend?.uid)
        .filter((uid) => typeof uid === 'string' && uid.length > 0)
    );
  }, [friends]);

  const isFriendOrOwnPin = useCallback((pin) => {
    const createdBy = typeof pin?.created_by === 'string' ? pin.created_by : '';
    if (createdBy) {
      if (createdBy === user?.uid) return true;
      return friendUidSet.has(createdBy);
    }
    return pin?.is_friend_pin === true;
  }, [friendUidSet, user?.uid]);

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
  const visiblePins = useMemo(() => {
    if (!showFriendsOnly) return pinsForDisplay;
    return pinsForDisplay.filter((pin) => isFriendOrOwnPin(pin));
  }, [isFriendOrOwnPin, pinsForDisplay, showFriendsOnly]);

  // TODO: To make location watcher run app-wide, put this into a LocationProvider at app root/some type of API (not sure, figure this out)
  // TODO: UseFocusEffect vs UseEffect -- usefocuseffect stops when user navigates away from the screen
  const watchRef = useRef(null);
  useFocusEffect( 
    useCallback(() => {
      let cancelled = false;
      (async () => {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          console.warn('Permission to access location was denied');
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
    if (!didCenter && userCoords && mapRef.current) {
      handleCenterOnUser();
      setDidCenter(true);
    }
  }, [location, pins, didCenter, userCoords, handleCenterOnUser]);

  function handleCreateChallengePress() {
    if (!location) {
      showToast('Location unavailable. Try again once we have your position.');
      return;
    }

    const uploadPromise = new Promise((resolve) => {
      setUploadResolver(resolve);
    });
    const messagePromise = new Promise((resolve) => {
      const { setMessageResolver } = require('../../lib/promiseStore');
      setMessageResolver(resolve);
    });

    router.push('/enter_message');

    Promise.all([uploadPromise, messagePromise])
      .then(async ([fileUrl, message]) => {
        if (!fileUrl) {
          return;
        }
        showToast('Uploading...', 60000);
        const created = await newChallenge(location, fileUrl, message);
        if (created?.pin) {
          const nextPin = {
            ...created.pin,
            created_by: created.pin?.created_by || user?.uid || null,
          };
          setPins((prev) => {
            if (!Array.isArray(prev)) return [nextPin];
            if (prev.find((pin) => pin?._id === nextPin._id)) return prev;
            return [nextPin, ...prev];
          });
        }
        invalidateStats();
        showToast('Upload Sucess', 2200);
        router.replace('/');
      })
      .catch((error) => {
        console.error('Failed to create challenge after upload', error);
        showToast('Upload Failed', 2500);
      });
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
    router.push({
      pathname: '/view_photochallenge',
      params: {
        pinId: pin._id,
        message: pin?.message || '',
        created_by_handle: pin?.created_by_handle || '',
        optimistic_photo_urls: JSON.stringify(optimisticPhotosByPin?.[pin._id] || []),
      },
    });
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
  const styles = useMemo(() => createStyles(colors), [colors]);
  const controlsBottomOffset = 20 + insets.bottom + bottomTabOverflow;
  const toastBottomOffset = controlsBottomOffset + 96;
  const topRightControlsTop = 16 + insets.top;

  
  return (
    <View style={styles.map_container}>
      {/* If breaking during deployment, it is because it needs an API https://docs.expo.dev/versions/latest/sdk/map-view/
      Github docs are also very helpful: https://github.com/react-native-maps/react-native-maps
      */}
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


  {visiblePins.map((pin) => {
    if (!pin?.location) return null;
    const handleLabel = pin?.created_by_handle ? `@${pin.created_by_handle}` : 'anon';
    const isFriendPin = isFriendOrOwnPin(pin);
    return (
      <Marker
        key={pin._id}
        coordinate={{
          latitude: pin.displayCoords?.latitude ?? pin.location.latitude,
          longitude: pin.displayCoords?.longitude ?? pin.location.longitude,
        }}
        title={"Photo Challenge"}
        description={pin.message || 'Geo Pin'}
        pinColor={isFriendPin ? colors.primary_darkened : colors.primary}
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
              By {handleLabel}
            </Text>
            <Text style={styles.calloutMeta}>
              Photos: {Number.isFinite(pin?.photo_count) ? pin.photo_count : 0}
            </Text>
          </View>
        </Callout>
      </Marker>
    );
  })}

      </MapView>
      <View style={[styles.topRightOverlay, { top: topRightControlsTop }]} pointerEvents="box-none">
        <View style={styles.controlStackVertical}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              { opacity: pressed ? 0.5 : 1 },
            ]}
            onPress={handleCenterOnUser}
          >
            <MaterialIcons name="my-location" size={26} color={colors.text} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              showFriendsOnly ? styles.filterButtonActive : null,
              { opacity: pressed ? 0.5 : 1 },
            ]}
            onPress={() => setShowFriendsOnly((prev) => !prev)}
          >
            <MaterialIcons
              name="people"
              size={24}
              color={showFriendsOnly ? colors.bg : colors.text}
            />
          </Pressable>
        </View>
      </View>

      <View style={[styles.controlsOverlay, { bottom: controlsBottomOffset }]} pointerEvents="box-none">
        <View style={styles.controlGroup}>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.buttonCreate,
              { opacity: pressed ? 0.5 : 1 },
            ]}
            onPress={handleCreateChallengePress}
          >
            <MaterialIcons name="add-location-alt" size={28} color={colors.primary} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              styles.buttonTakePhoto,
              { opacity: pressed ? 0.5 : 1 },
            ]}
            onPress={handleTakePhoto}
          >
            <MaterialIcons
              name="add-a-photo"
              size={27}
              color={colors.primaryTextOn}
            />
          </Pressable>
        </View>
      </View>
      <Toast message={toastMessage} bottomOffset={toastBottomOffset} />
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    map: {
      width: '100%',
      flex: 1,
    },
    map_container: {
      flex: 1,
      width: '100%',
      backgroundColor: colors.surface,
    },
    button: {
      width: 60,
      height: 60,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      borderRadius: 20,
      padding: 10,
      elevation: 12,
      borderWidth: 1,
      borderColor: colors.barBorder,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 16,
      shadowOpacity: 0.12,
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    buttonCreate: {
      borderColor: colors.primary,
      borderWidth: 2,
      backgroundColor: colors.bg,
    },
    buttonTakePhoto: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    topRightOverlay: {
      position: 'absolute',
      right: 18,
      zIndex: 10,
    },
    controlsOverlay: {
      position: 'absolute',
      left: 18,
      right: 18,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      zIndex: 10,
    },
    controlGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    controlStackVertical: {
      alignItems: 'center',
      gap: 12,
    },
    calloutCard: {
      width: 220,
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: colors.bg,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
    },
    calloutLabel: {
      fontSize: 10,
      textTransform: 'uppercase',
      letterSpacing: 1.3,
      color: colors.primary,
      fontWeight: '800',
      marginBottom: 6,
    },
    calloutPrompt: {
      fontSize: 15,
      lineHeight: 20,
      fontWeight: '800',
      color: colors.text,
    },
    calloutDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 10,
    },
    calloutMeta: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
    },
  });
}
