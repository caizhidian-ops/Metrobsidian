"""上传后候选聚合→确认→生成编排的无真实 Provider 单元测试。"""
from __future__ import annotations

import unittest
from unittest.mock import patch

from app import building_genesis


class AutoMaterializeTests(unittest.TestCase):
    def test_proposed_candidate_is_confirmed_and_built_with_stable_key(self) -> None:
        proposed = {"candidate_id": "cand-1", "state": "proposed"}
        confirmed = {"candidate_id": "cand-1", "state": "confirmed"}
        job = {"job_id": "job-1", "candidate_id": "cand-1", "state": "running", "result": {}}

        with (
            patch.object(building_genesis, "discover_candidates", return_value=[proposed]),
            patch.object(building_genesis.db, "get_candidate", return_value=proposed),
            patch.object(building_genesis, "confirm", return_value=confirmed) as confirm,
            patch.object(building_genesis, "build", return_value=job) as build,
        ):
            result = building_genesis.auto_materialize("upload-abc")

        confirm.assert_called_once_with("cand-1")
        build.assert_called_once_with("cand-1", "upload-abc:cand-1")
        self.assertEqual(result["jobs"], [job])

    def test_existing_materializing_candidate_reuses_current_job(self) -> None:
        candidate = {"candidate_id": "cand-2", "state": "materializing"}
        job = {"job_id": "job-2", "candidate_id": "cand-2", "state": "running", "result": {}}

        with (
            patch.object(building_genesis, "discover_candidates", return_value=[candidate]),
            patch.object(building_genesis.db, "get_candidate", return_value=candidate),
            patch.object(building_genesis, "_latest_job_for_candidate", return_value=job),
            patch.object(building_genesis, "build") as build,
        ):
            result = building_genesis.auto_materialize("upload-def")

        build.assert_not_called()
        self.assertEqual(result["jobs"], [job])

    def test_candidate_document_signature_is_deduplicated(self) -> None:
        candidate = {
            "candidate_id": "cand-3",
            "state": "confirmed",
            "representative_document_ids": ["doc-b", "doc-a", "doc-c"],
        }
        with patch.object(building_genesis.db, "list_candidates", return_value=[candidate]):
            found = building_genesis._candidate_for_documents(["doc-c", "doc-a", "doc-b"])
        self.assertEqual(found, candidate)

    def test_uploaded_known_documents_form_a_category_candidate(self) -> None:
        document = {"id": "doc-home", "title": "家庭日记", "summary": "家庭与日常生活"}
        placement = {"document_id": "doc-home", "primary_building_id": "home"}
        building = {"id": "home", "name": "家庭"}
        stored = []
        with (
            patch.object(building_genesis.db, "get_document", return_value=document),
            patch.object(building_genesis.db, "get_placement_by_document", return_value=placement),
            patch.object(building_genesis.db, "get_building", return_value=building),
            patch.object(building_genesis.db, "list_candidates", return_value=[]),
            patch.object(building_genesis.db, "upsert_candidate", side_effect=stored.append),
            patch.object(building_genesis.db, "upsert_topic"),
        ):
            candidates = building_genesis._upload_candidates(["doc-home"])
        self.assertEqual(candidates[0]["nearest_building_ids"], ["home"])
        self.assertEqual(candidates[0]["proposed_name"], "家庭记忆馆")
        self.assertEqual(stored[0]["classifier_version"], "upload-category-v1")


if __name__ == "__main__":
    unittest.main()
