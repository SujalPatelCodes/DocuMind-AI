"""Sidebar: branding, PDF upload, document list and retrieval settings."""

from __future__ import annotations

import streamlit as st

from src import __version__, config, llm, pdf_utils, rag, state, theme


# --------------------------------------------------------------------------
# Brand + model status
# --------------------------------------------------------------------------
def _brand() -> None:
    theme.html_block(
        f"""
        <div class="dm-brand">
          <div class="dm-brand__mark">{config.APP_ICON}</div>
          <div>
            <div class="dm-brand__name">{theme.esc(config.APP_NAME)}</div>
            <div class="dm-brand__tag">Document Q&amp;A · local &amp; private</div>
          </div>
        </div>
        """
    )


def _status_chip() -> llm.LLMStatus:
    llm_status = llm.status()
    variant = "ok" if llm_status.online and llm_status.models else "warn"
    label = "Ollama ready" if variant == "ok" else "Ollama offline"
    theme.html_block(
        f'<div style="margin-bottom:.6rem">'
        f'{theme.chip("● " + label, variant)}'
        f'{theme.chip(llm_status.label)}'
        f'</div>'
    )
    if not llm_status.online:
        theme.html_block(
            '<div class="dm-card dm-card--warn" style="padding:.7rem .85rem">'
            '<div class="dm-card__title">Model runtime unavailable</div>'
            '<p style="font-size:.8rem;margin:0;color:#98a2b8">Start it with '
            '<code>ollama serve</code> and pull a model, e.g. '
            '<code>ollama pull llama3.2</code>.</p></div>'
        )
    return llm_status


# --------------------------------------------------------------------------
# Upload
# --------------------------------------------------------------------------
def _process_uploads(files) -> None:
    """Ingest any file that is not already in the session."""
    store = state.get_store()
    cfg = state.settings()

    for uploaded in files:
        data = uploaded.getvalue()
        doc_id = pdf_utils.document_id(uploaded.name, data)
        if doc_id in state.documents():
            continue

        with st.spinner(f"Reading “{uploaded.name}”…"):
            try:
                doc = pdf_utils.extract_pdf(uploaded.name, data)
                with st.spinner(f"Embedding {uploaded.name}…"):
                    rag.ingest_document(
                        doc,
                        store,
                        chunk_size=cfg.chunk_size,
                        chunk_overlap=cfg.chunk_overlap,
                        embed_model=cfg.embed_model,
                    )
            except Exception as exc:  # noqa: BLE001 - shown to the user
                state.notify("error", f"**{uploaded.name}** — {exc}")
                continue

        state.add_document(doc)
        state.notify(
            "success",
            f"Indexed **{doc.name}** · {doc.n_pages} pages · {doc.n_chunks} chunks",
        )


def _upload_panel() -> None:
    theme.section_label("Documents")
    files = st.file_uploader(
        "Drop PDFs here",
        type=list(config.ALLOWED_EXTENSIONS),
        accept_multiple_files=True,
        label_visibility="collapsed",
        help=f"Up to {config.MAX_FILE_MB} MB per file. Text-based PDFs only.",
    )
    if files:
        _process_uploads(files)


# --------------------------------------------------------------------------
# Document list
# --------------------------------------------------------------------------
def _document_list() -> None:
    docs = state.documents()
    if not docs:
        theme.html_block(
            '<p style="font-size:.78rem;color:#98a2b8;margin:.2rem 0 0">'
            "No documents indexed yet.</p>"
        )
        return

    for doc_id, doc in list(docs.items()):
        row = st.container()
        with row:
            left, right = st.columns([5, 1], vertical_alignment="center")
            with left:
                theme.html_block(
                    f'<div class="dm-doc"><div style="min-width:0">'
                    f'<div class="dm-doc__name">📄 {theme.esc(doc.name)}</div>'
                    f'<div class="dm-doc__meta">{doc.n_pages} pages · '
                    f"{doc.n_chunks} chunks · {doc.size_mb:.1f} MB</div>"
                    f"</div></div>"
                )
            with right:
                if st.button("🗑", key=f"del_{doc_id}", help="Remove document"):
                    state.remove_document(doc_id)
                    st.toast(f"Removed {doc.name}")
                    st.rerun()


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------
def _settings_panel(llm_status: llm.LLMStatus) -> None:
    cfg = state.settings()

    with st.expander("⚙️ Retrieval & model settings", expanded=False):
        models = llm_status.models or [cfg.llm_model]
        if cfg.llm_model not in models:
            models = [cfg.llm_model, *models]
        cfg.llm_model = st.selectbox(
            "Answer model",
            options=models,
            index=models.index(cfg.llm_model),
            help="Any model installed in Ollama, e.g. llama3.2 or qwen3.5:9b.",
        )

        cfg.temperature = st.slider(
            "Creativity", 0.0, 1.0, cfg.temperature, 0.05,
            help="Lower is more literal and grounded in the document.",
        )
        cfg.top_k = st.slider(
            "Passages retrieved", 1, 10, cfg.top_k,
            help="How many chunks are handed to the model per question.",
        )

        st.markdown("---")
        cfg.embed_model = st.text_input(
            "Embedding model", cfg.embed_model,
            help="Changing this rebuilds the index; re-upload your PDFs afterwards.",
        )
        cfg.chunk_size = st.slider(
            "Chunk size (characters)", 400, 2000, cfg.chunk_size, 50
        )
        cfg.chunk_overlap = st.slider(
            "Chunk overlap", 0, 500, cfg.chunk_overlap, 25
        )
        st.caption("Chunk settings apply to documents uploaded from now on.")

        if st.button("♻️ Rebuild index", use_container_width=True):
            state.reset_store()
            state.documents().clear()
            state.clear_summaries()
            state.clear_chat()
            state.notify("info", "Index cleared — upload your PDFs again.")
            st.rerun()


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def render() -> None:
    with st.sidebar:
        _brand()
        llm_status = _status_chip()
        _upload_panel()
        _document_list()
        theme.section_label("Session")
        if st.button("🧹 Clear conversation", use_container_width=True):
            state.clear_chat()
            st.rerun()
        _settings_panel(llm_status)
        st.caption(f"v{__version__} · runs fully offline on your machine")
