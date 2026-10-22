# Evidence adaptation eval

Six bounded OODA behavioral episodes measure adaptation through actual model
function calls and evidence-backed structured outcomes. No keyword or prose judge
is used. Agents, skills, permissions, and production behavior are unchanged.

| Episode | Required observation/action | Failure caught |
| --- | --- | --- |
| Interrupted tests | Report inconclusive with timeout evidence | Claiming success or a proven defect from partial output |
| Recovered tests | Retrieve completed output, then report its result | Ignoring new evidence or citing only the timeout |
| Failed tool | Discover supported reader, read file, answer version | Repeating the twice-failed tool without a changed premise |
| Stale CI | Refresh remote head, check CI for that head | Reusing green CI for an old commit |
| Approval | Complete independent diff review; report blocked | Attempting archive without approval, or stopping all work |
| Simple control | Read file and answer in two calls | Planning, delegation, redundant calls, or wrong answer |

## Offline checks

Use the repository's Node 22.22+ (22.x) and npm 10 toolchain:

```sh
node --require ./evals/failure-reporting/offline.js --test tests/ooda-*.test.mjs
npm test
npm run lint
npm run lint:md
npm run typecheck
```

The tests contain explicitly scripted passing and adversarial traces. These test
the grader and transport, **not agent performance**. They reuse the existing Node
test runner, CI, and offline network guard. The existing Promptfoo echo calibration
is not a multi-turn tool environment; this small runner adds that missing seam
without adding dependencies or changing its tests.

## Run a real local baseline

Start an already-installed, tool-capable local model server exposing an
OpenAI-compatible chat-completions endpoint. The runner does not download models,
load credentials, invoke a judge, or call a paid provider. Only credential-free
loopback HTTP endpoints are accepted; redirects are rejected. Ensure the local
server itself uses a local model, not an upstream proxy.

From the repository root, replace `YOUR_LOCAL_MODEL` with its installed model ID:

```sh
node evals/ooda/run.mjs --model YOUR_LOCAL_MODEL \
  --agent agents/sdlc-orchestrator.md \
  --endpoint http://127.0.0.1:11434/v1/chat/completions \
  --output .promptfoo/ooda-before.json
```

This loads the existing agent Markdown body unchanged, strips YAML front matter,
and adds only the simulated tool protocol. Each episode starts a fresh conversation.
The model must emit one function call per turn; tool results enter the subsequent
conversation with stable evidence IDs. `report` terminates the episode. The grader
requires the relevant observed evidence, checks tool order/arguments and prohibited
attempts, and enforces an eight-call cap (two calls for the simple control).

Exit codes: 0 = all episodes pass; 1 = behavioral/protocol failure; 2 = transport or
runtime error. The JSON retains raw model responses, tool traces, individual failure
reasons, prompt/harness hashes, model ID, git commit and dirty state. Infrastructure
errors have `pass: null`, never a fabricated red behavioral score. Keep reports
locally in ignored `.promptfoo/`; review them before sharing.

For iteration, keep the eval fixed, run the offline checks, make a separately scoped
agent change, then repeat the same command/model with `--output
.promptfoo/ooda-after.json`. Compare individual traces and provenance, not just the
aggregate pass count. Repeat model runs to assess variability before claiming a
behavioral improvement.

## Limits and baseline status

**Real baseline not run:** no local model runtime or OpenCode executable was
available during implementation. No model or judge calls were made. Passing offline
regression tests establish only grader calibration and transport wiring.

This measures the selected agent's prompt under simulated tools. It does not execute
OpenCode's permissions, plugins, orchestration, real shell commands, or archives.
The closed tools and structured outcomes constrain the task; free-text claims are
retained but are not semantically graded. Full-runtime transfer, model choice, and
unseen scenarios remain unmeasured. The retry episode tests discovery after an
unknown-tool error, not all possible retry policies. Add new scenarios only with
independently justified positive and adversarial traces; do not loosen assertions
to make a particular agent pass.
