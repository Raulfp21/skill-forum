# Next Development Task — Page Number Citations

Use the current workspace as the source of truth.

The chapter-rendering bug is already fixed. Do NOT redesign the application.

Implement the next planned feature: PAGE-NUMBER TRACKING FOR CITATIONS.

Requirements:

1. Preserve the existing citation architecture.
2. For PDF files, preserve the original page boundaries during extraction.
3. Every retrieved passage/chunk must retain:
   - document/book
   - chapter
   - section
   - page number or page range
   - passage/chunk
4. Propagate page metadata through:
   - normal Chat
   - Compare
   - AI Forum agent responses
   - Final Inference references where applicable.
5. Display citations such as:
   [1] Chapter / Section · p. 245
   or:
   [1] Chapter / Section · pp. 245–246
6. NEVER invent a page number.
7. If reliable page information is unavailable for a source format, omit the page number.
8. Preserve existing chapter/section/passage citations.
9. Do NOT remove or change the AI Forum concept:
   - Tutor/Student or named agents
   - Explain / Debate / Socratic modes
   - 1–3 rounds
   - genuine responses to previous turns
   - anti-repetition
   - collapsible rounds
   - Final Inference with Consensus, Divergence and Conclusion.
10. Do NOT add authority/trust ranking.
11. Do NOT add a formal claim-vs-claim contradiction engine.
12. Do NOT replace BM25 with semantic search yet.

After implementation:
- Check the entire codebase for broken references.
- Check JavaScript syntax.
- Make sure Chat, Compare and Forum still work.
- Report files changed and what was changed.
