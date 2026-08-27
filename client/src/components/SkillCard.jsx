import React from 'react';

export default function SkillCard({ skill, nav }) {
  const s = skill.stats || {};
  return (
    <div className="card skill-card" onClick={() => nav(`/skill/${skill.id}`)}>
      <h3>{skill.name}</h3>
      <div className="meta">{skill.filename} · {skill.status}</div>
      <div className="badges">
        <span className="badge">{s.chapterCount || 0} chapters</span>
        <span className="badge">{s.chunkCount || 0} chunks</span>
        <span className="badge gray">{s.wordCount?.toLocaleString() || 0} words</span>
        {skill.numPages ? <span className="badge gray">{skill.numPages} pages</span> : null}
      </div>
      <div className="meta">{skill.createdAt ? new Date(skill.createdAt).toLocaleDateString() : ''}</div>
    </div>
  );
}
