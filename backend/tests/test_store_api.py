from uuid import uuid4

from fastapi.testclient import TestClient

from app.database import SessionLocal
from app.main import app
from app.models import RefreshToken, User
from app.security import hash_password


def test_health_endpoint():
    with TestClient(app) as client:
        response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_catalog_is_paginated_and_products_have_variants():
    with TestClient(app) as client:
        response = client.get("/api/catalog/products?page=1&page_size=2")
        assert response.status_code == 200
        body = response.json()
        assert len(body["items"]) == 2
        assert body["total"] >= 2
        detail = client.get(f"/api/catalog/products/{body['items'][0]['slug']}")
    assert detail.status_code == 200
    assert detail.json()["variants"]


def test_catalog_filters_by_category_and_sort():
    with TestClient(app) as client:
        response = client.get("/api/catalog/products?category=dtf-printing&sort=price_asc")
    assert response.status_code == 200
    items = response.json()["items"]
    assert items
    assert all(item["category_slug"] == "dtf-printing" for item in items)
    assert [item["price"] for item in items] == sorted(item["price"] for item in items)


def test_customer_cart_and_admin_role_boundary():
    email = f"customer-{uuid4().hex}@example.com"
    with TestClient(app) as client:
        registration = client.post(
            "/api/auth/register",
            json={"name": "Test Customer", "email": email, "phone": "8610751463", "password": "TestPass#2026"},
        )
        assert registration.status_code == 200
        token = registration.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        product = client.get("/api/catalog/products?page_size=1").json()["items"][0]
        detail = client.get(f"/api/catalog/products/{product['slug']}").json()
        variant = next(item for item in detail["variants"] if item["stock"] > 0)
        added = client.post("/api/cart", json={"variant_id": variant["id"], "qty": 1}, headers=headers)
        cart = client.get("/api/cart", headers=headers)
        admin_login = client.post(
            "/api/auth/admin/login",
            json={"email": email, "password": "TestPass#2026"},
        )
    assert added.status_code == 201
    assert cart.status_code == 200
    assert cart.json()["items"][0]["variant_id"] == variant["id"]
    assert admin_login.status_code == 403


def test_guest_checkout_is_idempotent_and_coupon_is_checked_server_side():
    with TestClient(app) as client:
        product = client.get("/api/catalog/products?page_size=1").json()["items"][0]
        detail = client.get(f"/api/catalog/products/{product['slug']}").json()
        variant = next(item for item in detail["variants"] if item["stock"] > 0)
        coupon = client.post("/api/coupons/check", json={"code": "WELCOME10", "subtotal": 900})
        payload = {
            "name": "Checkout Tester",
            "phone": "9585561305",
            "email": f"checkout-{uuid4().hex}@example.com",
            "line1": "12 Test Street",
            "city": "Yazhappadi",
            "pincode": "636101",
            "payment_method": "cod",
            "idempotency_key": uuid4().hex,
            "items": [{"variant_id": variant["id"], "qty": 1}],
        }
        first = client.post("/api/orders", json=payload)
        retry = client.post("/api/orders", json=payload)
    assert coupon.status_code == 200
    assert coupon.json()["discount"] == 90
    assert first.status_code == 201
    assert retry.status_code == 201
    assert retry.json()["id"] == first.json()["id"]


def test_admin_can_view_custom_print_requirements():
    email = f"custom-admin-{uuid4().hex}@example.com"
    password = "PrivateAdmin#2026"
    with SessionLocal() as db:
        db.add(
            User(
                name="Custom Request Admin",
                email=email,
                phone="8610751463",
                password_hash=hash_password(password),
                role="admin",
            )
        )
        db.commit()
    with TestClient(app) as client:
        created = client.post(
            "/api/custom-requests",
            data={
                "name": "Custom Tester",
                "phone": "8610751463",
                "email": "custom@example.com",
                "printing_type": "DTF",
                "size": "L",
                "color": "Emerald",
                "qty": "3",
                "instructions": "Small front print",
            },
        )
        denied = client.get("/api/admin/custom-requests")
        login = client.post("/api/auth/admin/login", json={"email": email, "password": password})
        token = login.json()["access_token"]
        allowed = client.get(
            "/api/admin/custom-requests",
            headers={"Authorization": f"Bearer {token}"},
        )
    with SessionLocal() as db:
        db.query(RefreshToken).filter(RefreshToken.user_id == login.json()["user"]["id"]).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
    assert created.status_code == 201
    assert denied.status_code == 401
    assert allowed.status_code == 200
    request = next(row for row in allowed.json()["items"] if row["id"] == created.json()["id"])
    assert request["instructions"] == "Small front print"
    assert request["printing_type"] == "DTF"
    assert request["size"] == "L"
    assert request["color"] == "Emerald"
    assert request["qty"] == 3
    assert request["email"] == "custom@example.com"


