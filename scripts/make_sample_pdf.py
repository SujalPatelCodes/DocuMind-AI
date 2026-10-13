"""Create a small multi-page PDF for manual testing.

Run:  python scripts/make_sample_pdf.py [output_path]
"""

from __future__ import annotations

import sys
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent

PAGES = [
    (
        "Photosynthesis: An Overview",
        "Photosynthesis is the process by which green plants, algae and some "
        "bacteria convert light energy into chemical energy stored in glucose. "
        "It takes place inside the chloroplasts of plant cells, where the "
        "pigment chlorophyll absorbs light most strongly in the blue and red "
        "regions of the visible spectrum.\n\n"
        "The overall balanced equation is:\n"
        "6 CO2 + 6 H2O + light -> C6H12O6 + 6 O2",
    ),
    (
        "The Light-Dependent Reactions",
        "The light-dependent reactions occur in the thylakoid membrane of the "
        "chloroplast. Photosystem II splits water molecules, releasing oxygen "
        "as a by-product and supplying electrons to the transport chain.\n\n"
        "As electrons move down the chain, proton gradients drive ATP synthase "
        "to produce ATP. Photosystem I reduces NADP+ to NADPH. The ATP and "
        "NADPH produced here are consumed by the Calvin cycle.",
    ),
    (
        "The Calvin Cycle",
        "The Calvin cycle takes place in the stroma of the chloroplast and does "
        "not require light directly. It fixes carbon dioxide into an organic "
        "molecule using the enzyme RuBisCO, the most abundant protein on Earth.\n\n"
        "Each turn of the cycle consumes three ATP and two NADPH, and three "
        "turns are required to produce one molecule of glyceraldehyde-3-phosphate "
        "and ultimately glucose.",
    ),
    (
        "Limitations and Open Questions",
        "The efficiency of photosynthesis is limited by several factors: light "
        "intensity, carbon dioxide concentration and temperature. Photorespiration "
        "in C3 plants can waste up to a quarter of the fixed carbon.\n\n"
        "This review does not address C4 and CAM adaptations, which reduce "
        "photorespiration in hot, dry environments. Quantitative modelling of "
        "the light reactions is left for future work.",
    ),
]


def build(path: Path) -> Path:
    doc = pymupdf.open()
    for heading, body in PAGES:
        page = doc.new_page()
        page.insert_text((56, 70), heading, fontsize=17, fontname="hebo")
        page.insert_textbox(
            pymupdf.Rect(56, 100, 539, 760),
            body,
            fontsize=11.5,
            lineheight=1.5,
        )
    path.parent.mkdir(parents=True, exist_ok=True)
    doc.save(str(path))
    doc.close()
    return path


if __name__ == "__main__":
    target = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "samples" / "photosynthesis.pdf"
    print(f"Wrote {build(target)} ({len(PAGES)} pages)")
