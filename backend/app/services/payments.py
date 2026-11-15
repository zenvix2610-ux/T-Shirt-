import json

import httpx
from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..config import get_settings
from ..models import Order, Payment, utcnow
from ..security import razorpay_signature
from ..serializers import money
from .commerce import audit, notify


def start_online_payment(db: Session, order: Order) -> dict:
    settings = get_settings()
    if order.payment_method == "cod":
        raise HTTPException(status_code=400, detail="This order uses cash on delivery")
    if order.payment_status == "paid":
        raise HTTPException(status_code=400, detail="This order is already paid")
    if not settings.razorpay_ready:
        raise HTTPException(status_code=400, detail="Razorpay is not configured")
    amount_paise = int(round(order.total * 100))
    try:
        response = httpx.post(
            "https://api.razorpay.com/v1/orders",
            json={"amount": amount_paise, "currency": "INR", "receipt": order.order_number, "payment_capture": 1},
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
            timeout=20,
        )
        response.raise_for_status()
        body = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Could not start the payment. Try again.") from exc
    payment = order.payments[-1] if order.payments else Payment(order_id=order.id, provider="razorpay", amount=order.total)
    if payment not in order.payments:
        db.add(payment)
    payment.provider = "razorpay"
    payment.status = "pending"
    payment.amount = money(order.total)
    payment.razorpay_order_id = body["id"]
    payment.reference = body["id"]
    payment.updated_at = utcnow()
    db.commit()
    return {
        "key_id": settings.razorpay_key_id,
        "razorpay_order_id": body["id"],
        "amount": amount_paise,
        "currency": "INR",
        "order_number": order.order_number,
        "name": "தமிழ் Drifts",
    }


def verify_payment(db: Session, order: Order, razorpay_order_id: str, razorpay_payment_id: str, signature: str) -> Order:
    settings = get_settings()
    expected = razorpay_signature(razorpay_order_id, razorpay_payment_id, settings.razorpay_key_secret)
    if expected != signature:
        mark_failed(db, order, "Signature mismatch")
        raise HTTPException(status_code=400, detail="Payment verification failed")
    payment = next((item for item in order.payments if item.razorpay_order_id == razorpay_order_id), None)
    if payment is None:
        raise HTTPException(status_code=400, detail="Payment does not match this order")
    payment.status = "paid"
    payment.razorpay_payment_id = razorpay_payment_id
    payment.reference = razorpay_payment_id
    payment.updated_at = utcnow()
    order.payment_status = "paid"
    order.updated_at = utcnow()
    notify(db, order.user_id, "Payment received", f"Payment for {order.order_number} is confirmed.")
    audit(db, order.user_id, "payment.paid", "order", order.id, razorpay_payment_id)
    db.commit()
    db.refresh(order)
    from .sheets import sync_order

    sync_order(db, order)
    return order


def mark_failed(db: Session, order: Order, reason: str) -> None:
    order.payment_status = "failed"
    order.updated_at = utcnow()
    for payment in order.payments:
        if payment.status == "pending":
            payment.status = "failed"
            payment.updated_at = utcnow()
    audit(db, None, "payment.failed", "order", order.id, reason[:200])
    db.commit()


def refund_order(db: Session, order: Order, actor_id: str) -> Order:
    settings = get_settings()
    payment = next((item for item in order.payments if item.razorpay_payment_id), None)
    reference = "manual"
    if payment and payment.razorpay_payment_id and settings.razorpay_ready:
        try:
            response = httpx.post(
                f"https://api.razorpay.com/v1/payments/{payment.razorpay_payment_id}/refund",
                json={"amount": int(round(order.total * 100))},
                auth=(settings.razorpay_key_id, settings.razorpay_key_secret),
                timeout=20,
            )
            response.raise_for_status()
            reference = response.json().get("id", "razorpay")
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail="Razorpay refund failed") from exc
    from .commerce import set_order_status

    order = set_order_status(db, order, "Refunded", f"Refund reference {reference}", actor_id)
    return order


def webhook_body_ok(raw: bytes, signature: str) -> bool:
    import hashlib
    import hmac

    settings = get_settings()
    secret = settings.razorpay_webhook_secret or settings.razorpay_key_secret
    if not secret or not signature:
        return False
    digest = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, signature)


def apply_webhook(db: Session, payload: dict) -> None:
    event = payload.get("event", "")
    entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
    payment_id = entity.get("id", "")
    razorpay_order_id = entity.get("order_id", "")
    payment = db.query(Payment).filter(Payment.razorpay_order_id == razorpay_order_id).first() if razorpay_order_id else None
    if payment is None:
        return
    order = payment.order
    if event == "payment.captured":
        payment.status = "paid"
        payment.razorpay_payment_id = payment_id
        payment.reference = payment_id
        payment.updated_at = utcnow()
        order.payment_status = "paid"
        order.updated_at = utcnow()
        db.commit()
        from .sheets import sync_order

        sync_order(db, order)
    elif event == "payment.failed":
        mark_failed(db, order, json.dumps(entity.get("error_description", "failed"))[:180])
