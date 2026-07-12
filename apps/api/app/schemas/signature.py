import uuid
from datetime import datetime

from pydantic import BaseModel


class UserSignatureResponse(BaseModel):
    id: uuid.UUID
    version: int
    source: str
    is_active: bool
    image_url: str | None = None
    fingerprint_sha256: str = ""
    created_at: datetime

    model_config = {"from_attributes": True}


class PublicKeyResponse(BaseModel):
    algorithm: str
    public_key_pem: str
    fingerprint_sha256: str


class SignatureVerifyResponse(BaseModel):
    verified: bool
    image_hash_match: bool
    signature_valid: bool
    version: int
    signed_at: datetime
