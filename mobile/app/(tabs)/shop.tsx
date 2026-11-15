import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { storeApi } from '@/api';
import { ErrorState, Loading, ProductTile, Screen, colors } from '@/ui';

export default function Shop() {
  const params = useLocalSearchParams<{ category?: string }>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('featured');
  const products = useQuery({
    queryKey: ['products', query, params.category, sort],
    queryFn: () => storeApi.products({ q: query, category: params.category, sort, page_size: 30 }),
  });
  return <Screen>
    <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 14 }}>
      <TextInput value={search} onChangeText={setSearch} onSubmitEditing={() => setQuery(search)}
        placeholder="Search T-shirts" returnKeyType="search"
        style={{ flex: 1, backgroundColor: 'white', paddingHorizontal: 14, borderRadius: 12, borderColor: colors.border, borderWidth: 1, minHeight: 48, color: colors.ink }} />
      <TextInput value={sort} onChangeText={setSort} placeholder="Sort (featured/price_asc/newest)"
        onSubmitEditing={() => setQuery(search)}
        style={{ width: 140, backgroundColor: 'white', paddingHorizontal: 10, borderRadius: 12, borderColor: colors.border, borderWidth: 1, color: colors.ink, fontSize: 11 }} />
    </View>
    {products.isLoading ? <Loading /> : products.isError ? <ErrorState message="Unable to load products." retry={() => products.refetch()} /> :
      <FlatList data={products.data?.items ?? []} numColumns={2} columnWrapperStyle={{ justifyContent: 'space-between' }}
        keyExtractor={(item) => item.id} showsVerticalScrollIndicator={false}
        renderItem={({ item }) => <ProductTile product={item} onPress={() => router.push(`/product/${item.slug}`)} />}
        ListEmptyComponent={<View style={{ paddingTop: 60 }}><ErrorState message="No products match your search." /></View>} />}
  </Screen>;
}
