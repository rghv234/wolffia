# ============================================================
# Wolffia Backend - Podman-Optimized Dockerfile
# OpenResty (Nginx + LuaJIT) with Lapis Framework
# Target: Self-hosted, low-resource environments
# ============================================================

FROM openresty/openresty:alpine

# Labels for OCI compliance
LABEL org.opencontainers.image.title="Wolffia Backend"
LABEL org.opencontainers.image.description="E2EE Note-taking API Server"
LABEL org.opencontainers.image.version="1.0.0"
LABEL org.opencontainers.image.vendor="Wolffia Project"

# Environment configuration
ENV LAPIS_ENV=production
ENV LUA_PATH="/usr/local/openresty/lualib/?.lua;/usr/local/openresty/lualib/?/init.lua;/app/?.lua;/app/?/init.lua;;"
ENV LUA_CPATH="/usr/local/openresty/lualib/?.so;;"

# Install system dependencies
# - luarocks: Lua package manager for Lapis
# - sqlite: Embedded database (single-file)
# - git: Required by some luarocks packages
RUN apk add --no-cache \
    luarocks5.1 \
    lua5.1-dev \
    sqlite \
    sqlite-dev \
    build-base \
    git \
    openssl-dev \
    && rm -rf /var/cache/apk/*

# Install Lapis framework and dependencies via LuaRocks
RUN luarocks-5.1 install lapis 1.17.0 \
    && luarocks-5.1 install lsqlite3 \
    && luarocks-5.1 install bcrypt \
    && luarocks-5.1 install lua-cjson \
    && luarocks-5.1 install luaossl

# Create non-root user for security (rootless Podman compatible)
RUN addgroup -g 1000 -S wolffia \
    && adduser -u 1000 -S -G wolffia -h /app wolffia

# Create application directories
RUN mkdir -p /app/data /app/logs \
    && chown -R wolffia:wolffia /app

# Set working directory
WORKDIR /app

# Copy application files
COPY --chown=wolffia:wolffia ./backend/ /app/
COPY --chown=wolffia:wolffia ./nginx.conf /usr/local/openresty/nginx/conf/nginx.conf

# Make entrypoint executable
RUN chmod +x /app/entrypoint.sh

# Create SQLite database directory with proper permissions
RUN mkdir -p /app/data \
    && chown -R wolffia:wolffia /app/data

# Expose application port
EXPOSE 8080

# Health check endpoint (Nginx-based)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:8080/health || exit 1

# Switch to non-root user
USER wolffia

# Volume for persistent SQLite database
VOLUME ["/app/data"]

# Start with entrypoint script (runs migrations then OpenResty)
CMD ["/app/entrypoint.sh"]
