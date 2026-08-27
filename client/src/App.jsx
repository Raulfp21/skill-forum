import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import SkillDetail from './pages/SkillDetail.jsx';
import Forum from './pages/Forum.jsx';
import Search from './pages/Search.jsx';

function parseHash() {
  const raw = window.location.hash.replace(/^#/, '') || '/';
  const [path, query = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  return { path: '/' + parts.join('/'), params: parts.slice(1), query };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [llmMode, setLlmMode] = useState('checking');

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    api.chatConfig().then((c) => setLlmMode(c.llm)).catch(() => setLlmMode('mock'));
  }, []);

  const nav = (href) => {
    window.location.hash = href;
    setRoute(parseHash());
  };

  const isActive = (p) => route.path === p;

  return (
    <div>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand" onClick={() => nav('/')} style={{ cursor: 'pointer' }}>
            <span className="logo">S</span>
            <span>Skill Forum</span>
          </div>
          <nav className="nav">
            <a className={isActive('/') ? 'active' : ''} onClick={() => nav('/')}>Skills</a>
            <a className={isActive('/forum') ? 'active' : ''} onClick={() => nav('/forum')}>Forum</a>
            <a className={isActive('/search') ? 'active' : ''} onClick={() => nav('/search')}>Journals</a>
          </nav>
          <div className="topbar-right">
            {llmMode === 'checking' ? '' : llmMode === 'configured' ? 'LLM: configured' : 'LLM: mock mode'}
          </div>
        </div>
      </header>

      <main className="container">
        {route.path === '/' && <Dashboard nav={nav} />}
        {route.path.startsWith('/skill') && route.params[0] && <SkillDetail id={route.params[0]} nav={nav} />}
        {route.path === '/forum' && <Forum nav={nav} />}
        {route.path === '/search' && <Search />}
      </main>
    </div>
  );
}
