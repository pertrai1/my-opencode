# Learn guidance examples

[`commands/learn.md`](../../commands/learn.md) owns the pre-write guidance.
`examples.yaml` supplies ten synthetic semantic review cases: useful verified
knowledge, sensitive content, a safe generalization, raw session material,
untrusted instructions, authority changes, unsupported claims, inherited
duplicates, contradictions, and out-of-repository writes.

Run the focused checks offline from the repository root:

```sh
node --require ./evals/failure-reporting/offline.js --test tests/learn-command.test.mjs
```

The tests validate the installed command schema, presence and ordering of the
pre-write guidance, and example structure. Expected decisions and review notes
are hand-authored. Review them separately against the supplied synthetic evidence;
the test does not decide whether a real learning is safe, supported or novel.
No model, judge, credentials, or network calls are used.

These checks do not execute OpenCode, exercise an AGENTS.md writer, prove that
rejected candidates leave files unchanged, or establish model judgment and runtime
enforcement. The command remains instruction-based. For a future separately
authorized model evaluation, reuse the current command body with these cases and
keep measured outputs separate from the hand-authored expectations.
