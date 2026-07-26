import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { LegalPageLayout } from "@/components/legal-page-layout";

export const metadata: Metadata = {
  title: "Privacy Policy — Open Gauge",
  description: "How a self-hosted Open Gauge instance handles personal and organizational data.",
};

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("legal.privacy");

  return (
    <LegalPageLayout title={t("title")} updated={t("updated")}>
      <p>{t("intro")}</p>

      <h2>{t("section1Title")}</h2>
      <p>{t("section1Body")}</p>

      <h2>{t("section2Title")}</h2>
      <p>{t("section2Body")}</p>

      <h2>{t("section3Title")}</h2>
      <p>{t("section3Body")}</p>

      <h2>{t("section4Title")}</h2>
      <p>{t("section4Body")}</p>

      <h2>{t("section5Title")}</h2>
      <p>{t("section5Body")}</p>
      {process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID && <p>{t("section5AnalyticsNotice")}</p>}

      <h2>{t("section6Title")}</h2>
      <p>{t("section6Body")}</p>

      <h2>{t("section7Title")}</h2>
      <p>{t("section7Body")}</p>

      <h2>{t("section8Title")}</h2>
      <p>{t("section8Body")}</p>
    </LegalPageLayout>
  );
}
