from __future__ import annotations

import unittest

from app.classifier import classify


class KeywordMockClassifierTest(unittest.TestCase):
    def test_places_home_notes_by_visible_keywords(self) -> None:
        placement = classify("doc-home", "家庭搬家清单，记录家人的日常生活安排")

        self.assertEqual(placement["primary_building_id"], "home")
        self.assertEqual(placement["model_version"], "keyword-mock-v1")
        self.assertIn("家庭", placement["reason"])

    def test_unmatched_text_stays_in_novelty_inbox(self) -> None:
        placement = classify("doc-novel", "quasar nebula spectroscopy")

        self.assertIsNone(placement["primary_building_id"])
        self.assertEqual(placement["state"], "needs_review")

    def test_places_art_history_in_museum(self) -> None:
        placement = classify(
            "doc-art-history",
            """艺术发展的脉络：从膜拜神明到凝视都市。古希腊确立古典美，
            古罗马留下写实雕塑与宏大建筑，文艺复兴推动绘画和艺术观念转向。""",
        )

        self.assertEqual(placement["primary_building_id"], "museum")
        self.assertIn("美术馆", placement["reason"])

    def test_art_keyword_takes_priority_over_many_home_keywords(self) -> None:
        placement = classify(
            "doc-art-and-life",
            "这是我的家庭生活日常，记录家人、搬家、居住、关系、成长和亲子，也讲艺术的发展。",
        )

        self.assertEqual(placement["primary_building_id"], "museum")


if __name__ == "__main__":
    unittest.main()
