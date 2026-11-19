import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { applySync, planSync } from "../src/sync.js";
import { runGuard } from "../src/runner.js";
import { cfg, project } from "./helpers.js";

const read = (root: string, rel: string): string => fs.readFileSync(path.join(root, rel), "utf8");

const EN = { a: "First text here", nav: { home: "Home page", about: "About us" }, items_one: "{{count}} item", items_other: "{{count}} items", z: "Last one" };
const DE = { a: "Erster Text hier", z: "Letzter", extra: "Übrig", nav: { home: "Startseite", gone: "Weg" }, items_one: "{{count}} Eintrag", items_other: "{{count}} Einträge", items_few: "{{count}} E" };

function setup(extra: Record<string, unknown> = {}): { root: string; config: ReturnType<typeof cfg> } {
  const root = project({ "src/locales/en/common.json": EN, "src/locales/de/common.json": DE, ...extra });
  return { root, config: cfg(root) };
}

test("dry run reports additions and writes nothing", () => {
  const { root, config } = setup();
  const before = read(root, "src/locales/de/common.json");
  const plan = planSync(config);
  assert.deepEqual(plan.files[0]?.added, ["nav.about"]);
  assert.equal(plan.removed, 0);
  assert.equal(plan.strays, 2); // extra + nav.gone; items_few is a plural form, not a stray
  assert.equal(read(root, "src/locales/de/common.json"), before);
});

test("--write adds marked keys right after their predecessor, keeps order and formatting", () => {
  const { root, config } = setup();
  applySync(config, planSync(config));
  const text = read(root, "src/locales/de/common.json");
  const json = JSON.parse(text) as { nav: Record<string, string> };
  assert.deepEqual(Object.keys(json.nav), ["home", "about", "gone"]);
  assert.equal(json.nav.about, "[TODO] About us");
  assert.equal(JSON.parse(text).a, "Erster Text hier");
  assert.ok(!text.endsWith("\n"), "original had no trailing newline, so none is added");
  assert.ok(text.includes('\n  "a"'), "keeps 2-space indent");
  assert.equal(planSync(config).files.length, 0, "idempotent");
});

test("keeps a trailing newline and tab indentation when the file has them", () => {
  const { root, config } = setup({ "src/locales/de/common.json": `${JSON.stringify(DE, null, "\t")}\n` });
  applySync(config, planSync(config));
  const text = read(root, "src/locales/de/common.json");
  assert.ok(text.endsWith("\n"));
  assert.ok(text.includes('\n\t"a"'));
});

test("synced keys are caught: placeholders flags the marker, coverage does not count them", async () => {
  const { config } = setup();
  applySync(config, planSync(config));
  const r = await runGuard(cfg(config.root, { options: { minCoverage: 100 } }), { noBaseline: true });
  assert.ok(r.issues.some((i) => i.check === "placeholders" && i.key === "common:nav.about"));
  assert.ok(r.issues.some((i) => i.check === "coverage" && i.locale === "de"));
});

test("--prune removes strays only when asked; plural forms and ignoreKeys survive", () => {
  const { root, config } = setup();
  assert.equal(planSync(config).removed, 0);
  const plan = planSync(cfg(root, { options: { ignoreKeys: ["extra"] } }), { prune: true });
  assert.deepEqual(plan.files[0]?.removed, ["nav.gone"]);
  applySync(config, planSync(config, { prune: true }));
  const json = JSON.parse(read(root, "src/locales/de/common.json")) as Record<string, unknown>;
  assert.ok(!("extra" in json));
  assert.ok("items_few" in json, "plural form needed by the language is kept");
  assert.ok(!("gone" in (json.nav as object)));
});

test("a missing language file is created with every key marked", () => {
  const root = project({ "src/locales/en/common.json": EN });
  const config = cfg(root, { locales: { languages: ["en", "fr"] } });
  const plan = planSync(config);
  assert.equal(plan.files[0]?.created, true);
  applySync(config, plan);
  const fr = JSON.parse(read(root, "src/locales/fr/common.json")) as { nav: { home: string } };
  assert.equal(fr.nav.home, "[TODO] Home page");
});

test("empty marker gives plain copies; files with duplicate keys are skipped", () => {
  const { root } = setup({ "src/locales/de/common.json": '{ "a": "x", "a": "y" }' });
  const skipped = planSync(cfg(root));
  assert.match(skipped.files[0]?.skipped ?? "", /duplicate/);
  const { root: r2 } = setup();
  const c2 = cfg(r2, { options: { syncMarker: "" } });
  applySync(c2, planSync(c2));
  assert.equal((JSON.parse(read(r2, "src/locales/de/common.json")) as { nav: { about: string } }).nav.about, "About us");
});

test("flat layout and --lang filter", () => {
  const root = project({ "messages/en.json": { Home: { t: "Welcome here" } }, "messages/de.json": {}, "messages/fr.json": {} });
  const config = cfg(root, { framework: "next-intl", locales: { dir: "messages", layout: "flat", languages: ["en", "de", "fr"] } });
  assert.equal(planSync(config).files.length, 2);
  const only = planSync(config, { langs: ["fr"] });
  assert.deepEqual(only.files.map((f) => f.lang), ["fr"]);
});

test("CLI: dry run exits 0, --check exits 1 while pending, --write applies", () => {
  const { root } = setup({ "i18n-guard.config.json": { locales: { languages: ["en", "de"] } } });
  const run = (...a: string[]) => spawnSync(path.resolve("node_modules/.bin/tsx"), [path.resolve("src/cli.ts"), "sync", ...a], { cwd: root, encoding: "utf8" });
  const dry = run();
  assert.equal(dry.status, 0);
  assert.match(dry.stdout, /Dry run/);
  assert.equal(run("--check").status, 1);
  assert.equal(run("--write").status, 0);
  assert.equal(run("--check").status, 0);
  assert.match(read(root, "src/locales/de/common.json"), /\[TODO\] About us/);
});
