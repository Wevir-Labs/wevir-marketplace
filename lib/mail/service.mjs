import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { open, realpath, rm } from 'node:fs/promises';
import path from 'node:path';
import { CLIENT_INFO, accountFromEnv, MailError, publicError } from './profiles.mjs';
import { validateCall } from './tools.mjs';

export const LIMITS = { message: 12 * 1024 * 1024, attachment: 10 * 1024 * 1024, text: 200000, uidWindow: 500 };
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const callback = fn => new Promise((resolve, reject) => fn((err, result) => err ? reject(err) : resolve(result)));
const missing = () => new MailError('MESSAGE_NOT_FOUND', 'The message is no longer in this folder. Search again.');
function decode(value) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new MailError('INVALID_ID', 'Invalid message ID or cursor.'); }
}
function positive(value) { return Number.isSafeInteger(value) && value > 0 && value <= 0xffffffff; }
function dateValue(value) {
  if (value === undefined) return undefined;
  const result = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(+result) || result.toISOString().slice(0, 10) !== value) throw new MailError('INVALID_DATE', 'Use a valid YYYY-MM-DD calendar date.');
  return result;
}
function requireResult(result) {
  if (!result) throw new MailError('SERVER_REJECTED', 'The mail server did not confirm the operation.');
  return result;
}
function requireWriteResult(client, result) {
  if (!result && !client.usable) throw new MailError('OPERATION_UNKNOWN', 'The write may have completed. Inspect the mailbox before retrying.', 'operation_unknown');
  return requireResult(result);
}
function assertFolder(folders, name) {
  const found = folders.find(f => f.path === name && !f.flags.has('\\Noselect'));
  if (!found) throw new MailError('FOLDER_NOT_FOUND', 'Select an existing selectable folder from mail_list_folders.');
  return found.path;
}
export function safeFilename(name) {
  let value = path.posix.basename(path.win32.basename(name || 'attachment.bin')).normalize('NFC')
    .replace(/[<>:"/\\|?*\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, '_').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 160);
  if (!value || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(value)) value = `attachment-${value || 'file'}`;
  return value;
}
async function fileContent(filename) {
  if (!path.isAbsolute(filename)) throw new MailError('INVALID_PATH', 'Attachment paths must be absolute.');
  const handle = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new MailError('INVALID_FILE', 'Attachments must be regular local files.');
    if (stat.size > LIMITS.attachment) throw new MailError('ATTACHMENT_TOO_LARGE', 'Attachments may total at most 10 MiB.');
    const chunks = [];
    let size = 0;
    for await (const chunk of handle.createReadStream({ autoClose: false })) {
      size += chunk.length;
      if (size > LIMITS.attachment) throw new MailError('ATTACHMENT_TOO_LARGE', 'Attachments may total at most 10 MiB.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  } finally { await handle.close(); }
}

export class MailService {
  constructor({ env = process.env, createImap, createSmtp, timeoutMs = 30000 } = {}) {
    this.env = env;
    this.createImap = createImap;
    this.createSmtp = createSmtp;
    this.timeoutMs = timeoutMs;
  }
  account() { return accountFromEnv(this.env); }
  accountKey(account) { return hash([account.provider, account.address, ...(account.provider === 'zoho-mail' ? [account.imap] : [])]).slice(0, 24); }
  messageId(account, folder, validity, uid) { return encode([1, this.accountKey(account), folder, String(validity), uid]); }
  messageRef(account, id) {
    const value = decode(id);
    if (!Array.isArray(value) || value.length !== 5 || value[0] !== 1 || value[1] !== this.accountKey(account) ||
      typeof value[2] !== 'string' || !value[2] || /[\x00-\x1f\x7f]/.test(value[2]) || !/^\d+$/.test(value[3]) || !positive(value[4])) {
      throw new MailError('INVALID_ID', 'The message ID does not belong to this account.');
    }
    return { folder: value[2], validity: value[3], uid: value[4] };
  }
  async withImap(account, action) {
    const options = {
      host: account.imap, port: account.imapPort, secure: true,
      auth: { user: account.address, pass: account.password },
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: account.imap },
      clientInfo: CLIENT_INFO, logger: false, disableAutoIdle: true,
      connectionTimeout: this.timeoutMs, greetingTimeout: this.timeoutMs, socketTimeout: this.timeoutMs,
    };
    const client = this.createImap ? this.createImap(options) : new (await import('./imap.mjs')).ImapFlow(options);
    client.on('error', () => {});
    const state = { writeStarted: false };
    let timer;
    try {
      return await Promise.race([
        (async () => { await client.connect(); return action(client, state); })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(state.writeStarted
          ? new MailError('OPERATION_UNKNOWN', 'The write may have completed. Inspect the mailbox before retrying.', 'operation_unknown')
          : new MailError('TIMEOUT', 'The mail operation timed out.')), this.timeoutMs); }),
      ]);
    } finally { clearTimeout(timer); client.close(); }
  }
  async withMessage(account, id, write, action) {
    const ref = this.messageRef(account, id);
    return this.withImap(account, async (client, state) => {
      const lock = await client.getMailboxLock(ref.folder, { readOnly: !write });
      try {
        if (String(client.mailbox.uidValidity) !== ref.validity) throw new MailError('STALE_MESSAGE_ID', 'The mailbox UIDVALIDITY changed. Search again before acting.');
        const item = await client.fetchOne(ref.uid, { uid: true, flags: true, size: true }, { uid: true });
        if (!item || item.uid !== ref.uid) throw missing();
        return await action(client, ref, item, state);
      } finally { lock.release(); }
    });
  }
  async read(account, id) {
    return this.withMessage(account, id, false, async (client, ref, item) => {
      if (item.size > LIMITS.message) throw new MailError('MESSAGE_TOO_LARGE', 'Message exceeds the 12 MiB read limit.');
      const fetched = await client.fetchOne(ref.uid, { source: { start: 0, maxLength: LIMITS.message + 1 } }, { uid: true });
      if (!fetched || fetched.uid !== ref.uid) throw missing();
      if (fetched.source.length > LIMITS.message) throw new MailError('MESSAGE_TOO_LARGE', 'Message exceeds the 12 MiB read limit.');
      const { simpleParser } = await import('./mime.mjs');
      const mail = await simpleParser(fetched.source, { skipImageLinks: true, skipTextToHtml: true, maxHtmlLengthToParse: LIMITS.text });
      return { mail, ref, flags: [...item.flags], ...(account.provider === 'gmail' && item.emailId && { gmailMessageId: item.emailId }) };
    });
  }
  async compose(account, args, draft) {
    if (args.from && args.from.toLowerCase() !== account.address) throw new MailError('SENDER_MISMATCH', 'The sender must equal the configured account.');
    if (args.text === undefined && args.html === undefined) throw new MailError('MISSING_BODY', 'Supply text or HTML for the message.');
    const message = { from: account.address, subject: args.subject ?? '', text: args.text, html: args.html,
      to: args.to ?? [], cc: args.cc ?? [], bcc: args.bcc ?? [], replyTo: args.replyTo ?? [],
      date: new Date(), messageId: `<${randomUUID()}@${account.address.split('@')[1]}>`,
      disableFileAccess: true, disableUrlAccess: true,
    };
    if (args.replyToMessageId) {
      const { mail } = await this.read(account, args.replyToMessageId);
      if (!args.to) message.to = (mail.replyTo ?? mail.from)?.value?.flatMap(a => a.address ? [a.address] : []) ?? [];
      if (args.subject === undefined) message.subject = /^re:/i.test(mail.subject ?? '') ? mail.subject : `Re: ${mail.subject ?? ''}`;
      if (mail.messageId) {
        message.inReplyTo = mail.messageId;
        message.references = [...(Array.isArray(mail.references) ? mail.references : mail.references ? [mail.references] : []), mail.messageId].slice(-50);
      }
    }
    const all = [...message.to, ...message.cc, ...message.bcc];
    if ((!draft && !all.length) || all.length > 20) throw new MailError('RECIPIENT_LIMIT', 'Sending requires 1–20 recipients in total.');
    // Derived reply addresses cross the same boundary as explicit tool input.
    validateCall('mail_send_message', { to: message.to, cc: message.cc, bcc: message.bcc, text: '' });
    message.attachments = [];
    let attachmentBytes = 0;
    for (const filename of args.attachments ?? []) {
      const content = await fileContent(filename);
      attachmentBytes += content.length;
      if (attachmentBytes > LIMITS.attachment) throw new MailError('ATTACHMENT_TOO_LARGE', 'Attachments may total at most 10 MiB.');
      message.attachments.push({ filename: safeFilename(filename), content });
    }
    const { MailComposer } = await import('./mime.mjs');
    const compiled = new MailComposer(message).compile();
    compiled.keepBcc = draft;
    const raw = await compiled.build();
    if (raw.length > LIMITS.message) throw new MailError('MESSAGE_TOO_LARGE', 'Encoded message exceeds 12 MiB.');
    return { raw, messageId: message.messageId, envelope: { from: account.address, to: [...new Set(all)] } };
  }
  async smtp(account, mail) {
    const options = {
      host: account.smtp, port: account.smtpPort, secure: account.smtpPort === 465, name: 'wevir.local',
      ...(account.smtpPort !== 465 && { requireTLS: true }),
      tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: account.smtp },
      connectionTimeout: this.timeoutMs, greetingTimeout: this.timeoutMs, socketTimeout: this.timeoutMs,
      logger: false, debug: false,
    };
    const client = this.createSmtp ? this.createSmtp(options) : new (await import('./smtp.mjs')).SMTPConnection(options);
    let submitted = false;
    let timer;
    try {
      return await Promise.race([
        (async () => {
          await callback(cb => client.connect(cb));
          await callback(cb => client.login({ user: account.address, pass: account.password }, cb));
          if (!mail) return { status: 'connected' };
          submitted = true;
          const info = await callback(cb => client.send(mail.envelope, mail.raw, cb));
          return { status: 'smtp_accepted', messageId: mail.messageId, accepted: info.accepted, rejected: info.rejected,
            deliveryConfirmed: false, note: 'SMTP acceptance does not confirm delivery.' };
        })(),
        new Promise((_, reject) => {
          client.once('error', reject);
          timer = setTimeout(() => reject(new MailError('TIMEOUT', 'The SMTP operation timed out.')), this.timeoutMs);
        }),
      ]);
    } catch (error) {
      const explicitRejection = Number.isInteger(error.responseCode) && error.responseCode >= 400;
      if (submitted && !explicitRejection) throw new MailError('SEND_UNKNOWN', 'Sending may have completed. Do not retry automatically; inspect sent mail and obtain user approval before another attempt.', 'send_unknown');
      throw error;
    } finally { clearTimeout(timer); client.close(); }
  }
  async invoke(name, args = {}) {
    validateCall(name, args);
    const account = this.account();
    switch (name) {
      case 'mail_check_account': {
        const checks = {};
        for (const protocol of ['imap', 'smtp']) {
          try {
            if (protocol === 'imap') await this.withImap(account, async () => {});
            else await this.smtp(account);
            checks[protocol] = { status: 'connected' };
          } catch (error) { checks[protocol] = publicError(error, this.env); }
        }
        return { provider: account.provider, address: account.address, status: Object.values(checks).every(c => c.status === 'connected') ? 'connected' : 'failed', checks };
      }
      case 'mail_list_folders': return this.withImap(account, async client => ({ folders: (await client.list()).map(f => ({ path: f.path, name: f.name,
        specialUse: account.provider !== 'gmail' || f.specialUseSource === 'extension' || f.path.toUpperCase() === 'INBOX' ? f.specialUse : undefined,
        selectable: !f.flags.has('\\Noselect') })) }));
      case 'mail_search_messages': return this.search(account, args);
      case 'mail_read_message': {
        const { mail, flags, gmailMessageId } = await this.read(account, args.id);
        const text = mail.text ?? '';
        const html = mail.html || '';
        return { id: args.id, flags, subject: mail.subject, date: mail.date?.toISOString(), headers: Object.fromEntries(mail.headers),
          from: mail.from?.value, to: mail.to?.value, cc: mail.cc?.value, replyTo: mail.replyTo?.value,
          messageId: mail.messageId, inReplyTo: mail.inReplyTo, references: [mail.references ?? []].flat(),
          ...(gmailMessageId && { gmailMessageId }),
          text: text.slice(0, LIMITS.text), html: html.slice(0, LIMITS.text), truncated: text.length > LIMITS.text || html.length > LIMITS.text,
          untrustedContent: true, externalResourcesLoaded: false,
          attachments: mail.attachments.map((a, index) => ({ index, filename: a.filename, contentType: a.contentType, size: a.size, contentId: a.contentId, disposition: a.contentDisposition })) };
      }
      case 'mail_save_draft': {
        const mail = await this.compose(account, args, true);
        return this.withImap(account, async (client, state) => {
          const folders = await client.list();
          const candidates = folders.filter(f => (account.provider === 'gmail' ? f.flags.has('\\Drafts') : f.specialUse === '\\Drafts') && !f.flags.has('\\Noselect'));
          const fallback = folders.filter(f => /^(drafts?|草稿箱?|草稿邮件)$/i.test(f.name) && !f.flags.has('\\Noselect'));
          const found = candidates.length === 1 ? candidates[0] : account.provider !== 'gmail' && fallback.length === 1 ? fallback[0] : undefined;
          const folder = args.folder ? assertFolder(folders, args.folder) : found?.path;
          if (!folder) throw new MailError('DRAFT_FOLDER_NOT_FOUND', 'No unambiguous drafts folder was found. List folders and select a real draft folder.');
          if (account.provider === 'gmail' && !candidates.some(f => f.path === folder)) throw new MailError('DRAFT_FOLDER_NOT_FOUND', 'Select the Gmail folder with the Drafts special-use flag.');
          let result;
          state.writeStarted = true;
          try { result = requireWriteResult(client, await client.append(folder, mail.raw, ['\\Draft'])); }
          catch (error) { throw this.writeError(error); }
          return { status: 'draft_saved', folder, messageId: mail.messageId,
            ...(result.uid && result.uidValidity && { id: this.messageId(account, folder, result.uidValidity, result.uid) }) };
        });
      }
      case 'mail_send_message': return this.smtp(account, await this.compose(account, args, false));
      case 'mail_set_read': return this.withMessage(account, args.id, true, async (client, ref, _item, state) => {
        state.writeStarted = true;
        try { requireWriteResult(client, await client[args.read ? 'messageFlagsAdd' : 'messageFlagsRemove'](ref.uid, ['\\Seen'], { uid: true })); }
        catch (error) { throw this.writeError(error); }
        return { status: 'updated', id: args.id, read: args.read };
      });
      case 'mail_move_message': return this.withMessage(account, args.id, true, async (client, ref, _item, state) => {
        if (account.provider === 'gmail') return this.moveGmail(client, ref, args.folder, state);
        const folder = assertFolder(await client.list(), args.folder);
        if (folder === ref.folder) throw new MailError('SAME_FOLDER', 'The message is already in that folder.');
        // UIDPLUS confines the library's COPY/STORE/EXPUNGE fallback to the selected UID.
        const nativeMove = client.capabilities.has('MOVE');
        if (!nativeMove && !client.capabilities.has('UIDPLUS')) throw new MailError('MOVE_UNSUPPORTED', 'This server does not support MOVE or safe UIDPLUS moves.');
        let moved;
        state.writeStarted = true;
        try {
          moved = await client.messageMove(ref.uid, folder, { uid: true });
          if (!moved && !nativeMove) throw new MailError('OPERATION_UNKNOWN', 'The move was not confirmed; a destination copy may exist. Inspect both folders before retrying.', 'operation_unknown');
          requireWriteResult(client, moved);
        }
        catch (error) { throw this.writeError(error); }
        const uid = moved.uidMap?.get(ref.uid);
        return { status: 'moved', folder, ...(uid && moved.uidValidity && { id: this.messageId(account, folder, moved.uidValidity, uid) }) };
      });
      case 'mail_download_attachment': {
        if (!path.isAbsolute(args.directory)) throw new MailError('INVALID_PATH', 'The destination directory must be absolute.');
        const directory = await realpath(args.directory);
        const { mail } = await this.read(account, args.id);
        const attachment = mail.attachments[args.attachment];
        if (!attachment) throw new MailError('ATTACHMENT_NOT_FOUND', 'Choose an attachment index from mail_read_message.');
        if (attachment.size > LIMITS.attachment) throw new MailError('ATTACHMENT_TOO_LARGE', 'Attachment exceeds 10 MiB.');
        const filename = path.join(directory, `${randomUUID().slice(0, 8)}-${safeFilename(attachment.filename)}`);
        const file = await open(filename, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        try { await file.writeFile(attachment.content); }
        catch (error) { await rm(filename, { force: true }); throw error; }
        finally { await file.close(); }
        return { status: 'downloaded', path: filename, size: attachment.size };
      }
    }
  }
  writeError(error) {
    const result = publicError(error);
    if (['TIMEOUT', 'CONNECTION_FAILED'].includes(result.error.code)) return new MailError('OPERATION_UNKNOWN', 'The write may have completed. Inspect the mailbox before retrying.', 'operation_unknown');
    return error;
  }
  async moveGmail(client, ref, destination, state) {
    const folders = await client.list();
    const folder = assertFolder(folders, destination);
    if (folder === ref.folder) throw new MailError('SAME_FOLDER', 'The message is already in that folder.');
    if (!client.capabilities.has('X-GM-EXT-1')) throw new MailError('MOVE_UNSUPPORTED', 'Safe Gmail moves require the Gmail label extension.');
    const source = folders.find(f => f.path === ref.folder), target = folders.find(f => f.path === folder);
    // ImapFlow also guesses special-use from names; only server flags identify Gmail system folders.
    const label = f => f.path.toUpperCase() === 'INBOX' ? '\\Inbox'
      : f.specialUseSource !== 'extension' && !/^(?:\[Gmail\]|\[GoogleMail\])(?:\/|$)|^\\/i.test(f.path) ? f.path : undefined;
    const from = label(source), to = label(target), archive = target.flags.has('\\All');
    if (!from || (!to && !archive)) throw new MailError('UNSAFE_GMAIL_MOVE', 'Move from Inbox or a user label to Inbox, a user label or All Mail. Other Gmail system folders are excluded.');
    let added = false;
    state.writeStarted = true;
    try {
      if (!archive) {
        requireWriteResult(client, await client.messageFlagsAdd(ref.uid, [to], { uid: true, useLabels: true }));
        added = true;
      }
      requireWriteResult(client, await client.messageFlagsRemove(ref.uid, [from], { uid: true, useLabels: true }));
    } catch (error) {
      if (added) throw new MailError('OPERATION_UNKNOWN', 'The destination label was added but removing the source was not confirmed. Inspect both labels before retrying.', 'operation_unknown');
      throw this.writeError(error);
    }
    return { status: 'moved', folder, note: 'Gmail labels updated. Search the destination for its current message ID.' };
  }
  async search(account, args) {
    const since = dateValue(args.since), before = dateValue(args.before);
    if (since && before && since >= before) throw new MailError('INVALID_DATE_RANGE', 'since must precede before.');
    const queryKey = hash([this.accountKey(account), args.folder, args.since, args.before, args.from, args.subject, args.unread]);
    return this.withImap(account, async client => {
      const lock = await client.getMailboxLock(args.folder, { readOnly: true });
      try {
        const validity = String(client.mailbox.uidValidity);
        let high = client.mailbox.uidNext - 1;
        if (args.cursor) {
          const cursor = decode(args.cursor);
          if (!Array.isArray(cursor) || cursor.length !== 4 || cursor[0] !== 1 || cursor[1] !== queryKey || !positive(cursor[3])) throw new MailError('INVALID_CURSOR', 'Reuse the same account, folder and filters with a search cursor.');
          if (cursor[2] !== validity) throw new MailError('STALE_CURSOR', 'The mailbox UIDVALIDITY changed. Restart the search.');
          high = Math.min(high, cursor[3]);
        }
        if (high < 1) return { messages: [], scannedUidRange: null, nextCursor: null };
        const low = Math.max(1, high - LIMITS.uidWindow + 1);
        const query = { uid: `${low}:${high}` };
        if (since) query.since = since;
        if (before) query.before = before;
        if (args.from) query.from = args.from;
        if (args.subject) query.subject = args.subject;
        if (args.unread !== undefined) query.seen = !args.unread;
        const hits = await client.search(query, { uid: true, strict: true });
        if (!Array.isArray(hits)) throw new MailError('SEARCH_FAILED', 'The mail server rejected the search.');
        const sorted = hits.filter(uid => uid >= low && uid <= high).sort((a, b) => b - a);
        const picked = sorted.slice(0, args.limit ?? 20);
        const items = picked.length ? await client.fetchAll(picked, { uid: true, flags: true, envelope: true, size: true, internalDate: true }, { uid: true }) : [];
        const messages = items.sort((a, b) => b.uid - a.uid).map(m => ({ id: this.messageId(account, args.folder, validity, m.uid),
          ...(account.provider === 'gmail' && m.emailId && { gmailMessageId: m.emailId }),
          subject: m.envelope?.subject, from: m.envelope?.from, to: m.envelope?.to, date: m.envelope?.date?.toISOString(), internalDate: m.internalDate?.toISOString(), flags: [...m.flags], size: m.size }));
        const next = sorted.length > picked.length ? picked.at(-1) - 1 : low - 1;
        return { messages, scannedUidRange: [low, high], nextCursor: next > 0 ? encode([1, queryKey, validity, next]) : null };
      } finally { lock.release(); }
    });
  }
}
