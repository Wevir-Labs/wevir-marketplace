import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import ICAL from 'ical.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { accountFromEnv } from '../lib/mail/profiles.mjs';
import { mailFixture, PASSWORD, sampleMail } from '../lib/mail/test/fixture.mjs';
import { FastmailService } from '../lib/fastmail/service.mjs';
import { DAV_TOOLS } from '../lib/fastmail/tools.mjs';
import { DavService, ORIGINS, officialUrl } from '../lib/fastmail/dav.mjs';
import { calendarData } from '../lib/fastmail/calendar.mjs';
import { contactData } from '../lib/fastmail/contacts.mjs';
import { BOOK, CALENDAR, LOGIN, SERIES, SINGLE, davFixture } from '../lib/fastmail/test/fixture.mjs';
import { fixtureFetch } from '../lib/fastmail/test/https-fetch.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const env = { MAIL_PROVIDER: 'fastmail', MAIL_ADDRESS: LOGIN, MAIL_APP_PASSWORD: PASSWORD };
const range = { start: '2026-10-24T00:00:00Z', end: '2026-11-20T00:00:00Z', timeZone: 'Pacific/Auckland' };
const times = { start: '2026-11-03T10:00:00+13:00', end: '2026-11-03T10:30:00+13:00', timeZone: 'Pacific/Auckland', allDay: false };
const value = result => JSON.parse(result.content[0].text);
async function fixture(t) {
  const mail = await mailFixture(); t.after(() => mail.close());
  const dav = await davFixture(); t.after(() => dav.close());
  const service = new FastmailService({ env, mail: mail.service('fastmail', LOGIN), fetch: dav.fetch });
  const calendarId = service.dav.id('caldav', CALENDAR), bookId = service.dav.id('carddav', BOOK);
  return { mail, dav, service, calendarId, bookId };
}

test('Fastmail profile uses fixed official TLS hosts, full original login and no server input override', () => {
  for (const address of [LOGIN, 'account@fastmail.com', 'account@fastmail.fm']) {
    const a = accountFromEnv({ ...env, MAIL_ADDRESS: address, MAIL_IMAP_HOST: 'attacker.invalid', MAIL_SMTP_HOST: 'attacker.invalid' });
    assert.equal(a.imap, 'imap.fastmail.com'); assert.equal(a.smtp, 'smtp.fastmail.com');
    assert.equal(a.imapPort, 993); assert.equal(a.smtpPort, 465); assert.equal(a.address, address);
  }
  assert.throws(() => accountFromEnv({ ...env, MAIL_ADDRESS: 'member' }), { code: 'INVALID_ADDRESS' });
  assert.throws(() => accountFromEnv({ ...env, MAIL_APP_PASSWORD: '' }), { code: 'MISSING_INPUT' });
});

test('check account discovers opaque principal/home paths on verified TLS without any writes', async t => {
  const f = await fixture(t), result = await f.service.invoke('fastmail_check_account');
  assert.equal(result.status, 'connected'); assert.deepEqual(Object.keys(result.checks), ['imap', 'smtp', 'caldav', 'carddav']);
  assert.ok(f.dav.requests.every(r => r.tls)); assert.ok(!f.dav.requests.some(r => r.url.includes(LOGIN)));
  assert.deepEqual(f.mail.writes, []); assert.deepEqual(f.mail.deliveries, []); assert.deepEqual(f.dav.writes, []);
  assert.deepEqual(f.mail.imapAuth, [LOGIN]); assert.deepEqual(f.mail.smtpAuth, [LOGIN]);
  for (const options of f.mail.options) assert.equal(options.tls.rejectUnauthorized, true);
});

