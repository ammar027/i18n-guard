import fs from "node:fs";
import path from "node:path";
import type { Check, CheckContext, GuardConfig, Issue } from "../types.js";
import { findDuplicateKeys, namespacesOf, qualify } from "../locales.js";
import { toPosix } from "../util.js";

const kind = (v: unknown): string => (Array.isArray(v) ? "array" : v === null ? "null" : typeof v);

const mk = (check: string, lang: string, ns: string, key: string, message: string, severity: Issue["severity"] = "error"): Issue => ({
  check, severity, message, locale: lang, key: qualify(ns, key), id: `${check}:${lang}/${qualify(ns, key)}`,
});

/** Same shape in every language: string vs array vs object, and array length. */
export const types: Check = {
  name: "types",
  description: "A key has the same type (string / array / object) in every language",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    const def = ctx.config.locales.default;
    for (const ns of namespacesOf(ctx.config)) {
      const base = ctx.locales.get(def)?.get(ns);
      if (!base) continue;
      const baseKeys = Object.keys(base.values);
      for (const lang of ctx.config.locales.languages) {
        if (lang === def) continue;
        const f = ctx.locales.get(lang)?.get(ns);
        if (!f) continue;
        const keys = Object.keys(f.values);
        for (const [key, v] of Object.entries(base.values)) {
          if (key in f.values) {
            const w = f.values[key];
            if (kind(v) !== kind(w)) out.push(mk("types", lang, ns, key, `${def} has ${kind(v)}, ${lang} has ${kind(w)}.`));
            else if (Array.isArray(v) && Array.isArray(w) && v.length !== w.length) out.push(mk("types", lang, ns, key, `${def} has ${v.length} item(s), ${lang} has ${w.length}.`));
          } else if (keys.some((k) => k.startsWith(`${key}.`))) {
            out.push(mk("types", lang, ns, key, `${def} has a value here, ${lang} has an object.`));
          }
        }
        for (const key of keys) {
          if (key in base.values) continue;
          if (baseKeys.some((k) => key.startsWith(`${k}.`))) out.push(mk("types", lang, ns, key, `${lang} has an object where ${def} has a value.`));
          else if (baseKeys.some((k) => k.startsWith(`${key}.`))) out.push(mk("types", lang, ns, key, `${def} has an object here, ${lang} has a value.`));
        }
      }
    }
    return dedupe(out);
  },
};

const dedupe = (list: Issue[]): Issue[] => [...new Map(list.map((i) => [i.id, i])).values()];

