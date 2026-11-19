# Config reference

`i18n-guard.config.json` (or `.mjs`/`.js` default export). Everything has a default; presets come from `framework`.

```jsonc
{
  "framework": "react-i18next",            // | "next-intl" | "vue-i18n"
  "locales": {
    "dir": "src/locales",
    "layout": "namespaced",                // dir/<lang>/<ns>.json  |  "flat": dir/<lang>.json
    "default": "en",
    "languages": ["en", "de", "fr"],
    "namespaces": []                        // empty = every json in the default language
  },
  "source": { "roots": ["src"], "extensions": [".ts", ".tsx"], "exclude": ["__tests__"] },
  "translators": "t|i18n\\.t",              // regex source for translator identifiers (t, tCommon, $t ...)
  "checks": { "eslint": true, "unusedKeys": true, "sortedKeys": true },   // toggle any check (types, syntax on by default; sortedKeys opt-in)
  "options": {
    "allowSameAsDefault": ["IBAN", "PDF"],  // identical-by-design values
    "neutralWordMaxLength": 12,             // single words up to this length are international terms
    "forbiddenChars": { "de": ["ß"] },      // e.g. Swiss German: "ss" only
    "mustTranslate": ["save", "cancel"],    // English UI words never valid in other locales
    "genericWords": { "de": ["titel"] },    // "Title" words that must not be shown as copy
    "ignoreKeys": ["admin:profile.header.title"],
    "messageSyntax": "auto",                // auto | i18next | icu | braces | off
    "extraKeys": true,                      // warn about keys not in the default language
    "bareKeysNeedDefault": false,           // t("total") only counts as a key when a default follows
    "unusedMode": "calls",                  // or "literals" (any quoted string counts as use)
    "maxUnusedKeys": 390                    // ratchet instead of per-key baselining
  },
  "idMaps": [{ "file": "src/routes.ts", "idPattern": "id: \"(\\w+)\"", "keyTemplate": "navigation.{id}" }],
  "eslint": [{ "cwd": "apps/web", "files": ["src/**/*.{ts,tsx}"], "messageMatch": [], "ruleIds": [] }],
  "baseline": { "file": "i18n-guard.baseline.json" }
}
```

Monorepos: list one `eslint` entry per app (each with its own `eslint.config.*`). Locale checks run once.

## Required languages, coverage and inline ignores

- `locales.required`: languages that must be complete (the default language is always required). Findings in any other language are warnings, so `check` passes and `--strict` still shows them. Empty means every language is required.
- `options.minCoverage`: number or `{ "<lang>": number }`. Coverage = share of default-language string keys that are present, non-empty and not a copy of the default (unless allowed). Enforced by the `coverage` check; see it with `i18n-guard status`.
- Inline ignore in source files: `i18n-guard-ignore-next-line` or `i18n-guard-ignore-line`, optionally followed by check names (`eslint,missing-keys`), then `-- reason`. No reason or an unknown check is an error; a marker that no longer suppresses anything is a warning.
