import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
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
  createPhotoComment,
  deletePhoto,
  fetchPhotoComments,
  fetchPhotosByPinId,
  likePhotoComment,
  unlikePhotoComment,
} from '@/lib/api';
import {
  readPinCommentsCache,
  readPinPhotosCache,
  writePinCommentsCache,
  writePinPhotosCache,
} from '@/lib/pinChallengeCache';
import {
  buildMentionCandidates,
  createMentionDismissKey,
  filterMentionCandidates,
  findActiveMention,
  replaceActiveMention,
} from '@/lib/commentMentions';
import { goBackOrHome } from '@/lib/navigation';
import {
  removeUploadQueueItem,
  retryUploadQueueItem,
  subscribeUploadQueue,
  syncQueuedPhotosForPin,
} from '@/lib/uploadQueue';
import BottomBar from '@/components/ui/BottomBar';
import { Toast, useToast } from '@/components/ui/Toast';
import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';
import { radii, shadows, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const COMMENT_MAX_LENGTH = 200;
const MENTION_PICKER_WIDTH = 248;
const MENTION_PICKER_ROW_HEIGHT = 58;
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DETAIL_IMAGE_MAX_SCALE = 4;
const DETAIL_IMAGE_RESET_SPRING = {
  damping: 26,
  stiffness: 210,
};

function clamp(value, min, max) {
  'worklet';
  return Math.max(min, Math.min(max, value));
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

function getOptimisticUploadState(photo) {
  if (photo?.optimistic !== true) return null;
  const state = typeof photo?.upload_state === 'string' ? photo.upload_state.trim() : '';
  return state || 'pending';
}

function formatOptimisticUploadStateLabel(state) {
  switch (state) {
    case 'uploading':
      return 'Uploading';
    case 'finalizing':
      return 'Finalizing';
    case 'failed':
      return 'Failed';
    case 'pending':
    default:
      return 'Pending';
  }
}

function getOptimisticUploadStateMessage(photo) {
  const state = getOptimisticUploadState(photo);
  if (!state) {
    return 'Comments are available for uploaded photos.';
  }
  if (state === 'failed') {
    const errorText = typeof photo?.upload_error === 'string' ? photo.upload_error.trim() : '';
    return errorText || 'This upload failed before it reached the server.';
  }
  if (state === 'finalizing') {
    return 'The photo file reached storage and is being attached to the challenge.';
  }
  if (state === 'uploading') {
    return 'The photo file is still uploading.';
  }
  return 'Waiting for a usable network connection to resume uploading.';
}

function getAvatarInitial(comment) {
  const handle = typeof comment?.created_by_handle === 'string' ? comment.created_by_handle.trim() : '';
  if (handle) return handle.charAt(0).toUpperCase();
  const name = typeof comment?.created_by_name === 'string' ? comment.created_by_name.trim() : '';
  if (name) return name.charAt(0).toUpperCase();
  return 'A';
}

function firstParamValue(value) {
  if (Array.isArray(value)) {
    return value.length > 0 ? value[0] : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || null;
  }
  return null;
}

function getFriendDisplayLabel(friend) {
  return friend?.mentionDisplayLabel || friend?.display_name || friend?.handle || 'Unnamed user';
}

function getFriendHandleLabel(friend) {
  return friend?.mentionHandle ? `@${friend.mentionHandle}` : null;
}

function estimateMentionAnchorOffset(text, mentionStart, inputWidth) {
  const safeWidth = Number.isFinite(inputWidth) ? inputWidth : 0;
  const innerWidth = Math.max(1, safeWidth - (spacing.md * 2));
  const estimatedCharWidth = 8.2;
  const charsPerLine = Math.max(1, Math.floor(innerWidth / estimatedCharWidth));
  const content = typeof text === 'string' ? text.slice(0, Math.max(0, mentionStart)) : '';

  let column = 0;
  for (const char of content) {
    if (char === '\n') {
      column = 0;
      continue;
    }
    column += 1;
    if (column >= charsPerLine) {
      column = 0;
    }
  }

  return spacing.md + Math.min(innerWidth, column * estimatedCharWidth);
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

    const nextLockActive = normalizedTouchCount > 1;
    if (zoomLockActive.value !== nextLockActive) {
      zoomLockActive.value = nextLockActive;
      runOnJS(emitInteractionChange)(nextLockActive);
    }

    if (normalizedTouchCount < 2) {
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
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
      panTouchStartX.value = event.focalX;
      panTouchStartY.value = event.focalY;
    })
    .onUpdate((event) => {
      scale.value = clamp(baseScale.value * event.scale, 1, DETAIL_IMAGE_MAX_SCALE);
      translateX.value = panStartX.value + (event.focalX - panTouchStartX.value);
      translateY.value = panStartY.value + (event.focalY - panTouchStartY.value);
    })
    .onEnd(() => {
      baseScale.value = scale.value;
      panStartX.value = translateX.value;
      panStartY.value = translateY.value;
    });

  const composedGesture = pinchGesture;

  const animatedZoomStyle = useAnimatedStyle(() => {
    return {
      transformOrigin: [originX.value, originY.value, 0],
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { scale: scale.value },
      ],
    };
  });

  return (
    <View style={styles.detailImageStage}>
      <View style={styles.detailImageViewport}>
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
    </View>
  );
}

