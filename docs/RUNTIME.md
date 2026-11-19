# Runtime helpers

- `createMissingKeyHandler({ report, sampleRate, maxKeys })` — i18next `missingKeyHandler`; each distinct key is reported once, capped, never throws.
- `installMissingKeyReporter(i18n, opts)` — sets `saveMissing` + the handler.
- `pseudoLocalize(text)` / `pseudoPostProcessor` — `Save {{n}}` → `[Sávé {{n}} ~~~]`; run QA builds in a `pseudo` language and any un-bracketed text on screen is hardcoded.

Limits: i18next reports only keys missing in **every** language. Falling back from `de` to `en` is not signalled; `parity`/`untranslated` cover it at build time.
