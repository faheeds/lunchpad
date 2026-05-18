import { SiteHeaderServer } from "@/components/site-header-server";
import { AppNav } from "@/components/app-nav";

export default async function TermsPage() {

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
            Terms of Service
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

          {/* Terms content */}
          <div style={{ maxWidth: 600, margin: "0 auto", fontSize: 14, lineHeight: 1.7, color: "#374151" }}>
            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>1. Acceptance of Terms</h2>
              <p>
                By accessing and using this service, you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>2. Service Description</h2>
              <p>
                LunchPad provides a platform for restaurant operators to manage menus, delivery schedules, and customer orders. Customers may browse menus, place orders, and manage their accounts through the service.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>3. User Obligations</h2>
              <p>
                You agree to use this service only for lawful purposes and in a way that does not infringe upon the rights of others or restrict their use and enjoyment of the service. Prohibited behavior includes harassing or causing distress or inconvenience to any person, transmitting obscene or offensive content, or disrupting the normal flow of dialogue within our platform.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>4. Payment Terms</h2>
              <p>
                Payment for orders is processed securely through Stripe. By placing an order, you authorize the charge to your payment method. Refunds are subject to the restaurant's cancellation policy and are processed within 5-10 business days.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>5. Cancellation</h2>
              <p>
                You may cancel an order prior to the restaurant's cutoff time as specified on the order page. Cancellations made after the cutoff may incur a fee or be non-refundable at the restaurant's discretion.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>6. Limitation of Liability</h2>
              <p>
                This service and all included content are provided on an "as-is" basis without warranties of any kind, either express or implied. We shall not be liable for any damages whatsoever (including, without limitation, direct, indirect, incidental, consequential or special damages) arising out of or related to your use or inability to use the service.
              </p>
            </section>

            <section style={{ marginBottom: 28 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1f2937", marginBottom: 12 }}>7. Contact</h2>
              <p>
                If you have questions about these Terms of Service, please contact us at{" "}
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
