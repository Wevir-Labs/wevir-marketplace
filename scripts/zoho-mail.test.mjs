import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { accountFromEnv, publicError } from '../lib/mail/profiles.mjs';
import { MailService } from '../lib/mail/service.mjs';
import { ImapFlow } from '../lib/mail/imap.mjs';
import { SMTPConnection } from '../lib/mail/smtp.mjs';
import { simpleParser } from '../lib/mail/mime.mjs';
import { mailFixture, PASSWORD, sampleMail } from '../lib/mail/test/fixture.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const env = (imap = 'imappro.zoho.eu', smtp = 'smtppro.zoho.eu', address = 'member@custom.test') => ({
  MAIL_PROVIDER: 'zoho-mail', MAIL_ADDRESS: address, MAIL_APP_PASSWORD: PASSWORD, MAIL_IMAP_HOST: imap, MAIL_SMTP_HOST: smtp,
});
const hosts = [
  ['imap.zoho.com', 'smtp.zoho.com'], ['imappro.zoho.com', 'smtppro.zoho.com'],
  ['imap.zoho.eu', 'smtp.zoho.eu'], ['imappro.zoho.eu', 'smtppro.zoho.eu'],
  ['imap.zoho.in', 'smtp.zoho.in'], ['imappro.zoho.in', 'smtppro.zoho.in'],
  ['imap.zoho.com.au', 'smtp.zoho.com.au'], ['imap.zoho.jp', 'smtp.zoho.jp'],
  ['imap.zoho.com.cn', 'smtp.zoho.com.cn'], ['imap.zohocloud.ca', 'smtp.zohocloud.ca'],
  ['imap.zoho.sa', 'smtp.zoho.sa'], ['imap.zoho.ae', 'smtp.zoho.ae'],
];
const legacy = ['qq-mail', 'netease-mail', 'sina-mail', 'icloud-mail', 'yahoo-mail', 'gmail'];
const value = result => JSON.parse(result.content[0].text);
const search = (service, args = {}) => service.invoke('mail_search_messages', { folder: 'INBOX', ...args });
async function fixture(t) { const f = await mailFixture(); t.after(() => f.close()); return f; }
const service = (f, configuration = env(), extra = {}) => f.service('zoho-mail', configuration.MAIL_ADDRESS, { env: configuration, ...extra });

test('Zoho account type and region come only from explicit supported hosts, including custom email domains', () => {
  for (const [imap, smtp] of hosts) {
    for (const address of ['owner@custom.test', 'personal@zohomail.com', 'legacy@zoho.eu']) {
      const account = accountFromEnv(env(` ${imap.toUpperCase()} `, smtp, address));
      assert.equal(account.imap, imap); assert.equal(account.smtp, smtp); assert.equal(account.address, address);
      assert.equal(account.imapPort, 993); assert.equal(account.smtpPort, 465);
    }
  }
  // Some account settings combine pro IMAP and ordinary SMTP within the same data center.
  assert.equal(accountFromEnv(env('imappro.zoho.eu', 'smtp.zoho.eu')).smtp, 'smtp.zoho.eu');
  for (const key of ['MAIL_ADDRESS', 'MAIL_APP_PASSWORD', 'MAIL_IMAP_HOST', 'MAIL_SMTP_HOST']) {
    assert.throws(() => accountFromEnv({ ...env(), [key]: '' }), { code: 'MISSING_INPUT' });
  }
  assert.throws(() => accountFromEnv(env('imap.zoho.com', 'smtp.zoho.eu')), { code: 'INVALID_SERVER_PAIR' });
  assert.throws(() => accountFromEnv(env('imap.zoho.com', 'smtp.zoho.com', 'a\r\nb@custom.test')), { code: 'INVALID_ADDRESS' });
  const old = accountFromEnv({ ...env('attacker.invalid', 'attacker.invalid'), MAIL_PROVIDER: 'qq-mail', MAIL_ADDRESS: 'fixture@qq.com' });
  assert.equal(old.imap, 'imap.qq.com'); assert.equal(old.smtp, 'smtp.qq.com');
});