test('wrong login, missing Mail permission and Basic plan rejections remain real redacted errors, without fallback', async t => {
  const f = await fixture(t); f.mail.authFailure = true;
  for (const reason of ['Wrong original username', 'Mail permission denied', 'Basic plan does not include IMAP/SMTP']) {
    f.mail.authFailureText = reason;
    const result = await f.service.invoke('fastmail_check_account');
    assert.equal(result.status, 'partial');
    assert.equal(result.checks.imap.error.code, 'AUTHENTICATION_FAILED');
    assert.ok(result.checks.imap.error.serverResponse.includes(reason));
    assert.ok(!JSON.stringify(result).includes(PASSWORD));
    assert.match(result.checks.imap.error.message, /Basic/);
    assert.equal(result.checks.caldav.status, 'connected'); assert.equal(result.checks.carddav.status, 'connected');
  }
  assert.equal(f.mail.connections, 3); assert.equal(f.mail.smtpAuth.length, 3);
  f.dav.auth.caldav = 403;
  const partial = await f.service.invoke('fastmail_check_account');
  assert.equal(partial.checks.caldav.error.code, 'PERMISSION_DENIED'); assert.equal(partial.checks.carddav.status, 'connected');
  f.mail.authFailure = false; f.dav.auth.carddav = 401;
  const mailOnly = await f.service.invoke('fastmail_check_account');
  assert.equal(mailOnly.checks.imap.status, 'connected'); assert.equal(mailOnly.checks.smtp.status, 'connected');
  assert.equal(mailOnly.checks.carddav.error.code, 'AUTHENTICATION_FAILED');
  assert.deepEqual(f.dav.writes, []); assert.deepEqual(f.mail.writes, []);
});

test('a sending alias cannot authenticate as the original full login on any protocol', async t => {
  const f = await fixture(t); f.mail.expectedLogin = LOGIN;
  const address = 'alias@custom.test', configuration = { ...env, MAIL_ADDRESS: address };
  const service = new FastmailService({ env: configuration, mail: f.mail.service('fastmail', address), fetch: f.dav.fetch });
  const checked = await service.invoke('fastmail_check_account');
  assert.equal(checked.status, 'failed');
  assert.ok(Object.values(checked.checks).every(c => c.error.code === 'AUTHENTICATION_FAILED'));
  assert.ok(!JSON.stringify(checked).includes(PASSWORD)); assert.deepEqual(f.mail.smtpAuth, [address]); assert.deepEqual(f.mail.imapAuth, [address]);
});

test('DAV target boundary rejects credential URLs, third parties and cross-protocol redirects before sending', async t => {
  const f = await fixture(t);
  for (const target of ['http://caldav.fastmail.com/', 'https://caldav.fastmail.com.evil.test/', 'https://attacker.invalid/', 'https://a:b@caldav.fastmail.com/', 'https://caldav.fastmail.com:444/', 'https://caldav.fastmail.com/?password=x', 'https://caldav.fastmail.com/#x', 'https://carddav.fastmail.com/']) {
    assert.throws(() => officialUrl(target, ORIGINS.caldav, 'caldav'), { code: 'UNSAFE_DAV_TARGET' });
    f.dav.redirect = target;
    await assert.rejects(f.service.invoke('calendar_list'), { code: 'UNSAFE_DAV_TARGET' });
  }
  f.dav.redirect = null; f.dav.principal = 'https://attacker.invalid/principal/';
  await assert.rejects(f.service.invoke('calendar_list'), { code: 'UNSAFE_DAV_TARGET' });
  f.dav.principal = null; f.dav.home = 'https://attacker.invalid/home/';
  await assert.rejects(f.service.invoke('contacts_list_books'), { code: 'UNSAFE_DAV_TARGET' });
  assert.ok(f.dav.requests.every(r => /https:\/\/(?:caldav|carddav)\.fastmail\.com\//.test(r.url)));
  f.dav.home = null; f.dav.redirect = '/.well-known/caldav';
  await assert.rejects(f.service.invoke('calendar_list'), { code: 'DAV_REDIRECT_FAILED' });
  const wrongTls = new DavService({ env, fetch: async () => { const e = new Error('do not leak'); e.code = 'CERT_HAS_EXPIRED'; throw e; } });
  await assert.rejects(wrongTls.collections('caldav'), { code: 'TLS_FAILED' });
  const untrusted = new DavService({ env, fetch: (url, options) => fixtureFetch(url, options, { port: f.dav.port }) });
  await assert.rejects(untrusted.collections('carddav'), { code: 'TLS_FAILED' });
});

test('calendar query expands DST, timezone conversion, all-day exclusive ends, RRULE/EXDATE and detached exception', async t => {
  const f = await fixture(t);
  const list = await f.service.invoke('calendar_list'); assert.equal(list.calendars[0].writable, true);
  const result = await f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range });
  const repeated = result.events.filter(e => e.uid === 'repeat-1');
  assert.equal(repeated.length, 3);
  assert.equal(repeated[0].start, '2026-10-26T02:00:00+13:00');
  assert.equal(repeated[1].start, '2026-11-02T03:00:00+13:00');
  assert.equal(repeated[2].start, '2026-11-16T05:00:00+13:00'); assert.equal(repeated[2].title, '延期计划');
  assert.equal(repeated[1].recurrenceId, '2026-11-01T14:00:00Z');
  assert.equal(repeated[0].id, repeated[2].id);
  const all = result.events.find(e => e.uid === 'all-day');
  assert.equal(all.allDay, true); assert.equal(all.start, '2026-11-02'); assert.equal(all.end, '2026-11-04');
  assert.equal(all.calendarId, f.calendarId); assert.equal(all.calendar, '个人日历');
  assert.ok((await f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range, timeZone: 'UTC' })).events.length);
  assert.deepEqual((await f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range, start: '2027-01-01T00:00:00Z', end: '2027-01-02T00:00:00Z' })).events, []);
  await assert.rejects(f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range, end: '2027-11-20T00:00:00Z' }), { code: 'INVALID_RANGE' });
  f.dav.unexpanded = true;
  await assert.rejects(f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range }), { code: 'EXPANSION_REQUIRED' });
});

