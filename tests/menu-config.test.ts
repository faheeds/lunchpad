import { describe, expect, it } from "vitest";
import { getRequiredChoicesForMenuItem } from "@/lib/menu-config";

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
