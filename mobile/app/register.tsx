import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView } from 'react-native';
import { errorMessage, storeApi } from '@/api';
import { Button, Field, Screen, Title } from '@/ui';

export default function Register() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const register = useMutation({
    mutationFn: () => storeApi.register({ name: name.trim(), phone, email: email.trim(), password }),
    onSuccess: async (user) => {
      queryClient.setQueryData(['me'], user);
      await queryClient.invalidateQueries();
      router.replace('/(tabs)/account');
    },
    onError: (error) => Alert.alert('Could not create account', errorMessage(error)),
  });
  return <Screen><ScrollView keyboardShouldPersistTaps="handled">
    <Title subtitle="A few details and you’re ready to shop.">Create account</Title>
    <Field label="Full name" value={name} onChangeText={setName} autoCapitalize="words" />
    <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
    <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
    <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry />
    <Button title="Create account" disabled={register.isPending || !name || phone.length < 10 || !email.includes('@') || password.length < 8}
      onPress={() => register.mutate()} />
  </ScrollView></Screen>;
}
