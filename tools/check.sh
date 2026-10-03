#!/bin/sh
# One-command health check. Read-only: throwaway key only, no signing, no broadcasting.
cd "$(git rev-parse --show-toplevel)" || exit 1
TP=1111111111111111111111111111111111111111111111111111111111111111
TW=kaspatest:qp8n2k7uklxq4aegau7vawtptkgxsja4kt99lpv6krctwpq8tpc655cyvcmd3
FAIL=0
node tools/kascov-status.js || echo "WARNING: kascov index looks stale: on-chain edition checks below may FAIL for that reason, not because the ledger is wrong"
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
if [ -f v13/ledger-marks3-v13.json ] && [ -f v13/dagcity-marks3.hex ]; then
  M=$(node -e "console.log(require('./v13/ledger-marks3-v13.json').editions.length)")
  for i in $(seq 0 $((M-1))); do
    out=$(env PC_PRIV=$TP PC_WALLET=$TW RELIKS_FACTORY_ABI=v13/out/factory-marks3-v13.json RELIKS_ARGS=v13/factory-args-marks3-v13.json RELIKS_ENGINE=$PWD/v13/vm-engine-shim3.js RELIKS_LEDGER=v13/ledger-marks3-v13.json node v13/verify-vm-render.js $i 2>&1); rc=$?
    if [ $rc -eq 0 ] && echo "$out" | grep -q MATCH; then echo "PASS marks3 edition $i: on chain, JS=Python render"
    else echo "FAIL marks3 edition $i: $(echo "$out" | tail -1)"; FAIL=1; fi
  done
  out=$(env PC_PRIV=$TP PC_WALLET=$TW PROG_HEX_FILE=v13/dagcity-marks3.hex node v13/cross-check-wear.js 2>&1); rc=$?
  if [ $rc -eq 0 ]; then echo "PASS marks3 cross-check: $(echo "$out" | tail -1)"; else echo "FAIL marks3 cross-check: $(echo "$out" | tail -1)"; FAIL=1; fi
fi
if [ -f v13/vm/check.js ]; then
  out=$(cd v13/vm && node check.js 2>&1); rc=$?
  if [ $rc -eq 0 ] && echo "$out" | tail -1 | grep -q " 0 failed"; then echo "PASS vm vectors (JS): $(echo "$out" | tail -1)"; else echo "FAIL vm vectors (JS): $(echo "$out" | tail -1)"; FAIL=1; fi
  (cd v13/vm && python3 gen_vectors.py >/dev/null 2>&1); rc=$?
  if [ $rc -eq 0 ] && git diff --quiet -- v13/vm/vectors.json; then echo "PASS vm vectors (Python regen identical)"; else echo "FAIL vm vectors (Python regen rc=$rc or vectors.json differs)"; FAIL=1; fi
fi
if [ -f tags.js ]; then
  if node tags.js 2>&1 | grep -q "ALL PASS"; then echo "PASS dispatch tags"; else echo "FAIL dispatch tags"; FAIL=1; fi
fi
if [ "$1" = "full" ]; then
  if npm test >${TMPDIR:-$HOME}/npmtest.log 2>&1; then echo "PASS npm test"; else echo "FAIL npm test (see ${TMPDIR:-$HOME}/npmtest.log)"; FAIL=1; fi
fi
if [ $FAIL -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED (a 'not found' right after a mint is usually kascov lag: wait a few minutes and rerun)"; fi
exit $FAIL
