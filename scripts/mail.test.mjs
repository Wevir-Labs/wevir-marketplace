import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { accountFromEnv, CLIENT_INFO, publicError } from '../lib/mail/profiles.mjs';
import { MailService, safeFilename, LIMITS } from '../lib/mail/service.mjs';
import { TOOLS } from '../lib/mail/tools.mjs';
import { ImapFlow } from '../lib/mail/imap.mjs';
import { SMTPConnection } from '../lib/mail/smtp.mjs';
import { simpleParser } from '../lib/mail/mime.mjs';
import { mailFixture, PASSWORD, sampleMail } from '../lib/mail/test/fixture.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const accounts = [['qq-mail', 'fixture@qq.com'], ['netease-mail', 'fixture@126.com'], ['sina-mail', 'fixture@sina.cn'], ['icloud-mail', 'fixture@icloud.com'], ['yahoo-mail', 'fixture@yahoo.com'], ['gmail', 'fixture@gmail.com']];
const ids = accounts.map(([id]) => id);
async function fixture(t) { const f = await mailFixture(); t.after(() => f.close()); return f; }
async function seed(f) { return f.add('INBOX', await sampleMail()); }
async function search(service, args = {}) { return service.invoke('mail_search_messages', { folder: 'INBOX', ...args }); }
const value = result => JSON.parse(result.content[0].text);

test('provider domains, secure endpoints, exact login and required inputs', () => {
  for (const [provider, domain, host] of [
    ['qq-mail', 'qq.com', 'qq.com'], ['qq-mail', 'foxmail.com', 'qq.com'],
    ['netease-mail', '163.com', '163.com'], ['netease-mail', '126.com', '126.com'],
    ['sina-mail', 'sina.com', 'sina.com'], ['sina-mail', 'sina.cn', 'sina.cn'],
  ]) {
    const account = accountFromEnv({ MAIL_PROVIDER: provider, MAIL_ADDRESS: `Fixture@${domain}`, MAIL_APP_PASSWORD: PASSWORD });
    assert.equal(account.imap, `imap.${host}`); assert.equal(account.smtp, `smtp.${host}`);
    assert.equal(account.imapPort, 993); assert.equal(account.smtpPort, 465); assert.equal(account.address, `fixture@${domain}`);
  }
  for (const env of [{}, { MAIL_ADDRESS: 'fixture@qq.com' }, { MAIL_APP_PASSWORD: PASSWORD }]) assert.throws(() => accountFromEnv(env), { code: 'MISSING_INPUT' });
  for (const address of ['a@exmail.qq.com', 'a@vip.sina.com', 'a@yeah.net', 'a@example.test']) assert.throws(() => accountFromEnv({ MAIL_PROVIDER: 'qq-mail', MAIL_ADDRESS: address, MAIL_APP_PASSWORD: PASSWORD }), { code: 'UNSUPPORTED_ACCOUNT' });
  assert.throws(() => accountFromEnv({ MAIL_PROVIDER: 'qq-mail', MAIL_ADDRESS: 'x\r\nBcc:a@qq.com', MAIL_APP_PASSWORD: PASSWORD }), { code: 'INVALID_ADDRESS' });
});

test('iCloud, Yahoo and personal Gmail profiles use documented fixed hosts and full login addresses', () => {
  for (const [provider, address, imap, smtp, smtpPort] of [
    ['icloud-mail', 'fixture@icloud.com', 'imap.mail.me.com', 'smtp.mail.me.com', 587],
    ['icloud-mail', 'fixture@me.com', 'imap.mail.me.com', 'smtp.mail.me.com', 587],
    ['icloud-mail', 'fixture@mac.com', 'imap.mail.me.com', 'smtp.mail.me.com', 587],
    ['yahoo-mail', 'fixture@yahoo.com', 'imap.mail.yahoo.com', 'smtp.mail.yahoo.com', 465],
    ['yahoo-mail', 'fixture@ymail.com', 'imap.mail.yahoo.com', 'smtp.mail.yahoo.com', 465],
    ['yahoo-mail', 'fixture@yahoo.co.uk', 'imap.mail.yahoo.com', 'smtp.mail.yahoo.com', 465],
    ['gmail', 'fixture@gmail.com', 'imap.gmail.com', 'smtp.gmail.com', 465],
    ['gmail', 'fixture@googlemail.com', 'imap.gmail.com', 'smtp.gmail.com', 465],
  ]) {
    const account = accountFromEnv({ MAIL_PROVIDER: provider, MAIL_ADDRESS: ` ${address.toUpperCase()} `, MAIL_APP_PASSWORD: PASSWORD });
    assert.equal(account.address, address); assert.equal(account.imap, imap); assert.equal(account.smtp, smtp);
    assert.equal(account.imapPort, 993); assert.equal(account.smtpPort, smtpPort);
  }
  for (const [provider, address] of accounts.slice(3)) {
    assert.throws(() => accountFromEnv({ MAIL_PROVIDER: provider, MAIL_ADDRESS: address }), { code: 'MISSING_INPUT' });
  }
  for (const [provider, address] of [['icloud-mail', 'primary@custom.test'], ['gmail', 'member@workspace.test']]) {
    assert.throws(() => accountFromEnv({ MAIL_PROVIDER: provider, MAIL_ADDRESS: address, MAIL_APP_PASSWORD: PASSWORD }), { code: 'UNSUPPORTED_ACCOUNT' });
  }
});

