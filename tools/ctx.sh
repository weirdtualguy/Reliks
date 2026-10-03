#!/bin/sh
# Prints the live project state for a new AI session. Read-only: no keys, no network.
cd "$(git rev-parse --show-toplevel)" || exit 1
echo "== git"; git branch --show-current; git log --oneline | head -5; git status --short | head -15
echo "== VM series (v13/ledger-vm-v13.json)"
node -e "var j=require('./v13/ledger-vm-v13.json'),s=j.series;console.log('lane covenant',j.C);console.log('program_hash',s.program_hash,'| engine_lang',s.engine_lang,'| price',s.price,'| royalty_bips',s.royalty_bips);console.log('editions',j.editions.length,'| mints left',s.mints_left-j.editions.length);j.editions.forEach(function(e,i){console.log(' #'+i,'serial',e.serial,'| sales',e.sales,'| owner',e.owner.slice(0,8))})"
echo "== env"; node -v; python3 -V 2>&1
if [ -n "$PC_PRIV" ]; then echo "PC_PRIV is set in this shell (unset it if idle)"; else echo "PC_PRIV not set"; fi
echo "== handoffs"; git ls-files | grep HANDOFF
echo "== kascov freshness"; node tools/kascov-status.js
