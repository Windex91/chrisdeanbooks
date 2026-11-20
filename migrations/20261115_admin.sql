-- Additive only. Run against the existing ORDERS database before enabling admin.
CREATE TABLE IF NOT EXISTS inventory_history (
 id TEXT PRIMARY KEY, sku TEXT NOT NULL, previous_stock INTEGER NOT NULL,
 new_stock INTEGER NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL,
 note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS inventory_history_date ON inventory_history(created_at DESC);
CREATE TABLE IF NOT EXISTS order_fulfilment (
 session_id TEXT PRIMARY KEY REFERENCES orders(session_id),
 status TEXT NOT NULL CHECK(status IN ('awaiting_dispatch','dispatched','fulfilled')),
 tracking TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS admin_order_history (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL, actor TEXT NOT NULL,
 previous_status TEXT NOT NULL, new_status TEXT NOT NULL,
 previous_tracking TEXT NOT NULL, new_tracking TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Captures settled website sales atomically, without changing checkout logic.
-- Reservation creation/release and administrator corrections are not sales.
CREATE TRIGGER IF NOT EXISTS admin_website_sale_history AFTER UPDATE OF on_hand ON inventory
WHEN NEW.on_hand < OLD.on_hand AND NEW.sold > OLD.sold AND NEW.reserved < OLD.reserved
BEGIN
 INSERT INTO inventory_history(id,sku,previous_stock,new_stock,reason,actor)
 VALUES(lower(hex(randomblob(16))),NEW.sku,OLD.on_hand,NEW.on_hand,'website_sale','stripe_webhook');
END;
