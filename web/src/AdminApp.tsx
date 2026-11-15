import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { AdminUser } from "./adminTypes";
import { api, clearSession, getToken, money, setSession } from "./api";
import "./admin.css";

type Summary = {
  total_sales: number;
  total_revenue: number;
  total_orders: number;
  pending_orders: number;
  completed_orders: number;
  total_customers: number;
  low_stock_products: { variant_id: string; sku: string; product: string; size: string; color: string; stock: number; threshold: number }[];
  recent_orders: AdminOrder[];
};
type AdminOrder = { id: string; order_number: string; customer_name: string; customer_phone: string; status: string; total: number; created_at: string; items: { name: string; qty: number }[] };
type AdminProduct = { id: string; name: string; name_ta: string; slug: string; category: string; category_id: string; description: string; base_price: number; compare_at_price: number | null; printing_type: string; is_featured: boolean; is_best_seller: boolean; is_new: boolean; is_active: boolean; price: number; in_stock: boolean; variants: { id: string; stock: number }[] };
type Category = { id: string; name: string };
type Inventory = { id: string; sku: string; product: string; size: string; color: string; stock: number; low_stock_threshold: number };
type Customer = { id: string; name: string; email: string; phone: string; is_active: boolean; orders: number };
type Settings = Record<string, string>;
type Tab = "dashboard" | "orders" | "products" | "inventory" | "customers" | "reports" | "settings";

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Overview", icon: "⌂" },
  { id: "orders", label: "Orders", icon: "▤" },
  { id: "products", label: "Products", icon: "◇" },
  { id: "inventory", label: "Inventory", icon: "▦" },
  { id: "customers", label: "Customers", icon: "♙" },
  { id: "reports", label: "Reports", icon: "▥" },
  { id: "settings", label: "Store settings", icon: "⚙" },
];

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(Boolean(getToken()));
  const [tab, setTab] = useState<Tab>("dashboard");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [inventory, setInventory] = useState<Inventory[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [editingProduct, setEditingProduct] = useState<AdminProduct | null>(null);
  const [report, setReport] = useState<{ periods: { period: string; orders: number; revenue: number }[]; products: { name: string; qty: number; revenue: number }[] } | null>(null);

  const loadTab = useCallback(async (current: Tab) => {
    setError("");
    try {
      if (current === "dashboard") setSummary(await api<Summary>("/admin/dashboard"));
      if (current === "orders") setOrders((await api<{ items: AdminOrder[] }>("/admin/orders")).items);
      if (current === "products") {
        const [productData, categoryData] = await Promise.all([
          api<{ items: AdminProduct[] }>("/admin/products"),
          api<Category[]>("/admin/categories"),
        ]);
        setProducts(productData.items);
        setCategories(categoryData);
      }
      if (current === "inventory") setInventory(await api<Inventory[]>("/admin/variants"));
      if (current === "customers") setCustomers((await api<{ items: Customer[] }>("/admin/customers")).items);
      if (current === "reports") setReport(await api("/admin/reports/monthly"));
      if (current === "settings") setSettings(await api<Settings>("/admin/settings"));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Could not load admin data.";
      if (message.includes("Sign in") || message.includes("Admin access")) {
        clearSession();
        setAuthenticated(false);
      }
      setError(message);
    }
  }, []);

  useEffect(() => {
    if (authenticated) void loadTab(tab);
  }, [authenticated, loadTab, tab]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const session = await api<{ access_token: string; refresh_token: string; user: AdminUser }>("/auth/admin/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(form.entries())),
      });
      if (session.user.role !== "admin") throw new Error("Admin access only");
      setSession(session.access_token, session.refresh_token);
      setAuthenticated(true);
      window.history.replaceState({}, "", "/admin/dashboard");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  function signOut() {
    clearSession();
    setAuthenticated(false);
    setSummary(null);
    window.history.replaceState({}, "", "/admin/login");
  }

  async function updateOrder(order: AdminOrder, status: string) {
    setBusy(true);
    try {
      await api(`/admin/orders/${order.id}/status`, { method: "PATCH", body: JSON.stringify({ status, note: "Updated from admin dashboard" }) });
      setNotice(`${order.order_number} updated`);
      await loadTab(tab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update order.");
    } finally {
      setBusy(false);
    }
  }

  async function updateStock(row: Inventory, stock: number) {
    setBusy(true);
    try {
      await api(`/admin/variants/${row.id}/stock`, { method: "PATCH", body: JSON.stringify({ stock }) });
      setNotice(`${row.sku} stock updated`);
      await loadTab(tab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update stock.");
    } finally {
      setBusy(false);
    }
  }

  async function setCustomerActive(row: Customer, is_active: boolean) {
    setBusy(true);
    try {
      await api(`/admin/customers/${row.id}`, { method: "PATCH", body: JSON.stringify({ is_active }) });
      await loadTab(tab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update customer.");
    } finally {
      setBusy(false);
    }
  }

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const payload = {
      name: String(data.get("name") || ""),
      name_ta: String(data.get("name_ta") || ""),
      category_id: String(data.get("category_id") || ""),
      description: String(data.get("description") || ""),
      base_price: Number(data.get("base_price")),
      compare_at_price: data.get("compare_at_price") ? Number(data.get("compare_at_price")) : null,
      printing_type: String(data.get("printing_type") || "Custom"),
      is_featured: false,
      is_best_seller: false,
      is_new: true,
      is_active: true,
    };
    try {
      await api("/admin/products", { method: "POST", body: JSON.stringify(payload) });
      formElement.reset();
      setNotice("Product added");
      await loadTab(tab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add product.");
    } finally {
      setBusy(false);
    }
  }

  async function updateProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProduct) return;
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const payload = {
      name: String(data.get("name") || ""),
      name_ta: String(data.get("name_ta") || ""),
      category_id: String(data.get("category_id") || ""),
      description: String(data.get("description") || ""),
      base_price: Number(data.get("base_price")),
      compare_at_price: data.get("compare_at_price") ? Number(data.get("compare_at_price")) : null,
      printing_type: String(data.get("printing_type") || "Custom"),
      is_featured: data.has("is_featured"),
      is_best_seller: data.has("is_best_seller"),
      is_new: data.has("is_new"),
      is_active: data.has("is_active"),
    };
    try {
      await api(`/admin/products/${editingProduct.id}`, { method: "PUT", body: JSON.stringify(payload) });
      setEditingProduct(null);
      setNotice("Product updated");
      await loadTab(tab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update product.");
    } finally {
      setBusy(false);
    }
  }

  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await api("/admin/categories", {
        method: "POST",
        body: JSON.stringify({ name: String(data.get("name") || ""), description: String(data.get("description") || ""), sort_order: 0 }),
      });
      setNotice("Category added");
      await loadTab(tab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add category.");
    } finally {
      setBusy(false);
    }
  }

  async function createVariant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    try {
      await api("/admin/variants", {
        method: "POST",
        body: JSON.stringify({
          product_id: String(data.get("product_id") || ""),
          size: String(data.get("size") || ""),
          color: String(data.get("color") || ""),
          color_hex: String(data.get("color_hex") || "#0D312B"),
          stock: Number(data.get("stock")),
        }),
      });
      setNotice("Product variant created");
      await loadTab(tab);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not add variant.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadImage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const productId = String(form.get("product_id") || "");
    const view = String(form.get("view") || "front");
    const artwork = form.get("image");
    form.delete("product_id");
    form.delete("view");
    form.delete("alt");
    if (artwork instanceof File && !artwork.name) form.delete("image");
    try {
      await api(`/admin/products/${productId}/images?view=${encodeURIComponent(view)}`, { method: "POST", body: form });
      setNotice("Product image uploaded");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not upload image.");
    } finally {
      setBusy(false);
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const data = new FormData(event.currentTarget);
    const values: Settings = {};
    for (const [key, value] of data.entries()) values[key] = String(value);
    try {
      setSettings(await api<Settings>("/admin/settings", { method: "PUT", body: JSON.stringify({ values }) }));
      setNotice("Store settings saved");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save settings.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProduct(product: AdminProduct) {
    if (!window.confirm(`Remove ${product.name} from the catalogue?`)) return;
    setBusy(true);
    try {
      await api(`/admin/products/${product.id}`, { method: "DELETE" });
      await loadTab(tab);
      setNotice("Product removed");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not delete product.");
    } finally {
      setBusy(false);
    }
  }

  if (!authenticated) return <div className="admin-login-page"><div className="admin-login-brand"><span>த</span><p>தமிழ் <i>Drifts</i><small>STUDIO ADMIN</small></p></div><form className="admin-login-card" onSubmit={(event) => void signIn(event)}><p className="admin-eyebrow">PRIVATE WORKSPACE</p><h1>Good to see you.</h1><p className="admin-muted">Sign in with your provisioned admin account.</p><label>Email<input name="email" type="email" autoComplete="username" required /></label><label>Password<input name="password" type="password" autoComplete="current-password" required /></label>{error && <p className="admin-error">{error}</p>}<button disabled={busy}>{busy ? "Signing in…" : "Sign in to your studio"}</button><a href="/">← Back to the store</a></form></div>;

  return <div className="admin-layout">
    <aside className="admin-sidebar"><a className="admin-logo" href="/"><span>த</span><div>தமிழ் Drifts<small>STUDIO ADMIN</small></div></a><p className="admin-side-label">WORKSPACE</p><nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? "current" : ""} onClick={() => setTab(item.id)}><span>{item.icon}</span>{item.label}{item.id === "orders" && summary?.pending_orders ? <i>{summary.pending_orders}</i> : null}</button>)}</nav><div className="admin-sidebar-bottom"><a href="/">↗ View storefront</a><button onClick={signOut}>↪ Sign out</button></div></aside>
    <main className="admin-main"><header className="admin-topbar"><div><p className="admin-eyebrow">TAMIL DRIFTS · WORKSPACE</p><h1>{tabs.find((item) => item.id === tab)?.label}</h1></div><div className="admin-top-actions"><span className="admin-live-dot" />Store online<button onClick={() => void loadTab(tab)} aria-label="Refresh data">↻</button></div></header>
      {error && <div className="admin-alert">{error}<button onClick={() => setError("")}>×</button></div>}
      {notice && <div className="admin-notice" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}
      {tab === "dashboard" && <Dashboard summary={summary} onOrders={() => setTab("orders")} />}
      {tab === "orders" && <OrdersView rows={orders} busy={busy} onUpdate={(row, status) => void updateOrder(row, status)} />}
      {tab === "products" && <ProductsView rows={products} categories={categories} busy={busy} onCreate={createProduct} onCreateCategory={createCategory} onCreateVariant={createVariant} onUploadImage={uploadImage} onEdit={setEditingProduct} onDelete={(row) => void deleteProduct(row)} />}
      {tab === "inventory" && <InventoryView rows={inventory} busy={busy} onSave={(row, value) => void updateStock(row, value)} />}
      {tab === "customers" && <CustomersView rows={customers} busy={busy} onToggle={(row, value) => void setCustomerActive(row, value)} />}
      {tab === "reports" && <ReportsView data={report} />}
      {tab === "settings" && <SettingsView values={settings} busy={busy} onSave={saveSettings} />}
      {editingProduct && <ProductEdit product={editingProduct} categories={categories} busy={busy} onClose={() => setEditingProduct(null)} onSave={updateProduct} />}
      <footer className="admin-footer">தமிழ் Drifts · Operational data is stored securely in the store database.</footer>
    </main>
  </div>;
}

function Dashboard({ summary, onOrders }: { summary: Summary | null; onOrders: () => void }) {
  if (!summary) return <div className="admin-loading">Loading your studio…</div>;
  const cards = [
    ["Total revenue", money(summary.total_revenue), "All non-cancelled orders", "↗"],
    ["Orders", String(summary.total_orders), `${summary.pending_orders} need your attention`, "▤"],
    ["Customers", String(summary.total_customers), "Customer accounts", "♙"],
    ["Completed", String(summary.completed_orders), "Delivered orders", "✓"],
  ];
  return <><section className="admin-metric-grid">{cards.map(([label, value, note, icon]) => <article className="admin-metric" key={label}><div><span>{label}</span><b>{icon}</b></div><strong>{value}</strong><small>{note}</small></article>)}</section><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">LATEST ACTIVITY</p><h2>Recent orders</h2></div><button onClick={onOrders}>All orders →</button></div>{summary.recent_orders.length ? <div className="admin-table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Status</th><th>Total</th></tr></thead><tbody>{summary.recent_orders.map((row) => <tr key={row.id}><td><b>{row.order_number}</b><small>{new Date(row.created_at).toLocaleDateString()}</small></td><td>{row.customer_name}<small>{row.customer_phone}</small></td><td>{row.items.reduce((total, item) => total + item.qty, 0)} pieces</td><td><span className="status-pill">{row.status}</span></td><td>{money(row.total)}</td></tr>)}</tbody></table></div> : <p className="admin-empty">New orders will show up here.</p>}</section><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">KEEP AN EYE ON IT</p><h2>Low stock</h2></div></div>{summary.low_stock_products.length ? <div className="stock-alert-grid">{summary.low_stock_products.slice(0, 6).map((row) => <div key={row.variant_id}><span>{row.stock === 0 ? "OUT OF STOCK" : "LOW STOCK"}</span><b>{row.product}</b><small>{row.size} · {row.color} · SKU {row.sku}</small></div>)}</div> : <p className="admin-empty">Everything is stocked up.</p>}</section></>;
}

