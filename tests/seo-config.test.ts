import { describe, expect, it, vi } from "vitest";
import { PRICING } from "@/lib/platform-content";

vi.mock("@sentry/nextjs", () => ({ withSentryConfig: (cfg: unknown) => cfg }));

describe("PRICING", () => {
  it("has 3 plans Starter/Growth/Scale at 49/99/199", () => {
    expect(PRICING.map((p) => p.name)).toEqual(["Starter", "Growth", "Scale"]);
    expect(PRICING.map((p) => p.price)).toEqual(["49", "99", "199"]);
  });

  it("exactly one popular plan and it is Growth", () => {
    const pop = PRICING.filter((p) => p.pop);
    expect(pop).toHaveLength(1);
    expect(pop[0].name).toBe("Growth");
  });

  it("every price is a plain positive integer string (JSON-LD safe)", () => {
    for (const p of PRICING) expect(p.price).toMatch(/^[1-9]\d*$/);
  });
});

describe("next.config.mjs headers()", async () => {
  const mod = await import("../next.config.mjs");
  const cfg = mod.default as { headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  const entries = await cfg.headers();

  it("has 7 entries with the exact private sources", () => {
    expect(entries.map((e) => e.source).sort()).toEqual(
      [
        "/admin/:path*",
        "/account/:path*",
        "/history",
        "/weekly",
        "/mobile-login",
        "/checkout/:path*",
        "/api/:path*",
      ].sort(),
    );
    expect(entries).toHaveLength(7);
  });

  it("each entry sets exactly X-Robots-Tag: noindex, nofollow", () => {
    for (const e of entries) {
      expect(e.headers).toEqual([{ key: "X-Robots-Tag", value: "noindex, nofollow" }]);
    }
  });

  it("no public marketing path is a source", () => {
    const sources = entries.map((e) => e.source);
    for (const p of ["/", "/contact", "/privacy", "/terms", "/menu", "/order", "/signup", "/faq", "/:path*", "/(.*)"]) {
      expect(sources).not.toContain(p);
    }
  });

  it("no source is a catch-all wildcard", () => {
    for (const e of entries) expect(e.source).not.toMatch(/^\/(:path\*|\(\.\*\)|\*)$/);
  });
});
