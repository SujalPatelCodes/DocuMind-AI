"""Unit tests for the model-free parts of the pipeline.

Run:  python -m unittest discover -s tests -v
These never load the embedding model or call Ollama, so they stay fast.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402
import pymupdf  # noqa: E402

from src.pdf_utils import (  # noqa: E402
    Chunk,
    Document,
    Page,
    build_chunks,
    chunk_text,
    document_id,
    extract_pdf,
)
from src.quiz import Quiz, Question, _coerce_question, _extract_json  # noqa: E402
from src.summarizer import reduction_stats  # noqa: E402
from src.vector_store import VectorStore  # noqa: E402


# --------------------------------------------------------------------------
# Chunking
# --------------------------------------------------------------------------
class ChunkingTest(unittest.TestCase):
    def test_chunks_respect_the_size_limit(self) -> None:
        text = "\n\n".join(f"Paragraph number {i}. " * 20 for i in range(12))
        chunks = chunk_text(text, size=400, overlap=50)
        self.assertGreater(len(chunks), 1)
        for chunk in chunks:
            self.assertLessEqual(len(chunk), 400 + 200)  # allow overlap slack

    def test_tiny_fragments_are_dropped(self) -> None:
        self.assertEqual(chunk_text("hi", size=500, overlap=0), [])

    def test_overlap_is_bounded_by_size(self) -> None:
        # An overlap >= size would loop forever; it must be clamped.
        chunks = chunk_text("word " * 400, size=200, overlap=500)
        self.assertTrue(all(len(c) <= 400 for c in chunks))

    def test_empty_input_is_safe(self) -> None:
        self.assertEqual(chunk_text("", size=500, overlap=50), [])


# --------------------------------------------------------------------------
# Documents / extraction
# --------------------------------------------------------------------------
class DocumentTest(unittest.TestCase):
    def _pdf(self, pages: list[str]) -> bytes:
        doc = pymupdf.open()
        for body in pages:
            page = doc.new_page()
            page.insert_textbox(pymupdf.Rect(50, 50, 545, 780), body, fontsize=12)
        raw = doc.tobytes()
        doc.close()
        return raw

    def test_extract_pdf_keeps_page_numbers(self) -> None:
        raw = self._pdf(["Alpha page content here.", "Beta page content here."])
        doc = extract_pdf("two.pdf", raw)
        self.assertEqual(doc.n_pages, 2)
        self.assertEqual(doc.pages[0].number, 1)
        self.assertIn("Alpha", doc.pages[0].text)

    def test_extract_pdf_rejects_empty_document(self) -> None:
        raw = self._pdf([""])
        with self.assertRaises(ValueError):
            extract_pdf("blank.pdf", raw)

    def test_document_id_is_content_addressed(self) -> None:
        raw = self._pdf(["Some text."])
        self.assertEqual(document_id("a.pdf", raw), document_id("a.pdf", raw))
        self.assertNotEqual(document_id("a.pdf", raw), document_id("b.pdf", raw))

    def test_build_chunks_attributes_every_page(self) -> None:
        doc = Document(id="d1", name="d.pdf", size_bytes=1)
        doc.pages = [
            Page(number=1, text="Alpha. " * 60),
            Page(number=2, text="Beta. " * 60),
        ]
        doc.chunks = build_chunks(doc, size=300, overlap=40)
        self.assertTrue(doc.chunks)
        self.assertEqual({c.page for c in doc.chunks}, {1, 2})
        self.assertTrue(all(c.doc_id == "d1" for c in doc.chunks))


# --------------------------------------------------------------------------
# Vector store
# --------------------------------------------------------------------------
class VectorStoreTest(unittest.TestCase):
    @staticmethod
    def _chunk(uid: str, doc_id: str, page: int, text: str) -> Chunk:
        return Chunk(uid=uid, doc_id=doc_id, doc_name=f"{doc_id}.pdf", page=page, text=text, index=0)

    def test_add_and_search_returns_best_match_first(self) -> None:
        store = VectorStore(3)
        vectors = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]], dtype="float32")
        store.add(vectors, [self._chunk("a", "d1", 1, "apple"), self._chunk("b", "d1", 2, "banana")])
        self.assertEqual(len(store), 2)

        hits = store.search(np.array([1.0, 0.0, 0.0], dtype="float32"), k=2)
        self.assertEqual(hits[0][0].text, "apple")
        self.assertAlmostEqual(hits[0][1], 1.0, places=5)

    def test_remove_document_rebuilds_index(self) -> None:
        store = VectorStore(2)
        store.add(
            np.array([[1.0, 0.0], [0.0, 1.0]], dtype="float32"),
            [self._chunk("a", "d1", 1, "one"), self._chunk("b", "d2", 1, "two")],
        )
        store.remove_document("d1")
        self.assertEqual(len(store), 1)
        self.assertEqual(store.document_ids, {"d2"})
        hits = store.search(np.array([1.0, 0.0], dtype="float32"), k=5)
        self.assertEqual([c.text for c, _ in hits], ["two"])

    def test_search_on_empty_store_is_safe(self) -> None:
        self.assertEqual(VectorStore(4).search(np.zeros(4, dtype="float32")), [])


# --------------------------------------------------------------------------
# Quiz parsing / scoring
# --------------------------------------------------------------------------
class QuizParsingTest(unittest.TestCase):
    def test_extract_json_handles_code_fences(self) -> None:
        raw = '```json\n{"questions": []}\n```'
        self.assertEqual(_extract_json(raw), {"questions": []})

    def test_extract_json_handles_surrounding_prose(self) -> None:
        raw = 'Sure! Here you go:\n{"questions": []}\nHope that helps.'
        self.assertEqual(_extract_json(raw), {"questions": []})

    def test_extract_json_raises_on_garbage(self) -> None:
        with self.assertRaises(Exception):
            _extract_json("not json at all")

    def test_coerce_question_rejects_unusable_items(self) -> None:
        self.assertIsNone(_coerce_question({"question": "Q?", "options": ["only one"]}))
        self.assertIsNone(_coerce_question({"options": ["a", "b"]}))

    def test_coerce_question_clamps_out_of_range_answers(self) -> None:
        q = _coerce_question(
            {"question": "Q?", "options": ["a", "b", "c", "d"], "answer": 99}
        )
        self.assertIsNotNone(q)
        self.assertEqual(q.answer, 0)

    def test_true_false_is_detected(self) -> None:
        q = _coerce_question(
            {"question": "Q?", "options": ["True", "False"], "answer": 1}
        )
        self.assertEqual(q.kind, "true_false")


class QuizScoringTest(unittest.TestCase):
    def _quiz(self) -> Quiz:
        return Quiz(
            doc_name="d.pdf",
            questions=[
                Question(question="1", options=["a", "b"], answer=0),
                Question(question="2", options=["a", "b"], answer=1),
            ],
        )

    def test_score_counts_correct_answers(self) -> None:
        self.assertEqual(self._quiz().score({0: 0, 1: 1}), (2, 2, 100))

    def test_score_treats_unanswered_as_wrong(self) -> None:
        self.assertEqual(self._quiz().score({0: 0}), (1, 2, 50))

    def test_letters_are_sequential(self) -> None:
        self.assertEqual(Question(question="q", options=["a", "b", "c", "d"], answer=0).letters,
                         ["A", "B", "C", "D"])


# --------------------------------------------------------------------------
# Summariser
# --------------------------------------------------------------------------
class SummarizerTest(unittest.TestCase):
    def test_reduction_stats(self) -> None:
        doc = Document(id="d", name="d.pdf", size_bytes=1)
        doc.pages = [Page(number=1, text=" ".join(["word"] * 100))]
        original, condensed, pct = reduction_stats(doc, " ".join(["word"] * 25))
        self.assertEqual((original, condensed), (100, 25))
        self.assertEqual(pct, 75)


if __name__ == "__main__":
    unittest.main(verbosity=2)
