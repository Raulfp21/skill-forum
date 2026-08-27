import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Forum({ nav }) {
  const [topics, setTopics] = useState(null);
  const [selected, setSelected] = useState(null);
  const [skills, setSkills] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', author: 'Anonymous', skillId: '' });
  const [reply, setReply] = useState('');
  const [error, setError] = useState('');

  const load = () => api.listTopics().then(setTopics).catch((e) => setError(e.message));
  useEffect(() => { load(); api.listSkills().then(setSkills).catch(() => {}); }, []);

  const create = async () => {
    if (!form.title.trim() || !form.body.trim()) return;
    const t = await api.createTopic({ ...form, skillId: form.skillId || null });
    setForm({ title: '', body: '', author: 'Anonymous', skillId: '' });
    load();
    open(t.id);
  };

  const open = async (id) => {
    const t = await api.getTopic(id);
    setSelected(t);
  };

  const postReply = async () => {
    if (!reply.trim()) return;
    await api.replyTopic(selected.id, { body: reply, author: 'Anonymous' });
    setReply('');
    open(selected.id);
  };

  const skillName = (id) => skills.find((s) => s.id === id)?.name;

  if (selected) {
    return (
      <div>
        <div className="row">
          <button onClick={() => setSelected(null)}>Back to topics</button>
          <h1 className="page-title" style={{ marginBottom: 0 }}>{selected.title}</h1>
        </div>
        <p className="page-sub">By {selected.author} · {new Date(selected.createdAt).toLocaleString()}</p>
        {selected.skillId && (
          <p><button className="primary" onClick={() => nav(`/skill/${selected.skillId}`)}>Open linked skill: {skillName(selected.skillId)}</button></p>
        )}
        <div className="card">
          {selected.posts.map((p) => (
            <div key={p.id} className="post">
              <div className="meta"><strong>{p.author}</strong> · {new Date(p.createdAt).toLocaleString()}</div>
              <div className="body">{p.body}</div>
            </div>
          ))}
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
      <p className="page-sub">Post a topic, link it to a skill, and discuss with cited sources.</p>

      <div className="card">
        <h4>Start a topic</h4>
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
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
