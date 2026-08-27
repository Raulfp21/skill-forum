import React, { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Search() {
  const [q, setQ] = useState('');
  const [source, setSource] = useState('openalex');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    api.searchSources().then((s) => {}).catch(() => {});
  }, []);

  const run = async () => {
    if (!q.trim() || busy) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.searchJournals(q.trim(), source);
      setResults(res);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const citation = (r) => {
    const authors = r.authors.length > 3 ? r.authors.slice(0, 3).join(', ') + ', et al.' : r.authors.join(', ');
    return `${authors || 'Unknown'}. (${r.year || 'n.d.'}). ${r.title}. ${r.venue || ''}${r.doi ? `. doi:${r.doi}` : ''}`;
  };

  const copy = async (r, i) => {
    try {
      await navigator.clipboard.writeText(citation(r));
      setCopied(i);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };

  return (
    <div>
      <h1 className="page-title">Journal & research search</h1>
      <p className="page-sub">Search OpenAlex and arXiv for scholarly works — no API key required.</p>

      <div className="card">
        <div className="row">
          <input
            value={q}
            placeholder="e.g. retrieval augmented generation in medicine"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
          <select value={source} onChange={(e) => setSource(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="openalex">OpenAlex</option>
            <option value="arxiv">arXiv</option>
            <option value="openalex,arxiv">Both</option>
          </select>
          <button className="primary" onClick={run} disabled={busy || !q.trim()}>Search</button>
        </div>
        {busy && <div className="small muted mt"><span className="spin" /> Searching...</div>}
        {error && <div className="error">{error}</div>}
      </div>

      {results && (
        <div className="mt">
          <p className="muted small">{results.count} results for "{results.query}"</p>
          {results.results.length === 0 ? (
            <div className="empty">No results. Try different terms or another source.</div>
          ) : (
            <div className="results">
              {results.results.map((r, i) => (
                <div key={i} className="card result-card">
                  <h3>{r.title}</h3>
                  <div className="meta">
                    <span className="badge gray">{r.source}</span>
                    {r.year && <span className="badge gray">{r.year}</span>}
                    {r.citedBy > 0 && <span className="badge">{r.citedBy} citations</span>}
                  </div>
                  <div className="meta">{r.authors.join(', ')}{r.venue ? ' · ' + r.venue : ''}</div>
                  {r.abstract && <div className="abstract">{r.abstract}…</div>}
                  <div className="cite-row">
                    <button onClick={() => copy(r, i)}>{copied === i ? 'Copied' : 'Copy citation'}</button>
                    {r.url && <a href={r.url} target="_blank" rel="noreferrer">Open</a>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
