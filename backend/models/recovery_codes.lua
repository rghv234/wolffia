-- ============================================================
-- Wolffia - Recovery Codes Model
-- ============================================================

local Model = require("lapis.db.model").Model

local RecoveryCodes = Model:extend("recovery_codes", {
    primary_key = "id",
    
    relations = {
        { "user", belongs_to = "Users" }
    }
})

-- Class method: Get unused codes for user
function RecoveryCodes:get_unused(user_id)
    return self:select("WHERE user_id = ? AND used_at IS NULL", user_id)
end

-- Class method: Count unused codes
function RecoveryCodes:count_unused(user_id)
    local db = require("lapis.db")
    local result = db.query("SELECT COUNT(*) as count FROM recovery_codes WHERE user_id = ? AND used_at IS NULL", user_id)
    return result[1] and result[1].count or 0
end

-- Instance method: Mark as used
function RecoveryCodes:mark_used()
    local db = require("lapis.db")
    self:update({
        used_at = db.raw("CURRENT_TIMESTAMP")
    })
end

-- Instance method: Verify code
function RecoveryCodes:verify(plain_code)
    local bcrypt = require("bcrypt")
    return bcrypt.verify(plain_code, self.code_hash)
end

return RecoveryCodes
