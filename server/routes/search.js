import express from 'express';
import { searchJournals, listSources } from '../lib/search.js';

const router = express.Router();

router.get('/sources', (req, res) => {
  res.json({ sources: listSources() });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const limit = Math.min(Number(req.query.limit) || 10, 25);
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });

  const requested = String(req.query.source || 'openalex').split(',');
  const allowed = new Set(['openalex', 'arxiv']);
  const sources = requested.filter((s) => allowed.has(s));

  const results = await searchJournals(q, { sources, limit });
  res.json({ query: q, count: results.length, results });
});

export default router;
