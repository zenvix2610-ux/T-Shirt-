import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { storeApi } from '@/api';
import { EmptyState, ErrorState, Loading, ProductTile, Screen, colors } from '@/ui';

export default function Wishlist() {
  const client = useQueryClient();
  const list = useQuery({ queryKey: ['wishlist'], queryFn: storeApi.wishlist, retry: false });
  const remove = useMutation({
    mutationFn: (id: string) => storeApi.toggleWishlist(id, true),
    onSuccess: () => client.invalidateQueries({ queryKey: ['wishlist'] }),
  });
  if (list.isLoading) return <Screen><Loading /></Screen>;
  if (list.isError) return <Screen><ErrorState message="Sign in to see your wishlist." retry={() => router.push('/login')} /></Screen>;
  if (!list.data?.length) return <Screen><EmptyState message="Save a few favourites and they’ll show up here." /></Screen>;
  return <Screen><FlatList data={list.data} numColumns={2} columnWrapperStyle={{ justifyContent: 'space-between' }} contentContainerStyle={{ paddingTop: 15 }}
    keyExtractor={(item) => item.id} renderItem={({ item }) => <View style={{ flex: 1 }}>
      <ProductTile product={item} onPress={() => router.push(`/product/${item.slug}`)} />
      <Pressable onPress={() => remove.mutate(item.id)} style={{ marginTop: -8, marginBottom: 12 }}><Text style={{ color: colors.danger }}>Remove from wishlist</Text></Pressable>
    </View>} /></Screen>;
}
