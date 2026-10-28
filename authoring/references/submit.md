# Checks, testing and submitting

## 0. Set up the fork

```bash
gh repo fork Wevir-Labs/wevir-marketplace --clone
cd wevir-marketplace
git checkout -b add-<id>
```

Without the GitHub CLI: fork on github.com, clone the fork, and add the original as a remote with `git remote add upstream https://github.com/Wevir-Labs/wevir-marketplace.git`. `gh repo fork --clone` adds that remote for you. Run `git fetch upstream` before checking or opening the pull request so the comparison is against the current `main`.

## 1. Run the checks

Node 22 or later:

```bash
npm ci
npm test
node scripts/validate.mjs --base upstream/main
```

The last command checks every entry, then compares your branch with `main`: versions must go up, and only `plugins/<id>/` and `skills/<name>/` may change. It prints one line per problem; fix them all and run it again until it prints `✓ … valid.` The same check runs on the pull request.

Also confirm by hand:

```bash
git status --short
git diff --stat upstream/main
```

Only your entry's files should be listed. Remove generated output, test files and `node_modules` from the entry directory before committing.

## 2. Test in Wevir

1. Open Wevir → **Plugins** → **Add** → **Install from file** → **Choose folder**, and pick `plugins/<id>` (or `skills/<name>`). Fill in the inputs it asks for.
2. In a new session, try every example prompt from the manifest and one request of your own. For an MCP server, check that its tools appear and that one call succeeds. For OAuth, sign in from the Plugins page.
3. Edit, then install the same folder again and confirm the upgrade. Keep the version unchanged while testing; raise it only in what you submit.
4. Remove the local copy when done, so it does not clash with the marketplace version later.

If you are an agent and cannot drive Wevir yourself, ask the user to do these steps and report back, or install the folder through Wevir's plugin install tool when it is available in your session. Say in the pull request what was and was not tested.

## 3. Open the pull request

```bash
git add plugins/<id>
git commit -m "Add <name>: <what it does in a few words>"
git push -u origin add-<id>
gh pr create --repo Wevir-Labs/wevir-marketplace --base main --fill
```

Fill in the template: the entry, what it does, what it connects to, how you tested it, and anything a reviewer should look at closely (network access, scripts that run commands, OAuth scopes). Chinese or English are both fine. One pull request per entry is easiest to review.

Open it on GitHub. Pull requests on the CNB and Gitee mirrors are also accepted, but they are reviewed and merged on GitHub, and the mirrors are overwritten from there.

## 4. Review

The maintainers review every new entry and every update. They check:

- commands and URLs match the README, and nothing downloads code at install time;
- package versions are pinned and the packages belong to the people who maintain the server;
- no secrets, telemetry or network access the README does not mention;
- inputs ask only for what is needed, and secrets are marked `secret`;
- the license allows redistribution;
- the examples work and the description says what the entry does.

They may ask for changes in comments: push new commits to the same branch, and the checks run again. They decide the category, featured placement and any verification badge in `catalog/`; entries start without a badge, and `verified` needs a confirmed publisher identity.

## 5. Publishing

Merging into `main` publishes: CI rebuilds and signs the index, and the CNB and Gitee mirrors follow within minutes. Wevir fetches a new index once its copy is over an hour old, and **Refresh** on the Plugins → **Marketplace** tab fetches it at once. Users install the entry from that tab; Wevir checks every file against the signed index before installing.

## 6. Updates

Every change is a new pull request that raises `version` (or `metadata.version` for a single skill), reviewed the same way. Once merged, the new version replaces the old one in the marketplace. Removing an entry is up to the maintainers: ask in an issue or pull request.

If the plugin lives in a repository of your own, you can ask in the pull request for it to be registered as an upstream. A daily job then opens a sync pull request whenever your repository changes, and it is reviewed like any other. Git repositories in Wevir, Claude, Codex or single-skill format can be synced, as can an npm or PyPI package behind a connector. A single-skill repository is listed as a skill in `skills/<name>/`, or, if you want an icon, examples and translations, as a plugin in `plugins/<id>/` with the skill inside it; say which in the pull request. A Claude or Codex plugin that keeps its `SKILL.md` in the repository root works too: the sync moves it to `skills/<name>/`.
