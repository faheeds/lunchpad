"use client";

import { useState, useCallback, useId } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MenuOptionDraft {
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  priceDeltaCents: number;
  isDefault: boolean;
}

export interface MenuItemDraft {
  name: string;
  description: string;
  basePriceCents: number;
  category: string;
  isActive: boolean;
  options: MenuOptionDraft[];
  _expanded: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseDollars(str: string): number {
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

async function parseExcelFile(file: File): Promise<MenuItemDraft[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  // ── Items sheet ──────────────────────────────────────────────────────────
  const itemsSheet = wb.Sheets["Menu Items"] ?? wb.Sheets[wb.SheetNames[0]];
  const itemRows = XLSX.utils.sheet_to_json<string[]>(itemsSheet, { header: 1, defval: "" });

  let headerIdx = 0;
  for (let i = 0; i < Math.min(itemRows.length, 5); i++) {
    if (String(itemRows[i][0]).toLowerCase().includes("name")) { headerIdx = i; break; }
  }

  const itemMap = new Map<string, MenuItemDraft>();
  for (const row of itemRows.slice(headerIdx + 1)) {
    const name = String(row[0] ?? "").trim();
    if (!name) continue;
    const activeStr = String(row[4] ?? "yes").toLowerCase();
    itemMap.set(name.toLowerCase(), {
      name,
      description: String(row[2] ?? "").trim(),
      basePriceCents: parseDollars(String(row[1] ?? "0")),
      category: String(row[3] ?? "").trim(),
      isActive: activeStr !== "no" && activeStr !== "false",
      options: [],
      _expanded: false,
    });
  }

  // ── Options sheet ────────────────────────────────────────────────────────
  if (wb.SheetNames.length >= 2) {
    const optSheet = wb.Sheets["Options"] ?? wb.Sheets[wb.SheetNames[1]];
    const optRows = XLSX.utils.sheet_to_json<string[]>(optSheet, { header: 1, defval: "" });
    let optHeaderIdx = 0;
    for (let i = 0; i < Math.min(optRows.length, 5); i++) {
      if (String(optRows[i][0]).toLowerCase().includes("item")) { optHeaderIdx = i; break; }
    }
    for (const row of optRows.slice(optHeaderIdx + 1)) {
      const itemName = String(row[0] ?? "").trim();
      const key = itemName.toLowerCase();
      if (!itemName || !itemMap.has(key)) continue;
      const optName = String(row[2] ?? "").trim();
      if (!optName) continue;
      itemMap.get(key)!.options.push({
        name: optName,
        optionType: String(row[1] ?? "").toUpperCase().includes("REMOVAL") ? "REMOVAL" : "ADD_ON",
        priceDeltaCents: parseDollars(String(row[3] ?? "0")),
        isDefault: String(row[4] ?? "no").toLowerCase() === "yes",
      });
    }
  }

  return Array.from(itemMap.values());
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const inputCss: React.CSSProperties = {
  width: "100%", borderRadius: 7, border: "1px solid #d1d5db",
  fontSize: 12, padding: "7px 10px", outline: "none",
  background: "white", color: "#0f1923", boxSizing: "border-box",
};

const smallBtnCss = (color: string, bg: string, border: string): React.CSSProperties => ({
  padding: "4px 10px", borderRadius: 6, fontSize: 11, fontWeight: 600,
  color, background: bg, border: `1px solid ${border}`, cursor: "pointer",
  whiteSpace: "nowrap", flexShrink: 0,
});

// ── Component ─────────────────────────────────────────────────────────────────

export function BulkMenuUpload({ onImported }: { onImported?: () => void }) {
  const router = useRouter();
  const inputId = useId();

  const [items, setItems] = useState<MenuItemDraft[]>([]);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importing, setImporting] = useState(false);

  // ── Parse ─────────────────────────────────────────────────────────────────

  const processFile = useCallback(async (file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setError("Please upload a .xlsx file.");
      return;
    }
    setError(""); setSuccess("");
    setLoading(true);
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        setError("No menu items found. Make sure you're using the LunchPad template format.");
      } else {
        setItems(parsed);
      }
    } catch (err) {
      setError(`Could not parse file: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    // reset input so the same file can be re-selected
    e.target.value = "";
  }, [processFile]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }, [processFile]);

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (items.length === 0 || importing) return;
    setImporting(true);
    setError(""); setSuccess("");
    try {
      const payload = items.map(({ _expanded: _, ...item }) => item);
      const res = await fetch("/api/admin/menu/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: payload }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      const { created, skipped, errors } = data as { created: number; skipped: number; errors: string[] };
      let msg = `${created} item${created !== 1 ? "s" : ""} imported successfully.`;
      if (skipped > 0) msg += ` ${skipped} skipped (already exist).`;
      if (errors?.length > 0) msg += ` ${errors.length} failed.`;
      setSuccess(msg);
      setItems([]);
      router.refresh();
      onImported?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }, [items, importing, router, onImported]);

  // ── Item / option mutations ───────────────────────────────────────────────

  const updateItem = (idx: number, patch: Partial<MenuItemDraft>) =>
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));

  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));

  const addOption = (itemIdx: number) =>
    updateItem(itemIdx, {
      options: [...items[itemIdx].options, { name: "", optionType: "ADD_ON", priceDeltaCents: 0, isDefault: false }],
    });

  const updateOption = (itemIdx: number, optIdx: number, patch: Partial<MenuOptionDraft>) =>
    updateItem(itemIdx, {
      options: items[itemIdx].options.map((o, i) => i === optIdx ? { ...o, ...patch } : o),
    });

  const removeOption = (itemIdx: number, optIdx: number) =>
    updateItem(itemIdx, {
      options: items[itemIdx].options.filter((_, i) => i !== optIdx),
    });

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ marginTop: 8 }}>

      {/* Upload zone — only shown before items are loaded */}
      {items.length === 0 && !loading && (
        <>
          {/* Hidden file input — label triggers it reliably */}
          <input
            id={inputId}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleInputChange}
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          />

          <label
            htmlFor={inputId}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              display: "block",
              border: `2px dashed ${dragging ? "#c41230" : "#d1d5db"}`,
              borderRadius: 10,
              padding: "24px 20px",
              textAlign: "center",
              cursor: "pointer",
              background: dragging ? "#fff1f3" : "#fafafa",
              transition: "border-color 0.15s, background 0.15s",
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={dragging ? "#c41230" : "#9ca3af"}
              strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ margin: "0 auto 10px", display: "block" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p style={{ fontSize: 13, fontWeight: 600, color: dragging ? "#c41230" : "#374151", marginBottom: 4 }}>
              Click to choose a file, or drag &amp; drop here
            </p>
            <p style={{ fontSize: 11, color: "#9ca3af" }}>Accepts .xlsx files — use the LunchPad template</p>
          </label>

          <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <a href="/api/admin/menu/template" download
              style={{ fontSize: 12, color: "#0369a1", textDecoration: "none", display: "flex", alignItems: "center", gap: 5 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download sample template
            </a>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>— fill it in, then upload it back here</span>
          </div>
        </>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            border: "2.5px solid #e5e7eb", borderTopColor: "#c41230", flexShrink: 0,
            animation: "lp-spin 0.7s linear infinite",
          }} />
          <p style={{ fontSize: 13, color: "#6b7280" }}>Parsing spreadsheet…</p>
          <style>{`@keyframes lp-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Banners */}
      {error && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
          <p style={{ fontSize: 12, color: "#dc2626", lineHeight: 1.5 }}>{error}</p>
        </div>
      )}
      {success && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0", marginBottom: 10 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M20 6L9 17l-5-5"/>
          </svg>
          <p style={{ fontSize: 12, color: "#16a34a", fontWeight: 600 }}>{success}</p>
        </div>
      )}

