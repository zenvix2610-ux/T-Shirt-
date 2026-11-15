import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { useCart } from '@/cart';
import { Button, EmptyState, Screen, colors, imageUrl, ui } from '@/ui';

export default function Cart() {
  const cart = useCart();
  return <Screen>
    {cart.items.length === 0 ? <EmptyState message="Your bag is waiting for something good." /> :
      <ScrollView contentContainerStyle={{ paddingTop: 14, paddingBottom: 30 }}>
        {cart.items.map((line) => <View key={line.variant_id} style={[ui.card, ui.row, { alignItems: 'flex-start' }]}>
          {line.product.image ? <Image source={{ uri: imageUrl(line.product.image) }} style={{ width: 78, height: 92, borderRadius: 12 }} /> : null}
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontWeight: '800' }}>{line.product.name}</Text>
            <Text style={ui.muted}>{line.variant.color} · {line.variant.size}</Text>
            <Text style={{ color: colors.green, fontWeight: '800', marginTop: 5 }}>₹{line.variant.price.toLocaleString('en-IN')}</Text>
            <View style={[ui.row, { justifyContent: 'flex-start', marginTop: 8 }]}>
              <Text onPress={() => cart.setQty(line.variant_id, line.qty - 1)} style={ui.link}>−</Text>
              <Text>{line.qty}</Text>
              <Text onPress={() => cart.setQty(line.variant_id, line.qty + 1)} style={ui.link}>＋</Text>
              <Text onPress={() => cart.remove(line.variant_id)} style={{ color: colors.danger, marginLeft: 10 }}>Remove</Text>
            </View>
          </View>
        </View>)}
        <View style={[ui.card, { marginTop: 4 }]}>
          <View style={ui.row}><Text style={ui.body}>Subtotal</Text><Text style={ui.body}>₹{cart.subtotal.toLocaleString('en-IN')}</Text></View>
          <Text style={[ui.muted, { marginTop: 7 }]}>Shipping and any discount are confirmed at checkout.</Text>
        </View>
        <Button title="Continue to checkout" onPress={() => router.push('/checkout')} />
      </ScrollView>}
  </Screen>;
}
