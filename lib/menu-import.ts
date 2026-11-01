/**
 * Pure helpers for the spreadsheet menu import (no xlsx dependency, so they
 * are unit-testable): header-aware column detection, the optional Sizes
 * column, and grouping of "Item - Small / Medium / Large" rows into a single
 * item with sizes.
 */

import { parseSizesText } from "@/lib/menu-editor";

export interface ImportOption {
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  priceDeltaCents: number;
  isDefault: boolean;
}

export interface ImportItem {
  name: string;
  description: string;
  basePriceCents: number;
  category: string;
  isActive: boolean;
  requiredChoices: string[];
  sizes: { name: string; priceCents: number }[];
  options: ImportOption[];
}

// ── Columns ────────────────────────────────────────────────────────────────

export type ColumnKey = "name" | "price" | "description" | "category" | "active" | "choices" | "sizes";
export type ColumnMap = Record<ColumnKey, number>;

/** The LunchPad template's own order, used when a header can't be matched. */
export const DEFAULT_COLUMNS: ColumnMap = {
  name: 0,
  price: 1,
  description: 2,
  category: 3,
  active: 4,
  choices: 5,
  sizes: 6,
};

const HEADER_RULES: { key: ColumnKey; test: (h: string) => boolean }[] = [
  { key: "choices", test: (h) => h.includes("choice") },
  { key: "sizes", test: (h) => h.includes("size") },
  { key: "price", test: (h) => h.includes("price") || h.includes("cost") },
  { key: "description", test: (h) => h.includes("descr") },
  { key: "category", test: (h) => h.includes("categ") || h.includes("section") },
  { key: "active", test: (h) => h.includes("active") || h.includes("visible") || h.includes("available") },
  {
    key: "name",
    test: (h) => h === "name" || h.startsWith("name") || h.includes("itemname") || h === "item" || h === "dish" || h === "product",
  },
];

const norm = (s: unknown) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Maps header cells to columns by their text, so a file with columns in a
 * different order (e.g. Category first) is still read correctly. Returns null
 * when the row doesn't look like a header (needs at least name + price).
 */
export function detectColumns(headerCells: unknown[]): ColumnMap | null {
  const found: Partial<ColumnMap> = {};
  headerCells.forEach((cell, idx) => {
    const h = norm(cell);
    if (!h) return;
    for (const rule of HEADER_RULES) {
      if (found[rule.key] === undefined && rule.test(h)) {
        found[rule.key] = idx;
        return;
      }
    }
  });
  if (found.name === undefined || found.price === undefined) return null;
  // Columns the header didn't mention fall back to the template position,
  // but only if that position isn't already used by a detected column.
  const used = new Set(Object.values(found));
  const out = { ...DEFAULT_COLUMNS } as ColumnMap;
  (Object.keys(DEFAULT_COLUMNS) as ColumnKey[]).forEach((k) => {
    if (found[k] !== undefined) out[k] = found[k] as number;
    else out[k] = used.has(DEFAULT_COLUMNS[k]) ? -1 : DEFAULT_COLUMNS[k];
  });
  return out;
}

/** Finds the header row (first 5 rows) and its column map; positional fallback. */
export function findHeader(rows: unknown[][]): { headerIdx: number; columns: ColumnMap } {
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const cols = detectColumns(rows[i] ?? []);
    if (cols) return { headerIdx: i, columns: cols };
  }
  let headerIdx = 0;
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    if (String(rows[i]?.[0] ?? "").toLowerCase().includes("name")) {
      headerIdx = i;
      break;
    }
  }
  return { headerIdx, columns: DEFAULT_COLUMNS };
}

/** Sizes cell: one per line (or semicolon separated), "Name | price". */
export function parseSizesCell(raw: string): { name: string; priceCents: number }[] {
  return parseSizesText(String(raw ?? "").replace(/;/g, "\n"));
}

// ── Grouping size variants ─────────────────────────────────────────────────

