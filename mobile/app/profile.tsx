import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { api, errorMessage, storeApi } from '@/api';
import { Button, ErrorState, Field, Loading, Screen, Title } from '@/ui';

export default function Profile() {
  const client = useQueryClient();
  const profile = useQuery({ queryKey: ['me'], queryFn: storeApi.me, retry: false });
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  React.useEffect(() => {
    if (profile.data) { setName(profile.data.name); setPhone(profile.data.phone); }
  }, [profile.data]);
  const save = useMutation({
    mutationFn: async () => (await api.patch('/account/profile', { name, phone })).data,
    onSuccess: async (data) => { client.setQueryData(['me'], data); Alert.alert('Profile saved'); },
    onError: (error) => Alert.alert('Could not update profile', errorMessage(error)),
  });
  if (profile.isLoading) return <Screen><Loading /></Screen>;
  if (profile.isError || !profile.data) return <Screen><ErrorState message="Sign in to manage your profile." /></Screen>;
  return <Screen><ScrollView keyboardShouldPersistTaps="handled">
    <Title subtitle={profile.data.email}>Personal information</Title>
    <Field label="Full name" value={name} onChangeText={setName} />
    <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
    <Button title="Save changes" disabled={save.isPending || !name || phone.length < 10} onPress={() => save.mutate()} />
  </ScrollView></Screen>;
}
