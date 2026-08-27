const LLM_KEY = process.env.USER_LLM_API_KEY || '';
const LLM_BASE_URL = process.env.USER_LLM_BASE_URL || 'https://api.openai.com/v1';
const LLM_MODEL = process.env.USER_LLM_MODEL || 'gpt-4o-mini';

export function isRealLLM() {
  return Boolean(LLM_KEY);
}

function firstSentence(text) {
  const m = text.replace(/\s+/g, ' ').match(/[^.!?]*[.!?]/);
  return m ? m[0].trim() : text.slice(0, 180).trim();
}

function buildReferences(results) {
  return results.map((r, i) => ({
    refId: i + 1,
    chapter: r.chunk.chapterTitle,
    section: r.chunk.sectionTitle,
    chunkId: r.chunk.id,
    snippet: firstSentence(r.chunk.text),
    score: Math.round(r.score * 1000) / 1000,
  }));
}

function mockAnswer(skill, query, results) {
  const refs = buildReferences(results);
  const points = results.map((r, i) => {
    const t = firstSentence(r.chunk.text);
    return `- **${r.chunk.sectionTitle}** (${r.chunk.chapterTitle}) — ${t}  \`[${i + 1}]\``;
  }).join('\n');

  const head = results.length
    ? `Here is what I found in **${skill.name}** about "${query}". The answer is synthesized from the retrieved passages below — enable a real LLM (set \`USER_LLM_API_KEY\`) for fluent full answers.`
    : `I could not find a strong match for "${query}" in **${skill.name}**. Try rephrasing, or check the skill files for exact wording.`;

  const refBlock = refs.length
    ? `\n\n## References\n\n${refs.map((r) => `[${r.refId}] ${r.chapter} — ${r.section} (score ${r.score})`).join('\n')}`
    : '';

  return `${head}\n\n## Retrieved passages\n\n${points}${refBlock}`;
}

async function realLLM(skill, query, results) {
  const context = results.map((r, i) => {
    return `[${i + 1}] SOURCE: ${r.chunk.chapterTitle} / ${r.chunk.sectionTitle}\n${r.chunk.text}`;
  }).join('\n\n---\n\n');

  const prompt = `You are a research assistant grounded in the skill "${skill.name}".

Answer the user question using ONLY the provided source passages. Cite each claim with
bracketed numbers matching the sources, e.g. [1][2]. If the sources don't contain the
answer, say so explicitly and do not invent facts.

## Sources
${context || '(no sources provided)'}

## Question
${query}

## Answer`;

  const res = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`LLM request failed (${res.status})`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function generateAnswer(skill, query, results) {
  if (isRealLLM() && results.length) {
    try {
      const text = await realLLM(skill, query, results);
      return { text, refs: buildReferences(results), mode: 'llm' };
    } catch (err) {
      return { text: mockAnswer(skill, query, results), refs: buildReferences(results), mode: 'mock', error: err.message };
    }
  }
  return { text: mockAnswer(skill, query, results), refs: buildReferences(results), mode: 'mock' };
}

export function summarizeWithLLM(text, maxChars = 300) {
  return text.length > maxChars ? text.slice(0, maxChars).trim() + '…' : text;
}