test('RDATE and all-day recurrence retain explicit occurrence identifiers and exclusions', async t => {
  const f = await fixture(t);
  f.dav.calendars.set(`${CALENDAR}dates.ics`, { etag: '"r1"', data: SINGLE.replace('UID:single', 'UID:rdates').replace('SUMMARY:单次日程', 'RDATE:20261103T000000Z\r\nSUMMARY:额外日期') });
  const events = (await f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range })).events.filter(e => e.uid === 'rdates');
  assert.equal(events.length, 2); assert.ok(events.every(e => e.recurrenceId));
  const first = events.find(e => e.recurrenceId === '2026-11-02T00:00:00Z');
  await f.service.invoke('calendar_update_event', { id: first.id, etag: first.etag, scope: 'instance', recurrenceId: first.recurrenceId, patch: { title: '首次日期' } });
  const saved = calendarData(f.dav.writes.at(-1).body), master = saved.getAllSubcomponents('vevent').find(c => !c.hasProperty('recurrence-id'));
  assert.equal(master.getAllProperties('rdate').length, 1); assert.equal(master.getFirstPropertyValue('rdate').toString(), '2026-11-03T00:00:00Z');
  f.dav.calendars.set(`${CALENDAR}all-repeat.ics`, { etag: '"ar1"', data: SERIES.replace(/BEGIN:VEVENT[\s\S]*END:VEVENT/, 'BEGIN:VEVENT\r\nUID:all-repeat\r\nDTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102\r\nRRULE:FREQ=DAILY;COUNT=3\r\nEXDATE;VALUE=DATE:20261102\r\nSUMMARY:全天重复\r\nEND:VEVENT') });
  const all = (await f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range })).events.filter(e => e.uid === 'all-repeat');
  assert.deepEqual(all.map(e => e.start), ['2026-11-01', '2026-11-03']); assert.ok(all.every(e => e.allDay));
});

