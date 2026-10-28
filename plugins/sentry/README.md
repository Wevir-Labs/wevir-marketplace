# Sentry

Connects Wevir to [Sentry's hosted MCP server](https://mcp.sentry.dev) at `https://mcp.sentry.dev/mcp` (Streamable HTTP). The agent can search issues, events, errors, traces, logs and releases, read stack traces and event details, look up Sentry's docs, and ask Seer, Sentry's AI debugger, for a root-cause analysis, with the permissions of the account you sign in with. If you allow it, it can also resolve, assign and update issues, and create or change projects, teams, client keys (DSNs) and alert rules.

This works with Sentry's cloud service (sentry.io). Self-hosted Sentry is not covered by this entry.

Maintained by Wevir. The connector is Sentry's own server; this entry only adds the connection settings.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir finds the authorization server from the MCP server itself, registers itself there as a client (OAuth dynamic client registration), and opens Sentry's consent page in your browser. Sign in to Sentry, choose the organization, pick the permissions (below) and approve; the page returns to Wevir on your own computer (`127.0.0.1`). Nothing else has to be filled in: no client ID, token or key.

- The access and refresh tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir. To revoke the access in Sentry as well, revoke it in the authorized applications of your Sentry user settings.

## What it asks for

Sentry's server decides the permissions from the "skills" you tick on its consent page, not from a scope list sent by Wevir:

| Skill | What it allows | Sentry permissions |
|---|---|---|
| Inspect Issues & Events | read issues, events, traces, logs, releases | read only |
| Seer | root-cause analysis | read only |
| Documentation | search Sentry's docs | none |
| Triage Issues | resolve, assign and update issues | `event:write` |
| Manage Projects & Teams | create and change projects, teams, DSNs, alert rules | `project:write`, `team:write`, `alerts:write` |

For read-only use, leave **Triage Issues** and **Manage Projects & Teams** unticked. The agent still asks you before it uses a tool that changes anything.

A Seer analysis can take a few minutes, so the tool timeout is raised to 300 seconds.

## What is sent where

Requests go from your computer to `mcp.sentry.dev`, which calls Sentry's API for you. Seer sends issue data to the AI models Sentry uses for it. Nothing goes through Wevir. See Sentry's [privacy policy](https://sentry.io/privacy/) and [terms of service](https://sentry.io/terms/).

## Icon

`icon.svg` is Sentry's logo from [Simple Icons](https://simpleicons.org/) (CC0 1.0), on a square in Sentry's brand color. The Sentry name and logo are trademarks of Functional Software, Inc.
