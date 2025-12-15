-- ============================================================
-- Wolffia - User Settings Model
-- CRUD operations for user preferences
-- ============================================================

local Model = require("lapis.db.model").Model
local db = require("lapis.db")

local UserSettings = Model:extend("user_settings", {
    primary_key = "user_id"
})

-- Get settings for a user, creating defaults if not exists
function UserSettings:get_or_create(user_id)
    local settings = self:find(user_id)
    if not settings then
        -- Create default settings
        db.insert("user_settings", {
            user_id = user_id,
            theme = "system",
            dark_mode_intensity = "normal",
            accent_color = "#ec4899",
            editor_font_size = 14,
            vertical_tabs_enabled = 0,
            updated_at = db.raw("CURRENT_TIMESTAMP")
        })
        settings = self:find(user_id)
    end
    return settings
end

-- Update settings for a user
function UserSettings:update_for_user(user_id, data)
    local settings = self:get_or_create(user_id)
    
    -- Build update data
    local update_data = {}
    
    if data.theme ~= nil then
        update_data.theme = data.theme
    end
    if data.dark_mode_intensity ~= nil then
        update_data.dark_mode_intensity = data.dark_mode_intensity
    end
    if data.accent_color ~= nil then
        update_data.accent_color = data.accent_color
    end
    if data.editor_font_size ~= nil then
        update_data.editor_font_size = tonumber(data.editor_font_size) or 14
    end
    if data.vertical_tabs_enabled ~= nil then
        -- Convert boolean to integer for SQLite
        update_data.vertical_tabs_enabled = data.vertical_tabs_enabled and 1 or 0
    end
    
    if next(update_data) then
        update_data.updated_at = db.raw("CURRENT_TIMESTAMP")
        settings:update(update_data)
    end
    
    return settings
end

-- Convert to JSON-friendly format
function UserSettings:to_json(settings)
    return {
        theme = settings.theme,
        darkModeIntensity = settings.dark_mode_intensity,
        accentColor = settings.accent_color,
        editorFontSize = settings.editor_font_size,
        verticalTabsEnabled = settings.vertical_tabs_enabled == 1
    }
end

return UserSettings