test('create timed/all-day calendars, preserve untouched properties, refuse read-only and both ETag conflict paths', async t => {
  const f = await fixture(t);
  const created = await f.service.invoke('calendar_create_event', { calendarId: f.calendarId, title: '个人规划', times });
  assert.equal(created.status, 'created'); assert.equal(f.dav.writes[0].ifNoneMatch, '*');
  const root = calendarData(f.dav.writes[0].body), event = new ICAL.Event(root.getFirstSubcomponent('vevent'));
  assert.equal(event.startDate.zone.tzid, 'Pacific/Auckland'); assert.equal(event.startDate.toJSDate().toISOString(), '2026-11-02T21:00:00.000Z');
  assert.ok(root.getFirstSubcomponent('vtimezone')); assert.equal(event.component.hasProperty('attendee'), false);
  const all = await f.service.invoke('calendar_create_event', { calendarId: f.calendarId, title: '休息', times: { start: '2026-11-03', end: '2026-11-05', timeZone: 'UTC', allDay: true } });
  assert.equal(all.status, 'created'); assert.ok(f.dav.writes.at(-1).body.includes('DTEND;VALUE=DATE:20261105'));
  await assert.rejects(f.service.invoke('calendar_create_event', { calendarId: f.calendarId, title: 'bad', times: { ...times, start: '2026-11-03T10:00:00+12:00' } }), { code: 'INVALID_TIME' });
  const id = f.service.dav.id('caldav', CALENDAR, `${CALENDAR}single.ics`);
  await f.service.invoke('calendar_update_event', { id, etag: '"e1"', scope: 'event', patch: { title: '更改' } });
  const write = f.dav.writes.at(-1);
  assert.equal(write.ifMatch, '"e1"'); assert.ok(write.body.includes('X-UNKNOWN:keep me')); assert.ok(write.body.includes('DTSTART:20261102T000000Z'));
  await assert.rejects(f.service.invoke('calendar_update_event', { id, etag: '"e1"', scope: 'event', patch: { title: 'stale' } }), { code: 'CONFLICT' });
  f.dav.conflict = true;
  await assert.rejects(f.service.invoke('calendar_update_event', { id, etag: '"write-3"', scope: 'event', patch: { title: 'raced' } }), { code: 'CONFLICT' });
  assert.equal(f.dav.writes.length, 3); f.dav.conflict = false; f.dav.readonly = true;
  assert.equal((await f.service.invoke('calendar_list')).calendars[0].writable, false);
  await assert.rejects(f.service.invoke('calendar_create_event', { calendarId: f.calendarId, title: 'denied', times }), { code: 'READ_ONLY' });
});

test('series and instance scopes preserve recurrence, exceptions and alarms; scheduling writes require external notification handling', async t => {
  const f = await fixture(t), id = f.service.dav.id('caldav', CALENDAR, `${CALENDAR}series.ics`);
  await assert.rejects(f.service.invoke('calendar_update_event', { id, etag: '"s1"', scope: 'event', patch: { title: 'wrong scope' } }), { code: 'SCOPE_REQUIRED' });
  await f.service.invoke('calendar_update_event', { id, etag: '"s1"', scope: 'series', patch: { description: '系列备注' } });
  let root = calendarData(f.dav.writes.at(-1).body);
  assert.ok(root.getFirstSubcomponent('vevent').hasProperty('rrule')); assert.ok(root.getFirstSubcomponent('vevent').hasProperty('exdate'));
  assert.ok(root.getFirstSubcomponent('vevent').getFirstSubcomponent('valarm')); assert.equal(root.getAllSubcomponents('vevent').length, 2);
  assert.ok(root.getAllSubcomponents('vevent').every(c => c.getFirstPropertyValue('description') === '系列备注'));
  await f.service.invoke('calendar_update_event', { id, etag: '"write-1"', scope: 'instance', recurrenceId: '2026-11-01T14:00:00Z', patch: { title: '单次更改', times } });
  root = calendarData(f.dav.writes.at(-1).body);
  assert.equal(root.getAllSubcomponents('vevent').length, 3);
  assert.equal(root.getFirstSubcomponent('vevent').getFirstPropertyValue('summary'), '每周计划');
  assert.ok(f.dav.writes.at(-1).body.includes('X-EXCEPTION:保持'));
  await assert.rejects(f.service.invoke('calendar_update_event', { id, etag: '"write-2"', scope: 'instance', recurrenceId: '2026-11-08T14:00:00Z', patch: { title: 'excluded' } }), { code: 'NOT_FOUND' });
  await assert.rejects(f.service.invoke('calendar_update_event', { id, etag: '"write-2"', scope: 'series', patch: { times } }), { code: 'UNSUPPORTED_SERIES_CHANGE' });
  const item = f.dav.calendars.get(`${CALENDAR}single.ics`); item.data = SINGLE.replace('SUMMARY:', 'ATTENDEE:mailto:nobody@fixture.test\r\nSUMMARY:');
  await assert.rejects(f.service.invoke('calendar_update_event', { id: f.service.dav.id('caldav', CALENDAR, `${CALENDAR}single.ics`), etag: item.etag, scope: 'event', patch: { title: 'invite' } }), { code: 'SCHEDULING_UNSUPPORTED' });
  assert.equal(f.dav.writes.length, 2);
});

