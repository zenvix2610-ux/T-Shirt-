import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, Text, View } from 'react-native';
import { storeApi } from '@/api';
import { useCart } from '@/cart';
import { Button, ErrorState, Loading, Screen, colors, imageUrl, ui } from '@/ui';

export default function ProductDetail() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const product = useQuery({ queryKey: ['product', slug], queryFn: () => storeApi.product(slug) });
  const cart = useCart();
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const save = useMutation({
    mutationFn: async () => {
      const current = await storeApi.wishlist();
      return storeApi.toggleWishlist(product.data!.id, current.some((item) => item.id === product.data!.id));
    },
    onSuccess: () => Alert.alert('Wishlist updated', 'Your wishlist has been saved.'),
    onError: (error) => Alert.alert('Sign in required', error instanceof Error ? error.message : 'Please sign in first.'),
  });
  const variants = product.data?.variants ?? [];
  const selected = useMemo(() => variants.find((variant) => variant.id === variantId), [variants, variantId]);
  if (product.isLoading) return <Screen><Loading /></Screen>;
  if (product.isError || !product.data) return <Screen><ErrorState message="We couldn’t find this product." retry={() => product.refetch()} /></Screen>;
  return <Screen><ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 25 }}>
    <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -18 }}>
      {(product.data.images?.length ? product.data.images : [{ url: product.data.image }]).map((image: any, index: number) =>
        <Image key={image.id ?? index} source={{ uri: imageUrl(image.url) }} style={{ width: 360, height: 390, backgroundColor: '#e8e9e3' }} resizeMode="cover" />)}
    </ScrollView>
    <View style={[ui.row, { marginTop: 17 }]}><Text style={{ color: colors.green, fontWeight: '900', fontSize: 25, flex: 1 }}>{product.data.name_ta || product.data.name}</Text>
      <Text onPress={() => save.mutate()} style={{ fontSize: 24, color: colors.gold }}>♡</Text></View>
    <Text style={[ui.muted, { marginTop: 4 }]}>{product.data.category} · {product.data.printing_type}</Text>
    <Text style={{ color: colors.green, fontSize: 22, fontWeight: '900', marginTop: 10 }}>₹{product.data.price.toLocaleString('en-IN')}</Text>
    <Text style={[ui.body, { marginVertical: 12 }]}>{product.data.description}</Text>
    <Text style={{ color: colors.ink, fontWeight: '800', marginBottom: 9 }}>Choose size and colour</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {variants.map((variant) => <Pressable key={variant.id} onPress={() => { setVariantId(variant.id); setQty(1); }}
        style={[ui.pill, variantId === variant.id && ui.pillSelected]}>
        <Text style={[ui.pillText, variantId === variant.id && ui.pillTextSelected]}>{variant.size} · {variant.color}{variant.stock < 1 ? ' (Sold out)' : ''}</Text>
      </Pressable>)}
    </View>
    {selected ? <Text style={[ui.muted, { marginTop: 10 }]}>{selected.stock} available · ₹{selected.price.toLocaleString('en-IN')}</Text> : null}
    <View style={[ui.row, { justifyContent: 'flex-start', marginTop: 15 }]}>
      <Text onPress={() => setQty((value) => Math.max(1, value - 1))} style={ui.link}>−</Text>
      <Text style={ui.body}>{qty}</Text>
      <Text onPress={() => setQty((value) => Math.min(selected?.stock ?? 1, value + 1))} style={ui.link}>＋</Text>
    </View>
    <Button title="Add to bag" disabled={!selected || selected.stock < 1} onPress={() => {
      if (selected) { cart.add(product.data!, selected, qty); Alert.alert('Added to bag', 'This item is in your bag.'); }
    }} />
    <Button title="Buy now" secondary disabled={!selected || selected.stock < 1} onPress={() => {
      if (selected) { cart.add(product.data!, selected, qty); router.push('/checkout'); }
    }} />
  </ScrollView></Screen>;
}
