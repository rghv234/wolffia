-- ============================================================
-- Wolffia - Migration 003: User Settings
-- Store user preferences for cross-device sync
-- ============================================================

-- Create user_settings table
CREATE TABLE IF NOT EXISTS user_settings (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    theme TEXT DEFAULT 'system' CHECK(theme IN ('light', 'dark', 'system')),
    dark_mode_intensity TEXT DEFAULT 'normal' CHECK(dark_mode_intensity IN ('normal', 'dim', 'oled')),
    accent_color TEXT DEFAULT '#ec4899',
    editor_font_size INTEGER DEFAULT 14,
    vertical_tabs_enabled INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for quick lookup by user_id
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Record migration
INSERT INTO migrations (name) VALUES ('003_user_settings.sql') ON CONFLICT DO NOTHING;
