'use strict';

const fs = require('fs');
const path = require('path');

let blake3, blake2b;
try {
  const b3 = require('@noble/hashes/blake3');
  const b2 = require('@noble/hashes/blake2b');
  blake3 = b3.blake3 || b3.default || b3;
  blake2b = b2.blake2b || b2.default || b2;
} catch (e) {
  console.error('Missing @noble/hashes. Run: npm install @noble/hashes');
  process.exit(1);
}

let failures = 0;
let warnings = 0;

function check(name, ok, detail) {
  console.log((ok ? '[PASS] ' : '[FAIL] ') + name + (detail ? ' :: ' + detail : ''));
  if (!ok) failures++;
  return ok;
}

function warn(name, detail) {
  console.log('[WARN] ' + name + (detail ? ' :: ' + detail : ''));
  warnings++;
}

function note(name, detail) {
  console.log('[NOTE] ' + name + (detail ? ' :: ' + detail : ''));
}

function findFile(candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function toBuf(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value.replace(/^0x/i, ''), 'hex');
  throw new Error('cannot convert value to bytes');
}

function le64(n) {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(n), 0);
  return b;
}

function blake3Hash(data) {
  return Buffer.from(blake3(data));
}

function blake2b256(data) {
  return Buffer.from(blake2b(data, { dkLen: 32 }));
}

// KCC-1 Section 8.3:
// TemplateHash(prefix, suffix) =
//   Hash(LE64(len(prefix)) || prefix || LE64(len(suffix)) || suffix)
function templateHash(prefix, suffix) {
  return blake3Hash(Buffer.concat([
    le64(prefix.length),
    prefix,
    le64(suffix.length),
    suffix,
  ]));
}

// KCC-1 Section 5.3:
// int state payload = eight-byte little-endian signed-magnitude.
function signedMagnitude8(value) {
  const v = BigInt(value);
  if (v === 0n) return Buffer.alloc(8);

  const neg = v < 0n;
  let mag = neg ? -v : v;
  const b = Buffer.alloc(8);

  for (let i = 0; i < 8; i++) {
    b[i] = Number(mag & 0xffn);
    mag >>= 8n;
  }

  if (mag !== 0n) {
    throw new Error('integer does not fit in 8-byte signed-magnitude');
  }

  if (neg) b[7] |= 0x80;
  return b;
}

function fixedBytes(name, value, len) {
  const b = toBuf(value);
  if (b.length !== len) {
    throw new Error(name + ' expects ' + len + ' bytes, got ' + b.length);
  }
  return b;
}

function statePayload(ty, value) {
  switch (ty.kind) {
    case 'int':
    case 'temporal':
      return signedMagnitude8(value);

    case 'bool':
      return Buffer.from([value ? 1 : 0]);

    case 'byte':
      return Buffer.from([Number(value)]);

    case 'pubkey':
      return fixedBytes('pubkey', value, 32);

    case 'sig':
      return fixedBytes('sig', value, 65);

    case 'datasig':
      return fixedBytes('datasig', value, 64);

    case 'fixed_bytes':
      return fixedBytes('byte[' + ty.len + ']', value, ty.len);

    case 'fixed_array': {
      if (!Array.isArray(value)) throw new Error('fixed_array expects array');
      const parts = value.map((item) => statePayload(ty.item, item));
      return Buffer.concat(parts);
    }

    default:
      throw new Error('unsupported state payload type: ' + ty.kind);
  }
}

// KCC-1 Section 5.2:
// PushExplicit never uses OP_1..OP_16 or OP_1NEGATE.
function pushExplicit(payload) {
  const n = payload.length;

  if (n === 0) return Buffer.from([0x00]);
  if (n <= 75) return Buffer.concat([Buffer.from([n]), payload]);

  if (n <= 255) {
    return Buffer.concat([Buffer.from([0x4c, n]), payload]);
  }

  if (n <= 65535) {
    const len = Buffer.alloc(2);
    len.writeUInt16LE(n, 0);
    return Buffer.concat([Buffer.from([0x4d]), len, payload]);
  }

  const len = Buffer.alloc(4);
  len.writeUInt32LE(n, 0);
  return Buffer.concat([Buffer.from([0x4e]), len, payload]);
}

function encodeRuntimeState(fields, values) {
  const parts = [];

  for (const field of fields) {
    if (!(field.name in values)) {
      throw new Error('missing state field: ' + field.name);
    }
    const payload = statePayload(field.type, values[field.name]);
    parts.push(pushExplicit(payload));
  }

  return Buffer.concat(parts);
}

