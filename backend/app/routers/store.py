from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from pydantic import ValidationError
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..deps import get_user_from_token, require_user
from ..models import (
    CartItem,
    Category,
    CustomRequest,
    Order,
    Product,
    Testimonial,
    User,
    Variant,
)
from ..schemas import CartIn, CartQtyIn, CheckoutIn, TrackIn, clean_phone
from ..serializers import cart_line, order_public, product_card, product_detail, setting_map
from ..schemas import CouponCheck
from ..services.commerce import place_order, quote_coupon, shipping_for
from ..services.sheets import sync_custom
from ..services.storage import save_image

router = APIRouter(tags=["store"])


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/storefront/home")
def home(db: Session = Depends(get_db)):
    products = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.images), joinedload(Product.variants))
        .filter(Product.is_active.is_(True))
        .all()
    )
    categories = db.query(Category).order_by(Category.sort_order, Category.name).all()
    testimonials = (
        db.query(Testimonial)
        .filter(Testimonial.is_active.is_(True), Testimonial.name != "Sample story")
        .order_by(Testimonial.id)
        .limit(6)
        .all()
    )
    values = setting_map(db)
    return {
        "business": {
            "name": values.get("business_name", "தமிழ் Drifts"),
            "phone": values.get("phone", "8610751463"),
            "alt_phone": values.get("alt_phone", "9585561305"),
            "email": values.get("email", "thigazhadrifts@gmail.com"),
            "instagram": values.get("instagram", "thigazh_drifts"),
            "location": values.get("location", "Kottavadi, Yazhappadi"),
            "whatsapp": values.get("whatsapp", "919600311386"),
            "announcement": values.get("announcement", ""),
        },
        "categories": [
            {"id": item.id, "name": item.name, "slug": item.slug, "description": item.description}
            for item in categories
        ],
        "featured": [product_card(item) for item in products if item.is_featured][:8],
        "new_arrivals": [product_card(item) for item in products if item.is_new][:8],
        "best_sellers": [product_card(item) for item in products if item.is_best_seller][:8],
        "testimonials": [
            {"name": item.name, "place": item.place, "quote": item.quote, "rating": item.rating}
            for item in testimonials
        ],
        "shipping": {
            "flat": float(values.get("shipping_flat", "49") or 0),
            "free_above": float(values.get("free_shipping_above", "1499") or 0),
        },
    }


@router.get("/catalog/categories")
def categories(db: Session = Depends(get_db)):
    rows = db.query(Category).order_by(Category.sort_order, Category.name).all()
    return [
        {"id": row.id, "name": row.name, "slug": row.slug, "description": row.description}
        for row in rows
    ]


