"""Headless boot test using Streamlit's built-in AppTest harness.

Run:  python -m unittest discover -s tests -v
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from streamlit.testing.v1 import AppTest  # noqa: E402

from src.pdf_utils import Page, Document, build_chunks  # noqa: E402
from src import config  # noqa: E402


def _sample_document() -> Document:
    text = (
        "Photosynthesis converts light energy into chemical energy inside the "
        "chloroplasts of plant cells.\n\nThe light-dependent reactions occur in "
        "the thylakoid membrane and produce ATP and NADPH.\n\nThe Calvin cycle "
        "takes place in the stroma and fixes carbon dioxide into glucose."
    )
    doc = Document(id="sample.pdf-abc", name="sample.pdf", size_bytes=2048)
    doc.pages = [Page(number=1, text=text)]
    doc.chunks = build_chunks(doc, config.CHUNK_SIZE, config.CHUNK_OVERLAP)
    return doc


class AppBootTest(unittest.TestCase):
    def test_app_renders_without_exception(self) -> None:
        at = AppTest.from_file(str(ROOT / "app.py"), default_timeout=180).run()

        self.assertFalse(
            at.exception,
            [e.value for e in at.exception],
        )

    def test_expected_controls_exist(self) -> None:
        at = AppTest.from_file(str(ROOT / "app.py"), default_timeout=180).run()

        # Sidebar: uploader + chat reset control.
        self.assertGreaterEqual(len(at.sidebar), 1)
        # Main area: three tabs (chat / summarise / quiz).
        self.assertEqual(len(at.tabs), 3)

    def test_tab_labels(self) -> None:
        at = AppTest.from_file(str(ROOT / "app.py"), default_timeout=180).run()
        labels = [tab.label for tab in at.tabs]
        self.assertIn("💬 Chat", labels)
        self.assertIn("📝 Summarise", labels)
        self.assertIn("🧠 Quiz me", labels)

    def test_views_render_with_a_document_loaded(self) -> None:
        doc = _sample_document()
        at = AppTest.from_file(str(ROOT / "app.py"), default_timeout=180)
        at.session_state["documents"] = {doc.id: doc}
        at.run()

        self.assertFalse(at.exception, [e.value for e in at.exception])
        # Summary + quiz tabs both expose a document picker.
        labels = [box.label for box in at.selectbox]
        self.assertIn("Document", labels)
        self.assertIn("Study material", labels)


if __name__ == "__main__":
    unittest.main(verbosity=2)
