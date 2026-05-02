"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import Link from "next/link";

const PLANS = [
  {
    id: "STARTER",
    name: "Starter",
    price: "$49",
    period: "/mo",
    description: "Perfect for a single location getting started.",
    features: ["Up to 1 school or office", "Unlimited orders", "Email notifications", "14-day free trial"],
    highlight: false,
  },
  {
    id: "GROWTH",
    name: "Growth",
    price: "$149",
    period: "/mo",
    description: "For restaurants serving multiple locations.",
    features: ["Up to 5 schools or offices", "Everything in Starter", "Priority support", "14-day free trial"],
    highlight: true,
  },
  {
    id: "SCALE",
    name: "Scale",
    price: "$349",
    period: "/mo",
    description: "For high-volume operations across many sites.",
    features: ["Unlimited locations", "Everything in Growth", "Dedicated onboarding", "14-day free trial"],
    highlight: false,
  },
];

export default function SignupPage() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1 fields
  const [restaurantName, setRestaurantName] = useState("");
  const [slug, setSlug] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [password, setPassword] = useState("");

  // Step 2 field
  const [plan, setPlan] = useState("GROWTH");

  function handleNameChange(value: string) {
    setRestaurantName(value);
    // Auto-generate slug from name
    setSlug(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
        .slice(0, 30)
    );
  }

  function validateStep1() {
    if (!restaurantName.trim()) return "Restaurant name is required.";
    if (!slug.trim() || !/^[a-z0-9-]{2,30}$/.test(slug)) return "Subdomain must be 2-30 characters (letters, numbers, hyphens).";
    if (!ownerName.trim()) return "Your name is required.";
    if (!contactEmail.trim() || !/\S+@\S+\.\S+/.test(contactEmail)) return "A valid email is required.";
    if (password.length < 8) return "Password must be at least 8 characters.";
    return null;
  }

  function handleStep1Next() {
    const err = validateStep1();
    if (err) { setError(err); return; }
    setError(null);
    setStep(2);
  }

  async function handleSubmit() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurantName, slug, contactEmail, ownerName, password, plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Signup failed.");

      // Sign in automatically
      const result = await signIn("admin-credentials", {
        email: contactEmail,
        password,
        restaurantId: data.restaurantId,
        redirect: false,
      });

      if (result?.error) throw new Error("Account created but sign-in failed. Please log in manually.");
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f8fafc",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "40px 16px 80px",
    }}>
      {/* Logo / brand */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <p style={{ fontSize: 22, fontWeight: 800, color: "#c41230", letterSpacing: "-0.5px" }}>
          LunchPad
        </p>
        <p style={{ fontSize: 13, color: "#94a3b8", marginTop: 2 }}>
          School lunch ordering for restaurants
        </p>
      </div>

      {/* Step 3: Success */}
      {step === 3 && (
        <div style={{
          background: "white", borderRadius: 20, padding: "40px 32px",
          maxWidth: 420, width: "100%", textAlign: "center",
          boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1c0505", marginBottom: 8 }}>
            You&apos;re all set!
          </h1>
          <p style={{ fontSize: 14, color: "#78716c", lineHeight: 1.6, marginBottom: 28 }}>
            Your 14-day free trial has started. Head to your dashboard to set up your menu,
            add your first school, and start taking orders.
          </p>
          <a
            href="/admin/dashboard"
            style={{
              display: "block", width: "100%", padding: "14px",
              background: "#c41230", color: "white",
              borderRadius: 12, fontWeight: 700, fontSize: 15,
              textDecoration: "none", textAlign: "center",
            }}
          >
            Go to dashboard
          </a>
        </div>
      )}

      {/* Step 1: Business info */}
      {step === 1 && (
        <div style={{
          background: "white", borderRadius: 20, padding: "32px 28px",
          maxWidth: 420, width: "100%",
          boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
        }}>
          <StepIndicator current={1} total={2} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1c0505", marginBottom: 4 }}>
            Create your account
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24 }}>
            Start your 14-day free trial — no credit card required.
          </p>

          <Field label="Restaurant name">
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Big Burger Co."
              style={inputStyle}
            />
          </Field>

          <Field label="Your subdomain" hint={`${slug || "yourname"}.lunchpad.us`}>
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="yourname"
                style={{ ...inputStyle, border: "none", borderRadius: 0, flex: 1 }}
              />
              <span style={{ padding: "0 12px", fontSize: 13, color: "#94a3b8", background: "#f8fafc", whiteSpace: "nowrap" }}>
                .lunchpad.us
              </span>
            </div>
          </Field>

          <Field label="Your name">
            <input
              type="text"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
              placeholder="Jane Smith"
              style={inputStyle}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="jane@example.com"
              style={inputStyle}
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="8+ characters"
              style={inputStyle}
            />
          </Field>

          {error && <ErrorBox message={error} />}

          <button onClick={handleStep1Next} style={primaryButtonStyle}>
            Continue
          </button>

          <p style={{ textAlign: "center", fontSize: 12, color: "#94a3b8", marginTop: 16 }}>
            Already have an account?{" "}
            <Link href="/admin/login" style={{ color: "#c41230", fontWeight: 600, textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        </div>
      )}

      {/* Step 2: Plan selection */}
      {step === 2 && (
        <div style={{ maxWidth: 680, width: "100%" }}>
          <StepIndicator current={2} total={2} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: "#1c0505", marginBottom: 4, textAlign: "center" }}>
            Choose your plan
          </h1>
          <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 24, textAlign: "center" }}>
            All plans include a 14-day free trial. Cancel anytime.
          </p>

          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 24 }}>
            {PLANS.map((p) => (
              <div
                key={p.id}
                onClick={() => setPlan(p.id)}
                style={{
                  flex: "1 1 180px", maxWidth: 200,
                  background: "white",
                  borderRadius: 16,
                  padding: "20px 16px",
                  border: `2px solid ${plan === p.id ? "#c41230" : "#e5e7eb"}`,
                  cursor: "pointer",
                  boxShadow: plan === p.id ? "0 0 0 3px rgba(196,18,48,0.12)" : "0 1px 4px rgba(0,0,0,0.06)",
                  position: "relative",
                  transition: "border-color 0.15s",
                }}
              >
                {p.highlight && (
                  <span style={{
                    position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                    background: "#c41230", color: "white",
                    fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}>
                    Most popular
                  </span>
                )}
                <p style={{ fontSize: 14, fontWeight: 700, color: "#1c0505", marginBottom: 4 }}>{p.name}</p>
                <p style={{ fontSize: 22, fontWeight: 800, color: "#1c0505" }}>
                  {p.price}<span style={{ fontSize: 13, fontWeight: 500, color: "#94a3b8" }}>{p.period}</span>
                </p>
                <p style={{ fontSize: 12, color: "#78716c", marginTop: 6, marginBottom: 12, lineHeight: 1.4 }}>
                  {p.description}
                </p>
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {p.features.map((f) => (
                    <li key={f} style={{ fontSize: 11, color: "#64748b", marginBottom: 4, display: "flex", gap: 6 }}>
                      <span style={{ color: "#22c55e", fontWeight: 700 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {error && <ErrorBox message={error} />}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 420, margin: "0 auto" }}>
            <button onClick={handleSubmit} disabled={loading} style={{ ...primaryButtonStyle, opacity: loading ? 0.7 : 1 }}>
              {loading ? "Creating your account..." : "Start free trial"}
            </button>
            <button
              onClick={() => { setStep(1); setError(null); }}
              style={{ ...secondaryButtonStyle }}
            >
              Back
            </button>
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "#cbd5e1", marginTop: 16 }}>
            No credit card required. You&apos;ll be prompted to add payment after your trial.
          </p>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            height: 4, flex: 1, borderRadius: 4,
            background: i < current ? "#c41230" : "#e5e7eb",
          }}
        />
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#64748b", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p style={{
      fontSize: 13, color: "#c0392b", background: "#fff5f5",
      padding: "10px 14px", borderRadius: 10, marginBottom: 16,
    }}>
      {message}
    </p>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "10px 12px", fontSize: 14,
  border: "1px solid #e5e7eb", borderRadius: 10,
  fontFamily: "inherit", boxSizing: "border-box", outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%", padding: "14px", borderRadius: 12,
  background: "#c41230", color: "white",
  fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%", padding: "14px", borderRadius: 12,
  background: "transparent", color: "#78716c",
  fontSize: 15, fontWeight: 600,
  border: "1px solid #e5e7eb", cursor: "pointer",
};
