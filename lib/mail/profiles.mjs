export const CLIENT_INFO = {
  name: 'Wevir Mail',
  version: '1.0.0',
  vendor: 'Wevir',
  'support-url': 'https://github.com/Wevir-Labs/wevir-marketplace',
};

export const PROVIDERS = {
  'qq-mail': {
    'qq.com': { imap: 'imap.qq.com', smtp: 'smtp.qq.com' },
    'foxmail.com': { imap: 'imap.qq.com', smtp: 'smtp.qq.com' },
  },
  'netease-mail': {
    '163.com': { imap: 'imap.163.com', smtp: 'smtp.163.com' },
    '126.com': { imap: 'imap.126.com', smtp: 'smtp.126.com' },
  },
  'sina-mail': {
    'sina.com': { imap: 'imap.sina.com', smtp: 'smtp.sina.com' },
    'sina.cn': { imap: 'imap.sina.cn', smtp: 'smtp.sina.cn' },
  },
  'icloud-mail': {
    'icloud.com': { imap: 'imap.mail.me.com', smtp: 'smtp.mail.me.com', smtpPort: 587 },
    'me.com': { imap: 'imap.mail.me.com', smtp: 'smtp.mail.me.com', smtpPort: 587 },
    'mac.com': { imap: 'imap.mail.me.com', smtp: 'smtp.mail.me.com', smtpPort: 587 },
  },
  'yahoo-mail': {
    '*': { imap: 'imap.mail.yahoo.com', smtp: 'smtp.mail.yahoo.com' },
  },
  gmail: {
    'gmail.com': { imap: 'imap.gmail.com', smtp: 'smtp.gmail.com' },
    'googlemail.com': { imap: 'imap.gmail.com', smtp: 'smtp.gmail.com' },
  },
  'zoho-mail': { '*': {} },
  fastmail: { '*': { imap: 'imap.fastmail.com', smtp: 'smtp.fastmail.com' } },
};

// Exact hosts from Zoho's account guides and regional Thunderbird configuration documents.
export const ZOHO_SERVERS = [
  { imap: ['imap.zoho.com', 'imappro.zoho.com'], smtp: ['smtp.zoho.com', 'smtppro.zoho.com'] },
  { imap: ['imap.zoho.eu', 'imappro.zoho.eu'], smtp: ['smtp.zoho.eu', 'smtppro.zoho.eu'] },
  { imap: ['imap.zoho.in', 'imappro.zoho.in'], smtp: ['smtp.zoho.in', 'smtppro.zoho.in'] },
  { imap: ['imap.zoho.com.au'], smtp: ['smtp.zoho.com.au'] },
  { imap: ['imap.zoho.jp'], smtp: ['smtp.zoho.jp'] },
  { imap: ['imap.zoho.com.cn'], smtp: ['smtp.zoho.com.cn'] },
  { imap: ['imap.zohocloud.ca'], smtp: ['smtp.zohocloud.ca'] },
  { imap: ['imap.zoho.sa'], smtp: ['smtp.zoho.sa'] },
  { imap: ['imap.zoho.ae'], smtp: ['smtp.zoho.ae'] },
];

