import { MailService } from '../mail/service.mjs';
import { publicError } from '../mail/profiles.mjs';
import { createEvent, queryCalendar, updateEvent } from './calendar.mjs';
import { createContact, searchContacts, updateContact } from './contacts.mjs';
import { DavService } from './dav.mjs';
import { validateDavCall } from './tools.mjs';

export class FastmailService {
  constructor(options = {}) {
    this.env = options.env ?? process.env;
    this.mail = options.mail ?? new MailService(options);
    this.dav = new DavService(options);
  }
  async invoke(name, args = {}) {
    if (name.startsWith('mail_')) return this.mail.invoke(name, args);
    validateDavCall(name, args);
    switch (name) {
      case 'fastmail_check_account': {
        const result = await this.mail.invoke('mail_check_account');
        const checks = { ...result.checks };
        for (const protocol of ['caldav', 'carddav']) {
          try { const collections = await this.dav.collections(protocol); checks[protocol] = { status: 'connected', collections: collections.length }; }
          catch (error) { checks[protocol] = publicError(error, this.env); }
        }
        const statuses = Object.values(checks).map(c => c.status);
        return { provider: 'fastmail', address: result.address, status: statuses.every(s => s === 'connected') ? 'connected' : statuses.some(s => s === 'connected') ? 'partial' : 'failed', checks };
      }
      case 'calendar_list': return { calendars: await this.dav.collections('caldav') };
      case 'calendar_query': return queryCalendar(this.dav, args);
      case 'calendar_create_event': return createEvent(this.dav, args);
      case 'calendar_update_event': return updateEvent(this.dav, args);
      case 'contacts_list_books': return { books: await this.dav.collections('carddav') };
      case 'contacts_search': return searchContacts(this.dav, args);
      case 'contacts_create': return createContact(this.dav, args);
      case 'contacts_update': return updateContact(this.dav, args);
    }
  }
}
