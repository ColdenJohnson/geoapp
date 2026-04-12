import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { usePalette } from '@/hooks/usePalette';
import { textStyles } from '@/theme/typography';

export const PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE = {
  width: 236,
  height: 254,
};

export function getPressHoldActionMenuPosition({
  anchorX,
  anchorY,
  menuSize = PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE,
  windowWidth,
  windowHeight,
  topInset = 0,
  bottomInset = 0,
  margin = 20,
}) {
  const width = Math.max(1, menuSize?.width || PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE.width);
  const height = Math.max(1, menuSize?.height || PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE.height);
  const minTop = topInset + margin;
  const maxLeft = Math.max(margin, windowWidth - width - margin);
  const maxTop = Math.max(minTop, windowHeight - bottomInset - height - margin);

  return {
    left: Math.min(maxLeft, Math.max(margin, anchorX - width / 2)),
    top: Math.min(maxTop, Math.max(minTop, anchorY - height + 26)),
  };
}

export function getPressHoldActionMenuOptionAtPoint({
  optionLayouts,
  pointX,
  pointY,
}) {
  if (!optionLayouts || !Number.isFinite(pointX) || !Number.isFinite(pointY)) {
    return null;
  }

  for (const [optionId, layout] of Object.entries(optionLayouts)) {
    if (!layout) continue;
    const left = layout.x;
    const right = left + layout.width;
    const top = layout.y;
    const bottom = top + layout.height;

    if (pointX >= left && pointX <= right && pointY >= top && pointY <= bottom) {
      return optionId;
    }
  }

  return null;
}

