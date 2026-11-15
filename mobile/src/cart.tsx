import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { CartLine, Product, Variant } from './types';

type CartContextValue = {
  items: CartLine[];
  subtotal: number;
  add: (product: Product, variant: Variant, qty?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: React.PropsWithChildren) {
  const [items, setItems] = useState<CartLine[]>([]);
  useEffect(() => {
    AsyncStorage.getItem('guest_cart').then((raw) => {
      if (raw) setItems(JSON.parse(raw) as CartLine[]);
    }).catch(() => undefined);
  }, []);
  useEffect(() => {
    AsyncStorage.setItem('guest_cart', JSON.stringify(items)).catch(() => undefined);
  }, [items]);

  const value = useMemo<CartContextValue>(() => ({
    items,
    subtotal: items.reduce((sum, item) => sum + item.variant.price * item.qty, 0),
    add: (product, variant, qty = 1) => setItems((current) => {
      const existing = current.find((item) => item.variant_id === variant.id);
      if (existing) {
        return current.map((item) => item.variant_id === variant.id
          ? { ...item, qty: Math.min(item.qty + qty, variant.stock) }
          : item);
      }
      return [...current, { variant_id: variant.id, qty: Math.min(qty, variant.stock), product, variant }];
    }),
    setQty: (variantId, qty) => setItems((current) => current.map((item) =>
      item.variant_id === variantId ? { ...item, qty: Math.min(Math.max(1, qty), item.variant.stock) } : item)),
    remove: (variantId) => setItems((current) => current.filter((item) => item.variant_id !== variantId)),
    clear: () => setItems([]),
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used within CartProvider');
  return context;
}
