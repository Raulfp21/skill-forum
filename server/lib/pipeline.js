import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

import { store } from './store.js';
import { extractText, parseFileHeaders, detectExt } from './extract.js';
import { generateSkill, renderMarkdown } from './skillgen.js';
import { slugify, titleCase } from './utils.js';

const skillsDir = path.join(import.meta.dirname, '..', 'skills');

export function getSkills() {
  return store.read('skills.json', []);
}
export function saveSkills(list) {
  store.write('skills.json', list);
}
export function saveChunks(skillId, chunks) {
  fs.mkdirSync(path.join(store.dataDir, 'chunks'), { recursive: true });
  store.write(path.join('chunks', `${skillId}.json`), chunks);
}
export function loadChunks(skillId) {
  return store.read(path.join('chunks', `${skillId}.json`), []);
}
export function getSkillById(id) {
  return getSkills().find((s) => s.id === id) || null;
}

function writeSkillFiles(doc, skill) {
  const dir = path.join(skillsDir, doc.slug);
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  const files = renderMarkdown(skill, doc);
  for (const [rel, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, rel), content);
  }
}

export async function processDocument(fileLike, { name } = {}) {
  const ext = detectExt(fileLike.originalname);
  if (!ext) throw Object.assign(new Error(`Unsupported file type: ${fileLike.originalname}`), { status: 400 });

  const headers = await parseFileHeaders(fileLike);
  const text = await extractText(fileLike);
  if (!text) throw Object.assign(new Error('No extractable text found (is this a scanned PDF?)'), { status: 400 });

  const skillName = titleCase(name || fileLike.originalname);
  const slug = slugify(skillName) || `doc-${Date.now()}`;
  const id = crypto.randomUUID();

  const doc = { id, name: skillName, slug, filename: fileLike.originalname, numPages: headers.numPages, size: fileLike.size };

  const skill = generateSkill({ name: skillName, slug, filename: doc.filename, text });
  writeSkillFiles(doc, skill);
  saveChunks(id, skill.chunks);

  const { chunks, ...meta } = skill;
  const record = {
    ...doc,
    status: 'ready',
    createdAt: new Date().toISOString(),
    summary: meta.summary,
    topics: meta.topics,
    glossary: meta.glossary.slice(0, 20),
    patternsCount: meta.patterns.length,
    factsCount: meta.facts.length,
    chapters: meta.chapters.map(({ id: cid, title, file, sections }) => ({ id: cid, title, file, sections })),
    stats: meta.stats,
    skillFiles: Object.keys(renderMarkdown(meta, doc)),
  };

  const list = getSkills();
  list.unshift(record);
  saveSkills(list);
  return record;
}
