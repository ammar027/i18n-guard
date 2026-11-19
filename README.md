# i18n-guard

Stop untranslated text before it ships. One package, one config, for **React / React Native (Expo) + i18next**, **Next.js (next-intl)** and **Vue (vue-i18n, beta)**.

It exists because "we have a lint rule" is not enough: untranslated copy still reaches users through attributes, ternaries, toasts, config objects, empty or copied values, wrong `{{variables}}`, and keys that were never added. Every check here maps to a real miss — see [docs/RULES.md](docs/RULES.md).

## Quick start

```bash
npm i -D i18n-guard eslint
npx i18n-guard init        # detects framework + locale folder, writes config, CI workflow, hook, Claude skill
npx i18n-guard check       # see the backlog
npx i18n-guard baseline    # accept it: only NEW problems fail from now on
```

Add the ESLint preset (hardcoded text, attributes, toasts, template literals, English fallbacks, `as any` keys):

```js
// eslint.config.js
import { reactNative } from "i18n-guard/eslint"; // or: react, next, vue
export default [...yourConfig, ...reactNative({ allowStrings: ["Acme"] })];
```

## Checks

| Check | Catches |
|---|---|
| `eslint` | hardcoded JSX text, visible attributes, ternary / `||` text, `Alert`/toast strings, template literals, `t("k") \|\| "English"`, `t("k" as any)`, hardcoded object-literal copy |
| `parity` | key missing in a language, missing file, stray keys |
| `untranslated` | value still identical to the default language |
| `placeholders` | key name as text, generic "Title/Titel", English fragments, `[TODO]` |
| `variables` | `{{var}}` differs from the default language |
| `hygiene` | empty values, duplicate JSON keys, plural gaps, stray whitespace, forbidden characters (e.g. `ß` for Swiss German) |
| `missing-keys` | `t("x")` where `x` is not in the default locale (multi-line, `defaultValue`, `as any`, `ns:key`, `<Trans i18nKey>`) |
| `unused-keys` | keys nobody references (ratchet via baseline) |
| `id-maps` | ids from a routes/menu config without translation (`navigation.<id>`) |

Run `npx i18n-guard checks` for the list. Baselines, `--staged` fast mode, `--strict`, and `markdown | json | sarif` reports are built in.

## Runtime: report missing keys users actually hit

```ts
import { installMissingKeyReporter } from "i18n-guard/runtime";
installMissingKeyReporter(i18n, { report: (e) => Sentry.captureMessage(`i18n missing ${e.namespace}:${e.key}`) });
```
i18next only calls this for keys that exist in **no** language; a language silently falling back to English is caught by `parity`/`untranslated` at build time. `pseudoLocalize()` / `pseudoPostProcessor` help QA spot hardcoded runtime text.

## Docs
[ADOPTION](docs/ADOPTION.md) · [CONFIG](docs/CONFIG.md) · [BASELINES](docs/BASELINES.md) · [RUNTIME](docs/RUNTIME.md) · [RULES](docs/RULES.md)

Vue support is **beta** (template rule + scanner; not battle-tested). MIT licensed.
