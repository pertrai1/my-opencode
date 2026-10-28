# Socratic code mentor evaluation

Question: given a situation, does the model, following
[`skills/socratic-code-mentor/SKILL.md`](../../skills/socratic-code-mentor/SKILL.md),
write the right next message?

Six synthetic scenarios in `cases.yaml` cover: the one-question mode prompt for a
new project, hint 1 for a known idea, hint 5 on a stuck signal, hint 5 on "do it for
me", the single bonus-round offer at the finish line, and not repeating the offer
after a "no". The prompt reads the actual skill body on each run. Only the situation
and user message are sent; the check name is not.

`checks.mjs` holds objective, text-only rules (phrase present, code fence present or
absent, word limits). They do not judge teaching quality, tone, plain-English style or
the no-analogy rule; review live outputs for those.

```sh
npm run eval:mentor            # live: six requests to openai:chat:gpt-4o, needs OPENAI_API_KEY and authorization
npm run eval:mentor:calibrate  # offline: hand-authored good candidates through the real assertion
node --test tests/socratic-code-mentor-eval.test.mjs  # wrong candidates must fail each check
```

Results are saved to `.promptfoo/mentor.json` and `.promptfoo/mentor.html`. Calibration
checks wiring and grader behavior only, not model quality. This is a text-only
evaluation with no tools, so it does not test running tests or reading `git diff`.
