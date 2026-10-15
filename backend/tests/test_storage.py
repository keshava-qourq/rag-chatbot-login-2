"""File storage without S3: the local-disk fallback in `app.storage`, and an
upload that succeeds with no bucket and no reachable Redis."""

import io
import uuid

import pytest
from fastapi.testclient import TestClient

from app import storage
from app.main import app


@pytest.fixture
def media_root(tmp_path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("S3_BUCKET", raising=False)
    monkeypatch.setenv("MEDIA_ROOT", str(tmp_path))
    return tmp_path


def test_without_a_bucket_files_round_trip_on_disk(media_root) -> None:
    storage.store_file("u1/doc.txt", b"hello", "text/plain")

    assert (media_root / "u1" / "doc.txt").read_bytes() == b"hello"
    assert storage.read_file("u1/doc.txt") == b"hello"
    assert not list(media_root.rglob("*.partial"))

    storage.delete_file("u1/doc.txt")
    storage.delete_file("u1/doc.txt")  # already gone is not an error
    assert not (media_root / "u1" / "doc.txt").exists()


def test_a_missing_file_is_a_storage_error(media_root) -> None:
    with pytest.raises(storage.StorageError, match="failed to fetch"):
        storage.read_file("u1/missing.txt")


def test_a_key_cannot_escape_media_root(media_root) -> None:
    with pytest.raises(ValueError):
        storage.store_file("../outside.txt", b"x", "text/plain")


@pytest.mark.parametrize(
    ("name", "expected"),
    [
        ("report.pdf", "report.pdf"),
        ("../../etc/passwd", "passwd"),
        ("a\\b\\notes.md", "notes.md"),
        ("my file (1).txt", "my_file_1_.txt"),
        ("..", "file"),
        ("", "file"),
    ],
)
def test_safe_filename(name: str, expected: str) -> None:
    assert storage.safe_filename(name) == expected


def test_with_a_bucket_files_go_to_s3(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple[str, dict]] = []

    class FakeS3:
        def put_object(self, **kwargs):
            calls.append(("put", kwargs))

        def get_object(self, **kwargs):
            calls.append(("get", kwargs))
            return {"Body": io.BytesIO(b"from s3")}

        def delete_object(self, **kwargs):
            calls.append(("delete", kwargs))

    monkeypatch.setenv("S3_BUCKET", "my-bucket")
    monkeypatch.setattr(storage, "_s3_client", FakeS3)

    storage.store_file("k", b"data", "text/plain")
    assert storage.read_file("k") == b"from s3"
    storage.delete_file("k")

    assert [c[0] for c in calls] == ["put", "get", "delete"]
    assert all(c[1]["Bucket"] == "my-bucket" and c[1]["Key"] == "k" for c in calls)


def test_upload_works_with_no_bucket_and_no_redis(
    media_root, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A queue is configured but nothing listens there, so enqueueing fails.
    monkeypatch.setattr("app.routers.documents._redis_settings", _unreachable_redis)
    client = TestClient(app, base_url="https://testserver")
    signup = client.post(
        "/auth/signup",
        json={"email": f"user-{uuid.uuid4().hex}@example.com", "password": "Str0ngPass!"},
    )
    assert signup.status_code == 201

    response = client.post(
        "/documents",
        files=[("files", ("../../etc/policy.md", io.BytesIO(b"# Policy"), "text/markdown"))],
    )

    assert response.status_code == 201, response.text
    assert response.json()[0]["status"] == "queued"
    stored = [p for p in media_root.rglob("*") if p.is_file()]
    assert len(stored) == 1
    assert stored[0].name.endswith("-policy.md")
    assert stored[0].read_bytes() == b"# Policy"


def _unreachable_redis():
    from arq.connections import RedisSettings

    return RedisSettings(host="127.0.0.1", port=1, conn_retries=0, conn_timeout=1)