test('Chinese contact search pages bounded multigets and distinguishes empty, changed, forbidden and invalid data', async t => {
  const f = await fixture(t), args = { bookId: f.bookId, query: '李', limit: 2 };
  const first = await f.service.invoke('contacts_search', args);
  assert.equal(first.contacts.length, 2); assert.ok(first.nextCursor); assert.notEqual(first.contacts[0].id, first.contacts[1].id);
  assert.equal(first.contacts[0].name, '李明'); assert.equal(first.contacts[0].emails.length, 2); assert.equal(first.contacts[0].phones.length, 2);
  assert.equal(first.contacts[0].organization, '维维公司');
  const second = await f.service.invoke('contacts_search', { ...args, cursor: first.nextCursor });
  assert.equal(second.contacts.length, 1); assert.equal(second.nextCursor, null);
  const reports = f.dav.requests.filter(r => r.method === 'REPORT');
  assert.ok(!reports[0].body.includes('address-data')); assert.ok(reports[1].body.includes('addressbook-multiget'));
  assert.deepEqual((await f.service.invoke('contacts_search', { ...args, query: '不存在' })).contacts, []);
  await assert.rejects(f.service.invoke('contacts_search', { ...args, query: 'other', cursor: first.nextCursor }), { code: 'INVALID_CURSOR' });
  f.dav.contacts.get(`${BOOK}a.vcf`).etag = '"changed"';
  await assert.rejects(f.service.invoke('contacts_search', { ...args, cursor: first.nextCursor }), { code: 'STALE_CURSOR' });
  f.dav.tooMany = true; await assert.rejects(f.service.invoke('contacts_search', args), { code: 'RESULT_LIMIT' }); f.dav.tooMany = false;
  f.dav.auth.carddav = 403; await assert.rejects(f.service.invoke('contacts_search', args), { code: 'PERMISSION_DENIED' }); f.dav.auth.carddav = 200;
  f.dav.contacts.get(`${BOOK}a.vcf`).data = 'invalid';
  await assert.rejects(f.service.invoke('contacts_search', { ...args, query: 'invalid' }), { code: 'INVALID_CONTACT_DATA' });
});

test('vCard patches keep multivalues, Chinese structured name/org, unknown attributes; create never merges, conflicts never overwrite', async t => {
  const f = await fixture(t), id = f.service.dav.id('carddav', BOOK, `${BOOK}a.vcf`);
  await f.service.invoke('contacts_update', { id, etag: '"c1"', patch: { title: '负责人', givenName: '新明', department: '产品' } });
  const card = contactData(f.dav.writes[0].body);
  assert.equal(card.getFirstPropertyValue('fn'), '李明'); assert.deepEqual(card.getFirstPropertyValue('n'), ['李', '新明', '中', '博士', '先生']);
  assert.deepEqual(card.getFirstPropertyValue('org'), ['维维公司', '产品', '实验室']);
  assert.equal(card.getAllProperties('email').length, 2); assert.equal(card.getAllProperties('tel').length, 2);
  assert.equal(card.getFirstProperty('email').getParameter('x-keep'), 'yes'); assert.equal(card.getFirstProperty('x-custom').getParameter('x-param'), 'yes');
  assert.equal(card.getFirstPropertyValue('x-custom'), '中文保留'); assert.equal(f.dav.writes[0].ifMatch, '"c1"');
  await assert.rejects(f.service.invoke('contacts_update', { id, etag: '"c1"', patch: { name: 'stale' } }), { code: 'CONFLICT' });
  f.dav.conflict = true;
  await assert.rejects(f.service.invoke('contacts_update', { id, etag: '"write-1"', patch: { name: 'raced' } }), { code: 'CONFLICT' }); f.dav.conflict = false;
  const created = await f.service.invoke('contacts_create', { bookId: f.bookId, name: '李明', emails: [{ value: 'new@fixture.test', type: 'WORK' }], phones: [{ value: '+64210000009', type: 'WORK' }] });
  assert.equal(created.status, 'created'); assert.notEqual(created.id, id); assert.equal(f.dav.contacts.size, 4);
  assert.equal(f.dav.writes[1].ifNoneMatch, '*');
  const newCard = contactData(f.dav.writes[1].body); assert.equal(newCard.getFirstPropertyValue('version'), '4.0');
  assert.equal(newCard.getFirstProperty('tel').type, 'text');
  await f.service.invoke('contacts_update', { id, etag: '"write-1"', patch: { phones: [{ value: '+64210000010', type: 'WORK' }] } });
  assert.equal(contactData(f.dav.writes.at(-1).body).getAllProperties('tel').length, 1);
  f.dav.readonly = true;
  await assert.rejects(f.service.invoke('contacts_create', { bookId: f.bookId, name: '拒绝' }), { code: 'READ_ONLY' });
});

