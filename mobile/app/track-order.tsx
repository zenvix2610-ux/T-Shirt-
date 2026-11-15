import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { errorMessage, storeApi } from '@/api';
import { Button, Field, Screen, Title, colors, ui } from '@/ui';

export default function TrackOrder() {
  const params = useLocalSearchParams<{ order_number?: string }>();
  const [number, setNumber] = useState(params.order_number ?? '');
  const [phone, setPhone] = useState('');
  const track = useMutation({
    mutationFn: () => storeApi.trackOrder(number.trim(), phone),
    onError: (error) => Alert.alert('Order not found', errorMessage(error)),
  });
  return <Screen><ScrollView keyboardShouldPersistTaps="handled">
    <Title subtitle="Use the order number and mobile number from checkout.">Track your order</Title>
    <Field label="Order number" value={number} onChangeText={setNumber} autoCapitalize="characters" />
    <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
    <Button title="Find order" disabled={track.isPending || !number || phone.length < 10} onPress={() => track.mutate()} />
    {track.data ? <View style={[ui.card, { marginTop: 12 }]}>
      <View style={ui.row}><Text style={{ color: colors.green, fontWeight: '900' }}>{track.data.order_number}</Text><Text style={{ color: colors.teal, fontWeight: '800' }}>{track.data.status}</Text></View>
      <Text style={[ui.muted, { marginTop: 8 }]}>Payment: {track.data.payment_status}</Text>
      <Text style={[ui.body, { marginTop: 10, fontWeight: '800' }]}>Order timeline</Text>
      {track.data.events.map((event, index) => <View key={`${event.status}-${index}`} style={{ borderLeftWidth: 2, borderLeftColor: colors.gold, paddingLeft: 12, marginTop: 12 }}>
        <Text style={{ color: colors.green, fontWeight: '800' }}>{event.status}</Text>
        <Text style={ui.muted}>{event.note} · {new Date(event.created_at).toLocaleString()}</Text>
      </View>)}
    </View> : null}
  </ScrollView></Screen>;
}
