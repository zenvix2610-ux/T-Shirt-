import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api, assetUrl, clearSession, getToken, money, setSession } from "./api";

type Variant = {
  id: string;
  size: string;
  color: string;
  color_hex: string;
  price: number;
  stock: number;
  in_stock: boolean;
};

type Product = {
  id: string;
  slug: string;
  name: string;
  name_ta: string;
  category: string;
  category_slug: string;
  price: number;
  compare_at_price: number | null;
  image: string;
  description?: string;
  printing_type: string;
  is_featured: boolean;
  is_new: boolean;
  is_best_seller: boolean;
  in_stock: boolean;
  sizes: string[];
  colors: { name: string; hex: string }[];
  images?: { url: string; alt: string; view: string }[];
  variants?: Variant[];
};

type Category = { id: string; name: string; slug: string; description: string };
type CartLine = { id?: string; cartId?: string; variantId: string; name: string; size: string; color: string; qty: number; price: number; stock: number; image: string };
type HomeData = {
  business: { name: string; phone: string; email: string; instagram: string; location: string; whatsapp: string; announcement: string };
  categories: Category[];
  featured: Product[];
  new_arrivals: Product[];
  best_sellers: Product[];
  testimonials: { name: string; place: string; quote: string; rating: number }[];
  shipping: { flat: number; free_above: number };
};
type AuthUser = { id: string; name: string; email: string; phone: string; role: string };

const emptyHome: HomeData = {
  business: { name: "தமிழ் Drifts", phone: "8610751463", email: "thigazhadrifts@gmail.com", instagram: "thigazh_drifts", location: "Kottavadi, Yazhappadi", whatsapp: "919600311386", announcement: "" },
  categories: [],
  featured: [],
  new_arrivals: [],
  best_sellers: [],
  testimonials: [],
  shipping: { flat: 49, free_above: 1499 },
};

function readCart(): CartLine[] {
  try {
    return JSON.parse(localStorage.getItem("td_cart") || "[]") as CartLine[];
  } catch {
    return [];
  }
}

function mapRemoteCart(items: { id: string; variant_id: string; name: string; size: string; color: string; qty: number; unit_price: number; stock: number; image: string }[]): CartLine[] {
  return items.map((item) => ({
    cartId: item.id,
    variantId: item.variant_id,
    name: item.name,
    size: item.size,
    color: item.color,
    qty: item.qty,
    price: item.unit_price,
    stock: item.stock,
    image: assetUrl(item.image),
  }));
}

function productAssets(product: Product): Product {
  return {
    ...product,
    image: assetUrl(product.image),
    images: product.images?.map((image) => ({ ...image, url: assetUrl(image.url) })),
  };
}

