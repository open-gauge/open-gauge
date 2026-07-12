import { visit } from "fumadocs-core/page-tree";
import type * as PageTree from "fumadocs-core/page-tree";
import { MethodBadge } from "@/components/method-badge";
import type { source } from "./source";

/**
 * Attaches an HTTP method badge (GET/POST/…) to each API Reference sidebar
 * item, read from the `_openapi.method` frontmatter that generate-openapi.mjs
 * writes into every generated operation page. Mutates and returns the same
 * tree instance — call once per request, right before handing it to DocsLayout.
 */
export function attachMethodBadges(tree: PageTree.Root, docsSource: typeof source): PageTree.Root {
  const methodByUrl = new Map<string, string>();
  for (const page of docsSource.getPages()) {
    const method = (page.data as { _openapi?: { method?: string } })._openapi?.method;
    if (method) methodByUrl.set(page.url, method);
  }

  visit(tree, (node) => {
    if (node.type === "page" && typeof node.name === "string") {
      const method = methodByUrl.get(node.url);
      if (method) {
        node.name = (
          <span className="flex items-center gap-2 min-w-0">
            <MethodBadge method={method} />
            <span className="truncate">{node.name}</span>
          </span>
        );
      }
    }
  });

  return tree;
}
