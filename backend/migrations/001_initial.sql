-- ============================================================
-- Wolffia Database Schema - SQLite Migration 001
-- E2EE Note-taking Workspace
-- ============================================================

-- Enable foreign key constraints
PRAGMA foreign_keys = ON;

-- ============================================================
-- Users Table
-- Dual-salt design for E2EE:
--   salt_auth: Used to derive Key A (sent to server for auth)
--   salt_encryption: Used to derive Key B (never leaves client)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    salt_auth TEXT NOT NULL,
    salt_encryption TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- ============================================================
-- Folders Table
-- Hierarchical structure with self-referencing parent_id
-- ============================================================
CREATE TABLE IF NOT EXISTS folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    parent_id INTEGER DEFAULT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT NULL,
    color TEXT DEFAULT NULL,
    rank INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON folders(parent_id);

-- ============================================================
-- Notes Table
-- content_blob stores AES-GCM encrypted content (Base64)
-- folder_id can be NULL for root-level notes
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    folder_id INTEGER DEFAULT NULL,
    title TEXT NOT NULL,
    content_blob TEXT NOT NULL DEFAULT '',
    icon TEXT DEFAULT NULL,
    color TEXT DEFAULT NULL,
    encoding TEXT DEFAULT 'UTF-8',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);

-- ============================================================
-- Sessions Table (optional, for token-based auth)
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ============================================================
-- Migration Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO migrations (name) VALUES ('001_initial');
