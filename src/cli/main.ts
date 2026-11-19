import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { findConfig, loadConfig, PRESETS } from "../config.js";
import { loadLocales } from "../locales.js";
import { CHECKS, runGuard } from "../runner.js";
import { render, type Format } from "../reporters/index.js";
import type { Framework } from "../types.js";

const HELP = `i18n-guard — stop untranslated text before it ships

  i18n-guard init [--framework react-i18next|next-intl|vue-i18n] [--force]
  i18n-guard check [--strict] [--staged] [--only a,b] [--format console|markdown|json|sarif]
                   [--output file] [--no-baseline] [--fix] [--config path]
  i18n-guard baseline            Record current findings so only NEW ones fail
  i18n-guard report              Same as check --format markdown --output i18n-guard-report.md
  i18n-guard doctor              Verify config, locale files and tooling
  i18n-guard checks              List checks

Exit code: 1 when a (non-baselined) error is found; --strict also fails on warnings.`;

interface Args { cmd: string; flags: Map<string, string | true> }

function parse(argv: string[]): Args {
  const [cmd = "help", ...rest] = argv;
  const flags = new Map<string, string | true>();
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] ?? "";
    if (!a.startsWith("--")) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) { flags.set(a.slice(2), next); i++; } else flags.set(a.slice(2), true);
  }
  return { cmd, flags };
}

const templatesDir = (): string => path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "templates");

function detect(cwd: string): { framework: Framework; localesDir?: string } {
  let deps: Record<string, string> = {};
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, "package.json"), "utf8")) as Record<string, Record<string, string>>;
    deps = { ...pkg.dependencies, ...pkg.devDependencies };
  } catch { /* no package.json */ }
  const framework: Framework = deps["next-intl"] ? "next-intl" : deps["vue-i18n"] ? "vue-i18n" : "react-i18next";
  const candidates = ["src/locales", "locales", "messages", "public/locales", "src/i18n/locales", "src/translations", "translations"];
  return { framework, localesDir: candidates.find((c) => fs.existsSync(path.join(cwd, c))) };
}

function copyTemplate(name: string, dest: string, force: boolean): string {
  if (fs.existsSync(dest) && !force) return `kept   ${dest}`;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(path.join(templatesDir(), name), dest);
  return `wrote  ${dest}`;
}

function init(cwd: string, flags: Map<string, string | true>): number {
  const force = flags.has("force");
  const found = detect(cwd);
  const framework = (typeof flags.get("framework") === "string" ? flags.get("framework") : found.framework) as Framework;
  if (!PRESETS[framework]) { console.error(`Unknown framework "${String(framework)}".`); return 2; }
  const dir = found.localesDir ?? PRESETS[framework].locales?.dir ?? "src/locales";
  const flat = PRESETS[framework].locales?.layout === "flat";
  const langs = fs.existsSync(path.join(cwd, dir))
    ? fs.readdirSync(path.join(cwd, dir), { withFileTypes: true }).filter((e) => (flat ? e.isFile() && e.name.endsWith(".json") : e.isDirectory())).map((e) => e.name.replace(/\.json$/, "")).sort()
    : ["en"];
  const cfgPath = path.join(cwd, "i18n-guard.config.json");
  const log: string[] = [];
  if (!fs.existsSync(cfgPath) || force) {
    const cfg = { framework, locales: { dir, default: langs.includes("en") ? "en" : (langs[0] ?? "en"), languages: langs }, checks: { eslint: true }, options: { forbiddenChars: {} } };
    fs.writeFileSync(cfgPath, `${JSON.stringify(cfg, null, 2)}\n`);
    log.push(`wrote  i18n-guard.config.json (framework ${framework}, locales ${dir}: ${langs.join(", ")})`);
  } else log.push("kept   i18n-guard.config.json");
  log.push(copyTemplate("github-workflow.yml", path.join(cwd, ".github/workflows/i18n-guard.yml"), force));
  log.push(copyTemplate("pre-commit", path.join(cwd, ".husky/i18n-guard-pre-commit"), force));
  log.push(copyTemplate("SKILL.md", path.join(cwd, ".claude/skills/i18n-fix/SKILL.md"), force));
  const pkgPath = path.join(cwd, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { scripts?: Record<string, string> };
    pkg.scripts = { ...pkg.scripts };
    if (!pkg.scripts["check:i18n"]) {
      pkg.scripts["check:i18n"] = "i18n-guard check";
      pkg.scripts["check:i18n:strict"] = "i18n-guard check --strict";
      fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
      log.push("wrote  package.json scripts: check:i18n, check:i18n:strict");
    }
  }
  console.log(log.join("\n"));
  console.log(`\nNext:\n  1. Add the ESLint preset (see docs/ADOPTION.md) to eslint.config.js\n  2. npx i18n-guard check      # see the backlog\n  3. npx i18n-guard baseline   # accept it; only new problems fail\n  4. Add .husky/i18n-guard-pre-commit to your pre-commit hook`);
  return 0;
}

