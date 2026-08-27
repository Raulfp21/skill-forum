import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SUPPORTED = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

export function detectExt(name) {
  const ext = path.extname(name || '').toLowerCase();
  return SUPPORTED[ext] ? ext : null;
}

async function extractPdf(buffer) {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  return data.text || '';
}

async function extractDocx(buffer) {
  const mammoth = (await import('mammoth'));
  const { value } = await mammoth.extractRawText({ buffer });
  return value || '';
}

function extractHtml(text) {
  const without = text
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  return without.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

export async function extractText(file) {
  const ext = detectExt(file.originalname);
  if (!ext) {
    throw Object.assign(new Error(`Unsupported file type: ${file.originalname}`), { status: 400 });
  }

  const buffer = fs.readFileSync(file.path);
  let text = '';

  if (ext === '.pdf') {
    text = await extractPdf(buffer);
  } else if (ext === '.docx') {
    text = await extractDocx(buffer);
  } else if (ext === '.html' || ext === '.htm') {
    text = extractHtml(buffer.toString('utf8'));
  } else {
    text = buffer.toString('utf8');
  }

  return text.trim();
}

export async function parseFileHeaders(file) {
  const buffer = fs.readFileSync(file.path);
  if (detectExt(file.originalname) !== '.pdf') return { title: null, numPages: null };
  const pdfParse = (await import('pdf-parse')).default;
  try {
    const data = await pdfParse(buffer, { max: 2 });
    return { title: data.info?.Title || null, numPages: data.numpages };
  } catch {
    return { title: null, numPages: null };
  }
}
