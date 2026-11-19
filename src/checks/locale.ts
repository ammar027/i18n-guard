import type { Check, CheckContext, Issue } from "../types.js";
import { isEnglish, PLURAL_RE, variablesOf } from "../util.js";
import { namespacesOf, qualify } from "../locales.js";

const GENERIC_EN = new Set(["title", "subtitle", "description", "desc"]);
const ENGLISH_FRAGMENT = /\b(the|your|please|you|with|this|that|will|from|and)\b/gi;

const issue = (check: string, lang: string, ns: string, key: string, message: string, severity: Issue["severity"] = "error"): Issue => ({
  check, severity, message, locale: lang, key: qualify(ns, key),
  id: `${check}:${lang}/${qualify(ns, key)}`,
});

const humanize = (seg: string): string => seg.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
const str = (v: unknown): v is string => typeof v === "string";

function others(ctx: CheckContext): string[] {
  return ctx.config.locales.languages.filter((l) => l !== ctx.config.locales.default);
}

function ignored(ctx: CheckContext, ns: string, key: string): boolean {
  const ig = ctx.config.options.ignoreKeys;
  return ig.includes(key) || ig.includes(qualify(ns, key));
}

function falsePositive(ctx: CheckContext, key: string, en: string): boolean {
  const o = ctx.config.options;
  const v = en.trim();
  if (o.allowSameAsDefault.includes(en) || v.length <= 2) return true;
  if (/^[+0-9]/.test(v) || v === v.toUpperCase()) return true;
  if (/^(countries|nationalities)\./.test(key)) return true;
  if (!v.includes(" ") && v.length <= o.neutralWordMaxLength) return true;
  if (v.includes("@") && !v.includes(" ")) return true;
  return /\.(placeholder|email)$/.test(key);
}

/** Every key exists in every language; no stray keys; no missing files. */
export const parity: Check = {
  name: "parity",
  description: "Every key of the default language exists in every other language",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    const def = ctx.config.locales.default;
    for (const ns of namespacesOf(ctx.config)) {
      const base = ctx.locales.get(def)?.get(ns);
      if (!base) continue;
      for (const lang of others(ctx)) {
        const f = ctx.locales.get(lang)?.get(ns);
        if (!f) {
          out.push(issue("parity", lang, ns, "(file)", `Translation file is missing for ${lang}${ns ? ` (${ns})` : ""}.`));
          continue;
        }
        for (const key of Object.keys(base.values)) {
          if (ignored(ctx, ns, key)) continue;
          if (!(key in f.values)) out.push(issue("parity", lang, ns, key, `Missing in ${lang}.`));
        }
        for (const key of ctx.config.options.extraKeys ? Object.keys(f.values) : []) {
          if (!(key in base.values)) out.push(issue("parity", lang, ns, key, `Key exists in ${lang} but not in ${def}.`, "warning"));
        }
      }
    }
    return out;
  },
};

/** A value that is still identical to the default language. */
export const untranslated: Check = {
  name: "untranslated",
  description: "Values left identical to the default language",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    const def = ctx.config.locales.default;
    for (const ns of namespacesOf(ctx.config)) {
      const base = ctx.locales.get(def)?.get(ns);
      if (!base) continue;
      for (const lang of others(ctx)) {
        const f = ctx.locales.get(lang)?.get(ns);
        if (!f) continue;
        for (const [key, en] of Object.entries(base.values)) {
          const v = f.values[key];
          if (!str(en) || !str(v) || ignored(ctx, ns, key)) continue;
          if (v === en && !falsePositive(ctx, key, en)) out.push(issue("untranslated", lang, ns, key, `Still the ${def} text: "${en.slice(0, 60)}"`));
        }
      }
    }
    return out;
  },
};

function placeholderReason(ctx: CheckContext, lang: string, key: string, en: string, val: string): string | null {
  const o = ctx.config.options;
  const base = lang.split("-")[0] ?? lang;
  const v = val.trim().toLowerCase();
  const last = key.split(".").pop() ?? key;
  const words = humanize(last);
  const defEn = isEnglish(ctx.config.locales.default);
  const isDef = lang === ctx.config.locales.default;
  if (!isDef && words.split(" ").length >= 2 && v === words) return "key name left as text";
  const generic = o.genericWords[lang] ?? o.genericWords[base];
  if (!isDef && generic?.includes(v) && !GENERIC_EN.has(en.trim().toLowerCase())) return "generic field word used as text";
  if (!isDef && defEn && o.mustTranslate.includes(v)) return "English UI word left untranslated";
  if (!isDef && defEn && (val.replace(/\{\{[^}]*\}\}/g, "").match(ENGLISH_FRAGMENT)?.length ?? 0) >= 2) return "English sentence fragment";
  if (v.startsWith("[todo") || v.startsWith("todo:")) return "TODO marker left in translation";
  if (
    isDef && defEn && /(Hint|Description|Title|Desc|Placeholder)$/.test(last) && v === words &&
    words.split(" ").length >= 3 && val.split(" ").every((w) => /^[A-Z]/.test(w))
  ) return "default value is only the key name";
  return null;
}

