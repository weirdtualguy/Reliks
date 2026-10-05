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
for L in v13/ledger-vm-v13.json v13/ledger-marks3-v13.json; do
  if [ -f "$L" ] && [ -f sdk/selftest.js ]; then
    if node sdk/selftest.js "$L" >/dev/null 2>&1; then echo "PASS sdk read ($L)"; else echo "FAIL sdk read ($L)"; FAIL=1; fi
  fi
done
if [ -f sdk/test-onchain.js ] && [ -f v13/ledger-vm-v13.json ]; then
  if node sdk/test-onchain.js >/dev/null 2>&1; then echo "PASS sdk on-chain verifier (mock)"; else echo "FAIL sdk on-chain verifier (mock)"; FAIL=1; fi
fi
if [ -f sdk/test-plan.js ] && [ -f v13/ledger-vm-v13.json ]; then
  if node sdk/test-plan.js >/dev/null 2>&1; then echo "PASS sdk plan + tamper tests"; else echo "FAIL sdk plan + tamper tests"; FAIL=1; fi
fi
if [ -f sdk/test-submit.js ]; then
  if node sdk/test-submit.js >/dev/null 2>&1; then echo "PASS sdk submit-safety tests"; else echo "FAIL sdk submit-safety tests"; FAIL=1; fi
fi
if [ -f sdk/test-lookup.js ]; then
  if node sdk/test-lookup.js >/dev/null 2>&1; then echo "PASS sdk node-lookup tests"; else echo "FAIL sdk node-lookup tests"; FAIL=1; fi
fi
if [ -f sdk/test-submit-node.js ]; then
  if node sdk/test-submit-node.js >/dev/null 2>&1; then echo "PASS sdk submit-node tests"; else echo "FAIL sdk submit-node tests"; FAIL=1; fi
fi
if [ -f sdk/test-e2e.js ] && [ -f v13/ledger-vm-v13.json ]; then
  if node sdk/test-e2e.js >/dev/null 2>&1; then echo "PASS sdk end-to-end (mock wallet + nodes)"; else echo "FAIL sdk end-to-end (mock wallet + nodes)"; FAIL=1; fi
fi
if [ -f sdk/test-tipage.js ]; then
  if node sdk/test-tipage.js >/dev/null 2>&1; then echo "PASS sdk kascov staleness tests"; else echo "FAIL sdk kascov staleness tests"; FAIL=1; fi
fi
if [ -f sdk/test-engine.js ]; then
  if node sdk/test-engine.js >/dev/null 2>&1; then echo "PASS sdk engine-kind tests"; else echo "FAIL sdk engine-kind tests"; FAIL=1; fi
fi
if [ -f sdk/test-vm-args.js ]; then
  if node sdk/test-vm-args.js >/dev/null 2>&1; then echo "PASS vm factory args engine_lang text check"; else echo "FAIL vm factory args engine_lang text check"; FAIL=1; fi
fi
if [ -f sdk/test-protocol.js ]; then
  if node sdk/test-protocol.js >/dev/null 2>&1; then echo "PASS protocol vectors (JS codec vs independent Python reference)"; else echo "FAIL protocol vectors"; FAIL=1; fi
  if command -v python3 >/dev/null 2>&1; then
    if python3 sdk/ref_protocol.py >/dev/null 2>&1 && git diff --quiet -- sdk/protocol-vectors.json; then echo "PASS protocol vectors regenerate identically"; else echo "FAIL protocol vectors regenerate differently"; FAIL=1; fi
  fi
fi
if [ -f tools/verify-contract.js ]; then
  out=$(node tools/verify-contract.js 2>&1); rc=$?
  if [ $rc -eq 0 ]; then echo "PASS edition contract recompile: $(echo "$out" | tail -1)"; else echo "FAIL edition contract recompile: $(echo "$out" | tail -1)"; FAIL=1; fi
fi
if [ -f sdk/test-escrow.js ]; then
  if node sdk/test-escrow.js >/dev/null 2>&1; then echo "PASS sdk escrow script/encoding tests"; else echo "FAIL sdk escrow script/encoding tests"; FAIL=1; fi
fi
if [ -f sdk/test-claim.js ]; then
  if node sdk/test-claim.js >/dev/null 2>&1; then echo "PASS sdk claim verification tests"; else echo "FAIL sdk claim verification tests"; FAIL=1; fi
fi
if [ -f sdk/test-provenance.js ]; then
  if node sdk/test-provenance.js >/dev/null 2>&1; then echo "PASS sdk claim provenance tests"; else echo "FAIL sdk claim provenance tests"; FAIL=1; fi
fi
if command -v cc >/dev/null 2>&1 && [ -f v13/vm/rvm.c ]; then
  if cc -O2 -std=c99 -o ${TMPDIR:-/tmp}/rvm3 v13/vm/rvm.c 2>/dev/null && out=$(node v13/vm/check3.js ${TMPDIR:-/tmp}/rvm3 2>&1); then echo "PASS vm third implementation (C): $(echo "$out" | tail -1)"; else echo "FAIL vm third implementation (C)"; FAIL=1; fi
fi
if [ -f sdk/test-lane.js ]; then
  if node sdk/test-lane.js >/dev/null 2>&1; then echo "PASS sdk lane resolver tests"; else echo "FAIL sdk lane resolver tests"; FAIL=1; fi
fi
if [ -f sdk/test-sign.js ]; then
  if node sdk/test-sign.js >/dev/null 2>&1; then echo "PASS sdk signer tests (sighash equals reliks-lib on recorded vectors)"; else echo "FAIL sdk signer tests"; FAIL=1; fi
fi
if [ -f sdk/test-mint-flow.js ]; then
  if node sdk/test-mint-flow.js >/dev/null 2>&1; then echo "PASS sdk mint flow tests (modes, serial confirm, fee rebuild, no blind resubmit, ledger rules)"; else echo "FAIL sdk mint flow tests"; FAIL=1; fi
fi
if [ -f tags.js ]; then
  if node tags.js 2>&1 | grep -q "ALL PASS"; then echo "PASS dispatch tags"; else echo "FAIL dispatch tags"; FAIL=1; fi
fi
if [ "$1" = "full" ]; then
  if npm test >${TMPDIR:-$HOME}/npmtest.log 2>&1; then echo "PASS npm test"; else echo "FAIL npm test (see ${TMPDIR:-$HOME}/npmtest.log)"; FAIL=1; fi
fi
if [ $FAIL -eq 0 ]; then echo "ALL CHECKS PASSED"; else echo "SOME CHECKS FAILED (a 'not found' right after a mint is usually kascov lag: wait a few minutes and rerun)"; fi
exit $FAIL
