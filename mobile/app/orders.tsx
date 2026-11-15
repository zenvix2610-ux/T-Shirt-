import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { storeApi } from '@/api';
import { EmptyState, ErrorState, Loading, Screen, colors, ui } from '@/ui';

export default function Orders() {
  const orders = useQuery({ queryKey: ['orders'], queryFn: storeApi.orders, retry: false });
  if (orders.isLoading) return <Screen><Loading /></Screen>;
  if (orders.isError) return <Screen><ErrorState message="Sign in to view your order history." retry={() => router.push('/login')} /></Screen>;
  if (!orders.data?.length) return <Screen><EmptyState message="Your order history will appear here." /></Screen>;
  return <Screen><ScrollView contentContainerStyle={{ paddingTop: 16 }}>
    {orders.data.map((order) => <Pressable key={order.id} style={ui.card} onPress={() => router.push({ pathname: '/track-order', params: { order_number: order.order_number } })}>
      <View style={ui.row}><Text style={{ color: colors.green, fontWeight: '900' }}>{order.order_number}</Text><Text style={{ color: colors.teal, fontWeight: '700' }}>{order.status}</Text></View>
      <Text style={[ui.muted, { marginTop: 7 }]}>{order.items.length} item(s) · {new Date(order.created_at).toLocaleDateString()}</Text>
      <Text style={{ color: colors.ink, fontWeight: '800', marginTop: 8 }}>₹{order.total.toLocaleString('en-IN')} · {order.payment_status}</Text>
    </Pressable>)}
  </ScrollView></Screen>;
}
