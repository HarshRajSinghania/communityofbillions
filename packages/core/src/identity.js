/**
 * Agent identity.
 *
 * An agent is an Ed25519 key pair. Its identifier is derived from the public key, so the
 * identifier *is* the verification method — there is no registration step and no central
 * authority that could lie about who owns an id.
 *
 *   cob:agent:<base64url(public key)>
 *
 * The 32-byte public key encodes to 43 base64url characters with no padding, so every
 * well-formed agent id is exactly 53 characters long. That makes validation cheap and
 * makes typos detectable.
 */

import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from 'node:crypto';

import { canonicalBytes } from './canonical.js';
import { ValidationError } from './errors.js';

/** Prefix of every agent identifier. */
export const AGENT_ID_PREFIX = 'cob:agent:';

/** Ed25519 public keys are 32 bytes. */
const PUBLIC_KEY_BYTES = 32;

/** base64url of 32 bytes, unpadded. */
const PUBLIC_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** base64url of 32 bytes, unpadded — a private scalar has the same shape. */
const PRIVATE_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/** Marker written into exported secret files so a reader cannot mistake one for a public key. */
export const SECRET_FILE_TYPE = 'cob.agent.key';

/**
 * DER prefixes for the two structures we need to build by hand.
 *
 * Node's JWK importer requires an OKP private key to carry **both** `x` and `d`. That makes
 * it useless for the one job we actually need here: deriving the public key from the seed
 * alone, so that a tampered secret file can be detected rather than trusted. These prefixes
 * are the fixed ASN.1 wrappers around a raw Ed25519 seed and a raw Ed25519 public key.
 */
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/**
 * @param {Buffer} seed 32 raw bytes
 * @returns {import('node:crypto').KeyObject}
 */
function privateKeyFromSeed(seed) {
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, seed]);
  return createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

/**
 * @param {import('node:crypto').KeyObject} privateKey
 * @returns {string} the raw public key as unpadded base64url
 */
function publicKeyRawFromPrivateKey(privateKey) {
  const spki = /** @type {Buffer} */ (createPublicKey(privateKey).export({ format: 'der', type: 'spki' }));
  return spki.subarray(spki.length - PUBLIC_KEY_BYTES).toString('base64url');
}

/**
 * Derive an agent id from a base64url public key.
 *
 * @param {string} publicKey
 * @returns {string}
 * @throws {ValidationError}
 */
export function agentIdFromPublicKey(publicKey) {
  assertPublicKey(publicKey);
  return `${AGENT_ID_PREFIX}${publicKey}`;
}

/**
 * Extract the base64url public key from an agent id.
 *
 * @param {string} agentId
 * @returns {string}
 * @throws {ValidationError}
 */
export function publicKeyFromAgentId(agentId) {
  assertAgentId(agentId);
  return agentId.slice(AGENT_ID_PREFIX.length);
}

/**
 * @param {unknown} agentId
 * @returns {boolean}
 */
export function isAgentId(agentId) {
  if (typeof agentId !== 'string' || !agentId.startsWith(AGENT_ID_PREFIX)) return false;
  return PUBLIC_KEY_PATTERN.test(agentId.slice(AGENT_ID_PREFIX.length));
}

/**
 * @param {unknown} agentId
 * @param {string} [label]
 * @returns {string}
 * @throws {ValidationError}
 */
export function assertAgentId(agentId, label = 'agent id') {
  if (!isAgentId(agentId)) {
    throw new ValidationError(
      `${label} must look like "cob:agent:<43 base64url chars>"`,
      { field: label, value: agentId },
    );
  }
  return /** @type {string} */ (agentId);
}

/**
 * @param {unknown} publicKey
 * @returns {string}
 * @throws {ValidationError}
 */
function assertPublicKey(publicKey) {
  if (typeof publicKey !== 'string' || !PUBLIC_KEY_PATTERN.test(publicKey)) {
    throw new ValidationError(
      'public key must be 32 bytes encoded as unpadded base64url (43 characters)',
      { value: publicKey },
    );
  }
  return publicKey;
}

