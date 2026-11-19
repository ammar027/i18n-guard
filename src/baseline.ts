import fs from "node:fs";
import path from "node:path";
import type { BaselineFile, GuardConfig, Issue } from "./types.js";

export const baselinePath = (c: GuardConfig): string => path.join(c.root, c.baseline.file);

export function loadBaseline(c: GuardConfig): Record<string, number> {
  try {
    return (JSON.parse(fs.readFileSync(baselinePath(c), "utf8")) as BaselineFile).entries ?? {};
  } catch {
    return {};
  }
}

export function writeBaseline(c: GuardConfig, issues: readonly Issue[]): number {
  const entries: Record<string, number> = {};
  for (const i of issues) if (i.id.indexOf(":") > 0 && !/:(not-installed|run-failed)$/.test(i.id)) entries[i.id] = (entries[i.id] ?? 0) + 1;
  const sorted = Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)));
  const file: BaselineFile = {
    _note: "Known findings. New ones fail; shrink this file as they are fixed (i18n-guard baseline).",
    entries: sorted,
  };
  fs.writeFileSync(baselinePath(c), `${JSON.stringify(file, null, 2)}\n`);
  return Object.values(sorted).reduce((a, b) => a + b, 0);
}

export interface Applied {
  readonly issues: Issue[];
  readonly baselined: number;
  readonly stale: string[];
}

/** Drop findings covered by the baseline; report baseline entries that no longer match (fixed). */
export function applyBaseline(issues: readonly Issue[], base: Record<string, number>, ranChecks: ReadonlySet<string>): Applied {
  const used: Record<string, number> = {};
  const kept: Issue[] = [];
  let baselined = 0;
  for (const i of issues) {
    const left = (base[i.id] ?? 0) - (used[i.id] ?? 0);
    if (left > 0) {
      used[i.id] = (used[i.id] ?? 0) + 1;
      baselined++;
    } else kept.push(i);
  }
  const stale = Object.entries(base)
    .filter(([id, n]) => ranChecks.has(id.slice(0, id.indexOf(":"))) && n > (used[id] ?? 0))
    .map(([id]) => id);
  return { issues: kept, baselined, stale };
}
