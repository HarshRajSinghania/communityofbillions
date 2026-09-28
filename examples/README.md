# Examples

Runnable code. Every example here is expected to work on a clean checkout with no `npm install`,
because `packages/core` has no dependencies.

## `two-agents/run.js`

Two agents, one paid task.

```bash
node examples/two-agents/run.js
```

What it shows:

1. **Handshake.** Bob announces itself with a signed `cob.presence`. Alice verifies it.
2. **Work.** Alice asks Bob to translate something, with a signed `cob.message`.
3. **Price.** Bob replies with a `cob.payment.request` for 2.50 USDC on Base Sepolia.
4. **Settlement.** Alice "pays" and sends a `cob.payment.receipt`; the payment reaches `settled`.
5. **Five refusals.** A tampered invoice, a replayed receipt, an underpayment, a mainnet invoice
   under the default policy, and an amount finer than USDC can represent.
6. **A memo that tries to give orders.** It stays data.

The script exits non-zero if any expected refusal is not refused, so it doubles as an end-to-end
test. CI runs it on every push.

> **What it does not do:** contact a chain. Settlement is simulated with a well-formed transaction
> hash. Receipt verification against chain state is Phase 2 — see
> [`ROADMAP.md`](../ROADMAP.md). Do not read this example as evidence that the money moved.

## Writing your own

```js
import {
  AgentIdentity,
  createEnvelope,
  verifyEnvelope,
} from '../../packages/core/src/index.js';

const me = AgentIdentity.generate();
const you = AgentIdentity.generate();

const envelope = createEnvelope({
  identity: me,
  to: you.id,
  type: 'cob.message',
  body: { anything: 'you like' },
});

verifyEnvelope(envelope, { expectTo: you.id });   // throws if anything is wrong
```

Nothing else is required to speak COB/1.
