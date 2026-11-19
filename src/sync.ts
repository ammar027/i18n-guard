import fs from "node:fs";
import path from "node:path";
import type { GuardConfig } from "./types.js";
import { findDuplicateKeys, namespacesOf } from "./locales.js";
import { PLURAL_RE, toPosix } from "./util.js";

type Json = unknown;
type Obj = Record<string, Json>;
const isObj = (v: Json): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export interface SyncFile {
  readonly lang: string;
  readonly ns: string;
  /** Path relative to the project root. */
  readonly file: string;
  readonly created: boolean;
  readonly added: string[];
  readonly removed: string[];
  /** Why this file was left alone (e.g. duplicate keys). */
  readonly skipped?: string;
  /** New file content (only when something changes). */
  readonly content?: string;
}

export interface SyncPlan {
  readonly files: SyncFile[];
  readonly added: number;
  readonly removed: number;
  /** Pruned only when requested. Strays found but kept: */
  readonly strays: number;
}

export interface SyncOptions {
  readonly prune?: boolean;
  readonly langs?: readonly string[];
}

function leaves(v: Json, prefix: string): string[] {
  if (isObj(v)) return Object.entries(v).flatMap(([k, x]) => leaves(x, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}

function mark(v: Json, marker: string): Json {
  if (typeof v === "string") return marker && v.trim() !== "" ? `${marker}${v}` : v;
  if (Array.isArray(v)) return v.map((x) => mark(x, marker));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mark(x, marker)]));
  return v;
}

interface Acc { added: string[]; removed: string[]; strays: number }

/** Merge `def` into `tgt`: add what is missing (marked), optionally drop strays, keep the target's order. */
function merge(def: Json, tgt: Json, prefix: string, ns: string, o: { marker: string; prune: boolean; ignore: (k: string) => boolean }, acc: Acc): Json {
  if (!isObj(def) || !isObj(tgt)) return tgt;
  const keys = Object.keys(tgt);
  // Insert each missing default key right after its predecessor from the default's order.
  const defKeys = Object.keys(def);
  defKeys.forEach((k, i) => {
    if (k in tgt) return;
    let at = 0;
    for (let j = i - 1; j >= 0; j--) {
      const idx = keys.indexOf(defKeys[j] ?? "");
      if (idx !== -1) { at = idx + 1; break; }
    }
    keys.splice(at, 0, k);
  });
  const out: Obj = {};
  for (const k of keys) {
    const path_ = prefix ? `${prefix}.${k}` : k;
    const qualified = ns ? `${ns}:${path_}` : path_;
    if (k in def && k in tgt) {
      out[k] = merge(def[k], tgt[k], path_, ns, o, acc);
    } else if (k in def) {
      const fresh = leaves(def[k], path_).filter((l) => !o.ignore(l) && !o.ignore(ns ? `${ns}:${l}` : l));
      if (fresh.length === 0) continue;
      out[k] = mark(def[k], o.marker);
      acc.added.push(...fresh);
    } else {
      // Stray. Plural forms the language needs beyond the default's (x_few, x_many) are not strays.
      const m = PLURAL_RE.exec(k);
      const pluralOk = m?.[1] !== undefined && Object.keys(def).some((d) => PLURAL_RE.exec(d)?.[1] === m[1]);
      const ignored = o.ignore(path_) || o.ignore(qualified);
      if (o.prune && !pluralOk && !ignored) {
        acc.removed.push(...leaves(tgt[k], path_));
      } else {
        if (!pluralOk && !ignored) acc.strays += leaves(tgt[k], path_).length;
        out[k] = tgt[k];
      }
    }
  }
  return out;
}

const render = (value: Json, original: string | null): string => {
  const indent = (original && /\n([ \t]+)"/.exec(original)?.[1]) || "  ";
  const eol = original === null || original.endsWith("\n") ? "\n" : "";
  return `${JSON.stringify(value, null, indent)}${eol}`;
};

export function planSync(config: GuardConfig, opts: SyncOptions = {}): SyncPlan {
  const { dir, layout, default: def, languages } = config.locales;
  const ig = new Set(config.options.ignoreKeys);
  const files: SyncFile[] = [];
  let strays = 0;
  for (const ns of namespacesOf(config)) {
    const rel = (lang: string): string => toPosix(layout === "flat" ? path.join(dir, `${lang}.json`) : path.join(dir, lang, `${ns}.json`));
    const defAbs = path.join(config.root, rel(def));
    if (!fs.existsSync(defAbs)) continue;
    const defText = fs.readFileSync(defAbs, "utf8").replace(/^﻿/, "");
    const defJson = JSON.parse(defText) as Json;
    for (const lang of languages) {
      if (lang === def || (opts.langs?.length && !opts.langs.includes(lang))) continue;
      const file = rel(lang);
      const abs = path.join(config.root, file);
      const exists = fs.existsSync(abs);
      const text = exists ? fs.readFileSync(abs, "utf8").replace(/^﻿/, "") : null;
      if (text !== null && findDuplicateKeys(text).length) {
        files.push({ lang, ns, file, created: false, added: [], removed: [], skipped: "duplicate keys (fix them first; rewriting would drop one)" });
        continue;
      }
      const tgtJson: Json = text === null ? {} : (JSON.parse(text) as Json);
      const acc: Acc = { added: [], removed: [], strays: 0 };
      const next = merge(defJson, tgtJson, "", ns, { marker: config.options.syncMarker, prune: opts.prune === true, ignore: (k) => ig.has(k) }, acc);
      strays += acc.strays;
      if (!acc.added.length && !acc.removed.length) continue;
      files.push({ lang, ns, file, created: !exists, added: acc.added, removed: acc.removed, content: render(next, text) });
    }
  }
  return {
    files,
    added: files.reduce((n, f) => n + f.added.length, 0),
    removed: files.reduce((n, f) => n + f.removed.length, 0),
    strays,
  };
}

export function applySync(config: GuardConfig, plan: SyncPlan): string[] {
  const written: string[] = [];
  for (const f of plan.files) {
    if (f.content === undefined) continue;
    const abs = path.join(config.root, f.file);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, f.content);
    written.push(f.file);
  }
  return written;
}
