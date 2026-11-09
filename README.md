# Christopher Dean Books — cinematic author storefront

A custom, mobile-friendly, Netflix-inspired website and direct-sales storefront for **Christopher Dean Books**. Built for the author's existing **Cloudflare Pages** deployment; no Wordpress, Shopify or monthly website-builder subscription is required. The shop uses **Stripe Checkout**, **Cloudflare Pages Functions**, private **Cloudflare R2** ebook storage, **Cloudflare D1** order records, and **Resend** transactional email.

## What is ready now

- Cinematic landing page, animated book displays, responsive layout and mobile navigation.
- Individual book pages for **Wildborn** and **My Name is Monster**.
- Wildborn paperback and ebook selector, persistent shopping cart and AU-dollar display.
- Coming-soon entries cannot be accidentally purchased.
- Author biography, contact-form framework, shop, policy drafts, checkout return pages, SEO metadata and sitemap.
- Secure server-side Stripe Checkout session creation with product/quantity validation.
- Australian shipping-address collection and a Stripe shipping rate for physical orders.
- Webhook signature verification, D1 order records, and customer / author order emails.
- Protected ebook downloads from an R2 bucket, granted only after verifying a paid Checkout Session and purchased Price ID.

**Store remains in preview mode intentionally.** This project is not accepting real orders until the launch checklist is complete.

## Architecture

```text
Visitor (browser)
      │
      ▼
Cloudflare Pages  ── public/ (HTML, CSS, JS, cover assets)
      │
      ├─ /api/catalog  ──────────────► Stripe Prices (verified AUD amounts)
      ├─ /api/checkout ──────────────► Stripe hosted Checkout
      │                                  │
      │                                  └── payment success
      ├─ /api/webhook ◄────────────── Stripe signed payment webhook
      │       ├──────────────────────► D1 order ledger
      │       └──────────────────────► Resend (customer + author emails)
      ├─ /api/order ────────────────► Stripe paid-session validation
      └─ /api/download ─────────────► private R2 ebook (after payment check)
```

**Why this stack?** You previously used Cloudflare Pages and `chrisdeanbooks.com`. This lets you retain the existing domain and hosting while adding actual server-side features. Stripe hosts the payment form so your website never receives card numbers.

## View the website locally

**Simple visual preview:** open a terminal inside this folder and run:

```bash
python -m http.server 4173 -d public
```

Go to `http://localhost:4173` in your browser. All browsing pages, images and the demonstration shopping cart work. **Server-side payment functions do not run under Python's simple server.**

For full Pages Function development, install Node.js 20+ and run:

```bash
npm install
npx wrangler pages dev public
```

Cloudflare Wrangler runs the local Pages environment. Create `.dev.vars` from `.dev.vars.example` with test-mode keys only and configure local D1/R2 bindings before testing purchases. Never commit secrets.

## Launch checklist — required

1. **Final content** — confirm the official Wildborn retail blurb, publication status for all books, cover assets and ISBN/edition information. The copy in this build is draft promotional copy, not an official synopsis. The My Name is Monster artwork is treated as a coming-soon concept.
2. **Final prices** — edit example prices in `public/assets/catalog.js` (`2500` = A$25.00, `899` = A$8.99). These are examples only, **not confirmed prices**. Create matching one-time **AUD** Stripe Prices (for paperback and ebook). Once the store is live, the site pulls the authoritative prices from Stripe automatically.
3. **Stripe account** — activate a Stripe business account, create the two Prices, and create an Australian fixed shipping rate. Include shipping cost, payment fees and your packing costs when setting margin. Prices and shipping are always validated on the server side.
4. **Cloudflare D1** — create a database named e.g. `chris-dean-orders`. Run `db_schema.sql` against it. Bind it to Pages Functions as **`ORDERS`**. Orders are recorded and customer/author email delivery states are stored here. Physical stock **is not automatically reserved or decremented** in this first build; keep an accurate stock count and temporarily disable sales when needed.
5. **Cloudflare R2** — create a **private** bucket named e.g. `chris-dean-private-ebooks`, with no public bucket domain. Bind it to Pages Functions as **`EBOOKS`**. Upload your **actual legally owned EPUB** with key `ebooks/wildborn.epub`. The file is **not bundled** with this project, because the final retail ebook was not supplied. The ebook download is returned only after a Stripe payment check; the confirmation link behaves as a bearer credential and should be kept private.
6. **Resend** — verify a sending domain, configure its API key, a sender address and your order notification email. The webhook emails customers a link back to their order/download page and sends you order details; you manually pack and post physical orders. The Stripe dashboard remains the primary place to inspect the payment and address.
7. **Contact form** — set up Cloudflare Turnstile and add your verified contact destination. Change `contactEnabled` to `true` and set `turnstileSiteKey` in `public/assets/catalog.js` once the backend is configured.
8. **Policies** — replace the **draft** shipping, dispatch, damaged-item, return/refund, digital-download and privacy information on `/policies/`. Confirm your Australian Consumer Law obligations and the data-processing details. Do not launch the placeholder policy text as a completed legal policy.
9. **Domain + deployment** — connect the `public/` folder and root `functions/` directory to your current Cloudflare Pages GitHub project. Build command: **none**. Output directory: **`public`**. If your active Pages project is linked to an old repo, merge the files carefully or publish to a new preview branch/project first. Ensure `chrisdeanbooks.com` (or the exact canonical live URL) is configured as `SITE_URL`.
10. **Go live only after testing** — set the secret `SHOP_ENABLED=true` in Cloudflare production environment **and** change `live: true` in `public/assets/catalog.js` only after Stripe test-mode purchases, email fulfilment, downloads, and a physical shipping order are all verified. Both flags are required. Then switch to live Stripe keys and test with a real low-value order.

