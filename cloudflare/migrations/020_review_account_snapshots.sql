CREATE TABLE IF NOT EXISTS review_account_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    archive_date TEXT NOT NULL UNIQUE,
    accounts_snapshot TEXT NOT NULL,
    snapshot_source TEXT NOT NULL DEFAULT 'manual_review',
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_account_snapshots_date
    ON review_account_snapshots(archive_date);
