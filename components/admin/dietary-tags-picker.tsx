"use client";

/**
 * Dietary tags picker — multi-select chips with a free-text "add custom"
 * affordance. Writes its current selection into a single hidden input
 * `dietaryTags` as a comma-separated string so it picks up cleanly in
 * a server action's FormData (server splits on comma).
 */

import { useState } from "react";

const PRESETS = [
  "Vegan",
  "Vegetarian",
  "Gluten-free",
  "Dairy-free",
  "Nut-free",
  "Halal",
  "Kosher",
  "Spicy",
  "Low-cal",
];

export function DietaryTagsPicker({
  name = "dietaryTags",
  defaultValue = [],
}: {
  name?: string;
  defaultValue?: string[];
}) {
  const [tags, setTags] = useState<string[]>(defaultValue);
  const [draft, setDraft] = useState("");

  function toggle(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function addCustom() {
    const t = draft.trim();
    if (!t) return;
    if (!tags.includes(t)) setTags([...tags, t]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={tags.join(",")} />

      <div className="flex flex-wrap gap-1.5">
        {[...new Set([...PRESETS, ...tags])].map((tag) => {
          const active = tags.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={`text-[11px] font-medium px-2.5 py-1 rounded-full border transition ${
                active
                  ? "bg-brand-700 text-white border-brand-700"
                  : "bg-white text-slate-600 border-slate-200 hover:border-brand-700/40"
              }`}
            >
              {active && "✓ "}{tag}
            </button>
          );
        })}
      </div>

      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Add a custom tag…"
          className="flex-1 rounded-lg border border-slate-200 text-[12px] px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-700/20"
        />
        <button
          type="button"
          onClick={addCustom}
          className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}
