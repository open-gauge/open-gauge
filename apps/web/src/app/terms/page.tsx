import type { Metadata } from "next";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Terms of Service — Open Gauge",
  description: "Terms governing the use of a self-hosted Open Gauge instance.",
};

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Service" updated="July 13, 2026">
      <p>
        Open Gauge is free, open-source software licensed under the{" "}
        <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
          GNU Affero General Public License v3.0 (AGPL-3.0)
        </a>. These Terms govern your use of a specific, self-hosted deployment of Open Gauge (the
        &ldquo;Instance&rdquo;) operated by the organization that installed it (&ldquo;the Operator&rdquo;) —
        not a hosted service provided by the Open Gauge project itself.
      </p>

      <h2>1. Who these terms are between</h2>
      <p>
        Open Gauge is not a SaaS product. There is no central Open Gauge company hosting your data or
        acting as a party to these terms. Each Instance is installed, configured, and operated
        independently by its Operator, using Open Gauge&rsquo;s open-source code under the AGPL-3.0 license.
        Any agreement about using an Instance — including these Terms — is between you and the Operator,
        who is solely responsible for the Instance, its configuration, its data, and its users.
      </p>

      <h2>2. Acceptable use</h2>
      <p>
        Use the Instance only for lawful purposes consistent with your organization&rsquo;s policies. Do not
        attempt to circumvent access controls, probe for vulnerabilities without authorization, or use the
        Instance to store or process data you are not authorized to hold.
      </p>

      <h2>3. Calibration and traceability data</h2>
      <p>
        Open Gauge is designed to keep calibration history immutable and traceable — records are versioned
        and never silently overwritten. While the software enforces this at the data-model level, the
        Operator is responsible for its own backup, retention, and disaster-recovery practices. Neither
        this document nor the Open Gauge software guarantees against data loss from infrastructure failure,
        misconfiguration, or Operator error.
      </p>

      <h2>4. No warranty</h2>
      <p>
        As stated in the AGPL-3.0 license, Open Gauge is provided <strong>&ldquo;as is,&rdquo;</strong> without
        warranty of any kind, express or implied, including but not limited to warranties of
        merchantability, fitness for a particular purpose, and non-infringement. The Operator provides no
        additional warranty beyond what its own policies state.
      </p>

      <h2>5. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, neither the Open Gauge project maintainers nor the Operator
        (unless the Operator&rsquo;s own policy states otherwise) shall be liable for any indirect,
        incidental, special, or consequential damages arising from use of the software or an Instance.
      </p>

      <h2>6. Changes to these terms</h2>
      <p>
        The Operator may update these Terms for their Instance at any time. This page is a template shipped
        with Open Gauge — Operators are encouraged to have it reviewed by their own counsel and adapted to
        their jurisdiction and compliance requirements (e.g. ISO/IEC 17025) before relying on it.
      </p>

      <h2>7. Contact</h2>
      <p>
        For questions about these Terms as applied to a specific Instance, contact that Instance&rsquo;s
        administrator directly.
      </p>
    </LegalPageLayout>
  );
}