      {/* Preview + edit table */}
      {items.length > 0 && (
        <div>
          {/* Preview header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: "#0f1923" }}>
              {items.length} item{items.length !== 1 ? "s" : ""} ready to import
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => { setItems([]); setError(""); setSuccess(""); }}
                style={smallBtnCss("#6b7280", "white", "#d1d5db")}>
                Clear
              </button>
              <button type="button" onClick={handleImport} disabled={importing}
                style={{
                  padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 700,
                  color: "white", border: "none", cursor: importing ? "default" : "pointer",
                  background: importing ? "#9ca3af" : "#c41230",
                }}>
                {importing ? "Importing…" : `Import ${items.length}`}
              </button>
            </div>
          </div>

          {/* Item cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 440, overflowY: "auto", paddingRight: 2 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ border: "1px solid #e5e7eb", borderRadius: 10, background: "white", overflow: "hidden" }}>

                {/* Item row */}
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 10px" }}>
                  {/* Expand toggle */}
                  <button type="button"
                    onClick={() => updateItem(idx, { _expanded: !item._expanded })}
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: "1px solid #d1d5db",
                      background: "white", cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
                    }}>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: item._expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>

                  {/* Name */}
                  <input value={item.name} onChange={(e) => updateItem(idx, { name: e.target.value })}
                    placeholder="Item name" style={{ ...inputCss, flex: 2, minWidth: 0 }} />

