# Reliks-VM v1, revision 2 (specification)

Status: **v1 frozen for mainnet genesis** (revised after porting the DAG-City engine and completing 3-implementation differential verification). Three independent interpreters — Python (`vm/rvm.py`), JavaScript (`vm/rvm.js`), and C99 (`vm/rvm.c`, verified under ASan/UBSan/LSan) — agree on every vector in `vm/vectors.json` (**142 checks** in Python/JS; **135 program cases** in C) plus ~12,000 differential-fuzzed programs. Two testnet-10 series use it (Series A: the clean DAG-City port of section 9, and Series B: `marks3`). The magic version byte `0x01` is frozen for v1; any future instruction or limit additions will route through magic version `0x02` (section 2.1).

## 0. What the DAG-City port changed

I ported the mainnet engine (5,323 bytes of JS) to bytecode. The faithful port (1,615 bytes) produces **element-for-element identical SVG** on 310 serials (10 named, 300 random), with worst-case 127,617 fuel, 1,709 elements, 105 KB of SVG and stack depth 7, all far below the limits.

The original engine could not be ported with revision 1. The gaps, and what closed them:

| Gap found | Why the engine needs it | Change in rev 2 |
|---|---|---|
| Indexed memory | Water-cell lookup by computed (i, j), canal point lists | `LDX`, `STX`; memory 256 to 1024 cells |
| Relative path segments and curves | Every building face, window and door is drawn with `l`, `v`, `q` | `LR`, `QR` (path code needs constants instead of coordinate arithmetic; I did not measure the saving separately) |
| Group opacity | Scatter lines and grid are drawn inside `<g opacity>`, which composites as a whole | `GOPEN`, `GCLOSE` |
| Gradient fill | The glow uses a radial gradient | `GRADBEGIN`, `GRADSTOP`, `GRADEND`, fill ids |
| 32-bit modulo | The engine does `(w >>> 0) % n`; rev 1 used a 31-bit value | `RNDR` now uses the full uint32 |

Two findings that are not op-set gaps:

1. **The original engine has an accidental RNG alias.** Its `var x,y` redeclarations reuse the xorshift state variables `x` and `y` as drawing coordinates, so the random stream depends on drawn positions. The faithful port reproduces this by implementing xorshift in bytecode (state in memory cells). That works, and proves the built-in RNG is optional for expressiveness. The **clean port** (1,567 bytes) uses the built-in RNG with separate variables, so it draws a different city for the same serial. **Decision closed (2026-10-03):** Series A on testnet-10 uses the clean port (program hash `cf1f1e60...`, section 9) and Series B uses `marks3` (`ce0f4fc0...`); the v12 mainnet engine remains JavaScript.
2. **History inputs map naturally onto art.** In the clean port, `PAT` shifts one building color family and `WEAR` fades window lights. Across `PAT` 0..63 and `WEAR` 0..255 the geometry is byte-identical; only colors and opacity change (checked across corner sweeps).

## 1. Purpose

A tiny deterministic machine that turns `(program, serial, lineage, sales)` into one canonical SVG string. Goals: safe to run untrusted programs, byte-identical output in any language, programs small enough to bake into a covenant template.

Non-goals: floating point, text, images, transforms, filters, linear gradients in v1. Anything not listed here does not exist in `RVM\x01`.

## 2. Program encoding & covenant baking ceiling

```
offset 0   4 bytes   magic "RVM" 0x01
offset 4   u16 LE    canvas width   (1..4096)
offset 6   u16 LE    canvas height  (1..4096)
offset 8   code      1..65535 bytes
```

`program_hash = blake2b-256(whole program bytes)`. Jump and call targets are u16 LE byte offsets **relative to the start of `code`**.

Immediates: `s` = signed LEB128 (at most 5 bytes, int32, **minimal encoding only**); `u8`; `u16` little endian.

Load-time validation, in order: header (`E_HEADER`); linear decode of all code (`E_DECODE`: unknown opcode, truncated immediate, bad LEB128, `lane` index above 7); every jump/call target must be the start of a decoded instruction (`E_TARGET`; a target equal to the code length is invalid).

**Covenant PUSHDATA2 baking ceiling (`25,641` bytes):** While the RVM binary format permits `code` up to `65,535` bytes, a program baked into `SeriesFactory` appears **twice** in the compiled factory redeem script (once in the template suffix and once in `engineBaked()`), alongside ~7.1 KB of covenant logic (`compiled_bytes ≈ 2 * program_bytes + 7,129`). Because the entire redeem script is pushed in the mint signature script via a single `OP_PUSHDATA2` (`65,535` bytes max), **any on-chain bakeable program must be at most `25,641` bytes** (enforced by `cli/reliks-lens-vm.js`).

