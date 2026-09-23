
TITAN CAP DISCOVERY (2026-09-24): PUSHDATA2 opcode hard limit is 65535 bytes
per push. The Series G factory bytecode (72403 B for a 32637 B engine) exceeded
this, crashing mint-v11.js at le16(). The lens ENGINE_CAP (32768) was a client
policy that never tested the full codec pipeline. The real cap is
65535 - bytecode_overhead ≈ 25641 B. TITAN regenerated at the real cap; Series
G redeployed and verified. The lens now enforces the real cap via RELIKS_ENGINE_CAP
env (default 25641). Future engines must respect this unless chunked pushes are
implemented in the codec (v7-lib.js pushMin would need to fragment >65535 B data).

TITAN CAP DISCOVERY (2026-09-24): PUSHDATA2 opcode hard limit is 65535 bytes
per push. The Series G factory bytecode (72403 B for a 32637 B engine) exceeded
this, crashing mint-v11.js at le16(). The lens ENGINE_CAP (32768) was a client
policy that never tested the full codec pipeline. The real cap is
65535 - bytecode_overhead ≈ 25641 B. TITAN regenerated at the real cap; Series
G redeployed and verified. The lens now enforces the real cap via RELIKS_ENGINE_CAP
env (default 25641). Future engines must respect this unless chunked pushes are
implemented in the codec (v7-lib.js pushMin would need to fragment >65535 B data).

SERIES G (TITAN) ANCHORED (testnet-10): cap-boundary engine on-chain.
genesis 9dd2e5aa..., lane 8187e60a..., mint ab497af8... serial
1878900132865186212, edition 6a7166071afaf2c6...; verify 9/9 incl. edition spk
assert and F1 containment of the full genome in the mint redeem.
MASS MODEL CORRECTION: byte-proportional "normalized transient mass"
(=2*tx_bytes, 100 sompi/unit) is the MEMPOOL FEE metric, NOT consensus
MAX_TRANSACTION_MASS (storage+compute; Series G confirmed at fee-mass 118226).
Lens L9 = fee-mass estimate only.
REAL ENGINE CEILING = PUSHDATA2 65535 per push: mint sigscript carries the
engine TWICE (template suffix + engineBaked() anchor), so compiled bytecode
~ 2*E+7.1K must stay <=65535 and fee-mass ~ 4*E+15.4K. The le16() crash at
72403 was this limit, not the 100K mass pin. ENGINE_CAP policy must respect it.
Fee discovery re-confirmed: paid = required*1.1+1 (13004861 for 11822600).
