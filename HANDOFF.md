
TITAN CAP DISCOVERY (2026-09-24): PUSHDATA2 opcode hard limit is 65535 bytes
per push. The Series G factory bytecode (72403 B for a 32637 B engine) exceeded
this, crashing mint-v11.js at le16(). The lens ENGINE_CAP (32768) was a client
policy that never tested the full codec pipeline. The real cap is
65535 - bytecode_overhead ≈ 25641 B. TITAN regenerated at the real cap; Series
G redeployed and verified. The lens now enforces the real cap via RELIKS_ENGINE_CAP
env (default 25641). Future engines must respect this unless chunked pushes are
implemented in the codec (v7-lib.js pushMin would need to fragment >65535 B data).
