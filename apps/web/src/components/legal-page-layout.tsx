import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import ThemeToggle from "@/components/theme-toggle";

// The `children` legal body text (Privacy Policy / Terms of Service content) is intentionally
// left English-only — see apps/web/src/app/[locale]/privacy/page.tsx and .../terms/page.tsx.
// Machine-translating legal/compliance text carries real risk and these pages are explicitly a
// template operators are told to have reviewed by their own counsel; only this layout's UI
// chrome (nav, footer, cross-links) is translated.
export async function LegalPageLayout({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("common.legalPage");
  return (
    <div className="min-h-screen bg-[#dce8ec] dark:bg-og-bg og-grid-bg">
      <div className="flex flex-col min-h-screen">
        <nav className="flex items-center justify-between px-8 py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <Image src="/assets/Logo dark.png" alt="Open Gauge" width={140} height={28} className="block dark:hidden" />
            <Image src="/assets/Logo light.png" alt="Open Gauge" width={140} height={28} className="hidden dark:block" />
          </Link>
          <ThemeToggle />
        </nav>

        <main className="flex-1 px-8 py-8">
          <div className="max-w-2xl mx-auto bg-og-surface rounded-2xl shadow-xl border border-og-border p-8 md:p-10">
            <h1 className="text-2xl font-bold text-og-text">{title}</h1>
            <p className="text-xs text-gray-400 mt-1 mb-8">{t("lastUpdated", { date: updated })}</p>
            <div className="space-y-5 text-sm text-gray-600 dark:text-gray-300 leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-og-text [&_h2]:mt-6 [&_h2]:mb-2 [&_a]:text-og-accent [&_a]:underline">
              {children}
            </div>
          </div>
          <p className="max-w-2xl mx-auto mt-4 text-xs text-gray-400 dark:text-gray-500">
            <Link href="/terms" className="hover:text-og-accent transition-colors">{t("termsOfService")}</Link>
            {" · "}
            <Link href="/privacy" className="hover:text-og-accent transition-colors">{t("privacyPolicy")}</Link>
            {" · "}
            <Link href="/" className="hover:text-og-accent transition-colors">{t("backToSignIn")}</Link>
          </p>
        </main>

        <footer className="flex items-center justify-between px-8 py-4 text-xs text-gray-400">
          <span>{t("copyright")}</span>
        </footer>
      </div>
    </div>
  );
}
