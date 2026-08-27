import React, { useRef, useState } from 'react';
import { api } from '../api.js';

export default function UploadZone({ onUploaded }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleFiles = async (files) => {
    const file = files[0];
    if (!file) return;
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.append('file', file);
    try {
      const skill = await api.uploadSkill(fd);
      onUploaded(skill);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        className={`upload-zone ${dragging ? 'dragover' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".txt,.md,.html,.htm,.pdf,.docx" onChange={(e) => handleFiles(e.target.files)} />
        {busy ? (
          <div><span className="spin" /> Converting to skill... this can take a moment for PDFs.</div>
        ) : (
          <div>
            <strong>Drop a document here or click to browse</strong>
            <div className="small">PDF, DOCX, Markdown, HTML or TXT (up to 40 MB). Scanned PDFs need OCR first.</div>
          </div>
        )}
      </div>
      {error && <div className="error">{error}</div>}
    </div>
  );
}