function OrdersView({ rows, busy, onUpdate }: { rows: AdminOrder[]; busy: boolean; onUpdate: (row: AdminOrder, status: string) => void }) {
  const statuses = ["Pending", "Confirmed", "Printing in Progress", "Quality Check", "Packed", "Shipped", "Delivered", "Cancelled", "Refunded"];
  return <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">FULFILMENT</p><h2>Orders ({rows.length})</h2></div></div><div className="admin-table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Update status</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.order_number}</b><small>{new Date(row.created_at).toLocaleString()}</small></td><td>{row.customer_name}<small>{row.customer_phone}</small></td><td>{row.items.map((item) => `${item.name} × ${item.qty}`).join(", ")}</td><td>{money(row.total)}</td><td><select disabled={busy} value={row.status} onChange={(event) => onUpdate(row, event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></td></tr>)}</tbody></table>{!rows.length && <p className="admin-empty">No orders yet.</p>}</div></section>;
}

function ProductsView({ rows, categories, busy, onCreate, onCreateCategory, onCreateVariant, onUploadImage, onEdit, onDelete }: { rows: AdminProduct[]; categories: Category[]; busy: boolean; onCreate: (event: FormEvent<HTMLFormElement>) => void; onCreateCategory: (event: FormEvent<HTMLFormElement>) => void; onCreateVariant: (event: FormEvent<HTMLFormElement>) => void; onUploadImage: (event: FormEvent<HTMLFormElement>) => void; onEdit: (row: AdminProduct) => void; onDelete: (row: AdminProduct) => void }) {
  return <><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">CATALOGUE</p><h2>Product list ({rows.length})</h2></div></div><div className="admin-table-wrap"><table><thead><tr><th>Product</th><th>Category</th><th>Variants</th><th>Availability</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.name}</b><small>/{row.slug}</small></td><td>{row.category}</td><td>{row.variants.length}</td><td><span className={row.in_stock ? "stock-state" : "stock-state out"}>{row.in_stock ? "In stock" : row.is_active ? "Out of stock" : "Archived"}</span></td><td><button disabled={busy} onClick={() => onEdit(row)}>Edit</button>{row.is_active && <button className="admin-delete" disabled={busy} onClick={() => onDelete(row)}>Archive</button>}</td></tr>)}</tbody></table></div></section><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">ADD TO THE COLLECTION</p><h2>New product</h2></div></div><form className="admin-form-grid" onSubmit={onCreate}><label>Product name<input name="name" required minLength={2} /></label><label>Tamil name<input name="name_ta" /></label><label>Category<select name="category_id" required>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Print type<select name="printing_type"><option>Custom</option><option>DTF</option></select></label><label>Price (₹)<input name="base_price" type="number" min="1" step="1" required /></label><label>Compare at (₹)<input name="compare_at_price" type="number" min="1" step="1" /></label><label className="admin-span-two">Description<textarea name="description" rows={3} /></label><button disabled={busy}>{busy ? "Saving…" : "Create product"}</button></form></section><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">PRODUCT VARIANTS</p><h2>Add a size and colour</h2></div></div><form className="admin-form-grid" onSubmit={onCreateVariant}><label>Product<select name="product_id" required>{rows.filter((row) => row.is_active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Size<select name="size">{["S", "M", "L", "XL", "XXL", "3XL"].map((size) => <option key={size}>{size}</option>)}</select></label><label>Colour name<input name="color" placeholder="Emerald" required /></label><label>Colour hex<input name="color_hex" defaultValue="#0D312B" pattern="#[0-9A-Fa-f]{6}" required /></label><label>Starting stock<input name="stock" type="number" min="0" defaultValue={0} required /></label><button disabled={busy}>Add variant</button></form></section><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">PRODUCT PHOTOGRAPHY</p><h2>Upload an image</h2></div></div><form className="admin-form-grid" onSubmit={onUploadImage} encType="multipart/form-data"><label>Product<select name="product_id" required>{rows.filter((row) => row.is_active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label>Image view<select name="view"><option>front</option><option>back</option><option>detail</option></select></label><label className="admin-span-two">Image file<input name="image" type="file" accept="image/jpeg,image/png,image/webp" required /></label><button disabled={busy}>Upload image</button></form></section><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">COLLECTION GROUPS</p><h2>Add a category</h2></div></div><form className="admin-form-grid" onSubmit={onCreateCategory}><label>Category name<input name="name" required minLength={2} /></label><label>Description<input name="description" /></label><button disabled={busy}>Add category</button></form></section></>;
}

