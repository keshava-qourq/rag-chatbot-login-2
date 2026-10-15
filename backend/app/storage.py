"""Where original uploaded files live: S3 when configured, else local disk.

`app.routers.documents` stores and deletes files and `app.ingestion` reads
them back; both go through this module, so neither needs to know which
backend is in use.

S3 is used when `S3_BUCKET` is set (credentials come from boto3's own chain,
and `S3_ENDPOINT_URL` points it at an S3-compatible service). Without a
bucket, files are written under `MEDIA_ROOT` on disk -- which must be a
mounted volume shared by the API and the ingestion worker in production, or
the files disappear when the container is replaced. Every value is read from
the environment on each call, matching the rest of the app.
"""

import os
import re
from pathlib import Path

import boto3

_DEFAULT_MEDIA_ROOT = "./data/uploads"

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


class StorageError(Exception):
    """A stored file could not be read."""


def safe_filename(filename: str) -> str:
    """The upload's name reduced to one safe path segment.

    The name comes from the browser, so `../../etc/passwd` or `a/b.pdf` must
    not become a path: only the last segment is kept and anything unusual
    becomes `_`.
    """
    name = _UNSAFE.sub("_", Path(filename.replace("\\", "/")).name).strip("._")
    return name[:120] or "file"


def using_s3() -> bool:
    return bool(os.getenv("S3_BUCKET"))


def _s3_client():
    return boto3.client("s3", endpoint_url=os.getenv("S3_ENDPOINT_URL") or None)


def _disk_path(key: str) -> Path:
    root = Path(os.getenv("MEDIA_ROOT") or _DEFAULT_MEDIA_ROOT).resolve()
    path = (root / key).resolve()
    if root not in path.parents:
        raise ValueError(f"storage key escapes MEDIA_ROOT: {key!r}")
    return path


def store_file(key: str, data: bytes, content_type: str) -> None:
    """Store `data` under `key`."""
    if using_s3():
        _s3_client().put_object(
            Bucket=os.environ["S3_BUCKET"], Key=key, Body=data, ContentType=content_type
        )
        return
    path = _disk_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    partial = path.with_name(path.name + ".partial")
    partial.write_bytes(data)
    partial.replace(path)  # never leave a half-written file under the real name


def read_file(key: str) -> bytes:
    """The stored bytes for `key`, from wherever `store_file` put them."""
    try:
        if using_s3():
            response = _s3_client().get_object(Bucket=os.environ["S3_BUCKET"], Key=key)
            return response["Body"].read()
        return _disk_path(key).read_bytes()
    except Exception as exc:  # boto3 and the filesystem raise many types
        raise StorageError(f"failed to fetch {key!r}: {exc}") from exc


def delete_file(key: str) -> None:
    """Remove a stored file; a file that is already gone is not an error."""
    if using_s3():
        _s3_client().delete_object(Bucket=os.environ["S3_BUCKET"], Key=key)
        return
    _disk_path(key).unlink(missing_ok=True)
