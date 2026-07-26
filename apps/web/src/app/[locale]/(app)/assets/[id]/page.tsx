import AssetDetailClient from "./asset-detail-client";

// AssetDetailClient is "use client" and reads its id via useParams() internally, so this thin
// server wrapper doesn't need to pass params down — it exists only so generateStaticParams
// (disallowed in a "use client" file) can live alongside the page for demo mode's static
// export, which must prerender every fixture asset id ahead of time (there is no server to
// render a page on demand once the site is exported as static files).
//
// Outside demo mode this returns [] and has no effect: with `output: "standalone"` an empty
// generateStaticParams is harmless — the route still renders on demand per request exactly as
// it did before this file existed, since dynamicParams defaults to true.
export async function generateStaticParams() {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") return [];

  const { listAssets } = await import("@/lib/demo/store");
  return listAssets({}).map((asset) => ({ id: asset.id }));
}

export default function Page() {
  return <AssetDetailClient />;
}
