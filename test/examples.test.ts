import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { runGuard } from "../src/runner.js";

const repo = path.resolve(".");
// Examples import "@ammar-multani/i18n-guard/eslint" and its peers: resolve them from this repo.
const self = path.join(repo, "node_modules", "@ammar-multani", "i18n-guard");
if (!fs.existsSync(self)) { fs.mkdirSync(path.dirname(self), { recursive: true }); fs.symlinkSync(repo, self, "dir"); }

function stage(example: string, withBug: boolean): string {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `example-${example}-`));
  const src = path.join(repo, "examples", example);
  fs.cpSync(src, tmp, { recursive: true, filter: (s) => path.basename(s) !== "bug" });
  if (withBug) fs.cpSync(path.join(src, "bug"), tmp, { recursive: true });
  fs.symlinkSync(path.join(repo, "node_modules"), path.join(tmp, "node_modules"), "dir");
  return tmp;
}

const expected: Record<string, string[]> = {
  "expo-i18next": ["eslint", "missing-keys", "variables"],
  "next-intl": ["eslint", "missing-keys", "parity"],
  "vue-i18n": ["eslint", "missing-keys"],
};

for (const example of Object.keys(expected)) {
  test(`example ${example}: clean passes --strict`, async () => {
    const root = stage(example, false);
    const r = await runGuard(await loadConfig(root), { strict: true, noBaseline: true });
    assert.deepEqual(r.issues, []);
    assert.ok(r.ran.includes("eslint"), "eslint check must actually run");
  });

  test(`example ${example}: planted bug fails with the expected checks`, async () => {
    const root = stage(example, true);
    const r = await runGuard(await loadConfig(root), { strict: true, noBaseline: true });
    assert.equal(r.failed, true);
    const got = new Set(r.issues.map((i) => i.check));
    for (const c of expected[example] ?? []) assert.ok(got.has(c), `${example}: expected "${c}" finding, got ${[...got].join(", ")}`);
  });
}
