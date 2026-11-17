# Zoho Mail / Zoho 邮箱

Search/read mail, discover folders, save real mailbox drafts, send/reply, change read status, move messages and download selected attachments. One configured account per plugin; Zoho can coexist with other mail plugins. No repeated installation or assistant-isolated accounts. Mail only: no Calendar, Contacts, CRM, administration, whole-mailbox sync, bulk sending, permanent deletion, real-time listening or scheduled jobs.

Requires Node.js >=22 and a Wevir engine that loads user plugin skills and stdio MCP connectors. The self-contained `server/index.mjs` needs no dependency installation or code download at installation or first run. Connector: `mail`, namespaced `zoho-mail_mail` by Wevir. Maintained by Wevir, not published or endorsed by Zoho; no Zoho-hosted MCP server.

## Setup / 配置

1. In Zoho Mail, open **Settings → Mail Accounts → the primary account → IMAP** and enable IMAP Access. Confirm the account permits external IMAP clients. **Newly registered free accounts do not provide IMAP**; availability of the free plan also varies by data center. Organization administrators can prohibit IMAP or restrict client IPs. **Upgrading to paid does not establish that IMAP is enabled or that third-party access is allowed.** This plugin cannot remove these restrictions.
2. Open the account's **Server Configuration Details**. Copy the incoming IMAP hostname and outgoing SMTP hostname exactly into the inputs below. A custom email domain, country or `.com` address does not identify the Zoho data center. Use the hosts displayed for this specific account, including ordinary/pro differences; do not select another region to work around an error.
3. With two-factor authentication, generate an **application-specific password** in Zoho Accounts → Security → Application-Specific Passwords → Generate New Password. Name it for Wevir and enter it without spaces. SAML accounts also require an application-specific password. Federated web sign-in alone is insufficient for IMAP/SMTP; follow Zoho's account/password requirements. Without two-factor authentication, Zoho's documentation allows the account's protocol password in the same secret input; a dedicated app password is preferred where available. This plugin never collects a browser login session or OAuth client secret.
4. Install this folder in Wevir, fill all four inputs, then call `mail_check_account`. It checks IMAP and SMTP separately without sending or changing mail. Do not paste credentials into chat or write them to an ordinary configuration file.

| Input | Value |
|---|---|
| `MAIL_ADDRESS` | Complete primary mailbox address, including a Zoho-hosted custom domain |
| `MAIL_APP_PASSWORD` | Application-specific password / protocol password; required secret input |
| `MAIL_IMAP_HOST` | Incoming hostname from Server Configuration Details, without scheme, port or path |
| `MAIL_SMTP_HOST` | Outgoing hostname from Server Configuration Details, without scheme, port or path |

先在 Zoho 账号内启用 IMAP，再从 **Server Configuration Details（服务器配置详情）** 复制收件和发件主机。`MAIL_ADDRESS` 填写完整主邮箱地址；`MAIL_APP_PASSWORD` 通过密钥输入项填写。启用两步验证或使用 SAML 时，按 Zoho 要求生成应用专用密码。自定义域名不能推断数据中心，插件不会探测地区或向其他地区重试凭据。新注册免费账号不提供 IMAP，管理员也可能禁用；付费不等于已启用或已获准访问。插件无法解除套餐或组织限制。

## Hosts and account types / 主机与账号类型

Zoho's current general IMAP/SMTP documentation distinguishes personal and free-organization ordinary hosts from paid-organization `imappro`/`smtppro` hosts. A listed free-organization host is **not** a promise that a newly registered free account has IMAP. Regional organization configuration documents use ordinary hosts in several data centers. Do not mechanically append a regional suffix to `imappro` or `smtppro`.

This version accepts only the following exact official hostnames. Both inputs must belong to the same row; account eligibility and the correct ordinary/pro combination are decided by the account's Server Configuration Details, not by the plugin. Case and surrounding whitespace are normalized. Unknown hosts, URLs, IP addresses, ports, suffix lookalikes and cross-data-center pairs are rejected **before either protocol connects**.

