import type { ReactNode } from "react";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    template: "%s | Open Gauge Documentation",
    default: "Open Gauge Documentation",
  },
  description: "Knowledge center and API reference for Open Gauge.",
};

// `<html lang>` defaults to "en" here since this shell is shared by both the unprefixed
// English tree (app/docs) and the app/[lang]/docs tree — each of those sets the correct
// value client-side via the inline script rendered in their own layout.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">{children}</body>
    </html>
  );
}
