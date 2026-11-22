-- Safe to rerun. Existing stock, reservations and sales are never reset.
INSERT OR IGNORE INTO inventory (sku,on_hand,reserved,sold) VALUES ('a-dragons-tale-paperback',30,0,0);
CREATE TABLE IF NOT EXISTS ebook_release_queue (
 session_id TEXT NOT NULL REFERENCES orders(session_id), sku TEXT NOT NULL,
 release_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','cancelled')),
 attempts INTEGER NOT NULL DEFAULT 0, last_attempt INTEGER, last_error TEXT, sent_at INTEGER,
 PRIMARY KEY(session_id,sku)
);
CREATE INDEX IF NOT EXISTS ebook_release_due ON ebook_release_queue(status,release_at);
CREATE TABLE IF NOT EXISTS release_job_health (id INTEGER PRIMARY KEY CHECK(id=1),last_seen INTEGER NOT NULL);