| Data center | Allowed IMAP hosts | Allowed SMTP hosts |
|---|---|---|
| United States | `imap.zoho.com`, `imappro.zoho.com` | `smtp.zoho.com`, `smtppro.zoho.com` |
| Europe | `imap.zoho.eu`, `imappro.zoho.eu` | `smtp.zoho.eu`, `smtppro.zoho.eu` |
| India | `imap.zoho.in`, `imappro.zoho.in` | `smtp.zoho.in`, `smtppro.zoho.in` |
| Australia | `imap.zoho.com.au` | `smtp.zoho.com.au` |
| Japan | `imap.zoho.jp` | `smtp.zoho.jp` |
| China | `imap.zoho.com.cn` | `smtp.zoho.com.cn` |
| Canada | `imap.zohocloud.ca` | `smtp.zohocloud.ca` |
| Saudi Arabia | `imap.zoho.sa` | `smtp.zoho.sa` |
| United Arab Emirates | `imap.zoho.ae` | `smtp.zoho.ae` |

IMAP always uses port **993**, SMTP port **465**, both with implicit TLS, certificate/hostname verification and TLS >=1.2. Zoho also documents SMTP 587 with STARTTLS; this version intentionally exposes only 465. No plaintext, alternate ports, fallback targets, credential discovery, region probing or automatic retries. Tool arguments cannot override servers. Only the two selected hosts receive the mailbox credentials; this runtime does not contact Zoho's web/API/Accounts endpoints, fetch MX records or download code. Documentation links are for the user to open.

各地区只接受表内已核实的主机，两个输入必须属于同一数据中心。普通/pro 主机以账号显示为准，不根据个人/组织邮箱后缀猜测，也不补造澳、日、中、加、沙特或阿联酋的 pro 主机。账号显示表外主机时，本版会拒绝连接；需先核实官方资料再更新插件，不能通过模型参数绕过。

## Errors / 错误

`AUTHENTICATION_FAILED` does not mean the password is necessarily wrong or an upgrade is required. Check the account's server details, full address, application-specific password, enabled IMAP, assigned plan and administrator policy. Account checks retain separate results for each protocol. When the server provides a rejection response, `serverResponse` contains a bounded, credential-redacted copy; it is untrusted server text, not an instruction or an inferred diagnosis. SMTP numeric response codes and IMAP status are retained where supplied. TLS/DNS/timeout/connection failures are reported separately. No failed authentication causes a switch to another host or data center.

认证失败需按真实错误核对主机、完整邮箱、应用密码、IMAP 开关、套餐和管理员策略；不能直接断言密码错误或必须升级。服务器拒绝信息经过限长、控制字符清理和凭据脱敏。TLS 失败不会降级。

## Behavior and approvals / 行为与审批

- Read tools check the account, list folders, search bounded UID pages and read mail without marking it read. An empty page may have `nextCursor`; reuse the same filters. Dates are server calendar days, since inclusive and before exclusive. IDs bind account, selected IMAP host, folder, UIDVALIDITY and UID. Search again after changing the IMAP host, a move or a stale-ID error.
- `mail_save_draft` writes a real draft in a discovered or explicitly selected existing folder. Without explicit sending authorization, save a draft. `mail_send_message` sends new mail or a reply with derived recipients, In-Reply-To and References. The sender must equal the configured account; separate alias sending is not supported. The runtime neither appends a sent copy nor marks the original answered; Zoho may save its own sent copy under the account's SMTP settings.
- Results distinguish `draft_saved`, `smtp_accepted`, `failed`, `send_unknown` and `operation_unknown`. SMTP acceptance does not prove delivery. Timeout/disconnection during submission can leave the result unknown: **never automatically resend**. Message-ID does not guarantee deduplication. An interrupted IMAP write may have partially completed; inspect affected folders before retrying.
- `mail_set_read` changes one message's read state; `mail_move_message` moves one message to an existing folder using MOVE or a safe UIDPLUS fallback. Archiving requires a real discovered archive folder. Tools declare read/write/destructive effects and follow existing session approvals. Mail and server-response instructions cannot authorize operations.
- Read results contain decoded headers, Chinese text, UTC-normalized dates, inert HTML and attachment metadata. No rendering, external image loads or automatic file writes. Download only an explicitly selected attachment into an existing absolute session-accessible directory; files have sanitized names, private permissions and exclusive creation. Files are never executed. Outgoing attachment paths must identify explicitly selected regular files. Limits: 12 MiB encoded message, 10 MiB total attachments, 20 total To/Cc/Bcc recipients, and 200,000 characters each of returned text/HTML.

