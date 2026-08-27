# Retrieval-Augmented Generation: A Field Guide

This guide explains how to build retrieval-augmented generation (RAG) systems that
ground language model answers in a knowledge base, cite their sources, and avoid
hallucination. It is written for engineers and researchers who want a practical
reference rather than a survey.

## Chapter 1. Why Grounded Answers Matter

Large language models produce fluent text but they do not remember facts reliably.
When a model answers from its weights alone it can invent citations, mix up dates,
and confidently state things that are false. This failure mode is called
hallucination.

Retrieval-augmented generation is a technique that couples a retriever with a
generator. The retriever fetches relevant passages from a corpus the operator
controls, and the generator produces an answer using only those passages as
context. Grounding answers in a trusted corpus reduces hallucination and makes
every claim verifiable.

The primary benefit of a RAG system is that the knowledge base can be updated
without retraining the model. When new documents arrive, the operator re-indexes
the corpus and the system immediately answers from the new material.

## Chapter 2. Indexing Documents

Indexing is the offline phase that prepares a corpus for retrieval. The operator
first extracts plain text from each source document, then splits that text into
chunks. A chunk is a contiguous block of text that is small enough to embed or
score but large enough to carry meaning.

Chunk size is a key design decision. Small chunks around 200 to 400 tokens improve
precision because each chunk addresses a narrow topic. Large chunks around 800 to
1200 tokens preserve more context and reduce the number of lookups. The optimal
size depends on the answer granularity you need.

Overlap is used to avoid cutting sentences in half. When chunks overlap by 10 to
20 percent, a sentence that spans a boundary still appears intact in at least one
chunk. Semantic chunkers split on paragraph or section boundaries instead of fixed
token counts, which produces more coherent chunks.

Embeddings are dense vector representations of text. An embedding model maps each
chunk to a vector such that similar meanings sit close together in vector space.
The operator stores the vectors in a vector database together with metadata such as
the source name, section title, and page number. That metadata later becomes the
citation.

## Chapter 3. Retrieval

At query time the retriever scores every chunk against the user question and
returns the highest scoring passages. Sparse retrieval uses keyword statistics.
BM25 is the most common sparse algorithm: it weights a term by how rare it is in
the corpus and normalizes by document length. BM25 is fast, explainable, and works
well for factual questions.

Dense retrieval embeds the query and finds the nearest vectors using approximate
nearest neighbor search. Dense retrieval captures synonyms and paraphrases that
keyword search misses. Hybrid retrieval combines BM25 and dense scores with a
weighted sum, which usually beats either alone.

Retrieval quality is measured by recall at K. Recall@K counts how many relevant
passages appear in the top K results. A retriever that misses the relevant passage
forces the generator to answer without evidence, so recall is more important than
top-one precision for RAG.

## Chapter 4. Generation with Citations

The generator receives the question and the retrieved passages, then writes an
answer. The system prompt instructs the model to answer only from the supplied
passages and to mark each claim with a bracketed reference number. If the passages
do not contain the answer, the model must say so instead of guessing.

Citation is the mechanism that turns retrieval into trust. Each sentence in the
answer maps to one or more source passages. The UI renders the references as
numbered markers that the user can click to see the original passage, its chapter,
and its page.

Multi-hop questions require more than one passage. The system retrieves passages
for the first hop, then uses them to find follow-up passages. Iterative retrieval
improves answers to questions such as "which paper introduced the loss used by
this model?" that span several documents.

## Chapter 5. Evaluation

Evaluate a RAG system on three dimensions: retrieval, generation, and grounding.
Retrieval evaluation measures whether the right passages are found. Generation
evaluation measures whether the answer is correct and fluent. Grounding evaluation
measures whether every claim in the answer is supported by a retrieved passage.

Answer faithfulness is the fraction of answer sentences that are entailed by the
source passages. A faithfulness score below 0.8 usually indicates the model is
ignoring context or the retriever is missing passages. Citation precision measures
whether the cited passage actually supports the claim next to it.

Use a golden set of question-answer pairs with labeled relevant passages. The test
set should include questions the model will face in production, including
adversarial questions that are plausible but unanswerable from the corpus.

## Chapter 6. Failure Modes

Retrieval failure happens when the right passage exists but is not retrieved.
Common causes are chunking that splits the answer, queries that use jargon not in
the document, and embedding models that do not understand the domain. Fix
retrieval before touching the generator.

Context overflow happens when the retrieved passages exceed the model context
window. Rank passages by score and truncate, or rerank with a cross-encoder that
scores query-passage pairs jointly. Reranking usually improves the final answer
more than adding more passages.

Stale knowledge is a silent failure: the corpus is correct at index time but wrong
after a source document changes. Re-index changed documents and record the index
timestamp so the system can warn when evidence is older than a threshold.

Hallucination persists when the model is asked to answer a question the corpus
cannot answer. A refusal path that detects low maximum retrieval score and replies
"not found in the knowledge base" is more useful than a confident wrong answer.

## Chapter 7. Practical Recipes

For a first deployment, use hybrid retrieval with BM25 and a small embedding model,
chunk at 400 tokens with 10 percent overlap, and add a cross-encoder reranker for
the top 50 candidates. This recipe is cheap and covers most document collections.

Store metadata in every vector record. Include the source title, section, page,
and a stable identifier so citations survive re-indexing. Always render the
reference list from the retrieved metadata, never from model-generated text.

Monitor retrieval hit rate in production by logging the top passage scores for
every query. A sudden drop in hit rate predicts bad answers before users complain.
Set an alert on maximum retrieval score so ungrounded responses are caught early.

Batch embeddings with a GPU when the corpus grows beyond a few million chunks.
Re-embedding the entire corpus on every document change is wasteful; use
incremental indexing for the changed files only.
