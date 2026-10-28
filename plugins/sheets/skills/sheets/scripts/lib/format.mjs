// Excel dates and number formats: serial numbers, reading dates and numbers out of text, and rendering a value
// through a format code the way Excel displays it (for TEXT(), column widths and CSV previews).

const DAY_MS = 86400000;
const UNIX_EPOCH = 25569; // serial of 1970-01-01 in the 1900 date system

/** Serial number in the 1900 date system (Excel's 1900-02-29 included, as Excel counts it). */
export function dateToSerial(y, m, d, hh = 0, mi = 0, ss = 0) {
  const s = Date.UTC(y, m - 1, d, hh, mi, ss) / DAY_MS + UNIX_EPOCH;
  return s < 61 ? s - 1 : s;
}

/** Calendar parts of a serial number; `date1904` for workbooks saved in the 1904 system. */
export function serialToParts(serial, date1904 = false) {
  let s = date1904 ? serial + 1462 : serial;
  if (s < 61) s += 1;
  const ms = Math.round(((s - UNIX_EPOCH) * DAY_MS) / 1000) * 1000; // displayed to the nearest second, as Excel does
  const d = new Date(ms);
  return {
    y: d.getUTCFullYear(),
    m: d.getUTCMonth() + 1,
    d: d.getUTCDate(),
    hh: d.getUTCHours(),
    mi: d.getUTCMinutes(),
    ss: d.getUTCSeconds(),
    ms: d.getUTCMilliseconds(),
    weekday: d.getUTCDay(),
  };
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

/** ISO text for a serial: `2026-10-01`, `2026-10-01T09:30:00` or `09:30:00` (time only, under one day). */
export function serialToIso(serial, date1904 = false) {
  const p = serialToParts(serial, date1904);
  const time = `${pad(p.hh)}:${pad(p.mi)}:${pad(p.ss)}`;
  if (serial >= 0 && serial < 1 && !date1904) return time;
  const date = `${p.y}-${pad(p.m)}-${pad(p.d)}`;
  return p.hh || p.mi || p.ss ? `${date}T${time}` : date;
}

function validDate(y, m, d) {
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 9999) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/**
 * Reads a date, date-time or time written unambiguously: `2026-10-01`, `2026/10/01`, `2026.10.01`,
 * `2026年10月1日`, optionally followed by a time, or a time alone (`09:30`, `9:30:15`).
 * Day-first and month-first forms such as 01/10/2026 are ambiguous and are not read (see looksLikeDate).
 * @returns {{ serial: number, kind: 'date'|'datetime'|'time' } | null}
 */
export function parseDateText(text) {
  const s = String(text).trim();
  let m = /^(\d{1,2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/.exec(s);
  if (m) {
    const [hh, mi, ss] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
    if (hh > 23 || mi > 59 || ss >= 60) return null;
    return { serial: (hh * 3600 + mi * 60 + ss) / 86400, kind: 'time' };
  }
  m =
    /^(\d{4})([-/.])(\d{1,2})\2(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s) ??
    /^(\d{4})(年)(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2})[:：](\d{2})(?:[:：](\d{2}))?)?$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[3]), Number(m[4])];
  if (!validDate(y, mo, d)) return null;
  if (m[5] === undefined) return { serial: dateToSerial(y, mo, d), kind: 'date' };
  const [hh, mi, ss] = [Number(m[5]), Number(m[6]), Number(m[7] ?? 0)];
  if (hh > 23 || mi > 59 || ss > 59) return null;
  return { serial: dateToSerial(y, mo, d, hh, mi, ss), kind: 'datetime' };
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MONTH_RE = `(?:${MONTHS.map((n) => `${n.slice(0, 3)}(?:${n.slice(3)})?`).join('|')})\\.?`;

