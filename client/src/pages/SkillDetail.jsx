import React, { useEffect, useState } from 'react';
import { marked } from 'marked';
import { api } from '../api.js';
import ChatTab from '../components/ChatTab.jsx';

const TAB_CHAT = 'chat';
const TAB_FILES = 'files';
const TAB_CHAPTERS = 'chapters';

export default function SkillDetail({ id, nav }) {
  const [skill, setSkill] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(TAB_CHAT);
  const [filePath, setFilePath] = useState('SKILL.md');
  const [fileContent, setFileContent] = useState('');
  const [chapterFile, setChapterFile] = useState('');

  useEffect(() => {
    setSkill(null);
    setError('');
    api.getSkill(id).then(setSkill).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    if (!skill) return;
    api.getSkillFile(id, filePath).then(setFileContent).catch(() => setFileContent(''));
  }, [id, filePath, skill]);

  if (error) return <div className="error">{error}</div>;
  if (!skill) return <div className="empty"><span className="spin" /> Loading skill...</div>;

  const openChapter = async (file) => {
    setTab(TAB_FILES);
    setFilePath(file);
    const content = await api.getSkillFile(id, file);
    setFileContent(content);
  };

  const html = marked.parse(fileContent || '');

  return (
    <div>
      <div className="row">
        <h1 className="page-title" style={{ marginBottom: 0 }}>{skill.name}</h1>
        <button onClick={() => nav('/')}>Back</button>
      </div>
      <p className="page-sub">
        {skill.filename} · {skill.stats?.chapterCount} chapters · {skill.stats?.chunkCount} chunks ·
        {skill.topics?.length ? ' topics: ' + skill.topics.slice(0, 6).map((t) => t.term).join(', ') : ''}
      </p>

      <div className="tabs">
        <button className={tab === TAB_CHAT ? 'active' : ''} onClick={() => setTab(TAB_CHAT)}>Chat with references</button>
        <button className={tab === TAB_FILES ? 'active' : ''} onClick={() => setTab(TAB_FILES)}>Skill files</button>
        <button className={tab === TAB_CHAPTERS ? 'active' : ''} onClick={() => setTab(TAB_CHAPTERS)}>Chapters</button>
      </div>

      {tab === TAB_CHAT && <ChatTab skill={skill} nav={nav} />}

      {tab === TAB_FILES && (
        <div className="card">
          <div className="file-list">
            {skill.skillFiles?.map((f) => (
              <div key={f} className="file-item" onClick={() => setFilePath(f)}>
                <span className="fname">{f}</span>
                <span>{f === filePath ? 'viewing' : ''}</span>
              </div>
            ))}
          </div>
          <div className="mt markdown" dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}

      {tab === TAB_CHAPTERS && (
        <div>
          <div className="card">
            <h4>Chapter index (loaded on demand)</h4>
            {skill.chapters?.map((c) => (
              <div key={c.id} className="file-item" onClick={() => openChapter(c.file)}>
                <div>
                  <div className="fname">{c.title}</div>
                  <div className="small muted">{c.sections.slice(0, 5).join(' · ')}{c.sections.length > 5 ? ' …' : ''}</div>
                </div>
                <button className="small">open</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
