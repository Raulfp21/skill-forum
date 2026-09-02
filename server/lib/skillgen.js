import { chunkText, slugify } from './utils.js';

const STOP = new Set([
  'a','an','and','are','as','at','be','but','by','for','from','has','have','he','her','his',
  'i','in','is','it','its','of','on','or','our','she','that','the','their','them','they','this',
  'to','was','we','were','will','with','you','your','which','while','than','then','there','these',
  'not','no','so','if','do','does','did','can','could','should','would','may','might','about',
]);

function tokenize(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w));
}

function detectHeadings(lines) {
  const headings = [];
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i] || '').trim();
    if (!line) continue;

    // Legal sections are content headings, NOT chapters.
    if (/^(section|sec\.?)\s+\d+/i.test(line)) {
      headings.push({ index: i, level: 2, text: line });
      continue;
    }

    // Markdown CHAPTER headings are major headings; other markdown headings are sections.
    if (/^#{1,3}\s+/.test(line)) {
      const text = line.replace(/^#+\s*/, '').trim();
      if (text.length >= 12) {
        headings.push({ index: i, level: /^chapter\s+\d+/i.test(text) ? 1 : 2, text });
      }
      continue;
    }

    // ONLY explicit CHAPTER headings create chapter boundaries.
    if (/^chapter\s+\d+/i.test(line)) {
      headings.push({ index: i, level: 1, text: line });
      continue;
    }

    // Reject fragments commonly produced by two-column PDF extraction.
    const badFragment = /^(TO CAUSE|IS LIKELY|INJURY WHICH|A BODILY|NATURE TO CAUSE|COURSE OF|WHICH IS|THE IN|OF THE)$/i;
    if (badFragment.test(line)) continue;

    // ALL-CAPS lines are section headings, never chapters.
    const words = line.split(/\s+/);
    if (line.length >= 18 && line.length <= 100 && words.length >= 2 && words.length <= 12 && /^[A-Z0-9][A-Z0-9\s&',.\-():/]+$/.test(line)) {
      headings.push({ index: i, level: 2, text: line });
    }
  }
  return headings;
}

function splitChapters(lines, headings) {
  // CRITICAL: only explicit CHAPTER headings split the document.
  // Repeated CHAPTER headings are often PDF running headers, so a
  // consecutive repeat of the same chapter number is ignored.
  const starts = [];
  let lastChapterNo = null;

  for (const h of headings) {
    if (h.level !== 1) continue;

    const match = h.text.trim().match(/^chapter\s+(\d+)/i);
    if (!match) continue;

    const chapterNo = match[1];

    // Ignore repeated running-header copies of the same chapter.
    if (chapterNo === lastChapterNo) continue;

    starts.push(h);
    lastChapterNo = chapterNo;
  }

  if (starts.length > 0) {
    return starts.map((h, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].index : lines.length;

      return {
        title: h.text,
        body: lines.slice(h.index, end).join('\n').trim(),
      };
    }).filter((c) => c.body);
  }

  // If no real CHAPTER heading exists, keep the document as one chapter.
  return [{
    title: 'Document',
    body: lines.join('\n').trim()
  }];
}

function extractSections(body, chaptersOffset = 0) {
  const lines = body.split('\n');
  const sections = [];
  let current = { title: 'Introduction', text: '' };
  let inCode = false;
  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('```')) { inCode = !inCode; continue; }
    if (!inCode && (t.startsWith('## ') || t.startsWith('### ') || /^(section|sec\.?)\s+\d+/i.test(t))) {
      if (current.text.trim()) sections.push(current);
      current = { title: t.replace(/^#+\s*/, ''), text: '' };
      continue;
    }
    current.text += line + '\n';
  }
  if (current.text.trim()) sections.push(current);
  return sections;
}

function extractDefinedTerms(body) {
  const terms = new Map();
  const regex = /\b([A-Z][A-Za-z0-9-]{2,}(?:\s[A-Za-z0-9-]{1,}){0,3})\s+(?:is|are|means|refers to|denotes|defined as)\s+([^.\n]{5,140})/g;
  let m;
  while ((m = regex.exec(body))) {
    const term = m[1].trim();
    if (term.length > 3 && term.length < 60 && !terms.has(term)) terms.set(term, m[2].trim());
  }
  return terms;
}

function collectKeyTerms(chapters) {
  const freq = new Map();
  for (const ch of chapters) {
    const tokens = tokenize(ch.body);
    const seen = new Set();
    for (const t of tokens) {
      if (seen.has(t)) continue;
      seen.add(t);
      freq.set(t, (freq.get(t) || 0) + 1);
    }
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40);
}

