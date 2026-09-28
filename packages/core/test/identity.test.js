import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ValidationError } from '../src/errors.js';
import {
  AGENT_ID_PREFIX,
  AgentIdentity,
  agentIdFromPublicKey,
  isAgentId,
  publicKeyFromAgentId,
  shortAgentId,
  verifySignature,
  verifyValueSignature,
} from '../src/identity.js';

describe('AgentIdentity', () => {
  it('generates an id derived from its public key', () => {
    const identity = AgentIdentity.generate();
    assert.equal(identity.id, `${AGENT_ID_PREFIX}${identity.publicKey}`);
    assert.equal(identity.id, agentIdFromPublicKey(identity.publicKey));
    assert.equal(isAgentId(identity.id), true);
  });

  it('produces 43-character base64url public keys, so ids are 53 characters', () => {
    const identity = AgentIdentity.generate();
    assert.equal(identity.publicKey.length, 43);
    assert.equal(identity.id.length, AGENT_ID_PREFIX.length + 43);
    assert.equal(identity.id.length, 53);
  });

  it('generates a different key every time', () => {
    const ids = new Set(Array.from({ length: 16 }, () => AgentIdentity.generate().id));
    assert.equal(ids.size, 16);
  });

  it('signs and verifies', () => {
    const identity = AgentIdentity.generate();
    const bytes = Buffer.from('the quick brown fox', 'utf8');
    const signature = identity.sign(bytes);
    assert.equal(signature.length, 64);
    assert.equal(verifySignature(bytes, signature, identity.publicKey), true);
    assert.equal(verifySignature(bytes, signature, identity.id), true, 'a full agent id should also work');
  });

  it('refuses a signature over different bytes', () => {
    const identity = AgentIdentity.generate();
    const signature = identity.sign(Buffer.from('a'));
    assert.equal(verifySignature(Buffer.from('b'), signature, identity.publicKey), false);
  });

  it('refuses another agent’s signature', () => {
    const alice = AgentIdentity.generate();
    const bob = AgentIdentity.generate();
    const bytes = Buffer.from('same message');
    assert.equal(verifySignature(bytes, alice.sign(bytes), bob.publicKey), false);
  });

  it('refuses a signature of the wrong length instead of guessing', () => {
    const identity = AgentIdentity.generate();
    const bytes = Buffer.from('x');
    const truncated = identity.sign(bytes).subarray(0, 63);
    assert.equal(verifySignature(bytes, truncated, identity.publicKey), false);
    assert.equal(verifySignature(bytes, 'AAAA', identity.publicKey), false);
  });

  it('returns false rather than throwing on malformed keys', () => {
    assert.equal(verifySignature(Buffer.from('x'), 'AAAA', 'not-a-key'), false);
    assert.equal(verifySignature(Buffer.from('x'), 'AAAA', ''), false);
  });

  it('verifies a canonicalised value', () => {
    const identity = AgentIdentity.generate();
    const value = { b: 1, a: [1, 2, { z: true }] };
    const signature = identity.signValue(value);
    assert.equal(verifyValueSignature(value, signature, identity.publicKey), true);

    // Same document, different key order: still the same bytes, so still valid.
    assert.equal(verifyValueSignature({ a: [1, 2, { z: true }], b: 1 }, signature, identity.publicKey), true);
  });
});

describe('AgentIdentity secret handling', () => {
  it('round-trips through exportSecret', () => {
    const original = AgentIdentity.generate();
    const restored = AgentIdentity.fromSecret(original.exportSecret());

    assert.equal(restored.id, original.id);
    assert.equal(restored.publicKey, original.publicKey);

    // The restored key must produce signatures the original public key accepts.
    const signature = restored.sign(Buffer.from('hello'));
    assert.equal(verifySignature(Buffer.from('hello'), signature, original.publicKey), true);
  });

  it('never puts the private key in the public descriptor', () => {
    const identity = AgentIdentity.generate();
    const descriptor = identity.toPublicDescriptor();
    assert.deepEqual(Object.keys(descriptor).sort(), ['alg', 'id', 'publicKey']);
    assert.equal(JSON.stringify(descriptor).includes(identity.exportSecret().privateKey), false);
  });

  it('marks exported secrets so they cannot be mistaken for public material', () => {
    const secret = AgentIdentity.generate().exportSecret();
    assert.equal(secret.type, 'cob.agent.key');
    assert.equal(secret.alg, 'Ed25519');
    assert.equal(typeof secret.privateKey, 'string');
    assert.notEqual(secret.privateKey, secret.publicKey);
  });

  it('rejects a secret whose public key does not match its private key', () => {
    const a = AgentIdentity.generate().exportSecret();
    const b = AgentIdentity.generate().exportSecret();
    assert.throws(
      () => AgentIdentity.fromSecret({ ...a, publicKey: b.publicKey }),
      (error) => error instanceof ValidationError && /does not match/.test(error.message),
    );
  });

  it('rejects a secret whose id does not match its private key', () => {
    const a = AgentIdentity.generate().exportSecret();
    assert.throws(
      () => AgentIdentity.fromSecret({ ...a, id: `cob:agent:${'A'.repeat(43)}` }),
      ValidationError,
    );
  });

  it('rejects a malformed private key', () => {
    assert.throws(() => AgentIdentity.fromSecret({ privateKey: 'too-short' }), ValidationError);
    assert.throws(() => AgentIdentity.fromSecret(null), ValidationError);
  });
});

describe('agent id helpers', () => {
  it('rejects lookalike identifiers', () => {
    const good = AgentIdentity.generate().publicKey;
    assert.equal(isAgentId(`cob:agent:${good}`), true);
    assert.equal(isAgentId(`cob:agent:${good.slice(0, 42)}`), false, 'too short');
    assert.equal(isAgentId(`cob:agent:${good}A`), false, 'too long');
    assert.equal(isAgentId(`cob:agents:${good}`), false, 'wrong prefix');
    assert.equal(isAgentId(good), false, 'bare key is not an agent id');
    assert.equal(isAgentId(null), false);
    assert.equal(isAgentId(42), false);

    // Deliberately deterministic: swapping a character for a non-base64url one must fail
    // regardless of which characters the randomly generated key happens to contain.
    // (An earlier version of this test used `good.replace('-', '+')`, which was a no-op
    // whenever the key contained no '-' — it passed or failed depending on the key.)
    for (const bad of ['+', '/', '=', ' ', '.']) {
      assert.equal(isAgentId(`cob:agent:${bad}${good.slice(1)}`), false, `${bad} is not base64url`);
    }
  });

  it('extracts the public key back out of an id', () => {
    const identity = AgentIdentity.generate();
    assert.equal(publicKeyFromAgentId(identity.id), identity.publicKey);
    assert.throws(() => publicKeyFromAgentId('nonsense'), ValidationError);
  });

  it('shortens ids for logs without losing the prefix', () => {
    const identity = AgentIdentity.generate();
    const short = shortAgentId(identity.id);
    assert.equal(short, `${AGENT_ID_PREFIX}${identity.publicKey.slice(0, 8)}…`);
    assert.equal(short.startsWith(AGENT_ID_PREFIX), true);
  });

  it('passes through values it cannot shorten', () => {
    assert.equal(shortAgentId('not-an-id'), 'not-an-id');
  });
});
