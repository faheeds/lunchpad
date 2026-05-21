"use client";

import { useState } from "react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  renewalDate: string;
  isLoading?: boolean;
}

export function CancelSubscriptionModal({
  isOpen,
  onClose,
  onConfirm,
  renewalDate,
  isLoading = false,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel subscription");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape" && !isLoading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
      onKeyDown={handleKeyDown}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-dialog-title"
        style={{
          background: "white", borderRadius: 16, maxWidth: 420,
          width: "90%", padding: "24px", boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
        }}
      >
        <p
          id="cancel-dialog-title"
          style={{
            fontSize: 16, fontWeight: 800, color: "#211D15",
            marginBottom: 8,
          }}
        >
          Cancel subscription?
        </p>

        <p style={{
          fontSize: 13, color: "#5B5446", lineHeight: 1.6,
          marginBottom: 20,
        }}>
          Canceling stops future renewals on <strong>{renewalDate}</strong>. Your account stays active until then. Are you sure?
        </p>

        {error && (
          <p style={{
            fontSize: 12, color: "#7C3D24", background: "#F4E3DB",
            padding: "10px 12px", borderRadius: 8, marginBottom: 16, border: "1px solid #E2C3B3",
          }}>
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button
            onClick={onClose}
            disabled={isLoading}
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 20,
              background: "transparent", color: "#5B5446",
              fontSize: 13, fontWeight: 600, border: "1px solid #E3DBC6",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            Keep subscription
          </button>
          <button
            onClick={handleConfirm}
            disabled={isLoading}
            autoFocus
            style={{
              flex: 1, padding: "10px 16px", borderRadius: 20,
              background: "#7C3D24", color: "white",
              fontSize: 13, fontWeight: 600, border: "none",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? "Canceling..." : "Yes, cancel"}
          </button>
        </div>
      </div>
    </div>
  );
}
