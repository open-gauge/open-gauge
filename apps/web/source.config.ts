import { defineDocs, defineConfig } from "fumadocs-mdx/config";
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";

// Reads the same Knowledge Center content apps/docs owns — apps/web renders it inline using
// Fumadocs' real components (see src/mdx-components.tsx) instead of duplicating the content.
// In local dev this is a relative sibling path; in Docker it's copied into the image at a fixed
// absolute path (see apps/web/Dockerfile) since the two apps build as separate images.
export const docs = defineDocs({
  dir: process.env.DOCS_CONTENT_DIR ?? "../docs/content/docs/guide",
});

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [remarkMath],
    rehypePlugins: (plugins) => [rehypeKatex, ...plugins],
  },
});
