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
};

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
  const profile = PROVIDERS[provider]?.[address.split('@')[1]];
  if (!profile) throw new MailError('UNSUPPORTED_ACCOUNT', 'This plugin does not support the email domain.');
  return { provider, address, password, ...profile, imapPort: 993, smtpPort: 465 };
}

export function publicError(error) {
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
  return { status: 'failed', error: { code: kind, message, ...(responseCode && { responseCode }) } };
}
