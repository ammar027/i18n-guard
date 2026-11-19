import fs from "node:fs";
import path from "node:path";
import type { GuardConfig } from "../types.js";
import { lineOf, walk } from "../util.js";

export interface KeyRef {
  readonly file: string;
  readonly line: number;
  /** Key as written, without namespace prefix. */
  readonly key: string;
  /** Explicit namespace (`ns:key`) or the file's `useTranslation("ns")`. */
  readonly ns?: string;
  /** Template/concatenated key: only the static prefix is known. */
  readonly dynamic: boolean;
}

const KEYLIKE = /^[\w$-][\w$.:-]*$/;

/** Per-file context: the namespace or key prefix a translator is bound to. */
function fileScope(framework: GuardConfig["framework"], text: string): { prefix?: string } {
  // react-i18next: files often bind several namespaces (useTranslation("a"), useTranslation("b")),
  // so an unprefixed key counts as found if ANY namespace has it. Only explicit `ns:key` is strict.
  if (framework === "next-intl") {
    const m = /(?:useTranslations|getTranslations)\(\s*(?:\{[^)]*namespace:\s*)?["'`]([\w.]+)["'`]/.exec(text);
    return m?.[1] ? { prefix: m[1] } : {};
  }
  return {};
}

/** Blank out comments (keeping newlines) so doc examples are not scanned. */
export function stripComments(src: string): string {
  const blank = (m: string): string => m.replace(/[^\n]/g, " ");
  return src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(?<![:"'`\\])\/\/[^\n]*/g, blank);
}

export function scanText(config: GuardConfig, file: string, rawText: string): KeyRef[] {
  const text = config.source.stripComments ? stripComments(rawText) : rawText;
  const refs: KeyRef[] = [];
  const scope = fileScope(config.framework, text);
  const call = new RegExp(
    `(?<![\\w$.])(?:${config.translators})\\s*(?:<[^>()]*>)?\\(\\s*(["'\`])((?:\\\\.|(?!\\1)[^\\\\])*)\\1`,
    "g",
  );
  const push = (index: number, raw: string, quote: string, end = 0): void => {
    let key = raw;
    let dynamic = false;
    if (config.options.bareKeysNeedDefault && quote !== "`" && !key.includes(".") && !key.includes(":")) {
      const after = /^\s*(,|\))\s*([^\s)]?)/.exec(text.slice(end));
      if (!(after?.[1] === "," && /["'`{]/.test(after[2] ?? ""))) return;
    }
    if (quote === "`" && key.includes("${")) {
      key = key.slice(0, key.indexOf("${"));
      dynamic = true;
    }
    if (!key || (!dynamic && !KEYLIKE.test(key))) {
      if (!dynamic && key.trim()) refs.push({ file, line: lineOf(text, index), key, dynamic: false });
      return;
    }
    let ns: string | undefined;
    if (config.locales.layout === "namespaced" && key.includes(":")) {
      const [n, ...rest] = key.split(":");
      ns = n;
      key = rest.join(":");
    }
    if (scope.prefix) key = `${scope.prefix}.${key}`;
    refs.push({ file, line: lineOf(text, index), key, ns, dynamic });
  };
  for (const m of text.matchAll(call)) push(m.index ?? 0, m[2] ?? "", m[1] ?? '"', (m.index ?? 0) + m[0].length);
  for (const m of text.matchAll(/i18nKey\s*=\s*\{?\s*(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) push(m.index ?? 0, m[2] ?? "", m[1] ?? '"');
  return refs;
}

export function sourceFiles(config: GuardConfig, only: ReadonlySet<string> | null): string[] {
  const all = config.source.roots.flatMap((r) =>
    walk(path.join(config.root, r), config.source.extensions, config.source.exclude, config.root),
  );
  return only ? all.filter((f) => only.has(f)) : all;
}

export function scanSources(config: GuardConfig, only: ReadonlySet<string> | null): KeyRef[] {
  const refs: KeyRef[] = [];
  for (const f of sourceFiles(config, only)) {
    refs.push(...scanText(config, f, fs.readFileSync(path.join(config.root, f), "utf8")));
  }
  return refs;
}
