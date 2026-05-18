import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";

export default async function PrivacyPage() {

  return (
    <>
      <SiteHeaderServer />
      <main className="app-content">
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, var(--dark-bg) 0%, color-mix(in srgb, var(--dark-bg) 80%, #000) 100%)",
          padding: "28px 20px 28px",
          boxShadow: "0 4px 16px -8px rgba(0,0,0,0.25)",
        }}>
          <p style={{
            fontSize: 9, fontWeight: 700, letterSpacing: "0.22em",
            textTransform: "uppercase", color: "var(--accent-on-dark)", marginBottom: 6,
          }}>
            ★ LEGAL ★
          </p>
          <h1 style={{
            fontSize: 26, fontWeight: 800, color: "var(--hero-title)",
            textTransform: "uppercase", letterSpacing: "0.02em",
            lineHeight: 1.1, marginBottom: 8,
          }}>
            Privacy Policy
          </h1>
        </div>

        {/* Content */}
        <div style={{ padding: "24px 20px 100px", background: "#f8fafc" }}>
          {/* DRAFT disclaimer */}
          <div style={{
            background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 12,
            padding: "16px", marginBottom: 24,
          }}>
            <p style={{
              fontSize: 13, fontWeight: 600, color: "#78350f", margin: 0,
            }}>
              ⚠️ DRAFT — This document is placeholder content. Review by legal counsel is required before use in production.
            </p>
          </div>

          {/* Privacy content */}
          <div style={{ maxWidth: 600, margin: "0 auto", fontSize: 14, lineHeight: 1.7, color: "#374151" }}>
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>1. Data Collected</h2>
              <p>
                We collect the following types of information:
              </p>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>Account information (name, email, phone number)</li>
                <li>Payment information (processed securely via Stripe; we do not store full credit card numbers)</li>
                <li>Order history and preferences</li>
                <li>Delivery address and allergies</li>
                <li>Usage logs and analytics (page views, clicks, device information)</li>
              </ul>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>2. How We Use Your Data</h2>
              <p>
                Your information is used to:
              </p>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>Process and fulfill your orders</li>
                <li>Communicate with you about orders, updates, and support</li>
                <li>Improve and operate the service</li>
                <li>Detect and prevent fraud</li>
                <li>Comply with legal obligations</li>
              </ul>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>3. Third Parties</h2>
              <p>
                We share data with trusted third-party service providers:
              </p>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li><strong>Stripe</strong> — Payment processing and fraud detection</li>
                <li><strong>Resend</strong> — Email delivery</li>
                <li><strong>Vercel</strong> — Platform hosting and deployment</li>
              </ul>
              <p style={{ marginTop: 12 }}>
                These partners are contractually bound to protect your information and use it only to provide services on our behalf.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>4. Cookies</h2>
              <p>
                We use cookies and local storage to:
              </p>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>Remember your login session</li>
                <li>Track your consent preferences</li>
                <li>Analyze how you use the service (if you opt in)</li>
              </ul>
              <p style={{ marginTop: 12 }}>
                You can control cookie settings through your browser. Our cookie banner allows you to choose "Necessary only" or "Accept all".
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>5. Your Rights</h2>
              <p>
                You have the right to:
              </p>
              <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                <li>Access your personal data</li>
                <li>Request correction of inaccurate data</li>
                <li>Request deletion of your data (right to be forgotten)</li>
                <li>Opt out of marketing communications</li>
                <li>Withdraw consent for optional data processing</li>
              </ul>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>6. Contact</h2>
              <p>
                If you have questions about this Privacy Policy or your data, please contact us at{" "}
                <a href="mailto:support@lunchpad.us" style={{ color: "var(--brand-hex)", textDecoration: "underline" }}>
                  support@lunchpad.us
                </a>
              </p>
            </section>
          </div>
        </div>
      </main>
      <AppNav />
    </>
  );
}
