# Security Policy

## Project status

⚠️ **communityofbillions is pre-1.0, unaudited, and under active development.**

It handles messages that describe money movements. Treat it as a research prototype.
**Do not deploy it on mainnet with real funds.** The default policy refuses mainnet chains for exactly this reason.

## Reporting a vulnerability

Please **do not** open a public issue for a security problem.

Use GitHub's [private vulnerability reporting](https://github.com/withinaz/communityofbillions/security/advisories/new)
on this repository. If that is unavailable to you, contact the maintainer
[@withinaz](https://github.com/withinaz) directly.

Please include:

- what you found, and the impact you believe it has,
- a minimal reproduction (an envelope, a command, a test),
- whether you intend to publish, and on what timeline.

## What to expect

| Stage | Target |
| --- | --- |
| Acknowledgement | 7 days |
| Initial assessment | 14 days |
| Fix or mitigation plan | 30 days |

This is a volunteer project with an automated maintenance agent. Those targets are intentions.
If we miss one, ask again — a missed deadline is not a refusal.

## Scope

In scope:

- Signature bypass or forgery in the `COB/1` envelope
- Canonicalisation ambiguity allowing two different byte streams for the same envelope
- Replay of an envelope past its expiry
- Payment request / receipt confusion (accepting a receipt that does not match its request)
- Any path that lets a mainnet chain be used while the policy says it is disabled
- Key material leaking into logs, output, or committed files

Out of scope (for now):

- Denial of service through volume
- Issues that require a compromised local machine
- Anything in `examples/` that is clearly labelled as a toy

## Hardening already in place

- Envelopes are signed over a canonical JSON serialisation; verification is mandatory on receipt.
- `expires` is required and enforced; absent expiry is a validation failure, not a default.
- Amounts are decimal **strings**, never floating point.
- Unknown `cob` version, chain, or asset → reject (fail closed).
- Secret keys are written with restrictive permissions and matched by `.gitignore` (`*.cob-key.json`).

## Design principle

> A protocol that moves money must be boring at its edges. Every ambiguity is a vulnerability.