/** Values that differ from the default but are still placeholders ("Titel", "[TODO] ..."). */
export const placeholders: Check = {
  name: "placeholders",
  description: "Placeholder-looking values: key names, generic Title words, English fragments, TODO markers",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    const def = ctx.config.locales.default;
    for (const ns of namespacesOf(ctx.config)) {
      const base = ctx.locales.get(def)?.get(ns);
      if (!base) continue;
      for (const lang of ctx.config.locales.languages) {
        const f = ctx.locales.get(lang)?.get(ns);
        if (!f) continue;
        for (const [key, val] of Object.entries(f.values)) {
          if (!str(val) || ignored(ctx, ns, key)) continue;
          const en = base.values[key];
          const reason = placeholderReason(ctx, lang, key, str(en) ? en : val, val);
          if (reason) out.push(issue("placeholders", lang, ns, key, `${reason}: "${val.slice(0, 60)}"`));
        }
      }
    }
    return out;
  },
};

/** `{{variables}}` must match the default language exactly. */
export const variables: Check = {
  name: "variables",
  description: "Interpolation variables ({{x}}) match the default language",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    const def = ctx.config.locales.default;
    for (const ns of namespacesOf(ctx.config)) {
      const base = ctx.locales.get(def)?.get(ns);
      if (!base) continue;
      for (const lang of others(ctx)) {
        const f = ctx.locales.get(lang)?.get(ns);
        if (!f) continue;
        for (const [key, en] of Object.entries(base.values)) {
          const v = f.values[key];
          if (!str(en) || !str(v) || ignored(ctx, ns, key)) continue;
          const a = variablesOf(en);
          const b = variablesOf(v);
          if (a.join() !== b.join()) out.push(issue("variables", lang, ns, key, `${def} uses [${a.join(", ") || "none"}], ${lang} uses [${b.join(", ") || "none"}].`));
        }
      }
    }
    return out;
  },
};

/** Empty values, duplicate keys, plural gaps, stray whitespace, forbidden characters. */
export const hygiene: Check = {
  name: "hygiene",
  description: "Empty values, duplicate keys, plural completeness, whitespace, forbidden characters",
  wholeProject: true,
  run(ctx) {
    const out: Issue[] = [];
    const def = ctx.config.locales.default;
    for (const ns of namespacesOf(ctx.config)) {
      const base = ctx.locales.get(def)?.get(ns);
      for (const lang of ctx.config.locales.languages) {
        const f = ctx.locales.get(lang)?.get(ns);
        if (!f) continue;
        for (const d of f.duplicates) out.push(issue("hygiene", lang, ns, d, `Key "${d}" appears twice in one object (the last one silently wins).`));
        const forbidden = ctx.config.options.forbiddenChars[lang] ?? ctx.config.options.forbiddenChars[lang.split("-")[0] ?? ""] ?? [];
        const bases = new Map<string, Set<string>>();
        for (const [key, val] of Object.entries(f.values)) {
          if (!str(val) || ignored(ctx, ns, key)) continue;
          const en = base?.values[key];
          if (val.trim() === "" && (!str(en) || en.trim() !== "")) out.push(issue("hygiene", lang, ns, key, "Empty value (renders nothing)."));
          if (val !== val.trim() && (!str(en) || en === en.trim())) out.push(issue("hygiene", lang, ns, key, "Leading or trailing whitespace."));
          for (const ch of forbidden) if (val.includes(ch)) out.push(issue("hygiene", lang, ns, key, `Contains forbidden character "${ch}".`));
          const m = PLURAL_RE.exec(key);
          if (m?.[1] && m[2]) (bases.get(m[1]) ?? bases.set(m[1], new Set()).get(m[1]))?.add(m[2]);
        }
        for (const [b, forms] of bases) {
          if (forms.has("one") !== forms.has("other")) out.push(issue("hygiene", lang, ns, b, `Plural forms [${[...forms].join(", ")}] need both _one and _other.`));
        }
      }
    }
    return out;
  },
};
