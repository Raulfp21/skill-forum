export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 60);
}

export function titleCase(name) {
  return String(name)
    .replace(/[-_]+/g, ' ')
    .replace(/\.[^.]+$/, '')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function chunkText(text, size = 600, overlap = 120) {
  const clean = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!clean) return [];
  const step = Math.max(size - overlap, 1);
  const words = clean.split(/\s+/);
  const chunks = [];
  for (let i = 0; i < words.length; i += step) {
    const part = words.slice(i, i + size).join(' ');
    if (part.trim()) chunks.push(part.trim());
  }
  return chunks;
}