test('service failures, property failures, malformed XML and interrupted writes never masquerade as empty or retry', async t => {
  const f = await fixture(t);
  f.dav.reportStatus = 503; await assert.rejects(f.service.invoke('contacts_search', { bookId: f.bookId, query: '李' }), { code: 'DAV_SERVER_ERROR' });
  f.dav.reportStatus = 200; f.dav.failProperty = true;
  await assert.rejects(f.service.invoke('contacts_search', { bookId: f.bookId, query: '李' }), { code: 'PERMISSION_DENIED' });
  f.dav.failProperty = false; f.dav.malformed = true;
  await assert.rejects(f.service.invoke('calendar_list'), { code: 'INVALID_DAV_DATA' }); f.dav.malformed = false;
  f.dav.dropWrite = true;
  await assert.rejects(f.service.invoke('contacts_create', { bookId: f.bookId, name: '结果未知' }), { status: 'operation_unknown' });
  assert.equal(f.dav.writes.length, 1); assert.equal(f.dav.contacts.size, 4);
  assert.ok(DAV_TOOLS.filter(t => /create|update/.test(t.name)).every(t => !t.annotations.readOnlyHint));
  assert.ok(!DAV_TOOLS.some(t => /delete|clear|merge/.test(t.name)));
  await assert.rejects(f.service.invoke('contacts_update', { id: 'bad', etag: '"x"', patch: { host: 'evil' } }), { code: 'INVALID_ARGUMENT' });
  assert.throws(() => f.service.dav.ref(f.bookId, 'caldav'), { code: 'INVALID_ID' });
});

test('CDATA payloads parse and resource hrefs cannot escape official collections', async t => {
  const f = await fixture(t); f.dav.cdata = true;
  assert.ok((await f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range })).events.length);
  assert.equal((await f.service.invoke('contacts_search', { bookId: f.bookId, query: '李明' })).contacts.length, 2);
  f.dav.resourceHref = 'https://attacker.invalid/contact.vcf';
  await assert.rejects(f.service.invoke('contacts_search', { bookId: f.bookId, query: '李明' }), { code: 'UNSAFE_DAV_TARGET' });
  f.dav.resourceHref = '/outside/other.ics';
  await assert.rejects(f.service.invoke('calendar_query', { calendarId: f.calendarId, ...range }), { code: 'INVALID_DAV_RESOURCE' });
});

async function prepareFastmailPreload(directory, mail, dav) {
  for (const name of ['redirect.mjs', 'https-fetch.mjs']) await cp(path.join(ROOT, 'lib/fastmail/test', name), path.join(directory, name));
  await cp(path.join(ROOT, 'lib/mail/test/redirect.mjs'), path.join(directory, 'mail-redirect.mjs'));
  const ca = path.join(directory, 'fixture-ca'); await writeFile(ca, Buffer.concat([mail.cert, dav.cert]));
  return { PATH: process.env.PATH, ...env, NODE_EXTRA_CA_CERTS: ca, FIXTURE_IMAP_PORT: String(mail.imapPort), FIXTURE_SMTP_PORT: String(mail.smtpPort), FIXTURE_DAV_PORT: String(dav.port) };
}

