"""Read-only npm lock, cached archive, and installed-file audit.

Does not install packages, execute package code, modify npm configuration, or
write dependency files. An optional JSON report is the only output file.
"""
import argparse
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tarfile


def platform_matches(values, value):
    return not values or (
        "!" + value not in values
        and (not any(not item.startswith("!") for item in values)
             or value in values or "any" in values)
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--cache", type=Path,
                        default=Path(os.environ.get("LOCALAPPDATA", Path.home())) / "npm-cache" / "_cacache")
    parser.add_argument("--tarball-dir", type=Path, help="Additional archives named <algorithm>-<digest hex>.tgz")
    parser.add_argument("--output", type=Path, help="Optional JSON report; dependencies remain read-only")
    args = parser.parse_args()
    root = args.root.resolve()
    lock_path = root / "package-lock.json"
    lock_bytes = lock_path.read_bytes()
    lock = json.loads(lock_bytes)
    hidden_path = root / "node_modules" / ".package-lock.json"
    hidden = json.loads(hidden_path.read_bytes()) if hidden_path.exists() else {"packages": {}}
    git_lock = subprocess.run(["git", "show", "HEAD:package-lock.json"], cwd=root,
                              capture_output=True, check=False)
    def inspect_package(entry):
        key, package = entry
        if not key:
            return None
        record = {
            "path": key, "locked_version": package.get("version"),
            "expected_on_platform": platform_matches(package.get("os"), "win32")
                                    and platform_matches(package.get("cpu"), "x64"),
            "optional": package.get("optional", False),
            "bundled": package.get("inBundle", False),
        }
        try:
            record["installed_version"] = json.loads((root / key / "package.json").read_bytes())["version"]
        except (OSError, KeyError, json.JSONDecodeError):
            record["installed_version"] = None
        record["hidden_version"] = hidden["packages"].get(key, {}).get("version")
        record["tarball"] = "not available"
        for integrity in package.get("integrity", "").split():
            algorithm, encoded = integrity.split("-", 1)
            digest = base64.b64decode(encoded)
            hexadecimal = digest.hex()
            candidates = [args.cache / "content-v2" / algorithm / hexadecimal[:2] / hexadecimal[2:4] / hexadecimal[4:]]
            if args.tarball_dir:
                candidates.append(args.tarball_dir / f"{algorithm}-{hexadecimal}.tgz")
            archive_path = next((candidate for candidate in candidates if candidate.exists()), None)
            if archive_path is None:
                continue
            if hashlib.new(algorithm, archive_path.read_bytes()).digest() != digest:
                record["tarball"] = "integrity mismatch"
                break
            record["tarball"] = "lock integrity verified"
            record["verified_tarball_bytes"] = archive_path.stat().st_size
            if record["installed_version"] == record["locked_version"]:
                differences, checked = [], 0
                with tarfile.open(archive_path, "r:gz") as archive:
                    for member in archive.getmembers():
                        if not member.isfile():
                            continue
                        parts = PurePosixPath(member.name).parts
                        # npm extracts every archive with one top-level directory
                        # stripped; DefinitelyTyped archives use the type name.
                        parts = parts[1:] if parts else parts
                        if not parts or ".." in parts:
                            raise ValueError(f"Unsafe archive path: {member.name}")
                        destination = root / key / Path(*parts)
                        expected = archive.extractfile(member).read()
                        try:
                            actual = destination.read_bytes()
                        except OSError:
                            actual = None
                        checked += 1
                        if actual != expected:
                            differences.append("/".join(parts))
                record["installed_files_checked"] = checked
                record["installed_file_differences"] = differences
            break
        return record
    with ThreadPoolExecutor(max_workers=12) as executor:
        records = [record for record in executor.map(inspect_package, lock["packages"].items()) if record]
    by_path = {record["path"]: record for record in records}
    for record in records:
        if not record["bundled"]:
            continue
        parent_path = record["path"].rsplit("/node_modules/", 1)[0]
        parent = by_path.get(parent_path)
        if parent and parent["tarball"] == "lock integrity verified" and not parent.get("installed_file_differences"):
            record["verified_in_parent_archive"] = parent_path
    summary = {
        "lock_sha256": hashlib.sha256(lock_bytes).hexdigest(),
        "lock_matches_git": git_lock.returncode == 0 and lock == json.loads(git_lock.stdout),
        "locked_packages": len(records),
        "present": sum(record["installed_version"] is not None for record in records),
        "version_mismatches": [{key: record[key] for key in ("path", "locked_version", "installed_version", "hidden_version")}
                               for record in records if record["installed_version"] is not None
                               and record["installed_version"] != record["locked_version"]],
        "missing_required_on_platform": [record["path"] for record in records if record["expected_on_platform"]
                                         and not record["optional"] and record["installed_version"] is None],
        "tarballs_integrity_verified": sum(record["tarball"] == "lock integrity verified" for record in records),
        "tarball_integrity_failures": [record["path"] for record in records if record["tarball"] == "integrity mismatch"],
        "installed_packages_verified_against_locked_tarball": sum(record.get("installed_files_checked", 0) > 0
                                    and not record.get("installed_file_differences") for record in records),
        "bundled_packages_verified_in_parent_archive": sum("verified_in_parent_archive" in record for record in records),
        "installed_file_differences": [{"path": record["path"], "files": record["installed_file_differences"]}
                                       for record in records if record.get("installed_file_differences")],
        "hidden_extra_packages": [{"path": key, "version": package["version"]}
                                   for key, package in hidden["packages"].items() if key not in lock["packages"]],
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps({"summary": summary, "packages": records}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
