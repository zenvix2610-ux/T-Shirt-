# தமிழ் Drifts

Commerce workspace for the தமிழ் Drifts custom-print clothing brand. The
website and Expo/React Native mobile app use the same FastAPI API and commerce database.
Google Sheets is an optional secured operations mirror; it is not required to
run the local store.

## Workspace layout

```text
backend/
  app/
    main.py                 FastAPI app, lifecycle, CORS and uploads
    routers/                Auth and customer-facing API routes
    services/               Commerce, payments, image storage and Sheets sync
    models.py               SQLAlchemy business entities
    schemas.py              Request validation
  tests/                    API tests
web/
  src/
    App.tsx                 Responsive customer store and working flows
    api.ts                  Shared HTTP client and session helpers
    styles.css              Brand system and responsive layouts
mobile/
  app/                      Expo Router customer app screens
  src/                      Shared API client, types, cart and UI components
docs/
  architecture.md           Data ownership, Sheets tabs and API contract
```

## Run locally

1. Create a virtual environment and install `backend/requirements.txt`.
2. Copy `backend/.env.example` to `backend/.env`. Set a long random
   `SECRET_KEY`. To provision the first admin, set a unique `ADMIN_PASSWORD`;
   public customer registration cannot create admin accounts.
3. From `backend`, run `python -m uvicorn app.main:app --reload`.
4. In another terminal, run `npm.cmd install` then `npm.cmd run dev` from
   `web`. Set `VITE_API_URL` if the API is not at
   `http://127.0.0.1:8000/api`.
5. Run backend checks from `backend` with `python -m pytest`; run web checks
   from `web` with `npm.cmd test` and `npm.cmd run build`.

The local database and product seed are created on first API startup. The
development seed includes sample catalogue content and a demo customer; the
demo customer is never created in non-development environments.

## Current working flows

- Live home and paginated, searchable/filterable product catalogue.
- Product variant and stock selection, cart persistence for guests, and
  authenticated server-side cart operations.
- Guest/customer checkout with server-side stock validation, idempotency key,
  order creation and optional Sheets sync.
- Custom print request with optional image upload and sync log.
- Customer login/register, password reset endpoints, and separate admin login
  endpoint.   Admin dashboard operations and the React Native mobile application are available
  as separate clients; mobile online payment and push delivery require provider
  configuration described below.

COD is the only checkout option shown by default. Online checkout requires
Razorpay credentials and explicit store enablement; no card data is stored.
External image URLs in the seed are sample catalogue photography and should be
replaced with licensed brand product photography before launch.

## Production checklist

- Use managed SQL storage, HTTPS, a strong secret key, restricted CORS origins,
  and durable object storage for uploads.
- Provision an admin credential out of band and rotate it after bootstrap.
- Configure and verify the Google service account and spreadsheet ID, then
  authorize only the required backend identity.
- Set up Razorpay webhook signing and validate the payment lifecycle in
  provider test mode before enabling online checkout.
- Configure backups, monitoring, rate limits, email delivery, and deployment
  secrets before accepting real customer orders.

## Run the Expo mobile app

1. Install Node.js and the project dependencies with `npm.cmd install` from
   `mobile`.
2. Copy `mobile/.env.example` to `mobile/.env` and set
   `EXPO_PUBLIC_API_URL`. Android emulator uses `http://10.0.2.2:8000/api`;
   iOS simulator uses `http://127.0.0.1:8000/api`; physical devices need the
   development computer's LAN address.
3. Start the FastAPI service, then run `npm.cmd start` from `mobile` and open
   the app in an Expo development build or simulator.
4. Validate with `npm.cmd run typecheck`, `npm.cmd test`, and
   `npm.cmd run build`. A production device build requires the Expo/EAS native
   build environment.

The mobile app keeps access and refresh tokens in Expo SecureStore and keeps
guest cart state on-device. Checkout submits its line items directly to the
shared API, where stock and idempotency are validated. COD is currently the
available payment method. The backend has no public mobile payment-initiation
route, so Razorpay should not be enabled until that route and the approved
native/Expo payment experience are configured and tested. Order updates are
available in the in-app notifications feed; push delivery still requires a
configured Expo/Firebase project and backend device-token delivery workflow.
