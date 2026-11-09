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
