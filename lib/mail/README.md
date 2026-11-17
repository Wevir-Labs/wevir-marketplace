# Shared mail runtime

QQ, NetEase and Sina use this one local stdio MCP runtime. Add provider domains and controlled IMAP/SMTP hosts in `profiles.mjs`; keep endpoints out of tool arguments and user inputs. Authentication uses the complete `MAIL_ADDRESS` and client authorization code `MAIL_APP_PASSWORD`, passed only in connector environment variables. `MAIL_PROVIDER` is the plugin ID. One account per plugin; connectors are namespaced by Wevir. Future `icloud-mail`, `yahoo-mail`, `gmail`, `zoho-mail` and `fastmail` entries should extend this runtime and their actual authentication requirements, not fork it.

`tools.mjs` defines nine tools and validates arguments: account check, list folders, search, read, save draft, send/reply, set read status, move, download one selected attachment. `service.mjs` uses ImapFlow, Nodemailer SMTPConnection/MailComposer and MailParser. `index.mjs` runs the official MCP SDK over stdio. No manual protocol or MIME implementation, background sync, telemetry, remote MCP, account discovery, OAuth app or automation.

Reads use EXAMINE and BODY.PEEK; IDs bind the account, folder, UIDVALIDITY and UID. Search uses bounded 500-UID windows and keyset cursors, with at most 50 results per page. A page can be empty while a next cursor exists. Moves use native MOVE, or the library's COPY/STORE/UID EXPUNGE when UIDPLUS permits removal of only the chosen UID; no unbounded EXPUNGE or permanent-delete tool. Servers with neither capability are refused. An unconfirmed multi-step move is `operation_unknown` because a copy may exist. Drafts use special-use discovery or a unique existing localized draft folder; an explicit folder must exist. SMTP accepts up to 20 recipients, without automatic retries or hidden sent-copy/answered writes. An interrupted submission is `send_unknown`. An interrupted IMAP mutation can be `operation_unknown`. Message-ID does not provide idempotency.

Limits: 12 MiB encoded message, 10 MiB total attachments, 200,000 characters each of returned text and inert HTML. Reading parses one bounded message in memory, including its attachments; only metadata is returned. No HTML rendering or remote resource loads. Files are read only from explicitly selected regular local paths; downloads create private, exclusive files in an explicitly selected existing directory. No mailbox cache or credential storage in the runtime. Wevir's existing input persistence is outside this runtime; `secret` masks the field and is not a promise of encrypted storage.

Node >=22. Development dependencies have exact versions in `package.json` and integrity records in `package-lock.json`.

```sh
npm ci
npm run build:mail -- qq-mail netease-mail sina-mail
npm run test:mail
npm test
node scripts/validate.mjs
```

Explicit build IDs regenerate only their `server/` directories. esbuild produces package-local ESM chunks, no install/download step or repository dependency at runtime. `server/build-info.json` records source and lockfile hashes and bundled versions; `THIRD-PARTY-NOTICES.txt` keeps their licenses/notices. Generated server files are committed with source. Protocol fixtures and TLS certificates are test-only, never bundled. `scripts/mail.test.mjs` includes out-of-repository stdio smoke tests. `scripts/test-mail-host.mjs` accepts a source checkout of Wevir for isolated Host installation verification; see its usage in that file. Tests never use personal mailbox accounts.

Provider documentation and authorization/revocation instructions are linked in each plugin README. Official means maintained by Wevir, not endorsed by the mail provider. No claim of multiple installations, assistant-isolated accounts or compatibility with engines that do not load user plugins.
