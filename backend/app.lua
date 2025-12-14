-- ============================================================
-- Wolffia Backend - Main Lapis Application
-- E2EE Note-taking API Server
-- ============================================================

local lapis = require("lapis")
local app = lapis.Application()
local respond_to = require("lapis.application").respond_to
local json_params = require("lapis.application").json_params
local cjson = require("cjson")

-- Import models
local Users = require("models.users")
local Folders = require("models.folders")
local Notes = require("models.notes")
local Sessions = require("models.sessions")
local RecoveryCodes = require("models.recovery_codes")

-- Import utilities
local db = require("lapis.db")
local bcrypt = require("bcrypt")

-- ============================================================
-- Middleware: JSON Response Helper
-- ============================================================
local function json_response(self, data, status)
    self.res.headers["Content-Type"] = "application/json"
    return { json = data, status = status or 200 }
end

local function json_error(self, message, status)
    return json_response(self, { error = message }, status or 400)
end

-- ============================================================
-- Middleware: Authentication
-- Supports both Bearer header (API) and query param (SSE)
-- ============================================================
local function require_auth(self)
    local token = nil
    
    -- First try Authorization header
    local auth_header = self.req.headers["authorization"]
    if auth_header then
        token = auth_header:match("^Bearer%s+(.+)$")
    end
    
    -- Fall back to query param (for SSE which can't set headers)
    if not token and self.params.token then
        token = self.params.token
    end
    
    if not token then
        return json_error(self, "Missing authorization", 401)
    end
    
    local session = Sessions:find({ token = token })
    if not session then
        return json_error(self, "Invalid or expired token", 401)
    end
    
    -- Check expiration
    if session.expires_at < os.date("!%Y-%m-%d %H:%M:%S") then
        session:delete()
        return json_error(self, "Token expired", 401)
    end
    
    self.current_user = Users:find(session.user_id)
    if not self.current_user then
        return json_error(self, "User not found", 401)
    end
    
    return nil -- Auth passed
end

-- ============================================================
-- Health Check Endpoint
-- ============================================================
app:match("health", "/health", function(self)
    return { layout = false, "OK" }
end)

-- ============================================================
-- Root Route - API Info
-- ============================================================
app:match("index", "/", function(self)
    return json_response(self, {
        name = "Wolffia API",
        version = "1.0.0",
        status = "running",
        endpoints = {
            "/health",
            "/auth/params",
            "/auth/register",
            "/auth/login",
            "/api/folders",
            "/api/notes",
            "/events"
        }
    })
end)

-- ============================================================
-- Auth: Get Parameters (Public - returns salts)
-- ============================================================
app:match("auth_params", "/auth/params", respond_to({
    GET = function(self)
        local username = self.params.username
        if not username or username == "" then
            return json_error(self, "Username required")
        end
        
        local user = Users:find({ username = username })
        if not user then
            return json_error(self, "User not found", 404)
        end
        
        return json_response(self, {
            salt_auth = user.salt_auth,
            salt_encryption = user.salt_encryption
        })
    end
}))

-- ============================================================
-- Auth: Register
-- ============================================================
app:match("auth_register", "/auth/register", respond_to({
    POST = json_params(function(self)
        local username = self.params.username
        local password_hash = self.params.password_hash
        local salt_auth = self.params.salt_auth
        local salt_encryption = self.params.salt_encryption
        
        -- Validation
        if not username or username == "" then
            return json_error(self, "Username required")
        end
        if not password_hash or password_hash == "" then
            return json_error(self, "Password hash required")
        end
        if not salt_auth or not salt_encryption then
            return json_error(self, "Salts required")
        end
        
        -- Check if user exists
        local existing = Users:find({ username = username })
        if existing then
            return json_error(self, "Username already taken", 409)
        end
        
        -- Hash the Key A (password_hash) with bcrypt for storage
        local stored_hash = bcrypt.digest(password_hash, 10)
        
        -- Create user
        local user = Users:create({
            username = username,
            password_hash = stored_hash,
            salt_auth = salt_auth,
            salt_encryption = salt_encryption
        })
        
        if not user then
            return json_error(self, "Failed to create user", 500)
        end
        
        return json_response(self, {
            id = user.id,
            username = user.username
        }, 201)
    end)
}))

-- ============================================================
-- Auth: Login
-- ============================================================
app:match("auth_login", "/auth/login", respond_to({
    POST = json_params(function(self)
        local username = self.params.username
        local password_hash = self.params.password_hash
        
        if not username or not password_hash then
            return json_error(self, "Username and password hash required")
        end
        
        local user = Users:find({ username = username })
        if not user then
            return json_error(self, "Invalid credentials", 401)
        end
        
        -- Verify Key A hash with bcrypt
        if not bcrypt.verify(password_hash, user.password_hash) then
            return json_error(self, "Invalid credentials", 401)
        end
        
        -- Generate session token
        local token = require("resty.random").bytes(32)
        token = require("ngx").encode_base64(token)
        
        -- Create session (expires in 7 days)
        local expires = os.date("!%Y-%m-%d %H:%M:%S", os.time() + 7 * 24 * 60 * 60)
        local session = Sessions:create({
            user_id = user.id,
            token = token,
            expires_at = expires
        })
        
        return json_response(self, {
            token = token,
            expires_at = expires,
            user = {
                id = user.id,
                username = user.username
            }
        })
    end)
}))

-- ============================================================
-- Auth: Logout
-- ============================================================
app:match("auth_logout", "/auth/logout", respond_to({
    POST = function(self)
        local auth_err = require_auth(self)
        if auth_err then return auth_err end
        
        local token = self.req.headers["authorization"]:match("^Bearer%s+(.+)$")
        db.delete("sessions", { token = token })
        
        return json_response(self, { message = "Logged out" })
    end
}))

-- ============================================================
-- Folders API
-- ============================================================
app:match("folders_list", "/api/folders", respond_to({
    before = function(self)
        return require_auth(self)
    end,
    
    GET = function(self)
        local folders = Folders:select("WHERE user_id = ? ORDER BY rank, name", self.current_user.id)
        return json_response(self, folders)
    end,
    
    POST = json_params(function(self)
        local name = self.params.name
        if not name or name == "" then
            return json_error(self, "Folder name required")
        end
        
        local folder = Folders:create({
            user_id = self.current_user.id,
            parent_id = self.params.parent_id,
            name = name,
            icon = self.params.icon,
            color = self.params.color,
            rank = self.params.rank or 0
        })
        
        return json_response(self, folder, 201)
    end)
}))

app:match("folders_item", "/api/folders/:id", respond_to({
    before = function(self)
        return require_auth(self)
    end,
    
    GET = function(self)
        local folder = Folders:find({
            id = self.params.id,
            user_id = self.current_user.id
        })
        if not folder then
            return json_error(self, "Folder not found", 404)
        end
        return json_response(self, folder)
    end,
    
    PUT = json_params(function(self)
        local folder = Folders:find({
            id = self.params.id,
            user_id = self.current_user.id
        })
        if not folder then
            return json_error(self, "Folder not found", 404)
        end
        
        folder:update({
            name = self.params.name or folder.name,
            parent_id = self.params.parent_id,
            icon = self.params.icon,
            color = self.params.color,
            rank = self.params.rank,
            updated_at = db.raw("CURRENT_TIMESTAMP")
        })
        
        return json_response(self, folder)
    end),
    
    DELETE = function(self)
        local folder = Folders:find({
            id = self.params.id,
            user_id = self.current_user.id
        })
        if not folder then
            return json_error(self, "Folder not found", 404)
        end
        
        folder:delete()
        return json_response(self, { message = "Folder deleted" })
    end
}))

-- ============================================================
-- Notes API
-- ============================================================
app:match("notes_list", "/api/notes", respond_to({
    before = function(self)
        return require_auth(self)
    end,
    
    GET = function(self)
        local query = "WHERE user_id = ?"
        local params = { self.current_user.id }
        
        if self.params.folder_id then
            query = query .. " AND folder_id = ?"
            table.insert(params, self.params.folder_id)
        end
        
        query = query .. " ORDER BY updated_at DESC"
        
        local notes = Notes:select(query, unpack(params))
        return json_response(self, notes)
    end,
    
    POST = json_params(function(self)
        local title = self.params.title
        if not title or title == "" then
            return json_error(self, "Note title required")
        end
        
        local note = Notes:create({
            user_id = self.current_user.id,
            folder_id = self.params.folder_id,
            title = title,
            content_blob = self.params.content_blob or "",
            icon = self.params.icon,
            color = self.params.color,
            encoding = self.params.encoding or "UTF-8"
        })
        
        return json_response(self, note, 201)
    end)
}))

app:match("notes_item", "/api/notes/:id", respond_to({
    before = function(self)
        return require_auth(self)
    end,
    
    GET = function(self)
        local note = Notes:find({
            id = self.params.id,
            user_id = self.current_user.id
        })
        if not note then
            return json_error(self, "Note not found", 404)
        end
        return json_response(self, note)
    end,
    
    PUT = json_params(function(self)
        local note = Notes:find({
            id = self.params.id,
            user_id = self.current_user.id
        })
        if not note then
            return json_error(self, "Note not found", 404)
        end
        
        note:update({
            title = self.params.title or note.title,
            folder_id = self.params.folder_id,
            content_blob = self.params.content_blob or note.content_blob,
            icon = self.params.icon,
            color = self.params.color,
            encoding = self.params.encoding,
            updated_at = db.raw("CURRENT_TIMESTAMP")
        })
        
        return json_response(self, note)
    end),
    
    DELETE = function(self)
        local note = Notes:find({
            id = self.params.id,
            user_id = self.current_user.id
        })
        if not note then
            return json_error(self, "Note not found", 404)
        end
        
        note:delete()
        return json_response(self, { message = "Note deleted" })
    end
}))

-- ============================================================
-- SSE: Server-Sent Events for Real-time Sync
-- ============================================================
app:match("events", "/events", function(self)
    local auth_err = require_auth(self)
    if auth_err then return auth_err end
    
    -- SSE headers are set in nginx.conf
    ngx.header["Content-Type"] = "text/event-stream"
    ngx.header["Cache-Control"] = "no-cache"
    ngx.header["Connection"] = "keep-alive"
    
    -- Send initial connection event
    ngx.say("event: connected")
    ngx.say("data: " .. cjson.encode({ user_id = self.current_user.id }))
    ngx.say("")
    ngx.flush(true)
    
    -- Keep connection open and send heartbeat
    -- In production, implement proper pub/sub with Redis or similar
    local heartbeat_count = 0
    while true do
        ngx.sleep(30) -- 30 second heartbeat
        heartbeat_count = heartbeat_count + 1
        
        ngx.say("event: heartbeat")
        ngx.say("data: " .. cjson.encode({ count = heartbeat_count }))
        ngx.say("")
        
        local ok, err = ngx.flush(true)
        if not ok then
            break -- Client disconnected
        end
    end
    
    return { layout = false }
end)

-- ============================================================
-- Recovery Codes API
-- ============================================================
app:match("recovery_generate", "/auth/recovery/generate", respond_to({
    POST = json_params(function(self)
        local auth_err = require_auth(self)
        if auth_err then return auth_err end
        
        -- Check if already has unused codes
        local existing_count = RecoveryCodes:count_unused(self.current_user.id)
        if existing_count >= 5 then
            return json_error(self, "Maximum recovery codes reached. Use or delete existing codes first.", 400)
        end
        
        local encrypted_salt = self.params.encrypted_salt
        if not encrypted_salt then
            return json_error(self, "Encrypted salt required", 400)
        end
        
        -- Generate 5 recovery codes
        local codes = {}
        for i = 1, 5 do
            -- Generate a random 8-character alphanumeric code
            local rand_bytes = require("resty.random").bytes(6)
            local code = ngx.encode_base64(rand_bytes):sub(1, 8):upper()
            code = code:gsub("[/+]", "X") -- Remove confusing characters
            
            -- Store hashed code with encrypted salt
            local code_hash = bcrypt.digest(code, 10)
            RecoveryCodes:create({
                user_id = self.current_user.id,
                code_hash = code_hash,
                encrypted_salt = encrypted_salt
            })
            
            table.insert(codes, code)
        end
        
        -- Mark user as having recovery set up
        self.current_user:update({
            recovery_setup_complete = 1
        })
        
        return json_response(self, {
            codes = codes,
            message = "Store these codes safely. Each can only be used once."
        }, 201)
    end)
}))

app:match("recovery_verify", "/auth/recovery/verify", respond_to({
    POST = json_params(function(self)
        local username = self.params.username
        local recovery_code = self.params.recovery_code
        
        if not username or not recovery_code then
            return json_error(self, "Username and recovery code required", 400)
        end
        
        local user = Users:find({ username = username })
        if not user then
            return json_error(self, "User not found", 404)
        end
        
        -- Find matching unused recovery code
        local unused_codes = RecoveryCodes:get_unused(user.id)
        local matched_code = nil
        
        for _, code_record in ipairs(unused_codes) do
            if bcrypt.verify(recovery_code:upper(), code_record.code_hash) then
                matched_code = code_record
                break
            end
        end
        
        if not matched_code then
            return json_error(self, "Invalid or already used recovery code", 401)
        end
        
        -- Mark code as used
        matched_code:mark_used()
        
        -- Return the encrypted salt (client decrypts with recovery code)
        return json_response(self, {
            encrypted_salt = matched_code.encrypted_salt,
            salt_auth = user.salt_auth,
            remaining_codes = RecoveryCodes:count_unused(user.id)
        })
    end)
}))

app:match("recovery_status", "/auth/recovery/status", respond_to({
    GET = function(self)
        local auth_err = require_auth(self)
        if auth_err then return auth_err end
        
        return json_response(self, {
            setup_complete = self.current_user.recovery_setup_complete == 1,
            unused_codes = RecoveryCodes:count_unused(self.current_user.id)
        })
    end
}))

return app
