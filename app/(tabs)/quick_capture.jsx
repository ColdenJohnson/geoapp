import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { FontAwesome6, MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCameraPermission } from 'react-native-vision-camera';

import ChallengeCameraStage from '@/components/camera/ChallengeCameraStage';
import { CTAButton } from '@/components/ui/Buttons';
import { createFormStyles } from '@/components/ui/FormStyles';
import { Toast, useToast } from '@/components/ui/Toast';
import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';
import { fetchRankedQuests } from '@/lib/api';
import { normalizeChallengeCoordinate } from '@/lib/challengeGeoAccess';
import { buildViewPhotoChallengeRoute, goBackOrHome } from '@/lib/navigation';
import { filterChallengesByPrompt, isQuestSearchReady, normalizeQuestSearchText } from '@/lib/questSearch';
import { enqueueAddPhotoUpload, enqueueNewChallengeUpload, waitForUploadQueueItem } from '@/lib/uploadQueue';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const MAX_LEN = 50;
const PHOTO_ASPECT_RATIO = 3 / 4;
const BACK_BUTTON_HEIGHT = 20 + spacing.xs * 2;

function normalizeRankedQuest(pin, index) {
  const pinId = pin?._id ? String(pin._id) : `challenge-${index}`;
  const prompt = typeof pin?.message === 'string' && pin.message.trim()
    ? pin.message.trim()
    : 'Untitled challenge';
  const creatorHandleRaw = typeof pin?.created_by_handle === 'string' && pin.created_by_handle.trim()
    ? pin.created_by_handle.trim().replace(/^@/, '')
    : '';
  const teaserPhoto = typeof pin?.top_global_photo?.file_url === 'string' && pin.top_global_photo.file_url
    ? pin.top_global_photo.file_url
    : typeof pin?.most_recent_photo_url === 'string' && pin.most_recent_photo_url
      ? pin.most_recent_photo_url
      : null;

  return {
    pinId,
    prompt,
    creatorHandleRaw,
    teaserPhoto,
    rawPin: pin,
  };
}

async function readCurrentLocation({ requestPermission = false } = {}) {
  try {
    let permission = await Location.getForegroundPermissionsAsync();
    if (permission?.status !== 'granted' && requestPermission) {
      permission = await Location.requestForegroundPermissionsAsync();
    }
    if (permission?.status !== 'granted') {
      return null;
    }

    const lastKnownPosition = await Location.getLastKnownPositionAsync();
    const lastKnownCoords = normalizeChallengeCoordinate(lastKnownPosition);
    if (lastKnownCoords) {
      return lastKnownCoords;
    }

    const currentPosition = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return normalizeChallengeCoordinate(currentPosition);
  } catch (error) {
    console.warn('Failed to read quick capture location', error);
    return null;
  }
}

