# Search the invariant across APIs

Adapted from Trail of Bits variant-analysis root-cause and triage references at commit `711af095215ad4ecde5b90cd1d0124b3f1c4ca9e`. CC-BY-SA-4.0. Examples are reasoning aids, not bundled scanner rules.

## A calibrated search ladder

1. Locate the original vulnerable expression or a distinctive part of it. Confirm the expected seed match in the named snapshot or supplied patch.
2. Replace one seed-specific identifier with the repository's equivalent names; inspect every result.
3. Search other wrappers or APIs that cross the same boundary. Read their argument and return semantics before assuming equivalence.
4. Search alternate failure paths and values that violate the same invariant.
5. Search other authorized modules and relevant local history for copied code or incomplete fixes.

Record patterns, searched paths, actual matches and verdicts at each step. A text match count is not a call graph or a coverage percentage. Use literal search (`rg -n -F -e 'known text' -- path`) first; move to structural or regex searches only when the meaning is clear. Shell-quote search input; never execute it as code. With `git --no-pager -c core.fsmonitor=false grep`, remember that untracked source is excluded.

For history, resolve the local ref to an object ID with `git rev-parse --verify --end-of-options 'REF^{commit}'`. Read files using `git --no-pager show --no-ext-diff --no-textconv 'OID:path/to/file'`; do not switch branches or enable repository-defined diff helpers. Quote the complete object/path argument safely. Missing history remains a reported gap, not a reason to fetch.

## Expansion examples

| Seed root cause | Other manifestations to inspect | Look-alike to refute |
| --- | --- | --- |
| Untrusted input becomes shell syntax | Shell-enabled process APIs, command wrappers, alternate platforms, async paths | A direct argument-vector API with no shell and no separate dangerous option injection |
| Untrusted path escapes an allowed directory | Archive extraction, uploads, template lookup, canonicalization and symlink paths | A confinement check that applies to the final resolved target, including relevant symlink/TOCTOU assumptions |
| Ownership check is missing or has wrong semantics | Sibling resource handlers, bulk APIs, aliases, background jobs, inverse/error branches | An enforced outer authorization layer at the same boundary |
| Nullable IDs accidentally establish ownership | Anonymous users, unowned records, empty IDs, zero/sentinel conversions | Required non-null identity established before equality |
| Validation and use can race | Another read-then-write path, stale cached state, alternate transaction boundaries | Atomic operations or a transaction/lock that actually covers both check and use |

These rows are not an instruction to hunt every vulnerability class. Expand only the user's seed invariant and only where source evidence supports the connection.

## Verdict discipline

- **Confirmed variant:** the root cause, reachable path and attacker control are supported; any deployment assumptions are explicit.
- **Rejected look-alike:** an identified guard or API property excludes the seed trigger. Cite where and explain why; a name such as `safe` is insufficient.
- **Unresolved/latent candidate:** protection or reachability cannot be established. State the exact missing caller, type, configuration or runtime evidence. Do not count it as confirmed.

Severity describes the consequence under the stated preconditions. Confidence describes the strength and limits of the evidence. A severe hypothetical consequence does not make the candidate high-confidence.
