#!/bin/sh
# ============================================================
# Wolffia - Docker Entrypoint
# Initializes database and starts OpenResty
# ============================================================

set -e

echo "=== Wolffia Backend Starting ==="

# Initialize database if needed
DB_PATH="/app/data/wolffia.db"
MIGRATIONS_DIR="/app/migrations"

# Create data directory if needed
mkdir -p "$(dirname "$DB_PATH")"

# Check if database exists and has tables
if [ ! -f "$DB_PATH" ] || [ ! -s "$DB_PATH" ]; then
    echo "Creating new database..."
    touch "$DB_PATH"
fi

# Create migrations table if not exists
sqlite3 "$DB_PATH" "CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);"

# Run migrations
echo "Checking migrations..."
for migration in "$MIGRATIONS_DIR"/*.sql; do
    if [ -f "$migration" ]; then
        migration_name=$(basename "$migration")
        
        # Check if migration already applied
        applied=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM migrations WHERE name = '$migration_name';")
        
        if [ "$applied" = "0" ]; then
            echo "Applying migration: $migration_name"
            sqlite3 "$DB_PATH" < "$migration"
            sqlite3 "$DB_PATH" "INSERT INTO migrations (name) VALUES ('$migration_name');"
        fi
    fi
done

echo "Database ready!"
echo "Starting OpenResty..."

# Start OpenResty
exec openresty -g "daemon off;"
