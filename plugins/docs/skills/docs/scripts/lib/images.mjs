// Local images: type, pixel size (from the file header) and loading relative to the Markdown file.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIME = { png: 'image/png', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', webp: 'image/webp' };

export function imageType(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return 'png';
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return 'gif';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  const head = buf.toString('utf8', 0, Math.min(buf.length, 2048)).trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(head)) return 'svg';
  return null;
}

/** Pixel size of an image buffer, or null when it cannot be read. */
export function imageSize(buf, type = imageType(buf)) {
  if (type === 'png') return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  if (type === 'gif') return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  if (type === 'jpeg') {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2;
        continue;
      }
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: buf.readUInt16BE(i + 7), height: buf.readUInt16BE(i + 5) };
      }
      i += 2 + len;
    }
    return null;
  }
  if (type === 'webp') {
    const chunk = buf.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
    if (chunk === 'VP8 ') return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    if (chunk === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    return null;
  }
  if (type === 'svg') {
    const tag = /<svg\b[^>]*>/i.exec(buf.toString('utf8'))?.[0] ?? '';
    const num = (name) => {
      const m = new RegExp(`\\b${name}\\s*=\\s*["']\\s*([\\d.]+)(px)?\\s*["']`, 'i').exec(tag);
      return m ? Number(m[1]) : null;
    };
    const vb = /\bviewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(tag);
    const width = num('width') ?? (vb ? Number(vb[1]) : null);
    const height = num('height') ?? (vb ? Number(vb[2]) : null);
    if (width && height) return { width, height };
    if (vb) return { width: Number(vb[1]), height: Number(vb[2]) };
    return { width: 600, height: 400 };
  }
  return null;
}

/**
 * Loads an image a document refers to.
 * @returns {{ ok: true, data: Buffer, type: string, mime: string, width: number, height: number, file: string } | { ok: false, reason: string }}
 */
export function loadImage(src, baseDir) {
  if (/^https?:\/\//i.test(src)) return { ok: false, reason: 'remote image (only local files are embedded)' };
  if (/^data:/i.test(src)) {
    const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(src);
    if (!m) return { ok: false, reason: 'unreadable data URI' };
    const data = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
    return finish(data, 'data URI');
  }
  let file;
  try {
    file = src.startsWith('file:') ? fileURLToPath(src) : path.resolve(baseDir, decodeURI(src.split(/[?#]/)[0]));
  } catch {
    file = path.resolve(baseDir, src);
  }
  if (!existsSync(file)) return { ok: false, reason: `file not found: ${path.relative(baseDir, file) || file}` };
  return finish(readFileSync(file), file);
}

function finish(data, file) {
  const type = imageType(data);
  if (!type) return { ok: false, reason: 'not a png, jpeg, gif, webp or svg image' };
  const size = imageSize(data, type);
  if (!size) return { ok: false, reason: 'could not read the image size' };
  return { ok: true, data, type, mime: MIME[type], ...size, file };
}
