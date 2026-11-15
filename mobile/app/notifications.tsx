import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { storeApi } from '@/api';
import { EmptyState, ErrorState, Loading, Screen, colors, ui } from '@/ui';

export default function Notifications() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: ['notifications'], queryFn: storeApi.notifications, retry: false });
  const mark = useMutation({
    mutationFn: storeApi.markNotificationRead,
    onSuccess: () => client.invalidateQueries({ queryKey: ['notifications'] }),
  });
  if (list.isLoading) return <Screen><Loading /></Screen>;
  if (list.isError) return <Screen><ErrorState message="Sign in to view notifications." retry={() => router.push('/login')} /></Screen>;
  if (!list.data?.length) return <Screen><EmptyState message="You’re all caught up. Order updates will appear here." /></Screen>;
  return <Screen><ScrollView contentContainerStyle={{ paddingTop: 15 }}>
    {list.data.map((item) => <Pressable key={item.id} onPress={() => !item.is_read && mark.mutate(item.id)}
      style={[ui.card, !item.is_read && { borderColor: colors.gold }]}>
      <Text style={{ color: colors.green, fontWeight: '800' }}>{item.title}</Text>
      <Text style={[ui.body, { marginTop: 5 }]}>{item.body}</Text>
      <Text style={[ui.muted, { marginTop: 8 }]}>{new Date(item.created_at).toLocaleString()} · {item.is_read ? 'Read' : 'Tap to mark read'}</Text>
    </Pressable>)}
  </ScrollView></Screen>;
}
