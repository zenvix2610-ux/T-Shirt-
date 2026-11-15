import secrets
from datetime import timedelta

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session, joinedload

from ..models import (
    ORDER_STATUSES,
    AuditLog,
    CartItem,
    Coupon,
    DeliveryEvent,
    Notification,
    Order,
    OrderArtwork,
    OrderItem,
    Payment,
    Product,
    Setting,
    User,
    Variant,
    utcnow,
)
from ..serializers import money, product_image, setting_map, unit_price
from .storage import save_image


def audit(db: Session, actor_id: str | None, action: str, entity: str, entity_id: str, detail: str = "") -> None:
    cleaned = detail.replace("password", "[redacted]")
    db.add(AuditLog(actor_id=actor_id, action=action, entity=entity, entity_id=entity_id, detail=cleaned[:2000]))


def notify(db: Session, user_id: str | None, title: str, body: str) -> None:
    if not user_id:
        return
    db.add(Notification(user_id=user_id, title=title, body=body))


def shipping_for(db: Session, subtotal: float) -> float:
    values = setting_map(db)
    flat = float(values.get("shipping_flat", "49") or 0)
    free_above = float(values.get("free_shipping_above", "1499") or 0)
    if subtotal <= 0 or subtotal >= free_above:
        return 0
    return money(flat)


def quote_coupon(db: Session, code: str, subtotal: float) -> tuple[Coupon | None, float]:
    if not code:
        return None, 0
    coupon = db.query(Coupon).filter(Coupon.code == code.strip().upper()).first()
    if coupon is None or not coupon.is_active:
        raise HTTPException(status_code=400, detail="This coupon is not active")
    if coupon.expires_at and coupon.expires_at < utcnow():
        raise HTTPException(status_code=400, detail="This coupon has expired")
    if subtotal < coupon.min_order:
        raise HTTPException(status_code=400, detail=f"Add ₹{money(coupon.min_order - subtotal):.0f} more to use this coupon")
    if coupon.discount_type == "percent":
        discount = subtotal * (coupon.value / 100)
    else:
        discount = coupon.value
    return coupon, money(min(discount, subtotal))


def load_lines(db: Session, user: User | None, raw_items: list | None) -> list[tuple[Variant, int]]:
    if raw_items:
        pairs = [(item.variant_id, item.qty) for item in raw_items]
    elif user is not None:
        cart = (
            db.query(CartItem)
            .options(joinedload(CartItem.variant).joinedload(Variant.product).joinedload(Product.images))
            .filter(CartItem.user_id == user.id)
            .all()
        )
        pairs = [(item.variant_id, item.qty) for item in cart]
    else:
        pairs = []
    if not pairs:
        raise HTTPException(status_code=400, detail="Your cart is empty")
    lines: list[tuple[Variant, int]] = []
    for variant_id, qty in pairs:
        variant = (
            db.query(Variant)
            .options(joinedload(Variant.product).joinedload(Product.images), joinedload(Variant.product).joinedload(Product.category))
            .filter(Variant.id == variant_id)
            .first()
        )
        if variant is None or not variant.is_active or not variant.product.is_active:
            raise HTTPException(status_code=400, detail="A selected product is no longer available")
        if qty > variant.stock:
            raise HTTPException(
                status_code=400,
                detail=f"Only {variant.stock} left for {variant.product.name} ({variant.size} / {variant.color})",
            )
        lines.append((variant, qty))
    return lines


