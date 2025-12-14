-- ============================================================
-- Wolffia - Sessions Model
-- ============================================================

local Model = require("lapis.db.model").Model

local Sessions = Model:extend("sessions", {
    primary_key = "id",
    
    relations = {
        { "user", belongs_to = "Users" }
    }
})

-- Class method: Clean expired sessions
function Sessions:clean_expired()
    local db = require("lapis.db")
    return db.delete("sessions", db.raw("expires_at < CURRENT_TIMESTAMP"))
end

-- Class method: Find valid session by token
function Sessions:find_valid(token)
    local session = self:find({ token = token })
    if not session then return nil end
    
    if session.expires_at < os.date("!%Y-%m-%d %H:%M:%S") then
        session:delete()
        return nil
    end
    
    return session
end

return Sessions
