import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

const OUTLINE_SIZE = 52;
const SHELL_SIZE = 48;
const CENTER_FILL_SIZE = 18;
const CENTER_FILL_TOP = 8;
const GLYPH_SIZE = 18;
const GLYPH_TOP = 11;
const BADGE_ANIMATION_MS = 200;
const DEFAULT_THEME = Object.freeze({
  outlineColor: '#FFFFFF',
  shellColor: '#FF6B35',
  glyphName: 'lock',
  glyphColor: '#FFFFFF',
  badgeColor: '#FFFFFF',
  badgeBorderColor: '#FF6B35',
});

export default function QuestMapPin({ theme = DEFAULT_THEME, badgeCount = 0 }) {
  const shouldShowBadge = Number.isFinite(badgeCount) && badgeCount > 1;
  const [displayedBadgeCount, setDisplayedBadgeCount] = useState(shouldShowBadge ? badgeCount : 0);
  const previousBadgeCountRef = useRef(shouldShowBadge ? badgeCount : 0);
  const badgeContainerOpacity = useRef(new Animated.Value(shouldShowBadge ? 1 : 0)).current;
  const badgeTextOpacity = useRef(new Animated.Value(shouldShowBadge ? 1 : 0)).current;
  const badgeTextScale = useRef(new Animated.Value(shouldShowBadge ? 1 : 0.82)).current;

  useEffect(() => {
    const previousBadgeCount = previousBadgeCountRef.current;
    previousBadgeCountRef.current = shouldShowBadge ? badgeCount : 0;

    badgeContainerOpacity.stopAnimation();
    badgeTextOpacity.stopAnimation();
    badgeTextScale.stopAnimation();

    if (!shouldShowBadge) {
      Animated.parallel([
        Animated.timing(badgeContainerOpacity, {
          toValue: 0,
          duration: BADGE_ANIMATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(badgeTextOpacity, {
          toValue: 0,
          duration: BADGE_ANIMATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(badgeTextScale, {
          toValue: 0.82,
          duration: BADGE_ANIMATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) {
          setDisplayedBadgeCount(0);
        }
      });
      return;
    }

    setDisplayedBadgeCount(badgeCount);

    if (previousBadgeCount <= 1) {
      badgeContainerOpacity.setValue(1);
      badgeTextOpacity.setValue(0);
      badgeTextScale.setValue(0.82);
      Animated.parallel([
        Animated.timing(badgeTextOpacity, {
          toValue: 1,
          duration: BADGE_ANIMATION_MS,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(badgeTextScale, {
          toValue: 1,
          duration: BADGE_ANIMATION_MS,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    badgeContainerOpacity.setValue(1);
    badgeTextOpacity.setValue(1);
    badgeTextScale.setValue(0.92);
    Animated.timing(badgeTextScale, {
      toValue: 1,
      duration: BADGE_ANIMATION_MS,
      easing: Easing.out(Easing.back(1.2)),
      useNativeDriver: true,
    }).start();
  }, [badgeContainerOpacity, badgeCount, badgeTextOpacity, badgeTextScale, shouldShowBadge]);

  return (
    <View
      style={styles.root}
      pointerEvents="none"
      collapsable={false}
    >
      <MaterialIcons
        name="place"
        size={OUTLINE_SIZE}
        color={theme.outlineColor}
        style={styles.outline}
      />
      <MaterialIcons
        name="place"
        size={SHELL_SIZE}
        color={theme.shellColor}
        style={styles.shell}
      />
      <View
        style={[
          styles.centerFill,
          {
            top: CENTER_FILL_TOP,
            width: CENTER_FILL_SIZE,
            height: CENTER_FILL_SIZE,
            borderRadius: CENTER_FILL_SIZE / 2,
            backgroundColor: theme.shellColor,
          },
        ]}
      />
      <MaterialIcons
        name={theme.glyphName}
        size={GLYPH_SIZE}
        color={theme.glyphColor}
        style={styles.glyph}
      />
      {displayedBadgeCount > 1 ? (
        <Animated.View
          style={[
            styles.badge,
            {
              backgroundColor: theme.badgeColor,
              borderColor: theme.badgeBorderColor,
              opacity: badgeContainerOpacity,
            },
          ]}
        >
          <Animated.Text
            style={[
              styles.badgeText,
              {
                color: theme.badgeBorderColor,
                opacity: badgeTextOpacity,
                transform: [{ scale: badgeTextScale }],
              },
            ]}
          >
            {displayedBadgeCount}
          </Animated.Text>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: 52,
    height: 54,
    alignItems: 'center',
    justifyContent: 'flex-start',
    overflow: 'visible',
  },
  outline: {
    position: 'absolute',
    top: 0,
  },
  shell: {
    position: 'absolute',
    top: 2,
    textShadowColor: 'rgba(0,0,0,0.16)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  centerFill: {
    position: 'absolute',
  },
  glyph: {
    position: 'absolute',
    top: GLYPH_TOP,
  },
  badge: {
    position: 'absolute',
    top: 1,
    right: 0,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
