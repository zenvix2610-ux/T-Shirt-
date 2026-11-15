import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text } from 'react-native';
import { errorMessage, storeApi } from '@/api';
import { Button, Field, Screen, Title, colors, ui } from '@/ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const queryClient = useQueryClient();
  const login = useMutation({
    mutationFn: () => storeApi.login(email.trim(), password),
    onSuccess: async (user) => {
      queryClient.setQueryData(['me'], user);
      await queryClient.invalidateQueries();
      router.replace('/(tabs)/account');
    },
    onError: (error) => Alert.alert('Sign in failed', errorMessage(error)),
  });
  return <Screen><ScrollView keyboardShouldPersistTaps="handled">
    <Title subtitle="Sign in to sync your bag and order history.">Welcome back</Title>
    <Field label="Email address" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
    <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
    <Button title="Sign in" disabled={login.isPending || !email || !password} onPress={() => login.mutate()} />
    <Text onPress={() => router.push('/register')} style={[ui.link, { textAlign: 'center', padding: 15 }]}>New here? Create an account</Text>
    <Text style={[ui.muted, { textAlign: 'center' }]}>Forgot your password? Contact support to request a reset.</Text>
  </ScrollView></Screen>;
}
