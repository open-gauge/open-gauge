import TemplateEditorClient from "./template-editor-client";

// TemplateEditorClient is "use client" and reads its id via useParams() internally, so this
// thin server wrapper only exists so generateStaticParams (disallowed in a "use client" file)
// can live alongside the page. Unlike assets/organizations/users, templates have no seeded
// fixture data to prerender — every template is created live in a demo session. `output:
// "export"` rejects an empty list as if generateStaticParams were missing, so demo mode
// prerenders a single placeholder id instead; any other id gets the same fallback behavior
// those other routes already have for an entity a visitor creates that wasn't in the fixture.
//
// Outside demo mode this returns [] and has no effect (see users/[id]/page.tsx).
export async function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return [];
  return [{ id: "placeholder" }];
}

export default function Page() {
  return <TemplateEditorClient />;
}
