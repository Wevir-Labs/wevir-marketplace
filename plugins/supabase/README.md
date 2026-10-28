# Supabase

Connects Wevir to [Supabase's hosted MCP server](https://supabase.com/docs/guides/getting-started/mcp) at `https://mcp.supabase.com/mcp?read_only=true` (Streamable HTTP), in Supabase's read-only mode. The agent can list your organizations and projects, list tables, extensions and migrations, run SQL as a read-only Postgres user, read logs, run the security and performance advisors, list edge functions and storage buckets, generate TypeScript types, get a project's URL and publishable keys, and search Supabase's docs.

Maintained by Wevir. The connector is Supabase's own server (marked beta by Supabase); this entry only adds the connection settings.

## Read-only on purpose

`read_only=true` makes the server run every query as a read-only Postgres user and refuse the tools that change things: applying migrations, deploying edge functions, creating, pausing or restoring projects (creating one costs money), creating, merging or deleting branches, and changing storage settings. Supabase itself recommends read-only mode and warns that connecting an AI agent to a database carries risks, such as prompt injection through data stored in it. Use a development project rather than production where you can.

If you need the agent to write, add Supabase's server yourself in Wevir without `?read_only=true`; that is not part of this entry.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir finds Supabase's authorization server from the MCP server itself, registers itself there as a client (OAuth dynamic client registration), and opens Supabase's consent page in your browser. Choose the organization and approve; the page returns to Wevir on your own computer (`127.0.0.1`). Nothing else has to be filled in: no client ID or personal access token.

- The access and refresh tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir. To revoke the access in Supabase as well, remove the authorized app in your Supabase organization settings.

## What it asks for

In read-only mode Supabase's server advertises only read scopes, and Wevir requests those: `organizations:read`, `projects:read`, `database:read`, `analytics:read`, `secrets:read`, `edge_functions:read`, `environment:read` and `storage:read`. `secrets:read` lets the agent read a project's API keys (the server hands out the publishable ones). The consent page lets you pick the organization, not individual scopes.

Some tools, such as SQL over large tables or the advisors, can be slow, so the tool timeout is raised to 120 seconds.

## What is sent where

Requests go from your computer to `mcp.supabase.com`, which calls Supabase's Management API and your project's database for you. Query results, including rows from your tables, go back to the agent and from there to the model you use. Nothing goes through Wevir. See Supabase's [privacy policy](https://supabase.com/privacy) and [terms of service](https://supabase.com/terms).

## Icon

`icon.svg` is Supabase's logo from [Simple Icons](https://simpleicons.org/) (CC0 1.0), on a dark square with Supabase's brand green. The Supabase name and logo are trademarks of Supabase, Inc.
