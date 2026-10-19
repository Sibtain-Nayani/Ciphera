"""
Cryptographic Checksum Validator
Verifies SHA-256 integrity of benchmark annotation files before evaluation runs.
Guarantees file integrity against post-freeze accidental edits.
"""

import os
import hashlib
from typing import Dict, List, Tuple


def compute_file_sha256(filepath: str) -> str:
    """Computes SHA-256 hex digest for a given file."""
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()


def generate_checksum_manifest(base_dir: str, file_rel_paths: List[str]) -> str:
    """Generates standard sha256sum formatted text."""
    lines = []
    for rel_path in sorted(file_rel_paths):
        full_path = os.path.join(base_dir, rel_path)
        digest = compute_file_sha256(full_path)
        # Standard format: <hash>  <relative_path>
        lines.append(f"{digest}  {rel_path}")
    return "\n".join(lines) + "\n"


def verify_checksums(base_dir: str, checksum_file: str) -> Tuple[bool, List[str]]:
    """
    Verifies that all files listed in checksum_file match their computed SHA-256 digests.
    Returns (all_passed: bool, errors: List[str]).
    """
    if not os.path.exists(checksum_file):
        return False, [f"Checksum manifest not found: {checksum_file}"]

    errors = []
    with open(checksum_file, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split(None, 1)
            if len(parts) != 2:
                errors.append(f"Malformed checksum line {line_num}: {line}")
                continue
            expected_hash, rel_path = parts[0].strip(), parts[1].strip()
            full_path = os.path.join(base_dir, rel_path)

            if not os.path.exists(full_path):
                errors.append(f"Missing referenced file: {rel_path}")
                continue

            actual_hash = compute_file_sha256(full_path)
            if actual_hash.lower() != expected_hash.lower():
                errors.append(
                    f"Checksum mismatch for {rel_path}: expected {expected_hash}, got {actual_hash}"
                )

    return (len(errors) == 0), errors
