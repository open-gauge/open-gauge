import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Terms of Service — Open Gauge",
  description: "Terms governing the use of a self-hosted Open Gauge instance.",
};

export default async function TermsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.terms");

  return (
    <LegalPageLayout title={t("title")} updated={t("updated")}>
      <p>
        {t.rich("intro", {
          link: (chunks) => (
            <a href="https://www.gnu.org/licenses/agpl-3.0.html" target="_blank" rel="noopener noreferrer">
              {chunks}
            </a>
          ),
        })}
      </p>

      <h2>{t("section1Title")}</h2>
      <p>{t("section1Body")}</p>

      <h2>{t("section2Title")}</h2>
      <p>{t("section2Body")}</p>

      <h2>{t("section3Title")}</h2>
      <p>{t("section3Body")}</p>

      <h2>{t("section4Title")}</h2>
      <p>
        {t.rich("section4Body", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>

      <h2>{t("section5Title")}</h2>
      <p>{t("section5Body")}</p>

      <h2>{t("section6Title")}</h2>
      <p>{t("section6Body")}</p>

      <h2>{t("section7Title")}</h2>
      <p>{t("section7Body")}</p>
    </LegalPageLayout>
  );
}
