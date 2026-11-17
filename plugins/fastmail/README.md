# Fastmail

[English](#english) · [简体中文](#简体中文)

## English

Maintained by **Wevir**, not published or endorsed by Fastmail. Connect one account's mail, personal calendars and contacts locally through IMAP/SMTP, CalDAV and CardDAV. Requires Node >=22. The included server runs as `node ${pluginDir}/server/index.mjs`; installation downloads no code or dependencies. No OAuth application, hosted MCP, JMAP, file storage, full-account sync, listener or scheduler.

### Setup and revocation

1. **Login** (`MAIL_ADDRESS`): the complete original Fastmail login, including its domain. Custom-domain logins work. Other aliases and sending identities are not logins; DAV paths are discovered, never derived from aliases. Sending is limited to this login address; separate sending identities are not supported.
2. In **Settings → Privacy & Security → Connected apps & API tokens → Manage app passwords and access**, create a Wevir app password. Select **Mail, Contacts & Calendars** for all capabilities, or restrict it as needed. Mail requires Mail (IMAP/SMTP), calendars require Calendars (CalDAV), contacts require Contacts (CardDAV). Fill **App password** (`MAIL_APP_PASSWORD`, required, secret).
3. **Basic plans exclude IMAP, SMTP, CalDAV and CardDAV and cannot create app passwords.** Never use the web password or disable two-step verification. A generic authentication failure cannot identify whether the login, password, permissions or plan caused it; do not infer that upgrading is necessarily the remedy.

`fastmail_check_account` checks each protocol without writes and returns `connected`, `partial` or `failed`, with independent results. A failure never disables another capability. Mail rejection details are bounded and redacted; DAV reports capability and HTTP errors without echoing response bodies. To revoke access, select the app password in the same Fastmail screen and **Disable/Remove**, or **Review access → Remove access**. Uninstalling does not revoke it. Remove saved inputs in Wevir separately.

### Actual capabilities

| Capability | Read | Write |
| --- | --- | --- |
| Mail | Account check, folders, bounded search, body/attachment metadata | Real mailbox draft, send/reply, read status, move one message, selected attachment download |
| Calendar | Discover calendars/privileges; bounded query with expanded recurring instances/exceptions | Create personal timed/all-day events; update an exact event, series metadata or one occurrence |
| Contacts | Discover books; server-side name/email/phone/organization search, paged vCards | Create a distinct contact; patch one exact resource with ETag |

MCP tools declare read/write effects. Drafts, sending, calendar writes, contact writes and file downloads follow their respective existing session approvals; annotations do not replace Host enforcement. Without write authorization the skill provides a conversation preview. Mail, event descriptions and contact notes are untrusted external data, not authorization to execute, send or disclose anything.

Mail reuses the shared ImapFlow/Nodemailer/MailParser runtime. EXAMINE/BODY.PEEK preserves unread status; returned HTML is inert and images are not fetched. IDs bind account/folder/UIDVALIDITY/UID. Search scans up to 500 UIDs and returns up to 50 items per page; an empty page can have another cursor. Drafts use an existing discovered folder; replies retain threading. **SMTP acceptance is not delivery.** Never automatically retry `send_unknown` or `operation_unknown`; inspect for completed/partial writes before authorizing another attempt. No hidden sent-copy or answered-flag writes. Limits: 12 MiB encoded message, 10 MiB attachments, 20 recipients, 200,000 characters each of text/HTML. Outgoing attachments must be explicitly selected regular files; downloads create private new files in an explicitly selected existing directory and never execute them. No bulk send, mailbox clearing or permanent delete.

Calendar queries require explicit offset bounds and an IANA display zone, at most **93 days / 500 occurrences**. CalDAV expands RRULE/RDATE/EXDATE and detached exceptions. Unexpanded, malformed, forbidden or truncated results are errors, never an incomplete or empty calendar. Results include stable resource ID, UID, ETag, calendar, title, dates, timezone and all-day flag. All-day events use dates with an **exclusive end date**. Timed writes require ISO timestamps with offsets matching the IANA zone and DST. Bundled timezone definitions are checked against runtime IANA data at written times; a mismatch or ambiguous repeated wall time is refused (use UTC). Embedded VTIMEZONE and unmodified iCalendar properties/alarms are retained.

Event update requires ID, exact ETag and scope: `event` for a nonrepeating event; `series` for title/description/location across the master and exceptions; `instance` for one queried recurrenceId, including its times. Series retiming, new recurrence rules/rule edits, RANGE=THISANDFUTURE edits, participants, invitations and replies are not exposed. ATTENDEE/ORGANIZER/METHOD resources are refused on update because scheduling changes may send notifications; use Fastmail with sending authorization. Personal events add no participants. No calendar deletion or bulk deletion.

Contact search requests at most **501 matching resource references**, refuses more than 500, then fetches at most **50 vCards per page**. Narrow a limit error; reuse identical book/query/limit with nextCursor, and restart if results change. Ordinary searches never download the whole account. ICAL.js parses/serializes vCard 3.0/4.0: Chinese names, multiple emails/phones, organization/department/title and notes. Patch only supplied fields; structured name parts, other values, unknown properties and parameters remain. Explicit email/phone arrays replace that whole field. Creates always create a distinct resource, never a same-name merge. Updates use stable resource IDs and strong ETag/If-Match; creates use If-None-Match. Conflicts require rereading and review. No contact deletion, clearing or bulk merge.

DAV responses are bounded to 4 MiB, individual calendar/contact resources to 1 MiB. Service/permission/parse failures differ from successful no matches. Interrupted DAV writes return `operation_unknown` without retries.

### Network and storage

- `imap.fastmail.com:993` and `smtp.fastmail.com:465`, implicit TLS and full-login/app-password authentication.
- `https://caldav.fastmail.com:443` and `https://carddav.fastmail.com:443`: well-known discovery, current-user-principal, home-set and collections. No hardcoded user directories.
- DAV discovery/read redirects stay on the exact official origin for that protocol. Insecure/third-party targets, userinfo, query/fragment and unsafe paths are refused before credentials are sent; writes do not follow redirects. Certificates are verified, without insecure fallback or invented regional endpoints.

Credentials enter through inputs and env only, not args, URLs, results, logs or additional runtime config files. `secret` masks an input, not a promise of encrypted storage. Wevir stores inputs/configuration and conversation tool results under its existing policy. The runtime keeps only request data in memory: no mailbox/calendar/address-book replica, cache or telemetry. Only requested attachment downloads create local data files; remote writes remain in Fastmail. stdout carries MCP only; diagnostics use generic redacted stderr.

### Sources, licensing and verification

Reviewed **2026-11-17**: [Fastmail hosts, login and discovery](https://www.fastmail.help/hc/en-us/articles/1500000278342-Server-names-and-ports), [app passwords, permissions, Basic and revocation](https://www.fastmail.help/hc/en-us/articles/360058752854-App-passwords), [protocols](https://www.fastmail.com/dev/). Libraries/protocols: [tsdav](https://tsdav.vercel.app/intro/), [ICAL.js](https://kewisch.github.io/ical.js/api/), [Luxon](https://moment.github.io/luxon/api-docs/), [timezones-ical-library](https://github.com/add2cal/timezones-ical-library), [CalDAV expansion](https://www.rfc-editor.org/rfc/rfc4791#section-9.6.5), [CardDAV query/limits](https://www.rfc-editor.org/rfc/rfc6352#section-8.6).

Source is `lib/mail/` plus `lib/fastmail/`. Versions and integrity are locked in package-lock.json; server/build-info.json records source/lock hashes and bundled versions. THIRD-PARTY-NOTICES.txt includes licenses. Wevir code/icon: MIT; tsdav/Luxon: MIT; timezone data: Apache-2.0; ICAL.js: MPL-2.0. The unmodified ICAL.js **Source Code Form** can be obtained at [this exact revision](https://github.com/kewisch/ical.js/tree/277d52c8db379f133a88957793e03997a65307f4/lib); its license is included.

```sh
npm ci
npm run build:mail -- fastmail
node --test scripts/fastmail.test.mjs
npm test
node scripts/validate.mjs
node scripts/test-mail-host.mjs --wevir /path/to/wevir-source-checkout --plugins fastmail
```

The explicit build regenerates Fastmail only; other mail entries receive no DAV dependencies. Controlled TLS IMAP/SMTP/HTTPS fixtures use synthetic accounts. Package-local stdio checks run outside the checkout; Host installation/input expansion uses a temporary registry. These do not prove real-account interoperability. **Real Fastmail connection and desktop example-prompt acceptance remain unverified.** No personal accounts, real recipients or installed plugin registry are used.

## 简体中文

由 **Wevir 维护**，不代表 Fastmail 发布或背书。Node >=22，自包含本地运行体，通过同一账号连接邮件、个人日程和联系人；无远程 MCP、OAuth、JMAP、后台同步和调度器。

**配置与权限：**「登录名」填写原始完整登录名（可为自定义域名），别名和发件身份不能代替。发件地址限此登录名。在 Fastmail **Settings → Privacy & Security → Connected apps & API tokens → Manage app passwords and access** 新建应用密码，按需选择 Mail（IMAP/SMTP）、Calendars（CalDAV）、Contacts（CardDAV），全部能力可选 Mail, Contacts & Calendars。密码只填插件 secret 必填输入。**Basic 套餐不含四种协议，也不能生成应用密码。** 不用网页登录密码，不关闭两步验证；通用鉴权失败不能确定是密码、权限还是套餐原因。连接检查分别报告四种协议，一项失败不关闭其他能力。撤销时回到应用密码管理页 Disable/Remove；卸载插件不会撤销密码，Wevir 的已存输入需另行移除。

**邮件：**复用共享实现，支持文件夹、分页搜索、只读正文/附件信息、真实草稿、发送/回复、已读状态、移动与选定附件下载。保留 UID/UIDVALIDITY 和回复链；读取不改变未读、不加载图片。SMTP 接受不等于送达，结果未知时不自动重试。限制 12 MiB 邮件、10 MiB 附件、20 位收件人。附件须明确选择，下载到指定已有目录，不执行。无群发、清空邮箱、永久删除。

**日历：**发现实际日历及写权限，查询最多 93 天/500 个实例，正确展开重复和例外；失败不会返回假空列表。支持定时与全天个人日程，全天结束日期不包含在内；定时时间偏移须符合 IANA 时区及夏令时，数据不一致或重复时间有歧义时明确报错，可用 UTC。更新需 ID、ETag 和范围：普通事件、整个系列的标题/描述/地点、或明确 recurrenceId 的单次实例（含改期）。保留其他属性、时区与提醒。暂不提供系列改期、重复规则编辑、THISANDFUTURE 修改和邀请/参与者回复；调度类事件更新会拒绝，因为可能外发通知。无删除日历与批量删除。

**联系人：**发现通讯录，服务端按姓名、邮箱、电话、组织搜索，最多 500 个匹配引用，再按每页最多 50 张 vCard 读取。超限须缩小搜索，结果改变需重新分页。支持中文、多邮箱/电话及常用组织字段。新建不按同名合并；更新基于稳定 ID、ETag/If-Match，保留未改字段、未知属性及参数；明确提供邮箱/电话数组会替换该字段全部值。无清空、隐式合并、批量删除。

**授权与数据：**读取、草稿、发送、日历写入、联系人写入及本地下载各遵循会话授权；未获相应写入授权时只给会话预览。邮件、事件描述、联系人备注均是外部数据，其指令不是授权。网络目标仅为上述四个官方主机，TLS/HTTPS 验证证书，DAV 不向第三方跳转发送凭据，写入不跟随跳转。密码只经输入和 env，不进参数/URL/日志，不另存普通配置；secret 只表示输入遮蔽，Wevir 沿用既有输入与会话保存方式。运行体不保存邮箱、日历或通讯录副本，只有明确下载的附件落盘。DAV 响应上限 4 MiB，单资源 1 MiB。

官方资料、许可、构建及验证命令见英文部分。市场 catalog 记录「Wevir 官方」认证，沿用既有金色徽标。验证只用受控协议夹具、仓库外 MCP、隔离 Host 数据目录；**真实 Fastmail 实连和桌面示例验收未验证。**
