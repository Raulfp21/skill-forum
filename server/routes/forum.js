import express from 'express';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { store } from '../lib/store.js';
import { buildIndex, search } from '../lib/bm25.js';
import { getSkillById, loadChunks } from '../lib/pipeline.js';
import { generateBeat, generateSynthesis, BEAT_MENUS } from '../lib/mockllm.js';

const router = express.Router();
const emitters = new Map();

function getEmitter(id) {
  if (!emitters.has(id)) emitters.set(id, new EventEmitter());
  return emitters.get(id);
}

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
  const { title, question, agents, author, style, rounds, moderator } = req.body || {};
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

  const topic = {
    id: crypto.randomUUID(),
    title: title.trim(),
    author: (author || 'You').trim(),
    skillId: null,
    debate: {
      question: question.trim(),
      agents: cleanAgents,
      style: cleanStyle,
      rounds: numRounds,
      moderator: Boolean(moderator),
      status: 'running',
    },
    createdAt: new Date().toISOString(),
    posts: [
      {
        id: crypto.randomUUID(),
        author: (author || 'You').trim(),
        body: question.trim(),
        createdAt: new Date().toISOString(),
        role: 'question',
      },
    ],
  };
  const data = getTopics();
  data.topics.unshift(topic);
  saveTopics(data);
  res.status(202).json({ topicId: topic.id });

  runDebate(topic.id).catch((err) => {
    console.error(`Debate ${topic.id} failed:`, err);
    getEmitter(topic.id).emit('error', { message: err.message || 'Debate failed' });
  });
});

async function runDebate(topicId) {
  const em = getEmitter(topicId);
  const read = () => getTopics().topics.find((t) => t.id === topicId);
  const initial = read();
  if (!initial) return;
  const { question, agents, style, rounds, moderator } = initial.debate;

  const resolvedAgents = agents.map((agent) => {
    let skillName = null;
    let pool = [];
    if (agent.skillId) {
      const skill = getSkillById(agent.skillId);
      if (skill) {
        skillName = skill.name;
        const index = buildIndex(loadChunks(agent.skillId));
        pool = search(index, question, 24);
      }
    }
    return { ...agent, skillName, pool };
  });
  const usedChunkIds = new Set();
  const transcript = [];
  const agentPosts = [];

  const persist = (mutator) => {
    const d = getTopics();
    const top = d.topics.find((t) => t.id === topicId);
    if (!top) return false;
    mutator(top);
    saveTopics(d);
    return true;
  };

  const makeBeat = async (agent, beatType, { round = 1, totalRounds = 1, target } = {}) => {
    const fresh = agent.pool.filter((r) => !usedChunkIds.has(r.chunk.id)).slice(0, 2);
    fresh.forEach((r) => usedChunkIds.add(r.chunk.id));
    const last = transcript.length ? transcript[transcript.length - 1] : null;
    const answer = await generateBeat(
      { name: agent.name, stance: agent.stance, skillId: agent.skillId, skillName: agent.skillName },
      question,
      last,
      beatType,
      fresh,
      { style, round, totalRounds, target }
    );
    const post = {
      id: crypto.randomUUID(),
      author: agent.name,
      body: answer.text,
      createdAt: new Date().toISOString(),
      isAI: true,
      role: beatType === 'moderator' ? 'moderator' : 'agent',
      beatType,
      replyTo: last ? last.author : null,
      stance: agent.stance || null,
      skillId: agent.skillId || null,
      skillName: agent.skillName,
      refs: answer.refs,
      mode: answer.mode,
    };
    agentPosts.push(post);
    transcript.push({ author: agent.name, stance: agent.stance, beatType, body: answer.text });
    persist((top) => top.posts.push(post));
    em.emit('beat', { post });
  };

  const pickBeatType = (agent, round, localIndex) => {
    const spokeCount = transcript.filter((t) => t.author === agent.name).length;
    const lastByAuthor = [...transcript].reverse().find((t) => t.author === agent.name);
    const lastBeat = transcript.length ? transcript[transcript.length - 1] : null;
    if (spokeCount === 0) return 'point';
    if (lastBeat && lastBeat.beatType === 'moderator') return 'answer';
    if (lastBeat && lastBeat.beatType === 'clarify') return 'answer';
    const menu = BEAT_MENUS[style] || BEAT_MENUS.explain;
    let type = menu[(spokeCount - 1 + localIndex) % menu.length];
    if (type === lastByAuthor?.beatType) type = menu[(spokeCount + localIndex) % menu.length];
    return type;
  };

  const n = resolvedAgents.length;
  for (let round = 1; round <= rounds; round++) {
    const start = (round - 1) % n;
    for (let b = 0; b < 4; b++) {
      const agent = resolvedAgents[(start + b) % n];
      const beatType = pickBeatType(agent, round, b);
      await makeBeat(agent, beatType, { round, totalRounds: rounds });
    }
    if (moderator) {
      const target = resolvedAgents[(start + 2) % n].name;
      await makeBeat({ name: 'Moderator', stance: null, skillId: null, skillName: null, pool: [] }, 'moderator', { round, totalRounds: rounds, target });
    }
  }
  for (const agent of resolvedAgents) {
    await makeBeat(agent, 'close', { round: rounds, totalRounds: rounds });
  }

  const synthesis = await generateSynthesis(question, agentPosts);
  const synthesisPost = {
    id: crypto.randomUUID(),
    author: 'Final Inference',
    body: synthesis.text,
    createdAt: new Date().toISOString(),
    isAI: true,
    role: 'synthesis',
    mode: synthesis.mode,
  };
  persist((top) => {
    top.posts.push(synthesisPost);
    top.debate.status = 'done';
  });
  em.emit('synthesis', { post: synthesisPost });
  em.emit('done', {});
}

router.get('/topics/:id/stream', (req, res) => {
  const topic = getTopics().topics.find((t) => t.id === req.params.id);
  if (!topic) return res.status(404).json({ error: 'Topic not found' });

  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();

  const em = getEmitter(topic.id);
  let closed = false;
  const write = (event, payload) => {
    if (!closed) res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };
  const onBeat = (payload) => write('beat', payload);
  const onSynthesis = (payload) => write('synthesis', payload);
  const onDone = () => { write('done', {}); finish(); };
  const onError = (payload) => { write('error', payload); finish(); };
  const finish = () => {
    if (closed) return;
    closed = true;
    em.removeListener('beat', onBeat);
    em.removeListener('synthesis', onSynthesis);
    em.removeListener('done', onDone);
    em.removeListener('error', onError);
    res.end();
  };
  em.on('beat', onBeat);
  em.on('synthesis', onSynthesis);
  em.on('done', onDone);
  em.on('error', onError);
  res.on('close', finish);

  const cur = getTopics().topics.find((t) => t.id === req.params.id);
  if (cur) {
    for (const p of cur.posts) {
      if (p.role === 'agent' || p.role === 'moderator') write('beat', { post: p });
      else if (p.role === 'synthesis') write('synthesis', { post: p });
    }
    if (cur.debate?.status === 'done') {
      write('done', {});
      finish();
    }
  }
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
