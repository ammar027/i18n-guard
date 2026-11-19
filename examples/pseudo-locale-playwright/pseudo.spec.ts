import { expect, test } from "@playwright/test";
import { formatViolations, pseudoCount, scanPage } from "@ammar-multani/i18n-guard/playwright";
import { pseudoLocalize } from "@ammar-multani/i18n-guard/runtime";

// In a real project the page is your running app started with the pseudo-locale on
// (see docs/PSEUDO.md). Here two inline pages stand in for it so the example needs no server:
// every string that went through t() is pseudo-localised, the bug page has one that did not.
const t = (s: string): string => pseudoLocalize(s);

const clean = `<main>
  <h1>${t("Your projects")}</h1>
  <button>${t("Create project")}</button>
  <span>CHF 1'250.50</span>
</main>`;

const bug = `<main>
  <h1>${t("Your projects")}</h1>
  <button data-testid="docs-tab">Documents</button>  <!-- hardcoded -->
  <span>${"Overdue"}</span>                            <!-- raw value from the API -->
</main>`;

const ALLOW = [/^CHF /]; // things that are legitimately not copy

test("clean page: every visible text comes from t()", async ({ page }) => {
  await page.setContent(clean);
  expect(await pseudoCount(page), "pseudo-locale is not active in this build").toBeGreaterThan(0);
  const violations = await scanPage(page, { allow: ALLOW });
  expect(violations, formatViolations("clean", violations)).toEqual([]);
});

test("bug page: hardcoded and API text is reported", async ({ page }) => {
  await page.setContent(bug);
  const violations = await scanPage(page, { allow: ALLOW });
  expect(violations.map((v) => v.text).sort()).toEqual(["Documents", "Overdue"]);
});