export default function QuickCaptureScreen({ initialUri = null }) {
  const [uri, setUri] = useState(initialUri);
  const [mode, setMode] = useState('existing');
  const [message, setMessage] = useState('');
  const [showEmptyMessageError, setShowEmptyMessageError] = useState(false);
  const [questSearchInput, setQuestSearchInput] = useState('');
  const [forceQuestSearch, setForceQuestSearch] = useState(false);
  const [rankedQuests, setRankedQuests] = useState([]);
  const [questsLoading, setQuestsLoading] = useState(false);
  const [selectedQuestPinId, setSelectedQuestPinId] = useState('');
  const [userCoords, setUserCoords] = useState(null);
  const [uploading, setUploading] = useState(false);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { hasPermission, requestPermission } = useCameraPermission();
  const { profile, applyUploadResult } = useContext(AuthContext);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const formStyles = useMemo(() => createFormStyles(colors), [colors]);
  const { message: toastMessage, show: showToast } = useToast(3000);
  const isMounted = useRef(true);
  const inputRef = useRef(null);
  const backButtonClearance = insets.top + spacing.sm + BACK_BUTTON_HEIGHT + spacing.sm;
  const hasMessage = message.trim().length > 0;
  const isAtMaxLength = message.length >= MAX_LEN;

  const normalizedQuestSearchInput = useMemo(
    () => normalizeQuestSearchText(questSearchInput),
    [questSearchInput]
  );
  const liveQuestSearchEnabled = useMemo(
    () => isQuestSearchReady(questSearchInput),
    [questSearchInput]
  );
  const questSearchEnabled = normalizedQuestSearchInput.length > 0 && (forceQuestSearch || liveQuestSearchEnabled);
  const visibleQuests = useMemo(() => (
    questSearchEnabled
      ? filterChallengesByPrompt(rankedQuests, questSearchInput)
      : rankedQuests
  ), [questSearchEnabled, questSearchInput, rankedQuests]);
  const selectedQuest = useMemo(
    () => rankedQuests.find((quest) => quest.pinId === selectedQuestPinId) || null,
    [selectedQuestPinId, rankedQuests]
  );

  useEffect(() => () => {
    isMounted.current = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    readCurrentLocation().then((coords) => {
      if (!cancelled) {
        setUserCoords(coords);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setQuestsLoading(true);
    fetchRankedQuests({ includeRankingDebug: true })
      .then((rows) => {
        if (cancelled) return;
        const normalized = Array.isArray(rows)
          ? rows.map(normalizeRankedQuest).filter((quest) => quest.pinId)
          : [];
        setRankedQuests(normalized);
      })
      .catch((error) => {
        console.error('Failed to fetch quick capture quests', error);
        if (!cancelled) {
          setRankedQuests([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setQuestsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedQuestPinId && !rankedQuests.some((quest) => quest.pinId === selectedQuestPinId)) {
      setSelectedQuestPinId('');
    }
  }, [selectedQuestPinId, rankedQuests]);

  const renderBackButton = () => (
    <Pressable
      onPress={() => goBackOrHome(router)}
      style={[styles.backButton, { top: insets.top + spacing.sm }]}
      hitSlop={10}
    >
      <MaterialIcons name="arrow-back" size={20} color={colors.text} />
      <Text style={styles.backText}>Back</Text>
    </Pressable>
  );

  const handlePhotoCaptured = useCallback((photoUri) => {
    setUri(photoUri);
    setMode('existing');
  }, []);

  const handleMessageChange = useCallback((value) => {
    setMessage(value);
    if (showEmptyMessageError) {
      setShowEmptyMessageError(false);
    }
  }, [showEmptyMessageError]);

  const handleQuestSearchInputChange = useCallback((value) => {
    setQuestSearchInput(value);
    if (!normalizeQuestSearchText(value)) {
      setForceQuestSearch(false);
    }
  }, []);

  const handleQuestSearchSubmit = useCallback(() => {
    if (!normalizedQuestSearchInput) return;
    setForceQuestSearch(true);
  }, [normalizedQuestSearchInput]);

  const ensureLocationForCreate = useCallback(async () => {
    if (userCoords) {
      return userCoords;
    }
    const coords = await readCurrentLocation({ requestPermission: true });
    if (isMounted.current) {
      setUserCoords(coords);
    }
    return coords;
  }, [userCoords]);

  const handleCreateQuest = useCallback(async () => {
    if (!uri || uploading) return;
    const trimmed = message.trim();
    if (!trimmed) {
      setShowEmptyMessageError(true);
      setMessage('');
      inputRef.current?.focus();
      return;
    }

    const challengeCoords = await ensureLocationForCreate();
    if (!challengeCoords) {
      Alert.alert('Location unavailable', 'Try again once we have your position.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    setUploading(true);
    showToast('Uploading...', 60000);
    try {
      const queuedItem = await enqueueNewChallengeUpload({
        sourceUri: uri,
        message: trimmed,
        location: { coords: challengeCoords },
        photoLocation: { coords: challengeCoords },
      });
      const created = await waitForUploadQueueItem(queuedItem.id);
      if (!created?.pinId) {
        throw new Error('Queued challenge did not return a pinId');
      }
      await applyUploadResult?.(created);
      showToast('Upload Sucess', 2200);
      router.push(buildViewPhotoChallengeRoute({
        pinId: created.pinId,
        message: trimmed,
        createdByHandle: created.pin?.created_by_handle || '',
      }));
    } catch (error) {
      console.error('Failed to create quick capture quest', error);
      Alert.alert('Upload failed', 'Unable to queue this challenge right now. Please try again.');
      showToast('Upload Failed', 2500);
    } finally {
      if (isMounted.current) {
        setUploading(false);
      }
    }
  }, [applyUploadResult, ensureLocationForCreate, message, router, showToast, uploading, uri]);

  const handleAddToQuest = useCallback(async () => {
    if (!uri || uploading || !selectedQuest) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
    setUploading(true);
    try {
      const photoLocation = userCoords || await readCurrentLocation({ requestPermission: false });
      const queuedItem = await enqueueAddPhotoUpload({
        sourceUri: uri,
        pinId: selectedQuest.pinId,
        createdByHandle:
          typeof profile?.handle === 'string' && profile.handle
            ? profile.handle
            : 'you',
        queueId: `quick-upload-${selectedQuest.pinId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        photoLocation,
      });

      void waitForUploadQueueItem(queuedItem.id)
        .then((result) => {
          void applyUploadResult?.(result);
        })
        .catch((queueError) => {
          console.warn('Failed waiting for quick capture upload completion', queueError);
        });

      router.push(buildViewPhotoChallengeRoute({
        pinId: selectedQuest.pinId,
        message: selectedQuest.prompt,
        createdByHandle: selectedQuest.creatorHandleRaw || '',
      }));
    } catch (error) {
      console.error('Failed to queue quick capture photo', error);
      Alert.alert('Upload failed', 'Unable to queue this photo right now. Please try again.');
    } finally {
      if (isMounted.current) {
        setUploading(false);
      }
    }
  }, [applyUploadResult, profile?.handle, router, selectedQuest, uploading, uri, userCoords]);

  const renderCamera = () => (
    <View
      style={[
        styles.content,
        {
          paddingTop: backButtonClearance,
          paddingBottom: spacing.sm + insets.bottom,
        },
      ]}
    >
      <ChallengeCameraStage
        helperText=""
        onPhotoCaptured={handlePhotoCaptured}
        disabled={uploading}
      />
    </View>
  );

  const renderPreview = () => (
    <View style={styles.stage}>
      <View style={styles.card}>
        <Image source={{ uri }} style={styles.photo} contentFit="cover" cachePolicy="memory-disk" />
        <View style={[StyleSheet.absoluteFillObject, styles.cardOverlay]} pointerEvents="none" />
        <Pressable style={styles.closeButton} onPress={() => setUri(null)} hitSlop={12}>
          <FontAwesome6 name="xmark" size={18} color="#FFFFFF" />
        </Pressable>
      </View>
    </View>
  );

  const renderModeToggle = () => (
    <View style={styles.modeToggle}>
      {[
        { id: 'create', label: 'Create' },
        { id: 'existing', label: 'Join' },
      ].map((option) => {
        const selected = mode === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() => setMode(option.id)}
            style={({ pressed }) => [
              styles.modeToggleOption,
              selected && styles.modeToggleOptionSelected,
              pressed && !selected ? styles.modeToggleOptionPressed : null,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            testID={`quick-capture-mode-${option.id}`}
          >
            <Text style={[
              styles.modeToggleText,
              selected && styles.modeToggleTextSelected,
            ]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderCreateForm = () => (
    <View style={styles.formBlock}>
      <TextInput
        ref={inputRef}
        value={message}
        onChangeText={handleMessageChange}
        placeholder="Write a short challenge prompt…"
        placeholderTextColor={showEmptyMessageError ? colors.danger : colors.textMuted}
        maxLength={MAX_LEN}
        returnKeyType="done"
        blurOnSubmit
        onSubmitEditing={Keyboard.dismiss}
        style={[styles.promptInput, isAtMaxLength && styles.inputMaxed]}
        textAlignVertical="top"
        multiline
        testID="quick-capture-prompt-input"
      />
      <Pressable
        onPress={handleCreateQuest}
        disabled={uploading}
        style={({ pressed }) => [
          styles.createAction,
          pressed && { opacity: 0.7 },
          uploading && { opacity: 0.5 },
          !hasMessage && { opacity: 0.45 },
        ]}
        testID="quick-capture-create-submit"
      >
        <Text style={styles.createText}>{uploading ? 'UPLOADING...' : 'CREATE>'}</Text>
      </Pressable>
    </View>
  );

  const renderQuestSearch = () => (
    <View style={styles.formBlock}>
      <View style={styles.searchRow}>
        <Pressable
          style={({ pressed }) => [
            styles.searchButton,
            { opacity: pressed || !normalizedQuestSearchInput ? 0.55 : 1 },
          ]}
          onPress={handleQuestSearchSubmit}
          disabled={!normalizedQuestSearchInput}
          accessibilityLabel="Search quests"
          testID="quick-capture-search-button"
        >
          <MaterialIcons name="search" size={22} color={colors.text} />
        </Pressable>
        <TextInput
          style={[formStyles.input, styles.searchInput]}
          placeholder="Search quests"
          value={questSearchInput}
          onChangeText={handleQuestSearchInputChange}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={handleQuestSearchSubmit}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.primary}
          cursorColor={colors.text}
          testID="quick-capture-search-input"
        />
      </View>
      <View style={styles.questResults}>
        {questsLoading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.stateText}>Loading quests…</Text>
          </View>
        ) : visibleQuests.length === 0 ? (
          <View style={styles.centeredState}>
            <MaterialIcons name="explore-off" size={28} color={colors.textMuted} />
            <Text style={styles.stateText}>
              {rankedQuests.length === 0
                ? 'No quests available right now.'
                : 'No uploadable quests found.'}
            </Text>
          </View>
        ) : (
          visibleQuests.slice(0, 10).map((quest) => {
            const selected = selectedQuestPinId === quest.pinId;
            return (
              <Pressable
                key={quest.pinId}
                onPress={() => setSelectedQuestPinId(quest.pinId)}
                style={({ pressed }) => [
                  styles.questRow,
                  selected && styles.questRowSelected,
                  pressed && !selected ? styles.questRowPressed : null,
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                testID={`quick-capture-quest-${quest.pinId}`}
              >
                <View style={styles.questThumb}>
                  {quest.teaserPhoto ? (
                    <Image source={{ uri: quest.teaserPhoto }} style={styles.questThumbImage} contentFit="cover" />
                  ) : (
                    <MaterialIcons name="photo-camera" size={20} color={colors.textMuted} />
                  )}
                </View>
                <Text style={styles.questPrompt} numberOfLines={2}>{quest.prompt}</Text>
                {selected ? <MaterialIcons name="check-circle" size={22} color={colors.primary} /> : null}
              </Pressable>
            );
          })
        )}
      </View>
      <CTAButton
        title={uploading ? 'Uploading...' : 'Add photo'}
        onPress={handleAddToQuest}
        disabled={!selectedQuest || uploading}
        loading={uploading}
        variant="filled"
      />
    </View>
  );

  if (!hasPermission) {
    return (
      <View style={[styles.container, styles.permissionGate]}>
        {renderBackButton()}
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.helper}>We need permission to capture your quest photo.</Text>
        <CTAButton title="Continue" onPress={requestPermission} />
      </View>
    );
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        {renderBackButton()}
        {uri ? (
          <ScrollView
            style={[styles.scrollFrame, { paddingTop: backButtonClearance }]}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: spacing.lg + insets.bottom },
            ]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {renderPreview()}
            {renderModeToggle()}
            {mode === 'create' ? renderCreateForm() : renderQuestSearch()}
          </ScrollView>
        ) : renderCamera()}
        <Toast message={toastMessage} bottomOffset={spacing.lg + insets.bottom} />
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.surface },
    permissionGate: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
    backButton: {
      position: 'absolute',
      left: spacing.md,
      zIndex: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingRight: spacing.sm,
      paddingLeft: spacing.xs,
    },
    backText: {
      ...textStyles.navLabel,
      color: colors.text,
    },
    content: {
      flex: 1,
      padding: spacing.sm,
      justifyContent: 'center',
      gap: spacing.lg,
    },
    scrollFrame: {
      flex: 1,
      padding: spacing.sm,
    },
    scrollContent: {
      flexGrow: 1,
      gap: spacing.md,
      justifyContent: 'flex-start',
    },
    stage: {
      alignItems: 'center',
      width: '100%',
    },
    card: {
      width: '100%',
      maxWidth: 520,
      aspectRatio: PHOTO_ASPECT_RATIO,
      borderRadius: radii.lg,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 18 },
      shadowRadius: 30,
      shadowOpacity: 0.18,
      elevation: 14,
      borderWidth: 1,
      borderColor: colors.barBorder,
    },
    photo: { ...StyleSheet.absoluteFillObject },
    cardOverlay: { backgroundColor: 'rgba(12,7,3,0.1)' },
    closeButton: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 34,
      height: 34,
      borderRadius: 12,
      backgroundColor: 'rgba(12,7,3,0.48)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      ...textStyles.accentTitle,
      color: colors.primary,
      textAlign: 'center',
    },
    helper: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    modeToggle: {
      flexDirection: 'row',
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      padding: 4,
      gap: 4,
    },
    modeToggleOption: {
      flex: 1,
      minHeight: 42,
      borderRadius: radii.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    modeToggleOptionSelected: {
      backgroundColor: colors.primary,
    },
    modeToggleOptionPressed: {
      backgroundColor: colors.surface,
    },
    modeToggleText: {
      ...textStyles.buttonSmall,
      color: colors.text,
      textAlign: 'center',
    },
    modeToggleTextSelected: {
      color: colors.primaryTextOn,
    },
    formBlock: {
      gap: spacing.md,
    },
    promptInput: {
      width: '100%',
      minHeight: 76,
      ...textStyles.inputLarge,
      backgroundColor: colors.bg,
      borderRadius: radii.md,
      padding: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 10 },
      shadowRadius: 20,
      shadowOpacity: 0.12,
      elevation: 8,
    },
    inputMaxed: { color: colors.danger },
    createAction: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 0,
    },
    createText: {
      ...textStyles.accentAction,
      color: colors.primary,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    searchButton: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      height: 44,
      borderRadius: 16,
      paddingVertical: 0,
    },
    questResults: {
      gap: spacing.xs,
      minHeight: 120,
    },
    centeredState: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    stateText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
    },
    questRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
      paddingHorizontal: 0,
    },
    questRowSelected: {
      opacity: 1,
    },
    questRowPressed: {
      opacity: 0.7,
    },
    questThumb: {
      width: 52,
      height: 52,
      borderRadius: radii.sm,
      overflow: 'hidden',
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    questThumbImage: {
      width: '100%',
      height: '100%',
    },
    questPrompt: {
      flex: 1,
      ...textStyles.bodyStrong,
      color: colors.text,
      lineHeight: 22,
    },
  });
}
