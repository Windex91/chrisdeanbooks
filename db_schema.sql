-- Cloudflare D1 schema. Order emails are idempotent across webhook retries.
CREATE TABLE IF NOT EXISTS orders (
  session_id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  items_json TEXT NOT NULL,
  shipping_json TEXT,
  customer_notified INTEGER NOT NULL DEFAULT 0,
  owner_notified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Inventory is per physical title, not per Stripe Product. Seed exactly once.
-- Do not reset live counts with REPLACE during future deployments.
CREATE TABLE IF NOT EXISTS inventory (
  sku TEXT PRIMARY KEY,
  on_hand INTEGER NOT NULL CHECK(on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK(reserved >= 0 AND reserved <= on_hand),
  sold INTEGER NOT NULL DEFAULT 0 CHECK(sold >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS inventory_reservations (
  id TEXT PRIMARY KEY,
  session_id TEXT UNIQUE,
  state TEXT NOT NULL CHECK(state IN ('open','paid','expired','failed')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory_reservation_items (
  reservation_id TEXT NOT NULL REFERENCES inventory_reservations(id),
  sku TEXT NOT NULL REFERENCES inventory(sku),
  quantity INTEGER NOT NULL CHECK(quantity > 0),
  state TEXT NOT NULL DEFAULT 'held' CHECK(state IN ('held','paid','released')),
  PRIMARY KEY (reservation_id, sku)
);
CREATE INDEX IF NOT EXISTS inventory_reservation_status_idx ON inventory_reservations(state, expires_at);
-- Stock starts at zero. Set actual counted stock separately after owner confirmation.
INSERT OR IGNORE INTO inventory (sku,on_hand) VALUES
('beneath-falling-leaves-paperback',0),('wildborn-paperback',0),('the-glass-tapestry-paperback',0);
CREATE TABLE IF NOT EXISTS order_payments (
 session_id TEXT PRIMARY KEY, payment_intent TEXT NOT NULL, amount_total INTEGER NOT NULL,
 shipping_total INTEGER NOT NULL, tax_total INTEGER NOT NULL, currency TEXT NOT NULL,
 livemode INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS revoked_payments (
 payment_intent TEXT PRIMARY KEY, reason TEXT NOT NULL, event_id TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_outbox (
 id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, first_attempt INTEGER NOT NULL,
 sent_id TEXT, sent_at INTEGER
);
