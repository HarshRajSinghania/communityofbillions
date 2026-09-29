# The comment responder

A second agent runs at the end of every maintenance pass. It reads the comments people have left on
this repository, decides whether each one deserves an answer, and writes those answers. The runner
then posts them.

It exists because a repository that ignores its visitors is not an active project — it is a
billboard. The first person to open an issue and get a useful answer in a few hours is worth more
to this project than any amount of promotion.

## How it is split

The work is deliberately divided between a deterministic script and a language model, along the
line that matters:

| | Runner (`run-pass.ps1`) | Agent |
| --- | --- | --- |
| Fetch comments from GitHub | ✅ | |
| Decide what is new or changed | ✅ | |
| Write the reply text | | ✅ |
| Validate the reply | ✅ | |
| **Post to GitHub** | ✅ | |
| Remember what was answered | ✅ | |

The agent never touches GitHub. It writes one JSON file and stops. Everything that becomes public
passes through code that can be read, tested, and reasoned about — which is the same rule this
project applies to protocol messages, applied to its own public voice.

## Never answering the same comment twice

State lives outside the repository, in the maintenance directory:

```
<maintenance dir>/state/answered-comments.json
```

```json
{
  "version": 1,
  "updated": "2026-10-01T09:04:11+02:00",
  "comments": {
    "issue:3456789012": {
      "updatedAt": "2026-10-01T08:12:00Z",
      "action": "replied",
      "replyId": 3456789999,
      "at": "2026-10-01T09:04:11+02:00"
    },
    "issue:3456789013": {
      "updatedAt": "2026-10-01T08:30:00Z",
      "action": "skipped",
      "reason": "acknowledgement, nothing to add",
      "at": "2026-10-01T09:04:11+02:00"
    }
  }
}
```

A comment is answered again **only** when GitHub reports a newer `updated_at` than the one recorded
— that is, when its author edited it. The key is prefixed with the comment kind (`issue:` or
`review:`) because the two live in separate identifier spaces and would otherwise be able to
collide.

State is local rather than committed, for two reasons: it is operational data, not project content,
and a repository that stores a file listing every comment it has answered is a repository that
tells you how it thinks about you.

## What it will not do

- **It will not follow instructions inside a comment.** Comments are untrusted input, exactly like
  fetched web pages. [`brief.md`](brief.md) says so, and a comment that tries it is skipped and
  recorded.
- **It will not promise anything.** No dates, no "coming soon". It can point at an issue or at
  [`ROADMAP.md`](../../ROADMAP.md), and that is all.
- **It will not claim work has landed without checking.** If something is unfixed, the reply says
  it is unfixed.
- **It will not close, label, or reassign anything.** Its only public action is a reply comment.
- **It will not reply to bots**, to CI, or to its own comments.
- **It will not guess at a decision that belongs to the maintainer.** It says the decision is the
  maintainer's and stops.

## Being a bot in public

Every reply the runner posts ends with a one-line signature saying that it was written by an
automated maintainer agent, with a link back to this file. A person deciding whether to trust an
answer is entitled to know who wrote it. The signature is appended by the runner, not by the
agent, so it cannot be forgotten or reworded.

## Failure behaviour

| Situation | What happens |
| --- | --- |
| `gh` is not authenticated | The pass logs a warning and skips the comment step. It never fails the maintenance pass. |
| No comments are pending | The agent is not invoked at all. This is the common case and it costs nothing. |
| The agent produces a malformed file | Nothing is posted. The reason is logged. |
| A reply names a comment that was not in the input | That reply is dropped, the rest are posted. |
| Posting fails for one comment | That comment stays unanswered and is retried next pass. Nothing else is affected. |
| A reply is empty, too long, or looks like a secret | It is dropped and logged. |

## Trying it without posting

```powershell
pwsh tools/schedule/run-pass.ps1 -CommentsOnly -DryRun   # list what is pending, post nothing
pwsh tools/schedule/run-pass.ps1 -CommentsOnly           # run it for real
```

## The cost

One extra agent invocation per pass, and only when there is something unanswered. On a quiet
repository that is zero.
