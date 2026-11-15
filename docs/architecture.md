# திகழ் Drifts architecture and API plan

## Ownership and data flow

The backend relational database is the transactional source of truth for
catalogue, inventory, customer accounts, carts, orders, payments, and delivery
events. This is necessary for atomic stock checks and idempotent order writes.
Google Sheets is a secured operational mirror: the backend pushes records,
logs synchronization outcomes, retries failures, and accepts only explicitly
authorized edits through the signed backend webhook. Secrets, password
material, authentication tokens, and payment card data are excluded from
Sheets. Credentials are held only in backend environment/configuration.

## Spreadsheet tabs

The sync service creates these tabs when configured:

1. `Products`
2. `Product_Variants`
3. `Inventory`
4. `Customers`
5. `Orders`
6. `Order_Items`
7. `Payments`
8. `Custom_Requests`
9. `Delivery`
10. `Coupons`
11. `Users`
12. `Admin`
13. `Settings`
14. `Sync_Log` (operational audit tab in addition to the requested business
    tabs)

Each record uses its database ID; orders also have a customer-facing order
number and an idempotency key. Sheets sync is skipped and logged when no
service-account credentials are configured. The local database remains
available in that case.

## API contract

Base path: `/api`. Interactive API documentation is available at `/docs`.

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Runtime health |
| GET | `/storefront/home` | Business profile, category and featured-product data |
| GET | `/catalog/categories` | Categories |
| GET | `/catalog/products` | Search/filter/sort/page catalogue (`q`, `category`, `size`, `color`, `sort`, `page`, `page_size`) |
| GET | `/catalog/products/{slug}` | Product images and variants |
| POST | `/auth/register` | Customer-only registration |
| POST | `/auth/login` | Customer sign-in |
| POST | `/auth/admin/login` | Admin-only sign-in |
| GET | `/auth/me` | Current authenticated account |
| GET/POST | `/cart` | Authenticated cart read/add |
| PATCH/DELETE | `/cart/{item_id}` | Authenticated cart quantity/removal |
| POST | `/orders` | Guest or customer checkout; validates stock and idempotency |
| GET | `/orders` | Authenticated order history |
| POST | `/orders/track` | Guest order lookup by order number and phone |
| POST | `/custom-requests` | Custom print request with optional artwork upload |

Razorpay initiation, server-side verification, order status and reporting
services exist in the backend service layer; their customer/admin routes and
checkout UI are the next integration slice and remain disabled until store
approval and provider configuration.

## Implementation sequence

1. Establish visual system and reusable responsive store components.
2. Connect customer storefront, catalogue, product variants, cart, custom
   request, customer sign-in and checkout to the API.
3. Complete admin-only product, stock, order, customer, reporting and settings
   routes and dashboard.
4. Harden/authenticate the complete account lifecycle and role boundaries.
5. Configure/reconcile Sheets authorization, webhook edits, retries and audit
   operations.
6. Build a Flutter app that consumes the same API.
7. Enable Razorpay and approved WhatsApp Business workflows after credentials
   and business approval.
8. Add integration/security testing, deployment configuration and operational
   documentation.
