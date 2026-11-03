import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  host: "" as string | null,
  getCurrentRestaurant: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => ({ get: (k: string) => (k.toLowerCase() === "host" ? m.host : null) }),
}));
vi.mock("@/lib/restaurant", () => ({ getCurrentRestaurant: m.getCurrentRestaurant }));
vi.mock("@/lib/db", () => ({ prisma: {} }));

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

const PRIVATE = ["/admin", "/account", "/api", "/history", "/weekly", "/mobile-login", "/checkout"];

type Rule = { userAgent?: string; allow?: string | string[]; disallow?: string | string[] };
const rule0 = (r: Awaited<ReturnType<typeof robots>>): Rule => {
  const rules = r.rules as Rule | Rule[];
  return Array.isArray(rules) ? rules[0] : rules;
};

beforeEach(() => {
  m.host = "lunchpad.us";
  m.getCurrentRestaurant.mockReset();
});

describe("robots", () => {
  it("preview: disallow everything, no sitemap", async () => {
    m.host = "foo.vercel.app";
    const r = await robots();
    expect(rule0(r)).toEqual({ userAgent: "*", disallow: "/" });
    expect(r.sitemap).toBeUndefined();
  });

  it("platform: disallows private and tenant-only paths, allows /", async () => {
    const r = await robots();
    const rule = rule0(r);
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toBe("/");
    for (const p of [...PRIVATE, "/menu", "/order", "/faq"]) expect(rule.disallow).toContain(p);
    expect(r.sitemap).toBe("https://lunchpad.us/sitemap.xml");
  });

  it("platform does not disallow its public marketing pages", async () => {
    const d = rule0(await robots()).disallow as string[];
    for (const p of ["/", "/signup", "/contact", "/privacy", "/terms"]) expect(d).not.toContain(p);
  });

  it("platform via www host and blank host still uses the apex sitemap", async () => {
    m.host = "WWW.lunchpad.us";
    expect((await robots()).sitemap).toBe("https://lunchpad.us/sitemap.xml");
    m.host = null;
    expect((await robots()).sitemap).toBe("https://lunchpad.us/sitemap.xml");
  });

  it("platform never leaks a tenant origin", async () => {
    const r = await robots();
    expect(JSON.stringify(r)).not.toMatch(/fss|vercel|example\.com/);
  });

  it("tenant: only private paths, must not disallow /menu or /order", async () => {
    m.host = "fss.lunchpad.us";
    const r = await robots();
    const rule = rule0(r);
    expect(rule.disallow).toEqual(PRIVATE);
    expect(rule.disallow).not.toContain("/menu");
    expect(rule.disallow).not.toContain("/order");
    expect(rule.disallow).not.toContain("/faq");
    expect(rule.allow).toBe("/");
    expect(r.sitemap).toBe("https://fss.lunchpad.us/sitemap.xml");
  });

  it("tenant custom domain sitemap uses that origin, not the platform", async () => {
    m.host = "lunch.example.com";
    const r = await robots();
    expect(r.sitemap).toBe("https://lunch.example.com/sitemap.xml");
    expect(r.sitemap).not.toContain("lunchpad.us");
  });

  it("lookalike host is treated as tenant (public menu allowed) and never as the platform", async () => {
    m.host = "evil-lunchpad.us";
    const r = await robots();
    expect(r.sitemap).toBe("https://evil-lunchpad.us/sitemap.xml");
    expect(rule0(r).disallow).toEqual(PRIVATE);
  });
});

describe("sitemap", () => {
  const PLATFORM_URLS = ["/", "/signup", "/contact", "/privacy", "/terms"].map((p) => `https://lunchpad.us${p}`);

  it("preview: empty", async () => {
    m.host = "foo.vercel.app";
    expect(await sitemap()).toEqual([]);
  });

  it("platform: exactly the 5 public urls, never touches the DB", async () => {
    const s = await sitemap();
    expect(s.map((e) => e.url)).toEqual(PLATFORM_URLS);
    expect(m.getCurrentRestaurant).not.toHaveBeenCalled();
  });

  it("platform: contains no private or tenant-only paths", async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    for (const p of [...PRIVATE, "/menu", "/order", "/faq"]) {
      expect(urls.some((u) => u === p || u.startsWith(`${p}/`))).toBe(false);
    }
  });

  it("tenant with restaurant: 5 tenant urls on the tenant origin", async () => {
    m.host = "fss.lunchpad.us";
    m.getCurrentRestaurant.mockResolvedValue({ id: "r1", name: "FSS" });
    const s = await sitemap();
    expect(s.map((e) => e.url)).toEqual(
      ["/", "/menu", "/order", "/faq", "/contact"].map((p) => `https://fss.lunchpad.us${p}`),
    );
    expect(s.some((e) => e.url.includes("//lunchpad.us"))).toBe(false);
  });

  it("tenant with no restaurant: empty", async () => {
    m.host = "ghost.lunchpad.us";
    m.getCurrentRestaurant.mockResolvedValue(null);
    expect(await sitemap()).toEqual([]);
  });

  it("tenant when getCurrentRestaurant rejects: empty, no throw", async () => {
    m.host = "fss.lunchpad.us";
    m.getCurrentRestaurant.mockRejectedValue(new Error("db down"));
    await expect(sitemap()).resolves.toEqual([]);
  });

  it("tenant when getCurrentRestaurant throws synchronously: surfaced (documents behaviour)", async () => {
    m.host = "fss.lunchpad.us";
    m.getCurrentRestaurant.mockImplementation(() => {
      throw new Error("sync boom");
    });
    // `.catch` only handles rejected promises; a sync throw escapes. Record actual behaviour.
    await expect(sitemap()).rejects.toThrow("sync boom");
  });

  it("entries only have `url`", async () => {
    const s = await sitemap();
    for (const e of s) expect(Object.keys(e)).toEqual(["url"]);
    m.host = "fss.lunchpad.us";
    m.getCurrentRestaurant.mockResolvedValue({ id: "r1" });
    for (const e of await sitemap()) expect(Object.keys(e)).toEqual(["url"]);
  });
});
