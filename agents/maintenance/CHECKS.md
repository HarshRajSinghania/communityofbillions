# Quality gates

Every maintenance pass must pass all of these before it commits. They are listed separately from
[`pass.md`](pass.md) so that they can be quoted, automated, and argued with.

## Gate 1 — the code parses

```bash
find packages -name '*.js' -not -path '*/node_modules/*' -exec node --check {} \;
```

There is no build step and no dependencies, so a parse error is the only thing a compiler would
otherwise have caught. This gate catches it.

## Gate 2 — the test suite passes

```bash
node --test "packages/core/**/*.test.js"
```

**All of it.** Not "the tests I touched". A pass is not complete because the new tests are green; it
is complete when nothing that was green is red.

## Gate 3 — the example still runs end to end

```bash
node examples/two-agents/run.js
```

This script exits non-zero if any expected refusal is not refused. It is a test, and it is the one
that catches a regression in the *shape* of the protocol rather than in a single function.

## Gate 4 — the spec and the code agree

If a field, a rule, or a message type changed:

- [ ] `spec/COB-1.md` describes the new behaviour.
- [ ] The spec's change log table has a new row.
- [ ] `CHANGELOG.md` records it.
- [ ] A test pins the new behaviour.

A code change that contradicts the spec without editing it is a **failed pass**, even if every test
is green.

## Gate 5 — nothing secret is staged

```bash
git diff --cached --name-only | grep -Ei '\.cob-key\.json$|\.env$|secret|token' && echo FAIL
```

Plus a read of the diff. Automated secret scanning misses the obvious case where somebody writes a
key into a docstring.

## Gate 6 — the diff is understood

Before committing, answer these in the `JOURNAL.md` entry:

- What did I change?
- Why did I believe it was needed?
- What could this break?
- How would I know if it broke?

If the answer to the third is "I do not know", the diff is too big. Split it.

## Gate 7 — the public surface did not narrow silently

Removing an export, tightening an input, or changing an error code is a breaking change even in a
`0.x` project. It is allowed. It is not allowed to be *silent*.

- [ ] `CHANGELOG.md` says what broke.
- [ ] The `JOURNAL.md` entry says what broke and why it was worth it.

## What to do when a gate fails

| Gate | Response |
| --- | --- |
| 1, 2, 3 | Fix it, or `git checkout -- .` and record the attempt in `JOURNAL.md`. Never push red. |
| 4 | Edit the spec. If the spec is wrong, say so in the entry and fix the spec. |
| 5 | Unstage it, rotate the credential if it was ever pushed, and record it. |
| 6 | Split the pass. Push the part you understand. |
| 7 | Write the changelog entry, or reconsider the change. |

## What is explicitly not a gate

- **Coverage percentage.** A target encourages tests that execute code without checking it.
- **Commit count, lines changed, or pass frequency.** Activity is not quality.
- **A green badge on a README.** The badge reflects the workflow; the workflow reflects the gates.
  Keep them honest and the badge follows. Chase the badge and it stops meaning anything.
