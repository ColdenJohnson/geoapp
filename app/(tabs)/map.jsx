import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import MapView from 'react-native-maps';
import { Callout, CalloutSubview, Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchChallengeByPinId, fetchPhotosByPinId } from '../../lib/api';
import { isInMainlandChina, shouldConvertToGcj02, wgs84ToGcj02 } from '../../lib/geo';
import { buildViewPhotoChallengePhotoRoute, goBackOrHome } from '../../lib/navigation';
import {
  clusterMapPins,
  DEFAULT_PIN_COLLISION_DISTANCE_PX,
} from '@/lib/mapPinClustering';
import QuestMapPin from '@/components/map/QuestMapPin';
import { getMapPinTheme } from '@/theme/mapPins';
import { darkMapStyle } from '@/theme/mapStyle';

import { Toast, useToast } from '../../components/ui/Toast';
import { useColorScheme } from '@/hooks/useColorScheme';
import { usePalette } from '@/hooks/usePalette';
import { AuthContext } from '@/hooks/AuthContext';
import { useBottomTabOverflow } from '@/components/ui/TabBarBackground';
import { radii, shadows, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const MARKER_REFRESH_WINDOW_MS = 240;
const DEFAULT_REGION = {
  latitude: 31.416077,
  longitude: 120.901488,
  latitudeDelta: 0.5,
  longitudeDelta: 0.5,
};

function normalizeParamText(value) {
  if (Array.isArray(value)) {
    return normalizeParamText(value[0]);
  }
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function normalizeCoordinate(value) {
  const latitude = Number(value?.latitude ?? value?.coords?.latitude);
  const longitude = Number(value?.longitude ?? value?.coords?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

function formatShortDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return 'Unknown date';
  }
  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function buildPhotoMarker(photo) {
  const location = normalizeCoordinate(photo?.location);
  if (!photo?._id || !location) {
    return null;
  }

  return {
    ...photo,
    _id: String(photo._id),
    location,
    photo_count: 1,
  };
}

function getPhotoHandle(photo) {
  const handle = typeof photo?.created_by_handle === 'string'
    ? photo.created_by_handle.trim()
    : '';
  return handle ? `@${handle}` : 'anon';
}

function buildRegionForCoordinate(coordinate) {
  return {
    latitude: coordinate.latitude,
    longitude: coordinate.longitude,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };
}

function getPhotoPinTheme(colors, { isFriendPhoto = false } = {}) {
  const baseTheme = getMapPinTheme(isFriendPhoto ? 'open' : 'location', colors);
  return {
    ...baseTheme,
    glyphName: 'photo-camera',
  };
}

export default function QuestPhotoMapScreen() {
  const {
    pinId: pinIdParam,
    message: promptParam,
    created_by_handle: handleParam,
  } = useLocalSearchParams();
  const pinId = normalizeParamText(pinIdParam);
  const promptParamText = normalizeParamText(promptParam);
  const handleParamText = normalizeParamText(handleParam);
  const [location, setLocation] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [challengeMeta, setChallengeMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFriendsOnly, setShowFriendsOnly] = useState(false);
  const [mapLayout, setMapLayout] = useState({ width: 0, height: 0 });
  const [markerTracksViewChanges, setMarkerTracksViewChanges] = useState(true);
  const [mapRegion, setMapRegion] = useState(DEFAULT_REGION);
  const mapRef = useRef(null);
  const markerRefreshTimeoutRef = useRef(null);
  const didFitPhotosKeyRef = useRef(null);
  const watchRef = useRef(null);
  const router = useRouter();
  const { message: toastMessage, show: showToast } = useToast(3500);
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const bottomTabOverflow = useBottomTabOverflow();
  const colorScheme = useColorScheme();
  const colors = usePalette();
  const { user, friends } = useContext(AuthContext);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const promptText = promptParamText || challengeMeta?.message || 'Quest Map';
  const handleText = handleParamText || challengeMeta?.created_by_handle || null;

  useEffect(() => () => {
    if (markerRefreshTimeoutRef.current) {
      globalThis.clearTimeout(markerRefreshTimeoutRef.current);
      markerRefreshTimeoutRef.current = null;
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          return;
        }
        const sub = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, timeInterval: 3000, distanceInterval: 5 },
          (loc) => {
            if (!cancelled) {
              setLocation(loc);
            }
          }
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
    let cancelled = false;

    async function loadQuestMap() {
      if (!pinId) {
        setPhotos([]);
        setChallengeMeta(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const [photoRows, meta] = await Promise.all([
          fetchPhotosByPinId(pinId),
          fetchChallengeByPinId(pinId),
        ]);
        if (cancelled) return;
        setPhotos(Array.isArray(photoRows) ? photoRows : []);
        setChallengeMeta(meta || null);
      } catch (error) {
        if (!cancelled) {
          console.error('Failed to load quest map', error);
          showToast('Unable to load quest map', 2500);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadQuestMap();

    return () => {
      cancelled = true;
    };
  }, [pinId, showToast]);

  const userCoords = useMemo(() => normalizeCoordinate(location), [location]);
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

  const photoMarkers = useMemo(() => (
    photos
      .map(buildPhotoMarker)
      .filter(Boolean)
      .map((photo) => {
        const baseCoords = photo.location;
        const needsConversion = shouldConvertToGcj02(userCoords, baseCoords, {
          userIsInMainland,
          pinIsInMainland: isInMainlandChina(baseCoords.latitude, baseCoords.longitude),
        });

        return {
          ...photo,
          displayCoords: needsConversion
            ? wgs84ToGcj02(baseCoords.latitude, baseCoords.longitude)
            : baseCoords,
        };
      })
  ), [photos, userCoords, userIsInMainland]);
  const friendUidSet = useMemo(() => {
    if (!Array.isArray(friends)) return new Set();
    return new Set(
      friends
        .map((friend) => friend?.uid)
        .filter((uid) => typeof uid === 'string' && uid.length > 0)
    );
  }, [friends]);
  const isFriendPhoto = useCallback((photo) => {
    const createdBy = typeof photo?.created_by === 'string' ? photo.created_by : '';
    return Boolean(createdBy && createdBy !== user?.uid && friendUidSet.has(createdBy));
  }, [friendUidSet, user?.uid]);
  const isFriendOrOwnPhoto = useCallback((photo) => {
    const createdBy = typeof photo?.created_by === 'string' ? photo.created_by : '';
    if (createdBy) {
      if (createdBy === user?.uid) return true;
      return friendUidSet.has(createdBy);
    }
    return false;
  }, [friendUidSet, user?.uid]);
  const visiblePhotoMarkers = useMemo(() => {
    if (!showFriendsOnly) return photoMarkers;
    return photoMarkers.filter((photo) => isFriendOrOwnPhoto(photo));
  }, [isFriendOrOwnPhoto, photoMarkers, showFriendsOnly]);

  const pinCollisionGroups = useMemo(() => clusterMapPins(visiblePhotoMarkers, {
    region: mapRegion,
    mapSize: mapLayout,
    collisionDistancePx: DEFAULT_PIN_COLLISION_DISTANCE_PX,
  }), [mapLayout, mapRegion, visiblePhotoMarkers]);
  const handleFriendsFilterPress = useCallback(() => {
    if (!showFriendsOnly && friendUidSet.size === 0) {
      showToast('Add some friends to see their photos!');
      return;
    }
    setShowFriendsOnly((prev) => !prev);
  }, [friendUidSet, showFriendsOnly, showToast]);

  const refreshMarkerSnapshots = useCallback(() => {
    setMarkerTracksViewChanges(true);
    if (markerRefreshTimeoutRef.current) {
      globalThis.clearTimeout(markerRefreshTimeoutRef.current);
    }
    markerRefreshTimeoutRef.current = globalThis.setTimeout(() => {
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

  useEffect(() => {
    if (!mapRef.current || photoMarkers.length === 0) return;
    if (!Number.isFinite(mapLayout.width) || !Number.isFinite(mapLayout.height) || mapLayout.width <= 0 || mapLayout.height <= 0) {
      return;
    }
    const fitKey = photoMarkers.map((photo) => photo._id).sort().join(':');
    if (didFitPhotosKeyRef.current === fitKey) return;
    didFitPhotosKeyRef.current = fitKey;

    const coordinates = photoMarkers
      .map((photo) => photo.displayCoords || photo.location)
      .filter(Boolean);
    if (coordinates.length === 1) {
      const nextRegion = buildRegionForCoordinate(coordinates[0]);
      setMapRegion(nextRegion);
      mapRef.current.animateToRegion(nextRegion, 300);
      return;
    }
    mapRef.current.fitToCoordinates(coordinates, {
      animated: true,
      edgePadding: {
        top: 120 + insets.top,
        right: 64,
        bottom: 120 + insets.bottom + bottomTabOverflow,
        left: 64,
      },
    });
  }, [bottomTabOverflow, insets.bottom, insets.top, mapLayout.height, mapLayout.width, photoMarkers]);

  const handleCenterOnUser = useCallback(() => {
    if (!derivedUserCenter || !mapRef.current) {
      showToast('Location unavailable. Try again once we have your position.', 2500);
      return;
    }

    const nextRegion = {
      latitude: derivedUserCenter.latitude,
      longitude: derivedUserCenter.longitude,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
    setMapRegion(nextRegion);
    mapRef.current.animateToRegion(nextRegion, 300);
  }, [derivedUserCenter, showToast]);

  const openPhotoDetail = useCallback((photo) => {
    if (!photo?._id || !pinId) return;
    router.push(buildViewPhotoChallengePhotoRoute({
      pinId,
      photoId: photo._id,
    }));
  }, [pinId, router]);

  const calloutWidth = useMemo(
    () => Math.max(276, Math.min(windowWidth - 48, 340)),
    [windowWidth]
  );
  const calloutCardStyle = useMemo(() => ({
    width: calloutWidth,
  }), [calloutWidth]);
  const controlsBottomOffset = 20 + insets.bottom + bottomTabOverflow;
  const toastBottomOffset = controlsBottomOffset + 96;
  const topControlsTop = 16 + insets.top;
  const initialRegion = derivedUserCenter ? buildRegionForCoordinate(derivedUserCenter) : DEFAULT_REGION;
  const locatedPhotoCount = photoMarkers.length;
  const visibleLocatedPhotoCount = visiblePhotoMarkers.length;
  const missingLocationCount = Math.max(0, photos.length - locatedPhotoCount);

  return (
    <View style={styles.mapContainer}>
      {/* If breaking during deployment, it is because it needs an API https://docs.expo.dev/versions/latest/sdk/map-view/
      Github docs are also very helpful: https://github.com/react-native-maps/react-native-maps
      */}
      <MapView
        key={`map-${visibleLocatedPhotoCount} > 0`} // This fixes map loading without markers by remounting once mapped photos are available.
        style={styles.map}
        showsUserLocation={true}
        userInterfaceStyle={colorScheme}
        customMapStyle={colorScheme === 'dark' ? darkMapStyle : undefined}
        mapType={Platform.OS === 'ios' && colorScheme === 'light' ? 'mutedStandard' : 'standard'}
        ref={mapRef}
        onLayout={handleMapLayout}
        onRegionChangeComplete={handleRegionChangeComplete}
        initialRegion={initialRegion}
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
          const photo = group?.representativePin;
          if (!photo || !group?.representativeCoordinate) return null;
          const photoPinTheme = getPhotoPinTheme(colors, {
            isFriendPhoto: isFriendPhoto(photo),
          });

          return (
            <Marker
              key={`representative:${photo._id}`}
              coordinate={group.representativeCoordinate}
              anchor={{ x: 0.5, y: 1 }}
              calloutOffset={{ x: 0, y: 12 }}
              tracksViewChanges={markerTracksViewChanges}
              title="Quest Photo"
              description={getPhotoHandle(photo)}
            >
              <QuestMapPin
                theme={photoPinTheme}
                badgeCount={group.memberCount}
              />
              <Callout tooltip>
                <CalloutSubview
                  onPress={() => openPhotoDetail(photo)}
                  style={[styles.calloutCard, calloutCardStyle]}
                >
                  <Image
                    source={{ uri: photo.file_url }}
                    style={styles.calloutThumbnail}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <View style={styles.calloutContent}>
                    <Text style={styles.calloutLabel}>Quest Photo</Text>
                    <Text style={styles.calloutHandle} numberOfLines={1}>
                      {getPhotoHandle(photo)}
                    </Text>
                    <Text style={styles.calloutMeta}>
                      Elo {Number.isFinite(photo?.global_elo) ? photo.global_elo : 1000}
                    </Text>
                    <Text style={styles.calloutMeta}>
                      Uploaded {formatShortDate(photo?.createdAt)}
                    </Text>
                    {group.memberCount > 1 ? (
                      <Text style={styles.calloutMeta}>
                        Most recent of {group.memberCount} photos
                      </Text>
                    ) : null}
                  </View>
                  <MaterialIcons name="chevron-right" size={24} color={colors.textMuted} />
                </CalloutSubview>
              </Callout>
            </Marker>
          );
        })}
      </MapView>

      <View style={[styles.topOverlay, { top: topControlsTop }]} pointerEvents="box-none">
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={() => goBackOrHome(router, '/active_challenges')}
          accessibilityRole="button"
          accessibilityLabel="Back to quest"
        >
          <MaterialIcons name="arrow-back" size={26} color={colors.text} />
        </Pressable>
        <View style={styles.titlePill}>
          <Text style={styles.titleText} numberOfLines={1}>{promptText}</Text>
          <Text style={styles.subtitleText} numberOfLines={1}>
            {handleText ? `@${handleText}` : 'anon'} - {locatedPhotoCount} mapped
          </Text>
        </View>
      </View>

      <View style={[styles.topRightOverlay, { top: topControlsTop }]} pointerEvents="box-none">
        <View style={styles.controlStackVertical}>
          <Pressable
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={handleCenterOnUser}
            accessibilityRole="button"
            accessibilityLabel="Center on your location"
          >
            <MaterialIcons name="my-location" size={26} color={colors.text} />
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.button,
              showFriendsOnly ? styles.filterButtonActive : null,
              pressed && styles.buttonPressed,
            ]}
            onPress={handleFriendsFilterPress}
            accessibilityRole="button"
            accessibilityLabel="Show friend photos"
          >
            <MaterialIcons
              name="people"
              size={24}
              color={showFriendsOnly ? colors.bg : colors.text}
            />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.centerOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : null}

      {!loading && !pinId ? (
        <View style={styles.emptyOverlay}>
          <MaterialIcons name="map" size={36} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No quest selected</Text>
        </View>
      ) : null}

      {!loading && pinId && photos.length > 0 && locatedPhotoCount === 0 ? (
        <View style={styles.emptyOverlay}>
          <MaterialIcons name="location-off" size={36} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No mapped photos yet</Text>
          <Text style={styles.emptyText}>Photos without saved locations are hidden from this map.</Text>
        </View>
      ) : null}

      {!loading && pinId && locatedPhotoCount > 0 && visibleLocatedPhotoCount === 0 ? (
        <View style={styles.emptyOverlay}>
          <MaterialIcons name="people" size={36} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No friend photos mapped</Text>
          <Text style={styles.emptyText}>Turn off the friends filter to see all mapped photos for this quest.</Text>
        </View>
      ) : null}

      {!loading && pinId && photos.length === 0 ? (
        <View style={styles.emptyOverlay}>
          <MaterialIcons name="photo-library" size={36} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No photos yet</Text>
        </View>
      ) : null}

      {!loading && missingLocationCount > 0 && locatedPhotoCount > 0 ? (
        <View style={[styles.bottomNote, { bottom: controlsBottomOffset }]}>
          <Text style={styles.bottomNoteText}>
            {missingLocationCount} {missingLocationCount === 1 ? 'photo is' : 'photos are'} hidden without location.
          </Text>
        </View>
      ) : null}

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
    mapContainer: {
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
    buttonPressed: {
      opacity: 0.5,
    },
    filterButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    topOverlay: {
      position: 'absolute',
      left: 18,
      right: 92,
      zIndex: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    topRightOverlay: {
      position: 'absolute',
      right: 18,
      zIndex: 10,
    },
    controlStackVertical: {
      alignItems: 'center',
      gap: 12,
    },
    titlePill: {
      flex: 1,
      minWidth: 0,
      borderRadius: radii.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.barBorder,
      ...shadows.chip,
    },
    titleText: {
      ...textStyles.bodySmallStrong,
      color: colors.text,
    },
    subtitleText: {
      ...textStyles.bodyXsStrong,
      color: colors.textMuted,
      marginTop: 2,
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
    calloutThumbnail: {
      width: 74,
      height: 74,
      borderRadius: 16,
      backgroundColor: colors.border,
    },
    calloutContent: {
      flex: 1,
      minWidth: 0,
      paddingVertical: 4,
    },
    calloutLabel: {
      ...textStyles.eyebrow,
      color: colors.primary,
      marginBottom: 6,
    },
    calloutHandle: {
      ...textStyles.bodyStrong,
      fontSize: 15,
      lineHeight: 20,
      color: colors.text,
    },
    calloutMeta: {
      ...textStyles.bodyXsStrong,
      color: colors.textMuted,
      marginTop: 2,
    },
    centerOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyOverlay: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      top: '36%',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.xl,
      borderRadius: radii.lg,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.chip,
    },
    emptyTitle: {
      ...textStyles.title,
      color: colors.text,
      textAlign: 'center',
    },
    emptyText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
    },
    bottomNote: {
      position: 'absolute',
      left: 18,
      right: 18,
      alignItems: 'center',
      zIndex: 10,
    },
    bottomNoteText: {
      ...textStyles.bodyXsStrong,
      color: colors.textMuted,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
  });
}
