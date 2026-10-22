---
name: wevir-plugin-author
description: "Build a plugin or skill for the Wevir marketplace (Wevir-Labs/wevir-marketplace) and submit it for review: choose between a plugin package and a single skill, write wevir-plugin.json, SKILL.md, README and icon, add MCP servers with inputs or OAuth, run the repository's validation, test the package in Wevir, then open a pull request and wait for the maintainers. Use when asked to make, port, update or publish a Wevir plugin, Wevir skill or marketplace entry, or to bring a Claude Code / Codex plugin or an MCP server to Wevir."
metadata:
  version: "1.0.0"
---

# Wevir plugin author

You are helping someone publish to the Wevir marketplace. Everything Wevir installs lives in this repository: an entry is one directory, `plugins/<id>/` or `skills/<name>/`, reviewed by the maintainers in a pull request and published when it is merged. Your job ends when the pull request is open and its checks pass. Merging, the category, featured placement and verification badges are the maintainers' decisions.

Read the reference that matches the step you are on:

- [references/manifest.md](references/manifest.md): every `wevir-plugin.json` field, MCP servers, inputs, placeholders, OAuth, limits.
- [references/skills.md](references/skills.md): writing a SKILL.md that triggers and works, bundling scripts.
- [references/submit.md](references/submit.md): checks, testing in Wevir, the pull request, review, publishing and updates.

## Workflow

1. **Pin down the entry.** Ask what it should do, who uses it, what it connects to (an API, a hosted MCP server, local files, nothing), what keys or sign-in it needs, and its license. If the user already has code (a Claude Code or Codex plugin, an MCP server package, a skill folder), read it before designing anything.
2. **Choose the kind.**
   - `skills/<name>/`: one skill with no MCP server. The store listing shows only the SKILL.md `name` and `description`: no icon, examples or translations.
   - `plugins/<id>/`: anything else. One or more skills, one or more MCP servers, or both, with an icon, example prompts, translated text and inputs. A single skill that deserves a proper store page is also a plugin.
3. **Pick the id.** Lowercase letters, digits and single hyphens, at most 64 characters, not starting with `wevir`, equal to the directory name, and unused by any entry under `plugins/` or `skills/`. It never changes after publishing, so name the thing, not the version or the author.
4. **Write the entry** in its directory only. A plugin needs `wevir-plugin.json` and `README.md`; add `skills/<name>/SKILL.md`, an icon and any server or script files. Start from the examples in the references and the existing entries in `plugins/` (`slides` and `docs` are skill plugins with bundled scripts; `github` and `slack` are hosted MCP servers with OAuth).
5. **Validate** with the commands in [references/submit.md](references/submit.md#1-run-the-checks) and fix every problem it prints.
6. **Test in Wevir.** Install the directory in Wevir (Plugins → Add → Install from file → Choose folder), fill the inputs, and run each example prompt in a new session. Fix and reinstall until it works. Tell the user what you tried and what happened; do not claim it works if you could not run it.
7. **Submit.** Commit on a branch of the user's fork, push, and open a pull request against `main` of `Wevir-Labs/wevir-marketplace` with the template filled in. Then stop: report the link and that the maintainers will review it. Answer review comments with new commits on the same branch.

## Rules the checks and the review enforce

- **Only your directory.** A pull request may add or change only its own entries. `catalog/`, `schemas/`, `scripts/`, workflows and the READMEs are for maintainers, and CI rejects changes to them.
- **Self-contained.** Every file the entry needs is inside its directory. No references to other repositories, no submodules, no symbolic links, and nothing downloaded or installed when the user installs it (no `npm install` step, no postinstall).
- **Pinned packages.** An MCP server started through a package runner names an exact version: `npx -y pkg@1.2.3`, `uvx pkg==1.2.3`, `pnpm dlx`, `bunx`, `pipx run`. No `@latest`, no ranges, no unversioned names.
- **No secrets.** Keys, tokens and passwords come from the user through `inputs` marked `secret`. CI scans every file for common key formats.
- **Version goes up.** Raise `version` in `wevir-plugin.json` with every change after the first release (`metadata.version` in a single skill's SKILL.md).
- **Limits.** At most 200 files, 1 MiB per file and 8 MiB per entry; the icon at most 128 KiB, `.png` or `.svg`. No `.DS_Store`.
- **Honest README.** It says what the entry does, every service or host it contacts, what it stores, which keys it needs and how to get them, and what must be installed (Node, Python, a browser). Reviewers compare commands and URLs in the files against it.
- **License.** Name it in `license` (SPDX) and keep the license and notice files of any code you include. Copied code must allow redistribution.

## Porting from other formats

- **Claude Code / Codex plugin:** Wevir installs only its skills and MCP servers; commands, agents, hooks, output styles and apps are dropped. Write a `wevir-plugin.json`, move the skills under `skills/`, convert `.mcp.json` entries to `connectors`, and replace `${CLAUDE_PLUGIN_ROOT}` or `${PLUGIN_ROOT}` with `${pluginDir}`. Turn environment variables the user had to set into `inputs`.
- **An MCP server on npm or PyPI:** a plugin with one stdio connector pinned to the current version, and a skill only if it adds guidance the tool descriptions lack.
- **A hosted MCP server:** one `http` connector. If it signs in with OAuth, Wevir discovers it and handles the login (see the OAuth section of the manifest reference); do not ask for a token the server would issue through OAuth.
- **Someone else's project:** only with a license that allows redistribution, credited in the README. If the author keeps it in their own repository, mention in the pull request that the maintainers can register it as an upstream, so a daily job proposes updates.

## Done means

- `node scripts/validate.mjs --base <upstream>/main` passes and `git diff --stat <upstream>/main` lists only the entry's files.
- The entry was installed in Wevir and every example prompt was tried, or you told the user plainly which parts you could not test.
- The pull request is open, its checks are green, and the user has the link.
