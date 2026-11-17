import { createHash } from 'node:crypto';
import { createObject, davRequest, propfind, updateObject } from 'tsdav';
import { accountFromEnv, MailError } from '../mail/profiles.mjs';

export const ORIGINS = { caldav: 'https://caldav.fastmail.com', carddav: 'https://carddav.fastmail.com' };
export const NS = { 'xmlns:d': 'DAV:', 'xmlns:c': 'urn:ietf:params:xml:ns:caldav', 'xmlns:a': 'urn:ietf:params:xml:ns:carddav' };
export const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export function decode(value) {
  try { return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')); }
  catch { throw new MailError('INVALID_ID', 'Invalid DAV ID or cursor.'); }
}
export function officialUrl(value, base, protocol) {
  let url;
  try { url = new URL(value, base); } catch { throw new MailError('UNSAFE_DAV_TARGET', 'Invalid Fastmail DAV target.'); }
  if (url.origin !== ORIGINS[protocol] || url.username || url.password || url.search || url.hash || /[\\\x00-\x20]/.test(value)) {
    throw new MailError('UNSAFE_DAV_TARGET', 'DAV discovery or redirect left the official Fastmail HTTPS service.');
  }
  return url.href;
}
export function davStatus(status, protocol) {
  const capability = protocol === 'caldav' ? 'Calendars' : 'Contacts';
  if (status === 401) throw new MailError('AUTHENTICATION_FAILED', `${capability} authentication failed. Check the original full login, app password and ${capability} permission. Basic plans exclude third-party protocols; the response alone does not identify the cause.`);
  if (status === 403) throw new MailError('PERMISSION_DENIED', `${capability} access denied. Check the app-password permission, resource privileges and plan. Basic plans exclude third-party protocols.`);
  if (status === 404) throw new MailError('NOT_FOUND', 'DAV resource no longer exists. Discover or search again.');
  if (status === 409 || status === 412) throw new MailError('CONFLICT', 'DAV resource changed. Read it again and review the changes before retrying.');
  if (status === 507) throw new MailError('RESULT_LIMIT', 'DAV result limit reached. Narrow the date range or contact search.');
  if (status >= 400) throw new MailError('DAV_SERVER_ERROR', `Fastmail ${capability} service returned HTTP ${status}.`);
}

export class DavService {
  constructor({ env = process.env, fetch = globalThis.fetch, timeoutMs = 30000 } = {}) {
    this.env = env; this.fetch = fetch; this.timeoutMs = timeoutMs;
  }
  accountKey() { const a = accountFromEnv(this.env); return hash(['fastmail', a.address]).slice(0, 24); }
  id(protocol, collection, resource = null) { return encode([1, this.accountKey(), protocol, collection, resource]); }
  ref(id, protocol, resourceRequired = false) {
    const v = decode(id);
    if (!Array.isArray(v) || v.length !== 5 || v[0] !== 1 || v[1] !== this.accountKey() || v[2] !== protocol ||
      typeof v[3] !== 'string' || !v[3].endsWith('/') || (resourceRequired ? typeof v[4] !== 'string' : v[4] !== null)) {
      throw new MailError('INVALID_ID', 'DAV ID does not identify the expected resource in this account.');
    }
    const collection = officialUrl(v[3], ORIGINS[protocol], protocol);
    const resource = v[4] === null ? null : this.childUrl(v[4], collection, protocol);
    return { collection, resource };
  }
  childUrl(href, collection, protocol) {
    const url = officialUrl(href, collection, protocol);
    const tail = url.slice(collection.length);
    if (!url.startsWith(collection) || !tail || tail.includes('/') || /%2f|%5c|%2e/i.test(tail)) {
      throw new MailError('INVALID_DAV_RESOURCE', 'Resource is outside the discovered DAV collection.');
    }
    return url;
  }
  transport(protocol) {
    const account = accountFromEnv(this.env);
    const authorization = `Basic ${Buffer.from(`${account.address}:${account.password}`).toString('base64')}`;
    return async (input, options = {}) => {
      let url = officialUrl(String(input), ORIGINS[protocol], protocol);
      const writing = options.method === 'PUT';
      try {
        for (let redirects = 0; redirects <= 3; redirects++) {
          const headers = new Headers(options.headers); headers.set('Authorization', authorization);
          const response = await this.fetch(url, { ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs) });
          if ([301, 302, 303, 307, 308].includes(response.status)) {
            await response.body?.cancel();
            const location = response.headers.get('location');
            if (!location) throw new MailError('DAV_REDIRECT_FAILED', 'DAV redirect has no target.');
            url = officialUrl(location, url, protocol);
            if (writing || ![301, 302, 307, 308].includes(response.status) || redirects === 3) throw new MailError('DAV_REDIRECT_FAILED', 'DAV redirect could not be followed safely. Discover resources again.');
            continue;
          }
          if (response.status >= 400) { await response.body?.cancel(); davStatus(response.status, protocol); }
          let size = 0;
          const chunks = [];
          if (response.body) {
            const reader = response.body.getReader();
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > 4 * 1024 * 1024) throw new MailError('RESULT_LIMIT', 'DAV response exceeds 4 MiB. Narrow the range or search.');
                chunks.push(value);
              }
            } finally { await reader.cancel(); }
          }
          const body = Buffer.concat(chunks).toString('utf8');
          if (/<!DOCTYPE|<!ENTITY/i.test(body)) throw new MailError('INVALID_DAV_DATA', 'DAV response contains unsupported XML declarations.');
          return new Response(response.status === 204 ? null : body, { status: response.status, headers: response.headers });
        }
      } catch (error) {
        if (error instanceof MailError) throw error;
        if (writing) throw new MailError('OPERATION_UNKNOWN', 'The DAV write may have completed. Inspect the resource before retrying.', 'operation_unknown');
        const code = `${error?.code ?? ''} ${error?.cause?.code ?? ''}`;
        throw new MailError(/TLS|CERT|SSL|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code) ? 'TLS_FAILED' : /Timeout|Abort/.test(error?.name) ? 'TIMEOUT' : 'DAV_CONNECTION_FAILED', 'Fastmail DAV connection or certificate verification failed. Check the network and retry the read.');
      }
    };
  }
  checked(results, protocol, required = []) {
    for (const r of results) {
      davStatus(r.status, protocol);
      if (!r.ok || !r.raw?.multistatus) throw new MailError('INVALID_DAV_DATA', 'Expected a valid DAV multistatus response.');
      if (r.error || r.raw.multistatus['limit-reached']) throw new MailError('RESULT_LIMIT', 'DAV query was truncated. Narrow the range or search.');
      for (const key of required) {
        if (!r.href && !r.raw.multistatus.response) continue;
        const failed = r.propStats?.find(s => !s.ok && Object.hasOwn(s.props, key));
        if (failed) davStatus(failed.status, protocol);
        if (!r.props || !Object.hasOwn(r.props, key)) throw new MailError('INVALID_DAV_DATA', `DAV response is missing ${key}.`);
      }
    }
    return results.filter(r => r.href);
  }
  async properties(protocol, url, props, depth = '0') {
    return this.checked(await propfind({ url, props, depth, fetch: this.transport(protocol) }), protocol);
  }
  async report(protocol, collection, body, required) {
    return this.checked(await davRequest({ url: collection, init: { method: 'REPORT', headers: { depth: '1' }, body }, fetch: this.transport(protocol) }), protocol, required);
  }
  async collections(protocol) {
    const origin = ORIGINS[protocol];
    const principalRows = await this.properties(protocol, `${origin}/.well-known/${protocol}`, { 'd:current-user-principal': {} });
    const principalHref = principalRows.find(r => r.props?.currentUserPrincipal?.href)?.props.currentUserPrincipal.href;
    if (typeof principalHref !== 'string') throw new MailError('DISCOVERY_FAILED', 'Fastmail did not provide a DAV principal. Check capability permissions.');
    const principal = officialUrl(principalHref, `${origin}/`, protocol);
    const cal = protocol === 'caldav', homeKey = cal ? 'calendarHomeSet' : 'addressbookHomeSet';
    const homes = await this.properties(protocol, principal, { [cal ? 'c:calendar-home-set' : 'card:addressbook-home-set']: {} });
    const homeHrefs = homes.flatMap(r => [r.props?.[homeKey]?.href ?? []].flat());
    if (!homeHrefs.length || homeHrefs.some(href => typeof href !== 'string')) throw new MailError('DISCOVERY_FAILED', 'Fastmail did not provide the capability home-set. Check app-password permissions.');
    const found = [];
    for (const homeHref of homeHrefs) {
      const home = officialUrl(homeHref, principal, protocol);
      const rows = await this.properties(protocol, home, { 'd:resourcetype': {}, 'd:displayname': {}, 'd:current-user-privilege-set': {}, ...(cal && { 'c:supported-calendar-component-set': {} }) }, '1');
      for (const r of rows) {
        if (!Object.hasOwn(r.props?.resourcetype ?? {}, cal ? 'calendar' : 'addressbook')) continue;
        const url = officialUrl(r.href, home, protocol);
        if (!url.endsWith('/')) throw new MailError('DISCOVERY_FAILED', 'DAV collection URL is missing its trailing slash.');
        const privilege = [r.props.currentUserPrivilegeSet?.privilege ?? []].flat();
        const has = key => privilege.some(p => Object.hasOwn(p, key) || Object.hasOwn(p, 'all') || Object.hasOwn(p, 'write'));
        const create = has('bind'), update = has('writeContent');
        found.push({ id: this.id(protocol, url), name: r.props.displayname ?? '', url, writable: create && update, canCreate: create, canUpdate: update,
          ...(cal && { components: [r.props.supportedCalendarComponentSet?.comp ?? []].flat().map(c => c._attributes?.name).filter(Boolean) }) });
      }
    }
    return found;
  }
  async collection(id, protocol, permission, isResource = false) {
    const ref = this.ref(id, protocol, isResource);
    const found = (await this.collections(protocol)).find(c => c.url === ref.collection);
    if (!found) throw new MailError('NOT_FOUND', 'DAV collection is no longer accessible. Discover again.');
    if (permission && !found[permission]) throw new MailError('READ_ONLY', 'The DAV collection does not grant this write privilege.');
    if (protocol === 'caldav' && found.components.length && !found.components.includes('VEVENT')) throw new MailError('UNSUPPORTED_CALENDAR', 'This calendar does not support events.');
    return { ...ref, ...found };
  }
  async readResource(ref, protocol, etag) {
    const response = await this.transport(protocol)(ref.resource, { method: 'GET' });
    const current = response.headers.get('etag');
    if (!current || !/^"[^"\r\n]+"$/.test(current)) throw new MailError('MISSING_ETAG', 'DAV resource has no strong ETag; update refused.');
    if (etag !== current) throw new MailError('CONFLICT', 'DAV resource changed. Read it again before updating.');
    return { data: await response.text(), etag: current };
  }
  async put(protocol, ref, data, etag) {
    if (Buffer.byteLength(data) > 1024 * 1024) throw new MailError('RESOURCE_TOO_LARGE', 'DAV resource exceeds 1 MiB.');
    const headers = { 'Content-Type': protocol === 'caldav' ? 'text/calendar; charset=utf-8' : 'text/vcard; charset=utf-8' };
    const response = etag
      ? await updateObject({ url: ref.resource, data, etag, headers, fetch: this.transport(protocol) })
      : await createObject({ url: ref.resource, data, headers: { ...headers, 'If-None-Match': '*' }, fetch: this.transport(protocol) });
    if (![200, 201, 204].includes(response.status)) throw new MailError('INVALID_DAV_DATA', 'DAV write returned an unexpected status; inspect before retrying.', 'operation_unknown');
    return { status: etag ? 'updated' : 'created', id: this.id(protocol, ref.collection, ref.resource), etag: response.headers.get('etag') ?? null };
  }
}
