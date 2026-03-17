import { StyleSheet, View, Pressable, Text, useWindowDimensions } from 'react-native';
import MapView from 'react-native-maps';
import { Marker, Callout, CalloutSubview } from 'react-native-maps';
import * as Location from 'expo-location';
import { useEffect, useState, useRef, useCallback, useMemo, useContext } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setUploadResolver } from '../../lib/promiseStore'; // for upload promise
import { useRouter} from 'expo-router';

import { newChallenge, fetchAllLocationPins, fetchFriendPrivateLocationPins, addPhoto } from '../../lib/api';
import { isInMainlandChina, shouldConvertToGcj02, wgs84ToGcj02 } from '../../lib/geo';
import { buildViewPhotoChallengeRoute } from '../../lib/navigation';
import { ensurePreloadedGlobalDuels, DEFAULT_PRELOAD_COUNT } from '@/lib/globalDuelQueue';
import { updatePinPhotosCache } from '@/lib/pinChallengeCache';
import {
  clusterMapPins,
  DEFAULT_PIN_COLLISION_DISTANCE_PX,
} from '@/lib/mapPinClustering';
import QuestMapPin from '@/components/map/QuestMapPin';
import { resolveMapPinTheme } from '@/theme/mapPins';

import { getDistance } from 'geolib';

import { Toast, useToast } from '../../components/ui/Toast';
import { usePalette } from '@/hooks/usePalette';
import { AuthContext } from '@/hooks/AuthContext';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';

const MARKER_REFRESH_WINDOW_MS = 240;

