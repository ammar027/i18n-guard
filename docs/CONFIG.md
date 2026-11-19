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
  "checks": { "eslint": true, "unusedKeys": true },   // toggle any check
  "options": {
    "allowSameAsDefault": ["IBAN", "PDF"],  // identical-by-design values
    "neutralWordMaxLength": 12,             // single words up to this length are international terms
    "forbiddenChars": { "de": ["ß"] },      // e.g. Swiss German: "ss" only
    "mustTranslate": ["save", "cancel"],    // English UI words never valid in other locales
    "genericWords": { "de": ["titel"] },    // "Title" words that must not be shown as copy
    "ignoreKeys": ["admin:profile.header.title"]
  },
  "idMaps": [{ "file": "src/routes.ts", "idPattern": "id: \"(\\w+)\"", "keyTemplate": "navigation.{id}" }],
  "eslint": [{ "cwd": "apps/web", "files": ["src/**/*.{ts,tsx}"], "messageMatch": [], "ruleIds": [] }],
  "baseline": { "file": "i18n-guard.baseline.json" }
}
```

Monorepos: list one `eslint` entry per app (each with its own `eslint.config.*`). Locale checks run once.