### 2.1 Versioning & extension policy
- **v1 (`0x52 0x56 0x4d 0x01`) is frozen:** The opcode map, fault check orders, PRNG algorithm, resource limits, and canonical SVG formatting rules of `0x01` are closed and immutable. Any unassigned byte in `0x01` (`0x07–0x0F`, `0x19–0x1F`, `0x27–0x2F`, `0x36–0x3F`, `0x45–0x4F`, `0x54–0x5F`, `0x64–0x6F`, `0x73–0x7F`, `0x84–0x8F`, `0x93`, `0xA0–0xFF`) must fault with `E_DECODE` in every `0x01` interpreter forever.
- **Additive v2 (`0x52 0x56 0x4d 0x02`):** Any future instruction additions (such as ellipses/arcs, stroke cap/join/dash, linear gradients, evenodd fill, or stack helpers `PICK`/`2DUP`) must use magic byte `0x02` with strictly additive semantics (every valid `0x01` program has identical behavior under `0x02` when header byte 3 is changed).
- **On-chain `engine_lang`:** New and mainnet Reliks-VM v1 series must deploy with `engine_lang = 2` (`PROTOCOL.md` §6).

## 3. Machine

- Values are int32 with wraparound. Data stack max 256, call stack max 64, memory 1024 cells (zero at start).
- **Fuel:** at most 1,000,000 executed instructions (HALT counts). Before each instruction: pc past end of code gives `E_NOHALT`; otherwise fuel 0 gives `E_FUEL`.
- Binary operators pop `b` then `a` and push `a op b`.
- Style state, initially: fill `0x000000`, stroke none (`-1`), stroke width 1, opacity 100.
- Groups: at most 4 open. Gradients: at most 8 defined, at most 8 stops each.
- PRNG state is uninitialized until `RNGINIT`.

## 4. Instruction set

| Op | Code | Imm | Effect |
|---|---|---|---|
| HALT | 00 | | Stop. Open path is `E_PATH`; open group is `E_GROUP`; open gradient is `E_GRAD` |
| PUSH | 01 | s | Push immediate |
| DUP DROP SWAP OVER | 02 03 04 05 | | OVER: (a b) becomes (a b a) |
| ROT | 06 | | (a b c) becomes (b c a) |
| ADD SUB MUL | 10 11 12 | | Wrapping int32 |
| DIV | 13 | | Truncates toward zero; `b = 0` is `E_DIV0`; INT_MIN / -1 = INT_MIN |
| MOD | 14 | | `a - b*trunc(a/b)`; `b = 0` is `E_DIV0`; INT_MIN mod -1 = 0 |
| NEG ABS | 15 16 | | Wrapping; INT_MIN stays INT_MIN |
| MIN MAX | 17 18 | | Signed |
| AND OR XOR NOT | 20 21 22 23 | | Bitwise |
| SHL SHR USHR | 24 25 26 | | Count 0..31 else `E_RANGE`. SHR arithmetic, USHR logical |
| EQ NE LT LE GT GE | 30..35 | | Signed, push 1 or 0 |
| JMP JZ JNZ | 40 41 42 | u16 | JZ/JNZ pop the condition |
| CALL RET | 43 44 | u16 | Depth over 64 is `E_CALLDEPTH`; RET on empty is `E_UNDERFLOW` |
| LOAD STORE | 50 51 | u8 | Direct cells 0..255 via `u8` immediate (`STORE idx` pops `value` and sets `mem[idx] = value`) |
| **LDX** | 52 | | Pop `addr` from stack, push `mem[addr]`; `addr` outside 0..1023 is `E_RANGE` |
| **STX** | 53 | | **Pop `addr` first, then pop `value`**, set `mem[addr] = value` (push order: `push value`, `push addr`, `stx`); `addr` outside 0..1023 is `E_RANGE` |
| LANE | 60 | u8 | Push base lane `k` (0..7) |
| SERIAL | 61 | | Low 32 bits of the serial as int32 |
| PAT | 62 | | Patina, **0..63** |
| WEAR | 63 | | Wear, 0..255 |
| RNGINIT | 70 | | Pop `w z y x` (push order x y z w) as uint32; all zero becomes x=1 |
| RND | 71 | | Push next 31-bit value (`w >> 1`) |
| **RNDR** | 72 | | Pop `hi`, `lo`; push `lo + (w mod (hi-lo+1))` where `w` is the **full uint32**. `hi < lo` is `E_RANGE` |
| FILL | 80 | | Pop `-1`, 0..0xFFFFFF, or **0x1000000 + id** for a defined gradient; else `E_RANGE` |
| STROKE | 81 | | Pop `-1` or 0..0xFFFFFF |
| SWIDTH | 82 | | Pop 1..64 |
| OPACITY | 83 | | Pop 0..100 |
| RECT CIRCLE LINE | 90 91 92 | | Push `x y w h` / `cx cy r` / `x1 y1 x2 y2`. Negative sizes `E_RANGE`; LINE needs a stroke (`E_STROKE`) |
| PBEGIN M L Z PEND | 94 95 96 97 98 | | Absolute path. M first only; L and Z need a started path; PEND emits |
| **LR** | 99 | | Pop `dy dx`; append relative line `l dx dy` |
| **QR** | 9A | | Pop `dy dx cy cx`; append relative quadratic `q cx cy dx dy` |
| **GOPEN** | 9B | | Pop group opacity 0..100; emit `<g>`; save fill, stroke, width, opacity; set opacity to 100 inside. Fails with `E_PATH` if a path is open, `E_GROUP` past depth 4 |
| **GCLOSE** | 9C | | Emit `</g>`; restore saved style. `E_PATH` if a path is open, `E_GROUP` if none open |
| **GRADBEGIN** | 9D | | Start radial gradient (id = next free). `E_GRAD` if one is open or 8 exist |
| **GRADSTOP** | 9E | | Pop `opacity color offset` (offset 0..100 percent, non-decreasing, else `E_RANGE`). `E_GRAD` outside a gradient or past 8 stops |
| **GRADEND** | 9F | | Needs at least 2 stops (`E_GRAD`); emits `<defs>` element. Gradient is centered, radius 50%, object bounding box |

