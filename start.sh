#!/bin/bash
# IronVault Launcher

VAULT_DIR="$(dirname "$0")"
PID_FILE="/tmp/ironvault.pid"

case "$1" in
  start)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "IronVault already running (PID: $(cat $PID_FILE))"
      exit 0
    fi

    echo "Starting IronVault..."

    cd "$VAULT_DIR"

    # Start the agent listener in the background (if installed)
    LISTENER="$HOME/.ironvault/listener.js"
    if [ -f "$LISTENER" ]; then
      echo "Starting agent listener..."
      nohup node "$LISTENER" > /tmp/ironvault-listener.log 2>&1 &
      LISTENER_PID=$!
      echo $LISTENER_PID > /tmp/ironvault-listener.pid
    fi

    # Start IronVault server
    nohup npm start > /tmp/ironvault.log 2>&1 &
    echo $! > "$PID_FILE"

    sleep 2
    if curl -s http://localhost:8765/api/status > /dev/null 2>&1; then
      echo "✅ IronVault running on http://localhost:8765"
      echo "✅ WebSocket on port 8766"
      echo "✅ agent listener running"
    else
      echo "⚠️  Starting... check /tmp/ironvault.log"
    fi
    ;;
    
  stop)
    # Stop IronVault server
    if [ -f "$PID_FILE" ]; then
      kill $(cat "$PID_FILE") 2>/dev/null
      rm -f "$PID_FILE"
      echo "IronVault stopped"
    else
      echo "IronVault not running"
    fi

    # Stop agent listener
    if [ -f "/tmp/ironvault-listener.pid" ]; then
      kill $(cat /tmp/ironvault-listener.pid) 2>/dev/null
      rm -f /tmp/ironvault-listener.pid
      echo "agent listener stopped"
    fi
    ;;
    
  status)
    if [ -f "$PID_FILE" ] && kill -0 $(cat "$PID_FILE") 2>/dev/null; then
      echo "✅ IronVault running (PID: $(cat $PID_FILE))"
      curl -s http://localhost:8765/api/status | head -1
    else
      echo "❌ IronVault not running"
    fi
    ;;
    
  *)
    echo "Usage: $0 {start|stop|status}"
    exit 1
    ;;
esac