test('all profiles authenticate against controlled TLS services, with real client ID and no writes', async t => {
  const f = await fixture(t); f.requireId = true;
  const cases = [...accounts, ['qq-mail', 'fixture@foxmail.com'], ['netease-mail', 'fixture@163.com'], ['sina-mail', 'fixture@sina.com'], ['icloud-mail', 'fixture@me.com'], ['icloud-mail', 'fixture@mac.com'], ['gmail', 'fixture@googlemail.com'], ['yahoo-mail', 'fixture@ymail.com']];
  for (const [provider, address] of cases) {
    const result = await f.service(provider, address).invoke('mail_check_account');
    assert.equal(result.status, 'connected'); assert.equal(result.provider, provider); assert.equal(result.address, address);
  }
  assert.equal(f.connections, cases.length); assert.deepEqual(f.writes, []); assert.deepEqual(f.deliveries, []);
  assert.deepEqual(f.imapAuth, cases.map(([, address]) => address));
  assert.deepEqual(f.smtpAuth, cases.map(([, address]) => address));
  assert.ok(f.smtpSecure.every(Boolean));
  assert.ok(f.commands.some(c => c.verb === 'ID' && c.line.includes(CLIENT_INFO.name) && c.line.includes('Wevir')));
  for (const options of f.options) {
    assert.equal(options.secure, options.port !== 587); assert.equal(options.tls.rejectUnauthorized, true);
    if (options.port === 587) assert.equal(options.requireTLS, true);
    assert.equal(options.tls.minVersion, 'TLSv1.2');
    if (options.auth) assert.match(options.auth.user, /^fixture@/);
  }
});

test('wrong credentials return redacted protocol errors without host traversal or writes', async t => {
  const f = await fixture(t); f.authFailure = true;
  for (const [provider, address] of [accounts[1], ...accounts.slice(3)]) {
    const result = await f.service(provider, address).invoke('mail_check_account');
    assert.equal(result.status, 'failed');
    assert.equal(result.checks.imap.error.code, 'AUTHENTICATION_FAILED');
    assert.equal(result.checks.smtp.error.code, 'AUTHENTICATION_FAILED');
    assert.equal(result.checks.smtp.error.responseCode, 535);
    assert.ok(!JSON.stringify(result).includes(PASSWORD));
  }
  assert.equal(f.connections, 4); assert.equal(f.smtpAuth.length, 4);
  assert.deepEqual(f.options.map(o => o.host), ['imap.126.com', 'smtp.126.com', 'imap.mail.me.com', 'smtp.mail.me.com', 'imap.mail.yahoo.com', 'smtp.mail.yahoo.com', 'imap.gmail.com', 'smtp.gmail.com']);
  assert.deepEqual(f.writes, []); assert.deepEqual(f.deliveries, []);
});

test('timeouts and TLS trust failures do not downgrade or write', async t => {
  const f = await fixture(t);
  const service = f.service('qq-mail', 'fixture@qq.com', {
    createImap: options => new ImapFlow({ ...options, host: '127.0.0.1', port: f.imapPort, servername: 'localhost' }),
    createSmtp: options => new SMTPConnection({ ...options, host: '127.0.0.1', port: f.smtpPort, tls: { ...options.tls, servername: 'localhost' } }),
  });
  const result = await service.invoke('mail_check_account');
  assert.equal(result.checks.imap.error.code, 'TLS_FAILED'); assert.equal(result.checks.smtp.error.code, 'TLS_FAILED');
  f.silentImap = true;
  await assert.rejects(search(f.service('qq-mail', 'fixture@qq.com', { timeoutMs: 100 })), { code: 'TIMEOUT' });
  assert.deepEqual(f.writes, []); assert.deepEqual(f.deliveries, []);
});

test('Chinese, HTML, timezone, threading and attachment metadata read without marking seen', async t => {
  const f = await fixture(t); await seed(f);
  for (const [provider, address] of accounts) {
    const service = f.service(provider, address);
    const result = await search(service, { unread: true, subject: '项目', from: 'sender@example.test', since: '2026-11-16', before: '2026-11-18' });
    assert.equal(result.messages.length, 1); assert.equal(result.messages[0].subject, '项目更新');
    const read = await service.invoke('mail_read_message', { id: result.messages[0].id });
    assert.equal(read.subject, '项目更新'); assert.match(read.text, /中文正文/); assert.match(read.html, /external.invalid/);
    assert.equal(read.date, '2026-11-16T10:30:00.000Z'); assert.equal(read.headers['message-id'], '<original@example.test>');
    assert.equal(read.messageId, '<original@example.test>'); assert.deepEqual(read.references, ['<previous@example.test>']);
    assert.equal(read.from[0].name, '张三'); assert.equal(read.attachments[0].index, 0); assert.equal(read.attachments[0].contentType, 'application/pdf');
    assert.equal(read.attachments[0].size, 26); assert.ok(!JSON.stringify(read).includes('content-disposition:'));
    assert.equal(read.externalResourcesLoaded, false); assert.equal(read.untrustedContent, true);
    assert.ok(!f.folders.get('INBOX').messages[0].flags.has('\\Seen'));
    assert.deepEqual(f.writes, []); assert.equal(f.deliveries.length, 0);
    assert.ok(f.commands.some(c => c.verb === 'EXAMINE')); assert.ok(!f.commands.some(c => c.verb === 'SELECT'));
    assert.ok(f.commands.filter(c => c.verb === 'UID FETCH' && c.line.includes('BODY')).every(c => c.line.includes('BODY.PEEK')));
  }
});

