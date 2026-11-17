# Development workflows / 研发流程

Four independent skills for investigating failures, testing behavior, reviewing a local diff, and checking evidence before reporting completion. Adapted from selected [Superpowers](https://github.com/obra/superpowers) skills and [Anthropic PR Review Toolkit](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit) review guidance.

| Skill | Result | Example |
|---|---|---|
| `dev-systematic-debugging` | Reproduction, supported cause, focused fix and regression check | “This test fails only with the whole suite. Find why and fix it.” |
| `dev-test-driven-development` | A meaningful failing test, minimal implementation, passing checks | “Reject expired tokens using TDD.” |
| `dev-code-review` | Prioritized findings with file locations, triggers and impact | “Review my local changes for bugs and silent failures. Do not edit.” |
| `dev-verification` | Completion claims tied to checks on the final change | “Check whether this fix is ready and report what remains unverified.” |

The skills run independently. There is no startup hook, mandatory plan approval, automatic agent delegation, or required sequence of all four skills. Documentation and copy edits usually need direct inspection rather than new tests. Behavioral changes use focused tests; integration, security and data risks justify broader checks. Repository requirements and the user's scope take precedence.

## Requirements and use

- Git on the local machine for diff and history review; a local checkout for the default review workflow. A supplied diff can be reviewed without Git, with its context limits stated.
- The project's own installed runtime, dependencies and test tools for executable checks. This plugin bundles no server, executable scripts or test framework and does not install missing tools.
- Wevir's available file and shell tools. Optional integrations use the actual tools `wevir_workspace_readiness`, `wevir_process_start`, `lsp_diagnostics` and `wevir_report_findings` when exposed in the current session. Their absence does not prevent a shell-based workflow.

Install the plugin folder from Wevir's Plugins page, then ask one of the example questions in a project session. Local review inspects staged, unstaged and untracked changes unless a narrower scope is requested. A branch review uses a verified local base reference; it does not fetch or need a hosted pull request. Review requests produce findings without editing files.

## Data, network and storage

No plugin account, API key, OAuth application or Wevir-hosted service is required. Installation downloads no dependencies and runs no hooks. The plugin itself contacts no hosts and adds no telemetry or separate storage.

The skills use local files, Git history and the project's existing commands. Those project commands may write build artifacts, caches or test logs, and may access services according to the project's configuration; inspect them before running and respect the user's constraints. Do not send patches or logs to a hosted review service or silently switch to cloud execution. Keep secrets out of diagnostic output.

The agent uses the model selected in Wevir. Code and logs included in its context are handled by that model/provider's configuration; local command execution does not imply offline model processing. Only task-authorized edits are made, and commit, push or publication are not implied by using a skill.

## Sources and adaptation

These are edited adaptations, not an unchanged upstream bundle or an official release of either source project. The source files are not needed at runtime.

| Source | Fixed commit | Source paths | Included license |
|---|---|---|---|
| [obra/superpowers](https://github.com/obra/superpowers/tree/22f0b463e7a5e579904dd6211a520321035526f7) | `22f0b463e7a5e579904dd6211a520321035526f7` | `skills/systematic-debugging/SKILL.md`, `skills/systematic-debugging/root-cause-tracing.md`, `skills/test-driven-development/SKILL.md`, `skills/test-driven-development/writing-good-tests.md`, `skills/verification-before-completion/SKILL.md` | [MIT, copyright Jesse Vincent](LICENSE-superpowers) |
| [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official/tree/a2e251d9b97b909bf728b3e84fc8d17e6aba0063/plugins/pr-review-toolkit) | `a2e251d9b97b909bf728b3e84fc8d17e6aba0063` | `plugins/pr-review-toolkit/agents/code-reviewer.md`, `agents/pr-test-analyzer.md`, `agents/silent-failure-hunter.md` (all under `plugins/pr-review-toolkit/`) | [The plugin's Apache-2.0 license](LICENSE-pr-review-toolkit) |

Changes: condensed root-cause tracing and red/green testing; combined three review perspectives into one local-diff skill; separated severity from confidence; replaced Claude-specific task/command dependencies and project-specific logging assumptions with the current session's tools and repository conventions. Removed mandatory delegation, blanket planning gates, test-everything rules and destructive instructions to delete pre-existing code. Verification is fresh for the final relevant change and does not repeat successful checks without a reason. New packaging and adaptation material is covered by [LICENSE](LICENSE); upstream terms remain applicable to the derived skills.

## 中文说明

四个独立入口分别用于系统调试、测试驱动开发、本地代码评审和完成验证。按任务选用即可，不附带启动 hook，不强制计划审批或自动多 Agent。文案修改通常直接检查，逻辑修改围绕真实行为编写测试，检查范围依据风险与仓库要求确定。

本地差异评审需要 Git；执行测试需要项目已具备的运行时和依赖。插件不安装软件、不索取新密钥、不连接额外服务，不依赖 GitHub API。所选项目命令可能依自身配置访问网络、产生缓存和日志；模型仍使用 Wevir 当前选择的服务，不能据此宣称模型数据全部离线。

上表记录了固定提交、具体源文件和随包保留的许可。主要适配为移除 Claude 专属命令与 Agent 依赖、合并评审视角、按风险控制测试范围，并避免删除已有代码或重复执行无必要的检查。
