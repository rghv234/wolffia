-- ============================================================
-- Wolffia - Lapis Configuration
-- ============================================================

local config = require("lapis.config")

-- Development environment
config("development", {
    port = 8080,
    code_cache = "off",
    num_workers = 1,
    
    -- SQLite database path
    sqlite = {
        database = "/app/data/wolffia.db"
    },
    
    -- Session settings
    session_name = "wolffia_session",
    secret = "CHANGE_THIS_IN_PRODUCTION_32_CHARS"
})

-- Production environment
config("production", {
    port = 8080,
    code_cache = "on",
    num_workers = "auto",
    
    -- SQLite database path
    sqlite = {
        database = "/app/data/wolffia.db"
    },
    
    -- Session settings (use env var in production)
    session_name = "wolffia_session",
    secret = os.getenv("LAPIS_SECRET") or "CHANGE_THIS_IN_PRODUCTION_32_CHARS"
})

-- Test environment
config("test", {
    port = 8081,
    code_cache = "off",
    num_workers = 1,
    
    sqlite = {
        database = ":memory:"
    },
    
    session_name = "wolffia_test",
    secret = "test_secret_key_32_characters__"
})
