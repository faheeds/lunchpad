"use client";

/**
 * Live preview that watches the surrounding settings form and re-renders a
 * mocked parent ordering page as the operator changes colors, fonts, logo,
 * or hero image.
 *
 * It does NOT lift state out of the existing ThemePicker / ImageUpload
 * components — instead it scopes a MutationObserver-style listener to the
 * form, snapshots all relevant inputs on each `input`/`change`, and renders.
 */

import { useEffect, useState } from "react";

type Snapshot = {
  name: string;
  logoUrl: string;
  heroImageUrl: string;
  primaryColor: string;
  accentColor: string;
  darkColor: string;
  heroTitleColor: string;
  heroAccentColor: string;
  bodyTextColor: string;
  displayFont: string;
  bodyFont: string;
};

const FIELD_NAMES: ReadonlyArray<keyof Snapshot> = [
  "name",
  "logoUrl",
  "heroImageUrl",
  "primaryColor",
  "accentColor",
  "darkColor",
  "heroTitleColor",
  "heroAccentColor",
  "bodyTextColor",
  "displayFont",
  "bodyFont",
];

function readSnapshot(form: HTMLFormElement, fallback: Snapshot): Snapshot {
  const next = { ...fallback };
  for (const field of FIELD_NAMES) {
    const el = form.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[name="${field}"]`
    );
    if (el && typeof el.value === "string") {
      (next as Record<string, string>)[field] = el.value;
    }
  }
  return next;
}

export function LiveBrandingPreview({
  formId,
  initial,
}: {
  formId: string;
  initial: Snapshot;
}) {
  const [snap, setSnap] = useState<Snapshot>(initial);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;

    setSnap(readSnapshot(form, initial));

    const handler = () => setSnap(readSnapshot(form, initial));
    form.addEventListener("input", handler);
    form.addEventListener("change", handler);
    // Hidden input from <ImageUpload> is set programmatically — input/change
    // may not fire. Poll lightly as a fallback so logo/hero changes show up.
    const id = window.setInterval(handler, 600);

    return () => {
      form.removeEventListener("input", handler);
      form.removeEventListener("change", handler);
      window.clearInterval(id);
    };
  }, [formId, initial]);

  return (
    <div
      className="rounded-[14px] border border-slate-200 bg-white overflow-hidden sticky top-4"
      style={{ fontFamily: snap.bodyFont }}
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-slate-100 bg-slate-50">
        <span className="w-2.5 h-2.5 rounded-full bg-red-300" />
        <span className="w-2.5 h-2.5 rounded-full bg-yellow-300" />
        <span className="w-2.5 h-2.5 rounded-full bg-green-300" />
        <p className="text-[10px] text-slate-500 font-mono ml-2 truncate">
          your-site.lunchpad.us
        </p>
      </div>

      {/* Site header */}
      <div
        className="flex items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: "rgba(0,0,0,0.06)" }}
      >
        {snap.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={snap.logoUrl} alt="" className="w-7 h-7 rounded-md object-cover" />
        ) : (
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
            style={{ background: snap.primaryColor }}
          >
            {(snap.name || "?")[0]?.toUpperCase()}
          </div>
        )}
        <p
          className="text-[13px] font-semibold truncate"
          style={{ fontFamily: snap.displayFont, color: snap.darkColor }}
        >
          {snap.name || "Your restaurant"}
        </p>
        <div className="ml-auto flex gap-2">
          <span
            className="text-[10px] px-2 py-1 rounded-md"
            style={{ color: snap.darkColor, opacity: 0.6 }}
          >
            Sign in
          </span>
          <span
            className="text-[10px] px-2.5 py-1 rounded-md font-semibold text-white"
            style={{ background: snap.primaryColor }}
          >
            Order now
          </span>
        </div>
      </div>

      {/* Hero */}
      <div
        className="relative aspect-[16/9] flex items-center justify-center bg-slate-200"
        style={
          snap.heroImageUrl
            ? {
                backgroundImage: `url(${snap.heroImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : { background: `linear-gradient(135deg, ${snap.darkColor}, ${snap.primaryColor})` }
        }
      >
        <div className="absolute inset-0 bg-black/30" />
        <div className="relative text-center px-3">
          <p
            className="font-bold tracking-tight"
            style={{
              fontFamily: snap.displayFont,
              color: snap.heroTitleColor,
              fontSize: 18,
              lineHeight: 1.1,
            }}
          >
            Lunch, sorted.
          </p>
          <p
            className="font-semibold mt-1"
            style={{ color: snap.heroAccentColor, fontSize: 11 }}
          >
            Order this week&apos;s menu
          </p>
        </div>
      </div>

      {/* Sample menu cards */}
      <div className="p-3 grid grid-cols-2 gap-2" style={{ background: "#fafafa" }}>
        {["Crispy Chicken Sandwich", "Caesar Salad"].map((dish, i) => (
          <div
            key={dish}
            className="rounded-lg overflow-hidden border"
            style={{ borderColor: "rgba(0,0,0,0.06)", background: "white" }}
          >
            <div
              className="aspect-square"
              style={{
                background: i === 0
                  ? `linear-gradient(135deg, ${snap.accentColor}, ${snap.primaryColor})`
                  : `linear-gradient(135deg, ${snap.primaryColor}, ${snap.darkColor})`,
              }}
            />
            <div className="px-2 py-1.5">
              <p
                className="text-[10px] font-semibold truncate"
                style={{ color: snap.bodyTextColor }}
              >
                {dish}
              </p>
              <p
                className="text-[10px] font-bold"
                style={{ color: snap.primaryColor }}
              >
                $9.50
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="px-3 py-2 text-[9px] text-slate-400 text-center bg-white border-t border-slate-100">
        Live preview — save to publish to {snap.name || "your site"}
      </p>
    </div>
  );
}