test('legacy Chinese MIME charset is decoded by the protocol libraries', async t => {
  const f = await fixture(t);
  await f.add('INBOX', Buffer.from('From: sender@example.test\r\nTo: fixture@qq.com\r\nSubject: =?GB2312?B?1tDOxA==?=\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=gb2312\r\nContent-Transfer-Encoding: base64\r\n\r\n1tDOxA==\r\n'));
  const service = f.service(); const page = await search(service);
  const message = await service.invoke('mail_read_message', { id: page.messages[0].id });
  assert.equal(message.subject, '中文'); assert.equal(message.text.trim(), '中文');
});

test('bounded UID pagination, sequence changes, cross-account IDs and UIDVALIDITY', async t => {
  const f = await fixture(t); const original = await seed(f); await seed(f); await seed(f); const service = f.service();
  const first = await search(service, { limit: 1 }); assert.equal(first.messages.length, 1); assert.ok(first.nextCursor);
  const second = await search(service, { limit: 1, cursor: first.nextCursor }); assert.notEqual(first.messages[0].id, second.messages[0].id);
  f.folders.get('INBOX').messages.shift();
  assert.equal((await service.invoke('mail_read_message', { id: first.messages[0].id })).subject, '项目更新');
  const old = service.messageId(service.account(), 'INBOX', 41, original.uid);
  await assert.rejects(service.invoke('mail_read_message', { id: old }), { code: 'MESSAGE_NOT_FOUND' });
  await assert.rejects(f.service('sina-mail', 'fixture@sina.cn').invoke('mail_read_message', { id: first.messages[0].id }), { code: 'INVALID_ID' });
  await assert.rejects(search(service, { subject: 'different', cursor: first.nextCursor }), { code: 'INVALID_CURSOR' });
  f.folders.get('INBOX').validity++;
  await assert.rejects(service.invoke('mail_read_message', { id: first.messages[0].id }), { code: 'STALE_MESSAGE_ID' });
  await assert.rejects(search(service, { cursor: first.nextCursor }), { code: 'STALE_CURSOR' });
  const box = f.folders.get('INBOX'); box.next = 2001;
  const gap = await search(service); assert.equal(gap.messages.length, 0); assert.deepEqual(gap.scannedUidRange, [1501, 2000]); assert.ok(gap.nextCursor);
  assert.ok(f.commands.filter(c => c.verb === 'UID SEARCH').every(c => !c.line.includes('UID 1:*')));
});

test('drafts use real special-use discovery, preserve Bcc and reply chains, and never send', async t => {
  const f = await fixture(t); await seed(f); const service = f.service();
  const page = await search(service);
  const result = await service.invoke('mail_save_draft', { replyToMessageId: page.messages[0].id, text: '收到，谢谢。', bcc: ['private@example.test'] });
  assert.equal(result.status, 'draft_saved'); assert.equal(result.folder, 'Ideas'); assert.ok(result.id);
  const draft = f.folders.get('Ideas').messages[0];
  assert.ok(draft.flags.has('\\Draft')); assert.equal(draft.mail.inReplyTo, '<original@example.test>');
  assert.deepEqual(draft.mail.references, ['<previous@example.test>', '<original@example.test>']);
  assert.equal(draft.mail.to.value[0].address, 'reply@example.test'); assert.equal(draft.mail.bcc.value[0].address, 'private@example.test');
  assert.equal(f.deliveries.length, 0);
  f.folders.get('Ideas').flags = []; f.writes.length = 0;
  await assert.rejects(service.invoke('mail_save_draft', { text: 'not saved' }), { code: 'DRAFT_FOLDER_NOT_FOUND' });
  assert.deepEqual(f.writes, []);
  assert.equal((await service.invoke('mail_save_draft', { text: 'explicit existing folder', folder: 'Ideas' })).status, 'draft_saved');
  await assert.rejects(service.invoke('mail_save_draft', { text: 'bad folder', folder: 'Missing' }), { code: 'FOLDER_NOT_FOUND' });
});

