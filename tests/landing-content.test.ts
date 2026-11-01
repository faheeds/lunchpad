import { describe, it, expect } from "vitest";
import { parseLandingContent, resolveLanding, priceLabel, type ResolverInput } from "@/lib/landing-content";

const item = (over: Partial<ResolverInput["menuItems"][number]> = {}) => ({
  name: "Smash Burger",
  slug: "smash-burger",
  imageUrl: "https://x/y.jpg" as string | null,
  category: "Burgers",
  basePriceCents: 1099,
  sizePricesCents: [] as number[],
  featuredOnLanding: false,
  sortOrder: 0,
  ...over,
});

const base: ResolverInput = {
  restaurantName: "Test Cafe",
  placeNoun: null,
  heroImageUrl: null,
  contactPhone: null,
  contactEmail: null,
  weeklyPlanningEnabled: true,
  acceptsCard: true,
  acceptsCash: false,
  acceptsZelle: false,
  content: {},
  menuItems: [],
  locations: [],
};

describe("parseLandingContent", () => {
  it("drops non-http urls and empty strings", () => {
    const c = parseLandingContent({ instagramUrl: "javascript:alert(1)", tagline: "  ", facebookUrl: "https://fb.com/x" });
    expect(c.instagramUrl).toBeUndefined();
    expect(c.tagline).toBeUndefined();
    expect(c.facebookUrl).toBe("https://fb.com/x");
  });
  it("returns {} for junk", () => {
    expect(parseLandingContent(42)).toEqual({});
    expect(parseLandingContent(null)).toEqual({});
  });
});

describe("resolveLanding fallbacks", () => {
  it("an empty restaurant still yields a valid hero and hides optional sections", () => {
    const v = resolveLanding(base);
    expect(v.hero.headline).toBe("Fresh food, made to order.");
    expect(v.hero.imageUrl).toBeNull();
    expect(v.status).toBeNull();
    expect(v.featured).toEqual([]);
    expect(v.menuBoard).toEqual([]);
    expect(v.story).toBeNull();
    expect(v.footer.hours).toEqual([]);
  });
  it("uses the place noun in the fallback headline", () => {
    expect(resolveLanding({ ...base, placeNoun: "school" }).hero.headline).toBe("Fresh food, delivered to your school.");
  });
  it("falls back to the first featured photo for the hero", () => {
    const v = resolveLanding({ ...base, menuItems: [item()] });
    expect(v.hero.imageUrl).toBe("https://x/y.jpg");
  });
  it("prefers operator-flagged featured items", () => {
    const v = resolveLanding({
      ...base,
      menuItems: [item({ name: "Smash Burger" }), item({ name: "Soup", slug: "soup", featuredOnLanding: true })],
    });
    expect(v.featured.map((f) => f.name)).toEqual(["Soup"]);
  });
  it("never features items without photos", () => {
    const v = resolveLanding({ ...base, menuItems: [item({ imageUrl: null })] });
    expect(v.featured).toEqual([]);
  });
  it("hides weekly when disabled and adjusts copy", () => {
    const v = resolveLanding({ ...base, weeklyPlanningEnabled: false });
    expect(v.showWeekly).toBe(false);
    expect(v.hero.subtitle).not.toMatch(/whole week/);
    expect(v.steps[1].body).not.toMatch(/whole week/);
  });
  it("derives payment step from accepted methods", () => {
    const v = resolveLanding({ ...base, acceptsCash: true, acceptsZelle: true });
    expect(v.steps[3].body).toBe("Pay by card, cash or Zelle.");
  });
  it("shows the story only when copy exists", () => {
    expect(resolveLanding({ ...base, content: { storyBody: "Hi" } }).story?.headline).toBe("About Test Cafe");
  });
  it("status picks the earliest date across locations", () => {
    const v = resolveLanding({
      ...base,
      locations: [
        { name: "A", dates: ["2026-11-05"], cutoffLabel: "7 am" },
        { name: "B", dates: ["2026-11-03"], cutoffLabel: "8 am" },
        { name: "Empty", dates: [], cutoffLabel: null },
      ],
    });
    expect(v.status).toEqual({ nextDate: "2026-11-03", cutoffLabel: "8 am" });
    expect(v.pickups).toHaveLength(2);
  });
  it("price label shows 'from' for sized items", () => {
    expect(priceLabel({ basePriceCents: 0, sizePricesCents: [1299, 2099] })).toBe("from $12.99");
    expect(priceLabel({ basePriceCents: 999, sizePricesCents: [] })).toBe("$9.99");
  });
});
