---
description: Quickly scan the project for actionable performance issues to track and fix.
agent: plan
---

Perform a quick, read-only performance review of the current project.

Optional focus: $ARGUMENTS

Review the existing code, including when the working tree is clean; do not limit
the review to a diff. If a focus is supplied, restrict the scan to that area and
its relevant callers. Do not edit files, apply fixes, create tracker issues, or
change repository state. Return findings in the response for later tracking.

## Review approach

1. Read project instructions and identify the main execution paths. Prioritize
   likely hot paths rather than exhaustively reading every file. Skip generated,
   vendored, and dependency code.
2. Inspect source and relevant callers for material performance issues:
   - algorithmic complexity that grows poorly with realistic input sizes
   - unnecessary allocations, retained data, or unbounded memory growth
   - repeated or unbounded database, filesystem, or network work
   - unnecessarily sequential independent operations
   - avoidable rerenders, expensive render loops, or excessive bundle cost
   - missing batching, pagination, streaming, lazy loading, or caching where justified
3. Confirm each candidate against surrounding code, existing limits, and tests.
   Use existing profiling evidence when available, but do not require profiling,
   install tools, or start a benchmark campaign for this quick scan.
4. Report only actionable, plausibly material issues supported by measurements or
   concrete code evidence. Distinguish measured impact from inferred impact. Do
   not invent timings or speedups, force a finding count, or report speculative
   micro-optimizations. Recommend the smallest safe fix and explain trade-offs;
   verify dependencies and resource limits before suggesting parallelism.

## Output

Start with a short scope summary, including areas inspected and coverage limits.
Then list deduplicated findings in priority order. Make each finding independently
usable as a tracker issue:

- **Title and priority:** High, Medium, or Low, with a brief reason.
- **Location:** File path, symbol, and line range.
- **Evidence and impact:** What the code does, the workload or input condition that makes it costly, and the affected latency, throughput, memory, or bundle size.
  State whether the impact is measured or inferred and note relevant uncertainty.
- **Suggested fix:** The smallest justified change and any trade-offs.
- **Verification:** A concrete test, measurement, or profiling step that would
  confirm the issue and validate the fix without changing behavior.

If no material issues are supported by the evidence, say `No performance findings.`
Retain the scope and limitations; a quick static scan is not proof of performance.