def test_custom_print_request_can_be_submitted_without_artwork():
    with TestClient(app) as client:
        response = client.post(
            "/api/custom-requests",
            data={
                "name": "Custom Tester",
                "phone": "8610751463",
                "email": "",
                "printing_type": "DTF",
                "size": "L",
                "color": "Emerald",
                "qty": "3",
                "instructions": "Small front print",
            },
        )
    assert response.status_code == 201
    assert response.json()["status"] == "Submitted"


def test_admin_login_and_dashboard_require_admin_role():
    email = f"admin-{uuid4().hex}@example.com"
    password = "PrivateAdmin#2026"
    with SessionLocal() as db:
        db.add(
            User(
                name="Temporary Admin",
                email=email,
                phone="8610751463",
                password_hash=hash_password(password),
                role="admin",
            )
        )
        db.commit()
    with TestClient(app) as client:
        denied = client.get("/api/admin/dashboard")
        login = client.post("/api/auth/admin/login", json={"email": email, "password": password})
        token = login.json()["access_token"]
        allowed = client.get("/api/admin/dashboard", headers={"Authorization": f"Bearer {token}"})
        products = client.get("/api/admin/products", headers={"Authorization": f"Bearer {token}"})
        category = client.post(
            "/api/admin/categories",
            headers={"Authorization": f"Bearer {token}"},
            json={"name": f"Test Category {uuid4().hex[:6]}", "description": "API test", "sort_order": 99},
        )
        product = client.post(
            "/api/admin/products",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "name": f"Admin Test Tee {uuid4().hex[:6]}",
                "name_ta": "சோதனை",
                "category_id": category.json()["id"],
                "description": "Admin API test product",
                "base_price": 499,
                "printing_type": "DTF",
                "is_active": True,
            },
        )
        variant = client.post(
            "/api/admin/variants",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "product_id": product.json()["id"],
                "size": "M",
                "color": "Emerald",
                "color_hex": "#0D312B",
                "stock": 3,
            },
        )
        archived = client.delete(f"/api/admin/products/{product.json()['id']}", headers={"Authorization": f"Bearer {token}"})
    with SessionLocal() as db:
        db.query(RefreshToken).filter(RefreshToken.user_id == login.json()["user"]["id"]).delete()
        db.query(User).filter(User.email == email).delete()
        db.commit()
    assert denied.status_code == 401
    assert login.status_code == 200
    assert allowed.status_code == 200
    assert {"total_revenue", "pending_orders", "low_stock_products"} <= allowed.json().keys()
    assert products.status_code == 200
    assert category.status_code == 201
    assert product.status_code == 201
    assert variant.status_code == 201
    assert archived.status_code == 204


def test_sheets_webhook_fails_closed_when_secret_is_not_configured():
    with TestClient(app) as client:
        response = client.post(
            "/api/integrations/sheets/webhook",
            json={"sheet": "Inventory", "row": {"variant_id": "missing", "stock": 1}},
        )
    assert response.status_code == 503


def test_customer_profile_addresses_and_wishlist_are_owner_scoped():
    email = f"account-{uuid4().hex}@example.com"
    with TestClient(app) as client:
        registration = client.post(
            "/api/auth/register",
            json={"name": "Account Tester", "email": email, "phone": "8610751463", "password": "TestPass#2026"},
        )
        headers = {"Authorization": f"Bearer {registration.json()['access_token']}"}
        profile = client.get("/api/account/profile", headers=headers)
        address = client.post(
            "/api/account/addresses",
            headers=headers,
            json={
                "name": "Account Tester",
                "phone": "8610751463",
                "line1": "42 Sample Road",
                "city": "Yazhappadi",
                "pincode": "636101",
            },
        )
        product = client.get("/api/catalog/products?page_size=1").json()["items"][0]
        saved = client.post(f"/api/account/wishlist/{product['id']}", headers=headers)
        wishlist = client.get("/api/account/wishlist", headers=headers)
    assert profile.status_code == 200
    assert address.status_code == 201
    assert address.json()["is_default"] is True
    assert saved.status_code == 201
    assert wishlist.status_code == 200
    assert wishlist.json()[0]["id"] == product["id"]
