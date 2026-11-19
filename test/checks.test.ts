import assert from "node:assert/strict";
import { test } from "node:test";
import { byCheck, run } from "./helpers.js";
import { findDuplicateKeys } from "../src/locales.js";

test("clean project passes with no findings", async () => {
  assert.deepEqual(await run({}), []);
});

test("parity: key missing in a language and missing file", async () => {
  const i = await run({ "src/locales/de/common.json": { save: "Speichern" } });
  assert.ok(byCheck(i, "parity").some((x) => x.key === "common:greeting" && x.locale === "de"));
  const j = await run({}, { locales: { languages: ["en", "de", "fr"] } });
  assert.ok(byCheck(j, "parity").some((x) => x.locale === "fr" && /missing/i.test(x.message)));
});

test("untranslated: value identical to English fails, short/neutral words pass", async () => {
  const i = await run({ "src/locales/en/common.json": { a: "Please choose a file", b: "Status", save: "Save changes", greeting: "Hello {{name}}", items_one: "{{count}} item", items_other: "{{count}} items" },
    "src/locales/de/common.json": { a: "Please choose a file", b: "Status", save: "Speichern", greeting: "Hallo {{name}}", items_one: "{{count}} Eintrag", items_other: "{{count}} Einträge" } });
  const u = byCheck(i, "untranslated");
  assert.equal(u.length, 1);
  assert.equal(u[0]?.key, "common:a");
});

test("placeholders: key name, generic word, English fragment, TODO", async () => {
  const en = { bannerDescription: "Shown on the dashboard", save: "Save", fragLine: "Welcome to the place", todo: "Do it" };
  const de = { bannerDescription: "Banner Description", save: "Titel", fragLine: "Please contact the admin with the form", todo: "[TODO] Do it" };
  const i = byCheck(await run({ "src/locales/en/common.json": en, "src/locales/de/common.json": de }), "placeholders").map((x) => x.message);
  for (const needle of ["key name left as text", "generic field word", "English sentence fragment", "TODO marker"]) {
    assert.ok(i.some((m) => m.includes(needle)), needle);
  }
});

test("variables: {{x}} mismatch", async () => {
  const i = await run({ "src/locales/de/common.json": { save: "Speichern", greeting: "Hallo {{section}}", items_one: "{{count}} E", items_other: "{{count}} Es" } });
  assert.equal(byCheck(i, "variables").length, 1);
});

test("hygiene: empty, whitespace, forbidden char, plural gap, duplicate", async () => {
  const dupText = '{ "save": "Speichern", "save": "Sichern", "greeting": "", "x": " pad ", "strasse": "Straße", "items_one": "{{count}} E" }';
  const i = byCheck(await run({ "src/locales/de/common.json": dupText }, { options: { forbiddenChars: { de: ["ß"] } } }), "hygiene").map((x) => x.message).join("\n");
  for (const needle of ["appears twice", "Empty value", "whitespace", "forbidden character", "need both _one and _other"]) assert.match(i, new RegExp(needle), needle);
});

test("findDuplicateKeys ignores arrays and nested distinct objects", () => {
  assert.deepEqual(findDuplicateKeys('{"a":{"x":1},"b":{"x":2},"c":["a","a"]}'), []);
  assert.deepEqual(findDuplicateKeys('{"a":{"x":1,"x":2}}'), ["x"]);
});

test("missing-keys: unknown key, as any, defaultValue, multi-line, explicit ns; dynamic ignored; plural ok", async () => {
  const src = `
    t("common:nope1");
    t("nope2" as any);
    t("nope3", { defaultValue: "x" });
    t(
      "nope4"
    );
    t(\`dyn.\${x}\`);
    t("common:items", { count: 1 });
    <Trans i18nKey="nope5" />;
    t("common:save");`;
  const keys = byCheck(await run({ "src/B.tsx": src }), "missing-keys").map((x) => x.key).sort();
  assert.deepEqual(keys, ["nope1", "nope2", "nope3", "nope4", "nope5"]);
});

