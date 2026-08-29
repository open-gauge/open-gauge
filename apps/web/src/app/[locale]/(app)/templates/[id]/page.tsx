import TemplateEditorClient from "./template-editor-client";

// TemplateEditorClient is "use client" and reads its id via useParams() internally, so this
// thin server wrapper only exists so generateStaticParams (disallowed in a "use client" file)
// can live alongside the page. Unlike assets/organizations/users, templates have no seeded
// fixture data to prerender — every template is created live in a demo session — so this
// intentionally returns [] even in demo mode, the same fallback behavior those other routes
// already have for any entity a visitor creates that wasn't in the fixture.
export async function generateStaticParams() {
  return [];
}

export default function Page() {
  return <TemplateEditorClient />;
}
