// Drives a locally installed Chrome, Edge, Chromium or Brave over the DevTools protocol: no npm packages,
// Node's built-in WebSocket (Node 22+).
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
  ],
  win32: [
    ...['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA'].flatMap((v) =>
      process.env[v]
        ? [
            path.join(process.env[v], 'Google/Chrome/Application/chrome.exe'),
            path.join(process.env[v], 'Microsoft/Edge/Application/msedge.exe'),
            path.join(process.env[v], 'Chromium/Application/chrome.exe'),
            path.join(process.env[v], 'BraveSoftware/Brave-Browser/Application/brave.exe'),
          ]
        : [],
    ),
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/usr/bin/brave-browser',
    '/snap/bin/chromium',
  ],
};

/** The browser to use: `CHROME_PATH` when set, else the first installed candidate, else null. */
export function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return (CANDIDATES[process.platform] ?? CANDIDATES.linux).find((p) => existsSync(p)) ?? null;
}

export class ChromeMissingError extends Error {
  constructor() {
    super(
      'No Chrome, Edge, Chromium or Brave found. Install one, or set CHROME_PATH to its executable, then run the command again.',
    );
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  #ws;
  #next = 1;
  #pending = new Map();
  #listeners = new Set();

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(typeof event.data === 'string' ? event.data : Buffer.from(event.data).toString());
      if (msg.id !== undefined) {
        const p = this.#pending.get(msg.id);
        if (!p) return;
        this.#pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
        else p.resolve(msg.result);
      } else {
        for (const l of this.#listeners) l(msg);
      }
    });
    ws.addEventListener('close', () => {
      for (const p of this.#pending.values()) p.reject(new Error('The browser closed the connection.'));
      this.#pending.clear();
    });
  }

  send(method, params = {}, sessionId) {
    const id = this.#next++;
    this.#ws.send(JSON.stringify({ id, method, params, ...(sessionId && { sessionId }) }));
    return new Promise((resolve, reject) => this.#pending.set(id, { resolve, reject, method }));
  }

  once(method, sessionId, timeoutMs = 60000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#listeners.delete(listener);
        reject(new Error(`Timed out waiting for ${method}.`));
      }, timeoutMs);
      const listener = (msg) => {
        if (msg.method !== method || (sessionId && msg.sessionId !== sessionId)) return;
        clearTimeout(timer);
        this.#listeners.delete(listener);
        resolve(msg.params);
      };
      this.#listeners.add(listener);
    });
  }

  close() {
    this.#ws.close();
  }
}

class Page {
  constructor(cdp, sessionId) {
    this.cdp = cdp;
    this.sessionId = sessionId;
  }

  send(method, params) {
    return this.cdp.send(method, params, this.sessionId);
  }

  /** Sets the viewport in CSS pixels. */
  async viewport(width, height, scale = 1) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: scale,
      mobile: false,
    });
  }

  /** Loads a local file (or URL) and waits for the load event and for its fonts and images. */
  async open(fileOrUrl, hash = '') {
    const url = /^[a-z]+:/i.test(fileOrUrl) ? fileOrUrl : pathToFileURL(path.resolve(fileOrUrl)).href;
    const loaded = this.cdp.once('Page.loadEventFired', this.sessionId);
    await this.send('Page.navigate', { url: url + hash });
    await loaded;
    await this.evaluate(
      `Promise.all([document.fonts.ready, ...[...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))])`,
    );
  }

  /** Evaluates an expression in the page; promises are awaited and the value comes back as JSON. */
  async evaluate(expression) {
    const { result, exceptionDetails } = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) {
      throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text ?? 'evaluate failed');
    }
    return result.value;
  }

  /** A PNG of the viewport, or of `clip` ({x, y, width, height} in CSS pixels). */
  async screenshot(clip, format = 'png') {
    const { data } = await this.send('Page.captureScreenshot', {
      format,
      ...(format === 'jpeg' && { quality: 90 }),
      captureBeyondViewport: !!clip,
      ...(clip && { clip: { ...clip, scale: 1 } }),
    });
    return Buffer.from(data, 'base64');
  }

  /** Prints the page; the page's own `@page` size is used. */
  async pdf(options = {}) {
    const { data } = await this.send('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
      marginTop: 0,
      marginBottom: 0,
      marginLeft: 0,
      marginRight: 0,
      ...options,
    });
    return Buffer.from(data, 'base64');
  }
}

/**
 * Starts a headless browser, gives `fn` a page, and always shuts the browser down.
 * @template T
 * @param {(page: Page) => Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withPage(fn) {
  const executable = findChrome();
  if (!executable) throw new ChromeMissingError();
  if (typeof WebSocket === 'undefined') throw new Error('Node 22 or later is needed (no built-in WebSocket).');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'wevir-chrome-'));
  const child = spawn(
    executable,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-sync',
      '--hide-scrollbars',
      '--mute-audio',
      '--force-color-profile=srgb',
      '--allow-file-access-from-files',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  let exited = false;
  child.on('exit', () => {
    exited = true;
  });
  let cdp;
  try {
    let port;
    let wsPath;
    for (let i = 0; i < 300 && !port; i++) {
      if (exited) throw new Error(`The browser (${executable}) exited during start-up.`);
      try {
        const [p, w] = (await readFile(path.join(profile, 'DevToolsActivePort'), 'utf8')).split('\n');
        if (p && w) [port, wsPath] = [p.trim(), w.trim()];
      } catch {}
      if (!port) await sleep(50);
    }
    if (!port) throw new Error('The browser did not open its DevTools port within 15 seconds.');
    const ws = new WebSocket(`ws://127.0.0.1:${port}${wsPath}`);
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true });
      ws.addEventListener('error', () => reject(new Error('Could not connect to the browser.')), { once: true });
    });
    cdp = new Cdp(ws);
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const page = new Page(cdp, sessionId);
    await page.send('Page.enable');
    await page.send('Runtime.enable');
    return await fn(page);
  } finally {
    try {
      await cdp?.send('Browser.close');
    } catch {}
    cdp?.close();
    for (let i = 0; i < 40 && !exited; i++) await sleep(50);
    if (!exited) child.kill('SIGKILL');
    await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
}
