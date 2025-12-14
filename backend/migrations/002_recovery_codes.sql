-- ============================================================
-- Wolffia Database Schema - Migration 002
-- Recovery Codes for E2EE Key Backup
-- ============================================================

-- Recovery codes table
-- Stores hashed recovery codes that can decrypt salt_encryption
CREATE TABLE IF NOT EXISTS recovery_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,              -- bcrypt hash of recovery code
    encrypted_salt TEXT NOT NULL,          -- salt_encryption encrypted with recovery code
    used_at DATETIME DEFAULT NULL,         -- NULL if unused
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_recovery_user ON recovery_codes(user_id);

-- Add recovery_setup_complete flag to users
-- Tracks whether user has set up recovery codes
ALTER TABLE users ADD COLUMN recovery_setup_complete INTEGER DEFAULT 0;

-- Migration tracking
INSERT OR IGNORE INTO migrations (name) VALUES ('002_recovery_codes');
