const LLM_KEY = process.env.USER_LLM_API_KEY || '';
const LLM_BASE_URL = process.env.USER_LLM_BASE_URL || 'https://api.openai.com/v1';
const LLM_MODEL = process.env.USER_LLM_MODEL || 'gpt-4o-mini';

export function isRealLLM() {
  return Boolean(LLM_KEY);
}

export async function chat(messages, { temperature = 0.5, model } = {}) {
  if (!isRealLLM()) return null;
  const res = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${LLM_KEY}`,
    },
    body: JSON.stringify({
      model: model || LLM_MODEL,
      messages,
      temperature,
    }),
  });
  if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
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

  const content = await chat(
    [{ role: 'user', content: prompt }],
    { temperature: 0.2 }
  );
  return content;
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

// ---------------------------------------------------------------------------
// AI vs AI vs AI debate: each agent argues a position (grounded in its own
// linked skill, or from general reasoning if no skill is linked), then a
// moderator pass produces a "Final Inference" synthesis across all agents.
// ---------------------------------------------------------------------------

function buildAgentReferences(results) {
  return results.map((r, i) => ({
    refId: i + 1,
    chapter: r.chunk.chapterTitle,
    section: r.chunk.sectionTitle,
    chunkId: r.chunk.id,
    snippet: firstSentence(r.chunk.text),
    score: Math.round(r.score * 1000) / 1000,
  }));
}

const STYLE_INSTRUCTIONS = {
  explain: `Explain clearly and helpfully, the way a good teacher would. Use a concrete analogy or a simple example wherever it would aid understanding. If earlier turns already made a point, don't repeat it — build on it, add nuance, or approach it from a different angle.`,
  debate: `Argue your position with reasoning, the way a sharp debater would. If you disagree with something said in an earlier turn, name it specifically and explain exactly why it's wrong or incomplete, then give your better-reasoned alternative. Don't just restate your opening point — actually engage with the disagreement.`,
  socratic: `Drive understanding through dialogue, the way a Socratic tutor would. Either ask one pointed question that exposes a gap, assumption, or edge case in the previous turn, or directly answer a question raised earlier — but always move the discussion forward rather than repeating it.`,
};

function styleLabel(style) {
  return style === 'debate' ? 'debate' : style === 'socratic' ? 'Socratic dialogue' : 'explanatory discussion';
}

function formatTranscript(transcript) {
  if (!transcript || !transcript.length) return '';
  return transcript.map((t) => `### ${t.author}${t.stance ? ` (${t.stance})` : ''} — round ${t.round}\n${t.body}`).join('\n\n');
}

function mockAgentTurn(agent, query, results, { style = 'explain', transcript = [] } = {}) {
  const stanceLine = agent.stance ? `**Stance:** ${agent.stance}\n\n` : '';
  const engageLine = transcript.length
    ? `_(Would respond to ${transcript[transcript.length - 1].author}'s previous turn here — enable a real LLM for that.)_\n\n`
    : '';
  if (!agent.skillId) {
    return `${stanceLine}${engageLine}No skill is linked for this agent, so this is a general-knowledge turn with no citations. Enable a real LLM (set \`USER_LLM_API_KEY\`) for a fluent ${styleLabel(style)} turn — or link a skill to ground this agent in a specific source.`;
  }
  if (!results.length) {
    return `${stanceLine}${engageLine}No strong match for "${query}" was found in **${agent.skillName}**. This agent has nothing to add from its linked source.`;
  }
  const points = results.map((r, i) => `- ${firstSentence(r.chunk.text)}  \`[${i + 1}]\``).join('\n');
  return `${stanceLine}${engageLine}Grounded in **${agent.skillName}**:\n\n${points}\n\nEnable a real LLM (set \`USER_LLM_API_KEY\`) for a fluent ${styleLabel(style)} turn instead of raw passages.`;
}

