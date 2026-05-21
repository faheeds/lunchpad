"use client";

import { useState } from "react";

type FeedbackType = "" | "order_issue" | "general_feedback";
type Status = "idle" | "submitting" | "success" | "error";

export function ContactForm() {
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    const form = e.currentTarget;
    const data = {
      name:         (form.elements.namedItem("name")        as HTMLInputElement).value,
      phone:        (form.elements.namedItem("phone")       as HTMLInputElement).value,
      email:        (form.elements.namedItem("email")       as HTMLInputElement).value,
      feedbackType: (form.elements.namedItem("feedbackType")as HTMLSelectElement).value,
      orderNumber:  feedbackType === "order_issue"
                      ? (form.elements.namedItem("orderNumber") as HTMLInputElement)?.value
                      : undefined,
      message:      (form.elements.namedItem("message")     as HTMLTextAreaElement).value,
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Something went wrong. Please try again.");
      }
      setStatus("success");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "11px 14px", borderRadius: 12,
    border: "1.5px solid #e2e8f0", fontSize: 14, color: "var(--body-text)",
    background: "white", outline: "none", fontFamily: "inherit",
    WebkitAppearance: "none",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: "rgba(var(--body-text-rgb), 0.65)",
    textTransform: "uppercase", letterSpacing: "0.1em",
    display: "block", marginBottom: 6,
  };

  if (status === "success") {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: "linear-gradient(135deg, var(--brand-hex), color-mix(in srgb, var(--brand-hex) 80%, #000))",
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 20px", fontSize: 28,
          boxShadow: "0 4px 16px rgba(var(--brand-rgb),0.35)",
        }}>
          ✓
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--body-text)", marginBottom: 10 }}>
          Message sent!
        </h2>
        <p style={{ fontSize: 14, color: "rgba(var(--body-text-rgb), 0.65)", lineHeight: 1.6, maxWidth: 280, margin: "0 auto" }}>
          Thanks for reaching out. We&apos;ll get back to you as soon as possible.
        </p>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px 16px 100px" }}>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>

        <div>
          <label style={labelStyle}>Name</label>
          <input name="name" required placeholder="Your name" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Phone <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></label>
          <input name="phone" type="tel" placeholder="e.g. (425) 555-0100" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Email</label>
          <input name="email" type="email" required placeholder="your@email.com" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Type of feedback</label>
          <select
            name="feedbackType"
            required
            value={feedbackType}
            onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}
            style={{ ...inputStyle, color: feedbackType ? "var(--body-text)" : "rgba(var(--body-text-rgb), 0.5)" }}
          >
            <option value="" disabled>Select a category…</option>
            <option value="order_issue">Order issue</option>
            <option value="general_feedback">General feedback</option>
          </select>
        </div>

        {feedbackType === "order_issue" && (
          <>
            <div>
              <label style={labelStyle}>Order number</label>
              <input
                name="orderNumber"
                required
                placeholder="Find this in your confirmation email"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Describe the issue</label>
              <textarea
                name="message"
                required
                rows={4}
                placeholder="Please describe what went wrong with your order…"
                style={{ ...inputStyle, resize: "none", lineHeight: 1.55 }}
              />
            </div>
          </>
        )}

        {feedbackType === "general_feedback" && (
          <div>
            <label style={labelStyle}>Your message</label>
            <textarea
              name="message"
              required
              rows={5}
              placeholder="Share your thoughts, suggestions, or questions…"
              style={{ ...inputStyle, resize: "none", lineHeight: 1.55 }}
            />
          </div>
        )}

        {status === "error" && (
          <div style={{
            background: "rgba(var(--brand-rgb),0.08)", border: "1px solid rgba(var(--brand-rgb),0.2)",
            borderRadius: 12, padding: "12px 16px",
            fontSize: 13, color: "var(--brand-hex)",
          }}>
            {errorMsg}
          </div>
        )}

        {feedbackType && (
          <button
            type="submit"
            disabled={status === "submitting"}
            style={{
              width: "100%", padding: "15px 20px", borderRadius: 14, border: "none",
              background: status === "submitting"
                ? "rgba(var(--brand-rgb),0.5)"
                : "linear-gradient(135deg, var(--brand-hex) 0%, color-mix(in srgb, var(--brand-hex) 80%, #000) 100%)",
              color: "white", fontSize: 15, fontWeight: 700, cursor: "pointer",
              boxShadow: "0 4px 12px rgba(var(--brand-rgb),0.35)",
              letterSpacing: "0.02em",
            }}
          >
            {status === "submitting" ? "Sending…" : "Send message"}
          </button>
        )}
      </form>
    </div>
  );
}