test('sending and replying use configured identity, recipients and chosen attachments without hidden writes', async t => {
  const f = await fixture(t); await seed(f); const service = f.service(); const page = await search(service);
  const filename = path.join(f.directory, '报告.txt'); await writeFile(filename, '附件内容');
  const result = await service.invoke('mail_send_message', { replyToMessageId: page.messages[0].id, text: '回复正文', cc: ['cc@example.test'], bcc: ['bcc@example.test'], replyTo: ['contact@example.test'], attachments: [filename] });
  assert.equal(result.status, 'smtp_accepted'); assert.equal(result.deliveryConfirmed, false); assert.equal(f.deliveries.length, 1);
  const sent = await simpleParser(f.deliveries[0].raw);
  assert.equal(sent.from.value[0].address, 'fixture@qq.com'); assert.equal(sent.to.value[0].address, 'reply@example.test');
  assert.equal(sent.cc.value[0].address, 'cc@example.test'); assert.equal(sent.bcc, undefined);
  assert.equal(sent.replyTo.value[0].address, 'contact@example.test'); assert.equal(sent.inReplyTo, '<original@example.test>');
  assert.equal(sent.subject, 'Re: 项目更新'); assert.equal(sent.attachments[0].filename, '报告.txt');
  assert.equal(sent.attachments[0].content.toString(), '附件内容');
  assert.deepEqual(new Set(result.accepted), new Set(['reply@example.test', 'cc@example.test', 'bcc@example.test']));
  assert.deepEqual(f.writes, []); assert.ok(!f.folders.get('INBOX').messages[0].flags.has('\\Seen'));
  await assert.rejects(service.invoke('mail_send_message', { from: 'other@qq.com', to: ['a@example.test'], text: 'bad' }), { code: 'SENDER_MISMATCH' });
  await assert.rejects(service.invoke('mail_send_message', { to: ['a@example.test'], text: 'bad', host: 'attacker.invalid' }), { code: 'INVALID_ARGUMENT' });
  assert.equal(f.deliveries.length, 1);
});

for (const mode of ['disconnect', 'timeout', 'reject']) test(`SMTP ${mode}: truthful outcome and no automatic resend`, async t => {
  const f = await fixture(t); f.smtpMode = mode;
  const service = f.service('qq-mail', 'fixture@qq.com', { timeoutMs: mode === 'timeout' ? 700 : 3000 });
  let error;
  try { await service.invoke('mail_send_message', { to: ['recipient@example.test'], text: 'one attempt' }); }
  catch (caught) { error = caught; }
  assert.ok(error);
  const result = publicError(error);
  assert.equal(result.status, mode === 'reject' ? 'failed' : 'send_unknown');
  assert.ok(!JSON.stringify(result).includes(PASSWORD)); assert.equal(f.deliveries.length, 1); assert.deepEqual(f.writes, []);
});

test('read state and safe server-side MOVE affect only the requested message', async t => {
  const f = await fixture(t); await seed(f); const unrelated = await seed(f); unrelated.flags.add('\\Deleted');
  const service = f.service(); const page = await search(service); const id = page.messages[1].id;
  await service.invoke('mail_set_read', { id, read: true }); assert.ok(f.folders.get('INBOX').messages[0].flags.has('\\Seen'));
  await service.invoke('mail_set_read', { id, read: false }); assert.ok(!f.folders.get('INBOX').messages[0].flags.has('\\Seen'));
  const moved = await service.invoke('mail_move_message', { id, folder: 'Archive' });
  assert.equal(moved.status, 'moved'); assert.ok(moved.id);
  assert.equal((await service.invoke('mail_read_message', { id: moved.id })).subject, '项目更新');
  assert.equal(f.folders.get('INBOX').messages[0], unrelated);
  assert.ok(!f.commands.some(c => /EXPUNGE|DELETE/.test(c.verb)));
  await assert.rejects(service.invoke('mail_read_message', { id }), { code: 'MESSAGE_NOT_FOUND' });
  f.move = false;
  const fallback = await service.invoke('mail_move_message', { id: moved.id, folder: 'INBOX' });
  assert.equal(fallback.status, 'moved'); assert.ok(fallback.id);
  assert.ok(f.folders.get('INBOX').messages.includes(unrelated));
  assert.ok(f.commands.some(c => c.verb === 'UID EXPUNGE')); assert.ok(!f.commands.some(c => c.verb === 'EXPUNGE'));
  f.uidplus = false;
  await assert.rejects(service.invoke('mail_move_message', { id: fallback.id, folder: 'Archive' }), { code: 'MOVE_UNSUPPORTED' });
});

test('unconfirmed UIDPLUS move reports uncertainty without losing unrelated deleted mail or retrying', async t => {
  const f = await fixture(t); f.move = false; f.failExpunge = true;
  await seed(f); const other = await seed(f); other.flags.add('\\Deleted');
  const service = f.service(); const id = (await search(service)).messages[1].id;
  await assert.rejects(service.invoke('mail_move_message', { id, folder: 'Archive' }), { code: 'OPERATION_UNKNOWN', status: 'operation_unknown' });
  assert.equal(f.folders.get('Archive').messages.length, 1); assert.ok(f.folders.get('INBOX').messages.includes(other));
  assert.equal(f.commands.filter(c => c.verb === 'UID COPY').length, 1);
});

