# Contributing to communityofbillions

Thanks for being here. This project is early — that means your opinion still changes the design,
which is the most valuable thing a contributor can offer.

## Ways to help

| You are… | Start here |
| --- | --- |
| Curious | Read [spec/COB-1.md](spec/COB-1.md) and tell us what is confusing. Confusion is a bug. |
| A developer | Look for [`good first issue`](https://github.com/withinaz/communityofbillions/labels/good%20first%20issue). |
| Building an agent framework | Open a discussion. We want to integrate, not compete. |
| A security person | Read [SECURITY.md](SECURITY.md). Adversarial review is wanted. |
| A writer | `docs/` is thin on purpose right now. Help us fix that. |

## Ground rules

1. **Be kind.** See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
2. **One idea per pull request.** A small PR that lands beats a large one that stalls.
3. **Tests or it did not happen.** Behaviour changes need a test in `packages/core/test/`.
4. **Spec changes are separate.** If your change alters the wire format, it needs a spec edit in the same PR,
   and the spec edit goes first in the commit sequence.
5. **No new runtime dependencies in `packages/core`.** The zero-dependency property is a feature.
   Dev-only dependencies are fine if they earn their place.

## Development

```bash
git clone https://github.com/withinaz/communityofbillions.git
cd communityofbillions

# There is nothing to install for the core package.
node --test packages/core/test/

# Try the CLI
node packages/core/bin/cob.js --help
```

There is no build step. The core is plain ESM JavaScript running on Node ≥ 22.

## Commit style

We use short, imperative subjects with a scope:

```
core: reject envelopes whose `to` does not match the receiver
spec: clarify that `amount` is a decimal string, never a number
docs: add a diagram of the settlement handshake
```

If a commit fixes something that was previously wrong, say so plainly in the body.
We keep the history honest: mistakes stay visible, corrections are explicit.
That is more useful to a reader than a polished fiction.

## Pull request checklist

- [ ] `node --test packages/core/test/` passes locally
- [ ] New behaviour is covered by a test
- [ ] Wire-format changes also update `spec/COB-1.md`
- [ ] [JOURNAL.md](JOURNAL.md) entry added if the change is user-visible

## License

By contributing, you agree that code contributions are licensed under [MIT](LICENSE)
and specification contributions (`spec/`) under CC-BY-4.0.
