/**
 * Amounts.
 *
 * Rule number one of this protocol: **money is a string, never a number.**
 *
 * A float cannot represent 0.1 exactly. JSON has no decimal type. So an amount travels
 * as a decimal string in human units (`"2.50"`) and is converted to integer base units
 * (2 500 000 for a 6-decimal asset) using BigInt at the boundary. Nothing in between
 * ever touches a float.
 */

import { ValidationError } from './errors.js';

/** Decimal places per known asset. Unknown assets must be declared explicitly by the caller. */
export const ASSET_DECIMALS = Object.freeze({
  USDC: 6,
  USDT: 6,
  DAI: 18,
  ETH: 18,
});

/** `"12"`, `"12.5"`, `"0.000001"` — but not `".5"`, `"5."`, `"1e5"`, `"-1"`, `"+1"`. */
const DECIMAL_PATTERN = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

/**
 * @param {unknown} amount
 * @returns {boolean} true if `amount` is a well-formed non-negative decimal string
 */
export function isDecimalString(amount) {
  return typeof amount === 'string' && DECIMAL_PATTERN.test(amount);
}

/**
 * Assert that a value is a well-formed decimal string.
 *
 * @param {unknown} amount
 * @param {string} [label] field name used in the error message
 * @returns {string} the same value, typed as string
 * @throws {ValidationError}
 */
export function assertDecimalString(amount, label = 'amount') {
  if (!isDecimalString(amount)) {
    throw new ValidationError(
      `${label} must be a non-negative decimal string such as "2.50" (got ${describe(amount)})`,
      { field: label, value: amount },
    );
  }
  return amount;
}

/**
 * Resolve the decimal count for an asset.
 *
 * @param {string} asset
 * @param {number} [override] explicit decimals, required for assets we do not know
 * @returns {number}
 * @throws {ValidationError}
 */
export function decimalsFor(asset, override = undefined) {
  if (override !== undefined) {
    if (!Number.isInteger(override) || override < 0 || override > 36) {
      throw new ValidationError('decimals must be an integer between 0 and 36', { decimals: override });
    }
    return override;
  }
  const known = ASSET_DECIMALS[/** @type {keyof typeof ASSET_DECIMALS} */ (asset)];
  if (known === undefined) {
    throw new ValidationError(
      `unknown asset "${asset}"; pass its decimal count explicitly`,
      { asset, known: Object.keys(ASSET_DECIMALS) },
    );
  }
  return known;
}

/**
 * Convert a decimal string to integer base units.
 *
 * `parseAmountToBaseUnits('2.50', 6)` → `2500000n`
 *
 * @param {string} amount decimal string in human units
 * @param {number} decimals
 * @returns {bigint}
 * @throws {ValidationError}
 */
export function parseAmountToBaseUnits(amount, decimals) {
  assertDecimalString(amount);
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new ValidationError('decimals must be a non-negative integer', { decimals });
  }

  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > decimals) {
    throw new ValidationError(
      `amount "${amount}" has more precision than the asset supports (${decimals} decimals)`,
      { amount, decimals },
    );
  }

  const padded = fraction.padEnd(decimals, '0');
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded === '' ? '0' : padded);
}

/**
 * Convert integer base units back to a decimal string, trimming trailing zeros.
 *
 * `formatBaseUnits(2500000n, 6)` → `"2.5"`
 *
 * @param {bigint} baseUnits
 * @param {number} decimals
 * @returns {string}
 */
export function formatBaseUnits(baseUnits, decimals) {
  if (typeof baseUnits !== 'bigint') {
    throw new ValidationError('baseUnits must be a bigint', { baseUnits: typeof baseUnits });
  }
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new ValidationError('decimals must be a non-negative integer', { decimals });
  }

  const negative = baseUnits < 0n;
  const magnitude = negative ? -baseUnits : baseUnits;
  const scale = 10n ** BigInt(decimals);
  const whole = magnitude / scale;
  const fraction = magnitude % scale;

  if (fraction === 0n) return `${negative ? '-' : ''}${whole}`;

  const padded = fraction.toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}.${padded}`;
}

/**
 * Compare two amounts **by value**, not by string.
 *
 * `"2.50"` and `"2.5"` are the same amount and this returns `0`.
 * Comparing the raw strings would report a false mismatch and, in a payment
 * flow, that is how you reject a correct payment.
 *
 * @param {string} a
 * @param {string} b
 * @param {number} decimals
 * @returns {-1 | 0 | 1}
 */
export function compareAmounts(a, b, decimals) {
  const left = parseAmountToBaseUnits(a, decimals);
  const right = parseAmountToBaseUnits(b, decimals);
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * @param {unknown} value
 * @returns {string} a short description for error messages
 */
function describe(value) {
  if (typeof value === 'string') return `"${value}"`;
  if (value === null) return 'null';
  return `${typeof value} ${String(value)}`;
}