test('attachment filenames, path traversal, exclusive files, selected indices and size limits', async t => {
  const f = await fixture(t); await seed(f); const service = f.service(); const id = (await search(service)).messages[0].id;
  for (const name of ['../../secret', '..\\..\\secret', '/tmp/x', 'C:\\Users\\x', '\0CON.txt', '..', 'NUL']) {
    const safe = safeFilename(name); assert.equal(path.basename(safe), safe); assert.ok(!safe.includes('..')); assert.ok(!/[\\/\0]/.test(safe));
  }
  const result = await service.invoke('mail_download_attachment', { id, attachment: 0, directory: f.directory });
  assert.equal(path.dirname(result.path), f.directory); assert.match(path.basename(result.path), /账单.pdf$/);
  assert.equal((await readFile(result.path)).toString(), '%PDF-controlled-attachment'); assert.equal((await stat(result.path)).mode & 0o777, 0o600);
  const again = await service.invoke('mail_download_attachment', { id, attachment: 0, directory: f.directory }); assert.notEqual(result.path, again.path);
  await assert.rejects(service.invoke('mail_download_attachment', { id, attachment: 1, directory: f.directory }), { code: 'ATTACHMENT_NOT_FOUND' });
  await assert.rejects(service.invoke('mail_download_attachment', { id, attachment: 0, directory: '../outside' }), { code: 'INVALID_PATH' });
  const link = path.join(f.directory, 'link'); await symlink(result.path, link);
  await assert.rejects(service.invoke('mail_send_message', { to: ['a@example.test'], text: 'bad', attachments: [link] }));
  const large = path.join(f.directory, 'large'); await writeFile(large, ''); await truncate(large, LIMITS.attachment + 1);
  await assert.rejects(service.invoke('mail_save_draft', { text: 'bad', attachments: [large] }), { code: 'ATTACHMENT_TOO_LARGE' });
  f.folders.get('INBOX').messages[0].reportedSize = LIMITS.message + 1;
  await assert.rejects(service.invoke('mail_read_message', { id }), { code: 'MESSAGE_TOO_LARGE' });
  assert.deepEqual(f.writes, []); assert.equal(f.deliveries.length, 0);
});

test('tool effects, strict arguments and error redaction', async () => {
  assert.equal(TOOLS.length, 9);
  for (const tool of TOOLS) { assert.equal(tool.inputSchema.additionalProperties, false); assert.equal(tool.annotations.openWorldHint, true); }
  for (const name of ['mail_check_account', 'mail_list_folders', 'mail_search_messages', 'mail_read_message']) assert.equal(TOOLS.find(t => t.name === name).annotations.readOnlyHint, true);
  for (const name of ['mail_save_draft', 'mail_send_message', 'mail_set_read', 'mail_move_message', 'mail_download_attachment']) assert.equal(TOOLS.find(t => t.name === name).annotations.readOnlyHint, false);
  const service = new MailService({ env: {} });
  for (const args of [{ folder: 'INBOX', limit: 51 }, { folder: 'INBOX', limit: 0 }, { folder: 'INBOX\r\nAPPEND' }]) await assert.rejects(search(service, args), { code: 'INVALID_ARGUMENT' });
  assert.ok(!JSON.stringify(publicError(Object.assign(new Error(PASSWORD), { response: `535 ${PASSWORD}`, responseCode: 535, code: 'EAUTH' }))).includes(PASSWORD));
});

test('standalone bundles initialize, discover and call controlled services outside the repository for all mail plugins', async t => {
  const f = await fixture(t); f.gmail = true;
  f.folders.set('Work', { validity: 53, next: 1, flags: [], messages: [] });
  const root = await mkdtemp(path.join(tmpdir(), 'wevir-mail-standalone-')); t.after(() => rm(root, { recursive: true, force: true }));
  const body = Buffer.concat([Buffer.from('1tDOxA==', 'base64'), Buffer.from(PASSWORD)]).toString('base64');
  await f.add('INBOX', Buffer.from(`From: sender@example.test\r\nSubject: fixture\r\nContent-Type: text/plain; charset=gb2312\r\nContent-Transfer-Encoding: base64\r\n\r\n${body}`));
  const preload = path.join(root, 'redirect.mjs'); await cp(path.join(ROOT, 'lib/mail/test/redirect.mjs'), preload);
  const cert = path.join(root, 'fixture-ca'); await writeFile(cert, f.cert);
  const clients = [];
  t.after(async () => { for (const client of clients) await client.close(); });
  for (const [id, address] of accounts) {
    const plugin = path.join(root, id); await cp(path.join(ROOT, 'plugins', id), plugin, { recursive: true });
    const stderr = [];
    const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', preload, path.join(plugin, 'server/index.mjs')], cwd: root,
      env: { PATH: process.env.PATH, MAIL_PROVIDER: id, MAIL_ADDRESS: address, MAIL_APP_PASSWORD: PASSWORD,
        NODE_EXTRA_CA_CERTS: cert, FIXTURE_IMAP_PORT: String(f.imapPort), FIXTURE_SMTP_PORT: String(f.smtpPort), FIXTURE_STARTTLS_PORT: String(f.starttlsPort) }, stderr: 'pipe' });
    const client = new Client({ name: 'mail-installation-test', version: '1.0.0' }); clients.push(client);
    transport.stderr.on('data', data => stderr.push(data.toString()));
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 9);
    const checked = value(await client.callTool({ name: 'mail_check_account', arguments: {} }));
    assert.equal(checked.status, 'connected'); assert.equal(checked.provider, id); assert.equal(checked.address, address);
    assert.ok(value(await client.callTool({ name: 'mail_list_folders', arguments: {} })).folders.some(folder => folder.path === 'Ideas'));
    const page = value(await client.callTool({ name: 'mail_search_messages', arguments: { folder: 'INBOX' } }));
    const read = await client.callTool({ name: 'mail_read_message', arguments: { id: page.messages[0].id } });
    assert.ok(!JSON.stringify(read).includes(PASSWORD)); assert.ok(value(read).text.includes('[redacted]')); assert.ok(value(read).text.includes('中文'));
    f.authFailure = true;
    const failed = await client.callTool({ name: 'mail_check_account', arguments: {} });
    assert.equal(failed.isError, true); assert.ok(!JSON.stringify(failed).includes(PASSWORD));
    f.authFailure = false;
    const saved = value(await client.callTool({ name: 'mail_save_draft', arguments: { text: 'Standalone draft 中文' } })); assert.equal(saved.status, 'draft_saved');
    if (id === 'gmail') {
      assert.equal(page.messages[0].gmailMessageId, '1278455344230334865');
      const moved = value(await client.callTool({ name: 'mail_move_message', arguments: { id: page.messages[0].id, folder: 'Work' } }));
      assert.equal(moved.status, 'moved');
      const destination = value(await client.callTool({ name: 'mail_search_messages', arguments: { folder: 'Work' } }));
      assert.equal(destination.messages[0].gmailMessageId, page.messages[0].gmailMessageId);
      assert.notEqual(destination.messages[0].id, page.messages[0].id);
      assert.ok(!f.commands.some(c => /COPY|MOVE|EXPUNGE/.test(c.verb)));
    }
    assert.ok(!stderr.join('').includes(PASSWORD));
  }
  assert.equal(clients.length, accounts.length); assert.equal(f.deliveries.length, 0);
});

