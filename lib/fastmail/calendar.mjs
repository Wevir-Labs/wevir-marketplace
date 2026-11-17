import { randomUUID } from 'node:crypto';
import ICAL from 'ical.js';
import { DateTime, IANAZone } from 'luxon';
import { tzlib_get_ical_block } from 'timezones-ical-library';
import { MailError } from '../mail/profiles.mjs';
import { NS } from './dav.mjs';

const fail = message => { throw new MailError('INVALID_CALENDAR_DATA', message); };
function zoneComponent(id) {
  const block = tzlib_get_ical_block(id)[0];
  if (!block) throw new MailError('UNSUPPORTED_TIMEZONE', 'The bundled timezone data does not support this IANA zone. Use UTC.');
  const parsed = new ICAL.Component(ICAL.parse(block));
  return parsed.name === 'vtimezone' ? parsed : parsed.getFirstSubcomponent('vtimezone');
}
export function calendarData(data) {
  try {
    if (Buffer.byteLength(data) > 1024 * 1024) fail('Calendar resource exceeds 1 MiB.');
    const root = new ICAL.Component(ICAL.parse(data));
    if (root.name !== 'vcalendar' || !root.getAllSubcomponents('vevent').length) fail('Expected a VCALENDAR containing events.');
    const getZone = root.getTimeZoneByID.bind(root), zones = new Map();
    root.getTimeZoneByID = id => {
      const embedded = getZone(id);
      if (embedded) return embedded;
      if (!zones.has(id)) zones.set(id, new ICAL.Timezone({ component: zoneComponent(id), tzid: id }));
      return zones.get(id);
    };
    return root;
  } catch (error) {
    if (error instanceof MailError) throw error;
    fail('Calendar data could not be parsed. No events were silently omitted.');
  }
}
function validZone(zone) {
  if (zone !== 'UTC' && !IANAZone.isValidZone(zone)) throw new MailError('INVALID_TIMEZONE', 'Use a valid IANA timezone or UTC.');
}
function instant(value) {
  const result = DateTime.fromISO(value, { setZone: true });
  if (!result.isValid || !/[Zz]|[+-]\d\d:\d\d$/.test(value)) throw new MailError('INVALID_TIME', 'Use a valid ISO timestamp with an explicit offset.');
  return result;
}
function timeValue(value, zone) {
  if (!value) fail('Event has no DTSTART or valid end.');
  if (value.isDate) return value.toString();
  if (value.zone === ICAL.Timezone.localTimezone) return DateTime.fromISO(value.toString(), { zone }).toISO({ suppressMilliseconds: true });
  return DateTime.fromSeconds(value.toUnixTime(), { zone }).toISO({ suppressMilliseconds: true });
}
function addTimes(root, component, times) {
  validZone(times.timeZone);
  let start, end;
  if (times.allDay) {
    if (![times.start, times.end].every(v => /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v, { zone: 'UTC' }).isValid)) throw new MailError('INVALID_TIME', 'All-day events require ISO dates and an exclusive end date.');
    if (times.end <= times.start) throw new MailError('INVALID_TIME', 'All-day end date must be later than start.');
    start = ICAL.Time.fromDateString(times.start); end = ICAL.Time.fromDateString(times.end);
  } else {
    const first = instant(times.start), last = instant(times.end);
    if (last.toMillis() <= first.toMillis()) throw new MailError('INVALID_TIME', 'Event end must be later than start.');
    const zone = times.timeZone;
    if ([first, last].some(v => v.offset !== v.setZone(zone).offset)) throw new MailError('INVALID_TIME', 'Timestamp offsets must match the selected IANA timezone, including daylight saving.');
    if (zone !== 'UTC' && !root.getAllSubcomponents('vtimezone').some(c => c.getFirstPropertyValue('tzid') === zone)) root.addSubcomponent(zoneComponent(zone));
    const tz = zone === 'UTC' ? ICAL.Timezone.utcTimezone : root.getTimeZoneByID(zone);
    const convert = value => {
      const local = value.setZone(zone);
      const time = ICAL.Time.fromDateTimeString(local.toFormat("yyyy-MM-dd'T'HH:mm:ss"));
      time.zone = tz;
      if (time.toUnixTime() !== value.toSeconds()) throw new MailError('AMBIGUOUS_TIME', 'Timezone data or repeated local time disagrees with the explicit offset. Use UTC for this event.');
      return time;
    };
    start = convert(first); end = convert(last);
  }
  component.removeAllProperties('dtstart'); component.removeAllProperties('dtend'); component.removeAllProperties('duration');
  for (const [name, value] of [['dtstart', start], ['dtend', end]]) {
    const prop = new ICAL.Property(name); prop.setValue(value);
    if (!value.isDate && times.timeZone !== 'UTC') prop.setParameter('tzid', times.timeZone);
    component.addProperty(prop);
  }
}
function patchFields(component, patch) {
  for (const [key, name] of [['title', 'summary'], ['description', 'description'], ['location', 'location']]) {
    if (Object.hasOwn(patch, key)) component.updatePropertyWithValue(name, patch[key]);
  }
  component.updatePropertyWithValue('dtstamp', ICAL.Time.now().convertToZone(ICAL.Timezone.utcTimezone));
  component.updatePropertyWithValue('last-modified', ICAL.Time.now().convertToZone(ICAL.Timezone.utcTimezone));
  component.updatePropertyWithValue('sequence', Number(component.getFirstPropertyValue('sequence') ?? 0) + 1);
}
function personalOnly(root) {
  if (root.hasProperty('method') || root.getAllSubcomponents('vevent').some(e => e.hasProperty('attendee') || e.hasProperty('organizer'))) {
    throw new MailError('SCHEDULING_UNSUPPORTED', 'This event involves scheduling or participants; updating it may send notifications. Use Fastmail with explicit sending authorization.');
  }
}
export async function queryCalendar(service, args) {
  validZone(args.timeZone);
  const start = instant(args.start), end = instant(args.end);
  if (end <= start || end.toMillis() - start.toMillis() > 93 * 86400000) throw new MailError('INVALID_RANGE', 'Use an increasing date range of at most 93 days.');
  const ref = await service.collection(args.calendarId, 'caldav');
  const stamp = value => value.toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
  const range = { start: stamp(start), end: stamp(end) };
  const timezone = new ICAL.Component('vcalendar');
  timezone.updatePropertyWithValue('version', '2.0'); timezone.updatePropertyWithValue('prodid', '-//Wevir//Fastmail//EN');
  timezone.addSubcomponent(zoneComponent(args.timeZone));
  const rows = await service.report('caldav', ref.collection, { 'c:calendar-query': { _attributes: NS,
    'd:prop': { 'd:getetag': {}, 'c:calendar-data': { 'c:expand': { _attributes: range } } },
    'c:filter': { 'c:comp-filter': { _attributes: { name: 'VCALENDAR' }, 'c:comp-filter': { _attributes: { name: 'VEVENT' }, 'c:time-range': { _attributes: range } } } },
    'c:timezone': { _text: timezone.toString() },
  } }, ['getetag', 'calendarData']);
  const events = [];
  for (const row of rows) {
    const resource = service.childUrl(row.href, ref.collection, 'caldav');
    const root = calendarData(row.props.calendarData?._cdata ?? row.props.calendarData);
    for (const component of root.getAllSubcomponents('vevent')) {
      if (component.hasProperty('rrule') || component.hasProperty('rdate') || component.hasProperty('exdate')) throw new MailError('EXPANSION_REQUIRED', 'The calendar server did not expand recurrence. No incomplete event list was returned.');
      if (!component.getFirstPropertyValue('uid')) fail('Event has no stable UID.');
      const event = new ICAL.Event(component);
      const first = timeValue(event.startDate, args.timeZone), last = timeValue(event.endDate, args.timeZone);
      const rid = event.recurrenceId;
      events.push({ id: service.id('caldav', ref.collection, resource), uid: event.uid, etag: row.props.getetag,
        calendarId: args.calendarId, calendar: ref.name, title: event.summary ?? '', description: event.description ?? '', location: event.location ?? '',
        start: first, end: last, timeZone: args.timeZone, allDay: event.startDate.isDate,
        sourceTimeZone: event.startDate.zone.tzid, floating: !event.startDate.isDate && event.startDate.zone === ICAL.Timezone.localTimezone,
        recurrenceId: rid ? rid.toString() : null, cancelled: component.getFirstPropertyValue('status') === 'CANCELLED',
        hasParticipants: component.hasProperty('attendee') || component.hasProperty('organizer') });
      if (events.length > 500) throw new MailError('RESULT_LIMIT', 'More than 500 event occurrences. Narrow the range.');
    }
  }
  return { events: events.sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)) };
}
export async function createEvent(service, args) {
  const ref = await service.collection(args.calendarId, 'caldav', 'canCreate');
  const root = new ICAL.Component('vcalendar');
  root.updatePropertyWithValue('version', '2.0'); root.updatePropertyWithValue('prodid', '-//Wevir//Fastmail//EN');
  const component = new ICAL.Component('vevent'); root.addSubcomponent(component);
  const uid = randomUUID(); component.updatePropertyWithValue('uid', uid);
  addTimes(root, component, args.times); patchFields(component, args);
  return { ...await service.put('caldav', { ...ref, resource: new URL(`${uid}.ics`, ref.collection).href }, root.toString()), uid };
}
export async function updateEvent(service, args) {
  const ref = await service.collection(args.id, 'caldav', 'canUpdate', true);
  const current = await service.readResource(ref, 'caldav', args.etag);
  const root = calendarData(current.data); personalOnly(root);
  const components = root.getAllSubcomponents('vevent'), master = components.find(c => !c.hasProperty('recurrence-id'));
  if (!master || components.some(c => c.getFirstPropertyValue('uid') !== master.getFirstPropertyValue('uid'))) fail('Expected one event UID with a master component.');
  const event = new ICAL.Event(master, { strictExceptions: true });
  const recurring = event.isRecurring() || components.some(c => c.hasProperty('recurrence-id'));
  let target = master;
  if (args.scope === 'event' && recurring) throw new MailError('SCOPE_REQUIRED', 'Recurring events require an explicit series or instance scope.');
  if (args.scope === 'series' && (!recurring || args.patch.times)) throw new MailError('UNSUPPORTED_SERIES_CHANGE', 'Series scope updates title, description and location only. Use instance scope for time changes.');
  if (args.scope !== 'instance' && args.recurrenceId) throw new MailError('INVALID_ARGUMENT', 'recurrenceId is only valid for instance scope.');
  if (args.scope === 'instance') {
    if (!recurring || !args.recurrenceId) throw new MailError('SCOPE_REQUIRED', 'Instance scope requires a recurring event and the recurrenceId returned by query.');
    let recurrence;
    try { recurrence = ICAL.Time.fromString(args.recurrenceId); } catch { throw new MailError('INVALID_TIME', 'Invalid recurrenceId. Query the occurrence again.'); }
    if (recurrence.isDate !== event.startDate.isDate) throw new MailError('INVALID_TIME', 'recurrenceId has the wrong date type.');
    if (!recurrence.isDate && recurrence.zone === ICAL.Timezone.localTimezone) recurrence.zone = event.startDate.zone;
    const same = time => time.isDate ? time.toString() === recurrence.toString() : time.toUnixTime() === recurrence.toUnixTime();
    target = components.find(c => c.hasProperty('recurrence-id') && same(c.getFirstPropertyValue('recurrence-id')));
    if (target?.getFirstProperty('recurrence-id')?.getParameter('range')) throw new MailError('UNSUPPORTED_SERIES_CHANGE', 'This occurrence controls future instances. Edit its range in Fastmail.');
    if (!target) {
      let validationEvent = event;
      if (master.hasProperty('rdate') && !master.hasProperty('rrule')) {
        // ICAL.js omits DTSTART from RDATE-only expansion.
        const validationMaster = calendarData(current.data).getAllSubcomponents('vevent').find(c => !c.hasProperty('recurrence-id'));
        validationMaster.addPropertyWithValue('rdate', event.startDate);
        validationEvent = new ICAL.Event(validationMaster, { strictExceptions: true });
      }
      const iterator = validationEvent.iterator(); let occurrence, count = 0;
      do {
        if (++count > 100000) throw new MailError('RECURRENCE_LIMIT', 'Recurrence validation exceeded its bound. Edit this occurrence in Fastmail.');
        occurrence = iterator.next();
      } while (occurrence && !same(occurrence) && occurrence.compare(recurrence) < 0);
      if (!occurrence || !same(occurrence)) throw new MailError('NOT_FOUND', 'Occurrence is excluded or no longer exists. Query again.');
      const details = event.getOccurrenceDetails(occurrence);
      target = new ICAL.Component(structuredClone(details.item.component.toJSON())); root.addSubcomponent(target);
      for (const name of ['rrule', 'rdate', 'exdate', 'recurrence-id', 'dtstart', 'dtend', 'duration']) target.removeAllProperties(name);
      const original = recurrence.convertToZone(event.startDate.zone);
      const prop = new ICAL.Property('recurrence-id'); prop.setValue(original);
      if (!original.isDate && original.zone !== ICAL.Timezone.utcTimezone && original.zone !== ICAL.Timezone.localTimezone) prop.setParameter('tzid', original.zone.tzid);
      target.addProperty(prop);
      for (const [key, value] of [['dtstart', details.startDate], ['dtend', details.endDate]]) {
        const p = new ICAL.Property(key); p.setValue(value);
        if (!value.isDate && value.zone !== ICAL.Timezone.utcTimezone && value.zone !== ICAL.Timezone.localTimezone) p.setParameter('tzid', value.zone.tzid);
        target.addProperty(p);
      }
    }
  }
  const targets = args.scope === 'series' ? components : [target];
  for (const component of targets) {
    if (args.patch.times) addTimes(root, component, args.patch.times);
    patchFields(component, args.patch);
  }
  return service.put('caldav', ref, root.toString(), current.etag);
}
