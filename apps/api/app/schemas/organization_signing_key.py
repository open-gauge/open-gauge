from datetime import datetime

from pydantic import BaseModel


class SigningCertificateResponse(BaseModel):
    algorithm: str
    subject_common_name: str
    certificate_pem: str
    fingerprint_sha256: str
    not_valid_before: datetime
    not_valid_after: datetime
