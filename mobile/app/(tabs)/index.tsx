import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { ImageBackground, Pressable, ScrollView, Text, View } from 'react-native';
import { storeApi } from '@/api';
import { ErrorState, Loading, ProductTile, Screen, colors, ui } from '@/ui';

export default function Home() {
  const home = useQuery({ queryKey: ['home'], queryFn: storeApi.home });
  if (home.isLoading) return <Screen><Loading /></Screen>;
  if (home.isError) return <Screen><ErrorState message="We couldn’t load the store." retry={() => home.refetch()} /></Screen>;
  const data = home.data;
  const picks = data.featured?.length ? data.featured : data.new_arrivals;
  return <Screen>
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={{ paddingVertical: 19, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View><Text style={{ color: colors.green, fontWeight: '900', fontSize: 20 }}>திகழ் Drifts</Text><Text style={ui.muted}>Wear your story.</Text></View>
        <Pressable onPress={() => router.push('/support')}><Text style={{ color: colors.green, fontSize: 22 }}>◉</Text></Pressable>
      </View>
      <ImageBackground source={{ uri: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=1000' }} imageStyle={{ borderRadius: 22 }} style={{ height: 280, justifyContent: 'flex-end', overflow: 'hidden' }}>
        <View style={{ padding: 22, backgroundColor: 'rgba(5,35,28,0.72)' }}>
          <Text style={{ color: colors.gold, fontWeight: '800', letterSpacing: 2 }}>MADE FOR YOUR MOMENTS</Text>
          <Text style={{ color: 'white', fontSize: 29, fontWeight: '900', marginVertical: 6 }}>Print your vibe.</Text>
          <Pressable onPress={() => router.push('/(tabs)/shop')}><Text style={{ color: 'white', fontWeight: '700' }}>Explore collection  →</Text></Pressable>
        </View>
      </ImageBackground>
      <View style={[ui.row, { marginTop: 24, marginBottom: 14 }]}><Text style={{ color: colors.green, fontSize: 21, fontWeight: '800' }}>Shop by category</Text><Pressable onPress={() => router.push('/categories')}><Text style={ui.link}>View all</Text></Pressable></View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 9 }}>
        {(data.categories ?? []).map((category: { id: string; name: string; slug: string }) =>
          <Pressable key={category.id} style={[ui.pill, { backgroundColor: colors.white }]} onPress={() => router.push({ pathname: '/(tabs)/shop', params: { category: category.slug } })}>
            <Text style={ui.pillText}>{category.name}</Text>
          </Pressable>)}
      </ScrollView>
      <View style={[ui.row, { marginTop: 25, marginBottom: 10 }]}><Text style={{ color: colors.green, fontSize: 21, fontWeight: '800' }}>Featured picks</Text><Pressable onPress={() => router.push('/(tabs)/shop')}><Text style={ui.link}>Shop all</Text></Pressable></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
        {(picks ?? []).slice(0, 4).map((product: any) => <ProductTile key={product.id} product={product} onPress={() => router.push(`/product/${product.slug}`)} />)}
      </View>
      <Pressable onPress={() => router.push('/custom')} style={{ backgroundColor: colors.green, borderRadius: 20, padding: 20, marginBottom: 26 }}>
        <Text style={{ color: colors.gold, fontWeight: '800' }}>YOUR IDEA, OUR PRINT</Text>
        <Text style={{ color: 'white', fontWeight: '900', fontSize: 22, marginTop: 5 }}>Create a custom T-shirt</Text>
        <Text style={{ color: '#dce8df', marginTop: 7 }}>Upload your artwork and tell us what you have in mind.</Text>
      </Pressable>
    </ScrollView>
  </Screen>;
}