test('malicious or invented Zoho hosts and cross-region pairs fail before either client is created', async () => {
  const malicious = ['https://imap.zoho.eu', 'imap.zoho.eu:993', 'imap.zoho.eu/path', 'imap.zoho.eu@evil.test',
    'imap.zoho.eu.evil.test', 'evil.zoho.eu', '127.0.0.1', '[::1]', 'imap.zoho.eu.', 'imap.zoho.eu\r\nAUTH',
    'іmap.zoho.eu', 'imappro.zoho.com.au', 'imappro.zohocloud.ca', 'imap.zoho.ca', '*'];
  let connections = 0;
  const create = () => { connections++; throw new Error('Network must not start'); };
  for (const host of malicious) {
    for (const key of ['MAIL_IMAP_HOST', 'MAIL_SMTP_HOST']) {
      const mail = new MailService({ env: { ...env(), [key]: host }, createImap: create, createSmtp: create });
      await assert.rejects(mail.invoke('mail_check_account'), { code: 'INVALID_SERVER' });
    }
  }
  const mail = new MailService({ env: env('imappro.zoho.eu', 'smtppro.zoho.com'), createImap: create, createSmtp: create });
  await assert.rejects(mail.invoke('mail_check_account'), { code: 'INVALID_SERVER_PAIR' });
  await assert.rejects(mail.invoke('mail_check_account', { host: 'imap.zoho.com' }), { code: 'INVALID_ARGUMENT' });
  assert.equal(connections, 0);
});

test('all documented Zoho host selections authenticate once per protocol with full custom-domain login and TLS', async t => {
  const f = await fixture(t);
  for (const [imap, smtp] of hosts) {
    const checked = await service(f, env(imap, smtp)).invoke('mail_check_account');
    assert.equal(checked.status, 'connected'); assert.equal(checked.address, 'member@custom.test');
  }
  assert.deepEqual(f.options.map(o => o.host), hosts.flat());
  assert.equal(f.connections, hosts.length); assert.equal(f.smtpAuth.length, hosts.length);
  assert.ok([...f.imapAuth, ...f.smtpAuth].every(address => address === 'member@custom.test'));
  assert.ok(f.smtpSecure.every(Boolean));
  for (const options of f.options) {
    assert.equal(options.secure, true); assert.equal(options.tls.rejectUnauthorized, true);
    assert.equal(options.tls.minVersion, 'TLSv1.2'); assert.equal(options.tls.servername, options.host);
    assert.equal(options.port, options.host.startsWith('imap') ? 993 : 465);
  }
  assert.deepEqual(f.writes, []); assert.deepEqual(f.deliveries, []);
});

test('wrong region, plan and administrator rejections preserve real redacted errors without host or credential retries', async t => {
  const f = await fixture(t); f.authFailure = true;
  const reasons = ['Account belongs to a different data center', 'IMAP access is not available for this plan', 'IMAP disabled by administrator', 'Authentication failed'];
  const configuration = env();
  for (const reason of reasons) {
    f.authFailureText = reason;
    const checked = await service(f, configuration).invoke('mail_check_account');
    assert.equal(checked.status, 'failed');
    for (const protocol of ['imap', 'smtp']) {
      const error = checked.checks[protocol].error;
      assert.equal(error.code, 'AUTHENTICATION_FAILED'); assert.ok(error.serverResponse.includes(reason));
      assert.match(error.serverResponse, /\[redacted\]/); assert.match(error.message, /plan eligibility and organization policy/);
      assert.ok(!/wrong password|must upgrade/i.test(error.message));
    }
    assert.equal(checked.checks.imap.error.responseStatus, 'NO'); assert.equal(checked.checks.smtp.error.responseCode, 535);
    assert.ok(!JSON.stringify(checked).includes(PASSWORD));
  }
  assert.equal(f.connections, reasons.length); assert.equal(f.smtpAuth.length, reasons.length);
  assert.deepEqual(f.options.map(o => o.host), reasons.flatMap(() => ['imappro.zoho.eu', 'smtppro.zoho.eu']));
  assert.deepEqual(f.writes, []); assert.deepEqual(f.deliveries, []);
  const response = `${PASSWORD}\r\n${Buffer.from(PASSWORD).toString('base64')}\u202e ${Buffer.from(`\0member@custom.test\0${PASSWORD}`).toString('base64')} ${'x'.repeat(600)}`;
  const output = publicError({ code: 'EAUTH', response }, configuration);
  assert.ok(!JSON.stringify(output).includes(PASSWORD)); assert.ok(!output.error.serverResponse.includes(Buffer.from(PASSWORD).toString('base64')));
  assert.ok(output.error.serverResponse.length <= 512); assert.ok(!/[\r\n\u202e]/.test(output.error.serverResponse));
  assert.equal(publicError({ code: 'EAUTH', response }).error.serverResponse, undefined);
});

