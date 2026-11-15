"""Google Sheets sync.

Passwords, hashes, tokens, and card data are never written. Business rows are
built from an explicit column list. If credentials are missing, the write is
logged as skipped and the local database remains the source of truth.
"""

import json
import math
from pathlib import Path
import re

from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Category, Coupon, CustomRequest, Order, Product, Setting, SyncLog, User, Variant, utcnow
from ..serializers import iso, money

SHEETS = [
    "Products",
    "Product_Variants",
    "Inventory",
    "Customers",
    "Orders",
    "Order_Artwork",
    "Order_Items",
    "Payments",
    "Custom_Requests",
    "Delivery",
    "Coupons",
    "Users",
    "Admin",
    "Settings",
    "Sync_Log",
]

HEADERS = {
    "Products": ["id", "name", "name_ta", "slug", "category", "description", "base_price", "compare_at_price", "printing_type", "is_featured", "is_best_seller", "is_new", "is_active", "updated_at"],
    "Product_Variants": ["id", "product_id", "sku", "size", "color", "color_hex", "price", "is_active", "updated_at"],
    "Inventory": ["id", "variant_id", "sku", "stock", "low_stock_threshold", "updated_at"],
    "Customers": ["id", "name", "email", "phone", "is_active", "created_at"],
    "Orders": ["id", "order_number", "customer_id", "customer_name", "customer_email", "customer_phone", "status", "payment_status", "payment_method", "subtotal", "shipping", "discount", "total", "coupon_code", "city", "pincode", "address", "idempotency_key", "created_at", "updated_at"],
    "Order_Artwork": ["id", "order_id", "order_number", "artwork_url", "created_at"],
    "Order_Items": ["id", "order_id", "product_id", "variant_id", "name", "size", "color", "qty", "unit_price", "line_total"],
    "Payments": ["id", "order_id", "provider", "status", "amount", "currency", "reference", "created_at", "updated_at"],
    "Custom_Requests": ["id", "customer_id", "name", "phone", "email", "printing_type", "size", "color", "qty", "instructions", "artwork_url", "status", "created_at"],
    "Delivery": ["id", "order_id", "status", "note", "created_at"],
    "Coupons": ["id", "code", "discount_type", "value", "min_order", "is_active", "description"],
    "Users": ["id", "name", "email", "phone", "role", "is_active", "created_at"],
    "Admin": ["id", "name", "email", "is_active", "created_at"],
    "Settings": ["key", "value", "updated_at"],
    "Sync_Log": ["id", "direction", "sheet", "status", "message", "created_at"],
}

FORBIDDEN = ("password", "hash", "token", "secret", "card", "cvv", "pan")


def assert_safe(row: dict) -> dict:
    for key in row:
        lowered = key.lower()
        if any(word in lowered for word in FORBIDDEN):
            raise ValueError(f"Refusing to sync sensitive column {key}")
    return {key: "" if value is None else value for key, value in row.items()}


def product_row(product: Product) -> dict:
    return assert_safe({
        "id": product.id,
        "name": product.name,
        "name_ta": product.name_ta,
        "slug": product.slug,
        "category": product.category.name if product.category else "",
        "description": product.description,
        "base_price": money(product.base_price),
        "compare_at_price": money(product.compare_at_price) if product.compare_at_price else "",
        "printing_type": product.printing_type,
        "is_featured": product.is_featured,
        "is_best_seller": product.is_best_seller,
        "is_new": product.is_new,
        "is_active": product.is_active,
        "updated_at": iso(product.updated_at),
    })


def variant_row(variant: Variant) -> dict:
    return assert_safe({
        "id": variant.id,
        "product_id": variant.product_id,
        "sku": variant.sku,
        "size": variant.size,
        "color": variant.color,
        "color_hex": variant.color_hex,
        "price": money(variant.price) if variant.price is not None else "",
        "is_active": variant.is_active,
        "updated_at": iso(variant.updated_at),
    })


def inventory_row(variant: Variant) -> dict:
    return assert_safe({
        "id": variant.id,
        "variant_id": variant.id,
        "sku": variant.sku,
        "stock": variant.stock,
        "low_stock_threshold": variant.low_stock_threshold,
        "updated_at": iso(variant.updated_at),
    })


def user_row(user: User) -> dict:
    return assert_safe({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": iso(user.created_at),
    })


def admin_row(user: User) -> dict:
    return assert_safe({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "is_active": user.is_active,
        "created_at": iso(user.created_at),
    })


