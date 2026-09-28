/**
 * Chain and asset policy.
 *
 * The single most important function in this file is {@link assertChainAllowed}.
 *
 * An autonomous agent that can move money is an agent that can be tricked into moving money.
 * So mainnet is **off by default**, and turning it on is an explicit, visible act by the
 * operator (`allowMainnet: true`), not a default that a prompt can talk its way into.
 *
 * Unknown chains are refused rather than passed through. Fail closed.
 */

import { assertDecimalString, compareAmounts, decimalsFor, parseAmountToBaseUnits } from './amount.js';
import { PolicyError, ValidationError } from './errors.js';

/**
 * Known chains.
 *
 * `caip2` is the [CAIP-10/2](https://github.com/ChainAgnostic/CAIPs) identifier, included so
 * that a future non-EVM chain can join without changing the envelope format.
 */
export const CHAIN_REGISTRY = Object.freeze({
  'base-sepolia': Object.freeze({
    name: 'Base Sepolia',
    kind: 'evm',
    network: 'testnet',
    chainId: 84532,
    caip2: 'eip155:84532',
    explorer: 'https://sepolia.basescan.org',
    assets: Object.freeze(['USDC', 'ETH']),
  }),
  'ethereum-sepolia': Object.freeze({
    name: 'Ethereum Sepolia',
    kind: 'evm',
    network: 'testnet',
    chainId: 11155111,
    caip2: 'eip155:11155111',
    explorer: 'https://sepolia.etherscan.io',
    assets: Object.freeze(['USDC', 'ETH']),
  }),
  base: Object.freeze({
    name: 'Base',
    kind: 'evm',
    network: 'mainnet',
    chainId: 8453,
    caip2: 'eip155:8453',
    explorer: 'https://basescan.org',
    assets: Object.freeze(['USDC', 'ETH']),
  }),
  ethereum: Object.freeze({
    name: 'Ethereum',
    kind: 'evm',
    network: 'mainnet',
    chainId: 1,
    caip2: 'eip155:1',
    explorer: 'https://etherscan.io',
    assets: Object.freeze(['USDC', 'ETH']),
  }),
});

/**
 * The policy an agent runs with when the operator has said nothing.
 *
 * Testnets only. No spending cap (`maxAmount` empty) because a cap implies an expectation
 * of real value; on testnet the useful default is "anything goes, on play money".
 */
export const DEFAULT_POLICY = Object.freeze({
  allowMainnet: false,
  allowedChains: null,
  allowedAssets: null,
  maxAmount: Object.freeze({}),
});

/**
 * @param {unknown} chain
 * @returns {boolean}
 */
export function isKnownChain(chain) {
  return typeof chain === 'string' && Object.hasOwn(CHAIN_REGISTRY, chain);
}

/**
 * @param {unknown} chain
 * @returns {(typeof CHAIN_REGISTRY)[keyof typeof CHAIN_REGISTRY]}
 * @throws {PolicyError} if the chain is not in the registry
 */
export function resolveChain(chain) {
  if (!isKnownChain(chain)) {
    throw new PolicyError(
      `unknown chain "${String(chain)}"; refusing to guess`,
      { chain, known: Object.keys(CHAIN_REGISTRY) },
    );
  }
  return CHAIN_REGISTRY[/** @type {keyof typeof CHAIN_REGISTRY} */ (chain)];
}

/**
 * Fill in defaults and validate the shape of a caller-supplied policy.
 *
 * @param {Partial<typeof DEFAULT_POLICY>} [policy]
 * @returns {{ allowMainnet: boolean, allowedChains: string[] | null, allowedAssets: string[] | null, maxAmount: Record<string, string> }}
 * @throws {ValidationError}
 */
export function normalizePolicy(policy = {}) {
  if (policy === null || typeof policy !== 'object') {
    throw new ValidationError('policy must be an object');
  }

  const allowMainnet = policy.allowMainnet ?? DEFAULT_POLICY.allowMainnet;
  if (typeof allowMainnet !== 'boolean') {
    throw new ValidationError('policy.allowMainnet must be a boolean');
  }

  const allowedChains = policy.allowedChains ?? null;
  if (allowedChains !== null) {
    if (!Array.isArray(allowedChains) || allowedChains.some((c) => typeof c !== 'string')) {
      throw new ValidationError('policy.allowedChains must be an array of chain names or null');
    }
    for (const chain of allowedChains) resolveChain(chain);
  }

  const allowedAssets = policy.allowedAssets ?? null;
  if (allowedAssets !== null) {
    if (!Array.isArray(allowedAssets) || allowedAssets.some((a) => typeof a !== 'string')) {
      throw new ValidationError('policy.allowedAssets must be an array of asset symbols or null');
    }
  }

  const maxAmount = policy.maxAmount ?? {};
  if (maxAmount === null || typeof maxAmount !== 'object' || Array.isArray(maxAmount)) {
    throw new ValidationError('policy.maxAmount must be an object keyed by asset symbol');
  }
  for (const [asset, limit] of Object.entries(maxAmount)) {
    assertDecimalString(limit, `policy.maxAmount.${asset}`);
  }

  return {
    allowMainnet,
    allowedChains: allowedChains === null ? null : [...allowedChains],
    allowedAssets: allowedAssets === null ? null : [...allowedAssets],
    maxAmount: { ...maxAmount },
  };
}

