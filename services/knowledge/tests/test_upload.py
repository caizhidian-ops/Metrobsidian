from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app import ingest


class UploadIngestionTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.upload_root = Path(self.temp_dir.name)
        self.document = None
        self.placement = None

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _capture_document(self, document: dict) -> None:
        self.document = document

    def _capture_placement(self, placement: dict) -> None:
        self.placement = placement

    def _classify(self, document_id: str, _text: str) -> dict:
        return {
            "id": "placement-test",
            "document_id": document_id,
            "primary_building_id": "company",
            "secondary_building_ids": [],
            "topic_ids": [],
            "confidence": 0.81,
            "margin": 0.19,
            "reason": "测试分类",
            "evidence_chunk_ids": [],
            "state": "proposed",
            "model_version": "test",
            "confirmed_by": None,
            "confirmed_at": None,
        }

    def _ingest(self, filename: str, data: bytes, content_type: str) -> dict:
        with (
            patch.object(ingest, "ensure_buildings_seeded"),
            patch.object(ingest.db, "get_document_by_sha256", return_value=None),
            patch.object(ingest.db, "upsert_document", side_effect=self._capture_document),
            patch.object(ingest.db, "upsert_placement", side_effect=self._capture_placement),
            patch.object(ingest, "classify", side_effect=self._classify),
        ):
            return ingest.ingest_uploaded_file(
                filename=filename,
                data=data,
                content_type=content_type,
                upload_root=self.upload_root,
            )

    def test_arbitrary_binary_is_archived_and_classified_without_execution(self) -> None:
        result = self._ingest("../../危险程序.exe", b"MZ\x00\x01not-executed", "application/octet-stream")

        self.assertEqual(result["status"], "placed")
        self.assertEqual(result["building_id"], "company")
        self.assertEqual(result["parse_status"], "unsupported")
        self.assertEqual(self.placement["state"], "confirmed")
        self.assertEqual(self.placement["confirmed_by"], "rule")
        stored_path = Path(self.document["source_path"])
        # macOS exposes /var through /private/var; compare canonical paths so
        # the assertion still proves the upload cannot escape its root.
        self.assertEqual(stored_path.parent.resolve(), self.upload_root.resolve())
        self.assertNotIn("..", stored_path.name)
        self.assertEqual(stored_path.read_bytes(), b"MZ\x00\x01not-executed")
        self.assertIn("危险程序.exe", self.document["text"])

    def test_text_file_content_is_extracted_before_classification(self) -> None:
        result = self._ingest(
            "project-notes.md",
            "# 产品复盘\n\n这是一个足够长的项目复盘，包含用户需求、关键决策和后续行动。".encode(),
            "text/markdown",
        )

        self.assertEqual(result["parse_status"], "ready")
        self.assertIn("项目复盘", self.document["text"])
        self.assertEqual(self.document["mime_type"], "text/markdown")

    def test_keyword_category_is_used_for_immediate_placement_even_in_review_margin(self) -> None:
        original = self._classify

        def classify_keyword(document_id: str, text: str) -> dict:
            placement = original(document_id, text)
            placement["state"] = "needs_review"
            placement["confidence"] = 0.58
            placement["margin"] = 0.03
            return placement

        self._classify = classify_keyword
        try:
            result = self._ingest("ambiguous.txt", b"work project notes with mixed learning references and decisions", "text/plain")
        finally:
            self._classify = original

        self.assertEqual(result["status"], "placed")
        self.assertEqual(self.placement["state"], "confirmed")

    def test_duplicate_pending_document_is_confirmed_into_its_keyword_category(self) -> None:
        existing = {
            "id": "doc-existing", "title": "Existing", "mime_type": "text/plain",
            "parse_status": "ready", "summary": "", "text": "艺术发展与家庭生活",
        }
        pending = self._classify("doc-existing", [0.1])
        pending["state"] = "needs_review"
        with (
            patch.object(ingest.db, "get_document_by_sha256", return_value=existing),
            patch.object(ingest.db, "get_placement_by_document", return_value=pending),
            patch.object(ingest, "classify", return_value=pending) as classify_mock,
            patch.object(ingest.db, "upsert_placement", side_effect=self._capture_placement),
        ):
            result = ingest.ingest_uploaded_file("duplicate.txt", b"same bytes", "text/plain", self.upload_root)

        self.assertEqual(result["status"], "duplicate")
        self.assertEqual(self.placement["state"], "confirmed")
        self.assertEqual(self.placement["confirmed_by"], "rule")
        classify_mock.assert_called_once()
        self.assertIn("艺术发展", classify_mock.call_args.args[1])


if __name__ == "__main__":
    unittest.main()
