"""FAISS-backed vector store with page-level metadata."""

from __future__ import annotations

import faiss
import numpy as np

from src.pdf_utils import Chunk


class VectorStore:
    """An in-memory, cosine-similarity index over document chunks.

    Vectors are expected to be L2-normalised (see ``src.embeddings``) so an
    inner-product index gives exactly cosine similarity. Raw vectors are kept
    alongside the index so individual documents can be removed and the index
    rebuilt without re-embedding anything.
    """

    def __init__(self, dim: int) -> None:
        self.dim = dim
        self.index = faiss.IndexFlatIP(dim)
        self.chunks: list[Chunk] = []
        self._vectors: list[np.ndarray] = []

    # -- mutation ----------------------------------------------------------
    def add(self, vectors: np.ndarray, chunks: list[Chunk]) -> None:
        if len(vectors) != len(chunks):
            raise ValueError("vectors and chunks must be the same length")
        if not len(chunks):
            return
        matrix = np.asarray(vectors, dtype="float32")
        self.index.add(matrix)
        self.chunks.extend(chunks)
        self._vectors.extend(matrix)

    def remove_document(self, doc_id: str) -> None:
        """Drop every chunk belonging to ``doc_id`` and rebuild the index."""
        keep = [
            (chunk, vector)
            for chunk, vector in zip(self.chunks, self._vectors)
            if chunk.doc_id != doc_id
        ]
        if len(keep) == len(self.chunks):
            return
        self._rebuild([c for c, _ in keep], [v for _, v in keep])

    def clear(self) -> None:
        self._rebuild([], [])

    def _rebuild(self, chunks: list[Chunk], vectors: list[np.ndarray]) -> None:
        self.index = faiss.IndexFlatIP(self.dim)
        self.chunks = []
        self._vectors = []
        if chunks:
            self.add(np.vstack(vectors), chunks)

    # -- query -------------------------------------------------------------
    def search(self, query_vector, k: int = 4) -> list[tuple[Chunk, float]]:
        """Return the ``k`` best chunks as ``(chunk, similarity)`` pairs."""
        if not self.chunks:
            return []
        k = max(1, min(k, len(self.chunks)))
        vector = np.asarray([query_vector], dtype="float32")
        scores, indices = self.index.search(vector, k)
        hits: list[tuple[Chunk, float]] = []
        for score, idx in zip(scores[0], indices[0]):
            if idx < 0:
                continue
            hits.append((self.chunks[idx], float(score)))
        return hits

    # -- introspection -----------------------------------------------------
    def __len__(self) -> int:
        return len(self.chunks)

    @property
    def document_ids(self) -> set[str]:
        return {c.doc_id for c in self.chunks}
