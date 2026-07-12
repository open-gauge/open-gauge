import io
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from PIL import Image
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user, require_not_viewer
from ...models.user import User
from ...models.user_signature import UserSignature
from ...repositories import audit_log as audit_log_repo
from ...repositories import stored_file as file_repo
from ...repositories import user_signature as signature_repo
from ...repositories import user_signing_key as signing_key_repo
from ...schemas.signature import PublicKeyResponse, SignatureVerifyResponse, UserSignatureResponse
from ...services import signing_key_service
from ...services import storage as storage_svc

router = APIRouter(prefix="/users", tags=["Signatures"])

_VALID_SOURCES = {"upload", "drawn"}


def _enrich_signature(sig: UserSignature, db: Session) -> UserSignatureResponse:
    data = UserSignatureResponse.model_validate(sig)
    f = file_repo.get_by_id(db, sig.image_file_id)
    if f:
        data.image_url = storage_svc.get_presigned_url(f.storage_path, f.bucket)
    signing_key = signing_key_repo.get_by_id(db, sig.signing_key_id)
    if signing_key:
        data.fingerprint_sha256 = signing_key.fingerprint_sha256
    return data


@router.post("/me/signature", response_model=UserSignatureResponse, status_code=status.HTTP_201_CREATED)
async def upload_my_signature(
    request: Request,
    file: UploadFile = File(...),
    source: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> UserSignatureResponse:
    """Upload or replace the current user's signature (transparent-background image).

    Accepts both a file upload and a drawn canvas exported as a PNG blob — both go through
    this single endpoint, distinguished by the `source` field. The image is cryptographically
    signed with the user's Ed25519 key (generated on first use) so its authenticity can later
    be verified against the published public key.
    """
    if source not in _VALID_SOURCES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="source must be 'upload' or 'drawn'")

    data = await file.read()
    try:
        content_type = storage_svc.validate_image_upload(file.content_type, len(data))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    try:
        Image.open(io.BytesIO(data)).verify()
        mode = Image.open(io.BytesIO(data)).mode
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is not a valid image")
    if mode not in ("RGBA", "LA"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Image must have a transparent background (RGBA or LA PNG)",
        )

    checksum = storage_svc.sha256_hex(data)
    object_path = storage_svc.unique_object_name(f"signatures/{current_user.id}", file.filename or "signature.png")
    bucket, path, size = storage_svc.upload_file(data, content_type, object_path)

    file_record = file_repo.create(
        db,
        original_filename=file.filename or "signature.png",
        storage_path=path,
        bucket=bucket,
        content_type=content_type,
        size_bytes=size,
        checksum_sha256=checksum,
        entity_type="user_signature",
        entity_id=current_user.id,
        uploaded_by=current_user.id,
    )

    signing_key = signing_key_service.get_or_create_signing_key(db, current_user)
    envelope = signing_key_service.build_envelope(current_user.id, checksum, signing_key.algorithm)
    signature_bytes = signing_key_service.sign_envelope(signing_key, envelope)

    signature_repo.revoke_active(db, current_user.id, reason="Replaced by new upload")
    version = signature_repo.next_version(db, current_user.id)
    sig = signature_repo.create(
        db,
        user_id=current_user.id,
        signing_key_id=signing_key.id,
        image_file_id=file_record.id,
        image_sha256=checksum,
        signed_envelope=envelope,
        signature_bytes=signature_bytes,
        signature_algorithm=signing_key.algorithm,
        source=source,
        version=version,
        created_by=current_user.id,
    )

    audit_log_repo.create(
        db,
        actor_id=current_user.id,
        actor_email=current_user.email,
        action="user.signature_uploaded",
        entity_type="user",
        entity_id=current_user.id,
        ip_address=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
    )

    return _enrich_signature(sig, db)


@router.delete("/me/signature", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_signature(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_viewer),
) -> None:
    """Revoke the current user's active signature. History is preserved, not deleted."""
    active = signature_repo.get_active(db, current_user.id)
    if active:
        signature_repo.revoke_active(db, current_user.id, reason="User removed signature")
        audit_log_repo.create(
            db,
            actor_id=current_user.id,
            actor_email=current_user.email,
            action="user.signature_removed",
            entity_type="user",
            entity_id=current_user.id,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
        )


@router.get("/me/signature", response_model=UserSignatureResponse | None)
def get_my_signature(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserSignatureResponse | None:
    active = signature_repo.get_active(db, current_user.id)
    if not active:
        return None
    return _enrich_signature(active, db)


@router.get("/{user_id}/signature/public-key", response_model=PublicKeyResponse)
def get_user_public_key(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PublicKeyResponse:
    # Public keys aren't secret; any authenticated user may fetch one to verify a signature.
    _ = current_user
    signing_key = signing_key_repo.get_by_user_id(db, user_id)
    if not signing_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User has no signing key")
    return PublicKeyResponse(
        algorithm=signing_key.algorithm,
        public_key_pem=signing_key.public_key_pem,
        fingerprint_sha256=signing_key.fingerprint_sha256,
    )


@router.get("/{user_id}/signature/verify", response_model=SignatureVerifyResponse)
def verify_user_signature(
    user_id: uuid.UUID,
    signature_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SignatureVerifyResponse:
    """Recomputes the image hash and re-verifies the crypto signature independently.

    Defaults to the user's current active signature; pass `signature_id` to verify a
    specific historical (revoked) signature instead — history is never deleted.
    """
    _ = current_user
    sig = signature_repo.get_by_id(db, signature_id) if signature_id else signature_repo.get_active(db, user_id)
    if not sig or sig.user_id != user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signature not found")

    signing_key = signing_key_repo.get_by_id(db, sig.signing_key_id)
    if not signing_key:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Signing key not found")

    file_record = file_repo.get_by_id(db, sig.image_file_id)
    image_hash_match = False
    if file_record:
        image_bytes = storage_svc.download_file(file_record.storage_path, file_record.bucket)
        if image_bytes is not None:
            image_hash_match = storage_svc.sha256_hex(image_bytes) == sig.image_sha256

    signature_valid = signing_key_service.verify_envelope(
        signing_key.public_key_pem, sig.signed_envelope, sig.signature_bytes
    )

    return SignatureVerifyResponse(
        verified=image_hash_match and signature_valid,
        image_hash_match=image_hash_match,
        signature_valid=signature_valid,
        version=sig.version,
        signed_at=sig.created_at,
    )
