#!/usr/bin/env node
// Sanitise gate for the public repo: fails if any tracked file mentions private/client terms.
// Extend with PRIVATE_TERMS="a,b" in the environment.
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const base = ["pontora", "besar", "haus der finanzen", "enacton", "rexhepaj", "supabase.co", "turbostarter", "@pontora"];
const terms = [...base, ...(process.env.PRIVATE_TERMS ?? "").split(",").map((s) => s.trim()).filter(Boolean)].map((t) => t.toLowerCase());
const patterns = [[/[\w.+-]+@(?!example\.)[\w-]+\.[a-z]{2,}/i, "email address"], [/\/Users\/[^/\s]+/, "local user path"], [/\b[a-z]{20}\.supabase\.co\b/i, "Supabase project id"]];

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n").filter(Boolean);
let bad = 0;
for (const f of files) {
  if (f === "scripts/check-private-strings.mjs" || f === "package-lock.json" || !fs.existsSync(f)) continue;
  let text;
  try { text = fs.readFileSync(f, "utf8"); } catch { continue; }
  const lower = text.toLowerCase();
  for (const t of terms) if (lower.includes(t)) { console.log(`${f}: contains "${t}"`); bad++; }
  for (const [re, label] of patterns) if (re.test(text)) { console.log(`${f}: ${label}`); bad++; }
}
if (bad) { console.error(`\n✗ ${bad} private-string finding(s). Remove them before publishing.`); process.exit(1); }
console.log(`✓ no private strings in ${files.length} file(s).`);
