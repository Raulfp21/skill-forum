const SOURCES = {
  openalex: {
    name: 'OpenAlex',
    search: async (query, limit) => {
      const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'skill-forum/0.1 (mailto:dev@example.com)' } });
      if (!res.ok) throw new Error(`OpenAlex ${res.status}`);
      const data = await res.json();
      return (data.results || []).map((w) => ({
        id: w.id,
        title: w.title || 'Untitled',
        authors: (w.authorships || []).slice(0, 8).map((a) => a.author?.display_name || ''),
        year: w.publication_year,
        venue: w.primary_location?.source?.display_name || '',
        doi: w.doi || '',
        url: w.doi || w.landing_page_url || w.id || '',
        abstract: w.abstract_inverted_index ? invertAbstract(w.abstract_inverted_index).slice(0, 500) : '',
        citedBy: w.cited_by_count || 0,
        source: 'OpenAlex',
      }));
    },
  },
  arxiv: {
    name: 'arXiv',
    search: async (query, limit) => {
      const url = `http://export.arxiv.org/api/query?search_query=${encodeURIComponent(`all:${query}`)}&max_results=${limit}`;
      const res = await fetch(url, { headers: { 'User-Agent': 'skill-forum/0.1' } });
      if (!res.ok) throw new Error(`arXiv ${res.status}`);
      const xml = await res.text();
      const entries = [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)];
      return entries.map((e) => {
        const x = e[1];
        const field = (tag) => x.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1]?.trim() || '';
        const authors = [...x.matchAll(/<name>([\s\S]*?)<\/name>/g)].map((m) => m[1]);
        return {
          id: field('id'),
          title: field('title').replace(/\s+/g, ' '),
          authors,
          year: field('published')?.slice(0, 4),
          venue: 'arXiv',
          doi: '',
          url: field('id'),
          abstract: field('summary').replace(/\s+/g, ' ').slice(0, 500),
          citedBy: 0,
          source: 'arXiv',
        };
      });
    },
  },
};

function invertAbstract(index) {
  if (!index) return '';
  const pos = {};
  for (const [word, offsets] of Object.entries(index)) {
    for (const o of offsets) pos[o] = word;
  }
  return Object.keys(pos).sort((a, b) => a - b).map((o) => pos[o]).join(' ');
}

export async function searchJournals(query, { sources = ['openalex'], limit = 10 } = {}) {
  const results = [];
  for (const s of sources) {
    const mod = SOURCES[s];
    if (!mod) continue;
    try {
      const found = await mod.search(query, limit);
      results.push(...found);
    } catch {
      // skip failed source silently
    }
  }
  return results;
}

export function listSources() {
  return Object.values(SOURCES).map((s) => s.name);
}
