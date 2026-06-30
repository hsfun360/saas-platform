// src/platform/jwt.keys.js
//
// Centralised RSA key loader for RS256 JWT signing.
//
// ── Local development ─────────────────────────────────────────────────
// When running outside Cloud Run, the private and public keys are read
// from the `keys/` directory (git-ignored).  Generate them with:
//
//   mkdir keys
//   openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048
//   openssl rsa -pubout -in keys/private.pem -out keys/public.pem
//
// ── Cloud Run (production) ────────────────────────────────────────────
// On Cloud Run, keys are injected via Google Cloud Secret Manager.
// The recommended approach is to mount secrets as volumes at deploy time:
//
//   gcloud run deploy login-api \
//     --source . \
//     --update-secrets JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:latest \
//     --update-secrets JWT_PUBLIC_KEY=JWT_PUBLIC_KEY:latest
//
// Secrets are then available as environment variables or file mounts.
//
// ── Microservice consumers ────────────────────────────────────────────
// Services that ONLY need to verify tokens (e.g. a future "core" service
// split from this monolith) need only the *public* key.  They can obtain
// it from Secret Manager or via an HTTP GET to the auth service's
// /.well-known/jwks.json endpoint (future enhancement).

const fs = require('fs');
const path = require('path');

const JWT_PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || path.join(__dirname, '../../keys/private.pem');
const JWT_PUBLIC_KEY_PATH  = process.env.JWT_PUBLIC_KEY_PATH  || path.join(__dirname, '../../keys/public.pem');

/** Cache the loaded keys so they are only read on first access. */
let privateKey = null;
let publicKey  = null;

/**
 * Returns the RSA private key used to **sign** JWTs.
 *
 * 1. If `JWT_PRIVATE_KEY` env var is set (Secret Manager volume mount), use it.
 * 2. Fall back to reading the local file (development).
 */
function getPrivateKey() {
  if (privateKey) return privateKey;

  if (process.env.JWT_PRIVATE_KEY) {
    privateKey = process.env.JWT_PRIVATE_KEY;
    console.log('[JWT KEYS] Loaded private key from environment variable.');
  } else {
    privateKey = fs.readFileSync(JWT_PRIVATE_KEY_PATH, 'utf8');
    console.log(`[JWT KEYS] Loaded private key from file: ${JWT_PRIVATE_KEY_PATH}`);
  }

  return privateKey;
}

/**
 * Returns the RSA public key used to **verify** JWTs.
 *
 * 1. If `JWT_PUBLIC_KEY` env var is set (Secret Manager volume mount), use it.
 * 2. Fall back to reading the local file (development).
 */
function getPublicKey() {
  if (publicKey) return publicKey;

  if (process.env.JWT_PUBLIC_KEY) {
    publicKey = process.env.JWT_PUBLIC_KEY;
    console.log('[JWT KEYS] Loaded public key from environment variable.');
  } else {
    publicKey = fs.readFileSync(JWT_PUBLIC_KEY_PATH, 'utf8');
    console.log(`[JWT KEYS] Loaded public key from file: ${JWT_PUBLIC_KEY_PATH}`);
  }

  return publicKey;
}

module.exports = { getPrivateKey, getPublicKey };
