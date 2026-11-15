import re
import secrets

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..deps import require_admin
from ..models import (
    ORDER_STATUSES,
    AuditLog,
    Category,
    Coupon,
    CustomRequest,
    Order,
    Product,
    ProductImage,
    SyncLog,
    User,
    Variant,
    new_id,
    utcnow,
)
from ..schemas import (
    CategoryIn,
    CouponIn,
    CustomerStatusIn,
    ProductIn,
    SettingsIn,
    StatusIn,
    StockIn,
    VariantIn,
)
from ..serializers import iso, order_public, product_detail, setting_map
from ..services.commerce import audit, sales_report, set_order_status, upsert_setting
from ..services.sheets import (
    inventory_row,
    product_row,
    push_catalog,
    retry_failed,
    upsert_row,
    variant_row,
)
from ..services.storage import save_image

router = APIRouter(prefix="/admin", tags=["admin"])


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or f"product-{new_id()[:8]}"


def admin_product_query(db: Session):
    return db.query(Product).options(
        joinedload(Product.category),
        joinedload(Product.images),
        joinedload(Product.variants),
    )


@router.get("/dashboard")
def dashboard(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    order_count = db.query(Order).count()
    revenue = (
        db.query(func.coalesce(func.sum(Order.total), 0))
        .filter(~Order.status.in_(["Cancelled", "Refunded"]))
        .scalar()
    )
    pending = db.query(Order).filter(Order.status == "Pending").count()
    completed = db.query(Order).filter(Order.status == "Delivered").count()
    customer_count = db.query(User).filter(User.role == "customer").count()
    low_stock = (
        db.query(Variant)
        .options(joinedload(Variant.product))
        .filter(Variant.is_active.is_(True), Variant.stock <= Variant.low_stock_threshold)
        .order_by(Variant.stock, Variant.sku)
        .limit(20)
        .all()
    )
    latest = db.query(Order).order_by(Order.created_at.desc()).limit(8).all()
    return {
        "total_sales": db.query(Order).filter(~Order.status.in_(["Cancelled", "Refunded"])).count(),
        "total_revenue": round(float(revenue or 0), 2),
        "total_orders": order_count,
        "pending_orders": pending,
        "completed_orders": completed,
        "total_customers": customer_count,
        "low_stock_products": [
            {
                "variant_id": row.id,
                "sku": row.sku,
                "product": row.product.name,
                "size": row.size,
                "color": row.color,
                "stock": row.stock,
                "threshold": row.low_stock_threshold,
            }
            for row in low_stock
        ],
        "recent_orders": [order_public(row, include_events=False) for row in latest],
    }


@router.get("/categories")
def list_categories(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(Category).order_by(Category.sort_order, Category.name).all()
    return [
        {"id": row.id, "name": row.name, "slug": row.slug, "description": row.description, "sort_order": row.sort_order}
        for row in rows
    ]


@router.post("/categories", status_code=201)
def create_category(payload: CategoryIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    slug = slugify(payload.name)
    if db.query(Category).filter((Category.name == payload.name) | (Category.slug == slug)).first():
        raise HTTPException(status_code=409, detail="A category with this name already exists")
    row = Category(name=payload.name.strip(), slug=slug, description=payload.description.strip(), sort_order=payload.sort_order)
    db.add(row)
    db.flush()
    audit(db, user.id, "category.create", "category", row.id, row.name)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "name": row.name, "slug": row.slug, "description": row.description, "sort_order": row.sort_order}


@router.get("/products")
def list_products(
    _: User = Depends(require_admin),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=24, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = admin_product_query(db).order_by(Product.updated_at.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [product_detail(row) for row in rows], "page": page, "page_size": page_size, "total": total}


@router.post("/products", status_code=201)
def create_product(payload: ProductIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    category = db.get(Category, payload.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    base_slug = slugify(payload.name)
    slug = base_slug
    if db.query(Product).filter(Product.slug == slug).first():
        slug = f"{base_slug}-{secrets.token_hex(3)}"
    values = payload.model_dump()
    values.update(
        name=payload.name.strip(),
        name_ta=payload.name_ta.strip(),
        description=payload.description.strip(),
        printing_type=payload.printing_type.strip(),
    )
    row = Product(**values, slug=slug)
    db.add(row)
    db.flush()
    audit(db, user.id, "product.create", "product", row.id, row.name)
    db.commit()
    db.refresh(row)
    upsert_row(db, "Products", product_row(row))
    return product_detail(admin_product_query(db).filter(Product.id == row.id).first())


@router.put("/products/{product_id}")
def update_product(
    product_id: str,
    payload: ProductIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = admin_product_query(db).filter(Product.id == product_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")
    category = db.get(Category, payload.category_id)
    if category is None:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in payload.model_dump().items():
        setattr(row, key, value.strip() if isinstance(value, str) else value)
    row.updated_at = utcnow()
    audit(db, user.id, "product.update", "product", row.id, row.name)
    db.commit()
    db.refresh(row)
    upsert_row(db, "Products", product_row(row))
    return product_detail(admin_product_query(db).filter(Product.id == row.id).first())


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: str, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    row = admin_product_query(db).filter(Product.id == product_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")
    row.is_active = False
    row.updated_at = utcnow()
    for variant in row.variants:
        variant.is_active = False
        variant.updated_at = utcnow()
    audit(db, user.id, "product.archive", "product", row.id, row.name)
    db.commit()
    upsert_row(db, "Products", product_row(row))
    for variant in row.variants:
        upsert_row(db, "Product_Variants", variant_row(variant))


@router.post("/products/{product_id}/images", status_code=201)
def add_product_image(
    product_id: str,
    image: UploadFile = File(),
    view: str = "front",
    alt: str = "",
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    if view not in {"front", "back", "detail"}:
        raise HTTPException(status_code=422, detail="Image view must be front, back, or detail")
    url = save_image(image, "products")
    row = ProductImage(
        product_id=product.id,
        url=url,
        alt=alt.strip()[:180] or product.name,
        view=view,
        sort_order=len(product.images),
    )
    db.add(row)
    audit(db, user.id, "product.image.create", "product", product.id, view)
    db.commit()
    db.refresh(row)
    return {"id": row.id, "url": row.url, "alt": row.alt, "view": row.view}


@router.get("/variants")
def list_variants(
    _: User = Depends(require_admin),
    low_stock_only: bool = False,
    db: Session = Depends(get_db),
):
    query = db.query(Variant).options(joinedload(Variant.product)).filter(Variant.is_active.is_(True))
    if low_stock_only:
        query = query.filter(Variant.stock <= Variant.low_stock_threshold)
    rows = query.order_by(Variant.stock, Variant.sku).limit(500).all()
    return [
        {
            "id": row.id,
            "product_id": row.product_id,
            "product": row.product.name,
            "sku": row.sku,
            "size": row.size,
            "color": row.color,
            "color_hex": row.color_hex,
            "price": row.price,
            "stock": row.stock,
            "low_stock_threshold": row.low_stock_threshold,
        }
        for row in rows
    ]


@router.post("/variants", status_code=201)
def create_variant(payload: VariantIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    product = db.get(Product, payload.product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    sku = payload.sku.strip() if payload.sku else f"TD-{secrets.token_hex(4).upper()}"
    if db.query(Variant).filter((Variant.sku == sku) | ((Variant.product_id == payload.product_id) & (Variant.size == payload.size) & (Variant.color == payload.color))).first():
        raise HTTPException(status_code=409, detail="This SKU or product size/colour variant already exists")
    row = Variant(**payload.model_dump(exclude={"sku"}), sku=sku)
    db.add(row)
    db.flush()
    audit(db, user.id, "variant.create", "variant", row.id, sku)
    db.commit()
    db.refresh(row)
    upsert_row(db, "Product_Variants", variant_row(row))
    upsert_row(db, "Inventory", inventory_row(row))
    return {"id": row.id, "sku": row.sku, "stock": row.stock}


@router.patch("/variants/{variant_id}/stock")
def update_stock(
    variant_id: str,
    payload: StockIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(Variant, variant_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Variant not found")
    row.stock = payload.stock
    row.updated_at = utcnow()
    audit(db, user.id, "inventory.update", "variant", row.id, f"stock={row.stock}")
    db.commit()
    db.refresh(row)
    upsert_row(db, "Inventory", inventory_row(row))
    return {"variant_id": row.id, "stock": row.stock}


@router.get("/orders")
def list_orders(
    _: User = Depends(require_admin),
    status: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Order).order_by(Order.created_at.desc())
    if status:
        if status not in ORDER_STATUSES:
            raise HTTPException(status_code=400, detail="Unknown order status")
        query = query.filter(Order.status == status)
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {"items": [order_public(row) for row in rows], "page": page, "page_size": page_size, "total": total}


@router.get("/custom-requests")
def list_custom_requests(
    _: User = Depends(require_admin),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(CustomRequest).order_by(CustomRequest.created_at.desc())
    total = query.count()
    rows = query.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [
            {
                "id": row.id,
                "name": row.name,
                "phone": row.phone,
                "email": row.email,
                "printing_type": row.printing_type,
                "size": row.size,
                "color": row.color,
                "qty": row.qty,
                "instructions": row.instructions,
                "artwork_url": row.artwork_url,
                "status": row.status,
                "created_at": iso(row.created_at),
            }
            for row in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.patch("/orders/{order_id}/status")
def change_order_status(
    order_id: str,
    payload: StatusIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(Order, order_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Order not found")
    return order_public(set_order_status(db, row, payload.status, payload.note.strip(), user.id))


@router.get("/customers")
def list_customers(
    _: User = Depends(require_admin),
    q: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=30, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(User.role == "customer")
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter((User.name.ilike(term)) | (User.email.ilike(term)) | (User.phone.ilike(term)))
    total = query.count()
    rows = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "items": [
            {
                "id": row.id,
                "name": row.name,
                "email": row.email,
                "phone": row.phone,
                "is_active": row.is_active,
                "created_at": row.created_at.isoformat(),
                "orders": db.query(Order).filter(Order.user_id == row.id).count(),
            }
            for row in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.patch("/customers/{customer_id}")
def change_customer_status(
    customer_id: str,
    payload: CustomerStatusIn,
    actor: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.query(User).filter(User.id == customer_id, User.role == "customer").first()
    if row is None:
        raise HTTPException(status_code=404, detail="Customer not found")
    row.is_active = payload.is_active
    audit(db, actor.id, "customer.status", "customer", row.id, f"is_active={row.is_active}")
    db.commit()
    from ..services.sheets import sync_user

    sync_user(db, row)
    return {"id": row.id, "is_active": row.is_active}


@router.get("/reports/{span}")
def report(span: str, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    if span not in {"daily", "weekly", "monthly"}:
        raise HTTPException(status_code=400, detail="Choose daily, weekly, or monthly")
    return sales_report(db, span)


@router.get("/settings")
def get_store_settings(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return setting_map(db)


@router.put("/settings")
def update_store_settings(
    payload: SettingsIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    allowed = {
        "business_name", "phone", "alt_phone", "email", "instagram", "location",
        "whatsapp", "shipping_flat", "free_shipping_above", "cod_enabled",
        "razorpay_enabled", "announcement",
    }
    if not payload.values or any(key not in allowed for key in payload.values):
        raise HTTPException(status_code=400, detail="One or more settings are not editable here")
    for key, value in payload.values.items():
        if key in {"shipping_flat", "free_shipping_above"}:
            try:
                if float(value) < 0:
                    raise ValueError
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=f"{key} must be a non-negative number") from exc
        if key.endswith("_enabled") and value.lower() not in {"true", "false"}:
            raise HTTPException(status_code=422, detail=f"{key} must be true or false")
    for key, value in payload.values.items():
        upsert_setting(db, key, value.strip())
        upsert_row(db, "Settings", {"key": key, "value": value.strip(), "updated_at": utcnow().isoformat()})
    audit(db, user.id, "settings.update", "settings", "store", ", ".join(sorted(payload.values)))
    db.commit()
    return setting_map(db)


@router.get("/coupons")
def list_coupons(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(Coupon).order_by(Coupon.code).all()
    return [
        {
            "id": row.id,
            "code": row.code,
            "discount_type": row.discount_type,
            "value": row.value,
            "min_order": row.min_order,
            "is_active": row.is_active,
            "description": row.description,
        }
        for row in rows
    ]


@router.post("/coupons", status_code=201)
def create_coupon(payload: CouponIn, user: User = Depends(require_admin), db: Session = Depends(get_db)):
    code = payload.code.strip().upper()
    if db.query(Coupon).filter(Coupon.code == code).first():
        raise HTTPException(status_code=409, detail="Coupon code already exists")
    row = Coupon(**payload.model_dump(exclude={"code"}), code=code)
    db.add(row)
    db.flush()
    audit(db, user.id, "coupon.create", "coupon", row.id, code)
    db.commit()
    upsert_row(db, "Coupons", {"id": row.id, "code": row.code, "discount_type": row.discount_type, "value": row.value, "min_order": row.min_order, "is_active": row.is_active, "description": row.description})
    return {"id": row.id, "code": row.code, "is_active": row.is_active}


@router.put("/coupons/{coupon_id}")
def update_coupon(
    coupon_id: str,
    payload: CouponIn,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    row = db.get(Coupon, coupon_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Coupon not found")
    code = payload.code.strip().upper()
    duplicate = db.query(Coupon).filter(Coupon.code == code, Coupon.id != row.id).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="Coupon code already exists")
    for key, value in payload.model_dump().items():
        setattr(row, key, value.strip().upper() if key == "code" else value.strip() if isinstance(value, str) else value)
    audit(db, user.id, "coupon.update", "coupon", row.id, code)
    db.commit()
    upsert_row(db, "Coupons", {"id": row.id, "code": row.code, "discount_type": row.discount_type, "value": row.value, "min_order": row.min_order, "is_active": row.is_active, "description": row.description})
    return {"id": row.id, "code": row.code, "is_active": row.is_active}


@router.get("/sync/logs")
def sync_logs(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(SyncLog).order_by(SyncLog.created_at.desc()).limit(100).all()
    return [
        {
            "id": row.id,
            "direction": row.direction,
            "sheet": row.sheet,
            "status": row.status,
            "message": row.message,
            "attempts": row.attempts,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.post("/sync/push")
def sync_push(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return push_catalog(db)


@router.post("/sync/retry")
def sync_retry(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return {"retried": retry_failed(db)}


@router.get("/audit")
def audit_logs(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(100).all()
    return [
        {
            "id": row.id,
            "actor_id": row.actor_id,
            "action": row.action,
            "entity": row.entity,
            "entity_id": row.entity_id,
            "detail": row.detail,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]
