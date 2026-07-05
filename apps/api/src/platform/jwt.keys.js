// src/platform/jwt.keys.js
//
// Centralised RSA key loader for RS256 JWT signing.
//
// ── Loading order (platform-agnostic) ─────────────────────────────────
// The keys are resolved the same way on EVERY platform (Cloud Run, plain
// Docker, Kubernetes, a VM, bare metal, local dev). No provider-specific
// code lives here:
//
//   1. Environment variable holding the PEM itself  ← preferred everywhere
//        JWT_PRIVATE_KEY / JWT_PUBLIC_KEY
//   2. Environment variable holding a FILE PATH to the PEM
//        JWT_PRIVATE_KEY_PATH / JWT_PUBLIC_KEY_PATH
//   3. Local `keys/` directory (git-ignored)        ← dev convenience only
//
// This is the standard for injecting secrets across the platform: the app
// reads a plain env var, and each host decides how to populate it -
//   * Google Cloud Run  → Secret Manager, mounted as an env var:
//       gcloud run deploy login-api \
//         --update-secrets JWT_PRIVATE_KEY=JWT_PRIVATE_KEY:latest \
//         --update-secrets JWT_PUBLIC_KEY=JWT_PUBLIC_KEY:latest
//   * Docker / Compose  → `-e JWT_PRIVATE_KEY="$(cat keys/private.pem)"` or an env_file
//   * Kubernetes        → a Secret surfaced via `env.valueFrom.secretKeyRef`
//   * Local dev         → nothing to set; the `keys/` file fallback is used
//
// PEM env vars are accepted whether the newlines are real or escaped as
// literal "\n" (some hosts/CLIs flatten multi-line values), so the same
// value works everywhere.
//
// Generate a keypair with:
//   mkdir keys
//   openssl genpkey -algorithm RSA -out keys/private.pem -pkeyopt rsa_keygen_bits:2048
//   openssl rsa -pubout -in keys/private.pem -out keys/public.pem
//
// ── Microservice consumers ────────────────────────────────────────────
// Services that ONLY need to verify tokens (e.g. a future "core" service
// split from this monolith) need only the *public* key.  They can obtain
// it from the same JWT_PUBLIC_KEY env var or via an HTTP GET to the auth
// service's /.well-known/jwks.json endpoint (future enhancement).

const fs = require('fs');
const path = require('path');

const JWT_PRIVATE_KEY_PATH = process.env.JWT_PRIVATE_KEY_PATH || path.join(__dirname, '../../keys/private.pem');
const JWT_PUBLIC_KEY_PATH  = process.env.JWT_PUBLIC_KEY_PATH  || path.join(__dirname, '../../keys/public.pem');

/** Cache the loaded keys so they are only read on first access. */
let privateKey = null;
let publicKey  = null;

// Some hosts/CLIs flatten a multi-line env var, turning real newlines into
// the literal two characters "\n". Restore them so the PEM parses. A value
// that already has real newlines is unaffected (no "\n" sequences to swap).
function normalizePem(pem) {
  return pem.includes('\\n') ? pem.replace(/\\n/g, '\n') : pem;
}

/**
 * Returns the RSA private key used to **sign** JWTs.
 * Resolves via env-var PEM → env-var path → local file (see header).
 */
function getPrivateKey() {
  if (privateKey) return privateKey;

  if (process.env.JWT_PRIVATE_KEY) {
    privateKey = normalizePem(process.env.JWT_PRIVATE_KEY);
    console.log('[JWT KEYS] Loaded private key from environment variable.');
  } else {
    privateKey = fs.readFileSync(JWT_PRIVATE_KEY_PATH, 'utf8');
    console.log(`[JWT KEYS] Loaded private key from file: ${JWT_PRIVATE_KEY_PATH}`);
  }

  return privateKey;
}

/**
 * Returns the RSA public key used to **verify** JWTs.
 * Resolves via env-var PEM → env-var path → local file (see header).
 */
function getPublicKey() {
  if (publicKey) return publicKey;

  if (process.env.JWT_PUBLIC_KEY) {
    publicKey = normalizePem(process.env.JWT_PUBLIC_KEY);
    console.log('[JWT KEYS] Loaded public key from environment variable.');
  } else {
    publicKey = fs.readFileSync(JWT_PUBLIC_KEY_PATH, 'utf8');
    console.log(`[JWT KEYS] Loaded public key from file: ${JWT_PUBLIC_KEY_PATH}`);
  }

  return publicKey;
}

module.exports = { getPrivateKey, getPublicKey };
