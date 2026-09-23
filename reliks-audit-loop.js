#!/usr/bin/env node
// reliks-audit-loop.js - automated audit pipeline via local Qwen bridge.
// Advises only; never in the trust chain. Human approves; lens/verify decide.
//
// Usage:
//   node reliks-audit-loop.js                    # audit last commit
//   node reliks-audit-loop.js --from <sha>       # audit <sha>..HEAD
//   node reliks-audit-loop.js --from <a> --to <b> # audit <a>..<b>
//   node reliks-audit-loop.js --all              # audit full repo snapshot
//   node reliks-audit-loop.js --file <path>      # audit single file
//
// Environment:
//   RELIKS_LLM_BRIDGE   http://localhost:8080  (default)
//   RELIKS_LLM_TOKEN    qwen                 (default)
//   RELIKS_LLM_MODEL    qwen3.8-max          (default)

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const BRIDGE = (process.env.RELIKS_LLM_BRIDGE || 'http://localhost:8080').replace(/\/$/, '');
const TOKEN  = process.env.RELIKS_LLM_TOKEN  || 'qwen';
const MODEL  = process.env.RELIKS_LLM_MODEL  || 'qwen3.8-max';
const MAX_INPUT_BYTES = 80000; // keep well under model context, leave room for reasoning

const RELEVANT = /^(sil\/|[^\/]+\.js$|web\/[^\/]+\.js$|data\/[^\/]*\.(json|sil)$|docs\/)/;
const EXCLUDE  = /\.(png|jpg|svg|html|mdx?|lock|txt|zip|diff|log|zip)$/;

function sh(cmd) { try { return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { return ''; } }

function gatherContent() {
  const args = process.argv.slice(2);
  let mode = 'last', from = 'HEAD~1', to = 'HEAD', single = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--all')  mode = 'all';
    else if (args[i] === '--last') mode = 'last';
    else if (args[i] === '--from') from = args[++i];
    else if (args[i] === '--to')   to   = args[++i];
    else if (args[i] === '--file') { mode = 'file'; single = args[++i]; }
    else if (args[i] === '--help') { console.log('usage: node reliks-audit-loop.js [--last|--all|--from <sha> [--to <sha>]|--file <path>]'); process.exit(0); }
  }

  const header = [];
  let body = '';

  if (mode === 'file') {
    header.push('# Single-file audit: ' + single);
    body = fs.readFileSync(single, 'utf8');
    body = '## FILE: ' + single + '\n```\n' + body + '\n```\n';
  } else if (mode === 'all') {
    header.push('# Full repo snapshot audit');
    const files = sh('git ls-files').split('\n').filter(f => f && RELEVANT.test(f) && !EXCLUDE.test(f));
    header.push('Files examined: ' + files.length);
    for (const f of files) {
      const content = fs.readFileSync(f, 'utf8');
      body += '## FILE: ' + f + '\n```\n' + content + '\n```\n';
      if (body.length > MAX_INPUT_BYTES) { header.push('(truncated at ' + MAX_INPUT_BYTES + ' bytes)'); break; }
    }
  } else {
    const range = from + '..' + to;
    header.push('# Diff audit: ' + range);
    const summary = sh('git log --oneline ' + range).trim();
    header.push('Commits:\n```\n' + summary + '\n```');
    const files = sh('git diff --name-only ' + range).split('\n').filter(f => f && RELEVANT.test(f) && !EXCLUDE.test(f));
    header.push('Files changed: ' + files.join(', ') || '(none relevant)');
    const diff = sh('git diff ' + range + ' -- ' + files.join(' '));
    body = '## Diff\n```diff\n' + diff + '\n```\n';
    // Include full current contents of changed relevant files for context
    body += '\n## Current file contents (post-diff)\n';
    for (const f of files) {
      if (!fs.existsSync(f)) continue;
      const content = fs.readFileSync(f, 'utf8');
      body += '\n### ' + f + '\n```\n' + content + '\n```\n';
      if (body.length > MAX_INPUT_BYTES) { header.push('(truncated at ' + MAX_INPUT_BYTES + ' bytes)'); break; }
    }
  }

  return { mode, header: header.join('\n\n'), body };
}