test('Zoho TLS trust and hostname failures never authenticate, downgrade or retry', async t => {
  const f = await fixture(t);
  for (const trust of [false, true]) {
    const tls = { servername: 'wrong-host.invalid', ...(trust && { ca: f.cert }) };
    const mail = service(f, env(), {
      createImap: options => { f.options.push(options); return new ImapFlow({ ...options, host: '127.0.0.1', port: f.imapPort, servername: tls.servername, tls: { ...options.tls, ...tls } }); },
      createSmtp: options => { f.options.push(options); return new SMTPConnection({ ...options, host: '127.0.0.1', port: f.smtpPort, tls: { ...options.tls, ...tls } }); },
    });
    const checked = await mail.invoke('mail_check_account');
    assert.equal(checked.checks.imap.error.code, 'TLS_FAILED'); assert.equal(checked.checks.smtp.error.code, 'TLS_FAILED');
  }
  assert.equal(f.options.length, 4); assert.ok(f.options.every(o => o.secure && o.tls.rejectUnauthorized));
  assert.deepEqual(f.imapAuth, []); assert.deepEqual(f.smtpAuth, []); assert.deepEqual(f.deliveries, []);
});

test('Zoho shares UID pagination, inert reads, real reply drafts, sends, attachments, state changes and safe moves', async t => {
  const f = await fixture(t); await f.add('INBOX', await sampleMail()); await f.add('INBOX', await sampleMail());
  const mail = service(f), page = await search(mail, { limit: 1, unread: true });
  assert.ok(page.nextCursor);
  const next = await search(mail, { limit: 1, unread: true, cursor: page.nextCursor });
  assert.notEqual(next.messages[0].id, page.messages[0].id);
  const id = page.messages[0].id;
  await assert.rejects(service(f, env('imappro.zoho.com', 'smtppro.zoho.com')).invoke('mail_read_message', { id }), { code: 'INVALID_ID' });
  await assert.rejects(search(service(f, env('imappro.zoho.com', 'smtppro.zoho.com')), { limit: 1, unread: true, cursor: page.nextCursor }), { code: 'INVALID_CURSOR' });
  const read = await mail.invoke('mail_read_message', { id });
  assert.equal(read.subject, '项目更新'); assert.match(read.text, /中文正文/); assert.match(read.html, /external.invalid/);
  assert.equal(read.date, '2026-11-16T10:30:00.000Z'); assert.equal(read.externalResourcesLoaded, false);
  assert.ok(f.folders.get('INBOX').messages.every(m => !m.flags.has('\\Seen')));
  assert.deepEqual(f.writes, []); assert.deepEqual(f.deliveries, []);
  assert.ok(f.commands.some(c => c.verb === 'EXAMINE'));
  assert.ok(f.commands.filter(c => c.verb === 'UID FETCH' && c.line.includes('BODY')).every(c => c.line.includes('BODY.PEEK')));
  const downloaded = await mail.invoke('mail_download_attachment', { id, attachment: 0, directory: f.directory });
  assert.equal(path.dirname(downloaded.path), f.directory); assert.equal((await stat(downloaded.path)).mode & 0o777, 0o600);
  assert.match(await readFile(downloaded.path, 'utf8'), /PDF-controlled/);
  const draft = await mail.invoke('mail_save_draft', { replyToMessageId: id, text: '中文回复', bcc: ['private@example.test'] });
  assert.equal(draft.status, 'draft_saved'); assert.equal(draft.folder, 'Ideas'); assert.ok(draft.id);
  assert.equal(f.folders.get('Ideas').messages[0].mail.inReplyTo, '<original@example.test>');
  assert.equal(f.folders.get('Ideas').messages[0].mail.bcc.value[0].address, 'private@example.test'); assert.equal(f.deliveries.length, 0);
  const upload = path.join(f.directory, '报告.txt'); await writeFile(upload, '选定附件');
  const sent = await mail.invoke('mail_send_message', { replyToMessageId: id, html: '<p>中文回复</p>', attachments: [upload] });
  assert.equal(sent.status, 'smtp_accepted'); assert.equal(sent.deliveryConfirmed, false); assert.equal(f.deliveries.length, 1);
  const message = await simpleParser(f.deliveries[0].raw);
  assert.equal(message.from.value[0].address, 'member@custom.test'); assert.equal(message.to.value[0].address, 'reply@example.test');
  assert.deepEqual(message.references, ['<previous@example.test>', '<original@example.test>']);
  assert.equal(message.attachments[0].filename, '报告.txt'); assert.equal(message.attachments[0].content.toString(), '选定附件');
  await mail.invoke('mail_set_read', { id, read: true });
  const moved = await mail.invoke('mail_move_message', { id, folder: 'Archive' });
  assert.equal(moved.status, 'moved'); assert.ok(moved.id);
  assert.ok((await mail.invoke('mail_read_message', { id: moved.id })).flags.includes('\\Seen'));
  await assert.rejects(mail.invoke('mail_read_message', { id }), { code: 'MESSAGE_NOT_FOUND' });
  f.folders.get('Archive').validity++;
  await assert.rejects(mail.invoke('mail_read_message', { id: moved.id }), { code: 'STALE_MESSAGE_ID' });
  assert.ok(!f.commands.some(c => /EXPUNGE|DELETE/.test(c.verb)));
  f.smtpMode = 'disconnect';
  await assert.rejects(mail.invoke('mail_send_message', { to: ['recipient@example.test'], text: 'one attempt' }), { code: 'SEND_UNKNOWN', status: 'send_unknown' });
  assert.equal(f.deliveries.length, 2);
});

