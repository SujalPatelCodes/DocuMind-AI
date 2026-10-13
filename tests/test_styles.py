"""Guards on the custom stylesheet.

These exist because of a real bug: hiding ``[data-testid="stToolbar"]`` also hid
``stExpandSidebarButton``, leaving no way to reopen a collapsed sidebar. The
toolbar must stay visible; only the individual chrome controls are hidden.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

STYLES = ROOT / "assets" / "styles.css"

# Matches a rule that sets display:none on the given test id, tolerating
# whitespace/newlines between the selector and the declaration.
_HIDE = r'\[data-testid="{tid}"\]\s*\{{[^}}]*display:\s*none'


class StylesheetTest(unittest.TestCase):
    def setUp(self) -> None:
        self.css = STYLES.read_text(encoding="utf-8")

    def assert_hidden(self, testid: str) -> None:
        pattern = _HIDE.format(tid=re.escape(testid))
        self.assertRegex(self.css, pattern, f"{testid} should be hidden")

    def assert_not_hidden(self, testid: str) -> None:
        pattern = _HIDE.format(tid=re.escape(testid))
        self.assertIsNone(
            re.search(pattern, self.css),
            f"{testid} must stay visible — hiding it breaks the UI",
        )

    # -- the regression ----------------------------------------------------
    def test_toolbar_is_never_hidden(self) -> None:
        # stToolbar contains stExpandSidebarButton, the only way back from a
        # collapsed sidebar.
        self.assert_not_hidden("stToolbar")

    def test_expand_sidebar_button_is_never_hidden(self) -> None:
        self.assert_not_hidden("stExpandSidebarButton")

    def test_sidebar_itself_is_never_hidden(self) -> None:
        self.assert_not_hidden("stSidebar")

    def test_header_is_never_hidden(self) -> None:
        # The header hosts the sidebar expand button, so it must stay in the
        # layout — it just should not be painted.
        self.assert_not_hidden("stHeader")

    # -- the black navbar regression ---------------------------------------
    def test_header_is_transparent(self) -> None:
        # Streamlit paints the header with the theme's solid background colour,
        # which shows up as a black band across the top of the gradient.
        self.assertRegex(
            self.css,
            r'\[data-testid="stHeader"\]\s*\{[^}]*background:\s*transparent',
            "the header must be transparent so the page gradient shows through",
        )

    # -- tabs (React Aria, not BaseWeb) ------------------------------------
    def test_tabs_use_the_react_aria_selectors(self) -> None:
        # This Streamlit version renders tabs with React Aria. The old BaseWeb
        # selectors silently matched nothing, so the selected tab rendered as an
        # un-rounded block on the gradient. Guard both directions.
        self.assertIn('[data-testid="stTab"]', self.css)
        self.assertNotIn('data-baseweb="tab', self.css)

    def test_selected_tab_is_styled(self) -> None:
        # The selected tab should read as a filled pill using the site's primary
        # gradient, matching the buttons.
        self.assertRegex(
            self.css,
            r'\[data-testid="stTab"\]\[aria-selected="true"\]\s*\{[^}]*'
            r"background:\s*linear-gradient",
            "the selected tab should use the site's primary gradient",
        )

    # -- intended chrome ---------------------------------------------------
    def test_deploy_button_is_hidden(self) -> None:
        self.assert_hidden("stAppDeployButton")

    def test_main_menu_is_hidden(self) -> None:
        self.assert_hidden("stMainMenu")

    def test_stylesheet_is_loadable_and_non_trivial(self) -> None:
        self.assertGreater(len(self.css), 1000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
