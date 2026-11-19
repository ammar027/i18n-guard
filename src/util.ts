import fs from "node:fs";
import path from "node:path";

export const toPosix = (p: string): string => p.split(path.sep).join("/");

export function walk(dir: string, exts: readonly string[], exclude: readonly string[], root: string): string[] {
  const out: string[] = [];
  const visit = (d: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      const rel = toPosix(path.relative(root, full));
      if (exclude.some((x) => `/${rel}`.includes(x))) continue;
      if (e.isDirectory()) visit(full);
      else if (exts.some((x) => e.name.endsWith(x))) out.push(rel);
    }
  };
  visit(dir);
  return out.sort();
}

export const lineOf = (text: string, index: number): number => {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
};

/** Plural suffixes used by i18next. */
export const PLURAL_RE = /^(.*)_(zero|one|two|few|many|other)$/;
export const VAR_RE = /\{\{\s*([\w.]+)\s*(?:,[^}]*)?\}\}/g;
export const variablesOf = (s: string): string[] => [...new Set([...s.matchAll(VAR_RE)].map((m) => m[1] ?? ""))].sort();
export const isEnglish = (lang: string): boolean => lang.toLowerCase().startsWith("en");
