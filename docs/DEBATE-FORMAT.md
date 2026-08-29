# Design Doc: Making AI Debates Feel Like Real Conversations

Status: Draft for review — no implementation until approved.
Applies to: the forum AI-vs-AI-vs-AI debate (`POST /api/forum/debate`, `generateAgentTurn` / `generateSynthesis` in `server/lib/mockllm.js`, and the Forum thread rendering in `client/src/pages/Forum.jsx`).

## 1. What's wrong today

Running a debate now produces a series of **scheduled essays**:

- Each agent gets one **90–160 word monologue per round** (`realAgentTurn`).
- Turns are strictly round-robin (A → B → C, repeat) — every agent speaks every round, in order.
- Each turn is generated against the **whole transcript** with "never restate" instructions, which pushes agents into long, self-contained paragraphs that hedge to avoid repeating anyone.
- **Mock mode** (no API key) dumps raw retrieved passages, which reads nothing like a discussion.
- The UI groups turns into flat "round N" blocks — visually a list of essays, not a thread.

Result: the output looks **pre-written**, not like people actually talking. There is no sense of reacting to the *last* thing said, no short back-and-forth, no questions answered, no concessions.

## 2. Design goal

Make a debate read like a **small, live conversation**: short messages, each one clearly *responding to the previous beat*, with natural argument/explanation dynamics (point → pushback → clarify → concede → example), until a synthesizer summarizes what was actually said.

## 3. Core concept: conversational beats

Replace "one essay per agent per round" with **beats** — short turns (1–3 sentences, ~30–70 words) that:

1. **React to the immediately preceding beat**, not the whole transcript.
2. Carry an explicit **turn type** (a "speech act") chosen by the conversation driver.
3. Cite **at most one or two passages** per beat (not a pile of sources).

A debate becomes a sequence of beats:

```
Q:  "Is hybrid retrieval always better than BM25?"
A1 point        "Yes — dense captures synonyms BM25 misses. [1]"
B1 pushback     "But BM25 is explainable and fast for factual questions. [2]"
A2 clarify      "What do you mean by 'always better'? Better for recall or latency?"
B2 concede      "Fair — hybrid usually beats either alone. [3]"
C1 example      "Think of an FAQ: BM25 nails exact terms; synonyms are rare there."
Moderator       "B, does that change your position?"
B3 refine       "It narrows it: hybrid wins for open questions, BM25 for lookup."
```
That is a *conversation*: reactions, a question, a concession, an example, a moderator nudge, a refined stance.

## 4. Turn types (speech acts)

Each beat has one `type`, chosen to fit the debate style and the state of the conversation:

| Type | Meaning | When chosen |
| --- | --- | --- |
| `point` | Make a claim with evidence | opening, or when a position needs stating |
| `pushback` | Challenge the immediately prior claim | after a claim the agent disagrees with |
| `clarify` | Ask a question / restate to confirm | when prior claim is ambiguous or overbroad |
| `concede` | Acknowledge a valid point, then refine | after pushback that landed |
| `example` | Ground a claim in a concrete case | when a point is abstract |
| `answer` | Directly answer a question asked | after a `clarify` beat |
| `close` | 1–2 sentence takeaway | final beat per agent |

Style mapping:

- **Debate**: heavy `pushback` / `concede` / `point`; a moderator forces `answer`.
- **Explain**: collaborative `point` / `example` / `clarify` / `answer`; agents build on each other.
- **Socratic**: mostly `clarify` (questions) and `answer`; one agent is assigned the questioner.

## 5. Conversation driver (the "who speaks next" logic)

A small deterministic driver decides the next beat — no extra LLM cost:

1. Collect each agent's **stance** on the question (from its opening beat).
2. Alternate speakers and **reply-to** so beats interleave: the target speaks, then someone who disagrees most gets a `pushback`/`concede` beat, then a third agent can `example`/`clarify`.
3. Track **agreement polarity** (does the beat support or oppose the last claim?) so pushbacks alternate with defenses.
4. Keep a running **cited-claims ledger** (chunkId → already used), so each beat is told the one or two *fresh* passages it may cite — this prevents the "repeat or reword everything" problem without dumping the full transcript.
5. Optional **moderator**: after N beats, a neutral beat poses a sharp question to an agent (see §8). Configurable, default **off** for v1 to keep it simple, exposed as a toggle later.

Deterministic driver = same result every run in mock mode, and a stable, cheap structure in LLM mode.

## 6. Prompting strategy (LLM mode)

Each beat gets a **small, immediate context** instead of the whole thread:

