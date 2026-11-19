import fs from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { BASE_FILES, project } from "./helpers.js";

const cli = path.resolve("src/cli.ts");
const tsx = path.resolve("node_modules/.bin/tsx");
const exec = (cwd: string, ...a: string[]) => spawnSync(tsx, [cli, ...a], { cwd, encoding: "utf8" });

test("init detects locales, check passes clean, fails on a planted bug, baseline accepts it", () => {
  const root = project({ ...BASE_FILES, "package.json": { name: "x", dependencies: { "react-i18next": "1" } } });
  { const r = exec(root, "init"); assert.equal(r.status, 0, r.stderr + r.stdout); }
  const cfg = JSON.parse(fs.readFileSync(`${root}/i18n-guard.config.json`, "utf8")) as { locales: { languages: string[] } };
  assert.deepEqual(cfg.locales.languages, ["de", "en"]);
  assert.equal(exec(root, "check", "--only", "parity,missing-keys,hygiene").status, 0);
  fs.writeFileSync(`${root}/src/B.tsx`, 't("ghost");');
  const bad = exec(root, "check", "--only", "missing-keys");
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /ghost/);
  assert.equal(exec(root, "baseline").status, 0);
  assert.equal(exec(root, "check").status, 1, "eslint is on but no eslint config: must fail loudly, not pass silently");
  assert.equal(exec(root, "check", "--only", "missing-keys").status, 0);
  { const r = exec(root, "check", "--format", "sarif", "--only", "missing-keys"); assert.equal(r.status, 0, r.stderr + r.stdout); }
  { const r = exec(root, "doctor"); assert.equal(r.status, 0, r.stderr + r.stdout); }
});