function extractPatterns(chapters) {
  const patterns = [];
  const hints = /\b(always|never|must|should|avoid|remember|best practice|rule of thumb|to use|step[s]?\b|technique|pattern|recommend|tip)\b/i;
  for (const ch of chapters) {
    for (const sec of ch.sections) {
      for (const raw of sec.text.split('\n')) {
        const line = raw.trim();
        if (line.length < 20 || line.length > 240 || !hints.test(line)) continue;
        if (/^[`*#>|]/.test(line)) continue;
        const clean = line.replace(/^[-•*]+\s*/, '').replace(/```/g, '').trim();
        if (clean) patterns.push({ chapter: ch.title, section: sec.title, text: clean });
      }
      if (patterns.length > 300) return patterns;
    }
  }
  return patterns;
}

function extractFacts(chapters) {
  const facts = [];
  const numRegex = /\b\d[\d,.]*\%?|\$\d[\d,.]*|\b\d+(?:\.\d+)?\s?(?:ms|s|min|hours?|days?|GB|MB|KB|TB|Hz|GHz|%|x)\b/i;
  for (const ch of chapters) {
    for (const sec of ch.sections) {
      for (const s of sec.text.split(/(?<=[.!?])\s+/)) {
        const clean = s.trim().replace(/^[-•*]+\s*/, '');
        if (clean.length < 15 || clean.length > 200 || !numRegex.test(clean)) continue;
        facts.push({ chapter: ch.title, section: sec.title, text: clean });
      }
      if (facts.length > 200) return facts;
    }
  }
  return facts;
}

function buildSummary(chapters) {
  const tops = chapters.slice(0, 2).map((c) => {
    const sentences = c.body.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 30);
    return sentences[0] || '';
  }).filter(Boolean);
  return tops.join(' ');
}

function buildTopics(chapters) {
  const terms = collectKeyTerms(chapters);
  return terms.slice(0, 12).map(([t, n]) => ({ term: t, count: n }));
}

export function generateSkill(doc) {
  const lines = doc.text.split('\n');
  const headings = detectHeadings(lines);
  const chapters = splitChapters(lines, headings);
  const chaptersOut = [];
  const chaptersForMining = [];
  let chunkId = 0;
  const allChunks = [];

  chapters.forEach((ch, i) => {
    const sections = extractSections(ch.body);
    const chapterTitle = slugify(ch.title) || `part-${i + 1}`;
    const chapterId = `ch${String(i + 1).padStart(2, '0')}`;
    chaptersOut.push({ id: chapterId, title: ch.title, file: `chapters/${chapterId}-${chapterTitle}.md`, sections: sections.map((s) => s.title), body: ch.body });
    chaptersForMining.push({ title: ch.title, sections });

    for (const sec of sections) {
      const text = `${sec.title}\n\n${sec.text}`.trim();
      for (const piece of chunkText(text, 600, 120)) {
        allChunks.push({ id: `c${chunkId++}`, chapterId, chapterTitle: ch.title, sectionTitle: sec.title, text: piece });
      }
    }
  });

  if (!allChunks.length) {
    for (const piece of chunkText(doc.text, 600, 120)) {
      allChunks.push({ id: `c${chunkId++}`, chapterId: 'ch00', chapterTitle: 'Document', sectionTitle: 'Full text', text: piece });
    }
  }

  const glossary = new Map();
  for (const ch of chapters) {
    const defs = extractDefinedTerms(ch.body);
    for (const [term, def] of defs) glossary.set(term, def);
  }

  const patterns = extractPatterns(chaptersForMining);
  const facts = extractFacts(chaptersForMining);
  const keyTerms = collectKeyTerms(chapters);
  const topics = buildTopics(chapters);
  const summary = buildSummary(chapters);

  return {
    chapters: chaptersOut,
    chunks: allChunks,
    glossary: [...glossary.entries()].slice(0, 80).map(([term, def]) => ({ term, def })),
    patterns,
    facts,
    keyTerms: keyTerms.slice(0, 25).map(([term, count]) => ({ term, count })),
    topics,
    summary,
    stats: { wordCount: doc.text.split(/\s+/).length, chapterCount: chaptersOut.length, chunkCount: allChunks.length },
  };
}

export function renderMarkdown(skill, doc) {
  const files = {};
  const toc = skill.chapters.map((c) => `- ${c.title} \`\`${c.file}\`\``).join('\n');
  files['SKILL.md'] = `# ${doc.name}\n\n${skill.summary || 'Converted from ' + doc.filename}\n\n## Overview\n\n- **Slug:** \`${doc.slug}\`\n- **Words:** ${skill.stats.wordCount}\n- **Chapters:** ${skill.stats.chapterCount}\n- **Chunks:** ${skill.stats.chunkCount}\n\n## Chapter index (loaded on demand)\n\n${toc}\n\n## How to use\n\nAsk questions about ${doc.name}. The agent retrieves the most relevant chapter\nand answers from the real content with references — no hallucination.\n`;

  for (const c of skill.chapters) {
    let md = `# ${c.title}\n\n`;
    const sections = extractSections(c.body);
    for (const sec of sections) md += `## ${sec.title}\n\n${sec.text.trim()}\n\n`;
    files[c.file] = md;
  }

  const gl = skill.glossary.length ? skill.glossary.map((g) => `- **${g.term}** — ${g.def}`).join('\n') : '_(no formal definitions detected)_';
  files['glossary.md'] = `# Glossary\n\n${gl}\n`;
  const pat = skill.patterns.length ? skill.patterns.slice(0, 80).map((p) => `- [${p.chapter}] ${p.text}`).join('\n') : '_(no patterns detected)_';
  files['patterns.md'] = `# Patterns & Rules of Thumb\n\n${pat}\n`;
  const factsMd = skill.facts.length ? skill.facts.slice(0, 60).map((f) => `- [${f.chapter}] ${f.text}`).join('\n') : '_(no numeric facts detected)_';
  files['cheatsheet.md'] = `# Cheatsheet — key facts\n\n${factsMd}\n`;
  return files;
}
