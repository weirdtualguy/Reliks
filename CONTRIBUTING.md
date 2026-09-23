# Contributing to Reliks

## Engines
An engine is `function reliks(L, serial)` returning an SVG string.
L = 8 int32 lanes; serial = edition id (seed = serial mod 2^32).

Rules (enforced by reliks-lens.js):
- Integer-only: no Math.* transcendentals/random, no Date/performance,
  no fetch/XHR/WebSocket, no eval/new Function, no window/document/
  localStorage, no timers, no process/globalThis.
- Use the R.* API: rnd, ri, pick, chance, hsl, sin, cos, dir, svg.
- Deterministic: same serial → byte-identical SVG on Node and browsers.
- Size: ENGINE_SRC ≤ ~25.6 KB (PUSHDATA2 ceiling; lens gate L1).
- Output: viewBox-only SVG, no NaN/undefined/Infinity (lens gate L8).

Workflow:
1. Prototype in the Studio (hub → Studio tab): live gates + preview.
2. Export engine .js; `node reliks-lens.js <engine>.js` → ALL GATES PASS.
3. Bake/compile/deploy per README; verify with verify-render-v10.js.
4. Share novel engines under engines/ with a short README + lens output.

## Tooling and builders
- const/let over var; explicit errors; comment covenant transitions.
- `node --check <file>.js` before committing.
- Keep testnet drills green: deploy → mint → verify-render.
- Run `node reliks-audit-loop.js --last` before opening a PR; fix HIGHs.

## Docs
- Clarity fixes via PR; new guides go in docs/ and get linked from README.
- Keep claims verifiable: cite gates, txids, or file:line. No marketing fluff.

## Security
Do NOT open public issues for vulnerabilities. See SECURITY.md.

## Questions
Open an issue labeled `question`, or ask in the Kaspa Discord.
<!-- EOF-CONTRIB -->