const SYSTEM_PROMPT = `You are a senior auditor for Reliks, a UTXO-native generative art protocol on Kaspa Toccata L1 covenants (Silverscript).

YOUR STANDING CHECKLIST (address each explicitly):
1. CODEC PARITY — KCC-1 push-per-leaf state encoding: int = 8B fixed LE; byte[32] = 33B (push 32 + opcode); byte = 2B (push 1 + opcode). Compare any JS codec against this framing.
2. DISPATCH TAGS — Derived at runtime from ABI as blake3(name(types))[0..4]. Must not be hardcoded in builders. Check for hardcoded tag literals.
3. COVENANT TRANSITIONS — Every transition (mint/fork/close/list/buy/sell/offer/accept) must validate: (a) successor-output covenant ID matches expected next state, (b) value conservation where required, (c) signature authorization on owner/artist paths, (d) state-field mutation rules (which fields are immutable vs mutable).
4. DUAL-FIELD LINEAGE — mintTxId/mintIndex are immutable anchors; txId/index track the live UTXO. Verify builders preserve both correctly.
5. MASS/FEE MODEL — Byte-proportional mempool fee metric (= 2*tx_bytes, 100 sompi/unit) is distinct from consensus MAX_TRANSACTION_MASS (storage+compute, 100K). PUSHDATA2 caps any single push at 65535 bytes. Verify engines fit within both.
6. TRANSPORT — REST broadcast cannot carry compute_budget (limit=9999); wRPC is mandatory for covenant spends. Verify no code path bypasses this gate.

KNOWN RELIKS CONSTRAINTS (do not flag these as issues, they are intentional):
- royalty_bips >= 1 is intentional: Kaspa rejects 0-value dust outputs, which would brick the edition's checkPayments() path.
- buyerScheme == IDENTIFIER_PUBKEY is intentional: ReliksEdition only implements P2PK ownership; other schemes would permanently lock the edition.
- EditionState does not track live txId/index: Live UTXO outpoints are chain properties. The state only tracks immutable mintTxId/mintIndex for lineage.
- Engine size is enforced client-side by the tooling (reliks-lens.js) and consensus PUSHDATA2 limits, not by on-chain require() statements.

YOUR DISCIPLINE:
- Cite file:line for every finding.
- Classify each finding: HIGH / MEDIUM / LOW / INFORMATIONAL.
- Flag determinism risks (Math.random/Date/network/eval/window) in engines as HIGH.
- Flag any require() that could brick an edition path (e.g., royalty_bips==0, wrong buyerScheme) as HIGH.
- Flag missing value conservation or unchecked successor-output validation as HIGH.
- Never assert chain truth — only identify risks in the code you read.
- Be concise but precise. End with a short "Net" summary.

OUTPUT FORMAT:
## Findings
- **[HIGH/MED/LOW/INFO] title** — file:line — explanation
## Net
One paragraph. "All clear" or "N findings, X high" with the single most important action.`;

async function run() {
  const { mode, header, body } = gatherContent();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const userMsg = header + '\n\n' + body;
  const outFile = 'docs/audit-log/audit-' + ts + '.md';

  console.log('audit-loop:', mode, '| input', userMsg.length, 'bytes | posting to', BRIDGE);
  console.log('audit-loop: model', MODEL, '| writing to', outFile);

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: userMsg }
    ],
    max_tokens: 4096
  };

  let res;
  try {
    res = await fetch(BRIDGE + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error('bridge unreachable:', e.message);
    process.exit(2);
  }
  if (!res.ok) {
    const t = await res.text();
    console.error('bridge HTTP', res.status, t.slice(0, 300));
    process.exit(3);
  }
  const j = await res.json();
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  if (!msg) { console.error('bridge returned no message:', JSON.stringify(j).slice(0, 300)); process.exit(4); }

  const log = '# Reliks Audit Loop — ' + ts + '\n\n'
            + '**Mode:** ' + mode + '  \n'
            + '**Model:** ' + MODEL + '  \n'
            + '**Input bytes:** ' + userMsg.length + '  \n\n'
            + header + '\n\n'
            + '---\n\n'
            + '## Auditor response\n\n' + (msg.content || '(empty)') + '\n\n'
            + (msg.reasoning_content ? '## Reasoning trace\n\n' + msg.reasoning_content + '\n' : '')
            + '---\n\n'
            + '*This is an advisory LLM output. It never determines chain truth; lens and verify-render are the source of truth.*\n';
  fs.mkdirSync('docs/audit-log', { recursive: true });
  fs.writeFileSync(outFile, log);

  // Summary to stdout
  const content = msg.content || '';
  const highMatch = (content.match(/\*\*HIGH\*\*/g) || []).length;
  const medMatch  = (content.match(/\*\*MED(?:IUM)?\*\*/gi) || []).length;
  console.log('');
  console.log('=== AUDITOR SUMMARY ===');
  console.log(content.split('\n').slice(0, 40).join('\n'));
  console.log('=======================');
  console.log('findings HIGH=' + highMatch + ' MED=' + medMatch + ' | full log: ' + outFile);
}

run().catch(e => { console.error('fatal:', e); process.exit(1); });
