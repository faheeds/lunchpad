"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type MenuOption = {
  name: string;
  optionType: "ADD_ON" | "REMOVAL";
  priceDeltaCents: number;
};

interface EditOrderSheetProps {
  orderId: string;
  orderNumber: string;
  currentAdditions: string[];
  currentRemovals: string[];
  currentAllergyNotes: string | null;
  currentSpecialInstructions: string | null;
  menuOptions: MenuOption[];
  basePriceCents: number;
}

export function EditOrderSheet({
  orderId,
  orderNumber,
  currentAdditions,
  currentRemovals,
  currentAllergyNotes,
  currentSpecialInstructions,
  menuOptions,
  basePriceCents,
}: EditOrderSheetProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [additions, setAdditions] = useState<string[]>(currentAdditions);
  const [removals, setRemovals] = useState<string[]>(currentRemovals);
  const [allergyNotes, setAllergyNotes] = useState(currentAllergyNotes ?? "");
  const [specialInstructions, setSpecialInstructions] = useState(currentSpecialInstructions ?? "");

  const addOns = menuOptions.filter((o) => o.optionType === "ADD_ON");
  const removalOpts = menuOptions.filter((o) => o.optionType === "REMOVAL");

  const addOnCost = menuOptions
    .filter((o) => o.optionType === "ADD_ON" && additions.includes(o.name))
    .reduce((sum, o) => sum + o.priceDeltaCents, 0);
  const totalCents = basePriceCents + addOnCost;

  function toggleAddition(name: string) {
    setAdditions((prev) =>
      prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]
    );
  }

  function toggleRemoval(name: string) {
    setRemovals((prev) =>
      prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]
    );
  }

  function handleOpen() {
    setAdditions(currentAdditions);
    setRemovals(currentRemovals);
    setAllergyNotes(currentAllergyNotes ?? "");
    setSpecialInstructions(currentSpecialInstructions ?? "");
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}/modify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ additions, removals, allergyNotes, specialInstructions }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save changes.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const fmt = (cents: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);

  if (!open) {
    return (
      <button
        onClick={handleOpen}
        style={{
          fontSize: 11, color: "var(--brand-on-white)", fontWeight: 600,
          background: "none", border: "none", cursor: "pointer",
          padding: 0, marginTop: 4, display: "block",
        }}
      >
        Edit order
      </button>
    );
  }

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "flex-end", justifyContent: "center",
        padding: "0 0 env(safe-area-inset-bottom, 0)",
      }}
      onClick={() => !loading && setOpen(false)}
    >
      <div
        style={{
          background: "white", borderRadius: "20px 20px 0 0",
          width: "100%", maxWidth: 480,
          padding: "28px 24px 32px",
          maxHeight: "85vh", overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={{ fontSize: 17, fontWeight: 700, color: "#1c0505", marginBottom: 4, textAlign: "center" }}>
          Edit order
        </p>
        <p style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", marginBottom: 20 }}>
          {orderNumber}
        </p>

        {addOns.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>
              Add-ons
            </p>
            {addOns.map((opt) => (
              <label
                key={opt.name}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 14, color: "#1c0505" }}>
                  {opt.name}
                  {opt.priceDeltaCents > 0 && (
                    <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 6 }}>
                      +{fmt(opt.priceDeltaCents)}
                    </span>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={additions.includes(opt.name)}
                  onChange={() => toggleAddition(opt.name)}
                  style={{ width: 18, height: 18, accentColor: "var(--brand-on-white)" }}
                />
              </label>
            ))}
          </div>
        )}

        {removalOpts.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 10 }}>
              Remove
            </p>
            {removalOpts.map((opt) => (
              <label
                key={opt.name}
                style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 0", borderBottom: "1px solid #f1f5f9", cursor: "pointer",
                }}
              >
                <span style={{ fontSize: 14, color: "#1c0505" }}>{opt.name}</span>
                <input
                  type="checkbox"
                  checked={removals.includes(opt.name)}
                  onChange={() => toggleRemoval(opt.name)}
                  style={{ width: 18, height: 18, accentColor: "var(--brand-on-white)" }}
                />
              </label>
            ))}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>
            Allergy notes
          </p>
          <textarea
            value={allergyNotes}
            onChange={(e) => setAllergyNotes(e.target.value)}
            placeholder="Any allergies or dietary requirements..."
            rows={2}
            style={{
              width: "100%", fontSize: 14, padding: "10px 12px",
              borderRadius: 10, border: "1px solid #e5e7eb",
              resize: "none", fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>
            Special instructions
          </p>
          <textarea
            value={specialInstructions}
            onChange={(e) => setSpecialInstructions(e.target.value)}
            placeholder="Any special requests..."
            rows={2}
            style={{
              width: "100%", fontSize: 14, padding: "10px 12px",
              borderRadius: 10, border: "1px solid #e5e7eb",
              resize: "none", fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
        </div>

        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          marginBottom: 16, padding: "12px 0", borderTop: "1px solid #f1f5f9",
        }}>
          <span style={{ fontSize: 13, color: "#78716c" }}>New total</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#1c0505" }}>{fmt(totalCents)}</span>
        </div>

        {error && (
          <p style={{
            fontSize: 12, color: "#c0392b", textAlign: "center",
            marginBottom: 12, padding: "8px 12px",
            background: "#fff5f5", borderRadius: 8,
          }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            onClick={handleSave}
            disabled={loading}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              background: loading ? "#e5e7eb" : "var(--brand-on-white)",
              color: "white", fontSize: 15, fontWeight: 700,
              border: "none", cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Saving..." : "Save changes"}
          </button>
          <button
            onClick={() => setOpen(false)}
            disabled={loading}
            style={{
              width: "100%", padding: "14px", borderRadius: 12,
              background: "transparent", color: "#78716c",
              fontSize: 15, fontWeight: 600,
              border: "1px solid #e5e7eb", cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