/** True for text a person would read as a date, including ambiguous and spelled-out forms (for warnings only). */
export function looksLikeDate(text) {
  const s = String(text).trim();
  if (s.length < 6 || s.length > 40) return false;
  if (parseDateText(s) && parseDateText(s).kind !== 'time') return true;
  return (
    /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s) ||
    /^\d{4}年\d{1,2}月(?:\d{1,2}日)?$/.test(s) ||
    /^\d{1,2}月\d{1,2}日$/.test(s) ||
    new RegExp(`^(?:\\d{1,2}[ -]${MONTH_RE}[ -,]*\\d{2,4}|${MONTH_RE} \\d{1,2},? \\d{4})$`, 'i').test(s)
  );
}

const CURRENCY = '¥￥$€£₩₹';

/**
 * Reads a number written as text: `1,234.5`, `-12`, `(1,200)`, `12.5%`, `¥1,200`, `$ 3.20`, `1.2e3`.
 * Leading zeros (`007`) and digit strings over 15 digits are identifiers, not numbers, and return null.
 * @returns {{ value: number, kind: 'number'|'percent'|'currency', symbol?: string } | null}
 */
export function parseNumberText(text) {
  let s = String(text).trim().replace(/[\u2212\uff0d]/g, '-');
  if (!s || s.length > 40) return null;
  let negative = false;
  let kind = 'number';
  let symbol;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1).trim();
  } else if (s.startsWith('+')) s = s.slice(1).trim();
  if (CURRENCY.includes(s[0])) {
    symbol = s[0] === '￥' ? '¥' : s[0];
    kind = 'currency';
    s = s.slice(1).trim();
    if (s.startsWith('-')) {
      negative = !negative;
      s = s.slice(1).trim();
    }
  } else if (/元$/.test(s)) {
    symbol = '¥';
    kind = 'currency';
    s = s.slice(0, -1).trim();
  }
  if (s.endsWith('%') && kind === 'number') {
    kind = 'percent';
    s = s.slice(0, -1).trim();
  }
  if (!/^(?:\d{1,3}(?:,\d{3})+|\d+)?(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(s) || !/\d/.test(s)) return null;
  const digits = s.replace(/[,.]|[eE].*$/g, '');
  if (/^0\d/.test(s) || digits.length > 15) return null;
  let value = Number(s.replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  if (kind === 'percent') value /= 100;
  if (negative) value = -value;
  return symbol ? { value, kind, symbol } : { value, kind };
}

// ---------------------------------------------------------------- number formats

/** Splits a format code at `;` outside quotes and brackets. */
function sections(code) {
  const out = [''];
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') {
      const j = code.indexOf('"', i + 1);
      const end = j < 0 ? code.length : j;
      out[out.length - 1] += code.slice(i, end + 1);
      i = end;
    } else if (ch === '\\') {
      out[out.length - 1] += code.slice(i, i + 2);
      i++;
    } else if (ch === '[') {
      const j = code.indexOf(']', i);
      const end = j < 0 ? code.length : j;
      out[out.length - 1] += code.slice(i, end + 1);
      i = end;
    } else if (ch === ';') out.push('');
    else out[out.length - 1] += ch;
  }
  return out;
}

/** The code with quoted text, escapes and bracket parts removed, for deciding what kind of format it is. */
const bare = (code) => code.replace(/"[^"]*"|\\.|\[[^\]]*\]|_.|\*./g, '');

