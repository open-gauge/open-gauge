import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Privacy Policy — Open Gauge",
  description: "How a self-hosted Open Gauge instance handles personal and organizational data.",
};

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy Policy" updated="July 13, 2026">
      <p>
        Open Gauge is self-hosted software: the organization that installed this instance
        (&ldquo;the Operator&rdquo;) runs its own copy of the application and database, and is the data
        controller for everything stored in it. The Open Gauge project itself does not operate this
        Instance, does not receive a copy of its data, and has no access to it.
      </p>

      <h2>1. What data is stored, and where</h2>
      <p>
        All data you enter — account details, asset and sensor records, calibration history,
        certificates, uploaded files, and audit logs — is stored entirely within the Operator&rsquo;s own
        infrastructure: its PostgreSQL database and MinIO (or S3-compatible) object storage, as configured
        by the Operator. Open Gauge does not transmit this data to any third-party service by default.
      </p>

      <h2>2. Account information</h2>
      <p>
        To create an account you provide a name, email address, and password (stored as a salted hash,
        never in plain text). If email notifications are configured by an administrator, your email
        address is used to send account verification and password-reset links, and — for technicians and
        team members — calibration due-date reminders.
      </p>

      <h2>3. Email delivery</h2>
      <p>
        When an administrator configures SMTP (Admin → Email), outgoing mail is sent directly from the
        Instance to the SMTP server the Operator specifies. No email content passes through any
        Open-Gauge-operated infrastructure — there isn&rsquo;t any.
      </p>

      <h2>4. Audit logs</h2>
      <p>
        Security- and traceability-sensitive actions (record creation, edits, calibration voids/restores,
        settings changes) are recorded in an immutable audit log, including the acting user, a timestamp,
        and — where applicable — the IP address and user agent of the request. This is a core feature for
        ISO/IEC 17025-style traceability, not data shared outside the Instance.
      </p>

      <h2>5. Cookies and local storage</h2>
      <p>
        Open Gauge stores your session token and theme preference in your browser&rsquo;s local storage. It
        does not use third-party tracking cookies or analytics scripts.
      </p>

      <h2>6. Data retention and deletion</h2>
      <p>
        Calibration records are intentionally immutable for traceability — see the Instance&rsquo;s
        documentation for how &ldquo;voiding&rdquo; a record works. Other records (assets, locations,
        procedures) support soft deletion. The Operator controls all retention periods and backup policies;
        contact your administrator to request deletion of your personal account data.
      </p>

      <h2>7. Your rights</h2>
      <p>
        Depending on the Operator&rsquo;s jurisdiction and applicable law (e.g. GDPR), you may have rights
        to access, correct, or request deletion of your personal data. Since the Operator controls the
        Instance, direct any such request to your administrator.
      </p>

      <h2>8. Changes to this policy</h2>
      <p>
        This page is a template shipped with Open Gauge. Operators are encouraged to have it reviewed by
        their own counsel and adapted to their jurisdiction, industry, and compliance obligations before
        relying on it.
      </p>
    </LegalPageLayout>
  );
}
