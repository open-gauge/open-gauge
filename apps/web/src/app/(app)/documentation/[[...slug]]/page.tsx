import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { DocsBody } from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { TOCItemType } from "fumadocs-core/toc";
import { docsSource } from "@/lib/docs-source";
import { getMDXComponents } from "@/mdx-components";

interface PageParams {
  params: Promise<{ slug?: string[] }>;
}

export default async function DocumentationPage({ params }: PageParams) {
  const { slug } = await params;

  if (!slug || slug.length === 0) {
    const first = docsSource.getPages()[0];
    redirect(first ? first.url : "/dashboard");
  }

  const page = docsSource.getPage(slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const toc = page.data.toc;

  return (
    <div className="p-6 space-y-5">
      <div>
        <h1 className="text-xl font-bold text-mar-text">{page.data.title}</h1>
        {page.data.description && (
          <p className="text-sm text-gray-400 mt-1">{page.data.description}</p>
        )}
      </div>

      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0 bg-mar-surface rounded-xl border border-mar-border shadow-sm p-6">
          <DocsBody>
            <MDX
              components={getMDXComponents({
                a: createRelativeLink(docsSource, page),
              })}
            />
          </DocsBody>
        </div>

        {toc.length > 0 && (
          <div className="hidden xl:block w-56 flex-shrink-0 bg-mar-surface rounded-xl border border-mar-border shadow-sm sticky top-0 max-h-[calc(100vh-180px)] overflow-y-auto p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">
              On this page
            </p>
            <nav className="space-y-1.5 text-xs">
              {toc.map((item: TOCItemType) => (
                <a
                  key={item.url}
                  href={item.url}
                  style={{ paddingLeft: `${(item.depth - 2) * 12}px` }}
                  className="block text-gray-500 hover:text-mar-accent dark:text-gray-400 truncate transition-colors"
                >
                  {item.title}
                </a>
              ))}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}

export function generateStaticParams() {
  return docsSource.generateParams();
}

export async function generateMetadata({ params }: PageParams): Promise<Metadata> {
  const { slug } = await params;
  if (!slug || slug.length === 0) return {};

  const page = docsSource.getPage(slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}
