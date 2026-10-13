"""Chat tab: grounded question answering with visible sources."""

from __future__ import annotations

import streamlit as st

from src import rag, state, theme
from src.rag import Source


# --------------------------------------------------------------------------
# Rendering helpers
# --------------------------------------------------------------------------
def _sources_panel(sources: list[Source]) -> None:
    if not sources:
        return
    label = f"📚 {len(sources)} source {'page' if len(sources) == 1 else 'pages'}"
    with st.expander(label, expanded=False):
        for src in sources:
            snippet = src.text if len(src.text) <= 620 else src.text[:620] + "…"
            theme.html_block(
                f"""
                <div class="dm-src">
                  <div class="dm-src__head">
                    <span class="dm-src__page">Page {src.page}</span>
                    <span class="dm-score">{src.score:.2f}</span>
                  </div>
                  <div class="dm-src__doc">📄 {theme.esc(src.doc_name)}</div>
                  <p class="dm-src__text">{theme.esc(snippet)}</p>
                </div>
                """
            )


def _render_message(message: dict) -> None:
    avatar = "🧑‍💻" if message["role"] == "user" else "🧠"
    with st.chat_message(message["role"], avatar=avatar):
        st.markdown(message["content"])
        _sources_panel(message.get("sources") or [])


def _answer(question: str) -> None:
    """Run retrieval + generation for a new question and persist the result."""
    settings = state.settings()
    store = state.get_store()

    history = [
        {"role": m["role"], "content": m["content"]}
        for m in state.messages()
        if m["role"] in ("user", "assistant")
    ]

    with st.chat_message("assistant", avatar="🧠"):
        try:
            stream, sources = rag.answer_stream(
                question,
                history,
                store,
                model=settings.llm_model,
                top_k=settings.top_k,
                embed_model=settings.embed_model,
                temperature=settings.temperature,
            )
            placeholder = st.empty()
            buffer = ""
            for token in stream:
                buffer += token
                placeholder.markdown(buffer + "▌")
            placeholder.markdown(buffer)
        except Exception as exc:  # noqa: BLE001 - model/server problems
            st.error(
                "The answer model could not be reached. Check that Ollama is "
                f"running and the model is pulled.\n\n`{exc}`"
            )
            return

        _sources_panel(sources)

    state.add_message("assistant", buffer, sources)


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def render() -> None:
    docs = state.documents()

    if not docs:
        theme.empty_state(
            "📥",
            "No documents yet",
            "Upload a PDF from the sidebar to start asking questions.",
        )
        st.chat_input("Ask something about your documents…", disabled=True)
        return

    messages = state.messages()

    if not messages:
        theme.card(
            "Suggested questions",
            "<p>Try one of these to get going:</p><ul>"
            "<li>Summarise the main argument of this document.</li>"
            "<li>What methodology was used, and why?</li>"
            "<li>List the key findings and their page numbers.</li>"
            "<li>What limitations does the author acknowledge?</li>"
            "</ul>",
        )

    for message in messages:
        _render_message(message)

    question = st.chat_input(
        f"Ask across {len(docs)} document{'s' if len(docs) != 1 else ''}…"
    )
    if not question:
        return

    state.add_message("user", question)
    with st.chat_message("user", avatar="🧑‍💻"):
        st.markdown(question)

    _answer(question)


__all__ = ["render"]
