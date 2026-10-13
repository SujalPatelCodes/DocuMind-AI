"""Quiz generation from study material, with defensive JSON parsing."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from src import config, llm
from src.pdf_utils import Document

SYSTEM_PROMPT = """You are DocuMind, an examiner who writes fair, precise quizzes.

Return ONLY valid JSON. Never wrap it in prose or code fences.
The JSON must match this shape exactly:

{
  "questions": [
    {
      "question": "…",
      "type": "multiple_choice",
      "options": ["…", "…", "…", "…"],
      "answer": 0,
      "explanation": "Why the answer is correct, citing the page.",
      "page": 3
    }
  ]
}

Rules:
- "type" is "multiple_choice" while "options" holds 4 choices, or
  "true_false" where "options" is exactly ["True", "False"].
- "answer" is the zero-based index of the correct option.
- Questions must be answerable purely from the document.
- Vary the difficulty and never reuse the same fact twice.
"""

# JSON schema handed to Ollama's structured-output decoder so the model is
# physically unable to emit malformed JSON.
QUIZ_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "question": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["multiple_choice", "true_false"],
                    },
                    "options": {"type": "array", "items": {"type": "string"}},
                    "answer": {"type": "integer"},
                    "explanation": {"type": "string"},
                    "page": {"type": "integer"},
                },
                "required": [
                    "question",
                    "type",
                    "options",
                    "answer",
                    "explanation",
                    "page",
                ],
            },
        }
    },
    "required": ["questions"],
}


@dataclass
class Question:
    """A single quiz item."""

    question: str
    options: list[str]
    answer: int
    explanation: str = ""
    page: int | None = None
    kind: str = "multiple_choice"

    def is_correct(self, choice: int | None) -> bool:
        return choice is not None and choice == self.answer

    @property
    def letters(self) -> list[str]:
        return [chr(ord("A") + i) for i in range(len(self.options))]


@dataclass
class Quiz:
    """A generated quiz for one document."""

    doc_name: str
    questions: list[Question] = field(default_factory=list)

    def __len__(self) -> int:
        return len(self.questions)

    def score(self, answers: dict[int, int | None]) -> tuple[int, int, int]:
        """Return ``(correct, total, percent)``."""
        total = len(self.questions)
        correct = sum(
            1 for i, q in enumerate(self.questions) if q.is_correct(answers.get(i))
        )
        pct = round(correct / total * 100) if total else 0
        return correct, total, pct


# --------------------------------------------------------------------------
# Parsing helpers
# --------------------------------------------------------------------------
def _extract_json(raw: str) -> dict:
    """Pull a JSON object out of a model response, fences and all."""
    text = raw.strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # Fall back to the outermost {...} span.
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end > start:
        return json.loads(text[start : end + 1])
    raise ValueError("The model did not return valid JSON.")


def _coerce_question(item: dict) -> Question | None:
    """Validate one raw question dict, returning ``None`` when unusable."""
    prompt = str(item.get("question", "")).strip()
    options = [str(o).strip() for o in item.get("options", []) if str(o).strip()]
    if not prompt or len(options) < 2:
        return None

    try:
        answer = int(item.get("answer", 0))
    except (TypeError, ValueError):
        answer = 0
    if not 0 <= answer < len(options):
        answer = 0

    page = item.get("page")
    try:
        page = int(page) if page is not None else None
    except (TypeError, ValueError):
        page = None

    kind = str(item.get("type", "multiple_choice"))
    if options == ["True", "False"]:
        kind = "true_false"

    return Question(
        question=prompt,
        options=options,
        answer=answer,
        explanation=str(item.get("explanation", "")).strip(),
        page=page,
        kind=kind,
    )


def _parse_questions(raw: str) -> list[Question]:
    """Turn a raw model response into validated questions (may return [])."""
    try:
        payload = _extract_json(raw)
    except (ValueError, json.JSONDecodeError):
        return []

    questions: list[Question] = []
    for item in payload.get("questions", []) if isinstance(payload, dict) else []:
        if isinstance(item, dict):
            question = _coerce_question(item)
            if question is not None:
                questions.append(question)
    return questions


# --------------------------------------------------------------------------
# Generation
# --------------------------------------------------------------------------
def generate(
    doc: Document,
    model: str,
    n_questions: int = 5,
    difficulty: str = "Medium",
    quiz_type: str = "Multiple choice",
    temperature: float = 0.5,
) -> Quiz:
    """Generate and validate a quiz from ``doc``."""
    n_questions = max(
        config.QUIZ_MIN_QUESTIONS, min(n_questions, config.QUIZ_MAX_QUESTIONS)
    )

    if quiz_type == "True / False":
        shape = 'Every question must use "type": "true_false" with options ["True", "False"].'
    elif quiz_type == "Mixed":
        shape = "Mix multiple-choice and true/false questions."
    else:
        shape = 'Every question must use "type": "multiple_choice" with 4 options.'

    instruction = (
        f"Write exactly {n_questions} {difficulty.lower()}-difficulty questions "
        f"about the document below.\n{shape}\n"
        'Record the source page for each question in the "page" field.'
    )

    # Use the whole document when it fits, otherwise spread across the text.
    text = doc.full_text()
    budget = 14000
    if len(text) > budget:
        step = len(text) // 4
        text = "\n\n[…]\n\n".join(text[i * step : i * step + budget // 4] for i in range(4))

    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {
            "role": "user",
            "content": (
                f"Document: {doc.name} ({doc.n_pages} pages)\n\n"
                f"{instruction}\n\n"
                f"--- BEGIN DOCUMENT ---\n{text}\n--- END DOCUMENT ---"
            ),
        },
    ]

    raw = llm.complete(
        messages, model=model, temperature=temperature, json_schema=QUIZ_SCHEMA
    )
    questions = _parse_questions(raw)

    if not questions:
        # One repair attempt: show the model its own output and ask again.
        repair = [
            *messages,
            {"role": "assistant", "content": raw},
            {
                "role": "user",
                "content": (
                    "That response was not valid JSON. Return the same quiz "
                    "again as pure JSON that matches the required shape exactly."
                ),
            },
        ]
        raw = llm.complete(
            repair, model=model, temperature=0.0, json_schema=QUIZ_SCHEMA
        )
        questions = _parse_questions(raw)

    if not questions:
        raise ValueError("The model could not produce valid quiz JSON.")

    return Quiz(doc_name=doc.name, questions=questions[:n_questions])
