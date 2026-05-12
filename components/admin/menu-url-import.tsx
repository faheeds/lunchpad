"use client";

/**
 * Menu URL import — point at a public menu URL, let Claude extract
 * structured items, edit the preview, save in bulk.
 *
 * Why this exists: operators bringing their menu over from an existing
 * site (Toast, Square, Squarespace, a Google Doc, a Notion page, even
 * a static HTML menu PDF that's been HTMLified) shouldn't have to
 * re-type 30 items. They paste the URL, we fetch the page server-side,
 * Claude turns it into JSON, and they get a preview they can tweak.
 *
 * Flow:
 *   1. Operator enters URL → POST /api/admin/menu/extract
 *   2. Server fetches the HTML, strips it, sends to Claude
 *   3. Claude returns items[] with name/description/price/sizes/
 *      requiredChoices/options/category/imageUrl
 *   4. We render an editable preview list with thumbnails. Operator can
 *      rename items, tweak prices, toggle Active, edit sizes/options
 *      inline, swap image URLs.
 *   5. On Import → POST /api/admin/menu/bulk-create with the curated
 *      list. Server creates MenuItems (and MenuItemSize / MenuOption
 *      rows) in one transaction per item, plus imageUrl on the parent.
 *
 * What this is NOT: an "auto-import" button. The operator always reviews
 * before save. AI extraction is fuzzy by nature; we keep the human in
 * the loop so a missed comma in the source HTML doesn't end up as
 * "$1.99" instead of "$19.99" in the live menu.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";

// ─── Shared types — match the extract endpoint's MenuItemExtracted ─────────

interface ExtractedSize {
  name: string;
  priceCents: number;
}

interface ExtractedOption {
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  priceDeltaCents: number;
  isDefault: boolean;
}

interface ExtractedItem {
  name: string;
  description: string;
  basePriceCents: number;
  category: string;
  isActive: boolean;
  /** Absolute image URL extracted from the source page. Empty string
   *  when no nearby image was found. Rendered as a thumbnail in the
   *  preview row so the operator can sanity-check the AI's pairing. */
  imageUrl: string;
  sizes: ExtractedSize[];
  requiredChoices: string[];
  options: ExtractedOption[];
  // Local-only UI state
  _expanded: boolean;
}

/** Quota info returned by the extract endpoint — surfaces "N extractions
 *  left this month" to operators so they know when to fall back to the
 *  Excel uploader. The reset is rolling so we render the absolute date. */
