"""Replacement ordering/failure safety. All files are fake test fixtures."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import replace_latest as replacement


class ReplaceLatestTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name)
        for name in replacement.expected_binaries("0.5.8"):
            (self.directory / name).write_bytes((b"MZ" if name.endswith("exe") else b"PK") + b"fixture")
        self.release = {"id": 123, "name": "Bluey-Latest", "tag_name": "v0.5.7", "draft": False,
                        "prerelease": False, "target_commitish": "old", "assets": [{"id": 1, "name": "Bluey-0.5.7-Android.apk", "digest": "sha256:old"}]}
        self.calls = []
        self.bad_upload = False
        self.fail_patch = False
        self.refs = []

    def gh(self, *args):
        self.calls.append(args)
        if args[:2] == ("release", "upload"):
            path = Path(args[3])
            self.release["assets"].append({"id": len(self.calls) + 10, "name": path.name,
                                          "digest": "sha256:" + ("bad" if self.bad_upload else replacement.digest(path))})
        elif "matching-refs" in args[1]:
            return json.dumps(self.refs)
        elif "PATCH" in args:
            if self.fail_patch:
                raise RuntimeError("network failure")
            self.release.update(json.loads(Path(args[-1]).read_text()))
        elif "DELETE" in args:
            self.assertEqual(self.release["tag_name"], "v0.5.8")
            ident = int(args[1].split("/")[-1])
            self.release["assets"] = [a for a in self.release["assets"] if a["id"] != ident]
        return json.dumps(self.release)

    def run_replace(self):
        with patch.object(replacement, "gh", side_effect=self.gh):
            replacement.replace(self.directory, "0.5.8", 123, "v0.5.7", "tested-sha", "owner/repo", "New notes")

    def test_same_release_id_new_tag_and_seven_verified_downloads(self):
        self.run_replace()
        self.assertEqual(self.release["id"], 123)
        self.assertEqual(self.release["target_commitish"], "tested-sha")
        self.assertEqual(len([a for a in self.release["assets"] if a["name"].endswith((".exe", ".apk"))]), 7)
        self.assertFalse(any("create" in c or "--clobber" in c for c in self.calls))
        before = copy.deepcopy(self.release)
        self.run_replace()  # Retry after completed publication is safe too.
        self.assertEqual({a["name"] for a in before["assets"]}, {a["name"] for a in self.release["assets"]})

    def test_bad_upload_never_promotes_or_deletes_old_downloads(self):
        self.bad_upload = True
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            self.run_replace()
        self.assertFalse(any("DELETE" in c or "PATCH" in c for c in self.calls))
        self.assertEqual(self.release["tag_name"], "v0.5.7")

    def test_failed_promotion_keeps_old_downloads_and_retry_recovers(self):
        self.fail_patch = True
        with self.assertRaisesRegex(RuntimeError, "network failure"):
            self.run_replace()
        self.assertFalse(any("DELETE" in c for c in self.calls))
        self.fail_patch = False
        self.run_replace()
        self.assertEqual(self.release["tag_name"], "v0.5.8")

    def test_unexpected_release_or_existing_tag_refused(self):
        self.release["name"] = "Unrelated"
        with self.assertRaisesRegex(RuntimeError, "expected published"):
            self.run_replace()
        self.release["name"] = "Bluey-Latest"
        self.refs = [{"ref": "refs/tags/v0.5.8", "object": {"sha": "unrelated"}}]
        with self.assertRaisesRegex(RuntimeError, "never retag"):
            self.run_replace()
        self.assertFalse(any(c[0] == "release" for c in self.calls))

    def test_incomplete_bundle_cannot_touch_github(self):
        next(self.directory.glob("*.exe")).unlink()
        with self.assertRaisesRegex(RuntimeError, "Incomplete"):
            self.run_replace()
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
