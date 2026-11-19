import fs from "node:fs";
import path from "node:path";
import type { GuardConfig, LocaleFile, LocaleSet } from "./types.js";
import { toPosix } from "./util.js";

/** Parse JSON text and report keys that occur twice in one object (JSON.parse hides them). */
export function findDuplicateKeys(text: string): string[] {
  const dups: string[] = [];
  const stack: Array<{ obj: boolean; keys: Set<string> }> = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "{" || c === "[") stack.push({ obj: c === "{", keys: new Set() });
    else if (c === "}" || c === "]") stack.pop();
    else if (c === '"') {
      let j = i + 1;
      while (j < text.length && text[j] !== '"') j += text[j] === "\\" ? 2 : 1;
      const str = text.slice(i + 1, j);
      let k = j + 1;
      while (k < text.length && /\s/.test(text[k] ?? "")) k++;
      const top = stack[stack.length - 1];
      if (top?.obj && text[k] === ":") {
        if (top.keys.has(str)) dups.push(str);
        top.keys.add(str);
      }
      i = j;
    }
    i++;
  }
  return dups;
}

export function flatten(value: unknown, prefix = ""): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) Object.assign(out, flatten(v, prefix ? `${prefix}.${k}` : k));
  } else if (prefix) out[prefix] = value;
  return out;
}

function readFile(root: string, rel: string, lang: string, ns: string): LocaleFile | null {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return null;
  const text = fs.readFileSync(abs, "utf8").replace(/^﻿/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    throw new Error(`${rel}: invalid JSON (${(e as Error).message})`);
  }
  return { lang, ns, file: rel, values: flatten(parsed), duplicates: findDuplicateKeys(text) };
}

export function namespacesOf(config: GuardConfig): string[] {
  if (config.locales.layout === "flat") return [""];
  if (config.locales.namespaces.length) return [...config.locales.namespaces];
  const dir = path.join(config.root, config.locales.dir, config.locales.default);
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => f.slice(0, -5)).sort();
  } catch {
    return [];
  }
}

export function loadLocales(config: GuardConfig): LocaleSet {
  const { dir, layout, languages } = config.locales;
  const nss = namespacesOf(config);
  const out = new Map<string, Map<string, LocaleFile>>();
  for (const lang of languages) {
    const m = new Map<string, LocaleFile>();
    for (const ns of nss) {
      const rel = toPosix(layout === "flat" ? path.join(dir, `${lang}.json`) : path.join(dir, lang, `${ns}.json`));
      const f = readFile(config.root, rel, lang, ns);
      if (f) m.set(ns, f);
    }
    out.set(lang, m);
  }
  return out;
}

/** Qualified key shown to humans: `ns:key` (namespaced) or `key` (flat). */
export const qualify = (ns: string, key: string): string => (ns ? `${ns}:${key}` : key);
