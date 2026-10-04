# Reliks-VM v1, revision 2 (draft specification)

Status: draft, revised after porting the DAG-City engine. Two independent interpreters (Python, JavaScript) agree on every vector in `vectors.json` (105 checks). Two testnet-10 series use it (the clean DAG-City port of section 9 and a second program, marks3); no mainnet series does; items marked "proposed" are Reliks 2 design decisions. The magic version byte stays `0x01` until genesis; until then any rule here can still change.

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

1. **The original engine has an accidental RNG alias.** Its `var x,y` redeclarations reuse the xorshift state variables `x` and `y` as drawing coordinates, so the random stream depends on drawn positions. The faithful port reproduces this by implementing xorshift in bytecode (state in memory cells). That works, and proves the built-in RNG is optional for expressiveness. The **clean port** (1,567 bytes) uses the built-in RNG with separate variables, so it draws a different city for the same serial. Decision for you: keep the faithful stream (existing mainnet art keeps its look) or use the clean one for new series. Status (2026-10-03): the first testnet-10 VM series uses the clean port (program hash `cf1f1e60...`, section 9); the mainnet engine is JavaScript, not VM.
2. **History inputs map naturally onto art.** In the clean port, `PAT` shifts one building color family and `WEAR` fades window lights. Across `PAT` 0..63 and `WEAR` 0..255 the geometry is byte-identical; only colors and opacity change (checked for several combinations).

## 1. Purpose

A tiny deterministic machine that turns `(program, serial, lineage, sales)` into one canonical SVG string. Goals: safe to run untrusted programs, byte-identical output in any language, programs small enough to bake into a covenant template.

Non-goals: floating point, text, images, transforms, filters, linear gradients. Anything not listed here does not exist.

## 2. Program encoding

```
offset 0   4 bytes   magic "RVM" 0x01
offset 4   u16 LE    canvas width   (1..4096)
offset 6   u16 LE    canvas height  (1..4096)
offset 8   code      1..65535 bytes
```

`program_hash = blake2b-256(whole program bytes)`. Jump and call targets are u16 LE byte offsets **relative to the start of `code`**.

Immediates: `s` = signed LEB128 (at most 5 bytes, int32, **minimal encoding only**); `u8`; `u16` little endian.

Load-time validation, in order: header (`E_HEADER`); linear decode of all code (`E_DECODE`: unknown opcode, truncated immediate, bad LEB128, `lane` index above 7); every jump/call target must be the start of a decoded instruction (`E_TARGET`; a target equal to the code length is invalid).

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
| LOAD STORE | 50 51 | u8 | Cells 0..255 (STORE pops) |
| **LDX** | 52 | | Pop addr, push `mem[addr]`; addr outside 0..1023 is `E_RANGE` |
| **STX** | 53 | | Pop addr, pop value, `mem[addr] = value`; range as LDX |
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
| **GCLOSE** | 9C | | Emit `</g>`; restore saved style. `E_GROUP` if none open |
| **GRADBEGIN** | 9D | | Start radial gradient (id = next free). `E_GRAD` if one is open or 8 exist |
| **GRADSTOP** | 9E | | Pop `opacity color offset` (offset 0..100 percent, non-decreasing, else `E_RANGE`). `E_GRAD` outside a gradient or past 8 stops |
| **GRADEND** | 9F | | Needs at least 2 stops (`E_GRAD`); emits `<defs>` element. Gradient is centered, radius 50%, object bounding box |

Stack checks: underflow (`E_UNDERFLOW`) before overflow (`E_OVERFLOW`); operations pop all operands before any other check.

RNG (xorshift128): `t = x ^ (x << 11)`, `x=y, y=z, z=w`, `w = (w ^ (w >> 19)) ^ (t ^ (t >> 8))`, all uint32.

Element limits: 10,000 elements (`E_ELEMS`; `<g>` and gradient defs count, `</g>` does not), 2,048 path segments (M, L, LR, QR and Z each count; `E_PATH`), final SVG at most 1,048,576 bytes (`E_SIZE`). Checked in that order at emission with a running byte total starting at the opening tag's length.

## 5. Inputs from the host

```
lanes    = 8 x int32 LE from blake2b-256("ReliksSeedV2" || le64(serial))   // full 63-bit serial
serial32 = int32(serial mod 2^32)
pat      = blake2b-256("ReliksPatinaV2" || lineage[32])[0] & 63
wear     = min(sales, 255)
```

Why `pat` is one 6-bit value (proposed): a buyer can pick a pubkey offline and thereby steer `lineage`. Exposing only 64 values bounds that grinding by construction. `wear` cannot be chosen offline, but it can be raised by self-sales at the cost of the royalty and the fee (PROTOCOL.md section 4). Using the full serial (v12 used 32 bits) avoids birthday collisions near 65k editions.

Note for the faithful port: it needs the *v12* lane derivation (`"ReliksSeedV10"` and the 32-bit serial) to reproduce mainnet art. That derivation is a host rule, not a VM rule.

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

`render_hash = blake2b-256(svg bytes)`. Anchor rule (proposed): render at serial 1, lineage all zero, sales 0.

## 7. Faults

Any fault invalidates the render (no partial output): `E_HEADER E_DECODE E_TARGET E_UNDERFLOW E_OVERFLOW E_DIV0 E_RANGE E_FUEL E_ELEMS E_SIZE E_CALLDEPTH E_NOHALT E_PATH E_RNG E_STROKE E_GROUP E_GRAD`. Conformance means the same code, not just "some fault".

## 8. Assembler (tooling only)

Free-form tokens, `;` comments, `label:`, numbers decimal or `0x`. Directives `.canvas W H`, `.byte N`, `.var NAME CELL`. Loads and stores accept variable names (`ld X`, `st X`). Macros: `show` (draw a 1x1 rect at the popped x, for tests), `next VAR LIMIT LABEL` and `nextle` (increment and loop while below / at most the limit).

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

`vectors.json` (the harness reports 105 checks; the breakdown below accounts for 103): 5 host-derivation vectors and 98 program cases: 62 fault cases (one per rule, including every new op), boundary passes at exactly 10,000 elements and 2,048 segments, arithmetic edges with hand-written expectations, PRNG sequences from a separate generator, indirect memory, relative paths, group and gradient rules, and DAG-City renders. `python3 gen_vectors.py` regenerates and self-checks; `node check.js` runs everything through the JS interpreter.

## 11. Remaining gaps and decisions

1. **Third implementation.** Two agreeing interpreters written by the same author is weaker evidence than a Rust one written from this spec alone. Recommended before genesis.
2. **Faithful or clean city?** See section 0.
3. **Limits are now measured, not guessed, for this one engine.** Worst case was 13% of fuel and 17% of elements. Other engines may need more; nothing here argues for raising them.
4. **Assembly ergonomics.** The port used variables for everything; stack-only code would be unreadable. A small structured-language compiler is worth building before third-party artists write engines. `PICK` and `2DUP` would shorten hand-written code but were not needed.
5. **Rasterization is not part of the spec.** Identity was checked on parsed elements, not pixels. Two renderers can still differ in anti-aliasing, which is outside what the hash covers.
6. **Lane derivation for legacy art** (section 5) must be handled by the host if mainnet editions are to render unchanged.