function parseExplicitPushes(script) {
  let offset = 0;
  const pushes = [];

  while (offset < script.length) {
    const start = offset;
    const op = script[offset++];

    if (op === 0x00) {
      pushes.push({ start, payload: Buffer.alloc(0) });
      continue;
    }

    if (op === 0x4f || (op >= 0x51 && op <= 0x60)) {
      throw new Error('small-int opcode ' + op.toString(16) + ' is not allowed in PushExplicit state');
    }

    let len;

    if (op >= 0x01 && op <= 0x4b) {
      len = op;
    } else if (op === 0x4c) {
      if (offset >= script.length) throw new Error('truncated OP_PUSHDATA1');
      len = script[offset];
      offset += 1;
    } else if (op === 0x4d) {
      if (offset + 2 > script.length) throw new Error('truncated OP_PUSHDATA2');
      len = script.readUInt16LE(offset);
      offset += 2;
    } else if (op === 0x4e) {
      if (offset + 4 > script.length) throw new Error('truncated OP_PUSHDATA4');
      len = script.readUInt32LE(offset);
      offset += 4;
    } else {
      throw new Error('opcode ' + op.toString(16) + ' is not a push-data opcode');
    }

    if (offset + len > script.length) {
      throw new Error('push exceeds script bounds');
    }

    pushes.push({ start, payload: script.subarray(offset, offset + len) });
    offset += len;
  }

  return pushes;
}

// KCC-1 Section 6.1:
// FunctionSignature = UTF8("{name}({comma-separated dispatch type names})")
// dispatch_tag = Hash(FunctionSignature)[0:4]
function dispatchTypeName(abi, ty) {
  switch (ty.kind) {
    case 'int': return 'int';
    case 'temporal': return 'temporal';
    case 'bool': return 'bool';
    case 'byte': return 'byte';
    case 'bytes': return 'byte[]';
    case 'string': return 'string';
    case 'pubkey': return 'pubkey';
    case 'sig': return 'sig';
    case 'datasig': return 'datasig';
    case 'fixed_bytes': return 'byte[' + ty.len + ']';
    case 'fixed_array': return dispatchTypeName(abi, ty.item) + '[' + ty.len + ']';
    case 'dynamic_array': return dispatchTypeName(abi, ty.item) + '[]';

    case 'struct': {
      const s = abi.structs && abi.structs[ty.name];
      if (!s) throw new Error('unknown struct: ' + ty.name);
      return '{' + s.fields.map((f) => dispatchTypeName(abi, f.ty)).join(',') + '}';
    }

    default:
      throw new Error('unknown type kind: ' + ty.kind);
  }
}

function dispatchTag(abi, entryName, params) {
  const sig = entryName + '(' + params.map((p) => dispatchTypeName(abi, p.type)).join(',') + ')';
  return blake3Hash(Buffer.from(sig, 'utf8')).subarray(0, 4).toString('hex');
}

// KCC-1 Section 7:
// OP_BLAKE2B OP_DATA_32 Blake2b(R) OP_EQUAL
function p2shScript(redeem) {
  return Buffer.concat([
    Buffer.from([0xaa, 0x20]),
    blake2b256(redeem),
    Buffer.from([0x87]),
  ]);
}

function pickContract(abi, preferred) {
  if (!abi || !abi.contracts || Object.keys(abi.contracts).length === 0) {
    throw new Error('ABI has no contracts');
  }

  for (const name of preferred) {
    if (abi.contracts[name]) {
      return { name, contract: abi.contracts[name] };
    }
  }

  const name = Object.keys(abi.contracts)[0];
  return { name, contract: abi.contracts[name] };
}

