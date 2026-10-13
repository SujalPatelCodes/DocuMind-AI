"""Retrieval-Augmented Generation pipeline.

``ingest_document``  -> chunk, embed and index a PDF
``retrieve``         -> semantic search over the index
``answer_stream``    -> grounded answer token stream + citations
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterator

from src import config, embeddings, llm
from src.pdf_utils import Chunk, Document, build_chunks
from src.vector_store import VectorStore


# --------------------------------------------------------------------------
# Prompting
# --------------------------------------------------------------------------
CHAT_SYSTEM_PROMPT = """You are DocuMind, a meticulous research assistant.

Rules:
1. Answer ONLY from the provided context passages.
2. Cite the pages you used inline, like (p. 4) or (pp. 4-5).
3. If the context does not contain the answer, say so plainly and suggest
   what the document would need to contain. Never invent facts.
4. Prefer clear prose or short bullet lists. Be direct and skip filler.
"""

NO_CONTEXT_REPLY = (
    "I couldn't find anything relevant to that in the uploaded documents. "
    "Try rephrasing the question, or upload the PDF that covers this topic."
)


@dataclass
class Source:
    """A retrieved passage, ready for display under an answer."""

    doc_name: str
    page: int
    text: str
    score: float


# --------------------------------------------------------------------------
# Ingestion
# --------------------------------------------------------------------------
def ingest_document(
    doc: Document,
    store: VectorStore,
    chunk_size: int = config.CHUNK_SIZE,
    chunk_overlap: int = config.CHUNK_OVERLAP,
    embed_model: str = config.DEFAULT_EMBED_MODEL,
) -> Document:
    """Chunk, embed and index ``doc``; returns the document with chunks set."""
    chunks = build_chunks(doc, chunk_size, chunk_overlap)
    if not chunks:
        raise ValueError(f"No indexable text found in '{doc.name}'.")

    vectors = embeddings.embed_texts([c.text for c in chunks], embed_model)
    store.add(vectors, chunks)
    doc.chunks = chunks
    return doc


# --------------------------------------------------------------------------
# Retrieval
# --------------------------------------------------------------------------
def retrieve(
    question: str,
    store: VectorStore,
    top_k: int = config.TOP_K,
    min_score: float = config.MIN_SCORE,
    embed_model: str = config.DEFAULT_EMBED_MODEL,
) -> list[Source]:
    """Semantic search returning de-duplicated sources, best first."""
    if not len(store) or not question.strip():
        return []

    vector = embeddings.embed_query(question, embed_model)
    hits = store.search(vector, k=top_k * 3)

    sources: list[Source] = []
    per_page: dict[tuple[str, int], int] = {}
    for chunk, score in hits:
        if score < min_score:
            continue
        # Cap at two passages per page so results span the whole document.
        key = (chunk.doc_id, chunk.page)
        if per_page.get(key, 0) >= 2:
            continue
        per_page[key] = per_page.get(key, 0) + 1
        sources.append(
            Source(doc_name=chunk.doc_name, page=chunk.page, text=chunk.text, score=score)
        )
        if len(sources) >= top_k:
            break
    return sources


def format_context(sources: list[Source]) -> str:
    """Render sources as a numbered context block for the prompt."""
    blocks = []
    for i, src in enumerate(sources, start=1):
        blocks.append(f"[{i}] {src.doc_name} — page {src.page}\n{src.text}")
    return "\n\n".join(blocks)


# --------------------------------------------------------------------------
# Answering
# --------------------------------------------------------------------------
def answer_stream(
    question: str,
    history: list[dict],
    store: VectorStore,
    model: str,
    top_k: int = config.TOP_K,
    embed_model: str = config.DEFAULT_EMBED_MODEL,
    temperature: float = config.LLM_TEMPERATURE,
) -> tuple[Iterator[str], list[Source]]:
    """Build the grounded prompt and return ``(token_stream, sources)``.

    ``history`` is the prior chat as ``{"role", "content"}`` dicts; only the
    last few turns are forwarded to keep the context window small.
    """
    sources = retrieve(question, store, top_k=top_k, embed_model=embed_model)

    if not sources:
        def _nothing() -> Iterator[str]:
            yield NO_CONTEXT_REPLY

        return _nothing(), []

    context = format_context(sources)
    messages: list[dict] = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]
    messages.extend(history[-6:])
    messages.append(
        {
            "role": "user",
            "content": (
                f"Context passages:\n\n{context}\n\n"
                f"---\nQuestion: {question}\n\n"
                "Answer using only the passages above and cite page numbers."
            ),
        }
    )

    return llm.stream_chat(messages, model=model, temperature=temperature), sources
