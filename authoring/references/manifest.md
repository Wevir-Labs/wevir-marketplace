# wevir-plugin.json

The manifest sits at the root of `plugins/<id>/`. The schema is [`schemas/wevir-plugin.schema.json`](../../schemas/wevir-plugin.schema.json); write `"$schema": "../../schemas/wevir-plugin.schema.json"` as the first key for editor completion. Unknown fields are rejected.

## Fields

| Field | Required | Notes |
|---|---|---|
| `schemaVersion` | yes | `1` |
| `id` | yes | Equals the directory name. `[a-z0-9]` and single `-`, at most 64, not starting with `wevir`. Never changes. |
| `name` | yes | Display name, at most 128 characters. |
| `version` | yes | Semver (`1.0.0`). Must go up with every change after the first release. |
| `description` | | At most 1024 characters. The first sentence is what people see in the list: say what it does for them. |
| `author` | | `{ "name": "…", "url": "https://…" }` |
| `homepage` | | http(s) link: your project page or source. |
| `license` | | SPDX expression, such as `MIT` or `Apache-2.0`. |
| `icon` | | `./icon.svg` or `./icon.png` inside the entry, at most 128 KiB. Square; SVG preferred. |
| `skills` | | Directory of skills, default `./skills`. Every folder below it with a `SKILL.md` is one skill. |
| `connectors` | | MCP servers: `{ "<name>": { … } }`, or `"./mcp.json"` pointing to a file of the same shape. See below. |
| `inputs` | | Up to 32 values the user fills in when installing. See below. |
| `category` | | A suggestion from [`catalog/categories.json`](../../catalog/categories.json): `productivity`, `communication`, `creative`, `developer-tools`, `data`, `writing`, `research`, `education`, `business`, `finance`, `health`, `travel`, `entertainment`, `security`, `other`. Maintainers decide the final one. |
| `keywords` | | Up to 16 search terms, 32 characters each. Add the words people in other languages would type. |
| `examples` | | Up to 3 example prompts, 200 characters each. Concrete requests the entry handles well; each one should work when tried. |
| `i18n` | | Translations by language tag: `{ "zh-CN": { "name", "description", "examples" } }`. |
| `privacyPolicy`, `termsOfService` | | http(s) links, expected when the entry sends data to a service. |
| `requires.runtimes` | | What must be installed, such as `["node>=22"]` or `["python>=3.11"]`. Wevir shows it on the entry's page. |

Paths inside the entry start with `./`, use forward slashes and never contain `..`.

## A skill plugin

```json
{
  "$schema": "../../schemas/wevir-plugin.schema.json",
  "schemaVersion": 1,
  "id": "release-notes",
  "name": "Release notes",
  "version": "1.0.0",
  "description": "Write release notes from the commits and merged pull requests since the last tag, grouped by what users will notice.",
  "author": { "name": "Your Name", "url": "https://github.com/you" },
  "homepage": "https://github.com/you/release-notes",
  "license": "MIT",
  "icon": "./icon.svg",
  "category": "developer-tools",
  "keywords": ["changelog", "release", "git", "更新日志"],
  "examples": [
    "Write the release notes for v2.4 from everything merged since v2.3.",
    "Turn this week's commits into a short changelog for our users."
  ],
  "i18n": {
    "zh-CN": {
      "name": "发布说明",
      "description": "根据上一个标签以来的提交与合并的 PR 写发布说明，按用户能感受到的变化分组。",
      "examples": ["根据 v2.3 以来合并的内容写 v2.4 的发布说明。", "把这周的提交整理成给用户看的简短更新日志。"]
    }
  }
}
```

Files: `wevir-plugin.json`, `README.md`, `icon.svg`, `skills/release-notes/SKILL.md`.

## MCP servers (`connectors`)

Each key is the server's name: `[a-z0-9_-]`, at most 63 characters. Inside Wevir it becomes `<plugin id>_<name>`. Common fields: `enabled` (default on at install) and `toolTimeoutSec`.

