"""Shared format gate for artifacts that can pass the current verifier."""

import hashlib
import json


class UnsupportedReleaseFormat(ValueError):
    """Raised when a source format has no verified artifact release contract."""


def require_verified_pdf(filename: str | None, media_type: str | None) -> None:
    normalized_type = (media_type or "").split(";", 1)[0].strip().lower()
    normalized_name = (filename or "").strip().lower()
    if normalized_name.endswith(".pdf") and normalized_type == "application/pdf":
        return
    raise UnsupportedReleaseFormat("Verified artifact release currently supports PDF documents only")


class InvalidReleaseSnapshot(ValueError):
    """Raised when a job is missing or no longer matches its captured inputs."""


def canonical_sha256(value: object) -> str:
    encoded = json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def assert_artifact_integrity(expected_sha256: str | None, artifact_bytes: bytes) -> None:
    if not expected_sha256:
        raise InvalidReleaseSnapshot("Verified artifact checksum is missing")
    if hashlib.sha256(artifact_bytes).hexdigest() != expected_sha256:
        raise InvalidReleaseSnapshot("Verified artifact checksum does not match stored bytes")


def assert_job_snapshot_integrity(job, document) -> None:
    if not document or not job.source_storage_key or not job.source_sha256:
        raise InvalidReleaseSnapshot("Job is missing its immutable source snapshot")
    if job.entities_snapshot is None or not job.entities_sha256:
        raise InvalidReleaseSnapshot("Job is missing its immutable entity snapshot")
    if job.policy_config is None or not job.policy_sha256 or not job.policy_version:
        raise InvalidReleaseSnapshot("Job is missing its immutable policy snapshot")
    if job.source_storage_key != document.storage_key or job.source_sha256 != document.source_sha256:
        raise InvalidReleaseSnapshot("Document source changed after the job was queued")
    if canonical_sha256(job.entities_snapshot) != job.entities_sha256:
        raise InvalidReleaseSnapshot("Job entity snapshot integrity check failed")
    if canonical_sha256(job.policy_config) != job.policy_sha256:
        raise InvalidReleaseSnapshot("Job policy snapshot integrity check failed")
    if job.policy_config.get("version") != job.policy_version:
        raise InvalidReleaseSnapshot("Job policy version does not match its snapshot")


def assert_document_matches_job_snapshot(job, document) -> None:
    assert_job_snapshot_integrity(job, document)
    current_entities = document.detected_entities or []
    current_policy = (document.canonical_representation or {}).get("metadata", {}).get("redaction_policy")
    if canonical_sha256(current_entities) != job.entities_sha256:
        raise InvalidReleaseSnapshot("Document entities changed after redaction; reprocess before download")
    if not current_policy or canonical_sha256(current_policy) != job.policy_sha256:
        raise InvalidReleaseSnapshot("Document policy changed after redaction; reprocess before download")
