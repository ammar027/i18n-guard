import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveConfig } from "../src/config.js";
import { runGuard, type RunOptions } from "../src/runner.js";
import type { DeepPartial, GuardConfig, Issue } from "../src/types.js";

export function project(files: Record<string, unknown>): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "i18n-guard-"));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof content === "string" ? content : JSON.stringify(content, null, 2));
  }
  return root;
}

export const BASE_FILES = {
  "src/locales/en/common.json": { save: "Save changes", greeting: "Hello {{name}}", items_one: "{{count}} item", items_other: "{{count}} items" },
  "src/locales/de/common.json": { save: "Änderungen speichern", greeting: "Hallo {{name}}", items_one: "{{count}} Eintrag", items_other: "{{count}} Einträge" },
  "src/App.tsx": `export const A = () => <b>{t("common:save")}{t("greeting")}{t("items", { count: 2 })}</b>;`,
};

export function cfg(root: string, extra: DeepPartial<GuardConfig> = {}): GuardConfig {
  return resolveConfig({ locales: { languages: ["en", "de"] }, checks: { eslint: false }, ...extra } as DeepPartial<GuardConfig>, root);
}

export async function run(files: Record<string, unknown>, extra: DeepPartial<GuardConfig> = {}, opts: RunOptions = {}): Promise<Issue[]> {
  const root = project({ ...BASE_FILES, ...files });
  return (await runGuard(cfg(root, extra), { noBaseline: true, ...opts })).issues;
}

export const byCheck = (issues: Issue[], check: string): Issue[] => issues.filter((i) => i.check === check);
