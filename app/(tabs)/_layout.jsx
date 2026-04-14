import { Tabs } from 'expo-router';
import React, { useContext, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { AuthContext } from '@/hooks/AuthContext';
import { useColorScheme } from '@/hooks/useColorScheme';
import { usePalette } from '@/hooks/usePalette';
import { Colors } from '@/theme/Colors';
import { textStyles } from '@/theme/typography';

export const unstable_settings = {
  initialRouteName: 'active_challenges',
};

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const colors = usePalette();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { hasUnseenFriendActivity } = useContext(AuthContext);

  return (
    <Tabs
      initialRouteName="active_challenges"
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarLabelStyle: {
          ...textStyles.tabLabel,
        },
        tabBarItemStyle: {
          paddingTop: 2,
        },
        tabBarStyle: Platform.select({
          ios: {
            // Use a transparent background on iOS to show the blur effect
            position: 'absolute',
            height: 82,
            marginHorizontal: 14,
            marginBottom: 12,
            borderTopWidth: 0,
            borderRadius: 24,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOpacity: 0.1,
            shadowOffset: { width: 0, height: 8 },
            shadowRadius: 20,
          },
          default: {
            height: 70,
            borderTopWidth: 1,
            borderTopColor: colors.barBorder,
            backgroundColor: colors.surface,
            paddingBottom: 8,
          },
        }),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          href: null,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={28} name={focused ? "globe.americas" : "globe.americas.fill"} color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="active_challenges"
        options={{
          title: 'Quests',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={28} name={focused ? "flame" : "flame.fill"} color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="vote"
        options={{
          title: 'Vote',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={28} name={focused ? "trophy" : "trophy.fill"} color={color} />,
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="friends_tab"
        options={{
          title: 'Friends',
          tabBarIcon: ({ color, focused }) => (
            <View style={styles.tabIconWrap}>
              <IconSymbol size={28} name={focused ? "person.2" : "person.2.fill"} color={color} />
              {hasUnseenFriendActivity && !focused ? (
                <View pointerEvents="none" style={styles.tabHintDot} testID="friends-tab-dot" />
              ) : null}
            </View>
          ),
          headerShown: false,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={28} name={focused ? "person.circle": "person.circle.fill"} color={color} />,
          headerShown: false,
        }}
      />
    </Tabs>
  );
}

function createStyles(colors) {
  return StyleSheet.create({
    tabIconWrap: {
      position: 'relative',
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabHintDot: {
      position: 'absolute',
      top: 2,
      right: -1,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
  });
}
