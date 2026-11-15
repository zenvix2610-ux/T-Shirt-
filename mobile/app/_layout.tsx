import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { CartProvider } from '@/cart';
import { colors } from '@/ui';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

export default function RootLayout() {
  return <QueryClientProvider client={queryClient}>
    <CartProvider>
      <StatusBar style="light" backgroundColor={colors.green} />
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.green }, headerTintColor: '#fff', headerTitleStyle: { fontWeight: '700' }, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Welcome back' }} />
        <Stack.Screen name="register" options={{ title: 'Create account' }} />
        <Stack.Screen name="product/[slug]" options={{ title: 'Product' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories' }} />
        <Stack.Screen name="custom" options={{ title: 'Custom printing' }} />
        <Stack.Screen name="checkout" options={{ title: 'Checkout' }} />
        <Stack.Screen name="order-confirmation" options={{ title: 'Order confirmed', headerBackVisible: false }} />
        <Stack.Screen name="orders" options={{ title: 'My orders' }} />
        <Stack.Screen name="track-order" options={{ title: 'Track an order' }} />
        <Stack.Screen name="addresses" options={{ title: 'Saved addresses' }} />
        <Stack.Screen name="wishlist" options={{ title: 'Wishlist' }} />
        <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
        <Stack.Screen name="profile" options={{ title: 'My profile' }} />
        <Stack.Screen name="support" options={{ title: 'Customer support' }} />
      </Stack>
    </CartProvider>
  </QueryClientProvider>;
}
