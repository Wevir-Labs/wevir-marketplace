// Test-only preload: redirect the fixed production TLS endpoints to loopback fixtures.
import tls from 'node:tls';
import net from 'node:net';
import dns from 'node:dns';
import { syncBuiltinESMExports } from 'node:module';

const connect = tls.connect;
tls.connect = function (options, ...args) {
  const name = options.servername ?? options.host;
  if (!options.socket && /^(imap|smtp)\.(qq\.com|163\.com|126\.com|sina\.com|sina\.cn|mail\.me\.com|mail\.yahoo\.com|gmail\.com)$/.test(name)) {
    options = { ...options, host: '127.0.0.1', port: Number(process.env[name.startsWith('imap.') ? 'FIXTURE_IMAP_PORT' : 'FIXTURE_SMTP_PORT']) };
  }
  return connect.call(this, options, ...args);
};
const plainConnect = net.connect;
net.connect = function (options, ...args) {
  if (options.host === 'smtp.mail.me.com' || Number(options.port) === 587) {
    options = { ...options, host: '127.0.0.1', port: Number(process.env.FIXTURE_STARTTLS_PORT) };
  }
  return plainConnect.call(this, options, ...args);
};
dns.resolve4 = (name, options, callback) => {
  if (typeof options === 'function') callback = options;
  queueMicrotask(() => callback(null, options?.ttl ? [{ address: '127.0.0.1', ttl: 60 }] : ['127.0.0.1']));
};
dns.resolve6 = (name, options, callback) => {
  if (typeof options === 'function') callback = options;
  queueMicrotask(() => callback(null, []));
};
syncBuiltinESMExports();
