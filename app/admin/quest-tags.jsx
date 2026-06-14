import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  PanResponder,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { CTAButton } from '@/components/ui/Buttons';
import { fetchAdminQuests, updateAdminQuestTags } from '@/lib/api';
import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';
import { spacing, radii } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const ADMIN_UIDS = String(process.env.EXPO_PUBLIC_ADMIN_UIDS || process.env.EXPO_PUBLIC_ADMIN_UID || '')
  .split(',')
  .map((uid) => uid.trim())
  .filter(Boolean);

const QUEST_TAGS = [
  { id: 'common', label: 'Popular' },
  { id: 'crazy', label: 'Crazy' },
  { id: 'social', label: 'Social' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'nature', label: 'Nature' },
  { id: 'food', label: 'Food' },
  { id: 'travel', label: 'Travel' },
  { id: 'misc', label: 'Misc' },
];

const QUEST_TAG_LABELS = QUEST_TAGS.reduce((labels, tag) => {
  labels[tag.id] = tag.label;
  return labels;
}, {});

function isAdminUid(uid) {
  return !!uid && ADMIN_UIDS.includes(uid);
}

function normalizeQuestTags(tags) {
  if (!Array.isArray(tags)) return [];
  const validTags = new Set(QUEST_TAGS.map((tag) => tag.id));
  const seen = new Set();
  return tags
    .map((tag) => (typeof tag === 'string' ? tag.trim().toLowerCase() : ''))
    .filter((tag) => {
      if (!tag || !validTags.has(tag) || seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

function getQuestImage(quest) {
  return quest?.top_global_photo?.file_url || quest?.most_recent_photo_url || null;
}

export default function AdminQuestTagsScreen() {
  const router = useRouter();
  const { user } = useContext(AuthContext);
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [quests, setQuests] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [untaggedOnly, setUntaggedOnly] = useState(false);
  const [editorVisible, setEditorVisible] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const isAdmin = isAdminUid(user?.uid);
  const visibleQuests = useMemo(() => (
    untaggedOnly
      ? quests.filter((quest) => normalizeQuestTags(quest?.tags).length === 0)
      : quests
  ), [quests, untaggedOnly]);
  const currentQuest = visibleQuests[currentIndex] || null;
  const currentQuestTags = useMemo(() => normalizeQuestTags(currentQuest?.tags), [currentQuest?.tags]);
  const currentImage = getQuestImage(currentQuest);
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < visibleQuests.length - 1;
  const currentPositionLabel = visibleQuests.length ? `${currentIndex + 1} / ${visibleQuests.length}` : '0 / 0';

  const goPrevious = useCallback(() => {
    setCurrentIndex((index) => Math.max(0, index - 1));
  }, []);

  const goNext = useCallback(() => {
    setCurrentIndex((index) => Math.min(Math.max(visibleQuests.length - 1, 0), index + 1));
  }, [visibleQuests.length]);

  const panResponder = useRef(null);
  panResponder.current = PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      Math.abs(gesture.dx) > 18 && Math.abs(gesture.dx) > Math.abs(gesture.dy)
    ),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx <= -50) {
        goNext();
      } else if (gesture.dx >= 50) {
        goPrevious();
      }
    },
  });

  const loadQuests = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setStatusMessage('');
    const items = await fetchAdminQuests();
    setQuests(items);
    setCurrentIndex(0);
    setEditorVisible(false);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    loadQuests();
  }, [loadQuests]);

  useEffect(() => {
    if (currentIndex > Math.max(visibleQuests.length - 1, 0)) {
      setCurrentIndex(Math.max(visibleQuests.length - 1, 0));
    }
  }, [currentIndex, visibleQuests.length]);

  useEffect(() => {
    setSelectedTags(currentQuestTags);
    setEditorVisible(false);
    setStatusMessage('');
  }, [currentQuest?._id, currentQuestTags]);

  const toggleTag = useCallback((tagId) => {
    setSelectedTags((tags) => (
      tags.includes(tagId)
        ? tags.filter((tag) => tag !== tagId)
        : [...tags, tagId]
    ));
  }, []);

  const handleSave = useCallback(async () => {
    if (!currentQuest?._id) return;
    setSaving(true);
    setStatusMessage('');
    const result = await updateAdminQuestTags(String(currentQuest._id), selectedTags);
    setSaving(false);
    setStatusMessage(result.success ? 'Saved.' : result.error || 'Failed to save.');
  }, [currentQuest?._id, selectedTags]);

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.centeredState}>
          <MaterialIcons name="lock" size={36} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Admin access required</Text>
          <CTAButton title="Back" onPress={() => router.back()} style={styles.stateButton} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable onPress={() => router.back()} style={styles.iconButton} accessibilityLabel="Back">
            <MaterialIcons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>Quest Tags</Text>
            <Text style={styles.subtitle}>{currentPositionLabel}</Text>
          </View>
          <Pressable onPress={loadQuests} style={styles.iconButton} accessibilityLabel="Refresh admin quests">
            <MaterialIcons name="refresh" size={22} color={colors.text} />
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          <Text style={styles.filterLabel}>Untagged only</Text>
          <Switch
            value={untaggedOnly}
            onValueChange={(value) => {
              setUntaggedOnly(value);
              setCurrentIndex(0);
            }}
            trackColor={{ false: colors.border, true: colors.primary }}
            thumbColor={colors.bg}
          />
        </View>

        {loading ? (
          <View style={styles.centeredState}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.stateText}>Loading quests...</Text>
          </View>
        ) : !currentQuest ? (
          <View style={styles.centeredState}>
            <MaterialIcons name="explore-off" size={36} color={colors.textMuted} />
            <Text style={styles.stateText}>No quests found.</Text>
          </View>
        ) : (
          <>
            <Pressable
              onPress={() => setEditorVisible(true)}
              style={styles.card}
              {...(panResponder.current?.panHandlers || {})}
            >
              {currentImage ? (
                <ImageBackground source={{ uri: currentImage }} style={styles.cardImage} imageStyle={styles.cardImageRadius}>
                  <View style={styles.cardDim} />
                  <QuestCardContent quest={currentQuest} styles={styles} />
                </ImageBackground>
              ) : (
                <View style={[styles.cardImage, styles.cardFallback]}>
                  <MaterialIcons name="image" size={44} color="rgba(255,255,255,0.76)" />
                  <QuestCardContent quest={currentQuest} styles={styles} />
                </View>
              )}
            </Pressable>

            <View style={styles.navRow}>
              <CTAButton title="Previous" onPress={goPrevious} disabled={!canGoPrevious} style={styles.navButton} />
              <CTAButton title="Next" onPress={goNext} disabled={!canGoNext} style={styles.navButton} />
            </View>

            {editorVisible ? (
              <View style={styles.editor}>
                <Text style={styles.editorTitle}>Tags</Text>
                <View style={styles.tagGrid}>
                  {QUEST_TAGS.map((tag) => {
                    const selected = selectedTags.includes(tag.id);
                    return (
                      <Pressable
                        key={tag.id}
                        onPress={() => toggleTag(tag.id)}
                        style={({ pressed }) => [
                          styles.tagChip,
                          selected && styles.tagChipSelected,
                          pressed && styles.pressed,
                        ]}
                      >
                        <Text style={[styles.tagText, selected && styles.tagTextSelected]}>{tag.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                <CTAButton
                  title={saving ? 'Saving...' : 'Save'}
                  onPress={handleSave}
                  loading={saving}
                  variant="filled"
                  style={styles.saveButton}
                />
                {statusMessage ? <Text style={styles.statusText}>{statusMessage}</Text> : null}
              </View>
            ) : (
              <Text style={styles.helperText}>Tap the card to edit tags. Swipe or use buttons to move through quests.</Text>
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function QuestCardContent({ quest, styles }) {
  const tags = normalizeQuestTags(quest?.tags);
  return (
    <View style={styles.cardContent}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cardTagList}>
        {tags.length ? tags.map((tag) => (
          <View key={tag} style={styles.cardTagChip}>
            <Text style={styles.cardTagText}>{QUEST_TAG_LABELS[tag] || tag}</Text>
          </View>
        )) : (
          <View style={styles.cardTagChip}>
            <Text style={styles.cardTagText}>Untagged</Text>
          </View>
        )}
      </ScrollView>
      <Text style={styles.promptText} numberOfLines={5}>"{quest?.message || 'Untitled quest'}"</Text>
      <View style={styles.metaRow}>
        <View style={styles.photoCountChip}>
          <MaterialIcons name="photo-library" size={13} color="#FFFFFF" />
          <Text style={styles.photoCountText}>{Number.isFinite(quest?.photo_count) ? quest.photo_count : 0}</Text>
        </View>
      </View>
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    container: {
      flex: 1,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.lg,
      backgroundColor: colors.surface,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    iconButton: {
      width: 44,
      height: 44,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleBlock: {
      flex: 1,
      minWidth: 0,
    },
    title: {
      ...textStyles.heading,
      color: colors.text,
    },
    subtitle: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
    },
    filterRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
      paddingHorizontal: spacing.sm,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    filterLabel: {
      ...textStyles.bodySmallBold,
      color: colors.text,
    },
    centeredState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    stateTitle: {
      ...textStyles.heading,
      color: colors.text,
    },
    stateText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
    },
    stateButton: {
      minWidth: 120,
    },
    card: {
      flex: 1,
      minHeight: 320,
      maxHeight: 560,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: colors.primary_darkened || colors.primary,
    },
    cardImage: {
      flex: 1,
      justifyContent: 'space-between',
    },
    cardImageRadius: {
      borderRadius: 18,
    },
    cardFallback: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardDim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.26)',
    },
    cardContent: {
      flex: 1,
      justifyContent: 'space-between',
      padding: spacing.md,
    },
    cardTagList: {
      alignItems: 'center',
      gap: spacing.xs,
      paddingRight: spacing.md,
    },
    cardTagChip: {
      alignSelf: 'flex-start',
      borderRadius: radii.pill,
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.22)',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    cardTagText: {
      ...textStyles.eyebrow,
      color: colors.primary,
      textTransform: 'uppercase',
      letterSpacing: 1.1,
    },
    promptText: {
      ...textStyles.heading,
      color: '#FFFFFF',
      lineHeight: 28,
    },
    metaRow: {
      alignItems: 'flex-end',
    },
    photoCountChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      borderRadius: radii.pill,
      backgroundColor: 'rgba(0,0,0,0.25)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    photoCountText: {
      ...textStyles.chip,
      color: '#FFFFFF',
    },
    navRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    navButton: {
      flex: 1,
      minHeight: 46,
    },
    editor: {
      marginTop: spacing.md,
      padding: spacing.md,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bg,
    },
    editorTitle: {
      ...textStyles.bodySmallBold,
      color: colors.text,
      marginBottom: spacing.sm,
    },
    tagGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs,
    },
    tagChip: {
      minHeight: 34,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tagChipSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    tagText: {
      ...textStyles.buttonSmall,
      color: colors.primary,
    },
    tagTextSelected: {
      color: colors.primaryTextOn || '#FFFFFF',
    },
    saveButton: {
      marginTop: spacing.md,
      minHeight: 46,
    },
    statusText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      marginTop: spacing.sm,
      textAlign: 'center',
    },
    helperText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      textAlign: 'center',
      marginTop: spacing.md,
    },
    pressed: {
      opacity: 0.78,
    },
  });
}
