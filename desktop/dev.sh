#!/bin/bash
# Run AgentVault Desktop in dev mode

echo "========================================"
echo "AgentVault Desktop (Dev Mode)"
echo "========================================"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: Run this from the desktop/ directory"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Starting AgentVault Desktop..."
echo ""
echo "This will:"
echo "  1. Start the backend server"
echo "  2. Open a native desktop window"
echo "  3. Show a tray icon"
echo ""
echo "Press Cmd+Q (Mac) or Ctrl+Q (Windows/Linux) to quit"
echo ""

npm start
