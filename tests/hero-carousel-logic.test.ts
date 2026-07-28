import { describe, expect, it } from "vitest";

// ── Inline state-machine (mirrors what HeroCarousel uses internally) ──────────

type CarouselState = { index: number; paused: boolean; slideCount: number };
type CarouselAction =
  | { type: "tick" }
  | { type: "interact" }
  | { type: "resume" }
  | { type: "goto"; index: number };

function carouselReducer(state: CarouselState, action: CarouselAction): CarouselState {
  const { index, paused, slideCount } = state;

  if (slideCount === 0) {
    // Inert — no valid slides; clamp index to 0 and ignore everything.
    if (action.type === "goto") return { ...state, index: 0, paused: true };
    return state;
  }

  switch (action.type) {
    case "tick":
      if (paused || slideCount <= 1) return state;
      return { ...state, index: (index + 1) % slideCount };

    case "interact":
      return { ...state, paused: true };

    case "resume":
      return { ...state, paused: false };

    case "goto": {
      const clamped = Math.max(0, Math.min(action.index, slideCount - 1));
      return { ...state, index: clamped, paused: true };
    }
  }
}

// ── Happy-path cycling ────────────────────────────────────────────────────────

describe("carouselReducer — cycling", () => {
  it("tick when not paused advances index by 1", () => {
    const s = carouselReducer({ index: 0, paused: false, slideCount: 3 }, { type: "tick" });
    expect(s.index).toBe(1);
  });

  it("tick at last slide wraps to 0", () => {
    const s = carouselReducer({ index: 2, paused: false, slideCount: 3 }, { type: "tick" });
    expect(s.index).toBe(0);
  });

  it("tick when paused does NOT advance index", () => {
    const s = carouselReducer({ index: 1, paused: true, slideCount: 3 }, { type: "tick" });
    expect(s.index).toBe(1);
  });

  it("slideCount === 1: tick keeps index at 0", () => {
    const s = carouselReducer({ index: 0, paused: false, slideCount: 1 }, { type: "tick" });
    expect(s.index).toBe(0);
  });
});

// ── Interaction / pause / resume ──────────────────────────────────────────────

describe("carouselReducer — pause / resume", () => {
  it("interact sets paused: true", () => {
    const s = carouselReducer({ index: 0, paused: false, slideCount: 3 }, { type: "interact" });
    expect(s.paused).toBe(true);
  });

  it("interact then resume sets paused: false", () => {
    let s = carouselReducer({ index: 0, paused: false, slideCount: 3 }, { type: "interact" });
    s = carouselReducer(s, { type: "resume" });
    expect(s.paused).toBe(false);
  });

  it("goto a specific index sets that index and pauses", () => {
    const s = carouselReducer({ index: 0, paused: false, slideCount: 5 }, { type: "goto", index: 3 });
    expect(s.index).toBe(3);
    expect(s.paused).toBe(true);
  });

  it("goto out-of-range (too high) clamps to slideCount-1", () => {
    const s = carouselReducer({ index: 0, paused: false, slideCount: 3 }, { type: "goto", index: 99 });
    expect(s.index).toBe(2);
  });
});

// ── Zero-photos fallback ──────────────────────────────────────────────────────

describe("carouselReducer — zero photos fallback", () => {
  it("slideCount === 0: tick keeps index at 0 and is inert", () => {
    const s = carouselReducer({ index: 0, paused: false, slideCount: 0 }, { type: "tick" });
    expect(s.index).toBe(0);
    expect(s.paused).toBe(false); // unchanged
  });

  it("slideCount === 0: goto(0) does not crash and index stays 0", () => {
    const s = carouselReducer({ index: 0, paused: false, slideCount: 0 }, { type: "goto", index: 0 });
    expect(s.index).toBe(0);
  });
});

// ── Hero mode resolution (heroImageUrl priority rule) ────────────────────────

type HeroMode = "static-hero" | "carousel" | "gradient";

