# Notion

Connects Wevir to [Notion's hosted MCP server](https://developers.notion.com/guides/mcp/overview) at `https://mcp.notion.com/mcp` (Streamable HTTP). The agent can search your workspace, read pages and databases, and create or change pages, with the permissions of the account you sign in with.

Maintained by Wevir. The connector is Notion's own server; this entry only adds the sign-in settings.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir registers itself with Notion's authorization server (dynamic client registration), then your browser opens Notion's consent page. Pick the workspace and approve; the page returns to a temporary address on `127.0.0.1` on your computer and the sign-in finishes with PKCE. Nothing else has to be filled in: no client ID, no token, no integration to create.

- The access and refresh tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir. To revoke access in Notion as well, remove the connection under *Settings → Connections* in Notion.
- Only workspace members can connect; guests are refused. On Enterprise plans an administrator can block MCP clients, which shows up as a policy error.

## What it can do

- **Read:** search pages and databases, fetch a page or database, query data sources and views, list comments and users, look up the connected user and workspace.
- **Write:** create pages and databases, update page content and properties, move and duplicate pages, change database views, add comments, upload files (up to 20 MiB).

Some options depend on your Notion plan: searching connected sources (Slack, Google Drive and others) and unlimited database queries need Business or Enterprise with Notion AI, and a few search filters need Business or Enterprise. Notion reports a notice instead of failing when an option is not available. The agent still asks you before it uses a tool that changes anything.

## What it asks for

Notion's server has a single scope, `default`, and Wevir asks for exactly that. Access is limited to what your account can see in the workspace you chose.

## Privacy

Requests go from your computer to Notion (`mcp.notion.com`). Wevir does not relay them. The content the agent reads or writes is processed by Notion under [Notion's privacy policy](https://www.notion.so/notion/Privacy-Policy-3468d120cf614d4c9014c09f6adc9091) and [terms](https://www.notion.com/terms).

## Icon

`icon.svg` uses the Notion logo from [Simple Icons](https://simpleicons.org) (CC0 1.0). The Notion name and logo are trademarks of Notion Labs, Inc.