                  {/* Price */}
                  <div style={{ position: "relative", flexShrink: 0, width: 84 }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#6b7280" }}>$</span>
                    <input
                      value={dollars(item.basePriceCents)}
                      onChange={(e) => updateItem(idx, { basePriceCents: parseDollars(e.target.value) })}
                      style={{ ...inputCss, paddingLeft: 18 }} />
                  </div>

                  {/* Category */}
                  <input value={item.category} onChange={(e) => updateItem(idx, { category: e.target.value })}
                    placeholder="Category" style={{ ...inputCss, width: 86, flexShrink: 0 }} />

                  {/* Options badge */}
                  <span style={{
                    fontSize: 10, fontWeight: 600, flexShrink: 0,
                    color: item.options.length > 0 ? "#0369a1" : "#9ca3af",
                    background: item.options.length > 0 ? "#eff6ff" : "#f3f4f6",
                    border: `1px solid ${item.options.length > 0 ? "#bfdbfe" : "#e5e7eb"}`,
                    borderRadius: 100, padding: "2px 8px", whiteSpace: "nowrap",
                  }}>
                    {item.options.length} opt{item.options.length !== 1 ? "s" : ""}
                  </span>

                  {/* Active toggle */}
                  <button type="button"
                    onClick={() => updateItem(idx, { isActive: !item.isActive })}
                    style={smallBtnCss(
                      item.isActive ? "#15803d" : "#9ca3af",
                      item.isActive ? "#dcfce7" : "#f3f4f6",
                      item.isActive ? "#bbf7d0" : "#e5e7eb",
                    )}>
                    {item.isActive ? "On" : "Off"}
                  </button>

                  {/* Remove item */}
                  <button type="button" onClick={() => removeItem(idx)}
                    style={{
                      width: 24, height: 24, borderRadius: 6, border: "1px solid #fecaca",
                      background: "#fef2f2", cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0,
                    }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                  </button>
                </div>

                {/* Expanded section: description + options */}
                {item._expanded && (
                  <div style={{ padding: "0 10px 10px", borderTop: "1px solid #f3f4f6" }}>
                    <div style={{ paddingTop: 8 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
                        Description
                      </label>
                      <input value={item.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        placeholder="Optional description shown to parents"
                        style={{ ...inputCss, fontSize: 12 }} />
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <label style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                          Options ({item.options.length})
                        </label>
                        <button type="button" onClick={() => addOption(idx)}
                          style={smallBtnCss("#0369a1", "#eff6ff", "#bfdbfe")}>
                          + Add option
                        </button>
                      </div>

                      {item.options.length === 0 && (
                        <p style={{ fontSize: 11, color: "#9ca3af", fontStyle: "italic" }}>
                          No options yet — click &quot;Add option&quot; to add add-ons or removals.
                        </p>
                      )}

                      {item.options.map((opt, oi) => (
                        <div key={oi} style={{
                          display: "flex", alignItems: "center", gap: 5, padding: "6px 8px", borderRadius: 7,
                          background: opt.optionType === "REMOVAL" ? "#fef9c3" : "#f0fdf4",
                          border: `1px solid ${opt.optionType === "REMOVAL" ? "#fde68a" : "#bbf7d0"}`,
                          marginBottom: 4,
                        }}>
                          <select value={opt.optionType}
                            onChange={(e) => updateOption(idx, oi, { optionType: e.target.value as "ADD_ON" | "REMOVAL" })}
                            style={{ ...inputCss, width: 90, flexShrink: 0, padding: "5px 6px", fontSize: 11 }}>
                            <option value="ADD_ON">Add-on</option>
                            <option value="REMOVAL">Removal</option>
                          </select>

                          <input value={opt.name}
                            onChange={(e) => updateOption(idx, oi, { name: e.target.value })}
                            placeholder="Option name"
                            style={{ ...inputCss, flex: 1, minWidth: 0, fontSize: 12 }} />

                          <div style={{ position: "relative", flexShrink: 0, width: 76 }}>
                            <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 10, color: "#6b7280" }}>+$</span>
                            <input
                              value={dollars(opt.priceDeltaCents)}
                              onChange={(e) => updateOption(idx, oi, { priceDeltaCents: parseDollars(e.target.value) })}
                              style={{ ...inputCss, paddingLeft: 22, fontSize: 12 }} />
                          </div>

                          <button type="button"
                            onClick={() => updateOption(idx, oi, { isDefault: !opt.isDefault })}
                            title="Mark as default"
                            style={smallBtnCss(
                              opt.isDefault ? "#7c3aed" : "#9ca3af",
                              opt.isDefault ? "#f5f3ff" : "#f3f4f6",
                              opt.isDefault ? "#ddd6fe" : "#e5e7eb",
                            )}>
                            {opt.isDefault ? "Default ✓" : "Default"}
                          </button>

                          <button type="button" onClick={() => removeOption(idx, oi)}
                            style={{
                              width: 22, height: 22, borderRadius: 5, border: "1px solid #fecaca",
                              background: "#fef2f2", cursor: "pointer", display: "flex",
                              alignItems: "center", justifyContent: "center", padding: 0, flexShrink: 0,
                            }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Bottom import CTA */}
          <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
            <button type="button" onClick={handleImport} disabled={importing}
              style={{
                padding: "10px 24px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                background: importing ? "#9ca3af" : "linear-gradient(135deg, #c41230, #8b0d22)",
                color: "white", border: "none", cursor: importing ? "default" : "pointer",
                boxShadow: importing ? "none" : "0 2px 10px rgba(196,18,48,0.3)",
              }}>
              {importing ? "Importing…" : `Import ${items.length} item${items.length !== 1 ? "s" : ""} →`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
