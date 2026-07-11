import { InfoIcon } from "@/components/icons";
import { Tooltip } from "@/components/tooltip";

// Shared by the calibration wizard's live analysis panel (CalibrationWizard.tsx) and the
// asset page's historical-calibration detail panel (page.tsx) — same row, same tooltip.
export function StatRow({
  label,
  value,
  tip,
  docsHref,
}: {
  label: string;
  value: string | null | undefined;
  tip?: string;
  docsHref?: string;
}) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-og-border last:border-b-0">
      <span className="flex items-center gap-1 text-xs text-gray-400">
        {label}
        {tip && (
          <Tooltip content={tip} docsHref={docsHref}>
            <InfoIcon size={10} className="cursor-help" />
          </Tooltip>
        )}
      </span>
      <span className="text-xs font-mono text-og-text">{value}</span>
    </div>
  );
}
