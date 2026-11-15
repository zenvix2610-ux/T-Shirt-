import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import type { Category, Order, Product, User } from './types';

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:8000/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: { Accept: 'application/json' },
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let refreshPromise: Promise<string | null> | null = null;
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string }>) => {
    const request = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && request && !request._retried && !request.url?.includes('/auth/')) {
      request._retried = true;
      refreshPromise ??= (async () => {
        const refreshToken = await SecureStore.getItemAsync('refresh_token');
        if (!refreshToken) return null;
        try {
          const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refreshToken });
          await SecureStore.setItemAsync('access_token', response.data.access_token);
          await SecureStore.setItemAsync('refresh_token', response.data.refresh_token);
          return response.data.access_token as string;
        } catch {
          await clearSession();
          return null;
        } finally {
          refreshPromise = null;
        }
      })();
      const token = await refreshPromise;
      if (token) {
        request.headers.Authorization = `Bearer ${token}`;
        return api(request);
      }
    }
    return Promise.reject(new Error(error.response?.data?.detail ?? error.message ?? 'Network request failed.'));
  },
);

export async function clearSession() {
  await Promise.all([
    SecureStore.deleteItemAsync('access_token'),
    SecureStore.deleteItemAsync('refresh_token'),
  ]);
}

export const storeApi = {
  async home() {
    return (await api.get('/storefront/home')).data;
  },
  async categories(): Promise<Category[]> {
    return (await api.get('/catalog/categories')).data;
  },
  async products(params: Record<string, string | number | undefined> = {}) {
    return (await api.get('/catalog/products', { params })).data as {
      items: Product[];
      page: number;
      pages: number;
      total: number;
    };
  },
  async product(slug: string): Promise<Product> {
    return (await api.get(`/catalog/products/${encodeURIComponent(slug)}`)).data;
  },
  async login(email: string, password: string): Promise<User> {
    const response = (await api.post('/auth/login', { email, password })).data;
    await SecureStore.setItemAsync('access_token', response.access_token);
    await SecureStore.setItemAsync('refresh_token', response.refresh_token);
    return response.user as User;
  },
  async register(body: { name: string; phone: string; email: string; password: string }): Promise<User> {
    const response = (await api.post('/auth/register', body)).data;
    await SecureStore.setItemAsync('access_token', response.access_token);
    await SecureStore.setItemAsync('refresh_token', response.refresh_token);
    return response.user as User;
  },
  async me(): Promise<User> {
    return (await api.get('/auth/me')).data;
  },
  async logout(refreshToken: string) {
    try {
      await api.post('/auth/logout', { refresh_token: refreshToken });
    } finally {
      await clearSession();
    }
  },
  async orders(): Promise<Order[]> {
    return (await api.get('/orders')).data;
  },
  async trackOrder(order_number: string, phone: string): Promise<Order> {
    return (await api.post('/orders/track', { order_number, phone })).data;
  },
  async createOrder(body: Record<string, unknown>): Promise<Order> {
    return (await api.post('/orders', body)).data;
  },
  async wishlist(): Promise<Product[]> {
    return (await api.get('/account/wishlist')).data;
  },
  async toggleWishlist(productId: string, saved: boolean) {
    if (saved) return api.delete(`/account/wishlist/${productId}`);
    return api.post(`/account/wishlist/${productId}`);
  },
  async addresses() {
    return (await api.get('/account/addresses')).data as {
      id: string; name: string; phone: string; line1: string; line2: string;
      city: string; pincode: string; is_default: boolean;
    }[];
  },
  async notifications() {
    return (await api.get('/account/notifications')).data as {
      id: string; title: string; body: string; is_read: boolean; created_at: string;
    }[];
  },
  async markNotificationRead(id: string) {
    return api.patch(`/account/notifications/${id}/read`);
  },
  async submitCustomRequest(form: FormData) {
    return (await api.post('/custom-requests', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })).data as { id: string; status: string };
  },
  async createAddress(body: {
    name: string; phone: string; line1: string; line2: string; city: string;
    pincode: string; is_default: boolean;
  }) {
    return (await api.post('/account/addresses', body)).data;
  },
};

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
