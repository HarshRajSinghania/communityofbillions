## What this changes

<!-- One paragraph. What was wrong or missing, and what this does about it. -->

## Why

<!--
The interesting part. If there was an alternative you rejected, say so and say why.
A reviewer who understands your reasoning will approve a smaller diff faster.
-->

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Wire-format change (spec updated in this PR)
- [ ] Documentation
- [ ] Refactor with no behaviour change

## Verification

<!-- Show the command you ran and the result. -->

```
$ node --test "packages/core/**/*.test.js"
```

## Checklist

- [ ] `node --test "packages/core/**/*.test.js"` passes locally
- [ ] New or changed behaviour is covered by a test
- [ ] No new runtime dependency was added to `packages/core`
- [ ] If the wire format changed, `spec/COB-1.md` was updated in this PR
- [ ] If the change is user-visible, a `JOURNAL.md` entry was added
- [ ] No secret, key, or private address is included in this diff

## Anything still broken

<!--
Be honest. "This leaks memory under load and I have not fixed it" is a useful thing for a
reviewer to know. A PR that claims to be complete and is not costs the reviewer more time.
-->
