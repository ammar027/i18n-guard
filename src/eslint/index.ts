import i18next from "eslint-plugin-i18next";
import tseslint from "typescript-eslint";

export interface PresetOptions {
  files?: string[];
  ignores?: string[];
  /** Extra JSX props / object properties that hold visible copy. */
  visibleAttributes?: string[];
  objectCopyProps?: string[];
  /** Regex sources for strings that are not copy (brand names, codes). Matched against the whole string. */
  allowStrings?: string[];
  /** Toast helper names, e.g. ["showToast"]. */
  toastFunctions?: string[];
  /** Translator identifiers for the redundant-fallback and `as any` rules. */
  translators?: string;
  /** Flag hardcoded copy in object-literal properties (title:, label:, ...). Default true. */
  objectCopy?: boolean;
}

const ATTRS = ["placeholder", "title", "label", "alt", "aria-label", "aria-description", "description", "subtitle", "helperText", "emptyText", "errorMessage", "tooltip", "caption", "message", "buttonText", "confirmText", "cancelText", "heading"];
const RN_ATTRS = ["accessibilityLabel", "accessibilityHint"];
const OBJ = ["title", "label", "description", "subtitle", "message", "placeholder", "helperText", "emptyText", "errorMessage", "heading", "buttonText", "tooltip", "caption"];

const wordy = (allow: string[]): string =>
  `/^(?!https?:)(?!.*@)(?![A-Z]{2,}-)(?![A-Z0-9_ ]+$)${allow.length ? `(?!(?:${allow.join("|")})$)` : ""}(?=.*[A-Za-z]{2})/`;

export function selectors(o: PresetOptions, native: boolean): Array<{ selector: string; message: string }> {
  const attrs = [...ATTRS, ...(native ? RN_ATTRS : []), ...(o.visibleAttributes ?? [])].join("|");
  const props = [...OBJ, ...(o.objectCopyProps ?? [])].join("|");
  const W = wordy(o.allowStrings ?? []);
  const T = o.translators ?? "t";
  const toasts = ["showToast", "showErrorToast", "showSuccessToast", ...(o.toastFunctions ?? [])].join("|");
  const L = `Literal[value=${W}]`;
  const attr = `JSXAttribute[name.name=/^(${attrs})$/]`;
  const cond = ":matches(ConditionalExpression, LogicalExpression, LogicalExpression > LogicalExpression)";
  const out = [
    { selector: `${attr} > ${L}`, message: "Hardcoded user-visible attribute. Use t('key') and add the key to all locales." },
    { selector: `${attr} > JSXExpressionContainer > ${cond} > ${L}`, message: "Hardcoded user-visible attribute. Use t('key') and add the key to all locales." },
    { selector: `${attr} > JSXExpressionContainer > TemplateLiteral[expressions.length>0]`, message: "Hardcoded template literal in a user-visible attribute is not translatable. Use t('key', { ...values })." },
    { selector: `JSXElement > JSXExpressionContainer > ${cond} > ${L}`, message: "Hardcoded user-visible text in a JSX expression. Use t('key') and add the key to all locales." },
    { selector: `CallExpression[callee.object.name="Alert"][callee.property.name="alert"] > ${L}`, message: "Hardcoded Alert text. Use t('key') and add the key to all locales." },
    { selector: `CallExpression[callee.object.name="Alert"][callee.property.name="alert"] Property[key.name=/^(text|title|message)$/] > ${L}`, message: "Hardcoded Alert button/text. Use t('key') and add the key to all locales." },
    { selector: `CallExpression[callee.object.name="toast"] > ${L}`, message: "Hardcoded toast text. Use t('key') and add the key to all locales." },
    { selector: `CallExpression[callee.name=/^(${toasts})$/] > ${L}`, message: "Hardcoded toast text. Use t('key') and add the key to all locales." },
    { selector: `CallExpression[callee.object.name="toast"] > TemplateLiteral`, message: "Template-literal toast text is not translatable. Use t('key', { ...values })." },
    {
      selector: `LogicalExpression[operator=/^(\\|\\||\\?\\?)$/]:matches([left.type="CallExpression"][left.callee.name=/^(${T})$/], [left.type="TSAsExpression"][left.expression.callee.name=/^(${T})$/]) > ${L}`,
      message: "Redundant English fallback after t(): i18next returns the key when a translation is missing. Add the key to all locales instead.",
    },
    { selector: `CallExpression[callee.name=/^(${T})$/] > TSAsExpression[typeAnnotation.type="TSAnyKeyword"]`, message: "Translation key cast with `as any` hides missing keys from the key scanner. Use the real key." },
  ];
  if (o.objectCopy !== false) {
    out.push({ selector: `Property[key.name=/^(${props})$/] > ${L}`, message: "Hardcoded user-visible object property (rendered later as copy). Store a translation key and call t() where it is shown." });
  }
  return out;
}

function make(o: PresetOptions, native: boolean) {
  return [
    {
      files: o.files ?? ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
      ignores: o.ignores ?? [],
      languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
      plugins: { i18next },
      rules: {
        "i18next/no-literal-string": ["error", {
          mode: "jsx-text-only",
          words: { exclude: ["^[^A-Za-z]*$", "^[A-Za-z]$", "^[0-9.,:%]+[shdwy%]?$", "^[—–•✓✕▾▲▼←→⋮\\s\\-/|·]+$", "^[0-9]+px$", ...(o.allowStrings ?? [])] },
        }],
        "no-restricted-syntax": ["error", ...selectors(o, native)],
      },
    },
  ];
}

/** React + i18next (web). */
export const react = (o: PresetOptions = {}) => make(o, false);
/** React Native / Expo: adds accessibility props. */
export const reactNative = (o: PresetOptions = {}) => make(o, true);
/** Next.js (next-intl or react-i18next): same rules, JS files included. */
export const next = (o: PresetOptions = {}) => make(o, false);

/** Vue (beta): pass `eslint-plugin-vue` and `vue-eslint-parser`. Covers templates; script strings rely on the scanner. */
export function vue(plugins: { vuePlugin: unknown; vueParser: unknown }, o: { allowlist?: string[]; files?: string[] } = {}) {
  return [
    {
      files: o.files ?? ["**/*.vue"],
      languageOptions: { parser: plugins.vueParser, parserOptions: { parser: tseslint.parser } },
      plugins: { vue: plugins.vuePlugin },
      rules: {
        "vue/no-bare-strings-in-template": ["error", {
          allowlist: ["(", ")", ",", ".", "&", "+", "-", "=", "*", "/", "#", "%", "!", "?", ":", "[", "]", "{", "}", "<", ">", "·", "•", "—", "–", "|", ...(o.allowlist ?? [])],
          attributes: { "/.+/": ["title", "aria-label", "aria-placeholder", "aria-roledescription", "aria-valuetext"], input: ["placeholder"], img: ["alt"] },
          directives: ["v-text"],
        }],
      },
    },
  ];
}
