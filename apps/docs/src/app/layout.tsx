import type { ReactNode } from "react";
import type { Metadata } from "next";
import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Open Gauge Documentation",
    default: "Open Gauge Documentation",
  },
  description: "Knowledge center and API reference for Open Gauge.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        {/* type: "static" reads the prebuilt index from /api/search and
            searches client-side — no server required (static export). */}
        <RootProvider search={{ options: { type: "static" } }}>{children}</RootProvider>
      </body>
    </html>
  );
}
