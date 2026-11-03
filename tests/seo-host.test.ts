import { describe, expect, it } from "vitest";
import { classifyHost } from "@/lib/seo";

describe("classifyHost: platform", () => {
  it.each([
    "lunchpad.us",
    "www.lunchpad.us",
    "LunchPad.US",
    "WWW.LUNCHPAD.US",
    "  lunchpad.us  ",
    "\tlunchpad.us\n",
    "lunchpad.us:443",
    "www.lunchpad.us:8080",
  ])("%j is platform on https://lunchpad.us", (host) => {
    const ctx = classifyHost(host, "lunchpad.us", undefined);
    expect(ctx.kind).toBe("platform");
    expect(ctx.origin).toBe("https://lunchpad.us");
    expect(ctx.host).toBe("lunchpad.us");
  });

  it.each(["", "   ", "\t"])("blank %j falls back to platform", (host) => {
    const ctx = classifyHost(host, "lunchpad.us", undefined);
    expect(ctx).toEqual({ host: "lunchpad.us", origin: "https://lunchpad.us", kind: "platform" });
  });

  it("null/undefined host header falls back to platform without throwing", () => {
    expect(classifyHost(undefined as unknown as string, "lunchpad.us", undefined).kind).toBe("platform");
    expect(classifyHost(null as unknown as string, "lunchpad.us", undefined).kind).toBe("platform");
  });

  it("a bare port (':443') falls back to platform", () => {
    expect(classifyHost(":443", "lunchpad.us", undefined).kind).toBe("platform");
  });
});

describe("classifyHost: lookalikes are never platform", () => {
  it.each([
    "evil-lunchpad.us",
    "lunchpad.us.evil.com",
    "notwww.lunchpad.us",
    "xlunchpad.us",
    "lunchpad.us@evil.com",
    "evil.com/lunchpad.us",
    "lunchpad.usa",
    "www.www.lunchpad.us",
  ])("%s is not platform", (host) => {
    const ctx = classifyHost(host, "lunchpad.us", undefined);
    expect(ctx.kind).not.toBe("platform");
    expect(ctx.origin).not.toBe("https://lunchpad.us");
  });
});

describe("classifyHost: preview", () => {
  it("foo.vercel.app is preview with https origin", () => {
    const ctx = classifyHost("foo.vercel.app", "lunchpad.us", undefined);
    expect(ctx).toEqual({ host: "foo.vercel.app", origin: "https://foo.vercel.app", kind: "preview" });
  });

  it("preview wins even when restaurantSlugEnv is set", () => {
    expect(classifyHost("lunchpad-git-x.vercel.app", "lunchpad.us", "fss").kind).toBe("preview");
  });

  it("lookalike vercel.app.evil.com is a tenant, not preview", () => {
    expect(classifyHost("foo.vercel.app.evil.com", "lunchpad.us", undefined).kind).toBe("tenant");
  });
});

describe("classifyHost: tenant", () => {
  it("fss.lunchpad.us is a tenant", () => {
    const ctx = classifyHost("fss.lunchpad.us", "lunchpad.us", undefined);
    expect(ctx).toEqual({ host: "fss.lunchpad.us", origin: "https://fss.lunchpad.us", kind: "tenant" });
  });

  it("custom domain is a tenant on https", () => {
    const ctx = classifyHost("lunch.example.com", "lunchpad.us", undefined);
    expect(ctx).toEqual({ host: "lunch.example.com", origin: "https://lunch.example.com", kind: "tenant" });
  });

  it("tenant host is lowercased and trimmed", () => {
    expect(classifyHost("  FSS.LunchPad.US ", "lunchpad.us", undefined).origin).toBe("https://fss.lunchpad.us");
  });
});

describe("classifyHost: localhost", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "a.localhost:3000"])(
    "%s -> http origin including port, platform without slug env",
    (host) => {
      const ctx = classifyHost(host, "lunchpad.us", undefined);
      expect(ctx.kind).toBe("platform");
      expect(ctx.origin).toBe(`http://${host}`);
      expect(ctx.host).toBe(host);
    },
  );

  it.each(["localhost:3000", "127.0.0.1:3000", "a.localhost:3000"])(
    "%s -> tenant with restaurantSlugEnv",
    (host) => {
      const ctx = classifyHost(host, "lunchpad.us", "fss");
      expect(ctx.kind).toBe("tenant");
      expect(ctx.origin).toBe(`http://${host}`);
    },
  );

  it("empty-string slug env counts as unset", () => {
    expect(classifyHost("localhost:3000", "lunchpad.us", "").kind).toBe("platform");
  });

  it("lookalike localhost.evil.com is a https tenant", () => {
    const ctx = classifyHost("localhost.evil.com", "lunchpad.us", undefined);
    expect(ctx.kind).toBe("tenant");
    expect(ctx.origin).toBe("https://localhost.evil.com");
  });
});

describe("classifyHost: custom rootDomain", () => {
  it("respects the rootDomain argument", () => {
    const ctx = classifyHost("www.example.org:443", "example.org", undefined);
    expect(ctx).toEqual({ host: "example.org", origin: "https://example.org", kind: "platform" });
  });

  it("default root domain is no longer platform when a different root is passed", () => {
    expect(classifyHost("lunchpad.us", "example.org", undefined).kind).toBe("tenant");
  });

  it("blank host falls back to the custom root", () => {
    expect(classifyHost("", "example.org", undefined).origin).toBe("https://example.org");
  });
});
