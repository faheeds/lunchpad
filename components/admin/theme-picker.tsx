"use client";

import { THEMES } from "@/lib/themes";
import { DISPLAY_FONTS, BODY_FONTS } from "@/lib/fonts";
import { useState } from "react";

interface Colors {
  primaryColor:    string;
  accentColor:     string;
  darkColor:       string;
  heroTitleColor:  string;
  heroAccentColor: string;
  bodyTextColor:   string;
  displayFont:     string;
  bodyFont:        string;
}

type ExtractType = "colors" | "fonts" | "both";

export function ThemePicker({
  currentPrimary,
  currentAccent,
  currentDark,
  currentHeroTitle,
  currentHeroAccent,
  currentBodyText,
  currentDisplayFont,
  currentBodyFont,
}: {
  currentPrimary:     string;
  currentAccent:      string;
  currentDark:        string;
  currentHeroTitle:   string;
  currentHeroAccent:  string;
  currentBodyText:    string;
  currentDisplayFont: string;
  currentBodyFont:    string;
}) {
  const [colors, setColors] = useState<Colors>({
    primaryColor:    currentPrimary,
    accentColor:     currentAccent,
    darkColor:       currentDark,
    heroTitleColor:  currentHeroTitle,
    heroAccentColor: currentHeroAccent,
    bodyTextColor:   currentBodyText,
    displayFont:     currentDisplayFont,
    bodyFont:        currentBodyFont,
  });

  const [extractUrl, setExtractUrl]   = useState("");
  const [extractType, setExtractType] = useState<ExtractType>("both");
  const [extracting, setExtracting]   = useState(false);
  const [extractMsg, setExtractMsg]   = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [aiDesc, setAiDesc]       = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [aiMsg, setAiMsg]         = useState<{ type: "ok" | "err"; text: string } | null>(null);

  function applyColors(partial: Partial<Colors>) {
    setColors((prev) => ({ ...prev, ...partial }));
  }

  async function handleExtract() {
    if (!extractUrl.trim()) return;
    setExtracting(true);
    setExtractMsg(null);
    try {
      const res = await fetch("/api/admin/extract-theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: extractUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");

      const applyColorsOnly = extractType === "colors";
      const applyFontsOnly  = extractType === "fonts";
      const applyBoth       = extractType === "both";

      const update: Partial<Colors> = {};
      if (applyColorsOnly || applyBoth) {
        if (data.darkColor)    update.darkColor    = data.darkColor;
        if (data.primaryColor) update.primaryColor = data.primaryColor;
        if (data.accentColor)  update.accentColor  = data.accentColor;
      }
      if (applyFontsOnly || applyBoth) {
        if (data.displayFont) update.displayFont = data.displayFont;
        if (data.bodyFont)    update.bodyFont    = data.bodyFont;
      }
      applyColors(update);

      const parts: string[] = [];
      if ((applyColorsOnly || applyBoth) && (data.darkColor || data.primaryColor || data.accentColor)) {
        parts.push("colors extracted");
      }
      if ((applyFontsOnly || applyBoth) && data.fontsFound?.length) {
        parts.push(`fonts found: ${data.fontsFound.join(", ")}`);
      }
      const msg = parts.length ? parts.join(" · ") : "Nothing matched — try a different site";
      setExtractMsg({ type: parts.length ? "ok" : "err", text: msg.charAt(0).toUpperCase() + msg.slice(1) + "." });
    } catch (e) {
      setExtractMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setExtracting(false);
    }
  }

  async function handleSuggest(restaurantName: string) {
    setSuggesting(true);
    setAiMsg(null);
    try {
      const res = await fetch("/api/admin/suggest-theme", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restaurantName, description: aiDesc }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "AI suggestion failed");
      applyColors({
        darkColor:       data.darkColor       ?? colors.darkColor,
        primaryColor:    data.primaryColor    ?? colors.primaryColor,
        accentColor:     data.accentColor     ?? colors.accentColor,
        heroTitleColor:  data.heroTitleColor  ?? colors.heroTitleColor,
        heroAccentColor: data.heroAccentColor ?? colors.heroAccentColor,
        bodyTextColor:   data.bodyTextColor   ?? colors.bodyTextColor,
        ...(data.displayFont ? { displayFont: data.displayFont } : {}),
        ...(data.bodyFont    ? { bodyFont:    data.bodyFont    } : {}),
      });
      setAiMsg({ type: "ok", text: data.reasoning ?? "Theme applied — save to keep it." });
    } catch (e) {
      setAiMsg({ type: "err", text: e instanceof Error ? e.message : "Failed" });
    } finally {
      setSuggesting(false);
    }
  }

  function ColorRow({ label, sub, field }: { label: string; sub: string; field: keyof Colors }) {
    if (field === "displayFont" || field === "bodyFont") return null;
    return (
      <div className="flex items-center justify-between py-1.5">
        <div>
          <p className="text-[12px] font-medium text-ink">{label}</p>
          <p className="text-[10px] text-slate-400">{sub}</p>
        </div>
        <input type="color" name={field}
          value={colors[field] as string}
          onChange={(e) => applyColors({ [field]: e.target.value })}
          className="h-9 w-14 rounded-lg border border-slate-200 cursor-pointer p-0.5" />
      </div>
    );
  }

  const typeOptions: { value: ExtractType; label: string }[] = [
    { value: "colors", label: "Colors only" },
    { value: "fonts",  label: "Fonts only"  },
    { value: "both",   label: "Colors & fonts" },
  ];

  return (
    <div className="px-4 py-4 space-y-5">

      {/* ── Extract from website ─────────────────────────── */}
      <div className="rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-3 py-2.5 bg-slate-50 border-b border-slate-200">
          <p className="text-[12px] font-semibold text-ink">🔍 Extract from website</p>
          <p className="text-[10px] text-slate-400">Paste any URL — we'll pull its colors & fonts</p>
        </div>
        <div className="p-3 space-y-2">
          {/* What to extract */}
          <div className="flex gap-1.5">
            {typeOptions.map((opt) => (
              <button key={opt.value} type="button"
                onClick={() => setExtractType(opt.value)}
                className={`flex-1 py-1.5 rounded-lg text-[10px] font-semibold border transition ${
                  extractType === opt.value
                    ? "bg-slate-800 text-white border-slate-800"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-400"
                }`}>
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="url" value={extractUrl} onChange={(e) => setExtractUrl(e.target.value)}
              placeholder="https://yourwebsite.com"
              className="flex-1 rounded-lg border border-slate-200 text-[12px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20" />
            <button type="button" onClick={handleExtract} disabled={extracting || !extractUrl.trim()}
              className="px-3 py-2 rounded-lg bg-slate-800 text-white text-[12px] font-semibold disabled:opacity-50 transition whitespace-nowrap">
              {extracting ? "Extracting…" : "Extract"}
            </button>
          </div>
          {extractMsg && (
            <p className={`text-[11px] ${extractMsg.type === "ok" ? "text-green-700" : "text-red-600"}`}>
              {extractMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* ── AI suggestion ────────────────────────────────── */}
      <div className="rounded-xl border border-purple-100 overflow-hidden">
        <div className="px-3 py-2.5 bg-purple-50 border-b border-purple-100">
          <p className="text-[12px] font-semibold text-ink">✨ AI theme suggestion</p>
          <p className="text-[10px] text-slate-400">Claude picks colors & fonts that fit your brand</p>
        </div>
        <div className="p-3 space-y-2">
          <textarea value={aiDesc} onChange={(e) => setAiDesc(e.target.value)} rows={2}
            placeholder="Optional: describe your vibe — e.g. 'halal Mediterranean, warm and family-friendly'"
            className="w-full rounded-lg border border-slate-200 text-[12px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-300/40 resize-none" />
          <button type="button"
            onClick={() => {
              const nameEl = document.querySelector('input[name="name"]') as HTMLInputElement;
              handleSuggest(nameEl?.value?.trim() || "Our Restaurant");
            }}
            disabled={suggesting}
            className="w-full py-2 rounded-lg text-[12px] font-semibold text-white disabled:opacity-50 transition"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
            {suggesting ? "Thinking…" : "✨ Suggest theme for my restaurant"}
          </button>
          {aiMsg && (
            <p className={`text-[11px] ${aiMsg.type === "ok" ? "text-purple-700" : "text-red-600"}`}>
              {aiMsg.text}
            </p>
          )}
        </div>
      </div>

      {/* ── Preset swatches ──────────────────────────────── */}
      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-2">Preset themes</p>
        <div className="grid grid-cols-4 gap-2">
          {THEMES.map((theme) => (
            <button key={theme.id} type="button"
              onClick={() => applyColors({ darkColor: theme.dark, primaryColor: theme.primary, accentColor: theme.accent })}
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

      {/* ── Color pickers ────────────────────────────────── */}
      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-1">Background & brand</p>
        <div className="divide-y divide-slate-50">
          <ColorRow label="Background"    sub="Header & hero dark bg"       field="darkColor" />
          <ColorRow label="Brand color"   sub="Buttons & icons"             field="primaryColor" />
          <ColorRow label="Accent color"  sub="Secondary buttons & tags"    field="accentColor" />
        </div>
      </div>

      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-1">Text colors</p>
        <div className="divide-y divide-slate-50">
          <ColorRow label="Hero title"    sub="Main HOT LUNCH heading"      field="heroTitleColor" />
          <ColorRow label="Hero accent"   sub="Star text & subheading"      field="heroAccentColor" />
          <ColorRow label="Body text"     sub="Card text & descriptions"    field="bodyTextColor" />
        </div>
      </div>

      {/* ── Font selectors ───────────────────────────────── */}
      <div>
        <p className="text-[11px] text-slate-500 font-medium mb-2">Fonts</p>
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Display font <span className="text-slate-300">(headings, buttons)</span></label>
            <select name="displayFont"
              value={colors.displayFont}
              onChange={(e) => applyColors({ displayFont: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-[12px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20">
              {DISPLAY_FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[10px] text-slate-400 block mb-1">Body font <span className="text-slate-300">(paragraphs, labels)</span></label>
            <select name="bodyFont"
              value={colors.bodyFont}
              onChange={(e) => applyColors({ bodyFont: e.target.value })}
              className="w-full rounded-lg border border-slate-200 text-[12px] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-700/20">
              {BODY_FONTS.map((f) => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Hidden inputs to carry color values into the form */}
      <input type="hidden" name="primaryColor"    value={colors.primaryColor} />
      <input type="hidden" name="accentColor"     value={colors.accentColor} />
      <input type="hidden" name="darkColor"       value={colors.darkColor} />
      <input type="hidden" name="heroTitleColor"  value={colors.heroTitleColor} />
      <input type="hidden" name="heroAccentColor" value={colors.heroAccentColor} />
      <input type="hidden" name="bodyTextColor"   value={colors.bodyTextColor} />
    </div>
  );
}
