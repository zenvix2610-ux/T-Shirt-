export type Product = {
  id: string;
  slug: string;
  name: string;
  name_ta?: string;
  category: string;
  category_slug: string;
  price: number;
  compare_at_price: number | null;
  image: string;
  description?: string;
  printing_type?: string;
  images?: { id?: string; url: string; alt?: string; view?: string }[];
  in_stock: boolean;
  sizes: string[];
  colors: { name: string; hex: string }[];
  variants?: Variant[];
};

export type Variant = {
  id: string;
  size: string;
  color: string;
  color_hex: string;
  price: number;
  stock: number;
  in_stock: boolean;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description?: string;
};

export type CartLine = {
  variant_id: string;
  qty: number;
  product: Product;
  variant: Variant;
};

export type Order = {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  created_at: string;
  items: { id: string; name: string; size: string; color: string; qty: number; line_total: number }[];
  events: { status: string; note: string; created_at: string }[];
};

export type User = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: 'customer' | 'admin';
};