> **Authoring note on `STORE` vs `STX`:** `STORE <cell>` takes a static `u8` immediate (`0..255`) and pops `value` from the stack. `STX` takes no immediate and pops `addr` (top of stack) followed by `value` (second on stack): to write `value` into `mem[addr]` dynamically, push `value` first, then push `addr`, then execute `stx`.

Stack checks: underflow (`E_UNDERFLOW`) before overflow (`E_OVERFLOW`); operations pop all operands before any other check.

Rules pinned by vectors `rule_*` (the JavaScript, Python and C implementations agree on all of them):
- Path: PBEGIN while a path is open, PEND without a path, and PEND before any segment are `E_PATH`. The first segment must be M, M is only allowed as the first segment, and L, Z, LR and QR need at least one segment already. A path of a single M is valid. The path takes the fill, stroke, width and opacity in force at PEND. Drawing and style instructions are allowed while a path is open.
- Gradients: ids count from 0 in the order gradients are ended; FILL accepts 0x1000000 + id only for an ended gradient. Drawing instructions are allowed while a gradient is open. GRADSTOP outside a gradient is `E_GRAD` even if its operands are out of range, and a ninth stop is `E_GRAD` before any operand range check.
- GOPEN, after popping its operand, checks in this order: path open (`E_PATH`), opacity range (`E_RANGE`), depth (`E_GROUP`). GCLOSE checks an open path (`E_PATH`) before an empty group stack (`E_GROUP`).
- A RECT of width 0 and height 0 is valid.
- Fuel: a program that executes exactly 1,000,000 instructions (HALT included) completes, and one that would execute 1,000,001 faults with `E_FUEL` (vectors `fuel_*`).

RNG (xorshift128): `t = x ^ (x << 11)`, `x=y, y=z, z=w`, `w = (w ^ (w >> 19)) ^ (t ^ (t >> 8))`, all uint32.

Element limits: 10,000 elements (`E_ELEMS`; `<g>` and gradient defs count, `</g>` does not), 2,048 path segments (M, L, LR, QR and Z each count; `E_PATH`), final SVG at most 1,048,576 bytes (`E_SIZE`). Checked in that order at emission with a running byte total starting at the opening tag's length.

## 5. Inputs from the host

```
lanes    = 8 x int32 LE from blake2b-256("ReliksSeedV2" || le64(serial))   // full 63-bit serial
serial32 = int32(serial mod 2^32)
pat      = blake2b-256("ReliksPatinaV2" || lineage[32])[0] & 63
wear     = min(sales, 255)
```

