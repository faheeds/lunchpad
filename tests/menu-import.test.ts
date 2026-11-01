import { describe, it, expect } from "vitest";
import {
  detectColumns,
  findHeader,
  groupSizeVariants,
  parseSizesCell,
  splitSizeVariant,
  DEFAULT_COLUMNS,
  type ImportItem,
} from "@/lib/menu-import";

const item = (name: string, priceCents: number, category = "Pizza", extra: Partial<ImportItem> = {}): ImportItem => ({
  name,
  description: "",
  basePriceCents: priceCents,
  category,
  isActive: true,
  requiredChoices: [],
  sizes: [],
  options: [],
  ...extra,
});

describe("detectColumns / findHeader", () => {
  it("matches the LunchPad template header to its own positions", () => {
    const cols = detectColumns([
      "Name *", "Price * ($)", "Description", "Category", "Active (yes/no)", "Required Choices (one per line, optional)",
    ]);
    expect(cols).toMatchObject({ name: 0, price: 1, description: 2, category: 3, active: 4, choices: 5 });
  });

  it("reads columns by header when the order is different", () => {
    const cols = detectColumns(["Category", "Item Name", "Description", "Price"]);
    expect(cols).toMatchObject({ category: 0, name: 1, description: 2, price: 3 });
  });

  it("finds the Sizes column and leaves undetected ones unused if their slot is taken", () => {
    const cols = detectColumns(["Name", "Price", "Sizes"])!;
    expect(cols.sizes).toBe(2);
    expect(cols.description).toBe(-1); // slot 2 is taken by Sizes
  });

  it("returns null for a row that is not a header", () => {
    expect(detectColumns(["Smash Burger", "12.99", "Classic"])).toBeNull();
  });

  it("findHeader skips a title row above the header", () => {
    const rows = [["My menu"], [""], ["Name", "Price", "Category"], ["Tea", "2", "Drinks"]];
    expect(findHeader(rows).headerIdx).toBe(2);
  });

  it("falls back to template positions when no header matches", () => {
    const { headerIdx, columns } = findHeader([["Dish name only"], ["Tea", "2"]]);
    expect(headerIdx).toBe(0);
    expect(columns).toEqual(DEFAULT_COLUMNS);
  });
});

describe("parseSizesCell", () => {
  it("parses lines and semicolons, keeping inch marks in names", () => {
    expect(parseSizesCell('Small 7" | 12.99\nMedium 11" | 20.99; Large 16" | 26.99')).toEqual([
      { name: 'Small 7"', priceCents: 1299 },
      { name: 'Medium 11"', priceCents: 2099 },
      { name: 'Large 16"', priceCents: 2699 },
    ]);
  });
  it("is empty for a blank cell", () => {
    expect(parseSizesCell("")).toEqual([]);
  });
});

describe("splitSizeVariant", () => {
  it.each([
    ['Gyro Pizza - Small 7"', "Gyro Pizza", 'Small 7"'],
    ["Latte - Large", "Latte", "Large"],
    ["Wings – 10 pc", "Wings", "10 pc"],
  ])("%s", (name, base, label) => {
    expect(splitSizeVariant(name)).toEqual({ base, label });
  });
  it.each(["Chicken - Tikka", "Smash Burger", "Mac n' Cheese", "Half-Moon Cookie"])("does not split %s", (name) => {
    expect(splitSizeVariant(name)).toBeNull();
  });
});

describe("groupSizeVariants", () => {
  it("folds three size rows into one item with sizes and the lowest base price", () => {
    const rows = [
      item('Malai Chicken Pizza - Small 7"', 1299),
      item('Malai Chicken Pizza - Medium 11"', 2099),
      item('Malai Chicken Pizza - Large 16"', 2699),
    ];
    const r = groupSizeVariants(rows);
    expect(r).toMatchObject({ groups: 1, merged: 3 });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ name: "Malai Chicken Pizza", basePriceCents: 1299 });
    expect(r.items[0].sizes).toEqual([
      { name: 'Small 7"', priceCents: 1299 },
      { name: 'Medium 11"', priceCents: 2099 },
      { name: 'Large 16"', priceCents: 2699 },
    ]);
  });

  it("keeps unrelated items in place and order", () => {
    const rows = [item("Mango Lassi", 499, "Drinks"), item("Gyro - Small", 1299), item("Chai", 299, "Drinks"), item("Gyro - Large", 2699)];
    expect(groupSizeVariants(rows).items.map((i) => i.name)).toEqual(["Mango Lassi", "Gyro", "Chai"]);
  });

  it("does not group a single size row or different categories", () => {
    expect(groupSizeVariants([item("Latte - Large", 500)]).groups).toBe(0);
    expect(groupSizeVariants([item("Latte - Small", 400, "Hot"), item("Latte - Large", 500, "Iced")]).groups).toBe(0);
  });

  it("leaves items that already have explicit sizes alone", () => {
    const withSizes = item("Latte - Small", 400, "Hot", { sizes: [{ name: "S", priceCents: 400 }] });
    expect(groupSizeVariants([withSizes, item("Latte - Large", 500, "Hot")]).groups).toBe(0);
  });

  it("merges choices and options without duplicates", () => {
    const opt = { name: "Extra cheese", optionType: "ADD_ON" as const, priceDeltaCents: 100, isDefault: false };
    const rows = [
      item("Pizza - Small", 1000, "P", { options: [opt], requiredChoices: ["Thin"] }),
      item("Pizza - Large", 2000, "P", { options: [opt], requiredChoices: ["Thin", "Thick"] }),
    ];
    const [m] = groupSizeVariants(rows).items;
    expect(m.options).toHaveLength(1);
    expect(m.requiredChoices).toEqual(["Thin", "Thick"]);
  });

  it("is a no-op when nothing looks like a size", () => {
    const rows = [item("Chicken - Tikka", 1000), item("Chicken - Tandoori", 1100)];
    const r = groupSizeVariants(rows);
    expect(r.items).toEqual(rows);
    expect(r.groups).toBe(0);
  });
});