### Cloudflare Pages environment variables / secrets

| Name | Purpose |
|---|---|
| `SITE_URL` | Canonical full origin, e.g. `https://chrisdeanbooks.com` |
| `SHOP_ENABLED` | `false` until final launch; only `true` enables checkout |
| `STRIPE_SECRET_KEY` | Private Stripe secret API key |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for the exact webhook endpoint |
| `STRIPE_PRICE_WILDBORN_PAPERBACK` | Server-authorized paperback Price ID `price_…` |
| `STRIPE_PRICE_WILDBORN_EBOOK` | Server-authorized ebook Price ID `price_…` |
| `STRIPE_SHIPPING_RATE_AU` | Shipping rate `shr_…` for orders with physical books |
| `R2_WILDBORN_EBOOK_KEY` | Optional private R2 key; default `ebooks/wildborn.epub` |
| `RESEND_API_KEY` | Private transactional email API key |
| `RESEND_FROM_ADDRESS` | Verified sender identity |
| `SHOP_OWNER_EMAIL` | Author's inbox for paid order notification and contact enquiries |
| `TURNSTILE_SECRET_KEY` | Private Turnstile verification key for contact form |

**Cloudflare bindings:** `ORDERS` = D1 database; `EBOOKS` = private R2 bucket. Configure these in your existing Pages project's settings, or rename `wrangler.example.toml` to `wrangler.toml` and replace its example IDs. Do not add private secrets to `wrangler.toml` or `public/`.

### Stripe configuration

- **Checkout Session:** created on your server at `/api/checkout`. Product prices are referenced by hardcoded environment variable names; the browser cannot change them.
- **Webhook URL:** `https://chrisdeanbooks.com/api/webhook`. Subscribe to `checkout.session.completed` and `checkout.session.async_payment_succeeded` and copy the endpoint signing secret into `STRIPE_WEBHOOK_SECRET`.
- **Shipping:** Australian addresses only in this build. An Australian flat-rate Stripe Shipping Rate is collected for any cart containing a physical book. If you want international shipping, add country-specific shipping options and a fulfilment plan first.
- **Tax:** automatic Stripe Tax / GST collection has deliberately **not** been enabled by default. Set up tax only in accordance with your actual tax registrations and obligations.
- **Refunds and disputes:** manage within Stripe; communicate refund and download terms clearly in your store policies.

### D1 setup example

```bash
npx wrangler d1 create chris-dean-orders
# Put the returned database_id in wrangler.toml, then:
npx wrangler d1 execute chris-dean-orders --remote --file=db_schema.sql
```

For local tests use `--local` instead of `--remote` (and test-mode Stripe keys).

### Cloudflare R2 upload example

```bash
npx wrangler r2 bucket create chris-dean-private-ebooks
npx wrangler r2 object put chris-dean-private-ebooks/ebooks/wildborn.epub --file=PATH_TO_YOUR_FINAL_WILDBORN_EPUB
```

Keep this bucket **private**, and bind it as `EBOOKS` in Pages settings.

### Deploy

