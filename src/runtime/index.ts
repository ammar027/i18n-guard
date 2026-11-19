/** Runtime helpers: report missing keys users actually hit, and pseudo-localize for QA builds. */

export interface MissingKeyEvent {
  readonly languages: readonly string[];
  readonly namespace: string;
  readonly key: string;
}

export interface ReporterOptions {
  /** Called once per distinct key (e.g. Sentry.captureMessage). Never throws into the app. */
  readonly report: (e: MissingKeyEvent) => void;
  /** 0..1, default 1. */
  readonly sampleRate?: number;
  /** Cap on distinct keys remembered/reported per session (default 200). */
  readonly maxKeys?: number;
}

/** Returns an i18next `missingKeyHandler`. Reports each distinct key once. */
export function createMissingKeyHandler(opts: ReporterOptions): (lngs: readonly string[], ns: string, key: string) => void {
  const seen = new Set<string>();
  const max = opts.maxKeys ?? 200;
  const rate = opts.sampleRate ?? 1;
  return (lngs, ns, key) => {
    const id = `${ns}:${key}`;
    if (seen.has(id) || seen.size >= max) return;
    seen.add(id);
    if (rate < 1 && Math.random() > rate) return;
    try {
      opts.report({ languages: lngs, namespace: ns, key });
    } catch {
      /* reporting must never break the app */
    }
  };
}

interface I18nLike {
  options: Record<string, unknown>;
}

/**
 * Wire the handler into an i18next instance. Note: i18next calls it only when a key
 * exists in NO language; a German key that silently falls back to English is caught
 * by the build-time parity check, not here.
 */
export function installMissingKeyReporter(i18n: I18nLike, opts: ReporterOptions): void {
  i18n.options.saveMissing = true;
  i18n.options.missingKeyHandler = createMissingKeyHandler(opts);
}

const ACCENTS: Record<string, string> = { a: "á", e: "é", i: "í", o: "ö", u: "ü", c: "ç", n: "ñ", A: "Å", E: "É", I: "Î", O: "Ø", U: "Ú" };

/** "Save {{name}}" -> "[Sávé {{name}} ~~~]". Variables and HTML tags are left intact. */
export function pseudoLocalize(text: string): string {
  const out = text.replace(/(\{\{[^}]*\}\}|<[^>]+>)|([A-Za-z])/g, (_m, keep: string | undefined, ch: string | undefined) => keep ?? ACCENTS[ch ?? ""] ?? ch ?? "");
  return `[${out} ${"~".repeat(Math.max(1, Math.ceil(text.length * 0.3)))}]`;
}

/** i18next post-processor: `i18n.use(pseudoPostProcessor).init({ postProcess: ["pseudo"], lng: "pseudo" })`. */
export const pseudoPostProcessor = {
  type: "postProcessor" as const,
  name: "pseudo",
  process: (value: string): string => pseudoLocalize(value),
};
