-- ============================================================
-- Wolffia - Folders Model
-- ============================================================

local Model = require("lapis.db.model").Model

local Folders = Model:extend("folders", {
    primary_key = "id",
    
    relations = {
        { "user", belongs_to = "Users" },
        { "parent", belongs_to = "Folders" },
        { "children", has_many = "Folders", key = "parent_id" },
        { "notes", has_many = "Notes" }
    }
})

-- Instance method: Get full path
function Folders:get_path()
    local path = { self.name }
    local current = self
    
    while current.parent_id do
        current = Folders:find(current.parent_id)
        if current then
            table.insert(path, 1, current.name)
        else
            break
        end
    end
    
    return table.concat(path, "/")
end

-- Instance method: Get all descendants (recursive)
function Folders:get_descendants()
    local descendants = {}
    local children = Folders:select("WHERE parent_id = ?", self.id)
    
    for _, child in ipairs(children) do
        table.insert(descendants, child)
        local child_descendants = child:get_descendants()
        for _, d in ipairs(child_descendants) do
            table.insert(descendants, d)
        end
    end
    
    return descendants
end

return Folders
