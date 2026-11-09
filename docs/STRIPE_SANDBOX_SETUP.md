# Chris Dean Books — Stripe sandbox setup (9 November 2026)

This branch is a **development preview**, not a live shop. Production at https://chrisdeanbooks.com remains on `main` with checkout disabled. Never use live Stripe credentials on the preview branch; keep `SHOP_ENABLED=false` until the tests, shipping, files and order notifications are configured.

## Verified Stripe sandbox catalogue

These products and one-time prices have been created and inspected in the account **Chris Dean Books sandbox**, in **AUD**. Each ID is public metadata, not an API secret.

| Edition | Approved price | Stripe sandbox Product | Stripe sandbox Price | Cloudflare Pages variable |
|---|---:|---|---|---|
| Beneath Falling Leaves — Paperback | A$24.99 | `prod_VaxyPN28qsT9lm` | `price_1UZm2eR50HKK3kRTNCuWE4oS` | `STRIPE_PRICE_BENEATH_FALLING_LEAVES_PAPERBACK` |
| Beneath Falling Leaves — Ebook (EPUB) | A$2.99 | `prod_Vaxyl2umHtM0Al` | `price_1UZm2yR50HKK3kRTeGNxl68D` | `STRIPE_PRICE_BENEATH_FALLING_LEAVES_EBOOK` |
| Wildborn — Paperback | A$15.99 | `prod_VaxyF1uiEKSL9M` | `price_1UZm30R50HKK3kRTtXAoBY8c` | `STRIPE_PRICE_WILDBORN_PAPERBACK` |
| Wildborn — Ebook (EPUB) | A$2.99 | `prod_VaxzGWHpYST8YN` | `price_1UZm32R50HKK3kRTy4xnMW31` | `STRIPE_PRICE_WILDBORN_EBOOK` |
| The Glass Tapestry — Paperback | A$15.99 | `prod_Vaxz8e3nKpTzQu` | `price_1UZm35R50HKK3kRTgo4dhVWZ` | `STRIPE_PRICE_THE_GLASS_TAPESTRY_PAPERBACK` |
| The Glass Tapestry — Ebook (EPUB) | A$2.99 | `prod_VaxzJAWQ2axaSW` | `price_1UZm37R50HKK3kRTrX4NP8oN` | `STRIPE_PRICE_THE_GLASS_TAPESTRY_EBOOK` |

No direct Stripe checkout for **A Dragon's Tale: The Quest for Dragussy** until its policy eligibility is cleared. No checkout for unpublished **My Name is Monster** or **Beneath Ash & Dust**.

## Configuration still needed — Preview only

Cloudflare Pages project `chrisdeanbooks` → Settings → Preview → Variables and secrets:

1. `SHOP_ENABLED`: `false` (text). Do **not** enable yet.
2. `STRIPE_SECRET_KEY`: sandbox `sk_test_` secret from Stripe Dashboard; **encrypted Secret**. Do not put it in GitHub, HTML, screenshots or chat.
3. `STRIPE_WEBHOOK_SECRET`: **encrypted Secret** from a **sandbox** webhook/event destination to the chosen preview site's `/api/webhook`. Listen to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, and `checkout.session.expired`. This is a DIFFERENT credential from the Stripe API key.
4. Add all six `STRIPE_PRICE_...` values from the table as Text.
5. `SITE_URL`: the **actual** fully qualified HTTPS origin of the stable preview branch URL. It must match the origin where the visitor initiates checkout. Do not guess the branch alias; use the working Cloudflare preview URL.
6. Australian shipping is calculated server-side based on total paperback copies using Stripe Checkout `shipping_rate_data`. No separate `shr_...` or `STRIPE_SHIPPING_RATE_AU` is required. Provisional rates: 1 paperback A$12.95, 2–3 A$16.95, 4–5 A$21.95; ebook-only A$0.00. Five paperbacks maximum per checkout. Australia only. Verify actual parcel dimensions, packaging, and dispatch time before going live.
7. `SHOP_OWNER_EMAIL`: `chris@chrisdeanbooks.com`. The order-email sender `RESEND_FROM_ADDRESS` and `RESEND_API_KEY` must be working.
8. Bind a Cloudflare D1 database as `ORDERS` and run `db_schema.sql` (order ledger), and a **private** R2 bucket as `EBOOKS`. Upload final retail EPUBs under `ebooks/beneath-falling-leaves.epub`, `ebooks/wildborn.epub`, `ebooks/the-glass-tapestry.epub` (or override keys individually).
9. Ensure all shipping, digital-delivery, refund, privacy and inventory policies are accurate and complete. Stock reservations are now built into D1: reserve when Checkout is created, deduct after paid webhook, release after signed `checkout.session.expired`. This is code only until the D1 binding is configured and real end-to-end tests pass.
10. In preview only, when all configuration exists, temporarily set `SHOP_ENABLED=true` and `window.CD_STORE.live=true` in the preview branch browser catalogue, redeploy, then test **without real charges** using Stripe sandbox cards. Reset both flags to false if testing is incomplete.
11. Before live launch, create **separate live-mode Products/Prices** and a live Shipping Rate. Add live account keys and live webhook signing secret in the **Production** environment, do not reuse sandbox IDs or credentials, and test the production flow intentionally.

