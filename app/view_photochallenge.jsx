import { useCallback, useEffect, useMemo, useRef, useState, useContext } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image } from 'expo-image';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  addPhoto,
  createPhotoComment,
  deletePhoto,
  fetchChallengeByPinId,
  fetchPhotoComments,
  fetchPhotosByPinId,
  likePhotoComment,
  setPinPrivacy,
  unlikePhotoComment,
} from '@/lib/api';
import {
  readPinCommentsCache,
  readPinMetaCache,
  readPinPhotosCache,
  updatePinPhotosCache,
  writePinCommentsCache,
  writePinMetaCache,
  writePinPhotosCache,
} from '@/lib/pinChallengeCache';
import { setUploadResolver } from '../lib/promiseStore';
import { goBackOrHome } from '@/lib/navigation';
import {
  getChallengeUploadBlockedMessage,
  normalizeChallengeCoordinate,
} from '@/lib/challengeGeoAccess';
import BottomBar from '@/components/ui/BottomBar';
import AppHeader from '@/components/ui/AppHeader';
import { CTAButton } from '@/components/ui/Buttons';
import { PreferenceToggleRow } from '@/components/ui/PreferenceToggleRow';
import { Toast, useToast } from '@/components/ui/Toast';
import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';
import { PUBLIC_BASE_URL } from '@/lib/apiClient';
import { fontSizes, radii, shadows, spacing } from '@/theme/tokens';

const SORT_MODE_ELO = 'elo';
const SORT_MODE_DATE = 'date';
const COMMENT_MAX_LENGTH = 200;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DETAIL_IMAGE_MAX_SCALE = 4;
const DETAIL_IMAGE_ZOOM_THRESHOLD = 1.01;
const DETAIL_IMAGE_RESET_SPRING = {
  damping: 26,
  stiffness: 210,
};

function clamp(value, min, max) {
  'worklet';
  return Math.max(min, Math.min(max, value));
}

