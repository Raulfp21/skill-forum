import express from 'express';
import crypto from 'node:crypto';
import { store } from '../lib/store.js';

const router = express.Router();

function getTopics() {
  return store.read('forum.json', { topics: [] });
}
function saveTopics(data) {
  store.write('forum.json', data);
}

router.get('/', (req, res) => {
  const { topics } = getTopics();
  res.json(topics.map((t) => ({ ...t, posts: t.posts.length })));
});

router.get('/:id', (req, res) => {
  const topic = getTopics().topics.find((t) => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  res.json(topic);
});

router.post('/', (req, res) => {
  const { title, body, author, skillId } = req.body || {};
  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({ error: 'Title and body are required' });
  }
  const data = getTopics();
  const topic = {
    id: crypto.randomUUID(),
    title: title.trim(),
    author: (author || 'Anonymous').trim(),
    skillId: skillId || null,
    createdAt: new Date().toISOString(),
    posts: [{
      id: crypto.randomUUID(),
      author: (author || 'Anonymous').trim(),
      body: body.trim(),
      createdAt: new Date().toISOString(),
    }],
  };
  data.topics.unshift(topic);
  saveTopics(data);
  res.status(201).json(topic);
});

router.post('/:id/posts', (req, res) => {
  const { body, author } = req.body || {};
  if (!body?.trim()) return res.status(400).json({ error: 'Body is required' });
  const data = getTopics();
  const topic = data.topics.find((t) => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });
  topic.posts.push({
    id: crypto.randomUUID(),
    author: (author || 'Anonymous').trim(),
    body: body.trim(),
    createdAt: new Date().toISOString(),
  });
  saveTopics(data);
  res.status(201).json(topic);
});

export default router;
