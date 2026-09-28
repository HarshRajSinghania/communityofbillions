import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canonicalBytes, canonicalize } from '../src/canonical.js';
import { CanonicalizationError } from '../src/errors.js';

describe('canonicalize', () => {
  it('sorts object keys by UTF-16 code unit', () => {
    assert.equal(canonicalize({ b: 1, a: 2, c: 3 }), '{"a":2,"b":1,"c":3}');
  });

  it('produces the same bytes regardless of insertion order', () => {
    const one = { z: 1, a: { y: 2, b: 3 }, m: [1, 2] };
    const other = { m: [1, 2], a: { b: 3, y: 2 }, z: 1 };
    assert.equal(canonicalize(one), canonicalize(other));
  });

  it('keeps array order', () => {
    assert.equal(canonicalize([3, 1, 2]), '[3,1,2]');
  });

  it('does not reorder array elements even when they are objects', () => {
    assert.equal(canonicalize([{ b: 1, a: 2 }, { b: 3 }]), '[{"a":2,"b":1},{"b":3}]');
  });

  it('emits no insignificant whitespace', () => {
    assert.equal(canonicalize({ a: { b: [1, 2] } }), '{"a":{"b":[1,2]}}');
  });

  it('handles the JSON scalars', () => {
    assert.equal(canonicalize(null), 'null');
    assert.equal(canonicalize(true), 'true');
    assert.equal(canonicalize(false), 'false');
    assert.equal(canonicalize(0), '0');
    assert.equal(canonicalize(42), '42');
    assert.equal(canonicalize('hi'), '"hi"');
  });

  it('normalises negative zero so the sign cannot leak into signed bytes', () => {
    assert.equal(canonicalize(-0), '0');
    assert.equal(canonicalize({ a: -0 }), '{"a":0}');
  });

  it('escapes strings the way JSON does', () => {
    assert.equal(canonicalize('a"b\\c\nd'), '"a\\"b\\\\c\\nd"');
  });

  it('keeps non-ASCII characters as-is rather than escaping them', () => {
    // U+00E9 and U+1F600 must survive a UTF-8 round trip unchanged.
    assert.equal(canonicalize('café 😀'), '"café 😀"');
    assert.equal(canonicalBytes('café').toString('utf8'), '"café"');
  });

  it('renders undefined array holes as null, matching JSON.stringify', () => {
    // eslint-disable-next-line no-sparse-arrays
    assert.equal(canonicalize([1, , 3]), '[1,null,3]');
  });

  it('rejects undefined members instead of dropping them', () => {
    // Dropping `b` would make {a:1,b:undefined} and {a:1} share one byte stream.
    assert.throws(() => canonicalize({ a: 1, b: undefined }), CanonicalizationError);
  });

  it('rejects NaN and Infinity', () => {
    assert.throws(() => canonicalize(Number.NaN), CanonicalizationError);
    assert.throws(() => canonicalize(Number.POSITIVE_INFINITY), CanonicalizationError);
    assert.throws(() => canonicalize({ a: Number.NEGATIVE_INFINITY }), CanonicalizationError);
  });

  it('rejects bigint and points the caller at decimal strings', () => {
    assert.throws(
      () => canonicalize({ amount: 10n }),
      (error) => error instanceof CanonicalizationError && /decimal string/.test(error.message),
    );
  });

  it('rejects functions and symbols', () => {
    assert.throws(() => canonicalize({ f: () => {} }), CanonicalizationError);
    assert.throws(() => canonicalize({ s: Symbol('x') }), CanonicalizationError);
  });

  it('detects cycles rather than blowing the stack', () => {
    /** @type {any} */
    const node = { name: 'a' };
    node.self = node;
    assert.throws(
      () => canonicalize(node),
      (error) => error instanceof CanonicalizationError && /circular/.test(error.message),
    );
  });

  it('allows the same object to appear twice when it is not an ancestor', () => {
    const shared = { x: 1 };
    assert.equal(canonicalize({ a: shared, b: shared }), '{"a":{"x":1},"b":{"x":1}}');
  });
});
