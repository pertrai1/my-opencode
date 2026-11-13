# Verification and validation evidence

Apply this protocol in **every target project** using this OpenCode configuration,
including ordinary lean/build sessions, direct `/apply`, and OpenSpec work. It is
loaded globally from `~/.config/opencode/docs/agents/verification-evidence.md`;
the target does not need to copy this configuration repository's files.
User requirements and applicable target-repository instructions take precedence.

This is the shared evidence minimum, not another workflow, report template, or
permission grant. Keep the existing TDD separation, specialist reviewers,
[`/verify` rubric](../../.agents/docs/verification/README.md), OpenSpec
`verification.md`, and [review-risk rubric](review-risk.md). Put evidence in their
existing sections or the active `progress.md`/`intent.md`, not a parallel ledger.

## Establish the target and the claim

- Identify the target root, affected package or service, and revision or working
  tree snapshot. Never substitute a passing check in the configuration repository
  for a check in the target. Bind each command to its working directory.
- Derive observable acceptance criteria from the user's intent and project
  requirements. Separate **verification** (did the implementation satisfy the
  specification?) from **validation** (does that behavior solve the intended
  problem in a representative use case?). Passing tests alone cannot settle a
  missing requirement or an unconfirmed product decision.
- Read target instructions, manifests, lockfiles, tool configs, CI and existing
  tests before selecting commands. Use the target's language, package manager,
  and test layer, not the harness's npm scripts. A Python, Go, Rust, documentation,
  or infrastructure project need not have `package.json`. In a monorepo, record
  the package scope and affected consumers; a package pass is not a workspace pass.
- Choose checks proportional to behavior and risk. A mechanical documentation
  edit can use a diff/link/format check without TDD or a full report. Behavioral
  slices keep the existing TDD route; high-impact settings or defaults still need
  behavior evidence even when the changed file is configuration.
- Check role/tool permissions and available tooling before promising execution.
  If the appropriate check cannot run in the current role, report it as blocked
  and return it to an authorized owning session or the human. Do not weaken
  permissions, invent a substitute pass, or call a typed project untyped merely
  because the configured worker cannot handle its contracts.

## Evidence in substantive handoffs

Every substantive handoff and completion summary must make these facts findable.
Keep them inline for small work; link to the existing artifact for larger work.

- **Claim and scope:** acceptance criterion, target, revision/snapshot, changed
  public behavior, consumers, and material decisions. Distinguish observations
  from assumptions, including changed defaults and compatibility implications.
- **Checks and outcomes:** exact command or manual procedure, working directory,
  observed exit status (or unknown), and a concise relevant output excerpt or
  durable log reference. Label each required check `passed`, `failed`, `blocked`,
  or `not run`; preserve the existing report's equivalent status vocabulary.
  Name the assertion or scenario that supports each claim, not just a green exit.
- **Limitations:** what the evidence does not establish, missing or skipped
  checks and why, and residual risks. Keep mock/unit, integration, end-to-end,
  replay, and live results distinct. A fake transport accepting a payload does
  not prove the real server honors it; check the actual contract or a suitable
  integration boundary before making that claim.
- **Next decision:** unresolved questions, the smallest recovery or follow-up,
  and who must act. Keep proposed checks distinct from executed ones.

An agent return is a claim. The owning session inspects the evidence and reruns
the required checks within its permissions before advancing a gate. A restricted
reviewer may assess supplied logs without running commands, but must say so.
Never invent exits, infer suite success from partial output, infer a cause from
a timeout alone, or describe a blocked/environment-limited check as passing.
For a failed check, use the observed error to distinguish a confirmed application
failure from an environment restriction or an unresolved cause, and do not infer
that an environment-blocked check would pass elsewhere. Never call verification
fully passing while a required check failed, was skipped, or was blocked.
After edits, recheck affected behavior and update stale evidence; after publishing
an authorized PR, bind CI results to its actual head SHA.

## Challenge tests and assumptions

Use the existing test-quality gate and test reviewer to ask what would disprove
the claimed behavior. Include a relevant failure, boundary, adversarial, or
counterexample scenario, or explain why none applies. Prefer externally observable
outcomes and strong assertions over implementation mirroring, snapshots without
meaning, mock call counts, or coverage percentages alone.

For behavioral TDD, retain the observed RED failure for the intended reason and
GREEN result; harness/import failures are not behavioral RED. Consider whether a
plausible broken implementation would still pass. Use a focused negative control
or mutation when useful and safe, without broadening the task or requiring a
mutation framework. Do not change protected tests/contracts to make GREEN pass.

## Human review proportional to risk

Use the existing review-risk rubric and specialist selection, not a second risk
score. For substantive review, surface the important decisions, assumptions,
changed defaults, evidence limits, and realistic failure consequences. Ask the
human to decide specific unresolved requirements, consequential tradeoffs, and
acceptance of material verification gaps; do not ask for a vague rubber stamp.
Escalate material ambiguity before implementation or relying on an assumption.
Do not interrupt routine low-risk work for already-resolved decisions.

Preserve existing human approval and archive gates. Approval of a tradeoff or
waiver records who accepted what and why; it does not turn a failed, blocked, or
unrun check into a pass, and does not authorize commit, push, merge, or deployment.
