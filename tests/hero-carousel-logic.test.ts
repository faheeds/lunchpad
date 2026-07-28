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
