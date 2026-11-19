import assert from "node:assert/strict";
import { test } from "node:test";
import i18next from "i18next";
import { createMissingKeyHandler, installMissingKeyReporter, pseudoLocalize } from "../src/runtime/index.js";

test("reports a key missing in every language once; found keys are silent", async () => {
  const seen: string[] = [];
  const inst = i18next.createInstance();
  await inst.init({ lng: "de", fallbackLng: "en", resources: { en: { translation: { ok: "OK" } }, de: { translation: { ok: "OK" } } } });
  installMissingKeyReporter(inst as never, { report: (e) => seen.push(`${e.namespace}:${e.key}`) });
  inst.t("ok");
  inst.t("nope");
  inst.t("nope");
  inst.t("other");
  assert.deepEqual(seen, ["translation:nope", "translation:other"]);
});

test("a reporter that throws never breaks the app; maxKeys caps volume", () => {
  const h = createMissingKeyHandler({ report: () => { throw new Error("boom"); }, maxKeys: 2 });
  assert.doesNotThrow(() => { h(["de"], "ns", "a"); h(["de"], "ns", "b"); h(["de"], "ns", "c"); });
});

test("pseudoLocalize keeps variables and tags", () => {
  const p = pseudoLocalize("Save {{name}} <b>now</b>");
  assert.ok(p.includes("{{name}}") && p.includes("<b>") && p.includes("</b>"));
  assert.notEqual(p, "Save {{name}} <b>now</b>");
});
