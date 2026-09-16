#!/usr/bin/env python3
"""Exercise continuity failures using disposable Git repositories and synthetic reviews."""
import copy
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
import project_workflow as workflow


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="spatialseed-workflow-")
        self.addCleanup(self.temp.cleanup)
        self.outside = Path(self.temp.name)
        self.root = self.outside / "repo"
        self.root.mkdir()
        self.original_root = workflow.ROOT
        root_patch = patch.object(workflow, "ROOT", self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)
        self.git("init", "-q")
        self.git("config", "user.name", "Synthetic workflow test")
        self.git("config", "user.email", "test@example.invalid")
        self.git("config", "commit.gpgsign", "false")
        self.put("apps/web/build-info.json", '{"revision":"fixture"}')
        self.put("source.js", "// fixture\n")
        item = {"id": "M0", "title": "Fixture", "status": "planned", "dependsOn": [],
                "outcome": "Synthetic outcome", "slices": ["Slice"], "acceptance": ["Criterion"],
                "sources": ["source.js"], "scope": ["source.js"],
                "checks": [{"id": "automatic", "kind": "automatic", "label": "Gates"},
                           {"id": "mobile", "kind": "human", "label": "Touch"}]}
        second = copy.deepcopy(item)
        second.update(id="M1", dependsOn=["M0"])
        self.plan = {"schemaVersion": 1, "milestones": [item, second], "deferred": []}
        self.save_plan()
        self.put(str(workflow.TEMPLATE), "seed\n")
        self.put("PROJECT_SEED.md", "seed\n")
        self.put(str(workflow.ROADMAP), workflow.render(self.plan))
        self.commit()
        self.review = self.outside / "review.json"

    def put(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root, text=True, stderr=subprocess.PIPE).strip()

    def commit(self):
        self.git("add", ".")
        self.git("-c", "core.hooksPath=/dev/null", "commit", "-qm", "Synthetic fixture")

    def save_plan(self):
        self.put(str(workflow.PLAN), json.dumps(self.plan))

    def init(self):
        return workflow.create_review(self.review, self.plan["milestones"][0], [], self.plan)

    def automatic(self, record, code=0, timeout=False):
        # Only fixture gates are mocked. No actual milestone is approved by tests.
        candidate = record["subject"]
        result = subprocess.CompletedProcess([], code, stdout="synthetic fixture", stderr="")
        with patch.object(workflow, "subject", return_value=candidate), patch.object(
                workflow.subprocess, "run", return_value=result,
                side_effect=subprocess.TimeoutExpired("fixture", 120) if timeout else None):
            workflow.run_automatic(self.review, record)

    def accept_fixture(self):
        record = self.init()
        self.automatic(record)
        evidence = self.outside / "observation.txt"
        evidence.write_text("Synthetic observation. Not product validation.\n")
        record["checks"]["mobile"] = {"result": "passed", "reviewer": "Synthetic test",
                                      "environment": "Fixture", "note": "Synthetic",
                                      "evidence": [workflow.file_record(evidence)]}
        record["human"] = {"decision": "accept", "reviewer": "Synthetic test", "note": "Fixture only"}
        workflow.write_json(self.review, record)
        return record

    def test_plan_rejects_missing_cyclic_and_duplicate_dependencies(self):
        for deps in (["missing"], ["M1"], ["M0"]):
            with self.subTest(deps=deps):
                self.plan["milestones"][0]["dependsOn"] = deps
                self.save_plan()
                with self.assertRaises(ValueError):
                    workflow.load_plan()
        self.plan["milestones"][0]["dependsOn"] = []
        self.plan["milestones"][1]["id"] = "M0"
        self.save_plan()
        with self.assertRaises(ValueError):
            workflow.load_plan()

    def test_plan_rejects_missing_sources_and_human_checks(self):
        item = self.plan["milestones"][0]
        item["sources"] = ["missing.js"]
        self.save_plan()
        with self.assertRaises(ValueError):
            workflow.load_plan()
        item["sources"] = ["source.js"]
        item["checks"] = item["checks"][:1]
        self.save_plan()
        with self.assertRaises(ValueError):
            workflow.load_plan()

    def test_generated_drift_is_rejected(self):
        workflow.check_generated(workflow.load_plan())
        self.put(str(workflow.ROADMAP), "edited projection")
        with self.assertRaisesRegex(ValueError, "Roadmap"):
            workflow.check_generated(self.plan)
        self.put(str(workflow.ROADMAP), workflow.render(self.plan))
        self.put("PROJECT_SEED.md", "stale seed")
        with self.assertRaisesRegex(ValueError, "Seed"):
            workflow.check_generated(self.plan)

    def test_seed_generator_uses_its_checkout_from_another_cwd(self):
        script = self.root / "tools/make-project-seed.sh"
        script.parent.mkdir()
        shutil.copyfile(self.original_root / "tools/make-project-seed.sh", script)
        self.put("PROJECT_SEED.md", "stale")
        environment = {k: v for k, v in os.environ.items() if k != "SPATIALSEED_PROJECT"}
        subprocess.run(["bash", str(script)], cwd=self.outside, env=environment, check=True, capture_output=True)
        self.assertEqual((self.root / "PROJECT_SEED.md").read_text(), "seed\n")
        subprocess.run(["bash", str(script), "--check"], cwd=self.outside, env=environment, check=True, capture_output=True)

    def test_new_review_does_not_self_accept(self):
        record = self.init()
        self.assertEqual(record["human"]["decision"], "pending")
        self.assertTrue(all(c["result"] == "pending" for c in record["checks"].values()))
        self.automatic(record)
        with self.assertRaisesRegex(ValueError, "pendente"):
            workflow.validate_review(self.review, self.plan, ready=True)

    def test_review_cannot_overwrite_or_pollute_checkout(self):
        self.init()
        with self.assertRaisesRegex(ValueError, "já existe"):
            self.init()
        with self.assertRaisesRegex(ValueError, "fora do checkout"):
            workflow.create_review(self.root / "review.json", self.plan["milestones"][0], [], self.plan)

    def test_evidenced_acceptance_and_status_only_change(self):
        self.accept_fixture()
        self.plan["milestones"][0]["status"] = "accepted"
        workflow.validate_review(self.review, self.plan, ready=True)
        self.plan["milestones"][0]["acceptance"].append("New requirement")
        with self.assertRaisesRegex(ValueError, "Contrato"):
            workflow.validate_review(self.review, self.plan, ready=True)

    def test_changed_evidence_is_rejected(self):
        self.accept_fixture()
        (self.outside / "observation.txt").write_text("Changed")
        with self.assertRaisesRegex(ValueError, "Evidência alterada"):
            workflow.validate_review(self.review, self.plan, ready=True)

    def test_dirty_and_new_candidate_invalidate_review(self):
        self.accept_fixture()
        self.put("source.js", "// new candidate\n")
        with self.assertRaisesRegex(ValueError, "mudanças locais"):
            workflow.validate_review(self.review, self.plan, ready=True)
        self.commit()
        with self.assertRaisesRegex(ValueError, "Candidato mudou"):
            workflow.validate_review(self.review, self.plan, ready=True)

    def test_dependencies_need_accepted_ancestor(self):
        item = self.plan["milestones"][1]
        destination = self.outside / "next.json"
        with self.assertRaisesRegex(ValueError, "dependências"):
            workflow.create_review(destination, item, [], self.plan)
        self.accept_fixture()
        self.put("source.js", "// descendant\n")
        self.commit()
        workflow.create_review(destination, item, [self.review], self.plan)
        workflow.validate_review(destination, self.plan)
        self.git("checkout", "--orphan", "unrelated")
        self.commit()
        with self.assertRaises(subprocess.CalledProcessError):
            workflow.create_review(self.outside / "unrelated.json", item, [self.review], self.plan)

    def test_incomplete_or_wrong_candidate_automatic_report_is_rejected(self):
        record = self.accept_fixture()
        entry = record["checks"]["automatic"]["evidence"][0]
        report_path = Path(entry["path"])
        original = json.loads(report_path.read_text())
        for change in ("incomplete", "candidate"):
            report = copy.deepcopy(original)
            if change == "incomplete":
                report["results"].pop()
            else:
                report["subject"]["tree"] = "0" * 40
            workflow.write_json(report_path, report)
            record["checks"]["automatic"]["evidence"] = [workflow.file_record(report_path)]
            workflow.write_json(self.review, record)
            with self.assertRaises(ValueError):
                workflow.validate_review(self.review, self.plan, ready=True)

    def test_rerun_failure_and_timeout_revoke_acceptance(self):
        record = self.accept_fixture()
        for timeout in (False, True):
            self.automatic(record, code=1, timeout=timeout)
            self.assertEqual(record["human"]["decision"], "pending")
            self.assertEqual(record["checks"]["automatic"]["result"], "failed")
            workflow.validate_review(self.review, self.plan)
            with self.assertRaises(ValueError):
                workflow.validate_review(self.review, self.plan, ready=True)


if __name__ == "__main__":
    unittest.main()
