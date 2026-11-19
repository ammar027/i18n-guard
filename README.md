# i18n-guard

**Stop untranslated text before it ships.** One package and one config to catch hardcoded UI strings, missing or copied translations, broken `{{variables}}` and unknown keys. It works in the editor (ESLint), at commit time (`--staged`), in CI, and at runtime.

Supports **React / React Native (Expo) + i18next**, **Next.js + next-intl**, and **Vue + vue-i18n** (beta).

> Using an AI agent? Tell it: *"Follow [AGENTS.md](AGENTS.md) to set up i18n-guard in this project."*

## Why

A single lint rule is not enough. Untranslated copy still reaches users through attributes, ternaries, toasts, config objects, empty or copied values, wrong variables and keys that were never added. Each check below comes from a real miss; see [docs/RULES.md](docs/RULES.md).

## Quick start

> **Install from GitHub, not from npm.** The name `i18n-guard` on the npm registry is a different, unrelated package. Pin a release tag (below) or use `pnpm add -D github:Ammar-Multani/i18n-guard#v0.4.1`. After installing, `npx i18n-guard` runs the local copy.

```bash
npm i -D github:Ammar-Multani/i18n-guard#v0.4.1 eslint
npx i18n-guard init        # detects framework + locale folder; writes config, CI workflow, hook, Claude skill
npx i18n-guard check       # see the backlog
npx i18n-guard baseline    # accept it: from now on only NEW problems fail
```

Add the ESLint preset to `eslint.config.js`:

```js
import { reactNative } from "i18n-guard/eslint"; // react | reactNative | next | vue
export default [...yourConfig, ...reactNative({ allowStrings: ["Acme"] })];
```

Then add `npx i18n-guard check --staged` to your pre-commit hook and `check --strict` to CI (`init` writes both).

## What it catches

| Check | Example it catches |
|---|---|
| `eslint` | `<Text>Documents</Text>`, `placeholder="Search"`, `cond ? "Yes" : t("x")`, `toast("Saved")`, `` title={`Hi ${n}`} ``, `t("k") \|\| "English"`, `t("k" as any)`, `{ label: "Documents" }` |
| `parity` | key or file missing in a language |
| `untranslated` | value still identical to the default language |
| `placeholders` | key name as text, "Titel", English fragments, `[TODO]` |
| `variables` | `{{name}}` in English but `{{section}}` in German |
| `hygiene` | empty values, duplicate JSON keys, plural gaps, stray spaces, forbidden characters (e.g. `ß` for Swiss German) |
| `missing-keys` | `t("x")` where `x` is in no locale (multi-line, `defaultValue`, `ns:key`, `<Trans i18nKey>`) |
| `types` | a key is a string in one language but an array/object in another, or array lengths differ |
| `syntax` | broken messages: unbalanced `{{`/`{`, ICU `plural`/`select` without `other` (grammar picked per framework) |
| `sorted-keys` | opt-in: keys not in ascending order; `check --fix` rewrites the files |
| `unused-keys` | keys nobody references |
| `id-maps` | a route/menu id with no translation (`navigation.<id>`) |
| `coverage` | a language below `options.minCoverage` (translated share; copies of the default text do not count) |

List them with `npx i18n-guard checks`.

## Commands

| Command | Does |
|---|---|
| `init` | write config, workflow, hook and agent skill for your stack |
| `check` | run the checks; exit 1 on a new error. `--strict` also fails on warnings, `--staged` checks only staged files, `--fix` sorts keys (when `sortedKeys` is on), `--only a,b`, `--format console\|markdown\|json\|sarif`, `--output file` |
| `baseline` | record current findings so only new ones fail ([docs](docs/BASELINES.md)) |
| `report` | markdown report to `i18n-guard-report.md` |
| `sync` | add the default language's missing keys to every language (marked `[TODO]`), `--prune` removes strays; dry-run unless `--write` ([docs](docs/SYNC.md)) |
| `status` | translated share per language vs `options.minCoverage` and required/optional languages |
| `doctor` | verify config, locale files and tooling |

## Required vs optional languages, coverage, inline ignores

```jsonc
{ "locales": { "required": ["en", "de"] },            // other languages only warn
  "options": { "minCoverage": { "de": 100, "fr": 90 } } } // or a single number
```

Accept a single finding in source, with a mandatory reason; unused markers are reported as stale:

```tsx
// i18n-guard-ignore-next-line -- brand name, not copy
<Text>Acme</Text>
const k = t("legacy.key"); // i18n-guard-ignore-line missing-keys -- generated at runtime
```

Locale JSON cannot hold comments: use `options.ignoreKeys` there.

## Runtime: catch keys users actually hit

```ts
import { installMissingKeyReporter } from "i18n-guard/runtime";
installMissingKeyReporter(i18n, { report: (e) => Sentry.captureMessage(`i18n missing ${e.namespace}:${e.key}`) });
```

i18next reports only keys missing in **every** language; a language silently falling back to English is caught at build time by `parity`/`untranslated`. `pseudoLocalize()` helps QA spot hardcoded runtime text ([docs](docs/RUNTIME.md)).

## Examples

[`examples/`](examples) has a minimal Expo, Next.js and Vue project, each with a clean state that passes and a planted-bug state that fails. They run as tests, so they stay true.

## Docs

[Adoption](docs/ADOPTION.md) · [Config reference](docs/CONFIG.md) · [Baselines](docs/BASELINES.md) · [Runtime](docs/RUNTIME.md) · [Rules: incident → check](docs/RULES.md) · [AGENTS.md](AGENTS.md)

## Status

React / React Native + i18next is the most proven. next-intl is covered by tests and an example. Vue is **beta**: template strings via `eslint-plugin-vue` and the key scanner, not yet battle-tested.

## Development

```bash
npm install     # also builds
npm test        # unit tests, ESLint preset tests, CLI test, all example states
npm run check:private   # sanitise gate before publishing
```

MIT licensed.
