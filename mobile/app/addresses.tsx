import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { errorMessage, storeApi } from '@/api';
import { Button, EmptyState, ErrorState, Field, Loading, Screen, Title, colors, ui } from '@/ui';

export default function Addresses() {
  const queryClient = useQueryClient();
  const addresses = useQuery({ queryKey: ['addresses'], queryFn: storeApi.addresses, retry: false });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const save = useMutation({
    mutationFn: () => storeApi.createAddress({ name, phone, line1, line2, city, pincode, is_default: !addresses.data?.length }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['addresses'] });
      setName(''); setPhone(''); setLine1(''); setLine2(''); setCity(''); setPincode('');
    },
    onError: (error) => Alert.alert('Could not save address', errorMessage(error)),
  });
  if (addresses.isLoading) return <Screen><Loading /></Screen>;
  if (addresses.isError) return <Screen><ErrorState message="Sign in to manage saved addresses." /></Screen>;
  return <Screen><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: 10, paddingBottom: 26 }}>
    {addresses.data?.length ? addresses.data.map((address) => <View key={address.id} style={ui.card}>
      <Text style={{ color: colors.green, fontWeight: '800' }}>{address.name} {address.is_default ? '· Default' : ''}</Text>
      <Text style={[ui.body, { marginTop: 5 }]}>{address.line1}{address.line2 ? `, ${address.line2}` : ''}</Text>
      <Text style={ui.muted}>{address.city}, {address.pincode} · {address.phone}</Text>
    </View>) : <EmptyState message="No saved addresses yet." />}
    <Title subtitle="Keep a delivery address on your account.">Add address</Title>
    <Field label="Recipient name" value={name} onChangeText={setName} />
    <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
    <Field label="Address line 1" value={line1} onChangeText={setLine1} />
    <Field label="Address line 2" value={line2} onChangeText={setLine2} />
    <Field label="City" value={city} onChangeText={setCity} />
    <Field label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="number-pad" />
    <Button title="Save address" disabled={save.isPending || !name || phone.length < 10 || line1.length < 4 || !city || pincode.length !== 6}
      onPress={() => save.mutate()} />
  </ScrollView></Screen>;
}