/**
 * Short, human-friendly form of an agent id for logs and CLI output.
 *
 * `cob:agent:9tQK3v1sVn0m2Yf4pQ7rLbXwZc8dHjKeSgUaNtMi5Pk` → `cob:agent:9tQK3v1s…`
 *
 * @param {string} agentId
 * @param {number} [head] characters of the key to keep
 * @returns {string}
 */
export function shortAgentId(agentId, head = 8) {
  if (!isAgentId(agentId)) return String(agentId);
  return `${AGENT_ID_PREFIX}${publicKeyFromAgentId(agentId).slice(0, head)}…`;
}

/**
 * An agent's key pair, with the private half kept out of every serialisation but
 * {@link AgentIdentity#exportSecret}.
 */
export class AgentIdentity {
  /** @type {import('node:crypto').KeyObject} */
  #privateKey;

  /** @type {import('node:crypto').KeyObject} */
  #publicKey;

  /** @type {string} */
  #publicKeyRaw;

  /**
   * @param {import('node:crypto').KeyObject} privateKey
   * @param {import('node:crypto').KeyObject} publicKey
   * @param {string} publicKeyRaw base64url
   */
  constructor(privateKey, publicKey, publicKeyRaw) {
    this.#privateKey = privateKey;
    this.#publicKey = publicKey;
    this.#publicKeyRaw = publicKeyRaw;
  }

  /**
   * Generate a fresh identity using the platform CSPRNG.
   *
   * @returns {AgentIdentity}
   */
  static generate() {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const jwk = /** @type {{ x: string }} */ (publicKey.export({ format: 'jwk' }));
    return new AgentIdentity(privateKey, publicKey, jwk.x);
  }

  /**
   * Rebuild an identity from an exported secret file.
   *
   * @param {unknown} secret value produced by {@link AgentIdentity#exportSecret}
   * @returns {AgentIdentity}
   * @throws {ValidationError}
   */
  static fromSecret(secret) {
    if (secret === null || typeof secret !== 'object') {
      throw new ValidationError('secret must be an object');
    }
    const record = /** @type {Record<string, unknown>} */ (secret);

    if (typeof record.privateKey !== 'string' || !PRIVATE_KEY_PATTERN.test(record.privateKey)) {
      throw new ValidationError('secret.privateKey must be a 32-byte unpadded base64url string');
    }

    // The public half is always re-derived from the private seed, and any public key or id
    // present in the file is checked for agreement. A mismatched pair is a corrupted or
    // doctored file, not a usable key.
    const seed = Buffer.from(record.privateKey, 'base64url');
    if (seed.length !== PUBLIC_KEY_BYTES) {
      throw new ValidationError('secret.privateKey must decode to exactly 32 bytes', {
        bytes: seed.length,
      });
    }

    let privateKey;
    try {
      privateKey = privateKeyFromSeed(seed);
    } catch (error) {
      throw new ValidationError('secret.privateKey is not a valid Ed25519 seed', {
        cause: error instanceof Error ? error.message : String(error),
      });
    }

    const derivedRaw = publicKeyRawFromPrivateKey(privateKey);

    if (typeof record.publicKey === 'string' && record.publicKey !== derivedRaw) {
      throw new ValidationError('secret.publicKey does not match secret.privateKey', {
        publicKey: record.publicKey,
        derived: derivedRaw,
      });
    }

    if (typeof record.id === 'string' && record.id !== `${AGENT_ID_PREFIX}${derivedRaw}`) {
      throw new ValidationError('secret.id does not match secret.privateKey', {
        id: record.id,
        derived: `${AGENT_ID_PREFIX}${derivedRaw}`,
      });
    }

    return new AgentIdentity(privateKey, createPublicKey(privateKey), derivedRaw);
  }

  /** @returns {string} `cob:agent:<base64url public key>` */
  get id() {
    return `${AGENT_ID_PREFIX}${this.#publicKeyRaw}`;
  }

