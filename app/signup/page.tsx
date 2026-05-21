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

// Editorial display serif â€” matches the landing page + admin headings.
const SERIF = "'Fraunces', Georgia, serif";

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

  // Captured after a successful signup â€” used by step 3 to route to the
  // correct tenant subdomain.
  const [createdSlug, setCreatedSlug] = useState<string>("");

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
      // Safely parse JSON â€” a non-JSON response (e.g. Vercel 500 HTML page) would
      // otherwise throw "Unexpected end of JSON input" and swallow the real error.
      const data = await res.json().catch(() => ({ error: `Server error (${res.status}). Please try again.` }));
      if (!res.ok) throw new Error(data.error ?? "Signup failed.");

      // Sign in automatically
      const result = await signIn("admin-credentials", {
        email: contactEmail,
        password,
        restaurantId: data.restaurantId,
        redirect: false,
      });

      if (result?.error) throw new Error("Account created but sign-in failed. Please log in manually.");
      // Stash the slug so step 3 can route to the right subdomain.
      setCreatedSlug(data.slug);
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
      background: "#F6F1E6",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "32px 12px 64px",
    }}>
      <style dangerouslySetInnerHTML={{ __html: `
        @media (max-width: 480px) {
          .su-card { padding: 24px 18px !important; }
          .su-heading { font-size: 21px !important; }
          .su-plans { gap: 8px !important; }
          .su-plan-card { padding: 16px 14px !important; }
        }
      ` }} />

      {/* Logo / brand â€” editorial green bowl mark + Fraunces wordmark,
          matching the landing page and admin. */}
      <div style={{ marginBottom: 28, textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
          <span style={{
            width: 46, height: 46, borderRadius: 13, background: "#2C4031",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
          }}>
            <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="#F6F1E6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12h20"/>
              <path d="M3 12a9 9 0 0 0 18 0"/>
              <path d="M12 7v-2"/>
              <path d="M9 5h6"/>
            </svg>
          </span>
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 25, fontWeight: 600, color: "#211D15", letterSpacing: "-0.01em" }}>
          LunchPad
        </p>
        <p style={{ fontSize: 13, color: "#938B78", marginTop: 3 }}>
          Run your lunch program with one platform
        </p>
      </div>

      {/* Step 3: Success */}
      {step === 3 && (
        <div className="su-card" style={{
          background: "white", borderRadius: 20, padding: "40px 32px",
          maxWidth: 420, width: "100%", textAlign: "center",
          border: "1px solid #E3DBC6",
          boxShadow: "0 18px 44px -22px rgba(33,29,21,0.20)",
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>ðŸŽ‰</div>
          <h1 className="su-heading" style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 500, color: "#211D15", marginBottom: 10 }}>
            You&apos;re all set!
          </h1>
          <p style={{ fontSize: 14, color: "#5B5446", lineHeight: 1.6, marginBottom: 12 }}>
            Your 14-day free trial has started. Let&apos;s walk through setup â€” branding, your first location, menu, and a test order â€” then you&apos;re live.
          </p>
          <p style={{ fontSize: 12, color: "#938B78", marginBottom: 28, fontFamily: "monospace" }}>
            {createdSlug ? `${createdSlug}.lunchpad.us` : "yoursite.lunchpad.us"}
          </p>
          <a
            href={createdSlug ? `https://${createdSlug}.lunchpad.us/admin/onboarding` : "/admin/onboarding"}
            style={{
              display: "block", width: "100%", padding: "14px",
              background: "#2C4031", color: "#F6F1E6",
              borderRadius: 100, fontWeight: 600, fontSize: 15,
              textDecoration: "none", textAlign: "center",
            }}
          >
            Get started â†’
          </a>
          <p style={{ fontSize: 11, color: "#B8AE97", marginTop: 14, lineHeight: 1.5 }}>
            New subdomain may take 30â€“60 seconds to issue an SSL certificate the first time.
            If you see a security warning, refresh.
          </p>
        </div>
      )}

      {/* Step 1: Business info */}
      {step === 1 && (
        <div className="su-card" style={{
          background: "white", borderRadius: 20, padding: "32px 28px",
          maxWidth: 420, width: "100%",
          border: "1px solid #E3DBC6",
          boxShadow: "0 18px 44px -22px rgba(33,29,21,0.20)",
        }}>
          <StepIndicator current={1} total={2} />
          <h1 className="su-heading" style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, color: "#211D15", marginBottom: 5 }}>
            Create your account
          </h1>
          <p style={{ fontSize: 13, color: "#938B78", marginBottom: 24 }}>
            Start your 14-day free trial â€” no credit card required.
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
            <div style={{ display: "flex", alignItems: "center", border: "1px solid #E3DBC6", borderRadius: 12, overflow: "hidden" }}>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="yourname"
                style={{ ...inputStyle, border: "none", borderRadius: 0, flex: 1 }}
              />
              <span style={{ padding: "0 12px", fontSize: 13, color: "#938B78", background: "#EFE8D7", whiteSpace: "nowrap" }}>
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

          <p style={{ textAlign: "center", fontSize: 12, color: "#938B78", marginTop: 16 }}>
            Already have an account?{" "}
            <Link href="/admin/login" style={{ color: "#2C4031", fontWeight: 600, textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        </div>
      )}

      {/* Step 2: Plan selection */}
      {step === 2 && (
        <div style={{ maxWidth: 680, width: "100%" }}>
          <StepIndicator current={2} total={2} />
          <h1 className="su-heading" style={{ fontFamily: SERIF, fontSize: 24, fontWeight: 500, color: "#211D15", marginBottom: 5, textAlign: "center" }}>
            Choose your plan
          </h1>
          <p style={{ fontSize: 13, color: "#938B78", marginBottom: 24, textAlign: "center" }}>
            All plans include a 14-day free trial. Cancel anytime.
          </p>

          <div className="su-plans" style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginBottom: 24 }}>
            {PLANS.map((p) => (
              <div
                key={p.id}
                onClick={() => setPlan(p.id)}
                className="su-plan-card"
                style={{
                  flex: "1 1 180px", maxWidth: 200,
                  background: "white",
                  borderRadius: 16,
                  padding: "20px 16px",
                  border: `2px solid ${plan === p.id ? "#2C4031" : "#E3DBC6"}`,
                  cursor: "pointer",
                  boxShadow: plan === p.id ? "0 0 0 3px rgba(44,64,49,0.15)" : "0 1px 4px rgba(33,29,21,0.06)",
                  position: "relative",
                  transition: "border-color 0.15s",
                }}
              >
                {p.highlight && (
                  <span style={{
                    position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                    background: "#C0673E", color: "white",
                    fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20,
                    whiteSpace: "nowrap",
                  }}>
                    Most popular
                  </span>
                )}
                <p style={{ fontSize: 14, fontWeight: 700, color: "#211D15", marginBottom: 4 }}>{p.name}</p>
                <p style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 600, color: "#211D15" }}>
                  {p.price}<span style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 500, color: "#938B78" }}>{p.period}</span>
                </p>
                  <p style={{ fontSize: 12, color: "#5B5446", marginTop: 6, marginBottom: 12, lineHeight: 1.4 }}>
                    {p.description}
                  </p>
                  <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {p.features.map((f) => (
                      <li key={f} style={{ fontSize: 11, color: "#5B5446", marginBottom: 4, display: "flex", gap: 6 }}>
                        <span style={{ color: "#2C4031", fontWeight: 700 }}>âœ“</span> {f}
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

          <p style={{ textAlign: "center", fontSize: 11, color: "#B8AE97", marginTop: 16 }}>
            No credit card required. You&apos;ll be prompted to add payment after your trial.
          </p>
        </div>
      )}
    </div>
  );
}

// â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            height: 4, flex: 1, borderRadius: 4,
            background: i < current ? "#2C4031" : "#E3DBC6",
          }}
        />
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#938B78", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontSize: 11, color: "#938B78", marginTop: 4 }}>{hint}</p>}
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <p style={{
      fontSize: 13, color: "#7C3D24", background: "#F4E3DB",
      border: "1px solid #E2C3B3",
      padding: "10px 14px", borderRadius: 12, marginBottom: 16,
    }}>
      {message}
    </p>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "11px 13px", fontSize: 14,
  border: "1px solid #E3DBC6", borderRadius: 12,
  fontFamily: "inherit", boxSizing: "border-box", outline: "none",
  color: "#211D15", background: "#FFFFFF",
};

const primaryButtonStyle: React.CSSProperties = {
  width: "100%", padding: "14px", borderRadius: 100,
  background: "#2C4031", color: "#F6F1E6",
  fontSize: 15, fontWeight: 600, border: "none", cursor: "pointer",
};

const secondaryButtonStyle: React.CSSProperties = {
  width: "100%", padding: "14px", borderRadius: 100,
  background: "transparent", color: "#211D15",
  fontSize: 15, fontWeight: 600,
  border: "1px solid #E3DBC6", cursor: "pointer",
};