/** Returns an error text, or null when the message is well-formed. */
export function messageProblem(text: string, mode: "i18next" | "icu" | "braces"): string | null {
  if (mode === "i18next") {
    const rest = text.replace(/\$t\([^)]*\)/g, "").replace(/\{\{[^{}]*\}\}/g, "");
    return /[{}]/.test(rest) ? `Unbalanced or stray brace near "${(/.{0,12}[{}].{0,12}/.exec(rest) ?? [""])[0]}"` : null;
  }
  if (mode === "braces") {
    const rest = text.replace(/\{[^{}]*\}/g, "");
    return /[{}]/.test(rest) ? "Unbalanced or stray brace" : null;
  }
  const src = text.replace(/''/g, "").replace(/'[{}]+[^']*'/g, "");
  let depth = 0;
  for (const ch of src) {
    if (ch === "{") depth++;
    else if (ch === "}" && --depth < 0) return "Closing brace without opening brace";
  }
  if (depth !== 0) return "Unclosed brace";
  for (const m of src.matchAll(/\{\s*[\w.]+\s*,\s*(plural|select|selectordinal)\s*,/g)) {
    let d = 1;
    let i = (m.index ?? 0) + 1;
    for (; i < src.length && d > 0; i++) d += src[i] === "{" ? 1 : src[i] === "}" ? -1 : 0;
    if (!/\bother\s*\{/.test(src.slice(m.index ?? 0, i))) return `${m[1]} is missing the required "other" branch`;
  }
  return null;
}

const modeOf = (c: GuardConfig): "i18next" | "icu" | "braces" | "off" => {
  const m = c.options.messageSyntax;
  if (m !== "auto") return m;
  return c.framework === "next-intl" ? "icu" : c.framework === "vue-i18n" ? "braces" : "i18next";
};

/** Every message parses: balanced braces, ICU plural/select have `other`. */
export const syntax: Check = {
  name: "syntax",
  description: "Messages are well-formed (balanced braces; ICU plural/select have an `other` branch)",
  wholeProject: true,
  run(ctx) {
    const mode = modeOf(ctx.config);
    if (mode === "off") return [];
    const out: Issue[] = [];
    for (const ns of namespacesOf(ctx.config)) {
      for (const lang of ctx.config.locales.languages) {
        const f = ctx.locales.get(lang)?.get(ns);
        if (!f) continue;
        for (const [key, v] of Object.entries(f.values)) {
          const list = Array.isArray(v) ? v : [v];
          for (const s of list) {
            if (typeof s !== "string") continue;
            const p = messageProblem(s, mode);
            if (p) out.push(mk("syntax", lang, ns, key, `${p}: "${s.slice(0, 60)}"`));
          }
        }
      }
    }
    return out;
  },
};

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function unsortedPaths(o: Json, prefix = ""): string[] {
  const out: string[] = [];
  const keys = Object.keys(o);
  if (keys.some((k, i) => i > 0 && (keys[i - 1] ?? "") > k)) out.push(prefix || "(root)");
  for (const [k, v] of Object.entries(o)) if (isObj(v)) out.push(...unsortedPaths(v, prefix ? `${prefix}.${k}` : k));
  return out;
}

function sortDeep(v: unknown): unknown {
  if (!isObj(v)) return v;
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortDeep(v[k])]));
}

function files(ctx: Pick<CheckContext, "config">): Array<{ lang: string; ns: string; rel: string }> {
  const { dir, layout, languages } = ctx.config.locales;
  return languages.flatMap((lang) => namespacesOf(ctx.config).map((ns) => ({
    lang, ns, rel: toPosix(layout === "flat" ? path.join(dir, `${lang}.json`) : path.join(dir, lang, `${ns}.json`)),
  })));
}

/** Opt-in: keys in ascending order, so diffs and merges stay small. Fix with `check --fix`. */
export const sortedKeys: Check = {
  name: "sorted-keys",
  description: "Keys are in ascending order (opt-in; auto-fix with --fix)",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    for (const f of files(ctx)) {
      const abs = path.join(ctx.config.root, f.rel);
      if (!fs.existsSync(abs)) continue;
      const parsed = JSON.parse(fs.readFileSync(abs, "utf8").replace(/^﻿/, "")) as unknown;
      if (!isObj(parsed)) continue;
      for (const p of unsortedPaths(parsed)) {
        out.push({ check: "sorted-keys", severity: "error", file: f.rel, locale: f.lang, key: p, message: `Keys under "${p}" are not in ascending order (run: i18n-guard check --fix).`, id: `sorted-keys:${f.rel}::${p}` });
      }
    }
    return out;
  },
};

/** Rewrite locale files with sorted keys (only when the check is enabled). Returns the files changed. */
export function fixSortedKeys(config: GuardConfig): string[] {
  if (!config.checks.sortedKeys) return [];
  const changed: string[] = [];
  for (const f of files({ config })) {
    const abs = path.join(config.root, f.rel);
    if (!fs.existsSync(abs)) continue;
    const text = fs.readFileSync(abs, "utf8");
    if (findDuplicateKeys(text).length) continue; // sorting would silently drop the duplicate
    const parsed = JSON.parse(text.replace(/^﻿/, "")) as unknown;
    if (!isObj(parsed)) continue;
    const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? "  ";
    const next = `${JSON.stringify(sortDeep(parsed), null, indent)}\n`;
    if (next !== text) {
      fs.writeFileSync(abs, next);
      changed.push(f.rel);
    }
  }
  return changed;
}
