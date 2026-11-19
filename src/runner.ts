import { spawnSync } from "node:child_process";
import type { Check, GuardConfig, Issue } from "./types.js";
import { applyBaseline, loadBaseline, writeBaseline } from "./baseline.js";
import { loadLocales } from "./locales.js";
import { hygiene, parity, placeholders, untranslated, variables } from "./checks/locale.js";
import { idMaps, missingKeys, unusedKeys } from "./checks/keys.js";
import { eslintCheck } from "./checks/eslint.js";
import { coverage } from "./checks/coverage.js";
import { applyInlineIgnores } from "./ignore.js";
import { isRequired } from "./checks/coverage.js";
import { fixSortedKeys, sortedKeys, syntax, types } from "./checks/structure.js";

type Flag = keyof GuardConfig["checks"];
export const CHECKS: ReadonlyArray<readonly [Flag, Check]> = [
  ["parity", parity], ["untranslated", untranslated], ["placeholders", placeholders], ["variables", variables],
  ["hygiene", hygiene], ["missingKeys", missingKeys], ["unusedKeys", unusedKeys], ["idMaps", idMaps], ["types", types], ["syntax", syntax], ["sortedKeys", sortedKeys], ["coverage", coverage], ["eslint", eslintCheck],
];

export interface RunOptions {
  readonly staged?: boolean;
  readonly strict?: boolean;
  readonly only?: readonly string[];
  /** Ignore the baseline and write a new one from the current findings. */
  readonly updateBaseline?: boolean;
  readonly noBaseline?: boolean;
  /** Rewrite locale files to fix what is auto-fixable (currently: key order) before checking. */
  readonly fix?: boolean;
}

export interface RunResult {
  readonly issues: Issue[];
  readonly baselined: number;
  readonly ran: string[];
  readonly skipped: string[];
  readonly failed: boolean;
  readonly baselineWritten?: number;
  /** Files rewritten by --fix. */
  readonly fixed?: string[];
}

export function stagedFiles(root: string): Set<string> {
  const r = spawnSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], { cwd: root, encoding: "utf8" });
  return new Set(r.status === 0 ? r.stdout.split("\n").map((s) => s.trim()).filter(Boolean) : []);
}

export async function runGuard(config: GuardConfig, opts: RunOptions = {}): Promise<RunResult> {
  const staged = opts.staged ? stagedFiles(config.root) : null;
  const fixed = opts.fix ? fixSortedKeys(config) : [];
  const locales = loadLocales(config);
  const ctx = { config, locales, staged };
  const raw: Issue[] = [];
  const ran: string[] = [];
  const skipped: string[] = [];
  for (const [flag, check] of CHECKS) {
    const wanted = opts.only?.length ? opts.only.includes(check.name) : config.checks[flag];
    if (!wanted) continue;
    if (staged && check.wholeProject && !opts.only?.includes(check.name) && !["parity", "untranslated", "placeholders", "variables", "hygiene", "coverage"].includes(check.name)) {
      skipped.push(check.name);
      continue;
    }
    raw.push(...(await check.run(ctx)));
    ran.push(check.name);
  }
  // Optional locales: findings that belong to a non-required language are warnings.
  const leveled: Issue[] = raw.map((i) => (i.locale && i.severity === "error" && !isRequired(config, i.locale) ? { ...i, severity: "warning" as const } : i));
  // Inline `i18n-guard-ignore` comments.
  const afterIgnore = applyInlineIgnores(config, leveled, CHECKS.map(([, c]) => c.name), { staged: staged !== null, ran });
  if (opts.updateBaseline) {
    const n = writeBaseline(config, afterIgnore.filter((i) => i.severity === "error" && i.check !== "ignore"));
    return { issues: [], baselined: 0, ran, skipped, failed: false, baselineWritten: n };
  }
  let issues = afterIgnore;
  let baselined = 0;
  if (!opts.noBaseline) {
    const a = applyBaseline(afterIgnore, loadBaseline(config), new Set(staged ? [] : ran));
    issues = a.issues;
    baselined = a.baselined;
    for (const id of a.stale) {
      issues.push({ check: "baseline", severity: "warning", message: `Baseline entry no longer matches (fixed): ${id}. Run: i18n-guard baseline`, id: `baseline:${id}` });
    }
  }
  const failed = issues.some((i) => i.severity === "error" || (opts.strict === true && i.severity === "warning"));
  return { issues, baselined, ran, skipped, failed, fixed };
}
