"""Summary tab: condensed views of a document, cached per (document, mode)."""

from __future__ import annotations

import streamlit as st

from src import config, state, summarizer, theme


def _controls(doc_names: list[str]):
    left, mid, right = st.columns([3, 2, 2], vertical_alignment="bottom")
    with left:
        doc_name = st.selectbox("Document", doc_names, key="summary_doc")
    with mid:
        mode = st.selectbox(
            "Summary style",
            options=list(config.SUMMARY_MODES),
            format_func=lambda m: config.SUMMARY_MODES[m]["label"],
            key="summary_mode",
        )
    with right:
        generate = st.button("✨ Generate summary", type="primary", use_container_width=True)

    st.caption(config.SUMMARY_MODES[mode]["hint"])
    return doc_name, mode, generate


def _render_result(doc, mode: str, text: str) -> None:
    original, condensed, pct = summarizer.reduction_stats(doc, text)
    theme.stat_cards(
        [
            (f"{original:,}", "Original words"),
            (f"{condensed:,}", "Summary words"),
            (f"{pct}%", "Shorter"),
            (config.SUMMARY_MODES[mode]["label"], "Style"),
        ]
    )
    with st.container():
        st.markdown(text)

    st.download_button(
        "⬇️ Download summary (.md)",
        data=f"# {doc.name} — {config.SUMMARY_MODES[mode]['label']}\n\n{text}\n",
        file_name=f"{doc.name.rsplit('.', 1)[0]}-{mode}-summary.md",
        mime="text/markdown",
        use_container_width=True,
    )


def render() -> None:
    doc_names = state.document_names()
    if not doc_names:
        theme.empty_state(
            "📝",
            "Nothing to summarise yet",
            "Upload a PDF and DocuMind will condense it for you.",
        )
        return

    doc_name, mode, generate = _controls(doc_names)
    doc_id = state.doc_id_for_name(doc_name)
    doc = state.document(doc_id) if doc_id else None
    if doc is None:
        st.error("That document is no longer available.")
        return

    cached = state.cached_summary(doc_id, mode)

    if generate:
        settings = state.settings()
        with st.spinner(f"Summarising “{doc.name}”…"):
            try:
                text = summarizer.summarize(
                    doc, mode, model=settings.llm_model
                )
            except Exception as exc:  # noqa: BLE001
                st.error(f"Could not generate the summary.\n\n`{exc}`")
                return
        state.set_summary(doc_id, mode, text)
        cached = text

    if cached:
        _render_result(doc, mode, cached)
        if st.button("↺ Regenerate"):
            st.session_state["summaries"].pop((doc_id, mode), None)
            st.rerun()
    else:
        theme.empty_state(
            "🪄",
            "Ready when you are",
            "Pick a style and press Generate to condense this document.",
        )
