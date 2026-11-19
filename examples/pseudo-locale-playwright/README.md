# Pseudo-locale smoke test (Playwright)

Static checks cannot see text that arrives at runtime: labels from a database, raw enum values, server messages, third-party widgets. Run the app with the pseudo-locale (`pseudoLocalize`: every translated string renders as `[Sávé ~~~]`) and fail on any visible text that is not wrapped like that.

`pseudo.spec.ts` shows the whole flow on two inline pages (no server needed): `scanPage(page, { allow, ignoreSelectors })` returns the offending texts with an element hint. `npm run test:pseudo` runs it (needs `@playwright/test` and a browser: `npx playwright install chromium`).

See [docs/PSEUDO.md](../../docs/PSEUDO.md) for wiring a real app.
