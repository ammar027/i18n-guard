import assert from "node:assert/strict";
import { test } from "node:test";
import { JSDOM } from "jsdom";
import { pseudoLocalize } from "../src/runtime/index.js";
import { collectVisibleText, findViolations, formatViolations, isPseudo, scanPage } from "../src/playwright/index.js";

/** Run the in-page collector against real DOM (jsdom) the way page.evaluate would. */
function pageFor(html: string) {
  return {
    async evaluate<R, A>(fn: (arg: A) => R, arg: A): Promise<R> {
      const dom = new JSDOM(html);
      const g = globalThis as Record<string, unknown>;
      const prev = { document: g.document, NodeFilter: g.NodeFilter, getComputedStyle: g.getComputedStyle };
      g.document = dom.window.document;
      g.NodeFilter = dom.window.NodeFilter;
      g.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
      try {
        return fn(arg);
      } finally {
        Object.assign(g, prev);
      }
    },
  };
}

test("isPseudo recognises pseudoLocalize output and nothing else", () => {
  assert.ok(isPseudo(pseudoLocalize("Save changes")));
  assert.ok(isPseudo(pseudoLocalize("Hello {{name}}")));
  assert.ok(!isPseudo("Save changes"));
  assert.ok(!isPseudo("[draft]"));
});

test("scanPage: clean page has no violations, planted hardcoded text is found with its element", async () => {
  const clean = `<body><h1>${pseudoLocalize("Your projects")}</h1><button>${pseudoLocalize("Save")}</button><span>42</span></body>`;
  assert.deepEqual(await scanPage(pageFor(clean)), []);
  const bug = `<body><h1>${pseudoLocalize("Your projects")}</h1><button data-testid="doc-tab">Documents</button></body>`;
  const v = await scanPage(pageFor(bug));
  assert.equal(v.length, 1);
  assert.equal(v[0]?.text, "Documents");
  assert.match(v[0]?.element ?? "", /button\[doc-tab\]/);
});

test("scanPage ignores hidden text, scripts, numbers/punctuation, ignoreSelectors and allow entries", async () => {
  const html = `<body>
    <p style="display:none">Hidden English</p>
    <script>var x = "Script text";</script>
    <style>.a { color: red }</style>
    <span>CHF 1'250.50 — 12.03.2026</span>
    <div class="user-content">Anna Müller wrote this</div>
    <b>Acme</b><i>Invoice ABC-123</i><u>Real hardcoded</u>
  </body>`;
  const v = await scanPage(pageFor(html), { ignoreSelectors: [".user-content"], allow: ["Acme", /^Invoice [A-Z]+-\d+$/] });
  assert.deepEqual(v.map((x) => x.text), ["Real hardcoded"]);
});

test("findViolations dedupes and formatViolations truncates", () => {
  const texts = [{ text: "Hello", element: "p" }, { text: "Hello", element: "p" }, { text: "World", element: "b" }];
  const v = findViolations(texts);
  assert.equal(v.length, 2);
  assert.match(formatViolations("/dash", v, 1), /and 1 more/);
});

test("collectVisibleText exposes the serialisable function used by page.evaluate", () => {
  assert.equal(typeof collectVisibleText, "function");
  assert.ok(!collectVisibleText.toString().includes("import("));
});
