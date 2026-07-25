import OrganizationDetailClient from "./organization-detail-client";

// Same shape as users/[id]/page.tsx: OrganizationDetailClient is "use client" and reads its id
// via useParams() internally. This thin server wrapper only exists so generateStaticParams
// (disallowed in a "use client" file) can prerender every fixture organization id for demo
// mode's static export.
export async function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return [];

  const { listOrganizations } = await import("@/lib/demo/store");
  return listOrganizations().map((org) => ({ id: org.id }));
}

export default function Page() {
  return <OrganizationDetailClient />;
}
