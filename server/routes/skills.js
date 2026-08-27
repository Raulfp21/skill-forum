import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import multer from 'multer';

import { store } from '../lib/store.js';
import { detectExt } from '../lib/extract.js';
import { processDocument } from '../lib/pipeline.js';

const router = express.Router();
const uploadsDir = path.join(import.meta.dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const upload = multer({ dest: uploadsDir, limits: { fileSize: 40 * 1024 * 1024 } });

function getSkills() {
  return store.read('skills.json', []);
}

router.get('/', (req, res) => {
  const skills = getSkills().map((s) => ({ ...s }));
  res.json(skills);
});

router.get('/:id', (req, res) => {
  const skill = getSkills().find((s) => s.id === req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  res.json(skill);
});

router.get('/:id/file', (req, res) => {
  const skill = getSkills().find((s) => s.id === req.params.id);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });
  const rel = String(req.query.path || 'SKILL.md').replace(/^\/+/, '');
  const root = path.resolve(path.join(import.meta.dirname, '..', 'skills'), skill.slug);
  const target = path.resolve(root, rel);
  if (!target.startsWith(root)) return res.status(400).json({ error: 'Invalid path' });
  if (!fs.existsSync(target)) return res.status(404).json({ error: 'File not found' });
  res.type('text/markdown').send(fs.readFileSync(target, 'utf8'));
});

router.post('/', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!detectExt(req.file.originalname)) {
      return res.status(400).json({ error: 'Unsupported file type. Use txt, md, html, pdf or docx.' });
    }
    const record = await processDocument(req.file, { name: req.body.name });
    res.status(201).json(record);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'Processing failed' });
  } finally {
    if (req.file) fs.rmSync(req.file.path, { force: true });
  }
});

export default router;
