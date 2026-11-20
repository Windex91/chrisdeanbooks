# Private author administration

## Deployment prerequisites

1. Confirm the Pages project is **christopherdeanbooks** and inspect the production `ORDERS` D1 binding. Do not use the preview database.
2. Run `migrations/20261115_admin.sql` against that database. It only creates three administration tables, an index and a sales-audit trigger. It never seeds, resets or deletes inventory/orders. The trigger records future settled website sales inside the existing inventory transaction.
3. Create a Cloudflare Access self-hosted application covering **both** `chrisdeanbooks.com/admin` (including subpaths) and `chrisdeanbooks.com/api/admin` (including subpaths). Include www equivalents if that hostname is served. Use a single application AUD for all these paths. Do not protect the public site or Stripe webhook.
4. Allow only `chris@chrisdeanbooks.com`, using email one-time PIN or an existing identity provider. No Everyone, Bypass or service-token policies. Session duration: 8 hours or less. Verify the path coverage includes trailing slashes and descendants.
5. Set production Pages variables `ADMIN_ACCESS_ISSUER` to the exact `https://TEAM.cloudflareaccess.com` issuer (no trailing slash), `ADMIN_ACCESS_AUD` to that application's Audience tag, and `ADMIN_EMAIL` to `chris@chrisdeanbooks.com`. These are configuration values, not a new password. Preserve all existing secrets and bindings. Redeploy after configuration changes.
6. The Pages middleware verifies RS256 signatures, issuer, audience, expiry and the approved email. It denies access if configuration or authentication is missing, including direct Pages URLs. Admin API writes additionally require the canonical Origin, a custom request header and JSON. Do not add a bypass for testing.

## Initial owner-requested stock adjustment

First inspect `SELECT sku,on_hand,reserved,sold FROM inventory ORDER BY sku;` and any open reservations. Do not clear reservations. If reserved exceeds a requested quantity, reconcile the actual open checkout with Stripe before editing; do not force the count.

Once authenticated, use the dashboard's Manual correction action to set:

- Beneath Falling Leaves: **6** physical copies.
- Wildborn: **7** physical copies.
- The Glass Tapestry: **0** physical copies.

The entries preserve reserved/sold counts and create an audit record. The API refuses stale edits or quantities below reserved stock. Special Packs use the corresponding paperback's same row. Zero availability prevents physical purchases; eBooks are independent. The latest owner instruction restores The Glass Tapestry EPUB at A$2.99.

## Daily use on iPhone

Open `https://chrisdeanbooks.com/admin/` and sign in using the approved email. Safari → Share → Add to Home Screen is optional. Use +/− or enter the physical quantity, choose a reason, then Save. Nothing redeploys when you save. In-person sale increases recorded sold count; restocking, damage, complimentary copies, giveaways and corrections preserve it. Stock includes copies currently reserved for checkout, while Available excludes them.

Open an order to view products and shipping details. Choose Awaiting dispatch, Dispatched or Fulfilled; enter the Australia Post tracking number and Save. This records internal fulfilment only and does not send an email. Check customer name & payment retrieves the name/status from Stripe for older digital orders whose D1 record has no name. Refunds/disputes are flagged separately. The short order number is accompanied by the full Stripe reference. Lists are paginated.

Recorded sold totals are gross recorded website and in-person book sales, not net revenue and not an invented lifetime total. Website sales history starts when the migration is installed. Older inventory history cannot be reconstructed reliably. Existing orders default to Awaiting dispatch until reviewed; mark old dispatched/completed orders appropriately.

## Validation before production completion

- Unauthenticated `/admin/`, `/admin/index.html`, `/api/admin/overview`, `/api/admin/orders` and direct `pages.dev` equivalents must deny customer data.
- Approved email must be able to log in; a different email must fail.
- Apply migration and inspect stock reservations before initial adjustment.
- Verify saved stock survives reload and updates public catalogue; Special Packs track paperback availability.
- Verify stock can't be reduced below reservations; historical sold values unchanged on correction.
- Verify dispatch/tracking save and audit history; test on a narrow iPhone screen.
- Existing checkout and webhook suite plus new admin tests must pass (`npm test`).
