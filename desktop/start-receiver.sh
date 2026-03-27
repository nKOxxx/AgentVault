#!/bin/bash
cd "$(dirname "$0")"
node ironvault-receiver.js &
echo "IronVault receiver started on port 8765"
