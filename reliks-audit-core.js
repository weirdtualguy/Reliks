#!/usr/bin/env node
// reliks-audit-core.js - Final pre-mainnet audit of the Core Protocol Surface.
// Keeps payload small to avoid WAF/timeouts.

const fs = require('fs');

const BRIDGE = (process.env.RELIKS_LLM_BRIDGE || 'http://localhost:8080').replace(/\/$/, '');
const TOKEN  = process.env.RELIKS_LLM_TOKEN  || 'qwen';
const MODEL  = process.env.RELIKS_LLM_MODEL  || 'qwen3.8-max';

// The exact files that matter for mainnet security
const CORE_FILES = [
  'sil/SeriesFactory-v11.sil',
  'sil/ReliksEdition-v11.sil',
  'sil/OfferEscrow-v4.sil',
  'deploy-v11.js',
  'mint-v11.js',
  'secondary-v11.js',
  'offer-v4.js',
  'accept-v4.js',
  'offer-lib.js',
  'network.js',
  'verify-render-v10.js'
];

const SYSTEM_PROMPT = `You are the final pre-mainnet security gatekeeper for Reliks, a UTXO-native generative art protocol on Kaspa Toccata.

YOUR MISSION:
Review the Core Protocol Surface (3 Silverscript covenants + JS builders + transport layer).
Assume this code is moving to mainnet tomorrow with real money. 

CRITICAL CHECKS:
1. TRANSPORT GATES: Does offer-lib.js (feeLoop) strictly refuse REST fallback for covenant spends? Does network.js hard-exit on mainnet without wRPC?
2. STATE ESCAPE HATCHES: Can a malicious user bypass royalties, brick an edition, or steal funds by manipulating the JS builders to construct transactions that pass the .sil require() statements but violate economic intent?
3. COVENANT LINEAGE: Do the JS builders correctly preserve the dual-field lineage (mintTxId/mintIndex vs live txId/index) and covenant IDs across all transitions (mint, list, buy, offer, accept)?
4. VALUE CONSERVATION: Are there any edge cases in OfferEscrow or ReliksEdition where input value > output value + fees, allowing surplus to be silently burned or stolen?

KASPA TOCCATA RULES:
- V1 inputs use compute_budget (REST drops this, making REST unsafe for covenants).
- Covenants use 32-byte covenantId for lineage.
- PUSHDATA2 limit is 65535 bytes per push.

OUTPUT FORMAT:
## Pre-Mainnet Verdict
[GREEN LIGHT / RED LIGHT]

## Critical Findings
- **[HIGH/MED/LOW] title** — file:line — explanation

## Net
One paragraph. If GREEN LIGHT, confirm the transport and economic gates are solid. If RED LIGHT, name the exact blocker.`;

async function run() {
  let body = '# Reliks Core Protocol Surface (Pre-Mainnet Audit)\n\n';
  let totalBytes = 0;
  
  for (const f of CORE_FILES) {
    if (!fs.existsSync(f)) {
      console.error('Missing core file:', f);
      process.exit(1);
    }
    const content = fs.readFileSync(f, 'utf8');
    body += `## FILE: ${f}\n\`\`\`\n${content}\n\`\`\`\n\n`;
    totalBytes += content.length;
  }

  console.log(`Core audit: ${CORE_FILES.length} files | ${totalBytes} bytes | posting to ${BRIDGE}`);

  const payload = {
    model: MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user',   content: body }
    ],
    max_tokens: 4096
  };

  const res = await fetch(BRIDGE + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + TOKEN },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const t = await res.text();
    console.error(`HTTP ${res.status}: ${t.slice(0, 300)}`);
    process.exit(1);
  }

  const j = await res.json();
  const msg = j.choices && j.choices[0] && j.choices[0].message;
  if (!msg) { console.error('No message in response'); process.exit(1); }

  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = `docs/audit-log/core-audit-${ts}.md`;
  
  const log = `# Reliks Core Pre-Mainnet Audit — ${ts}\n\n` +
              `**Files:** ${CORE_FILES.length}\n` +
              `**Total bytes:** ${totalBytes}\n\n` +
              `---\n\n` +
              `## Auditor Verdict\n\n` + msg.content + '\n\n' +
              (msg.reasoning_content ? `## Reasoning Trace\n\n${msg.reasoning_content}\n` : '');
              
  fs.mkdirSync('docs/audit-log', { recursive: true });
  fs.writeFileSync(outFile, log);

  console.log('\n=== PRE-MAINNET VERDICT ===');
  console.log(msg.content);
  console.log('===========================');
  console.log(`Full log saved: ${outFile}`);
}

run().catch(e => { console.error('fatal:', e); process.exit(1); });
