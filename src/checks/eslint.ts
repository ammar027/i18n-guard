import fs from "node:fs";
import path from "node:path";
import type { Check, Issue } from "../types.js";
import { toPosix } from "../util.js";

const DEFAULT_MATCH = ["Hardcoded", "not translatable", "English fallback", "as any"];
const DEFAULT_RULES = ["i18next/no-literal-string", "vue/no-bare-strings-in-template"];

/** Runs your ESLint config and keeps only the i18n findings (see the `@ammar-multani/i18n-guard/eslint` presets). */
export const eslintCheck: Check = {
  name: "eslint",
  description: "Hardcoded copy found by ESLint (JSX text, attributes, toasts, template literals, English fallbacks)",
  wholeProject: false,
  async run(ctx) {
    let mod: typeof import("eslint");
    try {
      mod = await import("eslint");
    } catch {
      return [{ check: "eslint", severity: "warning", message: "ESLint is not installed; hardcoded-copy check skipped.", id: "eslint:not-installed" }];
    }
    const out: Issue[] = [];
    const targets = ctx.config.eslint.length ? ctx.config.eslint : [{ cwd: ".", files: ["src/**/*.{ts,tsx,js,jsx,vue}"], messageMatch: [], ruleIds: [] }];
    for (const t of targets) {
      const cwd = path.join(ctx.config.root, t.cwd);
      if (!fs.existsSync(cwd)) continue;
      const eslint = new mod.ESLint({ cwd, cache: true, cacheLocation: path.join(ctx.config.root, ".cache", `eslintcache-${toPosix(t.cwd).replace(/\W/g, "_")}`) });
      let files: string[] = [...t.files];
      if (ctx.staged) {
        const rel = toPosix(path.relative(ctx.config.root, cwd));
        files = [...ctx.staged].filter((f) => (!rel || f.startsWith(`${rel}/`)) && /\.(tsx?|jsx?|vue)$/.test(f)).map((f) => path.join(ctx.config.root, f));
        const keep: string[] = [];
        for (const f of files) if (fs.existsSync(f) && !(await eslint.isPathIgnored(f))) keep.push(f);
        files = keep;
        if (!files.length) continue;
      }
      const match = [...DEFAULT_MATCH, ...t.messageMatch].map((s) => s.toLowerCase());
      const rules = new Set([...DEFAULT_RULES, ...t.ruleIds]);
      let results: Awaited<ReturnType<typeof eslint.lintFiles>>;
      try {
        results = await eslint.lintFiles(files);
      } catch (e) {
        out.push({ check: "eslint", severity: "error", message: `ESLint could not run in "${t.cwd}": ${(e as Error).message.split("\n")[0]}. Add the i18n-guard preset to eslint.config.js (docs/ADOPTION.md).`, id: "eslint:run-failed" });
        continue;
      }
      for (const r of results) {
        const rel = toPosix(path.relative(ctx.config.root, r.filePath));
        const lines = (r.source ?? fs.readFileSync(r.filePath, "utf8")).split("\n");
        for (const m of r.messages) {
          const hit = (m.ruleId && rules.has(m.ruleId)) || (m.ruleId === "no-restricted-syntax" && match.some((x) => m.message.toLowerCase().includes(x)));
          if (!hit) continue;
          const src = (lines[m.line - 1] ?? "").trim().replace(/\s+/g, " ").slice(0, 160);
          out.push({
            check: "eslint", severity: "error", file: rel, line: m.line, message: m.message,
            id: `eslint:${rel}::${m.message.slice(0, 48)}::${src}`,
          });
        }
      }
    }
    return out;
  },
};
