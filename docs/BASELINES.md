# Baselines

`i18n-guard baseline` records current error findings in `i18n-guard.baseline.json` (id → count). Later runs hide exactly those findings, so **only new problems fail**. Ids ignore line numbers (file + message + trimmed source line, or `lang/ns:key`), so refactors don't invalidate them.

When something is fixed its entry becomes *stale*: the run warns `Baseline entry no longer matches` (and `--strict` fails) until you re-run `baseline`. That keeps the file shrinking.

`--no-baseline` shows everything. Never baseline to silence a fresh bug; fix it.
