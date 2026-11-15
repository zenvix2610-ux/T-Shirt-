import { router } from 'expo-router';
import * as Linking from 'expo-linking';
import React from 'react';
import { Alert, Text, View } from 'react-native';
import { Button, Screen, Title, colors, ui } from '@/ui';

const supportNumber = '919600311386';

async function openWhatsApp(message: string) {
  const url = `https://wa.me/${supportNumber}?text=${encodeURIComponent(message)}`;
  if (await Linking.canOpenURL(url)) await Linking.openURL(url);
  else Alert.alert('WhatsApp unavailable', 'You can reach us at +91 96003 11386.');
}

export default function Support() {
  return <Screen>
    <Title subtitle="We’re happy to help with products, custom orders or delivery.">Talk to our team</Title>
    <View style={[ui.card, { marginTop: 8 }]}>
      <Text style={{ color: colors.green, fontSize: 19, fontWeight: '900' }}>WhatsApp support</Text>
      <Text style={[ui.body, { marginTop: 8 }]}>+91 96003 11386</Text>
      <Text style={[ui.muted, { marginTop: 4 }]}>Kottavadi, Yazhappadi</Text>
    </View>
    <Button title="Ask about a product" onPress={() => openWhatsApp('Hi தமிழ் Drifts, I have a question about a product.')} />
    <Button title="Ask about custom printing" secondary onPress={() => openWhatsApp('Hi தமிழ் Drifts, I would like to enquire about custom T-shirt printing.')} />
    <Button title="Ask about an order" secondary onPress={() => router.push('/track-order')} />
    <Text style={[ui.muted, { textAlign: 'center', marginTop: 18 }]}>Automated WhatsApp messages are not enabled. This opens a customer-initiated conversation.</Text>
  </Screen>;
}
