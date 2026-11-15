from sqlalchemy.orm import Session

from .config import get_settings
from .models import Category, Coupon, Product, ProductImage, Testimonial, User, Variant, new_id
from .security import hash_password
from .services.commerce import upsert_setting

PHOTOS = {
    "white": "photo-1521572163474-6864f9cf17ab",
    "black": "photo-1583743814966-8936f5b7be1a",
    "fold": "photo-1576566588028-4147f3842f27",
    "back": "photo-1618354691373-d851c5c3a990",
    "hang": "photo-1562157873-818bc0726f68",
    "color": "photo-1503341504253-dff4815485f1",
    "stack": "photo-1523381294911-8d3cead13475",
    "rail": "photo-1489987707025-afc232f7ea0f",
    "model": "photo-1529374255404-311a2a4f1fd9",
    "flat": "photo-1554568218-0f1715e72254",
}


def photo(key: str) -> str:
    return f"https://images.unsplash.com/{PHOTOS[key]}?auto=format&fit=crop&w=1200&q=70"


COLORS = {
    "Emerald": "#0B3D2E",
    "Ivory": "#F4EFE4",
    "Black": "#161616",
    "Sand": "#C8B49A",
    "Maroon": "#6E2430",
    "Teal": "#1C4E4A",
}
SIZES = ["S", "M", "L", "XL", "XXL"]


def seed(db: Session) -> None:
    settings = get_settings()
    if settings.admin_password and db.query(User).filter(User.role == "admin").first() is None:
        db.add(
            User(
                name=settings.admin_name,
                email=settings.admin_email.lower(),
                phone="8610751463",
                password_hash=hash_password(settings.admin_password),
                role="admin",
            )
        )
    if settings.is_dev and db.query(User).filter(User.email == "demo@thigazhdrifts.com").first() is None:
        db.add(
            User(
                name="Demo Customer",
                email="demo@thigazhdrifts.com",
                phone="9585561305",
                password_hash=hash_password("DriftCustomer#2026"),
                role="customer",
            )
        )
    defaults = {
        "business_name": "தமிழ் Drifts",
        "phone": "8610751463",
        "alt_phone": "9585561305",
        "email": "thigazhadrifts@gmail.com",
        "instagram": "thigazh_drifts",
        "location": "Kottavadi, Yazhappadi",
        "whatsapp": "919600311386",
        "shipping_flat": "49",
        "free_shipping_above": "1499",
        "cod_enabled": "true",
        "razorpay_enabled": "true" if settings.razorpay_ready else "false",
        "announcement": "Custom tees for teams, couples, and celebrations — printed in Kottavadi.",
    }
    for key, value in defaults.items():
        from .models import Setting

        if db.get(Setting, key) is None:
            upsert_setting(db, key, value)
    if db.query(Category).count() == 0:
        catalog = [
            ("Custom Printing", "custom-printing", "Your artwork, printed to order.", 1),
            ("DTF Printing", "dtf-printing", "Detailed, full-colour DTF transfers.", 2),
            ("Group T-Shirts", "group-tshirts", "Matching sets for friends and squads.", 3),
            ("Couple T-Shirts", "couple-tshirts", "Paired designs for two.", 4),
            ("Uniforms", "uniforms", "Company and team uniforms.", 5),
            ("Event T-Shirts", "event-tshirts", "Functions, weddings, and college events.", 6),
        ]
        categories = {}
        for name, slug, description, order in catalog:
            row = Category(name=name, slug=slug, description=description, sort_order=order)
            db.add(row)
            categories[slug] = row
        db.flush()
        products = [
            ("Kaveri Everyday Tee", "காவேரி டீ", "kaveri-everyday-tee", "custom-printing", "A clean cotton tee for daily wear, with room for a small chest print or a full back design.", 649, 799, "Custom", True, True, False, "white", "hang", [("Ivory", 18), ("Emerald", 12)]),
            ("Madurai DTF Graphic", "மதுரை கிராஃபிக்", "madurai-dtf-graphic", "dtf-printing", "Sharp, full-colour DTF print that holds fine Tamil lettering and illustration.", 899, 1099, "DTF", True, False, True, "color", "flat", [("Black", 10), ("Sand", 8)]),
            ("Yaazh Couple Set", "யாழ் ஜோடி", "yaazh-couple-set", "couple-tshirts", "Two coordinated tees. Share a line, a date, or a quiet matching mark.", 1499, 1799, "Custom", True, True, False, "model", "fold", [("Maroon", 6), ("Ivory", 6)]),
            ("Squad Group Tee", "ஸ்குவாட் டீ", "squad-group-tee", "group-tshirts", "Built for batches. Send the names, we keep the print placement consistent across every size.", 699, None, "Custom", True, False, False, "rail", "stack", [("Teal", 20), ("Black", 15)]),
            ("Office Crest Uniform", "அலுவலக சீருடை", "office-crest-uniform", "uniforms", "A sturdy uniform tee for staff and teams, with a tidy crest or wordmark.", 799, None, "Custom", False, False, False, "black", "back", [("Black", 14), ("Emerald", 9)]),
            ("Wedding Function Tee", "விழா டீ", "wedding-function-tee", "event-tshirts", "For the wedding party, a college fest, or a family function. Add the date and the names.", 749, 899, "DTF", False, False, True, "hang", "white", [("Ivory", 11), ("Sand", 7)]),
            ("Gold Line Oversized", "தங்கக் கோடு", "gold-line-oversized", "custom-printing", "An oversized drape with a metallic gold line. Works as a blank or with your own back print.", 999, 1299, "Custom", True, True, True, "fold", "model", [("Black", 5), ("Emerald", 4)]),
            ("Yazhppadi Local", "எழப்பாடி லோக்கல்", "yazhppadi-local", "dtf-printing", "A hometown graphic, printed in small runs. Ask us to swap the line for your own place name.", 599, None, "DTF", False, False, True, "stack", "color", [("Teal", 3), ("Ivory", 0)]),
        ]
        sequence = 1
        for name, tamil, slug, category_slug, description, price, compare, printing, featured, best, is_new, front, back, colors in products:
            product = Product(
                category_id=categories[category_slug].id,
                name=name,
                name_ta=tamil,
                slug=slug,
                description=description,
                base_price=price,
                compare_at_price=compare,
                printing_type=printing,
                is_featured=featured,
                is_best_seller=best,
                is_new=is_new,
            )
            db.add(product)
            db.flush()
            db.add(ProductImage(product_id=product.id, url=photo(front), alt=f"{name} front", view="front", sort_order=0))
            db.add(ProductImage(product_id=product.id, url=photo(back), alt=f"{name} back", view="back", sort_order=1))
            for color_name, stock_each in colors:
                for size in SIZES:
                    stock = stock_each if size in {"M", "L", "XL"} else max(stock_each - 2, 0)
                    db.add(
                        Variant(
                            product_id=product.id,
                            sku=f"TD-{sequence:04d}",
                            size=size,
                            color=color_name,
                            color_hex=COLORS[color_name],
                            stock=stock,
                            low_stock_threshold=5,
                        )
                    )
                    sequence += 1
    if db.query(Coupon).count() == 0:
        db.add(Coupon(code="WELCOME10", discount_type="percent", value=10, min_order=799, description="10% off your first print order"))
        db.add(Coupon(code="TEAM15", discount_type="percent", value=15, min_order=2499, description="15% off team and group orders"))
    db.commit()
    _ = new_id
