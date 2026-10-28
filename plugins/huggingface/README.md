# Hugging Face

Connects Wevir to [Hugging Face's hosted MCP server](https://huggingface.co/docs/hub/hf-mcp-server) at `https://huggingface.co/mcp` (Streamable HTTP). The agent can search models, datasets, Spaces and papers on the Hugging Face Hub, read model and dataset cards and repository files, search Hugging Face's documentation, and call the community tools (Gradio Spaces) you add in your [Hugging Face MCP settings](https://huggingface.co/settings/mcp).

Maintained by Wevir. The connector is Hugging Face's own server; this entry only adds the connection settings.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir finds Hugging Face's authorization server from the MCP server's metadata, registers itself there as a client (OAuth dynamic client registration), and opens Hugging Face's consent page in your browser. Approve it and the page returns to Wevir on your own computer (`127.0.0.1`). Nothing else has to be filled in: no client ID, token or key.

The server also answers without an account, but with a smaller anonymous tool set; this entry signs in so that your own MCP settings apply.

- The access and refresh tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir. To revoke the access on Hugging Face as well, remove it from the connected applications in your Hugging Face settings.

## What it asks for

Wevir requests only `openid`, `profile` and `read-mcp`: your identity and your MCP settings, which is what the search and read tools need. It leaves out the other scopes the server offers, so these are refused:

- `read-repos`: reading your own private models, datasets and Spaces;
- `contribute-repos`: creating repositories or writing to them;
- `jobs`: running compute Jobs, which are billed to your account;
- `inference-api`: running inference on your behalf.

Which tools and Spaces the agent sees is set on the [MCP settings page](https://huggingface.co/settings/mcp). A Space that runs on your quota (for example image generation on ZeroGPU) may need a scope this entry does not request; it will then report an error. Space tools can take a while, so the tool timeout is raised to 180 seconds.

## What is sent where

Requests go from your computer to `huggingface.co`. Calls to a Gradio Space are run by that Space, which may be hosted by its community author; what you send to it is subject to that Space. Nothing goes through Wevir. See Hugging Face's [privacy policy](https://huggingface.co/privacy) and [terms of service](https://huggingface.co/terms-of-service).

## Icon

`icon.svg` is Hugging Face's logo from [Simple Icons](https://simpleicons.org/) (CC0 1.0), on a square in Hugging Face's brand color. The Hugging Face name and logo are trademarks of Hugging Face, Inc.
