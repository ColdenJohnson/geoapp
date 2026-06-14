import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  RefreshControl,
  SafeAreaView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useRouter } from 'expo-router';

import { AuthContext } from '@/hooks/AuthContext';
import { usePalette } from '@/hooks/usePalette';
import { fetchUserGallery } from '@/lib/api';
import { buildViewPhotoChallengeRoute } from '@/lib/navigation';
import { spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

const COLUMNS = 4;
const TILE_GAP = 2;
const TILE_SIZE = Math.floor((Dimensions.get('window').width - TILE_GAP * (COLUMNS - 1)) / COLUMNS);

function photoDateKey(createdAt) {
  const d = new Date(createdAt);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatSectionTitle(dateKey, lastYear) {
  const [yearStr, monthStr, dayStr] = dateKey.split('-');
  const year = Number(yearStr);
  const date = new Date(year, Number(monthStr) - 1, Number(dayStr));
  const month = date.toLocaleString('en-US', { month: 'short' });
  const day = date.getDate();
  return year !== lastYear ? `${month} ${day}, ${year}` : `${month} ${day}`;
}

function groupIntoSections(photos) {
  const dayMap = new Map();
  for (const photo of photos) {
    const key = photoDateKey(photo.createdAt);
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key).push(photo);
  }
  const sections = [];
  let lastYear = null;
  for (const [dateKey, dayPhotos] of dayMap) {
    const year = Number(dateKey.split('-')[0]);
    const title = formatSectionTitle(dateKey, lastYear);
    lastYear = year;
    const rows = [];
    for (let i = 0; i < dayPhotos.length; i += COLUMNS) {
      rows.push(dayPhotos.slice(i, i + COLUMNS));
    }
    sections.push({ title, data: rows });
  }
  return sections;
}

const RowSeparator = () => <View style={{ height: TILE_GAP }} />;

export default function GalleryScreen() {
  const { user } = useContext(AuthContext);
  const router = useRouter();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const allPhotosRef = useRef([]);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (cursor, replace) => {
    if (!user?.uid) return;
    const result = await fetchUserGallery(user.uid, { cursor });
    const incoming = result?.photos ?? [];
    const merged = replace ? incoming : [...allPhotosRef.current, ...incoming];
    allPhotosRef.current = merged;
    setSections(groupIntoSections(merged));
    setNextCursor(result?.nextCursor ?? null);
  }, [user?.uid]);

  useEffect(() => {
    setLoading(true);
    load(null, true).finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    allPhotosRef.current = [];
    await load(null, true);
    setRefreshing(false);
  }, [load]);

  const onEndReached = useCallback(async () => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    await load(nextCursor, false);
    loadingMoreRef.current = false;
    setLoadingMore(false);
  }, [nextCursor, load]);

  const onPressPhoto = useCallback((photo) => {
    if (!photo?.pin_id) return;
    router.push(buildViewPhotoChallengeRoute({ pinId: String(photo.pin_id) }));
  }, [router]);

  const renderItem = useCallback(({ item: row }) => (
    <View style={styles.row}>
      {row.map((photo) => (
        <Pressable key={String(photo._id)} onPress={() => onPressPhoto(photo)}>
          <Image
            source={{ uri: photo.file_url }}
            style={styles.tile}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        </Pressable>
      ))}
      {row.length < COLUMNS
        ? Array.from({ length: COLUMNS - row.length }, (_, i) => (
            <View key={`pad-${i}`} style={styles.tile} />
          ))
        : null}
    </View>
  ), [onPressPhoto, styles]);

  const renderSectionHeader = useCallback(({ section }) => (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  ), [styles]);

  const onBack = useCallback(() => router.back(), [router]);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.headerBack} hitSlop={8}>
        <MaterialIcons name="arrow-back-ios" size={20} color={colors.text} />
      </Pressable>
      <Text style={styles.headerTitle}>Gallery</Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {header}
      <SectionList
        sections={sections}
        keyExtractor={(row, index) => `${index}-${row[0]?._id ?? index}`}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        ItemSeparatorComponent={RowSeparator}
        stickySectionHeadersEnabled
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        contentContainerStyle={sections.length === 0 ? styles.emptyContent : null}
        ListEmptyComponent={
          <View style={styles.centered}>
            <Text style={styles.emptyText}>No photos yet — start capturing!</Text>
          </View>
        }
        ListFooterComponent={
          loadingMore
            ? <ActivityIndicator size="small" color={colors.primary} style={styles.footer} />
            : null
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      />
    </SafeAreaView>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerBack: {
      marginRight: spacing.sm,
      padding: spacing.xs,
    },
    headerTitle: {
      ...textStyles.pageTitleCompact,
      color: colors.primary,
    },
    centered: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: spacing['2xl'],
    },
    emptyContent: {
      flex: 1,
    },
    sectionHeader: {
      backgroundColor: colors.surface,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    sectionHeaderText: {
      ...textStyles.bodySmallStrong,
      color: colors.textMuted,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    row: {
      flexDirection: 'row',
      gap: TILE_GAP,
    },
    tile: {
      width: TILE_SIZE,
      height: TILE_SIZE,
      backgroundColor: colors.surface,
    },
    emptyText: {
      ...textStyles.body,
      color: colors.textMuted,
      textAlign: 'center',
    },
    footer: {
      paddingVertical: spacing.lg,
    },
  });
}
