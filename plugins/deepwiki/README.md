# DeepWiki

Connects Wevir to [DeepWiki's hosted MCP server](https://docs.devin.ai/work-with-devin/deepwiki-mcp) at `https://mcp.deepwiki.com/mcp` (Streamable HTTP). DeepWiki, made by Cognition (the company behind Devin), generates a wiki for GitHub repositories and answers questions about their code. The agent gets three read-only tools:

- `read_wiki_structure`: the list of wiki topics for a repository.
- `read_wiki_contents`: the wiki pages of a repository.
- `ask_wiki_question`: a question about a repository, answered by DeepWiki from its index of the code.

Name the repository as `owner/repo` in your request.

Maintained by Wevir. The connector is DeepWiki's own server; this entry only adds the connection settings.

## Public repositories only

This entry connects without signing in, so it covers **public GitHub repositories only**, the ones DeepWiki has indexed at [deepwiki.com](https://deepwiki.com). Private repositories need a Devin account and are not available through this entry. A repository DeepWiki has not indexed yet returns an error; opening it once on deepwiki.com asks DeepWiki to index it.

`ask_wiki_question` can take a minute or more, so the tool timeout is raised to 180 seconds.

## What is sent where

Requests go from your computer straight to `mcp.deepwiki.com`. They contain the repository names and the questions the agent asks. Nothing goes through Wevir, and no key or account is involved. See Cognition's [privacy policy](https://cognition.ai/privacy-policy) and [terms of service](https://cognition.ai/terms-of-service).

## Icon

`icon.svg` is a simple square drawn for this entry (an open book), not DeepWiki's official logo.
