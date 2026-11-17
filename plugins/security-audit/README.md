# Security Audit

Three skills for evidence-based review of authorized local source code and Git history, adapted from [Trail of Bits Skills](https://github.com/trailofbits/skills).

| Skill | Use it for |
| --- | --- |
| `security-audit-diff` | Security regressions in a local commit, branch, diff or uncommitted change; trace the baseline, changed checks and affected callers. |
| `security-audit-defaults` | Fail-open controls, fallback secrets, default credentials, permissive access, exposed debug output and cryptographic misuse. |
| `security-audit-variants` | Other instances of a known root cause, including different APIs and error paths; distinguish guarded look-alikes from findings. |

Each skill is self-contained. There are no connectors, bundled executables, hooks, package runners or installation scripts, and no other skills are required.

## Requirements and use

- Wevir and a model already selected by the user. No additional API key, OAuth app or cloud scanner account is needed.
- Local source access. Git is required for history and differential review; the defaults and variants skills can also review a source directory without `.git`, with that limitation recorded.
- `rg` (ripgrep) is recommended for search. It is optional: the skills can use the agent's file tools or `git grep` for tracked files. No Python or Node runtime is required by the plugin.

Install this directory through Wevir's plugin import. In a session attached to the repository, use a prompt such as:

1. “Review local main...HEAD for security regressions. Trace changed trust boundaries and callers; cite path:line, evidence, trigger conditions and confidence. Do not change files.”
2. “Audit this repository for fail-open defaults. Trace missing, empty and invalid configuration through startup to security decisions; separate reachable issues from uncertain candidates.”
3. “The removed ownership check in this diff was a bug. Find other instances of the same root cause in this local repository, and explain why similar-looking guarded cases are safe.”

Replace `main` with the intended **local** baseline when necessary. For a variant hunt, supply the known bug, its diff or a specific source location. If the seed is unconfirmed, the skill labels it as a hypothesis before expanding the search. A general request to explain code or review formatting does not call for a variant hunt.

## Audit boundaries and output

Read-only is the default: skills inspect files and local history and report in the conversation. They do not edit source or configuration, switch branches, commit, install tools, fetch history, run project code or contact a live target. A current user request can separately authorize a fix, a report file or an isolated reproduction; an audit request alone does not authorize these actions. Missing local history is reported rather than fetched silently.

Every finding must identify the reviewed snapshot and `path:line`, the security invariant, attacker-controlled input or state, the trigger and impact, the source-to-decision evidence, and severity separately from confidence. The report also records rejected candidates, unresolved assumptions, reviewed paths and omissions. Search hits and absent tests are leads or coverage gaps, not automatic vulnerabilities. A negative result is limited to the inspected scope; it is never a claim that the repository is vulnerability-free.

No scanner is required. A scanner may supplement an audit only when the user already has it installed and has authorized local execution with network and uploads disabled. The skills do not install scanners or fall back to a hosted service.

## Data and network

The plugin itself has no network client, telemetry, external endpoint, credential input or persistent storage. The intended audit uses local files and Git objects; upstream and license links are attribution, not runtime downloads. Reports stay in the conversation unless the user requests a file in an authorized location.

Source snippets, Git history and findings enter the agent's context and may be sent to the **user-selected model provider** under Wevir's normal configuration. Local execution does not make model processing offline. The plugin adds no SaaS scanning service, upload step or Wevir-hosted relay.

## Source and license

Source: **Trail of Bits**, [`trailofbits/skills`](https://github.com/trailofbits/skills/tree/711af095215ad4ecde5b90cd1d0124b3f1c4ca9e), fixed commit `711af095215ad4ecde5b90cd1d0124b3f1c4ca9e`.

| Included adaptation | Upstream paths at that commit |
| --- | --- |
| Differential review and local Git guidance | `plugins/differential-review/skills/differential-review/{SKILL.md,methodology.md,reporting.md}` |
| Defaults review and pattern guide | `plugins/insecure-defaults/README.md` and `plugins/insecure-defaults/references/{fail-open-security,fallback-secrets,default-credentials,permissive-access,debug-features,weak-crypto}.md` |
| Variant review and search guide | `plugins/variant-analysis/skills/variant-analysis/SKILL.md` and its `references/{root-cause,triage}.md` |

The adapted instructions, manifest, README and original icon are distributed under **CC-BY-SA-4.0**. [LICENSE](LICENSE) is the upstream license copied unchanged. [NOTICE](NOTICE) records attribution and changes; the selected upstream paths have no separate NOTICE file at this commit.

Adaptations: narrowed the suite to three standalone skills; replaced Claude-specific agents, workflow commands, fixed model choices and cross-plugin dependencies with ordinary local file/Git review; removed mandatory report writes and repository execution; added explicit authorization and data boundaries; separated severity from confidence and coverage gaps; required refutation evidence for look-alikes. Defaults examples were rewritten to avoid treating CORS wildcards, introspection, file modes before umask, or an algorithm name alone as proof of exploitability. No upstream scripts, scanner rules, assets, tests or model integrations are bundled.

These are adapted workflows, not a Trail of Bits audit or certification. Model findings require human review.
