"""Plain, table-based HTML email bodies. Kept deliberately simple (no build step,
no external template engine) — Open Gauge favors boring and reliable over trendy.

Each render_* function returns (subject, html_body, text_body).
"""
from datetime import date

_ACCENT = "#2f819b"
_TEXT = "#152330"

_WRAPPER = """\
<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;">
  <p style="font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:{accent};margin:0 0 16px;">Open Gauge</p>
  {body}
  <p style="font-size:12px;color:#9ca3af;margin-top:32px;">This is an automated message from your self-hosted Open Gauge instance.</p>
</div>
"""


def _wrap(body_html: str) -> str:
    return _WRAPPER.format(accent=_ACCENT, body=body_html)


def render_verification_email(name: str, verify_url: str) -> tuple[str, str, str]:
    subject = "Verify your Open Gauge account"
    body = f"""
    <h1 style="font-size:18px;color:{_TEXT};margin:0 0 12px;">Welcome, {name}</h1>
    <p style="font-size:14px;color:{_TEXT};line-height:1.5;">
      Confirm your email address to activate your Open Gauge account.
    </p>
    <p style="margin:20px 0;">
      <a href="{verify_url}" style="background:{_ACCENT};color:#fff;text-decoration:none;
        padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;">Verify email address</a>
    </p>
    <p style="font-size:12px;color:#9ca3af;">This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>
    """
    text = (
        f"Welcome, {name}\n\n"
        f"Confirm your email address to activate your Open Gauge account:\n{verify_url}\n\n"
        "This link expires in 24 hours. If you didn't create this account, you can ignore this email."
    )
    return subject, _wrap(body), text


def render_calibration_created_email(asset_name: str, asset_id: str, due_date: date, performed_by: str) -> tuple[str, str, str]:
    subject = f"New calibration recorded for {asset_name} ({asset_id})"
    body = f"""
    <h1 style="font-size:18px;color:{_TEXT};margin:0 0 12px;">New calibration recorded</h1>
    <p style="font-size:14px;color:{_TEXT};line-height:1.5;">
      <strong>{performed_by}</strong> logged a new calibration for <strong>{asset_name}</strong> ({asset_id}).
    </p>
    <p style="font-size:14px;color:{_TEXT};">Next due date: <strong>{due_date.isoformat()}</strong></p>
    """
    text = (
        f"{performed_by} logged a new calibration for {asset_name} ({asset_id}).\n"
        f"Next due date: {due_date.isoformat()}"
    )
    return subject, _wrap(body), text


def render_calibration_reminder_email(asset_name: str, asset_id: str, due_date: date, overdue: bool) -> tuple[str, str, str]:
    if overdue:
        subject = f"Overdue calibration: {asset_name} ({asset_id})"
        headline = "Calibration overdue"
        color = "#dc2626"
        status_text = f"was due on <strong>{due_date.isoformat()}</strong> and is now overdue"
    else:
        subject = f"Calibration due soon: {asset_name} ({asset_id})"
        headline = "Calibration due soon"
        color = "#d97706"
        status_text = f"is due on <strong>{due_date.isoformat()}</strong>"

    body = f"""
    <h1 style="font-size:18px;color:{color};margin:0 0 12px;">{headline}</h1>
    <p style="font-size:14px;color:{_TEXT};line-height:1.5;">
      <strong>{asset_name}</strong> ({asset_id}) {status_text}.
    </p>
    """
    text = f"{asset_name} ({asset_id}) {status_text.replace('<strong>', '').replace('</strong>', '')}."
    return subject, _wrap(body), text
