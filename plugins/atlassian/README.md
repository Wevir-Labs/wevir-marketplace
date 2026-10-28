# Atlassian (Jira and Confluence)

Connects Wevir to the [Atlassian Rovo MCP server](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/) at `https://mcp.atlassian.com/v2/mcp` (Streamable HTTP). The agent can search and read Jira work items and Confluence pages, and create or update them, with the permissions of the account you sign in with.

Maintained by Wevir. The connector is Atlassian's own server; this entry only adds the sign-in settings.

## Before you sign in

The Rovo MCP server is managed by your Atlassian organization's administrators, in Atlassian Administration under the Rovo MCP server settings. Out of the box it works for every user, but an administrator may have changed that:

- **The server must be allowed for your organization.** If an administrator turned it off or limited it to certain apps or actions, the sign-in or some tools are refused until they allow it.
- **`127.0.0.1` must stay on the allowed domains list.** Atlassian only sends sign-in results to client addresses on that list. `localhost` and `127.0.0.1` are on it by default; if an administrator removed them, they need to add `http://127.0.0.1:*/**` back, or Atlassian refuses the redirect to Wevir.
- **Write actions can be switched off.** If creating or editing fails although you have permission in Jira or Confluence, ask an administrator whether write access is enabled for the MCP server.
- The first sign-in for a site installs the server for that site, so the person doing it needs access to Jira and Confluence there.

MCP calls count against your organization's Rovo usage limits.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir registers itself with Atlassian's authorization server (dynamic client registration), then your browser opens Atlassian's consent page. Choose the site and approve; the page returns to a temporary address on `127.0.0.1` on your computer and the sign-in finishes with PKCE. Nothing else has to be filled in: no client ID, no API token.

- The access and refresh tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir. To revoke access in Atlassian as well, remove the app under *Account settings → Connected apps* at id.atlassian.com.

## What it can do

The v2 server shows the agent a few tools (`atlassianUserInfo`, `getAccessibleAtlassianResources`, `discover`, `executeRead`, `executeWrite`, `executeDestructive`) and runs Atlassian's other tools through them.

- **Read:** search Jira with JQL and Confluence with CQL, search across both with Rovo search, read work items, comments, transitions, changelogs, worklogs, boards and sprints, read spaces, pages, comments and page versions.
- **Write (`executeWrite`):** create, edit and transition Jira work items, add or edit comments and worklogs, link work items, upload attachments; create, update, copy, move, archive and label Confluence pages and add comments.
- **Delete (`executeDestructive`):** off by default on Atlassian's side, and Wevir does not ask for the delete scope, so deleting is refused.

The agent still asks you before it uses a tool that changes anything.

## What it asks for

Atlassian's server advertises scopes for many products. Wevir asks only for those Jira and Confluence need:

`offline_access`, `read:me`, `read:account`, `read:jira:agent-interface`, `search:jira:agent-interface`, `write:jira:agent-interface`, `read:confluence:agent-interface`, `search:confluence:agent-interface`, `write:confluence:agent-interface`, `search:rovo:agent-interface`.

Tools for Jira Service Management, Bitbucket, Loom, Goals, Projects, Assets and Teamwork Graph, and the Jira delete and manage actions, are refused with these scopes. If a tool needs more, Wevir marks the connection as needing more permissions and asks for the extra scopes the next time you sign in.

## Privacy

Requests go from your computer to Atlassian (`mcp.atlassian.com`, `auth.atlassian.com`). Wevir does not relay them. See [Atlassian's privacy policy](https://www.atlassian.com/legal/privacy-policy) and the [Atlassian Customer Agreement](https://www.atlassian.com/legal/atlassian-customer-agreement).

## Icon

`icon.svg` uses the Atlassian logo from [Simple Icons](https://simpleicons.org) (CC0 1.0) on a square in Atlassian blue. The Atlassian, Jira and Confluence names and logos are trademarks of Atlassian.
