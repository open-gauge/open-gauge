import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import certificate as cert_repo
from ...schemas.certificate import CertificateCreate, CertificateResponse

router = APIRouter(prefix="/certificates", tags=["Certificates"])


@router.get("", response_model=list[CertificateResponse])
def list_certificates(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CertificateResponse]:
    return cert_repo.list_certificates(db, skip=skip, limit=limit)


@router.post("", response_model=CertificateResponse, status_code=status.HTTP_201_CREATED)
def create_certificate(
    body: CertificateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CertificateResponse:
    return cert_repo.create(db, created_by=current_user.id, **body.model_dump())


@router.get("/{cert_id}", response_model=CertificateResponse)
def get_certificate(
    cert_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CertificateResponse:
    cert = cert_repo.get_by_id(db, cert_id)
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    return cert


@router.delete("/{cert_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_certificate(
    cert_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> None:
    cert = cert_repo.get_by_id(db, cert_id)
    if not cert:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Certificate not found")
    cert_repo.deactivate(db, cert)