async function doctor(cwd: string, cfgFlag?: string): Promise<number> {
  const lines: string[] = [];
  let bad = 0;
  const ok = (m: string): void => void lines.push(`✓ ${m}`);
  const no = (m: string): void => { bad++; lines.push(`✗ ${m}`); };
  const cfgFile = cfgFlag ? path.resolve(cwd, cfgFlag) : findConfig(cwd);
  if (!cfgFile) { console.log("✗ no i18n-guard.config.* found. Run: i18n-guard init"); return 1; }
  ok(`config ${path.relative(cwd, cfgFile)}`);
  const cfg = await loadConfig(cwd, cfgFlag);
  const dir = path.join(cfg.root, cfg.locales.dir);
  if (fs.existsSync(dir)) ok(`locales dir ${cfg.locales.dir}`); else no(`locales dir ${cfg.locales.dir} does not exist`);
  try {
    const set = loadLocales(cfg);
    for (const l of cfg.locales.languages) {
      const n = set.get(l)?.size ?? 0;
      if (n) ok(`${l}: ${n} file(s)`); else no(`${l}: no translation files found`);
    }
  } catch (e) { no((e as Error).message); }
  for (const r of cfg.source.roots) if (fs.existsSync(path.join(cfg.root, r))) ok(`source root ${r}`); else no(`source root ${r} does not exist`);
  if (cfg.checks.eslint) {
    try { await import("eslint"); ok("eslint installed"); } catch { no("checks.eslint is on but eslint is not installed"); }
    if (!fs.readdirSync(cfg.root).some((f) => f.startsWith("eslint.config."))) lines.push("! no eslint.config.* in the project root (set eslint[].cwd for a monorepo)");
  }
  console.log(lines.join("\n"));
  return bad ? 1 : 0;
}

export async function main(argv: string[]): Promise<number> {
  const { cmd, flags } = parse(argv);
  const cwd = process.cwd();
  const str = (k: string): string | undefined => (typeof flags.get(k) === "string" ? (flags.get(k) as string) : undefined);
  if (cmd === "help" || flags.has("help") || cmd === "--help") { console.log(HELP); return 0; }
  if (cmd === "checks") { for (const [, c] of CHECKS) console.log(`${c.name.padEnd(14)} ${c.description}`); return 0; }
  if (cmd === "init") return init(cwd, flags);
  if (cmd === "doctor") return doctor(cwd, str("config"));
  if (cmd === "check" || cmd === "baseline" || cmd === "report") {
    const config = await loadConfig(cwd, str("config"));
    if (cmd === "baseline") {
      const r = await runGuard(config, { updateBaseline: true, noBaseline: true });
      console.log(`Baseline written to ${config.baseline.file}: ${r.baselineWritten ?? 0} finding(s).`);
      return 0;
    }
    const format = (cmd === "report" ? "markdown" : (str("format") ?? "console")) as Format;
    const r = await runGuard(config, {
      strict: flags.has("strict"), fix: flags.has("fix"), staged: flags.has("staged"), noBaseline: flags.has("no-baseline"),
      only: str("only")?.split(",").map((s) => s.trim()),
    });
    if (r.fixed?.length) console.log(`Fixed key order in ${r.fixed.length} file(s): ${r.fixed.join(", ")}`);
    const text = render(r, format);
    const out = str("output") ?? (cmd === "report" ? "i18n-guard-report.md" : undefined);
    if (out) { fs.writeFileSync(path.resolve(cwd, out), `${text}\n`); console.log(`Report written to ${out} (${r.issues.length} finding(s)).`); } else console.log(text);
    return r.failed ? 1 : 0;
  }
  console.error(`Unknown command "${cmd}".\n\n${HELP}`);
  return 2;
}
