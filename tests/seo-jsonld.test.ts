import { describe, expect, it } from "vitest";
import { platformJsonLd, PLATFORM_DESCRIPTION } from "@/lib/seo";
import { PRICING } from "@/lib/platform-content";

const ORIGIN = "https://lunchpad.us";

function allKeys(v: unknown, out: string[] = []): string[] {
  if (Array.isArray(v)) v.forEach((x) => allKeys(x, out));
  else if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) {
      out.push(k);
      allKeys(x, out);
    }
  }
  return out;
}

describe("platformJsonLd", () => {
  const ld = platformJsonLd(ORIGIN) as Record<string, any>[];

  it("returns 3 objects with schema.org context", () => {
    expect(ld).toHaveLength(3);
    for (const o of ld) expect(o["@context"]).toBe("https://schema.org");
  });

  it("types are Organization, WebSite, SoftwareApplication in order", () => {
    expect(ld.map((o) => o["@type"])).toEqual(["Organization", "WebSite", "SoftwareApplication"]);
  });

  it("Organization/WebSite/App carry the origin url and description", () => {
    for (const o of ld) expect(o.url).toBe(ORIGIN);
    expect(ld[2].description).toBe(PLATFORM_DESCRIPTION);
  });

  it("exactly 3 offers priced 49/99/199 USD matching PRICING", () => {
    const offers = ld[2].offers as Record<string, any>[];
    expect(offers).toHaveLength(3);
    expect(offers.map((o) => o.price)).toEqual(["49", "99", "199"]);
    expect(offers.map((o) => o.price)).toEqual(PRICING.map((p) => p.price));
    for (const o of offers) {
      expect(o["@type"]).toBe("Offer");
      expect(o.priceCurrency).toBe("USD");
      expect(o.url).toBe(`${ORIGIN}/signup`);
    }
  });

  it("prices are strings, not numbers (schema.org text price)", () => {
    for (const o of ld[2].offers) expect(typeof o.price).toBe("string");
  });

  it("has no aggregateRating / review / logo keys anywhere (deep)", () => {
    const keys = allKeys(ld);
    for (const bad of ["aggregateRating", "review", "reviews", "logo", "ratingValue", "reviewCount"]) {
      expect(keys).not.toContain(bad);
    }
  });

  it("reflects the given origin everywhere and no stale origin", () => {
    const other = platformJsonLd("http://localhost:3000");
    const s = JSON.stringify(other);
    expect(s).toContain("http://localhost:3000/signup");
    expect(s).not.toContain("lunchpad.us");
  });

  it("is JSON-serialisable (no undefined/functions dropped silently)", () => {
    expect(JSON.parse(JSON.stringify(ld))).toEqual(ld);
  });

  it("escaping '<' (as app/page.tsx does) neutralises a malicious origin", () => {
    const evil = "https://x.com/</script><script>alert(1)";
    const raw = JSON.stringify(platformJsonLd(evil));
    expect(raw).toContain("</script>"); // proves the attack string would survive without escaping
    const safe = raw.replace(/</g, "\\u003c");
    expect(safe).not.toContain("</script>");
    expect(safe).not.toContain("<");
    // escaping is lossless for JSON consumers
    expect(JSON.parse(safe)[0].url).toBe(evil);
  });
});