function InventoryView({ rows, busy, onSave }: { rows: Inventory[]; busy: boolean; onSave: (row: Inventory, stock: number) => void }) {
  const [values, setValues] = useState<Record<string, number>>({});
  return <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">STOCK CONTROL</p><h2>Product variants ({rows.length})</h2></div></div><div className="admin-table-wrap"><table><thead><tr><th>SKU</th><th>Product</th><th>Variant</th><th>Stock</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.sku}</td><td>{row.product}</td><td>{row.size} · {row.color}</td><td><input className="stock-input" type="number" min="0" value={values[row.id] ?? row.stock} onChange={(event) => setValues({ ...values, [row.id]: Number(event.target.value) })} /></td><td><button disabled={busy} onClick={() => onSave(row, values[row.id] ?? row.stock)}>Save</button></td></tr>)}</tbody></table></div></section>;
}

function CustomersView({ rows, busy, onToggle }: { rows: Customer[]; busy: boolean; onToggle: (row: Customer, active: boolean) => void }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">CUSTOMER CARE</p><h2>Customers ({rows.length})</h2></div></div><div className="admin-table-wrap"><table><thead><tr><th>Name</th><th>Contact</th><th>Orders</th><th>Account</th><th /></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><b>{row.name}</b></td><td>{row.email}<small>{row.phone}</small></td><td>{row.orders}</td><td><span className={row.is_active ? "stock-state" : "stock-state out"}>{row.is_active ? "Active" : "Disabled"}</span></td><td><button disabled={busy} onClick={() => onToggle(row, !row.is_active)}>{row.is_active ? "Disable" : "Enable"}</button></td></tr>)}</tbody></table>{!rows.length && <p className="admin-empty">New customers will appear here.</p>}</div></section>;
}

