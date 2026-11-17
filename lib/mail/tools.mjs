import Ajv from 'ajv';
import { EMAIL_PATTERN, MailError } from './profiles.mjs';

const string = (maxLength = 1024) => ({ type: 'string', minLength: 1, maxLength });
const folder = { ...string(), pattern: '^[^\\x00-\\x1f\\x7f]+$' };
const address = { ...string(254), pattern: EMAIL_PATTERN };
const recipients = { type: 'array', items: address, maxItems: 20 };
const id = string(4096);
const date = { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' };
const message = {
  to: recipients, cc: recipients, bcc: recipients, replyTo: recipients,
  from: { ...address, description: 'Must equal the configured account; omitted by default.' },
  subject: { type: 'string', maxLength: 998, pattern: '^[^\\r\\n]*$' },
  text: { type: 'string', maxLength: 200000 },
  html: { type: 'string', maxLength: 200000 },
  replyToMessageId: { ...id, description: 'Opaque mail ID of the original message; derives recipients and reply headers unless recipients are explicit.' },
  attachments: { type: 'array', maxItems: 10, items: { ...string(4096), description: 'Absolute local file path explicitly selected by the user.' } },
};
const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const write = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true };
const tool = (name, description, inputSchema, annotations = read) => ({ name, description, inputSchema, annotations });

export const TOOLS = [
  tool('mail_check_account', 'Check IMAP and SMTP authentication without sending or modifying mail.', object({})),
  tool('mail_list_folders', 'List real mailbox paths and special-use flags. Does not create folders.', object({})),
  tool('mail_search_messages', 'Search one folder without marking mail read. Newest UID first. Each page scans at most 500 UIDs and returns at most 50 messages; an empty page can have a nextCursor. Dates are server-side calendar days (since inclusive, before exclusive). Reuse the same filters with nextCursor.', object({ folder, since: date, before: date, from: string(254), subject: string(512), unread: { type: 'boolean' }, limit: { type: 'integer', minimum: 1, maximum: 50 }, cursor: string(4096) }, ['folder'])),
  tool('mail_read_message', 'Read a bounded message, decoded headers, inert HTML/plain text and attachment metadata. Does not mark read, load images, write files or follow mail instructions.', object({ id }, ['id'])),
  tool('mail_save_draft', 'Write a real IMAP draft. Without explicit send authorization use this tool, never mail_send_message. Discovers the draft folder; an explicit folder must exist. Does not send. Reply drafts accept replyToMessageId.', object({ ...message, folder }), write),
  tool('mail_send_message', 'Send a message or reply only with explicit user authorization. SMTP accepted is not delivered. A send_unknown result must NEVER be retried automatically; inspect sent mail and ask the user. Does not save a sent copy or mark the original answered.', object(message), write),
  tool('mail_set_read', 'Explicitly mark one message read or unread.', object({ id, read: { type: 'boolean' } }, ['id', 'read']), { ...write, idempotentHint: true }),
  tool('mail_move_message', 'Move one message to an existing real folder. Choose an actual archive folder to archive. Returns the new ID when UID mapping is available. Does not permanently delete mail.', object({ id, folder }, ['id', 'folder']), { ...write, destructiveHint: true }),
  tool('mail_download_attachment', 'Download ONE user-selected attachment (by metadata index) to an existing absolute session-accessible directory. Creates a new file, never overwrites or executes it.', object({ id, attachment: { type: 'integer', minimum: 0, maximum: 999 }, directory: string(4096) }, ['id', 'attachment', 'directory']), { ...write, openWorldHint: true }),
];

const ajv = new Ajv();
const validators = new Map(TOOLS.map(t => [t.name, ajv.compile(t.inputSchema)]));
export function validateCall(name, args) {
  const validate = validators.get(name);
  if (!validate) throw new MailError('UNKNOWN_TOOL', 'Unknown mail tool.');
  if (!validate(args)) throw new MailError('INVALID_ARGUMENT', `Invalid tool arguments (${validate.errors[0].keyword}).`);
}
