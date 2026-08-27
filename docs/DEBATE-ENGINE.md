# Design Doc: AI Panel Debate + Final Inference

Status: Draft for review
Target: Implement in a future session
Related: Skill Forum (documents → skills → chat with references → forum → journal search)

## 1. Problem / Opportunity

Current chat gives one grounded answer. People want to *reason through* a question —
hear arguments for and against, backed by evidence, then get a synthesized conclusion.
Skill Forum already has the three ingredients: retrieval over personal skills,
live journal search, and a community forum. The debate engine combines them.

**NotebookLM / plain chat** answer a question. **Skill Forum** convenes a panel of
AI experts that argue *with citations*, then delivers a verdict with the evidence laid out.

## 2. User flow

1. User opens **Debate** page.
2. Picks a **skill** (their document corpus) — or no skill for a purely external search.
3. Enters a **topic / question** (e.g. "Is chunk size 400 optimal for RAG?").
4. Picks **2–3 personas** (Proponent, Skeptic, Analyst, Optimizer, Ethicist, ...).
5. Presses **Convene panel**.
6. System runs **R rounds** (default 2) of argument and rebuttal.
7. System produces a **Final inference**: consensus points, dissenting points,
   confidence, and a verdict paragraph.
8. Every claim in every argument is cited as `[n]`:
   - local citations → skill chapter/section chunk (clickable)
   - external citations → OpenAlex/arXiv paper (link + formatted citation)
9. Optionally **publish the debate** to the forum as a topic, where humans can reply.

## 3. Personas

Each persona has: name, stance, instruction, and retrieval bias.

| Persona | Stance | Retrieval bias | Voice |
| --- | --- | --- | --- |
| Proponent | Defends the proposition | top chunks, "supports" pattern | confident, constructive |
| Skeptic | Attacks it | chunks containing caveats/failure modes | sharp, questioning |
| Analyst | Evidence-weighted | numeric facts, cheatsheet | neutral, precise |
| Optimizer | Focuses on efficiency/trade-offs | "best practice" patterns | pragmatic |
| Ethicist | Focuses on risk/impact | failure-mode & policy chunks | cautious |

Persona retrieval bias is implemented as a *rerank of the shared retrieval pool*:
each persona reweights chunks by a small lexicon (e.g. Skeptic boosts chunks matching
"failure", "limitation", "cannot", "risk"). This keeps the evidence honest — all
personas see the same corpus, they just argue from different emphasis.

## 4. Debate protocol

For `rounds = R` (default 2):

- **Round 1 — Opening:** each persona states position + 2–3 cited points.
- **Round 2 — Rebuttal:** each persona addresses the strongest point of the previous
  persona, again cited. (Round 2+ are optional if retrieval returns few relevant chunks.)
- **Closing:** each persona gives a one-paragraph closing with confidence 0–1.

Debate state is an ordered list of `{ persona, round, text, refs[], confidence }`.

Termination rules: run all R rounds, but if a persona has no retrieved evidence at
opening, it says so explicitly (refusal path) instead of inventing points.

## 5. Final inference (synthesizer)

A dedicated *synthesizer* (not a persona) receives the full debate transcript and:
1. Clusters cited chunks by topic (shared-evidence overlap).
2. Identifies **consensus** (claims supported by ≥2 personas or shared citations).
3. Identifies **dissent** (contradictory claims, flagged by Skeptic vs Proponent).
4. Produces a verdict paragraph with confidence = agreement-weighted.
5. Outputs a compact evidence ledger: every distinct claim → its citations.

Output shape:

```json
{
  "topic": "...",
  "consensus": ["..."],
  "dissent": ["..."],
  "verdict": "...",
  "confidence": 0.0,
  "ledger": [{ "claim": "...", "refs": ["local:c12", "external:openalex:W123"] }]
}
```

## 6. Grounding & citations

- **Local refs:** reuse BM25 over the skill's chunks. Each chunk keeps
  `{ chunkId, chapter, section }` → rendered as clickable references in the UI.
