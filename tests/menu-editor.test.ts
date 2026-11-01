import { describe, it, expect } from "vitest";
import medina from "./fixtures/medina-menu.json";
import {
  parseChoicesText,
  parseSizesText,
  formatSizesText,
  sameSizes,
  sameIdSet,
  dollarsToCents,
  planOptionSync,
  uniqueSlug,
  type StoredOption,
  type SubmittedOption,
} from "@/lib/menu-editor";

// tests/fixtures/medina-menu.json is a read-only snapshot of Medina's real
// production menu (26 items, 81 options), including its quirks: sortOrder
// values that are not contiguous (0,1,2,6,7) and add-ons/removals that share
// sort numbers. The editor must round-trip every item without touching a row.
type FixtureItem = (typeof medina)[number];

function stored(item: FixtureItem, idx: number): StoredOption[] {
  return item.opts.map((o, i) => ({
    id: `m${idx}-o${i}`,
    name: o.n,
    optionType: o.t as "ADD_ON" | "REMOVAL",
    priceDeltaCents: o.p,
    isDefault: false,
    sortOrder: o.s,
  }));
}

/** What the editor posts back when the operator changed nothing. */
function submittedUnchanged(rows: StoredOption[]): SubmittedOption[] {
  // Editor shows add-ons first then removals, each ordered by sortOrder.
  const order = (t: string) =>
    rows.filter((r) => r.optionType === t).sort((a, b) => a.sortOrder - b.sortOrder);
  return [...order("ADD_ON"), ...order("REMOVAL")].map((r) => ({
    id: r.id,
    name: r.name,
    optionType: r.optionType,
    priceDeltaCents: r.priceDeltaCents,
  }));
}

describe("Medina menu round-trips through the editor with zero changes", () => {
  it("fixture matches production counts", () => {
    expect(medina).toHaveLength(26);
    expect(medina.reduce((n, i) => n + i.opts.length, 0)).toBe(81);
  });

  it.each(medina.map((m, i) => [m.name, m, i] as const))("%s: choices survive text round-trip", (_n, item) => {
    expect(parseChoicesText(item.choices.join("\n"))).toEqual(item.choices);
  });

  it("no Medina choice contains a comma or newline (which the parser would split)", () => {
    for (const item of medina) for (const c of item.choices) expect(c).not.toMatch(/[,\n]/);
  });

  it.each(medina.map((m, i) => [m.name, m, i] as const))("%s: unchanged save writes nothing", (_n, item, idx) => {
    const rows = stored(item, idx);
    const plan = planOptionSync(rows, submittedUnchanged(rows), rows.map((r) => r.id));
    expect(plan).toEqual({ create: [], update: [], deleteIds: [] });
  });
});

describe("planOptionSync edits", () => {
  const build = () => {
    const item = medina.find((m) => m.name === "Build-Your-Own Burger")!;
    const idx = medina.indexOf(item);
    const rows = stored(item, idx);
    return { rows, ids: rows.map((r) => r.id), base: submittedUnchanged(rows) };
  };

  it("price change updates exactly one row", () => {
    const { rows, ids, base } = build();
    const next = base.map((o) => (o.name === "Bacon" && o.optionType === "ADD_ON" ? { ...o, priceDeltaCents: 250 } : o));
    const plan = planOptionSync(rows, next, ids);
    expect(plan.create).toEqual([]);
    expect(plan.deleteIds).toEqual([]);
    expect(plan.update).toEqual([{ id: rows.find((r) => r.name === "Bacon" && r.optionType === "ADD_ON")!.id, data: { priceDeltaCents: 250 } }]);
  });

  it("new add-on is appended after the current maximum sortOrder", () => {
    const { rows, ids, base } = build();
    const plan = planOptionSync(rows, [...base.slice(0, 7), { name: "Ranch", optionType: "ADD_ON", priceDeltaCents: 0 }, ...base.slice(7)], ids);
    expect(plan.update).toEqual([]);
    expect(plan.create).toEqual([{ name: "Ranch", optionType: "ADD_ON", priceDeltaCents: 0, sortOrder: 7 }]);
  });

  it("deletes only options the form loaded and then removed", () => {
    const { rows, ids, base } = build();
    const plan = planOptionSync(rows, base.filter((o) => o.name !== "Jalapenos"), ids);
    expect(plan.deleteIds).toEqual([rows.find((r) => r.name === "Jalapenos")!.id]);
    expect(plan.update).toEqual([]);
  });

  it("an option added elsewhere after the form loaded is not deleted by a stale save", () => {
    const { rows, ids, base } = build();
    const concurrent: StoredOption = { id: "late", name: "Late add", optionType: "ADD_ON", priceDeltaCents: 0, isDefault: false, sortOrder: 99 };
    const plan = planOptionSync([...rows, concurrent], base, ids);
    expect(plan.deleteIds).toEqual([]);
  });

  it("reordering renumbers only that type, 0..n-1", () => {
    const { rows, ids, base } = build();
    const adds = base.filter((o) => o.optionType === "ADD_ON");
    const removals = base.filter((o) => o.optionType === "REMOVAL");
    const swapped = [adds[1], adds[0], ...adds.slice(2), ...removals];
    const plan = planOptionSync(rows, swapped, ids);
    expect(plan.update.map((u) => u.id).sort()).toEqual([adds[0].id!, adds[1].id!].sort());
    expect(plan.update.every((u) => "sortOrder" in u.data)).toBe(true);
  });

  it("blank option names are ignored", () => {
    const { rows, ids, base } = build();
    const plan = planOptionSync(rows, [...base, { name: "   ", optionType: "ADD_ON", priceDeltaCents: 0 }], ids);
    expect(plan.create).toEqual([]);
  });
});

describe("sizes", () => {
  it("parses the legacy 'Name | price' format and round-trips", () => {
    const parsed = parseSizesText("Small | 4.50\nMedium: 5\nLarge - $6.25");
    expect(parsed).toEqual([
      { name: "Small", priceCents: 450 },
      { name: "Medium", priceCents: 500 },
      { name: "Large", priceCents: 625 },
    ]);
    expect(parseSizesText(formatSizesText(parsed))).toEqual(parsed);
  });
  it("dedupes case-insensitively and skips bad lines", () => {
    expect(parseSizesText("Small | 4\nsmall | 5\nnonsense")).toEqual([{ name: "Small", priceCents: 400 }]);
  });
  it("sameSizes detects an untouched list", () => {
    expect(sameSizes([{ name: "S", priceCents: 400 }], [{ name: "S", priceCents: 400 }])).toBe(true);
    expect(sameSizes([{ name: "S", priceCents: 400 }], [{ name: "S", priceCents: 450 }])).toBe(false);
  });
});

describe("misc", () => {
  it("dollarsToCents", () => {
    expect(dollarsToCents("12.99")).toBe(1299);
    expect(dollarsToCents("$1,050.5")).toBe(105050);
    expect(dollarsToCents("-1")).toBeNull();
    expect(dollarsToCents("abc")).toBeNull();
  });
  it("sameIdSet", () => {
    expect(sameIdSet(["a", "b"], ["b", "a"])).toBe(true);
    expect(sameIdSet(["a"], ["a", "b"])).toBe(false);
  });
  it("uniqueSlug", () => {
    expect(uniqueSlug("burger", new Set())).toBe("burger");
    expect(uniqueSlug("burger", new Set(["burger", "burger-2"]))).toBe("burger-3");
    expect(uniqueSlug("", new Set())).toBe("item");
  });
});
