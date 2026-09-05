#!/bin/sh
# Waits for Nasdaq's edge block to lift, then runs the dataset build at a pace
# that stays under the limit. Progress is cached per symbol, so this can be
# stopped and restarted freely.
set -u
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
PROBE="https://api.nasdaq.com/api/quote/AAPL/historical?assetclass=stocks&fromdate=2026-08-01&limit=9999&todate=$(date -u +%Y-%m-%d)"

waits=0
while [ "$waits" -lt 60 ]; do
  code=$(curl -s -m 20 -A "$UA" -H "Accept: application/json" -o /dev/null -w "%{http_code}" "$PROBE")
  echo "$(date -u +%H:%M:%S) probe=$code"
  [ "$code" = "200" ] && break
  waits=$((waits + 1))
  sleep 120
done

if [ "$code" != "200" ]; then
  echo "still blocked after $((waits * 2)) minutes; giving up for now"
  exit 1
fi

echo "$(date -u +%H:%M:%S) unblocked — starting paced build"
exec npx tsx --conditions react-server scripts/build-bundle.mts \
  --sessions 320 --max-symbols "${MAX_SYMBOLS:-1500}" --concurrency 1 --delay 1400
