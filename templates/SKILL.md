---
name: i18n-fix
description: Run i18n-guard, read the findings and fix untranslated text, missing keys, placeholder mismatches and locale problems using the project's translation files.
---

# Fix i18n-guard findings

1. Run `npx i18n-guard check --format markdown --output i18n-guard-report.md` and read it.
2. Fix by finding type:
   - **eslint (hardcoded copy)**: replace the string with `t("section.key")`; add the key to the default locale first, then every other locale with a real translation. Never use a `[TODO]` placeholder, never `t("key") || "English"`, never `t("key" as any)`.
   - **missing-keys**: add the key to the default locale (and all others) or correct the typo in the call.
   - **parity / untranslated / placeholders**: translate the value properly (not the key name, not "Title"). Keep names, codes and units that are genuinely international and add them to `options.allowSameAsDefault` only when that is true.
   - **variables**: every `{{name}}` in the default text must appear unchanged in each translation.
   - **hygiene**: no empty values, duplicate keys, stray spaces, forbidden characters (see `options.forbiddenChars`); keep `_one` and `_other` together.
   - **unused-keys**: delete the key everywhere, unless it is built dynamically; then add an `idMaps` entry.
3. Re-run `npx i18n-guard check --strict` until it is clean. Only run `npx i18n-guard baseline` when the user explicitly accepts the backlog.
