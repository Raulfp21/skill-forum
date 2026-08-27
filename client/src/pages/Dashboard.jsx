import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import SkillCard from '../components/SkillCard.jsx';
import UploadZone from '../components/UploadZone.jsx';

export default function Dashboard({ nav }) {
  const [skills, setSkills] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.listSkills().then(setSkills).catch((e) => setError(e.message));
  }, []);

  const onUploaded = (skill) => nav(`/skill/${skill.id}`);

  return (
    <div>
      <h1 className="page-title">Your skills</h1>
      <p className="page-sub">
        Upload a book, paper, spec or notes. It is distilled into a structured skill —
        chapters, glossary, patterns and a cheatsheet — then chat with it and get answers with references.
      </p>

      <UploadZone onUploaded={onUploaded} />

      {error && <div className="error">{error}</div>}

      <div className="mt">
        {skills === null ? (
          <div className="empty"><span className="spin" /> Loading skills...</div>
        ) : skills.length === 0 ? (
          <div className="empty">No skills yet. Upload your first document above.</div>
        ) : (
          <div className="grid">
            {skills.map((s) => <SkillCard key={s.id} skill={s} nav={nav} />)}
          </div>
        )}
      </div>
    </div>
  );
}
