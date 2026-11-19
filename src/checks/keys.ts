import fs from "node:fs";
import path from "node:path";
import type { Check, CheckContext, Issue } from "../types.js";
import { scanSources, type KeyRef } from "../adapters/scan.js";
import { namespacesOf, qualify } from "../locales.js";
import { PLURAL_RE } from "../util.js";

/** Default-language keys, with plural variants also registered under their base key. */
function defaultKeys(ctx: CheckContext): Map<string, Set<string>> {
  const byNs = new Map<string, Set<string>>();
  for (const ns of namespacesOf(ctx.config)) {
    const set = new Set<string>();
    for (const k of Object.keys(ctx.locales.get(ctx.config.locales.default)?.get(ns)?.values ?? {})) {
      set.add(k);
      const m = PLURAL_RE.exec(k);
      if (m?.[1]) set.add(m[1]);
    }
    byNs.set(ns, set);
  }
  return byNs;
}

function exists(keys: Map<string, Set<string>>, ref: KeyRef): boolean {
  if (ref.ns !== undefined && keys.has(ref.ns)) return keys.get(ref.ns)?.has(ref.key) ?? false;
  for (const set of keys.values()) if (set.has(ref.key)) return true;
  return false;
}

/** Literal `t("key")` calls whose key is not in the default language. */
export const missingKeys: Check = {
  name: "missing-keys",
  description: "t('key') calls whose key does not exist in the default language (incl. `as any` and defaultValue calls)",
  wholeProject: false,
  run(ctx) {
    const keys = defaultKeys(ctx);
    const out: Issue[] = [];
    for (const r of scanSources(ctx.config, ctx.staged)) {
      if (r.dynamic || exists(keys, r)) continue;
      out.push({
        check: "missing-keys", severity: "error", file: r.file, line: r.line, key: r.key,
        message: `Key "${qualify(r.ns ?? "", r.key)}" is not in the ${ctx.config.locales.default} locale.`,
        id: `missing-keys:${r.file}::${qualify(r.ns ?? "", r.key)}`,
      });
    }
    return out;
  },
};

/** Keys generated from config maps (routes -> navigation.<id>) count as used. */
export function idMapKeys(config: CheckContext["config"]): Array<{ id: string; key: string; ns?: string; file: string }> {
  const out: Array<{ id: string; key: string; ns?: string; file: string }> = [];
  for (const m of config.idMaps) {
    const p = path.join(config.root, m.file);
    if (!fs.existsSync(p)) continue;
    let text = fs.readFileSync(p, "utf8");
    if (m.after && text.includes(m.after)) text = text.slice(text.indexOf(m.after));
    for (const x of text.matchAll(new RegExp(m.idPattern, "g"))) {
      if (x[1]) out.push({ id: x[1], key: m.keyTemplate.replace("{id}", x[1]), ns: m.namespace, file: m.file });
    }
  }
  return out;
}

/** Keys defined but never referenced (ratchet: baseline the backlog, new orphans fail). */
export const unusedKeys: Check = {
  name: "unused-keys",
  description: "Default-language keys that no source file references",
  wholeProject: true,
  run(ctx) {
    const def = ctx.config.locales.default;
    const refs = scanSources(ctx.config, null);
    const used = new Set<string>();
    const prefixes: Array<{ ns?: string; prefix: string }> = [];
    for (const r of refs) {
      if (r.dynamic) prefixes.push({ ns: r.ns, prefix: r.key });
      else used.add(qualify(r.ns ?? "", r.key));
    }
    const generated = idMapKeys(ctx.config);
    const out: Issue[] = [];
    for (const ns of namespacesOf(ctx.config)) {
      for (const key of Object.keys(ctx.locales.get(def)?.get(ns)?.values ?? {})) {
        const base = PLURAL_RE.exec(key)?.[1] ?? key;
        const isUsed =
          used.has(qualify(ns, base)) || used.has(qualify(ns, key)) ||
          [...used].some((u) => !u.includes(":") && ctx.config.locales.layout === "namespaced" && (u === base || u === key)) ||
          prefixes.some((p) => (p.ns === undefined || p.ns === ns) && base.startsWith(p.prefix)) ||
          generated.some((g) => (g.ns === undefined || g.ns === ns) && g.key === base);
        if (!isUsed) {
          out.push({
            check: "unused-keys", severity: "error", key: qualify(ns, key),
            message: `Key "${qualify(ns, key)}" is not referenced by any source file.`,
            id: `unused-keys:${qualify(ns, key)}`,
          });
        }
      }
    }
    return out;
  },
};

/** Ids from a routes/menu config must have a translation in every language. */
export const idMaps: Check = {
  name: "id-maps",
  description: "Dynamic-key id maps (e.g. routes.ts -> navigation.<id>) are translated in every language",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    for (const g of idMapKeys(ctx.config)) {
      for (const lang of ctx.config.locales.languages) {
        const files = [...(ctx.locales.get(lang)?.values() ?? [])].filter((f) => g.ns === undefined || f.ns === g.ns);
        if (!files.some((f) => g.key in f.values)) {
          out.push({
            check: "id-maps", severity: "error", file: g.file, locale: lang, key: g.key,
            message: `"${g.id}" in ${g.file} needs key "${g.key}" in ${lang}.`,
            id: `id-maps:${lang}/${g.key}`,
          });
        }
      }
    }
    return out;
  },
};
