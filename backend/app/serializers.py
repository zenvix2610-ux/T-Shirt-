from sqlalchemy.orm import Session

from .models import CartItem, Order, Product, Variant, utcnow


def iso(value) -> str | None:
    if value is None:
        return None
    return value.isoformat(timespec="seconds")


def money(value) -> float:
    return round(float(value or 0), 2)


def unit_price(variant: Variant) -> float:
    if variant.price is not None:
        return money(variant.price)
    return money(variant.product.base_price)


def product_image(product: Product) -> str:
    if not product.images:
        return ""
    return product.images[0].url


def variant_public(variant: Variant) -> dict:
    return {
        "id": variant.id,
        "sku": variant.sku,
        "size": variant.size,
        "color": variant.color,
        "color_hex": variant.color_hex,
        "price": unit_price(variant),
        "stock": variant.stock,
        "in_stock": variant.stock > 0 and variant.is_active,
        "low_stock": 0 < variant.stock <= variant.low_stock_threshold,
    }


def product_card(product: Product) -> dict:
    active = [v for v in product.variants if v.is_active]
    prices = [unit_price(v) for v in active] or [money(product.base_price)]
    colors = []
    seen = set()
    for variant in active:
        if variant.color not in seen:
            seen.add(variant.color)
            colors.append({"name": variant.color, "hex": variant.color_hex})
    stock = sum(v.stock for v in active)
    return {
        "id": product.id,
        "slug": product.slug,
        "name": product.name,
        "name_ta": product.name_ta,
        "category": product.category.name if product.category else "",
        "category_slug": product.category.slug if product.category else "",
        "price": min(prices),
        "compare_at_price": money(product.compare_at_price) if product.compare_at_price else None,
        "image": product_image(product),
        "printing_type": product.printing_type,
        "is_featured": product.is_featured,
        "is_best_seller": product.is_best_seller,
        "is_new": product.is_new,
        "in_stock": stock > 0,
        "stock": stock,
        "colors": colors,
        "sizes": sorted({v.size for v in active}, key=size_rank),
    }


def product_detail(product: Product) -> dict:
    data = product_card(product)
    data.update(
        {
            "category_id": product.category_id,
            "description": product.description,
            "base_price": money(product.base_price),
            "is_active": product.is_active,
            "images": [
                {"id": image.id, "url": image.url, "alt": image.alt, "view": image.view}
                for image in product.images
            ],
            "variants": [variant_public(v) for v in product.variants if v.is_active],
        }
    )
    return data


def size_rank(size: str) -> int:
    order = {"XS": 0, "S": 1, "M": 2, "L": 3, "XL": 4, "XXL": 5, "3XL": 6}
    return order.get(size.upper(), 50)


def cart_line(item: CartItem) -> dict:
    variant = item.variant
    product = variant.product
    price = unit_price(variant)
    return {
        "id": item.id,
        "variant_id": variant.id,
        "product_id": product.id,
        "slug": product.slug,
        "name": product.name,
        "size": variant.size,
        "color": variant.color,
        "qty": item.qty,
        "unit_price": price,
        "line_total": money(price * item.qty),
        "stock": variant.stock,
        "image": product_image(product),
    }


def order_public(order: Order, *, include_events: bool = True) -> dict:
    payload = {
        "id": order.id,
        "order_number": order.order_number,
        "status": order.status,
        "payment_method": order.payment_method,
        "payment_status": order.payment_status,
        "subtotal": money(order.subtotal),
        "shipping": money(order.shipping),
        "discount": money(order.discount),
        "total": money(order.total),
        "coupon_code": order.coupon_code,
        "customer_name": order.customer_name,
        "customer_email": order.customer_email,
        "customer_phone": order.customer_phone,
        "address_line": order.address_line,
        "city": order.city,
        "pincode": order.pincode,
        "notes": order.notes,
        "created_at": iso(order.created_at),
        "updated_at": iso(order.updated_at),
        "items": [
            {
                "id": item.id,
                "name": item.name,
                "size": item.size,
                "color": item.color,
                "qty": item.qty,
                "unit_price": money(item.unit_price),
                "line_total": money(item.line_total),
                "image": item.image_url,
            }
            for item in order.items
        ],
        "payments": [
            {
                "id": payment.id,
                "provider": payment.provider,
                "status": payment.status,
                "amount": money(payment.amount),
                "currency": payment.currency,
                "reference": payment.reference,
                "created_at": iso(payment.created_at),
            }
            for payment in order.payments
        ],
    }
    if include_events:
        payload["events"] = [
            {"status": event.status, "note": event.note, "created_at": iso(event.created_at)}
            for event in sorted(order.events, key=lambda event: event.created_at or utcnow())
        ]
    return payload


def setting_map(db: Session) -> dict[str, str]:
    from .models import Setting

    return {row.key: row.value for row in db.query(Setting).all()}
