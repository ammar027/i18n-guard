# Examples

Three minimal projects, each in two states:

| Example | Stack | Planted bug (`bug/` overlay) | Fails with |
|---|---|---|---|
| [`expo-i18next`](expo-i18next) | Expo / React Native + react-i18next | hardcoded `placeholder`, unknown key, wrong `{{variable}}` in German | `eslint`, `missing-keys`, `variables` |
| [`next-intl`](next-intl) | Next.js + next-intl | hardcoded `title`, unknown key, key missing in German | `eslint`, `missing-keys`, `parity` |
| [`vue-i18n`](vue-i18n) *(beta)* | Vue 3 + vue-i18n | bare template text, unknown key | `eslint`, `missing-keys` |

The example folder is the **clean** state and passes `i18n-guard check --strict`. The `bug/` folder holds the files that replace the clean ones to create the **planted-bug** state.

Try it by hand:

```bash
npm install && npm run build         # in the repo root
cd examples/expo-i18next && npm install && npm run check:i18n          # clean: passes
cp -r bug/* . && npm run check:i18n                                    # planted bug: fails
git checkout . && git clean -fd .                                      # restore
```

`npm test` in the repo root runs all six states automatically (`test/examples.test.ts`) with the real ESLint presets.
