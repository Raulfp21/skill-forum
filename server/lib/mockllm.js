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

// ---------------------------------------------------------------------------
// Conversational beats: a debate is now a sequence of SHORT reactive turns
// (point / pushback / clarify / concede / example / answer / close /
// moderator) instead of one long monologue per agent per round. Each beat
// reacts to the immediately preceding beat and cites at most 1-2 fresh
// passages. Mock mode produces short templated beats too, so it also reads
// like a conversation.
// ---------------------------------------------------------------------------

const BEAT_STYLE_LINE = {
  explain: 'This is a collaborative explanatory discussion — build on each other and reach for concrete examples.',
  debate: 'This is a sharp debate — challenge weak claims by name and defend your own.',
  socratic: 'This is a Socratic dialogue — expose gaps with pointed questions, or directly answer a question just asked.',
};

const BEAT_TYPE_INSTRUCTIONS = {
  point: 'Make a short claim about the question, grounded in your sources.',
  pushback: 'Directly push back on the most recent message — say why it is wrong or incomplete, then give your own view.',
  clarify: 'Ask ONE pointed clarifying question about the most recent message, or restate it to confirm your understanding.',
  concede: 'Concede the valid part of the most recent point, then add one refinement or edge case.',
  example: 'Ground the discussion with one concrete example or analogy from your sources.',
  answer: 'Directly answer the question that was just asked of you, citing a passage.',
  close: 'In one or two sentences, give your final takeaway for this discussion.',
  moderator: 'As a neutral moderator, ask ONE sharp question to one specific agent to push the discussion forward.',
};

const BEAT_MENUS = {
  explain: ['point', 'example', 'clarify', 'point', 'concede'],
  debate: ['point', 'pushback', 'concede', 'example', 'pushback'],
  socratic: ['clarify', 'answer', 'point', 'clarify', 'answer'],
};

function lowerFirst(text) {
  return text ? text.charAt(0).toLowerCase() + text.slice(1) : '';
}

function mockBeat(agent, question, lastBeat, beatType, results, { style = 'explain', target } = {}) {
  const passage = (i) => (results[i] ? firstSentence(results[i].chunk.text) : null);
  const cite = (i) => (results[i] ? ` \`[${i + 1}]\`` : '');
  const last = lastBeat ? lastBeat.body : null;

  switch (beatType) {
    case 'point':
      return passage(0)
        ? `I'd argue that ${lowerFirst(passage(0))}${cite(0)}`
        : `I'd argue for ${agent.stance || 'my position'} here, though I can't cite a source for it.`;
    case 'pushback':
      return passage(0)
        ? `I'd push back on that — ${lowerFirst(passage(0))}${cite(0)}`
        : `I'd push back there: that framing is too broad for this question.`;
    case 'clarify':
      return `Could you clarify what you mean? Are you claiming that applies always, or only in the typical case?`;
    case 'concede':
      return last
        ? `You're right that ${lowerFirst(firstSentence(last))}, and I'd only add: ${passage(0) ? lowerFirst(passage(0)) : 'consider the edge cases.'}${cite(0)}`
        : `Fair point${passage(0) ? ` — ${lowerFirst(passage(0))}${cite(0)}` : '.'}`;
    case 'example':
      return passage(0)
        ? `Concretely, ${lowerFirst(passage(0))}${cite(0)}`
        : `Think of the everyday case: that is exactly where the difference shows up.`;
    case 'answer':
      return passage(0)
        ? `In short: ${lowerFirst(passage(0))}${cite(0)}`
        : `In short, the answer depends on what you mean by the question — could you pin down the scope?`;
    case 'close':
      return passage(0)
        ? `Net: ${lowerFirst(passage(0))}${cite(0)}`
        : `Net: my position stands — ${agent.stance || "the evidence I've seen favors it."}`;
    case 'moderator':
      return target
        ? `@${target} — could you ground that claim in your source and tell us where you genuinely agree or disagree with the others?`
        : 'Could one of you ground that claim in a source passage so we can compare positions directly?';
    default:
      return passage(0) ? `${lowerFirst(passage(0))}${cite(0)}` : 'My position stands.';
  }
}

