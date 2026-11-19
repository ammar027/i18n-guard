# Pseudo-locale smoke test

Catches what the static checks cannot: visible text that never went through `t()` because it comes from a database, an API, an enum, a third-party widget, or code the scanner does not understand.

## How it works
1. Build/run the app with a pseudo-locale: every translated string is post-processed to `[Sávé {{name}} ~~~]` (`pseudoLocalize` / `pseudoPostProcessor` from `@ammar-multani/i18n-guard/runtime`).
2. In Playwright, visit the routes that matter per role and call `scanPage(page, options)` from `@ammar-multani/i18n-guard/playwright`.
3. Visible text that is not bracketed is reported with an element hint (`tag[testid].classes`).

```ts
import { scanPage, pseudoCount, formatViolations } from "@ammar-multani/i18n-guard/playwright";

expect(await pseudoCount(page), "pseudo-locale is not active in this build").toBeGreaterThan(0);
const v = await scanPage(page, { allow: [/^CHF /, "Acme"], ignoreSelectors: ["[data-user-content]"] });
expect(v, formatViolations(route, v)).toEqual([]);
```

## Wiring i18next (gate it behind a build flag so production is unaffected)
```ts
import { pseudoPostProcessor } from "@ammar-multani/i18n-guard/runtime";
if (process.env.PSEUDO === "1") { i18n.use(pseudoPostProcessor); options.postProcess = ["pseudo"]; }
```

## Tuning
- Built in: texts whose only letters are a short all-caps token (`CHF 1'250.50`, `ABC-123`) and anything without 2+ consecutive letters are ignored. Hidden elements, `<script>` and `<style>` are skipped.
- `allow`: exact strings or regexes for brand names and data patterns. `ignoreSelectors`: subtrees to skip (user-generated content, charts).
- Dates with month names and user names will show up on the first run: allow-list the pattern or mark the container.
- Keep it opt-in (a tagged project or an env flag), not in every CI run; it needs the pseudo build and a logged-in session per role.

`i18n-guard`'s `examples/pseudo-locale-playwright` shows the flow end to end on inline pages.