export default function HomeScreen() {
  const [location, setLocation] = useState(null);
  const [pins, setPins] = useState([]); // for all pins
  const [pressedUploadPinId, setPressedUploadPinId] = useState(null);
  const router = useRouter();
  const mapRef = useRef(null);
  const pressedUploadResetTimeoutRef = useRef(null);
  const markerRefreshTimeoutRef = useRef(null);
  const [didCenter, setDidCenter] = useState(false);
  const [mapLayout, setMapLayout] = useState({ width: 0, height: 0 });
  const [markerTracksViewChanges, setMarkerTracksViewChanges] = useState(true);

  const NEAR_THRESHOLD_METERS = 80; // threshold for pin photo distance
  const [showFriendsOnly, setShowFriendsOnly] = useState(false);
  const { message: toastMessage, show: showToast } = useToast(3500);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomTabOverflow = useBottomTabOverflow();
  const { user, friends, invalidateStats } = useContext(AuthContext);
  const colors = usePalette();

  function uploadPhotoToChallenge(pin) {
    if (!pin?._id) {
      showToast('No valid challenge selected.');
      return;
    }
    const pinId = String(pin._id);
    const hadUploadedBefore = pin?.viewer_has_uploaded === true;
    const uploadRequestId = `map-upload-${pinId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const uploadPromise = new Promise((resolve) => {
      setUploadResolver(resolve, uploadRequestId);
      router.push({
        pathname: '/upload',
        params: {
          next: '/view_photochallenge',
          pinId,
          prompt: pin?.message || '',
          created_by_handle: pin?.created_by_handle || '',
          uploadRequestId,
        },
      });
    });

    uploadPromise
      .then(async (uploadResult) => {
        if (!uploadResult) {
          return;
        }
        setPins((prev) =>
          Array.isArray(prev)
            ? prev.map((p) =>
                String(p?._id) === pinId
                  ? {
                    ...p,
                    photo_count: Math.max(0, Number(p?.photo_count || 0) + 1),
                    viewer_has_uploaded: true,
                  }
                  : p
              )
            : prev
        );
        try {
          await addPhoto(pinId, uploadResult);
          invalidateStats();
        } catch (error) {
          await updatePinPhotosCache(pinId, (current) => (
            Array.isArray(current)
              ? current.filter((photo) => photo?.remote_file_url !== uploadResult)
              : current
          ));
          setPins((prev) =>
            Array.isArray(prev)
              ? prev.map((p) =>
                  String(p?._id) === pinId
                    ? {
                      ...p,
                      photo_count: Math.max(0, Number(p?.photo_count || 0) - 1),
                      viewer_has_uploaded: hadUploadedBefore,
                    }
                    : p
                )
              : prev
          );
          throw error;
        }
      })
      .catch((error) => {
        console.error('Failed to upload photo to challenge', error);
        showToast('Upload failed', 2500);
      });
  }

  function handleUploadPhotoPress(pin) {
    const pinId = String(pin?._id || '');
    if (!pinId) {
      uploadPhotoToChallenge(pin);
      return;
    }
    if (pressedUploadResetTimeoutRef.current) {
      clearTimeout(pressedUploadResetTimeoutRef.current);
    }
    setPressedUploadPinId(pinId);
    pressedUploadResetTimeoutRef.current = setTimeout(() => {
      setPressedUploadPinId((current) => (current === pinId ? null : current));
      pressedUploadResetTimeoutRef.current = null;
    }, 90);
    uploadPhotoToChallenge(pin);
  }

  useEffect(() => {
    (async () => {
      const [geoLockedPins, nonGeoLockedPins, privateGeoLockedPins, privateNonGeoLockedPins] = await Promise.all([
        fetchAllLocationPins({ isGeoLocked: true }),
        fetchAllLocationPins({ isGeoLocked: false }),
        fetchFriendPrivateLocationPins({ isGeoLocked: true }),
        fetchFriendPrivateLocationPins({ isGeoLocked: false }),
      ]);
      const combined = [
        ...(Array.isArray(geoLockedPins) ? geoLockedPins : []),
        ...(Array.isArray(nonGeoLockedPins) ? nonGeoLockedPins : []),
        ...(Array.isArray(privateGeoLockedPins) ? privateGeoLockedPins : []),
        ...(Array.isArray(privateNonGeoLockedPins) ? privateNonGeoLockedPins : []),
      ];
      const deduped = Array.from(
        new Map(combined.filter((pin) => pin?._id).map((pin) => [String(pin._id), pin])).values()
      );
      setPins(deduped);
    })();
  }, []);

  useEffect(() => () => {
    if (pressedUploadResetTimeoutRef.current) {
      clearTimeout(pressedUploadResetTimeoutRef.current);
      pressedUploadResetTimeoutRef.current = null;
    }
    if (markerRefreshTimeoutRef.current) {
      clearTimeout(markerRefreshTimeoutRef.current);
      markerRefreshTimeoutRef.current = null;
    }
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
  const initialMapRegion = useMemo(() => ({
    latitude: derivedUserCenter?.latitude ?? 31.416077,
    longitude: derivedUserCenter?.longitude ?? 120.901488,
    latitudeDelta: derivedUserCenter ? 0.01 : 0.5,
    longitudeDelta: derivedUserCenter ? 0.01 : 0.5,
  }), [derivedUserCenter]);
  const [mapRegion, setMapRegion] = useState(initialMapRegion);
  const handleCenterOnUser = useCallback(() => {
    if (!derivedUserCenter || !mapRef.current) return;

    const nextRegion = {
      latitude: derivedUserCenter.latitude,
      longitude: derivedUserCenter.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    setMapRegion(nextRegion);
    mapRef.current.animateToRegion(nextRegion, 300);
  }, [derivedUserCenter]);
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
  const isFriendPin = useCallback((pin) => {
    const createdBy = typeof pin?.created_by === 'string' ? pin.created_by : '';
    if (createdBy) {
      return createdBy !== user?.uid && friendUidSet.has(createdBy);
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
  const pinCollisionGroups = useMemo(() => clusterMapPins(visiblePins, {
    region: mapRegion,
    mapSize: mapLayout,
    collisionDistancePx: DEFAULT_PIN_COLLISION_DISTANCE_PX,
  }), [mapLayout, mapRegion, visiblePins]);
  const handleFriendsFilterPress = useCallback(() => {
    if (!showFriendsOnly && friendUidSet.size === 0) {
      showToast('Add some friends to see their pins!');
      return;
    }
    setShowFriendsOnly((prev) => !prev);
  }, [friendUidSet, showFriendsOnly, showToast]);

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
  }, [didCenter, handleCenterOnUser, userCoords]);

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
    const geoLockPromise = new Promise((resolve) => {
      const { setGeoLockResolver } = require('../../lib/promiseStore');
      setGeoLockResolver(resolve);
    });

    router.push('/enter_message');

    Promise.all([uploadPromise, messagePromise, geoLockPromise])
      .then(async ([fileUrl, message, isGeoLocked]) => {
        if (!fileUrl) {
          return;
        }
        showToast('Uploading...', 60000);
        const created = await newChallenge(location, fileUrl, message, {
          isGeoLocked: typeof isGeoLocked === 'boolean' ? isGeoLocked : true,
        });
        if (!created) {
          throw new Error('newChallenge returned falsey');
        }
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
        router.push(buildViewPhotoChallengeRoute({
          pinId: created.pinId,
          message,
          createdByHandle: created.pin?.created_by_handle || '',
        }));
      })
      .catch((error) => {
        console.error('Failed to create challenge after upload', error);
        showToast('Upload Failed', 2500);
      });
  }

  async function viewPhotoChallenge(pin) {
    if (!pin?.location) {
      showToast('Location unavailable. Unable to open this challenge.');
      return;
    }
    const accessBlockedMessage = getPinAccessBlockedMessage(pin);
    if (accessBlockedMessage) {
      showToast(accessBlockedMessage);
      return;
    }
    router.push(buildViewPhotoChallengeRoute({
      pinId: pin._id,
      message: pin?.message || '',
      createdByHandle: pin?.created_by_handle || '',
    }));
  }

  const getDistanceToPin = useCallback((pin) => {
    if (!userCoords || !pin?.location) {
      return null;
    }

    const distance = getDistance(userCoords, {
      latitude: pin.location.latitude,
      longitude: pin.location.longitude,
    });

    return Number.isFinite(distance) ? distance : null;
  }, [userCoords]);
  const isPinWithinRange = useCallback((pin) => {
    const distance = getDistanceToPin(pin);
    return distance !== null && distance <= NEAR_THRESHOLD_METERS;
  }, [getDistanceToPin]);
  const canViewerAccessPin = useCallback((pin) => {
    const createdBy = typeof pin?.created_by === 'string' ? pin.created_by : '';
    if (createdBy && createdBy === user?.uid) {
      return true;
    }
    if (pin?.viewer_has_uploaded === true) {
      return true;
    }
    return isPinWithinRange(pin);
  }, [isPinWithinRange, user?.uid]);
  const getPinAccessBlockedMessage = useCallback((pin) => {
    if (!pin?.location) {
      return 'Location unavailable. Unable to open this challenge.';
    }
    if (pin?.isGeoLocked === false || canViewerAccessPin(pin)) {
      return null;
    }
    const distanceToPin = getDistanceToPin(pin);
    if (distanceToPin === null) {
      return 'Location unavailable. Unable to open this challenge.';
    }
    return `Not within ${NEAR_THRESHOLD_METERS}m of this challenge! Currently ${Math.round(distanceToPin)}m away.`;
  }, [canViewerAccessPin, getDistanceToPin]);

  const refreshMarkerSnapshots = useCallback(() => {
    setMarkerTracksViewChanges(true);
    if (markerRefreshTimeoutRef.current) {
      clearTimeout(markerRefreshTimeoutRef.current);
    }
    markerRefreshTimeoutRef.current = setTimeout(() => {
      setMarkerTracksViewChanges(false);
      markerRefreshTimeoutRef.current = null;
    }, MARKER_REFRESH_WINDOW_MS);
  }, []);
  const handleMapLayout = useCallback((event) => {
    const { width, height } = event.nativeEvent.layout || {};
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return;
    }
    setMapLayout((current) => (
      current.width === width && current.height === height
        ? current
        : { width, height }
    ));
    refreshMarkerSnapshots();
  }, [refreshMarkerSnapshots]);
  const handleRegionChangeComplete = useCallback((nextRegion) => {
    setMapRegion(nextRegion);
    refreshMarkerSnapshots();
  }, [refreshMarkerSnapshots]);

  useEffect(() => {
    refreshMarkerSnapshots();
  }, [pinCollisionGroups, refreshMarkerSnapshots]);

  const styles = useMemo(() => createStyles(colors), [colors]);
  const calloutWidth = useMemo(
    () => Math.max(252, Math.min(windowWidth - 48, 320)),
    [windowWidth]
  );
  const calloutCardStyle = useMemo(() => ({
    width: calloutWidth,
  }), [calloutWidth]);
  const calloutContentPressableStyle = useMemo(() => ({
    width: Math.max(156, calloutWidth - 92),
  }), [calloutWidth]);
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
        onLayout={handleMapLayout}
        onRegionChangeComplete={handleRegionChangeComplete}
        initialRegion={{
          latitude: initialMapRegion.latitude,
          longitude: initialMapRegion.longitude,
          latitudeDelta: initialMapRegion.latitudeDelta,
          longitudeDelta: initialMapRegion.longitudeDelta,
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
    pinColor={colors.pinOpen}
  />
)}
  {pinCollisionGroups.map((group) => {
    const pin = group?.representativePin;
    if (!pin || !group?.representativeCoordinate) return null;

    const pinId = String(pin._id);
    const handleLabel = pin?.created_by_handle ? `@${pin.created_by_handle}` : 'anon';
    const isFriendStyledPin = isFriendPin(pin);
    const accessBlockedMessage = getPinAccessBlockedMessage(pin);
    const uploadLocked = Boolean(accessBlockedMessage);
    const pinTheme = resolveMapPinTheme(pin, colors, {
      isFriendPin: isFriendStyledPin,
      isUnlocked: canViewerAccessPin(pin),
    });
    const markerKey = `representative:${pinId}`;

    return (
      <Marker
        key={markerKey}
        coordinate={group.representativeCoordinate}
        anchor={{ x: 0.5, y: 1 }}
        calloutOffset={{ x: 0, y: 12 }}
        tracksViewChanges={markerTracksViewChanges}
        title="Photo Challenge"
        description={pin.message || 'Geo Pin'}
      >
        <QuestMapPin
          theme={pinTheme}
          badgeCount={group.memberCount}
        />
        <Callout tooltip>
          <View style={[styles.calloutCard, calloutCardStyle]}>
            <CalloutSubview
              onPress={() => viewPhotoChallenge(pin)}
              style={[styles.calloutContentPressable, calloutContentPressableStyle]}
            >
              <View style={styles.calloutContent}>
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
                {group.memberCount > 1 ? (
                  <Text style={styles.calloutMeta}>
                    Showing most popular of {group.memberCount} overlapping pins
                  </Text>
                ) : null}
              </View>
            </CalloutSubview>
            <CalloutSubview
              onPress={() => {
                if (accessBlockedMessage) {
                  showToast(accessBlockedMessage);
                  return;
                }
                handleUploadPhotoPress(pin);
              }}
            >
              <View
                style={[
                  styles.button,
                  uploadLocked ? styles.calloutActionButtonLocked : styles.buttonTakePhoto,
                  styles.calloutActionButton,
                  !uploadLocked && pressedUploadPinId === pinId ? styles.calloutActionButtonPressed : null,
                ]}
              >
                <MaterialIcons
                  name="add-a-photo"
                  size={27}
                  color={uploadLocked ? colors.textMuted : colors.primaryTextOn}
                />
              </View>
            </CalloutSubview>
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
            onPress={handleFriendsFilterPress}
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
              styles.buttonCreateLarge,
              { opacity: pressed ? 0.5 : 1 },
            ]}
            onPress={handleCreateChallengePress}
          >
            <MaterialIcons name="add-location-alt" size={32} color={colors.primary} />
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
    buttonCreateLarge: {
      width: 69,
      height: 69,
      borderRadius: 23,
      padding: 12,
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
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 12,
      padding: 10,
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
    calloutContentPressable: {
      flexShrink: 1,
      minWidth: 0,
    },
    calloutContent: {
      flexShrink: 1,
      minWidth: 0,
      paddingLeft: 6,
      paddingVertical: 4,
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
    calloutActionButton: {
      flexShrink: 0,
    },
    calloutActionButtonLocked: {
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    calloutActionButtonPressed: {
      opacity: 0.5,
    },
  });
}