function parseDateMs(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function sortPhotos(rows, mode = SORT_MODE_ELO) {
  if (!Array.isArray(rows)) return [];
  return [...rows].sort((a, b) => {
    const aElo = Number.isFinite(a?.global_elo) ? a.global_elo : 1000;
    const bElo = Number.isFinite(b?.global_elo) ? b.global_elo : 1000;
    const aCreatedAtMs = parseDateMs(a?.createdAt);
    const bCreatedAtMs = parseDateMs(b?.createdAt);

    if (mode === SORT_MODE_DATE) {
      if (bCreatedAtMs !== aCreatedAtMs) return bCreatedAtMs - aCreatedAtMs;
      return bElo - aElo;
    }
    if (bElo !== aElo) return bElo - aElo;
    return bCreatedAtMs - aCreatedAtMs;
  });
}

function mergeServerPhotosWithPending(serverRows, localRows) {
  const normalizedServerRows = Array.isArray(serverRows) ? serverRows : [];
  const normalizedLocalRows = Array.isArray(localRows) ? localRows : [];
  const optimisticRows = normalizedLocalRows.filter((photo) => photo?.optimistic === true);

  if (optimisticRows.length === 0) {
    return normalizedServerRows;
  }

  const serverFileUrls = new Set(
    normalizedServerRows
      .map((photo) => (typeof photo?.file_url === 'string' ? photo.file_url : null))
      .filter(Boolean)
  );

  const pendingRows = optimisticRows.filter((photo) => {
    const remoteFileUrl = typeof photo?.remote_file_url === 'string' ? photo.remote_file_url : null;
    return !remoteFileUrl || !serverFileUrls.has(remoteFileUrl);
  });

  return [...pendingRows, ...normalizedServerRows];
}

function prefetchPhotoUrls(rows) {
  if (!Array.isArray(rows)) return;
  for (const row of rows) {
    const url = row?.file_url;
    if (typeof url !== 'string' || !url) continue;
    Image.prefetch(url).catch((error) => {
      console.warn('Failed to prefetch pin photo', error);
    });
  }
}

function formatShortDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return 'Unknown';
  }
  return `${MONTH_LABELS[parsed.getMonth()]} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

function getAvatarInitial(comment) {
  const handle = typeof comment?.created_by_handle === 'string' ? comment.created_by_handle.trim() : '';
  if (handle) return handle.charAt(0).toUpperCase();
  const name = typeof comment?.created_by_name === 'string' ? comment.created_by_name.trim() : '';
  if (name) return name.charAt(0).toUpperCase();
  return 'A';
}

function UserAvatar({ uri, label, size, styles }) {
  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={[
          styles.avatarImage,
          { width: size, height: size, borderRadius: size / 2 },
        ]}
        contentFit="cover"
        cachePolicy="memory-disk"
      />
    );
  }
  return (
    <View
      style={[
        styles.avatarFallback,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={styles.avatarFallbackText}>{label}</Text>
    </View>
  );
}

function ZoomableDetailImage({ uri, styles, onInteractionChange }) {
  const frameWidth = useSharedValue(0);
  const frameHeight = useSharedValue(0);
  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const panStartX = useSharedValue(0);
  const panStartY = useSharedValue(0);
  const panTouchStartX = useSharedValue(0);
  const panTouchStartY = useSharedValue(0);
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const activeTouchCount = useSharedValue(0);
  const zoomLockActive = useSharedValue(false);

  const emitInteractionChange = useCallback((nextValue) => {
    if (typeof onInteractionChange === 'function') {
      onInteractionChange(nextValue);
    }
  }, [onInteractionChange]);

  const resetZoom = () => {
    'worklet';
    scale.value = withSpring(1, DETAIL_IMAGE_RESET_SPRING);
    baseScale.value = 1;
    translateX.value = withSpring(0, DETAIL_IMAGE_RESET_SPRING);
    translateY.value = withSpring(0, DETAIL_IMAGE_RESET_SPRING);
    panStartX.value = 0;
    panStartY.value = 0;
    panTouchStartX.value = 0;
    panTouchStartY.value = 0;
  };

  const syncInteractionState = (nextTouchCount) => {
    'worklet';
    const normalizedTouchCount = Math.max(0, nextTouchCount);
    activeTouchCount.value = normalizedTouchCount;

    const nextLockActive = normalizedTouchCount > 1 || (
      normalizedTouchCount > 0 && scale.value > DETAIL_IMAGE_ZOOM_THRESHOLD
    );
    if (zoomLockActive.value !== nextLockActive) {
      zoomLockActive.value = nextLockActive;
      runOnJS(emitInteractionChange)(nextLockActive);
    }

    if (normalizedTouchCount === 0) {
      resetZoom();
    }
  };

  useEffect(() => {
    scale.value = 1;
    baseScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    panStartX.value = 0;
    panStartY.value = 0;
    panTouchStartX.value = 0;
    panTouchStartY.value = 0;
    activeTouchCount.value = 0;
    zoomLockActive.value = false;
    emitInteractionChange(false);
  }, [
    activeTouchCount,
    baseScale,
    emitInteractionChange,
    panStartX,
    panStartY,
    panTouchStartX,
    panTouchStartY,
    scale,
    translateX,
    translateY,
    uri,
    zoomLockActive,
  ]);

  useEffect(() => () => {
    emitInteractionChange(false);
  }, [emitInteractionChange]);

  const handleLayout = useCallback((event) => {
    const nextWidth = event?.nativeEvent?.layout?.width;
    const nextHeight = event?.nativeEvent?.layout?.height;
    if (!Number.isFinite(nextWidth) || !Number.isFinite(nextHeight)) return;
    frameWidth.value = nextWidth;
    frameHeight.value = nextHeight;
    originX.value = nextWidth / 2;
    originY.value = nextHeight / 2;
  }, [frameHeight, frameWidth, originX, originY]);

  const pinchGesture = Gesture.Pinch()
    .shouldCancelWhenOutside(false)
    .onTouchesDown((event) => {
      syncInteractionState(event.numberOfTouches);
    })
    .onTouchesUp((event) => {
      syncInteractionState(event.numberOfTouches);
    })
    .onTouchesCancelled(() => {
      syncInteractionState(0);
    })
    .onStart((event) => {
      baseScale.value = scale.value;
      originX.value = clamp(event.focalX, 0, frameWidth.value || event.focalX);
      originY.value = clamp(event.focalY, 0, frameHeight.value || event.focalY);
    })
    .onUpdate((event) => {
      originX.value = clamp(event.focalX, 0, frameWidth.value || event.focalX);
      originY.value = clamp(event.focalY, 0, frameHeight.value || event.focalY);
      scale.value = clamp(baseScale.value * event.scale, 1, DETAIL_IMAGE_MAX_SCALE);
    })
    .onEnd(() => {
      baseScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .averageTouches(true)
    .shouldCancelWhenOutside(false)
    .onTouchesDown((event, manager) => {
      syncInteractionState(event.numberOfTouches);
      if (event.numberOfTouches === 1 && scale.value > DETAIL_IMAGE_ZOOM_THRESHOLD) {
        manager.activate();
      }
    })
    .onTouchesMove((event, manager) => {
      if (event.numberOfTouches === 1 && scale.value > DETAIL_IMAGE_ZOOM_THRESHOLD) {
        manager.activate();
      }
    })
    .onTouchesUp((event) => {
      syncInteractionState(event.numberOfTouches);
    })
    .onTouchesCancelled(() => {
      syncInteractionState(0);
    })
    .onStart((event) => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
      panTouchStartX.value = event.absoluteX;
      panTouchStartY.value = event.absoluteY;
    })
    .onUpdate((event) => {
      if (scale.value <= DETAIL_IMAGE_ZOOM_THRESHOLD) return;
      translateX.value = panStartX.value + (event.absoluteX - panTouchStartX.value);
      translateY.value = panStartY.value + (event.absoluteY - panTouchStartY.value);
    })
    .onEnd(() => {
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedZoomStyle = useAnimatedStyle(() => {
    const raised = activeTouchCount.value > 1 || scale.value > DETAIL_IMAGE_ZOOM_THRESHOLD;
    return {
      transformOrigin: [originX.value, originY.value, 0],
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
      zIndex: raised ? 40 : 1,
      elevation: raised ? 10 : 0,
    };
  });

  return (
    <View style={styles.detailImageStage}>
      <GestureDetector gesture={composedGesture}>
        <Animated.View
          collapsable={false}
          onLayout={handleLayout}
          style={[styles.detailImageZoomSurface, animatedZoomStyle]}
        >
          <Image
            source={uri ? { uri } : undefined}
            style={styles.detailImage}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export default function ViewPhotoChallengeScreen() {
  const {
    pinId,
    message: promptParam,
    created_by_handle: handleParam,
  } = useLocalSearchParams();   // pinId comes from router params
  const [serverPhotos, setServerPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [commentsRefreshing, setCommentsRefreshing] = useState(false);
  const [challengeMeta, setChallengeMeta] = useState(null);
  const [viewerLocation, setViewerLocation] = useState(null);
  const [sortMode, setSortMode] = useState(SORT_MODE_ELO);
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const [detailImageZoomLocked, setDetailImageZoomLocked] = useState(false);
  const [photoComments, setPhotoComments] = useState([]);
  const [commentsHydrated, setCommentsHydrated] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const serverPhotosRef = useRef([]);
  const pendingCommentIdsRef = useRef(new Set());
  const pendingCommentLikeIdsRef = useRef(new Set());
  const commentsRevisionRef = useRef(0);
  const photoCommentsRef = useRef([]);
  const isMountedRef = useRef(true);
  const selectedPhotoIdRef = useRef(null);
  const pendingProfileUidRef = useRef(null);
  const privacySyncInFlightRef = useRef(false);
  const desiredPrivacyRef = useRef(null);
  const acknowledgedPrivacyRef = useRef(null);
  const router = useRouter();
  const { message: toastMessage, show: showToast } = useToast(3500);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user, profile, invalidateStats } = useContext(AuthContext);
  const promptParamText = typeof promptParam === 'string' && promptParam.trim()
    ? promptParam.trim()
    : null;
  const handleParamText = typeof handleParam === 'string' && handleParam.trim()
    ? handleParam.trim()
    : null;
  const promptText = promptParamText || challengeMeta?.message || 'Prompt';
  const handleText = handleParamText || challengeMeta?.created_by_handle || null;
  const isOwner = Boolean(
    user?.uid &&
    typeof challengeMeta?.created_by === 'string' &&
    challengeMeta.created_by === user.uid
  );
  const isPrivateChallenge = challengeMeta?.isPrivate === true;
  const uploadBlockedMessage = useMemo(() => {
    if (!pinId) {
      return 'No valid challenge selected.';
    }
    if (!challengeMeta) {
      return 'Checking challenge access...';
    }
    return getChallengeUploadBlockedMessage({
      challenge: challengeMeta,
      userLocation: viewerLocation,
    });
  }, [challengeMeta, pinId, viewerLocation]);
  const uploadVisuallyLocked = Boolean(uploadBlockedMessage);
  const photos = serverPhotos;
  const hasPendingPhotos = useMemo(
    () => photos.some((photo) => photo?.optimistic === true),
    [photos]
  );
  const sortedPhotos = useMemo(
    () => sortPhotos(photos, sortMode),
    [photos, sortMode]
  );
  const selectedPhoto = useMemo(
    () => photos.find((photo) => String(photo?._id) === String(selectedPhotoId)) || null,
    [photos, selectedPhotoId]
  );
  const selectedPhotoCanComment = Boolean(selectedPhoto && !selectedPhoto.optimistic);
  const selectedPhotoCanDelete = Boolean(
    selectedPhoto &&
    !selectedPhoto.optimistic &&
    user?.uid &&
    String(selectedPhoto?.created_by) === String(user.uid)
  );
  const selectedPhotoDeletePending = Boolean(
    selectedPhoto?._id &&
    deletingPhotoId &&
    String(selectedPhoto._id) === String(deletingPhotoId)
  );
  const sortChipLabel = sortMode === SORT_MODE_ELO ? 'Elo Sorted' : 'Upload Date';
  const composerAvatarLabel = typeof profile?.handle === 'string' && profile.handle
    ? profile.handle.charAt(0).toUpperCase()
    : 'Y';
  const currentUserHandle = typeof profile?.handle === 'string' && profile.handle
    ? profile.handle
    : null;
  const currentUserName = typeof profile?.display_name === 'string' && profile.display_name
    ? profile.display_name
    : null;

  useEffect(() => {
    photoCommentsRef.current = photoComments;
  }, [photoComments]);

  useEffect(() => {
    serverPhotosRef.current = serverPhotos;
  }, [serverPhotos]);

  useEffect(() => {
    selectedPhotoIdRef.current = selectedPhotoId ? String(selectedPhotoId) : null;
  }, [selectedPhotoId]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const refreshViewerLocation = useCallback(async () => {
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      if (permission?.status !== 'granted') {
        setViewerLocation(null);
        return null;
      }

      const lastKnownPosition = await Location.getLastKnownPositionAsync();
      const lastKnownCoords = normalizeChallengeCoordinate(lastKnownPosition);
      if (lastKnownCoords) {
        setViewerLocation(lastKnownCoords);
        return lastKnownCoords;
      }

      const currentPosition = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const currentCoords = normalizeChallengeCoordinate(currentPosition);
      setViewerLocation(currentCoords);
      return currentCoords;
    } catch (error) {
      console.warn('Failed to refresh viewer location for challenge upload', error);
      setViewerLocation(null);
      return null;
    }
  }, []);

  const mergeServerCommentsWithPending = useCallback((serverComments, localComments) => {
    const normalizedServerComments = Array.isArray(serverComments) ? serverComments : [];
    const normalizedLocalComments = Array.isArray(localComments) ? localComments : [];
    const nextComments = normalizedServerComments.map((comment) => {
      const commentId = comment?._id ? String(comment._id) : null;
      if (!commentId || !pendingCommentLikeIdsRef.current.has(commentId)) {
        return comment;
      }
      const localComment = normalizedLocalComments.find((item) => String(item?._id) === commentId);
      if (!localComment) {
        return comment;
      }
      return {
        ...comment,
        viewer_has_liked: localComment.viewer_has_liked,
        like_count: localComment.like_count,
      };
    });

    const optimisticComments = normalizedLocalComments.filter((comment) => (
      pendingCommentIdsRef.current.has(String(comment?._id))
    ));

    return [...optimisticComments, ...nextComments];
  }, []);

  const applyCommentsUpdate = useCallback((photoId, updater, { isDirty = true } = {}) => {
    if (!photoId) return;
    commentsRevisionRef.current += 1;
    setPhotoComments((current) => {
      const nextComments = typeof updater === 'function' ? updater(current) : updater;
      const normalizedComments = Array.isArray(nextComments) ? nextComments : [];
      void writePinCommentsCache(photoId, normalizedComments, { isDirty });
      return normalizedComments;
    });
    setCommentsHydrated(true);
  }, []);

  const writeCommentsCacheOnly = useCallback(async (photoId, updater, { isDirty = false } = {}) => {
    if (!photoId) return;
    const { comments } = await readPinCommentsCache(photoId, { ttlMs: Number.MAX_SAFE_INTEGER });
    const nextComments = typeof updater === 'function' ? updater(comments) : updater;
    const normalizedComments = Array.isArray(nextComments) ? nextComments : [];
    await writePinCommentsCache(photoId, normalizedComments, { isDirty });
  }, []);

  const load = useCallback(async ({ showSpinner = true } = {}) => {
    if (!pinId) return false;
    if (showSpinner) setLoading(true);
    try {
      const [{ photos: cachedPhotos }, data] = await Promise.all([
        readPinPhotosCache(pinId, { ttlMs: Number.MAX_SAFE_INTEGER }),
        fetchPhotosByPinId(pinId),
      ]);
      const rows = Array.isArray(data) ? data : [];
      const localRows = Array.isArray(cachedPhotos) && cachedPhotos.length > 0
        ? cachedPhotos
        : serverPhotosRef.current;
      const mergedRows = mergeServerPhotosWithPending(rows, localRows);
      setServerPhotos(mergedRows);
      prefetchPhotoUrls(mergedRows);
      await writePinPhotosCache(pinId, mergedRows);
      return true;
    } catch (e) {
      console.error('Failed to fetch photos for pin', pinId, e);
      return false;
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [pinId]);

  useEffect(() => {
    let cancelled = false;
    async function hydrateAndLoad() {
      if (!pinId) {
        setServerPhotos([]);
        setLoading(false);
        return;
      }

      const { photos: cachedPhotos, hadCache, isFresh } = await readPinPhotosCache(pinId);
      if (hadCache && !cancelled) {
        setServerPhotos(Array.isArray(cachedPhotos) ? cachedPhotos : []);
        setLoading(false);
        prefetchPhotoUrls(cachedPhotos);
      }
      if (cancelled) return;

      if (!hadCache) {
        setLoading(true);
        await load({ showSpinner: true });
        return;
      }

      if (!isFresh) {
        await load({ showSpinner: false });
      }
    }

    hydrateAndLoad();
    return () => {
      cancelled = true;
    };
  }, [load, pinId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function syncPhotosFromCache() {
        if (!pinId) return;
        const { photos: cachedPhotos, hadCache, isFresh } = await readPinPhotosCache(pinId);
        if (cancelled || !hadCache) return;
        setServerPhotos(Array.isArray(cachedPhotos) ? cachedPhotos : []);
        prefetchPhotoUrls(cachedPhotos);
        if (!isFresh) {
          await load({ showSpinner: false });
        }
      }

      void syncPhotosFromCache();

      return () => {
        cancelled = true;
      };
    }, [load, pinId])
  );

  useFocusEffect(
    useCallback(() => {
      void refreshViewerLocation();
    }, [refreshViewerLocation])
  );

  useEffect(() => {
    if (!pinId || !hasPendingPhotos) return;
    const timeoutId = globalThis.setTimeout(() => {
      void load({ showSpinner: false });
    }, 1500);

    return () => {
      globalThis.clearTimeout(timeoutId);
    };
  }, [hasPendingPhotos, load, pinId]);

  useEffect(() => {
    let cancelled = false;

    async function loadChallengeMeta() {
      if (!pinId) {
        setChallengeMeta(null);
        return;
      }
      try {
        const challenge = await fetchChallengeByPinId(pinId);
        if (cancelled) return;
        if (!challenge) {
          showToast('This challenge is private or unavailable.', 2500);
          router.back();
          return;
        }
        void writePinMetaCache(pinId, challenge);
        const initialIsPrivate = challenge?.isPrivate === true;
        acknowledgedPrivacyRef.current = initialIsPrivate;
        desiredPrivacyRef.current = initialIsPrivate;
        setChallengeMeta(challenge);
      } catch (error) {
        console.error('Failed to fetch challenge metadata for pin', pinId, error);
      }
    }

    async function hydrateAndLoadChallengeMeta() {
      if (!pinId) {
        setChallengeMeta(null);
        return;
      }

      const { meta: cachedMeta, hadCache, isFresh } = await readPinMetaCache(pinId);
      if (hadCache && cachedMeta && typeof cachedMeta === 'object' && !cancelled) {
        setChallengeMeta(cachedMeta);
        const cachedIsPrivate = cachedMeta?.isPrivate === true;
        acknowledgedPrivacyRef.current = cachedIsPrivate;
        desiredPrivacyRef.current = cachedIsPrivate;
      }
      if (cancelled) return;

      if (hadCache && isFresh) {
        return;
      }
      await loadChallengeMeta();
    }

    hydrateAndLoadChallengeMeta();
    return () => {
      cancelled = true;
    };
  }, [pinId, router, showToast]);

  const flushPrivacyUpdates = useCallback(async () => {
    if (!pinId || !isOwner || privacySyncInFlightRef.current) return;
    privacySyncInFlightRef.current = true;
    try {
      while (
        typeof desiredPrivacyRef.current === 'boolean' &&
        desiredPrivacyRef.current !== acknowledgedPrivacyRef.current
      ) {
        const targetPrivacy = desiredPrivacyRef.current;
        const updatedPin = await setPinPrivacy(pinId, targetPrivacy);
        if (!updatedPin || typeof updatedPin?.isPrivate !== 'boolean') {
          const fallback = typeof acknowledgedPrivacyRef.current === 'boolean'
            ? acknowledgedPrivacyRef.current
            : false;
          desiredPrivacyRef.current = fallback;
          setChallengeMeta((prev) => {
            const next = {
              ...(prev || {}),
              isPrivate: fallback,
            };
            void writePinMetaCache(pinId, next);
            return next;
          });
          break;
        }
        const persisted = updatedPin.isPrivate === true;
        acknowledgedPrivacyRef.current = persisted;
        setChallengeMeta((prev) => {
          const next = {
            ...(prev || {}),
            ...updatedPin,
            isPrivate: persisted,
          };
          void writePinMetaCache(pinId, next);
          return next;
        });
      }
    } finally {
      privacySyncInFlightRef.current = false;
      if (
        typeof desiredPrivacyRef.current === 'boolean' &&
        desiredPrivacyRef.current !== acknowledgedPrivacyRef.current
      ) {
        flushPrivacyUpdates();
      }
    }
  }, [isOwner, pinId]);

  const onTogglePrivacy = useCallback((nextValue) => {
    if (!pinId || !isOwner) return;
    const optimisticValue = !!nextValue;
    desiredPrivacyRef.current = optimisticValue;
    setChallengeMeta((prev) => {
      const next = {
        ...(prev || {}),
        isPrivate: optimisticValue,
      };
      void writePinMetaCache(pinId, next);
      return next;
    });
    flushPrivacyUpdates();
  }, [flushPrivacyUpdates, isOwner, pinId]);

  const closePhotoDetail = useCallback(() => {
    setDetailImageZoomLocked(false);
    setSelectedPhotoId(null);
    setPhotoComments([]);
    setCommentDraft('');
    setCommentsHydrated(false);
    pendingCommentIdsRef.current.clear();
    pendingCommentLikeIdsRef.current.clear();
  }, []);

  useEffect(() => {
    if (selectedPhotoId && !selectedPhoto && !loading) {
      closePhotoDetail();
    }
  }, [closePhotoDetail, loading, selectedPhoto, selectedPhotoId]);

  useEffect(() => {
    let cancelled = false;

    async function hydrateAndLoadComments() {
      if (!selectedPhotoId) {
        setPhotoComments([]);
        setCommentDraft('');
        setCommentsHydrated(false);
        return;
      }

      if (!selectedPhotoCanComment) {
        setPhotoComments([]);
        setCommentsHydrated(false);
        return;
      }

      const fetchRevision = commentsRevisionRef.current;
      const { comments: cachedComments, hadCache } = await readPinCommentsCache(selectedPhotoId);
      if (hadCache && !cancelled) {
        setPhotoComments(Array.isArray(cachedComments) ? cachedComments : []);
        setCommentsHydrated(true);
      }
      if (cancelled) return;

      try {
        const items = await fetchPhotoComments(selectedPhotoId);
        if (cancelled) return;
        if (commentsRevisionRef.current !== fetchRevision) {
          return;
        }
        const nextComments = Array.isArray(items) ? items : [];
        setPhotoComments(nextComments);
        setCommentsHydrated(true);
        await writePinCommentsCache(selectedPhotoId, nextComments, { isDirty: false });
      } catch (error) {
        console.error('Failed to hydrate comments for photo', selectedPhotoId, error);
        if (!cancelled) {
          setCommentsHydrated(true);
        }
      }
    }

    if (!selectedPhotoId) {
      setPhotoComments([]);
      setCommentDraft('');
      setCommentsHydrated(false);
      return () => {};
    }

    if (!selectedPhotoCanComment) {
      setPhotoComments([]);
      setCommentsHydrated(false);
      return () => {
        cancelled = true;
      };
    }

    hydrateAndLoadComments();

    return () => {
      cancelled = true;
    };
  }, [selectedPhotoCanComment, selectedPhotoId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load({ showSpinner: false });
    setRefreshing(false);
  };

  const refreshCommentsFromServer = useCallback(async () => {
    if (!selectedPhotoId || !selectedPhotoCanComment) return;
    const fetchRevision = commentsRevisionRef.current + 1;
    commentsRevisionRef.current = fetchRevision;
    setCommentsRefreshing(true);
    try {
      const items = await fetchPhotoComments(selectedPhotoId);
      if (commentsRevisionRef.current !== fetchRevision) {
        return;
      }
      const mergedComments = mergeServerCommentsWithPending(items, photoCommentsRef.current);
      setPhotoComments(mergedComments);
      setCommentsHydrated(true);
      await writePinCommentsCache(selectedPhotoId, mergedComments, {
        isDirty:
          pendingCommentIdsRef.current.size > 0 ||
          pendingCommentLikeIdsRef.current.size > 0,
      });
    } catch (error) {
      console.error('Failed to refresh comments for photo', selectedPhotoId, error);
    } finally {
      setCommentsRefreshing(false);
    }
  }, [mergeServerCommentsWithPending, selectedPhotoCanComment, selectedPhotoId]);

  const uploadPhotoChallenge = useCallback(async () => {
    if (uploading) return;
    const latestViewerLocation = await refreshViewerLocation();
    const nextUploadBlockedMessage = !pinId
      ? 'No valid challenge selected.'
      : !challengeMeta
        ? 'Checking challenge access...'
        : getChallengeUploadBlockedMessage({
            challenge: challengeMeta,
            userLocation: latestViewerLocation || viewerLocation,
          });
    if (nextUploadBlockedMessage) {
      showToast(nextUploadBlockedMessage, 2500);
      return;
    }
    setUploading(true);
    let uploadResultForRollback = null;
    const uploadPromise = new Promise((resolve) => {
      setUploadResolver(resolve);
      router.push({
        pathname: '/upload',
        params: {
          prompt: promptText,
          pinId,
          created_by_handle: handleText || '',
        },
      });
    });

    uploadPromise
      .then(async (uploadResult) => {
        const uploadedPhotoUrl = typeof uploadResult === 'string'
          ? uploadResult
          : uploadResult?.fileUrl;
        if (!uploadedPhotoUrl) { // If promise resolves to falsey (i.e. user exits upload screen)
          return;
        }
        const photoLocation = uploadResult?.photoLocation || null;
        uploadResultForRollback = uploadedPhotoUrl;
        await addPhoto(pinId, uploadedPhotoUrl, { photoLocation });
        invalidateStats();
        await load({ showSpinner: false });
      })
      .catch((error) => {
        console.error('Failed to add photo after upload', error);
        if (uploadResultForRollback) {
          void updatePinPhotosCache(pinId, (current) => (
            Array.isArray(current)
              ? current.filter((photo) => photo?.remote_file_url !== uploadResultForRollback)
              : current
          ));
        }
        void load({ showSpinner: false });
        showToast(error?.response?.data?.error || 'Upload failed', 2500);
      })
      .finally(() => {
        setUploading(false);
      });
  }, [
    challengeMeta,
    handleText,
    invalidateStats,
    load,
    pinId,
    promptText,
    refreshViewerLocation,
    router,
    showToast,
    uploading,
    viewerLocation,
  ]);

  const onToggleSortMode = useCallback(() => {
    setSortMode((currentMode) => (
      currentMode === SORT_MODE_ELO ? SORT_MODE_DATE : SORT_MODE_ELO
    ));
  }, []);

  const handleShareChallenge = useCallback(async () => {
    if (!pinId) return;
    const shareUrl = `${PUBLIC_BASE_URL}/view_photochallenge/${encodeURIComponent(pinId)}`;
    const message = promptText
      ? `Check out this SideQuest quest: "${promptText}"`
      : 'Check out this SideQuest quest.';

    try {
      await Share.share({
        title: 'View this quest on SideQuest',
        message,
        url: shareUrl,
      });
    } catch (error) {
      console.warn('Failed to share challenge', error);
      showToast('Unable to open share menu', 2500);
    }
  }, [pinId, promptText, showToast]);

  const openPhotoDetail = useCallback((photo) => {
    if (!photo?._id) return;
    setSelectedPhotoId(String(photo._id));
  }, []);

  const navigateToUserProfile = useCallback((targetUid) => {
    if (!targetUid) return;
    if (targetUid === user?.uid) {
      router.push('/(tabs)/profile');
      return;
    }
    router.push({
      pathname: '/user_profile/[uid]',
      params: { uid: targetUid },
    });
  }, [router, user?.uid]);

  const openUserProfile = useCallback((targetUid) => {
    if (!targetUid) return;
    if (selectedPhotoId) {
      pendingProfileUidRef.current = targetUid;
      closePhotoDetail();
      return;
    }
    navigateToUserProfile(targetUid);
  }, [closePhotoDetail, navigateToUserProfile, selectedPhotoId]);

  useEffect(() => {
    if (selectedPhotoId || !pendingProfileUidRef.current) {
      return;
    }
    const pendingUid = pendingProfileUidRef.current;
    pendingProfileUidRef.current = null;
    navigateToUserProfile(pendingUid);
  }, [navigateToUserProfile, selectedPhotoId]);

  const executeDeleteSelectedPhoto = useCallback(async () => {
    const targetPhotoId = selectedPhoto?._id ? String(selectedPhoto._id) : null;
    if (!pinId || !targetPhotoId || !selectedPhotoCanDelete || selectedPhotoDeletePending) {
      return;
    }

    setDeletingPhotoId(targetPhotoId);
    try {
      const result = await deletePhoto(targetPhotoId);
      if (!result?.success) {
        showToast(result?.error || 'Failed to delete photo.', 2500);
        return;
      }

      invalidateStats();
      await writePinCommentsCache(targetPhotoId, [], { isDirty: false });

      if (result?.pin_deleted === true) {
        setServerPhotos([]);
        await writePinPhotosCache(pinId, [], { isDirty: false });
        closePhotoDetail();
        goBackOrHome(router);
        return;
      }

      const nextPhotos = serverPhotosRef.current.filter((photo) => String(photo?._id) !== targetPhotoId);
      setServerPhotos(nextPhotos);
      await writePinPhotosCache(pinId, nextPhotos, { isDirty: false });

      if (result?.pin && typeof result.pin === 'object') {
        setChallengeMeta(result.pin);
        void writePinMetaCache(pinId, result.pin);
      }

      closePhotoDetail();
      showToast('Photo deleted.', 2500);
    } catch (error) {
      console.error('Failed to delete selected photo', error);
      showToast('Failed to delete photo.', 2500);
    } finally {
      if (isMountedRef.current) {
        setDeletingPhotoId((current) => (current === targetPhotoId ? null : current));
      }
    }
  }, [
    closePhotoDetail,
    invalidateStats,
    pinId,
    router,
    selectedPhoto,
    selectedPhotoCanDelete,
    selectedPhotoDeletePending,
    showToast,
  ]);

  const confirmDeleteSelectedPhoto = useCallback(() => {
    if (!selectedPhotoCanDelete || selectedPhotoDeletePending) return;

    const persistedPhotoCount = photos.filter((photo) => photo?.optimistic !== true).length;
    const isLastPersistedPhoto = persistedPhotoCount <= 1;
    Alert.alert(
      isLastPersistedPhoto ? 'Delete photo and quest?' : 'Delete photo?',
      isLastPersistedPhoto
        ? 'This will permanently delete this photo. Because it is the last photo in this quest, the quest will also be removed.'
        : 'This will permanently delete this photo.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void executeDeleteSelectedPhoto();
          },
        },
      ]
    );
  }, [executeDeleteSelectedPhoto, photos, selectedPhotoCanDelete, selectedPhotoDeletePending]);

  const submitComment = useCallback(async () => {
    const normalizedText = commentDraft.trim();
    if (!selectedPhotoCanComment || !selectedPhotoId || !normalizedText) {
      return;
    }
    const optimisticId = `optimistic-comment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimisticComment = {
      _id: optimisticId,
      photo_id: selectedPhotoId,
      pin_id: pinId || null,
      created_by: user?.uid || null,
      created_by_name: currentUserName,
      created_by_handle: currentUserHandle,
      created_by_photo_url: profile?.photo_url || null,
      text: normalizedText,
      like_count: 0,
      viewer_has_liked: false,
      createdAt: new Date().toISOString(),
      optimistic: true,
    };
    pendingCommentIdsRef.current.add(optimisticId);
    applyCommentsUpdate(selectedPhotoId, (current) => [optimisticComment, ...current], { isDirty: true });
    setCommentDraft('');

    createPhotoComment(selectedPhotoId, normalizedText)
      .then((createdComment) => {
        pendingCommentIdsRef.current.delete(optimisticId);
        if (!createdComment) {
          const rollback = (current) => current.filter((item) => String(item?._id) !== optimisticId);
          if (isMountedRef.current && selectedPhotoIdRef.current === String(selectedPhotoId)) {
            applyCommentsUpdate(selectedPhotoId, rollback, { isDirty: false });
          } else {
            void writeCommentsCacheOnly(selectedPhotoId, rollback, { isDirty: false });
          }
          showToast('Failed to add comment.', 2500);
          return;
        }
        const reconcile = (current) => current.map((item) => (
          String(item?._id) === optimisticId ? createdComment : item
        ));
        if (isMountedRef.current && selectedPhotoIdRef.current === String(selectedPhotoId)) {
          commentsRevisionRef.current += 1;
          setPhotoComments((current) => {
            const nextComments = reconcile(current);
            void writePinCommentsCache(selectedPhotoId, nextComments, {
              isDirty:
                pendingCommentIdsRef.current.size > 0 ||
                pendingCommentLikeIdsRef.current.size > 0,
            });
            return nextComments;
          });
        } else {
          void writeCommentsCacheOnly(selectedPhotoId, reconcile, { isDirty: false });
        }
      })
      .catch((error) => {
        console.error('Failed to submit comment optimistically', error);
        pendingCommentIdsRef.current.delete(optimisticId);
        const rollback = (current) => current.filter((item) => String(item?._id) !== optimisticId);
        if (isMountedRef.current && selectedPhotoIdRef.current === String(selectedPhotoId)) {
          applyCommentsUpdate(selectedPhotoId, rollback, { isDirty: false });
        } else {
          void writeCommentsCacheOnly(selectedPhotoId, rollback, { isDirty: false });
        }
        showToast('Failed to add comment.', 2500);
      });
  }, [
    applyCommentsUpdate,
    commentDraft,
    currentUserHandle,
    currentUserName,
    pinId,
    profile?.photo_url,
    selectedPhotoCanComment,
    selectedPhotoId,
    showToast,
    user?.uid,
    writeCommentsCacheOnly,
  ]);

  const onPressLikeComment = useCallback(async (comment) => {
    const commentId = comment?._id ? String(comment._id) : null;
    if (!commentId || !selectedPhotoId) return;
    if (pendingCommentLikeIdsRef.current.has(commentId) || pendingCommentIdsRef.current.has(commentId)) return;

    const wasLiked = comment?.viewer_has_liked === true;
    pendingCommentLikeIdsRef.current.add(commentId);
    applyCommentsUpdate(selectedPhotoId, (current) => current.map((item) => {
      if (String(item?._id) !== commentId) return item;
      const currentLikeCount = Number.isFinite(item?.like_count) ? item.like_count : 0;
      return {
        ...item,
        viewer_has_liked: !wasLiked,
        like_count: wasLiked ? Math.max(0, currentLikeCount - 1) : currentLikeCount + 1,
      };
    }), { isDirty: true });

    const request = wasLiked ? unlikePhotoComment(commentId) : likePhotoComment(commentId);
    request
      .then((updatedComment) => {
        pendingCommentLikeIdsRef.current.delete(commentId);
        if (!updatedComment) {
          const rollback = (current) => current.map((item) => {
            if (String(item?._id) !== commentId) return item;
            return {
              ...item,
              viewer_has_liked: wasLiked,
              like_count: Number.isFinite(comment?.like_count) ? comment.like_count : 0,
            };
          });
          if (isMountedRef.current && selectedPhotoIdRef.current === String(selectedPhotoId)) {
            applyCommentsUpdate(selectedPhotoId, rollback, { isDirty: false });
          } else {
            void writeCommentsCacheOnly(selectedPhotoId, rollback, { isDirty: false });
          }
          showToast('Failed to update comment like.', 2500);
          return;
        }
        const reconcile = (current) => current.map((item) => (
          String(item?._id) === commentId ? { ...item, ...updatedComment, optimistic: false } : item
        ));
        if (isMountedRef.current && selectedPhotoIdRef.current === String(selectedPhotoId)) {
          commentsRevisionRef.current += 1;
          setPhotoComments((current) => {
            const nextComments = reconcile(current);
            void writePinCommentsCache(selectedPhotoId, nextComments, {
              isDirty:
                pendingCommentIdsRef.current.size > 0 ||
                pendingCommentLikeIdsRef.current.size > 0,
            });
            return nextComments;
          });
        } else {
          void writeCommentsCacheOnly(selectedPhotoId, reconcile, { isDirty: false });
        }
      })
      .catch((error) => {
        console.error('Failed to toggle comment like optimistically', error);
        pendingCommentLikeIdsRef.current.delete(commentId);
        const rollback = (current) => current.map((item) => {
          if (String(item?._id) !== commentId) return item;
          return {
            ...item,
            viewer_has_liked: wasLiked,
            like_count: Number.isFinite(comment?.like_count) ? comment.like_count : 0,
          };
        });
        if (isMountedRef.current && selectedPhotoIdRef.current === String(selectedPhotoId)) {
          applyCommentsUpdate(selectedPhotoId, rollback, { isDirty: false });
        } else {
          void writeCommentsCacheOnly(selectedPhotoId, rollback, { isDirty: false });
        }
        showToast('Failed to update comment like.', 2500);
      });
  }, [applyCommentsUpdate, selectedPhotoId, showToast, writeCommentsCacheOnly]);

  const onPressReplyComment = useCallback((comment) => {
    const rawHandle = typeof comment?.created_by_handle === 'string'
      ? comment.created_by_handle.trim()
      : '';
    const normalizedHandle = rawHandle.replace(/^@+/, '');
    if (!normalizedHandle) return;
    const mentionPrefix = `@${normalizedHandle}`;

    setCommentDraft((currentDraft) => {
      const draftText = typeof currentDraft === 'string' ? currentDraft : '';
      const trimmedStart = draftText.trimStart();
      if (trimmedStart === mentionPrefix || trimmedStart.startsWith(`${mentionPrefix} `)) {
        return draftText;
      }
      if (!draftText.trim()) {
        return `${mentionPrefix} `;
      }
      return `${mentionPrefix} ${draftText}`;
    });
  }, []);

  const renderPhotoTile = useCallback(({ item }) => (
    <Pressable onPress={() => openPhotoDetail(item)} style={styles.galleryTileShell}>
      <View style={styles.galleryTile}>
        <Image
          source={{ uri: item.file_url }}
          style={styles.galleryImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
        <View style={styles.galleryOverlay} />
        <View style={styles.galleryTileMeta}>
          <View style={styles.galleryHandleWrap}>
            <Text style={styles.galleryHandle} numberOfLines={1}>
              {item?.created_by_handle ? `@${item.created_by_handle}` : 'anon'}
            </Text>
          </View>
          <View style={styles.galleryEloChip}>
            <MaterialIcons name="emoji-events" size={13} color={colors.primary} />
            <Text style={styles.galleryEloText}>
              {Number.isFinite(item?.global_elo) ? item.global_elo : 1000}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  ), [colors.primary, openPhotoDetail, styles]);

  const renderCommentItem = useCallback(({ item }) => {
    const commentHandle = typeof item?.created_by_handle === 'string'
      ? item.created_by_handle.trim()
      : '';
    const normalizedCommentHandle = commentHandle.replace(/^@+/, '');
    const isOwnComment = (
      (user?.uid && item?.created_by && String(item.created_by) === String(user.uid)) ||
      (currentUserHandle && normalizedCommentHandle &&
        normalizedCommentHandle.toLowerCase() === currentUserHandle.toLowerCase())
    );
    const canReply = !isOwnComment && Boolean(normalizedCommentHandle);

    return (
      <View style={styles.commentRow}>
        <Pressable
          onPress={() => openUserProfile(item?.created_by)}
          disabled={!item?.created_by}
          style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
        >
          <UserAvatar
            uri={item?.created_by_photo_url || null}
            label={getAvatarInitial(item)}
            size={38}
            styles={styles}
          />
        </Pressable>
        <View style={styles.commentBody}>
          <View style={styles.commentMetaRow}>
            <Pressable
              onPress={() => openUserProfile(item?.created_by)}
              disabled={!item?.created_by}
              style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.72 : 1 })}
            >
              <Text style={styles.commentHandle}>
                {normalizedCommentHandle ? `@${normalizedCommentHandle}` : 'anon'}
              </Text>
            </Pressable>
            <Text style={styles.commentTimestamp}>{formatShortDate(item?.createdAt)}</Text>
          </View>
          <Text style={styles.commentText}>{item?.text || ''}</Text>
          {canReply ? (
            <Pressable
              onPress={() => onPressReplyComment(item)}
              hitSlop={6}
              style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.7 : 1 })}
            >
              <Text style={styles.commentReplyText}>Reply</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable
          onPress={() => onPressLikeComment(item)}
          style={[
            styles.commentLikeButton,
            item?.viewer_has_liked && styles.commentLikeButtonActive,
          ]}
        >
          <>
            <MaterialIcons
              name={item?.viewer_has_liked ? 'favorite' : 'favorite-border'}
              size={16}
              color={item?.viewer_has_liked ? colors.primary : colors.textMuted}
            />
            <Text
              style={[
                styles.commentLikeCount,
                item?.viewer_has_liked && styles.commentLikeCountActive,
              ]}
            >
              {Number.isFinite(item?.like_count) ? item.like_count : 0}
            </Text>
          </>
        </Pressable>
      </View>
    );
  }, [
    colors.primary,
    colors.textMuted,
    currentUserHandle,
    onPressLikeComment,
    onPressReplyComment,
    openUserProfile,
    styles,
    user?.uid,
  ]);

  return (
    <SafeAreaView style={styles.safe}>
      <AppHeader
        onBack={() => goBackOrHome(router)}
        backText={router?.canGoBack?.() ? 'Back' : 'Home'}
        title={promptText}
        subtitle={handleText ? `@${handleText}` : 'anon'}
      />
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 24 }} />
        ) : (
          <FlatList
            data={sortedPhotos}
            keyExtractor={(item, idx) => item._id ?? `${idx}` }
            numColumns={2}
            columnWrapperStyle={styles.galleryRow}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
            ListHeaderComponent={(
              <View style={styles.galleryIntro}>
                <View style={styles.gallerySummaryCard}>
                  <View style={styles.gallerySummaryMeta}>
                    <View style={styles.gallerySummaryChip}>
                      <MaterialIcons name="photo-library" size={16} color={colors.primary} />
                      <Text style={styles.gallerySummaryChipText}>
                        {sortedPhotos.length} {sortedPhotos.length === 1 ? 'photo' : 'photos'}
                      </Text>
                    </View>
                    <Pressable onPress={onToggleSortMode} style={styles.gallerySummaryChip}>
                      <MaterialIcons
                        name={sortMode === SORT_MODE_ELO ? 'emoji-events' : 'schedule'}
                        size={16}
                        color={colors.primary}
                      />
                      <Text style={styles.gallerySummaryChipText}>
                        {sortChipLabel}
                      </Text>
                    </Pressable>
                    <Pressable
                      onPress={handleShareChallenge}
                      style={styles.gallerySummaryChip}
                      accessibilityRole="button"
                      accessibilityLabel="Share challenge"
                    >
                      <MaterialIcons name="share" size={16} color={colors.primary} />
                      <Text style={styles.gallerySummaryChipText}>
                        Share
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={(
              <View style={styles.emptyState}>
                <MaterialIcons name="photo-library" size={40} color={colors.textMuted} />
                <Text style={styles.emptyTitle}>No photos yet</Text>
                <Text style={styles.emptyText}>
                  Upload the first photo to start this gallery.
                </Text>
              </View>
            )}
            renderItem={renderPhotoTile}
          />
        )}
      </View>

      {/* Bottom, always-on-screen action bar (not absolute) */}
      <BottomBar>
        {isOwner ? (
          <PreferenceToggleRow
            label="Private (friends only)"
            value={isPrivateChallenge}
            onValueChange={onTogglePrivacy}
            disabled={!pinId || !isOwner}
            style={styles.privacyFooterRow}
          />
        ) : null}
        <CTAButton
          title="Upload Photo"
          onPress={uploadPhotoChallenge}
          disabled={uploading || !pinId}
          style={uploadVisuallyLocked ? styles.uploadButtonLocked : null}
          textStyle={uploadVisuallyLocked ? styles.uploadButtonLockedText : null}
        />
      </BottomBar>

      <Modal
        visible={Boolean(selectedPhotoId && selectedPhoto)}
        animationType="slide"
        onRequestClose={closePhotoDetail}
      >
        <SafeAreaView style={styles.detailSafe}>
          <View style={styles.detailHeader}>
            <Pressable onPress={closePhotoDetail} style={styles.detailCloseButton}>
              <MaterialIcons name="arrow-back" size={22} color={colors.text} />
            </Pressable>
              <View style={styles.detailHeaderMeta}>
                <Pressable
                  onPress={() => openUserProfile(selectedPhoto?.created_by)}
                  disabled={!selectedPhoto?.created_by}
                  accessibilityRole="button"
                  accessibilityLabel="Open uploader profile"
                  style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
                >
                  <Text style={styles.detailHeaderTitle} numberOfLines={1}>
                    {selectedPhoto?.created_by_handle ? `@${selectedPhoto.created_by_handle}` : 'anon'}
                  </Text>
                <Text style={styles.detailHeaderSubtitle}>
                  Uploaded {formatShortDate(selectedPhoto?.createdAt)}
                </Text>
              </Pressable>
            </View>
            <View style={styles.detailHeaderBadge}>
              <MaterialIcons name="emoji-events" size={15} color={colors.primary} />
              <Text style={styles.detailHeaderBadgeText}>
                {Number.isFinite(selectedPhoto?.global_elo) ? selectedPhoto.global_elo : 1000}
              </Text>
            </View>
          </View>

          <FlatList
            data={photoComments}
            keyExtractor={(item) => String(item?._id)}
            style={styles.detailList}
            contentContainerStyle={styles.detailListContent}
            keyboardShouldPersistTaps="handled"
            scrollEnabled={!detailImageZoomLocked}
            removeClippedSubviews={false}
            refreshControl={
              selectedPhotoCanComment ? (
                <RefreshControl
                  refreshing={commentsRefreshing}
                  onRefresh={refreshCommentsFromServer}
                />
              ) : undefined
            }
            ListHeaderComponent={(
              <View style={styles.detailHeroSection}>
                <View style={styles.detailImageFrame}>
                  <ZoomableDetailImage
                    key={selectedPhoto?._id ? String(selectedPhoto._id) : selectedPhoto?.file_url || 'detail-image'}
                    uri={selectedPhoto?.file_url || null}
                    styles={styles}
                    onInteractionChange={setDetailImageZoomLocked}
                  />
                  {selectedPhotoCanDelete ? (
                    <Pressable
                      onPress={confirmDeleteSelectedPhoto}
                      disabled={selectedPhotoDeletePending}
                      accessibilityRole="button"
                      accessibilityLabel="Delete your photo"
                      hitSlop={10}
                      style={[
                        styles.detailDeleteButton,
                        selectedPhotoDeletePending && styles.detailDeleteButtonDisabled,
                      ]}
                    >
                      {selectedPhotoDeletePending ? (
                        <ActivityIndicator size="small" color={colors.textMuted} />
                      ) : (
                        <MaterialIcons name="delete-outline" size={18} color={colors.textMuted} />
                      )}
                    </Pressable>
                  ) : null}
                </View>
                {/*  THIS INFORMATION IS REDUNDANT, RE-ADD WHEN IT WILL BE USEFUL
                <View style={styles.detailMetricRow}>
                  <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Global Elo</Text>
                    <Text style={styles.detailMetricValue}>
                      {Number.isFinite(selectedPhoto?.global_elo) ? selectedPhoto.global_elo : 1000}
                    </Text>
                  </View>
                  <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Uploaded</Text>
                    <Text style={styles.detailMetricValue}>{formatShortDate(selectedPhoto?.createdAt)}</Text>
                  </View>
                  <View style={styles.detailMetricCard}>
                    <Text style={styles.detailMetricLabel}>Comments</Text>
                    <Text style={styles.detailMetricValue}>{photoComments.length}</Text>
                  </View>
                </View>
                */}
                <View style={styles.commentsSectionHeader}>
                  <Text style={styles.commentsSectionTitle}>Comments</Text>
                  <Text style={styles.commentsSectionSubtitle}>{`${photoComments.length} total`}</Text>
                </View>
                {!selectedPhotoCanComment ? (
                  <View style={styles.pendingCommentNotice}>
                    <Text style={styles.pendingCommentText}>
                      Comments will be available after this upload finishes syncing.
                    </Text>
                  </View>
                ) : null}
              </View>
            )}
            ListEmptyComponent={(
              !selectedPhotoCanComment || !commentsHydrated || detailImageZoomLocked ? null : (
                <View style={styles.commentsEmptyState}>
                  <Text style={styles.commentsEmptyTitle}>No comments yet.</Text>
                  <Text style={styles.commentsEmptyText}>Be the first to add one.</Text>
                </View>
              )
            )}
            renderItem={renderCommentItem}
          />

          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <BottomBar style={styles.detailComposerBar}>
              {selectedPhotoCanComment ? (
                <View style={styles.commentComposerRow}>
                  <UserAvatar
                    uri={profile?.photo_url || null}
                    label={composerAvatarLabel}
                    size={40}
                    styles={styles}
                  />
                  <View style={styles.commentComposerInputWrap}>
                    <TextInput
                      value={commentDraft}
                      onChangeText={(nextValue) => setCommentDraft(nextValue.slice(0, COMMENT_MAX_LENGTH))}
                      placeholder="Add a comment..."
                      placeholderTextColor={colors.textMuted}
                      style={styles.commentComposerInput}
                      multiline
                      textAlignVertical="top"
                      maxLength={COMMENT_MAX_LENGTH}
                    />
                  </View>
                  <Pressable
                    onPress={submitComment}
                    disabled={!commentDraft.trim()}
                    style={[
                      styles.commentComposerSendButton,
                      !commentDraft.trim() && styles.commentComposerSendButtonDisabled,
                    ]}
                  >
                    <MaterialIcons name="send" size={18} color={colors.primaryTextOn} />
                  </Pressable>
                </View>
              ) : (
                <View style={styles.commentComposerDisabled}>
                  <Text style={styles.commentComposerDisabledText}>
                    Comments are unavailable until the photo finishes uploading.
                  </Text>
                </View>
              )}
            </BottomBar>
          </KeyboardAvoidingView>

          <Toast message={toastMessage} bottomOffset={100} />
        </SafeAreaView>
      </Modal>

      {!selectedPhotoId ? <Toast message={toastMessage} bottomOffset={140} /> : null}
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bg },
    privacyFooterRow: {
      marginBottom: 10,
    },
    uploadButtonLocked: {
      backgroundColor: colors.border,
      borderColor: colors.border,
      shadowOpacity: 0,
      elevation: 0,
    },
    uploadButtonLockedText: {
      color: colors.textMuted,
    },
    container: { flex: 1, backgroundColor: colors.surface },
    listContent: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: 120,
      gap: spacing.md,
    },
    galleryIntro: {
      marginBottom: spacing.md,
    },
    gallerySummaryCard: {
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      padding: spacing.lg,
      gap: spacing.sm,
      ...shadows.chip,
    },
    gallerySummaryMeta: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    gallerySummaryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    gallerySummaryChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '800',
    },
    galleryRow: {
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    galleryTileShell: {
      flexBasis: '48.2%',
      maxWidth: '48.2%',
      marginBottom: spacing.md,
    },
    galleryTile: {
      position: 'relative',
      borderRadius: 28,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      ...shadows.chip,
    },
    galleryImage: {
      width: '100%',
      aspectRatio: 3 / 4,
      backgroundColor: colors.border,
    },
    galleryOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(26, 26, 26, 0.12)',
    },
    galleryTileMeta: {
      position: 'absolute',
      left: spacing.sm,
      right: spacing.sm,
      bottom: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    galleryHandleWrap: {
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(26, 26, 26, 0.54)',
    },
    galleryHandle: {
      color: '#FFFFFF',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    galleryEloChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    galleryEloText: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '900',
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing['2xl'],
      gap: spacing.sm,
    },
    emptyTitle: {
      color: colors.text,
      fontSize: fontSizes.lg,
      fontWeight: '900',
    },
    emptyText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 20,
    },
    detailSafe: {
      flex: 1,
      backgroundColor: colors.bg,
      overflow: 'visible',
    },
    detailHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: 0,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: colors.barBorder,
      backgroundColor: colors.bg,
    },
    detailCloseButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailHeaderMeta: {
      flex: 1,
      gap: 2,
    },
    detailHeaderTitle: {
      color: colors.text,
      fontSize: fontSizes.md,
      fontWeight: '900',
    },
    detailHeaderSubtitle: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    detailHeaderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    detailHeaderBadgeText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '900',
    },
  detailDeleteButton: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
      ...shadows.chip,
    },
    detailDeleteButtonDisabled: {
      opacity: 0.55,
    },
    detailList: {
      flex: 1,
      position: 'relative',
      backgroundColor: colors.surface,
      overflow: 'visible',
      zIndex: 40,
      elevation: 40,
    },
    detailListContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      gap: 0,
      overflow: 'visible',
    },
    detailHeroSection: {
      position: 'relative',
      gap: spacing.lg,
      marginBottom: spacing.md,
      overflow: 'visible',
      zIndex: 50,
      elevation: 50,
    },
    detailImageFrame: {
      position: 'relative',
      borderRadius: 32,
      overflow: 'visible',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      ...shadows.chip,
      zIndex: 60,
      elevation: 60,
    },
    detailImageStage: {
      position: 'relative',
      width: '100%',
      aspectRatio: 4 / 5,
      borderRadius: 32,
      overflow: 'visible',
    },
    detailImageZoomSurface: {
      width: '100%',
      height: '100%',
      borderRadius: 32,
      overflow: 'visible',
    },
    detailImage: {
      width: '100%',
      height: '100%',
      borderRadius: 32,
      backgroundColor: colors.border,
    },
    detailMetricRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    detailMetricCard: {
      flex: 1,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      gap: 4,
    },
    detailMetricLabel: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      textAlign: 'center',
    },
    detailMetricValue: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '900',
      textAlign: 'center',
    },
    commentsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    commentsSectionTitle: {
      color: colors.text,
      fontSize: fontSizes.lg,
      fontWeight: '900',
    },
    commentsSectionSubtitle: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    pendingCommentNotice: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    pendingCommentText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
      lineHeight: 20,
    },
    commentsEmptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing['2xl'],
      paddingHorizontal: spacing.lg,
      gap: spacing.xs,
    },
    commentsEmptyTitle: {
      color: colors.text,
      fontSize: fontSizes.md,
      fontWeight: '900',
    },
    commentsEmptyText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
      textAlign: 'center',
    },
    commentRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
    },
    avatarImage: {
      backgroundColor: colors.border,
    },
    avatarFallback: {
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    avatarFallbackText: {
      color: colors.primaryTextOn,
      fontSize: 14,
      fontWeight: '900',
    },
    commentBody: {
      flex: 1,
      gap: 4,
    },
    commentMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    commentHandle: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '900',
      flex: 1,
    },
    commentTimestamp: {
      color: colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    commentText: {
      color: colors.text,
      fontSize: fontSizes.sm,
      lineHeight: 20,
      fontWeight: '500',
    },
    commentReplyText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    commentLikeButton: {
      minWidth: 52,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs,
      borderRadius: radii.pill,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    commentLikeButtonActive: {
      borderColor: colors.primary,
      backgroundColor: colors.bg,
    },
    commentLikeCount: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '900',
    },
    commentLikeCountActive: {
      color: colors.primary,
    },
    detailComposerBar: {
      backgroundColor: colors.bg,
    },
    commentComposerRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
    },
    commentComposerInputWrap: {
      flex: 1,
      minHeight: 40,
      maxHeight: 110,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      gap: spacing.xs,
    },
    commentComposerInput: {
      color: colors.text,
      fontSize: fontSizes.md,
      fontWeight: '400',
      minHeight: 22,
      maxHeight: 57,
      padding: 0,
    },
    commentComposerSendButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      ...shadows.chip,
    },
    commentComposerSendButtonDisabled: {
      opacity: 0.45,
    },
    commentComposerDisabled: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.sm,
    },
    commentComposerDisabledText: {
      color: colors.textMuted,
      fontSize: fontSizes.sm,
      fontWeight: '700',
      textAlign: 'center',
    },
  });
}
