"""Embeds a PAdES digital signature into a compiled certificate PDF.

This runs as a post-processing step on the finished PDF bytes — after
latex_service.compile_tex has already produced them — so it works
identically regardless of which LaTeX template (built-in or a custom
upload) generated the document. The signature is a standard PDF signature
dictionary (ISO 32000 / PAdES-B-B): any PDF viewer with signature support
(Adobe Acrobat, Chrome, Preview, ...) can verify it natively, with no
Open Gauge-specific tooling required.

The document is "certified" (MDPPerm.NO_CHANGES) rather than merely signed —
any edit made after signing, however small, breaks the signature. That's the
right guarantee for an issued calibration certificate, which has no
legitimate reason to change post-issuance.
"""
import io

from asn1crypto import keys as asn1_keys
from asn1crypto import x509 as asn1_x509
from asn1crypto.pem import unarmor
from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign import signers
from pyhanko.sign.fields import MDPPerm, SigSeedSubFilter
from pyhanko_certvalidator.registry import SimpleCertificateStore

from ..models.organization_signing_key import OrganizationSigningKey
from . import key_wrap


class CertificateSigningError(Exception):
    pass


def _build_signer(org_key: OrganizationSigningKey) -> signers.SimpleSigner:
    # asn1crypto's x509.Certificate.load/PrivateKeyInfo.load expect DER, not
    # PEM — unarmor first.
    _, _, cert_der_bytes = unarmor(org_key.certificate_pem.encode("ascii"))
    signing_cert = asn1_x509.Certificate.load(cert_der_bytes)

    key_pem = key_wrap.unwrap_private_key_pem(org_key.private_key_encrypted)
    _, _, key_der_bytes = unarmor(key_pem)
    signing_key = asn1_keys.PrivateKeyInfo.load(key_der_bytes)

    cert_registry = SimpleCertificateStore.from_certs([signing_cert])
    return signers.SimpleSigner(
        signing_cert=signing_cert,
        signing_key=signing_key,
        cert_registry=cert_registry,
    )


def sign_certificate_pdf(pdf_bytes: bytes, org_key: OrganizationSigningKey, reason: str) -> bytes:
    """Return pdf_bytes with a PAdES certification signature embedded.

    `reason` is the human-readable string shown in a PDF viewer's signature
    panel (e.g. "Calibration certificate issued by Acme Metrology Lab").
    """
    try:
        signer = _build_signer(org_key)
        writer = IncrementalPdfFileWriter(io.BytesIO(pdf_bytes))
        metadata = signers.PdfSignatureMetadata(
            field_name="OpenGaugeCertificateSignature",
            md_algorithm="sha256",
            reason=reason,
            name=org_key.subject_common_name,
            subfilter=SigSeedSubFilter.PADES,
            certify=True,
            docmdp_permissions=MDPPerm.NO_CHANGES,
        )
        signed = signers.sign_pdf(writer, metadata, signer=signer)
        return signed.read()
    except Exception as exc:
        raise CertificateSigningError(f"Failed to sign certificate PDF: {exc}") from exc