function resolveHeroMode(args: {
  heroImageUrl: string | null | undefined;
  slideCount: number;
}): HeroMode {
  if (args.heroImageUrl) return "static-hero";
  if (args.slideCount > 0) return "carousel";
  return "gradient";
}

describe("resolveHeroMode — static hero (heroImageUrl set)", () => {
  it("heroImageUrl set + slides present → static-hero (not carousel)", () => {
    expect(resolveHeroMode({ heroImageUrl: "https://cdn.example.com/hero.jpg", slideCount: 3 })).toBe("static-hero");
  });

  it("heroImageUrl set + zero slides → static-hero (not gradient)", () => {
    expect(resolveHeroMode({ heroImageUrl: "https://cdn.example.com/hero.jpg", slideCount: 0 })).toBe("static-hero");
  });

  it("heroImageUrl set + slideCount = 5 → static-hero", () => {
    expect(resolveHeroMode({ heroImageUrl: "https://cdn.example.com/hero.jpg", slideCount: 5 })).toBe("static-hero");
  });
});

describe("resolveHeroMode — carousel (heroImageUrl unset)", () => {
  it("heroImageUrl: null + slideCount > 0 → carousel", () => {
    expect(resolveHeroMode({ heroImageUrl: null, slideCount: 3 })).toBe("carousel");
  });

  it("heroImageUrl: undefined + slideCount > 0 → carousel", () => {
    expect(resolveHeroMode({ heroImageUrl: undefined, slideCount: 2 })).toBe("carousel");
  });
});

describe("resolveHeroMode — gradient fallback", () => {
  it("heroImageUrl: null + slideCount = 0 → gradient", () => {
    expect(resolveHeroMode({ heroImageUrl: null, slideCount: 0 })).toBe("gradient");
  });

  it("heroImageUrl: undefined + slideCount = 0 → gradient", () => {
    expect(resolveHeroMode({ heroImageUrl: undefined, slideCount: 0 })).toBe("gradient");
  });
});

describe("resolveHeroMode — adversarial (invalid URLs)", () => {
  it("empty string heroImageUrl + slides → carousel (empty string is falsy)", () => {
    expect(resolveHeroMode({ heroImageUrl: "", slideCount: 3 })).toBe("carousel");
  });

  it("empty string heroImageUrl + no slides → gradient (empty string is falsy)", () => {
    expect(resolveHeroMode({ heroImageUrl: "", slideCount: 0 })).toBe("gradient");
  });

  it("whitespace-only heroImageUrl + slides → carousel (whitespace is truthy — document as known edge)", () => {
    // "   " is truthy in JS, so resolveHeroMode treats it as a set URL.
    // Real mitigation belongs in the admin input layer (trim before save).
    expect(resolveHeroMode({ heroImageUrl: "   ", slideCount: 3 })).toBe("static-hero");
  });
});

// ── Adversarial ───────────────────────────────────────────────────────────────

describe("carouselReducer — adversarial", () => {
  it("rapid tick × N keeps index in [0, slideCount-1]", () => {
    let s: CarouselState = { index: 0, paused: false, slideCount: 4 };
    for (let i = 0; i < 37; i++) {
      s = carouselReducer(s, { type: "tick" });
      expect(s.index).toBeGreaterThanOrEqual(0);
      expect(s.index).toBeLessThan(s.slideCount);
    }
  });

  it("goto(-1) clamps to 0", () => {
    const s = carouselReducer({ index: 2, paused: false, slideCount: 3 }, { type: "goto", index: -1 });
    expect(s.index).toBe(0);
  });

  it("goto(slideCount) clamps to slideCount-1", () => {
    const s = carouselReducer({ index: 0, paused: false, slideCount: 3 }, { type: "goto", index: 3 });
    expect(s.index).toBe(2);
  });

  it("interact when already paused stays paused (idempotent)", () => {
    const s = carouselReducer({ index: 1, paused: true, slideCount: 3 }, { type: "interact" });
    expect(s.paused).toBe(true);
    expect(s.index).toBe(1);
  });
});
