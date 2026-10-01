#!/bin/sh
# One-command health check. Read-only: throwaway key only, no signing, no broadcasting.
cd "$(git rev-parse --show-toplevel)" || exit 1
TP=1111111111111111111111111111111111111111111111111111111111111111
TW=kaspatest:qp8n2k7uklxq4aegau7vawtptkgxsja4kt99lpv6krctwpq8tpc655cyvcmd3
FAIL=0
N=$(node -e "console.log(require('./v13/ledger-vm-v13.json').editions.length)")
for i in $(seq 0 $((N-1))); do
  out=$(env PC_PRIV=$TP PC_WALLET=$TW node v13/verify-vm-render.js $i 2>&1); rc=$?
  if [ $rc -eq 0 ] && echo "$out" | grep -q MATCH; then echo "PASS edition $i: on chain, JS=Python render"
  elif [ $rc -eq 0 ]; then echo "PASS edition $i: on chain, JS render only (python skipped)"
  else echo "FAIL edition $i: $(echo "$out" | tail -1)"; FAIL=1; fi
done
if [ -f v13/dagcity-wear14.hex ]; then
  out=$(env PC_PRIV=$TP PC_WALLET=$TW PROG_HEX_FILE=v13/dagcity-wear14.hex node v13/cross-check-wear.js 2>&1); rc=$?
  if [ $rc -eq 0 ]; then echo "PASS wear cross-check: $(echo "$out" | tail -1)"; else echo "FAIL wear cross-check: $(echo "$out" | tail -1)"; FAIL=1; fi
fi
if [ "$1" = "full" ]; then
  if npm test >/tmp/npmtest.log 2>&1; then echo "PASS npm test"; else echo "FAIL npm test (see /tmp/npmtest.log)"; FAIL=1; fi
fi
if [ $FAIL -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED (a 'not found' right after a mint is usually kascov lag: wait a few minutes and rerun)"; fi
exit $FAIL
