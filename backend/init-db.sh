#!/bin/sh
# ============================================================
# Wolffia - Database Initialization Script
# Run migrations on first startup
# ============================================================

set -e

DB_PATH="${DB_PATH:-/app/data/wolffia.db}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-/app/migrations}"

echo "=== Wolffia Database Initialization ==="
echo "Database path: $DB_PATH"

# Create data directory if needed
mkdir -p "$(dirname "$DB_PATH")"

# Check if database exists
if [ ! -f "$DB_PATH" ]; then
    echo "Creating new database..."
    touch "$DB_PATH"
fi

# Run migrations
echo "Running migrations..."
for migration in "$MIGRATIONS_DIR"/*.sql; do
    if [ -f "$migration" ]; then
        migration_name=$(basename "$migration")
        
        # Check if migration already applied
        applied=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM migrations WHERE name = '$migration_name';" 2>/dev/null || echo "0")
        
        if [ "$applied" = "0" ]; then
            echo "Applying migration: $migration_name"
            sqlite3 "$DB_PATH" < "$migration"
        else
            echo "Skipping (already applied): $migration_name"
        fi
    fi
done

echo "Database initialization complete!"
