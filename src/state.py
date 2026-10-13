"""Session state: a single place that owns everything the UI reads and writes.

Streamlit reruns the whole script on every interaction, so all mutable app
state is kept in ``st.session_state`` and accessed through the helpers below.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import streamlit as st

from src import config
from src.pdf_utils import Document
from src.vector_store import VectorStore

# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------
@dataclass
class Settings:
    """User-tunable knobs, edited from the sidebar."""

    llm_model: str = config.DEFAULT_LLM_MODEL
    embed_model: str = config.DEFAULT_EMBED_MODEL
    temperature: float = config.LLM_TEMPERATURE
    top_k: int = config.TOP_K
    chunk_size: int = config.CHUNK_SIZE
    chunk_overlap: int = config.CHUNK_OVERLAP


_DEFAULTS: dict[str, object] = {
    "active_nav": "conversations",  # rail item highlighted in the collapsed state
    "documents": {},      # doc_id -> Document
    "messages": [],       # [{"role", "content", "sources": [Source]}]
    "summaries": {},      # (doc_id, mode) -> str
    "quiz": None,         # Quiz
    "quiz_answers": {},   # question index -> chosen option index
    "quiz_submitted": False,
    "settings": Settings(),
    "store": None,        # VectorStore
    "store_embed_model": None,  # model the current store was built with
    "notices": [],        # transient (level, text) messages
}


def init() -> None:
    """Create the defaults on first run (idempotent)."""
    for key, value in _DEFAULTS.items():
        if key not in st.session_state:
            st.session_state[key] = value


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------
def settings() -> Settings:
    if not isinstance(st.session_state.get("settings"), Settings):
        st.session_state["settings"] = Settings()
    return st.session_state["settings"]


# --------------------------------------------------------------------------
# Documents
# --------------------------------------------------------------------------
def documents() -> dict[str, Document]:
    return st.session_state["documents"]


def document(doc_id: str) -> Document | None:
    return documents().get(doc_id)


def document_names() -> list[str]:
    return [d.name for d in documents().values()]


def doc_id_for_name(name: str) -> str | None:
    for doc_id, doc in documents().items():
        if doc.name == name:
            return doc_id
    return None


def add_document(doc: Document) -> None:
    documents()[doc.id] = doc


def remove_document(doc_id: str) -> None:
    """Remove a document and purge it from the index, caches and chat."""
    removed = documents().pop(doc_id, None)
    name = removed.name if removed else None
    get_store().remove_document(doc_id)

    st.session_state["summaries"] = {
        key: value
        for key, value in st.session_state["summaries"].items()
        if key[0] != doc_id
    }
    quiz = st.session_state.get("quiz")
    if quiz is not None and name is not None and quiz.doc_name == name:
        st.session_state["quiz"] = None
        st.session_state["quiz_answers"] = {}
        st.session_state["quiz_submitted"] = False


def total_pages() -> int:
    return sum(d.n_pages for d in documents().values())


def total_chunks() -> int:
    return sum(d.n_chunks for d in documents().values())


# --------------------------------------------------------------------------
# Vector store
# --------------------------------------------------------------------------
def get_store() -> VectorStore:
    """Return the session vector store, rebuilding it if the embed model changed."""
    current = st.session_state.get("store")
    model = settings().embed_model
    if current is None or st.session_state.get("store_embed_model") != model:
        from src import embeddings

        current = VectorStore(embeddings.dimension(model))
        st.session_state["store"] = current
        st.session_state["store_embed_model"] = model
    return current


def reset_store() -> None:
    """Wipe the index. Documents keep their metadata but lose their chunks."""
    st.session_state["store"] = None
    st.session_state["store_embed_model"] = None
    for doc in documents().values():
        doc.chunks = []


# --------------------------------------------------------------------------
# Chat
# --------------------------------------------------------------------------
def messages() -> list[dict]:
    return st.session_state["messages"]


def add_message(role: str, content: str, sources: list | None = None) -> None:
    messages().append({"role": role, "content": content, "sources": sources or []})


def clear_chat() -> None:
    st.session_state["messages"] = []


# --------------------------------------------------------------------------
# Summaries
# --------------------------------------------------------------------------
def summaries() -> dict:
    return st.session_state["summaries"]


def cached_summary(doc_id: str, mode: str) -> str | None:
    return summaries().get((doc_id, mode))


def set_summary(doc_id: str, mode: str, text: str) -> None:
    summaries()[(doc_id, mode)] = text


def clear_summaries() -> None:
    st.session_state["summaries"] = {}


# --------------------------------------------------------------------------
# Notices
# --------------------------------------------------------------------------
def notify(level: str, text: str) -> None:
    st.session_state["notices"].append((level, text))


def flush_notices() -> None:
    """Show and clear any queued messages (call once per rerun, near the top)."""
    for level, text in st.session_state.get("notices", []):
        renderer = {
            "success": st.success,
            "warning": st.warning,
            "error": st.error,
            "info": st.info,
        }.get(level, st.info)
        renderer(text)
    st.session_state["notices"] = []
