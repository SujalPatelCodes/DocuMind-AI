"""Central configuration: branding, defaults and tunable knobs."""

from __future__ import annotations

from pathlib import Path

# --------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
ASSETS_DIR = ROOT / "assets"
STYLES_PATH = ASSETS_DIR / "styles.css"

# --------------------------------------------------------------------------
# Branding (single source of truth for the UI)
# --------------------------------------------------------------------------
APP_NAME = "DocuMind AI"
APP_ICON = "🧠"
APP_TAGLINE = "An Intelligent Document Question Answering System"
APP_DESCRIPTION = (
    "Upload PDFs, ask questions in plain English and get answers grounded in "
    "your own documents — with the exact source pages attached."
)

# --------------------------------------------------------------------------
# Models
# --------------------------------------------------------------------------
DEFAULT_EMBED_MODEL = "all-MiniLM-L6-v2"
DEFAULT_LLM_MODEL = "llama3.2:latest"

LLM_TEMPERATURE = 0.2
LLM_NUM_CTX = 8192

# --------------------------------------------------------------------------
# Retrieval defaults
# --------------------------------------------------------------------------
CHUNK_SIZE = 1000          # characters per chunk
CHUNK_OVERLAP = 150        # characters of overlap between chunks
TOP_K = 4                  # passages retrieved per question
MIN_SCORE = 0.05           # cosine floor for a "relevant" hit

# --------------------------------------------------------------------------
# Uploads
# --------------------------------------------------------------------------
ALLOWED_EXTENSIONS = ("pdf",)
MAX_FILE_MB = 200

# --------------------------------------------------------------------------
# Summary modes -> (label, instruction, max source characters)
# --------------------------------------------------------------------------
SUMMARY_MODES: dict[str, dict] = {
    "brief": {
        "label": "Brief overview",
        "hint": "A short 3–4 sentence abstract.",
        "instruction": (
            "Write a concise overview of the document in 3 to 4 sentences. "
            "Capture the purpose, the main argument and the conclusion."
        ),
        "max_chars": 9000,
    },
    "bullets": {
        "label": "Key bullet points",
        "hint": "The most important facts as bullets.",
        "instruction": (
            "Summarise the document as 6 to 10 scannable bullet points. "
            "Each bullet must be a complete, self-contained statement."
        ),
        "max_chars": 12000,
    },
    "detailed": {
        "label": "Detailed summary",
        "hint": "Section-by-section walkthrough.",
        "instruction": (
            "Produce a structured summary with short section headings. "
            "Cover the objective, methodology, key findings and implications."
        ),
        "max_chars": 16000,
    },
    "takeaways": {
        "label": "Study takeaways",
        "hint": "Exam-ready revision notes.",
        "instruction": (
            "Produce exam-style revision notes: a list of key takeaways, the "
            "definitions a student must memorise, and 3 questions this "
            "document would be likely to be tested on."
        ),
        "max_chars": 14000,
    },
}

# --------------------------------------------------------------------------
# Quiz
# --------------------------------------------------------------------------
QUIZ_DIFFICULTIES = ("Easy", "Medium", "Hard")
QUIZ_TYPES = ("Multiple choice", "True / False", "Mixed")
QUIZ_MIN_QUESTIONS = 3
QUIZ_MAX_QUESTIONS = 15