test('missing credentials do not prevent MCP discovery and fail a call without leaking environment', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'wevir-mail-no-input-')); t.after(() => rm(root, { recursive: true, force: true }));
  for (const id of ids) {
    const plugin = path.join(root, id); await cp(path.join(ROOT, 'plugins', id), plugin, { recursive: true });
    const client = new Client({ name: 'missing-input-test', version: '1.0.0' }); t.after(() => client.close());
    await client.connect(new StdioClientTransport({ command: process.execPath, args: [path.join(plugin, 'server/index.mjs')], cwd: root, env: { PATH: process.env.PATH, MAIL_PROVIDER: id } }));
    assert.equal((await client.listTools()).tools.length, 9);
    const result = await client.callTool({ name: 'mail_check_account', arguments: {} });
    assert.equal(result.isError, true); assert.equal(value(result).error.code, 'MISSING_INPUT');
  }
});

test('iCloud requires a verified STARTTLS upgrade before SMTP authentication', async t => {
  const f = await mailFixture({ starttlsEnabled: false }); t.after(() => f.close());
  const checked = await f.service('icloud-mail', 'fixture@icloud.com').invoke('mail_check_account');
  assert.equal(checked.checks.imap.status, 'connected'); assert.equal(checked.checks.smtp.status, 'failed');
  assert.equal(f.smtpAuth.length, 0); assert.equal(f.deliveries.length, 0);
  assert.equal(f.options.find(o => o.host === 'smtp.mail.me.com').requireTLS, true);
});

test('new providers send replies and selected Chinese attachments, and preserve unknown send results', async t => {
  const f = await fixture(t); await seed(f);
  const filename = path.join(f.directory, '报告.txt'); await writeFile(filename, '附件内容');
  for (const [provider, address] of accounts.slice(3)) {
    const service = f.service(provider, address), id = (await search(service)).messages[0].id;
    const sent = await service.invoke('mail_send_message', { replyToMessageId: id, html: '<p>中文回复</p>', attachments: [filename] });
    assert.equal(sent.status, 'smtp_accepted'); assert.equal(sent.deliveryConfirmed, false);
    const message = await simpleParser(f.deliveries.at(-1).raw);
    assert.equal(message.from.value[0].address, address); assert.equal(message.to.value[0].address, 'reply@example.test');
    assert.equal(message.inReplyTo, '<original@example.test>'); assert.match(message.html, /中文回复/);
    assert.equal(message.attachments[0].filename, '报告.txt'); assert.equal(message.attachments[0].content.toString(), '附件内容');
    f.smtpMode = 'disconnect';
    const before = f.deliveries.length;
    await assert.rejects(service.invoke('mail_send_message', { to: ['recipient@example.test'], text: 'one attempt' }), { code: 'SEND_UNKNOWN', status: 'send_unknown' });
    assert.equal(f.deliveries.length, before + 1); f.smtpMode = 'accept';
  }
  assert.deepEqual(f.writes, []); assert.ok(!f.folders.get('INBOX').messages[0].flags.has('\\Seen'));
  assert.ok(f.smtpSecure.every(Boolean));
  assert.ok(!f.options.some(o => o.host.includes('export.')));
});

