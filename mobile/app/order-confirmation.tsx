import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Text, View } from 'react-native';
import { Button, Screen, colors } from '@/ui';

export default function OrderConfirmation() {
  const { order_number, total } = useLocalSearchParams<{ order_number: string; total: string }>();
  return <Screen><View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10 }}>
    <Text style={{ fontSize: 56, color: colors.gold }}>✓</Text>
    <Text style={{ color: colors.green, fontSize: 29, fontWeight: '900', marginTop: 12 }}>Order placed!</Text>
    <Text style={{ color: colors.ink, fontSize: 16, marginTop: 10, textAlign: 'center' }}>Thank you for shopping with திகழ் Drifts.</Text>
    <Text style={{ color: colors.green, fontWeight: '800', fontSize: 18, marginTop: 18 }}>{order_number}</Text>
    <Text style={{ color: colors.muted, marginTop: 6 }}>Total · ₹{Number(total).toLocaleString('en-IN')}</Text>
    <View style={{ width: '100%', marginTop: 22 }}>
      <Button title="Track this order" onPress={() => router.push('/track-order')} />
      <Button title="Continue shopping" secondary onPress={() => router.replace('/(tabs)')} />
    </View>
  </View></Screen>;
}