def place_order(db: Session, user: User | None, payload, artwork: UploadFile | None = None) -> Order:
    existing = db.query(Order).filter(Order.idempotency_key == payload.idempotency_key).first()
    if existing:
        if artwork and existing.artwork is None:
            existing.artwork = OrderArtwork(artwork_url=save_image(artwork, "orders"))
            db.commit()
            db.refresh(existing)
            from .sheets import sync_order

            sync_order(db, existing)
        return existing

    values = setting_map(db)
    if payload.payment_method == "cod" and values.get("cod_enabled", "true") != "true":
        raise HTTPException(status_code=400, detail="Cash on delivery is not available right now")
    if payload.payment_method != "cod":
        from ..config import get_settings

        if not get_settings().razorpay_ready or values.get("razorpay_enabled", "false") != "true":
            raise HTTPException(status_code=400, detail="Online payment is not enabled yet. Choose cash on delivery.")

    lines = load_lines(db, user, payload.items)
    subtotal = money(sum(unit_price(variant) * qty for variant, qty in lines))
    _, discount = quote_coupon(db, payload.coupon_code, subtotal)
    shipping = shipping_for(db, subtotal)
    total = money(subtotal - discount + shipping)
    address = payload.line1 if not payload.line2 else f"{payload.line1}, {payload.line2}"

    for variant, qty in lines:
        locked = db.query(Variant).filter(Variant.id == variant.id).with_for_update().one()
        if locked.stock < qty:
            raise HTTPException(status_code=400, detail=f"Not enough stock for {locked.sku}")
        locked.stock -= qty
        locked.updated_at = utcnow()

    order = Order(
        order_number=next_order_number(db),
        user_id=user.id if user else None,
        customer_name=payload.name.strip(),
        customer_email=payload.email,
        customer_phone=payload.phone,
        status="Pending",
        payment_method=payload.payment_method,
        payment_status="cod_pending" if payload.payment_method == "cod" else "pending",
        subtotal=subtotal,
        shipping=shipping,
        discount=discount,
        total=total,
        coupon_code=payload.coupon_code.strip().upper(),
        address_line=address,
        city=payload.city.strip(),
        pincode=payload.pincode,
        notes=payload.notes.strip(),
        idempotency_key=payload.idempotency_key,
        stock_committed=True,
    )
    db.add(order)
    db.flush()
    if artwork:
        order.artwork = OrderArtwork(artwork_url=save_image(artwork, "orders"))
    for variant, qty in lines:
        price = unit_price(variant)
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=variant.product_id,
                variant_id=variant.id,
                name=variant.product.name,
                size=variant.size,
                color=variant.color,
                qty=qty,
                unit_price=price,
                line_total=money(price * qty),
                image_url=product_image(variant.product),
            )
        )
    db.add(
        Payment(
            order_id=order.id,
            provider="cod" if payload.payment_method == "cod" else "razorpay",
            status=order.payment_status,
            amount=total,
            reference="",
        )
    )
    db.add(DeliveryEvent(order_id=order.id, status="Pending", note="Order placed"))
    if user is not None:
        db.query(CartItem).filter(CartItem.user_id == user.id).delete()
        notify(db, user.id, "Order placed", f"We received {order.order_number}. We will confirm it shortly.")
    admins = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).all()
    for admin in admins:
        notify(db, admin.id, "New order received", f"{order.order_number} · {order.customer_name}")
    audit(db, user.id if user else None, "order.create", "order", order.id, order.order_number)
    db.commit()
    db.refresh(order)
    from .sheets import sync_order

    sync_order(db, order)
    return order


def next_order_number(db: Session) -> str:
    stamp = utcnow().strftime("%Y%m%d")
    for _ in range(5):
        number = f"TD-{stamp}-{secrets.token_hex(2).upper()}"
        if db.query(Order).filter(Order.order_number == number).first() is None:
            return number
    raise HTTPException(status_code=500, detail="Could not allocate an order number")


def restore_stock(db: Session, order: Order) -> None:
    if not order.stock_committed:
        return
    for item in order.items:
        variant = db.get(Variant, item.variant_id)
        if variant:
            variant.stock += item.qty
            variant.updated_at = utcnow()
    order.stock_committed = False


def set_order_status(db: Session, order: Order, status: str, note: str, actor_id: str | None) -> Order:
    if status not in ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Unknown order status")
    if status in {"Cancelled", "Refunded"}:
        restore_stock(db, order)
        if status == "Refunded":
            order.payment_status = "refunded"
            for payment in order.payments:
                payment.status = "refunded"
                payment.updated_at = utcnow()
    order.status = status
    order.updated_at = utcnow()
    db.add(DeliveryEvent(order_id=order.id, status=status, note=note or f"Status updated to {status}"))
    notify(db, order.user_id, f"Order {order.order_number}", f"Status: {status}. {note}".strip())
    audit(db, actor_id, "order.status", "order", order.id, status)
    db.commit()
    db.refresh(order)
    from .sheets import sync_order

    sync_order(db, order)
    return order


def sales_report(db: Session, span: str) -> dict:
    orders = db.query(Order).filter(~Order.status.in_(["Cancelled", "Refunded"])).all()
    buckets: dict[str, dict] = {}
    product_qty: dict[str, int] = {}
    product_revenue: dict[str, float] = {}
    now = utcnow()
    for order in orders:
        if span == "daily":
            if order.created_at < now - timedelta(days=14):
                continue
            key = order.created_at.strftime("%Y-%m-%d")
        elif span == "weekly":
            if order.created_at < now - timedelta(days=84):
                continue
            key = f"{order.created_at.isocalendar().year}-W{order.created_at.isocalendar().week:02d}"
        else:
            if order.created_at < now - timedelta(days=365):
                continue
            key = order.created_at.strftime("%Y-%m")
        bucket = buckets.setdefault(key, {"period": key, "orders": 0, "revenue": 0})
        bucket["orders"] += 1
        bucket["revenue"] = money(bucket["revenue"] + order.total)
        for item in order.items:
            product_qty[item.name] = product_qty.get(item.name, 0) + item.qty
            product_revenue[item.name] = money(product_revenue.get(item.name, 0) + item.line_total)
    products = [
        {"name": name, "qty": product_qty[name], "revenue": product_revenue[name]}
        for name in sorted(product_qty, key=lambda name: product_qty[name], reverse=True)
    ]
    return {"range": span, "periods": [buckets[key] for key in sorted(buckets)], "products": products}


def upsert_setting(db: Session, key: str, value: str) -> None:
    row = db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value
        row.updated_at = utcnow()
