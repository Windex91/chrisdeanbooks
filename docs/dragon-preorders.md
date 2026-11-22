# Dragon preorders deployment

Paperback 1599 AUD cents, ebook 299. Paperback allocation 30 (not books already on hand). Paperback release 2026-12-17 00:00 Sydney; expected dispatch around that date. Ebook release 2026-12-24 00:01 Sydney = 2026-12-23 13:01 UTC.

Run migrations/20261122_preorders.sql against preview and production (idempotent; never resets existing quantities). Configure STRIPE_PRICE_A_DRAGONS_TALE_PAPERBACK and STRIPE_PRICE_A_DRAGONS_TALE_EBOOK with matching mode, one-time AUD prices and product metadata site_sku. Enable DRAGON_PREORDERS_ENABLED only after preview checkout tests. Upload the approved EPUB privately to EBOOKS key ebooks/a-dragons-tale.epub; never commit the file or make R2 public.

Deploy workers/ebook-release separately with a per-minute cron. Set its SITE_URL to the matching Pages origin and set the same strong EBOOK_RELEASE_JOB_SECRET in Worker and Pages secrets. Verify heartbeat, a sandbox due delivery, refund exclusion, and retry deduplication before setting DRAGON_EBOOK_ENABLED=true. The catalogue and checkout disable pending ebook sales if heartbeat is over ten minutes old. Post-release downloads are server gated by date, entitlement and payment.

Monitor Worker failures and ebook_release_queue.last_error. Outbox uncertain delivery retries stop after 23 hours to avoid duplicates outside Resend idempotency; reconcile provider delivery before resetting a queue/outbox record. No blind re-send. Worker processes 20 due rows per minute; release emails begin at 00:01, not a promise of every inbox arriving at that exact second.

Mixed physical preorders require together/split choice. Australia together 1295 cents; split 1943 cents, charged once. Digital-only no shipping. Split international shipments require individual quotes. Server validates the stored plan at fulfilment using original Stripe session creation date. Admin and order emails show arrangement. For split orders, retain first tracking in audit history, do not mark fulfilled until both parcels are complete.

On receipt of the initial 30-copy batch, do not add 30 again: preorder allocation already represents it. Fulfil prepaid orders and reconcile remaining unsold stock. Standard paperback sales start automatically on Dec17 without resetting stock.
