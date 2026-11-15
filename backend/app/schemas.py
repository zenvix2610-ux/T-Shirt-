from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


def clean_phone(value: str) -> str:
    digits = "".join(ch for ch in value if ch.isdigit())
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    if len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if len(digits) != 10:
        raise ValueError("Enter a 10-digit mobile number")
    return digits


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    phone: str
    password: str = Field(min_length=8, max_length=100)

    @field_validator("phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return clean_phone(value)

    @field_validator("email")
    @classmethod
    def email_lower(cls, value: EmailStr) -> str:
        return value.lower()


class LoginIn(BaseModel):
    email: EmailStr
    password: str

    @field_validator("email")
    @classmethod
    def email_lower(cls, value: EmailStr) -> str:
        return value.lower()


class ForgotIn(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def email_lower(cls, value: EmailStr) -> str:
        return value.lower()


class ResetIn(BaseModel):
    token: str = Field(min_length=10)
    password: str = Field(min_length=8, max_length=100)


class ProfileIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str

    @field_validator("phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return clean_phone(value)


class AddressIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    line1: str = Field(min_length=4, max_length=240)
    line2: str = ""
    city: str = Field(min_length=2, max_length=80)
    pincode: str
    is_default: bool = False

    @field_validator("phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return clean_phone(value)

    @field_validator("pincode")
    @classmethod
    def pin(cls, value: str) -> str:
        digits = "".join(ch for ch in value if ch.isdigit())
        if len(digits) != 6:
            raise ValueError("Enter a 6-digit pincode")
        return digits


class CartIn(BaseModel):
    variant_id: str
    qty: int = Field(ge=1, le=20)


class CartQtyIn(BaseModel):
    qty: int = Field(ge=1, le=20)


class CheckoutItem(BaseModel):
    variant_id: str
    qty: int = Field(ge=1, le=20)


class CheckoutIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    phone: str
    email: EmailStr
    line1: str = Field(min_length=4, max_length=240)
    line2: str = ""
    city: str = Field(min_length=2, max_length=80)
    pincode: str
    payment_method: str
    coupon_code: str = ""
    notes: str = ""
    idempotency_key: str = Field(min_length=8, max_length=64)
    items: list[CheckoutItem] | None = None

    @field_validator("phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return clean_phone(value)

    @field_validator("pincode")
    @classmethod
    def pin(cls, value: str) -> str:
        digits = "".join(ch for ch in value if ch.isdigit())
        if len(digits) != 6:
            raise ValueError("Enter a 6-digit pincode")
        return digits

    @field_validator("email")
    @classmethod
    def email_lower(cls, value: EmailStr) -> str:
        return value.lower()

    @field_validator("payment_method")
    @classmethod
    def method(cls, value: str) -> str:
        allowed = {"cod", "upi", "card", "netbanking"}
        if value not in allowed:
            raise ValueError("Choose a valid payment method")
        return value


class TrackIn(BaseModel):
    order_number: str
    phone: str

    @field_validator("phone")
    @classmethod
    def phone(cls, value: str) -> str:
        return clean_phone(value)


class CouponCheck(BaseModel):
    code: str
    subtotal: float = Field(ge=0)


class CategoryIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    description: str = ""
    sort_order: int = 0


class ProductIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    name_ta: str = ""
    category_id: str
    description: str = ""
    base_price: float = Field(gt=0)
    compare_at_price: float | None = None
    printing_type: str = "Custom"
    is_featured: bool = False
    is_best_seller: bool = False
    is_new: bool = False
    is_active: bool = True


class VariantIn(BaseModel):
    product_id: str
    size: str = Field(min_length=1, max_length=10)
    color: str = Field(min_length=1, max_length=40)
    color_hex: str = "#07382C"
    price: float | None = None
    stock: int = Field(ge=0)
    low_stock_threshold: int = Field(ge=0, default=5)
    sku: str | None = None


class StockIn(BaseModel):
    stock: int = Field(ge=0)


class StatusIn(BaseModel):
    status: str
    note: str = ""


class CustomerStatusIn(BaseModel):
    is_active: bool


class CouponIn(BaseModel):
    code: str = Field(min_length=3, max_length=40)
    discount_type: str
    value: float = Field(gt=0)
    min_order: float = Field(ge=0, default=0)
    is_active: bool = True
    description: str = ""

    @field_validator("discount_type")
    @classmethod
    def kind(cls, value: str) -> str:
        if value not in {"percent", "flat"}:
            raise ValueError("Discount type must be percent or flat")
        return value


class SettingsIn(BaseModel):
    values: dict[str, str]


class PaymentCreateIn(BaseModel):
    order_id: str


class PaymentVerifyIn(BaseModel):
    order_id: str
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class SheetWebhookIn(BaseModel):
    sheet: str
    row: dict