  /** @returns {string} the base64url public key on its own */
  get publicKey() {
    return this.#publicKeyRaw;
  }

  /** @returns {string} `"Ed25519"` */
  get algorithm() {
    return 'Ed25519';
  }

  /**
   * Sign arbitrary bytes.
   *
   * @param {Buffer | Uint8Array} bytes
   * @returns {Buffer} 64-byte signature
   */
  sign(bytes) {
    if (!(bytes instanceof Uint8Array)) {
      throw new ValidationError('sign() expects a Buffer or Uint8Array', { type: typeof bytes });
    }
    // Ed25519 hashes the message internally, so no separate digest algorithm is passed.
    return cryptoSign(null, Buffer.from(bytes), this.#privateKey);
  }

  /**
   * Sign a value by canonicalising it first. This is the primitive the protocol uses.
   *
   * @param {unknown} value
   * @returns {string} base64url signature
   */
  signValue(value) {
    return this.sign(canonicalBytes(value)).toString('base64url');
  }

  /**
   * Public description of this agent — safe to publish, safe to log.
   *
   * @returns {{ id: string, publicKey: string, alg: string }}
   */
  toPublicDescriptor() {
    return { id: this.id, publicKey: this.#publicKeyRaw, alg: 'Ed25519' };
  }

  /**
   * Full secret material, including the private key.
   *
   * ⚠️ The result is the agent. Anyone holding it can speak as this agent forever.
   * Never log it, never send it over a network, never commit it.
   *
   * @param {Date} [now]
   * @returns {Record<string, unknown>}
   */
  exportSecret(now = new Date()) {
    const jwk = /** @type {{ d: string }} */ (this.#privateKey.export({ format: 'jwk' }));
    return {
      cob: '1',
      type: SECRET_FILE_TYPE,
      id: this.id,
      alg: 'Ed25519',
      publicKey: this.#publicKeyRaw,
      privateKey: jwk.d,
      created: now.toISOString(),
    };
  }
}

/**
 * Verify a detached signature made by {@link AgentIdentity#sign}.
 *
 * Returns `false` rather than throwing: a bad signature is an expected event on a hostile
 * network, and callers almost always want to branch on it.
 *
 * @param {Buffer | Uint8Array} bytes
 * @param {string | Buffer | Uint8Array} signature base64url string or raw bytes
 * @param {string} publicKey base64url public key, or a full agent id
 * @returns {boolean}
 */
export function verifySignature(bytes, signature, publicKey) {
  if (!(bytes instanceof Uint8Array)) return false;

  const key = typeof publicKey === 'string' && publicKey.startsWith(AGENT_ID_PREFIX)
    ? publicKey.slice(AGENT_ID_PREFIX.length)
    : publicKey;

  if (typeof key !== 'string' || !PUBLIC_KEY_PATTERN.test(key)) return false;

  let signatureBytes;
  try {
    signatureBytes = typeof signature === 'string'
      ? Buffer.from(signature, 'base64url')
      : Buffer.from(/** @type {Uint8Array} */ (signature));
  } catch {
    return false;
  }

  // Ed25519 signatures are exactly 64 bytes. Reject early so a malformed length can never
  // be interpreted as a valid signature by a lenient backend.
  if (signatureBytes.length !== 64) return false;

  try {
    const keyObject = createPublicKey({
      key: { kty: 'OKP', crv: 'Ed25519', x: key },
      format: 'jwk',
    });
    return cryptoVerify(null, Buffer.from(bytes), keyObject, signatureBytes);
  } catch {
    return false;
  }
}

/**
 * Verify a signature over a canonicalised value.
 *
 * @param {unknown} value
 * @param {string} signature base64url
 * @param {string} publicKey base64url public key or agent id
 * @returns {boolean}
 */
export function verifyValueSignature(value, signature, publicKey) {
  return verifySignature(canonicalBytes(value), signature, publicKey);
}