**Host vs. VM width rule:** The constraint `0 <= serial < 2^63` in `host_inputs` is a **host covenant rule** (Silverscript state integers are non-negative signed 64-bit values, `PROTOCOL.md` §1 & §3). The **VM itself** only ever sees `serial32` (`int32`) and the eight `int32` `lanes`. Similarly, the legacy v12 seed derivation (`"ReliksSeedV10"` over the 32-bit serial) is a host rule used only when reproducing v12 art.

Why `pat` is one 6-bit value: a buyer can pick a pubkey offline and thereby steer `lineage`. Exposing only 64 values bounds that grinding by construction. `wear` cannot be chosen offline, but it can be raised by self-sales at the cost of the royalty and the fee (`PROTOCOL.md` section 4). Using the full serial (v12 used 32 bits) avoids birthday collisions near 65k editions.

## 6. Canonical SVG

ASCII, no whitespace between elements, no trailing newline:

```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H">ELEMENTS</svg>
```

- Integers in decimal; colors `#rrggbb` lowercase or `none`; gradient fill is `url(#gN)`.
- `S` = ` stroke="#rrggbb" stroke-width="N"` (only if stroke is set). `O` = ` opacity="x"` (only if not 100). Opacity text: 100 is `1`, 0 is `0`, else `0.` plus two digits with trailing zeros removed.

```
rect    <rect x y width height fill S O/>
circle  <circle cx cy r fill S O/>
line    <line x1 y1 x2 y2 stroke stroke-width O/>
path    <path d fill S O/>
group   <g>  or  <g opacity="x">  ...  </g>
defs    <defs><radialGradient id="gN"><stop offset="P%" stop-color="#rrggbb" [stop-opacity="x"]/>...</radialGradient></defs>
```

Gradient stops: `stop-opacity="x"` is emitted only when the stop opacity is not 100, with the same opacity text as `O`.

Path `d`: segments concatenated with no separator: `M<x> <y>`, `L<x> <y>`, `l<dx> <dy>`, `q<cx> <cy> <dx> <dy>`, `Z`.

`render_hash = blake2b-256(svg bytes)`. Anchor rule: render at serial 1, lineage all zero, sales 0.

## 7. Faults

Any fault invalidates the render (no partial output): `E_HEADER E_DECODE E_TARGET E_UNDERFLOW E_OVERFLOW E_DIV0 E_RANGE E_FUEL E_ELEMS E_SIZE E_CALLDEPTH E_NOHALT E_PATH E_RNG E_STROKE E_GROUP E_GRAD`. Conformance means the same code, not just "some fault". For `RND` and `RNDR` the order is fixed: operands are popped first (`E_UNDERFLOW`), then `E_RNG` if `RNGINIT` has not run, then the range check; vectors `rndr_underflow_before_rng` and `rndr_rng_before_range` pin the first two steps. The running SVG size starts at the length of the opening tag and is checked as each element is emitted, so a program whose emission exceeds the limit faults with `E_SIZE` at that element. The final length including `</svg>` is checked when the program halts, so a fault raised earlier in execution wins over it. Vectors `svg_size_exactly_limit_passes`, `svg_size_one_over_only_via_closing_tag`, `svg_size_closing_tag_window_then_div0` and `svg_size_running_total_over_before_div0` pin the boundary.

## 8. Assembler (tooling only)

Free-form tokens, `;` comments, `label:`, numbers decimal or `0x`. Directives `.canvas W H`, `.byte N`, `.var NAME CELL`. Loads and stores accept variable names (`ld X`, `st X`). Macros: `show` (draw a 1x1 rect at the popped x, for tests), `next VAR LIMIT LABEL` and `nextle` (increment and loop while below / at most the limit). Both `vm/rvm.py` and `web/rvm-asm.js` report source line numbers (`line N`) when an assembly error occurs.

## 9. DAG-City port results

| | Original JS | Faithful port | Clean port |
|---|---|---|---|
| Source / program size | 5,323 bytes | **1,615 bytes** | **1,567 bytes** |
| Output vs original | | identical elements, 310 of 310 serials | different city (RNG alias fixed) |
| Worst fuel / elements / SVG | | 127,617 / 1,709 / 105 KB | about 84k / 1,499 / 92 KB (serial 1) |
| History inputs | none | none | `PAT` tints one building family, `WEAR` fades window lights |