For Git-connected Cloudflare Pages: push the site into your repo and deploy with root set to project root, output directory `public`, and no build command. Pages discovers `functions/` automatically. For command-line deployments, once authenticated:

```bash
npx wrangler pages deploy public --project-name YOUR_EXISTING_PAGES_PROJECT
```

Do not replace an existing live site without first reviewing a preview deployment.

## Edit the site

| What to edit | File |
|---|---|
| Home, book sections, hero and bio text | `generate_pages.py` then run `python generate_pages.py` |
| Generated HTML pages | `public/` (can also edit directly) |
| Colours, sizing, mobile layout | `public/assets/style.css` |
| Demo prices, contact enabled switch | `public/assets/catalog.js` |
| Cart / filters / checkout browser logic | `public/assets/app.js` |
| Stripe products and digital file keys | `lib/commerce.js` |
| Photos and book covers | `public/assets/img/` |

The source `generate_pages.py` is included so the shared navigation/footer are generated consistently. If you hand-edit a generated HTML page, avoid regenerating it without transferring your edits first.

## Known limitations / items to finalise

- Preview copy and example prices must be approved before real payments.
- Physical inventory is **manual**; automatic reservations, stock decrement, shipping labels, tracking emails, and international delivery are not implemented.
- Ebook protection verifies a non-guessable paid Stripe Session ID, not a full customer login or DRM; a purchaser could share a confirmation link. A customer account or expiring token system can be added if desired.
- Customer email notifications depend on Stripe's signed webhooks, D1 and Resend being configured. Failed webhook deliveries are retried by Stripe. Concurrent duplicate webhook deliveries are unlikely but full email concurrency locking is not implemented.
- Only the private **EPUB** format is wired. PDF and additional formats may be added once the final files are supplied.
- The Contact form is intentionally disabled until verified email and anti-bot settings are provided.
- No newsletter feature is included.
- No author portrait has been fabricated; the real gold Christopher Dean logo is used instead.

## Testing

```bash
npm test
```

The tests verify server-side product validation, checkout lockdown, Stripe price IDs, Australian shipping configuration, webhook signature checks and entitlement-controlled digital downloads. **Tests mock Stripe, R2, Resend and D1**; they do not replace a live end-to-end checkout and delivery test.

## Useful current vendor references

- [Cloudflare Pages bindings (R2, D1, secrets)](https://developers.cloudflare.com/pages/functions/bindings/)
- [Stripe Checkout](https://stripe.com/payments/checkout)
- [Stripe's signed webhook example](https://github.com/stripe/stripe-node/blob/master/examples/webhook-signing/nextjs/app/api/webhooks/route.ts)

---

Made for Christopher Dean Books, November 2026. All original book art belongs to its respective rights holder. The supplied art is included for the author website's use.


## Published-book library — design stage

The preview now includes **Beneath Falling Leaves**, **Wildborn** and **The Glass Tapestry**, using the official pre-existing covers and author portrait. Each has a cinematic tile and an editorial description page. *My Name is Monster* remains in Coming Soon. Real purchasing, pricing and fulfilment are deferred until visual review. The production branch is untouched.

Frontend pages have canonical copies at the repository root, which are mirrored to public/ for either Cloudflare Pages configuration. Run python generate_pages.py after changes to synchronise the static pages and assets. Cloudflare projects chrisdeanbooks and christopherdeanbooks both deploy the preview branch; prefer the first as the future canonical project subject to verifying the domain binding in Cloudflare.

During current design review, cart buttons and example prices are intentionally hidden with an override in assets/style.css. Payment endpoints are still locked. Restore the storefront controls only after user approval and secure configuration.


## November 2026 catalogue refresh

- Three original updated user-supplied covers are stored as web-optimised assets: Beneath Falling Leaves, Wildborn and A Dragon’s Tale: The Quest for Dragussy.
- The fourth cover, The Glass Tapestry, is retained from the existing published site.
- A Dragon’s Tale is marked PRE-ORDER / 18+ throughout. The author-provided blurb appears on its book page with minor typo and sentence-case corrections. Its retailer link is not yet known; there is no fabricated link or functional pre-order button.
- Coming Soon now features My Name is Monster (working on new cover) and Beneath Ash & Dust (sequel to Beneath Falling Leaves).
- The former title and corresponding old cover assets are deleted from this preview branch. Production main remains unchanged.
- All payment functionality remains disabled; the catalogue is for design review, not order taking.