@router.get("/catalog/products")
def products(
    q: str = Query(default="", max_length=120),
    category: str = "",
    size: str = "",
    color: str = "",
    sort: str = "featured",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=12, ge=1, le=48),
    db: Session = Depends(get_db),
):
    query = (
        db.query(Product)
        .join(Category)
        .options(joinedload(Product.category), joinedload(Product.images), joinedload(Product.variants))
        .filter(Product.is_active.is_(True))
    )
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(or_(Product.name.ilike(term), Product.name_ta.ilike(term), Product.description.ilike(term)))
    if category:
        query = query.filter(Category.slug == category)
    if size:
        query = query.filter(Product.variants.any(Variant.size == size))
    if color:
        query = query.filter(Product.variants.any(Variant.color == color))
    if sort == "price_asc":
        query = query.order_by(Product.base_price.asc(), Product.name.asc())
    elif sort == "price_desc":
        query = query.order_by(Product.base_price.desc(), Product.name.asc())
    elif sort == "newest":
        query = query.order_by(Product.created_at.desc())
    else:
        query = query.order_by(Product.is_featured.desc(), Product.name.asc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [product_card(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
        "pages": (total + page_size - 1) // page_size,
    }


@router.get("/catalog/products/{slug}")
def product(slug: str, db: Session = Depends(get_db)):
    row = (
        db.query(Product)
        .options(joinedload(Product.category), joinedload(Product.images), joinedload(Product.variants))
        .filter(Product.slug == slug, Product.is_active.is_(True))
        .first()
    )
    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product_detail(row)


@router.post("/coupons/check")
def check_coupon(payload: CouponCheck, db: Session = Depends(get_db)):
    coupon, discount = quote_coupon(db, payload.code, payload.subtotal)
    return {"code": coupon.code, "discount": discount, "description": coupon.description}


@router.get("/cart")
def get_cart(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = (
        db.query(CartItem)
        .options(joinedload(CartItem.variant).joinedload(Variant.product).joinedload(Product.images))
        .filter(CartItem.user_id == user.id)
        .all()
    )
    lines = [cart_line(row) for row in rows]
    subtotal = round(sum(line["line_total"] for line in lines), 2)
    shipping = shipping_for(db, subtotal)
    return {"items": lines, "subtotal": subtotal, "shipping": shipping, "total": round(subtotal + shipping, 2)}


@router.post("/cart", status_code=201)
def add_to_cart(payload: CartIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    variant = db.get(Variant, payload.variant_id)
    if variant is None or not variant.is_active or not variant.product.is_active:
        raise HTTPException(status_code=404, detail="This product variant is unavailable")
    row = (
        db.query(CartItem)
        .filter(CartItem.user_id == user.id, CartItem.variant_id == variant.id)
        .first()
    )
    new_qty = payload.qty + (row.qty if row else 0)
    if new_qty > variant.stock:
        raise HTTPException(status_code=400, detail=f"Only {variant.stock} available")
    if row:
        row.qty = new_qty
    else:
        row = CartItem(user_id=user.id, variant_id=variant.id, qty=payload.qty)
        db.add(row)
    db.commit()
    db.refresh(row)
    return cart_line(row)


@router.patch("/cart/{item_id}")
def update_cart_item(
    item_id: str,
    payload: CartQtyIn,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    row = db.query(CartItem).filter(CartItem.id == item_id, CartItem.user_id == user.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    if payload.qty > row.variant.stock:
        raise HTTPException(status_code=400, detail=f"Only {row.variant.stock} available")
    row.qty = payload.qty
    db.commit()
    db.refresh(row)
    return cart_line(row)


@router.delete("/cart/{item_id}", status_code=204)
def remove_cart_item(item_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = db.query(CartItem).filter(CartItem.id == item_id, CartItem.user_id == user.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Cart item not found")
    db.delete(row)
    db.commit()


@router.post("/orders", status_code=201)
def checkout(
    payload: CheckoutIn,
    user: User | None = Depends(get_user_from_token),
    db: Session = Depends(get_db),
):
    order = place_order(db, user, payload)
    return order_public(order)


@router.post("/orders/with-artwork", status_code=201)
def checkout_with_artwork(
    payload: str = Form(),
    artwork: UploadFile = File(),
    user: User | None = Depends(get_user_from_token),
    db: Session = Depends(get_db),
):
    try:
        checkout_payload = CheckoutIn.model_validate_json(payload)
    except ValidationError as exc:
        raise HTTPException(status_code=422, detail="Invalid checkout details") from exc
    order = place_order(db, user, checkout_payload, artwork)
    return order_public(order)


@router.post("/orders/track")
def track_order(payload: TrackIn, db: Session = Depends(get_db)):
    order = (
        db.query(Order)
        .filter(Order.order_number == payload.order_number.strip().upper(), Order.customer_phone == payload.phone)
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="No order matched those details")
    return order_public(order)


@router.get("/orders")
def order_history(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Order)
        .filter(Order.user_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(100)
        .all()
    )
    return [order_public(row) for row in rows]


@router.post("/custom-requests", status_code=201)
def create_custom_request(
    name: str = Form(min_length=2, max_length=120),
    phone: str = Form(),
    email: str = Form(default=""),
    printing_type: str = Form(min_length=2, max_length=40),
    size: str = Form(min_length=1, max_length=10),
    color: str = Form(min_length=1, max_length=40),
    qty: int = Form(ge=1, le=500),
    instructions: str = Form(default="", max_length=2000),
    artwork: UploadFile | None = File(default=None),
    user: User | None = Depends(get_user_from_token),
    db: Session = Depends(get_db),
):
    try:
        normalized_phone = clean_phone(phone)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if email and "@" not in email:
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    artwork_url = save_image(artwork, "custom") if artwork else ""
    row = CustomRequest(
        user_id=user.id if user else None,
        name=name.strip(),
        phone=normalized_phone,
        email=email.strip().lower(),
        printing_type=printing_type.strip(),
        size=size.strip().upper(),
        color=color.strip(),
        qty=qty,
        instructions=instructions.strip(),
        artwork_url=artwork_url,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    sync_custom(db, row)
    return {"id": row.id, "status": row.status, "created_at": row.created_at.isoformat()}
