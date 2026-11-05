import unittest

from verify_go import checksum


class ChecksumTest(unittest.TestCase):
    def setUp(self):
        self.digest = "a" * 64
        self.downloads = [
            {
                "version": "go1.25.7",
                "files": [
                    {
                        "filename": "go1.25.7.linux-arm64.tar.gz",
                        "os": "linux",
                        "arch": "arm64",
                        "kind": "archive",
                        "sha256": self.digest,
                    }
                ],
            }
        ]

    def test_selects_exact_linux_archive(self):
        self.assertEqual(checksum(self.downloads, "1.25.7", "arm64"), self.digest)

    def test_rejects_other_architecture(self):
        with self.assertRaisesRegex(ValueError, "missing or invalid checksum"):
            checksum(self.downloads, "1.25.7", "amd64")

    def test_rejects_duplicate_or_malformed_checksums(self):
        self.downloads[0]["files"].append(self.downloads[0]["files"][0].copy())
        with self.assertRaisesRegex(ValueError, "missing or invalid checksum"):
            checksum(self.downloads, "1.25.7", "arm64")
        self.downloads[0]["files"].pop()
        self.downloads[0]["files"][0]["sha256"] = "not-a-sha256"
        with self.assertRaisesRegex(ValueError, "missing or invalid checksum"):
            checksum(self.downloads, "1.25.7", "arm64")


if __name__ == "__main__":
    unittest.main()
