# Slack

Connects Wevir to [Slack's hosted MCP server](https://docs.slack.dev/ai/slack-mcp-server/) at `https://mcp.slack.com/mcp`. The agent can search messages and files, read channels, direct messages and threads, read and write canvases and lists, add reactions and post messages, with the permissions of the account you sign in with.

Maintained by Wevir. The connector is Slack's own server; this entry only adds the sign-in settings.

## Availability

Slack only lets Marketplace-listed apps and a workspace's own internal apps use its MCP server. The **Wevir** Slack app is not listed in the Slack Marketplace yet, so Slack may refuse the sign-in in workspaces that have not approved it. If the browser shows that the app cannot be installed or is not allowed, this is why; the entry will work for everyone once the app is listed.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Your browser opens Slack's authorization page for the **Wevir** app; choose the workspace and approve. The page at `https://www.wevir.si/oauth/callback/` hands the result straight back to Wevir on your own computer (it contains no tracking and forwards only to `127.0.0.1`), and the sign-in finishes with PKCE, so no client secret is needed.

- The access token is stored by the Wevir Host on your computer and is never handed to the agent engine; requests go through a local proxy that adds it.
- Slack user tokens do not expire. Signing out in Wevir removes the token from Wevir; to revoke it in Slack as well, remove **Wevir** from the workspace's installed apps.
- Some workspaces require an administrator to approve new apps first.

## What it asks for

Wevir asks for the user scopes Slack's MCP server advertises, such as `search:read.public`, `channels:history`, `chat:write`, `files:write` and `reactions:write`. Everything happens as you, not as a bot. The agent still asks you before it uses a tool that changes anything.

## Privacy

Requests go from your computer to Slack. Wevir does not relay them. See [Slack's privacy policy](https://slack.com/trust/privacy/privacy-policy).
