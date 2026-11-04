---
name: dev-systematic-debugging
description: "Investigate bugs, failing tests, flaky suites, build failures and unexpected behavior by reproducing the symptom and tracing its cause before making a focused fix. Use for debugging, root-cause analysis, 调试, 故障定位, 测试失败 or regressions, especially after an attempted fix failed."
license: MIT
---

<!-- Adapted and condensed for Wevir from obra/superpowers, commit 22f0b463e7a5e579904dd6211a520321035526f7: skills/systematic-debugging/SKILL.md and skills/systematic-debugging/root-cause-tracing.md. MIT, Copyright (c) 2025 Jesse Vincent; see ../../LICENSE-superpowers. Changes: risk-proportional checks, redacted diagnostics, no external skill dependencies or mandatory approval/delegation. -->

# Systematic debugging

Produce an observed reproduction, an evidence-backed cause, the smallest useful fix, and a check of the original symptom. For an investigation-only request, stop at findings and a proposed fix.

## Establish the failure

1. Read applicable repository instructions and the failing command or exact reproduction steps. Inspect the working tree before editing so existing user changes stay intact.
2. Read the complete error and stack trace, including paths, line numbers, environment differences and recent relevant changes. Use the repository's code index when instructed; otherwise search with the available code and file tools.
3. Run the narrowest safe reproduction in the intended environment. Record expected versus observed behavior and the exit result. A missing dependency, denied permission or unavailable service is an environment limitation, not evidence that the implementation is wrong.
4. For flaky failures, record the conditions: ordering, shared files, time, randomness, parallelism or stale state. Compare an isolated run with the failing sequence when useful. Do not hide a race with a fixed sleep or call a single passing rerun a fix.

Use `wevir_workspace_readiness` if available to check the session project's environment. Use `wevir_process_start` for long-running commands when exposed, following its completion/output mechanism. Do not install tools or move execution to a service just because a local tool is missing; report the prerequisite and continue with available evidence.

## Trace the cause

- Start at the failing value or operation and follow callers backward until the first incorrect input, state change or lifecycle assumption is visible. Compare with a working path in the same repository.
- At process, network or storage boundaries, inspect the data shape and relevant configuration presence. If extra instrumentation is needed, keep it narrow and temporary; redact payloads and secrets rather than printing complete environments or credentials.
- State one falsifiable hypothesis: “X causes Y because this trace shows Z.” Choose an experiment that distinguishes it from the next plausible cause, changing one relevant variable at a time.
- Read the experiment's actual result. If it contradicts the hypothesis, revise the explanation before adding another fix. Remove only your own unsuccessful experimental changes; preserve other work.

After several unsuccessful hypotheses, reassess shared state, lifecycle and architectural assumptions instead of accumulating patches. Continue investigation within the authorized scope; ask for a decision only if the required remedy changes that scope or needs missing information.

## Fix and check

1. For a behavioral defect, capture the triggering case with the existing test tools and observe the expected failure before the fix. Use an existing failing test when it already demonstrates the bug. If automation is impractical, record a repeatable manual reproduction and its limitation.
2. Change the source of the wrong behavior. Avoid unrelated refactoring, broad retries, catch-and-default fallbacks, or changing the test to accept the bug. Validate untrusted inputs at the actual boundary, without duplicating checks already guaranteed inside the system.
3. Run the regression check and relevant neighboring checks. Follow mandatory repository validation; expand to integration checks where the changed boundary warrants it. For a copy-only or documentation issue, inspect the result directly rather than creating a test framework.
4. Check for leftover diagnostic edits and accidental changes. Report any remaining failures, including unrelated failures encountered during verification, with evidence rather than silently suppressing them.

Finish with the cause and its evidence, what changed, the commands or manual steps and observed results, and any remaining uncertainty. If the symptom could not be reproduced, say so and separate a suspected cause from a confirmed one.
