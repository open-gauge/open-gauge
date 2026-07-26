import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { BookOpen, Code } from "lucide-react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { source } from "@/lib/source";
import { baseOptions } from "@/lib/layout.shared";
import { attachMethodBadges } from "@/lib/method-badges";
import { i18n, i18nUI } from "@/lib/i18n";

// The "Documentation" / "API Reference" root switcher is auto-derived by
// Fumadocs from the two root: true folders (content/docs/guide, .../api) —
// this only adds an icon per tab, title/description stay sourced from each
// folder's meta.json so they can't drift out of sync.
function withTabIcon(tab: LayoutTab): LayoutTab {
  const isApiTab = tab.url.includes("/docs/api");
  return {
    ...tab,
    icon: isApiTab
      ? <Code className="size-4 text-yellow-500" />
      : <BookOpen className="size-4 text-blue-500" />,
  };
}

interface LayoutParams {
  params: Promise<{ lang: string }>;
}

export default async function Layout({ children, params }: { children: ReactNode } & LayoutParams) {
  const { lang } = await params;
  if (!i18n.languages.includes(lang as (typeof i18n.languages)[number]) || lang === i18n.defaultLanguage) {
    notFound();
  }

  return (
    <RootProvider search={{ options: { type: "static" } }} i18n={i18nUI.provider(lang)}>
      {/* Root layout's <html lang> defaults to "en" (shared by the unprefixed English tree) —
          correct it client-side for the other locales rendered under this branch. */}
      <script
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: `document.documentElement.lang=${JSON.stringify(lang)};` }}
      />
      <DocsLayout
        tree={attachMethodBadges(source.getPageTree(lang), source)}
        tabs={{ transform: (tab) => withTabIcon(tab) }}
        {...baseOptions()}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
