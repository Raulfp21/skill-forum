import express from 'express';
import { store } from '../lib/store.js';
import { buildIndex, search } from '../lib/bm25.js';
import { generateAnswer, generateCompare, isRealLLM } from '../lib/mockllm.js';
import { getSkillById, loadChunks } from '../lib/pipeline.js';

const router = express.Router();

function getHistory() {
  return store.read('chat.json', {});
}
function saveHistory(h) {
  store.write('chat.json', h);
}

router.get('/config', (req, res) => {
  res.json({ llm: isRealLLM() ? 'configured' : 'mock' });
});

router.post('/compare', async (req, res) => {
  const { skillIds, message, mode } = req.body || {};
  const ids = Array.isArray(skillIds) ? skillIds : [];
  if (!message?.trim() || ids.length < 2) {
    return res.status(400).json({ error: 'message and at least 2 skillIds are required' });
  }

  const skillDataList = [];
  for (const id of ids) {
    const skill = getSkillById(id);
    if (!skill) continue;
    const index = buildIndex(loadChunks(id));
    const results = search(index, message, 4);
    skillDataList.push({ skill, results });
  }
  if (skillDataList.length < 2) {
    return res.status(400).json({ error: 'At least 2 valid skills are required' });
  }

  const answer = await generateCompare(skillDataList, message, mode);
  res.json({ ...answer, query: message });
});

router.post('/', async (req, res) => {
  const { skillId, message } = req.body || {};
  if (!skillId || !message?.trim()) {
    return res.status(400).json({ error: 'skillId and message are required' });
  }

  const skill = getSkillById(skillId);
  if (!skill) return res.status(404).json({ error: 'Skill not found' });

  const chunks = loadChunks(skillId);
  const index = buildIndex(chunks);
  const results = search(index, message, 6);

  const answer = await generateAnswer(skill, message, results);

  const history = getHistory();
  if (!history[skillId]) history[skillId] = [];
  history[skillId].push({ role: 'user', content: message, at: new Date().toISOString() });
  history[skillId].push({ role: 'assistant', content: answer.text, refs: answer.refs, mode: answer.mode, at: new Date().toISOString() });
  saveHistory(history);

  res.json({ ...answer, query: message, skill: { id: skill.id, name: skill.name } });
});

router.get('/:skillId', (req, res) => {
  const history = getHistory();
  res.json(history[req.params.skillId] || []);
});

export default router;
