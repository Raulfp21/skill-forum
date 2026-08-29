import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { api } from '../api.js';

function Markdown({ text }) {
  const html = marked.parse(text || '');
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}

const emptyAgent = () => ({ name: '', stance: '', skillId: '' });

const AGENT_COLORS = ['#6b48ff', '#e8590c', '#0ca678', '#e03131', '#1098ad', '#f08c00'];
const BEAT_LABELS = {
  point: 'point',
  pushback: 'pushback',
  clarify: 'clarify',
  concede: 'concede',
  example: 'example',
  answer: 'answer',
  close: 'close',
  moderator: 'moderator',
};

function agentColor(name) {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AGENT_COLORS.length;
  return AGENT_COLORS[h];
}

export default function Forum({ nav }) {
  const [topics, setTopics] = useState(null);
  const [selected, setSelected] = useState(null);
  const [skills, setSkills] = useState([]);
  const [mode, setMode] = useState('topic');
  const [form, setForm] = useState({ title: '', body: '', author: 'Anonymous', skillId: '' });
  const [debateForm, setDebateForm] = useState({
    title: '',
    question: '',
    author: 'You',
    style: 'explain',
    rounds: 2,
    moderator: false,
    agents: [emptyAgent(), emptyAgent()],
  });
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const esRef = useRef(null);

  const stopStream = () => {
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
  };
  useEffect(() => () => stopStream(), []);

  const load = () => api.listTopics().then(setTopics).catch((e) => setError(e.message));
  useEffect(() => { load(); api.listSkills().then(setSkills).catch(() => {}); }, []);

  const create = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    const t = await api.createTopic({ ...form, skillId: form.skillId || null });
    setForm({ title: '', body: '', author: 'Anonymous', skillId: '' });
    load();
    open(t.id);
  };

  const updateAgent = (i, patch) => {
    setDebateForm((f) => ({ ...f, agents: f.agents.map((a, idx) => (idx === i ? { ...a, ...patch } : a)) }));
  };
  const addAgent = () => setDebateForm((f) => ({ ...f, agents: [...f.agents, emptyAgent()] }));
  const removeAgent = (i) => setDebateForm((f) => ({ ...f, agents: f.agents.filter((_, idx) => idx !== i) }));

  const validAgents = debateForm.agents.filter((a) => a.name.trim());
  const canRunDebate = debateForm.title.trim() && debateForm.question.trim() && validAgents.length >= 2 && !busy;

  const runDebate = async () => {
    if (!canRunDebate) return;
    setBusy(true);
    setError('');
    try {
      const { topicId } = await api.createDebate({
        title: debateForm.title.trim(),
        question: debateForm.question.trim(),
        author: debateForm.author,
        style: debateForm.style,
        rounds: debateForm.rounds,
        moderator: debateForm.moderator,
        agents: validAgents.map((a) => ({ name: a.name.trim(), stance: a.stance.trim(), skillId: a.skillId || null })),
      });
      setDebateForm({ title: '', question: '', author: 'You', style: 'explain', rounds: 2, moderator: false, agents: [emptyAgent(), emptyAgent()] });
      load();
      const t = await api.getTopic(topicId);
      setSelected(t);
      attachStream(topicId);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  const attachStream = (id) => {
    stopStream();
    if (!id) return;
    const es = api.streamDebate(id);
    esRef.current = es;
    const appendPost = (post) => {
      setSelected((s) => {
        if (!s || s.id !== id) return s;
        if (s.posts.some((p) => p.id === post.id)) return s;
        return { ...s, posts: [...s.posts, post], debate: { ...s.debate, status: 'running' } };
      });
    };
    es.addEventListener('beat', (e) => appendPost(JSON.parse(e.data).post));
    es.addEventListener('synthesis', (e) => appendPost(JSON.parse(e.data).post));
    es.addEventListener('error', () => {
      stopStream();
      setSelected((s) => (s && s.id === id ? { ...s, debate: { ...s.debate, status: 'done' } } : s));
      setBusy(false);
    });
    es.addEventListener('done', () => {
      stopStream();
      setSelected((s) => (s && s.id === id ? { ...s, debate: { ...s.debate, status: 'done' } } : s));
      setBusy(false);
    });
  };

  const open = async (id) => {
    const t = await api.getTopic(id);
    setSelected(t);
    if (t.debate?.status === 'running') {
      setBusy(true);
      attachStream(id);
    } else {
      setBusy(false);
    }
  };

  const postReply = async () => {
    if (!reply.trim()) return;
    await api.replyTopic(selected.id, { body: reply, author: 'Anonymous' });
    setReply('');
    open(selected.id);
  };

  const skillName = (id) => skills.find((s) => s.id === id)?.name;

  if (selected) {
    const isDebate = Boolean(selected.debate);
    return (
      <div>
        <div className="row">
          <button onClick={() => setSelected(null)}>Back to topics</button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{selected.title}</h1>
        </div>
        <p className="page-sub">
          By {selected.author} · {new Date(selected.createdAt).toLocaleString()}
          {isDebate && <span className="badge" style={{ marginLeft: 8 }}>AI debate · {selected.debate.agents.length} agents</span>}
          {isDebate && selected.debate.status === 'running' && <span className="badge gray" style={{ marginLeft: 8 }}>running…</span>}
        </p>
        {selected.skillId && (
          <p><button className="primary" onClick={() => nav(`/skill/${selected.skillId}`)}>Open linked skill: {skillName(selected.skillId)}</button></p>
        )}

        <div className="card">
          {isDebate ? (
            <div className="debate-thread">
              {selected.posts.map((p) => {
                if (p.role === 'question') {
                  return (
                    <div key={p.id} className="post post-question">
                      <div className="meta"><strong>Question</strong></div>
                      <div className="body">{p.body}</div>
                    </div>
                  );
                }
                if (p.role === 'synthesis') {
                  return (
                    <div key={p.id} className="post post-synthesis">
                      <div className="meta"><strong>Final Inference</strong> · {new Date(p.createdAt).toLocaleString()} {p.mode === 'mock' && <span className="label">mock</span>}</div>
                      <Markdown text={p.body} />
                    </div>
                  );
                }
                if (p.role === 'agent' || p.role === 'moderator') {
                  const color = agentColor(p.author);
                  return (
                    <div key={p.id} className="post post-agent beat" style={{ borderLeftColor: color }}>
                      <div className="meta">
                        <span className="avatar" style={{ background: color }}>{p.author.charAt(0)}</span>
                        <strong>{p.author}</strong>
                        {p.beatType && <span className="badge beat-tag" style={{ color, borderColor: color }}>{BEAT_LABELS[p.beatType] || p.beatType}</span>}
                        {p.stance && <span className="badge gray" style={{ marginLeft: 6 }}>{p.stance}</span>}
                        {p.skillName && <span className="badge" style={{ marginLeft: 6 }}>{p.skillName}</span>}
                        {p.mode === 'mock' && <span className="label" style={{ marginLeft: 6 }}>mock</span>}
                        {p.replyTo && <span className="small muted reply-to">↳ in reply to {p.replyTo}</span>}
                      </div>
                      <Markdown text={p.body} />
                      {p.refs && p.refs.length > 0 && (
                        <div className="small muted mt">
                          Refs: {p.refs.map((rf) => `[${rf.refId}] ${rf.chapter} / ${rf.section}`).join('  ·  ')}
                        </div>
                      )}
                    </div>
                  );
                }
                return (
                  <div key={p.id} className="post">
                    <div className="meta"><strong>{p.author}</strong> · {new Date(p.createdAt).toLocaleString()}</div>
                    <div className="body">{p.body}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            selected.posts.map((p) => (
              <div key={p.id} className="post">
                <div className="meta"><strong>{p.author}</strong> · {new Date(p.createdAt).toLocaleString()}</div>
                <div className="body">{p.body}</div>
              </div>
            ))
          )}
        </div>

        <div className="card mt">
          <h4>Reply</h4>
          <textarea rows="3" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Add to the discussion..." />
          <div className="mt"><button className="primary" onClick={postReply}>Reply</button></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="page-title">Forum</h1>
      <p className="page-sub">Post a topic, link it to a skill, or run an AI-vs-AI-vs-AI debate with a final inference.</p>

      <div className="tabs">
        <button className={mode === 'topic' ? 'active' : ''} onClick={() => setMode('topic')}>Start a topic</button>
        <button className={mode === 'debate' ? 'active' : ''} onClick={() => setMode('debate')}>Start an AI debate</button>
      </div>

      {mode === 'topic' && (
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <input placeholder="Topic title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="row" style={{ marginBottom: 8 }}>
            <input placeholder="Your name (optional)" value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} />
            <select value={form.skillId} onChange={(e) => setForm({ ...form, skillId: e.target.value })}>
              <option value="">Link a skill (optional)</option>
              {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <textarea rows="4" placeholder="What do you want to discuss?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="mt"><button className="primary" onClick={create} disabled={!form.title.trim() || !form.body.trim()}>Create topic</button></div>
        </div>
      )}

      {mode === 'debate' && (
        <div className="card">
          <div className="row" style={{ marginBottom: 8 }}>
            <input placeholder="Debate title" value={debateForm.title} onChange={(e) => setDebateForm({ ...debateForm, title: e.target.value })} />
          </div>
          <textarea
            rows="2"
            placeholder='Question the agents will debate, e.g. "Ligature mark features that distinguish hanging from strangulation"'
            value={debateForm.question}
            onChange={(e) => setDebateForm({ ...debateForm, question: e.target.value })}
          />

          <h4 className="mt">Agents</h4>
          <p className="small muted">
            Each agent can be grounded in one of your skills (its position is cited from that source), or left
            source-free to argue from a stance/viewpoint alone. Mix and match per topic.
          </p>
          <div className="file-list">
            {debateForm.agents.map((a, i) => (
              <div key={i} className="file-item" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  placeholder={`Agent ${i + 1} name (e.g. Reddy's Forensic Medicine)`}
                  value={a.name}
                  onChange={(e) => updateAgent(i, { name: e.target.value })}
                  style={{ flex: '1 1 220px' }}
                />
                <input
                  placeholder="Stance / viewpoint (optional)"
                  value={a.stance}
                  onChange={(e) => updateAgent(i, { stance: e.target.value })}
                  style={{ flex: '1 1 220px' }}
                />
                <select value={a.skillId} onChange={(e) => updateAgent(i, { skillId: e.target.value })} style={{ flex: '1 1 180px' }}>
                  <option value="">No linked skill (general reasoning)</option>
                  {skills.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {debateForm.agents.length > 2 && (
                  <button onClick={() => removeAgent(i)} title="Remove agent">✕</button>
                )}
              </div>
            ))}
          </div>
          <div className="mt"><button onClick={addAgent}>+ Add agent</button></div>

          <h4 className="mt">How should they talk?</h4>
          <div className="tabs">
            <button className={debateForm.style === 'explain' ? 'active' : ''} onClick={() => setDebateForm({ ...debateForm, style: 'explain' })}>
              Explain (analogies &amp; examples)
            </button>
            <button className={debateForm.style === 'debate' ? 'active' : ''} onClick={() => setDebateForm({ ...debateForm, style: 'debate' })}>
              Debate (argue &amp; rebut)
            </button>
            <button className={debateForm.style === 'socratic' ? 'active' : ''} onClick={() => setDebateForm({ ...debateForm, style: 'socratic' })}>
              Socratic (question &amp; answer)
            </button>
          </div>
          <p className="small muted">
            {debateForm.style === 'debate'
              ? 'Agents argue their position and directly rebut each other with reasoning, round over round.'
              : debateForm.style === 'socratic'
              ? 'Agents drive understanding through probing questions and answers, building each round.'
              : 'Agents explain the topic clearly, reaching for analogies and concrete examples, building on each other each round.'}
          </p>

          <h4 className="mt">Exchanges</h4>
          <div className="tabs">
            {[1, 2, 3].map((n) => (
              <button key={n} className={debateForm.rounds === n ? 'active' : ''} onClick={() => setDebateForm({ ...debateForm, rounds: n })}>
                {n} exchange{n > 1 ? 's' : ''}
              </button>
            ))}
          </div>
          <p className="small muted">
            The agents talk in short, reactive beats (point, pushback, clarify, concede, example…). Each exchange is a quick back-and-forth; more exchanges make the conversation longer.
          </p>

          <label className="row mt" style={{ alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={debateForm.moderator}
              onChange={(e) => setDebateForm({ ...debateForm, moderator: e.target.checked })}
            />
            <span>Add a neutral moderator who asks questions between exchanges</span>
          </label>

          <div className="row mt" style={{ marginBottom: 8 }}>
            <input placeholder="Your name (optional)" value={debateForm.author} onChange={(e) => setDebateForm({ ...debateForm, author: e.target.value })} />
          </div>

          <div className="mt">
            <button className="primary" onClick={runDebate} disabled={!canRunDebate}>
              {busy ? 'Conversation running...' : 'Start conversation'}
            </button>
            {busy && <span className="small muted" style={{ marginLeft: 10 }}><span className="spin" /> Watching the conversation unfold live...</span>}
          </div>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      <div className="mt">
        <h3 className="page-sub">All topics</h3>
        {topics === null ? (
          <div className="empty"><span className="spin" /> Loading...</div>
        ) : topics.length === 0 ? (
          <div className="empty">No topics yet — start one above.</div>
        ) : (
          <div className="forum-list">
            {topics.map((t) => (
              <div key={t.id} className="card topic-card" onClick={() => open(t.id)}>
                <h3>{t.title}</h3>
                <div className="meta">{t.author} · {new Date(t.createdAt).toLocaleDateString()} · {t.posts} posts</div>
                {t.skillId && <span className="badge">skill: {skillName(t.skillId)}</span>}
                {t.debate && <span className="badge">AI debate · {t.debate.agents.length} agents</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
