# GitHub

Connects Wevir to [GitHub's hosted MCP server](https://github.com/github/github-mcp-server) at `https://api.githubcopilot.com/mcp/`. The agent can search code, read and update issues and pull requests, look at Actions runs and logs, and manage repositories, with the permissions of the account you sign in with.

Maintained by Wevir. The connector is GitHub's own server; this entry only adds the sign-in settings.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Your browser opens GitHub's authorization page for the **Wevir** OAuth app. Approve it and the page returns to Wevir. Nothing else has to be filled in: no token, no key.

- The access token is stored by the Wevir Host on your computer and is never handed to the agent engine; requests go through a local proxy that adds it.
- GitHub OAuth tokens do not expire. Signing out in Wevir removes the token from Wevir; to revoke it on GitHub as well, remove **Wevir** under *Settings → Applications → Authorized OAuth Apps*.
- If your organization restricts OAuth apps, an organization owner has to approve **Wevir** once (*Organization settings → Third-party Access*). Until then the organization's private repositories are not visible.

## What it asks for

Wevir requests the scopes GitHub's MCP server advertises: `repo`, `read:org`, `read:user`, `user:email`, `read:packages`, `write:packages`, `read:project`, `project`, `gist` and `notifications`. The agent still asks you before it uses a tool that changes anything.

## About the client secret

`wevir-plugin.json` contains the OAuth app's client ID and client secret. For an app that is distributed to many people the secret cannot stay secret, as GitHub's own documentation for such clients says; the sign-in is protected by PKCE and by the fixed local callback instead. Do not reuse the secret anywhere else.

## Privacy

Requests go from your computer to GitHub. Wevir does not relay them. See [GitHub's privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).
