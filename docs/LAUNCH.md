# Launch status — 10 November 2026

**NOT LIVE. Do not enable checkout yet.**

Production project: **christopherdeanbooks**. Repository: Windex91/chrisdeanbooks.
Deploy `public/`, repository root for Functions, no static build command.
Do not move custom domains, change nameservers or edit existing DNS/email records.
The similarly named `chrisdeanbooks` project is not production.

## Verified during preparation

- All six connected sandbox and live Stripe Prices match the approved AUD amounts.
- Current production catalogue fetched successfully; checkout remains disabled.
- Automated local mixed-order test runs the actual SQL schema, stock reservation,
  signed webhook, customer and owner emails, duplicate event retry, private EPUB
  response, wrong-book denial and refund denial. External providers are simulated.
- This is **not** a completed Stripe sandbox purchase or proof of email delivery.
- Cloudflare Wrangler Functions bundle compiled successfully locally.
- 3D images, styles and Coming Soon content remain unchanged. Simon Leith credit retained.

## Required account setup (not completed)

Cloudflare browser sign-in failed. No Cloudflare or Resend account changes were made.
Use trusted dashboards for secret entry; never commit or paste credentials into chat.

1. Inspect existing resources first. Create separate sandbox and production D1 databases
   and private R2 buckets if absent. Bind `ORDERS` and `EBOOKS` to each environment.
   Do not expose R2 through r2.dev or a public custom domain.
2. Back up any existing D1 database. Run `db_schema.sql` using the D1 console against
   the intended database. It is additive and uses INSERT OR IGNORE; it does not
   overwrite existing stock. Initial production stock confirmed 10 November 2026: Beneath Falling Leaves 10,
   Wildborn 10, The Glass Tapestry 1. Existing rows are NOT overwritten; inspect
   existing sales/reservations before reconciling any previous zero-stock rows.
   Test stock belongs only in the sandbox database.
3. Upload the approved final EPUBs privately under:
   - `ebooks/beneath-falling-leaves.epub`
   - `ebooks/wildborn.epub`
   - `ebooks/the-glass-tapestry.epub`
   Verify the actual archive, cover, title and download bytes; these files have not
   been uploaded or verified in this launch session. Never place them in public/.
