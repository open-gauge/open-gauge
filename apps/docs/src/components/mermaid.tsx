"use client";

import { useEffect, useId, useState } from "react";
import { useTheme } from "fumadocs-ui/provider/base";

/** Renders a ```mermaid code fence — fumadocs-core's remarkMdxMermaid plugin
 * (wired up in source.config.ts) rewrites the fence into <Mermaid chart="..." />,
 * this component turns that chart source into SVG client-side, matching the
 * viewer's light/dark theme. */
export function Mermaid({ chart }: { chart: string }) {
  const id = useId().replace(/[:]/g, "");
  const [svg, setSvg] = useState("");
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { default: mermaid } = await import("mermaid");
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "inherit",
        theme: resolvedTheme === "dark" ? "dark" : "default",
      });
      try {
        const { svg: rendered } = await mermaid.render(`mermaid-${id}`, chart.trim());
        if (!cancelled) setSvg(rendered);
      } catch (e) {
        if (!cancelled) setSvg(`<pre style="color:red">${e instanceof Error ? e.message : "Failed to render diagram"}</pre>`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id, resolvedTheme]);

  return (
    <div
      className="my-4 flex justify-center overflow-x-auto rounded-lg border border-fd-border bg-fd-card p-4 [&_svg]:max-w-full"
      // eslint-disable-next-line react/no-danger -- SVG produced by mermaid.render, not user input
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