function main() {
  console.log('== pixel-cove ArtFactory / ArtEdition verification ==');

  const editionAbiPath = findFile([
    'edition-abi.json',
    'art-edition.abi.json',
    path.join('contracts', 'art-edition.abi.json'),
  ]);

  const factoryAbiPath = findFile([
    'factory-abi.json',
    'series-factory.abi.json',
    path.join('contracts', 'factory-abi.json'),
  ]);

  const factoryArgsPath = findFile([
    'factory-args.json',
    'series-factory-args.json',
  ]);

  if (!check('edition ABI found', !!editionAbiPath, editionAbiPath || 'not found')) {
    process.exit(1);
  }

  if (!check('factory ABI found', !!factoryAbiPath, factoryAbiPath || 'not found')) {
    process.exit(1);
  }

  note('factory args path', factoryArgsPath || 'not found');

  const editionAbi = readJson(editionAbiPath);
  const factoryAbi = readJson(factoryAbiPath);
  const factoryArgs = factoryArgsPath ? readJson(factoryArgsPath) : null;

  const edition = pickContract(editionAbi, ['ArtEdition', 'Edition']);
  const factory = pickContract(factoryAbi, ['SeriesFactory', 'ArtFactory', 'Factory']);

  note('edition contract', edition.name);
  note('factory contract', factory.name);

  // ------------------------------------------------------------
  // 1. Edition template verification
  // ------------------------------------------------------------

  const edBytecode = toBuf(edition.contract.compiled.bytecode);
  const edSpan = edition.contract.compiled.state_span;

  if (!check(
    'edition state span inside bytecode',
    edSpan.offset + edSpan.len <= edBytecode.length,
    'offset=' + edSpan.offset + ' len=' + edSpan.len + ' bytecode=' + edBytecode.length
  )) {
    process.exit(1);
  }

  const edPrefix = edBytecode.subarray(0, edSpan.offset);
  const edState = edBytecode.subarray(edSpan.offset, edSpan.offset + edSpan.len);
  const edSuffix = edBytecode.subarray(edSpan.offset + edSpan.len);

  const edExpectedHash = toBuf(edition.contract.compiled.template_hash);
  const edComputedHash = templateHash(edPrefix, edSuffix);

  check(
    'edition template hash matches KCC-1 recomputation',
    edComputedHash.equals(edExpectedHash),
    edComputedHash.toString('hex')
  );

  try {
    const pushes = parseExplicitPushes(edState);
    check('edition state span is canonical push-only', true, pushes.length + ' pushes');
  } catch (e) {
    check('edition state span is canonical push-only', false, e.message);
  }

  // ------------------------------------------------------------
  // 2. Factory args must embed the exact edition template
  // ------------------------------------------------------------

  if (factoryArgs) {
    check('factory args count is 9', factoryArgs.length === 9, String(factoryArgs.length));

    try {
      const argPrefix = toBuf(factoryArgs[6].value);
      const argSuffix = toBuf(factoryArgs[7].value);
      const argHash = toBuf(factoryArgs[8].value);

      check(
        'factory args template prefix matches edition',
        argPrefix.equals(edPrefix),
        'arg=' + argPrefix.length + 'B edition=' + edPrefix.length + 'B'
      );

      check(
        'factory args template suffix matches edition',
        argSuffix.equals(edSuffix),
        'arg=' + argSuffix.length + 'B edition=' + edSuffix.length + 'B'
      );

      check(
        'factory args expected template hash matches edition',
        argHash.equals(edExpectedHash) && argHash.equals(edComputedHash),
        argHash.toString('hex')
      );
    } catch (e) {
      check('factory args template parts', false, e.message);
    }
  } else {
    check('factory args present', false, 'factory-args.json missing');
  }

  // ------------------------------------------------------------
  // 3. Factory state and template verification
  // ------------------------------------------------------------

  const fBytecode = toBuf(factory.contract.compiled.bytecode);
  const fSpan = factory.contract.compiled.state_span;

  const fPrefix = fBytecode.subarray(0, fSpan.offset);
  const fState = fBytecode.subarray(fSpan.offset, fSpan.offset + fSpan.len);
  const fSuffix = fBytecode.subarray(fSpan.offset + fSpan.len);

  const fExpectedHash = toBuf(factory.contract.compiled.template_hash);
  const fComputedHash = templateHash(fPrefix, fSuffix);

  check(
    'factory template hash matches KCC-1 recomputation',
    fComputedHash.equals(fExpectedHash),
    fComputedHash.toString('hex')
  );

  if (factoryArgs) {
    const factoryValues = {
      art: factoryArgs[0].value,
      artist: factoryArgs[1].value,
      price: factoryArgs[2].value,
      royalty_bips: factoryArgs[3].value,
      cap: factoryArgs[4].value,
      counter: factoryArgs[5].value,
    };

    try {
      const encoded = encodeRuntimeState(factory.contract.runtime_state.fields, factoryValues);

      check(
        'factory state span matches canonical encoding of factory-args values',
        encoded.equals(fState),
        'encoded=' + encoded.length + 'B span=' + fSpan.len + 'B'
      );
    } catch (e) {
      check('factory state span matches canonical encoding of factory-args values', false, e.message);
    }
  }

  try {
    const pushes = parseExplicitPushes(fState);
    check('factory state span is canonical push-only', true, pushes.length + ' pushes');
  } catch (e) {
    check('factory state span is canonical push-only', false, e.message);
  }

  // ------------------------------------------------------------
  // 4. Dispatch tags
  // ------------------------------------------------------------

  function verifyDispatchTags(abi, label, contract) {
    for (const [entryName, entry] of Object.entries(contract.entries)) {
      try {
        const computed = dispatchTag(abi, entryName, entry.params);
        check(
          label + ' dispatch tag ' + entryName,
          computed === entry.dispatch_tag,
          computed + ' vs ' + entry.dispatch_tag
        );
      } catch (e) {
        check(label + ' dispatch tag ' + entryName, false, e.message);
      }
    }
  }

  verifyDispatchTags(editionAbi, edition.name, edition.contract);
  verifyDispatchTags(factoryAbi, factory.name, factory.contract);

  const mintEntry = factory.contract.entries['mint'];
  check('factory mint entrypoint exists', !!mintEntry);

  if (mintEntry) {
    const paramNames = mintEntry.params.map((p) => p.name).join(',');
    check(
      'factory mint params are buyerIdentifier,paymentOutIdx,editionOutIdx',
      paramNames === 'buyerIdentifier,paymentOutIdx,editionOutIdx',
      paramNames
    );
  }

  // ------------------------------------------------------------
  // 5. Sample edition continuation
  // ------------------------------------------------------------

  const art = factoryArgs ? toBuf(factoryArgs[0].value) : Buffer.alloc(2048);
  const artist = factoryArgs ? toBuf(factoryArgs[1].value) : Buffer.alloc(32);
  const royalty = factoryArgs ? BigInt(factoryArgs[3].value) : 500n;

  const programHash = blake2b256(art);
  const buyer = Buffer.from('77'.repeat(32), 'hex');

  function sampleValueFor(field) {
    const lname = field.name.toLowerCase();

    if (lname.includes('owneridentifier') || lname === 'owner') return buyer;
    if (lname.includes('identifiertype') || lname.includes('scheme')) return 0;
    if (lname === 'price' || lname.includes('price')) return 0;
    if (lname.includes('program')) return programHash;
    if (lname.includes('artist')) return artist;
    if (lname.includes('royalty')) return Number(royalty);
    if (
      lname.includes('serial') ||
      lname.includes('edition') ||
      lname.includes('counter') ||
      lname.includes('token')
    ) {
      return 0;
    }

    if (lname.includes('factory_covid') || lname.includes('covid')) return Buffer.alloc(32);
    throw new Error('no sample value mapping for field: ' + field.name);
  }

  try {
    const sampleValues = {};

    for (const field of edition.contract.runtime_state.fields) {
      sampleValues[field.name] = sampleValueFor(field);
    }

    const sampleState = encodeRuntimeState(edition.contract.runtime_state.fields, sampleValues);
    const samplePushes = parseExplicitPushes(sampleState);

    check('sample edition state is canonical push-only', true, samplePushes.length + ' pushes');

    check(
      'sample edition state push count matches field count',
      samplePushes.length === edition.contract.runtime_state.fields.length,
      samplePushes.length + ' vs ' + edition.contract.runtime_state.fields.length
    );

    const sampleRedeem = Buffer.concat([edPrefix, sampleState, edSuffix]);
    const sampleTemplateHash = templateHash(edPrefix, edSuffix);

    check(
      'sample edition redeem uses authenticated edition template',
      sampleTemplateHash.equals(edComputedHash)
    );

    const sampleSpk = p2shScript(sampleRedeem);

    note('sample edition buyer', buyer.toString('hex'));
    note('sample edition program_hash', programHash.toString('hex'));
    note('sample edition state length', String(sampleState.length));
    note('sample edition redeem length', String(sampleRedeem.length));
    note('sample edition scriptPublicKey', sampleSpk.toString('hex'));
    note('sample edition Blake2b(redeem)', blake2b256(sampleRedeem).toString('hex'));

    if (!fs.existsSync('verification')) {
      fs.mkdirSync('verification');
    }

    fs.writeFileSync(path.join('verification', 'sample-edition-state.hex'), sampleState.toString('hex'));
    fs.writeFileSync(path.join('verification', 'sample-edition-redeem.hex'), sampleRedeem.toString('hex'));
    fs.writeFileSync(path.join('verification', 'sample-edition-spk.hex'), sampleSpk.toString('hex'));

    note('wrote verification/sample-edition-*.hex');
  } catch (e) {
    check('sample edition continuation encoding', false, e.message);
  }

  note(
    'KIP-20 covenant ID',
    'not computable from template alone; record it from the actual edition-creating transaction/deploy'
  );

  warn(
    'factory contract currently validates only the edition template/state',
    'transaction builder must still set the correct KIP-20 covenant binding for the edition output'
  );

  if (failures > 0) {
    console.log('\nVerification FAILED: ' + failures + ' check(s) failed, ' + warnings + ' warning(s)');
    process.exit(1);
  }

  console.log('\nVerification PASSED: all checks succeeded, ' + warnings + ' warning(s)');
}

try {
  main();
} catch (e) {
  console.error('[ERROR] ' + e.message);
  process.exit(1);
}