4. In Pages Settings > Variables and Secrets, enter encrypted secrets separately
   for production and preview: `STRIPE_SECRET_KEY` (prefer restricted key),
   `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `DOWNLOAD_TOKEN_SECRET` (32+ random chars).
   Runtime Stripe permissions: Checkout Sessions read/write, Prices/Products read,
   PaymentIntents/Charges read, and any dependent customer creation permission.
   Verify the restricted key in the sandbox. No secret values belong in source.
5. Set ordinary variables: `SITE_URL`, `STRIPE_MODE` (`sandbox` or `live`),
   `RESEND_FROM_ADDRESS`, `SHOP_OWNER_EMAIL`, and the six `STRIPE_PRICE_*` IDs.
   Sandbox SITE_URL must be its own preview origin, never a production hostname.
6. Verify Resend's sending domain and sender. Existing mail/DNS records must not be
   replaced. If additional verification DNS records are required, stop and agree
   an additive configuration with the owner before changing DNS. Verify customer
   and owner test inbox receipt, not just an accepted API request.
7. Register a webhook on each matching Stripe account at that environment's
   `/api/webhook`, using the pinned API version `2026-09-30.endive`. Subscribe to
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `checkout.session.async_payment_failed`, `checkout.session.expired`,
   `charge.refunded`, `charge.dispute.created`. Set each signing secret in its
   corresponding Pages environment. Redeploy after binding/secret updates.
8. Shipping is owner-approved: flat A$13 per Australian paperback order, no postage
   for EPUB-only orders. Implemented server-side as 1300 AUD cents; obsolete quantity
   tier variables are ignored. Record `SHIPPING_APPROVED=true` during secure setup.
   No five-paperback cap: quantities are checked against available stock.
9. Owner confirmed on 10 November 2026: not registered for GST.
   ABN supplied by owner: 26 920 834 116. Public ABN Lookup verification was
   unavailable in this session; this records the owner's declaration only.
   Set `GST_TREATMENT=not_registered` and `GST_APPROVED=true` during secure
   configuration. Do not enable Stripe automatic tax or add GST to the approved
   book prices or A$13 shipping. Confirmation emails state that GST was not charged.
10. Review `POLICY_DRAFT.md` with the owner, finalise all blanks, publish approved
    policies, then run the real hosted sandbox acceptance checks below.

## Acceptance checks still required

On an isolated preview with sandbox-only bindings, temporarily enable the frontend
catalogue and `SHOP_ENABLED=true`. Keep production disabled. Use the real Checkout
page and Stripe test card to buy at least one paperback plus one ebook. Confirm:

- Correct AUD products, quantities, extra shipping, and no shipping on digital-only carts.
- Paid signed webhook succeeds; D1 order and payment records exist, stock decrements once.
- Both real transactional emails arrive; email link downloads the correct final EPUB.
- Replay webhook: no duplicate stock decrement or email. Expired/unpaid checkout releases stock.
- Declined/delayed payment grants no access; invalid signature writes nothing.
- Forged/expired link and another book's link are rejected; refund/dispute blocks delivery.
- Mobile/desktop bag and checkout layout preserve the existing design.

Do not mark FULFILMENT_TESTS_PASSED true until this deployed test is recorded.
After sandbox success, configure production while still disabled and safely verify
HTTPS, all six prices, private objects, bindings, sender domain, webhook mode and
configuration. Do not create a real payment without separate explicit approval.

## Production launch gates

Both `public/assets/catalog.js` live flag and `SHOP_ENABLED` stay false by default.
Live requests additionally require ALL of these explicit true flags:
`LIVE_LAUNCH_APPROVED`, `SHIPPING_APPROVED`, `GST_APPROVED`, `POLICIES_APPROVED`,
`FULFILMENT_TESTS_PASSED`. Shipping is fixed at the approved A$13; GST treatment is owner-confirmed as not registered.
These are deployment controls, not evidence: record who approved and what tests passed
before setting them. Rollback: disable SHOP_ENABLED immediately; leave webhooks running
so existing paid orders still fulfil. Never disable webhook processing to pause new sales.

## Recovery and operating procedures

- Fulfil physical orders from owner email/D1, including quantity and shipping address.
  Record dispatch/tracking operationally; no automated postage purchase is included.
- Reconcile open stock holds against Stripe. Network failures can leave a hold with no
  locally attached session; use its Stripe reservation metadata/idempotency key and
  confirm expiry/nonpayment before release. Do not release by elapsed local time alone.
- Email outbox stores exact requests and provider IDs; stable Resend idempotency keys
  prevent concurrent duplicate sends. Uncertain attempts older than 23 hours stop for
  provider reconciliation because Resend deduplicates for 24 hours. Confirm delivery
  state in Resend before manually clearing/retrying an uncertain attempt.
- Download links last seven days from session creation. Assistance/reissue is manual
  after validating purchaser identity and payment. Never publish a download token.
- Any refund (including partial) or dispute blocks all digital access for that payment
  pending manual review; do not automatically restock posted books. Revocation is sticky.
- Retention and privacy requests require an agreed procedure; no automatic purge is configured.

References: Cloudflare Pages bindings https://developers.cloudflare.com/pages/functions/bindings/
Resend idempotency https://resend.com/docs/dashboard/emails/idempotency-keys

## Owner approvals and hosted sandbox evidence — 10 November 2026

Owner approved Australia-only flat A$13 shipping with no five-copy cap, dispatch within three business days using tracked Australia Post, returns, seven-day EPUB links, privacy, and five-year essential-record retention. Review unneeded delivery details after twelve months.

Hosted sandbox mixed order A$31.98: Wildborn paperback + Beneath Falling Leaves EPUB + A$13 postage. Owner confirmed customer and author emails arrived and EPUB downloaded/opened. D1 screenshot showed Wildborn 9 on hand, zero reserved, one sold. Owner confirmed webhook replay did not duplicate stock deduction or emails. Full sandbox refund succeeded; owner confirmed charge.refunded delivery and further download denial. These are owner-observed hosted checks, separate from automated tests.

Retention procedure: annually review completed records and associated order emails/exports. Preserve essential accounting evidence for five years from the later of creation and transaction completion; extend for legal holds/disputes. At twelve months review delivery addresses for removal/anonymisation where no longer necessary, including copies in orders.shipping_json, sent email_outbox.payload_json, owner mail and exports. Do not change unsent outbox payloads or destroy required financial evidence. Provider-controlled records/backups follow provider retention. Deletion is a documented manual review, not an implemented automatic job.

Production still requires deployment, live webhook secret, safe validation and launch gate configuration. Never seed production from sandbox stock or reset live inventory.
