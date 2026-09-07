import { describe, expect, it } from "vitest";
import { getRequiredChoicesForMenuItem, sortCategoryNames } from "@/lib/menu-config";

describe("getRequiredChoicesForMenuItem", () => {
  it("returns the real requiredChoices value when populated", () => {
    const result = getRequiredChoicesForMenuItem({ requiredChoices: ["Small", "Large"] });
    expect(result).toEqual(["Small", "Large"]);
  });

  it("returns an empty array when requiredChoices is genuinely empty, with no legacy override", () => {
    // This is the exact real bug: "build-your-own-burger" used to match a
    // hardcoded legacy slug map and get required choices injected even
    // when the operator deliberately configured none. A real, live order
    // was rejected at checkout because of this before the fix.
    const result = getRequiredChoicesForMenuItem({ requiredChoices: [] });
    expect(result).toEqual([]);
  });

  it("returns an empty array when requiredChoices is null", () => {
    expect(getRequiredChoicesForMenuItem({ requiredChoices: null })).toEqual([]);
  });

  it("returns an empty array when requiredChoices is undefined", () => {
    expect(getRequiredChoicesForMenuItem({ requiredChoices: undefined })).toEqual([]);
  });

  it("returns an empty array when requiredChoices is missing from the object entirely", () => {
    expect(getRequiredChoicesForMenuItem({})).toEqual([]);
  });
});

describe("sortCategoryNames", () => {
  it("puts explicitly-ordered categories first, in the configured order", () => {
    const names = ["Salads with Protein", "Sides & Snacks", "Comfort Favorites", "Burgers & Sandwiches", "Rice Plates"];
    const explicitOrder = [
      { name: "Burgers & Sandwiches", sortOrder: 0 },
      { name: "Rice Plates", sortOrder: 1 },
      { name: "Comfort Favorites", sortOrder: 2 },
      { name: "Salads with Protein", sortOrder: 3 },
    ];
    // This is the exact real scenario reported: "Burgers first, Rice
    // second, Comfort next, Salads after" -- not alphabetical order
    // (which would put Comfort before Rice).
    expect(sortCategoryNames(names, explicitOrder)).toEqual([
      "Burgers & Sandwiches",
      "Rice Plates",
      "Comfort Favorites",
      "Salads with Protein",
      "Sides & Snacks", // no explicit order -- falls to the end, alphabetically among unordered ones
    ]);
  });

  it("falls back to pure alphabetical when nothing has an explicit order (unchanged default behavior)", () => {
    const names = ["Sides & Snacks", "Burgers & Sandwiches", "Comfort Favorites"];
    expect(sortCategoryNames(names, [])).toEqual(["Burgers & Sandwiches", "Comfort Favorites", "Sides & Snacks"]);
  });

  it("sorts multiple unordered categories alphabetically among themselves, after all ordered ones", () => {
    const names = ["Zebra Category", "Apple Category", "Burgers & Sandwiches"];
    const explicitOrder = [{ name: "Burgers & Sandwiches", sortOrder: 0 }];
    expect(sortCategoryNames(names, explicitOrder)).toEqual(["Burgers & Sandwiches", "Apple Category", "Zebra Category"]);
  });

  it("does not crash or misbehave if explicitOrder references a category not present in names", () => {
    const names = ["Burgers & Sandwiches"];
    const explicitOrder = [
      { name: "Burgers & Sandwiches", sortOrder: 0 },
      { name: "Some Category That Was Renamed Or Deleted", sortOrder: 1 },
    ];
    expect(sortCategoryNames(names, explicitOrder)).toEqual(["Burgers & Sandwiches"]);
  });
});
