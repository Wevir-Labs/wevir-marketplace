import { randomUUID } from 'node:crypto';
import ICAL from 'ical.js';
import { MailError } from '../mail/profiles.mjs';
import { decode, encode, hash, NS } from './dav.mjs';

export function contactData(data) {
  try {
    if (Buffer.byteLength(data) > 1024 * 1024) throw new Error('size');
    const card = new ICAL.Component(ICAL.parse(data));
    if (card.name !== 'vcard' || !['3.0', '4.0'].includes(card.getFirstPropertyValue('version'))) throw new Error('type');
    return card;
  } catch { throw new MailError('INVALID_CONTACT_DATA', 'Expected one valid vCard 3.0 or 4.0 resource of at most 1 MiB.'); }
}
function patchCard(card, patch) {
  for (const [field, prop] of [['name', 'fn'], ['title', 'title'], ['notes', 'note']]) {
    if (Object.hasOwn(patch, field)) card.updatePropertyWithValue(prop, patch[field]);
  }
  if (Object.hasOwn(patch, 'givenName') || Object.hasOwn(patch, 'familyName')) {
    const name = card.getFirstPropertyValue('n') ?? ['', '', '', '', ''];
    if (Object.hasOwn(patch, 'givenName')) name[1] = patch.givenName;
    if (Object.hasOwn(patch, 'familyName')) name[0] = patch.familyName;
    card.updatePropertyWithValue('n', name);
  }
  if (Object.hasOwn(patch, 'organization') || Object.hasOwn(patch, 'department')) {
    const org = [card.getFirstPropertyValue('org') ?? ['']].flat();
    if (Object.hasOwn(patch, 'organization')) org[0] = patch.organization;
    if (Object.hasOwn(patch, 'department')) org[1] = patch.department;
    card.updatePropertyWithValue('org', org);
  }
  for (const [field, name] of [['emails', 'email'], ['phones', 'tel']]) {
    if (!Object.hasOwn(patch, field)) continue;
    card.removeAllProperties(name);
    for (const item of patch[field]) {
      const p = new ICAL.Property(name); card.addProperty(p);
      if (name === 'tel' && card.getFirstPropertyValue('version') === '4.0') p.resetType('text');
      p.setValue(item.value);
      if (item.type) p.setParameter('type', item.type.split(','));
    }
  }
  card.updatePropertyWithValue('rev', ICAL.Time.now().convertToZone(ICAL.Timezone.utcTimezone));
}
function fields(card) {
  const name = card.getFirstPropertyValue('n') ?? [];
  const org = [card.getFirstPropertyValue('org') ?? []].flat();
  return { uid: card.getFirstPropertyValue('uid') ?? null, name: card.getFirstPropertyValue('fn') ?? '', givenName: name[1] ?? '', familyName: name[0] ?? '',
    organization: org[0] ?? '', department: org[1] ?? '', title: card.getFirstPropertyValue('title') ?? '', notes: card.getFirstPropertyValue('note') ?? '',
    emails: card.getAllProperties('email').map(p => ({ value: p.getFirstValue(), type: p.getParameter('type') ?? null })),
    phones: card.getAllProperties('tel').map(p => ({ value: String(p.getFirstValue()), type: p.getParameter('type') ?? null })) };
}
export async function searchContacts(service, args) {
  const ref = await service.collection(args.bookId, 'carddav');
  const rows = await service.report('carddav', ref.collection, { 'a:addressbook-query': { _attributes: NS,
    'd:prop': { 'd:getetag': {} },
    'a:filter': { _attributes: { test: 'anyof' }, 'a:prop-filter': ['FN', 'N', 'EMAIL', 'TEL', 'ORG'].map(name => ({ _attributes: { name }, 'a:text-match': { _attributes: { collation: 'i;unicode-casemap', 'match-type': 'contains' }, _text: args.query } })) },
    'a:limit': { 'a:nresults': { _text: '501' } },
  } }, ['getetag']);
  if (rows.length > 500) throw new MailError('RESULT_LIMIT', 'More than 500 contacts matched. Narrow the search.');
  const refs = rows.map(r => ({ url: service.childUrl(r.href, ref.collection, 'carddav'), etag: r.props.getetag })).sort((a, b) => a.url.localeCompare(b.url));
  const limit = args.limit ?? 25, scope = hash([service.accountKey(), ref.collection, args.query, limit]), revision = hash(refs);
  let offset = 0;
  if (args.cursor) {
    const cursor = decode(args.cursor);
    if (!Array.isArray(cursor) || cursor.length !== 4 || cursor[0] !== 1 || cursor[1] !== scope || !Number.isSafeInteger(cursor[3]) || cursor[3] < 0 || cursor[3] >= refs.length) throw new MailError('INVALID_CURSOR', 'Reuse the same address book, query and page size.');
    if (cursor[2] !== revision) throw new MailError('STALE_CURSOR', 'Contact search results changed. Restart the search.');
    offset = cursor[3];
  }
  const page = refs.slice(offset, offset + limit);
  if (!page.length) return { contacts: [], nextCursor: null };
  const cards = await service.report('carddav', ref.collection, { 'a:addressbook-multiget': { _attributes: NS,
    'd:prop': { 'd:getetag': {}, 'a:address-data': {} }, 'd:href': page.map(r => ({ _text: new URL(r.url).pathname })),
  } }, ['getetag', 'addressData']);
  if (cards.length !== page.length) throw new MailError('DAV_RESULT_CHANGED', 'Contact resources changed while reading. Restart the search.');
  const contacts = cards.map(row => {
    const resource = service.childUrl(row.href, ref.collection, 'carddav');
    const expected = page.find(r => r.url === resource);
    if (!expected || expected.etag !== row.props.getetag) throw new MailError('DAV_RESULT_CHANGED', 'Contact resources changed while reading. Restart the search.');
    return { id: service.id('carddav', ref.collection, resource), etag: row.props.getetag, bookId: args.bookId, book: ref.name, ...fields(contactData(row.props.addressData?._cdata ?? row.props.addressData)) };
  });
  return { contacts, nextCursor: offset + limit < refs.length ? encode([1, scope, revision, offset + limit]) : null };
}
export async function createContact(service, args) {
  const ref = await service.collection(args.bookId, 'carddav', 'canCreate');
  const card = new ICAL.Component('vcard');
  card.updatePropertyWithValue('version', '4.0');
  const uid = randomUUID(); card.updatePropertyWithValue('uid', `urn:uuid:${uid}`); patchCard(card, args);
  return { ...await service.put('carddav', { ...ref, resource: new URL(`${uid}.vcf`, ref.collection).href }, card.toString()), uid: `urn:uuid:${uid}` };
}
export async function updateContact(service, args) {
  const ref = await service.collection(args.id, 'carddav', 'canUpdate', true);
  const current = await service.readResource(ref, 'carddav', args.etag);
  const card = contactData(current.data); patchCard(card, args.patch);
  return service.put('carddav', ref, card.toString(), current.etag);
}
