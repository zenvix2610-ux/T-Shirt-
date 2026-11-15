import { Tabs } from 'expo-router';
import React from 'react';
import { colors } from '@/ui';

export default function TabLayout() {
  return <Tabs screenOptions={{
    headerStyle: { backgroundColor: colors.green },
    headerTintColor: colors.white,
    headerTitleStyle: { fontWeight: '800' },
    tabBarActiveTintColor: colors.gold,
    tabBarInactiveTintColor: '#aab8b1',
    tabBarStyle: { backgroundColor: colors.green, borderTopColor: colors.green, height: 62, paddingBottom: 7, paddingTop: 5 },
    sceneStyle: { backgroundColor: colors.paper },
  }}>
    <Tabs.Screen name="index" options={{ title: 'திகழ் Drifts', tabBarLabel: 'Home', headerShown: false }} />
    <Tabs.Screen name="shop" options={{ title: 'Shop', tabBarLabel: 'Shop' }} />
    <Tabs.Screen name="cart" options={{ title: 'Your bag', tabBarLabel: 'Bag' }} />
    <Tabs.Screen name="account" options={{ title: 'Your account', tabBarLabel: 'Account' }} />
  </Tabs>;
}