读取保留未读状态，不加载外链图片；附件仅在明确请求后写入指定目录。草稿、发送、状态和移动均声明实际写入影响，遵循当前会话审批。外部邮件中的指令不构成授权。SMTP 接受仅代表提交被服务器接受；结果未知时不自动重发。

## Data and revocation / 数据与撤销

Credentials and fetched messages remain in runtime memory, with no runtime credential file, mailbox cache, telemetry or background sync. Credentials reach the connector through environment variables, never arguments or URLs. The runtime does not inspect other clients, browsers, plugins or system credentials. stdout carries MCP only; raw authentication exchanges and message/attachment contents are not diagnostics.

Mail results enter the Wevir conversation and may reach its configured model service. Drafts and outgoing mail are stored by Zoho; downloaded files remain in the selected directory. The current Host persists plugin inputs, including secrets, in its local registry with file permissions (0600 on POSIX); this plugin adds no encryption. A masked input is not a promise of encrypted storage.

Revoke the dedicated password in **Zoho Accounts → Security → Application-Specific Passwords** by deleting the Wevir entry. Replace revoked passwords through the plugin inputs. Disable/uninstall and clear inputs in Wevir when no longer needed. Disabling does not revoke the Zoho password, delete downloads or erase conversation history. Do not change organization policy just to make the plugin connect.

运行体不保存凭据文件或邮箱缓存。邮件结果进入会话，可能交给当前配置的模型服务；草稿和发信保存在 Zoho，下载文件保存在选定目录。当前 Host 在本地注册表中持久化输入，密钥遮蔽不代表加密。撤销入口为 Zoho Accounts → Security → Application-Specific Passwords；删除本插件对应密码后，按需清除 Wevir 输入并停用插件。

## Sources, build and verification

Configuration reviewed November 2026:

- [Zoho IMAP, account types, Server Configuration Details and free-account restrictions](https://www.zoho.com/mail/help/imap-access.html), [SMTP, account types, ports and sent copies](https://www.zoho.com/mail/help/zoho-smtp.html).
- [Zoho regional autodiscovery examples](https://www.zoho.com/mail/help/adminconsole/autodiscovery-settings.html) and the public Thunderbird configuration documents it links to: [US](https://mail.zoho.com/thunderbird/config), [EU](https://mail.zoho.eu/thunderbird/config), [IN](https://mail.zoho.in/thunderbird/config), [AU](https://mail.zoho.com.au/thunderbird/config), [JP](https://mail.zoho.jp/thunderbird/config), [CN](https://mail.zoho.com.cn/thunderbird/config), [CA](https://mail.zohocloud.ca/thunderbird/config), [SA](https://mail.zoho.sa/thunderbird/config), [AE](https://mail.zoho.ae/thunderbird/config). These documents were retrieved without any mailbox credentials; they are configuration evidence, not live IMAP/SMTP tests. [Zoho data-center domains](https://www.zoho.com/mail/help/api/getting-started-with-api.html) identify the regional web domains only; API URLs are not IMAP/SMTP hosts.
- [India host announcement](https://help.zoho.com/portal/ar/community/topic/important-notice-to-zoho-mail-indian-datacentre-in-dc-deployment-users), [EU ordinary-host configuration](https://help.zoho.com/portal/en-gb/community/topic/imap-smtp-servers?page=1).
- [Two-factor authentication, application-specific passwords and revocation](https://www.zoho.com/mail/help/adminconsole/two-factor-authentication.html), [subscription restrictions](https://www.zoho.com/mail/help/adminconsole/subscription.html), [administrator access restrictions](https://www.zoho.com/mail/help/adminconsole/email-policy.html).

MIT for Wevir code. Uses the marketplace's shared `lib/mail/` runtime, independently bundled here. `server/THIRD-PARTY-NOTICES.txt` contains dependency licenses; `server/build-info.json` records versions and source/lockfile hashes. Rebuild only this entry with `npm run build:mail -- zoho-mail`.

Controlled TLS IMAP/SMTP fixtures cover configuration, security and mail operations; out-of-repository MCP and isolated Host checks cover installation and input expansion. No personal account, live regional IMAP/SMTP connection, real recipient or desktop interaction is used. This does not establish that all data centers or any particular plan/account have been tested live.
