import fs from "node:fs";
import path from "node:path";
import type { GuardConfig, Issue } from "./types.js";
import { sourceFiles } from "./adapters/scan.js";

interface Marker {
  readonly file: string;
  readonly line: number;
  /** Line the marker applies to. */
  readonly target: number;
  readonly checks: readonly string[];
  readonly reason: string;
  used: boolean;
}

const MARKER = /i18n-guard-ignore-(next-line|line)\b(?:[ \t]+([a-z][\w,-]*))?(?:[ \t]*--[ \t]*(.*?))?[ \t]*(?:\*\/|\}\}?|-->|$)/;

/**
 * Inline suppressions in source files:
 *   // i18n-guard-ignore-next-line -- reason
 *   {/* i18n-guard-ignore-next-line eslint -- reason *\/}
 *   const x = "Acme"; // i18n-guard-ignore-line eslint,missing-keys -- reason
 * A reason is mandatory; markers that suppress nothing are reported as stale.
 */
export function applyInlineIgnores(
  config: GuardConfig,
  issues: readonly Issue[],
  knownChecks: readonly string[],
  opts: { staged: boolean; ran: readonly string[] },
): Issue[] {
  const markers: Marker[] = [];
  const problems: Issue[] = [];
  const files = new Set([...issues.filter((i) => i.file).map((i) => i.file as string), ...(opts.staged ? [] : sourceFiles(config, null))]);
  for (const file of files) {
    let text: string;
    try {
      text = fs.readFileSync(path.join(config.root, file), "utf8");
    } catch {
      continue;
    }
    if (!text.includes("i18n-guard-ignore")) continue;
    text.split("\n").forEach((src, idx) => {
      const m = MARKER.exec(src);
      if (!m) return;
      const line = idx + 1;
      const checks = m[2] ? m[2].split(",") : [];
      const reason = (m[3] ?? "").trim();
      const bad = checks.filter((c) => !knownChecks.includes(c));
      if (bad.length) {
        problems.push({ check: "ignore", severity: "error", file, line, message: `Unknown check "${bad.join(", ")}" in i18n-guard-ignore comment.`, id: `ignore:${file}:${line}:unknown` });
        return;
      }
      if (!reason) {
        problems.push({ check: "ignore", severity: "error", file, line, message: "i18n-guard-ignore needs a reason: `i18n-guard-ignore-next-line -- why this is fine`.", id: `ignore:${file}:${line}:reason` });
        return;
      }
      markers.push({ file, line, target: m[1] === "next-line" ? line + 1 : line, checks, reason, used: false });
    });
  }
  const kept = issues.filter((i) => {
    if (!i.file || !i.line) return true;
    const hit = markers.filter((m) => m.file === i.file && m.target === i.line && (m.checks.length === 0 || m.checks.includes(i.check)));
    for (const m of hit) m.used = true;
    return hit.length === 0;
  });
  if (!opts.staged) {
    for (const m of markers) {
      const relevant = m.checks.length ? m.checks.some((c) => opts.ran.includes(c)) : opts.ran.some((c) => c === "eslint" || c === "missing-keys");
      if (!m.used && relevant) {
        problems.push({ check: "ignore", severity: "warning", file: m.file, line: m.line, message: "i18n-guard-ignore suppresses nothing (the problem is gone). Remove the comment.", id: `ignore:${m.file}:${m.line}:unused` });
      }
    }
  }
  return [...kept, ...problems];
}