const SIZE_LABEL =
  /^(?:x{0,2}-?small|small|medium|large|x{1,2}-?large|xl|xxl|regular|mini|half|full|jumbo|family|party|personal|single|double|triple|solo|\d+(?:\.\d+)?\s*(?:pc|pcs|piece|pieces|oz|ml|l|lb|lbs|cm|in|inch|inches|"|”)(?![a-z]))/i;

/** "Gyro Pizza - Small 7\"" -> { base: "Gyro Pizza", label: "Small 7\"" }, else null. */
export function splitSizeVariant(name: string): { base: string; label: string } | null {
  const m = name.match(/^(.*\S)\s+[-–—]\s+(\S.*)$/);
  if (!m) return null;
  const label = m[2].trim();
  if (!SIZE_LABEL.test(label)) return null;
  return { base: m[1].trim(), label };
}

export interface GroupResult<T> {
  items: T[];
  /** How many combined items were created. */
  groups: number;
  /** How many original rows were folded into them. */
  merged: number;
}

/**
 * Combines rows named "<Item> - <Size>" that share the same item name and
 * category (and at least two sizes) into one item with sizes. Everything else
 * is left exactly as it was, in its original position.
 */
export function groupSizeVariants<T extends ImportItem>(items: T[]): GroupResult<T> {
  const buckets = new Map<string, { idx: number; label: string; item: T }[]>();
  items.forEach((item, idx) => {
    if (item.sizes.length > 0) return; // already has explicit sizes
    const v = splitSizeVariant(item.name);
    if (!v) return;
    const key = `${v.base.toLowerCase()}|${item.category.trim().toLowerCase()}`;
    const list = buckets.get(key) ?? [];
    list.push({ idx, label: v.label, item });
    buckets.set(key, list);
  });

  const mergedAt = new Map<number, T>(); // first index of a group -> merged item
  const drop = new Set<number>();
  let groups = 0;
  let merged = 0;

  for (const [key, list] of buckets) {
    const labels = new Set(list.map((x) => x.label.toLowerCase()));
    if (list.length < 2 || labels.size < 2) continue;
    const first = list[0].item;
    const base = splitSizeVariant(first.name)!.base;
    const seenLabel = new Set<string>();
    const sizes: { name: string; priceCents: number }[] = [];
    const seenChoice = new Set<string>();
    const requiredChoices: string[] = [];
    const seenOpt = new Set<string>();
    const options: ImportOption[] = [];
    for (const { label, item } of list) {
      const lk = label.toLowerCase();
      if (!seenLabel.has(lk) && item.basePriceCents > 0) {
        seenLabel.add(lk);
        sizes.push({ name: label, priceCents: item.basePriceCents });
      }
      for (const c of item.requiredChoices) {
        const ck = c.toLowerCase();
        if (!seenChoice.has(ck)) {
          seenChoice.add(ck);
          requiredChoices.push(c);
        }
      }
      for (const o of item.options) {
        const ok = `${o.optionType}|${o.name.toLowerCase()}`;
        if (!seenOpt.has(ok)) {
          seenOpt.add(ok);
          options.push(o);
        }
      }
    }
    if (sizes.length < 2) continue;
    const description = list.map((x) => x.item.description).find((d) => d.trim()) ?? "";
    mergedAt.set(list[0].idx, {
      ...first,
      name: base,
      description,
      basePriceCents: Math.min(...sizes.map((s) => s.priceCents)),
      isActive: list.some((x) => x.item.isActive),
      requiredChoices,
      sizes,
      options,
    });
    list.slice(1).forEach((x) => drop.add(x.idx));
    groups++;
    merged += list.length;
    void key;
  }

  const out: T[] = [];
  items.forEach((item, idx) => {
    if (drop.has(idx)) return;
    out.push(mergedAt.get(idx) ?? item);
  });
  return { items: out, groups, merged };
}