test('standalone copied package discovers all tools and performs controlled mail/calendar/contact reads and writes without repository dependencies', async t => {
  const f = await fixture(t), directory = await mkdtemp(path.join(tmpdir(), 'wevir-fastmail-standalone-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const plugin = path.join(directory, 'plugin'); await cp(path.join(ROOT, 'plugins/fastmail'), plugin, { recursive: true });
  const environment = { ...await prepareFastmailPreload(directory, f.mail, f.dav), DEBUG: '*' };
  const diagnostics = [], transport = new StdioClientTransport({ command: process.execPath, args: ['--import', path.join(directory, 'redirect.mjs'), path.join(plugin, 'server/index.mjs')], cwd: directory, env: environment, stderr: 'pipe' });
  transport.stderr.on('data', d => diagnostics.push(d.toString()));
  const client = new Client({ name: 'standalone-fastmail', version: '1.0.0' }); t.after(() => client.close());
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 18);
  const call = async (name, args = {}) => { const result = await client.callTool({ name, arguments: args }); assert.ok(!result.isError, JSON.stringify(result)); return value(result); };
  assert.equal((await call('fastmail_check_account')).status, 'connected'); assert.deepEqual(f.dav.writes, []);
  await f.mail.add('INBOX', await sampleMail());
  const mail = await call('mail_search_messages', { folder: 'INBOX' }); assert.equal(mail.messages.length, 1);
  await call('mail_read_message', { id: mail.messages[0].id });
  assert.equal((await call('mail_save_draft', { to: ['nobody@fixture.test'], subject: '合成草稿', text: '中文内容' })).status, 'draft_saved');
  assert.equal((await call('mail_send_message', { to: ['nobody@fixture.test'], subject: '受控 SMTP', text: 'synthetic only' })).status, 'smtp_accepted');
  const calendarId = (await call('calendar_list')).calendars[0].id;
  assert.ok((await call('calendar_query', { calendarId, ...range })).events.length);
  const event = await call('calendar_create_event', { calendarId, title: '受控日程', times });
  assert.equal((await call('calendar_update_event', { id: event.id, etag: event.etag, scope: 'event', patch: { title: '更改日程' } })).status, 'updated');
  const bookId = (await call('contacts_list_books')).books[0].id;
  assert.equal((await call('contacts_search', { bookId, query: '李明' })).contacts.length, 2);
  const contact = await call('contacts_create', { bookId, name: '合成联系人' });
  assert.equal((await call('contacts_update', { id: contact.id, etag: contact.etag, patch: { title: '更改联系人' } })).status, 'updated');
  assert.equal(f.mail.deliveries.length, 1); assert.equal(f.dav.writes.length, 4);
  assert.ok(!diagnostics.join('').includes(PASSWORD)); assert.ok(!JSON.stringify(f.dav.requests).includes(PASSWORD));
  const build = JSON.parse(await readFile(path.join(plugin, 'server/build-info.json'), 'utf8'));
  assert.ok(build.packages.includes('tsdav@2.5.1')); assert.ok(build.packages.includes('ical.js@2.2.1'));
  assert.ok((await readdir(directory)).every(f => f !== 'node_modules'));
});

test('temporary marketplace index contains official Fastmail metadata and truthful three-capability examples', async t => {
  const out = await mkdtemp(path.join(tmpdir(), 'fastmail-index-')); t.after(() => rm(out, { recursive: true, force: true }));
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  execFileSync(process.execPath, ['scripts/build-index.mjs', '--commit', commit, '--out', out], { cwd: ROOT });
  const index = JSON.parse(await readFile(path.join(out, 'index.json'), 'utf8')), entry = index.entries.find(e => e.id === 'fastmail');
  assert.equal(entry.verification.level, 'official'); assert.equal(entry.verification.since, '2026-11'); assert.equal(entry.category, 'communication');
  assert.match(entry.description, /email.*calendar.*contacts/); assert.equal(entry.examples.length, 3);
  const manifest = JSON.parse(await readFile(path.join(ROOT, 'plugins/fastmail/wevir-plugin.json'), 'utf8'));
  assert.equal(manifest.author.name, 'Wevir'); assert.equal(manifest.inputs.length, 2); assert.ok(manifest.inputs[1].secret);
  assert.equal(manifest.verification, undefined); assert.equal(manifest.connectors.mail.env.MAIL_PROVIDER, 'fastmail');
});
