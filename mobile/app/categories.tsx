import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { storeApi } from '@/api';
import { ErrorState, Loading, Screen, colors, ui } from '@/ui';

export default function Categories() {
  const query = useQuery({ queryKey: ['categories'], queryFn: storeApi.categories });
  if (query.isLoading) return <Screen><Loading /></Screen>;
  if (query.isError) return <Screen><ErrorState message="Could not load categories." retry={() => query.refetch()} /></Screen>;
  return <Screen><ScrollView contentContainerStyle={{ paddingTop: 16 }}>
    {query.data?.map((category) => <Pressable key={category.id} style={[ui.card, { padding: 21 }]}
      onPress={() => router.push({ pathname: '/(tabs)/shop', params: { category: category.slug } })}>
      <Text style={{ color: colors.green, fontWeight: '800', fontSize: 18 }}>{category.name}</Text>
      {category.description ? <Text style={[ui.muted, { marginTop: 6 }]}>{category.description}</Text> : null}
    </Pressable>)}
  </ScrollView></Screen>;
}
