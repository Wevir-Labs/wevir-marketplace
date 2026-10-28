# Granola

Connects Wevir to [Granola's hosted MCP server](https://docs.granola.ai/help-center/sharing/integrations/mcp) at `https://mcp.granola.ai/mcp` (Streamable HTTP). The agent can ask questions about your meetings and read your notes, attendees and transcripts, with the access of the account you sign in with.

Maintained by Wevir. The connector is Granola's own server; this entry only adds the sign-in settings.

## Before you sign in

- **Plan limits.** On the free Basic plan the agent can only reach your notes from the last 30 days, and folders, folder filters and raw transcripts need a paid plan. Business plans reach all your personal and public notes.
- **Enterprise workspaces.** An administrator decides which notes MCP clients may reach (*Settings → Workspace → General → Apps & connectors*). If neither note scope is enabled, the sign-in works but the tools are refused. Administrators can also turn off transcripts over MCP or make MCP read-only.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir registers itself with Granola's authorization server at `mcp-auth.granola.ai` (dynamic client registration), then your browser opens Granola's sign-in page. Approve it; the page returns to a temporary address on `127.0.0.1` on your computer and the sign-in finishes with PKCE. Nothing else has to be filled in: Granola has no API key for MCP.

- The tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir.

## What it can do

- **Read:** ask questions across your meeting notes (`query_granola_meetings`), list meetings and folders, read notes, attachments (screenshots of shared screens) and transcripts, show the connected account and its workspaces.
- **Changes:** `switch_workspace` changes the active workspace, also in the Granola app and other connected tools; `sign_out` signs the connection out of Granola. While the workspace allows changes over MCP (on by default), tools can also add notes to or remove them from folders and send feedback to Granola.

The agent still asks you before it uses a tool that changes anything.

## What it asks for

Wevir asks for the single scope Granola's server advertises, `mcp`.

## Privacy

Requests go from your computer to Granola (`mcp.granola.ai`, `mcp-auth.granola.ai`). Wevir does not relay them. Your meeting notes and transcripts are returned to the agent and, through it, to the model provider you use in Wevir. See [Granola's privacy policy](https://docs.granola.ai/help-center/policies/privacy-policy) and [terms of service](https://docs.granola.ai/help-center/policies/terms-of-service/application-terms-of-service).

## Icon

`icon.svg` is a plain notes icon drawn for this entry, not Granola's logo (Simple Icons has none). It is released with this entry under MIT. The Granola name is a trademark of its owner.
