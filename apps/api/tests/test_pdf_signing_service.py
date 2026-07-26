"""Tests for pdf_signing_service — embeds a PAdES digital signature into a
compiled certificate PDF. Verified here with pyHanko's own validator (the
same library used to sign), which is the closest to "would Adobe Acrobat
accept this" available without a real Acrobat install."""
import io
import uuid
from datetime import datetime, timedelta, timezone

import matplotlib
import pytest
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import validate_pdf_signature
from pyhanko_certvalidator import ValidationContext

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

from app.models.organization_signing_key import OrganizationSigningKey
from app.services import key_wrap, org_signing_key_service, pdf_signing_service


def _make_org_key(common_name: str = "Acme Metrology Lab") -> OrganizationSigningKey:
    """Builds real cert/key material via the same code path used in
    production, without touching the database — OrganizationSigningKey is
    only used here as a plain in-memory attribute holder."""
    cert_der, cert_pem, key_pem = org_signing_key_service._generate_certificate(common_name)
    now = datetime.now(timezone.utc)
    return OrganizationSigningKey(
        id=uuid.uuid4(),
        organization_id=uuid.uuid4(),
        algorithm="RSA-2048",
        subject_common_name=common_name,
        certificate_pem=cert_pem.decode("ascii"),
        private_key_encrypted=key_wrap.wrap_private_key_pem(key_pem),
        key_encryption_algorithm="AES-256-GCM",
        fingerprint_sha256=org_signing_key_service._fingerprint(cert_der),
        not_valid_before=now,
        not_valid_after=now + timedelta(days=3650),
        created_by=uuid.uuid4(),
    )


def _minimal_pdf_bytes() -> bytes:
    fig, ax = plt.subplots()
    ax.plot([1, 2, 3], [1, 4, 9])
    buf = io.BytesIO()
    fig.savefig(buf, format="pdf")
    plt.close(fig)
    return buf.getvalue()


class TestSignCertificatePdf:
    def test_embeds_a_signature_that_validates_as_intact_and_trusted(self) -> None:
        org_key = _make_org_key("Acme Metrology Lab")
        pdf_bytes = _minimal_pdf_bytes()

        signed = pdf_signing_service.sign_certificate_pdf(
            pdf_bytes, org_key, reason="Calibration certificate issued by Acme Metrology Lab"
        )

        reader = PdfFileReader(io.BytesIO(signed))
        sigs = reader.embedded_signatures
        assert len(sigs) == 1
        sig = sigs[0]
        assert sig.field_name == "OpenGaugeCertificateSignature"

        # Trust the cert as its own root (mirrors a viewer that has imported
        # the org's published certificate as a trusted anchor, see
        # certificate-signing.mdx).
        vc = ValidationContext(trust_roots=[sig.signer_cert], allow_fetching=False)
        status = validate_pdf_signature(sig, signer_validation_context=vc)

        assert status.intact is True
        assert status.valid is True
        assert status.trusted is True

    def test_signer_common_name_appears_in_the_certificate(self) -> None:
        org_key = _make_org_key("Precision Labs Inc.")
        signed = pdf_signing_service.sign_certificate_pdf(
            _minimal_pdf_bytes(), org_key, reason="Calibration certificate issued by Precision Labs Inc."
        )
        reader = PdfFileReader(io.BytesIO(signed))
        sig = reader.embedded_signatures[0]
        assert "Precision Labs Inc." in sig.signer_cert.subject.human_friendly

    def test_tampering_after_signing_breaks_integrity(self) -> None:
        org_key = _make_org_key()
        signed = bytearray(
            pdf_signing_service.sign_certificate_pdf(_minimal_pdf_bytes(), org_key, reason="test")
        )

        # Flip a byte inside the content stream (well before the signature's
        # own byte range at the end) to simulate a post-signing edit.
        idx = signed.index(b"stream") + 20
        signed[idx] ^= 0xFF

        reader = PdfFileReader(io.BytesIO(bytes(signed)))
        sig = reader.embedded_signatures[0]
        vc = ValidationContext(trust_roots=[sig.signer_cert], allow_fetching=False)
        status = validate_pdf_signature(sig, signer_validation_context=vc)

        assert status.intact is False

    def test_raises_certificate_signing_error_on_garbage_input(self) -> None:
        org_key = _make_org_key()
        with pytest.raises(pdf_signing_service.CertificateSigningError):
            pdf_signing_service.sign_certificate_pdf(b"not a pdf at all", org_key, reason="test")
