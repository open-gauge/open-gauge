import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { DocsBody } from "fumadocs-ui/layouts/docs/page";
import { getApiNavGroups, getApiSource } from "@/lib/api-docs-source";
import { OpenAPIPage } from "@/components/api-openapi-page";
import { HTTP_METHOD_STYLE } from "@/lib/tokens";
import { isDemoMode } from "@/lib/demo/is-demo-mode";

// Resolved per-request against the live api service, never at build time — see
// api-docs-source.ts. Static generation would need the api reachable during `docker build`,
// which Docker Compose can't guarantee (the api container is only up once containers are
// *running*), so this route is intentionally left fully dynamic.
//
// This must stay a literal string — Next's route segment config is parsed from the AST at
// build time and can't be a computed/conditional expression, even one keyed off
// NEXT_PUBLIC_DEMO_MODE. Demo mode's static export (which drops this page in favor of a static
// notice below, since the interactive reference isn't included — see ApiReferenceDemoNotice)
// instead patches this literal at build time and restores it afterward — see
// apps/web/scripts/build-demo.mjs. Do not change this line to a ternary.
export const dynamic = "force-dynamic";

interface PageParams {
  params: Promise<{ slug?: string[] }>;
}

// Static export can't enumerate every possible OpenAPI slug (there is no live schema at build
// time in demo mode), so only the index path is prerendered; it renders ApiReferenceDemoNotice
// below regardless of slug. Outside demo mode this returns [] and has no effect — the route
// stays fully dynamic via `dynamic` above, exactly as before.
export function generateStaticParams() {
  if (!isDemoMode()) return [];
  return [{ slug: [] }];
}

export default async function ApiReferencePage({ params }: PageParams) {
  if (isDemoMode()) {
    return <ApiReferenceDemoNotice />;
  }

  const { slug } = await params;

  if (!slug || slug.length === 0) {
    return <ApiOverview />;
  }

  let apiSource;
  try {
    apiSource = await getApiSource();
  } catch (err) {
    return <ApiUnavailable error={err} />;
  }

  const page = apiSource.getPage(slug);
  if (!page) notFound();

  const openApiProps = page.data.getOpenAPIPageProps();

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center gap-2.5">
        {page.data._openapi?.method && (
          <span
            className={`shrink-0 px-2 py-1 rounded text-[11px] font-bold tracking-wide ${
              HTTP_METHOD_STYLE[page.data._openapi.method.toUpperCase()] ?? "bg-gray-100 text-gray-500"
            }`}
          >
            {page.data._openapi.method.toUpperCase()}
          </span>
        )}
        <h1 className="text-xl font-bold text-og-text">{page.data.title}</h1>
      </div>
      {page.data.description && <p className="text-sm text-gray-400">{page.data.description}</p>}

      <div className="bg-og-surface rounded-xl border border-og-border shadow-sm p-6">
        <DocsBody>
          <OpenAPIPage {...openApiProps} />
        </DocsBody>
      </div>
    </div>
  );
}

async function ApiOverview() {
  let groups;
  try {
    groups = await getApiNavGroups();
  } catch (err) {
    return <ApiUnavailable error={err} />;
  }

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-og-text">API Reference</h1>
        <p className="text-sm text-gray-400 mt-1">
          All Open Gauge functionality is available over a REST API at <code>/api/v1</code>, documented here
          directly from the live OpenAPI schema.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {groups.map((group) => (
          <div
            key={group.title}
            className="bg-og-surface rounded-xl border border-og-border shadow-sm p-4 space-y-2"
          >
            <p className="text-sm font-semibold text-og-text">{group.title}</p>
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.url}>
                  <Link
                    href={item.url}
                    className="flex items-center justify-between gap-2 text-xs text-gray-500 hover:text-og-accent dark:text-gray-400 transition-colors"
                  >
                    <span className="truncate">{item.title}</span>
                    {item.method && (
                      <span
                        className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${
                          HTTP_METHOD_STYLE[item.method.toUpperCase()] ?? "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {item.method.toUpperCase()}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}

function ApiReferenceDemoNotice() {
  return (
    <div className="p-6">
      <div className="bg-og-surface rounded-xl border border-og-border shadow-sm p-6 text-center">
        <h1 className="text-sm font-semibold text-og-text">API Reference</h1>
        <p className="text-xs text-gray-400 mt-1">
          The interactive API Reference isn&apos;t included in this demo — see the full API reference at{" "}
          <a
            href="https://docs.opengauge.org"
            target="_blank"
            rel="noreferrer"
            className="text-og-accent hover:underline"
          >
            docs.opengauge.org
          </a>
          .
        </p>
      </div>
    </div>
  );
}

function ApiUnavailable({ error }: { error: unknown }) {
  console.error("[documentation/api] could not load the OpenAPI schema", error);
  return (
    <div className="p-6">
      <div className="bg-og-surface rounded-xl border border-og-border shadow-sm p-6 text-center">
        <h1 className="text-sm font-semibold text-og-text">API Reference unavailable</h1>
        <p className="text-xs text-gray-400 mt-1">
          Couldn&apos;t reach the Open Gauge API to load its OpenAPI schema. Make sure the <code>api</code>{" "}
          service is running, then reload this page.
        </p>
      </div>
    </div>
  );
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  if (isDemoMode()) return { title: "API Reference" };

  const { slug } = await params;
  if (!slug || slug.length === 0) return { title: "API Reference" };

  try {
    const apiSource = await getApiSource();
    const page = apiSource.getPage(slug);
    if (!page) return {};
    return { title: page.data.title, description: page.data.description };
  } catch {
    return { title: "API Reference" };
  }
}
