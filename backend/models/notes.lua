-- ============================================================
-- Wolffia - Notes Model
-- ============================================================

local Model = require("lapis.db.model").Model

local Notes = Model:extend("notes", {
    primary_key = "id",
    
    relations = {
        { "user", belongs_to = "Users" },
        { "folder", belongs_to = "Folders" }
    }
})

-- Instance method: Touch updated_at
function Notes:touch()
    local db = require("lapis.db")
    self:update({
        updated_at = db.raw("CURRENT_TIMESTAMP")
    })
end

-- Class method: Find notes by folder
function Notes:find_by_folder(user_id, folder_id)
    if folder_id then
        return self:select("WHERE user_id = ? AND folder_id = ? ORDER BY updated_at DESC", user_id, folder_id)
    else
        return self:select("WHERE user_id = ? AND folder_id IS NULL ORDER BY updated_at DESC", user_id)
    end
end

-- Class method: Search notes (title only, content is encrypted)
function Notes:search_by_title(user_id, query)
    local escaped_query = "%" .. query:gsub("%%", "%%%%") .. "%"
    return self:select("WHERE user_id = ? AND title LIKE ? ORDER BY updated_at DESC", user_id, escaped_query)
end

return Notes
