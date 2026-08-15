"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import {
  POLY_LETTERS, extractFormulaParameters, formulaToLatex, polynomialGeneralFormLatex,
} from "@/lib/evaluate-model";
import { Tooltip } from "@/components/tooltip";
import { InfoIcon } from "@/components/icons";

function fmtCoeff(n: number | null | undefined): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 0.0001 || abs >= 100000)) return n.toExponential(4);
  return parseFloat(n.toFixed(6)).toString();
}

// Renders a LaTeX string via KaTeX (dynamically imported — only the Model
// panel needs it, so it shouldn't inflate every other page's bundle). Falls
// back to the raw LaTeX-ish text on any parse error, since a formula
// converted from user input (formulaToLatex) isn't guaranteed to be valid.
export function Katex({ math, className }: { math: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let cancelled = false;
    import("katex").then((katexModule) => {
      if (cancelled || !ref.current) return;
      try {
        katexModule.default.render(math, ref.current, { throwOnError: true, displayMode: false });
      } catch {
        if (ref.current) ref.current.textContent = math;
      }
    });
    return () => { cancelled = true; };
  }, [math]);
  // KaTeX's own CSS doesn't set a color, so its output normally inherits
  // from the nearest ancestor — but body's default `color` (--foreground)
  // isn't theme-aware (unlike --og-text), so without an explicit
  // text-og-text here the formula reads as near-black in dark mode too.
  return <span ref={ref} className={`text-og-text ${className ?? ""}`} />;
}

function FieldTooltip({ tooltip, docsHref }: { tooltip?: string; docsHref?: string }) {
  if (!tooltip) return null;
  return (
    <Tooltip content={tooltip} docsHref={docsHref}>
      <InfoIcon size={11} className="text-gray-400 cursor-help" />
    </Tooltip>
  );
}

// One labeled LaTeX row of the Model panel below — a small tooltip'd label
// above a KaTeX-rendered formula, horizontally scrollable since a degree-5
// polynomial's coefficient list or a long custom formula can overflow the
// panel's width.
function ModelRow({ label, tooltip, latex }: { label: string; tooltip: string; latex: string | null }) {
  return (
    <div>
      <span className="text-[11px] text-gray-400 inline-flex items-center gap-1 mb-1">
        {label}
        <FieldTooltip tooltip={tooltip} />
      </span>
      {latex ? <Katex math={latex} className="block text-sm" /> : <span className="text-xs text-gray-400">…</span>}
    </div>
  );
}

// The "Model" panel — two LaTeX-rendered rows: (1) the equation's general
// shape with letter placeholders instead of numbers, so the *kind* of model
// is obvious at a glance; (2) the numeric value substituted for each letter.
// Shared by the calibration wizard's Step 3 live preview
// (CalibrationWizard.tsx) and the asset page's saved-calibration detail
// panel (asset-detail-client.tsx) — same panel, same rendering, so the two
// views can't drift out of sync the way the tab's old hand-rolled
// equation/coefficients tabs did.
export function ModelPanel({
  isPolynomial, degree, coefficients, formulaTemplate, formulaParamValues,
}: {
  isPolynomial: boolean;
  degree: number;
  coefficients: number[];
  formulaTemplate: string | null;
  formulaParamValues: Record<string, number> | null;
}) {
  const t = useTranslations("assets.wizard");
  const generalFormLatex = isPolynomial
    ? polynomialGeneralFormLatex(degree)
    : (formulaTemplate ? formulaToLatex(formulaTemplate) : null);
  const coeffPairs: [string, number][] = isPolynomial
    ? POLY_LETTERS.slice(0, degree + 1).map((letter, i) => [letter, coefficients[i]])
    : (formulaTemplate && formulaParamValues
      ? (() => {
        try {
          return extractFormulaParameters(formulaTemplate)
            .filter((name) => formulaParamValues[name] != null)
            .map((name) => [name, formulaParamValues[name]] as [string, number]);
        } catch {
          return [];
        }
      })()
      : []);
  const coeffLatex = coeffPairs.length > 0
    ? coeffPairs.map(([letter, value]) => `${letter} = ${fmtCoeff(value)}`).join(",\\ \\ ")
    : null;
  return (
    <div className="px-4 py-3 rounded-lg bg-og-surface-alt border border-og-border space-y-2">
      <p className="text-xs font-semibold text-og-text">{t("model")}</p>
      {/* One shared horizontal scroll region for both rows together — two
          independent overflow-x-auto wrappers (one per row) produced two
          separate scrollbars for a long custom formula/coefficient list. */}
      <div className="overflow-x-auto space-y-2">
        <ModelRow label={t("equation")} tooltip={t("tips.modelGeneralForm")} latex={generalFormLatex} />
        {coeffLatex && <ModelRow label={t("modelCoefficients")} tooltip={t("tips.modelCoefficients")} latex={coeffLatex} />}
      </div>
    </div>
  );
}
