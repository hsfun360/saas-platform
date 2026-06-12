// scripts/generate-keys.mjs
//
// Generates an RSA 2048-bit key pair for local JWT RS256 signing.
// Run ONCE when setting up a new development environment.
//
// Usage: node scripts/generate-keys.mjs

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.resolve(__dirname, '..', 'keys');

// Ensure the keys directory exists
fs.mkdirSync(keysDir, { recursive: true });

// Generate a 2048-bit RSA key pair
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem',
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem',
  },
});

// Write private key
fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey);
console.log('✅ Created keys/private.pem');

// Write public key
fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);
console.log('✅ Created keys/public.pem');

console.log('\n🚀 RSA key pair generated successfully!');
console.log('   Add these to Google Cloud Secret Manager for production:');
console.log('   - Secret name: JWT_PRIVATE_KEY  (value from keys/private.pem)');
console.log('   - Secret name: JWT_PUBLIC_KEY   (value from keys/public.pem)');
