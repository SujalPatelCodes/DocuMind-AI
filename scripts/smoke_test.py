"""Ad-hoc end-to-end smoke test for the DocuMind pipeline.

Run:  python scripts/smoke_test.py
Creates a small PDF in memory, indexes it, retrieves on a query and (if Ollama
is reachable) asks one question. Not part of the app.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src import config, embeddings, llm, rag, summarizer  # noqa: E402
from src import quiz as quiz_mod  # noqa: E402
from src.pdf_utils import extract_pdf  # noqa: E402
from src.vector_store import VectorStore  # noqa: E402

PAGES = [
    "Photosynthesis converts light energy into chemical energy. It occurs in "
    "the chloroplasts of plant cells, where chlorophyll absorbs light most "
    "strongly in the blue and red parts of the spectrum.",
    "The light-dependent reactions happen in the thylakoid membrane and produce "
    "ATP and NADPH. Water is split, releasing oxygen as a by-product.",
    "The Calvin cycle takes place in the stroma. It uses ATP and NADPH to fix "
    "carbon dioxide into glucose through the enzyme RuBisCO.",
]


def make_pdf(data: list[str]) -> bytes:
    doc = pymupdf.open()
    for text in data:
        page = doc.new_page()
        page.insert_textbox(pymupdf.Rect(50, 50, 545, 780), text, fontsize=12)
    raw = doc.tobytes()
    doc.close()
    return raw


def main() -> int:
    print("→ building sample PDF")
    raw = make_pdf(PAGES)

    print("→ extracting text")
    doc = extract_pdf("photosynthesis.pdf", raw)
    print(f"   {doc.n_pages} pages, {doc.word_count} words")

    print("→ ingesting (embedding may take a moment on first run)")
    store = VectorStore(embeddings.dimension())
    rag.ingest_document(doc, store)
    print(f"   indexed {len(store)} chunks")

    question = "Where do the light-dependent reactions take place?"
    print(f"→ retrieving for: {question!r}")
    sources = rag.retrieve(question, store, top_k=config.TOP_K)
    for src in sources:
        print(f"   p.{src.page}  score={src.score:.3f}  {src.text[:60]!r}")
    assert sources, "retrieval returned nothing"
    assert any("thylakoid" in s.text.lower() for s in sources), "wrong top hit"
    print("   retrieval OK")

    status = llm.status()
    print(f"→ Ollama: online={status.online} models={status.models}")
    if not status.online or not status.models:
        print("   (skipping generation — no model runtime)")
        return 0

    model = llm.pick_default_model(status.models)
    print(f"→ generating answer with {model}")
    stream, gen_sources = rag.answer_stream(question, [], store, model=model)
    answer = "".join(stream)
    print(f"   answer: {answer[:200]}...")
    assert answer.strip(), "empty answer"

    print("→ summarising")
    summary = summarizer.summarize(doc, "brief", model=model)
    print(f"   summary: {summary[:160]}...")

    print("→ generating quiz")
    quiz = quiz_mod.generate(doc, model=model, n_questions=3)
    print(f"   {len(quiz)} questions; first: {quiz.questions[0].question[:80]!r}")
    assert len(quiz) == 3

    print("\nAll smoke tests passed ✔")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
