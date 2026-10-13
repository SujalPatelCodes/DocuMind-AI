"""PDF text extraction and chunking (PyMuPDF / ``fitz``)."""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field

try:  # PyMuPDF >= 1.24 exposes the modern module name
    import pymupdf as fitz
except ImportError:  # pragma: no cover - older releases
    import fitz


# --------------------------------------------------------------------------
# Data model
# --------------------------------------------------------------------------
@dataclass
class Page:
    """A single PDF page with its extracted plain text."""

    number: int  # 1-based page number
    text: str

    @property
    def words(self) -> int:
        return len(self.text.split())


@dataclass
class Chunk:
    """An embeddable slice of a page."""

    uid: str          # unique id across the whole session
    doc_id: str
    doc_name: str
    page: int         # source page number (1-based)
    text: str
    index: int        # position of the chunk within the document


@dataclass
class Document:
    """An ingested PDF."""

    id: str
    name: str
    size_bytes: int
    pages: list[Page] = field(default_factory=list)
    chunks: list[Chunk] = field(default_factory=list)

    # -- convenience -------------------------------------------------------
    @property
    def n_pages(self) -> int:
        return len(self.pages)

    @property
    def n_chunks(self) -> int:
        return len(self.chunks)

    @property
    def word_count(self) -> int:
        return sum(p.words for p in self.pages)

    @property
    def size_mb(self) -> float:
        return self.size_bytes / (1024 * 1024)

    def full_text(self, max_chars: int | None = None) -> str:
        text = "\n\n".join(p.text for p in self.pages if p.text.strip())
        if max_chars is not None and len(text) > max_chars:
            return text[:max_chars]
        return text


# --------------------------------------------------------------------------
# Extraction
# --------------------------------------------------------------------------
def document_id(name: str, data: bytes) -> str:
    """Deterministic id from the file name + content hash (dedupes uploads)."""
    digest = hashlib.sha1(data).hexdigest()[:10]
    return f"{name}-{digest}"


def extract_pdf(name: str, data: bytes) -> Document:
    """Extract text page-by-page from raw PDF bytes.

    Raises ``ValueError`` if the file is not a readable PDF or contains no
    extractable text (e.g. a pure scan without OCR).
    """
    try:
        pdf = fitz.open(stream=data, filetype="pdf")
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI
        raise ValueError(f"Could not read '{name}': {exc}") from exc

    pages: list[Page] = []
    with pdf:
        for i, page in enumerate(pdf, start=1):
            text = page.get_text("text").strip()
            if text:
                pages.append(Page(number=i, text=text))

    if not pages:
        raise ValueError(
            f"'{name}' has no extractable text. Scanned PDFs need OCR first."
        )

    return Document(
        id=document_id(name, data),
        name=name,
        size_bytes=len(data),
        pages=pages,
    )


# --------------------------------------------------------------------------
# Chunking
# --------------------------------------------------------------------------
def chunk_text(text: str, size: int, overlap: int) -> list[str]:
    """Split ``text`` into ~``size`` character chunks on paragraph boundaries.

    Falls back to hard slicing for paragraphs longer than ``size``. Consecutive
    chunks share ``overlap`` characters so sentences spanning a boundary stay
    retrievable from either side.
    """
    if size <= 0:
        raise ValueError("chunk size must be positive")
    overlap = max(0, min(overlap, size - 1))

    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    if not paragraphs:
        paragraphs = [text.strip()] if text.strip() else []

    chunks: list[str] = []
    buffer = ""

    def flush(buf: str) -> None:
        buf = buf.strip()
        if len(buf) >= 40:  # ignore fragments that carry no meaning
            chunks.append(buf)

    for para in paragraphs:
        if len(para) > size:
            flush(buffer)
            buffer = ""
            start = 0
            while start < len(para):
                flush(para[start : start + size])
                start += size - overlap
            continue

        if buffer and len(buffer) + len(para) + 1 > size:
            flush(buffer)
            buffer = buffer[-overlap:] if overlap else ""

        buffer = f"{buffer}\n{para}" if buffer else para

    flush(buffer)
    return chunks


def build_chunks(doc: Document, size: int, overlap: int) -> list[Chunk]:
    """Create the chunk list for a document using the given window settings."""
    chunks: list[Chunk] = []
    for page in doc.pages:
        for piece in chunk_text(page.text, size, overlap):
            chunks.append(
                Chunk(
                    uid=f"{doc.id}:{len(chunks)}",
                    doc_id=doc.id,
                    doc_name=doc.name,
                    page=page.number,
                    text=piece,
                    index=len(chunks),
                )
            )
    return chunks
