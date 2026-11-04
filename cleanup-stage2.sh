#!/bin/bash
# Reliks repo cleanup, stage 2. Run from the repo root AFTER stage 1 is committed.
#   bash cleanup-stage2.sh            -> dry run (checks only, changes nothing)
#   APPLY=1 bash cleanup-stage2.sh    -> apply
# What it does:
#   1. raw audit logs (docs/audit-log, 1.5 MB) -> branch `audits`, removed from main
#   2. handoff/state docs -> docs/history/ and docs/
#   3. root scripts -> lib/ (shared), cli/ (v12 tools + gates), tools/ (gen-site, tags)
#      with every require()/path/command string rewritten, then verified.
# Undo: git reset --hard pre-stage2-<date>
set -u
cd "$(git rev-parse --show-toplevel)" || exit 1
APPLY="${APPLY:-0}"; STAMP=$(date +%Y%m%d); T="${TMPDIR:-$HOME}"; W="$T/reliks-s2"
fail() { echo "ABORT: $*"; exit 1; }

[ -n "$(git status --porcelain --untracked-files=no)" ] && fail "tracked changes not committed. Commit stage 1 first."
[ -f lib/reliks-lib.js ] && fail "already restructured (lib/ exists)."
[ -f reliks-lib.js ] || fail "run from the Reliks repo root."

echo "== baseline"
npm test >"$T/s2-before.log" 2>&1 || fail "npm test fails before stage 2 (see $T/s2-before.log)"
sh tools/check.sh >"$T/s2-check-before.txt" 2>&1; echo "   npm test PASS; check.sh: $(tail -1 "$T/s2-check-before.txt" | cut -c1-60)"

if [ "$APPLY" != 1 ]; then
  echo "== dry run OK. Would: branch audits, move 5 docs, move 17 scripts into lib/ cli/ tools/."
  echo "   Re-run with: APPLY=1 bash cleanup-stage2.sh"; exit 0
fi

mkdir -p "$W"
git tag -f "pre-stage2-$STAMP" >/dev/null
git branch -f audits >/dev/null && echo "== branch 'audits' holds the raw logs (push it: git push origin audits)"

