# AGENTS.md — install and use i18n-guard

Give this file (or its URL) to your AI coding agent: "Follow AGENTS.md to set up i18n-guard in this project."

i18n-guard blocks untranslated text: hardcoded UI strings, missing/empty/copied translations, wrong `{{variables}}`, missing keys. Supports react-i18next (web, React Native/Expo), next-intl, vue-i18n (beta).

## Setup (do these in order, stop and report if a step fails)

1. Confirm the project uses i18next, next-intl or vue-i18n and has JSON locale files. If not, stop and tell the user.
2. Install with the project's package manager (check the lockfile: pnpm, yarn, bun or npm):
   `npm i -D i18n-guard eslint` (use `pnpm add -D` / `yarn add -D` as appropriate).
3. Run `npx i18n-guard init`. It detects the framework and locale folder and writes `i18n-guard.config.json`, a CI workflow, a pre-commit hook script and the `i18n-fix` skill. Do not overwrite existing files without `--force` and the user's OK.
4. Run `npx i18n-guard doctor` and fix what it reports (wrong locale folder, missing languages, source roots). In a monorepo, set one `eslint` entry per app in the config (see docs/CONFIG.md).
5. Add the ESLint preset to `eslint.config.js` (keep existing config):
   `import { react } from "i18n-guard/eslint";` then spread `...react()` into the config array.
   Use `reactNative` for Expo/React Native, `next` for Next.js, and for Vue `vue({ vuePlugin, vueParser })` (needs `eslint-plugin-vue`, `vue-eslint-parser`).
   Add brand names or codes that are not copy via `allowStrings: ["Acme"]`.
6. Set `options.forbiddenChars` if a locale needs it (for example Swiss German: `{ "de": ["ß"] }`).
7. Run `npx i18n-guard check` and show the user the summary by check.
8. Fix real problems first (empty values, wrong variables, missing keys, untranslated text). Only run `npx i18n-guard baseline` if the user agrees to accept the remaining backlog; never baseline a bug you just introduced.
9. Hook the guard in: call `.husky/i18n-guard-pre-commit` from `.husky/pre-commit` (`check --staged`). CI runs `check --strict`.
10. Verify: `npx i18n-guard check --strict` must exit 0.

## Daily rules for the agent

- Every user-visible string goes through `t("section.key")`. Add the key to the default locale, then to every other locale with a real translation.
- Never use `[TODO]`, the key name as text, `t("key") || "English"`, `t("key" as any)`, or copy the English text into other languages (unless it is genuinely international and listed in `options.allowSameAsDefault`).
- Keep every `{{variable}}` identical across languages; keep `_one` and `_other` plural forms together.
- Before finishing any change that touches UI text or locale files: `npx i18n-guard check --staged`, then `npx i18n-guard check --strict` for large changes.
- To fix findings, follow `.claude/skills/i18n-fix/SKILL.md` (installed by `init`).

## Commands

`init` · `check [--strict] [--staged] [--fix] [--only a,b] [--format console|markdown|json|sarif] [--output file]` · `baseline` · `report` · `doctor` · `checks`

Docs: README.md, docs/ADOPTION.md, docs/CONFIG.md, docs/BASELINES.md, docs/RUNTIME.md, docs/RULES.md.
