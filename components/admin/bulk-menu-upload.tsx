"use client";

import { useState, useRef, useCallback } from "react";
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
  _expanded: boolean; // UI state — not sent to server
}

type Tab = "excel" | "ai";

// ── Helpers ───────────────────────────────────────────────────────────────────

function dollars(cents: number) {
  return (cents / 100).toFixed(2);
}

function parseDollars(str: string): number {
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : Math.round(n * 100);
}

// Parse the uploaded Excel file on the client using the xlsx library (loaded lazily)
async function parseExcelFile(file: File): Promise<MenuItemDraft[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: "array" });

  // ── Items sheet ──────────────────────────────────────────────────────────
  const itemsSheet = wb.Sheets["Menu Items"] ?? wb.Sheets[wb.SheetNames[0]];
  const itemRows: unknown[][] = XLSX.utils.sheet_to_json(itemsSheet, { header: 1, defval: "" });

  // Find header row (first row that has "Name" in column 0)
  let headerIdx = 0;
  for (let i = 0; i < Math.min(itemRows.length, 5); i++) {
    const row = itemRows[i] as string[];
    if (String(row[0]).toLowerCase().includes("name")) { headerIdx = i; break; }
  }
  const dataRows = itemRows.slice(headerIdx + 1);

  const itemMap = new Map<string, MenuItemDraft>();
  for (const row of dataRows as string[][]) {
    const name = String(row[0] ?? "").trim();
    if (!name) continue;
    const priceStr = String(row[1] ?? "0");
    const description = String(row[2] ?? "").trim();
    const category = String(row[3] ?? "").trim();
    const activeStr = String(row[4] ?? "yes").toLowerCase();
    itemMap.set(name.toLowerCase(), {
      name,
      description,
      basePriceCents: parseDollars(priceStr),
      category,
      isActive: activeStr !== "no" && activeStr !== "false",
      options: [],
      _expanded: false,
    });
  }

  // ── Options sheet ────────────────────────────────────────────────────────
  if (wb.SheetNames.length >= 2) {
    const optSheet = wb.Sheets["Options"] ?? wb.Sheets[wb.SheetNames[1]];
    const optRows: unknown[][] = XLSX.utils.sheet_to_json(optSheet, { header: 1, defval: "" });
    let optHeaderIdx = 0;
    for (let i = 0; i < Math.min(optRows.length, 5); i++) {
      const row = optRows[i] as string[];
      if (String(row[0]).toLowerCase().includes("item")) { optHeaderIdx = i; break; }
    }
    for (const row of (optRows.slice(optHeaderIdx + 1) as string[][])) {
      const itemName = String(row[0] ?? "").trim();
      const key = itemName.toLowerCase();
      if (!itemName || !itemMap.has(key)) continue;
      const optionType = String(row[1] ?? "").toUpperCase().includes("REMOVAL") ? "REMOVAL" : "ADD_ON";
      const optName = String(row[2] ?? "").trim();
      if (!optName) continue;
      const priceDelta = parseDollars(String(row[3] ?? "0"));
      const isDefault = String(row[4] ?? "no").toLowerCase() === "yes";
      itemMap.get(key)!.options.push({ name: optName, optionType, priceDeltaCents: priceDelta, isDefault });
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

// ── Main component ────────────────────────────────────────────────────────────

export function BulkMenuUpload({ onImported }: { onImported?: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<Tab>("excel");
  const [items, setItems] = useState<MenuItemDraft[]>([]);
  const [aiUrl, setAiUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [importing, setImporting] = useState(false);

  // ── Excel upload ──────────────────────────────────────────────────────────

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(""); setSuccess("");
    setLoading(true);
    setLoadingMsg("Parsing spreadsheet…");
    try {
      const parsed = await parseExcelFile(file);
      if (parsed.length === 0) {
        setError("No menu items found in this file. Make sure you're using the LunchPad template format.");
      } else {
        setItems(parsed);
      }
    } catch (err) {
      setError(`Could not parse file: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setLoading(false);
      setLoadingMsg("");
      if (fileRef.current) fileRef.current.value = "";
    }
  }, []);

  // ── AI extraction ─────────────────────────────────────────────────────────

  const handleExtract = useCallback(async () => {
    if (!aiUrl.trim()) return;
    setError(""); setSuccess("");
    setLoading(true);
    setLoadingMsg("Fetching website and extracting menu with AI…");
    try {
      const res = await fetch("/api/admin/menu/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: aiUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Extraction failed");
      const extracted: MenuItemDraft[] = (data.items ?? []).map((item: MenuItemDraft) => ({
        ...item, _expanded: false,
      }));
      if (extracted.length === 0) {
        setError("No menu items could be extracted from that URL. Try a page that lists your menu directly.");
      } else {
        setItems(extracted);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setLoading(false);
      setLoadingMsg("");
    }
  }, [aiUrl]);

  // ── Bulk import ───────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (items.length === 0) return;
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
      const { created, skipped, errors } = data;
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
  }, [items, router, onImported]);

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

      {/* Tab selector */}
      <div style={{ display: "flex", gap: 4, marginBottom: 14 }}>
        {(["excel", "ai"] as Tab[]).map((t) => (
          <button key={t} type="button"
            onClick={() => { setTab(t); setItems([]); setError(""); setSuccess(""); }}
            style={{
              padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              border: "1px solid",
              cursor: "pointer",
              background: tab === t ? "#0f1923" : "white",
              color: tab === t ? "white" : "#6b7280",
              borderColor: tab === t ? "#0f1923" : "#d1d5db",
            }}>
            {t === "excel" ? "📊 Upload Excel" : "✨ Extract from Website"}
          </button>
        ))}
      </div>

      {/* Excel tab */}
      {tab === "excel" && items.length === 0 && !loading && (
        <div>
          <div
            onClick={() => fileRef.current?.click()}
            style={{
              border: "2px dashed #d1d5db", borderRadius: 10, padding: "20px",
              textAlign: "center", cursor: "pointer", background: "#fafafa",
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) {
                setError(""); setSuccess("");
                setLoading(true); setLoadingMsg("Parsing spreadsheet…");
                try {
                  const parsed = await parseExcelFile(file);
                  parsed.length === 0
                    ? setError("No menu items found.")
                    : setItems(parsed);
                } catch (err) {
                  setError(`Could not parse file: ${err instanceof Error ? err.message : "Unknown error"}`);
                } finally { setLoading(false); setLoadingMsg(""); }
              }
            }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 8px", display: "block" }}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 4 }}>
              Drop your Excel file here or click to browse
            </p>
            <p style={{ fontSize: 11, color: "#9ca3af" }}>Accepts .xlsx files using the LunchPad template</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls"
            onChange={handleFileChange} style={{ display: "none" }} />
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
            <span style={{ fontSize: 11, color: "#9ca3af" }}>— fill it in and upload it back</span>
          </div>
        </div>
      )}

      {/* AI tab */}
      {tab === "ai" && items.length === 0 && !loading && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#6b7280", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Restaurant or menu page URL
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="url"
                value={aiUrl}
                onChange={(e) => setAiUrl(e.target.value)}
                placeholder="https://yourrestaurant.com/menu"
                style={{ ...inputCss, flex: 1 }}
                onKeyDown={(e) => e.key === "Enter" && handleExtract()}
              />
              <button type="button" onClick={handleExtract}
                disabled={!aiUrl.trim()}
                style={{
                  padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  background: aiUrl.trim() ? "linear-gradient(135deg, #c41230, #8b0d22)" : "#e5e7eb",
                  color: aiUrl.trim() ? "white" : "#9ca3af",
                  border: "none", cursor: aiUrl.trim() ? "pointer" : "default",
                  whiteSpace: "nowrap", flexShrink: 0,
                }}>
                Extract menu
              </button>
            </div>
          </div>
          <p style={{ fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>
            AI will scan the page and extract all menu items, prices, and options it can find. Works best on public menu pages.
          </p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 0" }}>
          <div style={{
            width: 18, height: 18, borderRadius: "50%",
            border: "2.5px solid #e5e7eb", borderTopColor: "#c41230",
            animation: "spin 0.7s linear infinite", flexShrink: 0,
          }} />
          <p style={{ fontSize: 13, color: "#6b7280" }}>{loadingMsg}</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Error / success banners */}
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
                  ...smallBtnCss("white", importing ? "#9ca3af" : "#c41230", "transparent"),
                  padding: "6px 14px", fontSize: 12,
                }}>
                {importing ? "Importing…" : `Import ${items.length} item${items.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>

          {/* Item cards */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 420, overflowY: "auto", paddingRight: 2 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{
                border: "1px solid #e5e7eb", borderRadius: 10,
                background: "white", overflow: "hidden",
              }}>
                {/* Item row */}
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
                  {/* Expand toggle */}
                  <button type="button"
                    onClick={() => updateItem(idx, { _expanded: !item._expanded })}
                    style={{
                      width: 20, height: 20, borderRadius: 4, border: "1px solid #d1d5db",
                      background: "white", cursor: "pointer", display: "flex",
                      alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0,
                    }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ transform: item._expanded ? "rotate(90deg)" : "rotate(0deg)", transition: "transform 0.15s" }}>
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                  </button>

                  {/* Name */}
                  <input value={item.name} onChange={(e) => updateItem(idx, { name: e.target.value })}
                    placeholder="Item name"
                    style={{ ...inputCss, flex: 2, minWidth: 0 }} />

                  {/* Price */}
                  <div style={{ position: "relative", flexShrink: 0, width: 88 }}>
                    <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#6b7280" }}>$</span>
                    <input
                      value={dollars(item.basePriceCents)}
                      onChange={(e) => updateItem(idx, { basePriceCents: parseDollars(e.target.value) })}
                      style={{ ...inputCss, paddingLeft: 18 }}
                    />
                  </div>

                  {/* Category */}
                  <input value={item.category} onChange={(e) => updateItem(idx, { category: e.target.value })}
                    placeholder="Category"
                    style={{ ...inputCss, width: 90, flexShrink: 0 }} />

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
                    style={{
                      ...smallBtnCss(
                        item.isActive ? "#15803d" : "#9ca3af",
                        item.isActive ? "#dcfce7" : "#f3f4f6",
                        item.isActive ? "#bbf7d0" : "#e5e7eb",
                      ),
                      width: 52,
                    }}>
                    {item.isActive ? "On" : "Off"}
                  </button>

                  {/* Remove */}
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

                {/* Description row */}
                {item._expanded && (
                  <div style={{ padding: "0 12px 10px", borderTop: "1px solid #f3f4f6" }}>
                    <div style={{ paddingTop: 10 }}>
                      <label style={{ fontSize: 10, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em", display: "block", marginBottom: 4 }}>
                        Description
                      </label>
                      <input value={item.description}
                        onChange={(e) => updateItem(idx, { description: e.target.value })}
                        placeholder="Optional description"
                        style={{ ...inputCss, fontSize: 12 }} />
                    </div>

                    {/* Options */}
                    <div style={{ marginTop: 12 }}>
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
                          No options — click "Add option" to add add-ons or removals.
                        </p>
                      )}

                      {item.options.map((opt, oi) => (
                        <div key={oi} style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "7px 10px", borderRadius: 7,
                          background: opt.optionType === "REMOVAL" ? "#fef9c3" : "#f0fdf4",
                          border: `1px solid ${opt.optionType === "REMOVAL" ? "#fde68a" : "#bbf7d0"}`,
                          marginBottom: 4,
                        }}>
                          {/* Option type */}
                          <select value={opt.optionType}
                            onChange={(e) => updateOption(idx, oi, { optionType: e.target.value as "ADD_ON" | "REMOVAL" })}
                            style={{ ...inputCss, width: 94, flexShrink: 0, padding: "5px 6px", fontSize: 11 }}>
                            <option value="ADD_ON">Add-on</option>
                            <option value="REMOVAL">Removal</option>
                          </select>

                          {/* Option name */}
                          <input value={opt.name}
                            onChange={(e) => updateOption(idx, oi, { name: e.target.value })}
                            placeholder="Option name"
                            style={{ ...inputCss, flex: 1, minWidth: 0, fontSize: 12 }} />

                          {/* Price delta */}
                          <div style={{ position: "relative", flexShrink: 0, width: 78 }}>
                            <span style={{ position: "absolute", left: 7, top: "50%", transform: "translateY(-50%)", fontSize: 11, color: "#6b7280" }}>+$</span>
                            <input
                              value={dollars(opt.priceDeltaCents)}
                              onChange={(e) => updateOption(idx, oi, { priceDeltaCents: parseDollars(e.target.value) })}
                              style={{ ...inputCss, paddingLeft: 24, fontSize: 12 }} />
                          </div>

                          {/* Default toggle */}
                          <button type="button"
                            onClick={() => updateOption(idx, oi, { isDefault: !opt.isDefault })}
                            title="Toggle as default"
                            style={{
                              ...smallBtnCss(
                                opt.isDefault ? "#7c3aed" : "#9ca3af",
                                opt.isDefault ? "#f5f3ff" : "#f3f4f6",
                                opt.isDefault ? "#ddd6fe" : "#e5e7eb",
                              ),
                              padding: "4px 8px", fontSize: 10,
                            }}>
                            {opt.isDefault ? "Default" : "Default"}
                          </button>

                          {/* Remove option */}
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
