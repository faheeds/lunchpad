"use client";

import { THEMES } from "@/lib/themes";
import { useRef } from "react";

export function ThemePicker({
  currentPrimary,
  currentAccent,
  currentDark,
  currentHeroTitle,
  currentHeroAccent,
  currentBodyText,
}: {
  currentPrimary: string;
  currentAccent: string;
  currentDark: string;
  currentHeroTitle: string;
  currentHeroAccent: string;
  currentBodyText: string;
}) {
  const primaryRef    = useRef<HTMLInputElement>(null);
  const accentRef     = useRef<HTMLInputElement>(null);
  const darkRef       = useRef<HTMLInputElement>(null);
  const heroTitleRef  = useRef<HTMLInputElement>(null);
  const heroAccentRef = useRef<HTMLInputElement>(null);
  const bodyTextRef   = useRef<HTMLInputElement>(null);

  function applyTheme(dark: string, primary: string, accent: string) {
    if (darkRef.current)    darkRef.current.value    = dark;
    if (primaryRef.current) primaryRef.current.value = primary;
    if (accentRef.current)  accentRef.current.value  = accent;
  }

  function Row({ label, sub, inputRef, name, defaultValue }: {
    label: string; sub: string;
    inputRef: React.RefObject<HTMLInputElement | null>;
    name: string; defaultValue: string;
  }) {
    return (
      <div className="flex items-center justify-between py-1.5">
        <div>
          <p className="text-[12px] font-medium text-ink">{label}</p>
          <p className="text-[10px] text-slate-400">{sub}</p>
        </div>
        <input ref={inputRef} type="color" name={name} defaultValue={defaultValue}
          className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-5">
      {/* Preset swatches */}
      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-2">Presets — click to apply</p>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((theme) => (
            <button key={theme.id} type="button"
              onClick={() => applyTheme(theme.dark, theme.primary, theme.accent)}
              title={theme.name}
              className="flex flex-col items-center gap-1.5 group">
              <div className="w-full h-10 rounded-lg overflow-hidden flex flex-col border border-slate-200 group-hover:ring-2 group-hover:ring-offset-1 group-hover:ring-brand-700/50 transition">
                <div className="flex-1" style={{ background: theme.dark }} />
                <div className="flex-1" style={{ background: theme.primary }} />
                <div className="h-2"   style={{ background: theme.accent }} />
              </div>
              <span className="text-[9px] text-slate-500 text-center leading-tight">{theme.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Color pickers */}
      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-1">Background & brand</p>
        <div className="divide-y divide-slate-50">
          <Row label="Background"    sub="Header & hero"            inputRef={darkRef}       name="darkColor"       defaultValue={currentDark} />
          <Row label="Brand color"   sub="Buttons & icons"          inputRef={primaryRef}    name="primaryColor"    defaultValue={currentPrimary} />
          <Row label="Accent color"  sub="Secondary buttons & tags" inputRef={accentRef}     name="accentColor"     defaultValue={currentAccent} />
        </div>
      </div>

      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-1">Text colors</p>
        <div className="divide-y divide-slate-50">
          <Row label="Hero title"    sub="Main HOT LUNCH heading"    inputRef={heroTitleRef}  name="heroTitleColor"  defaultValue={currentHeroTitle} />
          <Row label="Hero accent"   sub="Star text & subheading"    inputRef={heroAccentRef} name="heroAccentColor" defaultValue={currentHeroAccent} />
          <Row label="Body text"     sub="Card text & descriptions"  inputRef={bodyTextRef}   name="bodyTextColor"   defaultValue={currentBodyText} />
        </div>
      </div>
    </div>
  );
}
