import React from 'react';
import {
  ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View,
  type TextInputProps, type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from './api';
import type { Product } from './types';

export const colors = {
  green: '#0b3d32', teal: '#145448', gold: '#c5a15a', paper: '#f8f6f0',
  white: '#ffffff', ink: '#18231f', muted: '#718078', border: '#e5e8e2',
  danger: '#a63d40', pale: '#eaf0eb',
};

export function Screen({ children, ...props }: React.PropsWithChildren<ViewProps>) {
  return <SafeAreaView style={styles.safe}><View style={styles.screen} {...props}>{children}</View></SafeAreaView>;
}

export function Title({ children, subtitle }: { children: React.ReactNode; subtitle?: string }) {
  return <View style={styles.titleWrap}><Text style={styles.title}>{children}</Text>{subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}</View>;
}

export function Button({ title, onPress, disabled, secondary }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable disabled={disabled} onPress={onPress}
    style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
    {disabled ? <ActivityIndicator color={secondary ? colors.green : colors.white} /> :
      <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>}
  </Pressable>;
}

export function Field({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={styles.fieldWrap}><Text style={styles.label}>{label}</Text>
    <TextInput placeholderTextColor={colors.muted} style={styles.input} {...props} /></View>;
}

export function ProductTile({ product, onPress }: { product: Product; onPress: () => void }) {
  return <Pressable onPress={onPress} style={styles.product}>
    {product.image ? <Image source={{ uri: imageUrl(product.image) }} style={styles.productImage} /> :
      <View style={[styles.productImage, styles.imagePlaceholder]}><Text style={styles.placeholderText}>திகழ்</Text></View>}
    <Text style={styles.productName} numberOfLines={1}>{product.name_ta || product.name}</Text>
    <Text style={styles.productMeta}>{product.category}</Text>
    <Text style={styles.price}>₹{Number(product.price).toLocaleString('en-IN')}</Text>
  </Pressable>;
}

export function Loading() {
  return <View style={styles.center}><ActivityIndicator size="large" color={colors.green} /></View>;
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <View style={styles.center}><Text style={styles.errorText}>{message}</Text>
    {retry ? <Button title="Try again" onPress={retry} secondary /> : null}</View>;
}

export function EmptyState({ message }: { message: string }) {
  return <View style={styles.center}><Text style={styles.emptyText}>{message}</Text></View>;
}

export function imageUrl(path: string) {
  if (!path || path.startsWith('http')) return path;
  return `${API_BASE_URL.replace(/\/api\/?$/, '')}${path.startsWith('/') ? '' : '/'}${path}`;
}

export const ui = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 16, borderColor: colors.border, borderWidth: 1, marginBottom: 12 },
  link: { color: colors.teal, fontWeight: '700' },
  body: { color: colors.ink, fontSize: 15, lineHeight: 22 },
  muted: { color: colors.muted, fontSize: 13 },
  pill: { borderWidth: 1, borderColor: colors.border, borderRadius: 18, paddingVertical: 9, paddingHorizontal: 15 },
  pillSelected: { backgroundColor: colors.green, borderColor: colors.green },
  pillText: { color: colors.ink, fontWeight: '600' },
  pillTextSelected: { color: colors.white },
});

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.paper },
  screen: { flex: 1, backgroundColor: colors.paper, paddingHorizontal: 18 },
  titleWrap: { paddingTop: 16, paddingBottom: 18 },
  title: { color: colors.green, fontSize: 28, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 5 },
  button: { minHeight: 52, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginVertical: 8 },
  secondaryButton: { backgroundColor: colors.pale, borderWidth: 1, borderColor: '#cbd8ce' },
  buttonText: { color: colors.white, fontWeight: '800', fontSize: 15 },
  secondaryText: { color: colors.green },
  disabled: { opacity: 0.65 },
  fieldWrap: { marginBottom: 14 },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  input: { minHeight: 50, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 14, color: colors.ink, fontSize: 15 },
  product: { flex: 1, minWidth: '46%', maxWidth: '49%', marginBottom: 16 },
  productImage: { height: 190, width: '100%', borderRadius: 18, backgroundColor: '#e8e9e3' },
  imagePlaceholder: { alignItems: 'center', justifyContent: 'center' },
  placeholderText: { color: colors.green, fontSize: 26, fontWeight: '800' },
  productName: { color: colors.ink, fontWeight: '700', fontSize: 15, marginTop: 9 },
  productMeta: { color: colors.muted, fontSize: 12, marginTop: 3 },
  price: { color: colors.green, fontWeight: '800', marginTop: 5 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorText: { color: colors.danger, textAlign: 'center', fontSize: 15 },
  emptyText: { color: colors.muted, textAlign: 'center', fontSize: 16 },
});
