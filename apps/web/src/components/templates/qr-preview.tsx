"use client";

import { useEffect, useState } from "react";

const ERROR_CORRECTION: Record<string, "L" | "M" | "Q" | "H"> = { L: "L", M: "M", Q: "Q", H: "H" };

interface QrPreviewProps {
  text: string;
  sizePx: number;
  errorCorrection: "L" | "M" | "Q" | "H";
  quietZone: number;
  className?: string;
}

/** Renders a live QR code for the editor's own preview — the final PDF renders its own QR
 * server-side from the resolved payload at generation time (see AGENTS.md File Storage). */
export function QrPreview({ text, sizePx, errorCorrection, quietZone, className }: QrPreviewProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!text) {
      setDataUrl(null);
      return;
    }
    import("qrcode").then((QRCode) => {
      if (cancelled) return;
      QRCode.toDataURL(text, {
        width: sizePx,
        margin: quietZone,
        errorCorrectionLevel: ERROR_CORRECTION[errorCorrection] ?? "M",
      })
        .then((url) => !cancelled && setDataUrl(url))
        .catch(() => !cancelled && setDataUrl(null));
    });
    return () => {
      cancelled = true;
    };
  }, [text, sizePx, errorCorrection, quietZone]);

  if (!dataUrl) {
    return (
      <div
        className={`flex items-center justify-center bg-og-surface-alt border border-og-border-md rounded ${className ?? ""}`}
        style={{ width: sizePx, height: sizePx }}
      />
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={dataUrl} alt="" width={sizePx} height={sizePx} className={className} />;
}
