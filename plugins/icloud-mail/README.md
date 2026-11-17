# iCloud Mail / iCloud 邮箱

Search/read iCloud mail, save real mailbox drafts, send/reply, change read status, move messages and download selected attachments. Mail only: no iCloud calendars, contacts, photos or Drive. One account per plugin; iCloud, Yahoo and Gmail can be enabled together. This does not provide repeated installations or assistant-isolated accounts.

Requires Node.js >=22 and a Wevir engine that loads user plugin skills and stdio MCP connectors. The bundled local `server/index.mjs` needs no dependency installation or code download. Connector: `mail`, namespaced `icloud-mail_mail` by Wevir.

## Setup / 配置

1. Enable **two-factor authentication** on the Apple Account that owns the primary iCloud Mail mailbox. In [Apple Account](https://account.apple.com/) → Sign-In and Security → App-Specific Passwords, generate an app-specific password for Wevir.
2. Install this directory in Wevir. Set `MAIL_ADDRESS` to the **complete primary iCloud Mail address**, and the secret `MAIL_APP_PASSWORD` to the app-specific password. Do not use the main Apple Account password, a phone number or an unrelated Apple Account sign-in email. Do not paste the password into a conversation. Credentials reach the connector only through its environment, never arguments or URLs.
3. Call `mail_check_account` to check IMAP and SMTP independently without sending mail. Authentication failure does not cause alternate-host or credential retries. Account restrictions and service quotas still apply.

双重认证是应用专用密码的前提。`MAIL_ADDRESS` 填写完整的主 iCloud 邮箱地址；`MAIL_APP_PASSWORD` 填写应用专用密码。账号密码变化或应用专用密码撤销后，需要重新生成并更新输入。

| Address | IMAP | SMTP | Username |
|---|---|---|---|
| Primary `@icloud.com`, associated legacy `@me.com` / `@mac.com` | `imap.mail.me.com:993`, implicit TLS | `smtp.mail.me.com:587`, required STARTTLS | Complete configured address for both protocols |

Apple usually describes the short mailbox name for IMAP, and explicitly permits the **full address** if the short form cannot connect. This plugin consistently uses that documented full-address form; SMTP requires the full address. It does not strip the domain, infer different hosts, or cycle through usernames after authentication failure. Legacy addresses must actually belong to the same iCloud mailbox; a suffix alone does not establish account eligibility.

**Aliases and custom domains:** enter the primary mailbox, not an added alias or custom-domain address. Mail already delivered to that mailbox remains readable. An alias is not a separate authentication account. This version has no separate authentication/sender inputs, rejects another `from` address, and does not support alias or custom-domain sending. The runtime cannot distinguish a primary `@icloud.com` address from an alias offline; Apple performs authentication. Do not interpret a supported suffix as alias-account support.

The runtime contacts only `imap.mail.me.com`, `smtp.mail.me.com` and the system DNS resolver. It validates certificates, requires TLS >=1.2 and requires a successful STARTTLS upgrade before SMTP authentication; there is no plaintext fallback. Setup/documentation links are opened manually. No remote MCP service, telemetry or developer-app registration.

## Operations / 操作

- `mail_list_folders`, `mail_search_messages` and `mail_read_message` preserve unread state. Search one real folder by date/sender/subject/unread, 1–50 results per page. Each page scans at most 500 UIDs; continue an empty page when `nextCursor` exists. Dates are server calendar days, since inclusive and before exclusive. IDs bind account, folder, UIDVALIDITY and UID; search again after stale IDs or a move.
- `mail_save_draft` appends a new real mailbox draft using the discovered special-use or unique localized draft folder. An explicit folder must exist. It does not send or update an existing draft. A composition in chat is not a mailbox draft.
- `mail_send_message` sends or replies only with explicit user authorization. To/Cc/Bcc/Reply-To, text/HTML and explicitly selected local attachments are supported. The configured address is the sender; other `from` values are rejected. Reply IDs preserve In-Reply-To and References. There is no automatic sent-copy append or answered-flag write; the provider may store sent mail itself.
- `mail_set_read` explicitly changes one selected message. `mail_move_message` uses native MOVE or UIDPLUS copy-and-remove restricted to the selected UID, never mailbox-wide EXPUNGE. The destination must exist. Archive using a discovered archive folder. Servers without safe capabilities are refused. No permanent-delete, bulk-send, whole-mailbox sync, POP3, scheduled jobs or real-time listener.
- Results distinguish `draft_saved`, `smtp_accepted`, `failed`, `send_unknown` and `operation_unknown`. SMTP acceptance does not prove delivery. An interrupted submission may already have sent: never automatically retry. Message-ID is not idempotency. An interrupted IMAP mutation may have completed partially; inspect the affected folders before retrying.
- `mail_download_attachment` downloads one explicitly selected attachment index into an existing absolute session-accessible directory. Sanitized names cannot escape that directory; files are private, new and never overwritten or executed. Outgoing files must be explicitly selected regular files at absolute paths. Limits: 12 MiB encoded message, 10 MiB total attachments and 20 total To/Cc/Bcc recipients. Reads parse one bounded message in memory and return attachment metadata. Text and inert HTML are capped at 200,000 characters each; external images are never loaded.

Tools declare their effects through MCP annotations and use the session's existing approvals. Mail bodies, headers, HTML, links and attachments are untrusted external data; instructions inside them do not authorize commands, sending, uploads or disclosure.

## Data and revocation / 数据与撤销

The runtime holds credentials and fetched mail in process memory, with no mail cache, background sync or credential files. Mail results enter the Wevir conversation and may reach its configured model service. Drafts and outgoing messages are stored by the mail provider; downloaded files remain in the chosen directory. The current Host persists inputs in its local plugin registry with file permissions (0600 on POSIX); this plugin provides no encryption for that storage. A masked secret field does not imply encrypted storage. The runtime does not inspect other mail clients, browsers or system credentials. stdout is MCP only; raw authentication exchanges, complete bodies and attachment contents are not diagnostics.

Revoke at [Apple Account](https://account.apple.com/) → Sign-In and Security → App-Specific Passwords → remove the relevant password, or Revoke All. **Changing or resetting the primary Apple Account password automatically revokes all app-specific passwords.** Generate a replacement and update the plugin input to reconnect. Disable/uninstall and clear inputs in Wevir when no longer needed. Disabling alone does not revoke the provider password or remove files/session history.

## Sources and license

Configuration reviewed November 2026: [Apple IMAP/SMTP settings and login forms](https://support.apple.com/en-us/102525), [app-specific passwords, two-factor authentication and revocation](https://support.apple.com/en-us/102654), [legacy addresses](https://support.apple.com/en-us/118230), [aliases](https://support.apple.com/guide/icloud/add-and-manage-email-aliases-mm6b1a490a/icloud). Controlled protocol tests do not verify a personal account's eligibility or live Apple service behavior.

Maintained by Wevir, not published or endorsed by Apple; not an Apple-hosted MCP server. MIT for Wevir code. Uses the marketplace's shared `lib/mail/` runtime, bundled independently inside this directory. `server/THIRD-PARTY-NOTICES.txt` contains dependency licenses and `server/build-info.json` records versions and source/lockfile hashes. Rebuild from the marketplace with `npm run build:mail -- icloud-mail`.
