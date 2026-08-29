import { redirect } from "@/i18n/navigation";

// The Document Templates list moved into the Admin panel's "Templates" section (which now also
// lists LaTeX certificate templates) — this route only exists so a bookmarked/old link still
// lands somewhere useful instead of 404ing. The editor itself is still at /templates/[id].
export default async function TemplatesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect({ href: "/admin", locale });
}
