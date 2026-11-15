import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Button, Screen, colors } from '@/ui';

export default function Onboarding() {
  return <Screen>
    <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 10 }}>
      <Text style={{ color: colors.gold, fontSize: 17, fontWeight: '800', letterSpacing: 3 }}>THIGAZH DRIFTS</Text>
      <Text style={{ color: colors.green, fontSize: 42, fontWeight: '900', lineHeight: 50, marginTop: 18 }}>Wear what{'\n'}makes you{'\n'}different.</Text>
      <Text style={{ color: colors.muted, fontSize: 17, lineHeight: 26, marginTop: 18 }}>Custom prints, everyday essentials and thoughtfully made T-shirts — designed with you in Tamil Nadu.</Text>
      <Button title="Explore the collection" onPress={() => {
        AsyncStorage.setItem('onboarding_complete', 'true').then(() => router.replace('/(tabs)'));
      }} />
    </View>
  </Screen>;
}
