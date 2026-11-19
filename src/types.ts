export type Severity = "error" | "warning";

/** One finding. `id` is stable across line-number drift so baselines keep matching. */
export interface Issue {
  readonly check: string;
  readonly message: string;
  readonly id: string;
  readonly severity: Severity;
  readonly file?: string;
  readonly line?: number;
  readonly locale?: string;
  readonly key?: string;
}

export type Framework = "react-i18next" | "next-intl" | "vue-i18n";

export interface IdMap {
  /** File (relative to root) that defines the ids, e.g. a routes/menu config. */
  readonly file: string;
  /** Regex with ONE capture group that extracts each id from the file. */
  readonly idPattern: string;
  /** Only look after the first occurrence of this text (optional). */
  readonly after?: string;
  /** Translation key template; `{id}` is replaced, e.g. `navigation.{id}`. */
  readonly keyTemplate: string;
  /** Namespace file (flat layout: ignored) the key must exist in. */
  readonly namespace?: string;
}

export interface GuardConfig {
  /** Project root (defaults to the config file directory / cwd). */
  readonly root: string;
  readonly framework: Framework;
  readonly locales: {
    /** Directory with the translation files, relative to root. */
    readonly dir: string;
    /** `namespaced`: dir/<lang>/<ns>.json   `flat`: dir/<lang>.json */
    readonly layout: "namespaced" | "flat";
    readonly default: string;
    /** Every language including the default. */
    readonly languages: readonly string[];
    /** Namespaces to check (namespaced layout). Empty = every json file in the default language. */
    readonly namespaces: readonly string[];
  };
  readonly source: {
    /** Directories scanned for translator calls, relative to root. */
    readonly roots: readonly string[];
    readonly extensions: readonly string[];
    /** Path fragments to skip (matched with String.includes). */
    readonly exclude: readonly string[];
    /** Blank out comments before scanning so doc examples are not read as calls (default true). */
    readonly stripComments: boolean;
  };
  /** Translator function names, as a regex source for the identifier (e.g. `t|t[A-Z]\w*`). */
  readonly translators: string;
  readonly checks: {
    readonly parity: boolean;
    readonly untranslated: boolean;
    readonly placeholders: boolean;
    readonly variables: boolean;
    readonly hygiene: boolean;
    readonly missingKeys: boolean;
    readonly unusedKeys: boolean;
    readonly idMaps: boolean;
    readonly types: boolean;
    readonly syntax: boolean;
    /** Opt-in: keys must be in ascending order (fix with `check --fix`). */
    readonly sortedKeys: boolean;
    readonly eslint: boolean;
  };
  readonly options: {
    /** English values that are legitimately identical across languages. */
    readonly allowSameAsDefault: readonly string[];
    /** Single words up to this length are treated as international terms (Status, Name). */
    readonly neutralWordMaxLength: number;
    /** Characters a locale must not contain, e.g. { de: ["ß"] } for Swiss German. */
    readonly forbiddenChars: Readonly<Record<string, readonly string[]>>;
    /** Plain English UI words that are never correct untranslated in non-default locales. */
    readonly mustTranslate: readonly string[];
    /** Per-language "Title/Subtitle/Description" words that must not be shown as copy. */
    readonly genericWords: Readonly<Record<string, readonly string[]>>;
    /** Keys (`ns:key` or `key`) to skip in every locale check. */
    readonly ignoreKeys: readonly string[];
    /** Warn about keys that exist in a language but not in the default (default true). */
    readonly extraKeys: boolean;
    /** Message grammar to validate: `auto` picks by framework (i18next `{{x}}`, ICU for next-intl, `{x}` braces for vue-i18n). */
    readonly messageSyntax: "auto" | "i18next" | "icu" | "braces" | "off";
    /** A dotless key such as t("total") only counts as a translation key when a default follows (default false). */
    readonly bareKeysNeedDefault: boolean;
    /** `calls`: a key is used when a translator call references it. `literals`: any quoted string equal to the key (or an ancestor/dynamic prefix) counts, e.g. keys kept in config objects. */
    readonly unusedMode: "calls" | "literals";
    /** Extra directories read in `literals` mode (e.g. shared packages). */
    readonly unusedRoots: readonly string[];
    /** Ratchet: tolerate up to this many unused keys and fail only above it (instead of per-key baselining). */
    readonly maxUnusedKeys?: number;
  };
  readonly idMaps: readonly IdMap[];
  readonly eslint: {
    /** Working directory for ESLint (the folder with eslint.config.*), relative to root. */
    readonly cwd: string;
    readonly files: readonly string[];
    /** Messages containing any of these (case-insensitive) count as i18n findings. */
    readonly messageMatch: readonly string[];
    /** ESLint rule ids always counted as i18n findings. */
    readonly ruleIds: readonly string[];
  }[];
  readonly baseline: { readonly file: string };
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? readonly U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export interface LocaleFile {
  readonly lang: string;
  /** Namespace name; empty string for the flat layout. */
  readonly ns: string;
  /** Path relative to the project root. */
  readonly file: string;
  /** Flattened `a.b.c` -> leaf value. */
  readonly values: Readonly<Record<string, unknown>>;
  /** Keys that appear twice in one JSON object. */
  readonly duplicates: readonly string[];
}

/** lang -> ns -> file (missing files are simply absent). */
export type LocaleSet = ReadonlyMap<string, ReadonlyMap<string, LocaleFile>>;

export interface CheckContext {
  readonly config: GuardConfig;
  readonly locales: LocaleSet;
  /** Only these files (relative to root) for source-based checks, or null for all. */
  readonly staged: ReadonlySet<string> | null;
}

export interface Check {
  readonly name: string;
  readonly description: string;
  /** Skipped in --staged mode (needs the whole project). */
  readonly wholeProject: boolean;
  run(ctx: CheckContext): Promise<Issue[]> | Issue[];
}

export interface BaselineFile {
  readonly _note?: string;
  readonly entries: Record<string, number>;
}
