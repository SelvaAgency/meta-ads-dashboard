#!/bin/bash
# SELVA Dashboard - Deploy Script
# Run this on the MANUS server to deploy latest code

set -e

echo "=== SELVA Dashboard Deploy ==="
echo "$(date)"

# 1. Pull latest code
echo "[1/4] Pulling latest code from GitHub..."
git pull origin main

# 2. Install dependencies
echo "[2/4] Installing dependencies..."
pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# 3. Build
echo "[3/4] Building..."
pnpm build

# 4. Restart server
echo "[4/4] Restarting server..."
pkill -f "node dist/index.js" 2>/dev/null || true
sleep 2

# Verify old process is dead
if pgrep -f "node dist/index.js" > /dev/null; then
  echo "WARNING: Old process still running, force killing..."
  pkill -9 -f "node dist/index.js" 2>/dev/null || true
  sleep 1
fi

# Start new process
NODE_ENV=production nohup node dist/index.js > /tmp/dashboard.log 2>&1 &
echo "Server started with PID $!"

# Wait for startup
sleep 3

# 5. Verify
echo "[5/5] Verifying..."
if curl -s localhost:3000/api/health > /dev/null 2>&1; then
  echo "✅ Server is running!"
  echo "Commit: $(git log --oneline -1)"
  echo "Build contains getAdsByAdsetWithInsights: $(grep -c 'getAdsByAdsetWithInsights' dist/index.js || echo 0) occurrences"
else
  echo "❌ Server health check failed!"
  echo "Last 10 lines of log:"
  tail -10 /tmp/dashboard.log
  exit 1
fi

echo "=== Deploy complete ==="
