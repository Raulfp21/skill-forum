import React, { useEffect, useRef, useState } from 'react';
import { marked } from 'marked';
import { api } from '../api.js';

function Markdown({ text }) {
  const html = marked.parse(text || '');
  return <div className="msg-body" dangerouslySetInnerHTML={{ __html: html }} />;
}

export default function ChatTab({ skill }) {
  const [history, setHistory] = useState([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [refs, setRefs] = useState([]);
  const [expandedRef, setExpandedRef] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    api.getChatHistory(skill.id).then((h) => {
      setHistory(h);
      const last = h.filter((m) => m.role === 'assistant').pop();
      if (last?.refs) setRefs(last.refs);
    }).catch(() => {});
  }, [skill.id]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [history, busy]);

  const send = async () => {
    const msg = input.trim();
    if (!msg || busy) return;
    setInput('');
    setBusy(true);
    setHistory((h) => [...h, { role: 'user', content: msg }]);
    try {
      const res = await api.sendChat({ skillId: skill.id, message: msg });
      setHistory((h) => [...h, { role: 'assistant', content: res.text, refs: res.refs, mode: res.mode }]);
      setRefs(res.refs || []);
    } catch (e) {
      setHistory((h) => [...h, { role: 'assistant', content: `Error: ${e.message}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="skill-layout">
      <div className="card chat-box">
        <div className="chat-history" ref={boxRef}>
          {history.length === 0 && (
            <div className="empty">Ask anything about {skill.name} — answers cite the exact chapter and section they come from.</div>
          )}
          {history.map((m, i) => (
            <div key={i} className={`msg ${m.role}`}>
              {m.role === 'assistant' && m.mode === 'mock' && <div className="label">Mock answer</div>}
              <Markdown text={m.content} />
            </div>
          ))}
          {busy && <div className="msg assistant"><span className="spin" /> Searching your skill...</div>}
        </div>
        <div className="chat-input">
          <input
            value={input}
            placeholder="Ask about this document..."
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
          />
          <button className="primary" onClick={send} disabled={busy || !input.trim()}>Ask</button>
        </div>
      </div>

      <div className="references">
        <h4>References</h4>
        {refs.length === 0 ? (
          <div className="muted small">Answers will list their sources here.</div>
        ) : (
          refs.map((r) => (
            <div key={r.refId} className="ref-item" onClick={() => setExpandedRef(expandedRef === r.refId ? null : r.refId)}>
              <div><span className="ref-num">[{r.refId}]</span> <span>{r.chapter}</span></div>
              <div className="ref-loc">{r.section} · score {r.score}</div>
              {expandedRef === r.refId && <div className="small muted mt">{r.snippet}</div>}
            </div>
          ))
        )}
        <div className="small muted mt">
          Ask a question, then click a reference to see the retrieved passage. Mode: mock (set USER_LLM_API_KEY in the server .env for real LLM answers).
        </div>
      </div>
    </div>
  );
}
