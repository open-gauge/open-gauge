import type { Metadata } from "next";
import localFont from "next/font/local";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import "../globals.css";
import { ThemeProvider } from "@/store/theme";
import { routing } from "@/i18n/routing";
import { getLocaleMeta } from "@/i18n/locales";
import { GoogleAnalytics } from "@/components/google-analytics";

const geistSans = localFont({
  src: "../fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "../fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: {
    default: "Open Gauge — Open Gauge",
    template: "%s · Open Gauge",
  },
  description:
    "Version control for metrology. Manage sensors, calibration coefficients, and traceable certificates.",
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();

  // Enables static rendering for this locale (required for the demo static-export build).
  setRequestLocale(locale);

  const { dir } = getLocaleMeta(locale);

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {/* Inline script prevents flash of unstyled content on page load */}
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `try{const t=localStorage.getItem('og_theme');const d=t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(_){}`,
          }}
        />
        <GoogleAnalytics />
        <NextIntlClientProvider>
          <ThemeProvider>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