cat > "$W/restructure.js" <<'JSEOF'
// one-shot: moves root scripts into lib/ cli/ tools/ and rewrites relative requires. Run from repo root.
const fs = require('fs'), path = require('path'), cp = require('child_process');
const sh = c => cp.execSync(c, { encoding: 'utf8' });
const LIB = ['bech32-kaspa.js','config.js','network.js','reliks-lib.js','reliks-templates.js','reliks-engine-mainnet.js'];
const CLI = ['deploy-v12.js','mint-v12.js','secondary-v12.js','offer-v5.js','accept-v5.js','gen-factory-args.js','verify-render.js','reliks-lens.js','gen-gallery.js'];
const TOOLS = ['tags.js','gen-site.js'];
const moves = {};
LIB.forEach(f => moves[f] = 'lib/' + f); CLI.forEach(f => moves[f] = 'cli/' + f); TOOLS.forEach(f => moves[f] = 'tools/' + f);
const files = sh("find . -name '*.js' -not -path './node_modules/*' -not -path './.git/*'").split('\n').map(f => f.replace(/^\.\//, '')).filter(f => f && fs.existsSync(f));
const newOf = f => moves[f] || f;
let changed = 0;
for (const f of files) {
  let s = fs.readFileSync(f, 'utf8'), o = s;
  s = s.replace(/require\((['"])(\.{1,2}\/[^'"]+)\1\)/g, (m, q, spec) => {
    const abs = path.normalize(path.join(path.dirname(f), spec));
    const cand = [abs, abs + '.js', abs + '/index.js'].find(c => fs.existsSync(c) && fs.statSync(c).isFile());
    if (!cand) return m;
    if (moves[cand] === undefined && moves[f] === undefined) return m;
    let rel = path.relative(path.dirname(newOf(f)), newOf(cand));
    if (!rel.startsWith('.')) rel = './' + rel;
    if (!/\.js$/.test(spec) && !/\.json$/.test(spec)) rel = rel.replace(/\.js$/, '');
    return 'require(' + q + rel + q + ')';
  });
  if (s !== o) { fs.writeFileSync(f, s); changed++; }
}
for (const f of Object.keys(moves)) { fs.mkdirSync(path.dirname(moves[f]), { recursive: true }); sh('git mv ' + f + ' ' + moves[f]); }
console.log('require() rewritten in', changed, 'files; moved', Object.keys(moves).length);
JSEOF
cat > "$W/patch.sh" <<'SHEOF'
set -e
# --- path.join(root,'x.js') style in tests
for f in test/*.js; do
  sed -i -E "s#path\.join\(root, '(bech32-kaspa|reliks-templates|reliks-engine-mainnet)\.js'\)#path.join(root, 'lib', '\1.js')#g" $f
done
# self-test: file lists
sed -i "s#for (const f of \['reliks-engine-mainnet.js', 'reliks-engine-v10.js'\]) {#for (const f of ['lib/reliks-engine-mainnet.js']) {#" test/self-test.js
sed -i "s#for (const f of \['deploy-v12.js', 'mint-v12.js', 'secondary-v12.js', 'offer-v5.js', 'accept-v5.js', 'verify-render.js', 'gen-gallery.js', 'gen-site.js'\]) {#for (const f of ['cli/deploy-v12.js', 'cli/mint-v12.js', 'cli/secondary-v12.js', 'cli/offer-v5.js', 'cli/accept-v5.js', 'cli/verify-render.js', 'cli/gen-gallery.js', 'tools/gen-site.js']) {#" test/self-test.js
sed -i "s#path.join(root, 'gen-site.js')#path.join(root, 'tools', 'gen-site.js')#" test/site-test.js
# cwd-relative path.resolve('reliks-lib.js') in v13
sed -i "s#path.resolve('reliks-lib.js')#path.resolve('lib/reliks-lib.js')#" v13/*.js
sed -i "s#'./reliks-engine-mainnet.js'#'./lib/reliks-engine-mainnet.js'#" v13/gen-factory-args-v13.js
sed -i "s#require('./reliks-engine-mainnet.js')#require('./lib/reliks-engine-mainnet.js')#" v13/vm/verify_dagcity.py
sed -i "s#path.join(__dirname, '..', 'reliks-engine-mainnet.js')#path.join(__dirname, '..', 'lib', 'reliks-engine-mainnet.js')#" web/studio-templates.js
sed -i "s#path.join(root, 'reliks-lib.js')#path.join(root, 'lib', 'reliks-lib.js')#; s#anchor not found in reliks-lib.js#anchor not found in lib/reliks-lib.js#" sdk/gen-sighash-vectors.js
# __dirname-based paths
sed -i "s#path.resolve(__dirname, 'data', file)#path.resolve(__dirname, '..', 'data', file)#" lib/reliks-templates.js
sed -i "s#path.join(__dirname, 'web', 'blake2b.js')#path.join(__dirname, '..', 'web', 'blake2b.js')#" cli/reliks-lens.js
sed -i "s#const read = (...p) => fs.readFileSync(path.join(__dirname, ...p), 'utf8');#const ROOT = path.join(__dirname, '..');\nconst read = (...p) => fs.readFileSync(path.join(ROOT, ...p), 'utf8');#; s#path.join(__dirname, 'docs'#path.join(ROOT, 'docs'#g; s#path.relative(__dirname, OUT)#path.relative(ROOT, OUT)#; s#require('./' + s.engine)#require(path.join(ROOT, 'lib', s.engine))#" tools/gen-site.js
# user-facing command strings
sed -i "s#node reliks-lens.js#node cli/reliks-lens.js#g" tools/gen-site.js web/site-app.js
sed -i "s#node tags.js#node tools/tags.js#; s#\[ -f tags.js \]#[ -f tools/tags.js ]#" tools/check.sh
# package.json scripts
sed -i -E "s#node (deploy-v12|mint-v12|secondary-v12|offer-v5|accept-v5|verify-render|gen-gallery|reliks-lens|gen-factory-args)\.js#node cli/\1.js#g; s#node gen-site\.js#node tools/gen-site.js#" package.json
# engine override: env path is resolved from cwd (repo root), default lives in lib/
for f in cli/verify-render.js cli/gen-gallery.js; do
  sed -i "s#require(process.env.RELIKS_ENGINE || './reliks-engine-mainnet.js')#require(process.env.RELIKS_ENGINE ? require('path').resolve(process.env.RELIKS_ENGINE) : '../lib/reliks-engine-mainnet.js')#" $f
done
sed -i 's#require(process.env.RELIKS_ENGINE||"./reliks-engine-mainnet.js")#require(process.env.RELIKS_ENGINE?require("path").resolve(process.env.RELIKS_ENGINE):"../lib/reliks-engine-mainnet.js")#' cli/deploy-v12.js
sed -i "s#process.env.RELIKS_ENGINE || './reliks-engine-mainnet.js'#process.env.RELIKS_ENGINE || './lib/reliks-engine-mainnet.js'#" cli/gen-factory-args.js
# v13 generators: sources moved to cli/
sed -i -E "s#patch\('(deploy-v12|mint-v12|secondary-v12|offer-v5|accept-v5)\.js'#patch('cli/\1.js'#" v13/make-v13-scripts.js v13/make-v13-escrow.js
SHEOF
cat > "$W/docs.sh" <<'SHEOF'
set -e
mkdir -p docs/history
git mv INFRA-HANDOFF.md docs/history/INFRA-HANDOFF.md
git mv v13/SESSION-HANDOFF-v13.md docs/history/SESSION-HANDOFF-v13.md
git mv v13/SESSION-HANDOFF-v14.md docs/history/SESSION-HANDOFF-v14.md
git mv AI-CONTEXT.md docs/AI-CONTEXT.md
git mv STATE.md docs/STATE.md
# raw audit logs leave main (they live on branch 'audits')
git rm -rq docs/audit-log
cat > docs/AUDIT-LOG.md <<'EOT'
# Raw audit logs

The raw output of the automated review passes is not kept on `main`, to keep the repo small.
It is preserved on the `audits` branch: https://github.com/weirdtualguy/Reliks/tree/audits/docs/audit-log

The condensed findings are in [AUDIT-SUMMARY.md](AUDIT-SUMMARY.md).
EOT
sed -i 's#`docs/audit-log/raw/`#`docs/audit-log/raw/` on the `audits` branch (see [AUDIT-LOG.md](AUDIT-LOG.md))#' docs/AUDIT-SUMMARY.md
# context scripts
sed -i 's#AI-CONTEXT.md STATE.md#docs/AI-CONTEXT.md docs/STATE.md#; s#cp docs/AI-CONTEXT.md docs/STATE.md "\$OUT"/#cp docs/AI-CONTEXT.md docs/STATE.md "$OUT"/#' tools/export-context.sh
sed -i 's#git ls-files | grep HANDOFF#git ls-files | grep -i -E "handoff|STATE.md|AI-CONTEXT"#' tools/ctx.sh
# command mentions in docs and other text
for f in README.md SECURITY.md CONTRIBUTING.md docs/*.md STATUS.md PROTOCOL.md sdk/README.md v13/*.md; do
  [ -f "$f" ] || continue
  sed -i -E 's#node (deploy-v12|mint-v12|secondary-v12|offer-v5|accept-v5|verify-render|gen-gallery|reliks-lens|gen-factory-args)\.js#node cli/\1.js#g; s#node gen-site\.js#node tools/gen-site.js#g; s#node tags\.js#node tools/tags.js#g' "$f"
  sed -i -E 's#`(deploy-v12|mint-v12|secondary-v12|offer-v5|accept-v5|verify-render|gen-gallery|reliks-lens|gen-factory-args)\.js`#`cli/\1.js`#g; s#`(reliks-lib|reliks-templates|reliks-engine-mainnet|network|config|bech32-kaspa)\.js`#`lib/\1.js`#g; s#`gen-site\.js`#`tools/gen-site.js`#g' "$f"
done
sed -i 's#Read first: `PROTOCOL.md`, `sdk/README.md`, `v13/SPEC-GAPS.md`, `STATE.md`#Read first: `PROTOCOL.md`, `sdk/README.md`, `v13/SPEC-GAPS.md`, `docs/STATE.md`#' STATUS.md
python3 - <<'PYEOF'
p='README.md'; s=open(p).read()
a=s.index('## Layout'); b=s.index('## Dependencies')
new='''## Layout

| Path | Contents |
|---|---|
| `sil/`, `data/` | Canonical contracts and compiled ABIs; `data/mainnet-anchors.json` is what the site verifies |
| `lib/` | Shared Node code: `reliks-lib.js` (signing, fees), `reliks-templates.js` (browser contract templates derived from the compiled ABIs), `reliks-engine-mainnet.js`, `network.js`, `config.js`, `bech32-kaspa.js` |
| `cli/` | Node reference builders (`deploy-v12.js`, `mint-v12.js`, `secondary-v12.js`, `offer-v5.js`, `accept-v5.js`) and gates (`reliks-lens.js`, `verify-render.js`, `gen-gallery.js`, `gen-factory-args.js`) |
| `web/` | Zero-dependency browser code: `blake2b.js`, `reliks-chain.js` (state codec, lane resolution, mint builder, post-sign verification), `kaspire.js` (wallet), `site-app.js`, `site.css` |
| `tools/` | `gen-site.js` (builds the single-file `docs/index.html`; fails if an anchor stops matching its engine), `check.sh` (health check), `tags.js`, chain and context helpers |
| `sdk/` | Read, plan, sign, send and confirm for the v13 testnet lines |
| `v13/` | Reliks-VM (`v13/vm/`), v13 drafts, specs and testnet scripts |
| `test/` | `self-test.js`, `chain-test.js`, `wallet-test.js`, `site-test.js`, and more |
| `docs/` | Architecture, runbook, audit summary, `STATE.md`, `AI-CONTEXT.md`, `history/` |

'''
open(p,'w').write(s[:a]+new+s[b:])
p='docs/AI-CONTEXT.md'; s=open(p).read()
s=s.replace('cd ~/pixel-cove && cat STATE.md && sh tools/ctx.sh','cd ~/Reliks && cat docs/STATE.md && sh tools/ctx.sh')
s=s.replace('- SESSION-HANDOFF-v13.md / SESSION-HANDOFF-v14.md: detailed history (find with `git ls-files | grep HANDOFF`).','- docs/history/ (INFRA-HANDOFF.md, SESSION-HANDOFF-v13.md, SESSION-HANDOFF-v14.md): detailed history.')
open(p,'w').write(s)
PYEOF
SHEOF

echo "== restructure"
node "$W/restructure.js" || fail "restructure failed; undo with: git reset --hard pre-stage2-$STAMP"
bash "$W/patch.sh"       || fail "patch step failed; undo with: git reset --hard pre-stage2-$STAMP"
bash "$W/docs.sh"        || fail "docs step failed; undo with: git reset --hard pre-stage2-$STAMP"

echo "== rebuild site + verify"
node tools/gen-site.js | tail -1
node -e '
const fs=require("fs"),path=require("path"),cp=require("child_process");
const files=cp.execSync("find . -name \"*.js\" -not -path \"./node_modules/*\" -not -path \"./.git/*\"").toString().split("\n").filter(Boolean);
let bad=0;for(const f of files){const s=fs.readFileSync(f,"utf8");for(const m of s.matchAll(/require\((["\x27])(\.{1,2}\/[^"\x27]+)\1\)/g)){const a=path.join(path.dirname(f),m[2]);if(![a,a+".js",a+"/index.js"].some(c=>fs.existsSync(c)&&fs.statSync(c).isFile())&&!/config\x27\)|^\.\/web\/blake2b/.test(m[2]+"\x27)")){console.log("  UNRESOLVED",f,m[2]);bad++}}}
console.log("   require check:",files.length,"files,",bad,"unresolved")'
npm test >"$T/s2-after.log" 2>&1 && echo "   npm test: PASS" || echo "   npm test FAILED, see $T/s2-after.log"
sh tools/check.sh >"$T/s2-check-after.txt" 2>&1
if diff -q "$T/s2-check-before.txt" "$T/s2-check-after.txt" >/dev/null; then echo "   check.sh: identical to before"; else echo "   check.sh DIFFERS:"; diff "$T/s2-check-before.txt" "$T/s2-check-after.txt"; fi
tail -1 "$T/s2-check-after.txt"
echo "== done. Review 'git status', then:"
echo "   git add -A && git commit -m 'Restructure: lib/ cli/ tools/, docs/history, raw audit logs to audits branch'"
echo "   git push origin main audits"
echo "   Undo: git reset --hard pre-stage2-$STAMP"