- **External refs:** reuse `/api/search` (OpenAlex + arXiv). When a persona's point
  contains a term that matches top search results, attach the paper as an external
  citation with `doi`/url. This is done *deterministically in mock mode* and
  *prompt-instructed in LLM mode*.
- **Consistency rule:** personas never paraphrase beyond the retrieved pool; the
  synthesizer verifies each ledger claim maps to a real citation.

## 7. Mock mode vs LLM mode

**Mock mode (default, no API key):**
- Personas produce template-structured arguments from their biased chunk rerank:
  `"As {persona}, I argue that <top chunk sentence>. Evidence: {section} (score x)."`
- Synthesizer applies deterministic agreement logic over chunk overlap.
- Fully functional demo of the protocol, citations, and inference UI.

**LLM mode (OpenAI-compatible, e.g. Omniroute):**
- Personas get a system prompt: persona instruction + stance + "cite [n] using ONLY
  these sources" + the source passages. Temperature: 0.7 for debate, 0.2 for synthesis.
- Synthesizer gets the transcript and the shared evidence ledger.
- Falls back to mock per-persona on API failure so a debate never dies mid-way.

LLM config is already OpenAI-compatible via `USER_LLM_BASE_URL` / `USER_LLM_MODEL`
(no hardcoded provider). Model override per persona is optional.

## 8. API design

```
POST /api/debates
  body: { skillId?, topic, personas: ["proponent","skeptic","analyst"], rounds: 2 }
  202 -> { debateId }

GET  /api/debates/:id/stream   (SSE) -> debate events (per-argument, then inference)
GET  /api/debates             -> list
GET  /api/debates/:id         -> full transcript + inference
POST /api/debates/:id/publish -> creates a forum topic from the transcript
```

SSE streaming lets the UI show arguments appearing live (round by round), which is
the "show the thinking" differentiator.

## 9. Data model

```json
{
  "id": "uuid",
  "skillId": "uuid | null",
  "topic": "string",
  "personas": ["proponent", "skeptic", "analyst"],
  "rounds": 2,
  "status": "running | done",
  "transcript": [{ "persona": "...", "round": 1, "text": "...", "refs": ["..."], "confidence": 0.8 }],
  "inference": { "consensus": [], "dissent": [], "verdict": "", "confidence": 0.0, "ledger": [] },
  "mode": "mock | llm",
  "createdAt": "iso"
}
```

Stored in `server/data/debates.json` (same JSON-store pattern as the rest).

## 10. UI sketch

```
[Debate] page
  topic input  | skill select | persona chips [Proponent][Skeptic][Analyst] | [Convene panel]
  ---- transcript (live, chat-style bubbles, each with [n] ref chips) ----
  Persona A (round 1)  ▸ "..."  [1][2][5]
  Persona B (round 1)  ▸ "..."  [3][4]
  ...
  ---- Final inference panel ----
  Consensus: [...]  Dissent: [...]  Verdict: ...  Confidence: 0.72
  Evidence ledger (claim → refs, local/external)
  [Publish to forum]
```

The references chip component is shared with the existing ChatTab, so citation
behavior stays consistent.

## 11. Milestones

- **M1 (core):** `POST /api/debates`, mock personas + synthesizer, `GET /:id`,
  Debate page with transcript + inference UI, ref chips.
- **M2:** SSE streaming, round-by-round animation, confidence bars.
- **M3:** LLM personas (Omniroute/OpenAI-compatible), per-persona model override,
  graceful fallback.
- **M4:** external paper citations in arguments (journal search integration).
- **M5:** publish debate → forum topic; human replies trigger a "human vs panel" follow-up.

## 12. Open questions

- Default rounds (2 is cheap; 3 is richer — make it persona-count dependent?)
- Should personas be constrained to the skill corpus only, or also free to use
  external search for topics outside the skill? (M4 proposes: skill first, external
  second.)
- Persist debates across sessions by default? (Yes — they're citable artifacts.)
- Moderation: allow users to flag a persona's claim as unsupported (community QA on the inference ledger)?
