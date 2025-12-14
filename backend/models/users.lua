-- ============================================================
-- Wolffia - Users Model
-- ============================================================

local Model = require("lapis.db.model").Model

local Users = Model:extend("users", {
    primary_key = "id",
    
    relations = {
        { "folders", has_many = "Folders" },
        { "notes", has_many = "Notes" },
        { "sessions", has_many = "Sessions" }
    }
})

-- Instance method: Check if password matches
function Users:verify_password(password_hash)
    local bcrypt = require("bcrypt")
    return bcrypt.verify(password_hash, self.password_hash)
end

-- Class method: Find by username
function Users:find_by_username(username)
    return self:find({ username = username })
end

return Users
