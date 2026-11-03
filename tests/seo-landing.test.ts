import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: any) => React.createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt }: any) => React.createElement("img", { src: typeof src === "string" ? src : "", alt }),
}));

// The component is compiled with the classic JSX transform under vitest (tsconfig
// jsx: "preserve"), so it expects a global React. Provide it before importing.
(globalThis as any).React = React;
const { PlatformLanding } = await import("@/components/platform-landing");

describe("PlatformLanding SSR", () => {
  const html = renderToString(React.createElement(PlatformLanding));

  it("renders the stat counters with final values in the markup", () => {
    expect(html).toMatch(/data-count="10000"[^>]*data-suffix="\+"[^>]*>10,000\+</);
    expect(html).toMatch(/data-count="200"[^>]*data-suffix="\+"[^>]*>200\+</);
    expect(html).toMatch(/data-count="50"[^>]*data-suffix="\+"[^>]*>50\+</);
  });

  it("never SSRs a zeroed counter", () => {
    expect(html).not.toContain('data-count="10000" data-suffix="+">0<');
    expect(html).not.toMatch(/data-count="\d+"[^>]*>0</);
    expect(html).not.toMatch(/data-count="\d+"[^>]*data-suffix="[^"]*">0[^,\d]/);
  });

  it("contains the new hero copy", () => {
    expect(html).toContain("lunch ordering software for operators");
  });

  it("does not contain the old count-from-zero or placeholder text", () => {
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("NaN");
  });
});
