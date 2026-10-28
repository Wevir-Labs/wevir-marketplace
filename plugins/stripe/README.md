# Stripe

Connects Wevir to [Stripe's hosted MCP server](https://docs.stripe.com/mcp) at `https://mcp.stripe.com` (Streamable HTTP). The agent can search Stripe's documentation and API reference, read almost anything in the Stripe accounts you grant (payments, customers, products, prices, invoices, subscriptions, balances, disputes), and, with write access, create and change objects through Stripe's API.

Maintained by Wevir. The connector is Stripe's own server; this entry only adds the connection settings.

## This can move real money

Stripe's server gives the agent general tools rather than a fixed list: `stripe_api_read` performs any supported read and `stripe_api_write` performs any supported create, update or delete call. With write access in live mode that includes, among others:

- creating and updating customers, products, prices, coupons, promotion codes and payment links;
- creating, finalizing and voiding invoices, and marking them uncollectible;
- creating, changing and cancelling subscriptions;
- issuing refunds;
- creating Checkout and customer portal sessions, webhook endpoints, and tax settings;
- where your account has Stripe Treasury or money movement enabled, sending money, transferring between balances and converting currency.

Stripe asks a person to approve refunds and outbound payments on a Stripe page before they happen, but invoices, subscriptions and prices change at once.

**Recommended:** on Stripe's consent page, grant a **sandbox** (test mode) account, or give live mode **read** permission only. Grant live write access only if you want the agent to act on real customers and money. The agent still asks you before it uses a tool that changes anything.

## Sign in

Open the plugin in Wevir and choose **Sign in**. Wevir finds Stripe's authorization server from the MCP server itself, registers itself there as a client (OAuth dynamic client registration), and opens Stripe's consent page in your browser. Choose one or more live accounts or sandboxes, set the permissions for each, and approve; the page returns to Wevir on your own computer (`127.0.0.1`). Nothing else has to be filled in: no client ID or API key.

- The access and refresh tokens are stored by the Wevir Host on your computer and are never handed to the agent engine; requests go through a local proxy that adds them.
- Signing out in Wevir removes the tokens from Wevir. To revoke the access in Stripe as well, remove the connected app in the Stripe Dashboard.
- An account administrator can turn MCP access off for the whole account, separately for live mode and sandboxes. If sign-in is refused, ask them.

## What it asks for

Stripe's server offers a single scope, `mcp`; what the agent may do is decided per account and environment on Stripe's consent page, as described above.

## What is sent where

Requests go from your computer straight to `mcp.stripe.com`, which calls Stripe's API on your behalf. Nothing goes through Wevir. See Stripe's [privacy policy](https://stripe.com/privacy) and [services agreement](https://stripe.com/legal/ssa).

## Icon

`icon.svg` is Stripe's logo from [Simple Icons](https://simpleicons.org/) (CC0 1.0), on a square in Stripe's brand color. The Stripe name and logo are trademarks of Stripe, Inc.