export function PressHoldActionMenu({
  activeOptionId = null,
  menuSize = PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE,
  onMenuLayout,
  onOptionLayout,
  onOptionPress,
  onRequestClose,
  position,
  sections = [],
  subtitle = null,
  title = '',
  titleLabel = 'Options',
  visible = false,
}) {
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const layoutVersion = useMemo(
    () => `${Math.round(position?.left || 0)}:${Math.round(position?.top || 0)}:${Math.round(menuSize?.width || 0)}:${Math.round(menuSize?.height || 0)}`,
    [menuSize?.height, menuSize?.width, position?.left, position?.top]
  );

  if (!visible || !position) {
    return null;
  }

  return (
    <View style={styles.modalRoot} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onRequestClose} />
      <View pointerEvents="box-none" style={styles.overlayLayer}>
        <View
          style={[
            styles.menu,
            {
              left: position.left,
              top: position.top,
              width: menuSize?.width || PRESS_HOLD_ACTION_MENU_DEFAULT_SIZE.width,
            },
          ]}
          onLayout={(event) => {
            onMenuLayout?.(event.nativeEvent.layout);
          }}
        >
          <View style={styles.header}>
            <Text style={styles.titleLabel}>{titleLabel}</Text>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>

          {sections.map((section, sectionIndex) => {
            const isRow = section?.layout === 'row';
            const options = Array.isArray(section?.options) ? section.options : [];

            return (
              <View
                key={section?.id || `${sectionIndex}`}
                style={[
                  styles.section,
                  sectionIndex > 0 ? styles.sectionDivider : null,
                ]}
              >
                {isRow ? (
                  <View style={styles.quickRow}>
                    {options.map((option) => {
                      return (
                        <MenuOptionButton
                          key={option.id}
                          isActive={activeOptionId === option.id}
                          option={option}
                          onOptionLayout={onOptionLayout}
                          onOptionPress={onOptionPress}
                          styles={styles}
                          layoutVersion={layoutVersion}
                          variant="quick"
                        >
                          <View
                            style={[
                              styles.quickIconShell,
                              option?.iconBackgroundColor
                                ? { backgroundColor: option.iconBackgroundColor }
                                : null,
                            ]}
                          >
                            <MaterialIcons
                              name={option.iconName}
                              size={18}
                              color={option.iconColor || colors.primary}
                            />
                          </View>
                          <Text
                            style={[
                              styles.quickLabel,
                              option?.textColor ? { color: option.textColor } : null,
                            ]}
                          >
                            {option.label}
                          </Text>
                        </MenuOptionButton>
                      );
                    })}
                  </View>
                ) : (
                  options.map((option) => {
                    return (
                      <MenuOptionButton
                        key={option.id}
                        isActive={activeOptionId === option.id}
                        option={option}
                        onOptionLayout={onOptionLayout}
                        onOptionPress={onOptionPress}
                        styles={styles}
                        layoutVersion={layoutVersion}
                        variant="list"
                      >
                        <View
                          style={[
                            styles.listIconShell,
                            option?.iconBackgroundColor
                              ? { backgroundColor: option.iconBackgroundColor }
                              : null,
                          ]}
                        >
                          <MaterialIcons
                            name={option.iconName}
                            size={18}
                            color={option.iconColor || colors.primary}
                          />
                        </View>
                        <Text
                          style={[
                            styles.listLabel,
                            option?.textColor ? { color: option.textColor } : null,
                          ]}
                        >
                          {option.label}
                        </Text>
                      </MenuOptionButton>
                    );
                  })
                )}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function MenuOptionButton({
  children,
  isActive,
  onOptionLayout,
  onOptionPress,
  option,
  styles,
  layoutVersion,
  variant,
}) {
  const viewRef = useRef(null);

  const reportLayout = useCallback(() => {
    requestAnimationFrame(() => {
      viewRef.current?.measureInWindow((x, y, width, height) => {
        onOptionLayout?.(option.id, { x, y, width, height });
      });
    });
  }, [onOptionLayout, option.id]);

  useEffect(() => {
    reportLayout();
  }, [layoutVersion, reportLayout]);

  return (
    <Pressable
      onPress={() => onOptionPress?.(option)}
      disabled={option?.disabled}
    >
      {({ pressed }) => (
        <View
          ref={viewRef}
          collapsable={false}
          onLayout={reportLayout}
          style={[
            variant === 'quick' ? styles.quickAction : styles.listAction,
            (pressed || isActive) ? styles.optionActive : null,
            option?.disabled ? styles.optionDisabled : null,
          ]}
        >
          {children}
        </View>
      )}
    </Pressable>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    modalRoot: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 120,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
    },
    overlayLayer: {
      ...StyleSheet.absoluteFillObject,
    },
    menu: {
      position: 'absolute',
      borderRadius: 30,
      backgroundColor: colors.bg,
      borderWidth: 1,
      borderColor: 'rgba(15, 23, 42, 0.06)',
      overflow: 'hidden',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 18 },
      shadowOpacity: 0.16,
      shadowRadius: 26,
      elevation: 18,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 12,
    },
    titleLabel: {
      marginBottom: 3,
      ...textStyles.eyebrowTight,
      color: colors.textMuted,
    },
    title: {
      ...textStyles.titleStrong,
      color: colors.text,
    },
    subtitle: {
      marginTop: 4,
      ...textStyles.body2xsBold,
      color: colors.textMuted,
    },
    section: {
      paddingHorizontal: 8,
      paddingBottom: 8,
      gap: 4,
    },
    sectionDivider: {
      borderTopWidth: 1,
      borderTopColor: 'rgba(15, 23, 42, 0.06)',
      paddingTop: 8,
    },
    quickRow: {
      flexDirection: 'row',
      gap: 8,
    },
    quickAction: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 20,
      paddingHorizontal: 10,
      paddingVertical: 12,
      gap: 8,
    },
    quickIconShell: {
      width: 38,
      height: 38,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,107,53,0.12)',
    },
    quickLabel: {
      ...textStyles.chipSmall,
      color: colors.text,
    },
    listAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    listIconShell: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,107,53,0.12)',
    },
    listLabel: {
      flex: 1,
      ...textStyles.bodySmallBold,
      color: colors.text,
    },
    optionActive: {
      backgroundColor: 'rgba(26, 26, 26, 0.08)',
    },
    optionDisabled: {
      opacity: 0.55,
    },
  });
}