/** True when a format code shows a date or time (built-in ids are handled by the reader). */
export function isDateFormat(code) {
  if (!code || /^general$/i.test(code)) return false;
  const first = sections(code)[0];
  if (/\[(h+|m+|s+)\]/i.test(first)) return true;
  return /[ymdhs]|a{3,4}/i.test(bare(first).replace(/(am\/pm|a\/p)/gi, 'h')) && !/[0#?]/.test(bare(first));
}

function general(v) {
  if (Number.isInteger(v) && Math.abs(v) < 1e11) return String(v);
  const abs = Math.abs(v);
  if (abs !== 0 && (abs < 1e-9 || abs >= 1e11)) return v.toExponential(5).replace(/\.?0+e/, 'E').replace(/E\+?/, 'E+').replace('E+-', 'E-');
  return String(Number(v.toPrecision(10)));
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ZH_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** Breaks one section into literal text and format tokens. */
function lex(section) {
  const out = [];
  for (let i = 0; i < section.length; i++) {
    const ch = section[i];
    const rest = section.slice(i);
    let m;
    if (ch === '"') {
      const j = section.indexOf('"', i + 1);
      const end = j < 0 ? section.length : j;
      out.push({ lit: section.slice(i + 1, end) });
      i = end;
    } else if (ch === '\\') out.push({ lit: section[++i] ?? '' });
    else if (ch === '_') out.push({ lit: ' ', skip: section[++i] });
    else if (ch === '*') i++;
    else if (ch === '[') {
      const j = section.indexOf(']', i);
      const inner = section.slice(i + 1, j < 0 ? section.length : j);
      i = j < 0 ? section.length : j;
      if (/^\$/.test(inner)) out.push({ lit: inner.slice(1).split('-')[0] });
      else if (/^(h+|m+|s+)$/i.test(inner)) out.push({ tok: `[${inner.toLowerCase()}]` });
    } else if ((m = /^(am\/pm|a\/p)/i.exec(rest))) {
      out.push({ tok: m[0].toLowerCase() === 'a/p' ? 'a/p' : 'am/pm' });
      i += m[0].length - 1;
    } else if ((m = /^(y+|m+|d+|h+|s+|a{3,4})/i.exec(rest))) {
      out.push({ tok: m[0].toLowerCase() });
      i += m[0].length - 1;
    } else if ((m = /^\.0+/.exec(rest)) && out.some((t) => t.tok?.[0] === 's')) {
      out.push({ tok: m[0] });
      i += m[0].length - 1;
    } else out.push({ lit: ch, raw: true });
  }
  return out;
}

function renderDate(section, serial, date1904) {
  const tokens = lex(section);
  const p = serialToParts(serial, date1904);
  const ampm = tokens.some((t) => t.tok === 'am/pm' || t.tok === 'a/p');
  // m and mm mean minutes right after an hour or right before a second.
  const toks = tokens.filter((t) => t.tok);
  toks.forEach((t, k) => {
    if (t.tok !== 'm' && t.tok !== 'mm') return;
    const prev = toks[k - 1]?.tok ?? '';
    const next = toks[k + 1]?.tok ?? '';
    if (prev[0] === 'h' || prev.startsWith('[h') || next[0] === 's') t.minute = true;
  });
  const elapsed = serial * 24;
  return tokens
    .map((t) => {
      if (!t.tok) return t.lit;
      const k = t.tok;
      if (k === 'yy') return pad(p.y % 100);
      if (k[0] === 'y') return String(p.y);
      if (t.minute) return k === 'mm' ? pad(p.mi) : String(p.mi);
      if (k === 'm') return String(p.m);
      if (k === 'mm') return pad(p.m);
      if (k === 'mmm') return MONTHS[p.m - 1].slice(0, 1).toUpperCase() + MONTHS[p.m - 1].slice(1, 3);
      if (k === 'mmmmm') return MONTHS[p.m - 1][0].toUpperCase();
      if (k[0] === 'm') return MONTHS[p.m - 1][0].toUpperCase() + MONTHS[p.m - 1].slice(1);
      if (k === 'd') return String(p.d);
      if (k === 'dd') return pad(p.d);
      if (k === 'ddd') return WEEKDAYS[p.weekday].slice(0, 3);
      if (k[0] === 'd') return WEEKDAYS[p.weekday];
      if (k === 'aaa') return ZH_WEEKDAYS[p.weekday];
      if (k === 'aaaa') return `星期${ZH_WEEKDAYS[p.weekday]}`;
      if (k === '[h]' || k === '[hh]') return String(Math.floor(elapsed + 1e-9));
      if (k.startsWith('[m')) return String(Math.floor(elapsed * 60 + 1e-9));
      if (k.startsWith('[s')) return String(Math.floor(elapsed * 3600 + 1e-9));
      if (k[0] === 'h') {
        const h = ampm ? p.hh % 12 || 12 : p.hh;
        return k.length > 1 ? pad(h) : String(h);
      }
      if (k[0] === 's') return k.length > 1 ? pad(p.ss) : String(p.ss);
      if (k[0] === '.') return `.${pad(p.ms, 3).slice(0, k.length - 1)}`;
      if (k === 'am/pm') return p.hh < 12 ? 'AM' : 'PM';
      if (k === 'a/p') return p.hh < 12 ? 'A' : 'P';
      return '';
    })
    .join('');
}

function group(int) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function renderNumber(section, v, signed) {
  const tokens = lex(section);
  const pattern = tokens.map((t) => (t.raw ? t.lit : '\u0000')).join('');
  const m = /(?:[0#?][0#?,]*(?:\.[0#?]*)?|\.[0#?]+),*/.exec(pattern);
  if (!m) return tokens.map((t) => t.lit ?? '').join('') || (signed && v < 0 ? '-' : '') + general(Math.abs(v));
  const percents = (pattern.match(/%/g) ?? []).length;
  let x = Math.abs(v) * 100 ** percents;
  let num = m[0];
  // Commas right after the digits scale by a thousand each (#,##0, shows thousands).
  const scale = /,+$/.exec(num);
  if (scale) {
    x /= 1000 ** scale[0].length;
    num = num.slice(0, -scale[0].length);
  }
  const [intPat, decPat = ''] = num.split('.');
  const sci = /^[Ee][+-][0#]+/.exec(pattern.slice(m.index + m[0].length));
  let exponent = '';
  if (sci) {
    const e = x === 0 ? 0 : Math.floor(Math.log10(x));
    x /= 10 ** e;
    exponent = `E${e < 0 ? '-' : '+'}${pad(Math.abs(e), sci[0].length - 2)}`;
  }
  const decimals = (decPat.match(/[0#?]/g) ?? []).length;
  const minDecimals = (decPat.match(/0/g) ?? []).length;
  let [int, dec = ''] = (Math.round(Number(`${x}e${decimals}`)) / 10 ** decimals).toFixed(decimals).split('.');
  while (dec.length > minDecimals && dec.endsWith('0')) dec = dec.slice(0, -1);
  const minInt = (intPat.match(/0/g) ?? []).length;
  if (int === '0' && minInt === 0) int = '';
  int = int.padStart(minInt, '0');
  if (intPat.includes(',')) int = group(int);
  const numText = int + (dec || decPat.includes('0') ? `.${dec}` : '') + exponent;
  // Literal text stays around the number; the digit pattern (one pattern character per token) is replaced.
  const start = m.index;
  const end = m.index + m[0].length + (sci ? sci[0].length : 0);
  let out = '';
  tokens.forEach((t, pos) => {
    if (pos === start) out += numText;
    else if ((pos < start || pos >= end) && t.lit !== undefined) out += t.lit;
  });
  return (signed && v < 0 ? '-' : '') + out;
}

/**
 * Renders a value through an Excel number format code. Covers what spreadsheets use day to day: General,
 * digits with grouping and decimals, percent, scientific, currency and literal text, dates and times,
 * up to four sections (positive;negative;zero;text). Conditions and fractions are rendered approximately.
 */
export function formatValue(value, code = 'General', { date1904 = false } = {}) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  const secs = sections(code || 'General');
  if (typeof value === 'string') {
    const text = secs.length > 3 ? secs[3] : secs.find((s) => s.includes('@'));
    return text ? lex(text).map((t) => (t.raw && t.lit === '@' ? value : t.lit ?? '')).join('') : value;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return String(value);
  let section = secs[0];
  let signed = true;
  if (secs.length >= 2 && value < 0) {
    section = secs[1];
    signed = false;
  } else if (secs.length >= 3 && value === 0) section = secs[2];
  if (/^general$/i.test(bare(section).trim())) {
    const [before, after = ''] = section.split(/general/i);
    const literal = (part) => lex(part).map((t) => t.lit ?? '').join('');
    return literal(before) + general(signed ? value : Math.abs(value)) + literal(after);
  }
  if (isDateFormat(section) || /\[(h+|m+|s+)\]/i.test(section)) {
    if (value < 0) return '#'.repeat(8);
    return renderDate(section, value, date1904);
  }
  return renderNumber(section, value, signed);
}
