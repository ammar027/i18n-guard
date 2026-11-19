/**
 * Pseudo-locale smoke testing for Playwright (or anything with `page.evaluate`).
 *
 * Run your app with the pseudo-locale on (every translated string renders as
 * "[Sávé ~~~]", see `pseudoLocalize` in the runtime entry). Any visible text that is NOT
 * wrapped like that did not come from t(): hardcoded copy, labels from a database or API,
 * raw enum values, third-party widgets. The static checks cannot see those.
 */

export interface ScanOptions {
  /** Text that is fine untranslated: exact strings or regexes (brand names, user data patterns). */
  readonly allow?: ReadonlyArray<string | RegExp>;
  /** CSS selectors whose whole subtree is skipped (user-generated content, charts, third-party widgets). */
  readonly ignoreSelectors?: readonly string[];
  /** A text node needs at least this many consecutive letters to count as copy (default 2). */
  readonly minLetters?: number;
}

export interface PseudoViolation {
  readonly text: string;
  /** Short hint to find the element: tag, test id / aria-label, first classes. */
  readonly element: string;
}

export interface PageLike {
  evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R>;
}

/** True for text produced by `pseudoLocalize`: "[... ~~~]". */
export const isPseudo = (text: string): boolean => /^\[[\s\S]*\s~+\]$/.test(text.trim());

/**
 * Runs inside the page. Pure DOM, no imports, so it can be serialised by `page.evaluate`.
 * Returns the visible text nodes that contain real words.
 */
export function collectVisibleText(arg: { ignoreSelectors: readonly string[]; minLetters: number }): Array<{ text: string; element: string }> {
  const out: Array<{ text: string; element: string }> = [];
  const words = new RegExp(`\\p{L}{${arg.minLetters},}`, "u");
  const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "TITLE", "HEAD"]);
  const hidden = (el: Element): boolean => {
    const anyEl = el as Element & { checkVisibility?: (o?: object) => boolean };
    if (typeof anyEl.checkVisibility === "function") return !anyEl.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    const s = getComputedStyle(el);
    return s.display === "none" || s.visibility === "hidden" || s.opacity === "0";
  };
  const describe = (el: Element): string => {
    const id = el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? el.getAttribute("id");
    const cls = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
    return `${el.tagName.toLowerCase()}${id ? `[${id}]` : ""}${cls ? `.${cls}` : ""}`;
  };
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
    const el = n.parentElement;
    if (!el || !text || !words.test(text) || skipTags.has(el.tagName)) continue;
    if (arg.ignoreSelectors.some((sel) => el.closest(sel))) continue;
    if (hidden(el)) continue;
    out.push({ text, element: describe(el) });
  }
  return out;
}

/** Visible text that is not pseudo-localised and not allowed. */
export function findViolations(
  texts: ReadonlyArray<{ text: string; element: string }>,
  allow: ReadonlyArray<string | RegExp> = [],
): PseudoViolation[] {
  // Letters-only part is a short all-caps token (CHF 1'250.50, 12:00 PM, ABC-123): codes and units, not copy.
  const neutral = (t: string): boolean => /^[^\p{L}]*\p{Lu}{1,4}[^\p{L}]*$/u.test(t);
  const allowed = (t: string): boolean => neutral(t) || allow.some((a) => (typeof a === "string" ? a === t : a.test(t)));
  const seen = new Set<string>();
  const out: PseudoViolation[] = [];
  for (const t of texts) {
    if (isPseudo(t.text) || allowed(t.text)) continue;
    const key = `${t.element}|${t.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ text: t.text, element: t.element });
  }
  return out;
}

/** Scan the current page. Regex `allow` entries are applied in Node, not in the page. */
export async function scanPage(page: PageLike, opts: ScanOptions = {}): Promise<PseudoViolation[]> {
  const texts = await page.evaluate(collectVisibleText, {
    ignoreSelectors: [...(opts.ignoreSelectors ?? [])],
    minLetters: opts.minLetters ?? 2,
  });
  return findViolations(texts, opts.allow);
}

/** How many visible texts are pseudo-localised. 0 means the pseudo-locale is not active in this build. */
export async function pseudoCount(page: PageLike): Promise<number> {
  const texts = await page.evaluate(collectVisibleText, { ignoreSelectors: [], minLetters: 2 });
  return texts.filter((t) => isPseudo(t.text)).length;
}

export function formatViolations(route: string, v: readonly PseudoViolation[], limit = 25): string {
  const lines = v.slice(0, limit).map((x) => `  ${x.element}  "${x.text.slice(0, 80)}"`);
  if (v.length > limit) lines.push(`  … and ${v.length - limit} more`);
  return `${route}: ${v.length} text(s) not from t():\n${lines.join("\n")}`;
}
