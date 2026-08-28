import express from 'express';
import crypto from 'node:crypto';
import { store } from '../lib/store.js';
import { buildIndex, search } from '../lib/bm25.js';
import { getSkillById, loadChunks } from '../lib/pipeline.js';
import { generateAgentTurn, generateSynthesis } from '../lib/mockllm.js';

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

router.post('/debate', async (req, res) => {
  const { title, question, agents, author, style, rounds } = req.body || {};
  if (!title?.trim() || !question?.trim()) {
    return res.status(400).json({ error: 'Title and question are required' });
  }
  if (!Array.isArray(agents) || agents.length < 2) {
    return res.status(400).json({ error: 'At least 2 agents are required' });
  }
  const cleanAgents = agents
    .map((a) => ({ name: (a.name || '').trim(), stance: (a.stance || '').trim(), skillId: a.skillId || null }))
    .filter((a) => a.name);
  if (cleanAgents.length < 2) {
    return res.status(400).json({ error: 'Each agent needs a name' });
  }
  const cleanStyle = ['explain', 'debate', 'socratic'].includes(style) ? style : 'explain';
  const numRounds = Math.min(3, Math.max(1, parseInt(rounds, 10) || 1));

  const resolvedAgents = cleanAgents.map((agent) => {
    let skillName = null;
    let pool = [];
    if (agent.skillId) {
      const skill = getSkillById(agent.skillId);
      if (skill) {
        skillName = skill.name;
        const index = buildIndex(loadChunks(agent.skillId));
        pool = search(index, question, 4 * numRounds + 4);
      }
    }
    return { ...agent, skillName, pool, usedChunkIds: new Set() };
  });

  const agentPosts = [];
  const transcript = [];

  for (let round = 1; round <= numRounds; round++) {
    for (const agent of resolvedAgents) {
      const unused = agent.pool.filter((r) => !agent.usedChunkIds.has(r.chunk.id));
      const results = unused.slice(0, 4);
      results.forEach((r) => agent.usedChunkIds.add(r.chunk.id));
      const answer = await generateAgentTurn(
        { name: agent.name, stance: agent.stance, skillId: agent.skillId, skillName: agent.skillName },
        question,
        results,
        { style: cleanStyle, transcript: transcript.slice(), round, totalRounds: numRounds }
      );
      const post = {
        id: crypto.randomUUID(),
        author: agent.name,
        body: answer.text,
        createdAt: new Date().toISOString(),
        isAI: true,
        role: 'agent',
        round,
        stance: agent.stance || null,
        skillId: agent.skillId || null,
        skillName: agent.skillName,
        refs: answer.refs,
        mode: answer.mode,
      };
      agentPosts.push(post);
      transcript.push({ author: agent.name, stance: agent.stance, body: answer.text, round });
    }
  }

  const synthesis = await generateSynthesis(question, agentPosts);

  const data = getTopics();
  const topic = {
    id: crypto.randomUUID(),
    title: title.trim(),
    author: (author || 'You').trim(),
    skillId: null,
    debate: { question: question.trim(), agents: cleanAgents, style: cleanStyle, rounds: numRounds },
    createdAt: new Date().toISOString(),
    posts: [
      {
        id: crypto.randomUUID(),
        author: (author || 'You').trim(),
        body: question.trim(),
        createdAt: new Date().toISOString(),
        role: 'question',
      },
      ...agentPosts,
      {
        id: crypto.randomUUID(),
        author: 'Final Inference',
        body: synthesis.text,
        createdAt: new Date().toISOString(),
        isAI: true,
        role: 'synthesis',
        mode: synthesis.mode,
      },
    ],
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
