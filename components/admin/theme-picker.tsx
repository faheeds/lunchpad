"use client";

import { THEMES } from "@/lib/themes";
import { useEffect, useRef } from "react";

export function ThemePicker({
  currentPrimary,
  currentAccent,
  currentDark,
}: {
  currentPrimary: string;
  currentAccent: string;
  currentDark: string;
}) {
  const primaryRef = useRef<HTMLInputElement>(null);
  const accentRef  = useRef<HTMLInputElement>(null);
  const darkRef    = useRef<HTMLInputElement>(null);

  function applyTheme(dark: string, primary: string, accent: string) {
    if (primaryRef.current) primaryRef.current.value = primary;
    if (accentRef.current)  accentRef.current.value  = accent;
    if (darkRef.current)    darkRef.current.value     = dark;
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Preset swatches */}
      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-2">Preset themes</p>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => applyTheme(theme.dark, theme.primary, theme.accent)}
              title={theme.name}
              className="flex flex-col items-center gap-1.5 group"
            >
              {/* 3-stripe swatch */}
              <div className="w-full h-10 rounded-lg overflow-hidden flex flex-col border border-slate-200 group-hover:ring-2 group-hover:ring-brand-700/40 transition">
                <div className="flex-1" style={{ background: theme.dark }} />
                <div className="flex-1" style={{ background: theme.primary }} />
                <div className="h-2" style={{ background: theme.accent }} />
              </div>
              <span className="text-[9px] text-slate-500 text-center leading-tight">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Custom color pickers */}
      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-2">Custom colors</p>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium text-ink">Background</p>
              <p className="text-[10px] text-slate-400">Header & hero</p>
            </div>
            <input ref={darkRef} type="color" name="darkColor"
              defaultValue={currentDark}
              className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium text-ink">Brand color</p>
              <p className="text-[10px] text-slate-400">Buttons & accents</p>
            </div>
            <input ref={primaryRef} type="color" name="primaryColor"
              defaultValue={currentPrimary}
              className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-medium text-ink">Highlight color</p>
              <p className="text-[10px] text-slate-400">Secondary buttons & stars</p>
            </div>
            <input ref={accentRef} type="color" name="accentColor"
              defaultValue={currentAccent}
              className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