## Stripe Tax / Australian GST

Stripe Tax settings are active on the connected **sandbox account**, but there are **no registered tax jurisdictions**. The author has previously indicated that the Australian sole-trader business is **not GST-registered**. Therefore `STRIPE_TAX_ENABLED=false` and no GST is being collected. Do not add an AU tax registration in Stripe unless the business has registered with the ATO or is legally required to. If the registration status changes, configure the correct individual product tax codes for paperbacks and ebooks and review inclusive pricing; only then enable `STRIPE_TAX_ENABLED=true` and verify tax calculations. Stripe's threshold monitoring is a planning signal, not legal advice.

## Pre-launch blockers

- **Provisional postage tiers** are configured using Australia Post 1 July 2026 prepaid satchel rates. Confirm actual packaging fit and dispatch timeframe before live checkout.
- **Starting inventory confirmed:** Beneath Falling Leaves 10, Wildborn 10, The Glass Tapestry 1. `db_schema.sql` seeds these counts once with `INSERT OR IGNORE`. Apply this on a dedicated preview D1; separately seed production only when opening real sales. A code deployment does not create/update D1 tables.
- **Inventory reservation controls are implemented but not integration-tested:** verify concurrent last-copy checkouts, webhook retries, abandoned Checkout expiry, full paid settlement and stock restoration on Stripe creation errors in a real D1 environment before activation. Keep SHOP_ENABLED=false meanwhile. Offline sales or author copies need manual stock adjustments.
- **Retail EPUB files** have not been supplied or uploaded to private R2.
- **Resend** currently reports `resend-http-401-validation_error` on the contact form, so customer/owner fulfilment emails are not yet verified.
- **Privacy, shipping and returns policies** still need business-specific approval.
- **Checkout and fulfilment end-to-end tests** (including webhook retries, mixed carts, physical fulfilment, ebook entitlements, Stripe refunds and browser/mobile QA) must pass.
- **Protected order links** currently use a paid Checkout Session ID as a bearer credential. Add expiring download links/customer authentication before production, or explicitly accept the risks of transferable download links.
- **Paid copies** of any potentially restricted adult material must be cleared with the payment provider before listing.

## Technical notes

`lib/commerce.js` defines all six server-approved SKUs, Stripe Price environment bindings, quantities, and private R2 object keys. `functions/api/checkout.js` creates hosted Stripe Checkout Sessions, with AU quantity-tier shipping collection only if any paperback is in the cart; `functions/api/webhook.js` verifies Stripe signatures and stores orders in D1. `functions/api/catalog.js` checks approved Price amounts against Stripe when enabled. All payment endpoints remain server-locked until explicit activation.

Run `npm test` to validate mocked multi-edition purchases; GitHub Actions runs the same tests for this branch. A green test suite does **not** prove Cloudflare R2/D1, Stripe, Resend and live bank payouts have been configured.