- The **last beat** (author + type + text) — the thing to react to.
- The **beat type** being requested + the agent's stance.
- Up to **2 fresh source passages** (from the agent's linked skill) allowed for this beat.
- A **1-line style rule** (debate/explain/socratic).
- A hard **length cap** (~60 words; 30 for `clarify`).

Rationale: a small context window forces tight, reactive turns. A short beat that genuinely engages the previous one reads far more naturally than a 160-word essay that "never restates."

The cited-claims ledger travels through the run (in memory) so an agent never cites the same passage twice and the synthesizer can see the full evidence map.

## 7. Mock mode (no API key) — must also feel conversational

Today mock mode dumps raw passages. New mock design: a **deterministic beat generator** that produces short conversational turns:

- `point`: `"I'd argue <sentence from top passage> [1]"` + stance line.
- `pushback`: `"I'd push back there — <sentence from a counter-passage> [2]"`.
- `clarify`: a question template derived from the topic's key terms.
- `concede`: `"You're right that <paraphrase of last claim>; I'd only add <passage> [3]"`.
- `example`: `"Concretely, <passage sentence> [4]"`.
- `close`: `"Net: <top passage sentence> [1]"`.

Each references **one passage** with `[n]` and is 1–2 sentences. It won't be fluent prose, but it will read like a conversation — short, reactive, cited — which is the point of mock mode. A one-line note can flag "mock mode" as today.

## 8. UI: render a conversation, not a round list

Change the debate view from "round N blocks" to a **threaded conversation**:

- Each beat is a **small bubble** with the agent name + turn-type badge (`pushback`, `concede`, ...).
- A **reply indicator** shows what it responds to ("↳ in reply to B's pushback").
- Beats arrive **live via SSE** (see §9) — you watch the conversation unfold rather than getting a wall of text at the end.
- The **Final Inference** stays as the closing panel, now summarizing the conversation.
- Remove the emoji prefix from author names; use color-coded avatars instead (avoids the "cute robot" feel the user called artificial).

## 9. Streaming (SSE)

Run the beat loop server-side and stream each beat as it's generated (`POST /api/forum/debate` returns `{ topicId }` immediately; `GET /api/forum/topics/:id/stream` emits `beat` and `synthesis` events). This is the single biggest lever for "feels live / not artificial."

Backward compatible: the stored topic keeps `posts[]`; clients that don't stream can still fetch the final topic.

## 10. Final Inference — now summarizing a conversation

`generateSynthesis` still runs at the end, but its input is short beats, so it can:

- Name **who agreed with whom** ("A and C both..., while B disagreed").
- Quote the **concession** or **refinement** moments that actually moved the discussion.
- Distinguish **unanswered questions** (clarify beats with no answer) from resolved ones.

Same three-section output (Consensus / Divergence / Conclusion) — just grounded in beats instead of essays.

## 11. Config surface

The debate form gains (all optional, sensible defaults):

- `beatsPerExchange` (default ~4) — how long a back-and-forth runs before the next opening/closing.
- `moderator` (default off) — neutral question-asker between exchanges.
- Turn length is implicit (the ~60-word cap) — not exposed in the UI.

Backward compatible: `rounds` is reinterpreted as "exchanges" internally; existing saved debates still render.

## 12. API / data changes

```
POST /api/forum/debate
  body: { title, question, agents[], style, rounds, moderator?, beatsPerExchange? }
  -> 202 { topicId }                     (was: 201 full topic; kept as 202 + fetch)

GET  /api/forum/topics/:id/stream        (SSE: beat | synthesis | done)

post fields (agent posts) gain:
  beatType: 'point'|'pushback'|'clarify'|'concede'|'example'|'answer'|'close'
  replyTo:  author name of the beat being answered (or null)
  round:    now means "exchange index"
```

`generateAgentTurn` → `generateBeat(agent, question, lastBeat, beatType, allowedPassages, ledger, style)`.
`generateSynthesis` unchanged in shape.

## 13. Effort estimate

| Part | Effort |
| --- | --- |
| Beat driver + `generateBeat` (LLM) | M |
| Mock beat generator | S |
| `/forum/debate` refactor + SSE stream | M |
| Threaded UI + streaming render | M |
| Synthesis tweak | S |

Total: ~1 focused session. Mock mode alone (no LLM) still delivers the conversational feel, so it's demoable without a key.

## 14. Decision points for you

1. **Beat granularity** — strict short beats (~30–70 words) everywhere, or mixed (short beats, but allow one longer opening per agent)? Recommended: strict beats + a 2–3 sentence opening.
2. **Moderator** — include a neutral moderator who interjects questions, or pure agent-to-agent? Recommended: optional, default off.
3. **UI thread** — switch the debate view to a threaded bubble layout with turn-type badges + live SSE? Recommended: yes.
4. **Mock mode** — spend the effort to make mock reads like a real conversation, or keep mock minimal and focus on LLM mode? Recommended: yes, mock beats too.
5. **Streaming** — always stream live, or generate then render (simpler, still threaded)? Recommended: stream.

Pick 1–5 (or modify), and I'll implement the agreed design.
