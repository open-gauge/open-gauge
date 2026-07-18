import hashlib
import io
import uuid
from datetime import timedelta

from minio import Minio
from minio.deleteobjects import DeleteObject
from minio.error import S3Error

from ..core.config import settings


def _upload_client() -> Minio:
    """Client using the internal Docker endpoint for upload/delete operations."""
    return Minio(
        endpoint=settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def _presign_client() -> Minio:
    """Client using the *public* endpoint for generating presigned URLs.

    region="us-east-1" is passed explicitly so the SDK skips the bucket-region
    discovery network call (which would fail because localhost:9000 is unreachable
    from inside Docker). With the region pre-seeded, presigned_get_object() becomes
    a pure local HMAC-SHA256 computation. The public hostname in the generated URL
    matches what the browser will send in the Host header, so the signature validates.
    """
    public_url = settings.minio_public_url
    secure = public_url.startswith("https://")
    endpoint = public_url.replace("https://", "").replace("http://", "")
    return Minio(
        endpoint=endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=secure,
        region="us-east-1",
    )


def _ensure_bucket(client: Minio, bucket: str) -> None:
    try:
        if not client.bucket_exists(bucket):
            client.make_bucket(bucket)
    except S3Error:
        pass


def upload_file(
    data: bytes,
    content_type: str,
    object_path: str,
    bucket: str | None = None,
) -> tuple[str, str, int]:
    """Upload bytes to MinIO. Returns (bucket, object_path, size_bytes)."""
    bucket = bucket or settings.minio_bucket
    client = _upload_client()
    _ensure_bucket(client, bucket)
    stream = io.BytesIO(data)
    client.put_object(
        bucket_name=bucket,
        object_name=object_path,
        data=stream,
        length=len(data),
        content_type=content_type,
    )
    return bucket, object_path, len(data)


def delete_file(storage_path: str, bucket: str | None = None) -> None:
    """Delete an object from MinIO. Silently ignores missing objects."""
    bucket = bucket or settings.minio_bucket
    client = _upload_client()
    try:
        client.remove_object(bucket, storage_path)
    except S3Error:
        pass


def get_presigned_url(storage_path: str, bucket: str | None = None) -> str:
    """Return a 1-hour presigned download URL signed for the public endpoint."""
    bucket = bucket or settings.minio_bucket
    client = _presign_client()
    try:
        return client.presigned_get_object(
            bucket_name=bucket,
            object_name=storage_path,
            expires=timedelta(hours=1),
        )
    except S3Error:
        return ""


def download_file(storage_path: str, bucket: str | None = None) -> bytes | None:
    """Fetch object bytes from MinIO. Returns None if missing (never raises)."""
    bucket = bucket or settings.minio_bucket
    client = _upload_client()
    try:
        resp = client.get_object(bucket, storage_path)
        try:
            return resp.read()
        finally:
            resp.close()
            resp.release_conn()
    except S3Error:
        return None


def delete_all_objects(bucket: str | None = None) -> None:
    """Empty a bucket entirely. Used by the admin database reset — silently
    ignores a missing bucket rather than failing the whole reset over it."""
    bucket = bucket or settings.minio_bucket
    client = _upload_client()
    try:
        objects = client.list_objects(bucket, recursive=True)
        to_delete = [DeleteObject(obj.object_name) for obj in objects]
        if to_delete:
            # remove_objects is lazy — draining the iterator is what actually
            # issues the batch delete calls.
            list(client.remove_objects(bucket, to_delete))
    except S3Error:
        pass


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def unique_object_name(prefix: str, original_filename: str) -> str:
    return f"{prefix}/{uuid.uuid4()}_{original_filename}"


MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024


def validate_image_upload(content_type: str | None, size: int) -> str:
    """Validate an uploaded profile/asset picture. Returns the content type or raises ValueError."""
    ct = content_type or ""
    if not ct.startswith("image/"):
        raise ValueError("File must be an image")
    if size > MAX_IMAGE_SIZE_BYTES:
        raise ValueError("Image must be smaller than 5MB")
    return ct
