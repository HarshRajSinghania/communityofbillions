# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for the implementation.
The **wire format** is versioned separately: it is `cob: "1"`, and it will only change with a
documented specification revision.

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-09-28

First draft. Everything below is new.

### Added

- **Specification** `spec/COB-1.md` (draft 0.1): identity, envelope, canonical form, message types,
  payment request/receipt, receipt matching, payment lifecycle, chain and asset policy, error codes,
  and an explicit list of open questions.
- **Canonical JSON** (`canonical.js`) — a strict subset of RFC 8785. Rejects `undefined` members,
  NaN, Infinity, bigint, and cycles rather than coercing them, because coercion is how two distinct
  documents collide onto one signed byte stream.
- **Amounts** (`amount.js`) — decimal strings ↔ integer `BigInt` base units. Comparison is numeric,
  so `"2.5"` and `"2.50"` are the same amount and `"9"` is below a ceiling of `"10"`.
- **Identity** (`identity.js`) — Ed25519 key pairs, `cob:agent:` identifiers derived from the public
  key, JWK-free DER import/export, and a secret loader that re-derives and cross-checks the public
  half so a doctored key file is an error rather than a silently different agent.
- **Envelope** (`envelope.js`) — minting, structural validation, signature verification, expiry and
  clock-skew handling, and an explicit signed-field allow-list.
- **Policy** (`policy.js`) — chain registry with CAIP-2 identifiers, `allowMainnet` defaulting to
  `false`, allow-lists, and per-asset amount ceilings compared numerically.
- **Payments** (`payments.js`) — payment request and receipt messages, `matchReceipt` with all
  problem codes, a `Payment` state machine whose terminal states cannot be left, and a double
  settlement guard.
- **CLI** (`bin/cob.js`) — `keygen`, `id`, `sign`, `verify`, `inspect`, `request`, `receipt-check`.
- **Example** `examples/two-agents/run.js` — a full dialogue plus five refusals that must happen.
- **CI** — test matrix on Node 22 and 24, a syntax check, and an end-to-end CLI job that asserts a
  tampered envelope, an expired envelope, a mainnet request, and an over-ceiling amount are refused.
- **Documentation** — `docs/architecture.md` (why the layers are shaped this way),
  `docs/security.md` (threat model, including what is *not* mitigated), `docs/glossary.md`.
- **Repository hygiene** — contribution guide, code of conduct, security policy, roadmap, PR and
  issue templates, and this changelog.

### Known gaps

- No transport binding, so two agents cannot actually reach each other over a network yet.
- No discovery: no `.well-known/cob.json`, no registry.
- Replay protection is a `nonce` field without a cache. **This is the largest known gap.**
- No on-chain settlement. Receipts are structural claims and are not verified against chain state.
- No escrow, no dispute flow, no reputation.

### Notes

- The `Payment` class originally carried a stray TypeScript-shaped `readonly;` field, which was
  removed before the first commit.
- `AgentIdentity.fromSecret` first derived the public key from a JWK containing only `d`. Node
  rejects OKP private JWKs without `x`, so the derivation was rewritten in terms of PKCS#8 DER.
  A test now pins the behaviour.
- `assertPaymentAllowed` initially did not check amount precision, so a USDC invoice could be
  created with seven decimals — an invoice that could never be settled. Fixed, with a test.
- One test was flaky: it built an invalid identifier with `good.replace('-', '+')`, a no-op
  whenever the generated key contained no `-`. Now deterministic.
