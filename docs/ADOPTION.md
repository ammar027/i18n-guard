# Adopting on an existing project

0. Install from GitHub (`npm i -D github:Ammar-Multani/i18n-guard#v0.4.1 eslint`); the npm registry has an unrelated package of the same name.
1. `npx --no-install i18n-guard init`, then `npx i18n-guard doctor`.
2. Add the ESLint preset (`react`, `reactNative`, `next`, or `vue`) from `i18n-guard/eslint` to `eslint.config.js`.
   - Monorepo: set `eslint[].cwd` in the config for each app.
   - Vue: `vue({ vuePlugin, vueParser })` with `eslint-plugin-vue` + `vue-eslint-parser` (beta).
3. `npx i18n-guard check` — read the backlog. Fix real misses first (empty values, wrong variables, missing keys).
4. `npx i18n-guard baseline` to accept what is left; fix it gradually.
5. Hook: call `.husky/i18n-guard-pre-commit` from `.husky/pre-commit` (`check --staged`, fast: locale checks + staged files).
6. CI: `.github/workflows/i18n-guard.yml` runs `check --strict`. Upload SARIF with `--format sarif --output i18n.sarif` if you use code scanning.
7. Using Claude Code? `init` installs `.claude/skills/i18n-fix` so the agent fixes findings the documented way.

Not covered: raw text outside `<Text>` in React Native (a crash, not an i18n issue — use `eslint-plugin-react-native`), and strict typed keys (`i18next` `CustomTypeOptions`), which pair well with this tool but cost build time.