/**
 * Refuse a chain the active policy does not permit.
 *
 * @param {string} chain
 * @param {Partial<typeof DEFAULT_POLICY>} [policy]
 * @returns {(typeof CHAIN_REGISTRY)[keyof typeof CHAIN_REGISTRY]}
 * @throws {PolicyError}
 */
export function assertChainAllowed(chain, policy = DEFAULT_POLICY) {
  const resolved = resolveChain(chain);
  const active = normalizePolicy(policy);

  if (resolved.network === 'mainnet' && !active.allowMainnet) {
    throw new PolicyError(
      `chain "${chain}" is mainnet and this agent's policy has allowMainnet=false`,
      { chain, network: resolved.network, hint: 'set policy.allowMainnet = true to opt in explicitly' },
    );
  }

  if (active.allowedChains !== null && !active.allowedChains.includes(chain)) {
    throw new PolicyError(
      `chain "${chain}" is not in the policy allow-list`,
      { chain, allowedChains: active.allowedChains },
    );
  }

  return resolved;
}

/**
 * Refuse an asset that the chain does not carry, or that the policy excludes.
 *
 * @param {string} chain
 * @param {string} asset
 * @param {Partial<typeof DEFAULT_POLICY>} [policy]
 * @returns {string} the asset symbol
 * @throws {PolicyError}
 */
export function assertAssetAllowed(chain, asset, policy = DEFAULT_POLICY) {
  const resolved = assertChainAllowed(chain, policy);
  const active = normalizePolicy(policy);

  if (!resolved.assets.includes(asset)) {
    throw new PolicyError(
      `asset "${asset}" is not supported on ${resolved.name}`,
      { chain, asset, supported: [...resolved.assets] },
    );
  }

  if (active.allowedAssets !== null && !active.allowedAssets.includes(asset)) {
    throw new PolicyError(
      `asset "${asset}" is not in the policy allow-list`,
      { asset, allowedAssets: active.allowedAssets },
    );
  }

  return asset;
}

/**
 * Refuse an amount above the configured per-asset ceiling.
 *
 * Comparison is numeric (base units), so a ceiling of `"100"` correctly rejects `"100.000001"`.
 *
 * @param {string} asset
 * @param {string} amount
 * @param {Partial<typeof DEFAULT_POLICY>} [policy]
 * @returns {string} the amount
 * @throws {PolicyError | ValidationError}
 */
export function assertAmountAllowed(asset, amount, policy = DEFAULT_POLICY) {
  assertDecimalString(amount);
  const active = normalizePolicy(policy);
  const limit = active.maxAmount[asset];
  if (limit === undefined) return amount;

  const decimals = decimalsFor(asset);
  if (compareAmounts(amount, limit, decimals) > 0) {
    throw new PolicyError(
      `amount ${amount} ${asset} exceeds the policy ceiling of ${limit} ${asset}`,
      { asset, amount, limit },
    );
  }
  return amount;
}

/**
 * The single gate every outgoing payment message must pass through.
 *
 * @param {{ chain: string, asset: string, amount: string }} payment
 * @param {Partial<typeof DEFAULT_POLICY>} [policy]
 * @returns {{ chain: string, asset: string, amount: string, decimals: number, network: string, chainId: number }}
 * @throws {PolicyError | ValidationError}
 */
export function assertPaymentAllowed(payment, policy = DEFAULT_POLICY) {
  if (payment === null || typeof payment !== 'object') {
    throw new ValidationError('payment must be an object with chain, asset, and amount');
  }
  const { chain, asset, amount } = payment;
  assertChainAllowed(chain, policy);
  assertAssetAllowed(chain, asset, policy);
  assertAmountAllowed(asset, amount, policy);

  const resolved = resolveChain(chain);
  const decimals = decimalsFor(asset);

  // Precision check. Without it "2.5000001" would be a perfectly valid USDC invoice whose
  // amount cannot be represented on chain — a request nobody could ever settle.
  parseAmountToBaseUnits(amount, decimals);

  return {
    chain,
    asset,
    amount,
    decimals,
    network: resolved.network,
    chainId: resolved.chainId,
  };
}

/**
 * Build an explorer link for a transaction, or `null` for an unknown chain.
 *
 * @param {string} chain
 * @param {string} txHash
 * @returns {string | null}
 */
export function explorerTxUrl(chain, txHash) {
  if (!isKnownChain(chain)) return null;
  const { explorer } = resolveChain(chain);
  return `${explorer}/tx/${txHash}`;
}
