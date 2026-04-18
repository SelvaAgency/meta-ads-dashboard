#!/bin/bash
# deploy.sh - Full build and patch deploy for SELVA Dashboard
# Usage: bash deploy.sh
set -e

cd /home/ubuntu/meta-ads-dashboard

echo "=== Step 1: Git pull latest ==="
git pull origin main --rebase || git pull origin main

echo "=== Step 2: Install dependencies ==="
npm install

echo "=== Step 3: Build ==="
# Clear any vite cache
rm -rf node_modules/.vite dist
npm run build

echo "=== Step 4: Apply HTML patch ==="
node patch-html.js

echo "=== Step 5: Restart server ==="
pkill -f "node dist/index.js" 2>/dev/null || true
sleep 1
cd /home/ubuntu/meta-ads-dashboard
nohup node dist/index.js > /tmp/server.log 2>&1 &
sleep 2

echo "=== Step 6: Verify ==="
# Check server is running
if curl -s http://localhost:3000 | grep -q "html"; then
  echo "SUCCESS: Server is running!"
else
  echo "WARNING: Server may not be responding. Check /tmp/server.log"
fi

# Check patch is applied
if grep -q "__metaIdMap" dist/public/index.html; then
  echo "SUCCESS: HTML patch is applied!"
else
  echo "WARNING: HTML patch may not be applied"
fi

echo "=== Deploy complete ==="