async function realBeat(agent, question, lastBeat, beatType, results, { style = 'explain', target } = {}) {
  const persona = agent.stance
    ? `You are "${agent.name}", who takes this stance: ${agent.stance}.`
    : `You are "${agent.name}".`;
  const roleLine = beatType === 'moderator'
    ? 'You are the neutral moderator of the discussion.'
    : `You are in a live conversation between AI agents about: "${question}".`;

  const reactLine = beatType === 'moderator'
    ? (target ? `Ask your question to ${target}.` : 'Ask a neutral, sharp question.')
    : (lastBeat
      ? `The most recent message was by ${lastBeat.author}${lastBeat.beatType ? ` (a "${lastBeat.beatType}")` : ''}: "${lastBeat.body}"`
      : 'You are opening the conversation.');

  const styleLine = BEAT_STYLE_LINE[style] || BEAT_STYLE_LINE.explain;
  const typeLine = BEAT_TYPE_INSTRUCTIONS[beatType] || BEAT_TYPE_INSTRUCTIONS.point;

  const grounding = results.length
    ? `You may cite up to these NEW source passages, using bracketed numbers like [1][2] matching them exactly:\n\n## Sources\n${results.map((r, i) => `[${i + 1}] ${r.chunk.chapterTitle} / ${r.chunk.sectionTitle}\n${r.chunk.text}`).join('\n\n---\n\n')}`
    : (agent.skillId
      ? 'No unused source passages remain from your linked source — briefly say your source is exhausted and reason one short step further.'
      : 'No source is linked for you — reason from general knowledge and do not invent citations.');

  const prompt = `${persona}\n\n${roleLine}\n\n${reactLine}\n\n${styleLine}\n\nYour move is a "${beatType}" beat. ${typeLine}\n\n${grounding}\n\nRules: 1-3 sentences, at most 60 words. Talk directly to the previous speaker. No headings, no self-introduction, no boilerplate. Keep it conversational.\n\n## Your beat`;

  const res = await fetch(`${LLM_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${LLM_KEY}` },
    body: JSON.stringify({ model: LLM_MODEL, messages: [{ role: 'user', content: prompt }], temperature: 0.6 }),
  });
  if (!res.ok) throw new Error(`LLM request failed (${res.status})`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function generateBeat(agent, question, lastBeat, beatType, results, opts = {}) {
  if (isRealLLM() && (results.length || !agent.skillId)) {
    try {
      const text = await realBeat(agent, question, lastBeat, beatType, results, opts);
      return { text, refs: buildAgentReferences(results), mode: 'llm' };
    } catch (err) {
      return { text: mockBeat(agent, question, lastBeat, beatType, results, opts), refs: buildAgentReferences(results), mode: 'mock', error: err.message };
    }
  }
  return { text: mockBeat(agent, question, lastBeat, beatType, results, opts), refs: buildAgentReferences(results), mode: 'mock' };
}

export { BEAT_MENUS };

function mockSynthesis(query, agentPosts) {
  const list = agentPosts.map((p) => `- **${p.author}**${p.stance ? ` (${p.stance})` : ''}${p.beatType ? ` (${p.beatType})` : ''}: ${firstSentence(p.body)}`).join('\n');
  return `## Final Inference\n\nOn "${query}", the discussion so far:\n\n${list}\n\nEnable a real LLM (set \`USER_LLM_API_KEY\`) for a fluent synthesis that separates genuine agreement from genuine disagreement and gives a reasoned conclusion.`;
}

async function realSynthesis(query, agentPosts) {
  const context = agentPosts.map((p, i) => `### Turn ${i + 1} — ${p.author}${p.stance ? ` (${p.stance})` : ''}${p.beatType ? ` [${p.beatType}]` : ''}${p.replyTo ? ` (replying to ${p.replyTo})` : ''}\n${p.body}`).join('\n\n');
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
