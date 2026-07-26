import type { ReactNode } from "react";
import { BookOpen, Code } from "lucide-react";
import { RootProvider } from "fumadocs-ui/provider/next";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { LayoutTab } from "fumadocs-ui/layouts/shared";
import { source } from "@/lib/source";
import { baseOptions } from "@/lib/layout.shared";
import { attachMethodBadges } from "@/lib/method-badges";
import { i18nUI } from "@/lib/i18n";

// The "Documentation" / "API Reference" root switcher is auto-derived by
// Fumadocs from the two root: true folders (content/docs/guide, .../api) —
// this only adds an icon per tab, title/description stay sourced from each
// folder's meta.json so they can't drift out of sync.
function withTabIcon(tab: LayoutTab): LayoutTab {
  const isApiTab = tab.url === "/docs/api" || tab.url.startsWith("/docs/api/");
  return {
    ...tab,
    icon: isApiTab
      ? <Code className="size-4 text-yellow-500" />
      : <BookOpen className="size-4 text-blue-500" />,
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider search={{ options: { type: "static" } }} i18n={i18nUI.provider("en")}>
      <DocsLayout
        tree={attachMethodBadges(source.getPageTree("en"), source)}
        tabs={{ transform: (tab) => withTabIcon(tab) }}
        {...baseOptions()}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
