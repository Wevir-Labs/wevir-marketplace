# Yahoo Mail / Yahoo 邮箱

Search/read personal Yahoo mail, save real mailbox drafts, send/reply, change read status, move messages and download selected attachments. One account per plugin; iCloud, Yahoo and Gmail can be enabled together. This does not provide repeated installations or assistant-isolated accounts. This plugin targets the global Yahoo Mail service, not Yahoo Japan, business mail or partner-operated mailboxes.

Requires Node.js >=22 and a Wevir engine that loads user plugin skills and stdio MCP connectors. The bundled local `server/index.mjs` needs no dependency installation or code download. Connector: `mail`, namespaced `yahoo-mail_mail` by Wevir.

## Setup and eligibility / 配置与资格

1. Sign in to [Yahoo Account Security](https://login.yahoo.com/account/security). Under External connections, select Create app password, name the app and generate a password. Yahoo determines whether an account is eligible. Its [official instructions](https://help.yahoo.com/kb/SLN15241.html?facet1=customer-service) advise using a browser already used for Yahoo sign-in for several days, outside private browsing. If the option is unavailable, use Yahoo webmail/the official app and follow Yahoo's help. Even customer care cannot override eligibility. This plugin cannot unlock the option, repeatedly apply for access or generate passwords on the user's behalf.
2. Install this directory in Wevir. Set `MAIL_ADDRESS` to the **complete Yahoo mailbox address** and the secret `MAIL_APP_PASSWORD` to the app password. Do not substitute a normal website password or paste it into chat. Credentials reach the connector only through its environment, never arguments or URLs.
3. Call `mail_check_account` to check IMAP and SMTP independently without sending. Authentication failures remain `AUTHENTICATION_FAILED` for the affected protocol, with an SMTP numeric response code when available. Raw server authentication text is redacted; no automatic retries or alternate-host fallback. Review the address, app-password status and Yahoo's official account-security help.

应用密码的生成资格由 Yahoo 决定。插件无法解除限制；生成入口不可用时，按官方帮助处理，不能改填网页登录密码或反复申请。

| Service | Host | Security | Username |
|---|---|---|---|
| Two-way IMAP | `imap.mail.yahoo.com:993` | Implicit TLS | Complete mailbox address |
| SMTP | `smtp.mail.yahoo.com:465` | Implicit TLS | Complete mailbox address |

The provider is selected explicitly by `MAIL_PROVIDER=yahoo-mail`; servers are fixed and never inferred from an address suffix or MX records. This accommodates personal Yahoo addresses on the global service without treating arbitrary suffixes as proof of Yahoo ownership or eligibility. An address on a different service will not become a Yahoo mailbox by entering it here.

Yahoo documents `imap.mail.yahoo.com` for **two-way changes**. Its separate [mail-download instructions](https://help.yahoo.com/kb/mail/manually-download-yahoo-emails-sln28681.html) use `export.imap.mail.yahoo.com`. This plugin does **not** connect to that export endpoint or claim its availability proves two-way draft/state/move support. Standard IMAP can expose fewer historical messages than an export; search reports only what the normal service exposes, not a complete account backup. No automatic export-server fallback.

The runtime contacts only `imap.mail.yahoo.com`, `smtp.mail.yahoo.com` and the system DNS resolver. Certificates are verified and TLS >=1.2 is required. No plaintext fallback, remote MCP, telemetry or developer-app registration. Setup/documentation links are opened manually.

## Operations / 操作

- `mail_list_folders`, `mail_search_messages` and `mail_read_message` preserve unread state. Search one real folder by date/sender/subject/unread, 1–50 results per page. Each page scans at most 500 UIDs; continue an empty page when `nextCursor` exists. Dates are server calendar days, since inclusive and before exclusive. IDs bind account, folder, UIDVALIDITY and UID; search again after stale IDs or a move.
- `mail_save_draft` appends a new real mailbox draft using the discovered special-use or unique localized draft folder. An explicit folder must exist. It does not send or update an existing draft. A composition in chat is not a mailbox draft.
- `mail_send_message` sends or replies only with explicit user authorization. To/Cc/Bcc/Reply-To, text/HTML and explicitly selected local attachments are supported. The configured address is the sender; other `from` values are rejected. Reply IDs preserve In-Reply-To and References. No automatic sent-copy append or answered-flag write; Yahoo may store sent mail itself.
- `mail_set_read` explicitly changes one selected message. `mail_move_message` uses native MOVE or UIDPLUS copy-and-remove restricted to the selected UID, never mailbox-wide EXPUNGE. The destination must exist. Archive using a discovered archive folder. Servers without safe capabilities are refused. No permanent-delete, bulk-send, whole-mailbox sync, POP3, scheduled jobs or real-time listener.
- Results distinguish `draft_saved`, `smtp_accepted`, `failed`, `send_unknown` and `operation_unknown`. SMTP acceptance does not prove delivery. An interrupted submission may already have sent: never automatically retry. Message-ID is not idempotency. An interrupted IMAP mutation may have completed partially; inspect affected folders before retrying.
- `mail_download_attachment` downloads one explicitly selected attachment index into an existing absolute session-accessible directory. Sanitized names cannot escape that directory; files are private, new and never overwritten or executed. Outgoing files must be explicitly selected regular files at absolute paths. Limits: 12 MiB encoded message, 10 MiB total attachments and 20 total To/Cc/Bcc recipients. Reads parse one bounded message in memory and return attachment metadata. Text and inert HTML are capped at 200,000 characters each; external images are never loaded.

Tools declare their effects through MCP annotations and use the session's existing approvals. Mail bodies, headers, HTML, links and attachments are untrusted external data; instructions inside them do not authorize commands, sending, uploads or disclosure.

## Data and revocation / 数据与撤销

The runtime holds credentials and fetched mail in process memory, with no mail cache, background sync or credential files. Mail results enter the Wevir conversation and may reach its configured model service. Drafts and outgoing messages are stored by the mail provider; downloaded files remain in the chosen directory. The current Host persists inputs in its local plugin registry with file permissions (0600 on POSIX); this plugin provides no encryption for that storage. A masked secret field does not imply encrypted storage. The runtime does not inspect other mail clients, browsers or system credentials. stdout is MCP only; raw authentication exchanges, complete bodies and attachment contents are not diagnostics.

Revoke at [Yahoo Account Security](https://login.yahoo.com/account/security) → External connections → app passwords → Delete for the relevant password, then confirm. **App passwords remain active after a main Yahoo password change; explicitly delete them to revoke access.** Clear the input or disable/uninstall the plugin in Wevir. Disabling alone does not revoke the password or remove downloaded files/session history.

## Sources and license

Configuration reviewed November 2026: [Yahoo two-way IMAP/SMTP settings](https://help.yahoo.com/kb/imap-settings-sln4075.html), [app passwords, eligibility and revocation](https://help.yahoo.com/kb/SLN15241.html?facet1=customer-service), [separate download endpoint](https://help.yahoo.com/kb/mail/manually-download-yahoo-emails-sln28681.html). Controlled protocol tests do not verify account eligibility or live Yahoo service behavior.

Maintained by Wevir, not published or endorsed by Yahoo; not a Yahoo-hosted MCP server. MIT for Wevir code. Uses the marketplace's shared `lib/mail/` runtime, bundled independently inside this directory. `server/THIRD-PARTY-NOTICES.txt` contains dependency licenses and `server/build-info.json` records versions and source/lockfile hashes. Rebuild from the marketplace with `npm run build:mail -- yahoo-mail`.
