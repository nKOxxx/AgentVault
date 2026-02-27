#!/bin/bash
# AgentVault Installer

echo "=========================================="
echo "AgentVault Installer"
echo "=========================================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Node.js version too old. Need 18+. Found: $(node -v)"
    exit 1
fi

echo "✅ Node.js $(node -v)"

# Install dependencies
echo ""
echo "Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo "✅ Installation complete"
    echo ""
    echo "To start AgentVault:"
    echo "  node server.js"
    echo ""
    echo "Then open: http://localhost:8765"
else
    echo "❌ Installation failed"
    exit 1
fi
