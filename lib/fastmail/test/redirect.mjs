import './mail-redirect.mjs';
import { fixtureFetch } from './https-fetch.mjs';
globalThis.fetch = (url, options) => fixtureFetch(url, options, { port: process.env.FIXTURE_DAV_PORT });