test('Yahoo two-way profile writes actual drafts, read state and safe moves without using the export service', async t => {
  const f = await fixture(t); await seed(f); const other = await seed(f); other.flags.add('\\Deleted');
  const service = f.service('yahoo-mail', 'fixture@yahoo.co.uk'); const id = (await search(service)).messages[1].id;
  const draft = await service.invoke('mail_save_draft', { replyToMessageId: id, text: 'Yahoo draft 中文' });
  assert.equal(draft.status, 'draft_saved'); assert.equal(draft.folder, 'Ideas');
  await service.invoke('mail_set_read', { id, read: true });
  assert.ok(f.folders.get('INBOX').messages[0].flags.has('\\Seen'));
  const moved = await service.invoke('mail_move_message', { id, folder: 'Archive' });
  assert.equal(moved.status, 'moved'); assert.ok(moved.id);
  assert.equal((await service.invoke('mail_read_message', { id: moved.id })).subject, '项目更新');
  assert.equal(f.folders.get('INBOX').messages[0], other);
  assert.ok(f.options.every(o => o.host === 'imap.mail.yahoo.com'));
  assert.equal(f.deliveries.length, 0);
});

test('Gmail duplicate labels retain exact folder IDs and unique decimal message IDs; moves and archives never expunge', async t => {
  const f = await fixture(t); f.gmail = true; f.move = false;
  f.folders.set('Projects', { validity: 51, next: 1, flags: [], messages: [] });
  f.folders.set('[Gmail]/All Mail', { validity: 52, next: 1, flags: ['\\All'], messages: [] });
  const original = await seed(f), unrelated = await seed(f); unrelated.flags.add('\\Deleted');
  for (const folder of ['Projects', '[Gmail]/All Mail']) {
    const copy = await f.add(folder, original.raw); copy.gmailId = original.gmailId; copy.flags = original.flags;
  }
  const service = f.service('gmail', 'fixture@gmail.com');
  const inbox = await search(service), projects = await search(service, { folder: 'Projects' });
  assert.notEqual(inbox.messages[1].id, projects.messages[0].id);
  assert.equal(inbox.messages[1].gmailMessageId, '1278455344230334865');
  assert.equal(inbox.messages[1].gmailMessageId, projects.messages[0].gmailMessageId);
  assert.notEqual(inbox.messages[0].gmailMessageId, projects.messages[0].gmailMessageId);
  const read = await service.invoke('mail_read_message', { id: projects.messages[0].id });
  assert.equal(read.gmailMessageId, projects.messages[0].gmailMessageId); assert.match(read.text, /中文正文/);
  assert.ok(!original.flags.has('\\Seen')); assert.deepEqual(f.writes, []);
  await service.invoke('mail_set_read', { id: projects.messages[0].id, read: true });
  assert.ok(original.flags.has('\\Seen')); assert.ok(!unrelated.flags.has('\\Seen'));
  const moved = await service.invoke('mail_move_message', { id: inbox.messages[1].id, folder: 'Projects' });
  assert.equal(moved.status, 'moved'); assert.equal(moved.id, undefined);
  assert.equal(f.folders.get('INBOX').messages.length, 1); assert.equal(f.folders.get('INBOX').messages[0], unrelated);
  assert.equal(f.folders.get('Projects').messages.length, 1); assert.equal(f.folders.get('[Gmail]/All Mail').messages.length, 1);
  await assert.rejects(service.invoke('mail_read_message', { id: inbox.messages[1].id }), { code: 'MESSAGE_NOT_FOUND' });
  const destination = await search(service, { folder: 'Projects' });
  const archived = await service.invoke('mail_move_message', { id: destination.messages[0].id, folder: '[Gmail]/All Mail' });
  assert.equal(archived.status, 'moved'); assert.equal(f.folders.get('Projects').messages.length, 0);
  const all = await search(service, { folder: '[Gmail]/All Mail' }); assert.equal(all.messages[0].gmailMessageId, original.gmailId);
  assert.ok(!f.commands.some(c => /COPY|MOVE|EXPUNGE/.test(c.verb)));
  assert.ok(!f.commands.some(c => c.verb === 'UID STORE' && c.line.includes('\\Deleted')));
  assert.equal(f.deliveries.length, 0);
});

