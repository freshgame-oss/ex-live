"""Browser regression test for the box glow: a box that leaves its active state must drop it.

styleBoxes() only re-styles a box when its condition flips, so the inline box-shadow has to be
written on every flip, including the "no longer active" one. Writing it only while lighting up
leaks the glow into every later time: render.py seeks 0 -> D, so a box that ever lit up stays lit
for the rest of the video, and the same t renders differently depending on which times were
visited before - which breaks the "every visual is a pure function of t" contract.

Uses the same Chrome transport as the renderer, no third-party packages.
Run: CHROME=/path/to/chrome python3 -m unittest discover -s tests -v
"""
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import livepanel as lp

SHADOW = "document.querySelector('.box').style.boxShadow"


class GlowReplayTest(unittest.TestCase):
    # seq is a cycle with values ["a", "b"] and period 1: t=0.25 -> "a", t=1.25 -> "b"
    COLD = 0.25
    HOT = 1.25

    @classmethod
    def setUpClass(cls):
        chrome = lp.find_exe(os.environ.get("CHROME"), lp.CHROME_NAMES, "Chrome")
        cls.browser = lp.Chrome(chrome, 400, 300)
        cls.directory = tempfile.TemporaryDirectory(prefix="livepanel-glow-test-")
        config = {
            "canvas": {"width": 400, "height": 300, "duration": 4},
            "theme": {"preset": "light-pastel", "font": "Arial", "colors": {"pk": "#f0575f"}},
            "machines": {"seq": {"type": "cycle", "period": 1, "values": ["a", "b"]}},
            "elements": [{
                "type": "box", "x": 20, "y": 20, "w": 160, "h": 60,
                "when": {"var": "seq", "eq": "b"}, "then": {"glow": "pk"},
            }],
        }
        config_path = Path(cls.directory.name) / "config.json"
        config_path.write_text(json.dumps(config), encoding="utf-8")
        cls.page = Path(cls.directory.name) / "page.html"
        lp.build_page(config_path, cls.page)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.directory.cleanup()

    def fresh(self, *times):
        """Open the page again (new document) and seek only through `times`."""
        self.browser.open(self.page.as_uri() + "?manual")
        shadow = None
        for t in times:
            self.browser.seek(t)
            shadow = self.browser.eval(SHADOW)
        return shadow

    def test_glow_appears_and_is_cleared_again(self):
        lit = self.fresh(self.HOT)
        self.assertNotEqual(lit, "", "the active box has no inline glow shadow")
        self.assertEqual(self.fresh(self.HOT, self.COLD), "",
                         "the inline glow shadow survives leaving the active state")

    def test_seek_history_does_not_change_the_frame(self):
        direct = self.fresh(self.COLD)
        self.assertEqual(self.fresh(self.HOT, self.COLD), direct,
                         "the frame depends on which times were visited before")


if __name__ == "__main__":
    unittest.main()
