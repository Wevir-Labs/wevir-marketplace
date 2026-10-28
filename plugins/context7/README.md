# Context7

Connects Wevir to [Context7's hosted MCP server](https://github.com/upstash/context7) at `https://mcp.context7.com/mcp` (Streamable HTTP). Context7, run by Upstash, indexes the documentation and code examples of public libraries and frameworks. The agent gets two read-only tools:

- `resolve-library-id`: turns a name such as "next.js" or "prisma" into a Context7 library ID.
- `query-docs`: fetches the relevant, current documentation and examples for that library and a question.

Use it when you want code written against a library's current API rather than the model's memory. Mentioning "Context7" or the library in your request helps the agent pick it.

Maintained by Wevir. The connector is Context7's own server; this entry only adds the connection settings.

## No sign-in needed

The server answers without an account, with anonymous rate limits. If you hit them, create a free API key in the [Context7 dashboard](https://context7.com/dashboard) and fill in **API key (optional)** in the plugin's settings. Wevir sends it as `Authorization: Bearer <key>`, the header Context7's documentation gives for its remote server. When the field is empty the header carries no key and the server treats the request as anonymous (checked on 2026-10-28). Free accounts get a monthly call allowance; see [Context7's plans](https://context7.com/plans).

- The key is stored by Wevir on your computer, marked secret, and never shown to the agent.
- To revoke it, delete it in the Context7 dashboard.

## What is sent where

Requests go from your computer straight to `mcp.context7.com`. They contain the library names and the questions the agent asks about them, plus the API key if you set one. Avoid putting confidential code or secrets into such questions. Nothing goes through Wevir. See Context7's [privacy policy](https://context7.com/privacy) and [terms](https://context7.com/terms).

## Icon

`icon.svg` is a simple square drawn for this entry (a "C7" mark), not Context7's official logo.
