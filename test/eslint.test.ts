import assert from "node:assert/strict";
import { test } from "node:test";
import { ESLint } from "eslint";
import { react, reactNative, vue } from "../src/eslint/index.js";
import vuePlugin from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";

async function lint(code: string, file: string, config: unknown[]): Promise<string[]> {
  const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: config as never, cwd: process.cwd() });
  const [r] = await eslint.lintText(code, { filePath: file });
  return (r?.messages ?? []).map((m) => `${m.ruleId}: ${m.message}`);
}

const PLANTED: Array<[string, string, RegExp]> = [
  ["jsx text", "<p>Documents</p>", /no-literal-string/],
  ["attribute", '<input placeholder="Enter your name" />', /Hardcoded user-visible attribute/],
  ["ternary attr", '<input title={a ? "Yes please" : t("x")} />', /Hardcoded user-visible attribute/],
  ["template attr", "<input title={`Hello ${n}`} />", /template literal/],
  ["jsx expr", '<p>{a ? "Nothing here" : null}</p>', /JSX expression/],
  ["Alert", 'Alert.alert("Something failed");', /Alert text/],
  ["toast", 'toast.error("Could not save");', /toast text/],
  ["showToast", 'showToast("Could not save");', /toast text/],
  ["toast template", "toast.error(`Failed ${x}`);", /Template-literal toast/],
  ["fallback", 't("a") || "Save it";', /English fallback/],
  ["as any", 't("a.b" as any);', /as any/],
  ["object copy", 'const tabs = [{ title: "Documents" }];', /object property/],
];

test("react preset flags every planted violation", async () => {
  for (const [name, code, re] of PLANTED) {
    const m = await lint(`const x = () => (<>${/^</.test(code) ? code : ""}</>);\n${/^</.test(code) ? "" : code}`, "a.tsx", react());
    assert.ok(m.some((x) => re.test(x)), `${name}: ${m.join(" | ")}`);
  }
});

test("react preset accepts translated code and non-copy strings", async () => {
  const code = `const x = () => (<><p>{t("a")}</p><input placeholder={t("b")} className="flex" /><a href="https://x.com">{t("c")}</a></>);\nconst o = { id: "user_profile", url: "/x" };`;
  assert.deepEqual(await lint(code, "a.tsx", react()), []);
});

test("react-native preset also flags accessibility props", async () => {
  const m = await lint('const x = () => <View accessibilityLabel="Close dialog" />;', "a.tsx", reactNative());
  assert.ok(m.some((x) => /Hardcoded user-visible attribute/.test(x)));
});

test("allowStrings keeps brand names out", async () => {
  const code = 'const x = () => <input placeholder="Acme" />;';
  assert.ok((await lint(code, "a.tsx", react())).length > 0);
  assert.deepEqual(await lint(code, "a.tsx", react({ allowStrings: ["Acme"] })), []);
});

test("vue preset flags bare template strings", async () => {
  const m = await lint("<template><p>Documents</p><p>{{ $t('a') }}</p></template>", "A.vue", vue({ vuePlugin, vueParser }));
  assert.ok(m.some((x) => x.includes("vue/no-bare-strings-in-template")), m.join("|"));
});