export class MailError extends Error {
  constructor(code, message, status = 'failed') {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export const EMAIL_PATTERN = '^[A-Za-z0-9.!#$%&\u0027*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\\.[A-Za-z]{2,63}$';
const email = new RegExp(EMAIL_PATTERN);

export function accountFromEnv(env) {
  const provider = env.MAIL_PROVIDER;
  const address = env.MAIL_ADDRESS?.trim().toLowerCase();
  const password = env.MAIL_APP_PASSWORD;
  if (!address || !password) throw new MailError('MISSING_INPUT', 'Set MAIL_ADDRESS and MAIL_APP_PASSWORD in the plugin inputs.');
  if (!email.test(address) || address.length > 254) throw new MailError('INVALID_ADDRESS', 'Enter a complete email address.');
  const profiles = PROVIDERS[provider];
  const profile = profiles?.[address.split('@')[1]] ?? profiles?.['*'];
  if (!profile) throw new MailError('UNSUPPORTED_ACCOUNT', 'This plugin does not support the email domain.');
  if (provider === 'zoho-mail') {
    const imap = env.MAIL_IMAP_HOST?.trim().toLowerCase(), smtp = env.MAIL_SMTP_HOST?.trim().toLowerCase();
    if (!imap || !smtp) throw new MailError('MISSING_INPUT', 'Copy MAIL_IMAP_HOST and MAIL_SMTP_HOST from Zoho Server Configuration Details.');
    const region = ZOHO_SERVERS.find(hosts => hosts.imap.includes(imap));
    if (!region || !ZOHO_SERVERS.some(hosts => hosts.smtp.includes(smtp))) {
      throw new MailError('INVALID_SERVER', 'Use supported Zoho hostnames from Server Configuration Details, without a scheme, port or path.');
    }
    if (!region.smtp.includes(smtp)) throw new MailError('INVALID_SERVER_PAIR', 'Both Zoho hosts must belong to the account data center. Check Server Configuration Details.');
    return { provider, address, password, imapPort: 993, smtpPort: 465, imap, smtp };
  }
  return { provider, address, password, imapPort: 993, smtpPort: 465, ...profile };
}

export function publicError(error, env = {}) {
  if (error instanceof MailError) return { status: error.status, error: { code: error.code, message: error.message } };
  const code = [error?.code, error?.originalCode].filter(Boolean).join(' ');
  let kind = 'MAIL_ERROR';
  let message = 'The mail operation failed.';
  if (error?.authenticationFailed || /EAUTH|AuthenticationFailed/.test(code)) {
    kind = 'AUTHENTICATION_FAILED';
    message = 'Authentication failed. Check the address, client authorization code and IMAP/SMTP service settings.';
  } else if (/TLS|CERT|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/.test(code)) {
    kind = 'TLS_FAILED'; message = 'TLS certificate verification or negotiation failed.';
  } else if (/TIMEOUT|TIMEDOUT|Timeout/i.test(code)) {
    kind = 'TIMEOUT'; message = 'The mail server timed out.';
  } else if (/ENOTFOUND|EAI_AGAIN|EDNS/.test(code)) {
    kind = 'DNS_FAILED'; message = 'The configured mail server could not be resolved.';
  } else if (/CONNECTION|ECONN|ESOCKET|Socket|NoConnection|Closed/i.test(code)) {
    kind = 'CONNECTION_FAILED'; message = 'The connection to the mail server failed or closed.';
  } else if (/EACCES|EPERM|ENOENT|ELOOP|EEXIST|ENOTDIR/.test(code)) {
    kind = 'FILE_ACCESS_FAILED'; message = 'The selected file or directory cannot be accessed safely.';
  } else if (error?.responseStatus || Number.isInteger(error?.responseCode)) {
    kind = 'SERVER_REJECTED'; message = 'The mail server rejected the operation.';
  }
  const responseCode = Number.isInteger(error?.responseCode) ? error.responseCode : undefined;
  const result = { status: 'failed', error: { code: kind, message, ...(responseCode && { responseCode }) } };
  if (['zoho-mail', 'fastmail'].includes(env.MAIL_PROVIDER) && ['AUTHENTICATION_FAILED', 'SERVER_REJECTED'].includes(kind)) {
    if (kind === 'AUTHENTICATION_FAILED') result.error.message = env.MAIL_PROVIDER === 'fastmail'
      ? 'Authentication failed. Check the original full Fastmail login, app password and Mail permission. Basic plans exclude IMAP/SMTP/CalDAV/CardDAV; this response alone does not identify the cause.'
      : 'Authentication failed. Check Server Configuration Details, the full address and app password, IMAP access, plan eligibility and organization policy.';
    let response = error.responseText ?? error.response;
    if (typeof response === 'string') {
      const password = env.MAIL_APP_PASSWORD;
      if (password) {
        for (const value of [password, Buffer.from(password).toString('base64'), JSON.stringify(password).slice(1, -1),
          Buffer.from(`\0${env.MAIL_ADDRESS?.trim().toLowerCase()}\0${password}`).toString('base64')]) {
          response = response.split(value).join('[redacted]');
        }
      }
      result.error.serverResponse = response.replace(/[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, 512);
    }
    if (['NO', 'BAD'].includes(error.responseStatus)) result.error.responseStatus = error.responseStatus;
  }
  return result;
}