The faithful port's SVG is about 10% larger than the original's because canonical form spells out per-element stroke inside groups. Sources and comparison scripts are in `dagcity.py`, `verify_dagcity.py`, `sweep_dagcity.py`.

Program hashes: faithful `792fed9b8c47d5fbc4f8c60d2929eb929fa8cd34e447317252fbd5821a59dd22`, clean `cf1f1e60a7381496d886aaa5dddb2317c848202bdf1abdf9fe0accb7ba826d07`.

## 10. Test vectors

`vectors.json` (the harness reports **142 checks**: 7 host-derivation/helper vectors and 135 program cases across arithmetic, PRNG, limits, path/group/gradient rules, SVG size boundaries, fuel boundaries, and full DAG-City renders). `python3 gen_vectors.py` regenerates and self-checks; `node vm/check.js` runs all 142 checks through the JS interpreter; `node vm/check3.js <binary>` runs all 135 program cases through any external conformance binary (such as `vm/rvm.c`). Both `check.js` and `check3.js` (including ASan/UBSan builds of `rvm.c`) run in `npm test` and CI.

## 11. Remaining gaps and decisions

1. **Third and fourth implementations.** Three implementations in Python (`rvm.py`), JavaScript (`rvm.js`), and C99 (`rvm.c`) agree on all 135 program vectors and ~12,000 differential-fuzzed programs. Because all three were written by the same author, a fourth implementation (e.g. in Rust or Zig) written solely from this specification by an independent author — together with spec-authored golden vectors — remains a high-value post-release milestone (see section 12 for the plug-in conformance harness interface).
2. **Faithful or clean city? (Closed 2026-10-03):** Closed. Testnet-10 Series A uses the clean port (`cf1f1e60...`) and Series B uses `marks3` (`ce0f4fc0...`, which renders wear via structural marks rather than patina roof recolor).
3. **Limits are now measured, not guessed.** Worst case on DAG-City is ~13% of fuel and ~17% of elements; `cli/reliks-lens-vm.js` sweeps serials and `(pat, wear)` corners for any candidate program and reports exact headroom against `FUEL_MAX`, `MAX_ELEMS`, `MAX_SVG`, and the `25,641`-byte PUSHDATA2 baking ceiling.
4. **Assembly ergonomics.** `vm/rvm.py` and `web/rvm-asm.js` include source line numbers in error messages, and a structured-language compiler targeting RVM v1 bytecode can be layered purely in tooling without changing the frozen v1 machine.
5. **Rasterization is not part of the spec.** Identity is checked on canonical SVG bytes, not pixels.
6. **Lane derivation for legacy art** (section 5) is handled by the host (`ReliksSeedV10` for v12 JS engines; `ReliksSeedV2` for Reliks-VM).

## 12. Conformance Harness Protocol (for independent implementations)

Any standalone RVM v1 interpreter in any language (C, Rust, Zig, Go, etc.) can be verified against the full `vm/vectors.json` suite using `node vm/check3.js <path-to-executable>` by implementing the following process contract:

1. **Command-line arguments (`argv[1..4]`)**:
   ```
   <executable> "<lane0>,<lane1>,<lane2>,<lane3>,<lane4>,<lane5>,<lane6>,<lane7>" "<serial32>" "<pat>" "<wear>"
   ```
   - `lane0..lane7`: eight signed 32-bit decimal integers (`-2147483648..2147483647`), comma-separated with no spaces.
   - `serial32`: signed 32-bit decimal integer.
   - `pat`: integer in `0..63`.
   - `wear`: integer in `0..255`.
2. **Standard input (`stdin`)**:
   - Hexadecimal string encoding the program bytes (ASCII `0-9`, `a-f`, `A-F`; any whitespace/newlines must be ignored).
3. **Standard output (`stdout`)**:
   - On successful `HALT`: print `OK <byte_length>\n` followed immediately by the exact `<byte_length>` ASCII bytes of the canonical SVG (no trailing newline after `</svg>`).
   - On any fault: print `FAULT <fault_code>\n` (where `<fault_code>` is one of the 17 fault identifiers in section 7, e.g. `FAULT E_RANGE\n`) and exit with status `0`.
4. **Verification**:
   ```bash
   node vm/check3.js /path/to/your-rvm-binary
   ```
   `check3.js` runs all 135 program vectors and verifies exact fault codes, exact SVG byte lengths, exact BLAKE2b-256 SVG hashes, and verbatim SVG strings where pinned.