def order_row(order: Order) -> dict:
    return assert_safe({
        "id": order.id,
        "order_number": order.order_number,
        "customer_id": order.user_id or "",
        "customer_name": order.customer_name,
        "customer_email": order.customer_email,
        "customer_phone": order.customer_phone,
        "status": order.status,
        "payment_status": order.payment_status,
        "payment_method": order.payment_method,
        "subtotal": money(order.subtotal),
        "shipping": money(order.shipping),
        "discount": money(order.discount),
        "total": money(order.total),
        "coupon_code": order.coupon_code,
        "city": order.city,
        "pincode": order.pincode,
        "address": order.address_line,
        "idempotency_key": order.idempotency_key or "",
        "created_at": iso(order.created_at),
        "updated_at": iso(order.updated_at),
    })


def customer_row(user: User) -> dict:
    return assert_safe({
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "phone": user.phone,
        "is_active": user.is_active,
        "created_at": iso(user.created_at),
    })


def _log(db: Session, direction: str, sheet: str, status: str, message: str, payload: dict | None = None) -> None:
    db.add(
        SyncLog(
            direction=direction,
            sheet=sheet,
            status=status,
            message=message[:500],
            payload=json.dumps(payload or {}, default=str)[:4000],
        )
    )
    db.commit()


def _service():
    settings = get_settings()
    path = settings.google_service_account_file
    if not path or not settings.google_sheet_id or not Path(path).exists():
        return None
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build
    except ImportError:
        return None
    creds = service_account.Credentials.from_service_account_file(
        path, scopes=["https://www.googleapis.com/auth/spreadsheets"]
    )
    return build("sheets", "v4", credentials=creds, cache_discovery=False)


def _ensure_tab(service, title: str) -> None:
    settings = get_settings()
    meta = service.spreadsheets().get(spreadsheetId=settings.google_sheet_id).execute()
    titles = [sheet["properties"]["title"] for sheet in meta.get("sheets", [])]
    if title not in titles:
        service.spreadsheets().batchUpdate(
            spreadsheetId=settings.google_sheet_id,
            body={"requests": [{"addSheet": {"properties": {"title": title}}}]},
        ).execute()


def upsert_row(db: Session, sheet: str, row: dict) -> None:
    row = assert_safe(row)
    headers = HEADERS[sheet]
    ordered = [row.get(header, "") for header in headers]
    service = _service()
    if service is None:
        _log(db, "push", sheet, "skipped", "Google Sheets is not configured", row)
        return
    key = str(row.get("id") or row.get("key") or "")
    try:
        _ensure_tab(service, sheet)
        sheet_id = get_settings().google_sheet_id
        existing = service.spreadsheets().values().get(spreadsheetId=sheet_id, range=f"{sheet}!A:Z").execute()
        values = existing.get("values", [])
        if not values:
            values = [headers]
            service.spreadsheets().values().update(
                spreadsheetId=sheet_id,
                range=f"{sheet}!A1",
                valueInputOption="USER_ENTERED",
                body={"values": [headers]},
            ).execute()
        match = None
        for index, current in enumerate(values[1:], start=2):
            if current and str(current[0]) == key:
                match = index
                break
        target = f"{sheet}!A{match}" if match else f"{sheet}!A{len(values) + 1}"
        service.spreadsheets().values().update(
            spreadsheetId=sheet_id,
            range=target,
            valueInputOption="USER_ENTERED",
            body={"values": [ordered]},
        ).execute()
        _log(db, "push", sheet, "ok", f"Upserted {key}")
    except Exception as exc:  # noqa: BLE001 - sync must not break checkout
        _log(db, "push", sheet, "failed", str(exc), row)


def sync_order(db: Session, order: Order) -> None:
    upsert_row(db, "Orders", order_row(order))
    if order.artwork:
        upsert_row(db, "Order_Artwork", assert_safe({
            "id": order.artwork.id,
            "order_id": order.id,
            "order_number": order.order_number,
            "artwork_url": order.artwork.artwork_url,
            "created_at": iso(order.artwork.created_at),
        }))
    for item in order.items:
        upsert_row(db, "Order_Items", assert_safe({
            "id": item.id,
            "order_id": item.order_id,
            "product_id": item.product_id,
            "variant_id": item.variant_id,
            "name": item.name,
            "size": item.size,
            "color": item.color,
            "qty": item.qty,
            "unit_price": money(item.unit_price),
            "line_total": money(item.line_total),
        }))
    for payment in order.payments:
        upsert_row(db, "Payments", assert_safe({
            "id": payment.id,
            "order_id": payment.order_id,
            "provider": payment.provider,
            "status": payment.status,
            "amount": money(payment.amount),
            "currency": payment.currency,
            "reference": payment.reference,
            "created_at": iso(payment.created_at),
            "updated_at": iso(payment.updated_at),
        }))
    for event in order.events:
        upsert_row(db, "Delivery", assert_safe({
            "id": event.id,
            "order_id": event.order_id,
            "status": event.status,
            "note": event.note,
            "created_at": iso(event.created_at),
        }))
    for item in order.items:
        variant = db.get(Variant, item.variant_id)
        if variant:
            upsert_row(db, "Inventory", inventory_row(variant))


