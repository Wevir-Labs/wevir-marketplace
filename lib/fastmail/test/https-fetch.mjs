import { request } from 'node:https';

export function fixtureFetch(input, options, { port, ca } = {}) {
  const url = new URL(input);
  if (!['caldav.fastmail.com', 'carddav.fastmail.com'].includes(url.hostname) || url.protocol !== 'https:') throw new Error('Fixture refuses production or third-party network');
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: Number(port), path: url.pathname, method: options.method,
      servername: url.hostname, ca, rejectUnauthorized: true, minVersion: 'TLSv1.2', signal: options.signal,
      headers: { ...Object.fromEntries(new Headers(options.headers)), host: url.hostname } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve(new Response(response.statusCode === 204 ? null : Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
    });
    req.on('error', reject);
    req.end(options.body);
  });
}
