"""User-authorized in-place Bluey-Latest replacement; never creates a second release.

Stage versioned assets alongside the working downloads, verify every digest, then
advance the SAME release ID to a fresh immutable source tag. Delete superseded
assets only after promotion. Interrupted uploads/promotion are safe to retry.
"""
import json
import os
from pathlib import Path
from publish_latest import digest, expected_binaries, gh, validate_downloads, verify_uploaded


def check_target(release, release_id, old_tag, new_tag, sha):
    if (release["id"] != release_id or release["name"] != "Bluey-Latest"
            or release["draft"] or release.get("prerelease")):
        raise RuntimeError("Refusing to replace anything except the expected published Bluey-Latest release")
    if release["tag_name"] == new_tag:
        if release["target_commitish"] != sha:
            raise RuntimeError("New version belongs to a different source commit")
    elif release["tag_name"] != old_tag:
        raise RuntimeError("Release changed since replacement was authorized")


def verify_staged(release, hashes):
    assets = {a["name"]: a for a in release["assets"]}
    for name, checksum in hashes.items():
        if assets.get(name, {}).get("digest") != "sha256:" + checksum:
            raise RuntimeError(f"Staged upload checksum mismatch: {name}; old downloads were not removed")


def replace(directory, version, release_id, old_tag, sha, repo, notes):
    hashes = validate_downloads(directory, version)
    tag = "v" + version
    if tag == old_tag:
        raise RuntimeError("Replacement must have a new version; published source tags are immutable")
    endpoint = f"repos/{repo}/releases/{release_id}"
    current = json.loads(gh("api", endpoint))
    check_target(current, release_id, old_tag, tag, sha)
    refs = json.loads(gh("api", f"repos/{repo}/git/matching-refs/tags/{tag}"))
    for ref in refs:
        if ref["ref"] == f"refs/tags/{tag}" and ref["object"]["sha"] != sha:
            raise RuntimeError("New version tag already points to different source; never retag")
    checksums = "".join(f"{checksum}  {name}\n" for name, checksum in sorted(hashes.items()))
    manifest = directory / f"SHA256SUMS-{version}.txt"
    instructions = directory / f"Setup-Instructions-{version}.md"
    manifest.write_text(checksums)
    instructions.write_text(notes)
    files = [directory / name for name in sorted(expected_binaries(version))] + [manifest, instructions]
    staged = {p.name: digest(p) for p in files}
    existing = {a["name"]: a for a in current["assets"]}
    # No clobber: keep both old downloads and any successfully staged new upload.
    for path in files:
        asset = existing.get(path.name)
        if asset:
            if asset.get("digest") != "sha256:" + staged[path.name]:
                raise RuntimeError(f"Conflicting staged asset: {path.name}")
        else:
            gh("release", "upload", current["tag_name"], str(path), "--repo", repo)
    uploaded = json.loads(gh("api", endpoint))
    check_target(uploaded, release_id, old_tag, tag, sha)
    verify_staged(uploaded, staged)
    # PATCH preserves release identity and creates the new tag at the exact tested
    # SHA. Avoid gh release edit's draft-transition ambiguity for this live release.
    payload = directory / "promotion.json"
    payload.write_text(json.dumps({"tag_name": tag, "target_commitish": sha,
                                  "name": "Bluey-Latest", "body": notes,
                                  "draft": False, "prerelease": False, "make_latest": "true"}))
    gh("api", endpoint, "--method", "PATCH", "--input", str(payload))
    promoted = json.loads(gh("api", endpoint))
    check_target(promoted, release_id, old_tag, tag, sha)
    if promoted["tag_name"] != tag:
        raise RuntimeError("Promotion did not take effect; old assets retained")
    verify_staged(promoted, staged)
    # Only remove known Bluey download/document assets, not arbitrary attachments.
    stale_docs = {"SHA256SUMS.txt", "Setup-Instructions.md", "Android-Setup-Instructions.md",
                  "Windows-Setup-Instructions.md", "APK-manifest.txt", "APK-verification.txt"}
    for asset in promoted["assets"]:
        name = asset["name"]
        if name not in staged and (name in stale_docs or (name.startswith("SHA256SUMS-") and name.endswith(".txt")) or (name.startswith("Setup-Instructions-") and name.endswith(".md")) or (name.startswith("Bluey-") and name.endswith((".exe", ".apk")))):
            gh("api", f"repos/{repo}/releases/assets/{asset['id']}", "--method", "DELETE")
    canonical = directory / "SHA256SUMS.txt"
    canonical.write_text(checksums)
    gh("release", "upload", tag, str(canonical), "--repo", repo)
    staged[canonical.name] = digest(canonical)
    final = json.loads(gh("api", endpoint))
    verify_uploaded(final, staged)
    check_target(final, release_id, old_tag, tag, sha)
    print(f"Replaced Bluey-Latest in place: release {release_id}, {tag}, source {sha}; all seven downloads verified")


if __name__ == "__main__":
    replace(Path("release/latest"), json.loads(Path("package.json").read_text())["version"],
            int(os.environ["BLUEY_REPLACE_RELEASE_ID"]), os.environ["BLUEY_PREVIOUS_TAG"],
            os.environ["GITHUB_SHA"], os.environ["GH_REPO"], Path("docs/RELEASE_LATEST.md").read_text())
