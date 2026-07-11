import { docs } from "collections/server";
import { loader } from "fumadocs-core/source";

// Renders the same Knowledge Center content as apps/docs, inline, inside this app's own
// Sidebar/TopBar shell — see source.config.ts for where the content is actually read from.
export const docsSource = loader({
  baseUrl: "/documentation",
  source: docs.toFumadocsSource(),
});
