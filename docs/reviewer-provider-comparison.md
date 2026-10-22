# Offline reviewer provider comparison

Synthetic adapter/policy tests, not provider quality, calibration, cost, or latency evidence. No provider ranking.

Fixture SHA-256: `a8c7ca945d91a8da12b6c71db9a6578f7f0b010ce070e3a6e494fc412ad9521d`. Mode: `offline-mocked`.

Only each provider's noul probability of yes is used. Shared thresholds are policy reuse, not evidence of equal calibration; choice/score confidence is rejected.

No live calls or spend. Cost estimates apply explicitly illustrative USD-per-million rates to reported synthetic usage only; missing usage is excluded, not free. These are not provider prices or actual spend. Formula: (input tokens × input rate + output tokens × output rate) / 1,000,000.

Both adapters receive identical state and six questions; only provider model selection differs. The request digest on each case excludes that model field.

| Provider | Completed | Raw invalid | Raw errors | Fallbacks | Reported tokens (in/out) | Usage coverage | Synthetic mean ms | Illustrative cost USD |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| jev | 2/5 | 1/5 | 2/5 | 3/5 | 303/0 | 3/5 | 7 | 0.000303 |
| subq | 3/5 | 1/5 | 1/5 | 2/5 | 305/0 | 3/5 | 7 | 0.000305 |

jev illustrative rates (USD/million input/output tokens): 1/2.
subq illustrative rates (USD/million input/output tokens): 1/0.

Common successful cases: 2. Accuracy below uses each provider's successful cases only and excludes disputed labels. Different coverage prevents a fair head-to-head accuracy conclusion. Invalid/error results fall back to manual selection, not another provider; manual selections are not scored.

| Provider | Reviewer | Missed / positive | Unnecessary / negative |
| --- | --- | ---: | ---: |
| jev | architecture-boundary-reviewer | 0/0 | 0/2 |
| jev | performance-reviewer | 0/0 | 0/1 |
| jev | production-readiness-reviewer | 0/0 | 0/2 |
| jev | test-reviewer | 0/1 | 0/1 |
| jev | security-audit-reviewer | 0/0 | 0/2 |
| jev | frontend-a11y-reviewer | 0/1 | 0/1 |
| subq | architecture-boundary-reviewer | 0/0 | 0/3 |
| subq | performance-reviewer | 0/0 | 0/2 |
| subq | production-readiness-reviewer | 0/1 | 0/2 |
| subq | test-reviewer | 0/2 | 0/1 |
| subq | security-audit-reviewer | 0/0 | 0/3 |
| subq | frontend-a11y-reviewer | 1/1 | 0/2 |

| Case | Provider | Status | Input SHA-256 |
| --- | --- | --- | --- |
| docs | jev | ok | `87037b2659bd75457ee4fa3630a517d5f11ded8ba8fee44c88a6a9ddd4cd7504` |
| docs | subq | ok | `87037b2659bd75457ee4fa3630a517d5f11ded8ba8fee44c88a6a9ddd4cd7504` |
| ui-behavior | jev | ok | `20d44e41733d834c264f38e896d6fed13782cd80dfc90cd2a0d80bfb80c28b93` |
| ui-behavior | subq | ok | `20d44e41733d834c264f38e896d6fed13782cd80dfc90cd2a0d80bfb80c28b93` |
| invalid-responses | jev | invalid | `4ef4355916cc88b96d94bca9dfcc321c251f02e2beeb9de264801ed7c9a5b958` |
| invalid-responses | subq | invalid | `4ef4355916cc88b96d94bca9dfcc321c251f02e2beeb9de264801ed7c9a5b958` |
| provider-errors | jev | error | `0e4a48310bf3b8b50545c148c28b65719d3c5be929c6cad90a1692a6a9af9493` |
| provider-errors | subq | error | `0e4a48310bf3b8b50545c148c28b65719d3c5be929c6cad90a1692a6a9af9493` |
| mixed-coverage | jev | error | `00ce5a312ae44a79b60f8d24ad393df1b604912d213477a3d860512c6d70ca22` |
| mixed-coverage | subq | ok | `00ce5a312ae44a79b60f8d24ad393df1b604912d213477a3d860512c6d70ca22` |

Reproduce without credentials or network: `node scripts/compare-reviewer-providers.mjs > docs/reviewer-provider-comparison.md`. All responses, usage, and timings are injected fixtures. No live pilot is implemented or authorized by this report.
