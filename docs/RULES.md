# Rules: incident → check

| What went wrong | Check |
|---|---|
| "Documents" tab stayed English: hardcoded `label:` in a config object, looked up later | `eslint` object-literal copy |
| `placeholder="Enter name"` / `title=` / `aria-label=` left in English | `eslint` attribute selectors |
| `{cond ? "Yes" : t("x")}` and `toast.error("...")` | `eslint` ternary / toast selectors |
| `t("k") \|\| "English"` hides a missing key | `eslint` fallback selector |
| `t("k" as any)` bypasses type checks | `eslint` `as any` selector + `missing-keys` |
| Key added in English only | `parity` |
| Copy-pasted English value | `untranslated` |
| "Banner Description", "Titel", "[TODO] ..." shown to users | `placeholders` |
| `{{section}}` printed literally; wrong variable reverses meaning | `variables` |
| Empty string renders nothing; duplicate key silently wins | `hygiene` |
| `ß` in a Swiss German UI | `hygiene` + `forbiddenChars` |
| Menu item added to routes, translation forgotten | `id-maps` |
| Dead keys pile up | `unused-keys` |
| A key that exists nowhere reaches production | `runtime` reporter |
