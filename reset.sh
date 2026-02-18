#!/bin/bash

echo "🗑️  AgentVault Reset Tool"
echo "========================="
echo ""
echo "This will delete ALL vault data including:"
echo "  - All stored API keys"
echo "  - Master password"
echo "  - LLM configuration"
echo "  - All encrypted data"
echo ""
echo "⚠️  This action CANNOT be undone!"
echo ""

read -p "Are you sure? Type 'RESET' to confirm: " confirm

if [ "$confirm" != "RESET" ]; then
    echo "Cancelled."
    exit 0
fi

# Stop the server
pkill -f "node server.js" 2>/dev/null

# Delete the database
cd "$(dirname "$0")"
if [ -f "vault.db" ]; then
    rm vault.db
    echo "✅ Database deleted"
else
    echo "ℹ️  No database found (already reset?)"
fi

echo ""
echo "✅ AgentVault has been reset to factory defaults!"
echo ""
echo "Start the server again with: node server.js"
echo "Then visit: http://localhost:8765"