function Icon({ name }: { name: "search" | "bag" | "user" | "arrow" | "close" }) {
  const paths = {
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
    bag: <><path d="M5 8h14l1 12H4L5 8Z" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    user: <><circle cx="12" cy="8" r="3.3" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function App() {
  const [home, setHome] = useState<HomeData>(emptyHome);
  const [products, setProducts] = useState<Product[]>([]);
  const [activePage, setActivePage] = useState<"home" | "shop" | "custom">("home");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [sort, setSort] = useState("featured");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cart, setCart] = useState<CartLine[]>(readCart);
  const [cartOpen, setCartOpen] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [selectedColor, setSelectedColor] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [notice, setNotice] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const cartQty = useMemo(() => cart.reduce((total, item) => total + item.qty, 0), [cart]);
  const subtotal = useMemo(() => cart.reduce((total, item) => total + item.qty * item.price, 0), [cart]);
  const shipping = subtotal === 0 || subtotal >= home.shipping.free_above ? 0 : home.shipping.flat;
  const total = Math.max(0, subtotal - discount + shipping);
  const availableSizes = useMemo(() => Array.from(new Set(products.flatMap((item) => item.sizes))).sort(), [products]);
  const availableColors = useMemo(() => {
    const values = new Map<string, { name: string; hex: string }>();
    products.forEach((item) => item.colors.forEach((value) => values.set(value.name, value)));
    return Array.from(values.values());
  }, [products]);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [homeData, catalog] = await Promise.all([
        api<HomeData>("/storefront/home"),
        api<{ items: Product[] }>(`/catalog/products?page_size=48&sort=${sort}${category ? `&category=${encodeURIComponent(category)}` : ""}${search ? `&q=${encodeURIComponent(search)}` : ""}${size ? `&size=${encodeURIComponent(size)}` : ""}${color ? `&color=${encodeURIComponent(color)}` : ""}`),
      ]);
      setHome({
        ...homeData,
        featured: homeData.featured.map(productAssets),
        new_arrivals: homeData.new_arrivals.map(productAssets),
        best_sellers: homeData.best_sellers.map(productAssets),
      });
      setProducts(catalog.items.map(productAssets));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The store could not be reached.");
    } finally {
      setLoading(false);
    }
  }, [category, color, search, size, sort]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  useEffect(() => {
    localStorage.setItem("td_cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    if (couponCode) {
      setCouponCode("");
      setDiscount(0);
      setCouponMessage("Your bag changed. Apply the code again.");
    }
  }, [subtotal]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void api<AuthUser>("/auth/me")
      .then(setAuthUser)
      .then(async () => {
        const remote = await api<{ items: Parameters<typeof mapRemoteCart>[0] }>("/cart");
        setCart(mapRemoteCart(remote.items));
      })
      .catch(() => {
        clearSession();
        setAuthUser(null);
      });
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3200);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function chooseProduct(product: Product) {
    setSelected(product);
    const first = product.variants?.find((variant) => variant.in_stock);
    setSelectedSize(first?.size || product.sizes[0] || "");
    setSelectedColor(first?.color || product.colors[0]?.name || "");
  }

  async function addVariant(product: Product, variant: Variant) {
    const existing = cart.find((item) => item.variantId === variant.id);
    if (!getToken() && existing && existing.qty >= variant.stock) {
      setNotice(`Only ${variant.stock} available`);
      return;
    }
    const line: CartLine = {
      variantId: variant.id,
      name: product.name,
      size: variant.size,
      color: variant.color,
      qty: 1,
      price: variant.price,
      stock: variant.stock,
      image: product.image,
    };
    try {
      if (getToken()) {
        await api("/cart", { method: "POST", body: JSON.stringify({ variant_id: variant.id, qty: 1 }) });
        const remote = await api<{ items: Parameters<typeof mapRemoteCart>[0] }>("/cart");
        setCart(mapRemoteCart(remote.items));
      } else {
        setCart((current) => {
          const existing = current.find((item) => item.variantId === line.variantId);
          if (existing) return current.map((item) => item.variantId === line.variantId ? { ...item, qty: item.qty + 1 } : item);
          return [...current, line];
        });
      }
      setNotice(`${product.name} added to your bag`);
      setSelected(null);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not add that item.");
    }
  }

  async function changeQty(item: CartLine, qty: number) {
    if (qty < 1) {
      await removeLine(item);
      return;
    }
    if (qty > item.stock) {
      setNotice(`Only ${item.stock} available`);
      return;
    }
    if (item.cartId && getToken()) {
      try {
        await api(`/cart/${item.cartId}`, { method: "PATCH", body: JSON.stringify({ qty }) });
        const remote = await api<{ items: Parameters<typeof mapRemoteCart>[0] }>("/cart");
        setCart(mapRemoteCart(remote.items));
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : "Could not update your bag.");
      }
      return;
    }
    setCart((current) => current.map((line) => line.variantId === item.variantId ? { ...line, qty } : line));
  }

  async function removeLine(item: CartLine) {
    if (item.cartId && getToken()) {
      try {
        await api(`/cart/${item.cartId}`, { method: "DELETE" });
      } catch (reason) {
        setNotice(reason instanceof Error ? reason.message : "Could not remove that item.");
        return;
      }
    }
    setCart((current) => current.filter((line) => line.variantId !== item.variantId));
  }

  async function handleCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cart.length) return;
    setSubmitting(true);
    setError("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = {
      name: String(form.get("name") || ""),
      phone: String(form.get("phone") || ""),
      email: String(form.get("email") || ""),
      line1: String(form.get("line1") || ""),
      city: String(form.get("city") || ""),
      pincode: String(form.get("pincode") || ""),
      payment_method: "cod",
      coupon_code: couponCode,
      notes: String(form.get("notes") || ""),
      idempotency_key: crypto.randomUUID(),
      items: cart.map((line) => ({ variant_id: line.variantId, qty: line.qty })),
    };
    try {
      const order = await api<{ order_number: string }>("/orders", { method: "POST", body: JSON.stringify(payload) });
      setOrderNumber(order.order_number);
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not place the order.");
    } finally {
      setSubmitting(false);
    }
  }

  async function applyCoupon(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCouponMessage("");
    try {
      const result = await api<{ code: string; discount: number }>("/coupons/check", {
        method: "POST",
        body: JSON.stringify({ code: couponInput, subtotal }),
      });
      setCouponCode(result.code);
      setDiscount(result.discount);
      setCouponMessage(`Applied ${result.code} — ${money(result.discount)} off`);
    } catch (reason) {
      setCouponCode("");
      setDiscount(0);
      setCouponMessage(reason instanceof Error ? reason.message : "That coupon could not be applied.");
    }
  }

  async function handleSignIn(event: FormEvent<HTMLFormElement>, mode: "login" | "register") {
    event.preventDefault();
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const session = await api<{ access_token: string; refresh_token: string; user: AuthUser }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setSession(session.access_token, session.refresh_token);
      setAuthUser(session.user);
      const guestItems = cart;
      for (const item of guestItems) {
        await api("/cart", { method: "POST", body: JSON.stringify({ variant_id: item.variantId, qty: item.qty }) });
      }
      const remote = await api<{ items: Parameters<typeof mapRemoteCart>[0] }>("/cart");
      setCart(mapRemoteCart(remote.items));
      setAuthOpen(false);
      setNotice(`Welcome${session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}`);
    } catch (reason) {
      setNotice(reason instanceof Error ? reason.message : "Could not sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  const productCards = (items: Product[], title: string, caption: string) => (
    <section className="section-wrap">
      <div className="section-heading">
        <div><p className="eyebrow">{caption}</p><h2>{title}</h2></div>
        <button className="text-link" onClick={() => { setActivePage("shop"); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Explore collection <Icon name="arrow" /></button>
      </div>
      <div className="product-grid">
        {items.slice(0, 4).map((product) => <ProductCard key={product.id} product={product} onSelect={chooseProduct} />)}
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <div className="announcement"><span>{home.business.announcement || "Made for your people. Printed in Kottavadi."}</span><a href={`https://wa.me/${home.business.whatsapp}?text=${encodeURIComponent("Hi தமிழ் Drifts, I have a question about a custom order.")}`} target="_blank" rel="noreferrer">Talk to our studio <span aria-hidden>↗</span></a></div>
      <header className="site-header">
        <a className="brand-lockup" href="#" onClick={(event) => { event.preventDefault(); setActivePage("home"); }}>
          <span className="brand-mark">த</span><span className="brand-name">தமிழ் <i>Drifts</i><small>MADE TO MAKE A MARK</small></span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={activePage === "home" ? "active" : ""} onClick={() => setActivePage("home")}>Home</button>
          <button className={activePage === "shop" ? "active" : ""} onClick={() => setActivePage("shop")}>Shop all</button>
          <button className={activePage === "custom" ? "active" : ""} onClick={() => setActivePage("custom")}>Custom print</button>
          <a href="#story" onClick={() => setActivePage("home")}>Our story</a>
        </nav>
        <div className="header-actions">
          <button className="icon-button account-button" aria-label={authUser ? `Signed in as ${authUser.name}` : "Sign in"} onClick={() => authUser ? setAccountOpen(true) : setAuthOpen(true)}><Icon name="user" /><span>{authUser ? authUser.name.split(" ")[0] : "Account"}</span></button>
          <button className="icon-button bag-button" aria-label={`Open bag, ${cartQty} items`} onClick={() => setCartOpen(true)}><Icon name="bag" /><span>Bag</span><b>{cartQty}</b></button>
        </div>
      </header>

      {error && <div className="global-error"><span>{error}</span><button onClick={() => void loadCatalog()}>Retry</button><button aria-label="Dismiss error" onClick={() => setError("")}><Icon name="close" /></button></div>}
      {loading && <div className="loading-bar"><span /></div>}

      {activePage === "home" && <>
        <main>
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow gold-eyebrow"><span /> PRINTED WITH PURPOSE · KOTTAVADI</p>
              <h1>Wear your<br /><em>own story.</em></h1>
              <p className="hero-intro">Everyday tees, custom prints and team uniforms — made with care, for the moments that bring your people together.</p>
              <div className="hero-actions"><button className="button button-gold" onClick={() => setActivePage("shop")}>Explore the collection <Icon name="arrow" /></button><button className="button button-quiet" onClick={() => setActivePage("custom")}>Create your own <span>↗</span></button></div>
              <div className="hero-proof"><span className="proof-star">✳</span><span>Small-batch made<br /><b>Big on meaning</b></span><i /><span>★★★★★<br /><b>Made for your people</b></span></div>
            </div>
            <div className="hero-image">
              <div className="hero-image-frame">
                <img src={products.find((item) => item.is_featured)?.image || ""} alt="Premium custom printed T-shirt" />
                <span className="image-stamp">தமிழ்<br /><small>MADE HERE</small></span>
              </div>
              <div className="hero-caption"><span>01 — YOUR IDEA, OUR CRAFT</span><span>Scroll to discover ↓</span></div>
            </div>
            <div className="hero-vertical">CUSTOM PRINTS · GROUPS · EVERYDAY</div>
          </section>

          <div className="trust-strip"><span>Made in Tamil Nadu</span><i /><span>Prints that stay</span><i /><span>Small batches, always</span><i /><span>Made for every body</span></div>
          <section className="category-section section-wrap">
            <div className="section-heading"><div><p className="eyebrow">FIND YOUR FIT</p><h2>Made for your moment.</h2></div><p className="heading-note">A little something for<br />every kind of together.</p></div>
            <div className="category-grid">
              {home.categories.slice(0, 4).map((item, index) => <button key={item.id} className={`category-tile tile-${index + 1}`} onClick={() => { setCategory(item.slug); setActivePage("shop"); }}>
                <span className="tile-index">0{index + 1}</span><span className="tile-content"><b>{item.name}</b><small>{item.description}</small></span><span className="tile-arrow"><Icon name="arrow" /></span>
              </button>)}
            </div>
          </section>
          {productCards(home.featured, "A few favourites.", "THE DRIFT EDIT")}
          <section className="custom-banner" id="story">
            <div className="custom-banner-image"><img src={products.find((item) => item.is_new)?.image || ""} alt="T-shirt printing detail" /></div>
            <div className="custom-banner-copy"><p className="eyebrow gold-eyebrow">YOUR IDEA, MADE REAL</p><h2>Some things<br />should be <em>yours.</em></h2><p>Bring us a sketch, a phrase, a team name or just a feeling. We'll help you make a tee that feels like no one else's.</p><button className="button button-gold" onClick={() => setActivePage("custom")}>Start a custom order <Icon name="arrow" /></button></div>
            <span className="banner-scribble">made<br />with care</span>
          </section>
          {productCards(home.new_arrivals, "Just landed.", "FRESH OFF THE PRESS")}
          <section className="story-row section-wrap">
            <div><p className="eyebrow">ROOTED HERE. WORN EVERYWHERE.</p><h2>A good tee has<br />a little <em>more</em> in it.</h2></div>
            <div className="story-copy"><p>தமிழ் Drifts started with a simple thought: what if the clothes we wear could carry the things we care about? We print with intention, make in small batches, and keep every order personal — right here in Kottavadi.</p><a className="text-link" href={`https://www.instagram.com/${home.business.instagram}/`} target="_blank" rel="noreferrer">Follow our story <span>↗</span></a></div>
          </section>
          {home.testimonials.length > 0 && <section className="review-section">
            <div className="section-wrap"><div className="section-heading"><div><p className="eyebrow gold-eyebrow">KIND WORDS, GOOD PEOPLE</p><h2>From the ones who wear it.</h2></div><span className="rating">★★★★★ <small>5.0 · CUSTOMER STORIES</small></span></div>
              <div className="review-grid">{home.testimonials.slice(0, 3).map((item, index) => <blockquote key={`${item.name}-${index}`}><span>“</span><p>{item.quote}</p><footer><b>{item.name}</b><small>{item.place}</small></footer></blockquote>)}</div>
            </div>
          </section>}
          <section className="instagram-row section-wrap"><div><p className="eyebrow">A LITTLE MORE DRIFT</p><h2>Find us on Instagram.</h2><a href={`https://www.instagram.com/${home.business.instagram}/`} target="_blank" rel="noreferrer">@{home.business.instagram} ↗</a></div><p>New prints, real people, and the little things in between. Tag us in your தமிழ் Drifts.</p></section>
        </main>
      </>}

      {activePage === "shop" && <main className="shop-page section-wrap">
        <div className="page-intro"><p className="eyebrow">THE COLLECTION</p><h1>Good things,<br /><em>to wear often.</em></h1><p>Thoughtful prints. Comfortable fits. Made right here.</p></div>
        <div className="shop-tools"><label className="search-field"><Icon name="search" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tees, prints, moments..." /></label><div className="filter-chips"><button className={!category ? "selected" : ""} onClick={() => setCategory("")}>All pieces</button>{home.categories.map((item) => <button key={item.id} className={category === item.slug ? "selected" : ""} onClick={() => setCategory(category === item.slug ? "" : item.slug)}>{item.name}</button>)}</div><div className="select-filters"><label>Size <select value={size} onChange={(event) => setSize(event.target.value)}><option value="">All sizes</option>{availableSizes.map((value) => <option key={value}>{value}</option>)}</select></label><label>Colour <select value={color} onChange={(event) => setColor(event.target.value)}><option value="">All colours</option>{availableColors.map((value) => <option key={value.name}>{value.name}</option>)}</select></label><label className="sort-field">Sort by <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="featured">Featured</option><option value="newest">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option></select></label></div></div>
        {loading ? <div className="empty-state">Finding the good stuff…</div> : products.length ? <div className="product-grid shop-grid">{products.map((product) => <ProductCard key={product.id} product={product} onSelect={chooseProduct} />)}</div> : <div className="empty-state">No pieces found for that search. Try another word.</div>}
      </main>}

      {activePage === "custom" && <main className="custom-page section-wrap">
        <div className="custom-intro"><p className="eyebrow">MADE JUST FOR YOU</p><h1>Bring the idea.<br /><em>We'll make it wearable.</em></h1><p>Tell us what you have in mind. Our team will get back to you with a quote and next steps.</p></div>
        <CustomForm onSuccess={(message) => setNotice(message)} />
      </main>}

      <footer className="site-footer">
        <div className="footer-top"><a className="brand-lockup footer-brand" href="#" onClick={(event) => { event.preventDefault(); setActivePage("home"); }}><span className="brand-mark">த</span><span className="brand-name">தமிழ் <i>Drifts</i><small>MADE TO MAKE A MARK</small></span></a><p>Good tees. Good people.<br />A little more meaning.</p><a className="footer-cta" href={`https://wa.me/${home.business.whatsapp}?text=${encodeURIComponent("Hi தமிழ் Drifts, let's make something.")}`} target="_blank" rel="noreferrer">Let's make something <Icon name="arrow" /></a></div>
        <div className="footer-bottom"><span>© {new Date().getFullYear()} தமிழ் Drifts · {home.business.location}</span><span><a href={`tel:${home.business.phone}`}>{home.business.phone}</a> · <a href={`mailto:${home.business.email}`}>{home.business.email}</a></span><a href={`https://www.instagram.com/${home.business.instagram}/`} target="_blank" rel="noreferrer">Instagram ↗</a></div>
      </footer>

      <a className="whatsapp-float" href={`https://wa.me/${home.business.whatsapp}?text=${encodeURIComponent("Hi தமிழ் Drifts, I'd love to know more.")}`} target="_blank" rel="noreferrer" aria-label="Chat with தமிழ் Drifts on WhatsApp"><span>◉</span><b>Let's chat</b></a>

      {selected && <ProductModal product={selected} size={selectedSize} color={selectedColor} setSize={setSelectedSize} setColor={setSelectedColor} onClose={() => setSelected(null)} onAdd={(variant) => void addVariant(selected, variant)} />}
      {cartOpen && <div className="overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}><aside className="drawer"><div className="drawer-heading"><div><p className="eyebrow">YOUR GOOD THINGS</p><h2>Your bag <small>({cartQty})</small></h2></div><button className="close-button" aria-label="Close bag" onClick={() => setCartOpen(false)}><Icon name="close" /></button></div>
        <div className="drawer-lines">{cart.map((item) => <div className="cart-line" key={item.variantId}><img src={item.image} alt="" /><div className="cart-line-info"><b>{item.name}</b><small>{item.color} · {item.size}</small><div className="qty-control"><button aria-label="Decrease quantity" onClick={() => void changeQty(item, item.qty - 1)}>−</button><span>{item.qty}</span><button aria-label="Increase quantity" onClick={() => void changeQty(item, item.qty + 1)}>+</button></div></div><div className="cart-line-price"><b>{money(item.price * item.qty)}</b><button onClick={() => void removeLine(item)}>Remove</button></div></div>)}
          {!cart.length && <div className="empty-state">Your bag is taking a breather.<br /><button className="text-link" onClick={() => { setCartOpen(false); setActivePage("shop"); }}>Find your next favourite <Icon name="arrow" /></button></div>}
        </div>
        {cart.length > 0 && <div className="drawer-summary"><form className="coupon-form" onSubmit={(event) => void applyCoupon(event)}><input value={couponInput} onChange={(event) => setCouponInput(event.target.value)} placeholder="Have a code?" aria-label="Coupon code" /><button>Apply</button></form>{couponMessage && <p className={discount ? "coupon-success" : "coupon-error"}>{couponMessage}</p>}<div><span>Subtotal</span><b>{money(subtotal)}</b></div>{discount > 0 && <div><span>Discount{couponCode ? ` · ${couponCode}` : ""}</span><b>−{money(discount)}</b></div>}<div><span>Shipping</span><b>{shipping ? money(shipping) : "On us"}</b></div><div className="cart-total"><span>Total</span><b>{money(total)}</b></div><p>{subtotal < home.shipping.free_above ? `${money(home.shipping.free_above - subtotal)} away from free shipping` : "You unlocked free shipping."}</p><button className="button button-dark full-button" onClick={() => { setOrderNumber(""); setCartOpen(false); setCheckoutOpen(true); }}>Continue to checkout <Icon name="arrow" /></button><small>Secure checkout · COD available</small></div>}
      </aside></div>}

      {checkoutOpen && <div className="overlay"><div className="modal checkout-modal"><button className="close-button modal-close" aria-label="Close checkout" onClick={() => setCheckoutOpen(false)}><Icon name="close" /></button>{orderNumber ? <div className="success-panel"><span className="success-check">✓</span><p className="eyebrow">IT'S ON ITS WAY</p><h2>Order received.</h2><p>Your order number is <b>{orderNumber}</b>. We'll be in touch as it moves through the studio.</p><button className="button button-dark" onClick={() => { setOrderNumber(""); setActivePage("shop"); }}>Keep exploring</button></div> : <><p className="eyebrow">ALMOST YOURS</p><h2>Delivery details.</h2><p className="modal-lead">Cash on delivery is available. Payment options will appear here once enabled by the store.</p><form className="form-grid" onSubmit={(event) => void handleCheckout(event)}><label>Full name<input name="name" required minLength={2} defaultValue={authUser?.name || ""} autoComplete="name" /></label><label>Mobile number<input name="phone" required pattern="[0-9+ ()-]{10,16}" defaultValue={authUser?.phone || ""} autoComplete="tel" /></label><label className="field-wide">Email address<input name="email" type="email" required defaultValue={authUser?.email || ""} autoComplete="email" /></label><label className="field-wide">Address line<input name="line1" required minLength={4} autoComplete="street-address" /></label><label>City<input name="city" required minLength={2} autoComplete="address-level2" /></label><label>Pincode<input name="pincode" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="postal-code" /></label><label className="field-wide">Order notes <textarea name="notes" rows={2} maxLength={1000} placeholder="Delivery directions or any extra details" /></label><div className="field-wide payment-note"><span>Payment method</span><b>Cash on delivery</b></div>{error && <p className="form-error field-wide">{error}</p>}<button className="button button-dark full-button field-wide" disabled={submitting}>{submitting ? "Placing your order…" : `Place order · ${money(total)}`}</button></form></>}</div></div>}

      {authOpen && <AuthModal busy={submitting} onClose={() => setAuthOpen(false)} onSubmit={handleSignIn} />}
      {accountOpen && authUser && <AccountModal user={authUser} onClose={() => setAccountOpen(false)} onLogout={() => { void api("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: localStorage.getItem("td_refresh_token") || "" }) }).catch(() => undefined); clearSession(); setAuthUser(null); setAccountOpen(false); setNotice("You have signed out."); }} />}
      {notice && <div role="status" className="toast">{notice}</div>}
    </div>
  );
}

function ProductCard({ product, onSelect }: { product: Product; onSelect: (product: Product) => void }) {
  return <article className="product-card"><button className="product-visual" onClick={() => onSelect(product)} aria-label={`View ${product.name}`}><img src={product.image} alt={product.name} loading="lazy" />{product.is_new && <span className="product-tag">JUST LANDED</span>}<span className="quick-view">Take a closer look <Icon name="arrow" /></span></button><div className="product-meta"><div><p>{product.category} <span>·</span> {product.printing_type}</p><button onClick={() => onSelect(product)}>{product.name}</button><small className="tamil-name">{product.name_ta}</small></div><div className="price-stack"><b>{money(product.price)}</b>{product.compare_at_price && <del>{money(product.compare_at_price)}</del>}</div></div><div className="product-swatches">{product.colors.slice(0, 5).map((color) => <span key={color.name} title={color.name} style={{ backgroundColor: color.hex }} />)}<small>{product.sizes.slice(0, 4).join(" · ")}</small></div></article>;
}

function ProductModal({ product, size, color, setSize, setColor, onClose, onAdd }: { product: Product; size: string; color: string; setSize: (value: string) => void; setColor: (value: string) => void; onClose: () => void; onAdd: (variant: Variant) => void }) {
  const [imageIndex, setImageIndex] = useState(0);
  const images = product.images?.length ? product.images : [{ url: product.image, alt: product.name, view: "front" }];
  const variants = product.variants || [];
  const colors = product.colors.filter((item) => variants.some((variant) => variant.color === item.name && variant.stock > 0));
  const sizes = product.sizes.filter((item) => variants.some((variant) => variant.size === item && variant.color === color && variant.stock > 0));
  const variant = variants.find((item) => item.size === size && item.color === color && item.stock > 0);
  return <div className="overlay product-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="modal product-modal"><button className="close-button modal-close" aria-label="Close product details" onClick={onClose}><Icon name="close" /></button><div className="modal-product-image"><img src={images[Math.min(imageIndex, images.length - 1)].url} alt={images[Math.min(imageIndex, images.length - 1)].alt} />{images.length > 1 && <div className="image-switcher">{images.map((image, index) => <button key={image.url} className={index === imageIndex ? "current" : ""} onClick={() => setImageIndex(index)}>{image.view}</button>)}</div>}</div><div className="product-detail-copy"><p className="eyebrow">{product.category} · {product.printing_type}</p><h2>{product.name}</h2><p className="tamil-name detail-tamil">{product.name_ta}</p><div className="detail-price">{money(variant?.price ?? product.price)} {product.compare_at_price && <del>{money(product.compare_at_price)}</del>}</div><p className="detail-description">{product.description}</p><label className="option-label">Colour <b>{color}</b></label><div className="color-options">{colors.map((item) => <button key={item.name} title={item.name} aria-label={item.name} className={color === item.name ? "chosen" : ""} style={{ backgroundColor: item.hex }} onClick={() => { setColor(item.name); if (!variants.some((v) => v.color === item.name && v.size === size && v.stock > 0)) setSize(variants.find((v) => v.color === item.name && v.stock > 0)?.size || size); }} />)}</div><label className="option-label">Size <b>{size}</b></label><div className="size-options">{sizes.map((item) => <button key={item} className={size === item ? "chosen" : ""} onClick={() => setSize(item)}>{item}</button>)}</div><p className={`stock-note ${variant && variant.stock < 5 ? "low-stock" : ""}`}>{variant ? variant.stock < 5 ? `Only ${variant.stock} left in this size` : "In stock · made for you" : "Choose another colour or size"}</p><button className="button button-dark full-button" disabled={!variant} onClick={() => variant && onAdd(variant)}>Add to bag — {money(variant?.price ?? product.price)} <Icon name="arrow" /></button><p className="detail-footnote">Soft cotton · Thoughtfully printed · Made in Tamil Nadu</p></div></div></div>;
}

function CustomForm({ onSuccess }: { onSuccess: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const formElement = event.currentTarget;
      const form = new FormData(formElement);
      const artwork = form.get("artwork");
      if (artwork instanceof File && !artwork.name) form.delete("artwork");
      await api("/custom-requests", { method: "POST", body: form });
      formElement.reset();
      setFileName("");
      onSuccess("Your custom request is in. We'll be in touch soon.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "We could not send your request.");
    } finally {
      setBusy(false);
    }
  }
  return <form className="custom-form" onSubmit={(event) => void submit(event)}><div className="form-grid"><label>Your name<input name="name" required minLength={2} /></label><label>Mobile number<input name="phone" required pattern="[0-9+ ()-]{10,16}" /></label><label>Email address<input name="email" type="email" /></label><label>Printing type<select name="printing_type" required><option value="">Choose one</option><option>DTF</option><option>Custom print</option><option>Group order</option><option>Uniforms</option></select></label><label>Size<select name="size" required><option value="">Choose a size</option>{["S", "M", "L", "XL", "XXL", "3XL"].map((size) => <option key={size}>{size}</option>)}</select></label><label>Colour<input name="color" required placeholder="e.g. Emerald" /></label><label>Quantity<input name="qty" type="number" min={1} max={500} defaultValue={1} required /></label><label className="field-wide">Tell us about your idea<textarea name="instructions" rows={4} maxLength={2000} placeholder="Placement, print colours, event date, team name… whatever helps us picture it." /></label><label className="field-wide upload-field">Upload artwork <small>JPG, PNG or WEBP · max 8 MB</small><input type="file" name="artwork" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFileName(event.target.files?.[0]?.name || "")} /><span className="upload-box">＋ <b>{fileName || "Choose an image"}</b></span></label>{error && <p className="form-error field-wide">{error}</p>}<button className="button button-dark full-button field-wide" disabled={busy}>{busy ? "Sending your idea…" : "Send your custom request"} <Icon name="arrow" /></button></div><p className="form-note">Your artwork is only used to prepare this request. Our team will contact you before production.</p></form>;
}

function AuthModal({ busy, onClose, onSubmit }: { busy: boolean; onClose: () => void; onSubmit: (event: FormEvent<HTMLFormElement>, mode: "login" | "register") => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  return <div className="overlay"><div className="modal auth-modal"><button className="close-button modal-close" aria-label="Close account window" onClick={onClose}><Icon name="close" /></button><p className="eyebrow">A GOOD THING TO HAVE</p><h2>{mode === "login" ? "Welcome back." : "Let's get to know you."}</h2><p className="modal-lead">Sign in to keep your bag and orders close.</p><form className="form-grid" onSubmit={(event) => onSubmit(event, mode)}>{mode === "register" && <label className="field-wide">Your name<input name="name" required minLength={2} autoComplete="name" /></label>}{mode === "register" && <label className="field-wide">Mobile number<input name="phone" required pattern="[0-9+ ()-]{10,16}" autoComplete="tel" /></label>}<label className="field-wide">Email address<input name="email" type="email" required autoComplete="email" /></label><label className="field-wide">Password<input name="password" type="password" required minLength={mode === "register" ? 8 : 1} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label><button className="button button-dark full-button field-wide" disabled={busy}>{busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}</button></form><p className="auth-switch">{mode === "login" ? "New around here?" : "Already have an account?"} <button onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Create an account" : "Sign in"}</button></p></div></div>;
}

type AccountTab = "orders" | "addresses" | "wishlist" | "notifications" | "profile";
type AccountOrder = { id: string; order_number: string; status: string; total: number; created_at: string; items: { name: string; qty: number }[] };
type SavedAddress = { id: string; name: string; phone: string; line1: string; city: string; pincode: string; is_default: boolean };
type AccountNotice = { id: string; title: string; body: string; is_read: boolean; created_at: string };

function AccountModal({ user, onClose, onLogout }: { user: AuthUser; onClose: () => void; onLogout: () => void }) {
  const [tab, setTab] = useState<AccountTab>("orders");
  const [orders, setOrders] = useState<AccountOrder[]>([]);
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [notifications, setNotifications] = useState<AccountNotice[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    try {
      if (tab === "orders") setOrders(await api<AccountOrder[]>("/orders"));
      if (tab === "addresses") setAddresses(await api<SavedAddress[]>("/account/addresses"));
      if (tab === "wishlist") setWishlist((await api<Product[]>("/account/wishlist")).map(productAssets));
      if (tab === "notifications") setNotifications(await api<AccountNotice[]>("/account/notifications"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your account details.");
    }
  }, [tab]);

  useEffect(() => { void loadData(); }, [loadData]);

  async function addAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      await api("/account/addresses", { method: "POST", body: JSON.stringify(payload) });
      setSaved("Address saved.");
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your address.");
    } finally {
      setBusy(false);
    }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api("/account/profile", {
        method: "PATCH",
        body: JSON.stringify({ name: form.get("name"), phone: form.get("phone") }),
      });
      setSaved("Profile updated.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update your profile.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAddress(addressId: string) {
    try {
      await api(`/account/addresses/${addressId}`, { method: "DELETE" });
      await loadData();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove the address.");
    }
  }

  async function removeWish(productId: string) {
    try {
      await api(`/account/wishlist/${productId}`, { method: "DELETE" });
      setWishlist((current) => current.filter((product) => product.id !== productId));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not remove the saved piece.");
    }
  }

  async function markRead(item: AccountNotice) {
    try {
      await api(`/account/notifications/${item.id}/read`, { method: "PATCH" });
      setNotifications((current) => current.map((notice) => notice.id === item.id ? { ...notice, is_read: true } : notice));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update the notification.");
    }
  }

  return <div className="overlay"><div className="modal account-modal"><button className="close-button modal-close" aria-label="Close customer account" onClick={onClose}><Icon name="close" /></button><p className="eyebrow">YOUR LITTLE CORNER</p><h2>Hello, {user.name.split(" ")[0]}.</h2><div className="account-tabs">{(["orders", "addresses", "wishlist", "notifications", "profile"] as AccountTab[]).map((value) => <button key={value} className={tab === value ? "current" : ""} onClick={() => { setTab(value); setSaved(""); }}>{value}</button>)}</div>{error && <p className="form-error">{error}</p>}{saved && <p className="account-saved">{saved}</p>}
    {tab === "orders" && <div className="account-list">{orders.length ? orders.map((order) => <article key={order.id}><div><b>{order.order_number}</b><small>{new Date(order.created_at).toLocaleDateString()} · {order.items.reduce((qty, item) => qty + item.qty, 0)} piece(s)</small></div><div><span className="account-status">{order.status}</span><b>{money(order.total)}</b></div></article>) : <p className="empty-state">Your first order will find its way here.</p>}</div>}
    {tab === "addresses" && <div className="account-list">{addresses.map((address) => <article key={address.id}><div><b>{address.name} {address.is_default && <small className="default-tag">DEFAULT</small>}</b><small>{address.line1}, {address.city} · {address.pincode}</small></div><button className="account-remove" onClick={() => void deleteAddress(address.id)}>Remove</button></article>)}<form className="form-grid account-address-form" onSubmit={(event) => void addAddress(event)}><label>Name<input name="name" required defaultValue={user.name} /></label><label>Phone<input name="phone" required defaultValue={user.phone} /></label><label className="field-wide">Address<input name="line1" required minLength={4} /></label><label>City<input name="city" required /></label><label>Pincode<input name="pincode" required pattern="[0-9]{6}" /></label><label className="account-check"><input name="is_default" type="checkbox" value="true" /> Set as default</label><button className="button button-dark full-button field-wide" disabled={busy}>Save address</button></form></div>}
    {tab === "wishlist" && <div className="account-list">{wishlist.length ? wishlist.map((product) => <article key={product.id}><img className="account-wish-image" src={product.image} alt="" /><div><b>{product.name}</b><small>{money(product.price)} · {product.in_stock ? "In stock" : "Unavailable"}</small></div><button className="account-remove" onClick={() => void removeWish(product.id)}>Remove</button></article>) : <p className="empty-state">Save the pieces you like and find them here.</p>}</div>}
    {tab === "notifications" && <div className="account-list">{notifications.length ? notifications.map((item) => <article key={item.id} className={item.is_read ? "read-notification" : ""}><div><b>{item.title}</b><small>{item.body}</small></div>{!item.is_read && <button className="account-remove" onClick={() => void markRead(item)}>Mark read</button>}</article>) : <p className="empty-state">No new notes from the studio.</p>}</div>}
    {tab === "profile" && <form className="form-grid account-profile-form" onSubmit={(event) => void updateProfile(event)}><label className="field-wide">Name<input name="name" required minLength={2} defaultValue={user.name} /></label><label className="field-wide">Email<input value={user.email} disabled /></label><label className="field-wide">Mobile number<input name="phone" required defaultValue={user.phone} /></label><button className="button button-dark full-button field-wide" disabled={busy}>Save profile</button><button type="button" className="account-logout field-wide" onClick={onLogout}>Sign out</button></form>}
  </div></div>;
}
