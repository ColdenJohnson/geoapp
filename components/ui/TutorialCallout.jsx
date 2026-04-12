import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { usePalette } from '@/hooks/usePalette';
import { radii, spacing } from '@/theme/tokens';
import { textStyles } from '@/theme/typography';

export function TutorialCallout({
  title,
  body,
  style,
  bubbleStyle,
  maxWidth,
  arrowPlacement = 'bottom',
  arrowSide = 'left',
  arrowOffset = 24,
  arrowStyle,
  testID,
}) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const resolvedArrowOffsetStyle = arrowSide === 'right'
    ? { marginRight: arrowOffset }
    : arrowSide === 'center'
      ? { alignSelf: 'center' }
      : { marginLeft: arrowOffset };

  return (
    <View pointerEvents="none" style={style} testID={testID}>
      {arrowPlacement === 'top' ? (
        <View style={[styles.arrowTop, resolvedArrowOffsetStyle, arrowStyle]} />
      ) : null}
      <View style={[styles.bubble, maxWidth ? { maxWidth } : null, bubbleStyle]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.body}>{body}</Text>
      </View>
      {arrowPlacement === 'bottom' ? (
        <View style={[styles.arrowBottom, resolvedArrowOffsetStyle, arrowStyle]} />
      ) : null}
    </View>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    bubble: {
      backgroundColor: colors.primary,
      borderRadius: radii.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 8 },
      shadowRadius: 18,
      shadowOpacity: 0.18,
      elevation: 8,
    },
    title: {
      ...textStyles.bodySmallBold,
      color: colors.primaryTextOn,
      marginBottom: 2,
    },
    body: {
      ...textStyles.body2xsBold,
      color: colors.primaryTextOn,
      lineHeight: 16,
    },
    arrowBottom: {
      width: 16,
      height: 16,
      marginTop: -8,
      backgroundColor: colors.primary,
      transform: [{ rotate: '45deg' }],
    },
    arrowTop: {
      width: 16,
      height: 16,
      marginBottom: -8,
      backgroundColor: colors.primary,
      transform: [{ rotate: '45deg' }],
    },
  });
}