interface QuotaInfo {
  limit: number;
  remaining: number;
  resetAt: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

const dollars = (cents: number) => (cents / 100).toFixed(2);
const parseDollars = (s: string) => {
  const n = parseFloat(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : 0;
};

// ─── Component ─────────────────────────────────────────────────────────────

export function MenuUrlImport({ onImported }: { onImported?: () => void }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ExtractedItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  // Quota — populated on the first successful (or quota-exhausted) call.
  // null means "haven't asked yet"; we hide the badge until we know.
  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  async function handleExtract() {
    setError(null);
    setSuccess(null);
    const trimmed = url.trim();
    if (!trimmed) { setError("Paste a URL first."); return; }
    setExtracting(true);
    try {
      const res = await fetch("/api/admin/menu/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      // Update quota whenever the server tells us about it — including
      // the 429 case where the server returns the same quota shape so
      // we can show "comes back on <date>" without forcing another call.
      if (data?.quota) {
        setQuota(data.quota as QuotaInfo);
      }
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      const incoming = Array.isArray(data.items) ? data.items : [];
      if (incoming.length === 0) {
        setError("No menu items found on that page. The site might be JavaScript-rendered or require a login — try a static menu URL.");
        setItems([]);
        return;
      }
      // Add local UI state (_expanded). Default collapsed for a manageable scan.
      // Defensive: extract endpoint always returns imageUrl now, but
      // older cached client bundles or hand-crafted payloads may not.
      setItems(incoming.map((i: Partial<ExtractedItem>) => ({
        name: i.name ?? "",
        description: i.description ?? "",
        basePriceCents: i.basePriceCents ?? 0,
        category: i.category ?? "",
        isActive: i.isActive ?? true,
        imageUrl: i.imageUrl ?? "",
        sizes: i.sizes ?? [],
        requiredChoices: i.requiredChoices ?? [],
        options: i.options ?? [],
        _expanded: false,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function updateItem(idx: number, patch: Partial<ExtractedItem>) {
    setItems((cur) => {
      const next = [...cur];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }
  function removeItem(idx: number) {
    setItems((cur) => cur.filter((_, i) => i !== idx));
  }

  async function handleImport() {
    if (items.length === 0 || importing) return;
    setError(null);
    setSuccess(null);
    setImporting(true);
    try {
      // Strip local-only fields before POST so the wire matches the
      // bulk-create schema (anything extra would be silently ignored
      // anyway, but cleaner to send only what's needed).
      const payload = items.map(({ _expanded: _, ...item }) => item);
      const res = await fetch("/api/admin/menu/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const { created, skipped, errors } = data as { created: number; skipped: number; errors: string[] };
      let msg = `${created} item${created !== 1 ? "s" : ""} imported.`;
      if (skipped > 0) msg += ` ${skipped} skipped (duplicates).`;
      if (errors?.length > 0) msg += ` ${errors.length} failed — try editing those rows manually.`;
      setSuccess(msg);
      setItems([]);
      setUrl("");
      router.refresh();
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setImporting(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* URL input row */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>
            Menu URL
          </label>
          {/* Quota badge — shows after the first successful call.
              Amber when ≤3 left, red when 0 so operators notice before
              they hit the wall on a busy onboarding day. */}
          {quota && (
            <span
              title={`Resets on ${new Date(quota.resetAt).toLocaleDateString()}`}
              style={{
                fontSize: 10, fontWeight: 700, padding: "3px 8px",
                background: quota.remaining === 0
                  ? "#fef2f2"
                  : quota.remaining <= 3 ? "#fef3c7" : "#f1f5f9",
                color: quota.remaining === 0
                  ? "#991b1b"
                  : quota.remaining <= 3 ? "#92400e" : "#475569",
                border: `1px solid ${
                  quota.remaining === 0
                    ? "#fecaca"
                    : quota.remaining <= 3 ? "#fde68a" : "#cbd5e1"
                }`,
                borderRadius: 100, whiteSpace: "nowrap",
              }}
            >
              {quota.remaining} of {quota.limit} extractions left
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="url"
            value={url}
            onChange={(e) => { setUrl(e.target.value); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleExtract(); } }}
            placeholder="https://example.com/menu"
            disabled={extracting}
            style={{
              flex: 1, padding: "8px 12px", fontSize: 13,
              border: "1px solid #cbd5e1", borderRadius: 8,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={handleExtract}
            disabled={extracting || !url.trim() || quota?.remaining === 0}
            style={{
              padding: "8px 16px", fontSize: 12, fontWeight: 600,
              background: "#0f172a", color: "#fff",
              border: "none", borderRadius: 8, cursor: "pointer",
              opacity: extracting || !url.trim() || quota?.remaining === 0 ? 0.5 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {extracting ? "Fetching menu…" : "Fetch menu"}
          </button>
        </div>
        <p style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>
          Works best on plain HTML menus. JavaScript-heavy sites (some Toast,
          Square, Squarespace pages) may not extract — paste the menu text
          into a Google Doc and share that URL as a fallback.
        </p>
      </div>

      {/* Status messages */}
      {error && (
        <div style={{
          padding: "10px 12px", fontSize: 12, lineHeight: 1.5,
          background: "#fef2f2", border: "1px solid #fecaca",
          borderRadius: 8, color: "#991b1b",
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: "10px 12px", fontSize: 12, lineHeight: 1.5,
          background: "#f0fdf4", border: "1px solid #bbf7d0",
          borderRadius: 8, color: "#15803d",
        }}>
          {success}
        </div>
      )}

      {/* Preview list */}
      {items.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
              {items.length} item{items.length === 1 ? "" : "s"} extracted — review before importing
            </p>
            <button
              type="button"
              onClick={() => setItems([])}
              style={{
                fontSize: 11, color: "#64748b", background: "transparent",
                border: "none", cursor: "pointer", textDecoration: "underline",
              }}
            >
              Discard all
            </button>
          </div>

          {items.map((item, idx) => (
            <ItemRow
              key={idx}
              item={item}
              onUpdate={(patch) => updateItem(idx, patch)}
              onRemove={() => removeItem(idx)}
            />
          ))}

          <button
            type="button"
            onClick={handleImport}
            disabled={importing || items.length === 0}
            style={{
              marginTop: 8,
              padding: "10px 16px", fontSize: 13, fontWeight: 700,
              background: "#1D9E75", color: "#fff",
              border: "none", borderRadius: 8, cursor: "pointer",
              opacity: importing ? 0.5 : 1,
            }}
          >
            {importing ? "Importing…" : `Import ${items.length} item${items.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Item row ──────────────────────────────────────────────────────────────

function ItemRow({
  item,
  onUpdate,
  onRemove,
}: {
  item: ExtractedItem;
  onUpdate: (patch: Partial<ExtractedItem>) => void;
  onRemove: () => void;
}) {
  const inputCss: React.CSSProperties = {
    border: "1px solid #d1d5db", borderRadius: 6,
    padding: "5px 8px", fontSize: 12, outline: "none", background: "white",
  };

  return (
    <div style={{
      border: "1px solid #e2e8f0", borderRadius: 10, padding: 10,
      background: "white", display: "flex", flexDirection: "column", gap: 8,
    }}>
      {/* Header row — name, price/range, badges, expand/remove */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          onClick={() => onUpdate({ _expanded: !item._expanded })}
          aria-label={item._expanded ? "Collapse" : "Expand"}
          style={{
            width: 22, height: 22, padding: 0, flexShrink: 0,
            background: "transparent", border: "1px solid #e2e8f0",
            borderRadius: 5, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: item._expanded ? "rotate(90deg)" : "none", transition: "transform 120ms" }}>
            <polyline points="9 18 15 12 9 6"/>
          </svg>
        </button>

        {/* Thumbnail — only shown when an image URL was extracted.
            Tiny 32px square so the row stays compact; the full URL is
            editable in the expanded body. onError swaps to a neutral
            placeholder so a broken or hot-linked image doesn't show a
            jarring broken-image icon during review. */}
        {item.imageUrl && (
          <img
            src={item.imageUrl}
            alt=""
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
            style={{
              width: 32, height: 32, flexShrink: 0,
              objectFit: "cover", borderRadius: 5,
              border: "1px solid #e2e8f0",
            }}
          />
        )}

        <input
          value={item.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="Item name"
          style={{ ...inputCss, flex: 1, fontWeight: 600, minWidth: 0 }}
        />

        {/* Price display — range when sized, single price otherwise */}
        <div style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: "#0f172a", minWidth: 72, textAlign: "right" }}>
          {item.sizes.length > 0
            ? (() => {
                const prices = item.sizes.map((s) => s.priceCents);
                const min = Math.min(...prices);
                const max = Math.max(...prices);
                return min === max ? fmt(min) : `${fmt(min)}–${fmt(max)}`;
              })()
            : fmt(item.basePriceCents)}
        </div>

        {/* Badges row */}
        {item.sizes.length > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 6px",
            background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a",
            borderRadius: 100, whiteSpace: "nowrap",
          }}>
            {item.sizes.length} sizes
          </span>
        )}
        {item.requiredChoices.length > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 6px",
            background: "#dbeafe", color: "#1e40af", border: "1px solid #bfdbfe",
            borderRadius: 100, whiteSpace: "nowrap",
          }}>
            {item.requiredChoices.length} choices
          </span>
        )}
        {item.options.length > 0 && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "2px 6px",
            background: "#eff6ff", color: "#0369a1", border: "1px solid #bfdbfe",
            borderRadius: 100, whiteSpace: "nowrap",
          }}>
            {item.options.length} opt{item.options.length === 1 ? "" : "s"}
          </span>
        )}

        <button
          type="button"
          onClick={() => onUpdate({ isActive: !item.isActive })}
          style={{
            fontSize: 10, fontWeight: 600, padding: "3px 8px",
            background: item.isActive ? "#dcfce7" : "#f1f5f9",
            color: item.isActive ? "#15803d" : "#475569",
            border: `1px solid ${item.isActive ? "#bbf7d0" : "#cbd5e1"}`,
            borderRadius: 100, cursor: "pointer", whiteSpace: "nowrap",
          }}
        >
          {item.isActive ? "Active" : "Hidden"}
        </button>

        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove from import"
          style={{
            width: 22, height: 22, padding: 0, flexShrink: 0,
            background: "#fef2f2", border: "1px solid #fecaca",
            borderRadius: 5, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      {/* Expanded body — description, category, image, sizes, choices, options */}
      {item._expanded && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4, borderTop: "1px solid #f1f5f9" }}>
          {/* Description + category row */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={item.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Description (optional)"
              style={{ ...inputCss, flex: 1, minWidth: 0 }}
            />
            <input
              value={item.category}
              onChange={(e) => onUpdate({ category: e.target.value })}
              placeholder="Category"
              style={{ ...inputCss, width: 110, flexShrink: 0 }}
            />
          </div>

          {/* Image URL — editable so the operator can paste their own
              photo if the AI's pick was wrong, or clear it entirely.
              We show it for every item (not just ones that came with
              an image) so people can attach photos during this same pass. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 11, color: "#64748b", flexShrink: 0, minWidth: 50 }}>Image:</label>
            <input
              value={item.imageUrl}
              onChange={(e) => onUpdate({ imageUrl: e.target.value.trim() })}
              placeholder="https://… (optional)"
              style={{ ...inputCss, flex: 1, minWidth: 0 }}
            />
            {item.imageUrl && (
              <button
                type="button"
                onClick={() => onUpdate({ imageUrl: "" })}
                aria-label="Clear image"
                style={{
                  width: 22, height: 22, padding: 0, flexShrink: 0,
                  background: "#fef2f2", border: "1px solid #fecaca",
                  borderRadius: 5, cursor: "pointer",
                }}
              >
                ×
              </button>
            )}
          </div>

          {/* Base price (only meaningful when no sizes) */}
          {item.sizes.length === 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <label style={{ fontSize: 11, color: "#64748b" }}>Price:</label>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#64748b" }}>$</span>
                <input
                  value={dollars(item.basePriceCents)}
                  onChange={(e) => onUpdate({ basePriceCents: parseDollars(e.target.value) })}
                  style={{ ...inputCss, paddingLeft: 18, width: 80 }}
                />
              </div>
            </div>
          )}

          {/* Sizes editor — when sizes are present, base price is computed
              from them so we hide that field and show the sizes instead. */}
          {item.sizes.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 4 }}>SIZES</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {item.sizes.map((sz, si) => (
                  <div key={si} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <input
                      value={sz.name}
                      onChange={(e) => onUpdate({ sizes: item.sizes.map((s, j) => j === si ? { ...s, name: e.target.value } : s) })}
                      style={{ ...inputCss, flex: 1, minWidth: 0 }}
                    />
                    <div style={{ position: "relative", flexShrink: 0 }}>
                      <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#64748b" }}>$</span>
                      <input
                        value={dollars(sz.priceCents)}
                        onChange={(e) => onUpdate({ sizes: item.sizes.map((s, j) => j === si ? { ...s, priceCents: parseDollars(e.target.value) } : s) })}
                        style={{ ...inputCss, paddingLeft: 18, width: 70 }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onUpdate({ sizes: item.sizes.filter((_, j) => j !== si) })}
                      aria-label="Remove size"
                      style={{
                        width: 22, height: 22, padding: 0,
                        background: "#fef2f2", border: "1px solid #fecaca",
                        borderRadius: 5, cursor: "pointer", flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Required choices */}
          {item.requiredChoices.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 4 }}>REQUIRED CHOICES (pick-one)</p>
              <input
                value={item.requiredChoices.join(", ")}
                onChange={(e) => onUpdate({
                  requiredChoices: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                })}
                style={{ ...inputCss, width: "100%" }}
              />
            </div>
          )}

          {/* Options */}
          {item.options.length > 0 && (
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#475569", marginBottom: 4 }}>OPTIONS</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {item.options.map((opt, oi) => (
                  <div key={oi} style={{
                    display: "flex", gap: 6, alignItems: "center",
                    padding: "4px 6px", borderRadius: 6,
                    background: opt.optionType === "REMOVAL" ? "#fef9c3" : "#f0fdf4",
                    border: `1px solid ${opt.optionType === "REMOVAL" ? "#fde68a" : "#bbf7d0"}`,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#475569", flexShrink: 0, minWidth: 50 }}>
                      {opt.optionType === "REMOVAL" ? "REMOVE" : "ADD"}
                    </span>
                    <input
                      value={opt.name}
                      onChange={(e) => onUpdate({ options: item.options.map((o, j) => j === oi ? { ...o, name: e.target.value } : o) })}
                      style={{ ...inputCss, flex: 1, minWidth: 0 }}
                    />
                    {opt.optionType === "ADD_ON" && (
                      <div style={{ position: "relative", flexShrink: 0 }}>
                        <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#64748b" }}>+$</span>
                        <input
                          value={dollars(opt.priceDeltaCents)}
                          onChange={(e) => onUpdate({ options: item.options.map((o, j) => j === oi ? { ...o, priceDeltaCents: parseDollars(e.target.value) } : o) })}
                          style={{ ...inputCss, paddingLeft: 22, width: 72 }}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
