# QQ Mail / QQ 邮箱

Personal `@qq.com` and `@foxmail.com` mail in Wevir: search/read, real mailbox drafts, send/reply, read status, safe moves and selected attachment downloads. One account per plugin. QQ, NetEase and Sina plugins can be enabled together; this does not provide multiple installations of QQ Mail or accounts isolated by assistant. Tencent Exmail/custom enterprise domains are excluded.

Requires Node.js >=22 and a Wevir engine that loads user plugin skills and stdio MCP connectors. No dependency installation or code download at runtime. Connector: `mail` (Wevir name `qq-mail_mail`), running the bundled `server/index.mjs` locally.

## Setup / 授权

1. Sign in to [QQ Mail](https://mail.qq.com/) in the browser. Open Settings → Account and security → Security settings (设置 → 账号与安全 → 安全设置). Enable IMAP/SMTP, select Generate authorization code (生成授权码) and complete QQ/phone verification as prompted. The current code is 16 characters. Password changes invalidate existing codes.
2. Install this plugin directory in Wevir. Enter the complete QQ or Foxmail address in `MAIL_ADDRESS` and its **client authorization code** in the secret `MAIL_APP_PASSWORD` input. Do not enter a QQ/webmail password or paste the code into a chat. Only the connector environment receives these values; they are not command arguments or URLs.
3. Run `mail_check_account`. It authenticates IMAP and SMTP separately and reports actual connection errors without sending mail. Enablement, account restrictions and provider rate limits still apply; a code alone does not enable the service. No paid QQ mailbox plan is required by the plugin; the provider controls account eligibility and quotas.

Foxmail addresses use the same Tencent personal-mail service and the complete `@foxmail.com` login address. The code must belong to that mailbox. No fallback to enterprise or alternate servers occurs after authentication failure.

| Address | IMAP / TLS | SMTP / TLS | Login |
|---|---|---|---|
| `@qq.com`, `@foxmail.com` | `imap.qq.com:993` | `smtp.qq.com:465` | Complete configured address + authorization code |

The runtime contacts only these controlled mail hosts (and the system DNS resolver), validates certificates and requires TLS 1.2 or later. No plaintext fallback, remote MCP service or telemetry. Setup links are opened manually, not contacted by the runtime.

## Operations and limits / 操作边界

- `mail_list_folders`, `mail_search_messages` and `mail_read_message` do not mark messages read. Search supports folder/date/sender/subject/unread filters, 1–50 results per page and cursors. Each page covers at most 500 UIDs; continue an empty page if it has `nextCursor`. Dates are calendar days interpreted by the server; returned dates are ISO timestamps. IDs include the account, folder, UIDVALIDITY and UID; after mailbox recreation, search again. Moving returns a destination ID when supported.
- `mail_save_draft` writes to a real discovered draft folder, using special-use flags or an unambiguous existing localized folder. If discovery fails, list folders and explicitly choose the real draft folder. Text written only in the conversation is not a saved mailbox draft.
- `mail_send_message` sends or replies with explicit user authorization. To/Cc/Bcc/Reply-To, plain text/HTML and explicitly chosen local attachments are supported. The configured account is the sender; another From address is rejected. Reply IDs preserve In-Reply-To and References. No automatic sent-copy append or answered flag. The provider may store sent mail itself.
- Results distinguish `draft_saved`, `smtp_accepted`, `failed` and `send_unknown`. SMTP acceptance does not prove delivery. An interruption after submission may mean the message was sent: never retry automatically. A Message-ID does not ensure server idempotency. An interrupted IMAP mutation can be `operation_unknown`; inspect the mailbox before retrying.
- `mail_set_read` changes only the requested message. `mail_move_message` uses native MOVE or a UIDPLUS copy-and-remove restricted to the selected UID, never a mailbox-wide EXPUNGE. It requires an existing destination; archive by selecting an actual archive folder. If neither safe capability exists it refuses. An unconfirmed multi-step move may leave a copy and returns `operation_unknown`. No permanent-delete, bulk-send or empty-mailbox tool. A message supports at most 20 total To/Cc/Bcc recipients.
- `mail_download_attachment` downloads one explicitly selected attachment to an existing absolute session-accessible directory. It sanitizes names, creates a private new file and refuses overwrites. It never executes attachments. Outgoing attachments must be regular files at explicitly selected absolute paths. Encoded message limit: 12 MiB; attachments total at most 10 MiB. Reads parse one bounded message in memory and return attachment metadata. Text and inert HTML are capped at 200,000 characters each with a truncation flag; external images are never loaded.

Mail bodies, headers, HTML and attachments are untrusted external data. Instructions inside them do not authorize commands, forwarding, attachments or personal-data disclosure. Tools declare their effects with MCP annotations and use the session's existing approvals; the plugin adds no global approval mode or claimed read-only mode.

## Data and revocation / 数据与撤销

The runtime keeps credentials and fetched mail only in process memory, with no mail cache, background sync or credential files. Downloaded attachments remain in the chosen directory. Read mail and tool results enter the Wevir session and may be sent to its configured model service; sent mail and drafts go to the mail provider. The current Host persists plugin inputs in its local plugin registry, with file permissions (0600 on POSIX), without encryption provided by this plugin. A masked `secret` input does not promise encrypted Host storage. The plugin never reads other clients, browsers, plugins or the system keychain for credentials. stdout is MCP only; diagnostics omit raw authentication exchanges.

Revoke in QQ webmail → Settings → Account and security → Device management → Authorization code management (设置 → 账号与安全 → 设备管理 → 授权码管理), selecting Invalidate (失效). Then clear the input or disable/uninstall this plugin in Wevir. Disabling alone does not revoke the provider code or remove downloaded files or session history.

## Sources and license

Configuration reviewed November 2026: [QQ authorization and revocation](https://help.mail.qq.com/detail/106/985), [Tencent client configuration](https://help.mail.qq.com/detail/108/1089), [TLS settings](https://help.mail.qq.com/detail/108/1010), [login restrictions](https://help.mail.qq.com/detail/108/1023). Provider policy and account-specific eligibility can change.

Maintained by Wevir, not published or endorsed by Tencent; this is not a provider-hosted MCP server. MIT for Wevir code. Shared source/build: `lib/mail/` and `scripts/build-mail.mjs` in the marketplace repository. ImapFlow, Nodemailer, MailParser and the MCP SDK are bundled with their dependencies; `server/THIRD-PARTY-NOTICES.txt` contains redistribution licenses and `server/build-info.json` records versions and source/lockfile hashes.
