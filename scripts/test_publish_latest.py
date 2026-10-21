"""Release validation fixtures, not usable application binaries."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("publish_latest", Path(__file__).with_name("publish_latest.py"))
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class ReleaseValidationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        for name in release.expected_binaries("0.5.7"):
            (self.path / name).write_bytes((b"MZ" if name.endswith(".exe") else b"PK") + b"unit-test fixture only")

    def test_all_seven_exact_version_names_and_hashes(self):
        hashes = release.validate_downloads(self.path, "0.5.7")
        self.assertEqual(len(hashes), 7)
        self.assertTrue(all(len(h) == 64 for h in hashes.values()))

    def test_missing_home_installer_blocks_release(self):
        (self.path / "Bluey-Home-0.5.7-Windows-x64-Setup.exe").unlink()
        with self.assertRaisesRegex(RuntimeError, "Incomplete release"):
            release.validate_downloads(self.path, "0.5.7")

    def test_stale_version_blocks_release(self):
        (self.path / "Bluey-Kids-0.5.6-Android.apk").write_bytes(b"PKfixture")
        with self.assertRaisesRegex(RuntimeError, "unexpected"):
            release.validate_downloads(self.path, "0.5.7")

    def test_error_page_instead_of_binary_blocks_release(self):
        (self.path / "Bluey-0.5.7-Android.apk").write_text("<html>Not found</html>")
        with self.assertRaisesRegex(RuntimeError, "Invalid binary"):
            release.validate_downloads(self.path, "0.5.7")

    def test_remote_checksums_required(self):
        hashes = release.validate_downloads(self.path, "0.5.7")
        data = {"assets": [{"name": n, "digest": "sha256:" + h} for n, h in hashes.items()]}
        release.verify_uploaded(data, hashes)
        data["assets"][0]["digest"] = "sha256:incorrect"
        with self.assertRaisesRegex(RuntimeError, "checksum mismatch"):
            release.verify_uploaded(data, hashes)
        data["assets"].pop()
        with self.assertRaisesRegex(RuntimeError, "missing or unexpected"):
            release.verify_uploaded(data, hashes)


if __name__ == "__main__":
    unittest.main()
