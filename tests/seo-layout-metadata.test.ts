import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  host: "lunchpad.us" as string | null,
  pathname: null as string | null,
  restaurant: null as null | Record<string, unknown>,
}));

vi.mock("next/font/google", () => ({
  Oswald: () => ({ variable: "" }),
  Inter: () => ({ variable: "" }),
}));
vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (k: string) => {
      const key = k.toLowerCase();
      if (key === "host") return m.host;
      if (key === "x-pathname") return m.pathname;
      return null;
    },
  }),
}));
vi.mock("@/lib/restaurant", () => ({ getCurrentRestaurant: async () => m.restaurant }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/color", () => ({ themeCssBlock: () => "" }));
vi.mock("@/lib/fonts", () => ({ getDisplayFont: () => ({}), getBodyFont: () => ({}) }));
vi.mock("@/components/cookie-notice", () => ({ CookieNotice: () => null }));
vi.mock("@/components/tenant-features", () => ({ TenantFeaturesProvider: () => null }));
vi.mock("@/components/site-header-server", () => ({ SiteHeaderServer: () => null }));
vi.mock("@/app/globals.css", () => ({}));

import { generateMetadata, generateViewport } from "@/app/layout";
import { PLATFORM_TITLE, PLATFORM_OG_TITLE, PLATFORM_DESCRIPTION } from "@/lib/seo";

beforeEach(() => {
  m.host = "lunchpad.us";
  m.pathname = null;
  m.restaurant = null;
});

describe("generateViewport", () => {
  it.each(["/", "/contact", "/privacy", "/terms"])("apex %s is zoomable (no maximumScale)", async (p) => {
    m.pathname = p;
    const v = await generateViewport();
    expect(v).not.toHaveProperty("maximumScale");
    expect(v.width).toBe("device-width");
    expect(v.initialScale).toBe(1);
  });

  it.each(["/signup", "/admin/login", "/menu", "/contact/", "/Privacy", "/privacy/x", "/terms?x=1"])(
    "apex %s keeps maximumScale 1",
    async (p) => {
      m.pathname = p;
      expect((await generateViewport()).maximumScale).toBe(1);
    },
  );

  it("missing x-pathname keeps maximumScale 1", async () => {
    m.pathname = null;
    expect((await generateViewport()).maximumScale).toBe(1);
  });

  it.each(["/", "/contact", "/privacy", "/terms", "/menu", "/order"])(
    "tenant %s keeps maximumScale 1",
    async (p) => {
      m.restaurant = { name: "FSS" };
      m.pathname = p;
      expect((await generateViewport()).maximumScale).toBe(1);
    },
  );
});

describe("generateMetadata", () => {
  it("apex: platform default title, canonical './', no robots, https origin", async () => {
    const md = await generateMetadata();
    expect((md.title as { default: string }).default).toBe(PLATFORM_TITLE);
    expect((md.title as { template: string }).template).toBe("%s | LunchPad");
    expect(md.alternates?.canonical).toBe("./");
    expect(md.robots).toBeUndefined();
    expect(md.description).toBe(PLATFORM_DESCRIPTION);
    expect(md.openGraph?.title).toBe(PLATFORM_OG_TITLE);
    expect(String(md.metadataBase)).toBe("https://lunchpad.us/");
  });

  it("preview host: robots noindex,nofollow", async () => {
    m.host = "foo.vercel.app";
    const md = await generateMetadata();
    expect(md.robots).toEqual({ index: false, follow: false });
    expect(String(md.metadataBase)).toBe("https://foo.vercel.app/");
  });

  it("tenant: restaurant name title and description, no noindex", async () => {
    m.host = "fss.lunchpad.us";
    m.restaurant = { name: "Fresh Sandwich Shop" };
    const md = await generateMetadata();
    expect((md.title as { default: string }).default).toBe("Fresh Sandwich Shop");
    expect((md.title as { template: string }).template).toBe("%s | Fresh Sandwich Shop");
    expect(md.description).toBe("Order lunch from Fresh Sandwich Shop — powered by LunchPad.");
    expect(md.robots).toBeUndefined();
    expect(String(md.metadataBase)).toBe("https://fss.lunchpad.us/");
    expect(JSON.stringify(md)).not.toContain(PLATFORM_TITLE);
  });

  it("tenant on a preview host is still noindex but keeps tenant title", async () => {
    m.host = "x.vercel.app";
    m.restaurant = { name: "FSS" };
    const md = await generateMetadata();
    expect(md.robots).toEqual({ index: false, follow: false });
    expect((md.title as { default: string }).default).toBe("FSS");
  });
});
