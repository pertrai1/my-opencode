# Reviewer router baseline

The current metadata-only router was replayed against independently labeled historical commits and explicitly synthetic scenarios. Labels were assigned from the change descriptions and historical diffs before router predictions were recorded. Synthetic scenarios are coverage probes, not observed changes. This small set is diagnostic, not an accuracy estimate for other repositories.

Fixture SHA-256: `3b4d7c0da4f5ce36bf1fa80028c26bf0aceb237ca6a3e165e3c99e05447b3b69`. Each historical case is addressed by its full commit hash; replay derives file status, diff statistics, and summary using the router's current metadata shape. No raw diff is sent to TypeSafe.
Routing questions SHA-256: `11cbfb25fd3557fa23d98f77337644fad90c0f87a14b4c4ddcb673681c20f0ce`.
Policy: select at ≥0.75; include uncertain at ≥0.35 (effective launch threshold 0.35); 3 s timeout, no retries. Models observed: jev-1.13.0.

Completed TypeSafe calls: 10/10. Fallbacks: 0/10. Mean end-to-end time: 278 ms per case (includes failures). Tokens: 10000 input, 1300 output.
Estimated TypeSafe input charge: $0.000420 at the [published jev-1.13.0 rate](https://docs.typesafe.ai/models) of $0.042 per million input tokens (output tokens free); excludes specialist-review costs.

| Reviewer | Missed / positive | Unnecessary / negative |
| --- | ---: | ---: |
| architecture-boundary-reviewer | 2/3 | 1/7 |
| performance-reviewer | 1/1 | 1/8 |
| production-readiness-reviewer | 2/4 | 1/5 |
| test-reviewer | 1/7 | 0/2 |
| security-audit-reviewer | 0/3 | 1/6 |
| frontend-a11y-reviewer | 0/1 | 0/9 |

Disputed reviewer labels are excluded from their corresponding denominators. Fallback cases have no predictions and are excluded from all accuracy denominators; the /code-review command would apply its manual rules in that situation. A zero denominator means this fixture set cannot assess that category.

| Case | Kind | Expected | Disputed | Selected | Time (ms) | Status |
| --- | --- | --- | --- | --- | ---: | --- |
| architecture-docs | commit `144edfe` | none | none | none | 593 | typesafe |
| complexity-analyzer | commit `c64e66b` | performance-reviewer, test-reviewer | none | test-reviewer | 229 | typesafe |
| explore-safety-policy | commit `97c6131` | security-audit-reviewer, production-readiness-reviewer, test-reviewer | none | architecture-boundary-reviewer, production-readiness-reviewer, test-reviewer, security-audit-reviewer | 219 | typesafe |
| sonarqube-integration | commit `e41076d` | architecture-boundary-reviewer, production-readiness-reviewer, security-audit-reviewer, test-reviewer | none | architecture-boundary-reviewer, performance-reviewer, production-readiness-reviewer, test-reviewer, security-audit-reviewer | 225 | typesafe |
| remove-secret-scan | commit `3cef9fc` | architecture-boundary-reviewer, production-readiness-reviewer, security-audit-reviewer, test-reviewer | none | security-audit-reviewer | 263 | typesafe |
| graph-status-removal | commit `fcfa992` | test-reviewer | none | test-reviewer | 362 | typesafe |
| router-introduction | commit `873d3d7` | architecture-boundary-reviewer, production-readiness-reviewer, test-reviewer | none | test-reviewer | 154 | typesafe |
| angular-skill-docs | commit `9d20004` | none | none | none | 197 | typesafe |
| frontend-form | synthetic | frontend-a11y-reviewer, test-reviewer | none | production-readiness-reviewer, test-reviewer, security-audit-reviewer, frontend-a11y-reviewer | 153 | typesafe |
| ambiguous-server-handler | synthetic | none | security-audit-reviewer, test-reviewer, performance-reviewer, production-readiness-reviewer | performance-reviewer, production-readiness-reviewer, test-reviewer | 385 | typesafe |

## Label rationale

- **architecture-docs:** Adds an architecture description without changing code or a user interface.
- **complexity-analyzer:** Adds data-processing code for a complexity analyzer and changes executable command behavior without analyzer tests.
- **explore-safety-policy:** Changes the plugin's command and read boundary, with new tests on a critical runtime path.
- **sonarqube-integration:** Adds an external-service plugin and changes secret-scanning behavior, configuration wiring, and tests.
- **remove-secret-scan:** Removes a security-control plugin, its integration configuration, and its tests.
- **graph-status-removal:** Removes observable plugin behavior on session creation without a corresponding test change.
- **router-introduction:** Adds TypeSafe as an external reviewer-routing integration and changes the code-review command.
- **angular-skill-docs:** Adds instructions about Angular UI development, not a browser-facing interface.
- **frontend-form:** Hypothetical browser-facing form interaction and its tests; no security or backend changes are stipulated.
- **ambiguous-server-handler:** Metadata alone cannot tell whether this hypothetical handler change alters authorization, hot-path behavior, or only a comment; disputed labels are excluded from accuracy totals.

## Recommendation

Inspect the misses and unnecessary selections above before changing routing policy. Validate on additional labeled changes from target repositories, especially real browser-facing work, before tuning reviewer-specific thresholds or expanding metadata sent to TypeSafe.

Reproduce from this repository: `node scripts/baseline-reviewer-router.mjs > docs/reviewer-router-baseline.md`. The output is a snapshot; reruns can change with the model alias, service conditions, or the question definitions. Use the recorded commit hashes, fixture digest, question digest, and resolved model when comparing runs. Review label changes before comparing new runs to this snapshot.