export default function ViewPhotoScreen() {
  const { pinId: pinIdParam, photoId: photoIdParam } = useLocalSearchParams();
  const pinId = firstParamValue(pinIdParam);
  const selectedPhotoId = firstParamValue(photoIdParam);
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [photoSourceSettled, setPhotoSourceSettled] = useState(false);
  const [commentsRefreshing, setCommentsRefreshing] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState(null);
  const [detailImageZoomLocked, setDetailImageZoomLocked] = useState(false);
  const [photoComments, setPhotoComments] = useState([]);
  const [commentsHydrated, setCommentsHydrated] = useState(false);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentSelection, setCommentSelection] = useState({ start: 0, end: 0 });
  const [mentionPickerDismissedKey, setMentionPickerDismissedKey] = useState(null);
  const [mentionPickerAnchor, setMentionPickerAnchor] = useState(null);
  const [mentionPickerScrollOffset, setMentionPickerScrollOffset] = useState(0);
  const [activeDraggedMentionUid, setActiveDraggedMentionUid] = useState(null);

  const photosRef = useRef([]);
  const pendingCommentIdsRef = useRef(new Set());
  const pendingCommentLikeIdsRef = useRef(new Set());
  const commentsRevisionRef = useRef(0);
  const photoCommentsRef = useRef([]);
  const isMountedRef = useRef(true);
  const selectedPhotoIdRef = useRef(null);
  const missingParamsHandledRef = useRef(false);
  const detailSafeRef = useRef(null);
  const commentInputWrapRef = useRef(null);
  const commentInputRef = useRef(null);
  const mentionDragMovedRef = useRef(false);
  const mentionPickerScrollOffsetRef = useRef(0);

  const router = useRouter();
  const { message: toastMessage, show: showToast } = useToast(3500);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const {
    user,
    profile,
    friends,
    invalidateStats,
    applyUploadResult,
  } = useContext(AuthContext);

  const selectedPhoto = useMemo(
    () => photos.find((photo) => String(photo?._id) === String(selectedPhotoId)) || null,
    [photos, selectedPhotoId]
  );
  const selectedPhotoUploadState = getOptimisticUploadState(selectedPhoto);
  const selectedPhotoUploadStateLabel = formatOptimisticUploadStateLabel(selectedPhotoUploadState);
  const selectedPhotoUploadMessage = getOptimisticUploadStateMessage(selectedPhoto);
  const selectedPhotoQueueId = typeof selectedPhoto?.queue_id === 'string' ? selectedPhoto.queue_id : null;
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
  const orderedPhotoComments = useMemo(() => {
    if (!Array.isArray(photoComments) || photoComments.length <= 1) {
      return photoComments;
    }
    const toTimestamp = (value) => {
      const parsed = value ? new Date(value).getTime() : Number.NaN;
      return Number.isFinite(parsed) ? parsed : 0;
    };
    return [...photoComments].sort((a, b) => toTimestamp(a?.createdAt) - toTimestamp(b?.createdAt));
  }, [photoComments]);
  const composerAvatarLabel = typeof profile?.handle === 'string' && profile.handle
    ? profile.handle.charAt(0).toUpperCase()
    : 'Y';
  const currentUserHandle = typeof profile?.handle === 'string' && profile.handle
    ? profile.handle
    : null;
  const currentUserName = typeof profile?.display_name === 'string' && profile.display_name
    ? profile.display_name
    : null;
  const mentionCandidates = useMemo(() => buildMentionCandidates(friends), [friends]);
  const activeMention = useMemo(
    () => findActiveMention(commentDraft, commentSelection.start),
    [commentDraft, commentSelection.start]
  );
  const activeMentionDismissKey = useMemo(
    () => createMentionDismissKey(activeMention),
    [activeMention]
  );
  const mentionSuggestions = useMemo(() => {
    if (!activeMention) return [];
    if (activeMentionDismissKey && activeMentionDismissKey === mentionPickerDismissedKey) {
      return [];
    }
    return filterMentionCandidates(mentionCandidates, activeMention.query);
  }, [activeMention, activeMentionDismissKey, mentionCandidates, mentionPickerDismissedKey]);
  const mentionPickerVisible = Boolean(activeMention && mentionSuggestions.length > 0);
  const mentionPickerHeight = Math.min(mentionSuggestions.length, 3) * MENTION_PICKER_ROW_HEIGHT;
  const mentionPickerLeft = useMemo(() => {
    if (!mentionPickerVisible || !mentionPickerAnchor || !activeMention) return spacing.lg;
    const offsetLeft = estimateMentionAnchorOffset(commentDraft, activeMention.start, mentionPickerAnchor.width);
    const desiredLeft = mentionPickerAnchor.x + offsetLeft - 28;
    return Math.max(
      spacing.sm,
      Math.min(desiredLeft, Math.max(spacing.sm, windowWidth - MENTION_PICKER_WIDTH - spacing.sm))
    );
  }, [activeMention, commentDraft, mentionPickerAnchor, mentionPickerVisible, windowWidth]);
  const mentionPickerTop = useMemo(() => {
    if (!mentionPickerVisible || !mentionPickerAnchor) return spacing.sm;
    return Math.max(spacing.sm, mentionPickerAnchor.y - mentionPickerHeight - spacing.xs);
  }, [mentionPickerAnchor, mentionPickerHeight, mentionPickerVisible]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    photoCommentsRef.current = photoComments;
  }, [photoComments]);

  useEffect(() => {
    selectedPhotoIdRef.current = selectedPhotoId ? String(selectedPhotoId) : null;
  }, [selectedPhotoId]);

  useEffect(() => {
    mentionPickerScrollOffsetRef.current = mentionPickerScrollOffset;
  }, [mentionPickerScrollOffset]);

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  useEffect(() => {
    setCommentSelection({ start: 0, end: 0 });
    setMentionPickerDismissedKey(null);
    setMentionPickerScrollOffset(0);
    setActiveDraggedMentionUid(null);
  }, [selectedPhotoId]);

  const measureMentionPickerAnchor = useCallback(() => {
    const safeNode = detailSafeRef.current;
    const inputNode = commentInputWrapRef.current;
    if (!safeNode?.measureInWindow || !inputNode?.measureInWindow) {
      return;
    }

    safeNode.measureInWindow((safeX, safeY) => {
      inputNode.measureInWindow((inputX, inputY, inputWidth) => {
        setMentionPickerAnchor({
          x: Math.max(0, inputX - safeX),
          y: Math.max(0, inputY - safeY),
          width: inputWidth,
        });
      });
    });
  }, []);

  useEffect(() => {
    if (!mentionPickerVisible) return;
    measureMentionPickerAnchor();
  }, [
    measureMentionPickerAnchor,
    mentionPickerVisible,
    commentDraft,
    commentSelection.start,
    windowHeight,
    windowWidth,
  ]);

  useEffect(() => {
    if (!mentionPickerVisible) {
      setActiveDraggedMentionUid(null);
      setMentionPickerScrollOffset(0);
    }
  }, [mentionPickerVisible]);

  useEffect(() => {
    if (pinId && selectedPhotoId) return;
    if (missingParamsHandledRef.current) return;
    missingParamsHandledRef.current = true;
    showToast('Missing photo details.', 2500);
    goBackOrHome(router);
  }, [pinId, router, selectedPhotoId, showToast]);

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

  const loadPhotos = useCallback(async ({ showSpinner = true } = {}) => {
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
        : photosRef.current;
      const mergedRows = mergeServerPhotosWithPending(rows, localRows);
      setPhotos(mergedRows);
      prefetchPhotoUrls(mergedRows);
      await writePinPhotosCache(pinId, mergedRows);
      return true;
    } catch (error) {
      console.error('Failed to fetch photos for pin', pinId, error);
      return false;
    } finally {
      if (showSpinner) setLoading(false);
    }
  }, [pinId]);

  useEffect(() => {
    let cancelled = false;
    setPhotoSourceSettled(false);

    async function hydrateAndLoad() {
      if (!pinId) {
        setPhotos([]);
        setLoading(false);
        setPhotoSourceSettled(true);
        return;
      }

      const { photos: cachedPhotos, hadCache, isFresh } = await readPinPhotosCache(pinId);
      if (hadCache && !cancelled) {
        setPhotos(Array.isArray(cachedPhotos) ? cachedPhotos : []);
        setLoading(false);
        prefetchPhotoUrls(cachedPhotos);
      }
      if (cancelled) return;

      if (!hadCache) {
        setLoading(true);
        await loadPhotos({ showSpinner: true });
        if (!cancelled) {
          setPhotoSourceSettled(true);
        }
        return;
      }

      if (isFresh) {
        setPhotoSourceSettled(true);
        return;
      }

      if (!isFresh) {
        await loadPhotos({ showSpinner: false });
        if (!cancelled) {
          setPhotoSourceSettled(true);
        }
      }
    }

    hydrateAndLoad();

    return () => {
      cancelled = true;
    };
  }, [loadPhotos, pinId]);

  useEffect(() => {
    let cancelled = false;

    async function syncQueuedPhotos() {
      if (!pinId) return;
      const queuedPhotos = await syncQueuedPhotosForPin(pinId);
      if (cancelled || !Array.isArray(queuedPhotos)) return;
      setPhotos(queuedPhotos);
      prefetchPhotoUrls(queuedPhotos);
    }

    void syncQueuedPhotos();
    const unsubscribe = subscribeUploadQueue(() => {
      void syncQueuedPhotos();
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [pinId]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      async function syncPhotosFromCache() {
        if (!pinId) return;
        const { photos: cachedPhotos, hadCache, isFresh } = await readPinPhotosCache(pinId);
        if (cancelled || !hadCache) return;
        setPhotos(Array.isArray(cachedPhotos) ? cachedPhotos : []);
        prefetchPhotoUrls(cachedPhotos);
        if (!isFresh) {
          await loadPhotos({ showSpinner: false });
        }
      }

      void syncPhotosFromCache();

      return () => {
        cancelled = true;
      };
    }, [loadPhotos, pinId])
  );

  useEffect(() => {
    if (!photoSourceSettled || loading || !selectedPhotoId || selectedPhoto) {
      return;
    }
    showToast('Photo unavailable.', 2500);
    goBackOrHome(router);
  }, [loading, photoSourceSettled, router, selectedPhoto, selectedPhotoId, showToast]);

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

  const closePhotoDetail = useCallback(() => {
    setDetailImageZoomLocked(false);
    setPhotoComments([]);
    setCommentDraft('');
    setCommentsHydrated(false);
    pendingCommentIdsRef.current.clear();
    pendingCommentLikeIdsRef.current.clear();
    goBackOrHome(router);
  }, [router]);

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
        setPhotos([]);
        await writePinPhotosCache(pinId, [], { isDirty: false });
        goBackOrHome(router);
        return;
      }

      const nextPhotos = photosRef.current.filter((photo) => String(photo?._id) !== targetPhotoId);
      setPhotos(nextPhotos);
      await writePinPhotosCache(pinId, nextPhotos, { isDirty: false });
      goBackOrHome(router);
    } catch (error) {
      console.error('Failed to delete selected photo', error);
      showToast('Failed to delete photo.', 2500);
    } finally {
      if (isMountedRef.current) {
        setDeletingPhotoId((current) => (current === targetPhotoId ? null : current));
      }
    }
  }, [
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

  const retrySelectedPhotoUpload = useCallback(async () => {
    if (!selectedPhotoQueueId) return;
    try {
      await retryUploadQueueItem(selectedPhotoQueueId);
      showToast('Retrying upload...', 2200);
    } catch (error) {
      console.error('Failed to retry queued photo upload', error);
      showToast('Unable to retry upload.', 2500);
    }
  }, [selectedPhotoQueueId, showToast]);

  const removeSelectedQueuedPhoto = useCallback(async () => {
    if (!selectedPhotoQueueId || !pinId) return;
    try {
      const removed = await removeUploadQueueItem(selectedPhotoQueueId);
      if (!removed) {
        showToast('Unable to remove upload.', 2500);
        return;
      }
      const queuedPhotos = await syncQueuedPhotosForPin(pinId);
      if (Array.isArray(queuedPhotos)) {
        setPhotos(queuedPhotos);
        await writePinPhotosCache(pinId, queuedPhotos, { isDirty: false });
      }
      goBackOrHome(router);
    } catch (error) {
      console.error('Failed to remove queued photo upload', error);
      showToast('Unable to remove upload.', 2500);
    }
  }, [pinId, router, selectedPhotoQueueId, showToast]);

  const dismissMentionPicker = useCallback(() => {
    if (!activeMentionDismissKey) return;
    setMentionPickerDismissedKey(activeMentionDismissKey);
    setActiveDraggedMentionUid(null);
  }, [activeMentionDismissKey]);

  const handleCommentDraftChange = useCallback((nextValue) => {
    const nextDraft = typeof nextValue === 'string'
      ? nextValue.slice(0, COMMENT_MAX_LENGTH)
      : '';
    setCommentDraft(nextDraft);
    setCommentSelection((current) => {
      const nextStart = Math.min(current?.start ?? 0, nextDraft.length);
      const nextEnd = Math.min(current?.end ?? nextStart, nextDraft.length);
      return { start: nextStart, end: nextEnd };
    });
    setMentionPickerDismissedKey(null);
  }, []);

  const handleCommentSelectionChange = useCallback((event) => {
    const selection = event?.nativeEvent?.selection;
    const nextStart = Number.isFinite(selection?.start) ? selection.start : 0;
    const nextEnd = Number.isFinite(selection?.end) ? selection.end : nextStart;
    setCommentSelection({ start: nextStart, end: nextEnd });
  }, []);

  const handleSelectMention = useCallback((friend) => {
    if (!activeMention || !friend?.mentionHandle) return;

    const replacement = replaceActiveMention(commentDraft, activeMention, friend.mentionHandle);
    setCommentDraft(replacement.text);
    setCommentSelection({ start: replacement.selection, end: replacement.selection });
    setMentionPickerDismissedKey(null);
    setActiveDraggedMentionUid(null);
    setMentionPickerScrollOffset(0);
    commentInputRef.current?.focus?.();
    Haptics.selectionAsync().catch(() => {});
  }, [activeMention, commentDraft]);

  const updateDraggedMentionFromTouch = useCallback((event) => {
    if (!mentionSuggestions.length) return;
    const locationY = event?.nativeEvent?.locationY;
    if (!Number.isFinite(locationY)) return;

    const contentY = locationY + mentionPickerScrollOffsetRef.current;
    const nextIndex = Math.max(0, Math.floor(contentY / MENTION_PICKER_ROW_HEIGHT));
    const nextMention = mentionSuggestions[nextIndex] || null;
    const nextUid = nextMention?.uid || null;

    setActiveDraggedMentionUid((current) => {
      if (current === nextUid) {
        return current;
      }
      if (nextUid) {
        Haptics.selectionAsync().catch(() => {});
      }
      return nextUid;
    });
  }, [mentionSuggestions]);

  const handleMentionPickerTouchStart = useCallback((event) => {
    mentionDragMovedRef.current = false;
    updateDraggedMentionFromTouch(event);
  }, [updateDraggedMentionFromTouch]);

  const handleMentionPickerTouchMove = useCallback((event) => {
    mentionDragMovedRef.current = true;
    updateDraggedMentionFromTouch(event);
  }, [updateDraggedMentionFromTouch]);

  const handleMentionPickerTouchEnd = useCallback(() => {
    if (mentionDragMovedRef.current) {
      const selectedFriend = mentionSuggestions.find((item) => item?.uid === activeDraggedMentionUid) || null;
      if (selectedFriend) {
        handleSelectMention(selectedFriend);
      }
    }
    mentionDragMovedRef.current = false;
    setActiveDraggedMentionUid(null);
  }, [activeDraggedMentionUid, handleSelectMention, mentionSuggestions]);

  const handleMentionPickerTouchCancel = useCallback(() => {
    mentionDragMovedRef.current = false;
    setActiveDraggedMentionUid(null);
  }, []);

  const submitComment = useCallback(async () => {
    const normalizedText = commentDraft.trim();
    if (!selectedPhotoCanComment || !selectedPhotoId || !normalizedText) {
      return;
    }
    setMentionPickerDismissedKey(null);
    setActiveDraggedMentionUid(null);
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
    setCommentSelection({ start: 0, end: 0 });

    createPhotoComment(selectedPhotoId, normalizedText)
      .then((result) => {
        const createdComment = result?.comment || null;
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
        void applyUploadResult?.(result);
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
    applyUploadResult,
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
        const nextSelection = draftText.length;
        setCommentSelection({ start: nextSelection, end: nextSelection });
        setMentionPickerDismissedKey(null);
        requestAnimationFrame(() => {
          commentInputRef.current?.focus?.();
        });
        return draftText;
      }
      if (!draftText.trim()) {
        const nextDraft = `${mentionPrefix} `;
        const nextSelection = nextDraft.length;
        setCommentSelection({ start: nextSelection, end: nextSelection });
        setMentionPickerDismissedKey(null);
        requestAnimationFrame(() => {
          commentInputRef.current?.focus?.();
        });
        return nextDraft;
      }
      const nextDraft = `${mentionPrefix} ${draftText}`;
      const nextSelection = nextDraft.length;
      setCommentSelection({ start: nextSelection, end: nextSelection });
      setMentionPickerDismissedKey(null);
      requestAnimationFrame(() => {
        commentInputRef.current?.focus?.();
      });
      return nextDraft;
    });
  }, []);

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
          onPress={() => navigateToUserProfile(item?.created_by)}
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
              onPress={() => navigateToUserProfile(item?.created_by)}
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
    navigateToUserProfile,
    onPressLikeComment,
    onPressReplyComment,
    styles,
    user?.uid,
  ]);

  return (
    <SafeAreaView ref={detailSafeRef} collapsable={false} style={styles.detailSafe}>
      <View style={styles.detailHeader}>
        <Pressable onPress={closePhotoDetail} style={styles.detailCloseButton}>
          <MaterialIcons name="arrow-back" size={22} color={colors.text} />
        </Pressable>
        <View style={styles.detailHeaderMeta}>
          <Pressable
            onPress={() => navigateToUserProfile(selectedPhoto?.created_by)}
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

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={orderedPhotoComments}
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
              {selectedPhoto?.optimistic ? (
                <View style={styles.uploadStateCard}>
                  <Text style={styles.uploadStateEyebrow}>Upload status</Text>
                  <Text style={styles.uploadStateTitle}>{selectedPhotoUploadStateLabel}</Text>
                  <Text style={styles.uploadStateText}>{selectedPhotoUploadMessage}</Text>
                  {selectedPhotoUploadState === 'failed' ? (
                    <View style={styles.uploadStateActions}>
                      <Pressable
                        onPress={retrySelectedPhotoUpload}
                        style={({ pressed }) => [
                          styles.uploadStateActionButton,
                          pressed && { opacity: 0.72 },
                        ]}
                      >
                        <Text style={styles.uploadStateActionText}>Retry</Text>
                      </Pressable>
                      <Pressable
                        onPress={removeSelectedQueuedPhoto}
                        style={({ pressed }) => [
                          styles.uploadStateSecondaryButton,
                          pressed && { opacity: 0.72 },
                        ]}
                      >
                        <Text style={styles.uploadStateSecondaryText}>Remove</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <View style={styles.commentsSectionHeader}>
                <Text style={styles.commentsSectionTitle}>Comments</Text>
                <Text style={styles.commentsSectionSubtitle}>{`${photoComments.length} total`}</Text>
              </View>
              {!selectedPhotoCanComment ? (
                <View style={styles.pendingCommentNotice}>
                  <Text style={styles.pendingCommentText}>
                    {selectedPhotoUploadMessage}
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
      )}

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
              <View
                ref={commentInputWrapRef}
                collapsable={false}
                onLayout={measureMentionPickerAnchor}
                style={styles.commentComposerInputWrap}
              >
                <TextInput
                  ref={commentInputRef}
                  value={commentDraft}
                  onChangeText={handleCommentDraftChange}
                  onSelectionChange={handleCommentSelectionChange}
                  placeholder="Add a comment..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.commentComposerInput}
                  multiline
                  textAlignVertical="top"
                  maxLength={COMMENT_MAX_LENGTH}
                  selection={commentSelection}
                  selectionColor={colors.primary}
                  cursorColor={colors.text}
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
                {selectedPhotoUploadState === 'failed'
                  ? 'Comments are unavailable until this failed upload is retried or removed.'
                  : 'Comments are unavailable until the photo finishes uploading.'}
              </Text>
            </View>
          )}
        </BottomBar>
      </KeyboardAvoidingView>

      {mentionPickerVisible ? (
        <>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close mention suggestions"
            onPress={dismissMentionPicker}
            style={styles.mentionBackdrop}
          />
          <View
            style={[
              styles.mentionPicker,
              {
                left: mentionPickerLeft,
                top: mentionPickerTop,
                height: mentionPickerHeight,
              },
            ]}
          >
            <FlatList
              data={mentionSuggestions}
              keyExtractor={(item) => String(item?.uid || item?.mentionHandle)}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              bounces={mentionSuggestions.length > 3}
              onScroll={(event) => {
                const nextOffset = Number.isFinite(event?.nativeEvent?.contentOffset?.y)
                  ? event.nativeEvent.contentOffset.y
                  : 0;
                setMentionPickerScrollOffset(nextOffset);
              }}
              onTouchStart={handleMentionPickerTouchStart}
              onTouchMove={handleMentionPickerTouchMove}
              onTouchEnd={handleMentionPickerTouchEnd}
              onTouchCancel={handleMentionPickerTouchCancel}
              renderItem={({ item }) => {
                const isDragged = activeDraggedMentionUid && item?.uid === activeDraggedMentionUid;
                return (
                  <Pressable
                    onPress={() => handleSelectMention(item)}
                    style={({ pressed }) => [
                      styles.mentionRow,
                      isDragged && styles.mentionRowActive,
                      pressed && styles.mentionRowPressed,
                    ]}
                    testID={`mention-row-${item?.mentionHandle}`}
                  >
                    <UserAvatar
                      uri={item?.photo_url || null}
                      label={getAvatarInitial(item)}
                      size={38}
                      styles={styles}
                    />
                    <View style={styles.mentionTextWrap}>
                      <Text numberOfLines={1} style={styles.mentionName}>
                        {getFriendDisplayLabel(item)}
                      </Text>
                      <Text numberOfLines={1} style={styles.mentionHandleText}>
                        {getFriendHandleLabel(item)}
                      </Text>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </>
      ) : null}

      <Toast message={toastMessage} bottomOffset={100} />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    detailSafe: {
      flex: 1,
      backgroundColor: colors.bg,
    },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
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
      ...textStyles.titleStrong,
      color: colors.text,
    },
    detailHeaderSubtitle: {
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
      letterSpacing: 0.4,
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
      ...textStyles.chip,
      color: colors.text,
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
      overflow: 'hidden',
    },
    detailListContent: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl,
      gap: 0,
    },
    detailHeroSection: {
      position: 'relative',
      gap: spacing.lg,
      marginBottom: spacing.md,
    },
    detailImageFrame: {
      position: 'relative',
      borderRadius: 32,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      ...shadows.chip,
    },
    detailImageStage: {
      position: 'relative',
      width: '100%',
      aspectRatio: 4 / 5,
      borderRadius: 32,
    },
    detailImageViewport: {
      width: '100%',
      height: '100%',
      borderRadius: 32,
      overflow: 'hidden',
    },
    detailImageZoomSurface: {
      width: '100%',
      height: '100%',
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
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
      letterSpacing: 0.8,
      textAlign: 'center',
    },
    detailMetricValue: {
      ...textStyles.chip,
      color: colors.text,
      textAlign: 'center',
    },
    uploadStateCard: {
      padding: spacing.md,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      gap: spacing.xs,
    },
    uploadStateEyebrow: {
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    uploadStateTitle: {
      ...textStyles.titleStrong,
      color: colors.text,
    },
    uploadStateText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      lineHeight: 20,
    },
    uploadStateActions: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    uploadStateActionButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      backgroundColor: colors.primary,
    },
    uploadStateActionText: {
      ...textStyles.buttonCaps,
      color: colors.primaryTextOn,
      letterSpacing: 0.4,
    },
    uploadStateSecondaryButton: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    uploadStateSecondaryText: {
      ...textStyles.buttonCaps,
      color: colors.text,
      letterSpacing: 0.4,
    },
    commentsSectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    commentsSectionTitle: {
      ...textStyles.title,
      color: colors.text,
    },
    commentsSectionSubtitle: {
      ...textStyles.sectionTitleSm,
      color: colors.textMuted,
      letterSpacing: 0.8,
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
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
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
      ...textStyles.titleStrong,
      color: colors.text,
    },
    commentsEmptyText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
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
      ...textStyles.bodyStrong,
      color: colors.primaryTextOn,
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
      ...textStyles.bodyXsBold,
      color: colors.text,
      flex: 1,
    },
    commentTimestamp: {
      ...textStyles.eyebrow,
      color: colors.textMuted,
      letterSpacing: 0.5,
    },
    commentText: {
      ...textStyles.bodyXs,
      color: colors.text,
      lineHeight: 20,
    },
    commentReplyText: {
      ...textStyles.bodyXsStrong,
      color: colors.textMuted,
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
      ...textStyles.chipSmall,
      color: colors.textMuted,
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
      ...textStyles.input,
      color: colors.text,
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
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
    },
    mentionBackdrop: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 18,
    },
    mentionPicker: {
      position: 'absolute',
      width: MENTION_PICKER_WIDTH,
      borderRadius: radii.lg,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      overflow: 'hidden',
      zIndex: 20,
      ...shadows.chip,
    },
    mentionRow: {
      height: MENTION_PICKER_ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      backgroundColor: colors.bg,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    mentionRowActive: {
      backgroundColor: colors.surface,
    },
    mentionRowPressed: {
      opacity: 0.88,
    },
    mentionTextWrap: {
      flex: 1,
      gap: 1,
    },
    mentionName: {
      ...textStyles.bodySmallBold,
      color: colors.text,
    },
    mentionHandleText: {
      ...textStyles.body2xsBold,
      color: colors.textMuted,
    },
  });
}