test("unused-keys: orphan reported, dynamic prefix and idMaps count as used", async () => {
  const files = {
    "src/locales/en/common.json": { save: "Save changes", orphan: "Old", "menu.home": "Home", "dyn.a": "A", greeting: "Hello {{name}}", items_one: "{{count}} item", items_other: "{{count}} items" },
    "src/locales/de/common.json": { save: "Speichern", orphan: "Alt", "menu.home": "Start", "dyn.a": "Ae", greeting: "Hallo {{name}}", items_one: "{{count}} Eintrag", items_other: "{{count}} Einträge" },
    "src/B.tsx": "t(`dyn.${k}`);",
    "src/routes.ts": "export const routes = [{ id: 'home' }];",
  };
  const i = await run(files, { idMaps: [{ file: "src/routes.ts", idPattern: "id: '(\\w+)'", keyTemplate: "menu.{id}" }] });
  const unused = byCheck(i, "unused-keys").map((x) => x.key);
  assert.deepEqual(unused, ["common:orphan"]);
});

test("id-maps: id without translation in a language", async () => {
  const files = { "src/routes.ts": "export const routes = [{ id: 'billing' }];" };
  const i = await run(files, { idMaps: [{ file: "src/routes.ts", idPattern: "id: '(\\w+)'", keyTemplate: "menu.{id}" }] });
  assert.equal(byCheck(i, "id-maps").length, 2);
});

test("flat layout + next-intl prefix resolution", async () => {
  const files = {
    "messages/en.json": { Home: { title: "Welcome home" } },
    "messages/de.json": { Home: { title: "Willkommen zuhause" } },
    "src/P.tsx": 'const t = useTranslations("Home"); t("title"); t("nope");',
  };
  const root = (await import("./helpers.js")).project(files);
  const { runGuard } = await import("../src/runner.js");
  const { resolveConfig } = await import("../src/config.js");
  const r = await runGuard(resolveConfig({ framework: "next-intl", locales: { languages: ["en", "de"] }, checks: { unusedKeys: false } }, root), { noBaseline: true });
  assert.deepEqual(byCheck(r.issues, "missing-keys").map((x) => x.key), ["Home.nope"]);
});

test("baseline: known findings pass, new ones fail, fixed ones are stale", async () => {
  const { project, cfg, BASE_FILES } = await import("./helpers.js");
  const { runGuard } = await import("../src/runner.js");
  const root = project({ ...BASE_FILES, "src/B.tsx": 't("old1");' });
  const c = cfg(root);
  assert.equal((await runGuard(c, { noBaseline: true })).failed, true);
  await runGuard(c, { updateBaseline: true });
  assert.equal((await runGuard(c)).failed, false);
  const fs = await import("node:fs");
  fs.writeFileSync(`${root}/src/B.tsx`, 't("old1"); t("new2");');
  assert.deepEqual(byCheck((await runGuard(c)).issues, "missing-keys").map((x) => x.key), ["new2"]);
  fs.writeFileSync(`${root}/src/B.tsx`, "");
  const r = await runGuard(c);
  assert.ok(r.issues.some((i) => i.check === "baseline"));
  assert.equal(r.failed, false);
  assert.equal((await runGuard(c, { strict: true })).failed, true);
});

test("react-i18next: a file binding several namespaces does not produce false missing keys", async () => {
  const files = {
    "src/locales/en/docs.json": { archived: "Archived items" },
    "src/locales/de/docs.json": { archived: "Archivierte Elemente" },
    "src/M.tsx": 'const a = useTranslation("common"); const b = useTranslation("docs"); b.t("archived"); t("docs:archived"); t("common:ghost");',
  };
  const i = await run(files, { locales: { namespaces: ["common", "docs"] } });
  assert.deepEqual(byCheck(i, "missing-keys").map((x) => x.key), ["ghost"]);
});