async function realAgentTurn(agent, query, results, { style = 'explain', transcript = [], round = 1, totalRounds = 1 } = {}) {
  const persona = agent.stance
    ? `You are "${agent.name}" in a multi-agent ${styleLabel(style)} about a topic, taking this stance: ${agent.stance}.`
    : `You are "${agent.name}" in a multi-agent ${styleLabel(style)} about a topic.`;

  const grounding = agent.skillId
    ? (results.length
      ? `Ground your turn in ONLY the following NEW source passages from "${agent.skillName}" (not used in earlier rounds), citing bracketed numbers like [1][2] matching them exactly. If the passages don't fully address the question, say so explicitly rather than inventing facts.\n\n## Sources\n${results.map((r, i) => `[${i + 1}] ${r.chunk.chapterTitle} / ${r.chunk.sectionTitle}\n${r.chunk.text}`).join('\n\n---\n\n')}`
      : `No further unused passages remain in your linked source "${agent.skillName}" — say briefly that your source is exhausted and, if useful, reason a short step further from what's already been cited rather than repeating it.`)
    : `No source is linked for you. Reason from general, well-established knowledge and be explicit that this turn is not source-cited.`;

  const styleLine = STYLE_INSTRUCTIONS[style] || STYLE_INSTRUCTIONS.explain;
  const priorText = transcript.length ? `## Discussion so far\n${formatTranscript(transcript)}\n\n` : '';
  const engageLine = transcript.length
    ? ` Directly engage with what has already been said above — agree, disagree, extend, or question it specifically by name. NEVER restate a point, question, or example already made above, even reworded — if you can't add something genuinely new, say the point stands and move to a different, more specific aspect instead.`
    : '';
  const closingLine = round >= totalRounds && totalRounds > 1
    ? ` This is the final round — work toward a concrete takeaway rather than opening a new line of questioning.`
    : '';

  const prompt = `${persona}\n\n${grounding}\n\n${styleLine}${engageLine}${closingLine}\n\n${priorText}## Topic / question\n${query}\n\nGive a tight, non-repetitive turn (90-160 words), not a full essay. Do not restate the question or introduce yourself.\n\n## Your turn`;

  const res = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
    body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.5 }),
  });
  if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function generateAgentTurn(agent, query, results, opts = {}) {
  if (isRealLLM() && (results.length || !agent.skillId)) {
    try {
      const text = await realAgentTurn(agent, query, results, opts);
      return { text, refs: buildAgentReferences(results), mode: 'llm' };
    } catch (err) {
      return { text: mockAgentTurn(agent, query, results, opts), refs: buildAgentReferences(results), mode: 'mock', error: err.message };
    }
  }
  return { text: mockAgentTurn(agent, query, results, opts), refs: buildAgentReferences(results), mode: 'mock' };
}

function mockSynthesis(query, agentPosts) {
  const list = agentPosts.map((p) => `- **${p.author}**${p.stance ? ` (${p.stance})` : ''} (round ${p.round}): ${firstSentence(p.body)}`).join('\n');
  return `## Final Inference\n\nOn "${query}", the discussion so far:\n\n${list}\n\nEnable a real LLM (set \`USER_LLM_API_KEY\`) for a fluent synthesis that separates genuine agreement from genuine disagreement and gives a reasoned conclusion.`;
}

