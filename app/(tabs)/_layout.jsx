import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, useColorScheme } from 'react-native';

import { HapticTab } from '@/components/HapticTab';
import { IconSymbol } from '@/components/ui/IconSymbol';
import TabBarBackground from '@/components/ui/TabBarBackground';
import { Colors } from '@/theme/Colors';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        tabBarInactiveTintColor: Colors[colorScheme ?? 'light'].tabIconDefault,
        headerShown: true,
        tabBarButton: HapticTab,
        tabBarBackground: TabBarBackground,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.5,
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
            borderTopColor: '#EFDCCE',
            paddingBottom: 8,
          },
        }),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          tabBarIcon: ({ color, focused }) => <IconSymbol size={28} name={focused ? "house" : "house.fill"} color={color} />,
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
          tabBarIcon: ({ color, focused }) => <IconSymbol size={28} name={focused ? "person.2" : "person.2.fill"} color={color} />,
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
