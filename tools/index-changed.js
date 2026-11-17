#!/usr/bin/env node
// Exit 0 when docs/marketplace-index.json differs from HEAD in substance (ignoring updatedAt), 1 otherwise.
// Lets the sync workflow commit only real changes instead of one commit per run.
'use strict';
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'docs', 'marketplace-index.json');
const strip = (s) => { const j = JSON.parse(s); delete j.updatedAt; return JSON.stringify(j); };
let head = null;
try { head = strip(execSync('git show HEAD:docs/marketplace-index.json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })); } catch (e) { /* not tracked yet */ }
const cur = strip(fs.readFileSync(FILE, 'utf8'));
process.exit(head !== cur ? 0 : 1);
