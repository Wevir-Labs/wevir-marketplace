# Linear

Connects Wevir to [Linear's hosted MCP server](https://linear.app/docs/mcp) at `https://mcp.linear.app/mcp` (Streamable HTTP). The agent can search and read issues, projects, cycles, documents, labels, teams and users, and create or update issues, projects and comments, with the permissions of the account you sign in with.

Maintained by Wevir. The connector is Linear's own server; this entry only adds the connection settings.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir finds Linear's authorization server from the MCP server itself, registers itself there as a client (OAuth dynamic client registration), and opens Linear's consent page in your browser. Choose the workspace and approve; the page returns to Wevir on your own computer (`127.0.0.1`). Nothing else has to be filled in: no client ID, token or key.

- The access and refresh tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir. To revoke the access in Linear as well, revoke the application in your Linear account's security settings.

## What it asks for

Linear's server asks for `read` and `write` when it answers without a token, and Wevir requests the scope the server names, so the agent can change issues, projects and comments. Linear also offers a read-only endpoint, `https://mcp.linear.app/mcp/readonly`; this entry uses the full one so that it can create and update issues. The agent still asks you before it uses a tool that changes anything.

## What is sent where

Requests go from your computer straight to `mcp.linear.app`. Nothing goes through Wevir. See Linear's [privacy policy](https://linear.app/privacy) and [terms of service](https://linear.app/terms).

## Icon

`icon.svg` is Linear's logo from [Simple Icons](https://simpleicons.org/) (CC0 1.0), on a square in Linear's brand color. The Linear name and logo are trademarks of Linear Orbit, Inc.
