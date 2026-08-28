const BASE = '/api';

async function request(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  health: () => request('/health'),
  chatConfig: () => request('/chat/config'),

  listSkills: () => request('/skills'),
  getSkill: (id) => request(`/skills/${id}`),
  getSkillFile: async (id, path) => {
    const res = await fetch(`${BASE}/skills/${id}/file?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('Could not load file');
    return res.text();
  },
  uploadSkill: async (formData) => {
    const res = await fetch(`${BASE}/skills`, { method: 'POST', body: formData });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || 'Upload failed');
    }
    return res.json();
  },

  sendChat: (payload) => request('/chat', { method: 'POST', body: JSON.stringify(payload) }),
  getChatHistory: (skillId) => request(`/chat/${skillId}`),
  compareChat: (payload) => request('/chat/compare', { method: 'POST', body: JSON.stringify(payload) }),

  searchJournals: (q, source) => request(`/search?q=${encodeURIComponent(q)}&source=${source}`),
  searchSources: () => request('/search/sources'),

  listTopics: () => request('/forum'),
  getTopic: (id) => request(`/forum/${id}`),
  createTopic: (payload) => request('/forum', { method: 'POST', body: JSON.stringify(payload) }),
  replyTopic: (id, payload) => request(`/forum/${id}/posts`, { method: 'POST', body: JSON.stringify(payload) }),
  createDebate: (payload) => request('/forum/debate', { method: 'POST', body: JSON.stringify(payload) }),
};
