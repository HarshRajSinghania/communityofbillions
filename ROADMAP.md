# Roadmap

This roadmap is a **commitment device, not a marketing page**. Items move when code lands, not when they are announced.
Anything not in the "Done" section is an intention and may change.

Legend: ✅ done · 🚧 in progress · 🗓 planned · 💭 exploring

---

## Phase 0 — Foundation ✅

- ✅ Public repository, licence, contribution guide, code of conduct, security policy
- ✅ `COB/1` envelope specification (draft 0.1)
- ✅ Ed25519 agent identity, `cob:agent:<base64url(pubkey)>`
- ✅ Canonical JSON serialisation (deterministic key ordering)
- ✅ Sign / verify with expiry and replay protection fields
- ✅ Payment request & receipt message types
- ✅ Chain and asset policy: testnet allow-list, mainnet gated
- ✅ Payment state machine
- ✅ Zero-dependency reference implementation + test suite
- ✅ CLI: `keygen`, `id`, `sign`, `verify`, `request`, `inspect`
- ✅ CI on every push

## Phase 1 — Reachability 🚧

Goal: two agents on two machines, that have never met, can complete one paid task end to end.

- 🚧 Agent registry: `/.well-known/cob.json` discovery document
- 🚧 Reference registry server (read-only, in-memory)
- 🚧 Transport binding: HTTPS POST of a signed envelope
- 🗓 Replay cache with a bounded TTL window
- 🗓 Key rotation & revocation list
- 🗓 Conformance test vectors (JSON) so other languages can validate themselves

## Phase 2 — Settlement 🗓

Goal: the payment in Phase 1 is a real, verifiable testnet transaction.

- 🗓 USDC balance read on Base Sepolia
- 🗓 Transfer construction and broadcast (bring-your-own RPC)
- 🗓 Receipt verification against the original request (amount, asset, payer, payee)
- 🗓 Idempotency: an invoice is payable exactly once
- 🗓 Mainnet support behind an explicit, logged policy switch — **off by default**
- 💭 Gas sponsorship / paymaster research

## Phase 3 — Trust 🗓

Goal: agents can do business without trusting each other.

- 🗓 Escrow message flow: `escrow.open` → `escrow.release` / `escrow.refund`
- 🗓 Dispute window and arbitration hooks
- 🗓 Reputation records as signed, portable attestations (not a central score)
- 🗓 Task offer / bid / award messages

## Phase 4 — Ecosystem 🗓

- 🗓 MCP server exposing `cob_*` tools to any MCP-capable agent
- 🗓 Python SDK
- 🗓 Rust SDK
- 🗓 Interactive documentation site
- 💭 Formal-ish verification of the state machine

---

## Explicitly out of scope

- A hosted, closed service. This is a protocol.
- A token, a sale, or anything resembling a security offering.
- Custodying other people's funds.
- "Autonomous agents that make money" marketing.

## How this roadmap is executed

An automated maintenance agent performs small, real increments on a regular cadence and appends an honest
entry to [JOURNAL.md](JOURNAL.md) each time. It is instructed to prefer *small and verifiable* over *large and
impressive*, and to never mark something done that does not have a test.

Details: [agents/maintenance/README.md](agents/maintenance/README.md).
