"""Collapsed-sidebar navigation rail.

When the Streamlit sidebar is collapsed it leaves only a small expand button.
This module replaces that collapsed chrome with the 56 px black navigation
rail: a fixed column of Lucide-style line icons pinned to the left edge of the
viewport.

How the rail drives the app
---------------------------
* **Tab views** (Conversations / Code & tools / Document utilities): the rail
  script clicks the matching ``[data-testid="stTab"]`` element directly — the
  same native interaction a user would perform — so the switch needs no page
  reload. The tabs are stateful (``key="active_tab"``, ``on_change="rerun"``),
  so ``app.py`` keeps ``active_nav`` in sync and re-renders the highlight.

* **Expand actions** (logo / upload documents / settings): the script dispatches
  a full pointer/click sequence on Streamlit's native
  ``stExpandSidebarButton``, with a ``localStorage`` + reload fallback, so the
  "collapsed and cannot reopen" bug can never silently come back.

* **Feedback items** (help / profile / logout): these navigate to a one-shot
  ``?uiview=`` query parameter; ``consume_nav()`` reads it once and discards
  it, and ``app.py`` shows a toast (logout also clears the conversation).
```

from __future__ import annotations

import streamlit as st

from src import theme

# --------------------------------------------------------------------------
# Icons (Lucide-style, 24 px grid, rendered at 20 px)
# --------------------------------------------------------------------------
_SVG = (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" '
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" '
    'aria-hidden="true">{body}</svg>'
)

_ICONS: dict[str, str] = {
    "conversations": _SVG.format(
        body='<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>'
    ),
    "code": _SVG.format(
        body='<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>'
    ),
    "uploads": _SVG.format(
        body='<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 '
        "2.5 8.242\"/><path d=\"M12 12v9\"/><path d=\"m16 16-4-4-4 4\"/>"
    ),
    "utilities": _SVG.format(
        body="<line x1=\"21\" x2=\"14\" y1=\"4\" y2=\"4\"/>"
        "<line x1=\"10\" x2=\"3\" y1=\"4\" y2=\"4\"/>"
        "<line x1=\"21\" x2=\"12\" y1=\"12\" y2=\"12\"/>"
        "<line x1=\"8\" x2=\"3\" y1=\"12\" y2=\"12\"/>"
        "<line x1=\"21\" x2=\"16\" y1=\"20\" y2=\"20\"/>"
        "<line x1=\"12\" x2=\"3\" y1=\"20\" y2=\"20\"/>"
        '<line x1="14" x2="14" y1="2" y2="6"/>'
        '<line x1="8" x2="8" y1="10" y2="14"/>'
        '<line x1="16" x2="16" y1="18" y2="22"/>'
    ),
    "help": _SVG.format(
        body='<circle cx="12" cy="12" r="10"/>'
        '<path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>'
        '<path d="M12 17h.01"/>'
    ),
    "settings": _SVG.format(
        body='<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 '
        "1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38"
        "a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74"
        "l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08"
        "a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44"
        "a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0"
        "l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08"
        "a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0"
        ".73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0"
        "l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z\"/>"
        '<circle cx="12" cy="12" r="3"/>'
    ),
    "profile": _SVG.format(
        body='<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>'
        '<circle cx="12" cy="7" r="4"/>'
    ),
    "logout": _SVG.format(
        body='<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>'
        '<polyline points="16 17 21 12 16 7"/>'
        '<line x1="21" x2="9" y1="12" y2="12"/>'
    ),
}

# --------------------------------------------------------------------------
# Navigation model
# --------------------------------------------------------------------------
# Rail item kinds:
#   "tab"    — switches the main view (rail script clicks the matching tab).
#   "expand" — reopens the real sidebar.
#   "toast"  — lightweight feedback only (help / profile / logout).
_NAV: tuple[tuple[str, str, str], ...] = (
    ("conversations", "Conversations", "tab"),
    ("code", "Code & tools", "tab"),
    ("uploads", "Upload documents", "expand"),
    ("utilities", "Document utilities", "tab"),
    ("help", "Help", "toast"),
    ("settings", "Settings", "expand"),
    ("profile", "User profile", "toast"),
    ("logout", "Log out", "toast"),
)

_TOP_GROUP = 4  # items above the vertical spacer

#: Maps rail "tab" items to the st.tabs label they activate.
VIEW_LABELS: dict[str, str] = {
    "conversations": "💬 Chat",
    "utilities": "📝 Summarise",
    "code": "🧠 Quiz me",
}
REVERSE_LABELS: dict[str, str] = {v: k for k, v in VIEW_LABELS.items()}
VIEW_KEYS: frozenset[str] = frozenset(VIEW_LABELS)

#: Index of each rail "tab" view within ``st.tabs([...])``.
_TAB_INDEX: dict[str, int] = {
    "conversations": 0,
    "utilities": 1,
    "code": 2,
}


def nav_for_tab(tab_label: str | None) -> str | None:
    """Rail key for a tab label (so manual tab clicks stay in sync)."""
    return REVERSE_LABELS.get(tab_label or "")  # type: ignore[arg-type]


def consume_nav() -> str | None:
    """Read and discard the ``uiview`` query parameter, if present."""
    params = st.query_params
    if "uiview" not in params:
        return None
    value = str(params["uiview"])
    try:
        params.pop("uiview")
    except Exception:  # pragma: no cover - the proxy can be strict
        pass
    keys = {key for key, _label, _kind in _NAV}
    return value if value in keys else None


# --------------------------------------------------------------------------
# Markup
# --------------------------------------------------------------------------
def _item(key: str, label: str, kind: str, active: str, badge: str = "") -> str:
    cls = " dm-rail__item--active" if key == active else ""
    extra = ""
    if kind == "tab":
        extra = f' data-tab="{_TAB_INDEX[key]}"'
    elif kind == "expand":
        extra = ' data-expand="1"'
    badge_html = (
        f'<span class="dm-rail__badge">{theme.esc(badge)}</span>' if badge else ""
    )
    return (
        f'<a class="dm-rail__item{cls}" href="?uiview={key}"{extra} '
        f'data-label="{theme.esc(label)}" title="{theme.esc(label)}">'
        f"{_ICONS[key]}{badge_html}</a>"
    )


_LOGOS = (
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>'
)

_SCRIPT = """<script>
(function () {
  function fire(el) {
    if (!el) return;
    var o = { bubbles: true, cancelable: true, composed: true,
              view: window, button: 0, buttons: 1 };
    try { el.dispatchEvent(new PointerEvent('pointerdown', o)); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('mousedown', o)); } catch (e) {}
    try { el.dispatchEvent(new PointerEvent('pointerup',
          Object.assign({}, o, { buttons: 0 }))); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('mouseup',
          Object.assign({}, o, { buttons: 0 }))); } catch (e) {}
    try { el.dispatchEvent(new MouseEvent('click',
          Object.assign({}, o, { buttons: 0 }))); } catch (e) {}
  }
  document.addEventListener('click', function (e) {
    var t = e.target;
    var el = t && t.closest ? t.closest('[data-expand], [data-tab]') : null;
    if (!el) return;
    e.preventDefault();
    if (el.hasAttribute('data-tab')) {
      var idx = parseInt(el.getAttribute('data-tab'), 10);
      var tabs = document.querySelectorAll('[data-testid="stTab"]');
      if (tabs[idx]) fire(tabs[idx]);
      return;
    }
    var btn = document.querySelector('[data-testid="stExpandSidebarButton"]');
    if (!btn) return;
    fire(btn);
    setTimeout(function () {
      var sb = document.querySelector('[data-testid="stSidebar"]');
      if (!sb || sb.getAttribute('aria-expanded') === 'false') {
        try {
          Object.keys(localStorage).forEach(function (k) {
            if (k.indexOf('stSidebarCollapsed') === 0) {
              localStorage.setItem(k, 'false');
            }
          });
        } catch (err) {}
        window.location.reload();
      }
    }, 400);
  });
})();
</script>
"""


def render(active: str = "conversations", upload_count: int = 0) -> None:
    """Render the rail. ``active`` is the highlighted rail key."""
    badge = ""
    if upload_count:
        badge = "9+" if upload_count > 9 else str(upload_count)

    top = "".join(
        _item(key, label, kind, active, badge if key == "uploads" else "")
        for key, label, kind in _NAV[:_TOP_GROUP]
    )
    bottom = "".join(
        _item(key, label, kind, active)
        for key, label, kind in _NAV[_TOP_GROUP:]
    )

    markup = (
        f'<aside id="dm-rail" role="navigation" aria-label="Primary navigation">'
        f'<button class="dm-rail__logo" type="button" data-expand="1" '
        f'title="Expand sidebar" aria-label="Expand sidebar">{_LOGOS}</button>'
        f'<div class="dm-rail__nav">'
        f'<div class="dm-rail__group">{top}</div>'
        f'<div class="dm-rail__group">{bottom}</div>'
        f'</div></aside>'
        f"{_SCRIPT}"
    )
    theme.html_block(markup)