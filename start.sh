#!/bin/bash
# AgentVault Launcher

VAULT_DIR="$(dirname "$0")"
PID_FILE="/tmp/agentvault.pid"

case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "AgentVault already running (PID: $(cat $PID_FILE))"
      exit 0
    fi
    
    echo "Starting AgentVault..."
    
    cd "$VAULT_DIR"
    nohup npm start > /tmp/agentvault.log 2>&1 &
    echo $! > "$PID_FILE"
    
    sleep 2
    if curl -s http://localhost:8765/api/status > /dev/null 2>&1; then
      echo "✅ AgentVault running on http://localhost:8765"
      echo "✅ WebSocket on port 8766"
    else
      echo "⚠️  Starting... check /tmp/agentvault.log"
    fi
    ;;
    
  stop)
    if [ -f "$PID_FILE" ]; then
      kill $(cat "$PID_FILE") 2>/dev/null
      rm -f "$PID_FILE"
      echo "AgentVault stopped"
    else
      echo "AgentVault not running"
    fi
    ;;
    
  status)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "✅ AgentVault running (PID: $(cat $PID_FILE))"
      curl -s http://localhost:8765/api/status | head -1
    else
      echo "❌ AgentVault not running"
    fi
    ;;
    
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac