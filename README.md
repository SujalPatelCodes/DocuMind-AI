# 🧠 DocuMind AI

**An Intelligent Document Question Answering System**

Upload PDFs, ask questions in plain English, and get answers grounded in your own
documents — with the exact source pages attached. Everything runs locally: the
language model, the embeddings and the vector index all live on your machine.

---

## Features

| Feature | Description |
| --- | --- |
| 📥 **Document upload** | Drag and drop multiple PDFs; they are parsed, chunked and indexed automatically. |
| 💬 **Grounded chat** | Ask questions and get answers drawn only from your documents, with an expandable list of the source pages and relevance scores. |
| 📝 **Summarisation** | Four summary styles — brief overview, key bullets, detailed walkthrough and study takeaways — with a "67% shorter" style stat card and Markdown download. |
| 🧠 **Quiz generator** | Turn study material into multiple-choice / true-false quizzes, answer them in the UI and get instant per-question marking with explanations. |
| 🔒 **Fully offline** | No API keys, no usage costs. Your documents never leave the machine. |

---

## Tech stack

| Component | Technology |
| --- | --- |
| Programming | Python 3.10+ |
| Frontend | Streamlit |
| AI model | Ollama (local, e.g. `llama3.2`) |
| Document processing | PyMuPDF |
| Embeddings | Sentence-Transformers (`all-MiniLM-L6-v2`) |
| Vector database | FAISS |
| Version control | Git / GitHub |

---

## Project structure

```
DocuMind AI/
├── app.py                  # Streamlit entry point: layout, hero, tabs
├── requirements.txt
├── .streamlit/config.toml  # Base dark theme
├── assets/styles.css       # Custom theme layered on top
├── samples/                # Generated test PDFs
├── scripts/
│   ├── make_sample_pdf.py  # Creates a sample 4-page PDF
│   └── smoke_test.py       # End-to-end pipeline check
├── src/
│   ├── config.py           # Branding, defaults, prompt/summary settings
│   ├── state.py            # Session state (single source of truth)
│   ├── theme.py            # CSS injection + UI primitives (cards, chips…)
│   ├── pdf_utils.py        # PyMuPDF extraction + chunking
│   ├── embeddings.py       # Sentence-Transformers wrapper (cached)
│   ├── vector_store.py     # FAISS index with page metadata
│   ├── llm.py              # Ollama client (version-tolerant)
│   ├── rag.py              # Retrieval-Augmented Generation pipeline
│   ├── summarizer.py       # Document summarisation
│   ├── quiz.py             # Quiz generation + validation
│   └── ui/
│       ├── sidebar.py      # Upload, document list, settings
│       ├── chat_view.py    # Chat tab
│       ├── summary_view.py # Summarise tab
│       └── quiz_view.py    # Quiz tab
└── tests/                  # Unit + headless UI tests
```

**Design note:** the UI layer (`src/ui/`) only reads and writes through
`src/state.py`, and all model work sits behind `src/rag.py`, `src/summarizer.py`
and `src/quiz.py`. You can restyle the front end without touching retrieval, or
swap the backend without touching the UI.

---

## Quickstart

### 1. Install Ollama and pull a model

Download Ollama from <https://ollama.com>, then:

```bash
ollama pull llama3.2          # ~2 GB, good default
ollama serve                  # usually already running
```

Any local model works — larger models (e.g. `qwen3.5:9b`) give better answers.

### 2. Install Python dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the app

```bash
streamlit run app.py
```

Open <http://localhost:8501>, upload a PDF from the sidebar and start asking
questions. The first run downloads the ~90 MB embedding model once.

> **No PDF handy?** Generate one: `python scripts/make_sample_pdf.py`

---

## How it works (the RAG pipeline)

1. **Extract** — PyMuPDF pulls text from every page, keeping the page number
   attached to each passage.
2. **Chunk** — text is split into ~1000-character windows with 150 characters of
   overlap, so sentences spanning a boundary stay retrievable.
3. **Embed** — Sentence-Transformers maps each chunk to a normalised vector that
   encodes its meaning.
4. **Index** — FAISS stores those vectors for fast cosine-similarity search.
5. **Retrieve** — your question is embedded the same way and the closest chunks
   are pulled back (best two per page, for source variety).
6. **Generate** — only those chunks are handed to the local Ollama model, which
   answers and cites the pages it used.

Summaries and quizzes reuse the same extraction step but send the document —
rather than retrieved chunks — to the model. Quizzes are constrained with
Ollama's **structured output** mode so the JSON always validates.

---

## Testing

```bash
python -m unittest discover -s tests -v   # 25 unit + headless UI tests
python scripts/smoke_test.py              # full pipeline incl. the local model
```

The unit tests are model-free and run in about two seconds. The smoke test
actually embeds, retrieves, answers, summarises and generates a quiz.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| Sidebar says **Ollama offline** | Start the server with `ollama serve`, then reload. |
| **No models** in the dropdown | `ollama pull llama3.2` |
| *"has no extractable text"* | The PDF is a scan. Run OCR first (e.g. `ocrmypdf in.pdf out.pdf`). |
| Answers are slow | Expected on CPU. Try a smaller model, or lower "Passages retrieved". |
| Changed the embedding model | Click **Rebuild index** in the settings and re-upload your PDFs. |

---

## Settings worth knowing

- **Answer model** — any model installed in Ollama.
- **Creativity** — lower is more literal and better grounded in the document.
- **Passages retrieved** — how much context each question gets.
- **Chunk size / overlap** — applies to documents uploaded *after* the change.

---

## Limitations

- Text-based PDFs only; scanned images require OCR beforehand.
- Very long documents are summarised from as much text as fits the model's
  context window (the app says so when it truncates).
- The index lives in memory for the session; it is rebuilt on restart.

---

## License

Free to use for coursework and personal projects.