test('Gmail refuses dangerous system-folder moves, discovers real drafts and rejects a user label named Drafts', async t => {
  const f = await fixture(t); f.gmail = true; await seed(f);
  const draftBox = f.folders.get('Ideas'); f.folders.delete('Ideas'); f.folders.set('[GoogleMail]/Drafts', draftBox);
  f.folders.set('Drafts', { validity: 54, next: 1, flags: [], messages: [] });
  const service = f.service('gmail', 'fixture@gmail.com'), id = (await search(service)).messages[0].id;
  const systems = [['Trash', '\\Trash'], ['Spam', '\\Junk'], ['Sent', '\\Sent'], ['Starred', '\\Flagged'], ['Important', '\\Important'], ['All', '\\All'], ['Drafts', '\\Drafts']];
  for (const [name, flag] of systems) {
    const folder = `[Gmail]/${name}`; f.folders.set(folder, { validity: 60, next: 1, flags: [flag], messages: [] });
    const item = await f.add(folder, await sampleMail());
    await assert.rejects(service.invoke('mail_move_message', { id: service.messageId(service.account(), folder, 60, item.uid), folder: 'Archive' }), { code: 'UNSAFE_GMAIL_MOVE' });
    if (flag !== '\\All') await assert.rejects(service.invoke('mail_move_message', { id, folder }), { code: 'UNSAFE_GMAIL_MOVE' });
    f.folders.delete(folder);
  }
  assert.deepEqual(f.writes, []);
  await assert.rejects(service.invoke('mail_save_draft', { text: 'not a real draft folder', folder: 'Drafts' }), { code: 'DRAFT_FOLDER_NOT_FOUND' });
  const saved = await service.invoke('mail_save_draft', { replyToMessageId: id, html: '<p>中文草稿</p>' });
  assert.equal(saved.folder, '[GoogleMail]/Drafts'); assert.equal(saved.status, 'draft_saved');
  assert.equal(draftBox.messages.length, 1); assert.match(draftBox.messages[0].mail.html, /中文草稿/);
  assert.equal(draftBox.messages[0].mail.inReplyTo, '<original@example.test>'); assert.equal(f.folders.get('Drafts').messages.length, 0);
  draftBox.flags = []; f.writes.length = 0;
  const listed = await service.invoke('mail_list_folders');
  assert.ok(!listed.folders.some(folder => folder.specialUse === '\\Drafts'));
  await assert.rejects(service.invoke('mail_save_draft', { text: 'no special-use folder' }), { code: 'DRAFT_FOLDER_NOT_FOUND' });
  assert.deepEqual(f.writes, []); assert.equal(f.deliveries.length, 0);
});

test('partial Gmail label changes report unknown without retries; missing extension refuses unsafe fallback', async t => {
  const f = await fixture(t); f.gmail = true; f.failLabelRemove = true; await seed(f);
  f.folders.get('Archive').flags = [];
  const service = f.service('gmail', 'fixture@gmail.com'), id = (await search(service)).messages[0].id;
  await assert.rejects(service.invoke('mail_move_message', { id, folder: 'Archive' }), { code: 'OPERATION_UNKNOWN', status: 'operation_unknown' });
  assert.equal(f.folders.get('INBOX').messages.length, 1); assert.equal(f.folders.get('Archive').messages.length, 1);
  assert.equal(f.commands.filter(c => c.verb === 'UID STORE' && c.line.includes('+X-GM-LABELS')).length, 1);
  assert.equal(f.commands.filter(c => c.verb === 'UID STORE' && c.line.includes('-X-GM-LABELS')).length, 1);
  assert.ok(!f.commands.some(c => /COPY|MOVE|EXPUNGE/.test(c.verb)));
  f.gmail = false; f.writes.length = 0;
  await assert.rejects(service.invoke('mail_move_message', { id, folder: 'Archive' }), { code: 'MOVE_UNSUPPORTED' });
  assert.deepEqual(f.writes, []);
});

test('explicit build selection leaves other plugin servers untouched; generated catalog is official', async t => {
  const untouched = ids.filter(id => id !== 'gmail');
  const before = await Promise.all(untouched.map(id => stat(path.join(ROOT, 'plugins', id, 'server/index.mjs'))));
  const output = execFileSync(process.execPath, ['scripts/build-mail.mjs', 'gmail'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(output, /gmail:/); assert.ok(!output.includes('qq-mail:'));
  for (const [index, id] of untouched.entries()) assert.equal((await stat(path.join(ROOT, 'plugins', id, 'server/index.mjs'))).mtimeMs, before[index].mtimeMs);
  const out = await mkdtemp(path.join(tmpdir(), 'wevir-mail-index-')); t.after(() => rm(out, { recursive: true, force: true }));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  execFileSync(process.execPath, ['scripts/build-index.mjs', '--commit', commit, '--out', out], { cwd: ROOT });
  const index = JSON.parse(await readFile(path.join(out, 'index.json'), 'utf8'));
  for (const id of ids) {
    const entry = index.entries.find(e => e.id === id);
    assert.equal(entry.version, '1.0.0'); assert.equal(entry.category, 'communication'); assert.equal(entry.verification.level, 'official');
    assert.equal(entry.verification.since, '2026-11'); assert.equal(entry.verification.note['zh-CN'], '由 Wevir 维护的本地邮件插件，通过 IMAP/SMTP 连接邮箱服务');
    assert.equal(entry.verification.note.en, 'Local mail plugin maintained by Wevir, connecting to the mail provider over IMAP/SMTP');
    const manifest = JSON.parse(await readFile(path.join(ROOT, 'plugins', id, 'wevir-plugin.json'), 'utf8'));
    assert.equal(manifest.verification, undefined); assert.equal(manifest.connectors.mail.env.MAIL_PROVIDER, id);
    assert.equal(manifest.inputs.find(i => i.key === 'MAIL_APP_PASSWORD').secret, true);
    const files = await readdir(path.join(ROOT, 'plugins', id), { recursive: true });
    assert.ok(files.includes('server/THIRD-PARTY-NOTICES.txt')); assert.ok(files.includes('server/build-info.json'));
    assert.ok(!files.some(file => /node_modules|test\/|\.pem$|\.map$/.test(file)));
  }
});
