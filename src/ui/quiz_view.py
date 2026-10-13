"""Quiz tab: generate a quiz from study material and mark it interactively."""

from __future__ import annotations

import streamlit as st

from src import config, quiz as quiz_mod, state, theme
from src.quiz import Quiz


# --------------------------------------------------------------------------
# Generation controls
# --------------------------------------------------------------------------
def _controls(doc_names: list[str]):
    c1, c2, c3 = st.columns([3, 1, 1], vertical_alignment="bottom")
    with c1:
        doc_name = st.selectbox("Study material", doc_names, key="quiz_doc")
    with c2:
        n = st.number_input(
            "Questions",
            min_value=config.QUIZ_MIN_QUESTIONS,
            max_value=config.QUIZ_MAX_QUESTIONS,
            value=5,
            step=1,
            key="quiz_n",
        )
    with c3:
        difficulty = st.selectbox("Difficulty", config.QUIZ_DIFFICULTIES, key="quiz_diff")

    quiz_type = st.radio(
        "Question type",
        config.QUIZ_TYPES,
        horizontal=True,
        key="quiz_type",
    )
    generate = st.button("🧠 Generate quiz", type="primary", use_container_width=True)
    return doc_name, int(n), difficulty, quiz_type, generate


def _reset_attempt() -> None:
    st.session_state["quiz_answers"] = {}
    st.session_state["quiz_submitted"] = False


# --------------------------------------------------------------------------
# Taking the quiz
# --------------------------------------------------------------------------
def _render_question(index: int, total: int, q: quiz_mod.Question) -> int | None:
    with st.container():
        theme.html_block(
            f'<div class="dm-quiz">'
            f'<div class="dm-quiz__num">Question {index + 1} of {total}</div>'
            f'<p class="dm-quiz__q">{theme.esc(q.question)}</p></div>'
        )
        options = [f"{letter}. {text}" for letter, text in zip(q.letters, q.options)]
        choice = st.radio(
            "Choose one",
            options=range(len(options)),
            format_func=lambda i: options[i],
            key=f"quiz_q_{index}",
            label_visibility="collapsed",
        )
    return choice


def _render_active(quiz: Quiz) -> None:
    with st.form("quiz_form", border=False):
        choices: dict[int, int | None] = {}
        for i, q in enumerate(quiz.questions):
            choices[i] = _render_question(i, len(quiz), q)
        submitted = st.form_submit_button(
            "✅ Submit answers", type="primary", use_container_width=True
        )

    if submitted:
        st.session_state["quiz_answers"] = choices
        st.session_state["quiz_submitted"] = True
        st.rerun()


# --------------------------------------------------------------------------
# Results
# --------------------------------------------------------------------------
def _render_results(quiz: Quiz) -> None:
    answers = st.session_state.get("quiz_answers", {})
    correct, total, pct = quiz.score(answers)

    theme.html_block(
        f'<div class="dm-score-big">'
        f'<div class="dm-score-big__num">{pct}%</div>'
        f'<div class="dm-score-big__lbl">{correct} of {total} correct</div></div>'
    )
    st.write("")

    for i, q in enumerate(quiz.questions):
        given = answers.get(i)
        ok = q.is_correct(given)
        icon = "✅" if ok else "❌"
        with st.expander(f"{icon} Question {i + 1} — {q.question[:70]}"):
            for j, option in enumerate(q.options):
                if j == q.answer:
                    marker = "**✅ correct answer**"
                elif j == given:
                    marker = "**❌ your answer**"
                else:
                    marker = ""
                st.markdown(f"- {q.letters[j]}. {option} {marker}")
            if q.explanation:
                st.info(q.explanation)
            if q.page:
                st.caption(f"Source: page {q.page}")

    left, right = st.columns(2)
    with left:
        if st.button("🔁 Retake quiz", use_container_width=True):
            _reset_attempt()
            st.rerun()
    with right:
        if st.button("➕ New quiz", use_container_width=True):
            st.session_state["quiz"] = None
            _reset_attempt()
            st.rerun()


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------
def render() -> None:
    doc_names = state.document_names()
    if not doc_names:
        theme.empty_state(
            "🧠",
            "No study material yet",
            "Upload a PDF and generate a quiz from its content.",
        )
        return

    doc_name, n, difficulty, quiz_type, generate = _controls(doc_names)

    if generate:
        doc_id = state.doc_id_for_name(doc_name)
        doc = state.document(doc_id) if doc_id else None
        if doc is None:
            st.error("That document is no longer available.")
            return
        settings = state.settings()
        with st.spinner(f"Writing {n} questions on “{doc.name}”…"):
            try:
                st.session_state["quiz"] = quiz_mod.generate(
                    doc,
                    model=settings.llm_model,
                    n_questions=n,
                    difficulty=difficulty,
                    quiz_type=quiz_type,
                )
                _reset_attempt()
            except Exception as exc:  # noqa: BLE001
                st.error(f"Could not generate a quiz.\n\n`{exc}`")
                return

    quiz: Quiz | None = st.session_state.get("quiz")
    if quiz is None:
        theme.empty_state(
            "🎯",
            "Ready to test yourself",
            "Choose your options and press Generate quiz.",
        )
        return

    theme.html_block(
        f'<div style="margin:.2rem 0 .9rem">'
        f'{theme.chip("📄 " + quiz.doc_name)}'
        f'{theme.chip(f"{len(quiz)} questions")}'
        f'{theme.chip(difficulty, "info")}'
        f'{theme.chip(quiz_type)}</div>'
    )
    if st.session_state.get("quiz_submitted"):
        _render_results(quiz)
    else:
        _render_active(quiz)
