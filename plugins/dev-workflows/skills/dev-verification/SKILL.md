---
name: dev-verification
description: "Check evidence before claiming a fix, feature or task is complete: choose relevant checks, inspect actual results and disclose gaps. Use for completion verification, readiness checks, pre-commit validation, 完成验证, 验收 or a request to confirm tests pass. Apply checks proportional to risk without repeating unchanged successful runs."
license: MIT
---

<!-- Adapted and condensed for Wevir from obra/superpowers, commit 22f0b463e7a5e579904dd6211a520321035526f7: skills/verification-before-completion/SKILL.md. MIT, Copyright (c) 2025 Jesse Vincent; see ../../LICENSE-superpowers. Changes: evidence stays valid until relevant code/environment changes, risk-proportional scope, no mandatory commit/PR action, external skill or delegation. -->

# Verify completion

Tie each completion claim to observed evidence for the final relevant state. Prefer a short accurate report to a broad claim a narrow check cannot support.

## Match claims to checks

Read the requested outcome and applicable repository requirements. Inspect the final change and choose the checks that establish the claimed behavior:

| Claim | Useful evidence | Does not establish it |
|---|---|---|
| Bug fixed | Original reproduction or regression check now succeeds | Code changed or an unrelated test passed |
| Regression test catches the bug | Observed intended failure before the fix, then success | A new test passed once |
| Relevant tests pass | Completed named test run, results and exit status inspected | An old run or a process still running |
| Typecheck or build passes | That command completed successfully | Lint output alone |
| UI behavior works | Targeted interaction in the running app when available | Static typechecking alone |
| Copy/documentation corrected | Direct inspection against the requested text or behavior | Newly invented tests asserting the same text |
| Task complete | Requested outcomes reviewed against checks and remaining gaps | Another agent's success message |

Keep validation proportional. Run required repository checks, plus focused tests for changed logic and appropriate integration checks for affected boundaries. Do not claim the full suite passed after running a subset. Successful checks on the final relevant state remain evidence; repeat only after a relevant code/environment change, a failure, or an unresolved concern. Do not rebuild merely because a report is about to be sent.

## Execute and inspect

1. Inspect the existing commands and intended environment. If exposed, `wevir_workspace_readiness` checks the session project's tools and dependencies. Missing prerequisites are blockers for those checks, not test failures; report them without installing software or switching to a cloud service.
2. Execute checks with the available shell tools. Use `wevir_process_start` for long commands when available, then obtain its completion result and relevant output. Starting a process is not a passing result. Preserve the underlying exit status when piping or filtering output.
3. Read the actual result, including failures, skipped checks and warnings that affect the claim. A zero exit status that reports no tests discovered does not prove test coverage. Optional `lsp_diagnostics` can supplement edited-code checks when available; it does not replace required build or test commands.
4. If something fails, identify whether it concerns the patch or the environment. Fix in-scope defects and re-run affected checks; report unrelated failures encountered by name. Do not silence errors, skip failing cases or relax assertions to make a report green.
5. Inspect the final diff for scope mistakes and leftover diagnostics. If a helper supplied changes, examine its actual diff and verification evidence rather than treating its report as proof. Delegate only where separately authorized.

When execution is unavailable, use static inspection and label the task's executable behavior as unverified. If a check requires a real service, credential, device or permission not available in the session, state precisely which check could not run. Continue independent checks that remain useful.

## Report and hand over

State what changed, the checks or manual steps and their observed outcomes, and any material unverified behavior. Include the command and scope when reporting a pass; include the error or reason when reporting a failure or skipped check. Do not substitute “should work” for a result.

For example: “The expiry boundary is fixed. `node --test token.test.mjs` passed 4 tests. Live issuer integration was not run because the service is unavailable.” Only use counts and results actually observed.

Verification does not grant permission to commit, push, publish, merge or modify external state. Take those steps only when authorized by the task or repository instructions, and do not describe them as completed before they occur.
