import type { Issue } from "../types.js";
import type { RunResult } from "../runner.js";

export type Format = "console" | "markdown" | "json" | "sarif";

const where = (i: Issue): string => (i.file ? `${i.file}${i.line ? `:${i.line}` : ""}` : i.locale ? `[${i.locale}]` : "");

function groups(issues: readonly Issue[]): Map<string, Issue[]> {
  const m = new Map<string, Issue[]>();
  for (const i of issues) (m.get(i.check) ?? m.set(i.check, []).get(i.check))?.push(i);
  return m;
}

export function consoleReport(r: RunResult, limit = 40): string {
  const lines: string[] = [];
  if (!r.issues.length) {
    lines.push(`✓ i18n guard passed (${r.ran.join(", ")}${r.baselined ? `; ${r.baselined} known finding(s) in baseline` : ""}).`);
    if (r.skipped.length) lines.push(`  skipped in staged mode: ${r.skipped.join(", ")}`);
    return lines.join("\n");
  }
  lines.push(`✗ ${r.issues.length} i18n problem(s)${r.baselined ? ` (+${r.baselined} in baseline)` : ""}:`);
  for (const [check, list] of groups(r.issues)) {
    lines.push("", `${check} (${list.length})`);
    for (const i of list.slice(0, limit)) lines.push(`  ${where(i)} ${i.key && !i.message.includes(i.key) ? `${i.key}: ` : ""}${i.message}`.replace(/\s+/g, " "));
    if (list.length > limit) lines.push(`  … and ${list.length - limit} more (use --format markdown for the full list)`);
  }
  return lines.join("\n");
}

export function markdownReport(r: RunResult): string {
  const lines = ["# i18n guard report", "", `Checks run: ${r.ran.join(", ")}  `, `Findings: **${r.issues.length}** (baselined: ${r.baselined})`, ""];
  if (!r.issues.length) lines.push("✅ Clean.");
  for (const [check, list] of groups(r.issues)) {
    lines.push(`## ${check} (${list.length})`, "", "| Where | Message |", "|---|---|");
    for (const i of list) lines.push(`| \`${where(i) || i.key || ""}\` | ${i.message.replace(/\|/g, "\\|").replace(/\n/g, " ")} |`);
    lines.push("");
  }
  return lines.join("\n");
}

export const jsonReport = (r: RunResult): string => JSON.stringify({ ran: r.ran, skipped: r.skipped, baselined: r.baselined, failed: r.failed, issues: r.issues }, null, 2);

export function sarifReport(r: RunResult): string {
  const rules = [...new Set(r.issues.map((i) => i.check))].map((id) => ({ id, name: id }));
  const results = r.issues.map((i) => ({
    ruleId: i.check,
    level: i.severity === "error" ? "error" : "warning",
    message: { text: i.message },
    locations: [{ physicalLocation: { artifactLocation: { uri: i.file ?? "i18n-guard.config.json" }, region: { startLine: i.line ?? 1 } } }],
    partialFingerprints: { id: i.id },
  }));
  return JSON.stringify({
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "i18n-guard", informationUri: "https://github.com/ammar027/i18n-guard", rules } }, results }],
  }, null, 2);
}

export function render(r: RunResult, f: Format): string {
  return f === "markdown" ? markdownReport(r) : f === "json" ? jsonReport(r) : f === "sarif" ? sarifReport(r) : consoleReport(r);
}
