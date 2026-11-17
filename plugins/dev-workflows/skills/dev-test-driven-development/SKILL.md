---
name: dev-test-driven-development
description: "Implement features and bug fixes with focused red/green tests that exercise observable behavior and catch real regressions. Use when asked for TDD, test-first development, regression tests, 测试驱动开发 or 回归测试, or when adding nontrivial logic needs a trustworthy behavioral test. Copy-only and documentation edits normally need direct inspection instead."
license: MIT
---

<!-- Adapted and condensed for Wevir from obra/superpowers, commit 22f0b463e7a5e579904dd6211a520321035526f7: skills/test-driven-development/SKILL.md and skills/test-driven-development/writing-good-tests.md. MIT, Copyright (c) 2025 Jesse Vincent; see ../../LICENSE-superpowers. Changes: risk-proportional scope, preserve existing code, no required framework installation, approval gate or external skill dependency. -->

# Test-driven development

Use a failing behavioral check to guide the smallest implementation. A useful test catches a plausible bug in the feature's contract; it does not merely freeze source text or reproduce the implementation's calculation.

## Choose the right check

Read the task, repository instructions, existing code and adjacent tests. Use the project's installed runner and conventions. Inspect scripts before execution; do not assume `npm test` accepts arbitrary arguments. Optional `wevir_workspace_readiness` can check the current session project's prerequisites, and `wevir_process_start` can manage long checks when available.

Match the cost of verification to the risk:

- Copy, documentation and formatting: inspect the changed result and run any required repository checks. Do not add tests just to detect exact wording.
- Logic, state transitions or parsing: add a focused test for the observable contract and relevant boundaries.
- Security, persistence, concurrency or external integrations: include the failure behavior and an appropriate integration check where the project supports it.

Use existing tests if they already expose the failure. When the runtime or test framework is missing, report it without installing software or using cloud execution. A repeatable check using an already available runtime, or a manual reproduction when appropriate, can provide limited evidence; state the limitation. Do not introduce a framework solely for a small change.

## Red: demonstrate the missing behavior

1. Name the behavior and the realistic bug the test should catch. For an expiry check: “a token at or after its expiry is rejected,” rather than “the expiry constant equals a value.”
2. Write the smallest test through the real public boundary. Derive expected results independently with literal values or hand-checked fixtures. Avoid computing both expected and actual values with the same helper.
3. Run it before implementing the change. Confirm an assertion fails because the behavior is absent or wrong. A syntax error, broken import, missing service or incorrect fixture is not the intended red result; correct the setup first.
4. If it already passes, determine whether the behavior exists or the test misses the bug. Tighten the case instead of adding unnecessary implementation.

If implementation already exists, preserve it and other user work. Add the missing behavioral check and, when safe, demonstrate that it catches the old behavior in an isolated copy or by temporarily changing only your own patch. Do not delete code or rewrite history to recreate a test-first chronology; report the sequence honestly.

## Green: implement the behavior

Make the minimal production change that satisfies the contract. Re-run the focused check and inspect its result and exit code. If it fails, distinguish a faulty implementation from a test setup problem; do not weaken a valid assertion to obtain green.

Prefer real components and deterministic data. Fake only the slow, nondeterministic or external boundary that needs isolation. Preserve side effects the test depends on, such as a write subsequently read by duplicate detection. Assert outputs, state or required interactions of the real component, not the mere existence of a mock. Keep test-only cleanup and helpers in test code.

## Refine and verify

Refactor only where this change needs it, with behavior preserved. Run the focused tests after relevant changes, then required repository checks and the related suite. Broaden validation when risk or a failure warrants it; do not repeatedly run a successful unchanged suite for ceremony.

Before finishing, consider one plausible mutation: wrong comparison, missing state update, wrong branch or swallowed error. Would the test fail? If not, improve the behavioral assertion or explain why that behavior is out of scope. Do not add cases solely to increase a coverage number.

Report the behavior implemented, the red result and why it failed, the final green result, any broader checks, and what was not executed. A passing focused test supports that behavior; it does not establish that every test or integration passes.
