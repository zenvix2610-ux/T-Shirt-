import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { errorMessage, storeApi } from '@/api';
import { useCart } from '@/cart';
import { Button, Field, Screen, Title, colors, ui } from '@/ui';

export default function Checkout() {
  const cart = useCart();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [coupon, setCoupon] = useState('');
  const [notes, setNotes] = useState('');
  const order = useMutation({
    mutationFn: () => storeApi.createOrder({
      name: name.trim(), phone, email: email.trim(), line1: line1.trim(), line2: line2.trim(),
      city: city.trim(), pincode, coupon_code: coupon.trim(), notes: notes.trim(),
      payment_method: 'cod',
      idempotency_key: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 14)}`,
      items: cart.items.map((item) => ({ variant_id: item.variant_id, qty: item.qty })),
    }),
    onSuccess: (created) => {
      cart.clear();
      router.replace({ pathname: '/order-confirmation', params: { order_number: created.order_number, total: String(created.total) } });
    },
    onError: (error) => Alert.alert('Could not place order', errorMessage(error)),
  });

  if (!cart.items.length) return <Screen><Title>Your bag is empty</Title><Button title="Browse the collection" onPress={() => router.replace('/(tabs)/shop')} /></Screen>;

  return <Screen><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 26 }}>
    <Title subtitle="Your order is checked against live inventory before it is confirmed.">Delivery details</Title>
    <Field label="Full name" value={name} onChangeText={setName} />
    <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
    <Field label="Email address" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
    <Field label="Address line 1" value={line1} onChangeText={setLine1} />
    <Field label="Address line 2 (optional)" value={line2} onChangeText={setLine2} />
    <View style={[ui.row, { alignItems: 'flex-start' }]}>
      <View style={{ flex: 1 }}><Field label="City" value={city} onChangeText={setCity} /></View>
      <View style={{ flex: 1 }}><Field label="Pincode" value={pincode} onChangeText={setPincode} keyboardType="number-pad" /></View>
    </View>
    <Field label="Coupon code (optional)" value={coupon} onChangeText={setCoupon} autoCapitalize="characters" />
    <Field label="Delivery notes (optional)" value={notes} onChangeText={setNotes} />
    <Text style={{ color: colors.green, fontWeight: '800', fontSize: 17, marginTop: 6, marginBottom: 7 }}>Payment</Text>
    <View style={ui.card}>
      <Text style={{ color: colors.ink, fontWeight: '800' }}>Cash on delivery</Text>
      <Text style={[ui.muted, { marginTop: 4 }]}>Available at checkout. Online payments will appear once the approved Razorpay mobile flow is configured.</Text>
    </View>
    <View style={ui.card}>
      <View style={ui.row}><Text style={ui.body}>Items subtotal</Text><Text style={ui.body}>₹{cart.subtotal.toLocaleString('en-IN')}</Text></View>
      <Text style={[ui.muted, { marginTop: 7 }]}>Shipping, coupon and final total are calculated by the server.</Text>
    </View>
    <Button title={order.isPending ? 'Placing order…' : 'Place COD order'} disabled={order.isPending || !name || phone.length < 10 || !email.includes('@') || !line1 || !city || pincode.length !== 6}
      onPress={() => order.mutate()} />
  </ScrollView></Screen>;
}
