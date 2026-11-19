import type { Check, CheckContext, Issue } from "../types.js";
import { namespacesOf } from "../locales.js";
import { falsePositive } from "./locale.js";

export interface CoverageRow {
  readonly lang: string;
  readonly total: number;
  readonly translated: number;
  readonly percent: number;
  readonly required: boolean;
  readonly min?: number;
}

export const isRequired = (config: CheckContext["config"], lang: string): boolean =>
  config.locales.required.length === 0 || config.locales.required.includes(lang) || lang === config.locales.default;

/** Share of default-language keys that have a real translation (present, non-empty, not a copy of the default). */
export function computeCoverage(ctx: CheckContext): CoverageRow[] {
  const def = ctx.config.locales.default;
  const min = ctx.config.options.minCoverage;
  const rows: CoverageRow[] = [];
  for (const lang of ctx.config.locales.languages) {
    let total = 0;
    let translated = 0;
    for (const ns of namespacesOf(ctx.config)) {
      const base = ctx.locales.get(def)?.get(ns);
      const f = ctx.locales.get(lang)?.get(ns);
      for (const [key, en] of Object.entries(base?.values ?? {})) {
        if (typeof en !== "string") continue;
        total++;
        const v = f?.values[key];
        if (typeof v !== "string" || v.trim() === "") continue;
        if (lang !== def && v === en && !falsePositive(ctx, key, en)) continue;
        const mk = ctx.config.options.syncMarker.trim();
        if (lang !== def && mk && v.trimStart().startsWith(mk)) continue;
        translated++;
      }
    }
    rows.push({
      lang, total, translated,
      percent: total === 0 ? 100 : Math.floor((translated / total) * 1000) / 10,
      required: isRequired(ctx.config, lang),
      min: typeof min === "number" ? min : min?.[lang],
    });
  }
  return rows;
}

export const coverage: Check = {
  name: "coverage",
  description: "Per-language translated share meets options.minCoverage",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    if (ctx.config.options.minCoverage === undefined) return out;
    for (const r of computeCoverage(ctx)) {
      if (r.min === undefined || r.percent >= r.min) continue;
      out.push({
        check: "coverage", severity: "error", locale: r.lang,
        message: `${r.lang} is ${r.percent}% translated (${r.translated}/${r.total}); minimum is ${r.min}%.`,
        id: `coverage:${r.lang}`,
      });
    }
    return out;
  },
};
