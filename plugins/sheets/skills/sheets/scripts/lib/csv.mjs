// CSV in and out: RFC 4180 quoting, the delimiter guessed from the first line, UTF-8 (with or without BOM)
// or GB18030 for files saved by Chinese Excel; written as UTF-8 with a BOM and CRLF so Excel reads Chinese.

/** Decodes a CSV file: UTF-8 when it is valid UTF-8, otherwise GB18030 (a superset of GBK). */
export function decodeText(buf) {
  if (buf[0] === 0xff && buf[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf.subarray(2));
  if (buf[0] === 0xfe && buf[1] === 0xff) return new TextDecoder('utf-16be').decode(buf.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buf);
    } catch {
      return buf.toString('latin1');
    }
  }
}

/** The delimiter used on the first line outside quotes: tab, semicolon or comma. */
export function guessDelimiter(text) {
  const line = text.slice(0, 10000).split(/\r?\n/).find((l) => l.trim()) ?? '';
  const counts = { ',': 0, '\t': 0, ';': 0 };
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch in counts) counts[ch]++;
  }
  if (counts['\t'] > 0 && counts['\t'] >= counts[',']) return '\t';
  if (counts[';'] > counts[',']) return ';';
  return ',';
}

/** Parses CSV text into rows of strings. */
export function parseCsv(text, delimiter = guessDelimiter(text)) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let wasQuoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '' && !wasQuoted) {
      quoted = true;
      wasQuoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
      wasQuoted = false;
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      wasQuoted = false;
    } else field += ch;
  }
  if (field !== '' || row.length || wasQuoted) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const needsQuotes = (s, delimiter) => s.includes(delimiter) || /["\r\n]/.test(s) || /^\s|\s$/.test(s);

/** Writes rows as CSV text: UTF-8 with BOM, CRLF line ends, quotes only where needed. */
export function toCsv(rows, { delimiter = ',', bom = true } = {}) {
  const lines = rows.map((row) =>
    row
      .map((v) => {
        const s = v === null || v === undefined ? '' : String(v);
        return needsQuotes(s, delimiter) ? `"${s.replace(/"/g, '""')}"` : s;
      })
      .join(delimiter),
  );
  return (bom ? '﻿' : '') + lines.join('\r\n') + (lines.length ? '\r\n' : '');
}
