const esbuild = require('esbuild');
const fs = require('fs');

fs.mkdirSync('web/vendor', { recursive: true });

// Write temporary entry points in the current directory to avoid /tmp issues
fs.writeFileSync('.blake2b-entry.js', "export { blake2b } from '@noble/hashes/blake2b';");
fs.writeFileSync('.schnorr-entry.js', "export { schnorr } from '@noble/curves/secp256k1';");

console.log('Bundling blake2b...');
esbuild.buildSync({
  entryPoints: ['.blake2b-entry.js'],
  bundle: true,
  format: 'esm',
  outfile: 'web/vendor/blake2b.bundle.js',
  platform: 'browser',
});

console.log('Bundling schnorr...');
esbuild.buildSync({
  entryPoints: ['.schnorr-entry.js'],
  bundle: true,
  format: 'esm',
  outfile: 'web/vendor/schnorr.bundle.js',
  platform: 'browser',
});

// Clean up temp files
fs.unlinkSync('.blake2b-entry.js');
fs.unlinkSync('.schnorr-entry.js');

console.log('✅ Crypto vendored successfully to web/vendor/');
