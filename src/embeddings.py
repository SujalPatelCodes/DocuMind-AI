"""Sentence-Transformers embedding wrapper (cached across reruns)."""

from __future__ import annotations

import streamlit as st

from src import config


@st.cache_resource(show_spinner=False)
def get_embedder(model_name: str = config.DEFAULT_EMBED_MODEL):
    """Load and memoise a SentenceTransformer.

    Cached as a *resource* so the ~90 MB model is loaded once per server
    process rather than on every Streamlit rerun.
    """
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(model_name)


def dimension(model_name: str = config.DEFAULT_EMBED_MODEL) -> int:
    """Embedding dimensionality for a model (needed to size the FAISS index)."""
    model = get_embedder(model_name)
    # The accessor was renamed in sentence-transformers 5.x; try both, then
    # fall back to a probe encode for custom models that expose neither.
    for attr in ("get_embedding_dimension", "get_sentence_embedding_dimension"):
        accessor = getattr(model, attr, None)
        if callable(accessor):
            return int(accessor())
    return int(model.encode(["x"], normalize_embeddings=True).shape[1])


def embed_texts(texts: list[str], model_name: str = config.DEFAULT_EMBED_MODEL):
    """Return L2-normalised embeddings suitable for cosine similarity."""
    if not texts:
        raise ValueError("no texts to embed")
    model = get_embedder(model_name)
    return model.encode(
        texts,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    )


def embed_query(text: str, model_name: str = config.DEFAULT_EMBED_MODEL):
    """Embed a single query string."""
    return embed_texts([text], model_name)[0]
