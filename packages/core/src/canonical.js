/**
 * Canonical JSON serialisation.
 *
 * Signatures are only meaningful if both sides agree on the exact bytes being signed.
 * JSON does not guarantee that: `{"a":1,"b":2}` and `{"b":2,"a":1}` are the same document
 * and different bytes. So we define one byte stream per document.
 *
 * This is a deliberately small subset of RFC 8785 (JSON Canonicalization Scheme):
 *
 *   1. Object members are sorted by key, comparing UTF-16 code units.
 *   2. No insignificant whitespace anywhere.
 *   3. Strings use the escaping produced by `JSON.stringify` (ES2019 well-formed).
 *   4. Numbers use the ECMAScript `Number::toString` form, also via `JSON.stringify`.
 *      `-0` serialises as `0`.
 *   5. `undefined`, functions, symbols, bigints, NaN, and infinities are rejected.
 *      They have no canonical representation, and silently dropping them would let two
 *      different documents canonicalise to the same bytes — a signature forgery vector.
 *   6. Arrays keep their order. Array holes become `null`, matching `JSON.stringify`.
 *
 * Note for protocol authors: money is *never* a number here. Amounts travel as decimal
 * strings so that no canonicalisation or floating-point rule can ever change their value.
 */

import { CanonicalizationError } from './errors.js';

/**
 * Serialise a value to its canonical JSON string.
 *
 * @param {unknown} value
 * @returns {string}
 * @throws {CanonicalizationError} if the value has no canonical representation
 */
export function canonicalize(value) {
  return write(value, new Set());
}

/**
 * Canonical JSON as UTF-8 bytes — what a signature actually covers.
 *
 * @param {unknown} value
 * @returns {Buffer}
 */
export function canonicalBytes(value) {
  return Buffer.from(canonicalize(value), 'utf8');
}

/**
 * @param {unknown} value
 * @param {Set<object>} ancestors objects on the current path, for cycle detection
 * @returns {string}
 */
function write(value, ancestors) {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';

    case 'number':
      return writeNumber(value);

    case 'string':
      return JSON.stringify(value);

    case 'bigint':
      throw new CanonicalizationError(
        'BigInt has no canonical JSON representation; serialise it as a decimal string',
        { value: value.toString() },
      );

    case 'undefined':
      throw new CanonicalizationError(
        'undefined has no canonical JSON representation; omit the member or use null',
      );

    case 'function':
    case 'symbol':
      throw new CanonicalizationError(`${typeof value} values cannot be serialised as JSON`);

    case 'object':
      return writeObject(value, ancestors);

    default:
      throw new CanonicalizationError(`unsupported type: ${typeof value}`);
  }
}

/**
 * @param {number} value
 * @returns {string}
 */
function writeNumber(value) {
  if (!Number.isFinite(value)) {
    throw new CanonicalizationError(
      'NaN and Infinity have no canonical JSON representation',
      { value: String(value) },
    );
  }
  // JSON.stringify(-0) is "0" already, but be explicit: the sign must not leak into bytes.
  if (Object.is(value, -0)) return '0';
  return JSON.stringify(value);
}

/**
 * @param {object} value
 * @param {Set<object>} ancestors
 * @returns {string}
 */
function writeObject(value, ancestors) {
  if (ancestors.has(value)) {
    throw new CanonicalizationError('circular reference detected while canonicalising');
  }
  ancestors.add(value);

  try {
    if (Array.isArray(value)) {
      const parts = new Array(value.length);
      for (let i = 0; i < value.length; i += 1) {
        // A hole reads back as undefined; JSON.stringify renders holes as null.
        parts[i] = i in value ? write(value[i], ancestors) : 'null';
      }
      return `[${parts.join(',')}]`;
    }

    const keys = Object.keys(value).sort(compareCodeUnits);
    const parts = [];
    for (const key of keys) {
      const member = /** @type {Record<string, unknown>} */ (value)[key];
      // Members whose value is undefined are rejected rather than skipped: skipping would
      // make `{a:1, b:undefined}` and `{a:1}` collide.
      parts.push(`${JSON.stringify(key)}:${write(member, ancestors)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

/**
 * Compare two strings by UTF-16 code unit, which is what RFC 8785 specifies.
 * (Plain `<` on strings happens to do exactly this, but naming it makes the
 * choice visible to a reader who is auditing the signature path.)
 *
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function compareCodeUnits(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
