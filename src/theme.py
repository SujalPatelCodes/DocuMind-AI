"""Theme injection and small reusable UI primitives.

Everything here is presentation-only: no retrieval or model logic lives in
this module so the visual layer stays easy to restyle.
"""

from __future__ import annotations

import html
from typing import Iterable

import streamlit as st

from src import config


# --------------------------------------------------------------------------
# Stylesheet
# --------------------------------------------------------------------------
def inject_css() -> None:
    """Load ``assets/styles.css`` into the page (once per rerun)."""
    try:
        css = config.STYLES_PATH.read_text(encoding="utf-8")
    except FileNotFoundError:  # pragma: no cover - defensive
        return
    st.markdown(f"<style>{css}</style>", unsafe_allow_html=True)


# --------------------------------------------------------------------------
# Tiny HTML helpers
# --------------------------------------------------------------------------
def esc(value: object) -> str:
    """HTML-escape untrusted text (document names, extracted PDF text)."""
    return html.escape(str(value))


def html_block(markup: str) -> None:
    st.markdown(markup, unsafe_allow_html=True)


def hero(eyebrow: str, title: str, subtitle: str, highlight: str = "") -> None:
    """Large gradient hero banner used at the top of the app."""
    pretty = esc(title)
    if highlight and highlight in title:
        pretty = pretty.replace(esc(highlight), f"<em>{esc(highlight)}</em>", 1)
    html_block(
        f"""
        <div class="dm-hero">
          <span class="dm-hero__eyebrow">✦ {esc(eyebrow)}</span>
          <h1 class="dm-hero__title">{pretty}</h1>
          <p class="dm-hero__sub">{esc(subtitle)}</p>
        </div>
        """
    )


def stat_cards(items: Iterable[tuple[str, str]]) -> None:
    """Render a responsive row of metric cards from ``(value, label)`` pairs."""
    cells = "".join(
        f'<div class="dm-stat"><div class="dm-stat__value">{esc(v)}</div>'
        f'<div class="dm-stat__label">{esc(l)}</div></div>'
        for v, l in items
    )
    html_block(f'<div class="dm-stats">{cells}</div>')


def chip(text: str, variant: str = "") -> str:
    """Return the markup for an inline status chip (as a string)."""
    modifier = f" dm-chip--{variant}" if variant else ""
    return f'<span class="dm-chip{modifier}">{esc(text)}</span>'


def card(title: str, body_html: str, variant: str = "") -> None:
    modifier = f" dm-card--{variant}" if variant else ""
    html_block(
        f'<div class="dm-card{modifier}">'
        f'<div class="dm-card__title">{esc(title)}</div>{body_html}</div>'
    )


def empty_state(icon: str, title: str, subtitle: str) -> None:
    html_block(
        f'<div class="dm-empty"><div class="dm-empty__icon">{esc(icon)}</div>'
        f'<div class="dm-empty__title">{esc(title)}</div>'
        f'<p class="dm-empty__sub">{esc(subtitle)}</p></div>'
    )


def section_label(text: str) -> None:
    st.markdown(f'<div class="dm-section-label">{esc(text)}</div>', unsafe_allow_html=True)