async function realSynthesis(query, agentPosts) {
  const context = agentPosts.map((p, i) => `### Turn ${i + 1} — ${p.author}${p.stance ? ` (${p.stance})` : ''} (round ${p.round})\n${p.body}`).join('\n\n');
  const prompt = `You are moderating a multi-round discussion between the agents below on the question given. Write a "Final Inference" with three short sections:\n\n1. **Consensus** — where the agents genuinely agree, or where a point was raised and never actually rebutted (the safe, reliable answer).\n2. **Divergence** — where they genuinely still differ after the full discussion, and why (different sources, criteria, or framing — not just wording).\n3. **Conclusion** — a short, reasoned takeaway a reader should walk away with, including the best analogy or example used in the discussion if one helps.\n\nDo not invent facts not present in the agents' own turns. Reference agents by name when noting agreement or disagreement.\n\n## Question\n${query}\n\n## Full discussion (in order)\n${context}\n\n## Final Inference`;

  const res = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
    body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function generateSynthesis(query, agentPosts) {
  if (isRealLLM()) {
    try {
      const text = await realSynthesis(query, agentPosts);
      return { text, mode: 'llm' };
    } catch (err) {
      return { text: mockSynthesis(query, agentPosts), mode: 'mock', error: err.message };
    }
  }
  return { text: mockSynthesis(query, agentPosts), mode: 'mock' };
}

// ---------------------------------------------------------------------------
// Compare across books (the /compare page): answer the same question against
// several skills at once — either a combined explanation or a book-by-book
// debate — with every claim cited to its source book.
// ---------------------------------------------------------------------------

function mockCompare(perBook, query, style) {
  const lines = [];
  for (const b of perBook) {
    if (!b.results.length) {
      lines.push(`**${b.skill.name}** — no strong match found in this book.`);
      continue;
    }
    const points = b.refs.map((r) => `- ${r.snippet}  \`[${r.refId}]\``).join('\n');
    lines.push(`**${b.skill.name}** (${b.results[0].chunk.chapterTitle}):\n${points}`);
  }
  let comparison = '';
  if (style === 'debate') {
    const distinct = [...new Set(perBook.filter((b) => b.results.length).map((b) => b.results[0].chunk.sectionTitle))];
    comparison = distinct.length > 1
      ? `\n\nThe books converge on the question from different angles — each leads with "${distinct.join('" vs "')}". Enable a real LLM (set \`USER_LLM_API_KEY\`) for a book-by-book rebuttal.`
      : `\n\nThe books agree closely — they lead with the same sections. Enable a real LLM (set \`USER_LLM_API_KEY\`) for a sharper comparison.`;
  }
  return `Here is what these books say about "${query}".\n\n${lines.join('\n\n')}${comparison}\n\n_Enable a real LLM (set \`USER_LLM_API_KEY\`) for a fluent ${style === 'debate' ? 'debate' : 'combined explanation'}._`;
}

async function realCompare(perBook, query, style) {
  const sources = perBook.flatMap((b) => b.refs.map((r) => `[${r.refId}] SOURCE: ${r.book} — ${r.chapter} / ${r.section}\n${b.results.find((x) => x.refId === r.refId)?.chunk.text || r.snippet}`));

  const system = style === 'debate'
    ? `You are comparing multiple books. Give a book-by-book debate: for each book, argue from ITS OWN cited passages only, then close with a short "Where they differ" comparison. Cite every claim with bracketed numbers like [1][2].`
    : `You are combining what multiple books say. Produce one coherent explanation that draws on all books, citing every claim with bracketed numbers like [1][2]. If a point is contested between books, say so.`;

  const prompt = `Question: ${query}\n\n## Sources\n${sources.join('\n\n---\n\n') || '(no sources provided)'}\n\nAnswer using ONLY these sources. Do not invent facts. If sources are insufficient, say so.`;

  const content = await chat([{ role: 'system', content: system }, { role: 'user', content: prompt }], { temperature: 0.3 });
  return content;
}

export async function generateCompare(skillDataList, query, mode = 'explain') {
  const style = mode === 'debate' ? 'debate' : 'explain';
  const perBook = [];
  let refId = 0;
  for (const { skill, results } of skillDataList) {
    const refs = results.map((r) => {
      refId += 1;
      return { refId, book: skill.name, chapter: r.chunk.chapterTitle, section: r.chunk.sectionTitle, chunkId: r.chunk.id, snippet: firstSentence(r.chunk.text), score: Math.round(r.score * 1000) / 1000 };
    });
    perBook.push({ skill, results, refs });
  }
  const refs = perBook.flatMap((b) => b.refs);

  if (isRealLLM() && perBook.some((b) => b.results.length)) {
    try {
      const text = await realCompare(perBook, query, style);
      return { text, refs, mode: 'llm' };
    } catch (err) {
      return { text: mockCompare(perBook, query, style), refs, mode: 'mock', error: err.message };
    }
  }
  return { text: mockCompare(perBook, query, style), refs, mode: 'mock' };
}
