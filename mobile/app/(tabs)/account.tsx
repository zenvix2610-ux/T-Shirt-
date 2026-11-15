import { useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { storeApi } from '@/api';
import { Screen, colors, ui } from '@/ui';

const links = [
  ['My profile', '/profile'], ['Order history', '/orders'], ['Track an order', '/track-order'],
  ['Saved addresses', '/addresses'], ['Wishlist', '/wishlist'], ['Notifications', '/notifications'],
  ['Custom printing', '/custom'], ['WhatsApp support', '/support'],
] as const;

export default function Account() {
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: ['me'], queryFn: storeApi.me, retry: false });
  useEffect(() => {
    if (user.isError) SecureStore.deleteItemAsync('access_token').catch(() => undefined);
  }, [user.isError]);
  return <Screen><ScrollView contentContainerStyle={{ paddingTop: 18, paddingBottom: 30 }}>
    <View style={[ui.card, { backgroundColor: colors.green }]}>
      <Text style={{ color: colors.gold, fontWeight: '800' }}>THIGAZH DRIFTS</Text>
      <Text style={{ color: 'white', fontWeight: '900', fontSize: 22, marginTop: 8 }}>{user.data?.name ?? 'Your account'}</Text>
      <Text style={{ color: '#d8e6de', marginTop: 4 }}>{user.data?.email ?? 'Sign in to sync your orders and wishlist.'}</Text>
      {!user.data ? <Text onPress={() => router.push('/login')} style={{ color: 'white', fontWeight: '800', marginTop: 14 }}>Sign in / Register  →</Text> : null}
    </View>
    {links.map(([label, path]) => <Pressable key={path} onPress={() => router.push(path)} style={[ui.card, ui.row]}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{label}</Text><Text style={ui.link}>›</Text>
    </Pressable>)}
    {user.data ? <Pressable onPress={async () => {
      const refresh = await SecureStore.getItemAsync('refresh_token');
      await storeApi.logout(refresh ?? '');
      queryClient.removeQueries({ queryKey: ['me'] });
      router.replace('/login');
    }} style={{ padding: 15 }}><Text style={{ color: colors.danger, fontWeight: '800' }}>Sign out</Text></Pressable> : null}
  </ScrollView></Screen>;
}
