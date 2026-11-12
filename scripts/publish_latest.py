"""Publish an all-or-nothing, immutable seven-download release after native CI gates."""
import hashlib
import json
import os
from pathlib import Path
import subprocess


def expected_binaries(version):
    return {
        f"Bluey-{version}-Windows-x64-Setup.exe",
        f"Bluey-{version}-Windows-x64-Portable.exe",
        f"Bluey-{version}-Android.apk",
        *{f"Bluey-{name}-{version}-{platform}" for name in ("Home", "Kids")
          for platform in ("Windows-x64-Setup.exe", "Android.apk")},
    }


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def validate_downloads(directory, version):
    expected = expected_binaries(version)
    actual = {p.name for p in directory.iterdir() if p.suffix.lower() in {".exe", ".apk"}}
    if actual != expected:
        raise RuntimeError(f"Incomplete release: missing={sorted(expected-actual)}, unexpected={sorted(actual-expected)}")
    hashes = {}
    for name in sorted(expected):
        path = directory / name
        with path.open("rb") as stream:
            magic = stream.read(2)
        if magic != (b"MZ" if path.suffix == ".exe" else b"PK"):
            raise RuntimeError(f"Invalid binary header: {name}")
        hashes[name] = digest(path)
    return hashes


def verify_uploaded(release, local_hashes):
    assets = {a["name"]: a for a in release["assets"]}
    binaries = {name for name in assets if name.endswith((".exe", ".apk"))}
    expected = {name for name in local_hashes if name.endswith((".exe", ".apk"))}
    if binaries != expected:
        raise RuntimeError("Uploaded release has missing or unexpected installers")
    for name, checksum in local_hashes.items():
        if assets.get(name, {}).get("digest") != "sha256:" + checksum:
            raise RuntimeError(f"GitHub upload checksum mismatch or missing asset: {name}")


def gh(*args):
    return subprocess.check_output(["gh", *args], text=True)


def publish():
    directory = Path("release/latest")
    version = json.loads(Path("package.json").read_text())["version"]
    hashes = validate_downloads(directory, version)
    (directory / "SHA256SUMS.txt").write_text("".join(f"{h}  {name}\n" for name, h in hashes.items()))
    (directory / "Setup-Instructions.md").write_bytes(Path("docs/RELEASE_LATEST.md").read_bytes())
    files = sorted(p for p in directory.iterdir() if p.is_file())
    local_hashes = {p.name: digest(p) for p in files}
    tag = "v" + version
    releases_endpoint = f"repos/{os.environ['GH_REPO']}/releases"
    # Listing avoids treating authorization/network errors as a missing release.
    releases = json.loads(gh("api", releases_endpoint + "?per_page=100"))
    existing = next((r for r in releases if r["tag_name"] == tag), None)
    if existing:
        endpoint = f"{releases_endpoint}/{existing['id']}"
        if existing["target_commitish"] != os.environ["GITHUB_SHA"]:
            raise RuntimeError("Version already belongs to another commit; bump the version, never retag it")
        if not existing["draft"]:
            verify_uploaded(json.loads(gh("api", endpoint)), local_hashes)
            print(f"{tag} already published and verified; no files replaced")
            return
    else:
        gh("release", "create", tag, "--draft", "--target", os.environ["GITHUB_SHA"],
           "--title", "Bluey-Latest", "--notes-file", "docs/RELEASE_LATEST.md")
        # /releases/tags/{tag} only finds published releases. Drafts need their ID.
        created = next(r for r in json.loads(gh("api", releases_endpoint + "?per_page=100"))
                       if r["tag_name"] == tag)
        endpoint = f"{releases_endpoint}/{created['id']}"
    # Only an unpublished draft may have its uploads replaced during a retry.
    gh("release", "upload", tag, *(str(p) for p in files), "--clobber")
    verify_uploaded(json.loads(gh("api", endpoint)), local_hashes)
    gh("release", "edit", tag, "--draft=false", "--latest")
    print(f"Published {tag}: seven native-tested downloads and verified upload checksums")


if __name__ == "__main__":
    publish()