def sync_user(db: Session, user: User) -> None:
    upsert_row(db, "Users", user_row(user))
    if user.role == "customer":
        upsert_row(db, "Customers", customer_row(user))
    if user.role == "admin":
        upsert_row(db, "Admin", admin_row(user))


def sync_custom(db: Session, request: CustomRequest) -> None:
    upsert_row(db, "Custom_Requests", assert_safe({
        "id": request.id,
        "customer_id": request.user_id or "",
        "name": request.name,
        "phone": request.phone,
        "email": request.email,
        "printing_type": request.printing_type,
        "size": request.size,
        "color": request.color,
        "qty": request.qty,
        "instructions": request.instructions,
        "artwork_url": request.artwork_url,
        "status": request.status,
        "created_at": iso(request.created_at),
    }))


def push_catalog(db: Session) -> dict:
    count = 0
    for product in db.query(Product).all():
        upsert_row(db, "Products", product_row(product))
        count += 1
        for variant in product.variants:
            upsert_row(db, "Product_Variants", variant_row(variant))
            upsert_row(db, "Inventory", inventory_row(variant))
            count += 2
    for coupon in db.query(Coupon).all():
        upsert_row(db, "Coupons", assert_safe({
            "id": coupon.id,
            "code": coupon.code,
            "discount_type": coupon.discount_type,
            "value": coupon.value,
            "min_order": coupon.min_order,
            "is_active": coupon.is_active,
            "description": coupon.description,
        }))
        count += 1
    for setting in db.query(Setting).all():
        if any(word in setting.key.lower() for word in FORBIDDEN):
            continue
        upsert_row(db, "Settings", assert_safe({"key": setting.key, "value": setting.value, "updated_at": iso(setting.updated_at)}))
        count += 1
    return {"pushed": count}


def retry_failed(db: Session) -> int:
    pending = db.query(SyncLog).filter(SyncLog.status == "failed", SyncLog.attempts < 5).all()
    done = 0
    for entry in pending:
        try:
            payload = json.loads(entry.payload or "{}")
            if payload and entry.sheet in HEADERS:
                entry.attempts += 1
                upsert_row(db, entry.sheet, payload)
                done += 1
        except Exception as exc:  # noqa: BLE001
            entry.attempts += 1
            entry.message = str(exc)[:500]
            entry.status = "failed"
            db.commit()
    return done


