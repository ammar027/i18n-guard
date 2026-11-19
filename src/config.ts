import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { DeepPartial, Framework, GuardConfig } from "./types.js";

const GENERIC_WORDS: Record<string, string[]> = {
  de: ["titel", "untertitel", "beschreibung"],
  fr: ["titre", "sous-titre", "description"],
  es: ["título", "subtítulo", "descripción"],
  it: ["titolo", "sottotitolo", "descrizione"],
  pt: ["título", "subtítulo", "descrição"],
  nl: ["titel", "ondertitel", "beschrijving"],
};

const MUST_TRANSLATE = [
  "open", "completed", "overdue", "waiting", "saving", "loading", "search", "delete", "save", "edit",
  "close", "back", "next", "add", "remove", "submit", "cancel", "approve", "reject", "pending",
  "approved", "rejected", "view all", "try again", "confirm", "continue", "done",
];

const ALLOW_SAME = ["IBAN", "No", "Logo", "Plan", "Avatar", "General", "Color", "Error", "OK", "Email", "PDF", "URL", "API", "ID", "Notifications"];

export const DEFAULTS: GuardConfig = {
  root: ".",
  framework: "react-i18next",
  locales: { dir: "src/locales", layout: "namespaced", default: "en", languages: ["en"], namespaces: [] },
  source: {
    roots: ["src"],
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mts", ".vue"],
    exclude: ["node_modules", "/dist/", "/.next/", "/.expo/", ".test.", ".spec.", "__tests__", "/locales/"],
    stripComments: true,
  },
  translators: "t|i18n\\.t|i18next\\.t",
  checks: {
    parity: true, untranslated: true, placeholders: true, variables: true, hygiene: true,
    missingKeys: true, unusedKeys: true, idMaps: true, types: true, syntax: true, sortedKeys: false, eslint: false,
  },
  options: {
    allowSameAsDefault: ALLOW_SAME,
    neutralWordMaxLength: 12,
    forbiddenChars: {},
    mustTranslate: MUST_TRANSLATE,
    genericWords: GENERIC_WORDS,
    ignoreKeys: [],
    extraKeys: true,
    messageSyntax: "auto",
    bareKeysNeedDefault: false,
    unusedMode: "calls",
    unusedRoots: [],
  },
  idMaps: [],
  eslint: [],
  baseline: { file: "i18n-guard.baseline.json" },
};

export const PRESETS: Record<Framework, DeepPartial<GuardConfig>> = {
  "react-i18next": {},
  "next-intl": {
    framework: "next-intl",
    locales: { dir: "messages", layout: "flat" },
    source: { roots: ["src", "app", "components"] },
    translators: "t|t\\.rich|t\\.raw|t\\.markup",
  },
  "vue-i18n": {
    framework: "vue-i18n",
    locales: { dir: "src/locales", layout: "flat" },
    translators: "\\$t|this\\.\\$t|t|i18n\\.global\\.t|i18n\\.t",
  },
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function merge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = isObj(out[k]) && isObj(v) ? merge(out[k], v) : v;
  return out as T;
}

export function resolveConfig(user: DeepPartial<GuardConfig>, root: string): GuardConfig {
  const framework = user.framework ?? "react-i18next";
  const preset = PRESETS[framework] ?? {};
  const cfg = merge(merge(DEFAULTS, preset), user);
  const languages = cfg.locales.languages.includes(cfg.locales.default)
    ? cfg.locales.languages
    : [cfg.locales.default, ...cfg.locales.languages];
  return { ...cfg, root, locales: { ...cfg.locales, languages } };
}

const NAMES = ["i18n-guard.config.json", "i18n-guard.config.mjs", "i18n-guard.config.js"];

export function findConfig(cwd: string): string | null {
  for (const n of NAMES) {
    const p = path.join(cwd, n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function loadConfig(cwd: string, explicit?: string): Promise<GuardConfig> {
  const file = explicit ? path.resolve(cwd, explicit) : findConfig(cwd);
  if (!file) throw new Error(`No i18n-guard config found in ${cwd}. Run: npx i18n-guard init`);
  let user: DeepPartial<GuardConfig>;
  if (file.endsWith(".json")) user = JSON.parse(fs.readFileSync(file, "utf8")) as DeepPartial<GuardConfig>;
  else user = ((await import(pathToFileURL(file).href)) as { default: DeepPartial<GuardConfig> }).default;
  return resolveConfig(user, path.dirname(file));
}