test('Zoho bundle runs outside the repository with no dependency lookup, discovers tools and executes controlled mail calls', async t => {
  const f = await fixture(t); await f.add('INBOX', await sampleMail());
  const root = await mkdtemp(path.join(tmpdir(), 'wevir-zoho-standalone-')); t.after(() => rm(root, { recursive: true, force: true }));
  const plugin = path.join(root, 'zoho-mail'); await cp(path.join(ROOT, 'plugins/zoho-mail'), plugin, { recursive: true });
  const preload = path.join(root, 'redirect.mjs'), ca = path.join(root, 'fixture-ca');
  await cp(path.join(ROOT, 'lib/mail/test/redirect.mjs'), preload); await writeFile(ca, f.cert);
  const client = new Client({ name: 'zoho-standalone-test', version: '1.0.0' }); t.after(() => client.close());
  const stderr = [], transport = new StdioClientTransport({ command: process.execPath,
    args: ['--import', preload, path.join(plugin, 'server/index.mjs')], cwd: root,
    env: { PATH: process.env.PATH, ...env(), NODE_PATH: '', NODE_EXTRA_CA_CERTS: ca,
      FIXTURE_IMAP_PORT: String(f.imapPort), FIXTURE_SMTP_PORT: String(f.smtpPort) }, stderr: 'pipe' });
  transport.stderr.on('data', data => stderr.push(data.toString()));
  await client.connect(transport);
  const tools = (await client.listTools()).tools;
  assert.equal(tools.length, 9); assert.equal(tools.find(tool => tool.name === 'mail_read_message').annotations.readOnlyHint, true);
  assert.equal(tools.find(tool => tool.name === 'mail_save_draft').annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === 'mail_send_message').annotations.readOnlyHint, false);
  assert.equal(tools.find(tool => tool.name === 'mail_move_message').annotations.destructiveHint, true);
  assert.equal(value(await client.callTool({ name: 'mail_check_account', arguments: {} })).status, 'connected');
  const call = (name, args = {}) => client.callTool({ name, arguments: args });
  assert.ok(value(await call('mail_list_folders')).folders.some(folder => folder.path === 'Ideas'));
  const id = value(await call('mail_search_messages', { folder: 'INBOX' })).messages[0].id;
  assert.match(value(await call('mail_read_message', { id })).text, /中文/);
  assert.equal(value(await call('mail_save_draft', { replyToMessageId: id, text: '独立草稿' })).status, 'draft_saved');
  assert.equal(value(await call('mail_send_message', { replyToMessageId: id, text: '受控发送' })).status, 'smtp_accepted');
  assert.equal(f.deliveries.length, 1);
  f.authFailure = true; f.authFailureText = 'IMAP disabled by administrator';
  const failed = await call('mail_check_account'); assert.equal(failed.isError, true);
  assert.match(value(failed).checks.imap.error.serverResponse, /disabled by administrator/);
  assert.ok(!JSON.stringify(failed).includes(PASSWORD)); assert.ok(!stderr.join('').includes(PASSWORD));
});

