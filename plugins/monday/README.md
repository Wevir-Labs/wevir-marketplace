# monday.com

Connects Wevir to [monday.com's hosted MCP server](https://github.com/mondaycom/mcp) at `https://mcp.monday.com/mcp` (Streamable HTTP). The agent can read boards, items and users, create and change items, post updates and set up boards, with the permissions of the account you sign in with.

Maintained by Wevir. The connector is monday.com's own server; this entry only adds the sign-in settings.

## Before you sign in

- **Who can connect.** Admins and members can use the MCP server on every plan. Viewers cannot; guests only on Enterprise accounts whose admin allows it.
- **Account settings.** monday.com turns the MCP server on for accounts by default. If the sign-in or the tools are refused, an account admin should check *Administration → Permissions → AI Connectors*, and install the **monday MCP** app from the monday.com app marketplace if the account does not have it.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir registers itself with monday.com's authorization server at `auth.monday.com` (dynamic client registration), then your browser opens monday.com's consent page. Choose the account and approve; the page returns to a temporary address on `127.0.0.1` on your computer and the sign-in finishes with PKCE. Nothing else has to be filled in: no client ID, no API token.

- The tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir. To revoke access in monday.com as well, remove the app from your account's installed or authorized apps.

## What it can do

- **Read:** find boards and items, read a board's columns and groups, read items and their updates, list users and teams, read forms.
- **Write:** create items and subitems, change column values (status, owner, dates and others), move items between groups, post updates, create boards, groups, columns and forms.
- **Delete:** the server also has tools that delete items and columns. Wevir does not limit them; the agent asks you before it uses any tool that changes or deletes something.

## What it asks for

monday.com's server does not advertise OAuth scopes, so Wevir asks for none and monday.com grants what its MCP app allows: everything your own account can do in monday.com. Use an account whose permissions you are comfortable with the agent using.

## Privacy

Requests go from your computer to monday.com (`mcp.monday.com`, `auth.monday.com`). Wevir does not relay them. See [monday.com's privacy policy](https://monday.com/l/privacy/privacy-policy/) and [terms of service](https://monday.com/l/legal/tos/).

## Icon

`icon.svg` is a simple square drawn for this entry in monday.com's brand colors, not monday.com's logo (Simple Icons has none). It is released with this entry under MIT. The monday.com name is a trademark of monday.com Ltd.