function ReportsView({ data }: { data: { periods: { period: string; orders: number; revenue: number }[]; products: { name: string; qty: number; revenue: number }[] } | null }) {
  if (!data) return <div className="admin-loading">Loading reports…</div>;
  return <><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">MONTHLY PERFORMANCE</p><h2>Sales report</h2></div></div><div className="admin-table-wrap"><table><thead><tr><th>Month</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>{data.periods.map((row) => <tr key={row.period}><td>{row.period}</td><td>{row.orders}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></section><section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">WHAT PEOPLE LOVE</p><h2>Product performance</h2></div></div><div className="admin-table-wrap"><table><thead><tr><th>Product</th><th>Units</th><th>Revenue</th></tr></thead><tbody>{data.products.map((row) => <tr key={row.name}><td>{row.name}</td><td>{row.qty}</td><td>{money(row.revenue)}</td></tr>)}</tbody></table></div></section></>;
}

function SettingsView({ values, busy, onSave }: { values: Settings; busy: boolean; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  const fields: [string, string][] = [["business_name", "Business name"], ["phone", "Phone"], ["alt_phone", "Alternate phone"], ["email", "Email"], ["instagram", "Instagram username"], ["location", "Location"], ["whatsapp", "WhatsApp number"], ["shipping_flat", "Flat shipping (₹)"], ["free_shipping_above", "Free shipping above (₹)"], ["announcement", "Announcement"]];
  return <section className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-eyebrow">STORE PROFILE</p><h2>Business settings</h2></div></div><form key={JSON.stringify(values)} className="admin-form-grid" onSubmit={onSave}>{fields.map(([name, label]) => <label key={name}>{label}<input name={name} defaultValue={values[name] || ""} required={name !== "alt_phone" && name !== "announcement"} /></label>)}<input type="hidden" name="cod_enabled" value="false" /><label className="admin-toggle"><input name="cod_enabled" type="checkbox" value="true" defaultChecked={(values.cod_enabled || "true") === "true"} /> Cash on delivery enabled</label><button disabled={busy}>{busy ? "Saving…" : "Save store settings"}</button></form></section>;
}

function ProductEdit({ product, categories, busy, onClose, onSave }: { product: AdminProduct; categories: Category[]; busy: boolean; onClose: () => void; onSave: (event: FormEvent<HTMLFormElement>) => void }) {
  return <div className="admin-edit-overlay"><section className="admin-edit-card"><button className="admin-edit-close" onClick={onClose}>×</button><p className="admin-eyebrow">CATALOGUE EDIT</p><h2>{product.name}</h2><form className="admin-form-grid" onSubmit={onSave}><label>Product name<input name="name" required minLength={2} defaultValue={product.name} /></label><label>Tamil name<input name="name_ta" defaultValue={product.name_ta} /></label><label>Category<select name="category_id" defaultValue={product.category_id}>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label>Print type<select name="printing_type" defaultValue={product.printing_type}><option>Custom</option><option>DTF</option></select></label><label>Price (₹)<input name="base_price" type="number" min="1" defaultValue={product.base_price} required /></label><label>Compare at (₹)<input name="compare_at_price" type="number" min="1" defaultValue={product.compare_at_price || ""} /></label><label className="admin-span-two">Description<textarea name="description" rows={3} defaultValue={product.description} /></label><div className="admin-edit-checks">{[["is_featured", "Featured", product.is_featured], ["is_best_seller", "Best seller", product.is_best_seller], ["is_new", "New arrival", product.is_new], ["is_active", "Visible in store", product.is_active]].map(([name, label, checked]) => <label key={String(name)}><input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} />{String(label)}</label>)}</div><button disabled={busy}>{busy ? "Saving…" : "Save product"}</button></form></section></div>;
}
