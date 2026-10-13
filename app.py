"""DocuMind AI — Streamlit front end.

Run with:
    streamlit run app.py
"""

from __future__ import annotations

import streamlit as st

from src import config, llm, state, theme
from src.ui import chat_view, quiz_view, rail, sidebar, summary_view

# --------------------------------------------------------------------------
# Page setup — must be the first Streamlit call
# --------------------------------------------------------------------------
st.set_page_config(
    page_title=config.APP_NAME,
    page_icon=config.APP_ICON,
    layout="wide",
    initial_sidebar_state="collapsed",
)

theme.inject_css()
state.init()


# --------------------------------------------------------------------------
# Header
# --------------------------------------------------------------------------
def _header() -> None:
    theme.hero(
        eyebrow="Retrieval-Augmented Generation · runs locally",
        title="Ask your documents anything",
        subtitle=config.APP_DESCRIPTION,
        highlight="anything",
    )

    llm_status = llm.status()
    if not llm_status.online:
        runtime = "Offline"
    elif not llm_status.models:
        runtime = "No models"
    else:
        runtime = "Ready"

    theme.stat_cards(
        [
            (len(state.documents()), "Documents"),
            (state.total_pages(), "Pages indexed"),
            (state.total_chunks(), "Chunks embedded"),
            (runtime, "Ollama runtime"),
        ]
    )


def _how_it_works() -> None:
    with st.expander("🔬 How it works — the RAG pipeline", expanded=False):
        theme.card(
            "From PDF to grounded answer",
            """
            <ol style="margin:.2rem 0 .4rem 1.1rem">
              <li><b>Extract</b> — PyMuPDF pulls the text out of every page,
                  keeping the page number attached to each passage.</li>
              <li><b>Chunk</b> — text is split into overlapping windows so
                  sentences that straddle a boundary stay retrievable.</li>
              <li><b>Embed</b> — Sentence-Transformers maps every chunk to a
                  vector that encodes its meaning.</li>
              <li><b>Index</b> — FAISS stores those vectors for fast
                  cosine-similarity search.</li>
              <li><b>Retrieve</b> — your question is embedded the same way and
                  the closest chunks are pulled back.</li>
              <li><b>Generate</b> — only those chunks are handed to the local
                  Ollama model, which answers and cites the pages it used.</li>
            </ol>
            <p style="font-size:.82rem;color:#98a2b8;margin:0">
              Nothing leaves your machine: the model, the embeddings and the
              vector index all run locally.
            </p>
            """,
        )


# --------------------------------------------------------------------------
# Sidebar navigation (the collapsed-state rail)
# --------------------------------------------------------------------------
def _handle_nav(nav: str | None) -> None:
    """Apply whatever the rail asked for on this rerun (see src/ui/rail.py)."""
    if nav is None:
        return
    st.session_state["active_nav"] = nav
    if nav in rail.VIEW_LABELS:
        st.session_state["active_tab"] = rail.VIEW_LABELS[nav]
    elif nav == "help":
        st.toast("💡 Help — see the “How it works” section below.")
    elif nav == "profile":
        st.toast("👤 User profile — coming soon in this local app.")
    elif nav == "logout":
        state.clear_chat()
        st.toast("👋 Signed out — local app, no account needed. Conversation cleared.")


# --------------------------------------------------------------------------
# Layout
# --------------------------------------------------------------------------
def main() -> None:
    _handle_nav(rail.consume_nav())

    rail.render(active=st.session_state.get("active_nav", "conversations"),
                upload_count=len(state.documents()))
    sidebar.render()
    state.flush_notices()
    _header()
    _how_it_works()

    chat_tab, summary_tab, quiz_tab = st.tabs(
        ["💬 Chat", "📝 Summarise", "🧠 Quiz me"],
        key="active_tab",
        on_change="rerun",
    )
    with chat_tab:
        chat_view.render()
    with summary_tab:
        summary_view.render()
    with quiz_tab:
        quiz_view.render()

    # If the user switched tabs by hand, move the rail highlight to match.
    synced = rail.nav_for_tab(st.session_state.get("active_tab"))
    if synced is not None and st.session_state.get("active_nav") in rail.VIEW_KEYS:
        st.session_state["active_nav"] = synced


if __name__ == "__main__":
    main()
