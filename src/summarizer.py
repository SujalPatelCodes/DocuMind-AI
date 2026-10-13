"""Document summarisation, backed by the local Ollama model."""

from __future__ import annotations

from src import config, llm
from src.pdf_utils import Document

SYSTEM_PROMPT = """You are DocuMind, an expert at distilling documents.

- Work strictly from the supplied text; never add outside knowledge.
- Use clean Markdown: headings, bullet points and bold labels.
- Be information-dense. No preamble, no "here is a summary", no filler.
"""


def _prompt(doc: Document, instruction: str, text: str) -> str:
    return (
        f"Document: {doc.name}\n"
        f"Pages: {doc.n_pages} | Words: {doc.word_count}\n\n"
        f"{instruction}\n\n"
        f"--- BEGIN DOCUMENT ---\n{text}\n--- END DOCUMENT ---"
    )


def summarize(
    doc: Document,
    mode: str,
    model: str,
    temperature: float = 0.3,
) -> str:
    """Generate a summary of ``doc`` in the requested ``mode``."""
    if mode not in config.SUMMARY_MODES:
        raise ValueError(f"Unknown summary mode '{mode}'")
    spec = config.SUMMARY_MODES[mode]

    text = doc.full_text()
    truncated = len(text) > spec["max_chars"]
    if truncated:
        text = text[: spec["max_chars"]]

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _prompt(doc, spec["instruction"], text)},
    ]
    result = llm.complete(messages, model=model, temperature=temperature)
    if truncated:
        result += (
            "\n\n---\n*Note: this document was longer than the model context "
            "window, so the summary covers the opening portion.*"
        )
    return result


def reduction_stats(doc: Document, summary: str) -> tuple[int, int, int]:
    """Return ``(original_words, summary_words, percent_reduced)``."""
    original = doc.word_count
    condensed = len(summary.split())
    if original == 0:
        return 0, condensed, 0
    pct = max(0, round((1 - condensed / original) * 100))
    return original, condensed, pct