def apply_sheet_edit(db: Session, sheet: str, row: dict) -> str:
    """Apply an authorized spreadsheet edit. Orders are updated, never inserted."""
    if sheet == "Inventory":
        variant = db.get(Variant, str(row.get("variant_id") or row.get("id") or ""))
        if variant is None:
            return "variant not found"
        stock = int(float(row.get("stock") or 0))
        if stock < 0:
            raise ValueError("stock cannot be negative")
        variant.stock = stock
        if row.get("low_stock_threshold") not in (None, ""):
            threshold = int(float(row["low_stock_threshold"]))
            if threshold < 0:
                raise ValueError("low-stock threshold cannot be negative")
            variant.low_stock_threshold = threshold
        variant.updated_at = utcnow()
        from .commerce import audit

        audit(db, None, "sheet.inventory.update", "variant", variant.id, f"stock={variant.stock}")
    elif sheet == "Products":
        product = db.get(Product, str(row.get("id") or ""))
        if product is None:
            return "product not found"
        text_fields = {
            "name": (160, False),
            "name_ta": (160, True),
            "description": (5000, True),
            "printing_type": (40, True),
        }
        for field, (limit, allow_empty) in text_fields.items():
            if field in row:
                value = str(row[field] or "").strip()
                if (not value and not allow_empty) or len(value) > limit:
                    raise ValueError(f"invalid product {field}")
                setattr(product, field, value)
        if row.get("category") not in (None, ""):
            category = db.query(Category).filter(
                (Category.name == str(row["category"])) | (Category.slug == str(row["category"]))
            ).first()
            if category is None:
                raise ValueError("category not found")
            product.category_id = category.id
        if row.get("base_price") not in (None, ""):
            price = float(row["base_price"])
            if not math.isfinite(price) or price <= 0:
                raise ValueError("base price must be greater than zero")
            product.base_price = price
        if row.get("compare_at_price") not in (None, ""):
            compare_at = float(row["compare_at_price"])
            if not math.isfinite(compare_at) or compare_at <= 0:
                raise ValueError("compare-at price must be greater than zero")
            product.compare_at_price = compare_at
        for field in ("is_featured", "is_best_seller", "is_new", "is_active"):
            if field in row:
                setattr(product, field, _sheet_bool(row[field], field))
        product.updated_at = utcnow()
        from .commerce import audit

        audit(db, None, "sheet.product.update", "product", product.id, product.name)
    elif sheet == "Product_Variants":
        variant = db.get(Variant, str(row.get("id") or ""))
        if variant is None:
            return "variant not found"
        if row.get("sku") not in (None, ""):
            sku = str(row["sku"]).strip()
            duplicate = db.query(Variant).filter(Variant.sku == sku, Variant.id != variant.id).first()
            if not sku or duplicate:
                raise ValueError("SKU must be unique and non-empty")
            variant.sku = sku
        for field, limit in (("size", 10), ("color", 40)):
            if row.get(field) not in (None, ""):
                value = str(row[field]).strip()
                if len(value) > limit:
                    raise ValueError(f"invalid variant {field}")
                setattr(variant, field, value)
        if row.get("color_hex") not in (None, ""):
            color_hex = str(row["color_hex"])
            if not re.fullmatch(r"#[0-9A-Fa-f]{6}", color_hex):
                raise ValueError("color_hex must be a six-digit hex colour")
            variant.color_hex = color_hex
        if row.get("price") not in (None, ""):
            price = float(row["price"])
            if not math.isfinite(price) or price <= 0:
                raise ValueError("variant price must be greater than zero")
            variant.price = price
        elif "price" in row:
            variant.price = None
        if "is_active" in row:
            variant.is_active = _sheet_bool(row["is_active"], "is_active")
        duplicate = db.query(Variant).filter(
            Variant.product_id == variant.product_id,
            Variant.size == variant.size,
            Variant.color == variant.color,
            Variant.id != variant.id,
        ).first()
        if duplicate:
            raise ValueError("product size/colour variant already exists")
        variant.updated_at = utcnow()
        from .commerce import audit

        audit(db, None, "sheet.variant.update", "variant", variant.id, variant.sku)
    elif sheet == "Orders":
        order = db.get(Order, str(row.get("id") or ""))
        if order is None:
            order = db.query(Order).filter(Order.order_number == str(row.get("order_number") or "")).first()
        if order is None:
            return "order not found; new orders must be created in the app"
        status = str(row.get("status") or order.status)
        from .commerce import set_order_status

        set_order_status(db, order, status, "Updated from spreadsheet", None)
        return "order status updated"
    elif sheet == "Settings":
        key = str(row.get("key") or "")
        editable = {
            "business_name", "phone", "alt_phone", "email", "instagram", "location",
            "whatsapp", "shipping_flat", "free_shipping_above", "cod_enabled",
            "razorpay_enabled", "announcement",
        }
        if key not in editable or any(word in key.lower() for word in FORBIDDEN):
            return "ignored sensitive setting"
        value = str(row.get("value") or "").strip()
        if key in {"shipping_flat", "free_shipping_above"}:
            amount = float(value)
            if not math.isfinite(amount) or amount < 0:
                raise ValueError(f"{key} must be a non-negative number")
        if key.endswith("_enabled") and value.lower() not in {"true", "false"}:
            raise ValueError(f"{key} must be true or false")
        from .commerce import upsert_setting

        upsert_setting(db, key, value)
        from .commerce import audit

        audit(db, None, "sheet.settings.update", "setting", key)
    elif sheet == "Coupons":
        code = str(row.get("code") or "").upper()
        coupon = db.query(Coupon).filter(Coupon.code == code).first() if code else None
        if coupon is None:
            return "coupon not found"
        if row.get("is_active") not in (None, ""):
            coupon.is_active = _sheet_bool(row["is_active"], "is_active")
        if row.get("value") not in (None, ""):
            value = float(row["value"])
            if not math.isfinite(value) or value <= 0 or (coupon.discount_type == "percent" and value > 100):
                raise ValueError("coupon value is outside the allowed range")
            coupon.value = value
        if row.get("discount_type") not in (None, ""):
            discount_type = str(row["discount_type"]).lower()
            if discount_type not in {"percent", "flat"}:
                raise ValueError("coupon discount type must be percent or flat")
            coupon.discount_type = discount_type
        if row.get("min_order") not in (None, ""):
            min_order = float(row["min_order"])
            if not math.isfinite(min_order) or min_order < 0:
                raise ValueError("coupon minimum order must be non-negative")
            coupon.min_order = min_order
        if row.get("description") is not None:
            coupon.description = str(row["description"])[:180]
        from .commerce import audit

        audit(db, None, "sheet.coupon.update", "coupon", coupon.id, coupon.code)
    else:
        return "sheet is not editable from the webhook"
    db.commit()
    _log(db, "pull", sheet, "ok", "Applied spreadsheet edit")
    return "updated"


def _sheet_bool(value, field: str) -> bool:
    normalized = str(value).strip().lower()
    if normalized in {"1", "true", "yes"}:
        return True
    if normalized in {"0", "false", "no"}:
        return False
    raise ValueError(f"{field} must be true or false")
