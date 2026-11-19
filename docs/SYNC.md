# sync

```bash
npx i18n-guard sync                 # dry run: what would change
npx i18n-guard sync --write         # add missing keys
npx i18n-guard sync --write --prune # also remove keys that exist only in other languages
npx i18n-guard sync --lang fr,it    # limit to some languages
npx i18n-guard sync --check         # exit 1 while changes are pending (CI)
```

**Adds.** Every key of the default language that a language lacks is added, in the default language's order (right after its predecessor), without reordering what is already there. A missing language file is created. New values are the default text prefixed with `options.syncMarker` (default `"[TODO] "`). The `placeholders` check flags that prefix and `coverage` does not count it, so nothing synced can pass for translated. Set `syncMarker` to `""` for plain copies (the `untranslated` check then catches them unless the value is a neutral word).

**Prunes.** Only with `--prune`. Keys that exist in a language but not in the default are removed, except plural forms the language needs beyond the default's (for example `x_few` when the default has `x_one`/`x_other`) and anything in `options.ignoreKeys`. Empty parent objects disappear with their last child.

**Safe by design.** Dry run is the default. Files with duplicate JSON keys are skipped (rewriting would silently drop one). Indentation and a trailing newline are preserved. It never translates anything. Run `i18n-guard check` afterwards; commit the sync on its own so the review is just keys.