### stdio: a local process

```json
"connectors": {
  "weather": {
    "transport": "stdio",
    "command": "npx",
    "args": ["-y", "@example/weather-mcp@1.4.2"],
    "env": { "WEATHER_API_KEY": "${input:WEATHER_API_KEY}" }
  }
}
```

Fields: `command`, `args`, `env`, `cwd`. A package runner (`npx`, `bunx`, `pnpm dlx`, `yarn dlx`, `uvx`, `pipx run`) must name an exact version. A server you ship in the entry runs from the install directory:

```json
"tools": {
  "transport": "stdio",
  "command": "node",
  "args": ["${pluginDir}/server/index.mjs"]
}
```

Bundle such a server as plain files with no install step: a single built `.mjs`, or Python using only the standard library. `node_modules` does not fit the limits and is not allowed to be fetched at install time.

### http: a hosted server

```json
"connectors": {
  "notes": {
    "transport": "http",
    "url": "https://mcp.example.com/mcp",
    "headers": { "Authorization": "Bearer ${input:NOTES_TOKEN}" }
  }
}
```

Fields: `url`, `headers`, `auth`, `oauth`. Streamable HTTP only; SSE-only servers are not supported.

### OAuth

When a hosted server uses OAuth, leave out the `Authorization` header and write `"auth": "oauth"` (or nothing: Wevir probes the server and detects it). Wevir discovers the authorization server, registers a client when the server allows dynamic registration, runs the browser login with PKCE, stores and refreshes the tokens, and the user just clicks Sign in. Never ask users to paste a token the server would issue through OAuth.

If the provider requires a registered client, add `oauth`:

| Field | Notes |
|---|---|
| `clientId` | The registered client id, or `${input:KEY}` to let each user bring their own. |
| `clientSecret` | Only for a client the provider documents as public for desktop apps. Anything confidential goes in an input. |
| `scopes` | Ask for the fewest that the tools need; say in the README what is refused without the others. |
| `resource` | Overrides the resource indicator when discovery gets it wrong. |
| `callbackPort`, `callbackUrl` | A fixed loopback port or a registered https relay page, when the provider requires an exact redirect URI. |
| `authorizeParams` | Extra authorization parameters, such as `{ "access_type": "offline" }` for Google. |

`plugins/github` and `plugins/slack` are complete examples. They use OAuth apps registered by Wevir; do not reuse their client ids or Wevir's relay page in your entry.

## Inputs and placeholders

```json
"inputs": [
  { "key": "WEATHER_API_KEY", "label": "API key", "description": "Create one at https://example.com/account/keys", "secret": true, "required": true },
  { "key": "UNITS", "label": "Units", "description": "metric or imperial; metric when empty" }
]
```

- `key`: `[A-Za-z_][A-Za-z0-9_]*`, unique. `label` is what the install dialog shows; `description` says where to get the value.
- `secret: true` for anything sensitive: Wevir masks it and never shows it to the agent.
- `required: true`: the connectors that use it do not start until it is filled. The plugin still installs.

Wevir replaces two placeholders before a server starts:

- `${input:KEY}` in a connector's `args`, `env`, `headers` and `url` (path and query only), and in `oauth.clientId`. The key must be declared in `inputs`; an empty optional input becomes an empty string.
- `${pluginDir}` in a stdio connector's `command`, `args`, `cwd` and `env`: the installed plugin directory. It stays the same across updates.

## Limits and what CI rejects

- More than 200 files, a file over 1 MiB, an entry over 8 MiB, an icon over 128 KiB or not `.png` / `.svg`.
- Symbolic links, special files, `.DS_Store`.
- Text that looks like a key (GitHub, OpenAI, Anthropic, AWS, Slack, Google, private keys).
- An `id` that differs from the directory or is taken; a missing `README.md`; a `${input:KEY}` that is not declared; duplicate input keys; an unknown `category`.
- Unpinned package runners.
- An entry with neither skills nor MCP servers.
- A version that did not go up since `main`.