test('building only Zoho leaves other bundles untouched and publishes accurate official catalog metadata', async t => {
  const buildRoot = await mkdtemp(path.join(tmpdir(), 'wevir-zoho-build-')); t.after(() => rm(buildRoot, { recursive: true, force: true }));
  await mkdir(path.join(buildRoot, 'scripts'));
  await cp(path.join(ROOT, 'lib/mail'), path.join(buildRoot, 'lib/mail'), { recursive: true });
  await cp(path.join(ROOT, 'scripts/build-mail.mjs'), path.join(buildRoot, 'scripts/build-mail.mjs'));
  await cp(path.join(ROOT, 'package-lock.json'), path.join(buildRoot, 'package-lock.json'));
  await symlink(path.join(ROOT, 'node_modules'), path.join(buildRoot, 'node_modules'), 'dir');
  for (const id of [...legacy, 'zoho-mail']) await cp(path.join(ROOT, 'plugins', id), path.join(buildRoot, 'plugins', id), { recursive: true });
  const before = await Promise.all(legacy.map(id => stat(path.join(buildRoot, 'plugins', id, 'server/index.mjs'))));
  const output = execFileSync(process.execPath, ['scripts/build-mail.mjs', 'zoho-mail'], { cwd: buildRoot, encoding: 'utf8' });
  assert.match(output, /zoho-mail:/); assert.ok(!output.includes('gmail:'));
  for (const [index, id] of legacy.entries()) assert.equal((await stat(path.join(buildRoot, 'plugins', id, 'server/index.mjs'))).mtimeMs, before[index].mtimeMs);
  const out = await mkdtemp(path.join(tmpdir(), 'wevir-zoho-index-')); t.after(() => rm(out, { recursive: true, force: true }));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  execFileSync(process.execPath, ['scripts/build-index.mjs', '--commit', commit, '--out', out], { cwd: ROOT });
  const entry = JSON.parse(await readFile(path.join(out, 'index.json'), 'utf8')).entries.find(e => e.id === 'zoho-mail');
  assert.equal(entry.version, '1.0.0'); assert.equal(entry.category, 'communication'); assert.equal(entry.verification.level, 'official');
  assert.equal(entry.verification.since, '2026-11');
  assert.deepEqual(entry.verification.note, { 'zh-CN': '由 Wevir 维护的本地邮件插件，通过 IMAP/SMTP 连接 Zoho Mail', en: 'Local mail plugin maintained by Wevir, connecting to Zoho Mail over IMAP/SMTP' });
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'plugins/zoho-mail/wevir-plugin.json'), 'utf8'));
  assert.equal(manifest.author.name, 'Wevir'); assert.equal(manifest.verification, undefined);
  assert.equal(manifest.connectors.mail.command, 'node'); assert.deepEqual(manifest.connectors.mail.args, ['${pluginDir}/server/index.mjs']);
  assert.equal(manifest.connectors.mail.env.MAIL_PROVIDER, 'zoho-mail');
  assert.ok(manifest.inputs.every(input => input.required)); assert.equal(manifest.inputs.find(input => input.key === 'MAIL_APP_PASSWORD').secret, true);
  const files = await readdir(path.join(ROOT, 'plugins/zoho-mail'), { recursive: true });
  assert.ok(files.includes('server/THIRD-PARTY-NOTICES.txt')); assert.ok(files.includes('server/build-info.json'));
  assert.ok(!files.some(file => /node_modules|test\/|\.pem$|\.map$/.test(file)));
});
