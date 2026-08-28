import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import { api } from '../api.js';

function Markdown({ text }) {
  const html = marked.parse(text || '');
  return <div className="msg-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function Compare() {
  const [skills, setSkills] = useState([]);
  const [selected, setSelected] = useState([]);
  const [mode, setMode] = useState('explain');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listSkills().then(setSkills).catch((e) => setError(e.message));
  }, []);

  const toggle = (id) => {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  };

  const ask = async () => {
    const msg = input.trim();
    if (!msg || selected.length < 2 || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await api.compareChat({ skillIds: selected, message: msg, mode });
      setResult(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="page-title">Compare books</h1>
      <p className="page-sub">
        Pick two or more skills, ask a question, and get either a combined explanation or a
        book-by-book debate — every claim cited back to its source book, chapter and section.
      </p>

      <div className="card">
        <h4>1. Pick books</h4>
        {skills.length === 0 && <div className="muted small">No skills yet — upload documents first.</div>}
        <div className="grid">
          {skills.map((s) => (
            <label key={s.id} className="file-item" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={selected.includes(s.id)}
                onChange={() => toggle(s.id)}
                style={{ marginRight: 8 }}
              />
              {s.name}
            </label>
          ))}
        </div>

        <h4 className="mt">2. Mode</h4>
        <div className="tabs">
          <button className={mode === 'explain' ? 'active' : ''} onClick={() => setMode('explain')}>
            Combined explanation
          </button>
          <button className={mode === 'debate' ? 'active' : ''} onClick={() => setMode('debate')}>
            Debate between books
          </button>
        </div>

        <h4 className="mt">3. Ask</h4>
        <div className="chat-input">
          <input
            value={input}
            placeholder={selected.length < 2 ? 'Select 2+ books above first...' : 'Ask a question about all selected books...'}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && ask()}
            disabled={selected.length < 2}
          />
          <button className="primary" onClick={ask} disabled={busy || selected.length < 2 || !input.trim()}>
            Ask
          </button>
        </div>
        {error && <div className="error mt">{error}</div>}
      </div>

      {busy && (
        <div className="empty">
          <span className="spin" /> Comparing books...
        </div>
      )}

      {result && (
        <div className="skill-layout mt">
          <div className="card chat-box">
            {result.mode === 'mock' && <div className="label">Mock answer</div>}
            <Markdown text={result.text} />
          </div>
          <div className="references">
            <h4>References</h4>
            {(result.refs || []).length === 0 ? (
              <div className="muted small">No matching passages found.</div>
            ) : (
              result.refs.map((r) => (
                <div key={r.refId} className="ref-item">
                  <div>
                    <span className="ref-num">[{r.refId}]</span> <strong>{r.book}</strong>
                  </div>
                  <div className="ref-loc">
                    {r.chapter} · {r.section} · score {r.score}
                  </div>
                  <div className="small muted mt">{r.snippet}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
