# Frontend Design

Design frontend interfaces with a deliberate visual direction: typography, color, motion, spatial composition and surface details. This plugin keeps the supplied short form of Anthropic's guidance for work **outside an existing brand or design system**. Existing project design rules take precedence.

## Use

Ask for a new interface in ordinary language, or name `frontend-design`. The agent reads the project's instructions and existing UI, chooses a direction, implements the page in the project and checks a local preview when the tools are available.

- “Build a responsive landing page for a small ceramics studio with no existing brand. Use local assets and preview it locally.”
- “Create a standalone HTML portfolio for a documentary photographer, with a bold visual direction and no remote fonts or images.”
- “Design a responsive concert listing for a community jazz venue with no existing design system. Keep all assets local.”

For a follow-up, ask: “Make the typography and spacing work at 375 px while keeping the direction we chose.” For an existing branded project, ask: “Add a settings page using this project's existing components and design tokens.” The skill should follow those rules rather than introduce a new palette or font system.

## Requirements and local preview

This is an instructions-only plugin: no MCP server, bundled executable, package runner or installation-time download. It needs no account, API key, OAuth app or additional cloud service. It uses the model selected for the Wevir session.

A browser is required to inspect the rendered result. Standalone HTML can be opened locally; framework projects need their existing runtime, dependencies and preview command. The plugin does not install missing software. When preview tools or a required runtime are unavailable, the agent reports the limitation. It uses Wevir's available file, shell, preview and browser tools without requiring a specific tool name or model provider.

## Network and data

The plugin adds no remote endpoint, telemetry or storage service. Generated files stay in the project; use local assets and locally available fonts without fetching from font CDNs or image services. A project's own preview may make network requests defined by that project. Instructions and project content used by the agent are processed by the selected model provider under the session's configuration; local file creation and preview do not mean model inference is offline. Normal Wevir session history still applies.

The GitHub links below are provenance references; the skill does not need to fetch them at runtime.

## Source and license

- Original design guidance: **Anthropic**, [anthropics/skills](https://github.com/anthropics/skills).
- Official same-source historical file: [`skills/frontend-design/SKILL.md`](https://github.com/anthropics/skills/blob/00756142ab04c82a447693cf373c4e0c554d1005/skills/frontend-design/SKILL.md), fixed commit `00756142ab04c82a447693cf373c4e0c554d1005` (2025-12-04).
- That specific skill directory carries its own [Apache-2.0 license](https://github.com/anthropics/skills/blob/00756142ab04c82a447693cf373c4e0c554d1005/skills/frontend-design/LICENSE.txt), copied unchanged as [`LICENSE.txt`](LICENSE.txt). See [`NOTICE`](NOTICE) for attribution and changes.

The baseline here is the user-supplied short variant, not a verbatim copy of the official historical file or a replacement with the current upstream version. Its design sections are preserved unchanged. Wevir adaptations replace the platform-specific `user-invocable` frontmatter field with portable license metadata, add a source/change notice and append three bullets covering project rules, available local tools/assets and honest local-preview verification. The manifest, translations, examples, icon and this README are marketplace packaging.

No files were imported from `asgeirtj/system_prompts_leaks`, and its repository-level license is not the basis for redistribution. The official historical skill-specific license above is the basis for the shared Anthropic guidance. This is an adaptation for Wevir, not an official Anthropic integration.
