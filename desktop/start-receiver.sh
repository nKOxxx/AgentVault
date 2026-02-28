#!/bin/bash
cd "$(dirname "$0")"
node agentvault-receiver.js &
echo "AgentVault receiver started on port 8765"
