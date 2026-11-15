from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..deps import require_user
from ..models import Address, Notification, Product, User, WishlistItem
from ..schemas import AddressIn, ProfileIn
from ..serializers import product_card
from ..services.commerce import audit
from ..services.sheets import sync_user

router = APIRouter(prefix="/account", tags=["account"])


def address_public(row: Address) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "phone": row.phone,
        "line1": row.line1,
        "line2": row.line2,
        "city": row.city,
        "pincode": row.pincode,
        "is_default": row.is_default,
    }


@router.get("/profile")
def profile(user: User = Depends(require_user)):
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone}


@router.patch("/profile")
def update_profile(payload: ProfileIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    user.name = payload.name.strip()
    user.phone = payload.phone
    audit(db, user.id, "profile.update", "customer", user.id)
    db.commit()
    db.refresh(user)
    sync_user(db, user)
    return {"id": user.id, "name": user.name, "email": user.email, "phone": user.phone}


@router.get("/addresses")
def list_addresses(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = db.query(Address).filter(Address.user_id == user.id).order_by(Address.is_default.desc(), Address.id).all()
    return [address_public(row) for row in rows]


@router.post("/addresses", status_code=201)
def create_address(payload: AddressIn, user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = db.query(Address).filter(Address.user_id == user.id).all()
    is_default = payload.is_default or not rows
    if is_default:
        for row in rows:
            row.is_default = False
    address = Address(user_id=user.id, **payload.model_dump(exclude={"is_default"}), is_default=is_default)
    db.add(address)
    db.flush()
    audit(db, user.id, "address.create", "address", address.id)
    db.commit()
    db.refresh(address)
    return address_public(address)


@router.put("/addresses/{address_id}")
def update_address(
    address_id: str,
    payload: AddressIn,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    row = db.query(Address).filter(Address.id == address_id, Address.user_id == user.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Address not found")
    if payload.is_default:
        db.query(Address).filter(Address.user_id == user.id, Address.id != row.id).update({"is_default": False})
    values = payload.model_dump()
    if row.is_default and not payload.is_default:
        values["is_default"] = True
    for key, value in values.items():
        setattr(row, key, value.strip() if isinstance(value, str) else value)
    audit(db, user.id, "address.update", "address", row.id)
    db.commit()
    db.refresh(row)
    return address_public(row)


@router.delete("/addresses/{address_id}", status_code=204)
def delete_address(address_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = db.query(Address).filter(Address.id == address_id, Address.user_id == user.id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Address not found")
    was_default = row.is_default
    db.delete(row)
    db.flush()
    if was_default:
        replacement = db.query(Address).filter(Address.user_id == user.id).first()
        if replacement:
            replacement.is_default = True
    audit(db, user.id, "address.delete", "address", address_id)
    db.commit()


@router.get("/wishlist")
def list_wishlist(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Product)
        .join(WishlistItem, WishlistItem.product_id == Product.id)
        .options(joinedload(Product.category), joinedload(Product.images), joinedload(Product.variants))
        .filter(WishlistItem.user_id == user.id)
        .order_by(Product.name)
        .all()
    )
    return [product_card(row) for row in rows]


@router.post("/wishlist/{product_id}", status_code=201)
def add_wishlist_item(product_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    product = db.query(Product).filter(Product.id == product_id, Product.is_active.is_(True)).first()
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    existing = db.query(WishlistItem).filter(
        WishlistItem.user_id == user.id,
        WishlistItem.product_id == product_id,
    ).first()
    if existing is None:
        db.add(WishlistItem(user_id=user.id, product_id=product_id))
        audit(db, user.id, "wishlist.add", "product", product_id)
        db.commit()
    return {"product_id": product_id, "saved": True}


@router.delete("/wishlist/{product_id}", status_code=204)
def remove_wishlist_item(product_id: str, user: User = Depends(require_user), db: Session = Depends(get_db)):
    row = db.query(WishlistItem).filter(
        WishlistItem.user_id == user.id,
        WishlistItem.product_id == product_id,
    ).first()
    if row:
        db.delete(row)
        audit(db, user.id, "wishlist.remove", "product", product_id)
        db.commit()


@router.get("/notifications")
def list_notifications(user: User = Depends(require_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Notification)
        .filter(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(100)
        .all()
    )
    return [
        {
            "id": row.id,
            "title": row.title,
            "body": row.body,
            "is_read": row.is_read,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: str,
    user: User = Depends(require_user),
    db: Session = Depends(get_db),
):
    row = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == user.id,
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    row.is_read = True
    db.commit()
    return {"id": row.id, "is_read": row.is_read}
